// A short two-note chime for timer alerts, made with Web Audio (no sound file).
// Browsers only allow audio after a tap, so primeChime runs on taps. On iPhone the
// "ambient" audio session follows the silent switch, so the chime stays quiet when muted.
let ctx: AudioContext | undefined;

export function primeChime() {
  try {
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio unavailable: alerts fall back to vibration and the message */ }
}

export function chime() {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx!.createOscillator(), gain = ctx!.createGain(), at = t + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(at);
    osc.stop(at + 0.3);
  });
}
