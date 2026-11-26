// Stillwater's sound. Every voice is synthesized with Web Audio. The same
// functions drive live playback and the offline render used for WAV export.
import { frequency, randomFrom, scenes } from './score.mjs';

export const sampleRate = 44100;
const levels = [0.034, 0.03, 0.05, 0.056, 0.042, 0.036, 0.032, 0.028];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function impulse(context, seed, seconds) {
  const random = randomFrom(seed ^ 0x633d);
  const size = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, size, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const delay = Math.floor(context.sampleRate * (channel ? 0.029 : 0.021));
    let filtered = 0;
    for (let i = delay; i < size; i++) {
      const progress = i / size;
      const smooth = 0.35 + 0.55 * progress; // the tail darkens as it decays
      filtered = filtered * smooth + (random() * 2 - 1) * (1 - smooth);
      data[i] = filtered * (1 - progress) ** 2.6 * (1 + (1 - progress) * 0.6);
    }
  }
  return buffer;
}

function stereoEcho(context, input, output) {
  const left = context.createDelay(1);
  const right = context.createDelay(1);
  const leftLevel = context.createGain();
  const rightLevel = context.createGain();
  const panLeft = context.createStereoPanner();
  const panRight = context.createStereoPanner();
  const tone = context.createBiquadFilter();
  left.delayTime.value = 0.32;
  right.delayTime.value = 0.57;
  leftLevel.gain.value = 0.7;
  rightLevel.gain.value = 0.35;
  panLeft.pan.value = -0.7;
  panRight.pan.value = 0.7;
  tone.type = 'lowpass';
  tone.frequency.value = 2400;
  input.connect(tone);
  tone.connect(left).connect(leftLevel).connect(panLeft).connect(output);
  tone.connect(right).connect(rightLevel).connect(panRight).connect(output);
  return [left, right, leftLevel, rightLevel, panLeft, panRight, tone];
}

// The mix: notes, a sparkle bus with two soft echoes for the upper voices,
// a long dark reverb, the nature bed and a gentle limiter.
export function createEngine(context, destination, seed = 1) {
  const music = context.createGain();
  const sparkle = context.createGain();
  const ambience = context.createGain();
  const water = context.createGain();
  const send = context.createGain();
  const echoes = context.createGain();
  const reverb = context.createConvolver();
  const wet = context.createGain();
  const tone = context.createBiquadFilter();
  const limiter = context.createDynamicsCompressor();
  const out = context.createGain();
  reverb.buffer = impulse(context, seed, 3.8);
  send.gain.value = 0.62;
  wet.gain.value = 0.42;
  echoes.gain.value = 0.2;
  tone.type = 'lowpass';
  tone.frequency.value = 9800;
  tone.Q.value = 0.4;
  limiter.threshold.value = -16;
  limiter.knee.value = 14;
  limiter.ratio.value = 3.2;
  limiter.attack.value = 0.02;
  limiter.release.value = 0.45;

  music.connect(tone);
  music.connect(send);
  sparkle.connect(music);
  const delayNodes = stereoEcho(context, sparkle, echoes);
  echoes.connect(tone);
  echoes.connect(send);
  water.connect(ambience);
  ambience.connect(tone);
  const ambienceSend = context.createGain();
  ambienceSend.gain.value = 0.12;
  ambience.connect(ambienceSend).connect(send);
  send.connect(reverb).connect(wet).connect(tone);
  tone.connect(limiter).connect(out).connect(destination);
  const nodes = [music, sparkle, ambience, water, send, echoes, reverb, wet, tone, limiter, out, ambienceSend, ...delayNodes];
  return { music, sparkle, ambience, water, out, release: () => nodes.forEach(node => node.disconnect()) };
}

function tone(context, type, hz, start, stop, destination, detune = 0) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = hz;
  oscillator.detune.value = detune;
  oscillator.connect(destination);
  oscillator.start(start);
  oscillator.stop(stop);
  return oscillator;
}

function swell(context, destination, start, attack, hold, release, level) {
  const gain = context.createGain();
  const top = start + Math.max(attack, hold);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + attack);
  gain.gain.setValueAtTime(level, top);
  gain.gain.exponentialRampToValueAtTime(0.0001, top + release);
  gain.connect(destination);
  return { gain, end: top + release + 0.05 };
}

function pluck(context, destination, start, attack, decay, level) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  gain.connect(destination);
  return { gain, end: start + attack + decay + 0.05 };
}

