
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import { Expand, ImageIcon, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

export function ImagePanel() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;

    setLoading(true);
    setImageUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          prompt,
          params: { aspectRatio }
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setImageUrl(data.url);
      toast.success("Image generated successfully!");
    } catch (error) {
      toast.error("Failed to generate image");
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
              <ImageIcon className="w-5 h-5 text-primary" />
              Image Configuration
            </h3>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Prompt</label>
              <Textarea
                placeholder="Describe your vision..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="bg-background/20 border-white/10 resize-none min-h-[120px] focus-visible:ring-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Aspect Ratio</label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="bg-background/20 border-white/10">
                  <SelectValue placeholder="Select ratio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">Square (1:1)</SelectItem>
                  <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                  <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className="w-full bg-linear-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white shadow-lg shadow-blue-500/20 transition-all duration-300"
            >
              {loading ? (
                <>Generating...</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-background/30 backdrop-blur-xl flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden group">
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
          ) : imageUrl ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full h-full p-6"
            >
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-white/10 shadow-2xl">
                <Image
                  src={imageUrl}
                  alt={prompt}
                  fill
                  className="object-cover"
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="secondary" className="bg-black/50 hover:bg-black/70 text-white border-none">
                    <Expand className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="text-center text-muted-foreground space-y-2 p-6">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                <ImageIcon className="w-10 h-10 opacity-30" />
              </div>
              <p>Ready to generate.</p>
              <p className="text-sm opacity-50">Enter a prompt to begin.</p>
            </div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
