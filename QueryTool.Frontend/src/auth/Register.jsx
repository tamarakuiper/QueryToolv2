// src/auth/Register.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Register() {
    const { register } = useAuth();
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [ok, setOk] = useState(false);
    const [err, setErr] = useState("");

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr(""); setOk(false);
        try {
            await register(email, displayName || email);
            setOk(true);
        } catch (ex) {
            setErr(ex?.response?.data || "Registration failed");
        }
    };

    return (
        <div className="max-w-sm mx-auto mt-16 space-y-4">
            <h1 className="text-xl font-semibold">Create account</h1>
            {err && <div className="text-red-600 bg-red-50 p-2 border rounded">{String(err)}</div>}
            {ok && (
                <div className="text-green-700 bg-green-50 p-2 border rounded">
                    Account created in a <b>disabled</b> state. Now <Link className="underline" to="/activate">activate it</Link>.
                </div>
            )}
            <form className="space-y-3" onSubmit={onSubmit}>
                <input className="border w-full px-3 py-2 rounded" placeholder="Email"
                    value={email} onChange={e => setEmail(e.target.value)} />
                <input className="border w-full px-3 py-2 rounded" placeholder="Display name (optional)"
                    value={displayName} onChange={e => setDisplayName(e.target.value)} />
                <button className="w-full bg-black text-white px-3 py-2 rounded">Create</button>
            </form>
            <div className="text-sm text-gray-600">
                Already registered? <Link className="underline" to="/login">Back to login</Link>
            </div>
        </div>
    );
}
