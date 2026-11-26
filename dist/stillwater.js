(() => {
  // src/melody.mjs
  var melodyRate = 12e3;
  var maxMelodySeconds = 12;
  var maxMelodyNotes = 32;
  var minPitch = 36;
  var maxPitch = 88;
  function normalizeMelody(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, maxMelodyNotes).filter((pair) => Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && pair[0] >= minPitch && pair[0] <= maxPitch && Number.isInteger(pair[1]) && pair[1] >= 1 && pair[1] <= maxMelodySeconds * 100).map(([midi, length]) => [midi, length]);
  }
  function detectMelody(samples) {
    const length = Math.min(samples.length, melodyRate * maxMelodySeconds);
    const hop = 120;
    const width = 360;
    const deepestLag = 200;
    const difference = new Float32Array(deepestLag + 1);
    const frames = [];
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const energyFloor = Math.max(45e-5, peak * 0.025) ** 2 * width;
    for (let offset = 0; offset + width + deepestLag <= length; offset += hop) {
      let energy = 0;
      let mean = 0;
      for (let i = offset; i < offset + width; i++) {
        mean += samples[i];
        energy += samples[i] * samples[i];
      }
      let pitch2 = null;
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
          if (midi >= minPitch && midi <= maxPitch) pitch2 = midi;
          break;
        }
      }
      frames.push(pitch2);
    }
    const stable = frames.map((pitch2, i) => i > 0 && i + 1 < frames.length && frames[i - 1] === frames[i + 1] ? frames[i - 1] : pitch2);
    const runs = [];
    for (let start2 = 0; start2 < stable.length; ) {
      const midi = stable[start2];
      let end = start2 + 1;
      while (end < stable.length && stable[end] === midi) end++;
      if (midi !== null && end - start2 >= 9) {
        const previous = runs.at(-1);
        if (previous?.midi === midi && start2 - previous.end <= 5) previous.end = end;
        else runs.push({ midi, start: start2, end });
      }
      start2 = end;
    }
    return runs.slice(0, maxMelodyNotes).map(({ midi, start: start2, end }, i) => {
      const gap = runs[i + 1] ? runs[i + 1].start - end : 0;
      return [midi, end - start2 + Math.min(24, gap)];
    });
  }
  async function readMelodyFile(file) {
    const decoder = new OfflineAudioContext(1, 1, melodyRate);
    const audio = await decoder.decodeAudioData(await file.arrayBuffer());
    const length = Math.min(audio.length, melodyRate * maxMelodySeconds);
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
  function melodyExample() {
    const phrase = [[62, 0.58], [66, 0.46], [64, 0.5], [69, 0.75], [66, 0.44], [64, 0.52], [62, 0.82]];
    const samples = new Float32Array(melodyRate * 5);
    let start2 = Math.round(melodyRate * 0.1);
    for (const [midi, duration] of phrase) {
      const length = Math.round(melodyRate * duration);
      const omega = 2 * Math.PI * 440 * 2 ** ((midi - 69) / 12);
      for (let i = 0; i < length; i++) {
        const seconds2 = i / melodyRate;
        const envelope = Math.min(1, seconds2 / 0.045, (duration - seconds2) / 0.075);
        const phase = omega * seconds2 + 0.16 * Math.sin(2 * Math.PI * 4.2 * seconds2);
        samples[start2 + i] = envelope * (0.34 * Math.sin(phase) + 0.13 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase));
      }
      start2 += length + Math.round(melodyRate * 0.07);
    }
    return samples;
  }

  // src/score.mjs
  var scenes = {
    lagoon: {
      name: "Moonlit Lagoon",
      scaleName: "D major pentatonic",
      ambience: "Still water · crickets",
      root: 50,
      scale: [0, 2, 4, 7, 9],
      hue: 162,
      accent: "#a8f0cf",
      preview: { wave: "sine", overtones: [2, 3] },
      voices: ["pad", "strings", "keys", "kalimba", "bell", "glass", "harp", "drop"],
      defaults: { depth: 6, sway: 44, spread: 34, taper: 74, cycle: 48, seed: "stillwater" }
    },
    cedar: {
      name: "Cedar Rain",
      scaleName: "C suspended pentatonic",
      ambience: "Rain on cedar · far drips",
      root: 48,
      scale: [0, 2, 5, 7, 9],
      hue: 92,
      accent: "#d4e5a5",
      preview: { wave: "triangle", overtones: [2.01, 4.07] },
      voices: ["pad", "strings", "marimba", "kalimba", "harp", "bell", "glass", "drop"],
      defaults: { depth: 6, sway: 47, spread: 26, taper: 70, cycle: 56, seed: "cedar rain" }
    },
    orchid: {
      name: "Violet Hour",
      scaleName: "F minor pentatonic",
      ambience: "Dusk wind · chimes",
      root: 53,
      scale: [0, 3, 5, 7, 10],
      hue: 265,
      accent: "#dcc6ff",
      preview: { wave: "sine", overtones: [2.76, 4.07] },
      voices: ["pad", "strings", "keys", "harp", "glass", "bell", "kalimba", "drop"],
      defaults: { depth: 5, sway: 40, spread: 42, taper: 76, cycle: 40, seed: "violet hour" }
    }
  };
  var rules = ["binary", "fibonacci", "ternary"];
  var limits = {
    depth: [2, 7],
    sway: [34, 66],
    spread: [14, 56],
    taper: [56, 84],
    cycle: [24, 96]
  };
  var register = [-12, -5, 2, 9, 14, 19, 24, 28];
  var minimumSplit = 0.18;
  var transpositions = [0, 5, 0, -5, 2, 7];
  function randomFrom(seed) {
    let state = seed >>> 0;
    return () => {
      state = state + 1831565813 | 0;
      let value = Math.imul(state ^ state >>> 15, 1 | state);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashText(text2) {
    let hash = 2166136261;
    for (const char of String(text2)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function seedNumber(seed) {
    const text2 = String(seed ?? "").trim();
    if (/^\d{1,9}$/.test(text2)) return Number(text2);
    return hashText(text2.toLowerCase());
  }
  var radians = Math.PI / 180;
  var names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  var noteName = (midi) => `${names[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  var frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
  var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function scaleNote(scale, degree) {
    const octave = Math.floor(degree / scale.length);
    return 12 * octave + scale[degree - octave * scale.length];
  }
  function pitch(scene, degree, depth, shift = 0) {
    const base = scene.root + scaleNote(scene.scale, degree) + shift;
    return inRegister(scene, base, depth);
  }
  function inRegister(scene, base, depth) {
    const target = scene.root + register[Math.min(depth, register.length - 1)];
    return base + 12 * Math.round((target - base) / 12);
  }
  function prepareMelody(settings2, shift) {
    if (!settings2.melody.length) return null;
    const pitches = settings2.melody.map(([midi]) => midi).sort((a, b) => a - b);
    const center = Math.round((72 - pitches[Math.floor(pitches.length / 2)]) / 12);
    const lowestOctave = Math.ceil((32 - pitches[0] - shift) / 12);
    const highestOctave = Math.floor((104 - pitches.at(-1) - shift) / 12);
    const octave = 12 * clamp(center, lowestOctave, highestOctave);
    let duration = 0;
    const notes = settings2.melody.map(([midi, length]) => ({ midi: midi + octave + shift, end: duration += length }));
    const repetitions = Math.max(1, Math.min(
      4,
      Math.floor(2 ** settings2.depth / (notes.length * 2)),
      Math.floor(settings2.cycle / Math.max(6, duration * 0.015))
    ));
    const tonic = notes[0].midi;
    const steps = [...new Set(notes.map((note) => (note.midi - tonic + 120) % 12))].sort((a, b) => a - b);
    const keyboardRoot = 60 + tonic % 12;
    const secondsPerUnit = settings2.cycle / (duration * repetitions);
    const timeline = Array.from({ length: repetitions }, (_, repeat) => notes.map((note, i) => ({
      midi: note.midi,
      start: (repeat * duration + (notes[i - 1]?.end ?? 0)) * secondsPerUnit,
      end: (repeat * duration + note.end) * secondsPerUnit
    }))).flat();
    timeline.at(-1).end = settings2.cycle;
    return { notes, timeline, tonic, keys: steps.map((step) => keyboardRoot + step) };
  }
  function harmonyPitch(melody, scene, branch) {
    if (branch.depth === 0) return inRegister(scene, melody.tonic, 0);
    const middle = (branch.start + branch.end) / 2;
    const note = melody.timeline.find((note2) => note2.end > middle) ?? melody.notes.at(-1);
    const harmony = (branch.depth + branch.degree) % 3 === 0 ? 7 : 0;
    return inRegister(scene, note.midi + harmony, branch.depth);
  }
  function leadNote(branch, midi, start2, end) {
    const { index, depth, pan, velocity } = branch;
    return { index, depth, pan, velocity, midi, start: start2, end, at: start2, melodyLead: true };
  }
  function scoreEvents(branches) {
    return branches.flatMap((branch) => branch.notes ?? [branch]).sort((a, b) => a.at - b.at || a.depth - b.depth);
  }
  function sourceLines(stack, sounding) {
    return stack.map((node, i) => {
      const child = stack[i + 1];
      if (child) {
        if (node.children.length === 3) {
          return node.children[0] === child.index ? 5 : node.children[1] === child.index ? 6 : 7;
        }
        return node.children[0] === child.index ? 5 : 6;
      }
      return sounding || node.children.length ? 2 : 4;
    });
  }
  function soundingNote(branch, time) {
    return branch.notes?.find((note) => time < note.end) ?? branch.notes?.at(-1) ?? branch;
  }
  function intervalFor(spread) {
    if (spread < 22) return { up: 1, down: 1, name: "steps" };
    if (spread < 32) return { up: 2, down: 1, name: "thirds" };
    if (spread < 44) return { up: 3, down: 2, name: "open fourths" };
    return { up: 4, down: 3, name: "wide leaps" };
  }
  var transposition = (generation) => transpositions[Math.floor(generation / 3) % transpositions.length];
  function mutations(seed, generation, depth) {
    const flips = /* @__PURE__ */ new Set();
    for (let step = 1; step <= generation; step++) {
      const random = randomFrom(seed + step * 7919);
      const level2 = Math.floor(random() * Math.max(1, depth - 1));
      let path = "";
      for (let i = 0; i < level2; i++) path += random() < 0.5 ? "L" : "R";
      if (flips.has(path)) flips.delete(path);
      else flips.add(path);
    }
    return flips;
  }
  function normalize(settings2) {
    const scene = Object.hasOwn(scenes, settings2.scene) ? settings2.scene : "lagoon";
    const base = scenes[scene].defaults;
    const result = { scene, rule: rules.includes(settings2.rule) ? settings2.rule : "binary" };
    for (const key of Object.keys(limits)) {
      const value = Number(settings2[key]);
      result[key] = Number.isFinite(value) ? clamp(Math.round(value), ...limits[key]) : base[key];
    }
    result.seed = String(settings2.seed ?? base.seed).slice(0, 40) || base.seed;
    result.pruned = [...new Set((settings2.pruned ?? []).filter((path) => /^[LRM]{1,7}$/.test(path)))].sort();
    result.melody = normalizeMelody(settings2.melody);
    return result;
  }
  function generationNumber(value) {
    const generation = Number(value);
    return Number.isSafeInteger(generation) ? clamp(generation, 0, 25e4) : 0;
  }
  function compose(input) {
    const settings2 = normalize(input);
    const generation = generationNumber(input.generation);
    const scene = scenes[settings2.scene];
    const rule = settings2.rule;
    const seed = seedNumber(settings2.seed);
    const flips = mutations(seed, generation, settings2.depth);
    const pruned = new Set(settings2.pruned);
    const shift = transposition(generation);
    const melody = prepareMelody(settings2, shift);
    const sway = settings2.sway / 100;
    const minShare = rule === "ternary" ? Math.min(sway * 0.68, 0.32, 1 - sway * 0.68 - 0.32) : Math.min(sway, 1 - sway);
    const spread = settings2.spread * radians;
    const interval = intervalFor(settings2.spread);
    const branches = [];
    function grow({ depth, remaining, parent, path, start: start2, end, x, y, heading, length, degree }) {
      const random = randomFrom(seed ^ hashText("branch:" + path));
      const index = branches.length;
      const endX = x + Math.sin(heading) * length;
      const endY = y - Math.cos(heading) * length;
      const curve = (random() - 0.5) * length * 0.4;
      const span = end - start2;
      const cut = pruned.has(path);
      const terminal = remaining <= 0 || span * minShare < minimumSplit;
      const base = terminal || cut;
      const roll = depth === 0 ? 0 : Math.min(0.042, depth * 6e-3 + (depth > 1 ? random() * 4e-3 : 0));
      const branch = {
        index,
        parent,
        path,
        depth,
        start: start2,
        end,
        at: Math.min(Math.max(start2, end - 0.02), start2 + roll),
        x,
        y,
        endX,
        endY,
        controlX: (x + endX) / 2 + Math.cos(heading) * curve,
        controlY: (y + endY) / 2 + Math.sin(heading) * curve,
        leaf: base,
        cut,
        degree,
        midi: pitch(scene, degree, depth, shift),
        pan: clamp(Math.tanh(endX * 0.8) * 0.78, -0.8, 0.8),
        velocity: 0.8 + random() * 0.2,
        children: []
      };
      if (melody) {
        branch.melodyLead = terminal;
        branch.velocity *= terminal ? 1.4 : 0.72;
        if (terminal) {
          branch.notes = melody.timeline.filter((note) => note.start < end && start2 < note.end).map((note) => leadNote(branch, note.midi, Math.max(start2, note.start), Math.min(end, note.end)));
          branch.midi = branch.notes[0].midi;
        } else {
          branch.midi = harmonyPitch(melody, scene, branch);
        }
      }
      branches.push(branch);
      if (parent !== null) branches[parent].children.push(index);
      if (base) return;
      const flip = flips.has(path);
      const opening = spread * (0.92 + random() * 0.21) * (flip ? 0.74 : 1);
      const lean = flip ? (random() - 0.5) * 0.46 : 0;
      const nudge = random() < 0.16 ? random() < 0.5 ? -1 : 1 : 0;
      const rise = flip ? interval.down + (interval.up === interval.down ? 1 : 0) : interval.up;
      const fall = flip ? interval.up : interval.down;
      if (rule === "ternary") {
        const wL = sway * 0.68;
        const wM = 0.32;
        const t1 = start2 + span * wL;
        const t2 = t1 + span * wM;
        const midStep = flip ? -1 : interval.up > 1 ? 1 : 2;
        const specs = [
          { tag: "L", childStart: start2, childEnd: t1, share: wL, step: rise + nudge, angle: -opening + lean },
          { tag: "M", childStart: t1, childEnd: t2, share: wM, step: midStep, angle: (random() - 0.5) * opening * 0.32 + lean * 0.5 },
          { tag: "R", childStart: t2, childEnd: end, share: 1 - wL - wM, step: -fall, angle: opening + lean }
        ];
        for (const spec of specs) {
          grow({
            depth: depth + 1,
            remaining: remaining - 1,
            parent: index,
            path: path + spec.tag,
            start: spec.childStart,
            end: spec.childEnd,
            x: endX,
            y: endY,
            heading: clamp(heading * 0.66 + spec.angle, -1.47, 1.47),
            length: length * (settings2.taper / 100) * Math.sqrt(2.4 * spec.share) * (0.92 + random() * 0.14),
            degree: degree + spec.step
          });
        }
        return;
      }
      const middle = start2 + span * sway;
      for (const side of [-1, 1]) {
        const left = side < 0;
        const step = left ? rise : -fall;
        const nextRemaining = rule === "fibonacci" && !left ? remaining - 2 : remaining - 1;
        grow({
          depth: depth + 1,
          remaining: nextRemaining,
          parent: index,
          path: path + (left ? "L" : "R"),
          start: left ? start2 : middle,
          end: left ? middle : end,
          x: endX,
          y: endY,
          heading: clamp(heading * 0.66 + side * opening + lean, -1.47, 1.47),
          length: length * (settings2.taper / 100) * Math.sqrt(2 * (left ? sway : 1 - sway)) * (0.92 + random() * 0.15),
          degree: degree + step + (left ? nudge : 0)
        });
      }
    }
    const initialRemaining = rule === "ternary" ? Math.min(settings2.depth, 5) : settings2.depth;
    grow({ depth: 0, remaining: initialRemaining, parent: null, path: "", start: 0, end: settings2.cycle, x: 0, y: 0, heading: -0.05, length: 1, degree: 0 });
    const events = scoreEvents(branches);
    return { settings: settings2, scene, seed, generation, shift, interval, melody, branches, events, cycle: settings2.cycle, focus: null };
  }
  function focusOn(score2, index) {
    const root = score2.branches[index];
    if (!root || index === 0) return score2;
    const stretch = score2.cycle / (root.end - root.start);
    const branches = [];
    (function visit(source, parent) {
      const original = score2.branches[source];
      const depth = original.depth - root.depth;
      const branch = {
        ...original,
        index: branches.length,
        parent,
        depth,
        children: [],
        start: (original.start - root.start) * stretch,
        end: (original.end - root.start) * stretch,
        at: depth === 0 ? 0 : Math.max(0, (original.at - root.start) * stretch),
        midi: score2.melody ? original.melodyLead ? original.midi : inRegister(score2.scene, original.midi, depth) : pitch(score2.scene, original.degree, depth, score2.shift)
      };
      if (original.notes) {
        branch.notes = original.notes.map((note) => leadNote(
          branch,
          note.midi,
          (note.start - root.start) * stretch,
          (note.end - root.start) * stretch
        ));
      }
      branches.push(branch);
      if (parent !== null) branches[parent].children.push(branch.index);
      for (const child of original.children) visit(child, branch.index);
    })(index, null);
    const events = scoreEvents(branches);
    return { ...score2, branches, events, focus: root.path };
  }
  function stackAt(score2, time) {
    const stack = [];
    let branch = score2.branches[0];
    while (branch) {
      stack.push(branch);
      if (!branch.children.length) break;
      const children = branch.children.map((index) => score2.branches[index]);
      branch = children.find((child) => time < child.end) ?? children.at(-1);
    }
    return stack;
  }
  function subtree(branches, index) {
    const found = [];
    const visit = (i) => {
      found.push(i);
      for (const child of branches[i]?.children ?? []) visit(child);
    };
    if (branches[index]) visit(index);
    return found;
  }
  function describe(branch) {
    return branch.path ? "grow(" + [...branch.path].join("") + ")" : "grow(trunk)";
  }
  function clock(seconds2) {
    const whole = Math.max(0, Math.floor(seconds2));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }
  var hashKeys = { scene: "scene", depth: "depth", sway: "sway", spread: "spread", taper: "length", cycle: "cycle", seed: "seed" };
  var mixFields = ["nature", "volume"];
  function toHash(settings2, focus, generation = 0, mix = {}) {
    const params = new URLSearchParams();
    for (const [key, name] of Object.entries(hashKeys)) params.set(name, settings2[key]);
    if (settings2.rule && settings2.rule !== "binary") params.set("rule", settings2.rule);
    if (settings2.pruned.length) params.set("cut", settings2.pruned.join("."));
    if (settings2.melody?.length) params.set("melody", settings2.melody.map((note) => note.join(":")).join("."));
    if (focus) params.set("inside", focus);
    if (generation) params.set("generation", generationNumber(generation));
    for (const key of mixFields) {
      if (Number.isInteger(mix[key]) && mix[key] >= 0 && mix[key] <= 100) params.set(key, mix[key]);
    }
    if (typeof mix.water === "boolean") params.set("water", mix.water ? "1" : "0");
    return "#" + params.toString();
  }
  function fromHash(hash) {
    const params = new URLSearchParams(String(hash).replace(/^#/, ""));
    if (!params.has("scene")) return null;
    const raw = { pruned: (params.get("cut") ?? "").split(".").filter(Boolean) };
    for (const [key, name] of Object.entries(hashKeys)) if (params.has(name)) raw[key] = params.get(name);
    if (params.has("rule")) raw.rule = params.get("rule");
    const phrase = params.get("melody");
    if (phrase && phrase.length <= maxMelodyNotes * 8 && /^\d{2}:\d{1,4}(\.\d{2}:\d{1,4})*$/.test(phrase)) {
      raw.melody = phrase.split(".").map((note) => note.split(":").map(Number));
    }
    const scene = Object.hasOwn(scenes, raw.scene) ? raw.scene : "lagoon";
    const settings2 = normalize({ ...scenes[scene].defaults, ...raw, scene });
    const inside = params.get("inside");
    const mix = {};
    for (const key of mixFields) {
      const value = params.get(key);
      if (/^\d{1,3}$/.test(value ?? "") && Number(value) <= 100) mix[key] = Number(value);
    }
    const water = params.get("water");
    if (water === "0" || water === "1") mix.water = water === "1";
    return { settings: settings2, mix, focus: inside && /^[LRM]{1,7}$/.test(inside) ? inside : null, generation: generationNumber(params.get("generation")) };
  }

  // src/audio.mjs
  var sampleRate = 44100;
  var levels = [0.034, 0.03, 0.05, 0.056, 0.042, 0.036, 0.032, 0.028];
  var clamp2 = (value, low, high) => Math.max(low, Math.min(high, value));
  function impulse(context, seed, seconds2) {
    const random = randomFrom(seed ^ 25405);
    const size = Math.floor(context.sampleRate * seconds2);
    const buffer = context.createBuffer(2, size, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      const delay = Math.floor(context.sampleRate * (channel ? 0.029 : 0.021));
      let filtered = 0;
      for (let i = delay; i < size; i++) {
        const progress = i / size;
        const smooth = 0.35 + 0.55 * progress;
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
    const tone2 = context.createBiquadFilter();
    left.delayTime.value = 0.32;
    right.delayTime.value = 0.57;
    leftLevel.gain.value = 0.7;
    rightLevel.gain.value = 0.35;
    panLeft.pan.value = -0.7;
    panRight.pan.value = 0.7;
    tone2.type = "lowpass";
    tone2.frequency.value = 2400;
    input.connect(tone2);
    tone2.connect(left).connect(leftLevel).connect(panLeft).connect(output);
    tone2.connect(right).connect(rightLevel).connect(panRight).connect(output);
    return [left, right, leftLevel, rightLevel, panLeft, panRight, tone2];
  }
  function createEngine(context, destination, seed = 1) {
    const music = context.createGain();
    const sparkle = context.createGain();
    const ambience = context.createGain();
    const water = context.createGain();
    const send = context.createGain();
    const echoes2 = context.createGain();
    const reverb = context.createConvolver();
    const wet = context.createGain();
    const tone2 = context.createBiquadFilter();
    const limiter = context.createDynamicsCompressor();
    const out = context.createGain();
    reverb.buffer = impulse(context, seed, 3.8);
    send.gain.value = 0.62;
    wet.gain.value = 0.42;
    echoes2.gain.value = 0.2;
    tone2.type = "lowpass";
    tone2.frequency.value = 9800;
    tone2.Q.value = 0.4;
    limiter.threshold.value = -16;
    limiter.knee.value = 14;
    limiter.ratio.value = 3.2;
    limiter.attack.value = 0.02;
    limiter.release.value = 0.45;
    music.connect(tone2);
    music.connect(send);
    sparkle.connect(music);
    const delayNodes = stereoEcho(context, sparkle, echoes2);
    echoes2.connect(tone2);
    echoes2.connect(send);
    water.connect(ambience);
    ambience.connect(tone2);
    const ambienceSend = context.createGain();
    ambienceSend.gain.value = 0.12;
    ambience.connect(ambienceSend).connect(send);
    send.connect(reverb).connect(wet).connect(tone2);
    tone2.connect(limiter).connect(out).connect(destination);
    const nodes = [music, sparkle, ambience, water, send, echoes2, reverb, wet, tone2, limiter, out, ambienceSend, ...delayNodes];
    return { music, sparkle, ambience, water, out, release: () => nodes.forEach((node) => node.disconnect()) };
  }
  function tone(context, type, hz, start2, stop, destination, detune = 0) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    oscillator.detune.value = detune;
    oscillator.connect(destination);
    oscillator.start(start2);
    oscillator.stop(stop);
    return oscillator;
  }
  function swell(context, destination, start2, attack, hold, release, level2) {
    const gain = context.createGain();
    const top = start2 + Math.max(attack, hold);
    gain.gain.setValueAtTime(0, start2);
    gain.gain.linearRampToValueAtTime(level2, start2 + attack);
    gain.gain.setValueAtTime(level2, top);
    gain.gain.exponentialRampToValueAtTime(1e-4, top + release);
    gain.connect(destination);
    return { gain, end: top + release + 0.05 };
  }
  function pluck(context, destination, start2, attack, decay, level2) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(1e-4, start2);
    gain.gain.exponentialRampToValueAtTime(level2, start2 + attack);
    gain.gain.exponentialRampToValueAtTime(1e-4, start2 + attack + decay);
    gain.connect(destination);
    return { gain, end: start2 + attack + decay + 0.05 };
  }
  var voices = {
    // Trunk: a warm drone that holds for the whole call.
    pad(context, out, hz, start2, hold, level2, quick) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.6;
      filter.frequency.setValueAtTime(330, start2);
      filter.frequency.linearRampToValueAtTime(460, start2 + Math.max(0.5, hold * 0.45));
      filter.frequency.linearRampToValueAtTime(320, start2 + Math.max(1, hold + 3));
      const attack = quick ? 0.11 : Math.min(3.2, Math.max(0.6, hold * 0.35));
      const envelope = swell(context, out, start2, attack, hold, 4.2, level2);
      filter.connect(envelope.gain);
      const octave = context.createGain();
      octave.gain.value = 0.2;
      octave.connect(filter);
      tone(context, "sine", hz, start2, envelope.end, filter);
      tone(context, "triangle", hz * 2, start2, envelope.end, octave);
      return envelope.end;
    },
    // Second level: soft bowed strings with a slow vibrato.
    strings(context, out, hz, start2, hold, level2, quick) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1900;
      const attack = quick ? 0.08 : Math.min(1.8, Math.max(0.35, hold * 0.3));
      const envelope = swell(context, out, start2, attack, hold, 2.8, level2);
      filter.connect(envelope.gain);
      const vibrato = context.createOscillator();
      const depth = context.createGain();
      vibrato.frequency.value = 4.6;
      depth.gain.value = 4;
      vibrato.connect(depth);
      vibrato.start(start2);
      vibrato.stop(envelope.end);
      for (const cents of [-5, 6]) depth.connect(tone(context, "triangle", hz, start2, envelope.end, filter, cents).detune);
      const air = context.createGain();
      air.gain.value = 0.28;
      air.connect(filter);
      tone(context, "sine", hz * 2, start2, envelope.end, air);
      return envelope.end;
    },
    // A frequency-modulated electric piano.
    keys(context, out, hz, start2, hold, level2) {
      const decay = clamp2(hold + 0.9, 1.8, 4.6);
      const envelope = pluck(context, out, start2, 8e-3, decay, level2);
      const carrier = tone(context, "sine", hz, start2, envelope.end, envelope.gain);
      const modulator = context.createOscillator();
      const index = context.createGain();
      modulator.frequency.value = hz;
      index.gain.setValueAtTime(hz * 1.5, start2);
      index.gain.exponentialRampToValueAtTime(hz * 0.12, start2 + 1.3);
      modulator.connect(index).connect(carrier.frequency);
      modulator.start(start2);
      modulator.stop(envelope.end);
      const tine = pluck(context, out, start2, 4e-3, 0.28, level2 * 0.13);
      tone(context, "sine", hz * 4, start2, tine.end, tine.gain);
      return envelope.end;
    },
    kalimba(context, out, hz, start2, hold, level2) {
      const body2 = pluck(context, out, start2, 4e-3, clamp2(hold * 1.4, 1.4, 2.8), level2);
      tone(context, "sine", hz, start2, body2.end, body2.gain);
      const ring2 = pluck(context, out, start2, 3e-3, 0.55, level2 * 0.16);
      tone(context, "sine", hz * 2, start2, ring2.end, ring2.gain);
      const tine = pluck(context, out, start2, 2e-3, 0.13, level2 * 0.2);
      tone(context, "sine", hz * 5.4, start2, tine.end, tine.gain);
      return body2.end;
    },
    marimba(context, out, hz, start2, hold, level2) {
      const body2 = pluck(context, out, start2, 5e-3, clamp2(hold * 1.1, 0.9, 1.9), level2);
      tone(context, "sine", hz, start2, body2.end, body2.gain);
      const bar = pluck(context, out, start2, 3e-3, 0.11, level2 * 0.3);
      tone(context, "sine", hz * 3.93, start2, bar.end, bar.gain);
      return body2.end;
    },
    harp(context, out, hz, start2, hold, level2) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(hz * 8, start2);
      filter.frequency.exponentialRampToValueAtTime(hz * 1.5, start2 + 1.4);
      const body2 = pluck(context, out, start2, 4e-3, clamp2(hold * 1.5, 1.6, 3.2), level2);
      filter.connect(body2.gain);
      tone(context, "triangle", hz, start2, body2.end, filter);
      tone(context, "sine", hz * 2.003, start2, body2.end, filter);
      return body2.end;
    },
    bell(context, out, hz, start2, hold, level2) {
      const decay = clamp2(hold * 2.2, 2.2, 5.2);
      let end = start2;
      for (const [ratio, amount, length] of [[1, 1, 1], [2.01, 0.31, 0.7], [2.76, 0.15, 0.5], [4.07, 0.08, 0.32], [5.4, 0.035, 0.2]]) {
        const partial = pluck(context, out, start2, 0.014, decay * length, level2 * amount);
        tone(context, "sine", hz * ratio, start2, partial.end, partial.gain);
        end = Math.max(end, partial.end);
      }
      return end;
    },
    glass(context, out, hz, start2, hold, level2) {
      const decay = clamp2(hold * 2, 2.4, 4.4);
      const body2 = pluck(context, out, start2, 0.02, decay, level2 * 0.8);
      tone(context, "sine", hz, start2, body2.end, body2.gain);
      tone(context, "sine", hz + 1.3, start2, body2.end, body2.gain);
      const shimmer = pluck(context, out, start2, 0.01, decay * 0.45, level2 * 0.22);
      tone(context, "sine", hz * 3.01, start2, shimmer.end, shimmer.gain);
      return body2.end;
    },
    // Keep the note in tune. The rising droplet is a short accent under it.
    drop(context, out, hz, start2, hold, level2) {
      const body2 = pluck(context, out, start2, 0.032, clamp2(hold * 1.2, 0.45, 1.05), level2);
      tone(context, "sine", hz, start2, body2.end, body2.gain);
      const bead = pluck(context, out, start2, 6e-3, 0.18, level2 * 0.22);
      const droplet = tone(context, "sine", hz * 0.88, start2, bead.end, bead.gain);
      droplet.frequency.setValueAtTime(hz * 0.88, start2);
      droplet.frequency.exponentialRampToValueAtTime(hz, start2 + 0.05);
      const harmonic = pluck(context, out, start2 + 0.02, 0.02, 0.75, level2 * 0.22);
      tone(context, "sine", hz * 2, start2 + 0.02, harmonic.end, harmonic.gain);
      return Math.max(body2.end, harmonic.end);
    }
  };
  var voiceFor = (scene, depth) => scene.voices[Math.min(depth, scene.voices.length - 1)];
  function previewVoice(context, out, scene, note, start2, hz) {
    const { wave, overtones } = scene.preview;
    const length = note.depth === 0 ? 3.3 : 2.55 - note.depth * 0.21;
    const level2 = note.depth < 2 ? 0.11 : 0.075 - note.depth * 5e-3;
    const parts = [
      [1, wave, note.leaf ? 0.055 : 0.09, length, level2 * 1.18],
      [overtones[0], "sine", 0.075, length * 0.58, level2 * 0.24],
      [overtones[1], "sine", 0.05, length * 0.35, level2 * 0.08]
    ];
    for (const [ratio, type, attack, duration, amount] of parts) {
      const envelope = pluck(context, out, start2, attack, duration - attack, amount);
      tone(context, type, hz * ratio, start2, envelope.end, envelope.gain);
    }
    return start2 + length + 0.05;
  }
  function playNote(context, engine, scene, note, start2, options = {}) {
    const hold = Math.max(0.05, options.hold ?? note.end - note.start);
    const pan = context.createStereoPanner();
    pan.pan.value = note.pan ?? 0;
    pan.connect(!options.preview && !options.tap && note.depth >= 3 ? engine.sparkle : engine.music);
    const voice = voices[options.voice ?? voiceFor(scene, note.depth)];
    const level2 = levels[Math.min(note.depth, levels.length - 1)] * (note.velocity ?? 0.9) * (options.gain ?? 1);
    const hz = frequency(note.midi);
    const touch2 = options.tap ? swell(context, pan, start2, 0.035, hold, 0.85, 1) : null;
    const end = options.preview ? previewVoice(context, pan, scene, note, start2, hz) : voice(context, touch2?.gain ?? pan, hz, start2, hold, level2, options.tap);
    if (!("startRendering" in context)) {
      const wait = ((touch2?.end ?? end) - context.currentTime + 0.2) * 1e3;
      setTimeout(() => pan.disconnect(), Math.max(0, wait));
    }
    return end;
  }
  var ambienceCache = /* @__PURE__ */ new Map();
  function loopBuffer(context, seconds2, fill) {
    const rate = context.sampleRate;
    const overlap = Math.floor(rate * 0.25);
    const frames = Math.floor(rate * seconds2);
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
  function addEvent(data, rate, at, seconds2, render) {
    const begin = Math.floor(at * rate);
    const length = Math.floor(seconds2 * rate);
    for (let i = 0; i < length && begin + i < data.length; i++) data[begin + i] += render(i / rate, i / length);
  }
  var beds = {
    lagoon(context, random) {
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
          const level2 = 0.012 + random() * 0.012;
          for (let p = 0; p < pulses; p++) {
            addEvent(data, rate, at + p * 0.034, 0.018, (t, x) => Math.sin(2 * Math.PI * hz * t) * Math.sin(Math.PI * x) * level2);
          }
        }
      });
      return [water, crickets];
    },
    cedar(context, random) {
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
          const level2 = 0.011 + random() * 0.015;
          addEvent(data, rate, at, 0.12, (t, p) => Math.sin(2 * Math.PI * hz * (1 - p * 0.26) * t) * Math.min(1, t / 8e-3) * (1 - p) ** 3 * level2);
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
      const chimes = loopBuffer(context, 23, (data) => {
        const rate = context.sampleRate;
        for (let at = 1 + random() * 2; at < 22; at += 4 + random() * 4) {
          const strikes = 2 + Math.floor(random() * 3);
          for (let s = 0; s < strikes; s++) {
            const degree = Math.floor(random() * scene.scale.length);
            const hz = frequency(scene.root + 24 + scene.scale[degree]);
            const level2 = 6e-3 + random() * 8e-3;
            addEvent(data, rate, at + s * (0.18 + random() * 0.4), 3, (t, p) => (Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(2 * Math.PI * hz * 2.76 * t) * (1 - p) ** 3) * (1 - p) ** 2.4 * level2);
          }
        }
      });
      return [wind, chimes];
    }
  };
  function ambienceBuffers(context, sceneKey) {
    const key = sceneKey + ":" + context.sampleRate;
    if (!ambienceCache.has(key)) {
      const random = randomFrom(24301 ^ sceneKey.length * 977);
      ambienceCache.set(key, beds[sceneKey](context, random, scenes[sceneKey]));
    }
    return ambienceCache.get(key);
  }
  function startAmbience(context, engine, sceneKey, start2, fade = 3) {
    const gains = [engine.ambience, engine.water].map((destination) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, start2);
      gain.gain.linearRampToValueAtTime(1, start2 + fade);
      gain.connect(destination);
      return gain;
    });
    const sources = ambienceBuffers(context, sceneKey).map((buffer, index) => {
      const isWater = sceneKey === "cedar" || sceneKey === "lagoon" && index === 0;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gains[isWater ? 1 : 0]);
      source.start(start2);
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
        setTimeout(() => gains.forEach((gain) => gain.disconnect()), (release + 0.4) * 1e3);
      }
    };
  }
  var tailSeconds = 6;
  async function renderRawCycle(score2, nature2, water, { fadeIn, holdAmbience } = {}) {
    const total = score2.cycle + tailSeconds;
    const offline = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
    const engine = createEngine(offline, offline.destination, score2.seed);
    engine.ambience.gain.value = nature2;
    engine.water.gain.value = water ? 1 : 0;
    if (nature2 > 0) {
      const scene = score2.settings.scene;
      const bed = startAmbience(offline, engine, scene, 0, fadeIn ?? (scene === "cedar" ? 0.9 : 2.2));
      const fadeOutAt = holdAmbience ? Math.min(total - 0.5, score2.cycle + 1.25) : score2.cycle;
      for (const gain of bed.gains) {
        gain.gain.setValueAtTime(1, fadeOutAt);
        gain.gain.linearRampToValueAtTime(0, total - 0.2);
      }
    }
    for (const note of score2.events) playNote(offline, engine, score2.scene, note, note.at + 0.05);
    engine.out.gain.setValueAtTime(1, total - 0.6);
    engine.out.gain.linearRampToValueAtTime(0, total - 0.02);
    const buffer = await offline.startRendering();
    let peak = 0;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    return { buffer, peak };
  }
  function waveHeader(channels, rate, frames) {
    const frameSize = 2 * channels;
    const dataSize = frames * frameSize;
    const bytes = new ArrayBuffer(44 + dataSize);
    const view = new DataView(bytes);
    const text2 = (position, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i));
    };
    text2(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    text2(8, "WAVE");
    text2(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * frameSize, true);
    view.setUint16(32, frameSize, true);
    view.setUint16(34, 16, true);
    text2(36, "data");
    view.setUint32(40, dataSize, true);
    return view;
  }
  function pcmSample(sample) {
    return Math.round(clamp2(sample, -1, 1) * (sample < 0 ? 32768 : 32767));
  }
  function encodeWave(buffer) {
    const channels = buffer.numberOfChannels;
    const view = waveHeader(channels, buffer.sampleRate, buffer.length);
    const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < channels; channel++) {
        view.setInt16(44 + (i * channels + channel) * 2, pcmSample(samples[channel][i]), true);
      }
    }
    return new Blob([view.buffer], { type: "audio/wav" });
  }
  async function renderWave(scores, { nature: nature2 = 0, water = true, onCycle } = {}) {
    const duration = scores.reduce((sum, score2) => sum + score2.cycle, tailSeconds);
    if (scores.length === 1) {
      const { buffer, peak } = await renderRawCycle(scores[0], nature2, water);
      const gain = Math.min(0.76 / Math.max(peak, 1e-3), 2.2);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] *= gain;
      }
      return { blob: encodeWave(buffer), duration };
    }
    const view = waveHeader(2, sampleRate, Math.round(duration * sampleRate));
    const overlap = Math.round(1.2 * sampleRate);
    let previous = null;
    let offset = 44;
    let masterGain = null;
    for (const [index, score2] of scores.entries()) {
      onCycle?.(index + 1, scores.length);
      const { buffer, peak } = await renderRawCycle(score2, nature2, water, {
        fadeIn: index === 0 ? void 0 : 0.05,
        holdAmbience: index < scores.length - 1
      });
      if (masterGain === null) masterGain = Math.min(0.76 / Math.max(peak, 1e-3), 2.2);
      const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
      const cycleFrames = Math.round(score2.cycle * sampleRate);
      const count = index === scores.length - 1 ? buffer.length : cycleFrames;
      for (let i = 0; i < count; i++) {
        const blend = previous && i < overlap ? i / overlap : 1;
        for (let channel = 0; channel < 2; channel++) {
          const sample = (blend === 1 ? channels[channel][i] : channels[channel][i] * blend + previous[channel][i] * (1 - blend)) * masterGain;
          view.setInt16(offset, pcmSample(sample), true);
          offset += 2;
        }
      }
      previous = channels.map((channel) => channel.slice(cycleFrames, cycleFrames + overlap));
    }
    return { blob: new Blob([view.buffer], { type: "audio/wav" }), duration };
  }

  // src/midi.mjs
  var ticksPerBeat = 480;
  var programs = { pad: 89, strings: 49, keys: 4, kalimba: 108, marimba: 12, harp: 46, bell: 14, glass: 92, drop: 10 };
  function variable(value) {
    const bytes = [value & 127];
    while (value >>= 7) bytes.unshift(value & 127 | 128);
    return bytes;
  }
  function chunk(type, body2) {
    const length = body2.length;
    return [...type].map((c) => c.charCodeAt(0)).concat([length >>> 24, length >>> 16 & 255, length >>> 8 & 255, length & 255], body2);
  }
  function text(kind, value) {
    const bytes = [...new TextEncoder().encode(value)];
    return [255, kind, ...variable(bytes.length), ...bytes];
  }
  function encodeMidi(scores, voiceFor2) {
    const tick2 = (seconds2) => Math.max(0, Math.round(seconds2 * ticksPerBeat));
    const levels2 = /* @__PURE__ */ new Map();
    let offset = 0;
    for (const score2 of scores) {
      for (const note of score2.events) {
        if (!levels2.has(note.depth)) levels2.set(note.depth, { voice: voiceFor2(score2.scene, note.depth), events: [] });
        const lane = levels2.get(note.depth);
        const start2 = offset + note.at;
        const hold = note.depth <= 2 ? note.end - note.start : Math.min(note.end - note.start, 1.2);
        const velocity = Math.round(46 + 50 * (note.velocity ?? 0.9) - note.depth * 3);
        lane.events.push({ time: tick2(start2), data: [144, note.midi, velocity] });
        lane.events.push({ time: tick2(start2 + Math.max(0.08, hold)), data: [128, note.midi, 0] });
      }
      offset += score2.cycle;
    }
    const conductor = [0, ...text(3, "Stillwater"), 0, 255, 81, 3, 15, 66, 64, 0, 255, 47, 0];
    const tracks = [chunk("MTrk", conductor)];
    for (const [depth, lane] of [...levels2.entries()].sort((a, b) => a[0] - b[0])) {
      const channel = depth % 16 === 9 ? 10 : depth % 16;
      lane.events.sort((a, b) => a.time - b.time || (a.data[0] === 128 ? -1 : 1));
      const body2 = [0, ...text(3, "Level " + depth + " · " + lane.voice), 0, 192 | channel, programs[lane.voice] ?? 0];
      let last = 0;
      for (const event of lane.events) {
        body2.push(...variable(event.time - last), event.data[0] | channel, event.data[1], event.data[2]);
        last = event.time;
      }
      body2.push(0, 255, 47, 0);
      tracks.push(chunk("MTrk", body2));
    }
    const header = chunk("MThd", [0, 1, 0, tracks.length, ticksPerBeat >> 8, ticksPerBeat & 255]);
    return new Blob([new Uint8Array(header.concat(...tracks))], { type: "audio/midi" });
  }

  // src/water.mjs
  var vertexSource = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}
`;
  var fragmentSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform vec2 u_cursor;
uniform vec3 u_tint;
uniform float u_time;
uniform vec3 u_echoes[4];
out vec4 color;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), s.x),
             mix(hash(cell + vec2(0, 1)), hash(cell + 1.0), s.x), s.y);
}

