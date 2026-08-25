import { ArrowLeft, ArrowRight } from "lucide-react";

interface ArrowKeysGuideProps {
  currentSection: number;
  totalSections: number;
  onPrevious: () => void;
  onNext: () => void;
}

export default function ArrowKeysGuide({ currentSection, totalSections, onPrevious, onNext }: ArrowKeysGuideProps) {
  return (
    <div className="arrow-keys-guide" data-testid="arrow-keys-guide">
      <button
        onClick={onPrevious}
        disabled={currentSection === 1}
        className={`arrow-key focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${currentSection === 1 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        data-testid="arrow-key-left"
        aria-label="Previous section"
      >
        <ArrowLeft size={15} />
      </button>

      <button
        onClick={onNext}
        disabled={currentSection === totalSections}
        className={`arrow-key focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${currentSection === totalSections ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        data-testid="arrow-key-right"
        aria-label="Next section"
      >
        <ArrowRight size={15} />
      </button>

      <span className="thx-label hidden md:inline text-black/35">NAVIGATE</span>
    </div>
  );
}
