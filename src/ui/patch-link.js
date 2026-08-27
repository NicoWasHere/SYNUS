// Shareable patch links - same idea as Hydra/Strudel's own editors: the
// current project source gets base64-encoded into the URL's hash on every
// successful Send (see main.js's send()), and a URL that already has one
// loads THAT instead of the bundled default project on startup. Copy/
// paste/bookmark the address bar to share or save an exact patch - no
// server-side storage involved, the whole thing lives in the URL itself.
//
// Plain base64 (not compressed) - same tradeoff Hydra/Strudel themselves
// make: a long patch makes a long URL, but every browser's address bar
// handles that fine, and it keeps encode/decode synchronous and dependency-
// free rather than pulling in a compression stream for it.
const HASH_PREFIX = '#patch=';
const BLOCKS_PREFIX = '&blocks=';

function encode(source) {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(encoded) {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Call once at startup, before the editor's created, to decide its
// initial doc - null if the URL has no patch (or it fails to decode, e.g.
// a hand-edited/truncated link), in which case the caller falls back to
// the bundled default project.
export function getPatchFromUrl() {
  if (!location.hash.startsWith(HASH_PREFIX)) return null;
  const rest = location.hash.slice(HASH_PREFIX.length);
  const ampIdx = rest.indexOf('&'); // a trailing &blocks=... segment, if any - see below
  try {
    return decode(ampIdx === -1 ? rest : rest.slice(0, ampIdx));
  } catch (e) {
    console.error('patch-link: failed to decode URL patch', e);
    return null;
  }
}

// getBlockPatchFromUrl() - the mobile block-patch mode's own JSON source
// of truth (see core/patch-compiler.js), stored as a second, optional
// `&blocks=` segment tacked onto the ordinary `#patch=` one (which always
// holds the compiled/authored JS text either way, so the code editor can
// always load/run it, mobile patch or not). Only mobile mode ever reads
// this - the code editor ignores it entirely. A URL with no `&blocks=`
// segment (hand-written, or saved from the code editor) just means
// mobile mode opens to an empty canvas - converting hand-written code
// INTO blocks is out of scope (see the mobile-mode plan's non-goals).
export function getBlockPatchFromUrl() {
  const idx = location.hash.indexOf(BLOCKS_PREFIX);
  if (idx === -1) return null;
  try {
    return JSON.parse(decode(location.hash.slice(idx + BLOCKS_PREFIX.length)));
  } catch (e) {
    console.error('patch-link: failed to decode URL block patch', e);
    return null;
  }
}

// replaceState (not pushState) - sending repeatedly is the normal way of
// working here, and that shouldn't spam the browser's back-button history
// with one entry per patch.
export function setPatchInUrl(source) {
  history.replaceState(null, '', HASH_PREFIX + encode(source));
}

// setPatchAndBlocksInUrl(source, patchJSON) - same as setPatchInUrl, but
// also stores the mobile mode's JSON patch as a second `&blocks=` segment,
// so reloading (or opening the URL on another device) rehydrates the real
// editable block graph, not just the generated code text. Mobile mode
// calls this instead of setPatchInUrl on every edit - the plain version
// would silently drop the `&blocks=` segment on the very next one.
export function setPatchAndBlocksInUrl(source, patchJSON) {
  history.replaceState(null, '', HASH_PREFIX + encode(source) + BLOCKS_PREFIX + encode(JSON.stringify(patchJSON)));
}
