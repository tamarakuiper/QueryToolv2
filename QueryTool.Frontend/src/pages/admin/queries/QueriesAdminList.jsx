import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api";

export default function QueriesAdmin() {
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError("");
            try {
                const { data } = await api.get("/admin/queries");
                setItems(Array.isArray(data) ? data : []);
            } catch (e) {
                // Fallback: stitch from firms & global bucket (firmId=0)
                try {
                    const firmsRes = await api.get("/catalog/firms");
                    const firms = Array.isArray(firmsRes.data) ? firmsRes.data : [];
                    const firmBuckets = [{ id: 0, firmName: "All (global)" }, ...firms];

                    const all = [];
                    for (const f of firmBuckets) {
                        try {
                            const qs = await api.get(`/catalog/firms/${f.id}/queries`);
                            const rows = Array.isArray(qs.data) ? qs.data : [];
                            for (const q of rows) {
                                all.push({
                                    id: q.id,
                                    firmId: q.firmId ?? f.id,
                                    firmName: q.firmName ?? f.firmName ?? (q.firmId === 0 ? "All (global)" : ""),
                                    name: q.name,
                                    description: q.description,
                                    // hide q.sql in list view
                                    queryTypeId: q.queryTypeId ?? q.typeId ?? null,
                                    isAggregate: q.isAggregate ?? false
                                });
                            }
                        } catch { /* ignore per-firm errors */ }
                    }
                    setItems(all);
                } catch (err) {
                    console.error(err);
                    setError("Failed to load queries.");
                    setItems([]);
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (!filter.trim()) return items;
        const f = filter.toLowerCase();
        return items.filter((q) =>
            (q.name || "").toLowerCase().includes(f) ||
            (q.description || "").toLowerCase().includes(f) ||
            (q.firmName || "").toLowerCase().includes(f)
        );
    }, [items, filter]);

    async function remove(q) {
        if (!window.confirm(`Delete "${q.name}"?`)) return;
        try {
            await api.delete(`/admin/queries/${q.id}`);
            setItems((lst) => lst.filter((x) => x.id !== q.id));
        } catch (e) {
            console.error(e);
            alert("Delete failed.");
        }
    }

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Query Management</h1>
                <button
                    className="border px-3 py-2 rounded bg-black text-white"
                    onClick={() => navigate("/admin/queries/new")}
                >
                    New Query
                </button>
            </div>

            <div className="flex gap-2 items-center">
                <input
                    className="border px-3 py-2 rounded w-full md:w-96"
                    placeholder="Search by name, description, firm..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <div className="text-sm text-gray-600">
                    {filtered.length} {filtered.length === 1 ? "item" : "items"}
                </div>
            </div>

            {error && (
                <div className="text-red-600 bg-red-50 p-2 border rounded">{error}</div>
            )}

            <div className="border rounded overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left p-2 w-40">Firm</th>
                            <th className="text-left p-2 w-56">Name</th>
                            <th className="text-left p-2">Description</th>
                            <th className="text-left p-2 w-28">Type ID</th>
                            <th className="text-left p-2 w-28">Aggregate</th>
                            <th className="text-right p-2 w-40">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td className="p-4" colSpan={7}>Loading...</td></tr>
                        ) : filtered.length ? (
                            filtered.map((q) => (
                                <tr key={q.id} className="border-t align-top">
                                    <td className="p-2">
                                        {q.firmId === 0 ? "All (global)" : (q.firmName || q.firmId)}
                                    </td>
                                    <td className="p-2 font-medium">{q.name}</td>
                                    <td className="p-2">{q.description}</td>
                                    <td className="p-2">{q.queryTypeId ?? ""}</td>
                                    <td className="p-2">{q.isAggregate ? "Yes" : "No"}</td>
                                    <td className="p-2 text-right space-x-2 whitespace-nowrap">
                                        <button
                                            className="px-2 py-1 border rounded"
                                            onClick={() => navigate(`/admin/queries/${q.id}`)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="px-2 py-1 border rounded"
                                            onClick={() => remove(q)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td className="p-4 text-center text-gray-500" colSpan={7}>No queries</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
