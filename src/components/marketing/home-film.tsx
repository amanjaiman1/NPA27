"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Play, RotateCcw, VolumeX } from "lucide-react";
import { FILM } from "@/lib/film";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   THE FILM THAT OPENS THE HOME PAGE

   On a computer it starts by itself, once the page has finished loading and
   the browser is idle, first with sound. Browsers only let sound start on
   its own once a visitor has interacted with a site (Chrome, Safari and
   Firefox all enforce this), so when the browser refuses, the film plays
   muted with captions and shows "Turn sound on". The visitor's first tap,
   click or key press anywhere on the page turns the sound on too, while the
   film is on screen. Muting it is remembered on this device.

   - Nothing downloads before the film plays, and on a computer it waits for
     the page: the cover is the page's largest picture, so the page is
     complete before a byte of the film arrives.
   - Phones, and people who ask for less motion or for data saving or who are
     on a slow connection, get the cover and a play button: the film is about
     8 MB, a lot of a phone's data for something not asked for.
   - Phones get the 720p file (about 8 MB rather than 17 MB).
   - It pauses when scrolled out of view or when the tab is in the
     background, and carries on when it's back.
   - At the end the cover returns with a real call to action, in the spot
     the film's own end card leaves for it.
   ════════════════════════════════════════════════════════════════ */

const SOUND_KEY = "doordie-film-sound";

/** cover: the still, with a play button once we know it won't start by itself. */
type Phase = "cover" | "starting" | "playing" | "ended";

/** refused: the browser said no (sound without a gesture, Low Power Mode). aborted: we paused it before it began. */
type PlayResult = "ok" | "refused" | "aborted";

type UserActivation = { isActive: boolean };

function soundWasTurnedOff(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "off";
  } catch {
    return false;
  }
}

function rememberSound(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(SOUND_KEY);
    else window.localStorage.setItem(SOUND_KEY, "off");
  } catch {
    // Storage is blocked; the choice lasts for this visit.
  }
}

