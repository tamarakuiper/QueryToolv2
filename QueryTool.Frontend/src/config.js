// src/config.js
export function getRuntime() {
    return window.__RUNTIME_CONFIG__ || {};
}

export function getEnv() {
    return getRuntime().ENVIRONMENT || "development";
}

// src/config.js
// Priority: runtime override -> Vite env -> fallback
export function getApiBase() {
  // Allow changing base URL at runtime by setting window.__API_BASE__ in index.html
  if (typeof window !== "undefined" && window.__API_BASE__) return window.__API_BASE__;
  // Use Vite env per mode (.env.development, .env.staging, .env.production)
  if (import.meta.env?.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  // Fallback: dev proxy or reverse-proxy path
  return "/api";
}


export function getFrontendBase() {
    const env = getEnv();
    const endpoints = getRuntime().ENDPOINTS?.[env];
    return endpoints?.frontends?.primary || window.location.origin;
}
