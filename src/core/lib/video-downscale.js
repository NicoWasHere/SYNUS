// Downscales a (likely huge/high-bitrate) local video File entirely
// client-side - no ffmpeg or any other external tool needed, just the
// browser's own <video>/<canvas>/MediaRecorder pipeline, the same kind
// of "draw the current frame into a canvas" technique VideoSource itself
// uses (see media.js), just recording the result instead of rendering it
// live.
//
// This plays the source once, in real time, capturing each frame - if
// the source's bitrate is already too high for the browser to decode
// smoothly (the whole reason this exists), THIS pass will be exactly as
// slow as that real-time decode is, since it's built on the same <video>
// element and can't decode any faster than the browser's own decoder
// can. That's a one-time cost though: the resulting file is dramatically
// smaller/lower-bitrate and plays back smoothly forever after.
//
// Deliberately not using the WebCodecs API (VideoDecoder/VideoEncoder) -
// that would let decoding run faster than real-time playback, but it
// requires demuxing the source container yourself (there's no built-in
// "decode this whole file" call) and needs an extra muxer library to
// produce a real output file, and browser support is narrower (mainly
// Chromium). <video>+canvas+MediaRecorder works anywhere those three
// already do, which is everywhere this project already runs.
export function downscaleVideo(file, { maxSize = 1280, bitrate = 4_000_000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('failed to load video for downscaling'));
    };

    video.onloadedmetadata = () => {
      const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
      // even dimensions - some encoders choke on odd ones
      const width = Math.round((video.videoWidth * scale) / 2) * 2;
      const height = Math.round((video.videoHeight * scale) / 2) * 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const mimeType =
        ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
          (t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)
        ) || '';
      if (!mimeType) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('MediaRecorder/webm recording not supported in this browser'));
        return;
      }

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e.error || new Error('MediaRecorder error'));
      };
      recorder.onstop = () => {
        URL.revokeObjectURL(objectUrl);
        const blob = new Blob(chunks, { type: mimeType });
        const outName = `${file.name.replace(/\.[^/.]+$/, '')}-web.webm`;
        resolve(new File([blob], outName, { type: blob.type }));
      };

      let rafId;
      function drawFrame() {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        onProgress?.(video.currentTime, video.duration);
        rafId = requestAnimationFrame(drawFrame);
      }

      video.onended = () => {
        cancelAnimationFrame(rafId);
        recorder.stop();
      };

      recorder.start();
      video
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawFrame);
        })
        .catch((e) => {
          recorder.stop();
          URL.revokeObjectURL(objectUrl);
          reject(e);
        });
    };
  });
}
