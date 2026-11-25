import { frequency, randomFrom } from './score.mjs';

export const sampleRate = 44100;

function voice(context, destination, hz, wave, start, attack, duration, level) {
  const tone = context.createOscillator();
  const envelope = context.createGain();
  tone.type = wave;
  tone.frequency.value = hz;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(level, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  tone.connect(envelope).connect(destination);
  tone.start(start);
  tone.stop(start + duration + 0.01);
}

export function playBranch(context, destination, branch, scene, start) {
  const pan = context.createStereoPanner();
  pan.pan.value = branch.pan;
  pan.connect(destination);
  const hz = frequency(branch.midi);
  const level = branch.depth < 2 ? 0.11 : 0.075 - 0.005 * branch.depth;
  const attack = branch.leaf ? 0.055 : 0.09;
  voice(context, pan, hz, scene.wave, start, attack, branch.decay, level);
  voice(context, pan, hz * scene.overtones[1], 'sine', start, 0.075, branch.decay * 0.58, level * 0.24);
  voice(context, pan, hz * scene.overtones[2], 'sine', start, 0.05, branch.decay * 0.35, level * 0.08);
  if (!('startRendering' in context)) {
    // Live preview nodes can be released as soon as their longest voice ends.
    const duration = (start - context.currentTime + branch.decay + 0.1) * 1000;
    setTimeout(() => pan.disconnect(), duration);
  }
}

function makeSpace(context, mix, seed) {
  const random = randomFrom(seed ^ 0x633d);
  const size = Math.floor(context.sampleRate * 2.15);
  const impulse = context.createBuffer(2, size, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let filtered = 0;
    const delay = Math.floor(context.sampleRate * (channel ? 0.022 : 0.017));
    for (let i = delay; i < size; i++) {
      filtered = filtered * 0.63 + (random() * 2 - 1) * 0.37;
      data[i] = filtered * (1 - i / size) ** 3.3;
    }
  }
  const reverb = context.createConvolver();
  const wet = context.createGain();
  reverb.buffer = impulse;
  wet.gain.value = 0.27;
  reverb.connect(wet).connect(mix);
  return reverb;
}

export function instrumentBus(context, destination, seed) {
  const input = context.createGain();
  const output = context.createGain();
  const reverb = makeSpace(context, output, seed);
  input.connect(output);
  input.connect(reverb);
  output.connect(destination);
  return { input, release: () => {
    input.disconnect();
    reverb.disconnect();
    output.disconnect();
  } };
}

function roomTone(context, mix, score) {
  const random = randomFrom(score.settings.seed ^ 0x71d2);
  const frames = Math.floor(context.sampleRate * score.duration);
  const sample = context.createBuffer(2, frames, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = sample.getChannelData(channel);
    let color = 0;
    for (let i = 0; i < frames; i++) {
      color = 0.94 * color + 0.06 * (random() * 2 - 1);
      data[i] = color;
    }
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  noise.buffer = sample;
  filter.type = 'bandpass';
  filter.frequency.value = score.settings.scene === 'cedar' ? 1090 : 380;
  filter.Q.value = 0.42;
  envelope.gain.setValueAtTime(0, 0);
  const waves = new Float32Array(128);
  for (let i = 0; i < waves.length; i++) {
    const portion = i / (waves.length - 1);
    waves[i] = Math.min(portion * 7, (1 - portion) * 5, 1) * (0.035 + 0.011 * Math.sin(i / 6));
  }
  envelope.gain.setValueCurveAtTime(waves, 0, score.duration);
  noise.connect(filter).connect(envelope).connect(mix);
  noise.start();
}

export async function renderScore(score) {
  const offline = new OfflineAudioContext(2, Math.ceil(score.duration * sampleRate), sampleRate);
  const mix = offline.createGain();
  const notes = offline.createGain();
  const reverb = makeSpace(offline, mix, score.settings.seed);
  notes.connect(mix);
  notes.connect(reverb);
  mix.gain.value = 0.95;
  mix.connect(offline.destination);
  roomTone(offline, mix, score);

  const sections = score.take
    ? score.events.filter((_, index) => index === 0 || index === Math.floor(score.events.length / 2))
    : score.branches.filter(branch => branch.depth === 1);
  const root = score.scene.root;
  voice(offline, notes, frequency(root - 12), 'sine', 0.04, 1.9, score.duration - 0.1, 0.043);
  for (const [index, branch] of sections.entries()) {
    const end = sections[index + 1]?.time ?? score.events.at(-1).time + 1.9;
    const release = Math.min(end - branch.time + 2.1, score.duration - branch.time - 0.1);
    voice(offline, notes, frequency(branch.midi - 12), 'sine', branch.time, 1.25, release, 0.028);
    voice(offline, notes, frequency(root + 7), 'sine', branch.time, 1.8, release, 0.015);
  }
  for (const branch of score.events) playBranch(offline, notes, branch, score.scene, branch.time);
  const buffer = await offline.startRendering();
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
  }
  const gain = Math.min(0.79 / Math.max(peak, 0.001), 2.4);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
  return buffer;
}

export function encodeWave(buffer) {
  const channels = buffer.numberOfChannels;
  const frameSize = 2 * channels;
  const dataSize = buffer.length * frameSize;
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
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * frameSize, true);
  view.setUint16(32, frameSize, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, samples[channel][i]));
      view.setInt16(44 + i * frameSize + channel * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
