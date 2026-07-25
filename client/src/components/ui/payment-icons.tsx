// JazzCash Logo Component
export const JazzCashLogo: React.FC<{ className?: string }> = ({ className = "w-20 h-20" }) => (
  <div className={`${className} flex items-center justify-center bg-white rounded-lg p-3 border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all`}>
    <img 
      src="/payment-assets/unnamed-removebg-preview.png"
      alt="JazzCash" 
      className="w-full h-full object-contain"
      loading="eager"
    />
  </div>
);

// EasyPaisa Logo Component
export const EasyPaisaLogo: React.FC<{ className?: string }> = ({ className = "w-20 h-20" }) => (
  <div className={`${className} flex items-center justify-center bg-white rounded-lg p-3 border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all`}>
    <img 
      src="/payment-assets/download-removebg-preview (1).png"
      alt="EasyPaisa" 
      className="w-full h-full object-contain"
      loading="eager"
    />
  </div>
);

// Bank Transfer Logo Component
export const BankTransferLogo: React.FC<{ className?: string }> = ({ className = "w-20 h-20" }) => (
  <div className={`${className} flex items-center justify-center bg-white rounded-lg p-3 border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all`}>
    <img 
      src="/payment-assets/download-removebg-preview.png"
      alt="Bank Transfer" 
      className="w-full h-full object-contain"
      loading="eager"
    />
  </div>
);
