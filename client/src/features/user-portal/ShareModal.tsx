import { useState } from "react";
import { X, Copy } from "lucide-react";
import { SiWhatsapp, SiTelegram, SiMessenger, SiInstagram, SiTiktok, SiFacebook, SiGmail } from "@/components/guild/guild-icons";

export function ShareModal({ isOpen, onClose, referralCode, userName, toast }: { isOpen: boolean; onClose: () => void; referralCode: string; userName: string; toast: any }) {
  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?ref=${referralCode}`;
  const shareMessage = `Hey ${userName}! Check out THORX and start earning. Use my code: ${referralCode}`;
  const [copied, setCopied] = useState(false);

  const handleShare = async (platform: string) => {
    try {
      if (platform === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareMessage} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'telegram') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${shareMessage}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'messenger') {
        window.open(`fb-messenger://share?link=${encodeURIComponent(shareUrl)}&app_id=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'instagram') {
        window.open(`https://www.instagram.com/create/?text=${encodeURIComponent(`${shareMessage}`)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'tiktok') {
        window.open(`https://www.tiktok.com/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${shareMessage}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'gmail') {
        window.open(`mailto:?subject=${encodeURIComponent('Invitation to Join THORX!')}&body=${encodeURIComponent(`${shareMessage}\n\nClick here to join: ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast({ title: "Sharing Failed", description: "Could not share via this platform. Please try again." });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link Copied!", description: "Referral link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: "Copy Failed", description: "Could not copy link. Please try again." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black animate-in fade-in duration-300 share-modal-wrapper" onClick={onClose}>
      <div className="h-screen flex flex-col items-center justify-center relative px-4 md:px-8" onClick={(e) => e.stopPropagation()}>

        {/* Close Button - Upper Right Corner */}
        <button
          onClick={onClose}
          className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 text-white hover:scale-125 hover:opacity-70 active:scale-110 transition-all duration-200 animate-in fade-in slide-in-from-top-4 duration-500 delay-200 z-10"
          data-testid="button-close-modal"
          aria-label="Close modal"
        >
          <X className="w-6 h-6 md:w-7 md:h-7" />
        </button>

        {/* Center Content - Referral Link & Share Icons */}
        <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-500">

          {/* Referral Link Display - Input Container Style */}
          <div className="text-center mb-12 md:mb-16">
            <div className="bg-white/5 border border-white/20 rounded-lg p-6 md:p-8 backdrop-blur-sm animate-in fade-in duration-500 delay-100 hover:border-white/40 transition-colors duration-300" onClick={handleCopyLink}>
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="w-full bg-transparent text-white text-center text-lg md:text-xl lg:text-2xl font-black break-all outline-none select-all placeholder-white/40"
                data-testid="input-referral-link"
              />
            </div>
          </div>

          {/* Social Share Icons - Below Referral Link */}
          <div className="flex justify-center items-center gap-6 md:gap-8 mb-16 md:mb-20 flex-wrap">
            {/* WhatsApp */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('whatsapp');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(37,211,102,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 transform origin-center"
              data-testid="share-whatsapp"
              aria-label="Share on WhatsApp"
              title="Share on WhatsApp"
            >
              <SiWhatsapp className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Telegram */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('telegram');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,136,204,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 transform origin-center"
              data-testid="share-telegram"
              aria-label="Share on Telegram"
              title="Share on Telegram"
            >
              <SiTelegram className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Messenger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('messenger');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,132,250,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 transform origin-center"
              data-testid="share-messenger"
              aria-label="Share on Messenger"
              title="Share on Messenger"
            >
              <SiMessenger className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Instagram */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('instagram');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(224,33,103,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-250 transform origin-center"
              data-testid="share-instagram"
              aria-label="Share on Instagram"
              title="Share on Instagram"
            >
              <SiInstagram className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* TikTok */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('tiktok');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,0,0,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 transform origin-center"
              data-testid="share-tiktok"
              aria-label="Share on TikTok"
              title="Share on TikTok"
            >
              <SiTiktok className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Facebook */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('facebook');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(59,89,152,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-350 transform origin-center"
              data-testid="share-facebook"
              aria-label="Share on Facebook"
              title="Share on Facebook"
            >
              <SiFacebook className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Gmail */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('gmail');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(221,75,57,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 transform origin-center"
              data-testid="share-gmail"
              aria-label="Share via Gmail"
              title="Share via Gmail"
            >
              <SiGmail className="w-8 h-8 md:w-10 md:h-10" />
            </button>
          </div>
        </div>

        {/* Footer - Bottom with Copy Button on Right */}
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
          <p className="text-white text-base md:text-lg lg:text-xl font-black tracking-widest">REFERRAL SYSTEM</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyLink();
            }}
            className={`p-2 md:p-3 text-white transition-all duration-300 hover:scale-125 active:scale-95 transform ${copied
              ? 'scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
              : ''
              }`}
            data-testid="button-copy-referral-link"
            aria-label="Copy referral link"
            title="Copy referral link"
          >
            <Copy className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
