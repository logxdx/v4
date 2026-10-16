import { Suspense, lazy, useEffect, useRef } from "react";
import type { ClickSparkHandle } from "@components/reactbits/ClickSpark";
import { useBackground } from "@lib/backgroundStore";
import { useTheme, type Theme } from "@lib/useTheme";
import { BACKGROUNDS, PALETTE } from "./backgrounds";

// A very light blur softens the backgrounds' fine detail so text on top stays legible.
const BLUR = "blur(1.5px)";

const ClickSpark = lazy(() => import("@components/reactbits/ClickSpark"));
const Ribbons = lazy(() => import("@components/reactbits/Ribbons"));

const FADE_BOTTOM = "[mask-image:linear-gradient(to_bottom,black_0%,black_45%,transparent_95%)]";

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
      <ClickSpark
        ref={ref}
        sparkColor={PALETTE[theme].ink}
        sparkSize={12}
        sparkRadius={22}
        sparkCount={10}
      />
    </div>
  );
}

export default function Background() {
  const theme = useTheme();
  const { background, clickSpark, ribbons } = useBackground();
  const option = BACKGROUNDS.find((item) => item.id === background);

  return (
    <>
      {option && (
        <div
          key={option.id}
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 -z-10 ${option.fadeBottom ? FADE_BOTTOM : ""}`}
          style={{ opacity: option.opacity[theme], filter: BLUR }}
        >
          <Suspense fallback={null}>
            <option.Component {...option.props(theme)} />
          </Suspense>
        </div>
      )}
      {ribbons && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55]">
          <Suspense fallback={null}>
            <Ribbons
              thickness={18}
              colors={[PALETTE[theme].ink, PALETTE[theme].high, PALETTE[theme].mid]}
              opacity={0.5}
            />
          </Suspense>
        </div>
      )}
      {clickSpark && (
        <Suspense fallback={null}>
          <SparkLayer theme={theme} />
        </Suspense>
      )}
    </>
  );
}
