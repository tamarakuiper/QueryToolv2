import { api } from "../api";

const isProd = import.meta.env.MODE === "production";

function logoutNav() {
    const returnUrl = encodeURIComponent(window.location.origin + "/login");
    window.location.href = `/api/auth/logout?returnUrl=${returnUrl}`;
}

async function logoutXhr() {
    try { await api.post("/auth/logout-xhr"); } catch { }
    window.location.href = "/login";
}

export function useLogout() {
    return isProd ? logoutNav : logoutXhr;
}
