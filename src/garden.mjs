// The tree on screen. It grows in call order, morphs when the recursion
// changes, and lights the active call stack with a bead on every active
// branch that travels at the speed of that call.
import { randomFrom } from './score.mjs';
import { Water } from './water.mjs';
import lagoonPhoto from '../dist/lagoon.webp';

const TAU = Math.PI * 2;
const tint = (hue, light, alpha) => 'hsla(' + hue + ', 79%, ' + light + '%, ' + alpha + ')';
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const keys = ['x', 'y', 'controlX', 'controlY', 'endX', 'endY'];
const growSeconds = 2.4;

function halo(ctx, x, y, radius, hue, strength) {
  if (radius <= 0 || strength <= 0) return;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, tint(hue, 67, strength));
  glow.addColorStop(1, tint(hue, 50, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
}

export function pointOn(branch, t) {
  const rest = 1 - t;
  return {
    x: rest ** 2 * branch.x + 2 * rest * t * branch.controlX + t ** 2 * branch.endX,
    y: rest ** 2 * branch.y + 2 * rest * t * branch.controlY + t ** 2 * branch.endY,
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
  const shape = new Path2D();
  const outline = banks[0].concat(banks[1].reverse());
  shape.moveTo(...outline[0]);
  for (const point of outline.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return shape;
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

export class Garden {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.water = new Water(document.getElementById('water'));
    this.backdrop = document.createElement('canvas');
    this.photo = new Image();
    this.photo.src = lagoonPhoto;
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

  setScore(score, mode = 'morph') {
    const previous = new Map(this.shown.map(branch => [branch.path, branch]));
    this.score = score;
    this.layout();
    const now = performance.now() / 1000;
    if (mode === 'grow') {
      this.growAt = now;
      this.tween = null;
    } else if (mode === 'morph' && previous.size) {
      const from = this.targets.map(target => {
        const known = previous.get(target.path);
        if (known) return Object.fromEntries(keys.map(key => [key, known[key]]));
        // A new branch sprouts from where its parent's tip was.
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
    const xs = branches.flatMap(branch => [branch.x - origin.x, branch.endX - origin.x]);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 0);
    const minY = Math.min(...branches.map(branch => branch.endY - origin.y), -0.2);
    const compact = this.width < 620;
    const stretch = compact ? 1.17 : 1.42;
    const height = this.height * 0.69;
    const width = this.width * 0.88;
    const scale = Math.min(height / -minY, width / Math.max(0.2, maxX - minX) / stretch);
    this.baseX = this.width / 2 - ((maxX + minX) / 2) * scale * stretch;
    this.baseY = this.height * 0.79;
    const projectX = x => this.baseX + (x - origin.x) * scale * stretch;
    const projectY = y => this.baseY + (y - origin.y) * scale;
    this.targets = branches.map(branch => shape({
      ...branch,
      x: projectX(branch.x), y: projectY(branch.y),
      controlX: projectX(branch.controlX), controlY: projectY(branch.controlY),
      endX: projectX(branch.endX), endY: projectY(branch.endY),
    }));
    this.shown = this.targets;

    const random = randomFrom(this.score.seed ^ 0xd827);
    const leaves = this.targets.filter(branch => branch.leaf);
    this.sparks = leaves.flatMap(branch =>
      Array.from({ length: Math.min(12, Math.round(300 / Math.max(1, leaves.length)) + 3) }, () => {
        const angle = random() * TAU;
        const distance = 2 + random() ** 1.75 * 44;
        return {
          branch: branch.index, angle, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance * 0.8,
          size: 0.38 + random() ** 2 * 2, alpha: 0.18 + random() * 0.6, amber: random() > 0.72,
        };
      })
    );

    const ctx = this.backdrop.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.paintBackdrop(ctx, scene.hue);
  }

  paintBackdrop(ctx, hue) {
    const { width: w, height: h, baseX: x, baseY: y } = this;
    const atmosphere = ctx.createLinearGradient(0, 0, 0, h);
    atmosphere.addColorStop(0, '#071321');
    atmosphere.addColorStop(0.67, '#0c202b');
    atmosphere.addColorStop(1, '#071218');
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

  draw(frame) {
    this.lastFrame = frame;
    const { now, reduced, time, stack = [], onsets = new Map(), cursor, trail = [], hover, selected, marked, breath, echoes = [], tool } = frame;
    const ctx = this.ctx;
    const { width, height, baseX, baseY } = this;
    if (!width || !height || !this.score) return;
    const branches = this.current(now, reduced);
    this.shown = branches;
    const hue = this.score.scene.hue;
    const active = new Set(stack.map(branch => branch.index));
    const playing = time != null;
    const growing = reduced ? Infinity : now - this.growAt;
    const per = growSeconds * 0.78 / Math.max(1, branches.length);
    const growth = index => Math.max(0, Math.min(1, (growing - index * per) / 0.5));

    const gpu = this.water.draw({
      width, height, x: baseX, y: baseY, cursor: reduced ? null : cursor,
      seconds: reduced ? 0 : now % 600, echoes: reduced ? [] : echoes.slice(-4), accent: this.score.scene.accent,
    });
    ctx.clearRect(0, 0, width, height);
    if (!gpu) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.backdrop, 0, 0, width, height);
      ctx.globalAlpha = 1;
      for (const wave of reduced ? [] : echoes.slice(-4)) {
        const radius = 3 + wave.age * height * 0.62;
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = tint(hue, 84, Math.max(0, 1 - wave.age / 2) * 0.58);
        ring(ctx, baseX + wave.pan * height * 0.25, baseY, radius, radius * 0.26);
      }
    }
    ctx.lineCap = 'round';
    halo(ctx, baseX, baseY - height * 0.15, Math.min(width * 0.38, height * 0.53), hue, 0.13);

    // The breath ring rises with each left call and settles with each right call.
    if (breath) {
      const rx = 26 + breath.amount * Math.min(width * 0.3, height * 0.42);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = tint(hue, 86, 0.5);
      ring(ctx, baseX, baseY, rx, rx * 0.26);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = tint(hue, 80, 0.18);
      ring(ctx, baseX, baseY, rx * 1.18, rx * 0.31);
    }

    // Reflection on the water.
    for (const branch of branches) {
      if (growth(branch.index) <= 0) continue;
      ctx.lineWidth = Math.max(0.55, 3.4 - branch.depth * 0.6);
      ctx.strokeStyle = tint(hue, 73, (active.has(branch.index) ? 0.34 : 0.16) / (1 + 0.28 * branch.depth));
      ctx.beginPath();
      for (const [index, point] of branch.samples.entries()) {
        const distance = baseY - point.y;
        const x = point.x + Math.sin(distance * 0.11 + (reduced ? 0 : now * 1.32)) * Math.min(11, distance / 27);
        ctx[index === 0 || index % 5 === 0 ? 'moveTo' : 'lineTo'](x, baseY + distance * 0.285);
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

    const focus = new Set();
    for (let branch = branches[hover ?? selected]; branch; branch = branches[branch.parent]) focus.add(branch.index);
    for (const branch of branches) {
      const grown = growth(branch.index);
      if (grown <= 0) continue;
      const age = onsets.get(branch.index) ?? Infinity;
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
        branch.samples.slice(0, count).forEach((point, i) => ctx[i ? 'lineTo' : 'moveTo'](point.x, point.y));
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
        // A pruned call: the base case is visible as a closed bud.
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

    // A bead on each active call shows how far through its span it is.
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
      const age = onsets.get(spark.branch) ?? Infinity;
      const lift = reduced || age > 1.6 ? 0 : (1 - age / 1.6);
      const drift = reduced ? 0 : Math.sin(now * 0.7 + spark.angle * 3) * 2.2;
      const x = branch.endX + spark.dx * (1 + lift * 0.4) + drift;
      const y = branch.endY + spark.dy * (1 + lift * 0.4) - lift * 6;
      const alpha = spark.alpha * opening * (playing && !active.has(spark.branch) ? 0.55 + lift * 0.45 : 1);
      const color = spark.amber ? (hue > 220 ? 323 : 53) : hue + 10;
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

    if (!reduced) this.drawPointer(ctx, hue, now, cursor, trail, hover, tool);
  }

  drawPointer(ctx, hue, now, cursor, trail, hover, tool) {
    for (let i = 1; i < trail.length; i++) {
      const point = trail[i];
      const opacity = 1 - (now - point.time) / 0.46;
      if (opacity <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = tint(hue, 87, opacity * 0.59);
      ctx.lineWidth = 2 * opacity;
      ctx.stroke();
    }
    if (!cursor) return;
    const prune = tool === 'prune';
    ctx.strokeStyle = prune ? 'hsla(352, 80%, 78%, ' + (hover === null ? 0.4 : 0.95) + ')' : tint(hue, 89, hover === null ? 0.32 : 0.92);
    ctx.lineWidth = 1;
    const radius = hover === null ? 8 : 12;
    ring(ctx, cursor.x, cursor.y, radius, radius);
    if (prune) {
      ctx.beginPath();
      ctx.moveTo(cursor.x - 5, cursor.y - 5);
      ctx.lineTo(cursor.x + 5, cursor.y + 5);
      ctx.moveTo(cursor.x + 5, cursor.y - 5);
      ctx.lineTo(cursor.x - 5, cursor.y + 5);
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
    const card = document.createElement('canvas');
    card.width = Math.round(width * scale);
    card.height = Math.round(height * scale);
    const ctx = card.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#081119';
    ctx.fillRect(0, 0, width, height);
    if (this.photo.complete && this.photo.naturalWidth) {
      const cover = Math.max(width / this.photo.naturalWidth, height / this.photo.naturalHeight);
      const w = this.photo.naturalWidth * cover;
      const h = this.photo.naturalHeight * cover;
      ctx.drawImage(this.photo, (width - w) / 2, (height - h) / 2, w, h);
    }
    if (this.water.ready) {
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.water.canvas, 0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.backdrop, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.canvas, 0, 0, width, height);
    const shade = ctx.createLinearGradient(0, height * 0.6, 0, height);
    shade.addColorStop(0, '#05090f00');
    shade.addColorStop(1, '#05090fd0');
    ctx.fillStyle = shade;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);
    ctx.fillStyle = '#e9f1ed';
    ctx.font = '400 34px Georgia, serif';
    ctx.fillText(lines[0], 28, height - 58);
    ctx.font = '500 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = this.score.scene.accent;
    ctx.fillText(lines[1], 30, height - 32);
    return card;
  }
}