float mist(vec2 p) {
  return .57 * noise(p) + .27 * noise(p * 2.13) + .12 * noise(p * 4.31);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1);
  vec2 p = (uv - u_origin) * aspect;
  float time = u_time * .2;
  vec3 night = vec3(.018, .037, .055);
  vec3 tint = u_tint;
  vec3 c = night * (1.12 - uv.y * .36);
  float haze = mist(vec2(uv.x * 4.2 + time * .15, uv.y * 9.0) + 5.0);
  float sky = exp(-length(vec2(p.x * 1.05, (p.y - .34) * 1.30)) * 2.3);
  c += tint * sky * (.025 + .17 * pow(haze, 2.3));
  float aurora = exp(-abs(p.y - .33 - .055 * sin(6.3 * p.x - time * .35)) * 11.0);
  c += tint * aurora * sky * .035 * haze;
  float veil = mist(vec2(uv.x * 6.0 + time * .09, uv.y * 26.0 - 1.5) + vec2(2.1, 6.8));
  c += tint * exp(-abs(p.y - .09) * 12.0) * pow(veil, 4.0) * .12;
  float eye = exp(-length((uv - u_cursor) * aspect) * 5.8);
  c += tint * eye * step(0.0, u_cursor.x) * (haze * .085 + .018);

  float water = 1.0 - smoothstep(.025, .13, p.y);
  float flatDistance = length(vec2(p.x, p.y * 3.85));
  float island = exp(-flatDistance * 2.8);
  float streaks = noise(vec2(uv.x * 20.0 + .4 * time, uv.y * 235.0));
  float ridges = .5 + .5 * sin(flatDistance * 212.0 - 3.0 * time + 2.5 * streaks);
  float light = pow(ridges, 16.0) * (.37 + .63 * streaks);
  c += tint * water * island * (light * .18 + .031);

  for (int i = 0; i < 4; i++) {
    vec3 echo = u_echoes[i];
    float age = echo.x;
    vec2 ring = p - vec2(echo.y * .25, .012);
    float distance = length(vec2(ring.x, ring.y * 3.65));
    float crest = exp(-abs(distance - age * .61) * 125.0);
    float following = exp(-abs(distance - max(0.0, age - .13) * .61) * 80.0);
    c += tint * (crest + .37 * following) * water * exp(-age * 1.85) * echo.z * .46;
  }

  vec2 starGrid = uv * vec2(190.0, 140.0);
  vec2 cell = floor(starGrid);
  vec2 grain = fract(starGrid) - vec2(hash(cell + 4.0), hash(cell + 3.0));
  float point = 1.0 - smoothstep(.005, .21, length(grain));
  c += tint * point * step(.986, hash(cell)) * (.5 + .5 * haze) * .48 * (1.0 - water * .84);
  c *= 1.0 - .48 * smoothstep(.24, .72, length((uv - vec2(.57, .48)) * vec2(.87, 1.0)));
  c += vec3((hash(gl_FragCoord.xy) - .5) * .009);
  color = vec4(c, 1.0);
}
`;
  function compile(gl, kind, source) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }
  var Water = class {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.ready = false;
        canvas.hidden = true;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.initialize();
        if (this.lastFrame) this.draw(this.lastFrame);
      });
      this.initialize();
    }
    initialize() {
      const canvas = this.canvas;
      try {
        const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
        if (!gl) return;
        this.gl = gl;
        this.program = gl.createProgram();
        const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(this.program, vertex);
        gl.attachShader(this.program, fragment);
        gl.linkProgram(this.program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
        gl.useProgram(this.program);
        this.uniforms = Object.fromEntries(
          ["resolution", "origin", "cursor", "tint", "time", "echoes"].map(
            (key) => [key, gl.getUniformLocation(this.program, "u_" + key)]
          )
        );
        this.ready = true;
        canvas.hidden = false;
      } catch (error) {
        console.warn("Water shader unavailable, using the Canvas backdrop.", error);
        canvas.hidden = true;
      }
    }
    draw(frame2) {
      this.lastFrame = frame2;
      if (!this.ready) return false;
      const { gl, canvas, uniforms } = this;
      const { width, height, x, y, cursor: cursor2, seconds: seconds2, echoes: echoes2, accent } = frame2;
      const scale = Math.min(0.82, 740 / width);
      const pixelsWide = Math.max(1, Math.round(width * scale));
      const pixelsHigh = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide;
        canvas.height = pixelsHigh;
        gl.viewport(0, 0, pixelsWide, pixelsHigh);
      }
      gl.uniform2f(uniforms.resolution, pixelsWide, pixelsHigh);
      gl.uniform2f(uniforms.origin, x / width, 1 - y / height);
      gl.uniform2f(uniforms.cursor, cursor2 ? cursor2.x / width : -1, cursor2 ? 1 - cursor2.y / height : -1);
      gl.uniform3f(uniforms.tint, ...[1, 3, 5].map((start2) => parseInt(accent.slice(start2, start2 + 2), 16) / 255));
      gl.uniform1f(uniforms.time, seconds2);
      const wavefronts = new Float32Array(12);
      echoes2.forEach((echo, index) => wavefronts.set([echo.age, echo.pan, echo.strength], index * 3));
      gl.uniform3fv(uniforms.echoes, wavefronts);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    }
  };

  // dist/lagoon.webp
  var lagoon_default = "data:image/webp;base64,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";

  // src/garden.mjs
  var TAU = Math.PI * 2;
  var tint = (hue, light, alpha) => "hsla(" + hue + ", 79%, " + light + "%, " + alpha + ")";
  var ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  var keys = ["x", "y", "controlX", "controlY", "endX", "endY"];
  var growSeconds = 2.4;
  function halo(ctx, x, y, radius, hue, strength) {
    if (radius <= 0 || strength <= 0) return;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, tint(hue, 67, strength));
    glow.addColorStop(1, tint(hue, 50, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }
  function pointOn(branch, t) {
    const rest = 1 - t;
    return {
      x: rest ** 2 * branch.x + 2 * rest * t * branch.controlX + t ** 2 * branch.endX,
      y: rest ** 2 * branch.y + 2 * rest * t * branch.controlY + t ** 2 * branch.endY
    };
  }
  function ring(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
    ctx.stroke();
  }
  function stemShape(points, width, phase) {
    const banks = [[], []];
    for (const [index, point] of points.entries()) {
      const prev = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const distance = Math.hypot(dx, dy) || 1;
      const taper = 1 - 0.49 * index / (points.length - 1);
      const offset = width * taper * (0.92 + 0.1 * Math.sin(index * 1.9 + phase));
      banks[0].push([point.x + dy / distance * offset, point.y - dx / distance * offset]);
      banks[1].push([point.x - dy / distance * offset, point.y + dx / distance * offset]);
    }
    const shape2 = new Path2D();
    const outline = banks[0].concat(banks[1].reverse());
    shape2.moveTo(...outline[0]);
    for (const point of outline.slice(1)) shape2.lineTo(...point);
    shape2.closePath();
    return shape2;
  }
  function shape(branch) {
    const steps = Math.max(4, Math.ceil(Math.hypot(branch.endX - branch.x, branch.endY - branch.y) / 7));
    branch.samples = Array.from({ length: steps + 1 }, (_, i) => pointOn(branch, i / steps));
    const curve = new Path2D();
    curve.moveTo(branch.x, branch.y);
    curve.quadraticCurveTo(branch.controlX, branch.controlY, branch.endX, branch.endY);
    branch.curve = curve;
    branch.stem = branch.depth < 3 ? stemShape(branch.samples, 6.7 * 0.68 ** branch.depth, branch.index * 1.28) : null;
    return branch;
  }
  var Garden = class {
    constructor(canvas, onResize) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.water = new Water(document.getElementById("water"));
      this.backdrop = document.createElement("canvas");
      this.photo = new Image();
      this.photo.src = lagoon_default;
      this.targets = [];
      this.shown = [];
      this.width = 0;
      this.growAt = -Infinity;
      this.tween = null;
      new ResizeObserver(() => {
        if (!this.score) return;
        this.layout();
        onResize();
      }).observe(canvas);
    }
    setScore(score2, mode = "morph") {
      const previous = new Map(this.shown.map((branch) => [branch.path, branch]));
      this.score = score2;
      this.layout();
      const now = performance.now() / 1e3;
      if (mode === "grow") {
        this.growAt = now;
        this.tween = null;
      } else if (mode === "morph" && previous.size) {
        const from = this.targets.map((target) => {
          const known = previous.get(target.path);
          if (known) return Object.fromEntries(keys.map((key) => [key, known[key]]));
          const parent = previous.get(target.path.slice(0, -1));
          const x = parent ? parent.endX : target.x;
          const y = parent ? parent.endY : target.y;
          return { x, y, controlX: x, controlY: y, endX: x, endY: y };
        });
        this.tween = { start: now, seconds: 1.5, from };
      }
    }
    animating(now) {
      return now - this.growAt < growSeconds + 0.6 || Boolean(this.tween && now - this.tween.start < this.tween.seconds);
    }
    layout() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      if (!this.width || !this.height || !this.score) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.ratio = ratio;
      this.canvas.width = this.backdrop.width = Math.round(this.width * ratio);
      this.canvas.height = this.backdrop.height = Math.round(this.height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const { branches, scene } = this.score;
      const origin = branches[0];
      const xs = branches.flatMap((branch) => [branch.x - origin.x, branch.endX - origin.x]);
      const minX = Math.min(...xs, 0);
      const maxX = Math.max(...xs, 0);
      const minY = Math.min(...branches.map((branch) => branch.endY - origin.y), -0.2);
      const compact = this.width < 620;
      const stretch = compact ? 1.17 : 1.42;
      const height = this.height * 0.69;
      const width = this.width * 0.88;
      const scale = Math.min(height / -minY, width / Math.max(0.2, maxX - minX) / stretch);
      this.baseX = this.width / 2 - (maxX + minX) / 2 * scale * stretch;
      this.baseY = this.height * 0.79;
      const projectX = (x) => this.baseX + (x - origin.x) * scale * stretch;
      const projectY = (y) => this.baseY + (y - origin.y) * scale;
      this.targets = branches.map((branch) => shape({
        ...branch,
        x: projectX(branch.x),
        y: projectY(branch.y),
        controlX: projectX(branch.controlX),
        controlY: projectY(branch.controlY),
        endX: projectX(branch.endX),
        endY: projectY(branch.endY)
      }));
      this.shown = this.targets;
      const random = randomFrom(this.score.seed ^ 55335);
      const leaves = this.targets.filter((branch) => branch.leaf);
      this.sparks = leaves.flatMap(
        (branch) => Array.from({ length: Math.min(12, Math.round(300 / Math.max(1, leaves.length)) + 3) }, () => {
          const angle = random() * TAU;
          const distance = 2 + random() ** 1.75 * 44;
          return {
            branch: branch.index,
            angle,
            dx: Math.cos(angle) * distance,
            dy: Math.sin(angle) * distance * 0.8,
            size: 0.38 + random() ** 2 * 2,
            alpha: 0.18 + random() * 0.6,
            amber: random() > 0.72
          };
        })
      );
      const ctx = this.backdrop.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.paintBackdrop(ctx, scene.hue);
    }
    paintBackdrop(ctx, hue) {
      const { width: w, height: h, baseX: x, baseY: y } = this;
      const atmosphere = ctx.createLinearGradient(0, 0, 0, h);
      atmosphere.addColorStop(0, "#071321");
      atmosphere.addColorStop(0.67, "#0c202b");
      atmosphere.addColorStop(1, "#071218");
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, w, h);
      halo(ctx, x, h * 0.47, Math.min(w * 0.48, h * 0.85), hue, 0.12);
      halo(ctx, x, y, Math.min(w * 0.3, h * 0.54), hue, 0.15);
      const random = randomFrom(448291);
      for (let i = 0; i < 350; i++) {
        ctx.fillStyle = tint(hue, 82, 0.04 + random() ** 2 * 0.32);
        ctx.beginPath();
        ctx.arc(random() * w, random() * h * 0.94, 0.25 + random() ** 3 * 1.15, 0, TAU);
        ctx.fill();
      }
      ctx.lineWidth = 0.68;
      for (let i = 0; i < 32; i++) {
        const rx = (i + 1) ** 1.23 * w / 109;
        ctx.strokeStyle = tint(hue, 72, 0.17 * (1 - i / 36));
        ring(ctx, x, y, rx, rx * (h / w) * 0.26);
      }
    }
    current(now, reduced) {
      if (!this.tween || reduced) return this.targets;
      const t = Math.min(1, (now - this.tween.start) / this.tween.seconds);
      if (t >= 1) {
        this.tween = null;
        return this.targets;
      }
      const k = ease(t);
      return this.targets.map((target, i) => {
        const from = this.tween.from[i];
        const branch = { ...target };
        for (const key of keys) branch[key] = from[key] + (target[key] - from[key]) * k;
        return shape(branch);
      });
    }
    draw(frame2) {
      this.lastFrame = frame2;
      const { now, reduced, time, stack = [], onsets: onsets2 = /* @__PURE__ */ new Map(), cursor: cursor2, trail: trail2 = [], hover: hover2, selected: selected2, marked, breath, echoes: echoes2 = [], tool: tool2 } = frame2;
      const ctx = this.ctx;
      const { width, height, baseX, baseY } = this;
      if (!width || !height || !this.score) return;
      const branches = this.current(now, reduced);
      this.shown = branches;
      const hue = this.score.scene.hue;
      const active = new Set(stack.map((branch) => branch.index));
      const playing = time != null;
      const growing = reduced ? Infinity : now - this.growAt;
      const per = growSeconds * 0.78 / Math.max(1, branches.length);
      const growth = (index) => Math.max(0, Math.min(1, (growing - index * per) / 0.5));
      const gpu = this.water.draw({
        width,
        height,
        x: baseX,
        y: baseY,
        cursor: reduced ? null : cursor2,
        seconds: reduced ? 0 : now % 600,
        echoes: reduced ? [] : echoes2.slice(-4),
        accent: this.score.scene.accent
      });
      ctx.clearRect(0, 0, width, height);
      if (!gpu) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(this.backdrop, 0, 0, width, height);
        ctx.globalAlpha = 1;
        for (const wave of reduced ? [] : echoes2.slice(-4)) {
          const radius = 3 + wave.age * height * 0.62;
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = tint(hue, 84, Math.max(0, 1 - wave.age / 2) * 0.58);
          ring(ctx, baseX + wave.pan * height * 0.25, baseY, radius, radius * 0.26);
        }
      }
      ctx.lineCap = "round";
      halo(ctx, baseX, baseY - height * 0.15, Math.min(width * 0.38, height * 0.53), hue, 0.13);
      if (breath) {
        const rx = 26 + breath.amount * Math.min(width * 0.3, height * 0.42);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = tint(hue, 86, 0.5);
        ring(ctx, baseX, baseY, rx, rx * 0.26);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = tint(hue, 80, 0.18);
        ring(ctx, baseX, baseY, rx * 1.18, rx * 0.31);
      }
      for (const branch of branches) {
        if (growth(branch.index) <= 0) continue;
        ctx.lineWidth = Math.max(0.55, 3.4 - branch.depth * 0.6);
        ctx.strokeStyle = tint(hue, 73, (active.has(branch.index) ? 0.34 : 0.16) / (1 + 0.28 * branch.depth));
        ctx.beginPath();
        for (const [index, point] of branch.samples.entries()) {
          const distance = baseY - point.y;
          const x = point.x + Math.sin(distance * 0.11 + (reduced ? 0 : now * 1.32)) * Math.min(11, distance / 27);
          ctx[index === 0 || index % 5 === 0 ? "moveTo" : "lineTo"](x, baseY + distance * 0.285);
        }
        ctx.stroke();
      }
      if (!this.score.focus) {
        for (let root = -7; root <= 7; root++) {
          const reach = root * (1.8 + Math.abs(root) * 0.51);
          ctx.strokeStyle = tint(hue + root, 72, 0.26 - Math.abs(root) * 0.024);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(baseX + root * 0.35, baseY - 15);
          ctx.bezierCurveTo(baseX + root * 0.6, baseY - 3, baseX + reach * 0.64, baseY + root * 0.55, baseX + reach, baseY + root * 0.7);
          ctx.stroke();
        }
      }
      const focus = /* @__PURE__ */ new Set();
      for (let branch = branches[hover2 ?? selected2]; branch; branch = branches[branch.parent]) focus.add(branch.index);
      for (const branch of branches) {
        const grown = growth(branch.index);
        if (grown <= 0) continue;
        const age = onsets2.get(branch.index) ?? Infinity;
        const flash = age < 1.05 ? 1 - age / 1.05 : 0;
        const live = active.has(branch.index);
        const focused = focus.has(branch.index);
        const cut = marked?.has(branch.index);
        const played = playing && branch.end <= time;
        const presence = !playing ? 0.86 : live ? 1 : played ? 0.56 : 0.34;
        const weight = Math.max(0.8, 8.8 * 0.69 ** branch.depth);
        const glowHue = cut ? 352 : hue;
        ctx.globalAlpha = presence;
        if (grown < 1) {
          const count = Math.max(2, Math.ceil(branch.samples.length * grown));
          ctx.beginPath();
          branch.samples.slice(0, count).forEach((point, i) => ctx[i ? "lineTo" : "moveTo"](point.x, point.y));
          ctx.lineWidth = weight * 0.9;
          ctx.strokeStyle = tint(hue, 82, 0.95);
          ctx.stroke();
          const tip = branch.samples[count - 1];
          halo(ctx, tip.x, tip.y, 14, hue, 0.5);
          continue;
        }
        if (branch.stem) {
          ctx.fillStyle = tint(hue + 23, 25, 0.68);
          ctx.fill(branch.stem);
        }
        const bright = live || focused || cut ? 1 : 0;
        const gradient = ctx.createLinearGradient(branch.x, branch.y, branch.endX, branch.endY);
        gradient.addColorStop(0, tint(glowHue + 12, 56, 0.72 + bright * 0.28));
        gradient.addColorStop(1, tint(glowHue - 7, 86, 0.98));
        ctx.lineWidth = weight * (3.05 + 1.65 * flash + (live ? 1.2 : 0));
        ctx.strokeStyle = tint(glowHue, 66, 0.055 + flash * 0.19 + bright * 0.12);
        ctx.stroke(branch.curve);
        ctx.lineWidth = weight * 1.7;
        ctx.strokeStyle = tint(glowHue, 72, 0.15 + flash * 0.23 + (live ? 0.12 : 0));
        ctx.stroke(branch.curve);
        ctx.lineWidth = weight * (0.72 + flash * 0.48 + (live ? 0.25 : 0));
        ctx.strokeStyle = gradient;
        ctx.stroke(branch.curve);
        if (branch.depth < 3) {
          for (const side of [-1, 1]) {
            const wisp = side * weight * 0.62;
            ctx.lineWidth = 0.75;
            ctx.strokeStyle = tint(hue + side * 10, 76, 0.38 + flash * 0.23);
            ctx.beginPath();
            ctx.moveTo(branch.x + wisp * 0.36, branch.y);
            ctx.quadraticCurveTo(branch.controlX + wisp, branch.controlY, branch.endX + wisp * 0.1, branch.endY);
            ctx.stroke();
          }
        }
        if (branch.cut) {
          ctx.strokeStyle = tint(hue, 88, 0.9);
          ctx.lineWidth = 1.2;
          ring(ctx, branch.endX, branch.endY, 4.2, 4.2);
          ctx.fillStyle = tint(hue, 90, 0.35);
          ctx.beginPath();
          ctx.arc(branch.endX, branch.endY, 2.1, 0, TAU);
          ctx.fill();
        } else if (branch.leaf || flash > 0 || focused) {
          const radius = 1.25 + flash * 3.6 + (focused ? 1.12 : 0);
          halo(ctx, branch.endX, branch.endY, radius * 5.8, hue, 0.34 + flash * 0.35);
          ctx.fillStyle = tint(hue + 10, 94, 0.95);
          ctx.beginPath();
          ctx.arc(branch.endX, branch.endY, radius, 0, TAU);
          ctx.fill();
        }
        if (flash > 0 && !reduced) {
          const radius = 4 + age * 53;
          ctx.strokeStyle = tint(hue, 86, flash * 0.52);
          ctx.lineWidth = 1;
          ring(ctx, branch.endX, branch.endY, radius, radius);
        }
      }
      ctx.globalAlpha = 1;
      if (playing) {
        for (const node of stack) {
          const branch = branches[node.index];
          if (!branch || growth(branch.index) < 1) continue;
          const progress = Math.max(0, Math.min(1, (time - node.start) / (node.end - node.start)));
          const point = pointOn(branch, progress);
          halo(ctx, point.x, point.y, 16 - Math.min(9, branch.depth * 1.4), hue, 0.7);
          ctx.fillStyle = tint(hue + 8, 96, 1);
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(1.6, 3.4 - branch.depth * 0.3), 0, TAU);
          ctx.fill();
        }
      }
      const opening = Math.min(1, growing / growSeconds);
      for (const spark of this.sparks) {
        const branch = branches[spark.branch];
        if (!branch || growth(branch.index) < 1) continue;
        const age = onsets2.get(spark.branch) ?? Infinity;
        const lift = reduced || age > 1.6 ? 0 : 1 - age / 1.6;
        const drift2 = reduced ? 0 : Math.sin(now * 0.7 + spark.angle * 3) * 2.2;
        const x = branch.endX + spark.dx * (1 + lift * 0.4) + drift2;
        const y = branch.endY + spark.dy * (1 + lift * 0.4) - lift * 6;
        const alpha = spark.alpha * opening * (playing && !active.has(spark.branch) ? 0.55 + lift * 0.45 : 1);
        const color = spark.amber ? hue > 220 ? 323 : 53 : hue + 10;
        if (spark.size >= 1.6) halo(ctx, x, y, spark.size * 4, color, alpha * 0.54);
        ctx.fillStyle = tint(color, 88, alpha);
        ctx.beginPath();
        ctx.ellipse(x, y, spark.size * (spark.amber ? 1.35 : 1), spark.size * 0.64, spark.angle, 0, TAU);
        ctx.fill();
      }
      halo(ctx, baseX, baseY, 34, hue, 0.61);
      ctx.fillStyle = tint(hue, 94, 0.9);
      ctx.beginPath();
      ctx.ellipse(baseX, baseY, 7.1, 1.45, 0, 0, TAU);
      ctx.fill();
      if (!reduced) this.drawPointer(ctx, hue, now, cursor2, trail2, hover2, tool2);
    }
    drawPointer(ctx, hue, now, cursor2, trail2, hover2, tool2) {
      for (let i = 1; i < trail2.length; i++) {
        const point = trail2[i];
        const opacity = 1 - (now - point.time) / 0.46;
        if (opacity <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(trail2[i - 1].x, trail2[i - 1].y);
        ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = tint(hue, 87, opacity * 0.59);
        ctx.lineWidth = 2 * opacity;
        ctx.stroke();
      }
      if (!cursor2) return;
      const prune = tool2 === "prune";
      ctx.strokeStyle = prune ? "hsla(352, 80%, 78%, " + (hover2 === null ? 0.4 : 0.95) + ")" : tint(hue, 89, hover2 === null ? 0.32 : 0.92);
      ctx.lineWidth = 1;
      const radius = hover2 === null ? 8 : 12;
      ring(ctx, cursor2.x, cursor2.y, radius, radius);
      if (prune) {
        ctx.beginPath();
        ctx.moveTo(cursor2.x - 5, cursor2.y - 5);
        ctx.lineTo(cursor2.x + 5, cursor2.y + 5);
        ctx.moveTo(cursor2.x + 5, cursor2.y - 5);
        ctx.lineTo(cursor2.x - 5, cursor2.y + 5);
        ctx.stroke();
      }
    }
    coords(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }
    hit({ x, y }) {
      let closest = null;
      let distance = 14 ** 2;
      for (const branch of this.targets) {
        for (const point of branch.samples) {
          const squared = (x - point.x) ** 2 + (y - point.y) ** 2;
          if (squared < distance) {
            distance = squared;
            closest = branch.index;
          }
        }
      }
      return closest;
    }
    // A still frame of the tree with its recipe, for sharing.
    postcard(lines) {
      if (this.lastFrame) this.draw({ ...this.lastFrame, cursor: null, trail: [] });
      const { width, height } = this;
      const scale = 2;
      const card = document.createElement("canvas");
      card.width = Math.round(width * scale);
      card.height = Math.round(height * scale);
      const ctx = card.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#081119";
      ctx.fillRect(0, 0, width, height);
      if (this.photo.complete && this.photo.naturalWidth) {
        const cover = Math.max(width / this.photo.naturalWidth, height / this.photo.naturalHeight);
        const w = this.photo.naturalWidth * cover;
        const h = this.photo.naturalHeight * cover;
        ctx.drawImage(this.photo, (width - w) / 2, (height - h) / 2, w, h);
      }
      if (this.water.ready) {
        ctx.globalCompositeOperation = "screen";
        ctx.drawImage(this.water.canvas, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(this.backdrop, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(this.canvas, 0, 0, width, height);
      const shade = ctx.createLinearGradient(0, height * 0.6, 0, height);
      shade.addColorStop(0, "#05090f00");
      shade.addColorStop(1, "#05090fd0");
      ctx.fillStyle = shade;
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      ctx.fillStyle = "#e9f1ed";
      ctx.font = "400 34px Georgia, serif";
      ctx.fillText(lines[0], 28, height - 58);
      ctx.font = '500 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = this.score.scene.accent;
      ctx.fillText(lines[1], 30, height - 32);
      return card;
    }
  };

  // src/player.mjs
  var lookahead = 1.6;
  function audioSession(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch {
    }
  }
  var Player = class {
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
        audioSession("playback");
        const context = new AudioContext({ latencyHint: "playback" });
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
      if (this.context.state !== "running") await this.context.resume();
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
      const fade = sceneKey === "cedar" && !this.bed ? 0.9 : 3.5;
      this.bed?.stop(now, 3);
      this.bed = { scene: sceneKey, ...startAmbience(this.context, this.engine, sceneKey, now + 0.05, fade) };
    }
    stopAmbience(fade) {
      this.bed?.stop(this.now, fade);
      this.bed = null;
    }
    makeCycle(score2, start2, from) {
      const context = this.context;
      const music = context.createGain();
      const sparkle = context.createGain();
      music.connect(this.engine.music);
      sparkle.connect(this.engine.sparkle);
      const cycle = { score: score2, start: start2, music, sparkle, cursor: 0, joined: false, fading: false };
      const now = this.now;
      const active = from > 0 ? new Set(stackAt(score2, from).map((branch) => soundingNote(branch, from))) : null;
      for (const note of score2.events) {
        if (note.at >= from) break;
        cycle.cursor++;
        if (active?.has(note) && note.end > from) {
          playNote(context, { music, sparkle }, score2.scene, note, now + 0.03, { hold: note.end - from, gain: 0.75 });
        }
      }
      return cycle;
    }
    play(score2, position = 0) {
      if (!this.context) return;
      position = Math.min(score2.cycle - 0.05, Math.max(0, position));
      this.fadeAll(0.9);
      const start2 = this.now + 0.06 - position;
      this.cycles.push(this.makeCycle(score2, start2, position));
      this.playing = true;
      this.schedule();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 110);
    }
    // Swap in a changed tree at the same point in its cycle.
    replace(score2) {
      if (!this.playing) return;
      const current = this.current();
      const position = current ? (this.now - current.start) * score2.cycle / current.score.cycle : 0;
      this.play(score2, Math.min(position, score2.cycle - 0.05));
    }
    pause() {
      const current = this.current();
      const position = current ? this.now - current.start : 0;
      this.playing = false;
      clearInterval(this.timer);
      this.fadeAll(0.6);
      return { score: current?.score, position };
    }
    fadeAll(seconds2) {
      const now = this.now;
      for (const cycle of this.cycles) {
        if (cycle.fading) continue;
        cycle.fading = true;
        for (const bus of [cycle.music, cycle.sparkle]) {
          bus.gain.cancelScheduledValues(now);
          bus.gain.setValueAtTime(bus.gain.value, now);
          bus.gain.linearRampToValueAtTime(0, now + seconds2);
        }
        setTimeout(() => {
          cycle.music.disconnect();
          cycle.sparkle.disconnect();
        }, (seconds2 + 0.3) * 1e3);
      }
      this.cycles = [];
    }
    stopAfterCurrent() {
      const current = this.current();
      if (!current) return;
      current.joined = false;
      this.cycles = this.cycles.filter((cycle) => {
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
        const { score: score2 } = cycle;
        while (cycle.cursor < score2.events.length && cycle.start + score2.events[cycle.cursor].at < horizon) {
          const note = score2.events[cycle.cursor++];
          const scheduled = cycle.start + note.at;
          const actual = Math.max(now + 0.01, scheduled);
          if (scheduled >= now) playNote(this.context, cycle, score2.scene, note, actual);
          else if (cycle.start + note.end > actual) {
            playNote(this.context, cycle, score2.scene, note, actual, { hold: cycle.start + note.end - actual, gain: 0.75 });
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
      this.cycles = this.cycles.filter((cycle) => {
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
      return this.cycles.find((cycle) => now >= cycle.start && now < cycle.start + cycle.score.cycle) ?? this.cycles.find((cycle) => now < cycle.start + cycle.score.cycle) ?? null;
    }
    position() {
      const cycle = this.current();
      return cycle ? { score: cycle.score, time: Math.max(0, this.now - cycle.start) } : null;
    }
    // A play-along or tapped note, heard immediately.
    touch(scene, note, isBranch = false) {
      if (!this.context) return;
      const options = isBranch ? { tap: true, hold: note.depth < 2 ? 0.85 : 0.48, gain: 1.2 } : { preview: true };
      playNote(this.context, this.engine, scene, note, this.now + 0.012, options);
    }
    startRecording() {
      if (!this.tap || typeof MediaRecorder === "undefined") return false;
      const chunks = [];
      try {
        const recorder = new MediaRecorder(this.tap.stream);
        recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
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
      if (!session || session.recorder.state === "inactive") return Promise.resolve(null);
      return new Promise((resolve) => {
        session.recorder.onstop = () => resolve(new Blob(session.chunks, { type: session.recorder.mimeType || "audio/webm" }));
        session.recorder.onerror = () => resolve(null);
        session.recorder.stop();
      });
    }
  };

  // src/app.mjs
  var byId = (id) => document.getElementById(id);
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  var sliders = ["depth", "sway", "spread", "taper", "cycle"];
  var letters = "asdfghjk";
  var words = ["moss", "ember", "tide", "lantern", "willow", "heron", "dusk", "fern", "harbor", "quiet", "solace", "drizzle", "lotus", "meadow", "nocturne", "driftwood", "firefly", "monsoon", "kite", "saffron"];
  var labels = {
    depth: (value) => value + " levels",
    sway: (value) => value + " / " + (100 - value),
    spread: (value) => value + "° · " + intervalFor(value).name,
    taper: (value) => value + "%",
    cycle: (value) => value + " s",
    nature: (value) => value === 0 ? "Off" : value + "%"
  };
  var body = document.body;
  var playButton = byId("play");
  var miniPlayer = byId("mini-player");
  var pastStage = false;
  var screenLock = null;
  var seek = byId("seek");
  var volume = byId("volume");
  var nature = byId("nature");
  var waterSounds = byId("water-sounds");
  var icicle = byId("icicle");
  var melodyDialog = byId("melody-dialog");
  var melodyInput = byId("melody-file");
  var undoButton = byId("undo-tree");
  var waterPreference = "stillwater.water-sounds";
  var naturePreference = "stillwater.nature";
  var seconds = () => performance.now() / 1e3;
  var settings;
  var focusPath = null;
  var score;
  var drift = false;
  var tool = "play";
  var pausedAt = 0;
  var lastCycle = null;
  var warm = false;
  var waterEnabled = true;
  var hover = null;
  var selected = null;
  var cursor = null;
  var stroke = null;
  var trail = [];
  var onsets = /* @__PURE__ */ new Map();
  var echoes = [];
  var previousStack = /* @__PURE__ */ new Set();
  var previousLead = null;
  var stackKey = "";
  var frame = 0;
  var activeUntil = 0;
  var replaceTimer;
  var seekTimer;
  var sleepTimer;
  var idleTimer;
  var noticeTimer;
  var rememberedVolume = Number(volume.value);
  var busy = false;
  var version = 0;
  var startRequest;
  var melodyDraft = [];
  var melodyRequest = 0;
  var treeHistory = [];
  var editedSlider = null;
  var stepping = null;
  var steppedAt = 0;
  var sourceKey = "";
  var sourceRule = "binary";
  var topLine = 0;
  var quietListening = () => body.dataset.calm === "true" || Number(byId("sleep").value) > 0;
  var player = new Player({
    next: (previous) => drift ? buildScore(previous.generation + 1) : quietListening() ? previous : null,
    onEnd: () => {
      pausedAt = 0;
      finishPlayback(1.4);
    }
  });
  var garden = new Garden(byId("garden"), () => paint());
  function buildScore(generation) {
    let next = compose({ ...settings, generation });
    if (focusPath) {
      const index = next.branches.findIndex((branch) => branch.path === focusPath);
      if (index > 0) next = focusOn(next, index);
      else focusPath = null;
    }
    next.version = version;
    return next;
  }
  function notify(message) {
    clearTimeout(noticeTimer);
    const notice = byId("notice");
    notice.textContent = message;
    notice.classList.add("visible");
    noticeTimer = setTimeout(() => notice.classList.remove("visible"), 4200);
  }
  function fillRange(input) {
    const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty("--fill", 100 * ratio + "%");
  }
  function setIcon(button, icon, label) {
    button.querySelector("use").setAttribute("href", "#icon-" + icon);
    if (label) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }
  var level = () => Number(volume.value) / 100;
  async function wake(fade = 2.2) {
    await player.ensure(score.seed);
    if (!warm) {
      warm = true;
      player.setNature(Number(nature.value) / 100);
      player.setVolume(level(), fade);
    }
  }
  async function start(position = 0, grow = false) {
    const request = {};
    startRequest = request;
    try {
      await wake();
      if (startRequest !== request) return;
      player.ambience(settings.scene);
    } catch (error) {
      if (startRequest !== request) return;
      startRequest = null;
      console.error(error);
      notify("Audio is unavailable in this browser.");
      return;
    }
    startRequest = null;
    stepping = null;
    if (grow && !reducedMotion.matches) garden.setScore(score, "grow");
    player.play(score, Math.min(position, score.cycle - 0.05));
    body.dataset.playing = "true";
    updatePlay();
    paint();
  }
  function finishPlayback(fade) {
    startRequest = null;
    clearTimeout(seekTimer);
    clearTimeout(replaceTimer);
    player.stopAmbience(fade);
    player.setVolume(0, fade);
    warm = false;
    body.dataset.playing = "false";
    clearTimeout(sleepTimer);
    byId("sleep").value = "0";
    updatePlay();
    paint();
  }
  function pause() {
    const { position } = player.pause();
    pausedAt = Math.max(0, Math.min(position, score.cycle - 0.05));
    finishPlayback(0.7);
  }
  function togglePlay() {
    if (player.playing || startRequest) pause();
    else start(pausedAt);
  }
  function updatePlay() {
    setIcon(playButton, player.playing ? "pause" : "play", player.playing ? "Pause score" : "Play score");
    setIcon(byId("mini-play"), player.playing ? "pause" : "play", player.playing ? "Pause score" : "Play score");
    holdScreen(player.playing);
    byId("tool-play").setAttribute("aria-pressed", String(tool === "play" && !player.playing));
  }
  function currentTime() {
    if (!player.playing) return pausedAt;
    const cycle = player.current();
    if (!cycle) return 0;
    return Math.max(0, Math.min(score.cycle, player.now - cycle.start));
  }
  function applySettings(next, mode = "morph", generation = score?.generation ?? 0) {
    clearTimeout(seekTimer);
    const previousScene = settings?.scene;
    settings = normalize(next);
    stepping = null;
    version++;
    score = buildScore(generation);
    garden.setScore(score, reducedMotion.matches ? "none" : mode);
    showSettings();
    buildKeys();
    syncHash();
    if (player.playing) {
      clearTimeout(replaceTimer);
      replaceTimer = setTimeout(() => player.replace(score), 160);
      if (previousScene !== settings.scene) player.ambience(settings.scene);
    } else {
      pausedAt = Math.min(pausedAt, score.cycle - 0.05);
    }
    paint();
  }
  function rememberTree() {
    treeHistory.push({ settings, focus: focusPath, generation: score.generation });
    if (treeHistory.length > 20) treeHistory.shift();
    undoButton.disabled = false;
  }
  function editTree(next, mode, generation, focus = focusPath) {
    editedSlider = null;
    rememberTree();
    focusPath = focus;
    applySettings(next, mode, generation);
  }
  function undoTree() {
    const previous = treeHistory.pop();
    if (!previous) return;
    editedSlider = null;
    undoButton.disabled = treeHistory.length === 0;
    focusPath = previous.focus;
    applySettings(previous.settings, "morph", previous.generation);
    notify("Tree edit undone.");
  }
  function showSettings() {
    for (const key of sliders) {
      const input = byId(key);
      input.value = settings[key];
      const text2 = labels[key](settings[key]);
      byId(key + "-value").textContent = text2;
      input.setAttribute("aria-valuetext", text2);
      fillRange(input);
    }
    if (document.activeElement !== byId("seed")) byId("seed").value = settings.seed;
    const scene = scenes[settings.scene];
    for (const button of document.querySelectorAll("[data-scene]")) {
      button.setAttribute("aria-pressed", String(button.dataset.scene === settings.scene));
    }
    for (const button of document.querySelectorAll("[data-rule]")) {
      button.setAttribute("aria-pressed", String(button.dataset.rule === settings.rule));
    }
    renderRuleSource(settings.rule);
    byId("scene-name").textContent = scene.name;
    const melody = settings.melody.length;
    byId("scene-scale").textContent = melody ? "Melody seed · " + melody + " notes" : scene.scaleName;
    byId("melody-trigger-label").textContent = melody ? "Melody seed · " + melody + " notes" : "Plant a melody";
    showAmbience();
    document.documentElement.style.setProperty("--accent", scene.accent);
    const callCount = score.branches.length + (score.branches.length === 1 ? " call" : " calls");
    byId("branch-count").textContent = callCount;
    seek.max = score.cycle;
    byId("duration").textContent = clock(score.cycle);
    const inside = score.focus;
    byId("focus-bar").hidden = !inside;
    if (inside) byId("focus-label").textContent = "Inside " + describe({ path: inside }) + " · " + callCount;
    byId("cycle-label").textContent = inside ? "Inside a branch · generation " + (score.generation + 1) : "Generation " + (score.generation + 1);
  }
  function scoreHash() {
    return toHash(settings, focusPath, score.generation, {
      nature: Number(nature.value),
      volume: Number(volume.value),
      water: waterEnabled
    });
  }
  function syncHash() {
    try {
      history.replaceState(null, "", scoreHash());
    } catch {
    }
  }
  function updateVolume() {
    if (Number(volume.value)) rememberedVolume = Number(volume.value);
    if (warm) player.setVolume(level());
    setIcon(byId("mute"), Number(volume.value) ? "volume" : "muted", Number(volume.value) ? "Mute" : "Unmute");
    fillRange(volume);
  }
  function readMix(mix = {}) {
    if (mix.volume !== void 0) volume.value = mix.volume;
    if (mix.nature !== void 0) nature.value = mix.nature;
    if (mix.water !== void 0) waterEnabled = mix.water;
    player.setWater(waterEnabled);
  }
  function showAmbience() {
    const scene = settings.scene;
    const label = byId("scene-ambience");
    const silent = Number(nature.value) === 0;
    waterSounds.disabled = scene === "orchid";
    waterSounds.checked = !waterSounds.disabled && !silent && waterEnabled;
    label.textContent = silent ? "Ambience off" : !waterEnabled && scene === "lagoon" ? "Crickets" : !waterEnabled && scene === "cedar" ? "Rain muted" : scenes[scene].ambience;
  }
  function updateNature() {
    const amount = Number(nature.value);
    byId("nature-value").textContent = labels.nature(amount);
    nature.setAttribute("aria-valuetext", labels.nature(amount));
    fillRange(nature);
    showAmbience();
    player.setNature(amount / 100);
    if (amount === 0) player.stopAmbience(0.32);
    else if (player.playing) player.ambience(settings.scene);
  }
  function saveNature() {
    try {
      localStorage.setItem(naturePreference, nature.value);
    } catch {
    }
  }
  function chooseScene(key) {
    if (key !== settings.scene) editTree({ ...settings, scene: key });
  }
  function showMelodyDraft(notes, message) {
    melodyDraft = notes;
    const list = byId("melody-notes");
    list.replaceChildren(...notes.map(([midi]) => {
      const item = document.createElement("li");
      item.textContent = noteName(midi);
      return item;
    }));
    list.hidden = !notes.length;
    byId("melody-apply").disabled = !notes.length;
    byId("melody-status").textContent = message;
  }
  async function scanMelody(file) {
    const request = ++melodyRequest;
    if (file && file.size > 12 * 1024 * 1024) {
      showMelodyDraft([], "Choose an audio clip under 12 MB.");
      return;
    }
    showMelodyDraft([], "Finding the notes…");
    try {
      const { notes, trimmed } = file ? await readMelodyFile(file) : { notes: detectMelody(melodyExample()) };
      if (request !== melodyRequest || !melodyDialog.open) return;
      if (new Set(notes.map(([midi]) => midi)).size < 2) {
        showMelodyDraft([], "No clear melody found. Try humming a few notes or playing a solo instrument.");
        return;
      }
      showMelodyDraft(notes, notes.length + " notes detected" + (trimmed ? " in the first 12 seconds." : "."));
    } catch {
      if (request === melodyRequest && melodyDialog.open) {
        showMelodyDraft([], "This clip could not be read. Try a WAV or MP3 file.");
      }
    }
  }
  var hum = null;
  var humSeconds = 10;
  function showHum(active, level2 = 0) {
    const button = byId("melody-hum");
    button.setAttribute("aria-pressed", String(active));
    button.querySelector("span").textContent = active ? "Stop and find notes" : "Hum a melody";
    setIcon(button, active ? "stop" : "mic");
    byId("hum-level").style.setProperty("--level", level2.toFixed(3));
  }
  async function startHum() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showMelodyDraft([], "The microphone is unavailable here. Open the online version, or choose a clip.");
      return;
    }
    if (player.playing || startRequest) pause();
    audioSession("play-and-record");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch {
      audioSession("playback");
      showMelodyDraft([], "Microphone access was not allowed. You can choose a clip instead.");
      return;
    }
    if (!melodyDialog.open) {
      stream.getTracks().forEach((track) => track.stop());
      audioSession("playback");
      return;
    }
    melodyRequest++;
    melodyInput.value = "";
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    const meter = new AudioContext();
    meter.resume().catch(() => {
    });
    const analyser = meter.createAnalyser();
    analyser.fftSize = 1024;
    meter.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const began = performance.now();
    let discard = false;
    let level2 = 0;
    const session = {
      stop(cancel = false) {
        discard = cancel;
        if (recorder.state !== "inactive") recorder.stop();
      }
    };
    hum = session;
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      cancelAnimationFrame(session.frame);
      clearTimeout(session.timer);
      stream.getTracks().forEach((track) => track.stop());
      audioSession("playback");
      meter.close();
      if (hum === session) hum = null;
      showHum(false);
      if (discard) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (!blob.size) showMelodyDraft([], "Nothing was captured. Try humming again.");
      else scanMelody(blob);
    };
    const listen = () => {
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      level2 = Math.max(Math.min(1, Math.sqrt(energy / samples.length) * 6), level2 * 0.82);
      const left = Math.max(0, Math.ceil(humSeconds - (performance.now() - began) / 1e3));
      showHum(true, level2);
      byId("melody-status").textContent = "Listening. Hum or whistle a few clear notes · " + left + " s";
      session.frame = requestAnimationFrame(listen);
    };
    recorder.start(250);
    session.timer = setTimeout(() => session.stop(), humSeconds * 1e3);
    showMelodyDraft([], "Listening. Hum or whistle a few clear notes.");
    listen();
  }
  function useMelody(melody) {
    melodyRequest++;
    melodyDialog.close();
    pausedAt = 0;
    editTree({ ...settings, melody }, "grow", 0, null);
    if (player.playing) {
      clearTimeout(replaceTimer);
      player.play(score, 0);
    }
    playButton.focus({ preventScroll: true });
    byId("art").scrollIntoView({ block: "start", behavior: "instant" });
    notify(melody.length ? "Melody planted. Tap the branches or play the score." : "Melody removed. The scene’s tuning is back.");
  }
  function togglePrune(index) {
    const branch = score.branches[index];
    if (!branch) return;
    if (branch.parent === null) {
      notify("The first call cannot be pruned. Try one of its branches.");
      return;
    }
    const pruned = new Set(settings.pruned);
    if (pruned.has(branch.path)) {
      pruned.delete(branch.path);
      notify(describe(branch) + " regrows. Its calls return.");
    } else if (branch.leaf) {
      notify(describe(branch) + " is already a base case.");
      return;
    } else {
      pruned.add(branch.path);
      notify(describe(branch) + " becomes a base case. Its descendant notes drop out.");
    }
    editTree({ ...settings, pruned: [...pruned] });
    onsets.set(index, seconds());
    if (Number(volume.value) > 0) {
      const target = score;
      wake(0.06).then(() => {
        if (score === target) player.touch(target.scene, branch, true);
      }).catch(() => {
      });
    }
  }
  function listenInside(index) {
    const branch = score.branches[index];
    if (!branch || branch.parent === null) return;
    focusPath = branch.path;
    applySettings(settings);
    notify("Listening inside " + describe(branch) + ". Its span is stretched to a full cycle.");
  }
  function leaveInside() {
    focusPath = null;
    applySettings(settings);
  }
  async function touch(index) {
    const target = score;
    const branch = score.branches[index];
    if (!branch) return;
    const now = seconds();
    onsets.set(index, now);
    echoes.push({ time: now, pan: branch.pan, strength: 1 });
    selected = index;
    paint();
    try {
      await wake(0.09);
      if (score === target) player.touch(target.scene, branch, true);
    } catch (error) {
      console.error(error);
    }
  }
  async function touchWater(point) {
    const target = score;
    const width = Math.max(1, garden.width);
    const ratio = Math.max(0, Math.min(1, point.x / width));
    const pan = Math.max(-0.8, Math.min(0.8, (ratio - 0.5) * 1.6));
    const scale = target.scene.scale;
    const degree = Math.min(scale.length - 1, Math.floor(ratio * scale.length));
    const midi = target.scene.root + 24 + scale[degree] + target.shift;
    echoes.push({ time: seconds(), pan, strength: 0.9 });
    paint();
    try {
      await wake(0.06);
      if (score === target) player.touch(target.scene, { midi, depth: 7, pan, velocity: 0.62, start: 0, end: 0.45 }, true);
    } catch {
    }
  }
  function keyNote(index) {
    const scene = score.scene;
    let midi;
    if (score.melody) {
      const keys2 = score.melody.keys;
      const firstOctave = keys2.length < 4 ? -1 : 0;
      midi = keys2[index % keys2.length] + 12 * (firstOctave + Math.floor(index / keys2.length));
    } else {
      const octave = Math.floor(index / scene.scale.length);
      midi = scene.root + 12 + 12 * octave + scene.scale[index % scene.scale.length] + score.shift;
    }
    return { midi, depth: 4, pan: (index - 3.5) / 6, velocity: 0.95, start: 0, end: 1 };
  }
  function buildKeys() {
    const shortcuts = byId("shortcuts").checked;
    byId("keys").replaceChildren(...[...letters].map((letter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "key";
      if (shortcuts) button.setAttribute("aria-keyshortcuts", letter.toUpperCase());
      const kbd = document.createElement("kbd");
      kbd.textContent = letter.toUpperCase();
      button.append(kbd, document.createTextNode(noteName(keyNote(index).midi)));
      button.addEventListener("click", () => playKey(index));
      return button;
    }));
    byId("keys").parentElement.dataset.shortcuts = String(shortcuts);
  }
  async function playKey(index) {
    const target = score;
    const button = byId("keys").children[index];
    button?.classList.add("active");
    setTimeout(() => button?.classList.remove("active"), 200);
    const note = keyNote(index);
    echoes.push({ time: seconds(), pan: note.pan, strength: 0.8 });
    paint();
    try {
      await wake(0.09);
      if (score === target) player.touch(target.scene, note);
    } catch (error) {
      console.error(error);
    }
  }
  function breathAt(stack, time) {
    if (!byId("breathe").checked || !player.playing) return null;
    const guide = stack.filter((node) => node.parent !== null && node.end - node.start >= 3).at(-1);
    if (!guide) return null;
    const progress = Math.max(0, Math.min(1, (time - guide.start) / (guide.end - guide.start)));
    const smooth = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    const last = guide.path.slice(-1);
    const phase = last === "L" ? "in" : last === "M" ? "hold" : "out";
    const amount = phase === "in" ? smooth : phase === "hold" ? 0.92 + 0.08 * Math.sin(Math.PI * progress) : 1 - smooth;
    return { inhale: phase === "in", phase, amount };
  }
  var ruleSources = {
    binary: [
      [1, '<span class="k">function</span> grow(call) {'],
      [2, "  sound(call);"],
      [3, '  <span class="k">if</span> (baseCase(call))'],
      [4, '    <span class="k">return</span>;'],
      [5, "  grow(left(call));"],
      [6, "  grow(right(call));"],
      [7, "}"]
    ],
    fibonacci: [
      [1, '<span class="k">function</span> grow(call, n) {'],
      [2, "  sound(call);"],
      [3, '  <span class="k">if</span> (n &lt;= 0 || cut(call))'],
      [4, '    <span class="k">return</span>;'],
      [5, "  grow(left(call), n - 1);"],
      [6, "  grow(right(call), n - 2);"],
      [7, "}"]
    ],
    ternary: [
      [1, '<span class="k">function</span> grow(call) {'],
      [2, "  sound(call);"],
      [3, '  <span class="k">if</span> (baseCase(call))'],
      [4, '    <span class="k">return</span>;'],
      [5, "  grow(left(call));"],
      [6, "  grow(mid(call));"],
      [7, "  grow(right(call));"],
      [8, "}"]
    ]
  };
  function renderRuleSource(rule) {
    if (rule === sourceRule) return;
    sourceRule = rule;
    sourceKey = "";
    const list = byId("source");
    list.replaceChildren(...(ruleSources[rule] ?? ruleSources.binary).map(([line, html]) => {
      const item = document.createElement("li");
      item.dataset.line = String(line);
      const code = document.createElement("code");
      code.innerHTML = html;
      item.append(code);
      return item;
    }));
  }
  function callChain(branch) {
    const chain = [];
    for (let node = branch; node; node = score.branches[node.parent]) chain.unshift(node);
    return chain;
  }
  function renderSource(stack, lines) {
    const key = stack.map((node, i) => node.depth + ":" + lines[i]).join(".");
    if (key === sourceKey) return;
    sourceKey = key;
    const top = lines.at(-1) ?? 0;
    const rows = byId("source").children;
    for (const row of rows) {
      const line = Number(row.dataset.line);
      const here = stack.filter((_, i) => lines[i] === line);
      let frames = row.querySelector(".frames");
      if (!frames) {
        frames = document.createElement("span");
        frames.className = "frames";
        frames.setAttribute("aria-hidden", "true");
        row.prepend(frames);
      }
      const shown = here.length > 3 ? [{ count: here.length }] : here;
      frames.replaceChildren(...shown.map((node) => {
        const marker = document.createElement("i");
        marker.textContent = node.count ? "×" + node.count : node.depth;
        if (node.count) marker.className = "count";
        else if (node === stack.at(-1)) marker.className = "top";
        return marker;
      }));
      row.classList.toggle("held", here.length > 0);
      row.classList.toggle("on", line === top && stack.length > 0);
      if (line === 2 && top === 2 && topLine !== 2 && !reducedMotion.matches) {
        row.classList.remove("flash");
        void row.offsetWidth;
        row.classList.add("flash");
      }
    }
    topLine = top;
  }
  function stepCall() {
    if (player.playing || startRequest) pause();
    const calls = score.branches;
    let next;
    if (stepping !== null) next = stepping + 1;
    else if (pausedAt > 0) next = (stackAt(score, pausedAt).at(-1)?.index ?? -1) + 1;
    else next = 0;
    if (next >= calls.length) {
      stepping = null;
      pausedAt = 0;
      selected = null;
      notify(describe(calls[0]) + " returned. All " + calls.length + " calls have run. Step again to start over.");
      paint();
      return;
    }
    stepping = next;
    steppedAt = seconds();
    pausedAt = calls[next].start;
    const branch = calls[next];
    const why = branch.cut ? "pruned, so it is a base case" : branch.children.length ? "it calls left, then right" : "it is a base case";
    byId("step-status").textContent = "Step " + (next + 1) + " of " + calls.length + ": " + describe(branch) + " sounds " + noteName(branch.midi) + ". " + why + ".";
    touch(next);
  }
  function renderStack(stack, time, lines = []) {
    const count = byId("active-count");
    const countLabel = stack.length === 0 ? "Idle" : player.playing ? stack.length + " active" : stepping !== null ? "Step " + (stepping + 1) + " / " + score.branches.length : "Paused";
    if (count.textContent !== countLabel) count.textContent = countLabel;
    const beats = stack.map((branch) => soundingNote(branch, time).midi);
    const key = stack.map((node) => node.index).join(".") + "|" + beats.join(".") + "|" + lines.join("") + "|" + score.version + "|" + score.generation + "|" + (score.focus ?? "");
    const list = byId("stack");
    if (key !== stackKey) {
      stackKey = key;
      list.replaceChildren(...stack.map((node, index) => {
        const item = document.createElement("li");
        item.dataset.index = String(node.index);
        item.title = "Click to play · Double-click to listen inside";
        item.style.setProperty("--depth", node.depth);
        const name = document.createElement("span");
        name.className = "frame-name";
        name.textContent = describe(node);
        if (lines[index]) {
          const line = document.createElement("span");
          line.className = "frame-line";
          line.textContent = ":" + lines[index];
          name.append(line);
        }
        const note = document.createElement("span");
        note.className = "frame-note";
        note.textContent = noteName(beats[index]);
        item.append(name, note);
        if (node.cut) item.classList.add("cut");
        if (node.melodyLead) item.classList.add("melodic");
        return item;
      }));
      if (!stack.length) {
        const item = document.createElement("li");
        item.className = "idle";
        item.textContent = "Play the score to see the active calls.";
        list.append(item);
      }
    }
    [...list.children].forEach((item, i) => {
      const node = stack[i];
      if (!node) return;
      const progress = Math.max(0, Math.min(1, (time - node.start) / (node.end - node.start)));
      item.style.setProperty("--progress", progress.toFixed(3));
    });
  }
  function drawIcicle(stack, time) {
    const rect = icicle.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (icicle.width !== width || icicle.height !== height) {
      icicle.width = width;
      icicle.height = height;
    }
    const ctx = icicle.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const accent = scenes[settings.scene].accent;
    const levels2 = Math.max(...score.branches.map((branch) => branch.depth)) + 1;
    const row = rect.height / levels2;
    const active = new Set(stack.map((node) => node.index));
    const started = player.playing || pausedAt > 0;
    for (const branch of score.branches) {
      const x = branch.start / score.cycle * rect.width;
      const w = Math.max(1, (branch.end - branch.start) / score.cycle * rect.width - 1);
      const lit = active.has(branch.index);
      const done = started && branch.end <= time;
      ctx.globalAlpha = lit ? 0.95 : done ? 0.42 : 0.17;
      ctx.fillStyle = branch.cut ? "#f0b3bc" : accent;
      ctx.fillRect(x, branch.depth * row + 0.5, w, Math.max(1, row - 1.5));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(time / score.cycle * rect.width - 0.75, 0, 1.5, rect.height);
  }
  function paint() {
    activeUntil = Math.max(activeUntil, seconds() + 0.1);
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick() {
    frame = 0;
    const now = seconds();
    const cycle = player.playing ? player.current() : null;
    if (cycle && cycle !== lastCycle) {
      lastCycle = cycle;
      if (cycle.score !== score && cycle.score.version === version) {
        score = cycle.score;
        garden.setScore(score, reducedMotion.matches ? "none" : "morph");
        showSettings();
        buildKeys();
        syncHash();
      }
    }
    const time = currentTime();
    const started = player.playing || pausedAt > 0;
    const stepped = !player.playing && stepping !== null ? score.branches[stepping] : null;
    const stack = stepped ? callChain(stepped) : started ? stackAt(score, time) : [];
    const fresh = stepped ? now - steppedAt < 0.6 : false;
    const lines = sourceLines(stack, stepped ? fresh : time - (stack.at(-1)?.start ?? 0) < 0.35);
    if (player.playing) {
      const ids = new Set(stack.map((node) => node.index));
      for (const node of stack) {
        if (!previousStack.has(node.index)) onsets.set(node.index, now - Math.max(0, Math.min(0.5, time - node.start)));
      }
      const leaf = stack.at(-1);
      const lead = leaf?.melodyLead ? soundingNote(leaf, time) : null;
      if (leaf && (!previousStack.has(leaf.index) || lead && lead !== previousLead)) {
        if (lead) onsets.set(leaf.index, now);
        echoes.push({ time: now, pan: leaf.pan, strength: 0.75 });
      }
      previousLead = lead;
      previousStack = ids;
    } else {
      previousStack = /* @__PURE__ */ new Set();
      previousLead = null;
    }
    for (const [index, at] of onsets) if (now - at > 3) onsets.delete(index);
    echoes = echoes.filter((echo) => now - echo.time < 2).slice(-6);
    trail = trail.filter((point) => now - point.time < 0.48);
    const ages = new Map([...onsets].map(([index, at]) => [index, now - at]));
    const breath = breathAt(stack, time);
    const marked = tool === "prune" && hover !== null && score.branches[hover]?.parent !== null && !score.branches[hover]?.leaf ? new Set(subtree(score.branches, hover)) : null;
    garden.draw({
      now,
      reduced: reducedMotion.matches,
      time: player.playing ? time : stepped ? time + 1e-3 : null,
      stack: player.playing || stepped ? stack : [],
      onsets: ages,
      cursor,
      trail,
      hover,
      selected,
      marked,
      breath,
      tool,
      echoes: echoes.map((echo) => ({ age: now - echo.time, pan: echo.pan, strength: echo.strength }))
    });
    renderStack(stack, time, lines);
    renderSource(stack, lines);
    drawIcicle(stack, time);
    if (document.activeElement !== seek) seek.value = time;
    seek.setAttribute("aria-valuetext", clock(time) + " of " + clock(score.cycle));
    byId("elapsed").textContent = clock(time);
    if (!miniPlayer.hidden) {
      byId("mini-label").textContent = byId("cycle-label").textContent;
      byId("mini-time").textContent = clock(time) + " / " + clock(score.cycle);
    }
    const cue = byId("breath");
    cue.hidden = !breath;
    if (breath) {
      cue.textContent = breath.phase === "in" ? "Breathe in" : breath.phase === "hold" ? "Hold gently" : "Breathe out";
      cue.style.setProperty("--breath", breath.amount.toFixed(3));
    }
    const picked = score.branches[hover ?? selected];
    const branch = picked ?? (player.playing ? stack.at(-1) : null);
    const note = branch ? noteName(picked ? picked.midi : soundingNote(branch, time).midi) : "♪";
    if (byId("branch-note").textContent !== note) byId("branch-note").textContent = note;
    const detail = branch ? describe(branch) + " · level " + branch.depth + " · " + voiceFor(score.scene, branch.depth) + (branch.cut ? " · pruned" : branch.melodyLead ? " · melody" : "") : "Tap or drag across branches";
    if (byId("branch-detail").textContent !== detail) byId("branch-detail").textContent = detail;
    if (player.playing || garden.animating(now) || trail.length || onsets.size || echoes.length || now < activeUntil || fresh) {
      frame = requestAnimationFrame(tick);
    }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  var slug = (text2) => String(text2).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "seed";
  var fileStem = () => "stillwater-" + settings.scene + "-" + slug(settings.seed) + "-g" + (score.generation + 1) + (score.focus ? "-inside-" + score.focus : "");
  function exportScores() {
    const count = Number(byId("export-length").value);
    return Array.from({ length: count }, (_, k) => k === 0 ? score : buildScore(score.generation + k));
  }
  async function saveWave() {
    if (busy) return;
    busy = true;
    const button = byId("download");
    button.disabled = true;
    button.querySelector("span").textContent = "Rendering…";
    try {
      const scores = exportScores();
      const name = fileStem() + (scores.length > 1 ? "-" + scores.length + "cycles" : "") + ".wav";
      const { blob, duration } = await renderWave(scores, {
        nature: Number(nature.value) / 100,
        water: waterEnabled,
        onCycle: (index, total) => {
          button.querySelector("span").textContent = "Rendering " + index + "/" + total + "…";
        }
      });
      download(blob, name);
      notify("Saved " + clock(duration) + " of 44.1 kHz stereo WAV.");
    } catch (error) {
      console.error(error);
      notify("The WAV could not be rendered.");
    } finally {
      busy = false;
      button.disabled = false;
      button.querySelector("span").textContent = "Score WAV";
    }
  }
  function saveMidi() {
    const scores = exportScores();
    download(encodeMidi(scores, voiceFor), fileStem() + ".mid");
    notify("Saved a MIDI file with one track per recursion level.");
  }
  function savePostcard() {
    const scene = scenes[settings.scene];
    const card = garden.postcard([
      scene.name,
      "seed “" + settings.seed + "” · depth " + settings.depth + " · sway " + settings.sway + " · spread " + settings.spread + "° · " + score.branches.length + " calls"
    ]);
    card.toBlob((blob) => blob && download(blob, fileStem() + ".png"), "image/png");
    notify("Saved a postcard of this tree.");
  }
  async function shareLink() {
    const base = location.protocol === "file:" ? "https://tanzamul-azad.github.io/StillWater/" : location.href.split("#")[0];
    const url = base + scoreHash();
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied with this tree and listening mix.");
    } catch {
      window.prompt("Copy this link to share your tree and mix.", url);
    }
  }
  async function toggleRecording() {
    const button = byId("record");
    if (button.hasAttribute("aria-busy")) return;
    button.setAttribute("aria-busy", "true");
    try {
      if (player.recording) {
        const name = fileStem() + "-session";
        button.querySelector("span").textContent = "Saving…";
        const blob = await player.stopRecording();
        if (!blob?.size) {
          notify("No audio was captured. Try recording again.");
          return;
        }
        try {
          const buffer = await player.context.decodeAudioData(await blob.arrayBuffer());
          download(encodeWave(buffer), name + ".wav");
          notify("Saved the performance as a WAV.");
        } catch {
          const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
          download(blob, name + "." + extension);
          notify("Saved your session recording.");
        }
      } else {
        await wake(0.09);
        if (!player.startRecording()) {
          notify("Live recording is unavailable in this browser. Score WAV is available.");
          return;
        }
        notify("Recording your playing and any score or ambience you hear.");
      }
    } catch {
      notify("The recording could not be completed.");
    } finally {
      const active = Boolean(player.recording);
      button.removeAttribute("aria-busy");
      button.setAttribute("aria-pressed", String(active));
      setIcon(button, active ? "stop" : "record", active ? "Stop and save performance" : "Record performance");
      button.querySelector("span").textContent = active ? "Stop & save" : "Record";
    }
  }
  function setCalm(on) {
    body.dataset.calm = String(on);
    showMini();
    setIcon(byId("calm"), on ? "close" : "calm", on ? "Leave calm mode" : "Enter calm mode");
    byId("calm-label").textContent = on ? "Exit calm" : "Calm";
    byId("calm").setAttribute("aria-pressed", String(on));
    cursor = hover = null;
    if (on) {
      clearTimeout(noticeTimer);
      byId("notice").classList.remove("visible");
      setTool("play");
      document.documentElement.requestFullscreen?.().catch(() => {
      });
      if (!player.playing) start(pausedAt);
      wakeChrome();
    } else {
      clearTimeout(idleTimer);
      body.dataset.idle = "false";
      if (!drift && !quietListening()) player.stopAfterCurrent();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {
      });
    }
    paint();
  }
  function wakeChrome() {
    body.dataset.idle = "false";
    clearTimeout(idleTimer);
    if (body.dataset.calm === "true") idleTimer = setTimeout(() => {
      body.dataset.idle = "true";
    }, 3200);
  }
  for (const key of sliders) {
    const input = byId(key);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (value === settings[key]) return;
      if (editedSlider !== key) rememberTree();
      editedSlider = key;
      applySettings({ ...settings, [key]: value });
    });
    for (const event of ["change", "blur"]) {
      input.addEventListener(event, () => {
        if (editedSlider === key) editedSlider = null;
      });
    }
  }
  byId("seed").addEventListener("change", (event) => {
    const seed = event.target.value || scenes[settings.scene].defaults.seed;
    if (seed !== settings.seed) editTree({ ...settings, seed, pruned: [] }, "grow", void 0, null);
    event.target.value = settings.seed;
  });
  byId("seed").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.target.blur();
  });
  byId("shuffle").addEventListener("click", () => {
    const options = words.filter((word) => word !== settings.seed);
    editTree({ ...settings, seed: options[Math.floor(Math.random() * options.length)], pruned: [] }, "grow", void 0, null);
  });
  byId("reset-tree").addEventListener("click", () => {
    editTree({ ...settings, ...scenes[settings.scene].defaults, pruned: [] }, "grow", 0, null);
    notify("Tree reset to the current soundscape’s starting shape.");
  });
  undoButton.addEventListener("click", undoTree);
  byId("step").addEventListener("click", stepCall);
  byId("shape-tree").addEventListener("click", () => {
    byId("recursion-title").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    byId("depth").focus({ preventScroll: true });
  });
  byId("jump-export").addEventListener("click", () => {
    byId("keep-title").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    byId("download").focus({ preventScroll: true });
  });
  for (const button of document.querySelectorAll("[data-scene]")) button.addEventListener("click", () => chooseScene(button.dataset.scene));
  for (const button of document.querySelectorAll("[data-rule]")) {
    button.addEventListener("click", () => {
      const rule = button.dataset.rule;
      if (rule === settings.rule) return;
      const pruned = rule === "ternary" ? settings.pruned : settings.pruned.filter((p) => !p.includes("M"));
      editTree({ ...settings, rule, pruned }, "grow", 0, null);
      notify(rule === "fibonacci" ? "Fibonacci recursion: right branches skip one level for golden phrasing." : rule === "ternary" ? "Ternary recursion: each call splits into three branches and waltz meter." : "Binary recursion: each call splits into left and right.");
    });
  }
  byId("stack").addEventListener("pointerover", (event) => {
    const item = event.target.closest?.("li[data-index]");
    if (!item) return;
    hover = Number(item.dataset.index);
    paint();
  });
  byId("stack").addEventListener("pointerleave", () => {
    if (hover !== null) {
      hover = null;
      paint();
    }
  });
  byId("stack").addEventListener("click", (event) => {
    const item = event.target.closest?.("li[data-index]");
    if (item) touch(Number(item.dataset.index));
  });
  byId("stack").addEventListener("dblclick", (event) => {
    const item = event.target.closest?.("li[data-index]");
    if (item) listenInside(Number(item.dataset.index));
  });
  playButton.addEventListener("click", togglePlay);
  byId("restart").addEventListener("click", () => {
    clearTimeout(seekTimer);
    pausedAt = 0;
    if (player.playing) player.play(score, 0);
    paint();
  });
  byId("drift").addEventListener("click", (event) => {
    drift = !drift;
    event.currentTarget.setAttribute("aria-pressed", String(drift));
    if (!drift) player.stopAfterCurrent();
    notify(drift ? "Drift on. The score repeats and evolves." : "Drift off. The score plays one cycle outside calm or timed listening.");
  });
  seek.addEventListener("input", () => {
    const value = Number(seek.value);
    pausedAt = value;
    stepping = null;
    if (player.playing) {
      clearTimeout(seekTimer);
      const target = score;
      seekTimer = setTimeout(() => {
        if (player.playing && score === target) player.play(target, value);
      }, 140);
    }
    paint();
  });
  volume.addEventListener("input", updateVolume);
  volume.addEventListener("change", syncHash);
  byId("mute").addEventListener("click", () => {
    volume.value = Number(volume.value) ? 0 : rememberedVolume;
    volume.dispatchEvent(new Event("input"));
    syncHash();
  });
  nature.addEventListener("input", () => {
    updateNature();
  });
  nature.addEventListener("change", () => {
    saveNature();
    syncHash();
  });
  waterSounds.addEventListener("change", () => {
    waterEnabled = waterSounds.checked;
    player.setWater(waterEnabled);
    if (waterEnabled && Number(nature.value) === 0 && settings.scene !== "orchid") {
      nature.value = "60";
      updateNature();
      saveNature();
    } else {
      showAmbience();
    }
    try {
      localStorage.setItem(waterPreference, waterEnabled ? "on" : "off");
    } catch {
    }
    syncHash();
  });
  byId("sleep").addEventListener("change", (event) => {
    clearTimeout(sleepTimer);
    const minutes = Number(event.target.value);
    if (!minutes) {
      if (!drift && !quietListening()) player.stopAfterCurrent();
      notify("Sleep timer off.");
      return;
    }
    sleepTimer = setTimeout(() => {
      player.setVolume(0, 40);
      sleepTimer = setTimeout(() => player.playing && pause(), 4e4);
    }, minutes * 6e4 - 4e4);
    notify("Stillwater will fade out and stop after " + minutes + " minutes.");
    if (!player.playing) start(pausedAt);
  });
  byId("breathe").addEventListener("change", paint);
  byId("download").addEventListener("click", saveWave);
  byId("midi").addEventListener("click", saveMidi);
  byId("postcard").addEventListener("click", savePostcard);
  byId("share").addEventListener("click", shareLink);
  byId("record").addEventListener("click", toggleRecording);
  byId("leave").addEventListener("click", leaveInside);
  byId("calm").addEventListener("click", () => setCalm(body.dataset.calm !== "true"));
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && body.dataset.calm === "true") setCalm(false);
  });
  for (const type of ["pointermove", "pointerdown", "keydown", "focusin"]) window.addEventListener(type, wakeChrome, { passive: true });
  function showMini() {
    const hidden = !pastStage || body.dataset.calm === "true";
    if (miniPlayer.hidden === hidden) return;
    miniPlayer.hidden = hidden;
    paint();
  }
  new IntersectionObserver(([entry]) => {
    pastStage = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    showMini();
  }).observe(byId("art").parentElement.querySelector(".transport"));
  byId("mini-play").addEventListener("click", togglePlay);
  byId("mini-tree").addEventListener("click", () => {
    byId("art").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
  });
  async function holdScreen(on) {
    if (!on) {
      screenLock?.release().catch(() => {
      });
      screenLock = null;
      return;
    }
    if (screenLock || !navigator.wakeLock || document.visibilityState !== "visible") return;
    try {
      screenLock = await navigator.wakeLock.request("screen");
      screenLock.addEventListener("release", () => {
        screenLock = null;
      });
    } catch {
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !player.playing) return;
    if (player.context && player.context.state !== "running") player.context.resume().catch(() => {
    });
    holdScreen(true);
  });
  function setTool(next) {
    tool = next;
    byId("tool-play").setAttribute("aria-pressed", String(tool === "play" && !player.playing));
    byId("tool-prune").setAttribute("aria-pressed", String(tool === "prune"));
    byId("art").dataset.tool = tool;
    paint();
  }
  byId("tool-play").addEventListener("click", () => {
    if (player.playing || startRequest) pause();
    setTool("play");
  });
  byId("tool-prune").addEventListener("click", () => setTool("prune"));
  byId("about").addEventListener("click", () => byId("about-dialog").showModal());
  function openMelody() {
    const notes = settings.melody;
    showMelodyDraft(notes, notes.length ? notes.length + " notes in this tree." : "Hum a few notes, choose a clip, or try the example.");
    byId("melody-clear").hidden = !notes.length;
    byId("melody-apply").disabled = true;
    melodyDialog.showModal();
  }
  byId("melody-open").addEventListener("click", openMelody);
  melodyDialog.addEventListener("close", () => {
    melodyRequest++;
    melodyInput.value = "";
    hum?.stop(true);
  });
  byId("melody-hum").addEventListener("click", () => hum ? hum.stop() : startHum());
  melodyInput.addEventListener("change", () => {
    const file = melodyInput.files?.[0];
    if (file) scanMelody(file);
  });
  byId("melody-example").addEventListener("click", () => {
    melodyInput.value = "";
    scanMelody();
  });
  byId("melody-clear").addEventListener("click", () => useMelody([]));
  byId("melody-apply").addEventListener("click", () => {
    if (melodyDraft.length) useMelody(melodyDraft);
  });
  function updatePruneButton() {
    const branch = score.branches[Number(byId("branch-select").value)];
    byId("prune-toggle").querySelector("span").textContent = branch && settings.pruned.includes(branch.path) ? "Regrow" : "Prune";
  }
  byId("browse").addEventListener("click", () => {
    const select = byId("branch-select");
    select.replaceChildren(...score.branches.map(
      (branch) => new Option(describe(branch) + " · " + noteName(branch.midi) + (branch.cut ? " · pruned" : branch.leaf ? " · base case" : ""), branch.index)
    ));
    select.value = selected ?? 0;
    updatePruneButton();
    byId("branch-dialog").showModal();
  });
  byId("branch-select").addEventListener("change", () => {
    selected = Number(byId("branch-select").value);
    updatePruneButton();
    paint();
  });
  byId("preview-note").addEventListener("click", () => touch(Number(byId("branch-select").value)));
  byId("inside").addEventListener("click", () => {
    byId("branch-dialog").close();
    listenInside(Number(byId("branch-select").value));
  });
  byId("prune-toggle").addEventListener("click", () => {
    byId("branch-dialog").close();
    togglePrune(Number(byId("branch-select").value));
  });
  byId("shortcuts").addEventListener("change", buildKeys);
  byId("begin").addEventListener("click", () => {
    byId("intro").close();
    start(0, true);
  });
  byId("silent").addEventListener("click", () => byId("intro").close());
  byId("intro-hum").addEventListener("click", () => {
    byId("intro").close();
    openMelody();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === "z" && !event.target.closest?.("input, textarea, select, [contenteditable]") && !document.querySelector("dialog[open]") && !undoButton.disabled) {
      event.preventDefault();
      undoTree();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape" && body.dataset.calm === "true") {
      setCalm(false);
      return;
    }
    if (event.target.closest?.("input, textarea, select, button, [contenteditable]")) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === "n" || event.key === "N") {
      stepCall();
      return;
    }
    if (event.key === "c" || event.key === "C") {
      setCalm(body.dataset.calm !== "true");
      return;
    }
    if (!byId("shortcuts").checked || event.key.length !== 1) return;
    const index = letters.indexOf(event.key.toLowerCase());
    if (index >= 0) playKey(index);
  });
  function inspect(event) {
    cursor = garden.coords(event.clientX, event.clientY);
    hover = garden.hit(cursor);
    garden.canvas.style.cursor = hover === null ? "crosshair" : tool === "prune" ? "cell" : "pointer";
    paint();
  }
  garden.canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    inspect(event);
    if (tool === "prune") {
      if (hover !== null) togglePrune(hover);
      return;
    }
    garden.canvas.setPointerCapture(event.pointerId);
    stroke = { id: event.pointerId, point: cursor, last: hover, time: seconds() };
    trail = [{ ...cursor, time: seconds() }];
    if (hover !== null) touch(hover);
    else if (cursor.y >= garden.baseY - 8) touchWater(cursor);
  });
  garden.canvas.addEventListener("pointermove", (event) => {
    if (!event.isPrimary) return;
    inspect(event);
    if (stroke?.id !== event.pointerId) return;
    const now = seconds();
    trail.push({ ...cursor, time: now });
    if (trail.length > 39) trail.shift();
    const origin = stroke.point;
    stroke.point = cursor;
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(cursor.x - origin.x, cursor.y - origin.y) / 8)));
    for (let step = 1; step <= steps; step++) {
      const index = garden.hit({ x: origin.x + (cursor.x - origin.x) * step / steps, y: origin.y + (cursor.y - origin.y) * step / steps });
      if (index === null || index === stroke.last || now - stroke.time < 0.06) continue;
      stroke.last = index;
      stroke.time = now;
      touch(index);
      return;
    }
    if (hover === null && cursor.y >= garden.baseY - 8 && now - stroke.time >= 0.115) {
      stroke.last = null;
      stroke.time = now;
      touchWater(cursor);
    }
  });
  function endStroke(event) {
    if (stroke?.id === event.pointerId) stroke = null;
    if (event.pointerType === "touch") {
      cursor = hover = null;
      paint();
    }
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) garden.canvas.addEventListener(type, endStroke);
  garden.canvas.addEventListener("pointerleave", () => {
    cursor = hover = null;
    paint();
  });
  garden.canvas.addEventListener("dblclick", (event) => {
    if (tool !== "play") return;
    const index = garden.hit(garden.coords(event.clientX, event.clientY));
    if (index !== null) listenInside(index);
  });
  window.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || event.pointerType === "touch") return;
    body.style.setProperty("--light-x", event.clientX + "px");
    body.style.setProperty("--light-y", event.clientY + "px");
  }, { passive: true });
  window.addEventListener("resize", paint);
  reducedMotion.addEventListener("change", paint);
  window.addEventListener("hashchange", () => {
    const shared2 = fromHash(location.hash);
    if (!shared2) return;
    treeHistory.length = 0;
    editedSlider = null;
    undoButton.disabled = true;
    readMix(shared2.mix);
    focusPath = shared2.focus;
    pausedAt = 0;
    applySettings(shared2.settings, "morph", shared2.generation);
    updateVolume();
    updateNature();
  });
  try {
    waterEnabled = localStorage.getItem(waterPreference) !== "off";
    const savedNature = localStorage.getItem(naturePreference);
    if (savedNature !== null) nature.value = savedNature;
  } catch {
  }
  var shared = fromHash(location.hash);
  readMix(shared?.mix);
  focusPath = shared?.focus ?? null;
  applySettings(shared?.settings ?? { scene: "lagoon", ...scenes.lagoon.defaults, pruned: [] }, "none", shared?.generation);
  updateVolume();
  updateNature();
  try {
    byId("intro").showModal();
  } catch {
    byId("intro").setAttribute("open", "");
  }
})();
