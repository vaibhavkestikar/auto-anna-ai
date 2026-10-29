import { isRejection, type Mode, type Side } from "@/lib/modes";
import { runTurn, SarvamError } from "@/lib/sarvam";

export const maxDuration = 60;

const SIDES = new Set<Side>(["you", "anna"]);
const MODES = new Set<Mode>(["street", "panic", "confidence"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const direction = form.get("direction");
    const mode = form.get("mode");

    if (!(audio instanceof Blob)) {
      return Response.json({ error: "No audio. Hold the button and argue." }, { status: 400 });
    }
    if (audio.size < 1000) {
      return Response.json(
        { error: "Too short. Hold the button and actually argue." },
        { status: 400 },
      );
    }
    if (audio.size > 4_000_000) {
      return Response.json(
        { error: "That take was too long. Fifteen seconds is the meter limit." },
        { status: 400 },
      );
    }
    if (typeof direction !== "string" || !SIDES.has(direction as Side)) {
      return Response.json({ error: "Pick You or Anna before you argue." }, { status: 400 });
    }
    if (typeof mode !== "string" || !MODES.has(mode as Mode)) {
      return Response.json({ error: "Pick Street, Panic, or Confidence." }, { status: 400 });
    }

    const side = direction as Side;
    const selected = mode as Mode;
    const turn = await runTurn(audio, side, selected);
    return Response.json({
      ...turn,
      mimeType: "audio/mpeg",
      rejected: isRejection(turn.sourceText, turn.translatedText),
      side,
      mode: selected,
    });
  } catch (error) {
    const status = error instanceof SarvamError ? error.status : 500;
    const message = error instanceof Error ? error.message : "The argument crashed.";
    return Response.json({ error: message }, { status });
  }
}