export function HomeFilm({ cta }: { cta: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  /** The muted state this component last set, so `volumechange` can tell the visitor's changes from ours. */
  const ourMuted = useRef(true);
  const onScreen = useRef(true);
  /** Paused because it went off screen or the tab went to the background, not by the visitor. */
  const pausedByUs = useRef(false);
  /** Arrived with the film out of sight (a link further down, a background tab): start when it's seen. */
  const startWhenSeen = useRef(false);
  const [phase, setPhase] = useState<Phase>("cover");
  const [offerPlay, setOfferPlay] = useState(false);
  const [askSound, setAskSound] = useState(false);
  /** Captions drawn by the page while the film is silent (see `setMuted`). */
  const [captionsOn, setCaptionsOn] = useState(false);
  const [caption, setCaption] = useState("");

  /**
   * Captions while it's silent; the narration carries it once the sound is on.
   * The page draws them itself, in a box of fixed size: the browser's own
   * caption box resizes with every line, and each change counted as a layout
   * shift (about 0.06 each, 0.12 over a pair of short lines, past the 0.1 a
   * page should stay under). The track stays "hidden" so its cues still fire.
   */
  function setMuted(v: HTMLVideoElement, muted: boolean) {
    ourMuted.current = muted;
    v.muted = muted;
    const track = v.textTracks[0];
    if (track) track.mode = "hidden";
    setCaptionsOn(muted);
  }

  async function tryPlay(withSound: boolean): Promise<PlayResult> {
    const v = video.current;
    if (!v) return "refused";
    setMuted(v, !withSound);
    try {
      await v.play();
      return "ok";
    } catch (e) {
      return e instanceof DOMException && e.name === "AbortError" ? "aborted" : "refused";
    }
  }

  /** With sound when wanted and allowed; muted, offering the sound, when the browser won't have it. */
  async function play(wantSound: boolean) {
    if (wantSound) {
      const r = await tryPlay(true);
      if (r !== "refused") return; // playing, or paused by us before it began (it resumes from here)
    }
    const r = await tryPlay(false);
    if (r === "ok" && wantSound) setAskSound(true);
    if (r === "refused") {
      // Even silent playback was refused (Low Power Mode on an iPhone, for one).
      setPhase("cover");
      setOfferPlay(true);
    }
  }

  function begin() {
    const v = video.current;
    if (!v) return;
    setPhase("starting");
    v.preload = "auto";
    void play(!soundWasTurnedOff());
  }

  function soundOn() {
    const v = video.current;
    if (!v) return;
    setMuted(v, false);
    rememberSound(true);
    // Early on, start again so the opening lines are heard.
    if (v.currentTime < 10) v.currentTime = 0;
    void v.play().catch(() => {});
    setAskSound(false);
  }

  function watchAgain() {
    const v = video.current;
    if (!v) return;
    v.currentTime = 0;
    setPhase("starting");
    void play(!soundWasTurnedOff());
  }

  // Start on arrival: on a computer by itself once the page has loaded; on a
  // phone, with less motion, data saving or a slow connection, when asked.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const small = window.matchMedia("(max-width: 767px)").matches;
    if (small) v.src = FILM.srcSmall;
    const lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } }).connection;
    const saveData = conn?.saveData === true;
    const slow = Boolean(conn && (/2g|3g/.test(conn.effectiveType ?? "") || (typeof conn.downlink === "number" && conn.downlink > 0 && conn.downlink < 2)));
    // An 8 MB film is a lot of a phone's data and of a slow connection: the
    // cover, with the button, and the film only for those who press it.
    if (small || lessMotion || saveData || slow) {
      setOfferPlay(true);
      return;
    }
    // On a computer it still starts by itself, but after the page itself has
    // loaded and the browser is idle, so the film never competes with the text,
    // the pictures and the code the page needs.
    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      const r = frame.current?.getBoundingClientRect();
      const outOfView = r && (r.bottom < window.innerHeight * 0.3 || r.top > window.innerHeight * 0.7);
      if (outOfView || document.visibilityState !== "visible") {
        startWhenSeen.current = true;
        return;
      }
      begin();
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const afterLoad = () => (idle ? idle(go, { timeout: 2_000 }) : window.setTimeout(go, 300));
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", afterLoad);
    };
    // begin() only reads refs and setters; deciding once on arrival is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the player: playing, finished, and mute changes made with its own controls.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onPlaying = () => setPhase("playing");
    const onEnded = () => {
      setPhase("ended");
      setAskSound(false);
    };
    const onVolume = () => {
      if (v.muted === ourMuted.current) return;
      ourMuted.current = v.muted;
      rememberSound(!v.muted);
      if (!v.muted) setAskSound(false);
      const track = v.textTracks[0];
      if (track && track.mode !== "showing") track.mode = "hidden";
      setCaptionsOn(v.muted && track?.mode === "hidden");
    };
    const track = v.textTracks[0];
    // The cue on screen now, for the page's own caption box.
    const onCue = () => {
      const cues = track?.activeCues;
      const lines: string[] = [];
      for (let i = 0; cues && i < cues.length; i++) lines.push((cues[i] as VTTCue).text);
      setCaption(lines.join("\n"));
    };
    // Captions switched with the player's own controls: the browser draws them, and the page stops.
    const onTracks = () => {
      if (track && track.mode !== "hidden") setCaptionsOn(false);
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    v.addEventListener("volumechange", onVolume);
    track?.addEventListener("cuechange", onCue);
    v.textTracks.addEventListener?.("change", onTracks);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("volumechange", onVolume);
      track?.removeEventListener("cuechange", onCue);
      v.textTracks.removeEventListener?.("change", onTracks);
    };
  }, []);

  // Pause when it's scrolled out of view or the tab is in the background; carry on when it's back.
  useEffect(() => {
    const v = video.current;
    const el = frame.current;
    if (!v || !el) return;
    const settle = () => {
      const seen = onScreen.current && document.visibilityState === "visible";
      if (seen && startWhenSeen.current) {
        startWhenSeen.current = false;
        begin();
      } else if (!seen && !v.paused && !v.ended) {
        pausedByUs.current = true;
        v.pause();
      } else if (seen && pausedByUs.current) {
        pausedByUs.current = false;
        void play(!ourMuted.current);
      }
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              onScreen.current = entry.intersectionRatio >= 0.3;
              settle();
            },
            { threshold: [0, 0.3, 0.6] },
          );
    io?.observe(el);
    document.addEventListener("visibilitychange", settle);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While it's muted only because the browser required it, the first tap, click or key press elsewhere turns the sound on.
  useEffect(() => {
    if (!askSound) return;
    const onGesture = (e: Event) => {
      const v = video.current;
      if (!v || !v.muted) return; // already on: the second event of the same tap
      const target = e.target instanceof Element ? e.target : null;
      if (target && frame.current?.contains(target)) return; // the film's own controls handle taps on it
      if (target?.closest("a[href]")) return; // leaving the page, or jumping further down it
      if (!onScreen.current || v.paused || v.ended) return;
      // Only a gesture the browser counts (not the end of a scroll, not Escape), so the attempt can't fail and stutter.
      const activation = (navigator as Navigator & { userActivation?: UserActivation }).userActivation;
      if (activation && !activation.isActive) return;
      setMuted(v, false);
      // A browser that still says no pauses the video instead; go back to silent playback.
      window.setTimeout(() => {
        if (v.paused && !v.ended) {
          setMuted(v, true);
          void v.play().catch(() => {});
        } else {
          setAskSound(false);
        }
      }, 0);
    };
    // pointerup for mouse, pen and touch; touchend for iOS Safari, where it is what counts as the tap.
    const kinds = ["pointerup", "touchend", "keydown"] as const;
    const opts = { capture: true, passive: true };
    for (const k of kinds) document.addEventListener(k, onGesture, opts);
    return () => {
      for (const k of kinds) document.removeEventListener(k, onGesture, opts);
    };
  }, [askSound]);

  const covered = phase !== "playing";

  return (
    <section aria-label="DoOrDie in under a minute" className="relative bg-black text-white">
      {/* The frame fits the first screen: width up to what the height allows, under the 4rem header and the note. */}
      <div ref={frame} className="relative mx-auto aspect-video w-full max-w-[calc((100svh_-_6.5rem)_*_16_/_9)]">
        <video
          ref={video}
          controls
          playsInline
          muted
          preload="none"
          width={1920}
          height={1080}
          aria-label={`DoOrDie, a UPSC preparation tracker, in a ${FILM.seconds}-second film`}
          className="absolute inset-0 h-full w-full bg-black"
        >
          <source src={FILM.src} type="video/mp4" />
          <track kind="captions" src={FILM.captions} srcLang="en" label="English" default />
        </video>

        {/* The cover: the film's end card. It dissolves into the film's opening and returns at the end. */}
        <div
          aria-hidden
          className={cn(
            "film-cover pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out",
            covered ? "opacity-100" : "opacity-0",
          )}
        >
          <Image src={FILM.poster} alt="" fill priority sizes="(min-width: 1800px) 1800px, 100vw" className="object-cover" />
        </div>

        {/* The captions, in a box that never moves or changes size: only its text changes. */}
        {captionsOn && phase === "playing" && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-[6%] bottom-[14%] flex h-[3.4em] items-end justify-center whitespace-pre-line text-center text-[clamp(0.8rem,2.2vw,1.35rem)] font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.95),0_0_2px_rgb(0_0_0/0.95)]"
          >
            {caption}
          </p>
        )}

        {/* Buttons on the cover sit where the film's own end card has its call to action: centred at 81% of the height, below "Plan. Track. Analyze. Improve." */}
        {offerPlay && phase === "cover" && (
          <div className="absolute inset-x-0 top-[81%] flex -translate-y-1/2 justify-center px-4">
            <button
              type="button"
              onClick={() => {
                setOfferPlay(false);
                begin();
              }}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-4 text-xs font-semibold text-white ring-1 ring-white/40 backdrop-blur-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-12 sm:px-6 sm:text-sm"
            >
              <Play className="h-4 w-4 fill-white" aria-hidden />
              Watch the film · {FILM.seconds} s
            </button>
          </div>
        )}

        {askSound && phase === "playing" && (
          <>
            {/* Anywhere on the picture turns the sound on; the player's controls stay below it. */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-[80%] cursor-pointer" onClick={soundOn} />
            <button
              type="button"
              onClick={soundOn}
              className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5 sm:top-5 sm:px-4 sm:text-sm"
            >
              <VolumeX className="h-4 w-4" aria-hidden />
              Turn sound on
            </button>
          </>
        )}

        {phase === "ended" && (
          <div className="absolute inset-x-0 top-[81%] flex -translate-y-1/2 items-center justify-center gap-2 px-3 sm:gap-3 sm:px-4">
            {cta}
            <button
              type="button"
              onClick={watchAgain}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold text-white ring-1 ring-white/35 backdrop-blur-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-12 sm:gap-2 sm:px-6 sm:text-sm"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Watch again
            </button>
          </div>
        )}
      </div>
      <p className="px-5 py-3 text-center text-[0.7rem] text-white/60 sm:text-xs">
        Every screen is the real app, filmed with a sample account and made-up data.
      </p>
      {/* Without JavaScript the player's own controls are the way in. */}
      <noscript>
        <style>{".film-cover{display:none}"}</style>
      </noscript>
    </section>
  );
}
