// Types for the JavaScript ProfileCard, following the React Bits props table.
import type { MemoExoticComponent, ReactElement, ReactNode } from "react";

export interface ProfileCardProps {
  /** Local addition: a React element rendered in place of the avatar image. */
  avatar?: ReactNode;
  avatarUrl?: string;
  iconUrl?: string;
  miniAvatarUrl?: string;
  name?: string;
  title?: string;
  handle?: string;
  /** Local addition: link for the handle. */
  handleUrl?: string;
  status?: string;
  statusColor?: string;
  contactText?: string;
  showUserInfo?: boolean;
  onContactClick?: () => void;
  theme?: "dark" | "light";
  backdropColor?: string;
  radius?: number;
  holo?: number;
  glare?: number;
  enableTilt?: boolean;
  tiltStrength?: number;
  parallax?: number;
  enableMobileTilt?: boolean;
  mobileTiltSensitivity?: number;
  intro?: boolean;
  className?: string;
}

declare const ProfileCard: MemoExoticComponent<(props: ProfileCardProps) => ReactElement>;
export default ProfileCard;
