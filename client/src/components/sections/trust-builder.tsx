import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TechnicalLabel from "@/components/ui/technical-label";
import Barcode from "@/components/ui/barcode";
import CounterDisplay from "@/components/ui/counter-display";

interface TrustBuilderProps {
  isActive: boolean;
  onAdvance: () => void;
}

export default function TrustBuilder({ isActive, onAdvance }: TrustBuilderProps) {
  const totalPaidRef = useRef<HTMLSpanElement>(null);
  const activeUsersRef = useRef<HTMLSpanElement>(null);
  const securityScoreRef = useRef<HTMLSpanElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [activities, setActivities] = useState<Array<{ id: string, text: string, time: string }>>([]);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { data: stats } = useQuery<{ totalPaid: number, activeUsers: number, securityScore: number }>({
    queryKey: ['/api/stats'],
    enabled: true, // Always enable for mobile compatibility
  });

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Desktop animation (based on isActive)
  useEffect(() => {
    if (!isMobile && isActive && stats && !hasAnimated) {
      setTimeout(() => {
        animateCounters();
        setHasAnimated(true);
      }, 600);
    }
    // Reset animation state when section becomes inactive
    if (!isMobile && !isActive) {
      setHasAnimated(false);
    }
  }, [isActive, stats, isMobile, hasAnimated]);

  // Mobile animation - Simplified and reliable
  useEffect(() => {
    if (!isMobile || !stats) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setTimeout(() => {
              animateCounters();
              setHasAnimated(true);
            }, 600);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '100px 0px -50px 0px'
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [isMobile, hasAnimated, stats]);

  // Mobile animation - Backup trigger on isActive change  
  useEffect(() => {
    if (isMobile && isActive && stats && !hasAnimated) {
      const timer = setTimeout(() => {
        animateCounters();
        setHasAnimated(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isActive, isMobile, hasAnimated, stats]);

  // Reset animation on section change for both mobile and desktop
  useEffect(() => {
    if (!isActive) {
      setHasAnimated(false);
    }
  }, [isActive]);

  const animateCounters = () => {
    if (totalPaidRef.current) {
      CounterDisplay.animateCounter(totalPaidRef.current, stats?.totalPaid || 2.5, 'M');
    }
    if (activeUsersRef.current) {
      CounterDisplay.animateCounter(activeUsersRef.current, stats?.activeUsers || 45, 'K+');
    }
    if (securityScoreRef.current) {
      CounterDisplay.animateCounter(securityScoreRef.current, stats?.securityScore || 99, '%');
    }
  };

  useEffect(() => {
    if (!isActive && !isMobile) return;
    if (isMobile && !hasAnimated) return; // Wait for intersection on mobile

    const activityTexts = [
      "User watched video ads",
      "New member joined via referral",
      "Tasks completed",
      "Payout request processed",
      "User reached new level"
    ];

    const interval = setInterval(() => {
      const randomActivity = activityTexts[Math.floor(Math.random() * activityTexts.length)];
      const time = new Date().toLocaleTimeString('en-US', { hour12: false });

      setActivities(prev => {
        const newActivity = {
          id: Date.now().toString(),
          text: randomActivity,
          time: time
        };
        return [newActivity, ...prev.slice(0, 2)]; // Keep only 3 activities
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <section
      ref={sectionRef}
      className={`cinematic-section ${isActive ? 'active' : ''}`}
      data-testid="trust-builder-section"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Technical Header */}
        <div className="text-center mb-8 md:mb-12">
          <div className="mb-2">
            <TechnicalLabel text="SYSTEM VERIFICATION" />
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-black mb-4">
            WHY THORX WORKS
          </h2>
          <Barcode className="w-32 md:w-48 h-8 md:h-10 mx-auto" />
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-12">
          {/* Total Payouts */}
          <div className="split-card bg-black text-white p-4 md:p-8 text-center">
            <TechnicalLabel text="TX-PTS DISTRIBUTED" className="text-white/70 mb-4" />
            <div className="text-5xl font-black counter-display text-primary mb-4">
              <span ref={totalPaidRef} data-testid="text-total-paid">0</span>
            </div>
            <p className="text-lg">TX-Points earned collectively</p>
            <Barcode className="w-full h-10 bg-white mt-6" />
          </div>

          {/* Active Members */}
          <div className="split-card bg-primary text-white p-4 md:p-8 text-center">
            <TechnicalLabel text="ACTIVE-USERS" className="text-white/70 mb-4" />
            <div className="text-5xl font-black counter-display mb-4">
              <span ref={activeUsersRef} data-testid="text-active-users">0</span>
            </div>
            <p className="text-lg">Earning daily</p>
            <Barcode className="w-full h-10 bg-white mt-6" />
          </div>

          {/* Security Score */}
          <div className="split-card bg-muted border-2 border-black p-4 md:p-8 text-center">
            <TechnicalLabel text="SECURITY-RATING" className="mb-4" />
            <div className="text-5xl font-black counter-display text-black mb-4">
              <span ref={securityScoreRef} data-testid="text-security-score">0</span>
            </div>
            <p className="text-lg text-secondary">Verified safe</p>
            <Barcode className="w-full h-10 bg-black mt-6" />
          </div>
        </div>

        {/* System Status Log (Transparency) */}
        <div className="split-card bg-black text-white p-4 md:p-8 mb-8 md:mb-12">
          <TechnicalLabel text="SYSTEM-STATUS-LOG" className="text-white/70 mb-4 md:mb-6" />
          <div className="space-y-3 md:space-y-4" data-testid="activity-feed">
            <div className="flex justify-between items-center border-b border-white/20 pb-4">
              <span>Ad Network Connectivity</span>
              <span className="technical-label text-green-500">OPERATIONAL</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/20 pb-4">
              <span>Payout Gateways (JazzCash/EasyPaisa)</span>
              <span className="technical-label text-green-500">ONLINE</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/20 pb-4">
              <span>Halal Content Filter</span>
              <span className="technical-label text-green-500">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/20 pb-4">
              <span>User Security Protocol</span>
              <span className="technical-label text-green-500">ENFORCED</span>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <div className="text-center mt-8 md:mt-0">
          <button
            onClick={onAdvance}
            className="bg-primary text-white px-8 md:px-12 py-3 md:py-4 text-lg md:text-xl font-black tracking-wider hover:bg-black transition-colors pulse-glow"
            data-testid="button-join-now"
          >
            JOIN NOW →
          </button>
        </div>
      </div>
    </section>
  );
}
