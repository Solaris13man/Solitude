/**
 * Tiny synthesized sound effects — no audio files. Everything is generated
 * with WebAudio oscillators and filtered noise bursts, so the whole "sound
 * library" costs ~1KB and loads instantly. All playback is fire-and-forget
 * and silently no-ops when audio is unavailable or disabled.
 */

export type SoundKind = 'place' | 'flip' | 'foundation' | 'shuffle' | 'undo' | 'win';

export class SoundPlayer {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        if (typeof AudioContext === 'undefined') return null;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    // Browsers gate audio behind a user gesture; play() is always called
    // from one, so resuming here is enough.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(kind: SoundKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    try {
      switch (kind) {
        case 'place':
          this.click(t, 1600, 0.05, 0.22);
          this.thump(t, 130, 0.06, 0.1);
          break;
        case 'flip':
          this.click(t, 2800, 0.03, 0.16);
          break;
        case 'foundation':
          this.click(t, 1800, 0.04, 0.18);
          this.tone(t, 740, 0.14, 0.1, 'sine');
          this.tone(t + 0.04, 988, 0.16, 0.08, 'sine');
          break;
        case 'shuffle':
          this.swoosh(t, 0.22, 0.14);
          break;
        case 'undo':
          this.click(t, 900, 0.04, 0.12);
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) => {
            this.tone(t + i * 0.09, f, 0.25, 0.12, 'triangle');
          });
          break;
      }
    } catch {
      // never let audio failures affect gameplay
    }
  }

  /** Short filtered noise burst — the "card hits felt" click. */
  private click(t: number, freq: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur);
  }

  /** Low sine knock under the click for a bit of weight. */
  private thump(t: number, freq: number, dur: number, vol: number): void {
    this.tone(t, freq, dur, vol, 'sine');
  }

  private tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** Noise with a rising lowpass sweep — the shuffle/recycle swoosh. */
  private swoosh(t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur);
  }

  private noiseBuffer(dur: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
