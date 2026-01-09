"use client";

import {useAvatarStore} from "@/store/useAvatarStore";
import {LipSyncAnalyzer} from "@/utils/LipSyncAnalyzer";
import {VRM, VRMLoaderPlugin, VRMUtils} from "@pixiv/three-vrm";
import {MToonMaterialLoaderPlugin} from "@pixiv/three-vrm-materials-mtoon";
import {useEffect, useRef} from "react";
import * as THREE from "three";
import {GLTFLoader, OrbitControls} from "three-stdlib";

export default function VrmViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const responseAudio = useAvatarStore(state => state.responseAudio);
  const isSpeaking = useAvatarStore(state => state.isSpeaking);
  const setIsSpeaking = useAvatarStore(state => state.setIsSpeaking);


  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
      isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
     if (responseAudio) {
         playAudio(responseAudio);
     }
  }, [responseAudio]);

  const playAudio = async (base64Audio: string) => {
      try {
          if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }
          const ctx = audioContextRef.current;

          // Decode Base64
          const binaryString = window.atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

          // Stop previous
          if (sourceRef.current) {
              sourceRef.current.stop();
          }

          // Setup Audio Nodes
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;

          source.connect(ctx.destination);

          // Initialize Lip Sync Analyzer
          lipSyncRef.current = new LipSyncAnalyzer(ctx, source);

          sourceRef.current = source;

          source.onended = () => {
              setIsSpeaking(false);
          };

          setIsSpeaking(true);
          source.start(0);

          // Resume context if suspended (browser autoplay policy)
          if (ctx.state === 'suspended') {
              ctx.resume();
          }

      } catch (e) {
          console.error("Audio Playback Error:", e);
          setIsSpeaking(false);
      }
  };


  useEffect(() => {
    if (!containerRef.current) return;

    // --- THREE JS SETUP ---
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(30, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 20);
    camera.position.set(0, 1.4, 2.5);
    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    containerRef.current.appendChild(renderer.domElement);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // --- LOAD VRM ---
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    // @ts-ignore
    loader.register((parser: any) => {
        // @ts-ignore
        const mtoonMaterialPlugin = new MToonMaterialLoaderPlugin(parser);
        // @ts-ignore
        return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });
    });

    let currentVrm: VRM | null = null;

    loader.load(
      "/model.vrm",
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (currentVrm) {
             // @ts-ignore
             const oldVrm = currentVrm as VRM;
             scene.remove(oldVrm.scene);
             VRMUtils.deepDispose(oldVrm.scene);
        }
        currentVrm = vrm;
        scene.add(vrm.scene);

        vrm.scene.traverse((obj: any) => { obj.frustumCulled = false; });
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.rotation.y = Math.PI;

        // --- ELEGANT POSE ---
        if (vrm.humanoid) {
             const getBone = (name: string) => vrm.humanoid.getNormalizedBoneNode(name);
             const leftUpperArm = getBone('leftUpperArm');
             const rightUpperArm = getBone('rightUpperArm');
             const leftLowerArm = getBone('leftLowerArm');
             const rightLowerArm = getBone('rightLowerArm');

             if (leftUpperArm) {
                 leftUpperArm.rotation.z = 1.3; // Down ~75deg
                 leftUpperArm.rotation.x = 0.15; // Slightly forward
             }
             if (rightUpperArm) {
                 rightUpperArm.rotation.z = -1.3; // Down ~75deg
                 rightUpperArm.rotation.x = 0.15; // Slightly forward
             }

             // Elbow bends
             if (leftLowerArm) leftLowerArm.rotation.x = 0.15;
             if (rightLowerArm) rightLowerArm.rotation.x = 0.15;
        }


      },
      (progress) => {},
      (error) => console.error("VRM Load Error", error)
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.4, 0.0); // Focus on face
    controls.update();

    // --- ANIMATION LOOP ---
    const clock = new THREE.Clock();
    const dataArray = new Uint8Array(256);

    // Lerp Helper
    const lerp = (start: number, end: number, factor: number) => {
        return start + (end - start) * factor;
    };

    // State for smooth transitions
    let currentAh = 0;
    let currentOh = 0;
    let currentIh = 0;

    const animate = () => {
      requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.elapsedTime;

      if (currentVrm) {
        // @ts-ignore
        currentVrm.update(delta);

        // --- IDLE ANIMATION ---
        // Gentle Sway
        if (currentVrm.humanoid) {
            const spine = currentVrm.humanoid.getNormalizedBoneNode('spine');
            const head = currentVrm.humanoid.getNormalizedBoneNode('head');

            if (spine && head) {
                // Subtle breathing/sway
                spine.rotation.x = Math.sin(time * 1.0) * 0.02;
                spine.rotation.y = Math.sin(time * 0.5) * 0.02;

                // Head counter-sway to keep looking forward mostly
                head.rotation.y = Math.sin(time * 0.5) * -0.01;
            }

             // --- TALKING GESTURES ---
            if (isSpeakingRef.current) { // Check real-time speaking state via ref
                const leftUpperArm = currentVrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                const rightUpperArm = currentVrm.humanoid.getNormalizedBoneNode('rightUpperArm');

                // Add some hand movement when speaking (simple sine waves on top of base pose)
                // We check volume roughly by looking at currentAh which tracks volume
                // But since we are inside the loop, let's use a time-based gesture if speaking

                // Note: accurate volume based gesture requires moving logic below up or using ref
                // For now, simple "if speaking" movement
                if (leftUpperArm && rightUpperArm) {
                     // Base rotation (from setup) + movement
                     leftUpperArm.rotation.z = 1.3 + Math.sin(time * 3) * 0.05;
                     rightUpperArm.rotation.z = -1.3 - Math.sin(time * 3) * 0.05;

                     leftUpperArm.rotation.x = 0.15 + Math.sin(time * 2) * 0.05;
                     rightUpperArm.rotation.x = 0.15 + Math.sin(time * 2.5) * 0.05;
                }
            }
        }

        // Lip Sync & Expressions
        // @ts-ignore
        if (currentVrm.expressionManager && lipSyncRef.current) {
            const { aa, ih, ou, ee, uu, volume } = lipSyncRef.current.update();

            // Blink Logic
            const blink = Math.abs(Math.sin(time * 0.5)) > 0.99 ? 1 : 0;

            // Apply Blendshapes
            // @ts-ignore
            currentVrm.expressionManager.setValue('aa', aa);
            // @ts-ignore
            currentVrm.expressionManager.setValue('ih', ih);
            // @ts-ignore
            currentVrm.expressionManager.setValue('ou', ou);
            // @ts-ignore
            currentVrm.expressionManager.setValue('ee', ee);

            // @ts-ignore
            currentVrm.expressionManager.setValue('blink', blink);

             // Happy expression if talking
            // @ts-ignore
            currentVrm.expressionManager.setValue('happy', volume > 0.02 ? 0.3 : 0);

            // @ts-ignore
            currentVrm.expressionManager.update();
        }
      }

      renderer.render(scene, camera);
      controls.update();
    };
    animate();

    const handleResize = () => {
        if (!containerRef.current) return;
        camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      if (audioContextRef.current) {
          audioContextRef.current.close();
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
