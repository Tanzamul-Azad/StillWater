import { branchPath, clock, compose, composeTake, noteName, scenes, takeLimits } from './score.mjs';
import { encodeWave, instrumentBus, playBranch, renderScore } from './audio.mjs';
import { Garden } from './garden.mjs';

const byId = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const controls = ['depth', 'angle', 'taper', 'tempo', 'seed'];
const keys = 'asdfghjk';
const presetButtons = [...document.querySelectorAll('[data-scene]')];
const playButton = byId('play');
const recordButton = byId('record');
const stageRecord = byId('stage-record');
const stageCapture = byId('stage-capture');
const shortcuts = byId('shortcuts');
const expandButton = byId('expand');
const trackButton = byId('track');
const seek = byId('seek');
const volume = byId('volume');
const mute = byId('mute');
const loopButton = byId('loop');
const download = byId('download');
const branchSelect = byId('branch-select');
const garden = new Garden(byId('garden'), draw);
const labels = {
  depth: number => number + (number === 1 ? ' level' : ' levels'),
  angle: number => number + '°',
  taper: number => number + '%',
  tempo: number => number + ' BPM',
};

let score;
let scene = 'lagoon';
let take;
let useTake = false;
let recording;
let liveBus;
let context;
let master;
let renderedScore;
let active;
let playRequest;
let pathRequest;
let scrub;
let position = 0;
let hasPlayed = false;
let looping = false;
let exporting = false;
let selected = null;
let hover = null;
let cursor = null;
let stroke;
let trail = [];
let live = [];
let keyBranches = [];
let meterBars = [];
let frame = 0;
let lastPaint = -Infinity;
let noticeTimer;
let noteAnimation;
let lightPoint;
let lightFrame = 0;
let rememberedVolume = Number(volume.value);

const currentScore = () => useTake ? take : score;
const seconds = () => performance.now() / 1000;

function notify(message) {
  clearTimeout(noticeTimer);
  const notice = byId('notice');
  notice.textContent = message;
  notice.classList.add('visible');
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3800);
}

function fillRange(input) {
  const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--fill', (100 * ratio) + '%');
}

