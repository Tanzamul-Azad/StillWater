import { randomFrom } from './score.mjs';
import { Water } from './water.mjs';

const TAU = Math.PI * 2;
const tint = (hue, light, alpha) => 'hsla(' + hue + ', 79%, ' + light + '%, ' + alpha + ')';

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
    y: rest ** 2 * branch.y + 2 * rest * t * branch.controlY + t ** 2 * branch.endY,
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

export class Garden {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.water = new Water(document.getElementById('water'));
    this.backdrop = document.createElement('canvas');
    this.branches = [];
    this.width = 0;
    const observer = new ResizeObserver(() => {
      if (!this.score) return;
      this.layout();
      onResize();
    });
    observer.observe(canvas);
  }

  setScore(score, reveal) {
    this.score = score;
    this.revealAt = reveal ? performance.now() / 1000 : -Infinity;
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

    const { branches, scene } = this.score;
    const minX = Math.min(...branches.map(branch => branch.endX), 0);
    const maxX = Math.max(...branches.map(branch => branch.endX), 0);
    const minY = Math.min(...branches.map(branch => branch.endY));
    const compact = this.width < 620;
    const stretch = compact ? 1.26 : 1.46;
    const height = this.height * (compact ? 0.43 : 0.66);
    const width = this.width * (compact ? 0.82 : 0.58);
    const scale = Math.min(height / -minY, width / (maxX - minX) / stretch);
    const center = this.width * (compact ? 0.5 : 0.635);
    this.baseX = center - ((maxX + minX) / 2) * scale * stretch;
    this.baseY = this.height * (compact ? 0.815 : 0.775);
    const projectX = x => this.baseX + x * scale * stretch;
    const projectY = y => this.baseY + y * scale;
    this.branches = branches.map(branch => {
      const result = {
        ...branch,
        x: projectX(branch.x), y: projectY(branch.y),
        controlX: projectX(branch.controlX), controlY: projectY(branch.controlY),
        endX: projectX(branch.endX), endY: projectY(branch.endY),
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

    const random = randomFrom(this.score.settings.seed ^ 0xd827);
    this.sparks = this.branches.filter(branch => branch.leaf).flatMap(branch =>
      Array.from({ length: Math.min(14, 245 / branches.length + 6) }, () => {
        const angle = random() * TAU;
        const distance = 2 + random() ** 1.75 * 49;
        return {
          branch: branch.index, angle,
          x: branch.endX + Math.cos(angle) * distance,
          y: branch.endY + Math.sin(angle) * distance * 0.81,
          size: 0.38 + random() ** 2 * 2.04,
          alpha: 0.18 + random() * 0.62,
          amber: random() > 0.72,
        };
      })
    );

    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);
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

  draw({ time, events, played, selected, hover, reduced, now, cursor, live, trail }) {
    const ctx = this.ctx;
    const { width, height, baseX, baseY, branches } = this;
    if (!width || !height) return;
    const hue = this.score.scene.hue;
    const heard = new Map();
    const echoes = [];
    if (played) {
      for (const event of events) {
        if (event.time > time) break;
        const age = time - event.time;
        heard.set(event.index, age);
        if (age < 2) echoes.push({ age, pan: event.pan, strength: 0.88 });
      }
    }
    for (const note of live) {
      const age = now - note.time;
      heard.set(note.index, age);
      echoes.push({ age, pan: branches[note.index].pan, strength: 1 });
    }
    const waves = reduced ? [] : echoes.slice(-4);
    const opening = reduced ? 1 : Math.min(1, (now - this.revealAt) / 0.86);
    const gpu = this.water.draw({
      width, height, x: baseX, y: baseY, cursor: reduced ? null : cursor,
      seconds: reduced ? 0 : now % 600,
      echoes: waves, accent: this.score.scene.accent,
    });
    ctx.clearRect(0, 0, width, height);
    if (!gpu) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.backdrop, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'round';
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
        ctx[index === 0 || index % 5 === 0 ? 'moveTo' : 'lineTo'](x, y);
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

    const focus = new Set();
    let ancestor = hover ?? selected;
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
      ctx.strokeStyle = tint(hue, 66, 0.055 + flash * 0.19 + (focused ? 0.10 : 0));
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
      const color = spark.amber ? (hue > 220 ? 323 : 53) : hue + 10;
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

    if (!reduced) this.drawPointer(ctx, hue, now, cursor, trail, hover);
  }

  drawPointer(ctx, hue, now, cursor, trail, hover) {
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
    ctx.strokeStyle = tint(hue, 89, hover === null ? 0.32 : 0.92);
    ctx.lineWidth = 1;
    const radius = hover === null ? 8 : 12;
    ring(ctx, cursor.x, cursor.y, radius, radius);
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
}
