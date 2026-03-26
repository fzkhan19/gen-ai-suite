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
  const avatarState = useAvatarStore(state => state.avatarState);


  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isSpeakingRef = useRef(isSpeaking);
  const avatarStateRef = useRef(avatarState);

  useEffect(() => {
      isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
      avatarStateRef.current = avatarState;
  }, [avatarState]);

  useEffect(() => {
     if (responseAudio) {
         playAudio(responseAudio);
     } else {
         // responseAudio was nulled → interrupt: stop any active audio source
         if (sourceRef.current) {
             try { sourceRef.current.stop(); } catch (_) {}
             sourceRef.current = null;
         }
         lipSyncRef.current = null;
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
    containerRef.current.innerHTML = ''; // Fix Double Canvas from Strict Mode

    // --- THREE JS SETUP ---
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 20);
    camera.position.set(0, 1.45, 1.1);
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
    controls.target.set(0.0, 1.45, 0.0); // Focus on face
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
                // ── ALIVE BREATHING ── (constant subtle chest movement)
                const breathe = Math.sin(time * 1.2) * 0.04;
                const sway = Math.sin(time * 0.7) * 0.03;
                spine.rotation.x = breathe;
                spine.rotation.y = sway;
                head.rotation.y = sway * -0.5;
            }

             // --- STATE-SPECIFIC BONE ANIMATIONS ---
             // @ts-ignore
             const headBone = currentVrm.humanoid?.getNormalizedBoneNode('head');
             // @ts-ignore
             const spineBone = currentVrm.humanoid?.getNormalizedBoneNode('spine');
             // @ts-ignore
             const neckBone = currentVrm.humanoid?.getNormalizedBoneNode('neck');
             // @ts-ignore
             const leftUpperArm = currentVrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
             // @ts-ignore
             const rightUpperArm = currentVrm.humanoid?.getNormalizedBoneNode('rightUpperArm');

             const currentAvatarState = avatarStateRef.current;

             if (currentAvatarState === 'thinking' && headBone) {
                 // ── THINKING: Looking up and to the side, slow contemplative sway ──
                 // Look upward (chin up)
                 headBone.rotation.x = -0.12 + Math.sin(time * 0.6) * 0.04;
                 // Slow side-to-side rock (like pondering)
                 headBone.rotation.z = Math.sin(time * 0.8) * 0.1;
                 // Slight y rotation (looking slightly to the side)
                 headBone.rotation.y = Math.sin(time * 0.4) * 0.08;
                 // Neck follows slightly
                 if (neckBone) {
                     neckBone.rotation.z = Math.sin(time * 0.8) * 0.04;
                     neckBone.rotation.x = -0.03;
                 }
                 // Body sway while thinking
                 if (spineBone) {
                     spineBone.rotation.y = Math.sin(time * 0.5) * 0.05;
                 }
                 // One hand up gesture (like chin-stroking)
                 if (rightUpperArm) {
                     rightUpperArm.rotation.z = -1.1 + Math.sin(time * 0.7) * 0.08;
                     rightUpperArm.rotation.x = 0.4 + Math.sin(time * 0.9) * 0.06;
                 }

             } else if (currentAvatarState === 'listening' && headBone) {
                 // ── LISTENING: Curious head tilt, leaning forward, attentive nods ──
                 // Tilt head to one side (curious)
                 headBone.rotation.z = 0.1 + Math.sin(time * 1.5) * 0.06;
                 // Slight forward lean (attentive)
                 headBone.rotation.x = 0.06 + Math.sin(time * 2.0) * 0.03;
                 // Periodic small nods (like "I'm following")
                 const nodCycle = Math.sin(time * 3.0);
                 if (nodCycle > 0.9) {
                     headBone.rotation.x += 0.05;
                 }
                 // Head slowly tracks (micro Y movement)
                 headBone.rotation.y = Math.sin(time * 0.6) * 0.06;
                 // Neck leans forward
                 if (neckBone) {
                     neckBone.rotation.x = 0.04;
                     neckBone.rotation.z = 0.03;
                 }
                 // Body leans slightly forward (engaged)
                 if (spineBone) {
                     spineBone.rotation.x = 0.03 + Math.sin(time * 1.0) * 0.015;
                 }

             } else if (currentAvatarState === 'speaking' && headBone) {
                 // ── SPEAKING: Dynamic head movement synced to energy ──
                 headBone.rotation.z = Math.sin(time * 2.5) * 0.07;
                 headBone.rotation.x = Math.sin(time * 1.8) * 0.04;
                 headBone.rotation.y = Math.sin(time * 1.2) * 0.06;
                 // Animated hand gestures while talking
                 if (leftUpperArm && rightUpperArm) {
                     leftUpperArm.rotation.z = 1.3 + Math.sin(time * 3) * 0.1;
                     rightUpperArm.rotation.z = -1.3 - Math.sin(time * 3.5) * 0.1;
                     leftUpperArm.rotation.x = 0.15 + Math.sin(time * 2) * 0.08;
                     rightUpperArm.rotation.x = 0.15 + Math.sin(time * 2.5) * 0.08;
                 }

             } else if (headBone) {
                 // ── IDLE: Gentle alive micro-movements ──
                 headBone.rotation.z = Math.sin(time * 0.3) * 0.03;
                 headBone.rotation.x = Math.sin(time * 0.4) * 0.02;
                 headBone.rotation.y = Math.sin(time * 0.25) * 0.03;
             }
        }

        // ── LIP SYNC & FACIAL EXPRESSIONS ──
        // @ts-ignore
        if (currentVrm.expressionManager) {
            let aa = 0, ih = 0, ou = 0, ee = 0, volume = 0;
            let happy = 0, surprised = 0;
            const currentAvatarState = avatarStateRef.current;

            if (lipSyncRef.current) {
                const syncData = lipSyncRef.current.update();
                aa = syncData.aa; ih = syncData.ih; ou = syncData.ou; ee = syncData.ee; volume = syncData.volume;
            } else if (isSpeakingRef.current) {
                volume = 0.5;
                const cycle = (time * 12) % 4;
                if (cycle < 1) aa = Math.abs(Math.sin(time * 20)) * 0.6;
                else if (cycle < 2) ih = Math.abs(Math.sin(time * 15)) * 0.5;
                else if (cycle < 3) ou = Math.abs(Math.sin(time * 18)) * 0.7;
                else ee = Math.abs(Math.sin(time * 22)) * 0.4;
            }

            // ── State-driven facial expressions ──
            if (currentAvatarState === 'thinking') {
                // Thoughtful: lips slightly pursed, neutral-serious face
                ou = 0.15 + Math.abs(Math.sin(time * 1.5)) * 0.12;
                ee = Math.abs(Math.sin(time * 2.2)) * 0.08;
                happy = 0;
                surprised = 0.05; // Slightly raised brows
            } else if (currentAvatarState === 'listening') {
                // Curious: wide eyes, slight smile, raised eyebrows
                happy = 0.2 + Math.sin(time * 2) * 0.1;
                surprised = 0.25 + Math.abs(Math.sin(time * 1.8)) * 0.15; // Wide eyes!
                // Slight 'oh' mouth (interested)
                ou = Math.abs(Math.sin(time * 2.5)) * 0.1;
            } else if (currentAvatarState === 'speaking') {
                happy = volume > 0.02 ? 0.35 : 0.1;
                surprised = volume > 0.1 ? 0.1 : 0;
            } else {
                // Idle: very gentle resting smile
                happy = 0.05 + Math.abs(Math.sin(time * 0.3)) * 0.05;
            }

            // ── Natural Blinking (multi-speed, random-feeling intervals) ──
            const blinkBase = Math.sin(time * 0.5);
            const blinkFast = Math.sin(time * 3.7);
            const blink = (blinkBase > 0.97 || (blinkFast > 0.98 && blinkBase > 0.5)) ? 1 : 0;

            // Apply all blendshapes
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
            // @ts-ignore
            currentVrm.expressionManager.setValue('happy', happy);
            // @ts-ignore
            try { currentVrm.expressionManager.setValue('surprised', surprised); } catch(_) {}
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
