// Notes are scheduled just ahead of the audio clock. Listening modes can
// request another cycle, which joins the current one without a gap.
import { createEngine, playNote, startAmbience } from './audio.mjs';
import { soundingNote, stackAt } from './score.mjs';

const lookahead = 1.6;

export class Player {
  constructor({ next, onEnd }) {
    this.next = next;
    this.onEnd = onEnd;
    this.context = null;
    this.cycles = [];
    this.playing = false;
    this.volume = 0.7;
    this.nature = 0;
    this.water = true;
  }

  async ensure(seed) {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'playback' });
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = 0;
      this.master.connect(context.destination);
      this.engine = createEngine(context, this.master, seed);
      this.engine.ambience.gain.value = this.nature;
      this.engine.water.gain.value = this.water ? 1 : 0;
      this.tap = context.createMediaStreamDestination?.();
      if (this.tap) this.master.connect(this.tap);
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  get now() {
    return this.context?.currentTime ?? 0;
  }

  setVolume(value, fade = 0.08) {
    this.volume = value;
    if (!this.master) return;
    const now = this.now;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(value, now + fade);
  }

  setNature(value) {
    this.nature = value;
    if (this.engine) this.engine.ambience.gain.setTargetAtTime(value, this.now, 0.08);
  }

  setWater(enabled) {
    this.water = enabled;
    if (this.engine) this.engine.water.gain.setTargetAtTime(enabled ? 1 : 0, this.now, 0.05);
  }

  ambience(sceneKey) {
    if (!this.context || this.bed?.scene === sceneKey) return;
    if (this.nature === 0) return;
    const now = this.now;
    const fade = sceneKey === 'cedar' && !this.bed ? 0.9 : 3.5;
    this.bed?.stop(now, 3);
    this.bed = { scene: sceneKey, ...startAmbience(this.context, this.engine, sceneKey, now + 0.05, fade) };
  }

  stopAmbience(fade) {
    this.bed?.stop(this.now, fade);
    this.bed = null;
  }

  makeCycle(score, start, from) {
    const context = this.context;
    const music = context.createGain();
    const sparkle = context.createGain();
    music.connect(this.engine.music);
    sparkle.connect(this.engine.sparkle);
    const cycle = { score, start, music, sparkle, cursor: 0, joined: false, fading: false };
    const now = this.now;
    // Calls already on the stack when playback begins mid-cycle re-enter softly.
    const active = from > 0 ? new Set(stackAt(score, from).map(branch => soundingNote(branch, from))) : null;
    for (const note of score.events) {
      if (note.at >= from) break;
      cycle.cursor++;
      if (active?.has(note) && note.end > from) {
        playNote(context, { music, sparkle }, score.scene, note, now + 0.03, { hold: note.end - from, gain: 0.75 });
      }
    }
    return cycle;
  }

  play(score, position = 0) {
    if (!this.context) return;
    position = Math.min(score.cycle - 0.05, Math.max(0, position));
    this.fadeAll(0.9);
    const start = this.now + 0.06 - position;
    this.cycles.push(this.makeCycle(score, start, position));
    this.playing = true;
    this.schedule();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 110);
  }

  // Swap in a changed tree at the same point in its cycle.
  replace(score) {
    if (!this.playing) return;
    const current = this.current();
    const position = current ? (this.now - current.start) * score.cycle / current.score.cycle : 0;
    this.play(score, Math.min(position, score.cycle - 0.05));
  }

  pause() {
    const current = this.current();
    const position = current ? this.now - current.start : 0;
    this.playing = false;
    clearInterval(this.timer);
    this.fadeAll(0.6);
    return { score: current?.score, position };
  }

  fadeAll(seconds) {
    const now = this.now;
    for (const cycle of this.cycles) {
      if (cycle.fading) continue;
      cycle.fading = true;
      for (const bus of [cycle.music, cycle.sparkle]) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + seconds);
      }
      setTimeout(() => {
        cycle.music.disconnect();
        cycle.sparkle.disconnect();
      }, (seconds + 0.3) * 1000);
    }
    this.cycles = [];
  }

  stopAfterCurrent() {
    const current = this.current();
    if (!current) return;
    current.joined = false;
    this.cycles = this.cycles.filter(cycle => {
      if (cycle.start <= current.start) return true;
      cycle.music.disconnect();
      cycle.sparkle.disconnect();
      return false;
    });
  }

  schedule() {
    if (!this.playing) return;
    const now = this.now;
    const horizon = now + lookahead;
    for (const cycle of this.cycles) {
      const { score } = cycle;
      while (cycle.cursor < score.events.length && cycle.start + score.events[cycle.cursor].at < horizon) {
        const note = score.events[cycle.cursor++];
        const scheduled = cycle.start + note.at;
        const actual = Math.max(now + 0.01, scheduled);
        if (scheduled >= now) playNote(this.context, cycle, score.scene, note, actual);
        else if (cycle.start + note.end > actual) {
          playNote(this.context, cycle, score.scene, note, actual, { hold: cycle.start + note.end - actual, gain: 0.75 });
        }
      }
    }
    const last = this.cycles.at(-1);
    if (last && !last.joined && horizon > last.start + last.score.cycle) {
      const end = last.start + last.score.cycle;
      const next = this.next(last.score);
      if (next) {
        last.joined = true;
        this.cycles.push(this.makeCycle(next, end, 0));
      } else if (now >= end) {
        this.playing = false;
        clearInterval(this.timer);
        this.fadeAll(1.4);
        this.onEnd?.();
        return;
      }
    }
    // Retire cycles whose tails have finished ringing.
    this.cycles = this.cycles.filter(cycle => {
      const done = now > cycle.start + cycle.score.cycle + 9;
      if (done) {
        cycle.music.disconnect();
        cycle.sparkle.disconnect();
      }
      return !done;
    });
  }

  current() {
    const now = this.now;
    return this.cycles.find(cycle => now >= cycle.start && now < cycle.start + cycle.score.cycle)
      ?? this.cycles.find(cycle => now < cycle.start + cycle.score.cycle)
      ?? null;
  }

  position() {
    const cycle = this.current();
    return cycle ? { score: cycle.score, time: Math.max(0, this.now - cycle.start) } : null;
  }

  // A play-along or tapped note, heard immediately.
  touch(scene, note, isBranch = false) {
    if (!this.context) return;
    const options = isBranch
      ? { tap: true, hold: note.depth < 2 ? 0.85 : 0.48, gain: 1.2 }
      : { preview: true };
    playNote(this.context, this.engine, scene, note, this.now + 0.012, options);
  }

  startRecording() {
    if (!this.tap || typeof MediaRecorder === 'undefined') return false;
    const chunks = [];
    try {
      const recorder = new MediaRecorder(this.tap.stream);
      recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
      recorder.start(500);
      this.recording = { recorder, chunks, started: performance.now() };
      return true;
    } catch {
      return false;
    }
  }

  stopRecording() {
    const session = this.recording;
    this.recording = null;
    if (!session || session.recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise(resolve => {
      session.recorder.onstop = () => resolve(new Blob(session.chunks, { type: session.recorder.mimeType || 'audio/webm' }));
      session.recorder.onerror = () => resolve(null);
      session.recorder.stop();
    });
  }
}
