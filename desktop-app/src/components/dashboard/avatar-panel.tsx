

import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {ErrorBoundary} from "@/components/ui/error-boundary";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Textarea} from "@/components/ui/textarea";
import {useAvatarStore} from "@/store/useAvatarStore";
import {Bot, Brain, Ear, MessageSquare, Mic, Send, Settings, User, Volume2, X} from "lucide-react";
import React, {useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import VrmViewer from '../avatar/VrmViewer';

export function AvatarPanel() {
  const {
    messages,
    input,
    loading,
    providerUrl,
    apiKey,
    modelName,
    avatarState,
    setInput,
    sendMessage,
    setProviderSettings,
    setAvatarState
  } = useAvatarStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // ── SpeechRecognition Hands-Free Listening ──
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleRecording = async () => {
      if (isRecording) {
          recognitionRef.current?.abort();
          recognitionRef.current = null;
          setIsRecording(false);
          setAvatarState('idle');
          setInterimText("");
          toast.info("Listening disabled.");
          return;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
          toast.error("SpeechRecognition not supported.");
          return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
          let interim = "", final_ = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
              const t = event.results[i][0].transcript;
              if (event.results[i].isFinal) final_ += t;
              else interim += t;
          }

          const fullTranscript = (final_ + interim).toLowerCase();

          // ── WAKE WORD DETECTION: "ELARA" ──
          if (fullTranscript.includes("elara") && !loading && avatarState !== 'speaking') {
              // Trigger a "wake" visual effect? (could add to store)
              console.log("[WakeWord] 'Elara' detected.");
              const store = useAvatarStore.getState();
              if (store.isSpeaking) store.stopSpeaking();
          }

          if (interim) {
              setInterimText(interim);
              const store = useAvatarStore.getState();
              if (store.isSpeaking) store.stopSpeaking();
          }

          if (final_ && final_.trim().length > 1) {
              setInterimText("");
              const store = useAvatarStore.getState();

              // Strip "Elara" from the beginning if present for a cleaner prompt
              let prompt = final_.trim();
              if (prompt.toLowerCase().startsWith("elara")) {
                  prompt = prompt.substring(5).trim();
                  if (prompt.startsWith(",") || prompt.startsWith(".")) prompt = prompt.substring(1).trim();
              }

              if (prompt.length > 0) {
                  store.setInput(prompt);
                  setTimeout(() => useAvatarStore.getState().sendMessage(), 50);
              }
          }
      };

      recognition.onerror = (event: any) => {
          if (event.error === 'no-speech' || event.error === 'aborted') return;
          toast.error("Speech error: " + event.error);
      };

      recognition.onend = () => {
          if (recognitionRef.current) try { recognition.start(); } catch (_) {}
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      setAvatarState('listening');
      toast.success("Elara is now listening for her name...");
  };

  useEffect(() => {
    setMounted(true);
    // Auto-start wake-word listener on boot
    const timer = setTimeout(() => {
        if (!isRecording) toggleRecording();
    }, 1500); // Small delay to ensure browser audio context is ready
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!mounted) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stateConfig = {
      idle: { color: 'bg-white/30', label: 'Idle', icon: <Bot className="w-3 h-3" /> },
      listening: { color: 'bg-cyan-500 animate-pulse', label: 'Listening', icon: <Ear className="w-3 h-3" /> },
      thinking: { color: 'bg-amber-500 animate-pulse', label: 'Thinking', icon: <Brain className="w-3 h-3" /> },
      speaking: { color: 'bg-emerald-500 animate-pulse', label: 'Speaking', icon: <Volume2 className="w-3 h-3" /> },
  };
  const currentState = stateConfig[avatarState];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050505] select-none">
      {/* ── Avatar Viewport (Background Canvas) ── */}
      <div className="absolute inset-0 z-0">
         {/* Subtle Vignette & Depth */}
         <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.4)_100%)]" />

         {/* State Badge (Compact & Cornered) */}
         <div className="absolute top-6 left-6 z-20 flex items-center gap-3 px-3 py-2 bg-black/60 border border-white/10 backdrop-blur-md">
            <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)] ${currentState.color}`} />
            <div className="flex flex-col">
                <span className="text-[9px] uppercase font-mono tracking-[0.2em] text-white/40 leading-none mb-1">System_State</span>
                <span className="text-[11px] uppercase font-bold tracking-widest text-white/90 leading-none">{currentState.label}</span>
            </div>
         </div>

         {/* Mic & Chat Toggle */}
         <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              size="icon"
              onClick={toggleRecording}
              className={`h-9 w-9 rounded-none transition-colors ${
                  isRecording
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 animate-pulse'
                    : 'bg-black/80 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Mic className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              onClick={() => setShowChat(!showChat)}
              className="h-9 w-9 rounded-none bg-black/80 border border-white/10 text-white/60 hover:text-white hover:bg-white/10"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
         </div>

         <ErrorBoundary>
            <VrmViewer />
         </ErrorBoundary>

         {/* Live Interim Transcription Display */}
         {interimText && (
           <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[80%]">
             <div className="bg-black/80 border border-cyan-500/30 px-4 py-2 backdrop-blur-sm">
               <span className="text-[11px] font-mono text-cyan-400/80 italic">
                 🎤 {interimText}
               </span>
             </div>
           </div>
         )}
      </div>

      {/* ── Slide-out Chat Panel (Optimized for 1024x600) ── */}
      {showChat && (
        <div className="absolute top-0 right-0 bottom-0 w-[320px] z-20 border-l border-white/10 shadow-2xl">
          <Card className="border-none bg-black/60 backdrop-blur-xl h-full flex flex-col overflow-hidden rounded-none">
            <CardContent className="p-4 flex flex-col flex-1 min-h-0 gap-4">
              <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <Bot className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm tracking-widest uppercase font-mono text-white/80">Terminal API</h3>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} className="w-8 h-8 rounded-full">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowChat(false)} className="w-8 h-8 rounded-full">
                      <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              {showSettings ? (
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Provider Settings</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="w-6 h-6"><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="space-y-3 mt-2">
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">API Base URL</label>
                            <input type="text" value={providerUrl} onChange={e => setProviderSettings(e.target.value, apiKey, modelName)} className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-sm text-white" placeholder="http://localhost:11434/v1" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Model Name</label>
                            <input type="text" value={modelName} onChange={e => setProviderSettings(providerUrl, apiKey, e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-sm text-white" placeholder="llama3" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">API Key (Optional for Local)</label>
                            <input type="password" value={apiKey} onChange={e => setProviderSettings(providerUrl, e.target.value, modelName)} className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-sm text-white" placeholder="sk-..." />
                        </div>
                        <div className="pt-4 border-t border-white/10">
                            <p className="text-xs text-muted-foreground">Presets:</p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setProviderSettings("http://localhost:11434/v1", "none", "llama3")} className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded">Ollama</button>
                                <button onClick={() => setProviderSettings("https://api.openai.com/v1", "", "gpt-4o")} className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded">OpenAI</button>
                            </div>
                        </div>
                    </div>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 w-full min-h-0" type="always">
                    <div className="space-y-4 pr-4">
                      {messages.map((msg: any) => (
                        <div
                          key={msg.id}
                          className={`flex gap-3 mb-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                           {msg.role === 'model' && (
                             <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-1">
                               <Bot className="w-4 h-4 text-emerald-500" />
                             </div>
                           )}
                           <div
                             className={`px-4 py-3 max-w-[85%] text-[13px] leading-relaxed font-mono ${
                               msg.role === 'user'
                                 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                 : 'bg-white/5 text-white/80 border border-white/10'
                             }`}
                           >
                             {msg.content}
                           </div>
                           {msg.role === 'user' && (
                             <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-1">
                               <User className="w-4 h-4 text-emerald-500/70" />
                             </div>
                           )}
                        </div>
                      ))}
                      {loading && (
                         <div className="flex gap-3 justify-start items-center mb-6">
                             <div className="w-6 h-6 flex items-center justify-center shrink-0 animate-pulse">
                               <Bot className="w-4 h-4 text-emerald-500" />
                             </div>
                             <div className="bg-transparent border border-white/10 px-4 py-2 flex items-center gap-2 h-9">
                                <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-500/70">Awaiting_Stream</span>
                                <div className="flex gap-1">
                                  <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                  <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                  <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                             </div>
                         </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="relative pt-4 border-t border-white/10 shrink-0">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="/// enter query..."
                      className="pr-12 resize-none bg-black border-white/10 focus-visible:ring-emerald-500/50 text-white min-h-[60px] max-h-[120px] rounded-none font-mono text-[13px]"
                    />
                    <Button
                      size="icon"
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      className="absolute right-2 bottom-2 h-8 w-8 rounded-none bg-white/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                    >
                      <Send className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
