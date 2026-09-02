// A lightweight device fingerprinting utility
// Generates a hash based on persistent browser characteristics to detect multi-account abuse

export async function getDeviceFingerprint(): Promise<string> {
  try {
    // Collect relatively stable browser characteristics
    const components = [
      navigator.userAgent,
      navigator.language,
      navigator.hardwareConcurrency || 'unknown',
      'deviceMemory' in navigator ? (navigator as unknown as { deviceMemory: number }).deviceMemory : 'unknown',
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      !!window.indexedDB,
      'openDatabase' in (window as unknown as Record<string, unknown>),
      (navigator as any).platform || 'unknown',
      navigator.doNotTrack || 'unknown',
      navigator.maxTouchPoints || 0
    ];

    // Attempt to get a canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#D97757';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('THORX Fingerprint', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('THORX Fingerprint', 4, 17);
        components.push(canvas.toDataURL());
      }
    } catch (e) {
      // Ignore canvas errors
    }

    // Hash the components
    const fingerprintString = components.join('|||');
    return await hashString(fingerprintString);
  } catch (error) {
    // Fingerprint failure is non-fatal — silently fall back to empty string
    // Fallback if APIs are completely blocked
    return "fallback-" + Math.random().toString(36).substring(2, 15);
  }
}

// Simple SHA-256 hash
async function hashString(str: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
