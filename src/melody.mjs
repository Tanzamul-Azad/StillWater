export const melodyRate = 12000;
export const maxMelodySeconds = 12;
export const maxMelodyNotes = 32;
const minPitch = 36;
const maxPitch = 88;

export function normalizeMelody(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, maxMelodyNotes)
    .filter(pair => Array.isArray(pair) && pair.length === 2 &&
      Number.isInteger(pair[0]) && pair[0] >= minPitch && pair[0] <= maxPitch &&
      Number.isInteger(pair[1]) && pair[1] >= 1 && pair[1] <= maxMelodySeconds * 100)
    .map(([midi, length]) => [midi, length]);
}

// YIN-style pitch tracking on 10 ms hops. Only keep stable, pitched runs;
// quiet frames and percussive or noisy transients do not become notes.
export function detectMelody(samples) {
  const length = Math.min(samples.length, melodyRate * maxMelodySeconds);
  const hop = 120;
  const width = 360;
  const deepestLag = 200;
  const difference = new Float32Array(deepestLag + 1);
  const frames = [];
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const energyFloor = Math.max(0.00045, peak * 0.025) ** 2 * width;

  for (let offset = 0; offset + width + deepestLag <= length; offset += hop) {
    let energy = 0;
    let mean = 0;
    for (let i = offset; i < offset + width; i++) {
      mean += samples[i];
      energy += samples[i] * samples[i];
    }
    let pitch = null;
    if (energy - mean * mean / width >= energyFloor) {
      let total = 0;
      difference[0] = 1;
      for (let lag = 1; lag <= deepestLag; lag++) {
        let sum = 0;
        for (let i = offset; i < offset + width; i++) {
          const delta = samples[i] - samples[i + lag];
          sum += delta * delta;
        }
        total += sum;
        difference[lag] = total ? sum * lag / total : 1;
      }
      for (let lag = 9; lag < deepestLag; lag++) {
        const quality = difference[lag];
        if (quality >= 0.17 || quality > difference[lag - 1] || quality >= difference[lag + 1]) continue;
        const curvature = difference[lag - 1] - 2 * quality + difference[lag + 1];
        const fine = (difference[lag - 1] - difference[lag + 1]) / (2 * curvature);
        const midi = Math.round(69 + 12 * Math.log2(melodyRate / (lag + fine) / 440));
        if (midi >= minPitch && midi <= maxPitch) pitch = midi;
        break;
      }
    }
    frames.push(pitch);
  }

  const stable = frames.map((pitch, i) =>
    i > 0 && i + 1 < frames.length && frames[i - 1] === frames[i + 1] ? frames[i - 1] : pitch);
  const runs = [];
  for (let start = 0; start < stable.length;) {
    const midi = stable[start];
    let end = start + 1;
    while (end < stable.length && stable[end] === midi) end++;
    if (midi !== null && end - start >= 9) {
      const previous = runs.at(-1);
      if (previous?.midi === midi && start - previous.end <= 5) previous.end = end;
      else runs.push({ midi, start, end });
    }
    start = end;
  }
  return runs.slice(0, maxMelodyNotes).map(({ midi, start, end }, i) => {
    const gap = runs[i + 1] ? runs[i + 1].start - end : 0;
    return [midi, end - start + Math.min(24, gap)];
  });
}

export async function readMelodyFile(file) {
  const decoder = new OfflineAudioContext(1, 1, melodyRate);
  const audio = await decoder.decodeAudioData(await file.arrayBuffer());
  const length = Math.min(audio.length, melodyRate * maxMelodySeconds);
  // Take the stronger channel so stereo phase cancellation cannot hide a note.
  let strongest = audio.getChannelData(0).subarray(0, length);
  let maxEnergy = -1;
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel).subarray(0, length);
    let energy = 0;
    for (let i = 0; i < samples.length; i += 4) energy += samples[i] * samples[i];
    if (energy > maxEnergy) {
      maxEnergy = energy;
      strongest = samples;
    }
  }
  return { notes: detectMelody(strongest), trimmed: audio.length > length };
}

export function melodyExample() {
  // An original seven-note phrase. Send actual samples through the same
  // detector as a user's file so the example exercises the whole feature.
  const phrase = [[62, 0.58], [66, 0.46], [64, 0.5], [69, 0.75], [66, 0.44], [64, 0.52], [62, 0.82]];
  const samples = new Float32Array(melodyRate * 5);
  let start = Math.round(melodyRate * 0.1);
  for (const [midi, duration] of phrase) {
    const length = Math.round(melodyRate * duration);
    const omega = 2 * Math.PI * 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < length; i++) {
      const seconds = i / melodyRate;
      const envelope = Math.min(1, seconds / 0.045, (duration - seconds) / 0.075);
      const phase = omega * seconds + 0.16 * Math.sin(2 * Math.PI * 4.2 * seconds);
      samples[start + i] = envelope * (0.34 * Math.sin(phase) + 0.13 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase));
    }
    start += length + Math.round(melodyRate * 0.07);
  }
  return samples;
}
