export const scenes = {
  lagoon: {
    name: 'Moonlit Lagoon', scaleName: 'D major pentatonic',
    depth: 5, angle: 34, taper: 75, tempo: 72, seed: 173,
    root: 50, scale: [0, 2, 4, 7, 9], wave: 'sine',
    hue: 162, accent: '#a8f0cf', overtones: [1, 2, 3],
  },
  cedar: {
    name: 'Cedar Rain', scaleName: 'C suspended pentatonic',
    depth: 5, angle: 24, taper: 70, tempo: 80, seed: 617,
    root: 48, scale: [0, 2, 5, 7, 9], wave: 'triangle',
    hue: 92, accent: '#d4e5a5', overtones: [1, 2.01, 4.07],
  },
  orchid: {
    name: 'Violet Hour', scaleName: 'F minor pentatonic',
    depth: 4, angle: 41, taper: 73, tempo: 64, seed: 312,
    root: 53, scale: [0, 3, 5, 7, 10], wave: 'sine',
    hue: 265, accent: '#dcc6ff', overtones: [1, 2.76, 4.07],
  },
};

export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const radians = Math.PI / 180;
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = midi => `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

function scaleNote(scale, degree) {
  const octave = Math.floor(degree / scale.length);
  return 12 * octave + scale[degree - octave * scale.length];
}

export function compose(settings) {
  const scene = scenes[settings.scene];
  const random = randomFrom(settings.seed);
  const beat = 60 / settings.tempo;
  const branches = [];
  let time = 0.45;

  // Visit each parent before its children. The branch geometry and each note
  // come from this same call, and reaching the requested depth ends the phrase.
  function grow({ depth, parent, path, x, y, heading, length, degree }) {
    const index = branches.length;
    const endX = x + Math.sin(heading) * length;
    const endY = y - Math.cos(heading) * length;
    const curve = (random() - 0.5) * length * 0.4;
    const leaf = depth === settings.depth;
    const branch = {
      index, parent, path, depth, x, y, endX, endY, leaf,
      controlX: (x + endX) / 2 + Math.cos(heading) * curve,
      controlY: (y + endY) / 2 + Math.sin(heading) * curve,
      midi: scene.root + scaleNote(scene.scale, degree + (depth > 0 ? 3 : 0)),
      pan: Math.tanh(endX * 0.8) * 0.72,
      time,
      decay: depth === 0 ? 3.3 : 2.55 - depth * 0.21,
    };
    branches.push(branch);
    time += beat * ((leaf ? 0.43 : 0.67) + (random() - 0.5) * 0.08);
    if (leaf) return;

    const spread = settings.angle * radians * (0.92 + random() * 0.21);
    for (const side of [-1, 1]) {
      const nextHeading = Math.max(-1.47, Math.min(1.47, heading * 0.66 + side * spread));
      grow({
        depth: depth + 1, parent: index, path: path + (side < 0 ? 'L' : 'R'),
        x: endX, y: endY, heading: nextHeading,
        length: length * (settings.taper / 100) * (0.92 + random() * 0.15),
        degree: degree + (side < 0 ? 1 : 2) + (random() > 0.84 ? 1 : 0) - (degree > 7 ? 5 : 0),
      });
    }
  }

  grow({ depth: 0, parent: null, path: '', x: 0, y: 0, heading: -0.05, length: 1, degree: 0 });
  const last = branches.at(-1);
  return { settings, scene, branches, events: branches, duration: last.time + last.decay + 2.35 };
}

export const takeLimits = { seconds: 24, notes: 96 };

export function branchPath(branches, index) {
  const path = [];
  for (let branch = branches[index]; branch; branch = branches[branch.parent]) path.push(branch);
  return path.reverse();
}

export function composeTake(score, notes) {
  if (!notes.length) return null;
  const first = notes[0].time;
  const events = notes.map(note => ({ ...score.branches[note.index], time: 0.24 + note.time - first }));
  const duration = Math.max(...events.map(event => event.time + event.decay)) + 2.2;
  return { ...score, events, duration, take: true };
}

export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
