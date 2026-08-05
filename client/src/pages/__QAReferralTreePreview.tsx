// TEMPORARY QA harness — renders the real ReferralTree component with mock
// data so it can be visually verified without an authenticated session.
// Deleted (along with its route in App.tsx) once verification is complete.
import { ReferralTree } from "@/components/ui/referral-tree";

const currentUser = {
  id: "root",
  firstName: "Adeline",
  lastName: "Luna",
  userRankTier: "B-Rank",
  avatar: "avatar-3",
};

const populated = [
  { id: "1", firstName: "Zara", lastName: "Khan", email: "a@a.com", userRankTier: "S-Rank", avatar: "avatar-1", level: 1, referredBy: "root", earningsFromUser: "800.00" },
  { id: "2", firstName: "Bilal", lastName: "Ahmed", email: "b@a.com", userRankTier: "B-Rank", avatar: "avatar-4", level: 1, referredBy: "root", earningsFromUser: "150.00" },
  { id: "3", firstName: "Ayesha", lastName: "Tariq", email: "c@a.com", userRankTier: "A-Rank", avatar: "avatar-5", level: 1, referredBy: "root", earningsFromUser: "0.00" },
  { id: "4", firstName: "Hamza", lastName: "Raza", email: "d@a.com", userRankTier: "E-Rank", avatar: "avatar-2", level: 1, referredBy: "root", earningsFromUser: "0.00" },
  { id: "5", firstName: "Sana", lastName: "Malik", email: "e@a.com", userRankTier: "D-Rank", avatar: "avatar-6", level: 1, referredBy: "root", earningsFromUser: "0.00" },
  { id: "6", firstName: "Omar", lastName: "Sheikh", email: "f@a.com", userRankTier: "C-Rank", avatar: "avatar-1", level: 1, referredBy: "root", earningsFromUser: "42.75" },
  { id: "7", firstName: "Fatima", lastName: "Noor", email: "g@a.com", userRankTier: "S-Rank", avatar: "avatar-3", level: 1, referredBy: "root", earningsFromUser: "12345.00" },
];

export default function QAReferralTreePreview() {
  return (
    <div className="min-h-screen bg-[#fdfbf7] p-8 space-y-16">
      <div>
        <h2 className="font-black uppercase text-sm mb-4">Desktop — Empty state</h2>
        <div className="bg-white border border-black/15 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
          <ReferralTree currentUser={currentUser} referrals={[]} />
        </div>
      </div>

      <div>
        <h2 className="font-black uppercase text-sm mb-4">Desktop — Populated (7 referrals)</h2>
        <div className="bg-white border border-black/15 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
          <ReferralTree currentUser={currentUser} referrals={populated} />
        </div>
      </div>

      <div className="max-w-[380px]">
        <h2 className="font-black uppercase text-sm mb-4">Mobile width (375px) — Populated</h2>
        <div className="bg-white border border-black/15 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
          <ReferralTree currentUser={currentUser} referrals={populated} />
        </div>
      </div>
    </div>
  );
}