function updateButton(button, icon, label) {
  button.querySelector('use').setAttribute('href', '#icon-' + icon);
  button.setAttribute('aria-label', label);
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
    const window = samples.length / count;
    for (let i = 0; i < count; i++) {
      for (let sample = Math.floor(i * window); sample < (i + 1) * window; sample += 32) {
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
  meterBars = Array.from(heights, signal => {
    const bar = document.createElement('i');
    bar.style.setProperty('--bar', (13 + 84 * Math.sqrt(signal / max)) + '%');
    return bar;
  });
  byId('meter').replaceChildren(...meterBars);
}

function updateTransport() {
  const target = currentScore();
  const time = currentPosition();
  const progress = Math.floor(time / target.duration * meterBars.length);
  for (let i = 0; i < meterBars.length; i++) meterBars[i].classList.toggle('played', i < progress);
  seek.value = time;
  seek.setAttribute('aria-valuetext', clock(time) + ' of ' + clock(target.duration));
  byId('elapsed').textContent = clock(time);
  playButton.setAttribute('aria-busy', String(Boolean(playRequest)));
  if (playRequest) updateButton(playButton, 'pause', 'Cancel preparing audio');
  else if (active) updateButton(playButton, 'pause', useTake ? 'Pause take' : 'Pause composition');
  else updateButton(playButton, 'play', useTake ? 'Play take' : 'Play composition');
}

function describe(branch) {
  const path = branch.path ? [...branch.path].join(' › ') : 'Trunk';
  return path + ' · Level ' + branch.depth;
}

function draw() {
  if (!score) return;
  const now = seconds();
  const target = currentScore();
  const time = currentPosition();
  live = live.filter(note => now - note.time < 2);
  trail = trail.filter(point => now - point.time < 0.48);
  garden.draw({ time, events: target.events, played: hasPlayed, selected, hover, reduced: reducedMotion.matches, now, cursor, live, trail });
  const recent = active && target.events.findLast(event => event.time <= time);
  const branch = target.branches[hover ?? selected] ?? recent;
  const noteLabel = byId('branch-note');
  const note = branch ? noteName(branch.midi) : '♪';
  if (noteLabel.textContent !== note) {
    noteLabel.textContent = note;
    noteAnimation?.cancel();
    if (!reducedMotion.matches) noteAnimation = noteLabel.animate([{ opacity: 0.52 }, { opacity: 1 }], 165);
  }
  const age = Math.min(now - (live.at(-1)?.time ?? -Infinity), recent ? time - recent.time : Infinity);
  document.body.style.setProperty('--wash', reducedMotion.matches ? 0.09 : 0.09 + Math.max(0, 1 - age / 0.72) * 0.13);
  const message = branch ? describe(branch) : 'Branch notes';
  if (byId('branch-detail').textContent !== message) byId('branch-detail').textContent = message;
  if (recording?.start != null) {
    const elapsed = clock(now - recording.start);
    byId('capture-state').textContent = elapsed + ' · ' + noteCount(recording.notes.length);
    stageCapture.textContent = elapsed + ' · ' + noteCount(recording.notes.length);
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
  if (active || recording?.start != null || live.length || trail.length || (!reducedMotion.matches && garden.revealing(seconds()))) requestPaint();
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
  scrub = null;
  detach();
  updateTransport();
  draw();
}

function syncVolume() {
  const level = Number(volume.value);
  if (master) master.gain.setTargetAtTime(level / 100, context.currentTime, 0.024);
  updateButton(mute, level ? 'volume' : 'muted', level ? 'Mute' : 'Unmute');
  fillRange(volume);
}

async function enableAudio() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = Number(volume.value) / 100;
    master.connect(context.destination);
  }
  if (context.state !== 'running') await context.resume();
}

function rendered(target) {
  if (target === renderedScore?.target) return renderedScore.promise;
  const result = { target, buffer: null, promise: null };
  result.promise = renderScore(target).then(buffer => {
    result.buffer = buffer;
    if (target === currentScore()) buildMeter(target, buffer);
    return buffer;
  }).catch(error => {
    if (renderedScore === result) renderedScore = null;
    throw error;
  });
  renderedScore = result;
  return result.promise;
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
  if (recording || scrub) return;
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
    if (scrub) {
      scrub.buffer = buffer;
      return;
    }
    if (position >= target.duration - 0.02) position = 0;
    hasPlayed = true;
    selected = null;
    start(buffer, position);
  } catch (error) {
    if (playRequest !== request) return;
    console.error(error);
    notify('Audio is unavailable in this browser.');
  } finally {
    if (playRequest === request) playRequest = null;
    updateTransport();
    draw();
  }
}

function seekTo(next) {
  const buffer = active?.buffer;
  scrub = null;
  detach();
  position = next;
  hasPlayed = next > 0 || Boolean(buffer);
  if (buffer && next < currentScore().duration - 0.02) start(buffer, next);
  updateTransport();
  draw();
}

function beginScrub(event) {
  if (!event.isPrimary || event.button !== 0 || seek.disabled) return;
  scrub = { pointerId: event.pointerId, buffer: active?.buffer };
  position = currentPosition();
  detach();
}

function updateSeek() {
  const next = Number(seek.value);
  if (!scrub) {
    seekTo(next);
    return;
  }
  position = next;
  hasPlayed = next > 0;
  updateTransport();
  draw();
}

function finishScrub(event) {
  if (scrub?.pointerId !== event.pointerId) return;
  const { buffer } = scrub;
  scrub = null;
  if (buffer && position < currentScore().duration - 0.02) {
    hasPlayed = true;
    start(buffer, position);
  }
  updateTransport();
  draw();
}

function noteCount(count) {
  return count + (count === 1 ? ' note' : ' notes');
}

