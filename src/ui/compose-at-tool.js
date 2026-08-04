import { screenSize } from '../core/lib/context.js';

// openComposeAtTool({ renderPane, count, onDone, onCancel }) - the UI half
// of $compose_at(n)$ (see editor.js's COMPOSE_AT_PATTERN). Puts `count`
// draggable, resizable boxes on an overlay sized to match the render pane
// exactly, one per screen input the generated node will composite - drag
// a box's body to move it, its bottom-right handle to resize it. onDone
// fires with an array of { x, y, w, h } (0..1, x/y = top-left corner,
// y=0 at the top - the same convention lib/compose-at.js's ComposeAt
// class expects), in the same order the boxes were created (box 1 ->
// inputs.in1, and so on - see editor.js's buildComposeAtNodeEntry).
// onCancel fires instead if the user backs out. Neither fires more than
// once. Same overlay/toolbar shape as draw-tool.js's openDrawTool.
//
// IMPORTANT: boxes are dragged/sized in fractions of the VISIBLE render
// pane (renderPane's own, generally non-square, box), but ComposeAt's
// shader places things in fractions of the underlying SQUARE gl canvas
// (screenSize() - see context.js) - the pane is a CENTERED CROP of that
// square (main.js's resizeCanvas() makes the canvas element itself a
// square, and #render-pane's `overflow: hidden` + flex centering crops it
// down to the real box). Without correcting for that crop, a box placed
// flush against the visible edge would land partway into the (invisible)
// letterboxed margin instead - correct on any window that isn't itself
// square. onDone's rects are converted to square-relative fractions
// below so ComposeAt/the generated code never has to know about this.
const MIN_FRACTION = 0.05; // smallest a box can be dragged down to, as a fraction of the overlay

const BOX_COLORS = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#d19a66', '#be5046'];

export function openComposeAtTool({ renderPane, count, onDone, onCancel }) {
  const rect = renderPane.getBoundingClientRect();
  const overlayW = Math.max(1, rect.width);
  const overlayH = Math.max(1, rect.height);

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: ${rect.top}px; left: ${rect.left}px;
    width: ${overlayW}px; height: ${overlayH}px;
    z-index: 200; background: rgba(0,0,0,0.4); overflow: hidden;
  `;

  // Initial layout: a simple grid so all `count` boxes start visible and
  // distinct, rather than stacked on top of each other at one corner.
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const boxes = []; // { el, x, y, w, h } - x/y/w/h are fractions (0..1) of the overlay

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function applyBoxStyle(box) {
    box.el.style.left = `${box.x * overlayW}px`;
    box.el.style.top = `${box.y * overlayH}px`;
    box.el.style.width = `${box.w * overlayW}px`;
    box.el.style.height = `${box.h * overlayH}px`;
  }

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = 0.8 / cols;
    const h = 0.8 / rows;
    const box = {
      x: (col + 0.1) / cols,
      y: (row + 0.1) / rows,
      w,
      h,
    };
    const color = BOX_COLORS[i % BOX_COLORS.length];

    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute; box-sizing: border-box;
      border: 2px solid ${color}; background: ${color}33;
      cursor: move; display: flex; align-items: flex-start; justify-content: flex-start;
    `;
    const label = document.createElement('div');
    label.textContent = `in${i + 1}`;
    label.style.cssText = `
      color: ${color}; font: 11px 'SF Mono', Menlo, monospace; padding: 2px 5px;
      background: rgba(0,0,0,0.6); pointer-events: none;
    `;
    el.appendChild(label);

    const handle = document.createElement('div');
    handle.style.cssText = `
      position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px;
      background: ${color}; border-radius: 3px; cursor: nwse-resize;
    `;
    el.appendChild(handle);

    box.el = el;
    boxes.push(box);
    applyBoxStyle(box);
    overlay.appendChild(el);

    let dragging = null; // 'move' | 'resize' | null
    let startPointer = { x: 0, y: 0 };
    let startBox = { x: 0, y: 0, w: 0, h: 0 };

    function beginDrag(mode) {
      return (e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging = mode;
        startPointer = { x: e.clientX, y: e.clientY };
        startBox = { x: box.x, y: box.y, w: box.w, h: box.h };
      };
    }

    function onMove(e) {
      if (!dragging) return;
      const dx = (e.clientX - startPointer.x) / overlayW;
      const dy = (e.clientY - startPointer.y) / overlayH;
      if (dragging === 'move') {
        box.x = clamp(startBox.x + dx, 0, 1 - box.w);
        box.y = clamp(startBox.y + dy, 0, 1 - box.h);
      } else if (dragging === 'resize') {
        box.w = clamp(startBox.w + dx, MIN_FRACTION, 1 - box.x);
        box.h = clamp(startBox.h + dy, MIN_FRACTION, 1 - box.y);
      }
      applyBoxStyle(box);
    }
    function onUp() {
      dragging = null;
    }

    el.addEventListener('pointerdown', beginDrag('move'));
    handle.addEventListener('pointerdown', beginDrag('resize'));
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    box._cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

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
    for (const box of boxes) box._cleanup();
    overlay.remove();
  }

  toolbar.append(
    makeButton('✓ Done', () => {
      // Convert from "fraction of the visible pane" (what the user just
      // dragged) to "fraction of the square gl canvas" (what ComposeAt's
      // shader actually addresses) - see the class comment above.
      const square = screenSize().width || Math.max(overlayW, overlayH);
      const offsetX = (square - overlayW) / 2;
      const offsetY = (square - overlayH) / 2;
      const rects = boxes.map((b) => ({
        x: (offsetX + b.x * overlayW) / square,
        y: (offsetY + b.y * overlayH) / square,
        w: (b.w * overlayW) / square,
        h: (b.h * overlayH) / square,
      }));
      cleanup();
      onDone(rects);
    }),
    makeButton('✕ Cancel', () => {
      cleanup();
      onCancel && onCancel();
    })
  );
  overlay.appendChild(toolbar);

  document.body.appendChild(overlay);
}
