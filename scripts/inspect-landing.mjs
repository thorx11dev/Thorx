const targetUrl = "http://127.0.0.1:4173/";
const viewport = {
  width: Number(process.argv[2] || 390),
  height: Number(process.argv[3] || 844),
  mobile: process.argv[4] !== "desktop",
};

const targetResponse = await fetch(
  `http://127.0.0.1:9222/json/new?${encodeURIComponent(targetUrl)}`,
  { method: "PUT" },
);
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);
  if (!resolve) return;
  pending.delete(message.id);
  resolve(message);
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: viewport.width,
  height: viewport.height,
  deviceScaleFactor: 1,
  mobile: viewport.mobile,
  screenWidth: viewport.width,
  screenHeight: viewport.height,
});
await send("Page.navigate", { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 5000));

const result = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const style = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      return { opacity: computed.opacity, transform: computed.transform, overflow: computed.overflow, display: computed.display };
    };
    const blockers = [...document.querySelectorAll(".landing-page [style]")]
      .filter((node) => node.style.position === "absolute" && node.style.backgroundColor)
      .map((node) => ({ color: node.style.backgroundColor, transform: node.style.transform, rect: (() => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })() }));
    return {
      inner: { width: window.innerWidth, height: window.innerHeight },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth },
      landing: rect(".landing-page"),
      header: rect(".landing-header-shell"),
      wordmark: rect(".landing-wordmark"),
      hero: rect(".landing-hero-section"),
      heroHeading: rect(".landing-hero-heading"),
      barcode: rect(".landing-hero-barcode"),
      prompt: rect(".landing-hero-prompt"),
      headingStyle: style(".landing-hero-heading"),
      wordmarkStyle: style(".landing-wordmark"),
      blockers,
      active: document.querySelector(".cinematic-section.active")?.getAttribute("data-section"),
      ready: document.readyState,
    };
  })()`,
});
console.log(JSON.stringify(result.result?.value ?? result, null, 2));
socket.close();
