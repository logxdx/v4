import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Theme } from "@lib/useTheme";

type Props = Record<string, unknown>;

export type BackgroundOption = {
  id: string;
  label: string;
  Component: LazyExoticComponent<ComponentType<Props>>;
  props: (theme: Theme) => Props;
  // Dims the whole layer so body text stays readable on top of it.
  opacity: { dark: number; light: number };
  // Fade the layer out towards the bottom of the viewport.
  fadeBottom?: boolean;
};

const load = (factory: () => Promise<{ default: unknown }>) =>
  lazy(factory as () => Promise<{ default: ComponentType<Props> }>);

// Warm neutrals sampled from the site's cream (#F2F0E5) and charcoal (#101010) surfaces,
// ordered from the page background towards the strongest ink.
export const PALETTE = {
  dark: { surface: "#101010", deep: "#1c1b18", low: "#3a3830", mid: "#6b675c", high: "#a8a397", ink: "#e8e5d8" },
  light: { surface: "#F2F0E5", deep: "#E2E0D4", low: "#cfcab8", mid: "#a39d8a", high: "#6b675c", ink: "#1a1a1a" },
};

export const BACKGROUNDS: BackgroundOption[] = [
  {
    id: "threads",
    label: "Threads",
    Component: load(() => import("@components/reactbits/Threads")),
    props: (theme) => ({
      className: "size-full",
      color: PALETTE[theme].high,
      opacity: 0.5,
      amplitude: 1.4,
      distance: 0.3,
      lineCount: 70,
      speed: 0.4,
      angle: -12,
      fade: 0.4,
    }),
    opacity: { dark: 0.8, light: 0.8 },
    fadeBottom: true,
  },
  {
    id: "dot-field",
    label: "Dot Field",
    Component: load(() => import("@components/reactbits/DotField")),
    props: (theme) => ({
      lightMode: theme === "light",
      dotSpacing: 16,
      gradientFrom: PALETTE[theme].low,
      gradientTo: PALETTE[theme].high,
      glowColor: PALETTE[theme].ink,
      glowIntensity: 0.5,
      baseOpacity: 0.5,
      holdToZoom: false,
    }),
    opacity: { dark: 0.55, light: 0.6 },
  },
  {
    id: "dot-grid",
    label: "Dot Grid",
    Component: load(() => import("@components/reactbits/DotGrid")),
    props: (theme) => ({
      dotSize: 4,
      gap: 22,
      baseColor: PALETTE[theme].low,
      activeColor: PALETTE[theme].high,
      glow: 0.3,
      fade: 0.3,
    }),
    opacity: { dark: 0.7, light: 0.7 },
  },
  {
    id: "ferrofluid",
    label: "Ferrofluid",
    Component: load(() => import("@components/reactbits/Ferrofluid")),
    props: (theme) => ({
      lightMode: theme === "light",
      colors: [PALETTE[theme].low, PALETTE[theme].mid, PALETTE[theme].high],
    }),
    opacity: { dark: 0.4, light: 0.35 },
  },
  {
    id: "flux-lines",
    label: "Flux Lines",
    Component: load(() => import("@components/reactbits/FluxLines")),
    props: (theme) => ({
      lightMode: theme === "light",
      colors: [PALETTE[theme].mid, PALETTE[theme].high, PALETTE[theme].ink],
      glow: 1.2,
    }),
    opacity: { dark: 0.3, light: 0.35 },
  },
  {
    id: "gradient-blinds",
    label: "Gradient Blinds",
    Component: load(() => import("@components/reactbits/GradientBlinds")),
    props: (theme) => ({
      lightMode: theme === "light",
      gradientColors: [PALETTE[theme].deep, PALETTE[theme].mid],
      lightColor: PALETTE[theme].ink,
      blindCount: 14,
      spotlightOpacity: 0.5,
      shine: 0.25,
    }),
    opacity: { dark: 0.35, light: 0.4 },
  },
  {
    id: "grainient",
    label: "Grainient",
    Component: load(() => import("@components/reactbits/Grainient")),
    props: (theme) => {
      const p = PALETTE[theme];
      return {
        lightMode: theme === "light",
        colors: [p.surface, p.deep, p.low, p.mid, p.high],
        grainAmount: 0.05,
        saturation: 0.6,
      };
    },
    opacity: { dark: 0.35, light: 0.35 },
  },
  {
    id: "liquid-chrome",
    label: "Liquid Chrome",
    Component: load(() => import("@components/reactbits/LiquidChrome")),
    props: (theme) => ({
      lightMode: theme === "light",
      color: PALETTE[theme].high,
      exposure: theme === "dark" ? 0.7 : 1,
    }),
    opacity: { dark: 0.22, light: 0.22 },
  },
  {
    id: "magnet-lines",
    label: "Magnet Lines",
    Component: load(() => import("@components/reactbits/MagnetLines")),
    props: (theme) => ({
      lineColor: PALETTE[theme].low,
      accentColor: PALETTE[theme].high,
      spacing: 36,
      lineHeight: 16,
      lineWidth: 2,
      edgeFade: 0.3,
    }),
    opacity: { dark: 0.8, light: 0.8 },
  },
  {
    id: "waves",
    label: "Waves",
    Component: load(() => import("@components/reactbits/Waves")),
    props: (theme) => ({
      lightMode: theme === "light",
      lineColor: PALETTE[theme].high,
      opacity: 0.35,
      fade: 0.3,
    }),
    opacity: { dark: 0.8, light: 0.8 },
  },
];

export const OFF = "off";
