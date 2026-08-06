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
  try {
    return decode(location.hash.slice(HASH_PREFIX.length));
  } catch (e) {
    console.error('patch-link: failed to decode URL patch', e);
    return null;
  }
}

// replaceState (not pushState) - sending repeatedly is the normal way of
// working here, and that shouldn't spam the browser's back-button history
// with one entry per patch.
export function setPatchInUrl(source) {
  history.replaceState(null, '', HASH_PREFIX + encode(source));
}
