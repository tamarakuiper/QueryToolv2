// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
    const [user, setUser] = useState(null);      // { id, email, displayName, isAdmin }
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");   // returns null or user object
            setUser(data || null);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const login = async (email, password) => {
        await api.post("/auth/login", { email, password });
        await refresh();
    };

    const logout = async () => {
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

    const value = { user, loading, login, logout, register, activate, refresh };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
