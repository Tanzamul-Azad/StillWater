import { clock, compose, noteName, scenes } from './score.mjs';
import { encodeWave, playBranch, renderScore } from './audio.mjs';
import { Garden } from './garden.mjs';

const byId = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const controls = ['depth', 'angle', 'taper', 'tempo', 'seed'];
const presetButtons = [...document.querySelectorAll('[data-scene]')];
const playButton = byId('play');
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
let renderCache;
let selected = null;
let hover = null;
let scene = 'lagoon';
let context;
let master;
let active;
let playRequest;
let position = 0;
let hasPlayed = false;
let looping = false;
let frame;
let lastPaint = -Infinity;
let noticeTimer;
let rememberedVolume = Number(volume.value);

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
  return looping ? elapsed % active.buffer.duration : Math.min(score.duration, elapsed);
}

function updateTransport() {
  const state = currentPosition();
  seek.value = state;
  seek.setAttribute('aria-valuetext', clock(state) + ' of ' + clock(score.duration));
  byId('elapsed').textContent = clock(state);
  fillRange(seek);
  if (playRequest) updateButton(playButton, 'pause', 'Cancel preparing audio');
  else if (active) updateButton(playButton, 'pause', 'Pause composition');
  else updateButton(playButton, 'play', 'Play composition');
}

function draw() {
  if (!score) return;
  garden.draw({ time: currentPosition(), played: hasPlayed, selected, hover, reduced: reducedMotion.matches });
  updateBranchDetail();
}

function tick(now) {
  if (!active) return;
  if (now - lastPaint >= (reducedMotion.matches ? 95 : 29)) {
    updateTransport();
    draw();
    lastPaint = now;
  }
  frame = requestAnimationFrame(tick);
}

function detach() {
  if (!active) return;
  const { source, gain, started } = active;
  active = null;
  cancelAnimationFrame(frame);
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
  if (target === renderCache?.score) return renderCache.promise;
  const promise = renderScore(target).catch(error => {
    if (renderCache?.promise === promise) renderCache = null;
    throw error;
  });
  renderCache = { score: target, promise };
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
    position = score.duration;
    cancelAnimationFrame(frame);
    updateTransport();
    draw();
  };
  active = { source, gain, buffer, offset, started: now };
  lastPaint = -Infinity;
  frame = requestAnimationFrame(tick);
}

async function play() {
  if (active || playRequest) {
    pause();
    return;
  }
  const target = score;
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
    notify('Audio is unavailable. Try a recent browser with Web Audio support.');
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
  if (buffer && next < score.duration - 0.02) start(buffer, next);
  updateTransport();
  draw();
}

function description(branch) {
  const path = branch.path ? [...branch.path].join(' › ') : 'Trunk';
  return path + ' · depth ' + branch.depth + ' · ' + noteName(branch.midi);
}

function updateBranchDetail() {
  const detail = byId('branch-detail');
  const inspected = score.branches[selected ?? hover];
  const sounding = active && score.branches.findLast(branch => branch.time <= currentPosition());
  const message = inspected ? description(inspected) : sounding ? 'Playing · ' + description(sounding) : 'Select a branch to hear its note.';
  if (detail.textContent !== message) detail.textContent = message;
}

async function preview(index) {
  const target = score;
  const branch = target.branches[index];
  selected = index;
  branchSelect.value = index;
  draw();
  try {
    await enableAudio();
    if (target !== score || selected !== index) return;
    playBranch(context, master, branch, score.scene, context.currentTime + 0.02);
  } catch (error) {
    console.error(error);
    notify('The selected note could not be played.');
  }
}

function refresh() {
  const wasPlaying = active || playRequest;
  playRequest = null;
  detach();
  renderCache = null;
  position = 0;
  hasPlayed = false;
  selected = hover = null;
  const settings = { scene };
  for (const key of controls) {
    const input = byId(key);
    settings[key] = Number(input.value);
    if (labels[key]) {
      const label = labels[key](settings[key]);
      byId(key + '-value').textContent = label;
      input.setAttribute('aria-valuetext', label);
      fillRange(input);
    }
  }
  score = compose(settings);
  garden.setScore(score);
  seek.max = score.duration;
  byId('duration').textContent = clock(score.duration);
  byId('scene-name').textContent = score.scene.name;
  byId('branch-count').textContent = score.branches.length + ' branches';
  document.documentElement.style.setProperty('--accent', score.scene.accent);
  for (const button of presetButtons) button.setAttribute('aria-pressed', String(button.dataset.scene === scene));
  updateTransport();
  draw();
  if (wasPlaying) notify('New composition ready. Press play to listen.');
}

async function saveWave() {
  const target = score;
  download.disabled = true;
  download.querySelector('span').textContent = 'Preparing WAV…';
  try {
    const buffer = await rendered(target);
    const url = URL.createObjectURL(encodeWave(buffer));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stillwater-' + target.settings.scene + '-' + target.settings.seed +
      '-d' + target.settings.depth + '-a' + target.settings.angle +
      '-l' + target.settings.taper + '-' + target.settings.tempo + 'bpm.wav';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    notify(target.scene.name + ' is ready in your downloads.');
  } catch (error) {
    console.error(error);
    notify('The WAV could not be created. Try again in a recent browser.');
  } finally {
    download.disabled = false;
    download.querySelector('span').textContent = 'Download WAV';
  }
}

for (const key of controls.slice(0, -1)) byId(key).addEventListener('input', refresh);
byId('seed').addEventListener('change', event => {
  const value = event.target.valueAsNumber;
  event.target.value = Number.isFinite(value) ? Math.max(0, Math.min(999999, Math.round(value))) : score.settings.seed;
  refresh();
});
byId('shuffle').addEventListener('click', () => {
  const current = score.settings.seed;
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
byId('restart').addEventListener('click', () => seekTo(0));
seek.addEventListener('input', () => seekTo(Number(seek.value)));
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
byId('about').addEventListener('click', () => byId('about-dialog').showModal());
byId('browse').addEventListener('click', () => {
  branchSelect.replaceChildren(...score.branches.map(branch => new Option(description(branch), branch.index)));
  branchSelect.value = selected ?? 0;
  byId('branch-dialog').showModal();
});
byId('preview-note').addEventListener('click', () => preview(Number(branchSelect.value)));
garden.canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const index = garden.hit(event.clientX, event.clientY);
  if (index === hover) return;
  hover = index;
  garden.canvas.style.cursor = hover === null ? 'crosshair' : 'pointer';
  draw();
});
garden.canvas.addEventListener('pointerleave', () => {
  hover = null;
  draw();
});
garden.canvas.addEventListener('click', event => {
  const index = garden.hit(event.clientX, event.clientY);
  if (index !== null) preview(index);
});
reducedMotion.addEventListener('change', draw);

syncVolume();
refresh();
