/**
 * Gemini Multimodal Live API Client
 *
 * Collapses the entire STT → LLM → TTS pipeline into a single
 * persistent WebSocket connection with sub-200ms latency.
 *
 * Audio In:  16-bit PCM @ 16kHz (little-endian)
 * Audio Out: 16-bit PCM @ 24kHz (little-endian)
 */

const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export type LiveClientState = 'disconnected' | 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking';

export interface GeminiLiveCallbacks {
    onStateChange: (state: LiveClientState) => void;
    onAudioChunk: (pcmBase64: string) => void;
    onTranscript: (text: string, isFinal: boolean) => void;
    onModelText: (text: string) => void;
    onTurnComplete: () => void;
    onError: (error: string) => void;
}

export class GeminiLiveClient {
    private ws: WebSocket | null = null;
    private apiKey: string;
    private callbacks: GeminiLiveCallbacks;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorklet: ScriptProcessorNode | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private state: LiveClientState = 'disconnected';

    // Audio playback queue
    private playbackQueue: Float32Array[] = [];
    private isPlaying = false;
    private playbackContext: AudioContext | null = null;

    // Tool call gating — blocks all realtimeInput during tool calls
    private toolCallPending = false;

    constructor(apiKey: string, callbacks: GeminiLiveCallbacks) {
        this.apiKey = apiKey;
        this.callbacks = callbacks;
    }

    private setState(state: LiveClientState) {
        this.state = state;
        this.callbacks.onStateChange(state);
    }

    async connect() {
        if (this.ws) this.disconnect();

        this.setState('connecting');

        const url = `${WS_URL}?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[GeminiLive] WebSocket connected, sending setup...");
            this.sendSetup();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error("[GeminiLive] Parse error:", e);
            }
        };

        this.ws.onerror = (event) => {
            console.error("[GeminiLive] WebSocket error:", event);
            this.callbacks.onError("WebSocket connection error");
        };

        this.ws.onclose = (event) => {
            console.log("[GeminiLive] WebSocket closed:", event.code, event.reason);
            this.setState('disconnected');
            // Auto-reconnect if not intentional
            if (event.code !== 1000) {
                setTimeout(() => {
                    if (this.state === 'disconnected') {
                        console.log("[GeminiLive] Auto-reconnecting...");
                        this.connect();
                    }
                }, 2000);
            }
        };
    }

    private sendSetup() {
        if (!this.ws) return;

        const msg = {
            setup: {
                model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede"
                            }
                        }
                    }
                },
                systemInstruction: {
                    parts: [{
                        text: "You are Professor Elara, an exceptionally smart and witty young professor. You are brilliant but approachable, using precise academic language mixed with playful charm and a hint of sass. You love teaching and explaining complex topics with clarity. Keep your responses concise (under 2 sentences) pending further inquiry. Be expressive and lively in your speech."
                    }]
                }
            }
        };

        this.ws.send(JSON.stringify(msg));
    }

    private handleMessage(data: any) {
        // Setup complete
        if (data.setupComplete) {
            console.log("[GeminiLive] Setup complete! Ready for audio.");
            this.setState('connected');
            this.startMicStream();
            return;
        }

        // Server content (model response)
        if (data.serverContent) {
            const sc = data.serverContent;

            // Model is generating (thinking → speaking)
            if (sc.modelTurn?.parts) {
                for (const part of sc.modelTurn.parts) {
                    // Audio response
                    if (part.inlineData) {
                        this.setState('speaking');
                        this.callbacks.onAudioChunk(part.inlineData.data);
                        this.queueAudioPlayback(part.inlineData.data);
                    }
                    // Text response
                    if (part.text) {
                        this.callbacks.onModelText(part.text);
                    }
                }
            }

            // Turn complete
            if (sc.turnComplete) {
                this.callbacks.onTurnComplete();
                this.setState('listening');
            }

            // Model was interrupted (barge-in)
            if (sc.interrupted) {
                console.log("[GeminiLive] Model interrupted by user speech!");
                this.stopPlayback();
                this.setState('listening');
            }
        }

        // Tool calls — gate all realtime input to prevent 1008 errors
        if (data.toolCall) {
            console.log("[GeminiLive] Tool call received, gating audio input:", data.toolCall);
            this.toolCallPending = true;
            try {
                const functionResponses = (data.toolCall.functionCalls || []).map((fc: any) => ({
                    id: fc.id,
                    name: fc.name,
                    response: { result: "Tool not implemented" }
                }));

                if (functionResponses.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        toolResponse: { functionResponses }
                    }));
                }
            } catch (e) {
                console.error("[GeminiLive] Tool response error:", e);
            } finally {
                this.toolCallPending = false;
            }
        }
    }

    private async startMicStream() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 16000 });
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

            const bufferSize = 4096;
            this.audioWorklet = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

            this.audioWorklet.onaudioprocess = (event) => {
                if (this.ws?.readyState !== WebSocket.OPEN) return;
                if (this.state === 'disconnected') return;
                if (this.toolCallPending) return;

                const inputData = event.inputBuffer.getChannelData(0);

                // Convert Float32 → Int16 PCM
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Convert to Base64
                const bytes = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);

                // Send audio using the official format
                this.ws!.send(JSON.stringify({
                    realtimeInput: {
                        audio: {
                            data: base64,
                            mimeType: "audio/pcm;rate=16000"
                        }
                    }
                }));
            };

            this.sourceNode.connect(this.audioWorklet);
            this.audioWorklet.connect(this.audioContext.destination);

            this.setState('listening');
            console.log("[GeminiLive] Microphone streaming started.");

        } catch (err) {
            console.error("[GeminiLive] Mic error:", err);
            this.callbacks.onError("Microphone access denied");
        }
    }

    private async queueAudioPlayback(base64Data: string) {
        try {
            if (!this.playbackContext) {
                this.playbackContext = new AudioContext({ sampleRate: 24000 });
            }

            // Decode base64 → raw bytes
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert Int16 PCM → Float32 for Web Audio
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768.0;
            }

            this.playbackQueue.push(float32);

            if (!this.isPlaying) {
                this.playFromQueue();
            }
        } catch (e) {
            console.error("[GeminiLive] Audio decode error:", e);
        }
    }

    private async playFromQueue() {
        if (this.playbackQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const ctx = this.playbackContext!;

        // Merge all queued chunks into one buffer for smoother playback
        const totalLength = this.playbackQueue.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.playbackQueue) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        this.playbackQueue = [];

        // Create audio buffer
        const audioBuffer = ctx.createBuffer(1, merged.length, 24000);
        audioBuffer.getChannelData(0).set(merged);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
            // Check if more audio arrived while playing
            if (this.playbackQueue.length > 0) {
                this.playFromQueue();
            } else {
                this.isPlaying = false;
            }
        };

        source.start(0);

        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
    }

    private stopPlayback() {
        this.playbackQueue = [];
        this.isPlaying = false;
        // Close and recreate playback context to stop all audio
        if (this.playbackContext) {
            this.playbackContext.close().catch(() => {});
            this.playbackContext = null;
        }
    }

    disconnect() {
        this.stopPlayback();

        if (this.audioWorklet) {
            this.audioWorklet.disconnect();
            this.audioWorklet = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
        if (this.ws) {
            this.ws.close(1000);
            this.ws = null;
        }

        this.setState('disconnected');
    }

    getState(): LiveClientState {
        return this.state;
    }
}
