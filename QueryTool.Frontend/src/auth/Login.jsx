// src/auth/Login.jsx
import React, { useMemo, useState } from "react";
import { api } from "../api";

const ALLOWED_DOMAINS = ["@adhesionwealth.com", "@assetmark.com"];

function isAllowedDomain(email) {
    const e = (email || "").trim().toLowerCase();
    return ALLOWED_DOMAINS.some(d => e.endsWith(d));
}

export default function Login() {
    const [mode, setMode] = useState("login"); // "login" | "register" | "activate"
    const [form, setForm] = useState({ email: "", password: "", displayName: "" });
    const [msg, setMsg] = useState("");
    const [ok, setOk] = useState(false);
    const [busy, setBusy] = useState(false);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const emailAllowed = useMemo(() => isAllowedDomain(form.email), [form.email]);
    const emailTouched = form.email?.length > 0;

    async function doLogin(e) {
        e.preventDefault();
        setMsg(""); setOk(false); setBusy(true);
        try {
            await api.post("/auth/login", { email: form.email, password: form.password });
            window.location.href = "/";
        } catch (err) {
            setMsg(err.response?.data || "Login failed");
        } finally {
            setBusy(false);
        }
    }

    async function doRegister(e) {
        e.preventDefault();
        setMsg(""); setOk(false);

        if (!emailAllowed) {
            setMsg("Registration is limited to @adhesionwealth.com and @assetmark.com email addresses.");
            return;
        }

        setBusy(true);
        try {
            await api.post("/auth/register", {
                email: form.email,
                displayName: form.displayName,
            });
            setOk(true);
            setMsg("Registered. Ask an admin to enable your account. Once enabled, go to Activate to set a password.");
            setMode("activate");
        } catch (err) {
            setMsg(err.response?.data || "Register failed");
        } finally {
            setBusy(false);
        }
    }

    async function doActivate(e) {
        e.preventDefault();
        setMsg(""); setOk(false); setBusy(true);
        try {
            await api.post("/auth/activate", { email: form.email, password: form.password });
            setOk(true);
            setMsg("Activated. You can now log in.");
            setMode("login");
        } catch (err) {
            setMsg(err.response?.data || "Activation failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white shadow-lg rounded-2xl p-8">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">QueryTool</h1>
                        <p className="text-sm text-gray-500 mt-1">Sign in, register, or activate your account</p>
                    </div>

                    {/* Tabs */}
                    <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
                        <TabButton active={mode === "login"} onClick={() => setMode("login")}>Login</TabButton>
                        <TabButton active={mode === "register"} onClick={() => setMode("register")}>Register</TabButton>
                        <TabButton active={mode === "activate"} onClick={() => setMode("activate")}>Activate</TabButton>
                    </div>

                    {/* Forms */}
                    {mode === "login" && (
                        <form onSubmit={doLogin} className="space-y-4">
                            <Field label="Email" type="email" name="email" value={form.email} onChange={onChange} required />
                            <Field label="Password" type="password" name="password" value={form.password} onChange={onChange} required />
                            <Submit busy={busy}>Login</Submit>
                        </form>
                    )}

                    {mode === "register" && (
                        <form onSubmit={doRegister} className="space-y-4">
                            <Field
                                label="Email"
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={onChange}
                                required
                                hint={`Allowed: ${ALLOWED_DOMAINS.join(", ")}`}
                                error={emailTouched && !emailAllowed ? "Email must end with @adhesionwealth.com or @assetmark.com" : ""}
                            />
                            <Field
                                label="Display name"
                                name="displayName"
                                value={form.displayName}
                                onChange={onChange}
                                placeholder="(optional)"
                            />
                            <Submit busy={busy} disabled={!emailAllowed}>Register</Submit>
                        </form>
                    )}

                    {mode === "activate" && (
                        <form onSubmit={doActivate} className="space-y-4">
                            <Field label="Email" type="email" name="email" value={form.email} onChange={onChange} required />
                            <Field label="New password" type="password" name="password" value={form.password} onChange={onChange} required />
                            <Submit busy={busy}>Activate</Submit>
                        </form>
                    )}

                    {msg && (
                        <p className={`mt-4 text-sm ${ok ? "text-green-600" : "text-red-600"}`} role={ok ? "status" : "alert"}>
                            {String(msg)}
                        </p>
                    )}
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                     ADH - QueryTool
                </p>
            </div>
        </div>
    );
}

/* ---------- Small UI helpers ---------- */

function TabButton({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "w-1/3 py-2 text-sm font-medium rounded-lg transition",
                active ? "bg-black text-white shadow" : "text-gray-500 hover:text-gray-900 hover:bg-gray-200",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function Field({ label, hint, error, ...inputProps }) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
            <input
                className={[
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2",
                    error
                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                        : "border-gray-300 focus:ring-black focus:border-black",
                ].join(" ")}
                {...inputProps}
            />
            {hint && !error && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
            {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
        </label>
    );
}

function Submit({ busy, disabled, children }) {
    return (
        <button
            type="submit"
            disabled={busy || disabled}
            className="w-full inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
            {busy ? "Please wait..." : children}
        </button>
    );
}
