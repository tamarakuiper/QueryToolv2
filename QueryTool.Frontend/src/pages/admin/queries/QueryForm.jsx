// src/pages/admin/queries/QueryForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api";

export default function QueryForm({ mode }) {
    const nav = useNavigate();
    const { id } = useParams(); // present in edit mode
    const isEdit = mode === "edit";

    const [firms, setFirms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    // Form fields
    const [firmId, setFirmId] = useState(0); // 0 = Global
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [sql, setSql] = useState("");
    const [queryTypeId, setQueryTypeId] = useState(1);
    const [isAggregate, setIsAggregate] = useState(false);

    const title = useMemo(
        () => (isEdit ? "Edit Query" : "Create Query"),
        [isEdit]
    );

    useEffect(() => {
        (async () => {
            try {
                setErr("");
                const [firmsResp, queryResp] = await Promise.all([
                    api.get("/catalog/firms"),
                    isEdit ? api.get(`/admin/queries/${id}`) : Promise.resolve({ data: null }),
                ]);

                setFirms(firmsResp.data || []);

                if (isEdit && queryResp?.data) {
                    const q = queryResp.data;
                    setFirmId(Number(q.firmId ?? 0));            // 0 => global
                    setName(q.name ?? "");
                    setDescription(q.description ?? "");
                    setSql(q.sql ?? "");
                    setQueryTypeId(Number(q.queryTypeId ?? 1));
                    setIsAggregate(Boolean(q.isAggregate));
                }
            } catch (ex) {
                setErr(ex?.response?.data?.message || "Failed to load data");
            } finally {
                setLoading(false);
            }
        })();
    }, [id, isEdit]);

    async function onSubmit(e) {
        e.preventDefault();
        setSaving(true);
        setErr("");

        const payload = {
            name,
            description,
            sql,
            // IMPORTANT: keep 0 for global, do NOT convert to null
            firmId: Number(firmId),
            queryTypeId: Number(queryTypeId) || 1,
            isAggregate: Boolean(isAggregate),
        };

        try {
            if (isEdit) {
                await api.put(`/admin/queries/${id}`, payload);
            } else {
                await api.post(`/admin/queries`, payload);
            }
            nav("/admin/queries");
        } catch (ex) {
            setErr(ex?.response?.data?.message || "Save failed");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">{title}</h1>
                <button onClick={() => nav(-1)} className="border px-3 py-2 rounded">
                    Back
                </button>
            </div>

            {err && <div className="text-red-600 text-sm">{err}</div>}

            {loading ? (
                <div>Loading...</div>
            ) : (
                <form onSubmit={onSubmit} className="border rounded p-4 grid gap-3">
                    {/* Scope (Firm) */}
                    <label className="grid gap-1">
                        <span className="text-sm text-gray-600">Scope</span>
                        <select
                            className="border px-3 py-2 rounded"
                            value={firmId}
                            onChange={(e) => setFirmId(Number(e.target.value))}
                        >
                            <option value={0}>Global (all firms)</option>
                            {firms.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.firmName}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-gray-500">
                            Choose “Global” to make this query available to all firms.
                        </span>
                    </label>

                    {/* Name */}
                    <label className="grid gap-1">
                        <span className="text-sm text-gray-600">Name</span>
                        <input
                            className="border px-3 py-2 rounded"
                            placeholder="Query name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </label>

                    {/* Description */}
                    <label className="grid gap-1">
                        <span className="text-sm text-gray-600">Description</span>
                        <input
                            className="border px-3 py-2 rounded"
                            placeholder="What this query does..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </label>

                    {/* SQL */}
                    <label className="grid gap-1">
                        <span className="text-sm text-gray-600">SQL</span>
                        <textarea
                            className="border px-3 py-2 rounded font-mono min-h-[220px]"
                            placeholder="SELECT ..."
                            value={sql}
                            onChange={(e) => setSql(e.target.value)}
                            required
                        />
                    </label>

                    {/* QueryTypeID */}
                    <label className="grid gap-1">
                        <span className="text-sm text-gray-600">Query Type ID</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            className="border px-3 py-2 rounded w-40"
                            value={queryTypeId}
                            onChange={(e) => setQueryTypeId(Number(e.target.value))}
                            title="Matches dbo.Query.QueryTypeID"
                        />
                    </label>

                    {/* IsAggregate */}
                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isAggregate}
                            onChange={(e) => setIsAggregate(e.target.checked)}
                        />
                        <span className="text-sm">Is Aggregate</span>
                    </label>

                    <div className="flex gap-2">
                        <button
                            disabled={saving}
                            className="border px-3 py-2 rounded bg-black text-white"
                        >
                            {saving ? "Saving..." : isEdit ? "Save" : "Create"}
                        </button>
                        <button
                            type="button"
                            onClick={() => nav("/admin/queries")}
                            className="border px-3 py-2 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
