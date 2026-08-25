import TechnicalLabel from "@/components/ui/technical-label";
import Barcode from "@/components/ui/barcode";
import TextBlockAnimation from "@/components/ui/text-block-animation";

interface HookSectionProps {
  isActive: boolean;
  onAdvance: () => void;
}

export default function HookSection({ isActive, onAdvance }: HookSectionProps) {
  return (
    <section
      className={`cinematic-section landing-hero-section ${isActive ? 'active' : ''}`}
      data-section="1"
      data-testid="hook-section"
      aria-hidden={!isActive}
    >
      <div className="landing-hero-content text-center w-full mx-auto">
        {/* Technical Header */}
        <div className="landing-hero-barcode">
          <Barcode className="w-full h-full" />
        </div>

        {/* Tagline */}
        <div className="landing-hero-heading-wrap">
          <TextBlockAnimation blockColor="#ff6b00" animateOnScroll={false} trigger={isActive}>
            <p className="landing-hero-heading font-black text-secondary text-center">Turn Attention into Currency</p>
          </TextBlockAnimation>
        </div>

        {/* Action Prompt */}
        <button
          type="button"
          onClick={onAdvance}
          className="landing-hero-prompt flex flex-col items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-testid="button-hook-advance"
          aria-label="Continue to sign up"
          tabIndex={isActive ? 0 : -1}
        >
          <TechnicalLabel text="TAP TO START" className="md:hidden" />
          <TechnicalLabel text="PRESS ENTER TO BEGIN" className="hidden md:block" />
          <div className="landing-hero-prompt-line pulse-glow" />
        </button>
      </div>
    </section>
  );
}
