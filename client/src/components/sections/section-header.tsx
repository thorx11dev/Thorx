import TechnicalLabel from "@/components/ui/technical-label";
import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";
import { VariableFontHoverByRandomLetter } from "@/components/ui/variable-font-hover";

interface SectionHeaderProps {
  index: string;
  label: string;
  countLabel?: string;
  title: string;
  isActive: boolean;
  blockColor?: string;
}

export default function SectionHeader({
  index,
  label,
  countLabel,
  title,
  isActive,
  blockColor = "#0a0a0a",
}: SectionHeaderProps) {
  return (
    <div className="mb-8 md:mb-12">
      {/* Eyebrow rail */}
      <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-7">
        <span className="font-mono text-[10px] md:text-[11px] font-semibold tracking-[0.2em] text-primary">
          [ {index} ]
        </span>
        <TechnicalLabel text={label} className="text-black/50" />
        <span className="h-px flex-1 bg-black/10" />
        {countLabel && (
          <TechnicalLabel text={countLabel} className="hidden sm:block text-black/35" />
        )}
      </div>

      {/* Display heading */}
      <CinematicBlockReveal trigger={isActive} blockColor={blockColor}>
        <div className="py-1">
          <VariableFontHoverByRandomLetter
            label={title}
            className="thx-display uppercase text-[clamp(2.25rem,6vw,4.75rem)]"
            fromFontVariationSettings="'wght' 900, 'slnt' 0"
            toFontVariationSettings="'wght' 400, 'slnt' -10"
          />
        </div>
      </CinematicBlockReveal>
    </div>
  );
}