const voices = {
  // Trunk: a warm drone that holds for the whole call.
  pad(context, out, hz, start, hold, level, quick) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(330, start);
    filter.frequency.linearRampToValueAtTime(460, start + Math.max(0.5, hold * 0.45));
    filter.frequency.linearRampToValueAtTime(320, start + Math.max(1, hold + 3));
    const attack = quick ? 0.11 : Math.min(3.2, Math.max(0.6, hold * 0.35));
    const envelope = swell(context, out, start, attack, hold, 4.2, level);
    filter.connect(envelope.gain);
    const octave = context.createGain();
    octave.gain.value = 0.2;
    octave.connect(filter);
    tone(context, 'sine', hz, start, envelope.end, filter);
    tone(context, 'triangle', hz * 2, start, envelope.end, octave);
    return envelope.end;
  },
  // Second level: soft bowed strings with a slow vibrato.
  strings(context, out, hz, start, hold, level, quick) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1900;
    const attack = quick ? 0.08 : Math.min(1.8, Math.max(0.35, hold * 0.3));
    const envelope = swell(context, out, start, attack, hold, 2.8, level);
    filter.connect(envelope.gain);
    const vibrato = context.createOscillator();
    const depth = context.createGain();
    vibrato.frequency.value = 4.6;
    depth.gain.value = 4;
    vibrato.connect(depth);
    vibrato.start(start);
    vibrato.stop(envelope.end);
    for (const cents of [-5, 6]) depth.connect(tone(context, 'triangle', hz, start, envelope.end, filter, cents).detune);
    const air = context.createGain();
    air.gain.value = 0.28;
    air.connect(filter);
    tone(context, 'sine', hz * 2, start, envelope.end, air);
    return envelope.end;
  },
  // A frequency-modulated electric piano.
  keys(context, out, hz, start, hold, level) {
    const decay = clamp(hold + 0.9, 1.8, 4.6);
    const envelope = pluck(context, out, start, 0.008, decay, level);
    const carrier = tone(context, 'sine', hz, start, envelope.end, envelope.gain);
    const modulator = context.createOscillator();
    const index = context.createGain();
    modulator.frequency.value = hz;
    index.gain.setValueAtTime(hz * 1.5, start);
    index.gain.exponentialRampToValueAtTime(hz * 0.12, start + 1.3);
    modulator.connect(index).connect(carrier.frequency);
    modulator.start(start);
    modulator.stop(envelope.end);
    const tine = pluck(context, out, start, 0.004, 0.28, level * 0.13);
    tone(context, 'sine', hz * 4, start, tine.end, tine.gain);
    return envelope.end;
  },
  kalimba(context, out, hz, start, hold, level) {
    const body = pluck(context, out, start, 0.004, clamp(hold * 1.4, 1.4, 2.8), level);
    tone(context, 'sine', hz, start, body.end, body.gain);
    const ring = pluck(context, out, start, 0.003, 0.55, level * 0.16);
    tone(context, 'sine', hz * 2, start, ring.end, ring.gain);
    const tine = pluck(context, out, start, 0.002, 0.13, level * 0.2);
    tone(context, 'sine', hz * 5.4, start, tine.end, tine.gain);
    return body.end;
  },
  marimba(context, out, hz, start, hold, level) {
    const body = pluck(context, out, start, 0.005, clamp(hold * 1.1, 0.9, 1.9), level);
    tone(context, 'sine', hz, start, body.end, body.gain);
    const bar = pluck(context, out, start, 0.003, 0.11, level * 0.3);
    tone(context, 'sine', hz * 3.93, start, bar.end, bar.gain);
    return body.end;
  },
  harp(context, out, hz, start, hold, level) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(hz * 8, start);
    filter.frequency.exponentialRampToValueAtTime(hz * 1.5, start + 1.4);
    const body = pluck(context, out, start, 0.004, clamp(hold * 1.5, 1.6, 3.2), level);
    filter.connect(body.gain);
    tone(context, 'triangle', hz, start, body.end, filter);
    tone(context, 'sine', hz * 2.003, start, body.end, filter);
    return body.end;
  },
  bell(context, out, hz, start, hold, level) {
    const decay = clamp(hold * 2.2, 2.2, 5.2);
    let end = start;
    for (const [ratio, amount, length] of [[1, 1, 1], [2.01, 0.31, 0.7], [2.76, 0.15, 0.5], [4.07, 0.08, 0.32], [5.4, 0.035, 0.2]]) {
      const partial = pluck(context, out, start, 0.014, decay * length, level * amount);
      tone(context, 'sine', hz * ratio, start, partial.end, partial.gain);
      end = Math.max(end, partial.end);
    }
    return end;
  },
  glass(context, out, hz, start, hold, level) {
    const decay = clamp(hold * 2, 2.4, 4.4);
    const body = pluck(context, out, start, 0.02, decay, level * 0.8);
    tone(context, 'sine', hz, start, body.end, body.gain);
    tone(context, 'sine', hz + 1.3, start, body.end, body.gain);
    const shimmer = pluck(context, out, start, 0.01, decay * 0.45, level * 0.22);
    tone(context, 'sine', hz * 3.01, start, shimmer.end, shimmer.gain);
    return body.end;
  },
  // Keep the note in tune. The rising droplet is a short accent under it.
  drop(context, out, hz, start, hold, level) {
    const body = pluck(context, out, start, 0.032, clamp(hold * 1.2, 0.45, 1.05), level);
    tone(context, 'sine', hz, start, body.end, body.gain);
    const bead = pluck(context, out, start, 0.006, 0.18, level * 0.22);
    const droplet = tone(context, 'sine', hz * 0.88, start, bead.end, bead.gain);
    droplet.frequency.setValueAtTime(hz * 0.88, start);
    droplet.frequency.exponentialRampToValueAtTime(hz, start + 0.05);
    const harmonic = pluck(context, out, start + 0.02, 0.02, 0.75, level * 0.22);
    tone(context, 'sine', hz * 2, start + 0.02, harmonic.end, harmonic.gain);
    return Math.max(body.end, harmonic.end);
  },
};

