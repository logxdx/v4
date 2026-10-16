import { useEffect, useId, useRef, useState } from "react";
import { updateBackground, useBackground, type BackgroundSettings } from "@lib/backgroundStore";
import { BACKGROUNDS, OFF } from "./backgrounds";

const OPTIONS = [...BACKGROUNDS.map(({ id, label }) => ({ id, label })), { id: OFF, label: "Off" }];

const EFFECTS: { key: "clickSpark" | "ribbons"; label: string }[] = [
  { key: "clickSpark", label: "Click Spark" },
  { key: "ribbons", label: "Ribbons" },
];

const ROW =
  "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white";

export default function BackgroundSwitcher() {
  const settings = useBackground();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (key: keyof Pick<BackgroundSettings, "clickSpark" | "ribbons">) =>
    updateBackground({ [key]: !settings[key] });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Change background"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="group size-8 flex items-center justify-center rounded-full"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-hover:stroke-black group-hover:dark:stroke-white transition-colors duration-300 ease-in-out"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute bottom-full right-0 z-[70] mb-2 w-52 rounded-lg border border-black/15 bg-[#F2F0E5]/95 p-1.5 text-sm shadow-lg backdrop-blur-sm dark:border-white/20 dark:bg-[#101010]/95"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-xs uppercase tracking-wider opacity-60">Background</div>
          <div role="radiogroup" aria-label="Background">
            {OPTIONS.map((option) => {
              const active = settings.background === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => updateBackground({ background: option.id })}
                  className={`${ROW} ${active ? "text-black dark:text-white" : ""}`}
                >
                  {option.label}
                  {active && <span aria-hidden="true">•</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 border-t border-black/10 px-2.5 pb-1 pt-2.5 text-xs uppercase tracking-wider opacity-60 dark:border-white/10">
            Cursor effects
          </div>
          {EFFECTS.map((effect) => (
            <button
              key={effect.key}
              type="button"
              role="switch"
              aria-checked={settings[effect.key]}
              onClick={() => toggle(effect.key)}
              className={`${ROW} ${settings[effect.key] ? "text-black dark:text-white" : ""}`}
            >
              {effect.label}
              <span
                aria-hidden="true"
                className={`relative h-4 w-7 rounded-full transition-colors duration-150 ${
                  settings[effect.key] ? "bg-black/70 dark:bg-white/80" : "bg-black/15 dark:bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-3 rounded-full bg-[#F2F0E5] transition-transform duration-150 dark:bg-[#101010] ${
                    settings[effect.key] ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
