// openDrawTool({ renderPane, onDone, onCancel }) - the UI half of $draw$
// (see editor.js's DRAW_PATTERN). Puts a freehand-drawable canvas overlay
// directly on top of the render pane, sized to match it exactly (so
// wherever you draw lines up with what's actually visible underneath),
// with a small Done/Clear/Cancel toolbar. onDone(dataUrl) fires with a
// PNG data URL of whatever was drawn - white strokes on a transparent
// background (the CSS tint below is purely a while-drawing visibility
// aid; canvas.toDataURL() only ever captures the canvas's own 2D drawing
// buffer, never its CSS background, so the captured PNG comes out
// correctly transparent). onCancel() fires instead if the user backs out
// without saving - neither callback fires more than once.
export function openDrawTool({ renderPane, onDone, onCancel }) {
  const rect = renderPane.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: ${rect.top}px; left: ${rect.left}px;
    width: ${rect.width}px; height: ${rect.height}px;
    z-index: 200; cursor: crosshair;
  `;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  canvas.style.cssText = 'width: 100%; height: 100%; display: block; background: rgba(0,0,0,0.4);';
  overlay.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = 10;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  }

  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  function down(e) {
    drawing = true;
    [lastX, lastY] = pos(e);
    ctx.beginPath();
    ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  function move(e) {
    if (!drawing) return;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lastX, lastY] = [x, y];
  }
  function up() {
    drawing = false;
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  // On window, not just the canvas - releasing the mouse/pen after
  // dragging off the canvas edge should still end the stroke, the same
  // way any normal drawing app behaves.
  window.addEventListener('pointerup', up);

  function makeButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText =
      'background:#222; color:#eee; border:1px solid #444; padding:6px 10px; ' +
      'border-radius:4px; cursor:pointer; font:12px "SF Mono", Menlo, monospace;';
    btn.addEventListener('click', onClick);
    return btn;
  }

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'position:absolute; top:10px; left:10px; display:flex; gap:8px;';

  function cleanup() {
    window.removeEventListener('pointerup', up);
    overlay.remove();
  }

  toolbar.append(
    makeButton('✓ Done', () => {
      const dataUrl = canvas.toDataURL('image/png');
      cleanup();
      onDone(dataUrl);
    }),
    makeButton('Clear', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }),
    makeButton('✕ Cancel', () => {
      cleanup();
      onCancel && onCancel();
    })
  );
  overlay.appendChild(toolbar);

  document.body.appendChild(overlay);
}
