import {
  clock, compose, describe, focusOn, fromHash, intervalFor, noteName, normalize, scenes, soundingNote, sourceLines, stackAt, subtree, toHash,
} from './score.mjs';
import { encodeWave, renderWave, voiceFor } from './audio.mjs';
import { detectMelody, melodyExample, readMelodyFile } from './melody.mjs';
import { encodeMidi } from './midi.mjs';
import { Garden } from './garden.mjs';
import { Player, audioSession } from './player.mjs';

const byId = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sliders = ['depth', 'sway', 'spread', 'taper', 'cycle'];
const letters = 'asdfghjk';
const words = ['moss', 'ember', 'tide', 'lantern', 'willow', 'heron', 'dusk', 'fern', 'harbor', 'quiet', 'solace', 'drizzle', 'lotus', 'meadow', 'nocturne', 'driftwood', 'firefly', 'monsoon', 'kite', 'saffron'];
const labels = {
  depth: value => value + ' levels',
  sway: value => value + ' / ' + (100 - value),
  spread: value => value + '° · ' + intervalFor(value).name,
  taper: value => value + '%',
  cycle: value => value + ' s',
  nature: value => value === 0 ? 'Off' : value + '%',
};
const body = document.body;
const playButton = byId('play');
const miniPlayer = byId('mini-player');
let pastStage = false;
let screenLock = null;
const seek = byId('seek');
const volume = byId('volume');
const nature = byId('nature');
const waterSounds = byId('water-sounds');
const icicle = byId('icicle');
const melodyDialog = byId('melody-dialog');
const melodyInput = byId('melody-file');
const undoButton = byId('undo-tree');
const waterPreference = 'stillwater.water-sounds';
const naturePreference = 'stillwater.nature';
const seconds = () => performance.now() / 1000;

let settings;
let focusPath = null;
let score;
let drift = false;
let tool = 'play';
let pausedAt = 0;
let lastCycle = null;
let warm = false;
let waterEnabled = true;
let hover = null;
let selected = null;
let cursor = null;
let stroke = null;
let trail = [];
let onsets = new Map();
let echoes = [];
let previousStack = new Set();
let previousLead = null;
let stackKey = '';
let frame = 0;
let activeUntil = 0;
let replaceTimer;
let seekTimer;
let sleepTimer;
let idleTimer;
let noticeTimer;
let rememberedVolume = Number(volume.value);
let busy = false;
let version = 0;
let startRequest;
let melodyDraft = [];
let melodyRequest = 0;
const treeHistory = [];
let editedSlider = null;
let stepping = null;
let steppedAt = 0;
let sourceKey = '';
let topLine = 0;

const quietListening = () => body.dataset.calm === 'true' || Number(byId('sleep').value) > 0;
const player = new Player({
  next: previous => drift ? buildScore(previous.generation + 1) : quietListening() ? previous : null,
  onEnd: () => {
    pausedAt = 0;
    finishPlayback(1.4);
  },
});
const garden = new Garden(byId('garden'), () => paint());

function buildScore(generation) {
  let next = compose({ ...settings, generation });
  if (focusPath) {
    const index = next.branches.findIndex(branch => branch.path === focusPath);
    if (index > 0) next = focusOn(next, index);
    else focusPath = null;
  }
  next.version = version;
  return next;
}

function notify(message) {
  clearTimeout(noticeTimer);
  const notice = byId('notice');
  notice.textContent = message;
  notice.classList.add('visible');
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 4200);
}

function fillRange(input) {
  const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--fill', (100 * ratio) + '%');
}

function setIcon(button, icon, label) {
  button.querySelector('use').setAttribute('href', '#icon-' + icon);
  if (label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}

const level = () => Number(volume.value) / 100;

async function wake(fade = 2.2) {
  await player.ensure(score.seed);
  if (!warm) {
    warm = true;
    player.setNature(Number(nature.value) / 100);
    player.setVolume(level(), fade);
  }
}

// Playback

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
    notify('Audio is unavailable in this browser.');
    return;
  }
  startRequest = null;
  stepping = null;
  if (grow && !reducedMotion.matches) garden.setScore(score, 'grow');
  player.play(score, Math.min(position, score.cycle - 0.05));
  body.dataset.playing = 'true';
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
  body.dataset.playing = 'false';
  clearTimeout(sleepTimer);
  byId('sleep').value = '0';
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
  setIcon(playButton, player.playing ? 'pause' : 'play', player.playing ? 'Pause score' : 'Play score');
  setIcon(byId('mini-play'), player.playing ? 'pause' : 'play', player.playing ? 'Pause score' : 'Play score');
  holdScreen(player.playing);
  byId('tool-play').setAttribute('aria-pressed', String(tool === 'play' && !player.playing));
}

function currentTime() {
  if (!player.playing) return pausedAt;
  const cycle = player.current();
  if (!cycle) return 0;
  return Math.max(0, Math.min(score.cycle, player.now - cycle.start));
}

// Settings

