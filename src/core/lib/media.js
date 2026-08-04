import { getGL, viewportSize } from './context.js';
import { createTexture } from '../../gl/gl-context.js';

// Draws `source` (an <img>, <video>, whatever ctx.drawImage() accepts)
// into `canvas`, letterboxed or cropped (see `cover`) to fit, then
// uploads it. Shared by every class below since "draw current frame,
// upload" is the only real difference between an image, a video file,
// and a webcam feed once each has *some* frame ready to hand over.
//
// `canvas` is always square (every media class below constructs one),
// but the browser only ever shows a centered viewportSize()-sized
// sub-rectangle of that square, cropping the rest via CSS (see main.js's
// resizeCanvas()/#render-pane overflow: hidden). Fitting/cropping
// `source` against the FULL square first and letting that CSS crop cut
// into the result a second time double-crops non-square content (most
// visible on a webcam feed: cropped once to fill the square, then
// cropped again on the other axis down to the real, non-square
// viewport). Computing the fit/crop against the real viewport rect
// instead - scaled down to whatever resolution `canvas` actually is,
// which isn't necessarily the full screen size, see WebcamSource - and
// drawing into that same centered sub-rectangle of the square, means the
// CSS crop just removes exactly the margin this already left blank: one
// crop, not two, at any working resolution.
function drawLetterboxed(gl, ctx, canvas, texture, source, sourceW, sourceH, fit = 'contain') {
  if (!sourceW || !sourceH) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (fit === 'stretch') {
    // Fills the ENTIRE canvas exactly, distorting the source's aspect
    // ratio - the right choice for texture DATA consumed by uv math
    // rather than looked at directly (e.g. a color-lookup LUT strip -
    // see fx/registry.js's colorLookup), where preserving normalized
    // 0..1 positions across the whole texture matters more than
    // avoiding visual distortion. Skips the viewport-aware centering
    // below entirely - that's specifically for content meant to be
    // shown via render(), which a LUT never is.
    ctx.drawImage(source, 0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    return;
  }

  const viewport = viewportSize();
  const rectScale = width / Math.max(viewport.width, viewport.height);
  const destW = viewport.width * rectScale;
  const destH = viewport.height * rectScale;
  const destX = (width - destW) / 2;
  const destY = (height - destH) / 2;
  const scale = fit === 'cover' ? Math.max(destW / sourceW, destH / sourceH) : Math.min(destW / sourceW, destH / sourceH);
  const w = sourceW * scale;
  const h = sourceH * scale;
  ctx.drawImage(source, destX + (destW - w) / 2, destY + (destH - h) / 2, w, h);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

// Resolves `source` to something <img>/<video>.src accepts - passed
// through unchanged if it's already a URL string (including one from
// files.get(...), see file-registry.js, which just holds plain object
// URLs - see main.js), or, if it's a raw File/Blob, converted to one
// object URL and cached on `instance` so a fresh one isn't leaked every
// single tick for the same unchanged file. Revokes the previous object
// URL when the source actually changes so these don't pile up either.
function resolveSource(instance, source) {
  if (!(source instanceof Blob)) {
    if (instance._blobUrl) {
      URL.revokeObjectURL(instance._blobUrl);
      instance._blobUrl = null;
      instance._blobSource = null;
    }
    return source;
  }
  if (instance._blobSource !== source) {
    if (instance._blobUrl) URL.revokeObjectURL(instance._blobUrl);
    instance._blobUrl = URL.createObjectURL(source);
    instance._blobSource = source;
  }
  return instance._blobUrl;
}

// Resizes `instance`'s canvas/texture to the smaller of its originally
// requested size (instance.maxSize) and whatever `nativeW`/`nativeH`
// turns out to be - a no-op once they already match, so it's cheap to
// call unconditionally every tick. A photo, video file, or webcam feed
// all have some genuine native resolution; redrawing (ctx.drawImage) and
// re-uploading (texImage2D) a needlessly oversized buffer for one every
// single tick is pure wasted CPU/GPU work with no quality benefit - the
// GPU's own texture sampling (LINEAR filtering, see gl-context.js's
// createTexture) already handles scaling up to the real output size for
// free, just as smoothly as redoing the CPU-side draw at that size would.
function capToNativeSize(instance, nativeW, nativeH) {
  if (!nativeW || !nativeH) return;
  const size = Math.min(instance.maxSize, Math.max(nativeW, nativeH));
  if (size === instance.canvas.width) return;
  instance.canvas.width = size;
  instance.canvas.height = size;
  const gl = instance.gl;
  gl.bindTexture(gl.TEXTURE_2D, instance.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}

// Uploads one blank (transparent) frame immediately at construction, so
// the texture always has real image data behind it - sampling a texture
// that was only ever allocated with texImage2D(..., null) (see
// gl-context.js's createTexture()) and never actually written to is what
// triggers the browser's "Tex image ... is incurring lazy initialization"
// warning; harmless (the driver just zero-fills it on first use instead
// of at allocation time), but avoidable, since every one of these classes
// already has a 2D canvas sitting right there to upload from.
function uploadBlankFrame(gl, canvas, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

// new ImageSource(width, height) inside a node's code(), or
// use(ImageSource, width, height) via useInstances. tick(source) loads
// (and keeps showing) an image - this also just handles animated GIFs,
// with no separate code path: the browser advances a loaded <img>'s
// displayed frame on its own, so redrawing that same element into the
// canvas every tick (which this does unconditionally, like every other
// lib class here) is all animation needs. `source` is either a plain URL
// string, or a File/Blob - e.g. files.get('name.jpg') from the "Load
// file(s)" button (see file-registry.js) for a local file with no server
// or public/ folder involved at all.
//
// width/height are only a CAP, not a target - see capToNativeSize()
// above: a photo has a real native resolution, and there's nothing to
// gain (and CPU/GPU to lose) from redrawing/re-uploading it at a much
// larger size every tick just because screenSize() happens to be bigger.
//
// tick()'s second argument, { fit }, defaults to 'contain' (letterboxed,
// aspect preserved - right for anything meant to be looked at, a photo
// or GIF). Pass 'stretch' instead for texture DATA where every pixel's
// normalized position matters more than visual distortion - a color-
// lookup LUT strip (fx/registry.js's colorLookup) being the main case:
// 'contain' would letterbox a LUT's usual wide, non-square shape into
// black bars, breaking the exact 0..1 addressing colorLookup relies on.
export class ImageSource {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.maxSize = Math.max(width, height);
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = createTexture(this.gl, width, height);
    uploadBlankFrame(this.gl, this.canvas, this.texture);
    this.lastUrl = null;
    this.loaded = false;
    this.img = new Image();
    this.img.crossOrigin = 'anonymous';
    this.img.onload = () => {
      this.loaded = true;
    };
  }

  tick(source, { fit = 'contain' } = {}) {
    const url = resolveSource(this, source);
    if (url !== this.lastUrl) {
      this.lastUrl = url;
      this.loaded = false;
      this.img.src = url;
    }
    if (this.loaded) {
      capToNativeSize(this, this.img.naturalWidth, this.img.naturalHeight);
      drawLetterboxed(this.gl, this.ctx, this.canvas, this.texture, this.img, this.img.naturalWidth, this.img.naturalHeight, fit);
    }
    return this;
  }
  dispose() {
    this.img.onload = null;
    this.img.src = '';
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this.gl.deleteTexture(this.texture);
  }
}

// new VideoSource(width, height) inside a node's code(), or
// use(VideoSource, width, height) via useInstances. tick(source) plays
// (and loops) a video - `source` is either a plain URL string, or a
// File/Blob (e.g. files.get('name.mp4'), see ImageSource above and
// file-registry.js). Muted + playsInline is what lets autoplay actually
// start without a user gesture in most browsers - if the browser still
// blocks it, .play()'s rejection is swallowed and nothing is drawn until
// playback actually begins.
//
// width/height are only a CAP, not a target - same reasoning as
// ImageSource above. Beyond just wasted work, this matters more here:
// decoding video is already real-time-sensitive, and every tick spent on
// an oversized ctx.drawImage + texImage2D is a tick not spent letting
// the browser keep decoding - on a large/high-bitrate file already
// struggling to decode in real time, that competition can be the
// difference between smooth playback and visibly falling behind.
//
// No native video.loop - looping is handled in tick() below instead (see
// its start/end options), so a trimmed range loops just that range;
// native loop only ever loops the whole file, 0..duration.
export class VideoSource {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.maxSize = Math.max(width, height);
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = createTexture(this.gl, width, height);
    uploadBlankFrame(this.gl, this.canvas, this.texture);
    this.lastUrl = null;
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.muted = true;
    this.video.playsInline = true;
  }

  // start/end trim the video to a [start%, end%] window of its own
  // duration (0..100, defaults to the whole file) - both playback AND
  // looping stay inside that window, e.g. { start: 25, end: 75 } plays
  // and loops only the middle half. duration isn't known until the video
  // has loaded enough metadata (readyState >= 2, same gate the existing
  // draw already waited on), so this only takes effect once that's true.
  tick(source, { fit = 'contain', start = 0, end = 100 } = {}) {
    const url = resolveSource(this, source);
    if (url !== this.lastUrl) {
      this.lastUrl = url;
      this.video.src = url;
      this.video.play().catch(() => {});
    }
    if (this.video.readyState >= 2 && this.video.duration) {
      const startTime = (start / 100) * this.video.duration;
      const endTime = (end / 100) * this.video.duration;
      if (this.video.currentTime < startTime || this.video.currentTime >= endTime) {
        this.video.currentTime = startTime;
      }
      // Reaching the end of the file (or of a trimmed range once seeked
      // past it) pauses the element - without native video.loop, nothing
      // else ever resumes it, so seeking currentTime back to startTime
      // alone left it sitting there paused on the first frame forever
      // instead of actually looping. Re-triggering .play() every time
      // it's found paused is what makes the loop keep going.
      if (this.video.paused) this.video.play().catch(() => {});
      capToNativeSize(this, this.video.videoWidth, this.video.videoHeight);
      drawLetterboxed(this.gl, this.ctx, this.canvas, this.texture, this.video, this.video.videoWidth, this.video.videoHeight, fit);
    }
    return this;
  }
  dispose() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load(); // actually releases the decoder, removeAttribute alone doesn't
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this.gl.deleteTexture(this.texture);
  }
}

// new WebcamSource(width, height) inside a node's code(), or
// use(WebcamSource, width, height) via useInstances. tick() asks for
// camera permission on its first call (the browser's own permission
// prompt - nothing custom here) and shows the live feed once granted.
// Cropped to fill (not letterboxed) since a webcam feed being cut off at
// the edges reads better than black bars for a live camera view; check
// .error for a rejected/unavailable camera.
//
// width/height are only a CAP, not a target: once the camera's actual
// resolution is known (typically much smaller than a full-screen
// square, e.g. 640x480), the working canvas/texture shrinks to match it
// instead of staying at whatever much larger size screenSize() handed
// in. A live camera feed is already resolution-capped by the hardware -
// there's no sharpness to gain from redrawing (ctx.drawImage) and
// re-uploading (texImage2D) a needlessly oversized buffer every single
// tick, only wasted CPU/GPU work and visible lag. The GPU's own texture
// sampling (see gl-context.js's createTexture, LINEAR filtering) handles
// the upscale to the actual output size for free when this gets drawn.
export class WebcamSource {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.maxSize = Math.max(width, height);
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = createTexture(this.gl, width, height);
    uploadBlankFrame(this.gl, this.canvas, this.texture);
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.requested = false;
    this.error = null;
  }

  tick() {
    if (!this.requested) {
      this.requested = true;
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          this.video.srcObject = stream;
          this.video.play().catch(() => {});
        })
        .catch((e) => {
          this.error = e.message;
        });
    }
    if (this.video.readyState >= 2) {
      capToNativeSize(this, this.video.videoWidth, this.video.videoHeight);
      drawLetterboxed(this.gl, this.ctx, this.canvas, this.texture, this.video, this.video.videoWidth, this.video.videoHeight, 'cover');
    }
    return this;
  }
  // Stopping every track is what actually turns the camera off (and
  // clears the browser's recording indicator) - pausing the <video>
  // element alone leaves the underlying MediaStream (and the camera
  // hardware itself) still running.
  dispose() {
    const stream = this.video.srcObject;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      this.video.srcObject = null;
    }
    this.gl.deleteTexture(this.texture);
  }
}
