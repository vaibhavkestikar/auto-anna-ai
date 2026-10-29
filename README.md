# Auto Anna AI

Real-time Hindi to Kannada and Kannada to Hindi voice translator for bargaining with a Bengaluru auto driver. You speak. Anna hears the other language. Nobody types.

Auto Anna AI is a phone-first web app: a passenger talks in Hindi and the app speaks Kannada, then the driver talks in Kannada and the app speaks Hindi. Fares, place names, and a yes or no stay intact. Street, Panic, and Confidence only change how the line is delivered.

Built for a screen recording and as a giveaway followers can open in the browser. The [Sarvam](https://www.sarvam.ai) API key stays on the server.

Follow the build on Instagram: [@vaibhav.kestikar](https://instagram.com/vaibhav.kestikar).

## What you can do

- Hold **You** and speak Hindi. The app transcribes it and speaks the Kannada line out loud.
- Hold **Anna** and speak Kannada. The app answers in spoken Hindi.
- Switch modes without losing the destination, the amount, or whether the fare was accepted.
- Play the Indiranagar argument with no microphone. Four scripted lines, then the rejection card.
- Hear a refusal and get the full-screen line: the AI is translating the rejection in real time.

Each live turn shows what was said, the translation in Devanagari or Kannada, and plays the audio. Recordings are capped at 15 seconds. There is no account and no database.

## Translation modes

| Mode | What changes | What stays |
| --- | --- | --- |
| Street | Modern colloquial auto talk. This is the live-demo mode. | Fare, place, and yes or no. |
| Panic | Short, terrified sentences. Anna, and swalpa adjust maadi, when they still fit. | The same facts. |
| Confidence | Three Kannada words and CEO confidence. Kannada lines work in ಅಣ್ಣ, ಎಷ್ಟು, or ಸ್ವಲ್ಪ adjust ಮಾಡಿ, and English "one minute" when it is funny. Hindi lines sound like an uncle who thinks he already won. | The same facts. |

Street uses Sarvam Mayura in `modern-colloquial` mode. Panic and Confidence ask Sarvam's conversational model to translate and restyle in one line. A refusal in either language (`nahi`, `baralla`, `illa`, and close cousins) opens the rejection card after the audio.

## Demo lines

**Play the argument** speaks this exchange with text-to-speech, so a recording does not depend on the mic.

1. You, in Hindi: "Anna, Indiranagar chaloge? Sau rupaye de dunga!"
   AI, in Kannada: "ಅಣ್ಣ, ಇಂದಿರಾನಗರ ಹೋಗ್ತೀರಾ? ನೂರು ರೂಪಾಯಿ ಕೊಡ್ತೀನಿ!"
2. Anna, in Kannada: "ನೂರು ರೂಪಾಯಿಗೆ ಬರಲ್ಲ. ಎರಡು ನೂರು ಕೊಡಿ!"
   AI, in Hindi: "Bhaiya keh rahe hain, sau rupaye mein nahi aayenge. Do sau rupaye do!"
3. You, in Hindi: "Arey bhaiya, dedh sau le lo!"
   AI, in Kannada: "ಅರೇ ಅಣ್ಣ, ನೂರ ಐವತ್ತು ರೂಪಾಯಿ ತಗೊಳ್ಳಿ!"
4. Anna, in Kannada: "ಇಲ್ಲ!"
   AI, in Hindi: "Bhaiya keh rahe hain, nahi!"

## How a voice turn works

Sarvam's speech-to-text translate mode returns English, so Hindi and Kannada go through separate calls. The browser records 16 kHz mono WAV and posts it to this app. The API key never reaches the browser.

1. **Hear.** Saaras v4 transcribes `hi-IN` or `kn-IN` (`POST /speech-to-text`).
2. **Translate.** Street calls Mayura (`POST /translate`, `modern-colloquial`). Panic and Confidence call `sarvam-105b-conversations` (`POST /v1/chat/completions`) with a prompt that locks the fare, the place, and the refusal.
3. **Speak.** Bulbul v3 (`POST /text-to-speech`) returns MP3. The passenger's Kannada uses the `shubh` voice. Anna's Hindi uses `ratan`. Panic uses the dramatic `varun` voice at a faster pace. Confidence uses `shubh`, a little slower.

Scripted reel lines skip speech-to-text and translation. `POST /api/speak` only synthesizes the hardcoded text.

```
You (Hindi)  -->  /api/turn  -->  Kannada audio for Anna
Anna (Kannada)  -->  /api/turn  -->  Hindi audio for you
Play the argument  -->  /api/speak  -->  the four lines above
```

## Stack

- [Next.js](https://nextjs.org) App Router and React
- [Sarvam AI](https://docs.sarvam.ai): Saaras speech-to-text, Mayura translation, Bulbul text-to-speech, and Sarvam 105B for the funny modes
- [Vercel](https://vercel.com) for hosting
- No login, no database, one environment variable

## Run it locally

Requirements: Node.js 20 or newer, a microphone for live turns, and a Sarvam API key from the [Sarvam dashboard](https://dashboard.sarvam.ai).

```bash
npm install
```

Copy the example env file and paste your key:

```bash
cp .env.example .env.local
```

```
SARVAM_API_KEY=your_key_here
```

On Windows PowerShell, copy the file with `Copy-Item .env.example .env.local`, then edit `.env.local`. `.env.local` is gitignored. `.env.example` is the only env file that belongs in the repository.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow the microphone, hold a button, and speak. **Play the argument** works without a mic.

```bash
npm run build
npm run lint
```

## Deploy on Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel, or run `npx vercel`.
3. Set `SARVAM_API_KEY` in the Vercel project's environment variables. Use the same name as `.env.example`.
4. Deploy with `npx vercel --prod`, or let the Git integration deploy.

`/api/turn` and `/api/speak` set `maxDuration = 60` because a live turn can call Sarvam three times. A public URL spends the credits on that key. Anyone who can open the site can trigger a translation. Watch usage in the Sarvam dashboard, and rotate the key if the link spreads farther than you meant.

## Project layout

```
app/page.tsx            The page
app/api/turn/route.ts   Microphone turn: transcribe, translate, speak
app/api/speak/route.ts  Scripted text-to-speech for the demo lines
components/AutoStage.tsx  Hold-to-talk UI, modes, transcripts, rejection card
lib/sarvam.ts           Server client for the Sarvam API
lib/modes.ts            Street, Panic, and Confidence
lib/script.ts           The Indiranagar lines
lib/audio.ts            Browser WAV recording and MP3 playback
```

## Languages

| Speaker | You say | The app speaks |
| --- | --- | --- |
| Passenger | Hindi (`hi-IN`) | Kannada (`kn-IN`) |
| Auto driver | Kannada (`kn-IN`) | Hindi (`hi-IN`) |

Speech-to-text is biased toward bargain words such as Indiranagar and rupee amounts. Output is Kannada script or Devanagari, with a roman gloss on the scripted demo so a North Indian viewer can follow the Kannada.

## Privacy

Audio is sent to this app and then to Sarvam for that turn. It is not stored in a database here. Treat the hosted site like a public demo: do not record anything you would not say in an auto.
