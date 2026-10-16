import type { ReactNode } from "react";
import GlassSurface from "@components/reactbits/GlassSurface";

type Props = {
  children?: ReactNode;
};

// Liquid-glass pill for the top bar. The glass tints itself with CSS light-dark(),
// which follows the color-scheme set on <html> by the theme toggle.
export default function GlassBar({ children }: Props) {
  return (
    <GlassSurface
      width="100%"
      height={52}
      borderRadius={26}
      brightness={50}
      opacity={0.93}
      blur={10}
      // Blur what scrolls underneath and tint lightly so the nav stays readable over text.
      displace={3}
      backgroundOpacity={0.3}
      saturation={1.4}
      distortionScale={-120}
      // Small channel offsets: a hint of edge dispersion without rainbow fringing.
      redOffset={0}
      greenOffset={3}
      blueOffset={6}
    >
      <div className="flex w-full items-center justify-between gap-3 px-4 text-sm sm:gap-4 sm:px-5 sm:text-base">
        {children}
      </div>
    </GlassSurface>
  );
}
