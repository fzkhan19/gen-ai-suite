
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Sparkles, VideoIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export function VideoPanel() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState([5]);
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleGenerate = async () => {
    if (!prompt) return;

    setLoading(true);
    setVideoUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type: "video",
          prompt,
          params: { duration: duration[0] }
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setVideoUrl(data.url);
      toast.success("Video generated successfully!");
    } catch (error) {
      toast.error("Failed to generate video");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      <Card className="border-white/10 bg-background/30 backdrop-blur-xl h-fit">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground/90 flex items-center gap-2">
              <VideoIcon className="w-5 h-5 text-primary" />
              Video Configuration
            </h3>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Prompt</label>
              <Textarea
                placeholder="Describe your scene..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="bg-background/20 border-white/10 resize-none min-h-[120px] focus-visible:ring-primary/50"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between">
                <label className="text-sm text-muted-foreground">Duration</label>
                <span className="text-sm font-medium">{duration[0]}s</span>
              </div>
              <Slider
                value={duration}
                onValueChange={setDuration}
                max={10}
                step={1}
                min={5}
                className="py-4"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className="w-full bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/20 transition-all duration-300"
            >
              {loading ? (
                <>Generating...</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Video
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-background/30 backdrop-blur-xl flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full p-6 flex flex-col gap-4"
            >
              <Skeleton className="w-full h-full rounded-lg bg-white/5" />
            </motion.div>
          ) : videoUrl ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full h-full p-6"
            >
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>
          ) : (
            <div className="text-center text-muted-foreground space-y-2 p-6">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                <Clapperboard className="w-10 h-10 opacity-30" />
              </div>
              <p>Ready to generate.</p>
              <p className="text-sm opacity-50">Enter a prompt and duration.</p>
            </div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
