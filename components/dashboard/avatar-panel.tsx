
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAvatarStore } from "@/store/useAvatarStore";
import { Bot, Send, Sparkles, User } from "lucide-react";
import dynamic from 'next/dynamic';
import React, { useEffect, useRef } from "react";

// Dynamically import the 3D scene with SSR disabled
// Dynamically import the new VRM-First Avatar System
// Dynamically import the Vanilla VRM Viewer
const VrmViewer = dynamic(() => import('@/components/avatar/VrmViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black/40 text-muted-foreground gap-2">
            <Sparkles className="w-8 h-8 animate-pulse text-primary/50" />
            <span className="text-xs font-mono">INITIALIZING VRM...</span>
        </div>
    )
});



export function AvatarPanel() {
  const {
    messages,
    input,
    isSpeaking,
    loading,
    setInput,
    sendMessage
  } = useAvatarStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
      <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl group">

         <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-white/50'}`} />
            <span className="text-xs font-mono text-white/80">LIVE RENDER</span>
         </div>

         {/* Render the dynamic scene here */}
         <ErrorBoundary>
            <VrmViewer />
         </ErrorBoundary>

         <div className="absolute inset-0 -z-10 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
      </div>

      <Card className="lg:col-span-1 border-white/10 bg-background/30 backdrop-blur-xl h-full flex flex-col">
        <CardContent className="p-4 flex flex-col h-full gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Bot className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">AI Companion</h3>
          </div>

          <ScrollArea className="flex-1 w-full" type="always">
            <div className="space-y-4 pr-4">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                   {msg.role === 'model' && (
                     <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                       <Bot className="w-5 h-5 text-primary" />
                     </div>
                   )}

                   <div
                     className={`rounded-2xl px-4 py-2 max-w-[85%] text-sm ${
                       msg.role === 'user'
                         ? 'bg-primary text-primary-foreground'
                         : 'bg-white/10 text-foreground border border-white/10'
                     }`}
                   >
                     {msg.content}
                   </div>

                   {msg.role === 'user' && (
                     <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                       <User className="w-5 h-5 text-white/70" />
                     </div>
                   )}
                </div>
              ))}
              {loading && (
                 <div className="flex gap-3 justify-start items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 animate-pulse">
                       <Bot className="w-5 h-5 text-primary" />
                     </div>
                     <div className="bg-white/5 rounded-2xl px-4 py-2 flex items-center gap-2 h-9 border border-white/5">
                        <span className="text-xs text-white/50 font-medium">Thinking</span>
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

          <div className="relative pt-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="pr-12 resize-none bg-background/20 border-white/10 focus-visible:ring-primary/50 min-h-[50px] max-h-[100px]"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 transition-colors"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
