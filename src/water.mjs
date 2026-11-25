const vertexSource = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
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

export class Water {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.ready = false;
      canvas.hidden = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.initialize();
      if (this.lastFrame) this.draw(this.lastFrame);
    });
    this.initialize();
  }

  initialize() {
    const canvas = this.canvas;
    try {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false });
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
        ['resolution', 'origin', 'cursor', 'tint', 'time', 'echoes'].map(
          key => [key, gl.getUniformLocation(this.program, 'u_' + key)]
        )
      );
      this.ready = true;
      canvas.hidden = false;
    } catch (error) {
      console.warn('Water shader unavailable, using the Canvas backdrop.', error);
      canvas.hidden = true;
    }
  }

  draw(frame) {
    this.lastFrame = frame;
    if (!this.ready) return false;
    const { gl, canvas, uniforms } = this;
    const { width, height, x, y, cursor, seconds, echoes, accent } = frame;
    // Light and mist are low-frequency layers. Retain native resolution for the
    // tree and render the water at a lower resolution to keep gestures responsive.
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
    gl.uniform2f(uniforms.cursor, cursor ? cursor.x / width : -1, cursor ? 1 - cursor.y / height : -1);
    gl.uniform3f(uniforms.tint, ...[1, 3, 5].map(start => parseInt(accent.slice(start, start + 2), 16) / 255));
    gl.uniform1f(uniforms.time, seconds);
    const wavefronts = new Float32Array(12);
    echoes.forEach((echo, index) => wavefronts.set([echo.age, echo.pan, echo.strength], index * 3));
    gl.uniform3fv(uniforms.echoes, wavefronts);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}