function updateCapture() {
  const capturing = Boolean(recording);
  recordButton.setAttribute('aria-pressed', String(capturing));
  recordButton.querySelector('use').setAttribute('href', capturing ? '#icon-stop' : '#icon-record');
  recordButton.querySelector('span').textContent = capturing ? 'Finish take' : 'Record a take';
  stageRecord.setAttribute('aria-pressed', String(capturing));
  updateButton(stageRecord, capturing ? 'stop' : 'record', capturing ? 'Stop recording' : 'Start recording');
  stageCapture.hidden = !capturing;
  stageCapture.textContent = 'Armed';
  byId('capture-state').textContent = capturing ? 'Armed' : take ? noteCount(take.events.length) : 'Ready';
  byId('capture-help').textContent = capturing ? 'Recording starts with your first note.' : 'Play the tree or use the note keys.';
  byId('art').dataset.recording = capturing;
  byId('capture-state').parentElement.parentElement.dataset.recording = capturing;
  playButton.disabled = capturing;
  seek.disabled = capturing;
  byId('restart').disabled = capturing;
  loopButton.disabled = capturing;
  expandButton.disabled = capturing;
  trackButton.disabled = capturing || !take;
  for (const key of controls) byId(key).disabled = capturing;
  byId('shuffle').disabled = capturing;
  for (const button of presetButtons) button.disabled = capturing;
  download.disabled = capturing || exporting;
}

function buildKeys(target) {
  const voiced = new Map();
  for (const branch of target.branches) {
    if (!voiced.has(branch.midi)) voiced.set(branch.midi, branch);
  }
  keyBranches = [...voiced.values()].sort((left, right) => left.midi - right.midi).slice(0, keys.length);
  byId('keys').replaceChildren(...keyBranches.map((branch, index) => {
    const button = document.createElement('button');
    const key = keys[index];
    button.type = 'button';
    button.className = 'key';
    if (shortcuts.checked) button.setAttribute('aria-keyshortcuts', key.toUpperCase());
    const letter = document.createElement('kbd');
    letter.textContent = key.toUpperCase();
    button.append(letter, document.createTextNode(noteName(branch.midi)));
    button.addEventListener('click', () => triggerKey(index));
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
    byId(key + '-value').textContent = label;
    input.setAttribute('aria-valuetext', label);
    fillRange(input);
  }
  for (const button of presetButtons) button.setAttribute('aria-pressed', String(button.dataset.scene === scene));
}

function chooseTrack(recorded) {
  playRequest = null;
  pathRequest = null;
  scrub = null;
  detach();
  useTake = recorded && Boolean(take);
  position = 0;
  hasPlayed = false;
  selected = hover = null;
  clearTimeout(stroke?.timer);
  stroke = null;
  live = [];
  trail = [];
  const target = currentScore();
  showSettings(target.settings);
  if (garden.score?.branches !== target.branches) {
    garden.setScore(target, garden.score?.settings.scene !== target.settings.scene);
  }
  seek.max = target.duration;
  byId('duration').textContent = clock(target.duration);
  byId('scene-name').textContent = target.scene.name;
  byId('scene-scale').textContent = target.scene.scaleName;
  byId('branch-count').textContent = target.branches.length + ' branches';
  document.documentElement.style.setProperty('--accent', target.scene.accent);
  trackButton.textContent = useTake ? 'Recorded take' : 'Recursive score';
  trackButton.title = useTake ? 'Switch to recursive score' : 'Switch to recorded take';
  trackButton.setAttribute('aria-label', take ? trackButton.textContent + '. ' + trackButton.title : trackButton.textContent);
  if (!exporting) download.querySelector('span').textContent = useTake ? 'Download take WAV' : 'Download WAV';
  buildMeter(target, target === renderedScore?.target ? renderedScore.buffer : null);
  buildKeys(target);
  updateCapture();
  updateTransport();
  draw();
  if (!reducedMotion.matches && garden.revealing(seconds())) requestPaint();
}

function finishRecording() {
  if (!recording) return;
  clearTimeout(recording.timer);
  const result = composeTake(recording.source, recording.notes);
  recording = null;
  if (!result) {
    updateCapture();
    notify('Play at least one note to save a take.');
    return;
  }
  take = result;
  chooseTrack(true);
  notify('Take saved. Play it back or download the WAV.');
}

function toggleRecording() {
  if (recording) {
    finishRecording();
    return;
  }
  chooseTrack(useTake);
  const session = { source: currentScore(), notes: [], start: null, timer: null };
  recording = session;
  updateCapture();
  enableAudio().catch(error => {
    if (recording !== session) return;
    console.error(error);
    finishRecording();
    notify('Audio is unavailable in this browser.');
  });
}

function captureNote(index, time) {
  if (!recording) return;
  if (recording.start == null) {
    recording.start = time;
    recording.timer = setTimeout(finishRecording, takeLimits.seconds * 1000);
    byId('capture-help').textContent = 'Play up to ' + takeLimits.seconds + ' seconds.';
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
      if (previous) setTimeout(previous.release, 6000);
      liveBus = { ...instrumentBus(context, master, target.settings.seed), seed: target.settings.seed };
    }
    playBranch(context, liveBus.input, branch, target.scene, context.currentTime + 0.013);
    if (session === recording) captureNote(index, time);
  } catch (error) {
    console.error(error);
    notify('The selected note could not be played.');
  }
}

function triggerKey(index) {
  const branch = keyBranches[index];
  if (!branch) return;
  const button = byId('keys').children[index];
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), 180);
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
  download.querySelector('span').textContent = 'Preparing WAV…';
  try {
    const buffer = await rendered(target);
    const url = URL.createObjectURL(encodeWave(buffer));
    const link = document.createElement('a');
    link.href = url;
    const { scene: name, seed, depth, angle, taper, tempo } = target.settings;
    link.download = target.take
      ? 'stillwater-' + name + '-' + seed + '-take.wav'
      : 'stillwater-' + name + '-' + seed + '-d' + depth + '-a' + angle + '-l' + taper + '-' + tempo + 'bpm.wav';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    notify(target.take ? 'Your take is ready in your downloads.' : target.scene.name + ' is ready in your downloads.');
  } catch (error) {
    console.error(error);
    notify('The WAV could not be created.');
  } finally {
    exporting = false;
    updateCapture();
    download.querySelector('span').textContent = useTake ? 'Download take WAV' : 'Download WAV';
  }
}

