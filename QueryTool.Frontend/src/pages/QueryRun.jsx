import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate, useParams } from "react-router-dom";

export default function QueryRun() {
    const { firmId: firmIdParam, queryId: queryIdParam } = useParams();
    const nav = useNavigate();

    const [firms, setFirms] = useState([]);
    const [firmId, setFirmId] = useState(firmIdParam || "");     // ← seed from URL
    const [queries, setQueries] = useState([]);
    const [queryId, setQueryId] = useState(queryIdParam || "");  // ← seed from URL
    const [params, setParams] = useState({});
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Keep state in sync if user navigates via back/forward or link changes the URL
    useEffect(() => {
        if (firmIdParam && firmIdParam !== firmId) setFirmId(firmIdParam);
        if ((queryIdParam || "") !== queryId) setQueryId(queryIdParam || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firmIdParam, queryIdParam]);

    // Load all firms; only fall back to first firm if URL didn't provide one
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { data } = await api.get("/catalog/firms");
                const list = Array.isArray(data) ? data : [];
                if (!mounted) return;
                setFirms(list);
                if (!firmId && list.length) setFirmId(String(list[0].id)); // only if no firm in URL
            } catch (err) {
                console.error("Failed to load firms", err);
            }
        })();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load queries whenever firm changes; if URL has a queryId, select it (if present)
    useEffect(() => {
        if (!firmId) {
            setQueries([]);
            setQueryId("");
            return;
        }
        let mounted = true;
        (async () => {
            try {
                const { data } = await api.get(`/catalog/firms/${firmId}/queries`);
                const list = Array.isArray(data) ? data : [];
                if (!mounted) return;
                setQueries(list);

                // If URL had a queryId, ensure it's selected when present
                if (queryIdParam) {
                    const exists = list.some(q => String(q.id) === String(queryIdParam));
                    if (exists) setQueryId(String(queryIdParam));
                    else if (list.length && !queryId) setQueryId(String(list[0].id));
                } else if (list.length && !queryId) {
                    // no URL queryId: pick first for convenience
                    setQueryId(String(list[0].id));
                }
            } catch (err) {
                console.error("Failed to load queries", err);
            }
        })();
        return () => { mounted = false; };
        // include queryIdParam so we re-check URL target when it changes
    }, [firmId, queryIdParam]);

    // Find the selected query object
    const selectedQuery = useMemo(
        () => queries.find((q) => String(q.id) === String(queryId)),
        [queries, queryId]
    );

    const paramNames = useMemo(() => extractParamNames(selectedQuery?.sql || ""), [selectedQuery]);

    // When changing query, reset params & results
    useEffect(() => {
        setParams({});
        setResult(null);
        setError("");
    }, [queryId]);

    // Change handler that also updates the URL (keeps deep-linking accurate)
    function handleQueryChange(e) {
        const id = e.target.value;
        setQueryId(id);
        // reflect selection in the URL; use replace so back button isn’t spammy
        if (firmId && id) nav(`/firms/${firmId}/queries/${id}`, { replace: true });
    }

    // Build payload: comma-separated => array (trimmed), try number casting
    function normalizeParams(p) {
        const out = {};
        for (const [k, v] of Object.entries(p)) {
            if (typeof v !== "string") { out[k] = v; continue; }
            if (v.includes(",")) {
                out[k] = v.split(",").map(x => x.trim()).filter(Boolean).map(castMaybeNumber);
            } else {
                out[k] = castMaybeNumber(v.trim());
            }
        }
        return out;
    }

    function castMaybeNumber(s) {
        if (s === "") return s;
        if (/^-?\d+(\.\d+)?$/.test(s)) {
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        return s;
    }

    async function runQuery() {
        if (!queryId || !firmId) return;
        setBusy(true); setError(""); setResult(null);
        try {
            const payload = { ...normalizeParams(params), firmId: Number(firmId) };
            const legacyEnvelope = {

   QueryExecutorModel: {
     FirmID: Number(firmId),
     QueryID: Number(queryId),
     QueryParameters: Object.entries(normalizeParams(params)).map(([Name, value]) => {
       if (Array.isArray(value)) return { Name, Values: value };
       return { Name, Value: value };
     })
   },
   PagingModel: { Start: 0, Limit: 10 } // keep if you need paging in SQL, otherwise omit or set defaults
};
const { data } = await api.post(`/queries`, legacyEnvelope);
setResult(data);
        } catch (err) {
            console.error(err);
            setError(err?.response?.data?.message || "Query execution failed");
        } finally {
            setBusy(false);
        }
    }

    function extractParamNames(sql) {
        if (!sql) return [];

        // 1) remove comments
        const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, "");
        const clean = noBlock.replace(/--.*$/gm, "");

        // 2) collect all names that are declared as locals
        const declared = new Set();
        const declRe = /DECLARE\s+([^;]+);?/gi;
        let m;
        while ((m = declRe.exec(clean)) !== null) {
            const declChunk = m[1]; // e.g. "@a int, @b varchar(10) = 'x'"
            for (const at of declChunk.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)) {
                declared.add(at[1]); // name without '@'
            }
        }

        // 3) collect all @names (ignore @@server variables)
        const all = new Set();
        for (const at of clean.matchAll(/(?<!@)@([A-Za-z_][A-Za-z0-9_]*)/g)) {
            const name = at[1];
            if (!declared.has(name)) all.add(name);
        }

        return [...all];
    }


    function exportCsv() {
        if (!result?.rows?.length) return;
        const cols = result.columns || Object.keys(result.rows[0]);
        const esc = (v) => {
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [];
        lines.push(cols.map(esc).join(","));
        for (const row of result.rows) lines.push(cols.map((c) => esc(row[c])).join(","));
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const qname = (selectedQuery?.name || "query").replace(/[^\w.-]+/g, "_");
        a.download = `${qname}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const firmName =
        firms.find((f) => String(f.id) === String(firmId))?.firmName ||
        firms.find((f) => String(f.id) === String(firmId))?.name ||
        "-";

    return (
        <div className="space-y-6">
            <h1 className="text-xl font-semibold">Run Query</h1>

            {/* Firm (fixed, from URL) */}
            <section>
                <div className="text-xs uppercase text-gray-500 mb-1">Firm</div>
                <div className="text-base font-medium">{firmName}</div>
            </section>

            {/* Query selector with buttons inline */}
            <section>
                <label className="text-xs uppercase text-gray-500 block mb-1">Query</label>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <select
                        className="border px-3 py-2 rounded flex-1"
                        value={queryId}
                        onChange={handleQueryChange}
                        disabled={!firmId || !queries.length}
                    >
                        <option value="">Select a query...</option>
                        {queries.map((q) => (
                            <option key={q.id} value={q.id}>
                                {q.name}
                            </option>
                        ))}
                    </select>

                    <button
                        className="border px-3 py-2 rounded bg-black text-white disabled:opacity-50"
                        onClick={runQuery}
                        disabled={!queryId || busy}
                    >
                        {busy ? "Running..." : "Execute"}
                    </button>

                    <button
                        className="border px-3 py-2 rounded disabled:opacity-50"
                        onClick={exportCsv}
                        disabled={!result?.rows?.length}
                    >
                        Export CSV
                    </button>
                </div>

                {selectedQuery?.description && (
                    <div className="text-sm text-gray-600 mt-1">{selectedQuery.description}</div>
                )}
            </section>

            {/* Dynamic parameters */}
            {queryId && paramNames.length > 0 && (
                <section className="border rounded p-4">
                    <div className="font-medium mb-2">Parameters</div>
                    <div className="text-xs text-gray-500 mb-3">
                        For multi-value filters, enter values separated by commas (e.g. <code>1234456, 1234568, 4598094</code>).
                    </div>
                    <div className="grid md:grid-cols-3 gap-3">
                        {paramNames.map((p) => (
                            <input
                                key={p}
                                className="border px-3 py-2 rounded"
                                placeholder={p}
                                value={params[p] ?? ""}
                                onChange={(e) => setParams((prev) => ({ ...prev, [p]: e.target.value }))}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Error */}
            {error && <div className="text-red-600 bg-red-50 p-2 border rounded">{error}</div>}

            {/* Results */}
            {result?.rows?.length > 0 && (
                <div className="overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                                {(result.columns || Object.keys(result.rows[0] || {})).map((col) => (
                                    <th key={col} className="px-3 py-2 text-left font-medium">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.map((row, i) => (
                                <tr key={i} className="border-t">
                                    {(result.columns || Object.keys(row)).map((col) => (
                                        <td key={col} className="px-3 py-2">
                                            {String(row[col] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!busy && !result?.rows?.length && !error && (
                <div className="text-gray-500 text-sm">
                    Choose a query and click Execute. Parameters will appear automatically if required.
                </div>
            )}
        </div>
    );
}
