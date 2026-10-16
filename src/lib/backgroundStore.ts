import { useSyncExternalStore } from "react";

export type BackgroundSettings = {
  background: string;
  clickSpark: boolean;
  ribbons: boolean;
};

const STORAGE_KEY = "background";
const DEFAULTS: BackgroundSettings = { background: "threads", clickSpark: false, ribbons: false };

const listeners = new Set<() => void>();

const load = (): BackgroundSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
};

let current: BackgroundSettings | null = null;

const read = () => (current ??= load());

export function updateBackground(patch: Partial<BackgroundSettings>) {
  current = { ...read(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useBackground(): BackgroundSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
