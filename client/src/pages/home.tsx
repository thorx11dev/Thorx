import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import HookSection from "@/components/sections/hook-section";
import EarningReveal from "@/components/sections/earning-reveal";
import ValueProposition from "@/components/sections/value-proposition";
import FAQSection from "@/components/sections/faq-section";
import NavigationProgress from "@/components/ui/navigation-progress";
import ArrowKeysGuide from "@/components/ui/arrow-keys-guide";
import TechnicalLabel from "@/components/ui/technical-label";
import DigitalClock from "@/components/ui/digital-clock";
import Barcode from "@/components/ui/barcode";
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
    <>
      {/* Navigation Header */}
      <nav className="fixed top-0 w-full z-50 px-3 pt-3 md:px-4 md:pt-4" data-testid="navigation-header">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 items-center rounded-2xl border-2 md:border-[3px] border-black bg-white px-3 md:px-8 h-16 md:h-20">
            {/* Left Section - Transform to Enter button when not on first section */}
            <div className="flex items-center justify-self-start">
              {currentSection === 1 && !isMobile ? (
                <button
                  type="button"
                  onClick={() => setLocation("/auth")}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="button-navbar-get-started"
                >
                  <GetStartedButton />
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/auth")}
                  className="bg-primary text-white px-3 py-3 md:px-4 md:py-2 border-2 border-black rounded-lg hover:bg-black transition-all duration-300 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="button-navbar-enter"
                >
                  <TechnicalLabel text="ENTER" className="text-white text-xs md:text-sm font-black" />
                </button>
              )}
            </div>

            {/* Center Section - Wordmark */}
            <div className="justify-self-center">
              <TextBlockAnimation blockColor="#000" animateOnScroll={false} delay={0.1}>
                <h1 className="text-xl md:text-3xl lg:text-4xl font-black tracking-tighter whitespace-nowrap" data-testid="main-logo">
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
                  className={`bg-white border-2 border-black rounded-lg px-2 py-1 md:px-4 md:py-2 transition-all duration-300 ${currentSection >= 3 ? 'blur-sm opacity-70' : ''
                    }`}
                >
                  <div className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm">
                    <TechnicalLabel text="v1.0" className="font-mono tracking-[0.2em] opacity-40" />
                    <div className="h-3 w-[1px] bg-black/10" />
                    <TechnicalLabel text="ONLINE" className="hidden sm:inline font-bold tracking-wider" />
                  </div>
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
    </>
  );
}
