import { screenSize } from './context.js';
import { nextCallKey } from './current-node.js';
import { Canvas2D } from './canvas2d.js';
import { sampleTexture } from './texture-sample.js';

// ascii2d(source, cols, rows, options) - like particle2d(), but draws a
// character per cell instead of stamping a texture, and never shakes (a
// text grid doesn't read as "alive" the way a wobbling dot does - it just
// reads as blurry). Each cell samples `channel` (see sampleTexture) and
// picks a character from `ramp` by value - low value -> the start of the
// ramp (space, i.e. nothing drawn), high value -> the end ('@' by
// default). White text on a transparent background, same as every other
// texture in this project - no separate transparency handling needed.
//
//   const out = ascii2d(inputs.src, 60, 40);
//
// options:
//   channel - 'lightness' (default), 'red', 'green', 'blue'.
//   ramp    - the character gradient, darkest first. Default
//             ' .:-=+*#%@' (10 steps; a plain space means "draw nothing"
//             for the darkest cells rather than a visible dot).
//   color   - fillStyle for the characters. Default 'white'.
const RAMP = ' .:-=+*#%@';

const asciiCache = new Map(); // key (nodeId or "nodeId#n") -> Canvas2D
let asciiCallCounts = new Map(); // nodeId -> how many times ascii2d() has been called THIS tick

export function beginAsciiTick() {
  asciiCallCounts = new Map();
}

// ascii2d() keys its Canvas2D cache by call site (nodeId/"nodeId#n"), NOT
// through useInstances - same reasoning as instance.js's
// disposeParticlesForNode(), see there.
export function disposeAsciiForNode(nodeId) {
  for (const [key, canvas] of asciiCache) {
    if (key === nodeId || key.startsWith(`${nodeId}#`)) {
      canvas.dispose();
      asciiCache.delete(key);
    }
  }
}

export function ascii2d(source, cols, rows, options = {}) {
  const { channel = 'lightness', ramp = RAMP, color = 'white' } = options;

  const key = nextCallKey(asciiCallCounts);
  if (key == null) return { texture: null, width: 0, height: 0 };

  const { width, height } = screenSize();
  let canvas = asciiCache.get(key);
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new Canvas2D(width, height);
    asciiCache.set(key, canvas);
  }

  const { ctx } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (source && source.texture) {
    const values = sampleTexture(source, { cols, rows, channel });
    const cellW = width / cols;
    const cellH = height / rows;
    ctx.fillStyle = color;
    ctx.font = `${Math.floor(Math.min(cellW, cellH) * 0.9)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const v = values[row * cols + col];
        const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(v * ramp.length)));
        const ch = ramp[idx];
        if (ch === ' ') continue;
        ctx.fillText(ch, col * cellW + cellW / 2, row * cellH + cellH / 2);
      }
    }
  }

  canvas.upload();
  return canvas;
}
