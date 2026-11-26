// Stillwater's recursion. One call to grow() creates one branch of the tree,
// one span of time and one voice of the music. A branch hands the first part
// of its time to its left child and the rest to its right child, so at any
// moment the sounding notes are exactly the active call stack: trunk to leaf.

import { maxMelodyNotes, normalizeMelody } from './melody.mjs';

export const scenes = {
  lagoon: {
    name: 'Moonlit Lagoon', scaleName: 'D major pentatonic', ambience: 'Still water · crickets',
    root: 50, scale: [0, 2, 4, 7, 9], hue: 162, accent: '#a8f0cf',
    preview: { wave: 'sine', overtones: [2, 3] },
    voices: ['pad', 'strings', 'keys', 'kalimba', 'bell', 'glass', 'harp', 'drop'],
    defaults: { depth: 6, sway: 44, spread: 34, taper: 74, cycle: 48, seed: 'stillwater' },
  },
  cedar: {
    name: 'Cedar Rain', scaleName: 'C suspended pentatonic', ambience: 'Rain on cedar · far drips',
    root: 48, scale: [0, 2, 5, 7, 9], hue: 92, accent: '#d4e5a5',
    preview: { wave: 'triangle', overtones: [2.01, 4.07] },
    voices: ['pad', 'strings', 'marimba', 'kalimba', 'harp', 'bell', 'glass', 'drop'],
    defaults: { depth: 6, sway: 47, spread: 26, taper: 70, cycle: 56, seed: 'cedar rain' },
  },
  orchid: {
    name: 'Violet Hour', scaleName: 'F minor pentatonic', ambience: 'Dusk wind · chimes',
    root: 53, scale: [0, 3, 5, 7, 10], hue: 265, accent: '#dcc6ff',
    preview: { wave: 'sine', overtones: [2.76, 4.07] },
    voices: ['pad', 'strings', 'keys', 'harp', 'glass', 'bell', 'kalimba', 'drop'],
    defaults: { depth: 5, sway: 40, spread: 42, taper: 76, cycle: 40, seed: 'violet hour' },
  },
};

export const limits = {
  depth: [2, 7], sway: [34, 66], spread: [14, 56], taper: [56, 84], cycle: [24, 96],
};

// Registers keep each recursion level in its own octave band: the trunk is
// the bass drone and the leaves are the highest bells.
const register = [-12, -5, 2, 9, 14, 19, 24, 28];
// The shortest span a call may split. Below this the call returns as a leaf.
export const minimumSplit = 0.18;
const transpositions = [0, 5, 0, -5, 2, 7];

export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// A seed may be a number or any word, such as a name.
export function seedNumber(seed) {
  const text = String(seed ?? '').trim();
  if (/^\d{1,9}$/.test(text)) return Number(text);
  return hashText(text.toLowerCase());
}

