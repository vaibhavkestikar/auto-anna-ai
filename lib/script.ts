import type { LanguageCode } from "@/lib/modes";

export type Beat = {
  id: string;
  side: "you" | "anna";
  saidLabel: string;
  said: string;
  heardLabel: string;
  heard: string;
  saidRoman?: string;
  heardRoman?: string;
  ttsText: string;
  ttsLanguage: LanguageCode;
  speaker: "shubh" | "ratan";
  showBro: boolean;
};

export const BEATS: Beat[] = [
  {
    id: "offer",
    side: "you",
    saidLabel: "You, in Hindi",
    said: "Anna, Indiranagar chaloge? Sau rupaye de dunga!",
    heardLabel: "AI, in Kannada",
    heard: "ಅಣ್ಣ, ಇಂದಿರಾನಗರ ಹೋಗ್ತೀರಾ? ನೂರು ರೂಪಾಯಿ ಕೊಡ್ತೀನಿ!",
    heardRoman: "Anna, Indiranagar hogtira? Nooru rupaayi kodtini!",
    ttsText: "ಅಣ್ಣ, ಇಂದಿರಾನಗರ ಹೋಗ್ತೀರಾ? ನೂರು ರೂಪಾಯಿ ಕೊಡ್ತೀನಿ!",
    ttsLanguage: "kn-IN",
    speaker: "shubh",
    showBro: false,
  },
  {
    id: "counter",
    side: "anna",
    saidLabel: "Anna, in Kannada",
    said: "ನೂರು ರೂಪಾಯಿಗೆ ಬರಲ್ಲ. ಎರಡು ನೂರು ಕೊಡಿ!",
    saidRoman: "Nooru rupaayige baralla. Eradu nooru kodi!",
    heardLabel: "AI, in Hindi",
    heard: "Bhaiya keh rahe hain, sau rupaye mein nahi aayenge. Do sau rupaye do!",
    ttsText: "भैया कह रहे हैं, सौ रुपये में नहीं आएंगे। दो सौ रुपये दो!",
    ttsLanguage: "hi-IN",
    speaker: "ratan",
    showBro: false,
  },
  {
    id: "haggle",
    side: "you",
    saidLabel: "You, in Hindi",
    said: "Arey bhaiya, dedh sau le lo!",
    heardLabel: "AI, in Kannada",
    heard: "ಅರೇ ಅಣ್ಣ, ನೂರ ಐವತ್ತು ರೂಪಾಯಿ ತಗೊಳ್ಳಿ!",
    heardRoman: "Arey anna, nooru aivattu rupaayi tagolli!",
    ttsText: "ಅರೇ ಅಣ್ಣ, ನೂರ ಐವತ್ತು ರೂಪಾಯಿ ತಗೊಳ್ಳಿ!",
    ttsLanguage: "kn-IN",
    speaker: "shubh",
    showBro: false,
  },
  {
    id: "no",
    side: "anna",
    saidLabel: "Anna, in Kannada",
    said: "ಇಲ್ಲ!",
    saidRoman: "Illa!",
    heardLabel: "AI, in Hindi",
    heard: "Bhaiya keh rahe hain, nahi!",
    ttsText: "भैया कह रहे हैं, नहीं!",
    ttsLanguage: "hi-IN",
    speaker: "ratan",
    showBro: true,
  },
];

export function beatById(id: string) {
  return BEATS.find((beat) => beat.id === id);
}
