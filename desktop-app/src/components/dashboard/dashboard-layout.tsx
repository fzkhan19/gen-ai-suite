"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AvatarPanel } from "./avatar-panel";
import { ImagePanel } from "./image-panel";
import { VideoPanel } from "./video-panel";

export function DashboardLayout() {
  const [activeTab, setActiveTab] = useState("image");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen w-full bg-black text-white bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))] flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-5xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 mb-4 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-primary mr-2" />
            <span className="text-xs font-medium tracking-wide text-primary uppercase">Generative Suite v1.0</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-b from-white to-white/60">
            Create Beyond Reality
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Harness the power of Vertex AI to generate stunning images, cinematic videos, and detailed 3D avatars in seconds.
          </p>
        </div>

        {/* Navigation */}
        <Tabs id="dashboard-tabs" value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col items-center space-y-8">
          <TabsList className="bg-white/5 border border-white/10 p-1 h-auto rounded-full backdrop-blur-md">
            <TabsTrigger
              value="image"
              className="rounded-full px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300"
            >
              Image Gen
            </TabsTrigger>
            <TabsTrigger
              value="video"
              className="rounded-full px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300"
            >
              Video Gen
            </TabsTrigger>
            <TabsTrigger
              value="avatar"
              className="rounded-full px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300"
            >
              AI Companion
            </TabsTrigger>
          </TabsList>

          <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                {activeTab === "image" && <ImagePanel />}
                {activeTab === "video" && <VideoPanel />}
                {activeTab === "avatar" && <AvatarPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