for (const key of controls.slice(0, -1)) byId(key).addEventListener('input', refresh);
byId('seed').addEventListener('change', event => {
  const value = event.target.valueAsNumber;
  event.target.value = Number.isFinite(value) ? Math.max(0, Math.min(999999, Math.round(value))) : currentScore().settings.seed;
  refresh();
});
byId('shuffle').addEventListener('click', () => {
  const current = currentScore().settings.seed;
  byId('seed').value = (current + 1 + Math.floor(Math.random() * 999999)) % 1000000;
  refresh();
});
for (const button of presetButtons) {
  button.addEventListener('click', () => {
    scene = button.dataset.scene;
    for (const key of controls) byId(key).value = scenes[scene][key];
    refresh();
  });
}
playButton.addEventListener('click', play);
recordButton.addEventListener('click', toggleRecording);
stageRecord.addEventListener('click', toggleRecording);
trackButton.addEventListener('click', () => chooseTrack(!useTake));
byId('restart').addEventListener('click', () => seekTo(0));
seek.addEventListener('pointerdown', beginScrub);
seek.addEventListener('input', updateSeek);
window.addEventListener('pointerup', finishScrub);
window.addEventListener('pointercancel', finishScrub);
loopButton.addEventListener('click', () => {
  const offset = currentPosition();
  const buffer = active?.buffer;
  looping = !looping;
  loopButton.setAttribute('aria-pressed', String(looping));
  if (buffer) {
    detach();
    start(buffer, offset >= buffer.duration ? 0 : offset);
  }
});
volume.addEventListener('input', () => {
  if (Number(volume.value)) rememberedVolume = Number(volume.value);
  syncVolume();
});
mute.addEventListener('click', () => {
  volume.value = Number(volume.value) ? 0 : rememberedVolume;
  syncVolume();
});
download.addEventListener('click', saveWave);
function expandGarden(expanded) {
  const main = document.querySelector('main');
  main.dataset.expanded = String(expanded);
  document.querySelector('.settings').hidden = expanded;
  updateButton(expandButton, expanded ? 'contract' : 'expand', expanded ? 'Exit expanded garden' : 'Expand garden');
  cursor = hover = null;
  requestPaint();
}
expandButton.addEventListener('click', () => expandGarden(document.querySelector('main').dataset.expanded !== 'true'));
byId('about').addEventListener('click', () => byId('about-dialog').showModal());
byId('browse').addEventListener('click', () => {
  branchSelect.replaceChildren(...currentScore().branches.map(branch =>
    new Option(describe(branch) + ' · ' + noteName(branch.midi), branch.index)
  ));
  branchSelect.value = selected ?? 0;
  byId('branch-dialog').showModal();
});
byId('preview-note').addEventListener('click', () => preview(Number(branchSelect.value)));
byId('preview-path').addEventListener('click', () => {
  const target = currentScore();
  const session = recording;
  const route = branchPath(target.branches, Number(branchSelect.value));
  const request = {};
  const step = 31_000 / target.settings.tempo;
  pathRequest = request;
  byId('branch-dialog').close();
  hover = null;
  const queue = index => {
    if (pathRequest !== request || recording !== session || target !== currentScore()) return;
    preview(route[index].index);
    if (index + 1 < route.length) setTimeout(() => queue(index + 1), step);
  };
  if (route.length) queue(0);
});
shortcuts.addEventListener('change', () => {
  document.querySelector('.keyboard').dataset.shortcuts = String(shortcuts.checked);
  buildKeys(currentScore());
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]') && document.querySelector('main').dataset.expanded === 'true') {
    expandGarden(false);
  }
  if (!shortcuts.checked || event.key.length !== 1 || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const index = keys.indexOf(event.key.toLowerCase());
  if (index >= 0) triggerKey(index);
});

