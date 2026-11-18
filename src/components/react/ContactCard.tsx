import ProfileCard from "@components/reactbits/ProfileCard/ProfileCard";
import { useTheme } from "@lib/useTheme";
import AliveFigure from "@components/react/AliveFigure";

type Props = {
  name: string;
  title: string;
  handle: string;
  handleUrl: string;
  email: string;
};

// The portrait is a living line-drawn figure (AliveFigure), with a tiny smiley tiled as the holographic foil pattern.
export default function ContactCard({ name, title, handle, handleUrl, email }: Props) {
  const theme = useTheme();
  const dark = theme === "dark";

  return (
    <ProfileCard
      name={name}
      title={title}
      handle={handle}
      handleUrl={handleUrl}
      status=""
      contactText="Say hi"
      onContactClick={() => {
        window.location.href = `mailto:${email}`;
      }}
      avatar={<AliveFigure color={dark ? "#e8e5d8" : "#1a1a1a"} label={`A line-drawn figure of ${name}`} />}
      iconUrl="/profile/smile-pattern.svg"
      backdropColor={dark ? "#1c1b18" : "#E2E0D4"}
      theme={theme}
      holo={dark ? 0.6 : 0.4}
      glare={0.4}
      tiltStrength={10}
      parallax={6}
      radius={14}
      className="!w-full"
    />
  );
}
