import { ArrowRight } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import Barcode from "@/components/ui/barcode";
import TextBlockAnimation from "@/components/ui/text-block-animation";

interface HookSectionProps {
  isActive: boolean;
  onAdvance: () => void;
}

const engineStrip = [
  {
    key: "A",
    title: "ATTENTION MARKETPLACE",
    titleShort: "ADS",
    meta: "VERIFIED AD VIEWS",
  },
  {
    key: "B",
    title: "PAID SURVEYS",
    titleShort: "SURVEYS",
    meta: "S2S CONFIRMED",
  },
  {
    key: "C",
    title: "GUILD SOCIAL HUB",
    titleShort: "GUILDS",
    meta: "WEEKLY BONUS POOL",
  },
];

export default function HookSection({ isActive, onAdvance }: HookSectionProps) {
  return (
    <section
      className={`cinematic-section ${isActive ? 'active' : ''}`}
      data-section="1"
      data-testid="hook-section"
    >
      <div className="w-full max-w-[1440px] mx-auto min-h-full flex flex-col justify-between py-2 md:py-4">
        {/* Top meta rail — the controlled shell */}
        <div className="flex items-center justify-between gap-4 pb-4 md:pb-6 border-b border-black/10">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <TechnicalLabel text="SYS.THORX // EARNINGS NETWORK" className="text-black/55 truncate" />
            <span className="hidden lg:block h-3 w-px bg-black/15" />
            <TechnicalLabel text="PKR RAILS: JAZZCASH · EASYPAISA" className="hidden lg:inline text-black/35" />
          </div>
          <Barcode variant="bold" color="currentColor" className="w-20 md:w-28 h-5 md:h-6 text-black/45 shrink-0" />
        </div>

        {/* Headline block */}
        <div className="py-8 md:py-6">
          <TextBlockAnimation blockColor="#0a0a0a" animateOnScroll={false} trigger={isActive} duration={0.55} stagger={0.12}>
            <h1 className="thx-display uppercase text-[clamp(2.5rem,9vw,8.25rem)]" data-testid="hero-headline">
              Turn attention
              <br />
              into{" "}
              <em className="thx-accent text-primary">currency.</em>
            </h1>
          </TextBlockAnimation>

          <div className="mt-5 md:mt-7 max-w-xl">
            <TextBlockAnimation blockColor="#0a0a0a" animateOnScroll={false} trigger={isActive} delay={0.25} duration={0.45}>
              <p className="text-sm md:text-base leading-relaxed font-medium text-black/55">
                Verified human attention, converted into TX-Points. Watch ads,
                complete paid surveys, run your guild — withdraw real PKR to
                JazzCash or EasyPaisa.
              </p>
            </TextBlockAnimation>
          </div>

          {/* CTA row */}
          <div className="mt-7 md:mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="button"
              onClick={onAdvance}
              className="thx-btn thx-btn-lg thx-btn-ink w-full sm:w-auto"
              data-testid="button-hook-advance"
              aria-label="Continue to sign up"
            >
              START EARNING
              <ArrowRight className="size-4 opacity-80" />
            </button>
            <span className="hidden sm:flex items-center gap-2">
              <span className="thx-kbd">Enter</span>
              <TechnicalLabel text="TO BEGIN" className="text-black/35" />
            </span>
            <TechnicalLabel text="TAP TO CREATE YOUR ACCOUNT" className="sm:hidden text-black/35" />
          </div>
        </div>

        {/* Bottom engines strip */}
        <div className="grid grid-cols-3 gap-3 md:gap-6 border-t border-black/10 pt-4 md:pt-5 pb-1">
          {engineStrip.map((engine) => (
            <div key={engine.key} className="min-w-0">
              <div className="font-mono text-[9px] md:text-[10px] font-semibold tracking-[0.2em] text-primary">
                ENGINE {engine.key}
              </div>
              <div className="mt-1 font-extrabold uppercase tracking-tight text-black/70 text-[11px] md:text-xs truncate">
                <span className="md:hidden">{engine.titleShort}</span>
                <span className="hidden md:inline">{engine.title}</span>
              </div>
              <div className="hidden md:block mt-0.5 thx-label !text-black/30">{engine.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
