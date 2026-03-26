
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

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

  setInput: (input: string) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setResponseAudio: (audio: string | null) => void;
  addMessage: (role: 'user' | 'model', content: string) => void;
  sendMessage: () => Promise<void>;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  messages: [
    { id: '1', role: 'model', content: "Greetings. I am Professor Elara. Ready to expand your mind today?" }
  ],
  input: "",
  isSpeaking: false,
  loading: false,
  responseAudio: null,

  setInput: (input) => set({ input }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setResponseAudio: (responseAudio) => set({ responseAudio }),

  addMessage: (role, content) => set((state) => ({
    messages: [...state.messages, { id: uuidv4(), role, content }]
  })),

  sendMessage: async () => {
    const { input, messages, addMessage } = get();
    if (!input.trim()) return;

    // Add User Message
    addMessage('user', input);
    set({ input: "", loading: true, responseAudio: null });

    try {
      // API Call
      const res = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({ type: "chat", prompt: [...messages, { role: 'user', content: input }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Add Model Response
      addMessage('model', data.text);

      // Set Audio to trigger playback in component
      if (data.audio) {
          set({ responseAudio: data.audio });
      }
    } catch (error) {
      toast.error("Failed to get response");
      console.error(error);
    } finally {
      set({ loading: false });
    }
  }
}));
