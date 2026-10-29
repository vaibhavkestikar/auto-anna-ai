import { beatById } from "@/lib/script";
import { SarvamError, synthesize } from "@/lib/sarvam";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    let body: { beatId?: unknown };
    try {
      body = (await request.json()) as { beatId?: unknown };
    } catch {
      return Response.json({ error: "That request was not an argument." }, { status: 400 });
    }
    const beat = typeof body.beatId === "string" ? beatById(body.beatId) : undefined;
    if (!beat) {
      return Response.json({ error: "That line is not in the argument." }, { status: 400 });
    }

    const audioBase64 = await synthesize({
      text: beat.ttsText,
      languageCode: beat.ttsLanguage,
      speaker: beat.speaker,
      pace: 1,
      temperature: 0.6,
    });

    return Response.json({
      id: beat.id,
      saidLabel: beat.saidLabel,
      said: beat.said,
      heardLabel: beat.heardLabel,
      heard: beat.heard,
      saidRoman: beat.saidRoman ?? null,
      heardRoman: beat.heardRoman ?? null,
      audioBase64,
      mimeType: "audio/mpeg",
      showBro: beat.showBro,
    });
  } catch (error) {
    const status = error instanceof SarvamError ? error.status : 500;
    const message = error instanceof Error ? error.message : "The argument crashed.";
    return Response.json({ error: message }, { status });
  }
}
