import StrokeText from "@components/reactbits/StrokeText";
import { useTheme } from "@lib/useTheme";

type Props = {
  text: string;
  fontSize: number;
  fontWeight?: number;
  delay?: number;
  // "mount" draws on load; "scroll" waits until the text scrolls into view.
  trigger?: "mount" | "scroll";
  className?: string;
};

export default function StrokeHeading({
  text,
  fontSize,
  fontWeight = 600,
  delay = 0,
  trigger = "mount",
  className = "",
}: Props) {
  const dark = useTheme() === "dark";

  return (
    <StrokeText
      text={text}
      fontSize={fontSize}
      fontWeight={fontWeight}
      letterSpacing={-0.5}
      strokeWidth={1}
      strokeColor={dark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.55)"}
      fillColor={dark ? "#ffffff" : "#000000"}
      drawDuration={1.4}
      fillDelay={0.15 + delay}
      stagger={0.035}
      trigger={trigger}
      hoverRedraw
      className={`[&>svg]:mx-0 ${className}`}
    />
  );
}