const radians = Math.PI / 180;
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = midi => `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function scaleNote(scale, degree) {
  const octave = Math.floor(degree / scale.length);
  return 12 * octave + scale[degree - octave * scale.length];
}

export function pitch(scene, degree, depth, shift = 0) {
  const base = scene.root + scaleNote(scene.scale, degree) + shift;
  return inRegister(scene, base, depth);
}

function inRegister(scene, base, depth) {
  const target = scene.root + register[Math.min(depth, register.length - 1)];
  return base + 12 * Math.round((target - base) / 12);
}

function prepareMelody(settings, shift) {
  if (!settings.melody.length) return null;
  const pitches = settings.melody.map(([midi]) => midi).sort((a, b) => a - b);
  const center = Math.round((72 - pitches[Math.floor(pitches.length / 2)]) / 12);
  const lowestOctave = Math.ceil((32 - pitches[0] - shift) / 12);
  const highestOctave = Math.floor((104 - pitches.at(-1) - shift) / 12);
  const octave = 12 * clamp(center, lowestOctave, highestOctave);
  let duration = 0;
  const notes = settings.melody.map(([midi, length]) => ({ midi: midi + octave + shift, end: duration += length }));
  const repetitions = Math.max(1, Math.min(4,
    Math.floor(2 ** settings.depth / (notes.length * 2)),
    Math.floor(settings.cycle / Math.max(6, duration * 0.015))));
  const tonic = notes[0].midi;
  const steps = [...new Set(notes.map(note => (note.midi - tonic + 120) % 12))].sort((a, b) => a - b);
  const keyboardRoot = 60 + tonic % 12;
  const secondsPerUnit = settings.cycle / (duration * repetitions);
  const timeline = Array.from({ length: repetitions }, (_, repeat) => notes.map((note, i) => ({
    midi: note.midi,
    start: (repeat * duration + (notes[i - 1]?.end ?? 0)) * secondsPerUnit,
    end: (repeat * duration + note.end) * secondsPerUnit,
  }))).flat();
  timeline.at(-1).end = settings.cycle;
  return { notes, timeline, tonic, keys: steps.map(step => keyboardRoot + step) };
}

function harmonyPitch(melody, scene, branch) {
  if (branch.depth === 0) return inRegister(scene, melody.tonic, 0);
  const middle = (branch.start + branch.end) / 2;
  const note = melody.timeline.find(note => note.end > middle) ?? melody.notes.at(-1);
  const harmony = (branch.depth + branch.degree) % 3 === 0 ? 7 : 0;
  return inRegister(scene, note.midi + harmony, branch.depth);
}

function leadNote(branch, midi, start, end) {
  const { index, depth, pan, velocity } = branch;
  return { index, depth, pan, velocity, midi, start, end, at: start, melodyLead: true };
}

function scoreEvents(branches) {
  return branches.flatMap(branch => branch.notes ?? [branch]).sort((a, b) => a.at - b.at || a.depth - b.depth);
}

// Lines of grow() as shown in the debugger: 2 sound(call), 4 return,
// 5 grow(left(call)), 6 grow(right(call)). A frame with a running child is
// paused on the line that called it.
export function sourceLines(stack, sounding) {
  return stack.map((node, i) => {
    const child = stack[i + 1];
    if (child) return node.children[0] === child.index ? 5 : 6;
    return sounding || node.children.length ? 2 : 4;
  });
}

export function soundingNote(branch, time) {
  return branch.notes?.find(note => time < note.end) ?? branch.notes?.at(-1) ?? branch;
}

export function intervalFor(spread) {
  if (spread < 22) return { up: 1, down: 1, name: 'steps' };
  if (spread < 32) return { up: 2, down: 1, name: 'thirds' };
  if (spread < 44) return { up: 3, down: 2, name: 'open fourths' };
  return { up: 4, down: 3, name: 'wide leaps' };
}

export const transposition = generation => transpositions[Math.floor(generation / 3) % transpositions.length];

// Drift: each generation toggles one branch's interval direction.
export function mutations(seed, generation, depth) {
  const flips = new Set();
  for (let step = 1; step <= generation; step++) {
    const random = randomFrom(seed + step * 7919);
    const level = Math.floor(random() * Math.max(1, depth - 1));
    let path = '';
    for (let i = 0; i < level; i++) path += random() < 0.5 ? 'L' : 'R';
    if (flips.has(path)) flips.delete(path);
    else flips.add(path);
  }
  return flips;
}

export function normalize(settings) {
  const scene = Object.hasOwn(scenes, settings.scene) ? settings.scene : 'lagoon';
  const base = scenes[scene].defaults;
  const result = { scene };
  for (const key of Object.keys(limits)) {
    const value = Number(settings[key]);
    result[key] = Number.isFinite(value) ? clamp(Math.round(value), ...limits[key]) : base[key];
  }
  result.seed = String(settings.seed ?? base.seed).slice(0, 40) || base.seed;
  result.pruned = [...new Set((settings.pruned ?? []).filter(path => /^[LR]{1,7}$/.test(path)))].sort();
  result.melody = normalizeMelody(settings.melody);
  return result;
}

function generationNumber(value) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) ? clamp(generation, 0, 250_000) : 0;
}

export function compose(input) {
  const settings = normalize(input);
  const generation = generationNumber(input.generation);
  const scene = scenes[settings.scene];
  const seed = seedNumber(settings.seed);
  const flips = mutations(seed, generation, settings.depth);
  const pruned = new Set(settings.pruned);
  const shift = transposition(generation);
  const melody = prepareMelody(settings, shift);
  const sway = settings.sway / 100;
  const spread = settings.spread * radians;
  const interval = intervalFor(settings.spread);
  const branches = [];

  function grow({ depth, parent, path, start, end, x, y, heading, length, degree }) {
    const random = randomFrom(seed ^ hashText('branch:' + path));
    const index = branches.length;
    const endX = x + Math.sin(heading) * length;
    const endY = y - Math.cos(heading) * length;
    const curve = (random() - 0.5) * length * 0.4;
    const span = end - start;
    const cut = pruned.has(path);
    const terminal = depth >= settings.depth || span * Math.min(sway, 1 - sway) < minimumSplit;
    const base = terminal || cut;
    const branch = {
      index, parent, path, depth, start, end,
      at: depth > 2 ? Math.max(0, start + (random() - 0.5) * 0.03) : start,
      x, y, endX, endY,
      controlX: (x + endX) / 2 + Math.cos(heading) * curve,
      controlY: (y + endY) / 2 + Math.sin(heading) * curve,
      leaf: base, cut, degree,
      midi: pitch(scene, degree, depth, shift),
      pan: clamp(Math.tanh(endX * 0.8) * 0.78, -0.8, 0.8),
      velocity: 0.8 + random() * 0.2,
      children: [],
    };
    if (melody) {
      branch.melodyLead = terminal;
      branch.velocity *= terminal ? 1.4 : 0.72;
      if (terminal) {
        // A leaf can play several melody notes. The branch boundary splits
        // the phrase without dropping notes when the tree has few leaves.
        branch.notes = melody.timeline
          .filter(note => note.start < end && start < note.end)
          .map(note => leadNote(branch, note.midi, Math.max(start, note.start), Math.min(end, note.end)));
        branch.midi = branch.notes[0].midi;
      } else {
        branch.midi = harmonyPitch(melody, scene, branch);
      }
    }
    branches.push(branch);
    if (parent !== null) branches[parent].children.push(index);
    if (base) return;

    // The recursive case: split this call's time and grow two shorter calls.
    const flip = flips.has(path);
    const middle = start + span * sway;
    const opening = spread * (0.92 + random() * 0.21) * (flip ? 0.74 : 1);
    const lean = flip ? (random() - 0.5) * 0.46 : 0;
    const nudge = random() < 0.16 ? (random() < 0.5 ? -1 : 1) : 0;
    for (const side of [-1, 1]) {
      const left = side < 0;
      // A drifted call reshapes its intervals. A plain left/right swap of a
      // pentatonic step pair can land on the same pitches an octave apart.
      const rise = flip ? interval.down + (interval.up === interval.down ? 1 : 0) : interval.up;
      const fall = flip ? interval.up : interval.down;
      const step = left ? rise : -fall;
      grow({
        depth: depth + 1, parent: index, path: path + (left ? 'L' : 'R'),
        start: left ? start : middle, end: left ? middle : end,
        x: endX, y: endY,
        heading: clamp(heading * 0.66 + side * opening + lean, -1.47, 1.47),
        length: length * (settings.taper / 100) * Math.sqrt(2 * (left ? sway : 1 - sway)) * (0.92 + random() * 0.15),
        degree: degree + step + (left ? nudge : 0),
      });
    }
  }

  grow({ depth: 0, parent: null, path: '', start: 0, end: settings.cycle, x: 0, y: 0, heading: -0.05, length: 1, degree: 0 });
  const events = scoreEvents(branches);
  return { settings, scene, seed, generation, shift, interval, melody, branches, events, cycle: settings.cycle, focus: null };
}

// Every branch is a complete composition of its own. Listening inside a
// branch stretches its span to a full cycle and re-voices its levels.
export function focusOn(score, index) {
  const root = score.branches[index];
  if (!root || index === 0) return score;
  const stretch = score.cycle / (root.end - root.start);
  const branches = [];
  (function visit(source, parent) {
    const original = score.branches[source];
    const depth = original.depth - root.depth;
    const branch = {
      ...original, index: branches.length, parent, depth, children: [],
      start: (original.start - root.start) * stretch,
      end: (original.end - root.start) * stretch,
      at: depth === 0 ? 0 : Math.max(0, (original.at - root.start) * stretch),
      midi: score.melody
        ? (original.melodyLead ? original.midi : inRegister(score.scene, original.midi, depth))
        : pitch(score.scene, original.degree, depth, score.shift),
    };
    if (original.notes) {
      branch.notes = original.notes.map(note => leadNote(branch, note.midi,
        (note.start - root.start) * stretch, (note.end - root.start) * stretch));
    }
    branches.push(branch);
    if (parent !== null) branches[parent].children.push(branch.index);
    for (const child of original.children) visit(child, branch.index);
  })(index, null);
  const events = scoreEvents(branches);
  return { ...score, branches, events, focus: root.path };
}

// The active call stack at a moment in the cycle.
export function stackAt(score, time) {
  const stack = [];
  let branch = score.branches[0];
  while (branch) {
    stack.push(branch);
    if (!branch.children.length) break;
    const children = branch.children.map(index => score.branches[index]);
    branch = children.find(child => time < child.end) ?? children.at(-1);
  }
  return stack;
}

export function branchPath(branches, index) {
  const path = [];
  for (let branch = branches[index]; branch; branch = branches[branch.parent]) path.push(branch);
  return path.reverse();
}

export function subtree(branches, index) {
  const found = [];
  const visit = i => {
    found.push(i);
    for (const child of branches[i]?.children ?? []) visit(child);
  };
  if (branches[index]) visit(index);
  return found;
}

export function describe(branch) {
  return branch.path ? 'grow(' + [...branch.path].join('') + ')' : 'grow(trunk)';
}

export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const hashKeys = { scene: 'scene', depth: 'depth', sway: 'sway', spread: 'spread', taper: 'length', cycle: 'cycle', seed: 'seed' };
const mixFields = ['nature', 'volume'];

export function toHash(settings, focus, generation = 0, mix = {}) {
  const params = new URLSearchParams();
  for (const [key, name] of Object.entries(hashKeys)) params.set(name, settings[key]);
  if (settings.pruned.length) params.set('cut', settings.pruned.join('.'));
  if (settings.melody?.length) params.set('melody', settings.melody.map(note => note.join(':')).join('.'));
  if (focus) params.set('inside', focus);
  if (generation) params.set('generation', generationNumber(generation));
  for (const key of mixFields) {
    if (Number.isInteger(mix[key]) && mix[key] >= 0 && mix[key] <= 100) params.set(key, mix[key]);
  }
  if (typeof mix.water === 'boolean') params.set('water', mix.water ? '1' : '0');
  return '#' + params.toString();
}

export function fromHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  if (!params.has('scene')) return null;
  const raw = { pruned: (params.get('cut') ?? '').split('.').filter(Boolean) };
  for (const [key, name] of Object.entries(hashKeys)) if (params.has(name)) raw[key] = params.get(name);
  const phrase = params.get('melody');
  if (phrase && phrase.length <= maxMelodyNotes * 8 && /^\d{2}:\d{1,4}(\.\d{2}:\d{1,4})*$/.test(phrase)) {
    raw.melody = phrase.split('.').map(note => note.split(':').map(Number));
  }
  const scene = Object.hasOwn(scenes, raw.scene) ? raw.scene : 'lagoon';
  const settings = normalize({ ...scenes[scene].defaults, ...raw, scene });
  const inside = params.get('inside');
  const mix = {};
  for (const key of mixFields) {
    const value = params.get(key);
    if (/^\d{1,3}$/.test(value ?? '') && Number(value) <= 100) mix[key] = Number(value);
  }
  const water = params.get('water');
  if (water === '0' || water === '1') mix.water = water === '1';
  return { settings, mix, focus: inside && /^[LR]{1,7}$/.test(inside) ? inside : null, generation: generationNumber(params.get('generation')) };
}
