export class LipSyncAnalyzer {
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  private sensitivity: number;
  private noiseGate: number;

  // Smoothed values
  private currentAh: number = 0;
  private currentOh: number = 0;
  private currentIh: number = 0;
  private currentEe: number = 0;
  private currentUu: number = 0;

  constructor(audioContext: AudioContext, source: AudioBufferSourceNode | MediaStreamAudioSourceNode) {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 1024; // High resolution (~43Hz per bin)
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      source.connect(this.analyser);
      // Note: We don't connect to destination here; the caller manages audio routing

      this.sensitivity = 1.8;
      this.noiseGate = 0.05;
  }

  public update() {
      this.analyser.getByteFrequencyData(this.dataArray as any);

      // --- 1. Compute Energy in Specific Formant Bands ---
      // Bin size = 48000 / 1024 = ~46.8 Hz

      // Fundamentals / Bass (Voice Core) -> 0 - 400Hz (Bins 0-9)
      const energyLow = this.getAverageEnergy(0, 9);

      // Mids (Open Vowels 'Ahh') -> 400 - 1500Hz (Bins 9-32)
      const energyMid = this.getAverageEnergy(9, 32);

      // High Mids / Treble (Wide Vowels 'Eee', 'Ihh') -> 1500 - 3500Hz (Bins 32-75)
      const energyHigh = this.getAverageEnergy(32, 75);

      // --- 2. Spectral Balancing (Compensate for Roll-off) ---
      // Higher frequencies naturally have less energy, so we boost them to compare fairly
      const midBoost = 2.5;
      const highBoost = 4.0;

      const weightedLow = energyLow;
      const weightedMid = energyMid * midBoost;
      const weightedHigh = energyHigh * highBoost;

      // --- 3. Vowel Decision Logic (Relative Dominance) ---

      // Baseline intensity
      const totalVolume = Math.max(0, (energyLow + energyMid + energyHigh) / 3);
      const isTalk = totalVolume > this.noiseGate;

      let tAh = 0, tOh = 0, tIh = 0, tEe = 0, tUu = 0;

      if (isTalk) {
        // If Highs are dominant -> Wide mouth (I/E)
        if (weightedHigh > weightedMid && weightedHigh > weightedLow) {
            tIh = 0.8;
            tEe = 0.6;
            tAh = 0.2; // Slight open
        }
        // If Mids are dominant -> Open mouth (A)
        else if (weightedMid > weightedLow) {
            tAh = 1.0;
            tEe = 0.2;
        }
        // If Lows are dominant -> Round mouth (O/U)
        else {
            tOh = 0.8;
            tUu = 0.6;
            tAh = 0.1;
        }

        // Modulate by volume (so whispering doesn't fully open mouth)
        const volFactor = Math.min(1.0, totalVolume * this.sensitivity);
        tAh *= volFactor;
        tOh *= volFactor;
        tIh *= volFactor;
        tEe *= volFactor;
        tUu *= volFactor;
      }

      // --- 4. Smoothing (Snappy Dynamics) ---
      // Attack = How fast it opens (0.1 = slow, 0.9 = instant)
      // Decay = How fast it closes (0.1 = slow, 0.9 = instant)
      const attack = 0.7; // Very snappy
      const decay = 0.4;  // Relatively quick close to show separation between words

      this.currentAh = this.lerp(this.currentAh, tAh, tAh > this.currentAh ? attack : decay);
      this.currentOh = this.lerp(this.currentOh, tOh, tOh > this.currentOh ? attack : decay);
      this.currentIh = this.lerp(this.currentIh, tIh, tIh > this.currentIh ? attack : decay);
      this.currentEe = this.lerp(this.currentEe, tEe, tEe > this.currentEe ? attack : decay);
      this.currentUu = this.lerp(this.currentUu, tUu, tUu > this.currentUu ? attack : decay);

      // Clamp 0-1
      return {
          aa: Math.min(1, this.currentAh),
          ih: Math.min(1, this.currentIh),
          ou: Math.min(1, this.currentOh),
          ee: Math.min(1, this.currentEe),
          uu: Math.min(1, this.currentUu),
          volume: totalVolume
      };
  }

  private getAverageEnergy(startBin: number, endBin: number): number {
      let total = 0;
      if (endBin <= startBin) return 0;
      for (let i = startBin; i < endBin; i++) {
          total += this.dataArray[i];
      }
      return (total / (endBin - startBin)) / 255.0;
  }

  private lerp(start: number, end: number, factor: number): number {
      return start + (end - start) * factor;
  }
}
