/* Loads TinyMCE from the official Tiny Cloud CDN and exposes a promise to the UI layer. */
(() => {
  const config = window.TRAVELSTORY_CONFIG || {};
  const apiKey = String(config.tinyMceApiKey || "no-api-key").trim();
  window.TinyMCEReady = new Promise(resolve => {
    if (!apiKey || apiKey === "no-api-key") {
      resolve({ loaded: false, configured: false });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://cdn.tiny.cloud/1/${encodeURIComponent(apiKey)}/tinymce/7/tinymce.min.js`;
    script.referrerPolicy = "origin";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve({ loaded: true, configured: true });
    script.onerror = () => resolve({ loaded: false, configured: true });
    document.head.appendChild(script);
  });
})();
