import { screenSize } from './context.js';
import { Canvas2D } from './canvas2d.js';

// use(Text).tick(text, opts) - drawing text with plain Canvas2D + ctx.font
// works, but every project ends up rewriting the same handful of lines
// (clear, set font/align/baseline, fillText, upload) - this is that,
// pre-built, plus the two things ctx.fillText alone can't do: real
// multi-line ('\n'-separated) layout, and letter-spacing (see `kerning`
// below - not true per-pair OpenType kerning, canvas has no access to
// that; this is uniform extra space between every character, which is
// what "kerning" means to most people asking for it, and the only kind
// of letter-spacing a <canvas> can actually do).
//
//   const label = use(Text);
//   label.tick('wet\ncarp', { font: 'Michroma', size: 64, color: 'white' });
//   return { screen: label };
//
// Owns a Canvas2D internally (same texture-bearing shape - .texture/
// .width/.height - so a Text instance drops into `return { screen: ... }`
// or any effect's `src` exactly like Canvas2D/GLSL do) rather than
// re-implementing its own GPU upload.
export class Text {
  constructor(width = screenSize().width, height = screenSize().height, filter = 'linear') {
    this.canvas = new Canvas2D(width, height, filter);
    this._lastKey = null;
  }

  get texture() {
    return this.canvas.texture;
  }
  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }

  // tick(text, opts) - opts:
  //   font       - any font-family string already loaded/available to the
  //                page (a web-safe name, or a web font you've loaded
  //                yourself - see the $load$/Google Fonts pattern this
  //                project's docs show for that). Default 'sans-serif'.
  //   size       - font size in pixels. Default 64.
  //   weight     - e.g. 400, 700, 'bold'. Default 400.
  //   color      - any CSS color string. Default 'white'.
  //   align      - 'left' | 'center' | 'right', horizontal anchor around
  //                (x, y) below. Default 'center'.
  //   x, y       - 0..1, where the text's anchor point sits on screen
  //                (0.5, 0.5 = dead center). Default 0.5, 0.5.
  //   kerning    - extra pixels between every character (see class
  //                comment above) - negative tightens, positive spreads
  //                out. Default 0. Silently ignored on a browser without
  //                CanvasRenderingContext2D.letterSpacing (older Safari).
  //   lineHeight - multiplier of `size` - vertical spacing between lines
  //                for multi-line ('\n'-separated) text. Default 1.2.
  // Returns `this` - only actually redraws (and re-uploads) when
  // something about the call actually changed since last tick, so a
  // static label isn't repainted 60 times a second for nothing.
  tick(text, opts = {}) {
    const {
      font = 'sans-serif',
      size = 64,
      weight = 400,
      color = 'white',
      align = 'center',
      x = 0.5,
      y = 0.5,
      kerning = 0,
      lineHeight = 1.2,
    } = opts;

    const key = JSON.stringify([text, font, size, weight, color, align, x, y, kerning, lineHeight, this.width, this.height]);
    if (key === this._lastKey) return this;
    this._lastKey = key;

    const { ctx, width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; // native - correctly handles RTL/complex scripts, unlike hand-rolled per-char math
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${kerning}px`;

    const lines = String(text).split('\n');
    const lineStep = size * lineHeight;
    const totalHeight = lineStep * (lines.length - 1);
    const px = x * width;
    const startY = y * height - totalHeight / 2;
    lines.forEach((line, i) => ctx.fillText(line, px, startY + i * lineStep));

    this.canvas.upload();
    return this;
  }

  dispose() {
    this.canvas.dispose();
  }
}
