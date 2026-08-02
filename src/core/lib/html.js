import { getGL } from './context.js';
import { createTexture } from '../../gl/gl-context.js';

// new Html(width, height) inside a node's code(). .tick(htmlString)
// rasterizes arbitrary HTML/CSS to a texture - useful for richer text
// layout (wrapping, multiple styles, web fonts) than Canvas2D's ctx.font
// can do directly, or for compositing real DOM-shaped content into the
// graph at all.
//
// HOW: wraps the HTML in an SVG <foreignObject> (the browser's only
// built-in DOM-to-image path, no library needed), serializes that SVG to
// a data: URL, loads it into an <img>, then draws that image into a
// plain <canvas> exactly like Canvas2D does.
//
// REAL LIMITS worth knowing: this only works for content that doesn't
// taint the canvas (no cross-origin images or @font-face fonts inside
// the HTML - stick to inline styles and system fonts), and loading the
// image is asynchronous, so the texture only updates once the browser
// has actually decoded it - typically the tick *after* the HTML changes,
// not the same one.
export class Html {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = createTexture(this.gl, width, height);
    this.lastHtml = null;
    this.img = new Image();
    this.img.onload = () => {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(this.img, 0, 0, this.width, this.height);
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    };
  }

  // Pass the current HTML string every frame, same convention as
  // GLSL.tick(fragSrc, ...) - only re-rasterizes when the string
  // actually changed from last tick.
  tick(html) {
    if (html === this.lastHtml) return this;
    this.lastHtml = html;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${this.width}px;height:${this.height}px;">${html}</div>
      </foreignObject>
    </svg>`;
    this.img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return this;
  }
}
