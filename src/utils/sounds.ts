/**
 * Lightweight Web Audio synthesizer for Telegram-like notification chimes and call ringtones.
 * Works offline in browsers and Electron without external audio assets.
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) {
    sharedCtx = new AudioCtx();
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

export function playMessageNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(660, now);
    osc1.frequency.exponentialRampToValueAtTime(988, now + 0.09);
    osc2.frequency.setValueAtTime(988, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1318, now + 0.19);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.14);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.28);
  } catch {
    // Ignore browser autoplay restrictions
  }
}

export function playCallConnectedSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.09);
    osc.frequency.setValueAtTime(783.99, now + 0.18);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // ignore
  }
}

export function playCallEndedSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.22);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  } catch {
    // ignore
  }
}

export function startRingtoneLoop(variant: 'incoming' | 'outgoing'): () => void {
  let stopped = false;

  const playBurst = () => {
    if (stopped) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes =
        variant === 'incoming'
          ? [
              { freq: 587.33, start: 0, dur: 0.16 },
              { freq: 783.99, start: 0.18, dur: 0.16 },
              { freq: 987.77, start: 0.36, dur: 0.24 },
            ]
          : [{ freq: 425, start: 0, dur: 0.65 }];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.08, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    } catch {
      // ignore
    }
  };

  playBurst();
  const interval = setInterval(playBurst, variant === 'incoming' ? 2100 : 2800);
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