function inspectPointer(event) {
  cursor = garden.coords(event.clientX, event.clientY);
  hover = garden.hit(cursor);
  garden.canvas.style.cursor = hover === null ? 'crosshair' : 'pointer';
  requestPaint();
}

function playStrokeNote(gesture, index, now) {
  clearTimeout(gesture.timer);
  gesture.timer = null;
  gesture.pending = null;
  gesture.last = index;
  gesture.time = now;
  preview(index);
}

garden.canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  inspectPointer(event);
  garden.canvas.setPointerCapture(event.pointerId);
  const now = seconds();
  stroke = { id: event.pointerId, point: cursor, time: hover === null ? -Infinity : now, last: hover, pending: null, timer: null };
  trail = [{ ...cursor, time: now }];
  if (hover !== null) preview(hover);
});
garden.canvas.addEventListener('pointermove', event => {
  if (!event.isPrimary) return;
  inspectPointer(event);
  if (stroke?.id !== event.pointerId) return;
  const now = seconds();
  trail.push({ ...cursor, time: now });
  if (trail.length > 39) trail.shift();
  const origin = stroke.point;
  stroke.point = cursor;
  const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(cursor.x - origin.x, cursor.y - origin.y) / 8)));
  for (let step = 1; step <= steps; step++) {
    const fraction = step / steps;
    const index = garden.hit({
      x: origin.x + (cursor.x - origin.x) * fraction,
      y: origin.y + (cursor.y - origin.y) * fraction,
    });
    if (index === null || index === stroke.last) continue;
    const gesture = stroke;
    const delay = 0.068 - (now - gesture.time);
    if (delay <= 0) {
      playStrokeNote(gesture, index, now);
      break;
    }
    gesture.pending = index;
    if (gesture.timer == null) {
      gesture.timer = setTimeout(() => playStrokeNote(gesture, gesture.pending, seconds()), delay * 1000);
    }
    break;
  }
});
function endStroke(event) {
  if (stroke?.id === event.pointerId) {
    const gesture = stroke;
    stroke = null;
    clearTimeout(gesture.timer);
    if (event.type === 'pointerup' && gesture.pending !== null) preview(gesture.pending);
  }
  if (event.pointerType === 'touch') {
    cursor = hover = null;
    requestPaint();
  }
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) garden.canvas.addEventListener(type, endStroke);
garden.canvas.addEventListener('pointerleave', () => {
  cursor = hover = null;
  requestPaint();
});
window.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType === 'touch') return;
  lightPoint = { x: event.clientX, y: event.clientY };
  if (lightFrame) return;
  lightFrame = requestAnimationFrame(() => {
    lightFrame = 0;
    document.body.style.setProperty('--light-x', lightPoint.x + 'px');
    document.body.style.setProperty('--light-y', lightPoint.y + 'px');
  });
}, { passive: true });
reducedMotion.addEventListener('change', draw);

syncVolume();
refresh();
