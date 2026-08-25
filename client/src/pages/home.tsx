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

export default function Home() {
  const [currentSection, setCurrentSection] = useState(1);
  const [hasTransformedToClock, setHasTransformedToClock] = useState(false);
  const [, setLocation] = useLocation();
  const totalSections = 4;

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
  }, [currentSection, totalSections, setLocation]);

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
    <div className="landing-root">
      {/* Navigation Header */}
      <nav className="fixed top-0 inset-x-0 z-50 px-3 pt-3 md:px-5 md:pt-4" data-testid="navigation-header">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex h-14 md:h-16 items-center justify-between rounded-xl border border-black/10 bg-background/85 backdrop-blur-md pl-4 pr-2 md:pl-6 md:pr-2.5">
            {/* Brand */}
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-xl md:text-2xl font-black tracking-tighter whitespace-nowrap" data-testid="main-logo">
                THORX<span className="text-primary">.</span>
              </h1>
              <span className="hidden lg:block h-4 w-px bg-black/15" />
              <span className="thx-label hidden lg:inline">REWARDS INFRASTRUCTURE</span>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-2 md:gap-3">
              {hasTransformedToClock ? (
                <div className="transition-all duration-500 ease-in-out" data-testid="header-clock-slot">
                  <DigitalClock />
                </div>
              ) : (
                <div className="thx-chip transition-opacity duration-300" data-testid="status-indicator">
                  <span className="thx-pulse-dot" aria-hidden="true" />
                  <span className="hidden sm:inline text-black/70 font-semibold">ONLINE</span>
                  <span className="hidden sm:block h-3 w-px bg-black/10" />
                  <span>BETA</span>
                </div>
              )}
              <GetStartedButton
                size="sm"
                onClick={() => setLocation("/auth")}
                className="!h-9 !px-3.5 md:!h-10 md:!px-5"
              />
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
          onAdvance={handleSectionAdvance}
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
