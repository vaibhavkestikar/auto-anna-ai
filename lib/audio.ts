const TARGET_RATE = 16_000;

let shared: AudioContext | null = null;
let micStream: MediaStream | null = null;

export type CaptureSession = {
  stop: () => Promise<Blob | null>;
  reused: boolean;
  startedAt: number;
};

export function unlockAudio() {
  if (!shared || shared.state === "closed") {
    shared = new AudioContext();
  }
  if (shared.state !== "running") {
    void shared.resume();
  }
  return shared;
}

export function releaseMic() {
  micStream?.getTracks().forEach((track) => track.stop());
  micStream = null;
}

export function startCapture(onTick: (seconds: number) => void): Promise<CaptureSession> {
  const ctx = unlockAudio();
  const existing = liveMic();
  if (existing) return Promise.resolve(beginRecording(existing, ctx, onTick, true));
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("This browser has no microphone. Open Auto Anna on your phone."));
  }

  // iOS Chrome drops the mic request if anything is awaited before this call.
  const streamPromise = navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const guarded = withTimeout(
    streamPromise,
    8000,
    "The microphone did not start. Hold the button again.",
  ).catch((error: unknown) => {
    void streamPromise.then(
      (stream) => stream.getTracks().forEach((track) => track.stop()),
      () => undefined,
    );
    throw error;
  });

  return guarded.then((stream) => {
    micStream = stream;
    return beginRecording(stream, ctx, onTick, false);
  });
}

export async function playMp3Base64(base64: string) {
  const ctx = unlockAudio();
  if (ctx.state !== "running") {
    try {
      await withTimeout(ctx.resume(), 800, "speaker");
    } catch {
      // The hold already resumed playback. Keep going.
    }
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
  await new Promise<void>((resolve, reject) => {
    const node = ctx.createBufferSource();
    node.buffer = audioBuffer;
    node.connect(ctx.destination);
    node.onended = () => resolve();
    try {
      node.start();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("The speaker coughed. Try that line again."));
    }
  });
}

function liveMic() {
  if (!micStream) return null;
  const live = micStream.getAudioTracks().some((track) => track.readyState === "live");
  if (!live) {
    micStream = null;
    return null;
  }
  return micStream;
}

function beginRecording(
  stream: MediaStream,
  ctx: AudioContext,
  onTick: (seconds: number) => void,
  reused: boolean,
): CaptureSession {
  const started = performance.now();
  const timer = window.setInterval(() => {
    onTick(Math.min(15, Math.floor((performance.now() - started) / 1000)));
  }, 200);

  if (typeof MediaRecorder !== "undefined") {
    try {
      return recordWithMediaRecorder(stream, ctx, started, timer, reused);
    } catch {
      // Older browsers fall through to the processor path.
    }
  }
  return recordWithProcessor(stream, ctx, started, timer, reused);
}

function recordWithMediaRecorder(
  stream: MediaStream,
  ctx: AudioContext,
  started: number,
  timer: number,
  reused: boolean,
): CaptureSession {
  const recorder = createRecorder(stream);
  const parts: Blob[] = [];
  const pcm = tapPcm(stream, ctx);
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) parts.push(event.data);
  });
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  try {
    if (ios) recorder.start();
    else recorder.start(250);
  } catch {
    recorder.start();
  }

  return {
    reused,
    startedAt: started,
    stop: () =>
      withTimeout(
        (async () => {
          window.clearInterval(timer);
          const elapsed = performance.now() - started;
          pcm.stop();
          await stopRecorder(recorder);
          await new Promise((resolve) => window.setTimeout(resolve, 80));
          if (elapsed < 450) return null;
          const wav = wavFromPcm(pcm.chunks, ctx.sampleRate);
          if (wav) return wav;
          if (parts.length === 0) return null;
          const blob = new Blob(parts, { type: baseMime(recorder.mimeType) });
          const decoded = await blobToWav(blob, ctx);
          if (decoded) return decoded;
          throw new Error("The phone recorded that, but it wasn't wav. Hold the button and say the line again.");
        })(),
        6000,
        "The recording did not send. Hold the button again.",
      ),
  };
}

function recordWithProcessor(
  stream: MediaStream,
  ctx: AudioContext,
  started: number,
  timer: number,
  reused: boolean,
): CaptureSession {
  const pcm = tapPcm(stream, ctx);
  const chunks = pcm.chunks;

  return {
    reused,
    startedAt: started,
    stop: async () => {
      window.clearInterval(timer);
      const elapsed = performance.now() - started;
      pcm.stop();
      if (elapsed < 450 || chunks.length === 0) return null;
      const down = downsample(merge(chunks), ctx.sampleRate, TARGET_RATE);
      return encodeWav(down, TARGET_RATE);
    },
  };
}

function createRecorder(stream: MediaStream) {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const types = ios
    ? ["audio/mp4", "audio/aac", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  const take = new MediaStream(stream.getAudioTracks());
  const mimeType = types.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
  return mimeType ? new MediaRecorder(take, { mimeType }) : new MediaRecorder(take);
}

async function stopRecorder(recorder: MediaRecorder) {
  if (recorder.state === "inactive") return;
  await new Promise<void>((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    window.setTimeout(resolve, 1500);
    try {
      recorder.stop();
    } catch {
      resolve();
    }
  });
}

function tapPcm(stream: MediaStream, ctx: AudioContext) {
  void ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0.00001;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    const buffer = event.inputBuffer;
    if (buffer.numberOfChannels === 0 || buffer.length === 0) return;
    const mono = new Float32Array(buffer.length);
    const channels = buffer.numberOfChannels || 1;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i += 1) mono[i] += data[i] / channels;
    }
    chunks.push(mono);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  return {
    chunks,
    stop() {
      processor.onaudioprocess = null;
      try {
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
      } catch {
        // The graph is already torn down.
      }
    },
  };
}

function wavFromPcm(chunks: Float32Array[], sampleRate: number) {
  if (chunks.length === 0) return null;
  const merged = merge(chunks);
  if (merged.length < sampleRate * 0.4 || !hasEnergy(merged)) return null;
  return encodeWav(downsample(merged, sampleRate, TARGET_RATE), TARGET_RATE);
}

function hasEnergy(samples: Float32Array) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += 16) {
    total += samples[i] * samples[i];
    count += 1;
  }
  return count > 0 && total / count > 0.0000004;
}

function baseMime(mime: string) {
  const cut = mime.split(";")[0]?.trim();
  return cut || "audio/mp4";
}

async function blobToWav(blob: Blob, ctx: AudioContext) {
  void ctx.resume();
  const raw = await blob.arrayBuffer();
  let decoded: AudioBuffer;
  try {
    decoded = await withTimeout(ctx.decodeAudioData(raw.slice(0)), 2000, "decode");
  } catch {
    return null;
  }
  const down = downsample(mixToMono(decoded), decoded.sampleRate, TARGET_RATE);
  if (down.length < TARGET_RATE * 0.4) return null;
  return encodeWav(down, TARGET_RATE);
}

function mixToMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) mixed[i] += data[i] / buffer.numberOfChannels;
  }
  return mixed;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function merge(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count += 1;
    }
    output[i] = count ? sum / count : 0;
  }
  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
