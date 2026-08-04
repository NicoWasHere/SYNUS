// new AudioSource(fftSize) inside a node's code(), or use(AudioSource,
// fftSize) via useInstances. tick() asks for microphone permission on its
// first call (the browser's own permission prompt, same convention as
// WebcamSource) and starts analyzing the live input once granted; check
// .error for a rejected/unavailable mic. Not a texture-bearing class -
// this produces plain numbers/arrays, for driving OTHER things (a
// Pattern, an Instance/particle2d grid, an effect's parameter) rather
// than being rendered directly itself.
//
// fftSize must be a power of 2 (Web Audio requirement) - bigger means
// more frequency resolution but coarser time resolution. 2048 (the
// default) is a reasonable middle ground for visuals.
export class AudioSource {
  constructor(fftSize = 2048) {
    this.fftSize = fftSize;
    this.audioCtx = null;
    this.analyser = null;
    this.requested = false;
    this.error = null;
    this._freqData = null;
    this._timeData = null;
  }

  tick() {
    if (!this.requested) {
      this.requested = true;
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const src = this.audioCtx.createMediaStreamSource(stream);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = this.fftSize;
          this.analyser.smoothingTimeConstant = 0.8;
          src.connect(this.analyser);
          this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
          this._timeData = new Uint8Array(this.analyser.fftSize);
        })
        .catch((e) => {
          this.error = e.message;
        });
    }
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this._freqData);
      this.analyser.getByteTimeDomainData(this._timeData);
    }
    return this;
  }

  // spectrum(cols) -> flat array (0..1), `cols` bins evenly spaced across
  // the FFT's own frequency bins (linear, not perceptual/log spacing -
  // most of the energy in music sits in the lower bins either way).
  spectrum(cols = 32) {
    if (!this._freqData) return new Array(cols).fill(0);
    const bins = this._freqData.length;
    const out = new Array(cols);
    for (let i = 0; i < cols; i++) {
      const start = Math.floor((i / cols) * bins);
      const end = Math.max(start + 1, Math.floor(((i + 1) / cols) * bins));
      let sum = 0;
      let count = 0;
      for (let b = start; b < end; b++) {
        sum += this._freqData[b];
        count++;
      }
      out[i] = sum / count / 255;
    }
    return out;
  }

  // band(loHz, hiHz) -> average magnitude (0..1) in that Hz range - the
  // "EQ" half: call it a few times with different ranges (bass/mid/
  // treble, or whatever split you actually want) to pull out just those
  // bands, same idea as a real EQ's crossover points.
  band(loHz, hiHz) {
    if (!this._freqData || !this.audioCtx) return 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    const bins = this._freqData.length;
    const loBin = Math.max(0, Math.floor((loHz / nyquist) * bins));
    const hiBin = Math.min(bins - 1, Math.ceil((hiHz / nyquist) * bins));
    let sum = 0;
    let count = 0;
    for (let b = loBin; b <= hiBin; b++) {
      sum += this._freqData[b];
      count++;
    }
    return count > 0 ? sum / count / 255 : 0;
  }

  // waveform(samples) -> flat array (-1..1), the raw time-domain signal
  // downsampled to `samples` points - the actual waveform shape, not
  // frequency content (for a "scope" that looks like an oscilloscope
  // trace rather than a spectrum analyzer bar graph).
  waveform(samples = 128) {
    if (!this._timeData) return new Array(samples).fill(0);
    const len = this._timeData.length;
    const out = new Array(samples);
    for (let i = 0; i < samples; i++) {
      const idx = Math.floor((i / samples) * len);
      out[i] = (this._timeData[idx] - 128) / 128;
    }
    return out;
  }
}
