import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function useDebounced(value, delay = 200) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return v;
}

function normalize(s) {
    return (s ?? "").toString().toLowerCase().trim();
}

export default function FirmsList() {
    const [firms, setFirms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [q, setQ] = useState("");
    const dq = useDebounced(q, 200);
    const nav = useNavigate();

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { data } = await api.get("/catalog/firms");
                if (mounted) setFirms(Array.isArray(data) ? data : []);
            } catch (e) {
                if (mounted) setErr(e?.response?.data || "Failed to load firms");
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const filtered = useMemo(() => {
        if (!dq) return firms;
        const terms = normalize(dq).split(/\s+/).filter(Boolean);
        return firms.filter(f => {
            const name = normalize(f.firmName ?? f.name ?? f.FirmName ?? f.Name);
            const hay = [name, normalize(f.code), normalize(f.id)].join(" ");
            return terms.every(t => hay.includes(t));
        });
    }, [firms, dq]);

    if (loading) return <div>Loading firms...</div>;
    if (err) return <div className="text-red-600 text-sm">{String(err)}</div>;
    if (!firms.length) return <div>No firms found.</div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold">Firms</h1>
                <div className="text-sm text-gray-500">
                    {filtered.length} / {firms.length}
                </div>
            </div>

            <div className="mb-4 flex gap-2">
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setQ(""); }}
                    placeholder="Search firms (name, code, id)..."
                    className="w-full border rounded px-3 py-2 outline-none focus:ring"
                    aria-label="Search firms"
                />
                {q && (
                    <button
                        onClick={() => setQ("")}
                        className="border rounded px-3 py-2"
                        aria-label="Clear search"
                    >
                        Clear
                    </button>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className="text-sm text-gray-600">No firms match “{q}”.</div>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(f => (
                        <button
                            key={f.id}
                            onClick={() => nav(`/firms/${f.id}/queries`)}
                            className="w-full text-left border rounded px-4 py-3 hover:bg-gray-50"
                        >
                            {f.firmName ?? f.name ?? f.FirmName ?? f.Name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
