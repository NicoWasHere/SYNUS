import { assets, saveAssetNamed, removeAsset } from '../core/lib/asset-storage.js';

// Same "plain document.body overlay, no framework" shape as draw-tool.js/
// compose-at-tool.js - a centered panel this time (not tied to the
// render pane's own rect the way a drawing surface has to be; this is
// just a file-manager dialog).
function makeOverlayShell(title) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1a1a1a; border: 1px solid #444; border-radius: 8px;
    padding: 16px; width: 360px; max-height: 70vh; display: flex;
    flex-direction: column; gap: 10px;
    font: 13px 'SF Mono', Menlo, Consolas, monospace; color: #eee;
  `;
  overlay.appendChild(panel);

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'font-size: 14px; font-weight: bold; color: #eee;';
  panel.appendChild(heading);

  document.body.appendChild(overlay);
  return { overlay, panel };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeButton(label, onClick, extraStyle = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText =
    'background:#222; color:#eee; border:1px solid #444; padding:6px 10px; ' +
    'border-radius:4px; cursor:pointer; font:12px "SF Mono", Menlo, monospace;' +
    extraStyle;
  btn.addEventListener('click', onClick);
  return btn;
}

// renderAssetList(container, onItemClick) - one row per current assets
// entry (name + formatted size). onItemClick(name) fires on a row
// click; a ✕ button (independent of that) always removes the asset -
// shared by both the management portal (rows aren't otherwise
// clickable) and the $get$ explorer (rows ARE the picker).
function renderAssetList(container, { onItemClick, refresh }) {
  container.innerHTML = '';
  if (assets.size === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'Nothing saved yet.';
    empty.style.cssText = 'color: #888; padding: 4px 0;';
    container.appendChild(empty);
    return;
  }
  for (const [name, file] of assets) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex; align-items:center; justify-content:space-between; gap:8px; ' +
      'padding: 4px 6px; border-radius: 4px;' + (onItemClick ? ' cursor:pointer;' : '');
    const label = document.createElement('span');
    label.textContent = `${name} (${formatSize(file.size)})`;
    label.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
    row.appendChild(label);
    if (onItemClick) {
      row.addEventListener('mouseenter', () => (row.style.background = '#2c2c2c'));
      row.addEventListener('mouseleave', () => (row.style.background = 'none'));
      row.addEventListener('click', () => onItemClick(name));
    }
    const removeBtn = makeButton('✕', async (e) => {
      e.stopPropagation();
      await removeAsset(name);
      refresh();
    });
    row.appendChild(removeBtn);
    container.appendChild(row);
  }
}

// openStoragePortal() - the management UI behind the "storage" link
// (see main.js): upload a file, name it (independent of its own OS
// filename), Save persists it via saveAssetNamed(); the same panel
// lists + lets you remove everything already saved.
export function openStoragePortal() {
  const { overlay, panel } = makeOverlayShell('Storage');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.style.cssText = 'color:#eee; font-size:12px;';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'name to save it as';
  nameInput.style.cssText =
    'background:#111; color:#eee; border:1px solid #444; border-radius:4px; padding:6px; font:12px inherit;';

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file && !nameInput.value) nameInput.value = file.name;
  });

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:11px; color:#e0a030; min-height: 14px;';

  const listEl = document.createElement('div');
  listEl.style.cssText = 'overflow-y:auto; flex: 1; display:flex; flex-direction:column; gap:2px;';
  function refresh() {
    renderAssetList(listEl, { refresh });
  }
  refresh();

  const saveBtn = makeButton('Save', async () => {
    const file = fileInput.files[0];
    const name = nameInput.value.trim();
    if (!file || !name) {
      statusEl.textContent = 'Pick a file and give it a name first.';
      return;
    }
    saveBtn.disabled = true;
    statusEl.textContent = '';
    const result = await saveAssetNamed(name, file);
    saveBtn.disabled = false;
    if (!result.ok) {
      statusEl.textContent = `Save failed: ${result.error?.message || result.error}`;
      return;
    }
    fileInput.value = '';
    nameInput.value = '';
    refresh();
  });

  const uploadRow = document.createElement('div');
  uploadRow.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
  uploadRow.append(fileInput, nameInput, saveBtn, statusEl);

  const closeBtn = makeButton('✕ Close', () => overlay.remove());
  closeBtn.style.alignSelf = 'flex-end';

  panel.append(uploadRow, listEl, closeBtn);
}

// openAssetExplorer({ onPick, onCancel }) - the $get$ picker (see
// editor.js's tryExpandGet()): same list, no upload form - click a name
// to pick it (fires onPick(name) and closes), Close/✕ fires onCancel().
export function openAssetExplorer({ onPick, onCancel }) {
  const { overlay, panel } = makeOverlayShell('Pick a stored asset');

  const listEl = document.createElement('div');
  listEl.style.cssText = 'overflow-y:auto; flex: 1; display:flex; flex-direction:column; gap:2px;';
  function refresh() {
    renderAssetList(listEl, {
      refresh,
      onItemClick: (name) => {
        overlay.remove();
        onPick(name);
      },
    });
  }
  refresh();

  const closeBtn = makeButton('✕ Cancel', () => {
    overlay.remove();
    onCancel && onCancel();
  });
  closeBtn.style.alignSelf = 'flex-end';

  panel.append(listEl, closeBtn);
}
