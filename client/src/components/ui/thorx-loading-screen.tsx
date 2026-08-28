import { useEffect, useState } from "react";

export default function ThorxLoadingScreen({ 
  message = "Loading", 
  duration = 1800 
}: { message?: string; duration?: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className="fixed inset-0 z-loading flex items-center justify-center bg-black cursor-orange">
      <div className="flex flex-col items-center justify-center gap-8 w-full cursor-orange">
        {/* THORX Title */}
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white">
          THORX
        </h1>

        {/* Progress Bar */}
        <div className="w-full max-w-xs px-6">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Percentage Indicator - Lower Right */}
        <div className="fixed bottom-8 right-8">
          <span className="text-4xl md:text-5xl font-black text-white">
            {Math.floor(progress)}%
          </span>
        </div>
      </div>
    </div>
  );
}
