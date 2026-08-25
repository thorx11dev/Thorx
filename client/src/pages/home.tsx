import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import HookSection from "@/components/sections/hook-section";
import EarningReveal from "@/components/sections/earning-reveal";
import ValueProposition from "@/components/sections/value-proposition";
import FAQSection from "@/components/sections/faq-section";
import NavigationProgress from "@/components/ui/navigation-progress";
import ArrowKeysGuide from "@/components/ui/arrow-keys-guide";
import TechnicalLabel from "@/components/ui/technical-label";
import DigitalClock from "@/components/ui/digital-clock";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import { GetStartedButton } from "@/components/ui/get-started-button";

export default function Home() {
  const [currentSection, setCurrentSection] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [hasTransformedToClock, setHasTransformedToClock] = useState(false);
  const [, setLocation] = useLocation();
  const totalSections = 4;

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 640);
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
      const target = e.target as HTMLElement | null;
      const isTextEntry = target?.closest('input, textarea, select, [contenteditable="true"]');
      const isActionControl = target?.closest('button, a, [role="button"]');

      // Let focused controls keep their native keyboard behavior. This keeps
      // the FAQ reveal and section-three ruler from also changing sections.
      if (e.defaultPrevented || isTextEntry || isActionControl) return;

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
    <div className="landing-page" data-testid="landing-page">
      {/* Navigation Header */}
      <nav className="landing-header fixed top-0 w-full z-50" data-testid="navigation-header" aria-label="Primary navigation">
        <div className="landing-header-frame">
          <div className="landing-header-shell grid grid-cols-3 items-center">
            {/* Left Section - Transform to Enter button when not on first section */}
            <div className="flex items-center justify-self-start">
              {currentSection === 1 && !isMobile ? (
                <button
                  type="button"
                  onClick={() => setLocation("/auth")}
                  className="landing-header-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="button-navbar-get-started"
                >
                  <GetStartedButton />
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/auth")}
                  className="landing-enter-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="button-navbar-enter"
                >
                  <TechnicalLabel text="ENTER" className="text-white font-black" />
                </button>
              )}
            </div>

            {/* Center Section - Wordmark */}
            <div className="justify-self-center">
              <TextBlockAnimation blockColor="#000" animateOnScroll={false} delay={0.1}>
                <h1 className="landing-wordmark font-black whitespace-nowrap" data-testid="main-logo">
                  THORX.
                </h1>
              </TextBlockAnimation>
            </div>

            {/* Right Section */}
            <div className="flex items-center justify-self-end">
              {hasTransformedToClock ? (
                <div className="transform transition-all duration-500 ease-in-out">
                  <DigitalClock />
                </div>
              ) : (
                <div
                  className={`landing-status transition-all duration-300 ${currentSection >= 3 ? 'blur-sm opacity-70' : ''
                    }`}
                  aria-label="THORX version 1.0, online"
                >
                  <div className="flex items-center">
                    <TechnicalLabel text="v1.0" className="font-mono tracking-[0.2em] opacity-40" />
                    <div className="landing-status-divider hidden sm:block" />
                    <TechnicalLabel text="ONLINE" className="hidden sm:inline font-bold tracking-wider" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Sections */}
      <main className="landing-stage">
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
      </main>

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
