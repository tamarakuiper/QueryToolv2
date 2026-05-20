// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [ready, setReady] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me"); // null or { id,email,displayName,isAdmin }
            setUser(data || null);
        } catch {
            setUser(null);
        } finally {
            setReady(true);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const login = async (email, password) => {
        await api.post("/auth/login", { email, password });
        await refresh();
    };

    const logout = async () => {
        // if you prefer GET with returnUrl, keep your logoutNav() instead
        await api.post("/auth/logout");
        setUser(null);
    };

    const register = async (email, displayName) => {
        const { data } = await api.post("/auth/register", { email, displayName });
        return data; // { id, email, displayName, enabled:false }
    };

    const activate = async (email, password) => {
        await api.post("/auth/activate", { email, password });
    };

    const value = { user, ready, login, logout, register, activate, refresh };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