export const voiceFor = (scene, depth) => scene.voices[Math.min(depth, scene.voices.length - 1)];

function previewVoice(context, out, scene, note, start, hz) {
  const { wave, overtones } = scene.preview;
  const length = note.depth === 0 ? 3.3 : 2.55 - note.depth * 0.21;
  const level = note.depth < 2 ? 0.11 : 0.075 - note.depth * 0.005;
  const parts = [
    [1, wave, note.leaf ? 0.055 : 0.09, length, level * 1.18],
    [overtones[0], 'sine', 0.075, length * 0.58, level * 0.24],
    [overtones[1], 'sine', 0.05, length * 0.35, level * 0.08],
  ];
  for (const [ratio, type, attack, duration, amount] of parts) {
    const envelope = pluck(context, out, start, attack, duration - attack, amount);
    tone(context, type, hz * ratio, start, envelope.end, envelope.gain);
  }
  return start + length + 0.05;
}

export function playNote(context, engine, scene, note, start, options = {}) {
  const hold = Math.max(0.05, options.hold ?? note.end - note.start);
  const pan = context.createStereoPanner();
  pan.pan.value = note.pan ?? 0;
  pan.connect(!options.preview && !options.tap && note.depth >= 3 ? engine.sparkle : engine.music);
  const voice = voices[options.voice ?? voiceFor(scene, note.depth)];
  const level = levels[Math.min(note.depth, levels.length - 1)] * (note.velocity ?? 0.9) * (options.gain ?? 1);
  const hz = frequency(note.midi);
  const touch = options.tap ? swell(context, pan, start, 0.035, hold, 0.85, 1) : null;
  const end = options.preview
    ? previewVoice(context, pan, scene, note, start, hz)
    : voice(context, touch?.gain ?? pan, hz, start, hold, level, options.tap);
  if (!('startRendering' in context)) {
    const wait = ((touch?.end ?? end) - context.currentTime + 0.2) * 1000;
    setTimeout(() => pan.disconnect(), Math.max(0, wait));
  }
  return end;
}

// The nature bed is generated, not sampled, and loops on two buffers of
// different lengths so the combined texture rarely repeats.
const ambienceCache = new Map();

function loopBuffer(context, seconds, fill) {
  const rate = context.sampleRate;
  const overlap = Math.floor(rate * 0.25);
  const frames = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, frames, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = new Float32Array(frames + overlap);
    fill(data, rate, channel);
    for (let i = 0; i < overlap; i++) {
      const blend = i / overlap;
      data[i] = data[i] * blend + data[frames + i] * (1 - blend);
    }
    buffer.copyToChannel(data.subarray(0, frames), channel);
  }
  return buffer;
}

