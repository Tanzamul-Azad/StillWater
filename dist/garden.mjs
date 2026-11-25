import { randomFrom } from './score.mjs';

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

function trace(ctx, branch) {
  ctx.beginPath();
  ctx.moveTo(branch.x, branch.y);
  ctx.quadraticCurveTo(branch.controlX, branch.controlY, branch.endX, branch.endY);
}

function ellipse(ctx, x, y, radiusX, radiusY, start = 0, end = TAU) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, start, end);
  ctx.stroke();
}

export class Garden {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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

  setScore(score) {
    this.score = score;
    this.layout();
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
    const scale = Math.min(this.height * 0.57 / -minY, this.width * 0.70 / (maxX - minX) / 1.38);
    this.baseX = this.width / 2 - ((maxX + minX) / 2) * scale * 1.38;
    this.baseY = this.height * 0.745;
    this.branches = branches.map(branch => ({
      ...branch,
      x: this.baseX + branch.x * scale * 1.38,
      y: this.baseY + branch.y * scale,
      controlX: this.baseX + branch.controlX * scale * 1.38,
      controlY: this.baseY + branch.controlY * scale,
      endX: this.baseX + branch.endX * scale * 1.38,
      endY: this.baseY + branch.endY * scale,
    }));

    const random = randomFrom(this.score.settings.seed ^ 0xd827);
    this.sparks = this.branches.filter(branch => branch.leaf).flatMap(branch =>
      Array.from({ length: Math.min(7, 112 / branches.length + 3) }, () => {
        const angle = random() * TAU;
        const distance = 4 + random() ** 1.65 * 37;
        return {
          branch: branch.index,
          x: branch.endX + Math.cos(angle) * distance,
          y: branch.endY + Math.sin(angle) * distance * 0.7,
          size: 0.45 + random() ** 2 * 1.7,
          alpha: 0.14 + random() * 0.53,
        };
      })
    );
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);
    this.paintBackdrop(ctx, scene.hue);
  }

  paintBackdrop(ctx, hue) {
    const w = this.width;
    const h = this.height;
    const x = this.baseX;
    const y = this.baseY;
    const atmosphere = ctx.createLinearGradient(0, 0, 0, h);
    atmosphere.addColorStop(0, '#071413');
    atmosphere.addColorStop(0.62, '#0c2522');
    atmosphere.addColorStop(1, '#081818');
    ctx.fillStyle = atmosphere;
    ctx.fillRect(0, 0, w, h);
    halo(ctx, x, h * 0.55, Math.min(w * 0.48, h * 0.85), hue, 0.13);
    halo(ctx, x, y, Math.min(w * 0.3, h * 0.54), hue, 0.17);
    const random = randomFrom(448291);
    for (let i = 0; i < 460; i++) {
      const px = random() * w;
      const py = random() * h * 0.89;
      const radius = 0.25 + random() ** 3 * 1.25;
      ctx.fillStyle = tint(hue, 82, 0.035 + random() ** 2 * 0.35);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, TAU);
      ctx.fill();
    }

    ctx.lineWidth = 0.65;
    for (let i = 0; i < 35; i++) {
      const rx = (i + 1) ** 1.22 * w / 122;
      const ry = rx * (h / w) * 0.25;
      ctx.strokeStyle = tint(hue, 70, 0.17 * (1 - i / 41));
      ellipse(ctx, x, y, rx, ry, -Math.PI + random() * 0.3, Math.PI - random() * 0.15);
    }
    for (let i = 0; i < 380; i++) {
      const rx = random() ** 0.7 * w * 0.56 + 5;
      const angle = random() * TAU;
      const px = x + Math.cos(angle) * rx;
      const py = y + Math.sin(angle) * rx * (h / w) * 0.27;
      const length = 1 + random() ** 2.5 * 34;
      ctx.strokeStyle = tint(hue, 78, 0.04 + random() ** 2 * 0.18 * (1 - rx / w));
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + length, py);
      ctx.stroke();
    }

    const vignette = ctx.createRadialGradient(w / 2, h * 0.54, h * 0.18, w / 2, h * 0.54, Math.hypot(w, h) / 2);
    vignette.addColorStop(0, '#06111000');
    vignette.addColorStop(1, '#030c0bc9');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  draw({ time = 0, played = false, selected = null, hover = null, reduced = false } = {}) {
    const ctx = this.ctx;
    const { width, height, baseX, baseY, branches } = this;
    if (!width || !height) return;
    const hue = this.score.scene.hue;
    ctx.drawImage(this.backdrop, 0, 0, width, height);
    ctx.lineCap = 'round';

    ctx.save();
    ctx.translate(0, baseY * 1.27);
    ctx.scale(1, -0.27);
    for (const branch of branches) {
      ctx.lineWidth = Math.max(0.5, 5 - branch.depth);
      ctx.strokeStyle = tint(hue, 70, 0.075 / (1 + 0.22 * branch.depth));
      trace(ctx, branch);
      ctx.stroke();
    }
    ctx.restore();

    // Draw ancestor paths as a continuous guide when inspecting a note.
    const focus = new Set();
    let ancestor = selected ?? hover;
    while (ancestor != null) {
      focus.add(ancestor);
      ancestor = branches[ancestor].parent;
    }

    for (const branch of branches) {
      const age = time - branch.time;
      const lit = played && age >= 0;
      const flash = lit && age < 0.84 ? (1 - age / 0.84) : 0;
      const focused = focus.has(branch.index);
      const swollen = Math.max(0.65, 5.5 * 0.7 ** branch.depth);
      const gradient = ctx.createLinearGradient(branch.x, branch.y, branch.endX, branch.endY);
      gradient.addColorStop(0, tint(hue - 5, 61, focused ? 0.94 : played && !lit ? 0.25 : 0.62));
      gradient.addColorStop(1, tint(hue + 9, 86, focused ? 1 : played && !lit ? 0.35 : 0.93));
      trace(ctx, branch);
      ctx.lineWidth = swollen * (3.4 + 2 * flash);
      ctx.strokeStyle = tint(hue, 67, 0.072 + flash * 0.3 + (focused ? 0.11 : 0));
      ctx.stroke();
      ctx.lineWidth = swollen * 1.6;
      ctx.strokeStyle = tint(hue, 72, 0.14 + flash * 0.25);
      ctx.stroke();
      ctx.lineWidth = swollen * (0.7 + flash * 0.45);
      ctx.strokeStyle = gradient;
      ctx.stroke();

      if (branch.leaf || flash > 0 || selected === branch.index) {
        const radius = 1.05 + flash * 3.4 + (focused ? 1.3 : 0);
        halo(ctx, branch.endX, branch.endY, radius * 5.2, hue, played && !lit ? 0.14 : 0.38 + flash * 0.27);
        ctx.fillStyle = tint(hue + 14, 93, played && !lit ? 0.46 : 0.94);
        ctx.beginPath();
        ctx.arc(branch.endX, branch.endY, radius, 0, TAU);
        ctx.fill();
      }

      if (flash > 0 && !reduced) {
        const radius = 4 + age * 58;
        ctx.strokeStyle = tint(hue, 83, flash * 0.42);
        ctx.lineWidth = 1;
        ellipse(ctx, branch.endX, branch.endY, radius, radius * 0.82);
      }
    }

    for (const spark of this.sparks) {
      const branch = branches[spark.branch];
      const drift = reduced || !played ? 0 : Math.sin(spark.y * 0.18 + time * 1.25) * 2.1;
      const alpha = spark.alpha * (played && branch.time > time ? 0.48 : 1);
      ctx.fillStyle = tint(hue + 14, 91, alpha);
      ctx.beginPath();
      ctx.arc(spark.x + drift, spark.y, spark.size, 0, TAU);
      ctx.fill();
    }
    halo(ctx, baseX, baseY, 28, hue, 0.56);
    ctx.fillStyle = tint(hue, 92, 0.9);
    ctx.beginPath();
    ctx.ellipse(baseX, baseY, 5.8, 1.1, 0, 0, TAU);
    ctx.fill();
  }

  hit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let closest = null;
    let distance = 14 ** 2;
    for (const branch of this.branches) {
      for (let i = 1; i <= 9; i++) {
        const point = pointOn(branch, i / 9);
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
