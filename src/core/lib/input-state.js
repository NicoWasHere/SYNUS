// mouse()/keyPulse() - live input state, updated by main.js's own event
// listeners (never read a DOM event directly from project code, same
// reason render()/preview() are simple accessor functions rather than
// exposing the DOM).
//
// mouse() returns { x, y } normalized to 0..1 over the VISIBLE viewport
// (see context.js's viewportSize() - the real on-screen box, not
// screenSize()'s square, which can be bigger), (0,0) at the top-left,
// matching ordinary screen/mouse conventions. Multiply by screenSize()'s
// width/height if you need it in the same pixel space a Canvas2D sized
// via screenSize() draws in.
let mouseX = 0.5;
let mouseY = 0.5;

export function setMousePosition(x, y) {
  mouseX = x;
  mouseY = y;
}

export function mouse() {
  return { x: mouseX, y: mouseY };
}

// keyPulse('a') -> 1 while that key is held, 0 otherwise - keys are
// tracked by e.key.toLowerCase(), so keyPulse(' ') is space,
// keyPulse('arrowup') is the up arrow, etc. Ignored entirely while
// you're actually typing in the code editor (see main.js) - otherwise
// every keystroke while writing a node's code would register as a
// pulse in the running graph, which would be startling more than useful.
const pressedKeys = new Set();

export function setKeyState(key, pressed) {
  const k = key.toLowerCase();
  if (pressed) pressedKeys.add(k);
  else pressedKeys.delete(k);
}

export function keyPulse(key) {
  return pressedKeys.has(String(key).toLowerCase()) ? 1 : 0;
}
