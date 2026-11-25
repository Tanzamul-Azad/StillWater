(() => {
  // dist/score.mjs
  var scenes = {
    lagoon: {
      name: "Moonlit Lagoon",
      scaleName: "D major pentatonic",
      depth: 5,
      angle: 34,
      taper: 75,
      tempo: 72,
      seed: 173,
      root: 50,
      scale: [0, 2, 4, 7, 9],
      wave: "sine",
      hue: 162,
      accent: "#a8f0cf",
      overtones: [1, 2, 3]
    },
    cedar: {
      name: "Cedar Rain",
      scaleName: "C suspended pentatonic",
      depth: 5,
      angle: 24,
      taper: 70,
      tempo: 80,
      seed: 617,
      root: 48,
      scale: [0, 2, 5, 7, 9],
      wave: "triangle",
      hue: 92,
      accent: "#d4e5a5",
      overtones: [1, 2.01, 4.07]
    },
    orchid: {
      name: "Violet Hour",
      scaleName: "F minor pentatonic",
      depth: 4,
      angle: 41,
      taper: 73,
      tempo: 64,
      seed: 312,
      root: 53,
      scale: [0, 3, 5, 7, 10],
      wave: "sine",
      hue: 265,
      accent: "#dcc6ff",
      overtones: [1, 2.76, 4.07]
    }
  };
  function randomFrom(seed) {
    let state = seed >>> 0;
    return () => {
      state = state + 1831565813 | 0;
      let value = Math.imul(state ^ state >>> 15, 1 | state);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  var radians = Math.PI / 180;
  var noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  var noteName = (midi) => `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
  var frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
  function scaleNote(scale, degree) {
    const octave = Math.floor(degree / scale.length);
    return 12 * octave + scale[degree - octave * scale.length];
  }
  function compose(settings) {
    const scene2 = scenes[settings.scene];
    const random = randomFrom(settings.seed);
    const beat = 60 / settings.tempo;
    const branches = [];
    let time = 0.45;
    function grow({ depth, parent, path, x, y, heading, length, degree }) {
      const index = branches.length;
      const endX = x + Math.sin(heading) * length;
      const endY = y - Math.cos(heading) * length;
      const curve = (random() - 0.5) * length * 0.4;
      const leaf = depth === settings.depth;
      const branch = {
        index,
        parent,
        path,
        depth,
        x,
        y,
        endX,
        endY,
        leaf,
        controlX: (x + endX) / 2 + Math.cos(heading) * curve,
        controlY: (y + endY) / 2 + Math.sin(heading) * curve,
        midi: scene2.root + scaleNote(scene2.scale, degree + (depth > 0 ? 3 : 0)),
        pan: Math.tanh(endX * 0.8) * 0.72,
        time,
        decay: depth === 0 ? 3.3 : 2.55 - depth * 0.21
      };
      branches.push(branch);
      time += beat * ((leaf ? 0.43 : 0.67) + (random() - 0.5) * 0.08);
      if (leaf) return;
      const spread = settings.angle * radians * (0.92 + random() * 0.21);
      for (const side of [-1, 1]) {
        const nextHeading = Math.max(-1.47, Math.min(1.47, heading * 0.66 + side * spread));
        grow({
          depth: depth + 1,
          parent: index,
          path: path + (side < 0 ? "L" : "R"),
          x: endX,
          y: endY,
          heading: nextHeading,
          length: length * (settings.taper / 100) * (0.92 + random() * 0.15),
          degree: degree + (side < 0 ? 1 : 2) + (random() > 0.84 ? 1 : 0) - (degree > 7 ? 5 : 0)
        });
      }
    }
    grow({ depth: 0, parent: null, path: "", x: 0, y: 0, heading: -0.05, length: 1, degree: 0 });
    const last = branches.at(-1);
    return { settings, scene: scene2, branches, events: branches, duration: last.time + last.decay + 2.35 };
  }
  var takeLimits = { seconds: 24, notes: 96 };
  function composeTake(score2, notes) {
    if (!notes.length) return null;
    const first = notes[0].time;
    const events = notes.map((note) => ({ ...score2.branches[note.index], time: 0.24 + note.time - first }));
    const duration = Math.max(...events.map((event) => event.time + event.decay)) + 2.2;
    return { ...score2, events, duration, take: true };
  }
  function clock(seconds2) {
    const whole = Math.max(0, Math.floor(seconds2));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  // dist/audio.mjs
  var sampleRate = 44100;
  function voice(context2, destination, hz, wave, start2, attack, duration, level) {
    const tone = context2.createOscillator();
    const envelope = context2.createGain();
    tone.type = wave;
    tone.frequency.value = hz;
    envelope.gain.setValueAtTime(1e-4, start2);
    envelope.gain.exponentialRampToValueAtTime(level, start2 + attack);
    envelope.gain.exponentialRampToValueAtTime(1e-4, start2 + duration);
    tone.connect(envelope).connect(destination);
    tone.start(start2);
    tone.stop(start2 + duration + 0.01);
  }
  function playBranch(context2, destination, branch, scene2, start2) {
    const pan = context2.createStereoPanner();
    pan.pan.value = branch.pan;
    pan.connect(destination);
    const hz = frequency(branch.midi);
    const level = branch.depth < 2 ? 0.11 : 0.075 - 5e-3 * branch.depth;
    const attack = branch.leaf ? 0.055 : 0.09;
    voice(context2, pan, hz, scene2.wave, start2, attack, branch.decay, level);
    voice(context2, pan, hz * scene2.overtones[1], "sine", start2, 0.075, branch.decay * 0.58, level * 0.24);
    voice(context2, pan, hz * scene2.overtones[2], "sine", start2, 0.05, branch.decay * 0.35, level * 0.08);
    if (!("startRendering" in context2)) {
      const duration = (start2 - context2.currentTime + branch.decay + 0.1) * 1e3;
      setTimeout(() => pan.disconnect(), duration);
    }
  }
  function makeSpace(context2, mix, seed) {
    const random = randomFrom(seed ^ 25405);
    const size = Math.floor(context2.sampleRate * 2.15);
    const impulse = context2.createBuffer(2, size, context2.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let filtered = 0;
      const delay = Math.floor(context2.sampleRate * (channel ? 0.022 : 0.017));
      for (let i = delay; i < size; i++) {
        filtered = filtered * 0.63 + (random() * 2 - 1) * 0.37;
        data[i] = filtered * (1 - i / size) ** 3.3;
      }
    }
    const reverb = context2.createConvolver();
    const wet = context2.createGain();
    reverb.buffer = impulse;
    wet.gain.value = 0.27;
    reverb.connect(wet).connect(mix);
    return reverb;
  }
  function instrumentBus(context2, destination, seed) {
    const input = context2.createGain();
    const output = context2.createGain();
    const reverb = makeSpace(context2, output, seed);
    input.connect(output);
    input.connect(reverb);
    output.connect(destination);
    return { input, release: () => {
      input.disconnect();
      reverb.disconnect();
      output.disconnect();
    } };
  }
  function roomTone(context2, mix, score2) {
    const random = randomFrom(score2.settings.seed ^ 29138);
    const frames = Math.floor(context2.sampleRate * score2.duration);
    const sample = context2.createBuffer(2, frames, context2.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = sample.getChannelData(channel);
      let color = 0;
      for (let i = 0; i < frames; i++) {
        color = 0.94 * color + 0.06 * (random() * 2 - 1);
        data[i] = color;
      }
    }
    const noise = context2.createBufferSource();
    const filter = context2.createBiquadFilter();
    const envelope = context2.createGain();
    noise.buffer = sample;
    filter.type = "bandpass";
    filter.frequency.value = score2.settings.scene === "cedar" ? 1090 : 380;
    filter.Q.value = 0.42;
    envelope.gain.setValueAtTime(0, 0);
    const waves = new Float32Array(128);
    for (let i = 0; i < waves.length; i++) {
      const portion = i / (waves.length - 1);
      waves[i] = Math.min(portion * 7, (1 - portion) * 5, 1) * (0.035 + 0.011 * Math.sin(i / 6));
    }
    envelope.gain.setValueCurveAtTime(waves, 0, score2.duration);
    noise.connect(filter).connect(envelope).connect(mix);
    noise.start();
  }
  async function renderScore(score2) {
    const offline = new OfflineAudioContext(2, Math.ceil(score2.duration * sampleRate), sampleRate);
    const mix = offline.createGain();
    const notes = offline.createGain();
    const reverb = makeSpace(offline, mix, score2.settings.seed);
    notes.connect(mix);
    notes.connect(reverb);
    mix.gain.value = 0.95;
    mix.connect(offline.destination);
    roomTone(offline, mix, score2);
    const sections = score2.take ? score2.events.filter((_, index) => index === 0 || index === Math.floor(score2.events.length / 2)) : score2.branches.filter((branch) => branch.depth === 1);
    const root = score2.scene.root;
    voice(offline, notes, frequency(root - 12), "sine", 0.04, 1.9, score2.duration - 0.1, 0.043);
    for (const [index, branch] of sections.entries()) {
      const end = sections[index + 1]?.time ?? score2.events.at(-1).time + 1.9;
      const release = Math.min(end - branch.time + 2.1, score2.duration - branch.time - 0.1);
      voice(offline, notes, frequency(branch.midi - 12), "sine", branch.time, 1.25, release, 0.028);
      voice(offline, notes, frequency(root + 7), "sine", branch.time, 1.8, release, 0.015);
    }
    for (const branch of score2.events) playBranch(offline, notes, branch, score2.scene, branch.time);
    const buffer = await offline.startRendering();
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    }
    const gain = Math.min(0.79 / Math.max(peak, 1e-3), 2.4);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
    return buffer;
  }
  function encodeWave(buffer) {
    const channels = buffer.numberOfChannels;
    const frameSize = 2 * channels;
    const dataSize = buffer.length * frameSize;
    const bytes = new ArrayBuffer(44 + dataSize);
    const view = new DataView(bytes);
    const text = (position2, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(position2 + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * frameSize, true);
    view.setUint16(32, frameSize, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, dataSize, true);
    const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, samples[channel][i]));
        view.setInt16(44 + i * frameSize + channel * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      }
    }
    return new Blob([bytes], { type: "audio/wav" });
  }

  // dist/water.mjs
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
      const { width, height, x, y, cursor: cursor2, seconds: seconds2, echoes, accent } = frame2;
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
      echoes.forEach((echo, index) => wavefronts.set([echo.age, echo.pan, echo.strength], index * 3));
      gl.uniform3fv(uniforms.echoes, wavefronts);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    }
  };

  // dist/garden.mjs
  var TAU = Math.PI * 2;
  var tint = (hue, light, alpha) => "hsla(" + hue + ", 79%, " + light + "%, " + alpha + ")";
  function halo(ctx, x, y, radius, hue, strength) {
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
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
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
    const shape = new Path2D();
    const pointsAroundTrunk = banks[0].concat(banks[1].reverse());
    shape.moveTo(...pointsAroundTrunk[0]);
    for (const point of pointsAroundTrunk.slice(1)) shape.lineTo(...point);
    shape.closePath();
    return shape;
  }
  var Garden = class {
    constructor(canvas, onResize) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.water = new Water(document.getElementById("water"));
      this.backdrop = document.createElement("canvas");
      this.branches = [];
      this.width = 0;
      const observer = new ResizeObserver(() => {
        if (!this.score) return;
        this.layout();
        onResize();
      });
      observer.observe(canvas);
    }
    setScore(score2, reveal) {
      this.score = score2;
      this.revealAt = reveal ? performance.now() / 1e3 : -Infinity;
      this.layout();
    }
    revealing(now) {
      return now - this.revealAt < 0.86;
    }
    layout() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      if (!this.width || !this.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = this.backdrop.width = Math.round(this.width * ratio);
      this.canvas.height = this.backdrop.height = Math.round(this.height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const { branches, scene: scene2 } = this.score;
      const minX = Math.min(...branches.map((branch) => branch.endX), 0);
      const maxX = Math.max(...branches.map((branch) => branch.endX), 0);
      const minY = Math.min(...branches.map((branch) => branch.endY));
      const compact = this.width < 620;
      const stretch = compact ? 1.26 : 1.46;
      const height = this.height * (compact ? 0.43 : 0.66);
      const width = this.width * (compact ? 0.82 : 0.58);
      const scale = Math.min(height / -minY, width / (maxX - minX) / stretch);
      const center = this.width * (compact ? 0.5 : 0.635);
      this.baseX = center - (maxX + minX) / 2 * scale * stretch;
      this.baseY = this.height * (compact ? 0.815 : 0.775);
      const projectX = (x) => this.baseX + x * scale * stretch;
      const projectY = (y) => this.baseY + y * scale;
      this.branches = branches.map((branch) => {
        const result = {
          ...branch,
          x: projectX(branch.x),
          y: projectY(branch.y),
          controlX: projectX(branch.controlX),
          controlY: projectY(branch.controlY),
          endX: projectX(branch.endX),
          endY: projectY(branch.endY)
        };
        const path = new Path2D();
        path.moveTo(result.x, result.y);
        path.quadraticCurveTo(result.controlX, result.controlY, result.endX, result.endY);
        const samples = Math.max(4, Math.ceil(Math.hypot(result.endX - result.x, result.endY - result.y) / 7));
        result.samples = Array.from({ length: samples + 1 }, (_, i) => pointOn(result, i / samples));
        result.curve = path;
        if (result.depth < 3) result.stem = stemShape(result.samples, 6.7 * 0.68 ** result.depth, result.index * 1.28);
        return result;
      });
      const random = randomFrom(this.score.settings.seed ^ 55335);
      this.sparks = this.branches.filter((branch) => branch.leaf).flatMap(
        (branch) => Array.from({ length: Math.min(14, 245 / branches.length + 6) }, () => {
          const angle = random() * TAU;
          const distance = 2 + random() ** 1.75 * 49;
          return {
            branch: branch.index,
            angle,
            x: branch.endX + Math.cos(angle) * distance,
            y: branch.endY + Math.sin(angle) * distance * 0.81,
            size: 0.38 + random() ** 2 * 2.04,
            alpha: 0.18 + random() * 0.62,
            amber: random() > 0.72
          };
        })
      );
      const ctx = this.backdrop.getContext("2d");
      ctx.scale(ratio, ratio);
      this.paintBackdrop(ctx, scene2.hue);
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
        const px = random() * w;
        const py = random() * h * 0.94;
        const radius = 0.25 + random() ** 3 * 1.15;
        ctx.fillStyle = tint(hue, 82, 0.04 + random() ** 2 * 0.32);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, TAU);
        ctx.fill();
      }
      ctx.lineWidth = 0.68;
      for (let i = 0; i < 32; i++) {
        const rx = (i + 1) ** 1.23 * w / 109;
        ctx.strokeStyle = tint(hue, 72, 0.17 * (1 - i / 36));
        ring(ctx, x, y, rx, rx * (h / w) * 0.26);
      }
    }
    draw({ time, events, played, selected: selected2, hover: hover2, reduced, now, cursor: cursor2, live: live2, trail: trail2 }) {
      const ctx = this.ctx;
      const { width, height, baseX, baseY, branches } = this;
      if (!width || !height) return;
      const hue = this.score.scene.hue;
      const heard = /* @__PURE__ */ new Map();
      const echoes = [];
      if (played) {
        for (const event of events) {
          if (event.time > time) break;
          const age = time - event.time;
          heard.set(event.index, age);
          if (age < 2) echoes.push({ age, pan: event.pan, strength: 0.88 });
        }
      }
      for (const note of live2) {
        const age = now - note.time;
        heard.set(note.index, age);
        echoes.push({ age, pan: branches[note.index].pan, strength: 1 });
      }
      const waves = reduced ? [] : echoes.slice(-4);
      const opening = reduced ? 1 : Math.min(1, (now - this.revealAt) / 0.86);
      const gpu = this.water.draw({
        width,
        height,
        x: baseX,
        y: baseY,
        cursor: reduced ? null : cursor2,
        seconds: reduced ? 0 : now % 600,
        echoes: waves,
        accent: this.score.scene.accent
      });
      ctx.clearRect(0, 0, width, height);
      if (!gpu) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(this.backdrop, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      ctx.lineCap = "round";
      halo(ctx, baseX, baseY - height * 0.15, Math.min(width * 0.38, height * 0.53), hue, 0.13);
      if (!gpu) {
        for (const wave of waves) {
          const radius = 3 + wave.age * height * 0.62;
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = tint(hue, 84, (1 - wave.age / 2) * 0.58);
          ring(ctx, baseX + wave.pan * height * 0.25, baseY, radius, radius * 0.26);
        }
      }
      for (const branch of branches) {
        ctx.lineWidth = Math.max(0.55, 3.4 - branch.depth * 0.6);
        ctx.strokeStyle = tint(hue, 73, 0.18 / (1 + 0.28 * branch.depth));
        ctx.beginPath();
        for (const [index, point] of branch.samples.entries()) {
          const distance = baseY - point.y;
          const x = point.x + Math.sin(distance * 0.11 + (reduced ? 0 : now * 1.32)) * Math.min(11, distance / 27);
          const y = baseY + distance * 0.285;
          ctx[index === 0 || index % 5 === 0 ? "moveTo" : "lineTo"](x, y);
        }
        ctx.stroke();
      }
      for (let root = -7; root <= 7; root++) {
        const reach = root * (1.8 + Math.abs(root) * 0.51);
        ctx.strokeStyle = tint(hue + root, 72, 0.26 - Math.abs(root) * 0.024);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(baseX + root * 0.35, baseY - 15);
        ctx.bezierCurveTo(baseX + root * 0.6, baseY - 3, baseX + reach * 0.64, baseY + root * 0.55, baseX + reach, baseY + root * 0.7);
        ctx.stroke();
      }
      const focus = /* @__PURE__ */ new Set();
      let ancestor = hover2 ?? selected2;
      while (ancestor != null) {
        focus.add(ancestor);
        ancestor = branches[ancestor].parent;
      }
      for (const branch of branches) {
        const age = heard.get(branch.index) ?? Infinity;
        const lit = age < Infinity;
        const flash = lit && age < 1.05 ? 1 - age / 1.05 : 0;
        const focused = focus.has(branch.index);
        const weight = Math.max(0.8, 8.8 * 0.69 ** branch.depth);
        ctx.globalAlpha = 0.18 + 0.82 * Math.min(1, Math.max(0, opening * 2.7 - branch.depth * 0.27));
        if (branch.stem) {
          ctx.fillStyle = tint(hue + 23, 25, 0.68);
          ctx.fill(branch.stem);
        }
        const gradient = ctx.createLinearGradient(branch.x, branch.y, branch.endX, branch.endY);
        gradient.addColorStop(0, tint(hue + 12, 56, focused ? 1 : played && !lit ? 0.26 : 0.72));
        gradient.addColorStop(1, tint(hue - 7, 86, focused ? 1 : played && !lit ? 0.4 : 0.98));
        ctx.lineWidth = weight * (3.05 + 1.65 * flash);
        ctx.strokeStyle = tint(hue, 66, 0.055 + flash * 0.19 + (focused ? 0.1 : 0));
        ctx.stroke(branch.curve);
        ctx.lineWidth = weight * 1.7;
        ctx.strokeStyle = tint(hue, 72, 0.15 + flash * 0.23);
        ctx.stroke(branch.curve);
        ctx.lineWidth = weight * (0.72 + flash * 0.48);
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
        if (branch.leaf || flash > 0 || focused) {
          const radius = 1.25 + flash * 3.6 + (focused ? 1.12 : 0);
          halo(ctx, branch.endX, branch.endY, radius * 5.8, hue, played && !lit ? 0.19 : 0.44 + flash * 0.27);
          ctx.fillStyle = tint(hue + 10, 94, played && !lit ? 0.5 : 0.95);
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
      ctx.globalAlpha = 0.35 + opening * 0.65;
      for (const spark of this.sparks) {
        const age = heard.get(spark.branch) ?? Infinity;
        const drift = reduced || age > 1 ? 0 : Math.sin(spark.y * 0.18 + age * 2.8) * (1 - age) * 8;
        const alpha = spark.alpha * (played && age === Infinity ? 0.48 : 1);
        const color = spark.amber ? hue > 220 ? 323 : 53 : hue + 10;
        if (spark.size >= 1.68) halo(ctx, spark.x + drift, spark.y, spark.size * 4, color, alpha * 0.54);
        ctx.fillStyle = tint(color, 88, alpha);
        ctx.beginPath();
        ctx.ellipse(spark.x + drift, spark.y, spark.size * (spark.amber ? 1.35 : 1), spark.size * 0.64, spark.angle, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      halo(ctx, baseX, baseY, 34, hue, 0.61);
      ctx.fillStyle = tint(hue, 94, 0.9);
      ctx.beginPath();
      ctx.ellipse(baseX, baseY, 7.1, 1.45, 0, 0, TAU);
      ctx.fill();
      if (!reduced) this.drawPointer(ctx, hue, now, cursor2, trail2, hover2);
    }
    drawPointer(ctx, hue, now, cursor2, trail2, hover2) {
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
      ctx.strokeStyle = tint(hue, 89, hover2 === null ? 0.32 : 0.92);
      ctx.lineWidth = 1;
      const radius = hover2 === null ? 8 : 12;
      ring(ctx, cursor2.x, cursor2.y, radius, radius);
    }
    coords(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }
    hit({ x, y }) {
      let closest = null;
      let distance = 14 ** 2;
      for (const branch of this.branches) {
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
  };

  // dist/app.mjs
  var byId = (id) => document.getElementById(id);
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  var controls = ["depth", "angle", "taper", "tempo", "seed"];
  var keys = "asdfghjk";
  var presetButtons = [...document.querySelectorAll("[data-scene]")];
  var playButton = byId("play");
  var recordButton = byId("record");
  var expandButton = byId("expand");
  var trackButton = byId("track");
  var seek = byId("seek");
  var volume = byId("volume");
  var mute = byId("mute");
  var loopButton = byId("loop");
  var download = byId("download");
  var branchSelect = byId("branch-select");
  var garden = new Garden(byId("garden"), draw);
  var labels = {
    depth: (number) => number + (number === 1 ? " level" : " levels"),
    angle: (number) => number + "°",
    taper: (number) => number + "%",
    tempo: (number) => number + " BPM"
  };
  var score;
  var scene = "lagoon";
  var take;
  var useTake = false;
  var recording;
  var liveBus;
  var context;
  var master;
  var renderedScore;
  var active;
  var playRequest;
  var position = 0;
  var hasPlayed = false;
  var looping = false;
  var exporting = false;
  var selected = null;
  var hover = null;
  var cursor = null;
  var stroke;
  var trail = [];
  var live = [];
  var keyBranches = [];
  var meterBars = [];
  var frame = 0;
  var lastPaint = -Infinity;
  var noticeTimer;
  var noteAnimation;
  var lightPoint;
  var lightFrame = 0;
  var rememberedVolume = Number(volume.value);
  var currentScore = () => useTake ? take : score;
  var seconds = () => performance.now() / 1e3;
  function notify(message) {
    clearTimeout(noticeTimer);
    const notice = byId("notice");
    notice.textContent = message;
    notice.classList.add("visible");
    noticeTimer = setTimeout(() => notice.classList.remove("visible"), 3800);
  }
  function fillRange(input) {
    const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty("--fill", 100 * ratio + "%");
  }
  function updateButton(button, icon, label) {
    button.querySelector("use").setAttribute("href", "#icon-" + icon);
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  function currentPosition() {
    if (!active) return position;
    const elapsed = active.offset + context.currentTime - active.started;
    return looping ? elapsed % active.buffer.duration : Math.min(currentScore().duration, elapsed);
  }
  function buildMeter(target, buffer) {
    const count = 60;
    const heights = new Float32Array(count);
    if (buffer) {
      const samples = buffer.getChannelData(0);
      const window2 = samples.length / count;
      for (let i = 0; i < count; i++) {
        for (let sample = Math.floor(i * window2); sample < (i + 1) * window2; sample += 32) {
          heights[i] = Math.max(heights[i], Math.abs(samples[sample]));
        }
      }
    } else {
      for (const event of target.events) {
        const i = Math.floor(event.time / target.duration * count);
        heights[i] += 0.12 + (6 - event.depth) * 0.025;
        if (i + 1 < count) heights[i + 1] += 0.066;
      }
    }
    const max = Math.max(0.15, ...heights);
    meterBars = Array.from(heights, (signal) => {
      const bar = document.createElement("i");
      bar.style.setProperty("--bar", 13 + 84 * Math.sqrt(signal / max) + "%");
      return bar;
    });
    byId("meter").replaceChildren(...meterBars);
  }
  function updateTransport() {
    const target = currentScore();
    const time = currentPosition();
    const progress = Math.floor(time / target.duration * meterBars.length);
    for (let i = 0; i < meterBars.length; i++) meterBars[i].classList.toggle("played", i < progress);
    seek.value = time;
    seek.setAttribute("aria-valuetext", clock(time) + " of " + clock(target.duration));
    byId("elapsed").textContent = clock(time);
    if (playRequest) updateButton(playButton, "pause", "Cancel preparing audio");
    else if (active) updateButton(playButton, "pause", useTake ? "Pause take" : "Pause composition");
    else updateButton(playButton, "play", useTake ? "Play take" : "Play composition");
  }
  function describe(branch) {
    const path = branch.path ? [...branch.path].join(" › ") : "Trunk";
    return path + " · Level " + branch.depth;
  }
  function draw() {
    if (!score) return;
    const now = seconds();
    const target = currentScore();
    const time = currentPosition();
    live = live.filter((note2) => now - note2.time < 2);
    trail = trail.filter((point) => now - point.time < 0.48);
    garden.draw({ time, events: target.events, played: hasPlayed, selected, hover, reduced: reducedMotion.matches, now, cursor, live, trail });
    const recent = active && target.events.findLast((event) => event.time <= time);
    const branch = target.branches[hover ?? selected] ?? recent;
    const noteLabel = byId("branch-note");
    const note = branch ? noteName(branch.midi) : "♪";
    if (noteLabel.textContent !== note) {
      noteLabel.textContent = note;
      noteAnimation?.cancel();
      if (!reducedMotion.matches) noteAnimation = noteLabel.animate([{ opacity: 0.52 }, { opacity: 1 }], 165);
    }
    const age = Math.min(now - (live.at(-1)?.time ?? -Infinity), recent ? time - recent.time : Infinity);
    document.body.style.setProperty("--wash", reducedMotion.matches ? 0.09 : 0.09 + Math.max(0, 1 - age / 0.72) * 0.13);
    const message = branch ? describe(branch) : "Branch notes";
    if (byId("branch-detail").textContent !== message) byId("branch-detail").textContent = message;
    if (recording?.start != null) {
      byId("capture-state").textContent = clock(now - recording.start) + " · " + recording.notes.length + " notes";
    }
  }
  function requestPaint() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (now - lastPaint >= (reducedMotion.matches ? 75 : 25)) {
      updateTransport();
      draw();
      lastPaint = now;
    } else {
      requestPaint();
    }
    if (active || recording?.start != null || live.length || trail.length || !reducedMotion.matches && garden.revealing(seconds())) requestPaint();
  }
  function detach() {
    if (!active) return;
    const { source, gain, started } = active;
    active = null;
    const now = context.currentTime;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    const volumeAtStop = Math.max(0, Math.min(1, (now - started) / 0.045));
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(volumeAtStop, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.04);
    source.stop(now + 0.045);
  }
  function pause() {
    position = currentPosition();
    playRequest = null;
    detach();
    updateTransport();
    draw();
  }
  function syncVolume() {
    const level = Number(volume.value);
    if (master) master.gain.setTargetAtTime(level / 100, context.currentTime, 0.024);
    updateButton(mute, level ? "volume" : "muted", level ? "Mute" : "Unmute");
    fillRange(volume);
  }
  async function enableAudio() {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = Number(volume.value) / 100;
      master.connect(context.destination);
    }
    if (context.state !== "running") await context.resume();
  }
  function rendered(target) {
    if (target === renderedScore?.target) return renderedScore.promise;
    const promise = renderScore(target).then((buffer) => {
      if (target === currentScore()) buildMeter(target, buffer);
      return buffer;
    }).catch((error) => {
      if (renderedScore?.promise === promise) renderedScore = null;
      throw error;
    });
    renderedScore = { target, promise };
    return promise;
  }
  function start(buffer, offset) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.045);
    source.buffer = buffer;
    source.loop = looping;
    source.connect(gain).connect(master);
    source.start(now, offset);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (active?.source !== source) return;
      active = null;
      position = currentScore().duration;
      updateTransport();
      draw();
    };
    active = { source, gain, buffer, offset, started: now };
    requestPaint();
  }
  async function play() {
    if (recording) return;
    if (active || playRequest) {
      pause();
      return;
    }
    const target = currentScore();
    const request = {};
    playRequest = request;
    updateTransport();
    try {
      await enableAudio();
      if (playRequest !== request) return;
      const buffer = await rendered(target);
      if (playRequest !== request) return;
      if (position >= target.duration - 0.02) position = 0;
      hasPlayed = true;
      selected = null;
      start(buffer, position);
    } catch (error) {
      if (playRequest !== request) return;
      console.error(error);
      notify("Audio is unavailable in this browser.");
    } finally {
      if (playRequest === request) playRequest = null;
      updateTransport();
      draw();
    }
  }
  function seekTo(next) {
    const buffer = active?.buffer;
    detach();
    position = next;
    hasPlayed = next > 0 || Boolean(buffer);
    if (buffer && next < currentScore().duration - 0.02) start(buffer, next);
    updateTransport();
    draw();
  }
  function updateCapture() {
    const capturing = Boolean(recording);
    recordButton.setAttribute("aria-pressed", String(capturing));
    recordButton.querySelector("use").setAttribute("href", capturing ? "#icon-stop" : "#icon-record");
    recordButton.querySelector("span").textContent = capturing ? "Finish take" : "Record a take";
    byId("capture-state").textContent = capturing ? "Armed" : take ? take.events.length + " notes" : "Ready";
    byId("capture-help").textContent = capturing ? "Recording starts with your first note." : "Play the tree or use the note keys.";
    byId("art").dataset.recording = capturing;
    byId("capture-state").parentElement.parentElement.dataset.recording = capturing;
    playButton.disabled = capturing;
    seek.disabled = capturing;
    byId("restart").disabled = capturing;
    loopButton.disabled = capturing;
    expandButton.disabled = capturing;
    trackButton.disabled = capturing || !take;
    for (const key of controls) byId(key).disabled = capturing;
    byId("shuffle").disabled = capturing;
    for (const button of presetButtons) button.disabled = capturing;
    download.disabled = capturing || exporting;
  }
  function buildKeys(target) {
    const voiced = /* @__PURE__ */ new Map();
    for (const branch of target.branches) {
      if (!voiced.has(branch.midi)) voiced.set(branch.midi, branch);
    }
    keyBranches = [...voiced.values()].sort((left, right) => left.midi - right.midi).slice(0, keys.length);
    byId("keys").replaceChildren(...keyBranches.map((branch, index) => {
      const button = document.createElement("button");
      const key = keys[index];
      button.type = "button";
      button.className = "key";
      button.setAttribute("aria-keyshortcuts", key.toUpperCase());
      const letter = document.createElement("kbd");
      letter.textContent = key.toUpperCase();
      button.append(letter, document.createTextNode(noteName(branch.midi)));
      button.addEventListener("click", () => triggerKey(index));
      return button;
    }));
  }
  function showSettings(settings) {
    scene = settings.scene;
    for (const key of controls) {
      const input = byId(key);
      input.value = settings[key];
      if (!labels[key]) continue;
      const label = labels[key](settings[key]);
      byId(key + "-value").textContent = label;
      input.setAttribute("aria-valuetext", label);
      fillRange(input);
    }
    for (const button of presetButtons) button.setAttribute("aria-pressed", String(button.dataset.scene === scene));
  }
  function chooseTrack(recorded) {
    playRequest = null;
    detach();
    useTake = recorded && Boolean(take);
    position = 0;
    hasPlayed = false;
    selected = hover = null;
    stroke = null;
    live = [];
    trail = [];
    const target = currentScore();
    showSettings(target.settings);
    if (garden.score?.branches !== target.branches) {
      garden.setScore(target, garden.score?.settings.scene !== target.settings.scene);
    }
    seek.max = target.duration;
    byId("duration").textContent = clock(target.duration);
    byId("scene-name").textContent = target.scene.name;
    byId("scene-scale").textContent = target.scene.scaleName;
    byId("branch-count").textContent = target.branches.length + " branches";
    document.documentElement.style.setProperty("--accent", target.scene.accent);
    trackButton.textContent = useTake ? "Recorded take" : "Recursive score";
    trackButton.title = useTake ? "Switch to recursive score" : "Switch to recorded take";
    if (!exporting) download.querySelector("span").textContent = useTake ? "Download take WAV" : "Download WAV";
    buildMeter(target);
    buildKeys(target);
    updateCapture();
    updateTransport();
    draw();
    if (!reducedMotion.matches && garden.revealing(seconds())) requestPaint();
  }
  function finishRecording() {
    if (!recording) return;
    clearTimeout(recording.timer);
    const result = composeTake(score, recording.notes);
    recording = null;
    if (!result) {
      updateCapture();
      notify("Play at least one note to save a take.");
      return;
    }
    take = result;
    chooseTrack(true);
    notify("Take saved. Play it back or download the WAV.");
  }
  function toggleRecording() {
    if (recording) {
      finishRecording();
      return;
    }
    chooseTrack(false);
    recording = { notes: [], start: null, timer: null };
    updateCapture();
    enableAudio().catch((error) => {
      console.error(error);
      finishRecording();
      notify("Audio is unavailable in this browser.");
    });
  }
  function captureNote(index, time) {
    if (!recording) return;
    if (recording.start == null) {
      recording.start = time;
      recording.timer = setTimeout(finishRecording, takeLimits.seconds * 1e3);
      byId("capture-help").textContent = "Play up to " + takeLimits.seconds + " seconds.";
    }
    if (time - recording.start < takeLimits.seconds) recording.notes.push({ index, time });
    if (recording.notes.length >= takeLimits.notes || time - recording.start >= takeLimits.seconds) finishRecording();
  }
  async function preview(index) {
    const target = currentScore();
    const branch = target.branches[index];
    const session = recording;
    const time = seconds();
    selected = index;
    live.push({ index, time });
    branchSelect.value = index;
    requestPaint();
    try {
      await enableAudio();
      if (target !== currentScore()) return;
      if (liveBus?.seed !== target.settings.seed) {
        const previous = liveBus;
        if (previous) setTimeout(previous.release, 6e3);
        liveBus = { ...instrumentBus(context, master, target.settings.seed), seed: target.settings.seed };
      }
      playBranch(context, liveBus.input, branch, target.scene, context.currentTime + 0.013);
      if (session === recording) captureNote(index, time);
    } catch (error) {
      console.error(error);
      notify("The selected note could not be played.");
    }
  }
  function triggerKey(index) {
    const branch = keyBranches[index];
    if (!branch) return;
    const button = byId("keys").children[index];
    button.classList.add("active");
    setTimeout(() => button.classList.remove("active"), 180);
    preview(branch.index);
  }
  function refresh() {
    const settings = { scene };
    for (const key of controls) settings[key] = Number(byId(key).value);
    score = compose(settings);
    chooseTrack(false);
  }
  async function saveWave() {
    const target = currentScore();
    exporting = true;
    updateCapture();
    download.querySelector("span").textContent = "Preparing WAV…";
    try {
      const buffer = await rendered(target);
      const url = URL.createObjectURL(encodeWave(buffer));
      const link = document.createElement("a");
      link.href = url;
      const { scene: name, seed, depth, angle, taper, tempo } = target.settings;
      link.download = target.take ? "stillwater-" + name + "-" + seed + "-take.wav" : "stillwater-" + name + "-" + seed + "-d" + depth + "-a" + angle + "-l" + taper + "-" + tempo + "bpm.wav";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
      notify(target.take ? "Your take is ready in your downloads." : target.scene.name + " is ready in your downloads.");
    } catch (error) {
      console.error(error);
      notify("The WAV could not be created.");
    } finally {
      exporting = false;
      updateCapture();
      download.querySelector("span").textContent = useTake ? "Download take WAV" : "Download WAV";
    }
  }
  for (const key of controls.slice(0, -1)) byId(key).addEventListener("input", refresh);
  byId("seed").addEventListener("change", (event) => {
    const value = event.target.valueAsNumber;
    event.target.value = Number.isFinite(value) ? Math.max(0, Math.min(999999, Math.round(value))) : currentScore().settings.seed;
    refresh();
  });
  byId("shuffle").addEventListener("click", () => {
    const current = currentScore().settings.seed;
    byId("seed").value = (current + 1 + Math.floor(Math.random() * 999999)) % 1e6;
    refresh();
  });
  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      scene = button.dataset.scene;
      for (const key of controls) byId(key).value = scenes[scene][key];
      refresh();
    });
  }
  playButton.addEventListener("click", play);
  recordButton.addEventListener("click", toggleRecording);
  trackButton.addEventListener("click", () => chooseTrack(!useTake));
  byId("restart").addEventListener("click", () => seekTo(0));
  seek.addEventListener("input", () => seekTo(Number(seek.value)));
  loopButton.addEventListener("click", () => {
    const offset = currentPosition();
    const buffer = active?.buffer;
    looping = !looping;
    loopButton.setAttribute("aria-pressed", String(looping));
    if (buffer) {
      detach();
      start(buffer, offset >= buffer.duration ? 0 : offset);
    }
  });
  volume.addEventListener("input", () => {
    if (Number(volume.value)) rememberedVolume = Number(volume.value);
    syncVolume();
  });
  mute.addEventListener("click", () => {
    volume.value = Number(volume.value) ? 0 : rememberedVolume;
    syncVolume();
  });
  download.addEventListener("click", saveWave);
  function expandGarden(expanded) {
    const main = document.querySelector("main");
    main.dataset.expanded = String(expanded);
    document.querySelector(".settings").hidden = expanded;
    updateButton(expandButton, expanded ? "contract" : "expand", expanded ? "Exit expanded garden" : "Expand garden");
    cursor = hover = null;
    requestPaint();
  }
  expandButton.addEventListener("click", () => expandGarden(document.querySelector("main").dataset.expanded !== "true"));
  byId("about").addEventListener("click", () => byId("about-dialog").showModal());
  byId("browse").addEventListener("click", () => {
    branchSelect.replaceChildren(...currentScore().branches.map(
      (branch) => new Option(describe(branch) + " · " + noteName(branch.midi), branch.index)
    ));
    branchSelect.value = selected ?? 0;
    byId("branch-dialog").showModal();
  });
  byId("preview-note").addEventListener("click", () => preview(Number(branchSelect.value)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]") && document.querySelector("main").dataset.expanded === "true") {
      expandGarden(false);
    }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
    const index = keys.indexOf(event.key.toLowerCase());
    if (index >= 0) triggerKey(index);
  });
  function inspectPointer(event) {
    cursor = garden.coords(event.clientX, event.clientY);
    hover = garden.hit(cursor);
    garden.canvas.style.cursor = hover === null ? "crosshair" : "pointer";
    requestPaint();
  }
  garden.canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    inspectPointer(event);
    garden.canvas.setPointerCapture(event.pointerId);
    const now = seconds();
    stroke = { id: event.pointerId, point: cursor, time: now, last: hover };
    trail = [{ ...cursor, time: now }];
    if (hover !== null) preview(hover);
  });
  garden.canvas.addEventListener("pointermove", (event) => {
    if (!event.isPrimary) return;
    inspectPointer(event);
    if (stroke?.id !== event.pointerId) return;
    const now = seconds();
    trail.push({ ...cursor, time: now });
    if (trail.length > 39) trail.shift();
    const origin = stroke.point;
    stroke.point = cursor;
    if (now - stroke.time < 0.068) return;
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(cursor.x - origin.x, cursor.y - origin.y) / 8)));
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      const index = garden.hit({
        x: origin.x + (cursor.x - origin.x) * fraction,
        y: origin.y + (cursor.y - origin.y) * fraction
      });
      if (index === null || index === stroke.last) continue;
      stroke.last = index;
      stroke.time = now;
      preview(index);
      break;
    }
  });
  function endStroke(event) {
    if (stroke?.id === event.pointerId) stroke = null;
    if (event.pointerType === "touch") {
      cursor = hover = null;
      requestPaint();
    }
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) garden.canvas.addEventListener(type, endStroke);
  garden.canvas.addEventListener("pointerleave", () => {
    cursor = hover = null;
    requestPaint();
  });
  window.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || event.pointerType === "touch") return;
    lightPoint = { x: event.clientX, y: event.clientY };
    if (lightFrame) return;
    lightFrame = requestAnimationFrame(() => {
      lightFrame = 0;
      document.body.style.setProperty("--light-x", lightPoint.x + "px");
      document.body.style.setProperty("--light-y", lightPoint.y + "px");
    });
  }, { passive: true });
  reducedMotion.addEventListener("change", draw);
  syncVolume();
  refresh();
})();
