import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";

interface LegalNavProps {
  /** Short right-side badge identifying the current document, e.g. "TERMS" or "PRIVACY". */
  docLabel: string;
}

/**
 * Shared floating-pill navigation for legal/documentation pages (Terms,
 * Privacy). Mirrors the same rounded-2xl, 3-column floating nav pattern used
 * sitewide (landing header, AuthNav) so these pages never read as a
 * disconnected legacy template. Keep this the single source of truth instead
 * of duplicating the markup per document.
 */
export default function LegalNav({ docLabel }: LegalNavProps) {
  const [, setLocation] = useLocation();

  return (
    <nav className="fixed top-0 w-full z-50 px-3 pt-3 md:px-4 md:pt-4" data-testid="legal-navigation">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-3 items-center rounded-2xl border-2 md:border-[3px] border-black bg-white px-3 md:px-8 h-16 md:h-20">
          {/* Left Section */}
          <div className="flex items-center justify-self-start">
            <button
              onClick={() => setLocation("/")}
              className="bg-black text-white px-3 py-3 md:px-4 md:py-2 border-2 border-black rounded-lg hover:bg-primary transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
              data-testid="button-legal-back-home"
            >
              <ArrowLeft className="w-4 h-4" />
              <TechnicalLabel text="HOME" className="hidden sm:inline text-white text-xs md:text-sm" />
            </button>
          </div>

          {/* Center Section - Wordmark */}
          <div className="justify-self-center">
            <h1 className="text-xl md:text-3xl lg:text-4xl font-black tracking-tighter whitespace-nowrap" data-testid="legal-logo">
              THORX.
            </h1>
          </div>

          {/* Right Section */}
          <div className="flex items-center justify-self-end">
            <div className="bg-white border-2 border-black rounded-lg px-2 py-1 md:px-4 md:py-2 transition-all duration-300">
              <div className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm">
                <TechnicalLabel text="LEGAL" className="hidden sm:inline font-mono tracking-[0.2em] opacity-40" />
                <div className="hidden sm:block h-3 w-[1px] bg-black/10" />
                <TechnicalLabel text={docLabel} className="font-bold tracking-wider" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
