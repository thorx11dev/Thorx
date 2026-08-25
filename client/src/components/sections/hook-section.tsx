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
      <div className="w-full max-w-[1080px] mx-auto px-6 md:px-10 pt-20 md:pt-24 text-center">
        {/* Technical mark */}
        <div className="flex flex-col items-center mb-7 md:mb-9">
          <Barcode className="w-24 md:w-32 h-6 md:h-8" />
          <p className="thx-kicker mt-5">
            <span className="inline-block w-6 h-px bg-[var(--ed-coral,#cc785c)]" aria-hidden="true" />
            The Attention Marketplace
          </p>
        </div>

        {/* Display headline */}
        <TextBlockAnimation blockColor="#181715" animateOnScroll={false} trigger={isActive} delay={0.1}>
          <h1 className="thx-display thx-display-1 text-[var(--ed-ink,#141413)]">
            Turn <em className="thx-accent">attention</em>
            <br className="hidden sm:block" />
            {' '}into currency.
          </h1>
        </TextBlockAnimation>

        {/* Supporting line */}
        <div className="max-w-xl mx-auto mt-6 md:mt-7">
          <TextBlockAnimation blockColor="#181715" animateOnScroll={false} trigger={isActive} delay={0.35} duration={0.45}>
            <p className="thx-body-lg">
              THORX converts verified human attention into TX-Points. Watch, engage,
              and withdraw real value to JazzCash or EasyPaisa.
            </p>
          </TextBlockAnimation>
        </div>

        {/* Primary action */}
        <button
          type="button"
          onClick={onAdvance}
          className="group mt-8 md:mt-10 inline-flex flex-col items-center gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ed-canvas,#faf9f5)] rounded-xl"
          data-testid="button-hook-advance"
          aria-label="Continue to sign up"
        >
          <span className="thx-btn thx-btn-primary min-h-[46px] px-8 text-[15px]">
            GET STARTED
          </span>
          <TechnicalLabel
            text="TAP TO START"
            className="md:hidden text-[10px] text-[var(--ed-muted,#6c6a64)] font-semibold tracking-[0.22em]"
          />
          <TechnicalLabel
            text="PRESS ENTER TO BEGIN"
            className="hidden md:block text-[10px] text-[var(--ed-muted,#6c6a64)] font-semibold tracking-[0.22em]"
          />
          <span className="block w-10 h-[3px] rounded-full bg-[var(--ed-coral,#cc785c)] pulse-glow" aria-hidden="true" />
        </button>

        {/* Bottom meta strip */}
        <div className="mt-12 md:mt-16 flex items-center justify-center">
          <div className="flex items-center gap-3 md:gap-5 text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ed-muted-soft,#8e8b82)]">
            <span>Engine A</span>
            <span className="w-1 h-1 rounded-full bg-[var(--ed-hairline,#e6dfd8)]" aria-hidden="true" />
            <span>Engine B</span>
            <span className="w-1 h-1 rounded-full bg-[var(--ed-hairline,#e6dfd8)]" aria-hidden="true" />
            <span>Guild Economy</span>
          </div>
        </div>
      </div>
    </section>
  );
}
