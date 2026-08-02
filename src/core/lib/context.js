// One shared WebGL2 context for the whole graph. lib classes (GLSL,
// Canvas2D, ScreenOutput) all pull from here instead of taking a gl
// argument, so project code never has to mention gl at all.
let _gl = null;

export function setGL(gl) {
  _gl = gl;
}

export function getGL() {
  if (!_gl) throw new Error('GL context not initialized yet - call setGL() first');
  return _gl;
}

// screenSize() - the GL canvas's own resolution, which is a SQUARE
// (max(width, height) of the real visible box - see main.js's
// resizeCanvas()), not necessarily what you can actually see - the
// browser crops it back down to viewportSize() below via CSS
// overflow:hidden. Lets a node size its own Canvas2D/GLSL buffer to
// match the real output instead of an arbitrary fixed number - e.g.
// text drawn at screen resolution stays sharp at any font size, rather
// than being drawn small and stretched up later. Read live, but only
// useful at the moment a node constructs its own persistent buffer
// (use(Canvas2D, width, height) via useInstances) - like every other lib
// class, that buffer doesn't resize itself afterward if the screen does.
//
// If you're positioning/sizing things relative to what the user can
// actually SEE (instancing a row of circles across the visible width,
// for instance), use viewportSize() instead - screenSize() being bigger
// than that is exactly the gap that caused the webcam/media double-crop
// bug earlier this project - the same thing can bite hand-authored
// layout math just as easily.
export function screenSize() {
  const gl = getGL();
  return { width: gl.canvas.width, height: gl.canvas.height };
}

// The real (non-square) on-screen box, before it gets forced into
// screenSize()'s square - main.js's resizeCanvas() keeps this in sync
// with #render-pane's actual box every time it changes. The browser
// crops screenSize()'s square back down to this rect via CSS overflow:
// hidden - media.js's drawLetterboxed() uses this to draw cropped/
// letterboxed content directly into the sub-rectangle of the square
// that will actually stay visible, rather than fitting to the square
// first and letting the CSS crop cut into it a second time.
let _viewport = { width: 1, height: 1 };

export function setViewportSize(width, height) {
  _viewport = { width, height };
}

export function viewportSize() {
  return { ..._viewport };
}
