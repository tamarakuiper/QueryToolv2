// src/auth/Activate.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Activate() {
    const nav = useNavigate();
    const { activate } = useAuth();
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [ok, setOk] = useState(false);
    const [err, setErr] = useState("");

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr(""); setOk(false);
        if (pw !== pw2) return setErr("Passwords do not match");
        try {
            await activate(email, pw);
            setOk(true);
            setTimeout(() => nav("/login"), 1000);
        } catch (ex) {
            setErr(ex?.response?.data || "Activation failed");
        }
    };

    return (
        <div className="max-w-sm mx-auto mt-16 space-y-4">
            <h1 className="text-xl font-semibold">Activate account</h1>
            {err && <div className="text-red-600 bg-red-50 p-2 border rounded">{String(err)}</div>}
            {ok && <div className="text-green-700 bg-green-50 p-2 border rounded">Activated! Redirecting...</div>}
            <form className="space-y-3" onSubmit={onSubmit}>
                <input className="border w-full px-3 py-2 rounded" placeholder="Email"
                    value={email} onChange={e => setEmail(e.target.value)} />
                <input className="border w-full px-3 py-2 rounded" placeholder="Password" type="password"
                    value={pw} onChange={e => setPw(e.target.value)} />
                <input className="border w-full px-3 py-2 rounded" placeholder="Confirm password" type="password"
                    value={pw2} onChange={e => setPw2(e.target.value)} />
                <button className="w-full bg-black text-white px-3 py-2 rounded">Activate</button>
            </form>
            <div className="text-sm text-gray-600">
                <Link className="underline" to="/login">Back to login</Link>
            </div>
        </div>
    );
}
