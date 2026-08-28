import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import TechnicalLabel from "@/components/ui/technical-label";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PlayCircle,
  PauseCircle,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Settings,
  User,
  HelpCircle,
  MoreHorizontal,
  Minimize, // Import Minimize icon
  Maximize, // Import Maximize icon
  CheckCircle2
} from "lucide-react";

interface VideoTab {
  id: string;
  title: string;
  icon: string;
  color: string;
  videoUrl: string;
  reward: string;
  description: string;
}

interface EnhancedVideoPlayerProps {
  tab: VideoTab;
  isActive?: boolean;
  onComplete?: (tabId: string, earnings: string) => void;
  autoplay?: boolean;
  isMobile?: boolean;
}

// Individual player state for each area
interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  adProgress: number;
  canSkip: boolean;
  isCompleted: boolean;
  showSkip: boolean;
  autoplayEnabled: boolean; // Added for autoplay toggle
}

// Single area player component
interface AreaPlayerProps {
  areaId: string;
  tab: VideoTab;
  isActive: boolean;
  isFullscreen: boolean;
  isMobileDevice: boolean;
  onComplete?: (tabId: string, earnings: string) => void;
  onFullscreenToggle: () => void;
}

function AreaPlayer({
  areaId,
  tab,
  isActive,
  isFullscreen,
  isMobileDevice,
  onComplete,
  onFullscreenToggle
}: AreaPlayerProps) {
  // Independent state for this specific area player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [adProgress, setAdProgress] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [adQueue, setAdQueue] = useState<number[]>([1, 2, 3]); // Queue of ads for this area
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  const duration = 30; // Video duration in seconds
  const playerRef = useRef<HTMLDivElement>(null);

  // Format ad credit as TX-Points (C1-01: no $ currency symbol on ad rewards)
  const formatCurrency = (amount: string) => {
    return `+${Math.round(parseFloat(amount))} TX-PTS`;
  };

  const formatVideoTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer for video progress - only runs when this area is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && isPlaying && !isCompleted) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          const newTime = prev + 1;
          const progress = (newTime / duration) * 100;
          setAdProgress(progress);

          // Allow skip after 5 seconds
          if (newTime >= 5 && !canSkip) {
            setCanSkip(true);
            setShowSkip(true);
          }

          // Auto-complete at end
          if (newTime >= duration) {
            setIsPlaying(false);
            setIsCompleted(true);
            onComplete?.(`${tab.id}-area-${areaId}-ad-${currentAdIndex + 1}`, tab.reward);

            return duration;
          }

          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isPlaying, isCompleted, duration, canSkip, tab.id, tab.reward, areaId, currentAdIndex, onComplete]);

  // Separate effect for autoplay handling
  useEffect(() => {
    if (isCompleted && autoplayEnabled && currentAdIndex < adQueue.length - 1) {
      const autoplayTimeout = setTimeout(() => {
        // Move to next ad in queue
        setCurrentAdIndex(prev => prev + 1);
        setCurrentTime(0);
        setAdProgress(0);
        setCanSkip(false);
        setIsCompleted(false);
        setShowSkip(false);
        setIsPlaying(true); // Auto-start next ad
      }, 1500);

      return () => clearTimeout(autoplayTimeout);
    } else if (isCompleted && autoplayEnabled && currentAdIndex >= adQueue.length - 1) {
      // No more ads in queue, disable autoplay
      setAutoplayEnabled(false);
    }
  }, [isCompleted, autoplayEnabled, currentAdIndex, adQueue.length]);

  const handlePlay = () => {
    setIsPlaying(true);
    if (!isFullscreen) {
      onFullscreenToggle();
    }
  };
  const handlePause = () => setIsPlaying(false);

  const handleSkip = () => {
    if (canSkip && !isCompleted) {
      setCurrentTime(duration);
      setAdProgress(100);
      setIsPlaying(false);
      setIsCompleted(true);
      onComplete?.(`${tab.id}-area-${areaId}-ad-${currentAdIndex + 1}`, tab.reward);
    }
  };

  const handleVolumeToggle = () => setIsMuted(!isMuted);
  const handleAutoplayToggle = () => setAutoplayEnabled(!autoplayEnabled);

  if (!isActive) return null;

  return (
    <div
      ref={playerRef}
      className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${isFullscreen
          ? 'h-screen w-full border-none'
          : isMobileDevice
            ? 'w-full border border-black'
            : 'w-full border-2 border-black'
        }`}
      style={{
        backgroundColor: "#0a0a0a",
        ...(isFullscreen ? {} : isMobileDevice
          ? { aspectRatio: '9/16', maxHeight: '75vh' }
          : { aspectRatio: '16/9' })
      }}
      data-testid={`video-player-${areaId}`}
    >
      {/* Play Button */}
      <div className="relative z-10 flex items-center justify-center">
        {!isPlaying ? (
          <button
            onClick={handlePlay}
            className={`group relative bg-primary rounded-full flex items-center justify-center transition-all duration-300 hover:bg-primary/90 hover:scale-105 ${isFullscreen ? 'w-24 h-24' : 'w-16 h-16'
              }`}
            data-testid={`button-play-${areaId}`}
          >
            <PlayCircle className={`text-black transition-colors ${isFullscreen ? 'w-12 h-12' : 'w-8 h-8'
              }`} />
          </button>
        ) : (
          <div className="text-center text-white px-6">
            <div className={`mb-2 ${isFullscreen ? 'text-6xl mb-4' : 'text-4xl'}`}>{tab.icon}</div>
            <TechnicalLabel
              text={`AD ${currentAdIndex + 1}/${adQueue.length}`}
              className={`text-white mb-1 ${isFullscreen ? 'text-2xl mb-2' : 'text-lg'}`}
            />
            <p className={`text-white/60 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>{tab.description}</p>
            {isCompleted && (
              <div className={`mt-4 bg-white rounded-xl ${isFullscreen ? 'p-5 mt-6' : 'p-4'
                }`}>
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className={`text-primary ${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} />
                  <TechnicalLabel
                    text="AD COMPLETED"
                    className={`text-black ${isFullscreen ? 'text-lg' : ''}`}
                  />
                </div>
                <p className={`text-black/70 mt-1 font-medium ${isFullscreen ? 'text-lg mt-2' : 'text-sm'}`}>
                  You earned {formatCurrency(tab.reward)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skip Button */}
      {showSkip && canSkip && !isCompleted && (
        <button
          onClick={handleSkip}
          className={`absolute bg-white text-black border-2 border-black rounded-md hover:bg-white/90 transition-all duration-200 z-20 ${isFullscreen ? 'top-6 right-6 px-4 py-3' : 'top-4 right-4 px-3 py-2'
            }`}
          data-testid={`button-skip-${areaId}`}
        >
          <TechnicalLabel
            text="SKIP AD"
            className={`text-black font-medium ${isFullscreen ? 'text-sm' : 'text-xs'}`}
          />
        </button>
      )}

      {/* Progress Bar — always visible at bottom edge */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="w-full h-1 bg-white/20">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${adProgress}%` }}
          />
        </div>
      </div>

      {/* Industrial Corner Accents */}
      {!isMobileDevice && (
        <>
          <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-white/40" />
          <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-white/40" />
          <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-white/40" />
          <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-white/40" />
        </>
      )}
    </div>
  );
}