function applySettings(next, mode = 'morph', generation = score?.generation ?? 0) {
  clearTimeout(seekTimer);
  const previousScene = settings?.scene;
  settings = normalize(next);
  stepping = null;
  version++;
  score = buildScore(generation);
  garden.setScore(score, reducedMotion.matches ? 'none' : mode);
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
  applySettings(previous.settings, 'morph', previous.generation);
  notify('Tree edit undone.');
}

function showSettings() {
  for (const key of sliders) {
    const input = byId(key);
    input.value = settings[key];
    const text = labels[key](settings[key]);
    byId(key + '-value').textContent = text;
    input.setAttribute('aria-valuetext', text);
    fillRange(input);
  }
  if (document.activeElement !== byId('seed')) byId('seed').value = settings.seed;
  const scene = scenes[settings.scene];
  for (const button of document.querySelectorAll('[data-scene]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scene === settings.scene));
  }
  byId('scene-name').textContent = scene.name;
  const melody = settings.melody.length;
  byId('scene-scale').textContent = melody ? 'Melody seed · ' + melody + ' notes' : scene.scaleName;
  byId('melody-trigger-label').textContent = melody ? 'Melody seed · ' + melody + ' notes' : 'Plant a melody';
  showAmbience();
  document.documentElement.style.setProperty('--accent', scene.accent);
  const callCount = score.branches.length + (score.branches.length === 1 ? ' call' : ' calls');
  byId('branch-count').textContent = callCount;
  seek.max = score.cycle;
  byId('duration').textContent = clock(score.cycle);
  const inside = score.focus;
  byId('focus-bar').hidden = !inside;
  if (inside) byId('focus-label').textContent = 'Inside ' + describe({ path: inside }) + ' · ' + callCount;
  byId('cycle-label').textContent = inside ? 'Inside a branch · generation ' + (score.generation + 1) : 'Generation ' + (score.generation + 1);
}

function scoreHash() {
  return toHash(settings, focusPath, score.generation, {
    nature: Number(nature.value),
    volume: Number(volume.value),
    water: waterEnabled,
  });
}

function syncHash() {
  try {
    history.replaceState(null, '', scoreHash());
  } catch {
    // Some file:// contexts refuse history updates. Sharing still works.
  }
}

function updateVolume() {
  if (Number(volume.value)) rememberedVolume = Number(volume.value);
  if (warm) player.setVolume(level());
  setIcon(byId('mute'), Number(volume.value) ? 'volume' : 'muted', Number(volume.value) ? 'Mute' : 'Unmute');
  fillRange(volume);
}

function readMix(mix = {}) {
  if (mix.volume !== undefined) volume.value = mix.volume;
  if (mix.nature !== undefined) nature.value = mix.nature;
  if (mix.water !== undefined) waterEnabled = mix.water;
  player.setWater(waterEnabled);
}

function showAmbience() {
  const scene = settings.scene;
  const label = byId('scene-ambience');
  const silent = Number(nature.value) === 0;
  waterSounds.disabled = scene === 'orchid';
  waterSounds.checked = !waterSounds.disabled && !silent && waterEnabled;
  label.textContent = silent ? 'Ambience off'
    : !waterEnabled && scene === 'lagoon' ? 'Crickets'
    : !waterEnabled && scene === 'cedar' ? 'Rain muted'
    : scenes[scene].ambience;
}

function updateNature() {
  const amount = Number(nature.value);
  byId('nature-value').textContent = labels.nature(amount);
  nature.setAttribute('aria-valuetext', labels.nature(amount));
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
    // The current session still keeps the selected mix.
  }
}

function chooseScene(key) {
  if (key !== settings.scene) editTree({ ...settings, scene: key });
}

// Melody clips stay local. Only note numbers and their relative lengths are
// carried into the score and encoded in its share link.
function showMelodyDraft(notes, message) {
  melodyDraft = notes;
  const list = byId('melody-notes');
  list.replaceChildren(...notes.map(([midi]) => {
    const item = document.createElement('li');
    item.textContent = noteName(midi);
    return item;
  }));
  list.hidden = !notes.length;
  byId('melody-apply').disabled = !notes.length;
  byId('melody-status').textContent = message;
}

async function scanMelody(file) {
  const request = ++melodyRequest;
  if (file && file.size > 12 * 1024 * 1024) {
    showMelodyDraft([], 'Choose an audio clip under 12 MB.');
    return;
  }
  showMelodyDraft([], 'Finding the notes…');
  try {
    const { notes, trimmed } = file ? await readMelodyFile(file) : { notes: detectMelody(melodyExample()) };
    if (request !== melodyRequest || !melodyDialog.open) return;
    if (new Set(notes.map(([midi]) => midi)).size < 2) {
      showMelodyDraft([], 'No clear melody found. Try humming a few notes or playing a solo instrument.');
      return;
    }
    showMelodyDraft(notes, notes.length + ' notes detected' + (trimmed ? ' in the first 12 seconds.' : '.'));
  } catch {
    if (request === melodyRequest && melodyDialog.open) {
      showMelodyDraft([], 'This clip could not be read. Try a WAV or MP3 file.');
    }
  }
}

// Humming goes straight from the microphone into the same local detector
// as a chosen clip. Nothing is uploaded, and the stream closes when it stops.
let hum = null;
const humSeconds = 10;

