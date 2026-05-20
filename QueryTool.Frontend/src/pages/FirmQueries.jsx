import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate, useParams } from "react-router-dom";

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

export default function FirmQueries() {
    const { firmId } = useParams();
    const nav = useNavigate();
    const [queries, setQueries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const dq = useDebounced(q, 200);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        (async () => {
            try {
                const { data } = await api.get(`/catalog/firms/${firmId}/queries`);
                if (mounted) setQueries(data || []);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [firmId]);

    const filtered = useMemo(() => {
        if (!dq) return queries;
        const terms = normalize(dq).split(/\s+/).filter(Boolean);
        return queries.filter(qr => {
            const hay = [
                normalize(qr.name),
                normalize(qr.description),
                normalize(qr.tags?.join(" ")), // if you have tags
                normalize(qr.id),
            ].join(" ");
            return terms.every(t => hay.includes(t));
        });
    }, [queries, dq]);

    if (loading) return <div>Loading queries...</div>;
    if (!queries.length) return <div>No queries for this firm or you don’t have access.</div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold">Queries</h1>
                <div className="text-sm text-gray-500">
                    {filtered.length} / {queries.length}
                </div>
            </div>

            <div className="mb-4 flex gap-2">
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setQ(""); }}
                    placeholder="Search queries (name, description, tags)..."
                    className="w-full border rounded px-3 py-2 outline-none focus:ring"
                    aria-label="Search queries"
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
                <div className="text-sm text-gray-600">No queries match “{q}”.</div>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(qr => (
                        <button
                            key={qr.id}
                            onClick={() => nav(`/firms/${qr.firmId}/queries/${qr.id}`)}
                            className="w-full text-left border rounded px-4 py-3 hover:bg-gray-50"
                        >
                            <div className="font-medium">{qr.name}</div>
                            <div className="text-sm text-gray-600">{qr.description}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
