import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import HookSection from "@/components/sections/hook-section";
import EarningReveal from "@/components/sections/earning-reveal";
import ValueProposition from "@/components/sections/value-proposition";
import FAQSection from "@/components/sections/faq-section";
import NavigationProgress from "@/components/ui/navigation-progress";
import ArrowKeysGuide from "@/components/ui/arrow-keys-guide";
import DigitalClock from "@/components/ui/digital-clock";
import { GetStartedButton } from "@/components/ui/get-started-button";

function ThorxMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Home() {
  const [currentSection, setCurrentSection] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [hasTransformedToClock, setHasTransformedToClock] = useState(false);
  const [, setLocation] = useLocation();
  const totalSections = 4;

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Add cinematic-mode class to body when component mounts
  useEffect(() => {
    document.body.classList.add('cinematic-mode');

    return () => {
      document.body.classList.remove('cinematic-mode');
    };
  }, []);

  // Trigger clock transformation once when reaching section 3
  useEffect(() => {
    if (currentSection >= 3 && !hasTransformedToClock) {
      setHasTransformedToClock(true);
    }
  }, [currentSection, hasTransformedToClock]);

  // Scroll to top on section change
  useEffect(() => {
    const activeSection = document.querySelector('.cinematic-section.active');
    if (activeSection) {
      activeSection.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [currentSection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Navigate to Auth page on Enter
        setLocation("/auth");
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentSection < totalSections) {
          setCurrentSection(prev => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentSection > 1) {
          setCurrentSection(prev => prev - 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentSection, totalSections]);

  const handleSectionAdvance = () => {
    // Navigate to Auth page for all action buttons
    setLocation("/auth");
  };

  const handleSectionChange = (section: number) => {
    setCurrentSection(section);
  };

  const handlePrevious = () => {
    if (currentSection > 1) {
      setCurrentSection(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentSection < totalSections) {
      setCurrentSection(prev => prev + 1);
    }
  };

  return (
    <div className="thx-editorial min-h-screen" data-testid="landing-editorial-root">
      {/* Navigation Header */}
      <nav className="fixed top-0 w-full z-50 px-3 pt-3 md:px-5 md:pt-4" data-testid="navigation-header">
        <div className="max-w-[1200px] mx-auto">
          <div className="relative flex items-center justify-between h-16 md:h-[72px] rounded-2xl border border-[var(--ed-hairline,#e6dfd8)] bg-[var(--ed-canvas,#faf9f5)] pl-3 pr-3 md:pl-6 md:pr-4 shadow-[0_1px_3px_rgba(20,20,19,0.06)]">
            {/* Left Section - Primary action */}
            <div className="flex items-center justify-self-start relative z-10">
              {currentSection === 1 && !isMobile ? (
                <button
                  type="button"
                  onClick={() => setLocation("/auth")}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ed-canvas,#faf9f5)] rounded-lg"
                  data-testid="button-navbar-get-started"
                >
                  <GetStartedButton />
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/auth")}
                  className="thx-btn thx-btn-primary px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ed-canvas,#faf9f5)]"
                  data-testid="button-navbar-enter"
                >
                  ENTER
                </button>
              )}
            </div>

            {/* Center Section - Wordmark */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 md:gap-2.5 select-none">
              <ThorxMark className="w-4 h-4 md:w-[18px] md:h-[18px] text-[var(--ed-ink,#141413)]" />
              <h1
                className="text-xl md:text-[26px] font-extrabold tracking-[-0.04em] whitespace-nowrap text-[var(--ed-ink,#141413)] leading-none"
                data-testid="main-logo"
              >
                THORX<span className="text-[var(--ed-coral,#cc785c)]">.</span>
              </h1>
            </div>

            {/* Right Section */}
            <div className="flex items-center justify-self-end relative z-10">
              {hasTransformedToClock ? (
                <div className="transition-all duration-500 ease-in-out">
                  <DigitalClock />
                </div>
              ) : (
                <div
                  className={`thx-chip thx-chip-outline transition-all duration-300 ${currentSection >= 3 ? 'blur-sm opacity-60' : ''
                    }`}
                >
                  <span className="thx-dot" aria-hidden="true" />
                  <span className="thx-mono text-[10px] tracking-[0.18em]">V1.0</span>
                  <span className="hidden sm:inline text-[10px] tracking-[0.14em] text-[var(--ed-muted,#6c6a64)]">ONLINE</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Sections */}
      <div data-section="1">
        <HookSection
          isActive={currentSection === 1}
          onAdvance={handleSectionAdvance}
        />
      </div>
      <div data-section="2">
        <EarningReveal
          isActive={currentSection === 2}
          onAdvance={handleSectionAdvance}
        />
      </div>
      <div data-section="3">
        <ValueProposition
          isActive={currentSection === 3}
        />
      </div>
      <div data-section="4">
        <FAQSection
          isActive={currentSection === 4}
        />
      </div>

      {/* Navigation Elements */}
      <NavigationProgress
        currentSection={currentSection}
        totalSections={totalSections}
        onSectionChange={handleSectionChange}
      />
      <ArrowKeysGuide
        currentSection={currentSection}
        totalSections={totalSections}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
    </div>
  );
}
