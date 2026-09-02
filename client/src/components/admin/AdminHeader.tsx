import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import { ProfileModal } from "@/components/ui/profile-modal";
import { useAuth } from "@/hooks/useAuth";
import { resolveAvatarUrl } from "@/lib/rankAvatars";
import TextBlockAnimation from "@/components/ui/text-block-animation";

interface AdminHeaderProps {
  userName: string;
  role: string;
  className?: string;
}

export function AdminHeader({ userName, role, className }: AdminHeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [riskPanelOpen, setRiskPanelOpen] = useState(false);
  const { user } = useAuth();

  const avatarUrl = user?.profilePicture || resolveAvatarUrl(user?.avatar, user?.rank);

  // Watch for the `risk-panel-open` class on document.body, set by CaseDetailDrawer
  // when it mounts/unmounts. Hides the THORX branding so the side panel doesn't
  // compete visually with the logo in the same header space.
  useEffect(() => {
    const check = () => setRiskPanelOpen(document.body.classList.contains("risk-panel-open"));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    check(); // initial state
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className={cn("w-full bg-white border-b-4 border-black sticky top-0 z-40", className)}>
        <div className="max-w-[1600px] w-full mx-auto px-4 md:px-12 relative h-20 md:h-24 flex items-center justify-center">
          
          {/* Logo Section — hidden while risk panel is open to prevent visual collision */}
          <div
            className={cn(
              "flex items-center justify-center transition-opacity duration-200",
              riskPanelOpen ? "opacity-0 pointer-events-none select-none" : "opacity-100"
            )}
          >
            <TextBlockAnimation blockColor="#141413" animateOnScroll={false} delay={0.1}>
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter uppercase text-black"
                data-testid="admin-main-logo"
              >
                THORX.
              </h1>
            </TextBlockAnimation>
          </div>

          {/* Profile Section — always visible, stays in top-right */}
          <div className="absolute right-4 md:right-8 flex items-center">
            <button
              onClick={() => setIsProfileOpen(true)}
              className="group flex items-center gap-3 bg-white border-2 border-black p-1 md:p-1.5 shadow-[4px_4px_0px_#141413] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              <div className="text-right hidden sm:block pl-2">
                <div className="font-black text-[11px] md:text-xs uppercase text-black leading-none mb-1 group-hover:text-primary transition-colors">
                  {userName}
                </div>
                <div className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 inline-block leading-none border-2 border-black bg-zinc-500 text-black shadow-sm">
                  {role.toLowerCase() === "founder"
                    ? "FOUNDER"
                    : role.toLowerCase() === "admin"
                    ? "ADMIN"
                    : "REGULAR"}
                </div>
              </div>

              <div className="w-10 h-10 md:w-12 md:h-12 border-2 border-black bg-black overflow-hidden relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-full h-full object-cover will-change-transform"
                  />
                ) : (
                  <User className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
      />
    </>
  );
}
