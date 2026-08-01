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
          <TextBlockAnimation blockColor="#ff6b00" animateOnScroll={false} trigger={isActive}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-black mb-10 md:mb-12 text-secondary text-center leading-[1.05] tracking-tight">Turn Attention into Currency</p>
          </TextBlockAnimation>
        </div>

        {/* Action Prompt */}
        <div className="space-y-6 md:space-y-4">
          <TechnicalLabel text="TAP TO START" className="md:hidden" />
          <TechnicalLabel text="PRESS ENTER TO BEGIN" className="hidden md:block" />
          <div className="w-16 md:w-12 h-1 bg-primary mx-auto pulse-glow"></div>
        </div>
      </div>
    </section>
  );
}
