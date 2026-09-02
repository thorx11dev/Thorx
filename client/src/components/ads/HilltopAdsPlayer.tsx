import { useEffect, useRef, useState, useCallback } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";

interface AdNetwork {
  id: string;
  name: string;
  zoneId: string;
  type: string;
  priority: number;
  isActive: boolean;
}

interface WaterfallAdPlayerProps {
  onComplete?: () => void;
  adFormat?: "video" | "banner";
}

/**
 * WaterfallAdPlayer — Engine A rewarded-video waterfall.
 *
 * Engine A hardening (2026-08): the previous implementation fired "ad
 * complete" on a hardcoded 3-second timer and POSTed to the removed
 * /api/hilltopads/ad-completion endpoint. That faked completion signals even
 * when no ad had actually rendered (empty/no-fill slots) and minted credits
 * on an unratelimited endpoint (fixed server-side).
 *
 * Phase 1 behavior: only advance when the current network's injected ad code
 * actually rendered visible content in the container; if nothing renders
 * within RENDER_TIMEOUT_MS, move to the next network. When every network
 * fails, show a no-fill state instead of silently advancing — the credit path
 * (/api/ad-view) must never fire without a real ad. A true network completion
 * callback (verified server-side with a one-time nonce) arrives with the
 * Phase 2 network-adapter layer.
 */
const RENDER_POLL_MS = 500;
const RENDER_TIMEOUT_MS = 10_000;

export function WaterfallAdPlayer({ onComplete, adFormat = "video" }: WaterfallAdPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [networks, setNetworks] = useState<AdNetwork[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [adCode, setAdCode] = useState<string>("");
  const [noFill, setNoFill] = useState(false);
  const { toast } = useToast();

  // 1. Fetch Waterfall Configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await apiRequest("GET", "/api/config/AD_NETWORKS");
        const data = await res.json();
        const activeNetworks = (data.value || [])
          .filter((n: AdNetwork) => n.isActive)
          .sort((a: AdNetwork, b: AdNetwork) => a.priority - b.priority);

        setNetworks(activeNetworks);
        setNoFill(false);
        setCurrentIndex(0);
        if (activeNetworks.length === 0) {
          setIsLoading(false);
        }
      } catch (error) {
        // Ad config fetch failure — silently degrade (ad player will show nothing)
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const advanceOrNoFill = useCallback(() => {
    setAdCode("");
    setCurrentIndex(prev => {
      const next = prev + 1;
      if (next >= networks.length) {
        setNoFill(true);
        setIsLoading(false);
        toast({
          title: "No Ads Available",
          description: "No ads are available right now. Please try again in a little while.",
          variant: "destructive",
        });
      }
      return next;
    });
  }, [networks.length, toast]);

  // 2. Load Ad Code for current network
  const loadAdForNetwork = useCallback(async (network: AdNetwork) => {
    try {
      setIsLoading(true);
      setNoFill(false);
      // Generic anti-adblock fetcher
      const response = await apiRequest("GET", `/api/hilltopads/anti-adblock/${network.zoneId}`);
      const data = await response.json();
      if (!data.code) {
        // Network responded but serves no ad code — treat as no-fill for this zone.
        if (import.meta.env.DEV) console.warn(`[Waterfall] ${network.name} returned empty ad code. Moving to next provider.`);
        advanceOrNoFill();
        return;
      }
      setAdCode(data.code);
      setIsLoading(false);
    } catch (error) {
      if (import.meta.env.DEV) console.warn(`[Waterfall] ${network.name} failed. Moving to next provider.`);
      advanceOrNoFill();
    }
  }, [advanceOrNoFill]);

  useEffect(() => {
    if (networks.length > 0 && currentIndex < networks.length) {
      loadAdForNetwork(networks[currentIndex]);
    }
  }, [networks, currentIndex, loadAdForNetwork]);

  // 3. Inject Ad Code and Detect Real Render (no fake completion)
  useEffect(() => {
    if (!adCode || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = adCode;

    const scripts = container.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const newScript = document.createElement("script");
      if (script.src) {
        newScript.src = script.src;
        newScript.onerror = () => {
          if (import.meta.env.DEV) console.warn("[Waterfall] Script load failed for network", networks[currentIndex].name);
          advanceOrNoFill();
        };
      } else {
        newScript.textContent = script.textContent;
      }
      script.parentNode?.replaceChild(newScript, script);
    }

    // Poll until the network's code actually renders something, or time out.
    // Note: an ad that renders an iframe counts as rendered even before the
    // iframe's own fill is known — full network-callback verification is the
    // Phase 2 adapter layer. This replaces the old blind 3s completion timer.
    let settled = false;
    const startedAt = Date.now();
    const poll = setInterval(() => {
      const rendered =
        container.childElementCount > 0 ||
        (container.textContent?.trim().length ?? 0) > 0;
      if (rendered) {
        settled = true;
        clearInterval(poll);
        onComplete?.();
      } else if (Date.now() - startedAt > RENDER_TIMEOUT_MS) {
        settled = true;
        clearInterval(poll);
        if (import.meta.env.DEV) console.warn(`[Waterfall] No ad rendered within ${RENDER_TIMEOUT_MS}ms — moving to next provider.`);
        advanceOrNoFill();
      }
    }, RENDER_POLL_MS);

    return () => {
      clearInterval(poll);
      if (!settled) container.innerHTML = "";
    };
  }, [adCode, currentIndex, networks, onComplete, advanceOrNoFill]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-50 border-2 border-black/5 rounded-2xl animate-pulse">
        <ThorxSpinner size={40} className="mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Synchronizing Network...</p>
      </div>
    );
  }

  // Audit finding 3-E: when no ad networks are active, render a meaningful
  // empty state instead of an invisible blank hole in the UI.
  if (networks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl">
        <Zap className="w-10 h-10 text-zinc-300 mb-4" />
        <p className="text-sm font-black uppercase tracking-wider text-zinc-400 mb-1">
          Ad Earning Unavailable
        </p>
        <p className="text-xs text-zinc-400 text-center max-w-xs">
          No ad networks are currently active. Check back soon — earnings resume automatically when networks come online.
        </p>
      </div>
    );
  }

  // No-fill: every network was tried and none rendered an ad. Never advance —
  // the credit path must not fire without a real ad.
  if (noFill) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl">
        <Zap className="w-10 h-10 text-zinc-300 mb-4" />
        <p className="text-sm font-black uppercase tracking-wider text-zinc-400 mb-1">
          No Ads Available Right Now
        </p>
        <p className="text-xs text-zinc-400 text-center max-w-xs mb-4">
          Every ad network is out of inventory at the moment. Try again in a little while.
        </p>
        <button
          onClick={() => {
            setNoFill(false);
            setCurrentIndex(0);
            setAdCode("");
            setIsLoading(true);
          }}
          className="text-[10px] font-black uppercase tracking-[0.2em] text-black border-2 border-black rounded-full px-4 py-2 hover:bg-black hover:text-white transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="waterfall-ads-container w-full min-h-[250px] flex items-center justify-center overflow-hidden rounded-xl bg-black/5"
      data-network={networks[currentIndex]?.name}
    />
  );
}
