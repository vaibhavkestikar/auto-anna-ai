"use client";

import { useEffect, useRef, useState } from "react";
import { playMp3Base64, startCapture, unlockAudio } from "@/lib/audio";
import { MODE_COPY, type Mode, type Side } from "@/lib/modes";
import { BEATS } from "@/lib/script";

type Phase = "idle" | "recording" | "working" | "playing";

type Card = {
  saidLabel: string;
  said: string;
  heardLabel: string;
  heard: string;
  saidRoman?: string | null;
  heardRoman?: string | null;
  mode?: Mode;
};

type Capture = { stop: () => Promise<Blob | null> };

export function AutoStage() {
  const [mode, setMode] = useState<Mode>("street");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bro, setBro] = useState(false);
  const [status, setStatus] = useState("");

  const modeRef = useRef(mode);
  const session = useRef<Capture | null>(null);
  const released = useRef(false);
  const sideRef = useRef<Side>("you");
  const busy = useRef(false);
  const capTimer = useRef<number | null>(null);
  const generation = useRef(0);
  const pressedAt = useRef(0);
  const releaseRef = useRef<() => void>(() => {});
  const disarm = useRef<(() => void) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return () => {
      released.current = true;
      disarm.current?.();
      if (capTimer.current) window.clearTimeout(capTimer.current);
      void session.current?.stop();
    };
  }, []);

  const blurb = MODE_COPY.find((item) => item.id === mode)?.blurb ?? "";
  const locked = phase === "working" || phase === "playing";

  function release() {
    released.current = true;
    if (session.current) void finish();
  }

  function armRelease() {
    disarm.current?.();
    const stop = (event: Event) => {
      const touchPointerCancelled =
        event.type === "pointercancel" &&
        "pointerType" in event &&
        (event as globalThis.PointerEvent).pointerType === "touch";
      const micJustOpened = event.type === "touchcancel" && performance.now() - pressedAt.current < 800;
      if (touchPointerCancelled || micJustOpened) return;
      releaseRef.current();
    };
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    window.addEventListener("touchend", stop, true);
    window.addEventListener("touchcancel", stop, true);
    disarm.current = () => {
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      window.removeEventListener("touchend", stop, true);
      window.removeEventListener("touchcancel", stop, true);
      disarm.current = null;
    };
  }

  releaseRef.current = release;

  async function begin(side: Side) {
    const now = performance.now();
    if ((session.current || phase === "recording") && now - pressedAt.current > 400) {
      release();
      return;
    }
    if (busy.current || phase !== "idle") return;
    pressedAt.current = now;
    released.current = false;
    unlockAudio();
    armRelease();
    busy.current = true;
    sideRef.current = side;
    generation.current += 1;
    setError(null);
    setBro(false);
    setActiveSide(side);
    setSeconds(0);
    setPhase("recording");
    setStatus("Meter's running. Release to send.");
    try {
      const cap = await startCapture(setSeconds);
      session.current = cap;
      if (released.current) {
        void finish();
        return;
      }
      capTimer.current = window.setTimeout(() => {
        void finish();
      }, 15_000);
    } catch (err) {
      disarm.current?.();
      busy.current = false;
      setPhase("idle");
      setActiveSide(null);
      setStatus("");
      setError(micMessage(err));
    }
  }

  async function finish() {
    const cap = session.current;
    if (!cap) return;
    session.current = null;
    disarm.current?.();
    if (capTimer.current) {
      window.clearTimeout(capTimer.current);
      capTimer.current = null;
    }
    const side = sideRef.current;
    const selected = modeRef.current;
    const ticket = generation.current;
    let blob: Blob | null = null;
    try {
      blob = await cap.stop();
    } catch (err) {
      busy.current = false;
      setPhase("idle");
      setActiveSide(null);
      setStatus("");
      setError(err instanceof Error ? err.message : "The recording broke. Try again.");
      return;
    }
    if (!blob) {
      busy.current = false;
      setPhase("idle");
      setActiveSide(null);
      setStatus("");
      setError("Too short. Hold the button and actually argue.");
      return;
    }

    setPhase("working");
    setStatus(workingLine(side, selected));
    try {
      const body = new FormData();
      body.append("audio", blob, audioFileName(blob));
      body.append("direction", side);
      body.append("mode", selected);
      const response = await fetch("/api/turn", { method: "POST", body });
      const data = await readBody(response);
      if (ticket !== generation.current) return;
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "The argument crashed.");
      }
      setCard({
        saidLabel: side === "you" ? "You, in Hindi" : "Anna, in Kannada",
        said: String(data.sourceText ?? ""),
        heardLabel: side === "you" ? "AI, in Kannada" : "AI, in Hindi",
        heard: String(data.translatedText ?? ""),
        mode: selected,
      });
      setPhase("playing");
      setStatus(side === "you" ? "Speaking Kannada to Anna..." : "Speaking Hindi to you...");
      await playMp3Base64(String(data.audioBase64 ?? ""));
      if (ticket !== generation.current) return;
      if (data.rejected) setBro(true);
      setPhase("idle");
      setActiveSide(null);
      setStatus("");
    } catch (err) {
      if (ticket !== generation.current) return;
      setPhase("idle");
      setActiveSide(null);
      setStatus("");
      setError(err instanceof Error ? err.message : "The argument crashed.");
    } finally {
      if (ticket === generation.current) busy.current = false;
    }
  }

  async function playArgument() {
    if (busy.current) return;
    unlockAudio();
    busy.current = true;
    const ticket = generation.current + 1;
    generation.current = ticket;
    setError(null);
    setBro(false);
    try {
      for (let index = 0; index < BEATS.length; index += 1) {
        const beat = BEATS[index];
        setPhase("working");
        setStatus(`Line ${index + 1} of ${BEATS.length}. Cueing the fare...`);
        setCard({
          saidLabel: beat.saidLabel,
          said: beat.said,
          saidRoman: beat.saidRoman,
          heardLabel: beat.heardLabel,
          heard: beat.heard,
          heardRoman: beat.heardRoman,
        });
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beatId: beat.id }),
        });
        const data = await readBody(response);
        if (ticket !== generation.current) return;
        if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "The argument crashed.");
      }
        setPhase("playing");
        setStatus(beat.side === "you" ? "AI is speaking Kannada..." : "AI is speaking Hindi...");
        await playMp3Base64(String(data.audioBase64 ?? ""));
        if (ticket !== generation.current) return;
        if (beat.showBro) {
          setBro(true);
          break;
        }
      }
      setPhase("idle");
      setStatus("");
    } catch (err) {
      if (ticket !== generation.current) return;
      setPhase("idle");
      setStatus("");
      setError(err instanceof Error ? err.message : "The argument crashed.");
    } finally {
      if (ticket === generation.current) busy.current = false;
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#14120e] text-[#f6f1e3] md:my-6 md:min-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-[2rem] md:border md:border-[#ffc107]/50 md:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <header className="bg-[#ffc107] px-5 py-3 text-[#14120e]">
        <p className="text-[11px] font-extrabold tracking-[0.18em]">
          DAY 1 · THE FARE ARGUMENT
        </p>
      </header>

      <div className="px-5 pt-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#ffc107]">
          Bengaluru · meter on
        </p>
        <h1 className="mt-1 text-[2.7rem] font-black leading-[0.9] tracking-tight">
          AUTO ANNA AI
        </h1>
        <p className="mt-2 text-lg text-[#f6f1e3]/75">Automating arguments.</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 px-5" role="group" aria-label="Translation mode">
        {MODE_COPY.map((item) => {
          const on = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              disabled={locked || phase === "recording"}
              onClick={() => setMode(item.id)}
              className={`rounded-2xl px-2 py-3 text-sm font-extrabold tracking-wide transition disabled:opacity-50 ${
                on
                  ? item.id === "panic"
                    ? "bg-[#ff5c33] text-[#1a0a06]"
                    : item.id === "confidence"
                      ? "bg-[#d6ff4a] text-[#14120e]"
                      : "bg-[#ffc107] text-[#14120e]"
                  : "bg-[#242218] text-[#f6f1e3]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="min-h-12 px-5 pt-3 text-sm leading-snug text-[#f6f1e3]/70">{blurb}</p>

      <section className="mx-5 mt-2 flex min-h-52 flex-1 flex-col justify-center rounded-3xl border border-white/10 bg-[#1c1a14] px-4 py-5">
        {error ? (
          <p className={`text-base font-semibold leading-snug text-[#ffb4a2] ${card ? "mb-4" : ""}`}>
            {error}
          </p>
        ) : null}
        {card ? (
          <div>
            {card.mode ? (
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ffc107]">
                {card.mode} mode
              </p>
            ) : null}
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ffc107]">
              {card.saidLabel}
            </p>
            <p className="mt-1 text-2xl font-semibold leading-snug">{card.said}</p>
            {card.saidRoman ? (
              <p className="mt-1 text-sm text-[#f6f1e3]/55">{card.saidRoman}</p>
            ) : null}
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#d6ff4a]">
              {card.heardLabel}
            </p>
            <p className="mt-1 text-2xl font-semibold leading-snug">{card.heard}</p>
            {card.heardRoman ? (
              <p className="mt-1 text-sm text-[#f6f1e3]/55">{card.heardRoman}</p>
            ) : null}
          </div>
        ) : error ? null : (
          <p className="text-lg font-medium leading-snug text-[#f6f1e3]/80">
            Hold a button. You speak Hindi. Anna speaks Kannada. The AI does the arguing.
          </p>
        )}
        {status ? <p className="mt-4 text-sm font-bold text-[#ffc107]">{status}</p> : null}
      </section>

      <div className="grid grid-cols-2 gap-3 px-5 pt-4">
        <HoldButton
          title="You"
          language="Hindi"
          hint="Hold to argue"
          tone="you"
          recording={phase === "recording" && activeSide === "you"}
          seconds={seconds}
          disabled={locked || (phase === "recording" && activeSide !== "you")}
          onPress={() => void begin("you")}
          onRelease={release}
        />
        <HoldButton
          title="Anna"
          language="Kannada"
          hint="Hold to reply"
          tone="anna"
          recording={phase === "recording" && activeSide === "anna"}
          seconds={seconds}
          disabled={locked || (phase === "recording" && activeSide !== "anna")}
          onPress={() => void begin("anna")}
          onRelease={release}
        />
      </div>

      <button
        type="button"
        onClick={() => void playArgument()}
        disabled={locked || phase === "recording"}
        className="mx-5 mt-3 rounded-full border border-[#ffc107] px-4 py-3 text-sm font-extrabold tracking-wide text-[#ffc107] disabled:opacity-40"
      >
        Play the argument
      </button>
      <p className="px-5 pt-2 text-center text-xs text-[#f6f1e3]/45">
        Exact reel lines. No mic. No mercy.
      </p>

      <footer className="mt-4 border-t border-dashed border-[#ffc107]/30 px-5 py-5">
        <p className="text-sm font-bold leading-snug">
          Day 1 verdict: Language barrier solved. Bargaining skills still missing.
        </p>
        <a
          className="mt-2 inline-block text-sm font-extrabold text-[#ffc107] underline decoration-[#ffc107]/40 underline-offset-4"
          href="https://instagram.com/vaibhav.kestikar"
          target="_blank"
          rel="noreferrer"
        >
          Follow @vaibhav.kestikar for Day 2.
        </a>
        <p className="mt-2 text-xs text-[#f6f1e3]/45">
          I have AI, a laptop, and absolutely no supervision.
        </p>
      </footer>

      {bro ? (
        <button
          type="button"
          className="slam fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#ffc107] px-8 text-center text-[#14120e]"
          onClick={() => setBro(false)}
        >
          <p className="text-7xl font-black tracking-tight sm:text-8xl">BRO.</p>
          <p className="mt-4 max-w-sm text-2xl font-extrabold leading-tight">
            THE AI IS TRANSLATING THE REJECTION IN REAL TIME.
          </p>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em]">Tap to continue</p>
        </button>
      ) : null}
    </div>
  );
}

