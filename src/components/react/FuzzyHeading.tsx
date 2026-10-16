import FuzzyText from "@components/reactbits/FuzzyText";
import { useTheme } from "@lib/useTheme";

type Props = {
  text: string;
};

const FUZZ_RANGE = 24;
// FuzzyText pads its canvas by fuzzRange + 20px on each side; pull it back so the
// glyphs line up with the text column.
const CANVAS_PAD = FUZZ_RANGE + 20;

// Canvas text can't follow CSS currentColor across theme changes, so pass the color explicitly.
export default function FuzzyHeading({ text }: Props) {
  const dark = useTheme() === "dark";

  return (
    <div style={{ marginLeft: -CANVAS_PAD }}>
      <FuzzyText
        fontSize="clamp(5rem, 22vw, 9rem)"
        fontWeight={800}
        color={dark ? "#ffffff" : "#000000"}
        baseIntensity={0.15}
        hoverIntensity={0.45}
        fuzzRange={FUZZ_RANGE}
        intro
      >
        {text}
      </FuzzyText>
    </div>
  );
}