function addEvent(data, rate, at, seconds, render) {
  const begin = Math.floor(at * rate);
  const length = Math.floor(seconds * rate);
  for (let i = 0; i < length && begin + i < data.length; i++) data[begin + i] += render(i / rate, i / length);
}

const beds = {
  lagoon(context, random) {
    // Keep the lapping water behind the score and its pitched droplet notes.
    const waterGain = 0.08;
    const water = loopBuffer(context, 19, (data, rate, channel) => {
      let brown = 0;
      const phase = random() * 6.28;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        brown = brown * 0.996 + (random() * 2 - 1) * 0.06;
        const lap = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 0.13 + phase + channel) * Math.sin(t * 2 * Math.PI * 0.071 + phase * 2);
        data[i] = brown * lap * 0.5 * waterGain;
      }
      for (let n = 0; n < 9; n++) {
        const hz = 700 + random() * 900;
        addEvent(data, rate, random() * 19, 0.18, (t, p) => Math.sin(2 * Math.PI * hz * (1 + p * 0.5) * t) * (1 - p) ** 3 * 0.035 * waterGain);
      }
    });
    const crickets = loopBuffer(context, 23, (data, rate, channel) => {
      const hz = channel ? 4630 : 4410;
      for (let at = random() * 0.8; at < 23; at += 0.9 + random() * 1.4) {
        const pulses = 3 + Math.floor(random() * 2);
        const level = 0.012 + random() * 0.012;
        for (let p = 0; p < pulses; p++) {
          addEvent(data, rate, at + p * 0.034, 0.018, (t, x) => Math.sin(2 * Math.PI * hz * t) * Math.sin(Math.PI * x) * level);
        }
      }
    });
    return [water, crickets];
  },
  cedar(context, random) {
    // Keep Cedar's steady rain behind the notes even at full Nature level.
    const rain = loopBuffer(context, 17, (data, rate) => {
      let soft = 0;
      const smoothing = 1 - Math.exp(-2 * Math.PI * 1100 / rate);
      for (let i = 0; i < data.length; i++) {
        soft += smoothing * (random() * 2 - 1 - soft);
        data[i] = soft * 0.026 * (0.85 + 0.15 * Math.sin(i / rate * 0.4));
      }
    });
    const drips = loopBuffer(context, 23, (data, rate) => {
      for (let at = random(); at < 23; at += 0.5 + random() * 2.2) {
        const hz = 730 + random() * 1260;
        const level = 0.011 + random() * 0.015;
        addEvent(data, rate, at, 0.12, (t, p) =>
          Math.sin(2 * Math.PI * hz * (1 - p * 0.26) * t) * Math.min(1, t / 0.008) * (1 - p) ** 3 * level);
      }
    });
    return [rain, drips];
  },
  orchid(context, random, scene) {
    const wind = loopBuffer(context, 19, (data, rate, channel) => {
      let brown = 0;
      let low = 0;
      let band = 0;
      const phase = random() * 6.28 + channel;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        brown = brown * 0.995 + (random() * 2 - 1) * 0.07;
        const centre = 0.04 + 0.025 * Math.sin(t * 0.33 + phase);
        low += centre * (brown - low);
        band += centre * (low - band);
        const gust = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.21 + phase)) ** 2;
        data[i] = (brown * 0.32 + (low - band) * 3.2) * gust * 0.5;
      }
    });
    const chimes = loopBuffer(context, 23, data => {
      const rate = context.sampleRate;
      for (let at = 1 + random() * 2; at < 22; at += 4 + random() * 4) {
        const strikes = 2 + Math.floor(random() * 3);
        for (let s = 0; s < strikes; s++) {
          const degree = Math.floor(random() * scene.scale.length);
          const hz = frequency(scene.root + 24 + scene.scale[degree]);
          const level = 0.006 + random() * 0.008;
          addEvent(data, rate, at + s * (0.18 + random() * 0.4), 3, (t, p) =>
            (Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(2 * Math.PI * hz * 2.76 * t) * (1 - p) ** 3) * (1 - p) ** 2.4 * level);
        }
      }
    });
    return [wind, chimes];
  },
};

