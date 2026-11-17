import type { CSSProperties, ReactNode } from "react";
import SpotlightCard from "@components/reactbits/SpotlightCard";
import { useTheme } from "@lib/useTheme";

type Props = {
  children?: ReactNode;
  className?: string;
};

export default function SpotlightLink({ children, className }: Props) {
  const theme = useTheme();

  // Surface and border come from CSS (global.css) so the server-rendered card
  // already matches the theme before it hydrates.
  return (
    <SpotlightCard
      theme={theme}
      className={`!rounded-lg !p-0 ${className ?? ""}`}
      spotlightSize={220}
      intensity={0.2}
      borderGlow={0.8}
      proximity={60}
      style={
        {
          "--spotlight-card-surface": "var(--card-surface)",
          "--spotlight-card-border": "var(--card-border)",
          "--spotlight-card-shadow": "none",
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}
