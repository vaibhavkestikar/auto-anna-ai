export type Mode = "street" | "panic" | "confidence";
export type Side = "you" | "anna";
export type LanguageCode = "hi-IN" | "kn-IN";

export const MODE_COPY: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "street",
    label: "Street",
    blurb: "Colloquial auto talk. The fare stays honest. The tone does not.",
  },
  {
    id: "panic",
    label: "Panic",
    blurb: "Brain in airplane mode. Mouth still saying swalpa adjust maadi.",
  },
  {
    id: "confidence",
    label: "Confidence",
    blurb: "Three Kannada words. CEO energy. Anna is still not impressed.",
  },
];

const REJECTION =
  /नहीं|नही|ಇಲ್ಲ|ಬರಲ್ಲ|ಬೇಡ|ಆಗಲ್ಲ|\bnahi(?:n|m)?\b|\bnaahi\b|\bbaralla\b|\billa\b|\bbeda\b/i;

export function isRejection(...texts: string[]) {
  return texts.some((text) => REJECTION.test(text));
}

export function languages(side: Side): {
  source: LanguageCode;
  target: LanguageCode;
  sourceName: string;
  targetName: string;
} {
  if (side === "you") {
    return {
      source: "hi-IN",
      target: "kn-IN",
      sourceName: "Hindi",
      targetName: "Kannada",
    };
  }
  return {
    source: "kn-IN",
    target: "hi-IN",
    sourceName: "Kannada",
    targetName: "Hindi",
  };
}

export function voiceFor(mode: Mode, side: Side) {
  if (mode === "panic") {
    return { speaker: "varun", pace: 1.18, temperature: 0.85 };
  }
  if (mode === "confidence") {
    return { speaker: "shubh", pace: 0.88, temperature: 0.42 };
  }
  return {
    speaker: side === "you" ? "shubh" : "ratan",
    pace: 1,
    temperature: 0.6,
  };
}

export function flavorPrompt(mode: Exclude<Mode, "street">) {
  if (mode === "panic") {
    return [
      "You are Auto Anna AI, a terrified interpreter stuck in a Bengaluru auto argument.",
      "Translate the line into the target language.",
      "Rules:",
      "- Preserve the destination, the exact fare, and whether this is a yes, a counter-offer, or a refusal. Never change numbers.",
      "- Write ONE speakable line only. No labels, quotes, notes, or stage directions.",
      '- Sound panicked. Short sentences. Use "Anna" and "swalpa adjust maadi" when they still fit. Please-do-not-leave energy.',
      "- Kannada must be Kannada script. Hindi must be Devanagari.",
      "- If they refused, the refusal has to be obvious in the target language.",
    ].join("\n");
  }

  return [
    "You are Auto Anna AI, interpreting an auto bargain for someone whose Kannada vocabulary is three words and whose confidence is CEO-level.",
    "Translate the line into the target language.",
    "Rules:",
    "- Preserve the destination, the exact fare, and whether this is a yes, a counter-offer, or a refusal. Never change numbers.",
    "- Write ONE speakable line only. No labels, quotes, notes, or stage directions.",
    "- Sound wildly sure of yourself.",
    "- If the target is Kannada, include at least one of these, even if the grammar is unhinged: ಅಣ್ಣ, ಎಷ್ಟು, ಸ್ವಲ್ಪ adjust ಮಾಡಿ. English \"one minute\" is welcome when it is funny. The fare and place must still be understandable.",
    "- If the target is Hindi, sound like an overconfident uncle who thinks he already won. Devanagari only.",
    "- Kannada must be Kannada script. Hindi must be Devanagari.",
  ].join("\n");
}
