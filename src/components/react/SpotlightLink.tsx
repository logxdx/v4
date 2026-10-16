import type { CSSProperties, ReactNode } from "react";
import SpotlightCard from "@components/reactbits/SpotlightCard";
import { useTheme } from "@lib/useTheme";

type Props = {
  children?: ReactNode;
};

export default function SpotlightLink({ children }: Props) {
  const theme = useTheme();
  const dark = theme === "dark";

  return (
    <SpotlightCard
      theme={theme}
      className="!rounded-lg !p-0"
      spotlightSize={220}
      intensity={0.2}
      borderGlow={0.8}
      proximity={60}
      style={
        {
          "--spotlight-card-surface": dark ? "rgba(16, 16, 16, 0.6)" : "rgba(242, 240, 229, 0.7)",
          "--spotlight-card-border": dark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)",
          "--spotlight-card-shadow": "none",
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}
