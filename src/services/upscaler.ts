/**
 * GPU upscaling for the HLS player.
 *
 * The browser scales video with bilinear filtering, which is cheap and soft: on
 * a 1440p panel a 1080p feed looks blurred rather than merely smaller. This
 * draws each frame through a Catmull-Rom bicubic filter with a light unsharp
 * pass, which keeps edges crisp without the ringing that a naive sharpen adds
 * to grass, crowds and motion — the three things a sports feed is mostly made
 * of.
 *
 * WHERE IT APPLIES, and this is a hard limit rather than an omission:
 * only where the app owns the decoded frames, which means the hls.js path. A
 * cross-origin iframe — which is what most sports sources are on the web — is
 * unreachable: the same-origin policy forbids reading a single pixel of it, so
 * there is nothing to upscale and no way to try.
 *
 * SAFETY POSTURE
 * Everything here is best-effort and reversible. Any failure detaches and
 * leaves the plain <video> showing, because a soft picture is vastly better
 * than a broken one during a live match. The render loop stops when the tab is
 * hidden or the video pauses, so it never burns battery on a frame nobody is
 * looking at.
 */

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); // flip Y: video origin is top-left
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/**
 * Catmull-Rom bicubic, sampled as four bilinear taps rather than sixteen point
 * taps. Same result, a quarter of the texture reads — which is what makes this
 * affordable at 60fps on a phone.
 */
const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D tex;
uniform vec2 texSize;
uniform float sharpen;

vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

vec4 bicubic(sampler2D t, vec2 coord) {
  vec2 ts = 1.0 / texSize;
  coord = coord * texSize - 0.5;
  vec2 f = fract(coord);
  coord -= f;

  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = coord.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = c + vec4(xc.yw, yc.yw) / s;
  off *= ts.xxyy;

  vec4 s0 = texture(t, off.yw);
  vec4 s1 = texture(t, off.xw);
  vec4 s2 = texture(t, off.yz);
  vec4 s3 = texture(t, off.xz);

  float mx = s.x / (s.x + s.y);
  float my = s.z / (s.z + s.w);
  return mix(mix(s0, s1, mx), mix(s2, s3, mx), my);
}

void main() {
  vec4 c = bicubic(tex, uv);
  if (sharpen > 0.0) {
    // Unsharp mask against a cheap neighbourhood average. Kept deliberately
    // gentle: heavy sharpening on a compressed sports feed amplifies blocking
    // artefacts far more than it recovers detail.
    vec2 ts = 1.0 / texSize;
    vec4 blur = (
      texture(tex, uv + vec2(-ts.x, 0.0)) + texture(tex, uv + vec2(ts.x, 0.0)) +
      texture(tex, uv + vec2(0.0, -ts.y)) + texture(tex, uv + vec2(0.0, ts.y))
    ) * 0.25;
    c = clamp(c + (c - blur) * sharpen, 0.0, 1.0);
  }
  color = vec4(c.rgb, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface UpscalerHandle {
  /** Stop rendering and release the GL context. Safe to call twice. */
  detach: () => void;
  /** True if the upscaler actually started. */
  active: boolean;
}

/**
 * Render `video` into `canvas`, upscaled to `targetHeight`.
 *
 * Returns a handle whose `active` is false when anything prevented it starting
 * — the caller shows the plain video in that case rather than a blank canvas.
 */
export function attachUpscaler(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  targetHeight: number,
  sharpen = 0.35,
): UpscalerHandle {
  const dead: UpscalerHandle = { detach: () => {}, active: false };
  let gl: WebGL2RenderingContext | null = null;

  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) return dead;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return dead;

    const prog = gl.createProgram();
    if (!prog) return dead;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return dead;
    gl.useProgram(prog);

    // Full-screen triangle pair.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uTexSize = gl.getUniformLocation(prog, 'texSize');
    const uSharpen = gl.getUniformLocation(prog, 'sharpen');
    gl.uniform1f(uSharpen, sharpen);

    let raf = 0;
    let stopped = false;

    const sizeCanvas = () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return false;
      const scale = Math.max(1, targetHeight / vh);
      const w = Math.round(vw * scale), h = Math.round(vh * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return true;
    };

    const frame = () => {
      if (stopped || !gl) return;
      raf = requestAnimationFrame(frame);
      // Nothing to draw: not enough data yet, or nobody is watching.
      if (video.readyState < 2 || video.paused || document.hidden) return;
      if (!sizeCanvas()) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.uniform2f(uTexSize, video.videoWidth, video.videoHeight);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } catch {
        // A tainted or unavailable frame: stop rather than spin on errors.
        stop();
      }
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        gl?.deleteTexture(tex);
        gl?.deleteBuffer(buf);
        gl?.deleteProgram(prog);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { /* releasing is best-effort */ }
      gl = null;
    };

    raf = requestAnimationFrame(frame);
    return { detach: stop, active: true };
  } catch {
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
    return dead;
  }
}
