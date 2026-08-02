// files - a Map<filename, File> of everything picked via the "Load
// file(s)" button (see main.js). Exposed to project code as a plain
// global, read-only from that side: `files.get('portrait.jpg')` hands
// ImageSource/VideoSource a real File object, which they accept directly
// alongside a plain URL string (see media.js's resolveSource - it
// converts to an object URL lazily, only once actually used, and caches
// it). Works with zero filesystem or server involvement (no public/
// folder, no upload) and regardless of who's running the page, since the
// browser mediates the actual file access entirely through the native
// picker. Picking a file with the same name again replaces its entry;
// nothing is ever removed automatically otherwise.
export const files = new Map();

export function addFile(file) {
  files.set(file.name, file);
}
