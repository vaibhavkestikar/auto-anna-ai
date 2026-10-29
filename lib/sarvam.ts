import {
  flavorPrompt,
  languages,
  voiceFor,
  type LanguageCode,
  type Mode,
  type Side,
} from "@/lib/modes";

const SARVAM = "https://api.sarvam.ai";

export class SarvamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;

function apiKey() {
  const key = process.env.SARVAM_API_KEY?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (!key) {
    throw new SarvamError(
      "Add SARVAM_API_KEY to .env.local and reload. The argument cannot start without it.",
      503,
    );
  }
  return key;
}

async function sarvam(path: string, init: { json?: unknown; body?: FormData }) {
  const headers = new Headers();
  headers.set("api-subscription-key", apiKey());
  let body: BodyInit | undefined = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  let response: Response;
  try {
    response = await fetch(`${SARVAM}${path}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new SarvamError("Sarvam did not pick up. Try the line again.", 504);
  }

  const text = await response.text();
  let data: Json = {};
  if (text) {
    try {
      data = JSON.parse(text) as Json;
    } catch {
      data = { message: text.slice(0, 180) };
    }
  }

  if (!response.ok) {
    throw new SarvamError(sarvamMessage(response.status, data), response.status);
  }
  return data;
}

function sarvamMessage(status: number, data: Json) {
  if (status === 403) {
    return "Sarvam refused that key. Paste a real SARVAM_API_KEY into .env.local and reload.";
  }
  if (status === 429) {
    return "Sarvam credits ran out mid-argument.";
  }
  const error = data.error;
  const nested =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const message = nested || (typeof data.message === "string" ? data.message : "");
  if (message) return `Sarvam: ${message.slice(0, 180)}`;
  return "Sarvam dropped the call. Try that line again.";
}

export async function transcribe(audio: Blob, language: LanguageCode) {
  const form = new FormData();
  form.append("file", audio, "turn.wav");
  form.append("model", "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", language);
  form.append(
    "keyterms",
    JSON.stringify(["Indiranagar", "Indira Nagar", "Anna", "rupaye", "sau", "dedh"]),
  );

  const data = await sarvam("/speech-to-text", { body: form });
  const transcript = String(data.transcript ?? "").trim();
  if (!transcript) {
    throw new SarvamError("Anna didn't hear that. Hold the button and actually argue.", 422);
  }
  return transcript;
}

export async function translateStreet(input: string, source: LanguageCode, target: LanguageCode) {
  const data = await sarvam("/translate", {
    json: {
      input,
      source_language_code: source,
      target_language_code: target,
      speaker_gender: "Male",
      mode: "modern-colloquial",
      model: "mayura:v1",
    },
  });
  const translated = String(data.translated_text ?? data.translatedText ?? "").trim();
  if (!translated) {
    throw new SarvamError("Mayura came back with nothing. Try the line again.", 502);
  }
  return translated;
}

export function cleanupLine(raw: string) {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  }
  const line = text
    .split(/\n+/)
    .map((part) => part.trim())
    .find((part) => part && !/^(note|explanation)\b/i.test(part));
  if (!line) return "";
  return line
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/^(kannada|hindi|translation|output)\s*:\s*/i, "")
    .trim()
    .slice(0, 600);
}

async function flavorTranslate(
  input: string,
  mode: Exclude<Mode, "street">,
  sourceName: string,
  targetName: string,
) {
  const data = await sarvam("/v1/chat/completions", {
    json: {
      model: "sarvam-105b-conversations",
      temperature: 0.85,
      max_tokens: 220,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: flavorPrompt(mode) },
        {
          role: "user",
          content: `Source language: ${sourceName}\nTarget language: ${targetName}\nLine:\n${input}`,
        },
      ],
    },
  });

  const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const message =
    choice && typeof choice === "object" && "message" in choice
      ? (choice as { message?: { content?: unknown } }).message
      : undefined;
  const content = message?.content;
  const raw = Array.isArray(content)
    ? content
        .map((part) =>
          typeof part === "string"
            ? part
            : part && typeof part === "object" && "text" in part
              ? String((part as { text: unknown }).text ?? "")
              : "",
        )
        .join("")
    : typeof content === "string"
      ? content
      : "";
  const line = cleanupLine(raw);
  if (!line) {
    throw new SarvamError("The joke came out blank. Try that line again.", 502);
  }
  return line;
}

export async function synthesize(options: {
  text: string;
  languageCode: LanguageCode;
  speaker: string;
  pace: number;
  temperature: number;
}) {
  const data = await sarvam("/text-to-speech", {
    json: {
      text: options.text,
      language_code: options.languageCode,
      speaker: options.speaker,
      model: "bulbul:v3",
      pace: options.pace,
      temperature: options.temperature,
      speech_sample_rate: 22050,
      output_audio_codec: "mp3",
    },
  });
  const audios = data.audios;
  const audio = Array.isArray(audios) ? audios[0] : undefined;
  if (typeof audio !== "string" || !audio) {
    throw new SarvamError("Sarvam returned no audio. Try that line again.", 502);
  }
  return audio;
}

export async function runTurn(audio: Blob, side: Side, mode: Mode) {
  const { source, target, sourceName, targetName } = languages(side);
  const sourceText = await transcribe(audio, source);
  const translatedText =
    mode === "street"
      ? await translateStreet(sourceText, source, target)
      : await flavorTranslate(sourceText, mode, sourceName, targetName);
  const voice = voiceFor(mode, side);
  const audioBase64 = await synthesize({
    text: translatedText,
    languageCode: target,
    ...voice,
  });
  return { sourceText, translatedText, audioBase64 };
}