export default function EnhancedVideoPlayer({
  tab,
  isActive = true,
  onComplete,
  autoplay = false,
  isMobile = false
}: EnhancedVideoPlayerProps) {
  const isMobileDevice = useIsMobile();

  // Shared state across all players
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  const playerRef = useRef<HTMLDivElement>(null);

  const handleAutoplayToggle = () => setAutoplayEnabled(!autoplayEnabled);
  const handleVolumeToggle = () => setIsMuted(!isMuted);

  // Control icons for top right
  const controlIcons = [
    { id: "settings", icon: Settings, active: false },
    { id: "user", icon: User, active: false },
    { id: "help", icon: HelpCircle, active: false },
    { id: "active", icon: MoreHorizontal, active: true }
  ];

  // Format ad credit as TX-Points (C1-01: no $ currency symbol on ad rewards)
  const formatCurrency = (amount: string) => {
    return `+${Math.round(parseFloat(amount))} TX-PTS`;
  };

  // Lock/unlock body scroll when mobile fullscreen is active.
  // Doing this inside useEffect guarantees the cleanup runs on unmount,
  // preventing a permanent scroll-lock if the component is removed while
  // fullscreen is open (e.g. navigation away mid-video).
  useEffect(() => {
    if (!isMobileDevice) return;
    if (isFullscreen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isFullscreen, isMobileDevice]);

  // Fullscreen change event listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      setIsFullscreen(isCurrentlyFullscreen);

      if (isMobileDevice) {
        if (isCurrentlyFullscreen) {
          document.body.classList.add('video-fullscreen-active');
        } else {
          document.body.classList.remove('video-fullscreen-active');
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.body.classList.remove('video-fullscreen-active');
      document.body.classList.remove('cinematic-mode');
    };
  }, [isMobileDevice]);

  const handleFullscreenToggle = async () => {
    if (!isFullscreen) {
      // Enter fullscreen
      try {
        setIsFullscreen(true);

        if (isMobileDevice) {
          // Mobile-specific fullscreen behavior — overflow lock applied via
          // useEffect below (watches isFullscreen) so cleanup is guaranteed.
          document.body.classList.add('video-fullscreen-active');

          // Add mobile-specific viewport meta tag adjustments
          const viewport = document.querySelector('meta[name=viewport]');
          if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
          }

          // Request fullscreen on the player container
          if (playerRef.current) {
            if (playerRef.current.requestFullscreen) {
              await playerRef.current.requestFullscreen();
            } else if ((playerRef.current as any).webkitRequestFullscreen) {
              await (playerRef.current as any).webkitRequestFullscreen();
            } else if ((playerRef.current as any).mozRequestFullScreen) {
              await (playerRef.current as any).mozRequestFullScreen();
            }
          }
        } else {
          // Desktop fullscreen on the player container
          if (playerRef.current) {
            if (playerRef.current.requestFullscreen) {
              await playerRef.current.requestFullscreen();
            } else if ((playerRef.current as any).webkitRequestFullscreen) {
              await (playerRef.current as any).webkitRequestFullscreen();
            } else if ((playerRef.current as any).mozRequestFullScreen) {
              await (playerRef.current as any).mozRequestFullScreen();
            } else if ((playerRef.current as any).msRequestFullscreen) {
              await (playerRef.current as any).msRequestFullscreen();
            }
          }
        }
      } catch (error) {
        // Fullscreen is non-critical — silently ignore browser-level rejections
      }
    } else {
      // Exit fullscreen
      try {
        setIsFullscreen(false);

        if (isMobileDevice) {
          // Mobile exit fullscreen — overflow cleared via useEffect cleanup.
          document.body.classList.remove('video-fullscreen-active');

          // Reset viewport meta tag
          const viewport = document.querySelector('meta[name=viewport]');
          if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
          }
        }

        // Exit fullscreen API
        const isActuallyFullscreen = !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );

        if (isActuallyFullscreen) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          } else if ((document as any).mozCancelFullScreen) {
            await (document as any).mozCancelFullScreen();
          } else if ((document as any).msExitFullscreen) {
            await (document as any).msExitFullscreen();
          }
        }
      } catch (error) {
        // Fullscreen exit is non-critical — silently ignore
        // Ensure cleanup
        document.body.classList.remove('video-fullscreen-active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    }
  };

  // Function to toggle autoplay in AreaPlayer
  const toggleAutoplayInArea = (areaId: string) => {
    // This function would ideally find the specific AreaPlayer instance and toggle its autoplay state.
    // For simplicity, we'll assume a global toggle or a more complex state management if needed.
    // Here, we're just toggling the shared autoplayEnabled state.
    setAutoplayEnabled(!autoplayEnabled);
  };

  // Function to toggle mute in AreaPlayer
  const toggleMuteInArea = (areaId: string) => {
    // Similar to autoplay, this would target a specific player instance.
    setIsMuted(!isMuted);
  };

  return (
    <div
      ref={playerRef}
      className={`w-full transition-all duration-300 ${isFullscreen
          ? 'fixed inset-0 z-50 bg-black video-player-fullscreen'
          : ''
        }`}
      style={isFullscreen && isMobileDevice ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        maxHeight: '100vh'
      } : {}}
    >
      {/* ── Player Frame ── */}
      <div className={`bg-black overflow-hidden transition-all duration-300 ${isFullscreen
          ? 'h-full w-full flex items-center justify-center'
          : isMobileDevice
            ? 'rounded-2xl border border-black/20'
            : 'rounded-2xl border-2 border-black/20'
        }`}>
        {/* Main Video Content Area */}
        <div className={isFullscreen ? 'w-full h-full' : 'w-full'}>
          <AreaPlayer
            key="001"
            areaId="001"
            tab={tab}
            isActive={true}
            isFullscreen={isFullscreen}
            isMobileDevice={isMobileDevice}
            onComplete={onComplete}
            onFullscreenToggle={handleFullscreenToggle}
          />
        </div>
      </div>
    </div>
  );
}