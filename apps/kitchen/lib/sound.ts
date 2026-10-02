let ctx: AudioContext | null = null;

/** Two-tone "ding-dong" for new orders (WebAudio, no files). */
export function chime() {
  if (typeof window === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const tones: [number, number][] = [
      [988, 0],
      [784, 0.22],
    ];
    for (const [freq, start] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    }
  } catch {
    // Audio unavailable — the visual highlight still shows.
  }
}
