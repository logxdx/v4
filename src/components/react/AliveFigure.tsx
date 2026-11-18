import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./AliveFigure.css";

// The profile card's line-drawn figure, alive: it breathes, blinks, follows the
// cursor with its eyes, waves when you come close, and every few seconds does
// something random (nods, tilts its head, hops, winks, hums, falls asleep...).
// All motion is CSS; this component only picks what happens next.

type Action =
  | "idle"
  | "look"
  | "wave"
  | "nod"
  | "tilt"
  | "hop"
  | "surprised"
  | "wink"
  | "love"
  | "hum"
  | "sleep";

const ACTIONS: { name: Action; weight: number; ms: number }[] = [
  { name: "look", weight: 5, ms: 1800 },
  { name: "wave", weight: 3, ms: 2700 },
  { name: "nod", weight: 2, ms: 1400 },
  { name: "tilt", weight: 2, ms: 2200 },
  { name: "hop", weight: 2, ms: 1200 },
  { name: "surprised", weight: 1, ms: 1500 },
  { name: "wink", weight: 2, ms: 1100 },
  { name: "love", weight: 1, ms: 2400 },
  { name: "hum", weight: 2, ms: 3200 },
];

const SLEEP_AFTER_MS = 25_000; // no pointer movement for this long → may doze off
const GREET_EVERY_MS = 20_000; // wave at most this often when the pointer comes close
const MAX_LOOK = 7; // how far the pupils move, in SVG units

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function pick(previous: Action): (typeof ACTIONS)[number] {
  const options = ACTIONS.filter((a) => a.name !== previous);
  let roll = Math.random() * options.reduce((sum, a) => sum + a.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[0];
}

type Props = {
  color: string;
  label?: string;
};

export default function AliveFigure({ color, label = "" }: Props) {
  const [action, setAction] = useState<Action>("idle");
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const actionRef = useRef<Action>("idle");
  const actionTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef(Date.now());
  const lastGreet = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let alive = true;
    let blinkTimer: number | undefined;
    let lookReset: number | undefined;
    let frame = 0;

    const set = (next: Action) => {
      actionRef.current = next;
      setAction(next);
    };

    const schedule = (delay: number) => {
      window.clearTimeout(actionTimer.current);
      actionTimer.current = window.setTimeout(nextAction, delay);
    };

    const perform = (name: Action, ms: number) => {
      set(name);
      if (name === "look" && Date.now() - lastPointer.current > 2000) {
        const angle = rand(0, Math.PI * 2);
        setLook({ x: Math.cos(angle) * MAX_LOOK, y: Math.sin(angle) * MAX_LOOK * 0.7 });
      }
      window.clearTimeout(actionTimer.current);
      actionTimer.current = window.setTimeout(() => {
        if (!alive) return;
        set("idle");
        if (Date.now() - lastPointer.current > 2000) setLook({ x: 0, y: 0 });
        schedule(rand(1500, 4000));
      }, ms);
    };

    function nextAction() {
      if (!alive) return;
      if (document.hidden) return schedule(2000);
      if (Date.now() - lastPointer.current > SLEEP_AFTER_MS && Math.random() < 0.5) {
        set("sleep"); // stays asleep until the pointer moves
        setLook({ x: 0, y: 0 });
        return;
      }
      const next = pick(actionRef.current);
      perform(next.name, next.ms);
    }

    const blinkLoop = () => {
      blinkTimer = window.setTimeout(() => {
        if (!alive) return;
        if (actionRef.current !== "sleep") {
          setBlink(true);
          window.setTimeout(() => setBlink(false), 130);
          if (Math.random() < 0.2) {
            window.setTimeout(() => setBlink(true), 260);
            window.setTimeout(() => setBlink(false), 390);
          }
        }
        blinkLoop();
      }, rand(2200, 6000));
    };

    const onPointer = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        lastPointer.current = Date.now();

        if (actionRef.current === "sleep") {
          perform("surprised", 1300); // woken up
          return;
        }

        const eyes = eyesRef.current?.getBoundingClientRect();
        if (eyes) {
          const dx = event.clientX - (eyes.left + eyes.width / 2);
          const dy = event.clientY - (eyes.top + eyes.height / 2);
          const dist = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, dist / 240) * MAX_LOOK;
          setLook({ x: (dx / dist) * reach, y: (dy / dist) * reach * 0.7 });
        }
        window.clearTimeout(lookReset);
        lookReset = window.setTimeout(() => setLook({ x: 0, y: 0 }), 2500);

        const box = svgRef.current?.getBoundingClientRect();
        const inside =
          box &&
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;
        const busy = !["idle", "look"].includes(actionRef.current);
        if (inside && !busy && Date.now() - lastGreet.current > GREET_EVERY_MS) {
          lastGreet.current = Date.now();
          perform("wave", 2700);
        }
      });
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    blinkLoop();
    schedule(rand(1200, 2500));

    return () => {
      alive = false;
      window.removeEventListener("pointermove", onPointer);
      window.clearTimeout(actionTimer.current);
      window.clearTimeout(blinkTimer);
      window.clearTimeout(lookReset);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const style = {
    color,
    "--lx": `${look.x}px`,
    "--ly": `${look.y}px`,
  } as CSSProperties;

  return (
    <svg
      ref={svgRef}
      className={`alive-fig is-${action}${blink ? " is-blink" : ""}`}
      style={style}
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <g className="af-all">
        <g className="af-body">
          {/* neck, collar, shoulders and torso */}
          <path d="M188 226l-4 40" />
          <path d="M212 226l4 40" />
          <path d="M170 268c18 16 42 16 60 0" />
          <path d="M98 500c2-128 40-220 72-232" />
          <path d="M230 268c28 8 52 44 62 92" />
          <path className="af-rest" d="M292 360c2 14 2 27 2 40" />
          <path d="M300 500c0-36-2-70-6-100" />

          {/* the waving arm comes up from below the frame */}
          <g className="af-arm">
            <g className="af-arm-wave">
              <path d="M292 360c22-34 34-70 36-102" />
              <ellipse cx="332" cy="232" rx="15" ry="20" transform="rotate(14 332 232)" />
            </g>
            <g className="af-motion" strokeWidth={5}>
              <path d="M368 188c10 12 12 28 4 42" />
              <path d="M384 176c14 18 16 42 4 62" />
            </g>
          </g>

          <g className="af-head">
            <circle cx="200" cy="170" r="58" />
            <path d="M176 116c10-14 30-18 44-8" />
            <g className="af-face">
              <g className="af-eyes" ref={eyesRef}>
                <g className="af-eye af-eye-l">
                  <circle className="af-pupil" cx="182" cy="166" r="7" fill="currentColor" stroke="none" />
                </g>
                <g className="af-eye af-eye-r">
                  <circle className="af-pupil" cx="218" cy="166" r="7" fill="currentColor" stroke="none" />
                </g>
              </g>
              <g className="af-happy-eyes">
                <path d="M170 168c6-9 18-9 24 0" />
                <path d="M206 168c6-9 18-9 24 0" />
              </g>
              <path className="af-mouth af-mouth-smile" d="M176 192c12 18 36 18 48 0" />
              <path className="af-mouth af-mouth-grin" d="M174 190c14 26 38 26 52 0z" />
              <circle className="af-mouth af-mouth-o" cx="200" cy="200" r="8" />
              <circle className="af-mouth af-mouth-hum" cx="207" cy="198" r="5" />
            </g>
          </g>
        </g>

        {/* little extras that pop up during some actions */}
        <g fill="currentColor" stroke="none" className="af-extras">
          <text className="af-bang" x="268" y="112">!</text>
          <text className="af-q" x="266" y="112">?</text>
          <path
            className="af-heart"
            d="M268 126c-14-10-22-18-22-27 0-6 5-11 11-11 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 11 0 9-8 17-22 27z"
          />
          <text className="af-z af-z1" x="252" y="118">z</text>
          <text className="af-z af-z2" x="270" y="96">z</text>
          <text className="af-z af-z3" x="290" y="74">Z</text>
          <text className="af-note af-note1" x="246" y="200">♪</text>
          <text className="af-note af-note2" x="262" y="186">♫</text>
        </g>
      </g>
    </svg>
  );
}
