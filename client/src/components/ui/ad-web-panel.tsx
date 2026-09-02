import { useState, useEffect, useRef, useCallback } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, ChevronUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import TechnicalLabel from "@/components/ui/technical-label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import { WaterfallAdPlayer } from "@/components/ads/HilltopAdsPlayer";

interface AdWebPanelProps {
    isOpen: boolean;
    productUrl: string;
    adId: string;
    reward: string;
    onComplete: () => void;
    onClose: () => void;
}

export function AdWebPanel({
    isOpen,
    productUrl,
    adId,
    reward,
    onComplete,
    onClose
}: AdWebPanelProps) {
    const [progress, setProgress] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isActive, setIsActive] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const lastActivityRef = useRef<number>(Date.now());
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Constants
    const TOTAL_DURATION = 30; // seconds
    const ACTIVITY_TIMEOUT = 2000; // ms to consider user inactive

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setProgress(0);
            setTimeLeft(TOTAL_DURATION);
            setIsActive(false);
            setIsCompleted(false);
            lastActivityRef.current = Date.now();
        }
    }, [isOpen, adId]);

    // Activity tracking
    const handleActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        if (!isActive && !isCompleted) {
            setIsActive(true);
        }
    }, [isActive, isCompleted]);

    // Setup event listeners for activity
    useEffect(() => {
        if (!isOpen || isCompleted) return;

        const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
        const handleWindowActivity = () => handleActivity();

        events.forEach(event => window.addEventListener(event, handleWindowActivity));

        // Also try to listen to iframe interactions if possible (though limited by cross-origin)
        // We heavily rely on window activity over the overlay or iframe container

        return () => {
            events.forEach(event => window.removeEventListener(event, handleWindowActivity));
        };
    }, [isOpen, isCompleted, handleActivity]);

    // Timer and Connection Logic
    useEffect(() => {
        if (!isOpen || isCompleted) return;

        progressIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = now - lastActivityRef.current;
            const isUserActive = timeSinceLastActivity < ACTIVITY_TIMEOUT;

            setIsActive(isUserActive);

            if (isUserActive) {
                setProgress(prev => {
                    const increment = (100 / TOTAL_DURATION) / 10; // 10 updates per second
                    const newProgress = Math.min(prev + increment, 100);

                    if (newProgress >= 100) {
                        setIsCompleted(true);
                        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                        setTimeout(onComplete, 1000); // Small delay before closing/completing
                    }

                    return newProgress;
                });

                setTimeLeft(prev => Math.max(0, TOTAL_DURATION - (progress / 100 * TOTAL_DURATION)));
            }
        }, 100);

        return () => {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        };
    }, [isOpen, isCompleted, progress, onComplete]);

    // Browser State
    const [currentUrl, setCurrentUrl] = useState(productUrl);
    const [inputUrl, setInputUrl] = useState(productUrl);
    const [loading, setLoading] = useState(false);
    const [adCompleted, setAdCompleted] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCurrentUrl(productUrl);
            setInputUrl(productUrl);
            setLoading(true);
            setAdCompleted(false);
        }
    }, [isOpen, productUrl]);

    const handleNavigate = (e: React.FormEvent) => {
        e.preventDefault();
        let url = inputUrl;
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        setCurrentUrl(url);
        setLoading(true);
    };

    const handleRefresh = () => {
        setLoading(true);
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    const getProxyUrl = (url: string) => {
        // If it's our internal landing page, don't proxy
        if (url.startsWith('/ad-landing')) return url;

        // Otherwise use proxy (absolute API origin in production)
        return apiAbsolutePath(`/api/proxy?url=${encodeURIComponent(url)}`);
    };

    // If iframe takes focus, we might lose window events, so checking document.hasFocus or blur might be needed
    // But for simple "interaction", mousemove over the window/iframe container usually bubbles up or can be captured.

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-ad bg-black/80 backdrop-blur-sm"
                        onClick={() => { }} // Block clicks
                    />

                    {/* Panel - Browser Interface */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200, mass: 0.8 }}
                        className="fixed inset-0 top-0 z-[510] bg-white flex flex-col shadow-2xl overflow-hidden"
                    >
                        {/* Header - White Background, Minimal */}
                        <div className="bg-white border-b border-gray-100 p-3 md:p-4 flex flex-col gap-3 shadow-sm relative z-20">

                            {/* Top Row: Stats */}
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col items-start min-w-[100px]">
                                    <TechnicalLabel text="TIME REMAINING" className="text-gray-400 text-[10px] md:text-xs mb-1 tracking-widest" />
                                    <span className="font-mono text-xl md:text-2xl font-black text-black leading-none">{Math.ceil(timeLeft)}s</span>
                                </div>

                                <div className="flex flex-col items-end flex-1 max-w-xs md:max-w-sm">
                                    <div className="flex justify-between w-full mb-1">
                                        <TechnicalLabel text="ATTENTION" className="text-primary text-[10px] md:text-xs tracking-widest" />
                                        <span className="text-[10px] font-bold text-black">{Math.round(progress)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 md:h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-300 ease-linear",
                                                isActive ? "bg-primary" : "bg-gray-300"
                                            )}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Row: Browser Address Bar */}
                            <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-full border border-gray-200">
                                <div className="flex items-center gap-1 px-2 text-gray-400">
                                    <div className="w-2 h-2 rounded-full bg-red-400" />
                                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                    <div className="w-2 h-2 rounded-full bg-green-400" />
                                </div>

                                <form onSubmit={handleNavigate} className="flex-1 flex items-center bg-white rounded-full px-4 py-1.5 shadow-sm border border-gray-100">
                                    <div className="text-gray-400 mr-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                    </div>
                                    <input
                                        type="text"
                                        value={inputUrl}
                                        onChange={(e) => setInputUrl(e.target.value)}
                                        className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 font-mono"
                                        placeholder="Type URL..."
                                    />
                                </form>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleRefresh}
                                    className="h-8 w-8 rounded-full hover:bg-white text-gray-500"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                                </Button>
                            </div>

                        </div>

                        {/* Iframe Content */}
                        <div className="flex-1 w-full bg-gray-50 relative" onMouseMove={handleActivity} onTouchMove={handleActivity}>
                            {!adCompleted ? (
                                <div className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 md:p-12">
                                    <div className="w-full max-w-2xl">
                                        <div className="mb-8 text-center">
                                            <TechnicalLabel text="MONETIZATION PHASE" className="text-primary text-xs md:text-sm mb-2 tracking-[0.3em] font-black" />
                                            <h2 className="text-2xl md:text-4xl font-black text-black uppercase tracking-tighter">Synchronizing Engine...</h2>
                                            <p className="text-[10px] md:text-xs font-bold text-zinc-400 uppercase tracking-widest mt-2 border-t border-zinc-100 pt-2">Please wait for the advertisement to initialize</p>
                                        </div>

                                        <div className="border-4 border-black p-2 bg-black shadow-[8px_8px_0px_#141413]">
                                            <WaterfallAdPlayer
                                                onComplete={() => {
                                                    setAdCompleted(true);
                                                    setLoading(true);
                                                }}
                                                adFormat="video"
                                            />
                                        </div>

                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            <div className="h-px flex-1 bg-zinc-200" />
                                            <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest italic">Encrypted Secure Session</span>
                                            <div className="h-px flex-1 bg-zinc-200" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {loading && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 backdrop-blur-[2px]">
                                            <ThorxSpinner size={32} className="text-primary" />
                                        </div>
                                    )}

                                    {productUrl ? (
                                        <iframe
                                            ref={iframeRef}
                                            src={getProxyUrl(currentUrl)}
                                            className="w-full h-full border-none"
                                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                            title="Browser Window"
                                            onLoad={() => setLoading(false)}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                            <ExternalLink className="w-12 h-12 mb-4 opacity-50" />
                                            <p className="text-lg font-medium">No URL Loaded</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