function HoldButton({
  title,
  language,
  hint,
  tone,
  recording,
  seconds,
  disabled,
  onPress,
  onRelease,
}: {
  title: string;
  language: string;
  hint: string;
  tone: "you" | "anna";
  recording: boolean;
  seconds: number;
  disabled: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  const you = tone === "you";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pressRef = useRef(onPress);
  const releaseRef = useRef(onRelease);
  pressRef.current = onPress;
  releaseRef.current = onRelease;

  useEffect(() => {
    const node = buttonRef.current;
    if (!node) return;
    const start = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
      pressRef.current();
    };
    const end = () => releaseRef.current();
    node.addEventListener("touchstart", start, { passive: false });
    node.addEventListener("touchend", end);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchend", end);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      aria-label={recording ? `Recording ${language}. Release to send.` : `Hold to speak ${language}`}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") return;
        event.preventDefault();
        pressRef.current();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") return;
        releaseRef.current();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={`talk-btn touch-none flex min-h-28 select-none flex-col items-start justify-between rounded-3xl px-4 py-3 text-left disabled:opacity-40 ${
        recording ? "rec-pulse" : ""
      } ${
        you
          ? "bg-[#ffc107] text-[#14120e]"
          : "border border-[#ffc107] bg-transparent text-[#ffc107]"
      }`}
    >
      <span className="flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.16em]">
        {title}
        {recording ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff2d2d]" /> : null}
      </span>
      <span className="text-2xl font-black leading-none">{language}</span>
      <span className="text-xs font-bold opacity-70">
        {recording ? `Release · 0:${String(seconds).padStart(2, "0")}` : hint}
      </span>
    </button>
  );
}

function audioFileName(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes("mp4") || type.includes("m4a")) return "turn.m4a";
  if (type.includes("aac")) return "turn.aac";
  if (type.includes("ogg")) return "turn.ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "turn.mp3";
  if (type.includes("webm")) return "turn.webm";
  return "turn.wav";
}

function workingLine(side: Side, mode: Mode) {
  if (mode === "panic") return "Panicking in two languages...";
  if (mode === "confidence") return "Inflating confidence. Vocabulary unchanged.";
  if (side === "you") return "Turning your Hindi into Anna's problem...";
  return "Anna spoke. Preparing the damage in Hindi...";
}

function micMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Mic is blocked. Allow the microphone and hold the button again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The microphone missed the fare. Try again.";
}

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 180) };
  }
}