export function ambienceBuffers(context, sceneKey) {
  const key = sceneKey + ':' + context.sampleRate;
  if (!ambienceCache.has(key)) {
    const random = randomFrom(0x5eed ^ sceneKey.length * 977);
    ambienceCache.set(key, beds[sceneKey](context, random, scenes[sceneKey]));
  }
  // Buffers made for one context can be shared with another of the same rate.
  return ambienceCache.get(key);
}

export function startAmbience(context, engine, sceneKey, start, fade = 3) {
  const gains = [engine.ambience, engine.water].map(destination => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + fade);
    gain.connect(destination);
    return gain;
  });
  const sources = ambienceBuffers(context, sceneKey).map((buffer, index) => {
    const isWater = sceneKey === 'cedar' || (sceneKey === 'lagoon' && index === 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gains[isWater ? 1 : 0]);
    source.start(start);
    return source;
  });
  return {
    gains,
    stop(at, release = 3) {
      for (const gain of gains) {
        gain.gain.cancelScheduledValues(at);
        gain.gain.setValueAtTime(gain.gain.value, at);
        gain.gain.linearRampToValueAtTime(0, at + release);
      }
      for (const source of sources) source.stop(at + release + 0.05);
      setTimeout(() => gains.forEach(gain => gain.disconnect()), (release + 0.4) * 1000);
    },
  };
}

const tailSeconds = 6;

async function renderCycle(score, nature, water) {
  const total = score.cycle + tailSeconds;
  const offline = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const engine = createEngine(offline, offline.destination, score.seed);
  engine.ambience.gain.value = nature;
  engine.water.gain.value = water ? 1 : 0;
  if (nature > 0) {
    const scene = score.settings.scene;
    const bed = startAmbience(offline, engine, scene, 0, scene === 'cedar' ? 0.9 : 2.5);
    for (const gain of bed.gains) {
      gain.gain.setValueAtTime(1, score.cycle);
      gain.gain.linearRampToValueAtTime(0, total - 0.2);
    }
  }
  for (const note of score.events) playNote(offline, engine, score.scene, note, note.at + 0.05);
  engine.out.gain.setValueAtTime(1, total - 0.6);
  engine.out.gain.linearRampToValueAtTime(0, total - 0.02);
  const buffer = await offline.startRendering();
  let peak = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const gain = Math.min(0.84 / Math.max(peak, 0.001), 3);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
  return buffer;
}

function waveHeader(channels, rate, frames) {
  const frameSize = 2 * channels;
  const dataSize = frames * frameSize;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const text = (position, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * frameSize, true);
  view.setUint16(32, frameSize, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  return view;
}

function pcmSample(sample) {
  return Math.round(clamp(sample, -1, 1) * (sample < 0 ? 32768 : 32767));
}

export function encodeWave(buffer) {
  const channels = buffer.numberOfChannels;
  const view = waveHeader(channels, buffer.sampleRate, buffer.length);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      view.setInt16(44 + (i * channels + channel) * 2, pcmSample(samples[channel][i]), true);
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// Reuse a one-cycle render budget and write straight to the final PCM file.
// A short crossfade carries the outgoing reverb into the next cycle.
export async function renderWave(scores, { nature = 0, water = true, onCycle } = {}) {
  const duration = scores.reduce((sum, score) => sum + score.cycle, tailSeconds);
  if (scores.length === 1) {
    return { blob: encodeWave(await renderCycle(scores[0], nature, water)), duration };
  }
  const view = waveHeader(2, sampleRate, Math.round(duration * sampleRate));
  const overlap = Math.round(1.2 * sampleRate);
  let previous = null;
  let offset = 44;
  for (const [index, score] of scores.entries()) {
    onCycle?.(index + 1, scores.length);
    const buffer = await renderCycle(score, nature, water);
    const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const cycleFrames = Math.round(score.cycle * sampleRate);
    const count = index === scores.length - 1 ? buffer.length : cycleFrames;
    for (let i = 0; i < count; i++) {
      const blend = previous && i < overlap ? i / overlap : 1;
      for (let channel = 0; channel < 2; channel++) {
        const sample = blend === 1 ? channels[channel][i] : channels[channel][i] * blend + previous[channel][i] * (1 - blend);
        view.setInt16(offset, pcmSample(sample), true);
        offset += 2;
      }
    }
    previous = channels.map(channel => channel.slice(cycleFrames, cycleFrames + overlap));
  }
  return { blob: new Blob([view.buffer], { type: 'audio/wav' }), duration };
}
