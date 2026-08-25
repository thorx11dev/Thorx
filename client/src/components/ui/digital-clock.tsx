import { useState, useEffect } from "react";
import TechnicalLabel from "@/components/ui/technical-label";

interface DigitalClockProps {
  className?: string;
}

export default function DigitalClock({ className = "" }: DigitalClockProps) {
  const [timeSpent, setTimeSpent] = useState(0);

  useEffect(() => {
    // Get start time from sessionStorage for current session only
    const startTime = sessionStorage.getItem('thorx-start-time');
    const sessionStart = startTime ? parseInt(startTime) : Date.now();
    
    if (!startTime) {
      sessionStorage.setItem('thorx-start-time', sessionStart.toString());
    }

    // Initial update
    const updateTime = () => {
      const currentTime = Date.now();
      const elapsed = Math.floor((currentTime - sessionStart) / 1000);
      setTimeSpent(elapsed);
    };

    updateTime(); // Initial call
    
    // Use requestAnimationFrame for better performance and accuracy
    let rafId: number;
    const tick = () => {
      updateTime();
      rafId = requestAnimationFrame(tick);
    };
    
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`flex items-center gap-2 h-[30px] px-3 rounded-full border border-[var(--ed-hairline,#e6dfd8)] bg-[var(--ed-surface-white,#fffefb)] ${className}`}
      data-testid="digital-clock"
      aria-label="Session time"
    >
      <span className="thx-dot" aria-hidden="true" />
      <span className="thx-mono text-xs font-semibold tracking-[0.12em] text-[var(--ed-ink,#141413)]">
        {formatTime(timeSpent)}
      </span>
    </div>
  );
}