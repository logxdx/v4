import Threads from "@components/reactbits/Threads";
import { useTheme } from "@lib/useTheme";

export default function Background() {
  const dark = useTheme() === "dark";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_0%,black_45%,transparent_95%)]"
    >
      <Threads
        className="size-full"
        color={dark ? "#ffffff" : "#1a1a1a"}
        opacity={dark ? 0.35 : 0.3}
        amplitude={1.4}
        distance={0.3}
        lineCount={70}
        speed={0.4}
        angle={-12}
        fade={0.4}
      />
    </div>
  );
}
