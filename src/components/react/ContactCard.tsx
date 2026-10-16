import ProfileCard from "@components/reactbits/ProfileCard/ProfileCard";
import { useTheme } from "@lib/useTheme";

type Props = {
  name: string;
  title: string;
  handle: string;
  email: string;
};

// Until there's a portrait, the card shows the brushstroke K monogram from the favicon,
// with the same K tiled as the holographic foil pattern.
export default function ContactCard({ name, title, handle, email }: Props) {
  const theme = useTheme();
  const dark = theme === "dark";

  return (
    <ProfileCard
      name={name}
      title={title}
      handle={handle}
      status="Open to ideas"
      statusColor="#a8a397"
      contactText="Say hi"
      onContactClick={() => {
        window.location.href = `mailto:${email}`;
      }}
      avatarUrl={dark ? "/profile/k-mark-dark.png" : "/profile/k-mark-light.png"}
      iconUrl="/profile/k-pattern.png"
      backdropColor={dark ? "#1c1b18" : "#E2E0D4"}
      theme={theme}
      holo={0.6}
      glare={0.4}
      tiltStrength={10}
      parallax={6}
      radius={14}
      className="!w-full"
    />
  );
}
