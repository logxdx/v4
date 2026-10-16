import { useEffect, useRef } from "react";
import ClickSpark, { type ClickSparkHandle } from "@components/reactbits/ClickSpark";
import { useTheme } from "@lib/useTheme";

// Muted warm greys that sit between the site's cream (#F2F0E5) and charcoal (#101010).
const SPARK_COLOR = { dark: "#a8a397", light: "#6b675c" };

// ClickSpark only listens on its own element, so drive it from window clicks
// and keep the layer click-through above the page content.
export default function ClickSparkLayer() {
  const theme = useTheme();
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
      <ClickSpark ref={ref} sparkColor={SPARK_COLOR[theme]} sparkSize={7} sparkRadius={14} sparkCount={8} sparkWidth={1} />
    </div>
  );
}
