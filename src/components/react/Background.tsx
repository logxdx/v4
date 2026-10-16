import { useEffect, useRef } from "react";
import ClickSpark, { type ClickSparkHandle } from "@components/reactbits/ClickSpark";
import DotField from "@components/reactbits/DotField";
import { useTheme, type Theme } from "@lib/useTheme";

// Warm neutrals sampled from the site's cream (#F2F0E5) and charcoal (#101010) surfaces.
const PALETTE = {
  dark: { low: "#3a3830", high: "#a8a397", ink: "#e8e5d8" },
  light: { low: "#cfcab8", high: "#6b675c", ink: "#1a1a1a" },
};

// ClickSpark only listens on its own element, so drive it from window clicks
// and keep the layer click-through above the page content.
function SparkLayer({ theme }: { theme: Theme }) {
  const ref = useRef<ClickSparkHandle>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) ref.current?.spark(event.clientX, event.clientY);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
      <ClickSpark ref={ref} sparkColor={PALETTE[theme].high} sparkSize={7} sparkRadius={14} sparkCount={8} sparkWidth={1} />
    </div>
  );
}

export default function Background() {
  const theme = useTheme();
  const palette = PALETTE[theme];

  return (
    <>
      {/* Dimmed and very lightly blurred so text on top stays legible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ opacity: theme === "dark" ? 0.55 : 0.6, filter: "blur(1.5px)" }}
      >
        <DotField
          lightMode={theme === "light"}
          dotSpacing={16}
          gradientFrom={palette.low}
          gradientTo={palette.high}
          glowColor={palette.ink}
          glowIntensity={0.5}
          baseOpacity={0.5}
          holdToZoom={false}
        />
      </div>
      <SparkLayer theme={theme} />
    </>
  );
}
