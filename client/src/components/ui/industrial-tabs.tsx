import { useState, memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import TechnicalLabel from "@/components/ui/technical-label";
import { PlayCircle, Target, Users, CheckCircle } from "lucide-react";

interface TabData {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  description: string;
  count?: number;
  earnings?: string;
  isActive?: boolean;
  productUrl?: string;
  adId?: string;
}

interface IndustrialTabsProps {
  tabs: TabData[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

const IndustrialTabs = memo(function IndustrialTabs({ tabs, activeTab, onTabChange, className }: IndustrialTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const getTabStyles = (tab: TabData) => {
    const isActive = activeTab === tab.id;
    const isHovered = hoveredTab === tab.id;

    if (isActive) {
      return "bg-primary text-white border-primary shadow-lg transform scale-[1.02]";
    }

    if (isHovered) {
      return "bg-white text-black border-primary shadow-md transform scale-[1.01]";
    }

    return "bg-black text-white border-white/20 hover:border-primary/50";
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Tab Headers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-6">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              className={cn(
                "group relative border-2 p-4 md:p-6 transition-all duration-300 cursor-pointer",
                "flex flex-col items-center text-center space-y-2 md:space-y-3",
                "hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black",
                getTabStyles(tab)
              )}
              data-testid={`tab-${tab.id}`}
            >
              {/* Industrial corner accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current opacity-60" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-current opacity-60" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-current opacity-60" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current opacity-60" />

              {/* Icon */}
              <div className={cn(
                "transition-all duration-300",
                isActive ? "transform scale-110" : "group-hover:transform group-hover:scale-105"
              )}>
                <IconComponent
                  className={cn(
                    "w-6 h-6 md:w-8 md:h-8 transition-colors duration-300",
                    isActive ? "text-white" : "text-current group-hover:text-primary"
                  )}
                />
              </div>

              {/* Title */}
              <TechnicalLabel
                text={tab.title}
                className={cn(
                  "text-xs md:text-sm transition-colors duration-300",
                  isActive ? "text-white" : "text-current"
                )}
              />

              {/* Stats */}
              {(tab.count !== undefined || tab.earnings) && (
                <div className="text-xs opacity-80">
                  {tab.count !== undefined && (
                    <div>{tab.count} available</div>
                  )}
                  {tab.earnings && (
                    <div className="text-primary font-bold">{tab.earnings}</div>
                  )}
                </div>
              )}

              {/* Active indicator */}
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-4 h-1 bg-white" />
              )}

              {/* Progress indicator for completed tabs */}
              {tab.isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary border-2 border-white rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-white rounded-full" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Description */}
      <div className="text-center mb-4">
        {tabs.find(tab => tab.id === activeTab)?.description && (
          <div className="bg-black/50 border border-primary/30 p-4">
            <TechnicalLabel
              text={tabs.find(tab => tab.id === activeTab)?.description || ""}
              className="text-white/80 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default IndustrialTabs;

// Tab data configuration for the work section
export const WORK_TABS: TabData[] = [
  {
    id: "player1",
    adId: "video_standard",
    title: "PLAYER 1",
    icon: PlayCircle,
    description: "Watch video ads and visit the product page for 30s to convert attention into TX-Points.",
    productUrl: "https://www.binance.com",
  },
  {
    id: "player2",
    adId: "video_premium",
    title: "PLAYER 2",
    icon: PlayCircle,
    description: "Secondary ad network. Ensure genuine engagement to qualify for rewards.",
    productUrl: "https://www.daraz.pk",
  },
  {
    id: "player3",
    adId: "banner_standard",
    title: "PLAYER 3",
    icon: PlayCircle,
    description: "Diversified ad content. Earnings credited after manual review of attentiveness.",
    productUrl: "https://www.foodpanda.pk",
  },
  {
    id: "player4",
    adId: "ad_004",
    title: "PLAYER 4",
    icon: PlayCircle,
    description: "Maximum earning potential. Turn your attention into real currency here.",
    productUrl: "https://www.amazon.com",
  }
];