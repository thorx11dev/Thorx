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
      className={`cinematic-section ${isActive ? 'active' : ''}`}
      data-section="1"
      data-testid="hook-section"
    >
      <div className="text-center w-full max-w-5xl mx-auto px-6 md:px-8 pt-24 md:pt-32">
        {/* Technical Header */}
        <div className="mb-8 md:mb-8">
          <Barcode className="w-28 md:w-32 h-8 md:h-10 mx-auto mb-4" />
        </div>

        {/* Tagline */}
        <div className="px-4 md:px-2">
          <TextBlockAnimation blockColor="#D97757" animateOnScroll={false} trigger={isActive}>
            <p className="text-[clamp(1rem,5vw,1.875rem)] md:text-4xl lg:text-5xl font-black mb-10 md:mb-12 text-secondary text-center leading-[1.05] tracking-tight whitespace-normal sm:whitespace-nowrap">Turn Attention into Currency</p>
          </TextBlockAnimation>
        </div>

        {/* Action Prompt */}
        <button
          type="button"
          onClick={onAdvance}
          className="w-full flex flex-col items-center space-y-6 md:space-y-4 py-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-testid="button-hook-advance"
          aria-label="Continue to sign up"
        >
          <TechnicalLabel text="TAP TO START" className="md:hidden" />
          <TechnicalLabel text="PRESS ENTER TO BEGIN" className="hidden md:block" />
          <div className="w-16 md:w-12 h-1 bg-primary mx-auto"></div>
        </button>
      </div>
    </section>
  );
}