function showHum(active, level = 0) {
  const button = byId('melody-hum');
  button.setAttribute('aria-pressed', String(active));
  button.querySelector('span').textContent = active ? 'Stop and find notes' : 'Hum a melody';
  setIcon(button, active ? 'stop' : 'mic');
  byId('hum-level').style.setProperty('--level', level.toFixed(3));
}

async function startHum() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showMelodyDraft([], 'The microphone is unavailable here. Open the online version, or choose a clip.');
    return;
  }
  if (player.playing || startRequest) pause();
  audioSession('play-and-record');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  } catch {
    audioSession('playback');
    showMelodyDraft([], 'Microphone access was not allowed. You can choose a clip instead.');
    return;
  }
  if (!melodyDialog.open) {
    stream.getTracks().forEach(track => track.stop());
    audioSession('playback');
    return;
  }
  melodyRequest++;
  melodyInput.value = '';
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  const meter = new AudioContext();
  meter.resume().catch(() => {});
  const analyser = meter.createAnalyser();
  analyser.fftSize = 1024;
  meter.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const began = performance.now();
  let discard = false;
  let level = 0;
  const session = {
    stop(cancel = false) {
      discard = cancel;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
  hum = session;
  recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
  recorder.onstop = () => {
    cancelAnimationFrame(session.frame);
    clearTimeout(session.timer);
    stream.getTracks().forEach(track => track.stop());
    audioSession('playback');
    meter.close();
    if (hum === session) hum = null;
    showHum(false);
    if (discard) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (!blob.size) showMelodyDraft([], 'Nothing was captured. Try humming again.');
    else scanMelody(blob);
  };
  const listen = () => {
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    level = Math.max(Math.min(1, Math.sqrt(energy / samples.length) * 6), level * 0.82);
    const left = Math.max(0, Math.ceil(humSeconds - (performance.now() - began) / 1000));
    showHum(true, level);
    byId('melody-status').textContent = 'Listening. Hum or whistle a few clear notes · ' + left + ' s';
    session.frame = requestAnimationFrame(listen);
  };
  recorder.start(250);
  session.timer = setTimeout(() => session.stop(), humSeconds * 1000);
  showMelodyDraft([], 'Listening. Hum or whistle a few clear notes.');
  listen();
}

function useMelody(melody) {
  melodyRequest++;
  melodyDialog.close();
  pausedAt = 0;
  editTree({ ...settings, melody }, 'grow', 0, null);
  if (player.playing) {
    clearTimeout(replaceTimer);
    player.play(score, 0);
  }
  playButton.focus({ preventScroll: true });
  byId('art').scrollIntoView({ block: 'start', behavior: 'instant' });
  notify(melody.length ? 'Melody planted. Tap the branches or play the score.' : 'Melody removed. The scene’s tuning is back.');
}

// Branch actions

function togglePrune(index) {
  const branch = score.branches[index];
  if (!branch) return;
  if (branch.parent === null) {
    notify('The first call cannot be pruned. Try one of its branches.');
    return;
  }
  const pruned = new Set(settings.pruned);
  if (pruned.has(branch.path)) {
    pruned.delete(branch.path);
    notify(describe(branch) + ' regrows. Its calls return.');
  } else if (branch.leaf) {
    notify(describe(branch) + ' is already a base case.');
    return;
  } else {
    pruned.add(branch.path);
    notify(describe(branch) + ' becomes a base case. Its descendant notes drop out.');
  }
  editTree({ ...settings, pruned: [...pruned] });
}

function listenInside(index) {
  const branch = score.branches[index];
  if (!branch || branch.parent === null) return;
  focusPath = branch.path;
  applySettings(settings);
  notify('Listening inside ' + describe(branch) + '. Its span is stretched to a full cycle.');
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

// Play-along keys use the scene's scale an octave above the root.
function keyNote(index) {
  const scene = score.scene;
  let midi;
  if (score.melody) {
    const keys = score.melody.keys;
    const firstOctave = keys.length < 4 ? -1 : 0;
    midi = keys[index % keys.length] + 12 * (firstOctave + Math.floor(index / keys.length));
  } else {
    const octave = Math.floor(index / scene.scale.length);
    midi = scene.root + 12 + 12 * octave + scene.scale[index % scene.scale.length] + score.shift;
  }
  return { midi, depth: 4, pan: (index - 3.5) / 6, velocity: 0.95, start: 0, end: 1 };
}

function buildKeys() {
  const shortcuts = byId('shortcuts').checked;
  byId('keys').replaceChildren(...[...letters].map((letter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'key';
    if (shortcuts) button.setAttribute('aria-keyshortcuts', letter.toUpperCase());
    const kbd = document.createElement('kbd');
    kbd.textContent = letter.toUpperCase();
    button.append(kbd, document.createTextNode(noteName(keyNote(index).midi)));
    button.addEventListener('click', () => playKey(index));
    return button;
  }));
  byId('keys').parentElement.dataset.shortcuts = String(shortcuts);
}

async function playKey(index) {
  const target = score;
  const button = byId('keys').children[index];
  button?.classList.add('active');
  setTimeout(() => button?.classList.remove('active'), 200);
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

// Drawing

function breathAt(stack, time) {
  if (!byId('breathe').checked || !player.playing) return null;
  const guide = stack.filter(node => node.parent !== null && node.end - node.start >= 3).at(-1);
  if (!guide) return null;
  const progress = Math.max(0, Math.min(1, (time - guide.start) / (guide.end - guide.start)));
  const smooth = 0.5 - 0.5 * Math.cos(Math.PI * progress);
  const inhale = guide.path.endsWith('L');
  return { inhale, amount: inhale ? smooth : 1 - smooth };
}

// The debugger view. A call that still has a running child is paused on
// the line that called it. The deepest call has just sounded, or is waiting
// in its base case until its time span ends.
function callChain(branch) {
  const chain = [];
  for (let node = branch; node; node = score.branches[node.parent]) chain.unshift(node);
  return chain;
}

function renderSource(stack, lines) {
  const key = stack.map((node, i) => node.depth + ':' + lines[i]).join('.');
  if (key === sourceKey) return;
  sourceKey = key;
  const top = lines.at(-1) ?? 0;
  const rows = byId('source').children;
  for (const row of rows) {
    const line = Number(row.dataset.line);
    const here = stack.filter((_, i) => lines[i] === line);
    let frames = row.querySelector('.frames');
    if (!frames) {
      frames = document.createElement('span');
      frames.className = 'frames';
      frames.setAttribute('aria-hidden', 'true');
      row.prepend(frames);
    }
    // Up to three frames show their depth. A busier line shows a count.
    const shown = here.length > 3 ? [{ count: here.length }] : here;
    frames.replaceChildren(...shown.map(node => {
      const marker = document.createElement('i');
      marker.textContent = node.count ? '×' + node.count : node.depth;
      if (node.count) marker.className = 'count';
      else if (node === stack.at(-1)) marker.className = 'top';
      return marker;
    }));
    row.classList.toggle('held', here.length > 0);
    row.classList.toggle('on', line === top && stack.length > 0);
    if (line === 2 && top === 2 && topLine !== 2 && !reducedMotion.matches) {
      row.classList.remove('flash');
      void row.offsetWidth;
      row.classList.add('flash');
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
    notify(describe(calls[0]) + ' returned. All ' + calls.length + ' calls have run. Step again to start over.');
    paint();
    return;
  }
  stepping = next;
  steppedAt = seconds();
  pausedAt = calls[next].start;
  const branch = calls[next];
  const why = branch.cut ? 'pruned, so it is a base case' : branch.children.length ? 'it calls left, then right' : 'it is a base case';
  byId('step-status').textContent = 'Step ' + (next + 1) + ' of ' + calls.length + ': ' + describe(branch) + ' sounds ' + noteName(branch.midi) + '. ' + why + '.';
  touch(next);
}

function renderStack(stack, time, lines = []) {
  const count = byId('active-count');
  const countLabel = stack.length === 0 ? 'Idle'
    : player.playing ? stack.length + ' active'
    : stepping !== null ? 'Step ' + (stepping + 1) + ' / ' + score.branches.length
    : 'Paused';
  if (count.textContent !== countLabel) count.textContent = countLabel;
  const beats = stack.map(branch => soundingNote(branch, time).midi);
  const key = stack.map(node => node.index).join('.') + '|' + beats.join('.') + '|' + lines.join('') + '|' + score.version + '|' + score.generation + '|' + (score.focus ?? '');
  const list = byId('stack');
  if (key !== stackKey) {
    stackKey = key;
    list.replaceChildren(...stack.map((node, index) => {
      const item = document.createElement('li');
      item.style.setProperty('--depth', node.depth);
      const name = document.createElement('span');
      name.className = 'frame-name';
      name.textContent = describe(node);
      if (lines[index]) {
        const line = document.createElement('span');
        line.className = 'frame-line';
        line.textContent = ':' + lines[index];
        name.append(line);
      }
      const note = document.createElement('span');
      note.className = 'frame-note';
      note.textContent = noteName(beats[index]);
      item.append(name, note);
      if (node.cut) item.classList.add('cut');
      if (node.melodyLead) item.classList.add('melodic');
      return item;
    }));
    if (!stack.length) {
      const item = document.createElement('li');
      item.className = 'idle';
      item.textContent = 'Play the score to see the active calls.';
      list.append(item);
    }
  }
  [...list.children].forEach((item, i) => {
    const node = stack[i];
    if (!node) return;
    const progress = Math.max(0, Math.min(1, (time - node.start) / (node.end - node.start)));
    item.style.setProperty('--progress', progress.toFixed(3));
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
  const ctx = icicle.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const accent = scenes[settings.scene].accent;
  const levels = Math.max(...score.branches.map(branch => branch.depth)) + 1;
  const row = rect.height / levels;
  const active = new Set(stack.map(node => node.index));
  const started = player.playing || pausedAt > 0;
  for (const branch of score.branches) {
    const x = branch.start / score.cycle * rect.width;
    const w = Math.max(1, (branch.end - branch.start) / score.cycle * rect.width - 1);
    const lit = active.has(branch.index);
    const done = started && branch.end <= time;
    ctx.globalAlpha = lit ? 0.95 : done ? 0.42 : 0.17;
    ctx.fillStyle = branch.cut ? '#f0b3bc' : accent;
    ctx.fillRect(x, branch.depth * row + 0.5, w, Math.max(1, row - 1.5));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(time / score.cycle * rect.width - 0.75, 0, 1.5, rect.height);
}

function paint() {
  activeUntil = Math.max(activeUntil, seconds() + 0.1);
  if (!frame) frame = requestAnimationFrame(tick);
}

function tick() {
  frame = 0;
  const now = seconds();
  // Adopt each new cycle the player starts: a drifted tree, or a replacement.
  const cycle = player.playing ? player.current() : null;
  if (cycle && cycle !== lastCycle) {
    lastCycle = cycle;
    if (cycle.score !== score && cycle.score.version === version) {
      score = cycle.score;
      garden.setScore(score, reducedMotion.matches ? 'none' : 'morph');
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
    const ids = new Set(stack.map(node => node.index));
    for (const node of stack) {
      if (!previousStack.has(node.index)) onsets.set(node.index, now - Math.max(0, Math.min(0.5, time - node.start)));
    }
    const leaf = stack.at(-1);
    const lead = leaf?.melodyLead ? soundingNote(leaf, time) : null;
    if (leaf && (!previousStack.has(leaf.index) || (lead && lead !== previousLead))) {
      if (lead) onsets.set(leaf.index, now);
      echoes.push({ time: now, pan: leaf.pan, strength: 0.75 });
    }
    previousLead = lead;
    previousStack = ids;
  } else {
    previousStack = new Set();
    previousLead = null;
  }
  for (const [index, at] of onsets) if (now - at > 3) onsets.delete(index);
  echoes = echoes.filter(echo => now - echo.time < 2).slice(-6);
  trail = trail.filter(point => now - point.time < 0.48);

  const ages = new Map([...onsets].map(([index, at]) => [index, now - at]));
  const breath = breathAt(stack, time);
  const marked = tool === 'prune' && hover !== null && score.branches[hover]?.parent !== null && !score.branches[hover]?.leaf
    ? new Set(subtree(score.branches, hover)) : null;
  garden.draw({
    now, reduced: reducedMotion.matches, time: player.playing ? time : stepped ? time + 0.001 : null,
    stack: player.playing || stepped ? stack : [],
    onsets: ages, cursor, trail, hover, selected, marked, breath, tool,
    echoes: echoes.map(echo => ({ age: now - echo.time, pan: echo.pan, strength: echo.strength })),
  });

  renderStack(stack, time, lines);
  renderSource(stack, lines);
  drawIcicle(stack, time);
  if (document.activeElement !== seek) seek.value = time;
  seek.setAttribute('aria-valuetext', clock(time) + ' of ' + clock(score.cycle));
  byId('elapsed').textContent = clock(time);
  if (!miniPlayer.hidden) {
    byId('mini-label').textContent = byId('cycle-label').textContent;
    byId('mini-time').textContent = clock(time) + ' / ' + clock(score.cycle);
  }

  const cue = byId('breath');
  cue.hidden = !breath;
  if (breath) {
    cue.textContent = breath.inhale ? 'Breathe in' : 'Breathe out';
    cue.style.setProperty('--breath', breath.amount.toFixed(3));
  }

  const picked = score.branches[hover ?? selected];
  const branch = picked ?? (player.playing ? stack.at(-1) : null);
  const note = branch ? noteName(picked ? picked.midi : soundingNote(branch, time).midi) : '♪';
  if (byId('branch-note').textContent !== note) byId('branch-note').textContent = note;
  const detail = branch
    ? describe(branch) + ' · level ' + branch.depth + ' · ' + voiceFor(score.scene, branch.depth) +
      (branch.cut ? ' · pruned' : branch.melodyLead ? ' · melody' : '')
    : 'Tap or drag across branches';
  if (byId('branch-detail').textContent !== detail) byId('branch-detail').textContent = detail;

  if (player.playing || garden.animating(now) || trail.length || onsets.size || echoes.length || now < activeUntil || fresh) {
    frame = requestAnimationFrame(tick);
  }
}

// Exports

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seed';
const fileStem = () => 'stillwater-' + settings.scene + '-' + slug(settings.seed) + '-g' + (score.generation + 1) + (score.focus ? '-inside-' + score.focus : '');

function exportScores() {
  const count = Number(byId('export-length').value);
  return Array.from({ length: count }, (_, k) => k === 0 ? score : buildScore(score.generation + k));
}

async function saveWave() {
  if (busy) return;
  busy = true;
  const button = byId('download');
  button.disabled = true;
  button.querySelector('span').textContent = 'Rendering…';
  try {
    const scores = exportScores();
    const name = fileStem() + (scores.length > 1 ? '-' + scores.length + 'cycles' : '') + '.wav';
    const { blob, duration } = await renderWave(scores, {
      nature: Number(nature.value) / 100,
      water: waterEnabled,
      onCycle: (index, total) => {
        button.querySelector('span').textContent = 'Rendering ' + index + '/' + total + '…';
      },
    });
    download(blob, name);
    notify('Saved ' + clock(duration) + ' of 44.1 kHz stereo WAV.');
  } catch (error) {
    console.error(error);
    notify('The WAV could not be rendered.');
  } finally {
    busy = false;
    button.disabled = false;
    button.querySelector('span').textContent = 'Score WAV';
  }
}

function saveMidi() {
  const scores = exportScores();
  download(encodeMidi(scores, voiceFor), fileStem() + '.mid');
  notify('Saved a MIDI file with one track per recursion level.');
}

function savePostcard() {
  const scene = scenes[settings.scene];
  const card = garden.postcard([
    scene.name,
    'seed “' + settings.seed + '” · depth ' + settings.depth + ' · sway ' + settings.sway + ' · spread ' + settings.spread + '° · ' + score.branches.length + ' calls',
  ]);
  card.toBlob(blob => blob && download(blob, fileStem() + '.png'), 'image/png');
  notify('Saved a postcard of this tree.');
}

async function shareLink() {
  const base = location.protocol === 'file:' ? 'https://tanzamul-azad.github.io/StillWater/' : location.href.split('#')[0];
  const url = base + scoreHash();
  try {
    await navigator.clipboard.writeText(url);
    notify('Link copied with this tree and listening mix.');
  } catch {
    window.prompt('Copy this link to share your tree and mix.', url);
  }
}

async function toggleRecording() {
  const button = byId('record');
  if (button.hasAttribute('aria-busy')) return;
  button.setAttribute('aria-busy', 'true');
  try {
    if (player.recording) {
      const name = fileStem() + '-session';
      button.querySelector('span').textContent = 'Saving…';
      const blob = await player.stopRecording();
      if (!blob?.size) {
        notify('No audio was captured. Try recording again.');
        return;
      }
      try {
        const buffer = await player.context.decodeAudioData(await blob.arrayBuffer());
        download(encodeWave(buffer), name + '.wav');
        notify('Saved the performance as a WAV.');
      } catch {
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        download(blob, name + '.' + extension);
        notify('Saved your session recording.');
      }
    } else {
      await wake(0.09);
      if (!player.startRecording()) {
        notify('Live recording is unavailable in this browser. Score WAV is available.');
        return;
      }
      notify('Recording your playing and any score or ambience you hear.');
    }
  } catch {
    notify('The recording could not be completed.');
  } finally {
    const active = Boolean(player.recording);
    button.removeAttribute('aria-busy');
    button.setAttribute('aria-pressed', String(active));
    setIcon(button, active ? 'stop' : 'record', active ? 'Stop and save performance' : 'Record performance');
    button.querySelector('span').textContent = active ? 'Stop & save' : 'Record';
  }
}

// Calm mode

function setCalm(on) {
  body.dataset.calm = String(on);
  showMini();
  setIcon(byId('calm'), on ? 'close' : 'calm', on ? 'Leave calm mode' : 'Enter calm mode');
  byId('calm').setAttribute('aria-pressed', String(on));
  cursor = hover = null;
  if (on) {
    clearTimeout(noticeTimer);
    byId('notice').classList.remove('visible');
    setTool('play');
    document.documentElement.requestFullscreen?.().catch(() => {});
    if (!player.playing) start(pausedAt);
    wakeChrome();
  } else {
    clearTimeout(idleTimer);
    body.dataset.idle = 'false';
    if (!drift && !quietListening()) player.stopAfterCurrent();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  paint();
}

function wakeChrome() {
  body.dataset.idle = 'false';
  clearTimeout(idleTimer);
  if (body.dataset.calm === 'true') idleTimer = setTimeout(() => { body.dataset.idle = 'true'; }, 3200);
}

// Events

for (const key of sliders) {
  const input = byId(key);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (value === settings[key]) return;
    if (editedSlider !== key) rememberTree();
    editedSlider = key;
    applySettings({ ...settings, [key]: value });
  });
  for (const event of ['change', 'blur']) {
    input.addEventListener(event, () => { if (editedSlider === key) editedSlider = null; });
  }
}
byId('seed').addEventListener('change', event => {
  const seed = event.target.value || scenes[settings.scene].defaults.seed;
  if (seed !== settings.seed) editTree({ ...settings, seed, pruned: [] }, 'grow', undefined, null);
  event.target.value = settings.seed;
});
byId('seed').addEventListener('keydown', event => {
  if (event.key === 'Enter') event.target.blur();
});
byId('shuffle').addEventListener('click', () => {
  const options = words.filter(word => word !== settings.seed);
  editTree({ ...settings, seed: options[Math.floor(Math.random() * options.length)], pruned: [] }, 'grow', undefined, null);
});
byId('reset-tree').addEventListener('click', () => {
  editTree({ ...settings, ...scenes[settings.scene].defaults, pruned: [] }, 'grow', 0, null);
  notify('Tree reset to the current soundscape’s starting shape.');
});
undoButton.addEventListener('click', undoTree);
byId('step').addEventListener('click', stepCall);
byId('shape-tree').addEventListener('click', () => byId('depth').focus());
for (const button of document.querySelectorAll('[data-scene]')) button.addEventListener('click', () => chooseScene(button.dataset.scene));

playButton.addEventListener('click', togglePlay);
byId('restart').addEventListener('click', () => {
  clearTimeout(seekTimer);
  pausedAt = 0;
  if (player.playing) player.play(score, 0);
  paint();
});
byId('drift').addEventListener('click', event => {
  drift = !drift;
  event.currentTarget.setAttribute('aria-pressed', String(drift));
  if (!drift) player.stopAfterCurrent();
  notify(drift ? 'Drift on. The score repeats and evolves.' : 'Drift off. The score plays one cycle outside calm or timed listening.');
});
seek.addEventListener('input', () => {
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
volume.addEventListener('input', updateVolume);
volume.addEventListener('change', syncHash);
byId('mute').addEventListener('click', () => {
  volume.value = Number(volume.value) ? 0 : rememberedVolume;
  volume.dispatchEvent(new Event('input'));
  syncHash();
});
nature.addEventListener('input', () => {
  updateNature();
});
nature.addEventListener('change', () => {
  saveNature();
  syncHash();
});
waterSounds.addEventListener('change', () => {
  waterEnabled = waterSounds.checked;
  player.setWater(waterEnabled);
  if (waterEnabled && Number(nature.value) === 0 && settings.scene !== 'orchid') {
    nature.value = '60';
    updateNature();
    saveNature();
  } else {
    showAmbience();
  }
  try {
    localStorage.setItem(waterPreference, waterEnabled ? 'on' : 'off');
  } catch {
    // The current session still keeps the selected mix.
  }
  syncHash();
});
byId('sleep').addEventListener('change', event => {
  clearTimeout(sleepTimer);
  const minutes = Number(event.target.value);
  if (!minutes) {
    if (!drift && !quietListening()) player.stopAfterCurrent();
    notify('Sleep timer off.');
    return;
  }
  sleepTimer = setTimeout(() => {
    player.setVolume(0, 40);
    sleepTimer = setTimeout(() => player.playing && pause(), 40_000);
  }, minutes * 60_000 - 40_000);
  notify('Stillwater will fade out and stop after ' + minutes + ' minutes.');
  if (!player.playing) start(pausedAt);
});
byId('breathe').addEventListener('change', paint);
byId('download').addEventListener('click', saveWave);
byId('midi').addEventListener('click', saveMidi);
byId('postcard').addEventListener('click', savePostcard);
byId('share').addEventListener('click', shareLink);
byId('record').addEventListener('click', toggleRecording);
byId('leave').addEventListener('click', leaveInside);
byId('calm').addEventListener('click', () => setCalm(body.dataset.calm !== 'true'));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && body.dataset.calm === 'true') setCalm(false);
});
for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) window.addEventListener(type, wakeChrome, { passive: true });

// Phones: a mini player once the transport scrolls away, a screen that stays
// on while the score plays, and audio that resumes after the tab returns.

function showMini() {
  const hidden = !pastStage || body.dataset.calm === 'true';
  if (miniPlayer.hidden === hidden) return;
  miniPlayer.hidden = hidden;
  paint();
}
new IntersectionObserver(([entry]) => {
  pastStage = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
  showMini();
}).observe(byId('art').parentElement.querySelector('.transport'));
byId('mini-play').addEventListener('click', togglePlay);
byId('mini-tree').addEventListener('click', () => {
  byId('art').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
});

async function holdScreen(on) {
  if (!on) {
    screenLock?.release().catch(() => {});
    screenLock = null;
    return;
  }
  if (screenLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    screenLock = await navigator.wakeLock.request('screen');
    screenLock.addEventListener('release', () => { screenLock = null; });
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !player.playing) return;
  if (player.context && player.context.state !== 'running') player.context.resume().catch(() => {});
  holdScreen(true);
});

function setTool(next) {
  tool = next;
  byId('tool-play').setAttribute('aria-pressed', String(tool === 'play' && !player.playing));
  byId('tool-prune').setAttribute('aria-pressed', String(tool === 'prune'));
  byId('art').dataset.tool = tool;
  paint();
}
byId('tool-play').addEventListener('click', () => {
  if (player.playing || startRequest) pause();
  setTool('play');
});
byId('tool-prune').addEventListener('click', () => setTool('prune'));

byId('about').addEventListener('click', () => byId('about-dialog').showModal());
function openMelody() {
  const notes = settings.melody;
  showMelodyDraft(notes, notes.length ? notes.length + ' notes in this tree.' : 'Hum a few notes, choose a clip, or try the example.');
  byId('melody-clear').hidden = !notes.length;
  byId('melody-apply').disabled = true;
  melodyDialog.showModal();
}
byId('melody-open').addEventListener('click', openMelody);
melodyDialog.addEventListener('close', () => {
  melodyRequest++;
  melodyInput.value = '';
  hum?.stop(true);
});
byId('melody-hum').addEventListener('click', () => (hum ? hum.stop() : startHum()));
melodyInput.addEventListener('change', () => {
  const file = melodyInput.files?.[0];
  if (file) scanMelody(file);
});
byId('melody-example').addEventListener('click', () => {
  melodyInput.value = '';
  scanMelody();
});
byId('melody-clear').addEventListener('click', () => useMelody([]));
byId('melody-apply').addEventListener('click', () => {
  if (melodyDraft.length) useMelody(melodyDraft);
});
function updatePruneButton() {
  const branch = score.branches[Number(byId('branch-select').value)];
  byId('prune-toggle').querySelector('span').textContent = branch && settings.pruned.includes(branch.path) ? 'Regrow' : 'Prune';
}
byId('browse').addEventListener('click', () => {
  const select = byId('branch-select');
  select.replaceChildren(...score.branches.map(branch =>
    new Option(describe(branch) + ' · ' + noteName(branch.midi) + (branch.cut ? ' · pruned' : branch.leaf ? ' · base case' : ''), branch.index)
  ));
  select.value = selected ?? 0;
  updatePruneButton();
  byId('branch-dialog').showModal();
});
byId('branch-select').addEventListener('change', () => {
  selected = Number(byId('branch-select').value);
  updatePruneButton();
  paint();
});
byId('preview-note').addEventListener('click', () => touch(Number(byId('branch-select').value)));
byId('inside').addEventListener('click', () => {
  byId('branch-dialog').close();
  listenInside(Number(byId('branch-select').value));
});
byId('prune-toggle').addEventListener('click', () => {
  byId('branch-dialog').close();
  togglePrune(Number(byId('branch-select').value));
});
byId('shortcuts').addEventListener('change', buildKeys);

byId('begin').addEventListener('click', () => {
  byId('intro').close();
  start(0, true);
});
byId('silent').addEventListener('click', () => byId('intro').close());
byId('intro-hum').addEventListener('click', () => {
  byId('intro').close();
  openMelody();
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === 'z' &&
      !event.target.closest?.('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]') && !undoButton.disabled) {
    event.preventDefault();
    undoTree();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && body.dataset.calm === 'true') {
    setCalm(false);
    return;
  }
  if (event.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePlay();
    return;
  }
  if (event.key === 'n' || event.key === 'N') {
    stepCall();
    return;
  }
  if (!byId('shortcuts').checked || event.key.length !== 1) return;
  const index = letters.indexOf(event.key.toLowerCase());
  if (index >= 0) playKey(index);
});

// Pointer play and pruning on the tree

function inspect(event) {
  cursor = garden.coords(event.clientX, event.clientY);
  hover = garden.hit(cursor);
  garden.canvas.style.cursor = hover === null ? 'crosshair' : tool === 'prune' ? 'cell' : 'pointer';
  paint();
}

garden.canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  inspect(event);
  if (tool === 'prune') {
    if (hover !== null) togglePrune(hover);
    return;
  }
  garden.canvas.setPointerCapture(event.pointerId);
  stroke = { id: event.pointerId, point: cursor, last: hover, time: seconds() };
  trail = [{ ...cursor, time: seconds() }];
  if (hover !== null) touch(hover);
});
garden.canvas.addEventListener('pointermove', event => {
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
    break;
  }
});
function endStroke(event) {
  if (stroke?.id === event.pointerId) stroke = null;
  if (event.pointerType === 'touch') {
    cursor = hover = null;
    paint();
  }
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) garden.canvas.addEventListener(type, endStroke);
garden.canvas.addEventListener('pointerleave', () => {
  cursor = hover = null;
  paint();
});
garden.canvas.addEventListener('dblclick', event => {
  if (tool !== 'play') return;
  const index = garden.hit(garden.coords(event.clientX, event.clientY));
  if (index !== null) listenInside(index);
});
window.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType === 'touch') return;
  body.style.setProperty('--light-x', event.clientX + 'px');
  body.style.setProperty('--light-y', event.clientY + 'px');
}, { passive: true });
window.addEventListener('resize', paint);
reducedMotion.addEventListener('change', paint);
window.addEventListener('hashchange', () => {
  const shared = fromHash(location.hash);
  if (!shared) return;
  treeHistory.length = 0;
  editedSlider = null;
  undoButton.disabled = true;
  readMix(shared.mix);
  focusPath = shared.focus;
  pausedAt = 0;
  applySettings(shared.settings, 'morph', shared.generation);
  updateVolume();
  updateNature();
});

// Start: restore a shared tree from the link, or the default lagoon.
try {
  waterEnabled = localStorage.getItem(waterPreference) !== 'off';
  const savedNature = localStorage.getItem(naturePreference);
  if (savedNature !== null) nature.value = savedNature;
} catch {
  // Some browsers disallow storage for local files.
}
const shared = fromHash(location.hash);
readMix(shared?.mix);
focusPath = shared?.focus ?? null;
applySettings(shared?.settings ?? { scene: 'lagoon', ...scenes.lagoon.defaults, pruned: [] }, 'none', shared?.generation);
updateVolume();
updateNature();
try {
  byId('intro').showModal();
} catch {
  byId('intro').setAttribute('open', '');
}
