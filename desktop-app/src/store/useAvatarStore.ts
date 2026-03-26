
import { ChatMessage, generateChatResponse, generateTTSAudio, streamChatResponse } from '@/utils/aiClient';
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

// Pre-warm the browser's TTS voices asynchronously so they don't return [] on first call
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

interface AvatarState {
  messages: Message[];
  input: string;
  isSpeaking: boolean;
  loading: boolean;
  responseAudio: string | null;
  avatarState: 'idle' | 'listening' | 'thinking' | 'speaking';

  providerUrl: string;
  apiKey: string;
  modelName: string;

  setInput: (input: string) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setResponseAudio: (audio: string | null) => void;
  setProviderSettings: (url: string, key: string, model: string) => void;
  addMessage: (role: 'user' | 'model', content: string) => void;
  sendMessage: () => Promise<void>;
  stopSpeaking: () => void;
  setAvatarState: (state: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  messages: [
    { id: '1', role: 'model', content: "Greetings. I am Professor Elara. Ready to expand your mind today?" }
  ],
  input: "",
  isSpeaking: false,
  loading: false,
  responseAudio: null,
  avatarState: 'idle',

  // Default to ENV variables
  providerUrl: import.meta.env.VITE_AI_PROVIDER_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: import.meta.env.VITE_AI_API_KEY || "",
  modelName: import.meta.env.VITE_AI_MODEL_NAME || "gemini-2.5-flash",

  setInput: (input) => set({ input }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setResponseAudio: (responseAudio) => set({ responseAudio }),
  setProviderSettings: (providerUrl, apiKey, modelName) => set({ providerUrl, apiKey, modelName }),
  setAvatarState: (avatarState) => set({ avatarState }),

  addMessage: (role, content) => set((state) => ({
    messages: [...state.messages, { id: uuidv4(), role, content }]
  })),

  stopSpeaking: () => {
    window.speechSynthesis.cancel();
    set({ isSpeaking: false, responseAudio: null, avatarState: 'idle' });
    console.log("[Interrupt] Avatar speech stopped by user.");
  },

  sendMessage: async () => {
    const { input, messages, providerUrl, apiKey, modelName } = get();
    if (!input.trim()) return;

    const userInput = input;
    const userMsgId = uuidv4();
    set((state) => ({
      messages: [...state.messages, { id: userMsgId, role: 'user' as const, content: userInput }],
      input: "", loading: true, responseAudio: null, avatarState: 'thinking' as const,
    }));

    try {
      const systemInstruction: ChatMessage = {
          role: 'system',
          content: "You are Professor Elara, an exceptionally smart and witty young professor. You are brilliant but approachable, using precise academic language mixed with playful charm. You love teaching and explaining complex topics with clarity. Keep your responses concise (under 2 sentences) pending further inquiry."
      };

      const payloadMessages = [systemInstruction, ...messages, { role: 'user' as const, content: userInput }];

      const streamMsgId = uuidv4();
      set((state) => ({
        messages: [...state.messages, { id: streamMsgId, role: 'model' as const, content: "..." }]
      }));

      // ── Sentence-level TTS pipeline ──
      const ttsKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
      const useGoogleTTS = ttsKey && ttsKey !== "YOUR_GOOGLE_API_KEY_HERE" && ttsKey !== "none";
      const audioQueue: string[] = []; // Base64 audio chunks
      let isPlayingQueue = false;
      let sentenceBuffer = "";
      let sentencesSent = 0;

      const playNextInQueue = () => {
          if (audioQueue.length === 0) {
              isPlayingQueue = false;
              // Check if LLM is done and no more audio — go idle
              if (!get().loading) {
                  set({ isSpeaking: false, avatarState: 'idle' });
              }
              return;
          }
          isPlayingQueue = true;
          const audio = audioQueue.shift()!;
          set({ responseAudio: audio, avatarState: 'speaking', isSpeaking: true });
          // VrmViewer will play this and call setIsSpeaking(false) on end.
          // We need to watch for that to play the next chunk.
          const checkDone = setInterval(() => {
              if (!get().isSpeaking) {
                  clearInterval(checkDone);
                  playNextInQueue();
              }
          }, 100);
      };

      const queueSentenceTTS = async (sentence: string) => {
          if (!useGoogleTTS || !sentence.trim()) return;
          try {
              const audio = await generateTTSAudio(sentence.trim(), ttsKey);
              if (audio) {
                  audioQueue.push(audio);
                  if (!isPlayingQueue) {
                      playNextInQueue();
                  }
              }
          } catch (e) {
              console.error("Sentence TTS error:", e);
          }
      };

      let textResponse: string;
      try {
        textResponse = await streamChatResponse(
          payloadMessages,
          { baseUrl: providerUrl, apiKey, model: modelName },
          (chunk: string, fullText: string) => {
            // Live-update message
            set((state) => ({
              messages: state.messages.map(m =>
                m.id === streamMsgId ? { ...m, content: fullText } : m
              )
            }));

            // Sentence detection for TTS pipelining
            if (useGoogleTTS) {
                sentenceBuffer += chunk;
                // Check for sentence-ending punctuation
                const sentenceEnd = sentenceBuffer.match(/[.!?]\s/);
                if (sentenceEnd && sentenceEnd.index !== undefined) {
                    const sentence = sentenceBuffer.substring(0, sentenceEnd.index + 1);
                    sentenceBuffer = sentenceBuffer.substring(sentenceEnd.index + 2);
                    if (sentence.trim().length > 5) {
                        sentencesSent++;
                        queueSentenceTTS(sentence);
                    }
                }
            }
          }
        );

        // Flush remaining sentence buffer
        if (useGoogleTTS && sentenceBuffer.trim().length > 2) {
            queueSentenceTTS(sentenceBuffer.trim());
        }

      } catch (_) {
        set((state) => ({
          messages: state.messages.filter(m => m.id !== streamMsgId)
        }));
        textResponse = await generateChatResponse(
          payloadMessages,
          { baseUrl: providerUrl, apiKey, model: modelName }
        );
        set((state) => ({
          messages: [...state.messages, { id: streamMsgId, role: 'model' as const, content: textResponse }]
        }));
      }

      // Final message cleanup
      set((state) => ({
        messages: state.messages.map(m =>
          m.id === streamMsgId ? { ...m, content: textResponse } : m
        )
      }));

      // If no Google TTS or no sentences were queued, use Web Speech fallback
      if (!useGoogleTTS || sentencesSent === 0) {
          console.log("Using Web Speech API Local TTS.");
          try {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(textResponse);

              const voices = window.speechSynthesis.getVoices();
              const femaleVoice = voices.find(v =>
                  v.name.includes("Zira") ||
                  v.name.includes("Hazel") ||
                  v.name.includes("Samantha") ||
                  v.name.includes("Susan") ||
                  v.name.includes("Catherine") ||
                  v.name.includes("Google US English") ||
                  v.name.toLowerCase().includes("female")
              );

              if (femaleVoice) utterance.voice = femaleVoice;
              utterance.pitch = 1.1;
              utterance.rate = 1.05;

              utterance.onstart = () => set({ isSpeaking: true, avatarState: 'speaking' });
              utterance.onend = () => set({ isSpeaking: false, avatarState: 'idle' });
              utterance.onerror = () => set({ isSpeaking: false });

              window.speechSynthesis.speak(utterance);
          } catch(err: any) {
              toast.error("TTS Fallback failed: " + err.message);
          }
      }

    } catch (error: any) {
      toast.error(error.message || "Failed to get response");
      console.error(error);
    } finally {
      set({ loading: false });
    }
  }
}));
