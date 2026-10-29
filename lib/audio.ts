const TARGET_RATE = 16_000;

let shared: AudioContext | null = null;

export function unlockAudio() {
  if (!shared || shared.state === "closed") {
    shared = new AudioContext();
  }
  if (shared.state !== "running") {
    void shared.resume();
  }
  return shared;
}

export async function startCapture(onTick: (seconds: number) => void) {
  const ctx = unlockAudio();
  await ctx.resume();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser has no microphone. Open Auto Anna on your phone.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);

  const started = performance.now();
  const timer = window.setInterval(() => {
    onTick(Math.min(15, Math.floor((performance.now() - started) / 1000)));
  }, 200);

  return {
    stop: async () => {
      window.clearInterval(timer);
      const elapsed = performance.now() - started;
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      sink.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      if (elapsed < 450 || chunks.length === 0) return null;
      const merged = merge(chunks);
      const down = downsample(merged, ctx.sampleRate, TARGET_RATE);
      return encodeWav(down, TARGET_RATE);
    },
  };
}

export async function playMp3Base64(base64: string) {
  const ctx = unlockAudio();
  await ctx.resume();
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
