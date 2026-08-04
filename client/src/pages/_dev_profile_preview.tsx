// TEMPORARY dev-only route for visually verifying ProfileModal while authenticated
// flows can't be screenshotted directly. Not linked from any nav. Delete after use.
import { ProfileModal } from "@/components/ui/profile-modal";

const mockUser = {
  id: "preview-user",
  name: "Ayesha Khan",
  firstName: "Ayesha",
  lastName: "Khan",
  avatar: "chota-don-2",
  profilePicture: null,
  rank: "Chota Don",
  userRankTier: "D-Rank",
  role: "user",
  guildId: null,
};

export default function DevProfilePreview() {
  return <ProfileModal isOpen={true} onClose={() => {}} user={mockUser} />;
}
