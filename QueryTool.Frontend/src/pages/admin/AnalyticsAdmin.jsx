import React, { useEffect, useState } from "react";
import { api } from "../../api";

function fmt(d) { return new Date(d).toLocaleString(); }

export default function AnalyticsAdmin() {
    const [from, setFrom] = useState(() =>
        new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 16)
    );
    const [to, setTo] = useState(() =>
        new Date().toISOString().slice(0, 16)
    );
    const [firmId, setFirmId] = useState("");
    const [firms, setFirms] = useState([]);

    // UI-friendly shapes
    const [usage, setUsage] = useState({ top: [], total: 0 });
    const [users, setUsers] = useState({ top: [], total: 0 });
    const [series, setSeries] = useState([]);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/catalog/firms");
                setFirms(data ?? []);
            } catch (e) {
                console.error(e);
                setErr("Failed to load firms.");
            }
        })();
    }, []);

    async function run() {
        setErr("");
        const fromIso = new Date(from).toISOString();
        const toIso = new Date(to).toISOString();

        try {
            const qs = new URLSearchParams({
                from: fromIso,
                to: toIso,
                ...(firmId ? { firmId } : {}),
            }).toString();

            // --- Call the correct admin analytics endpoints ---
            const [usageRes, usersRes, tsRes] = await Promise.all([
                api.get(`/admin/analytics/query-usage?${qs}`),
                api.get(`/admin/analytics/user-activity?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
                api.get(`/admin/analytics/timeseries?bucket=day&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
            ]);

            // --- Normalize to UI shape ---
            // Backend DTOs likely: QueryUsageDto { Top: [{ Name, RunCount }], TotalExecutions }
            const u = usageRes.data || {};
            setUsage({
                top: (u.top ?? u.Top ?? []).map(it => ({
                    name: it.name ?? it.Name,
                    count: it.count ?? it.RunCount ?? it.runCount ?? 0,
                })),
                total: u.total ?? u.TotalExecutions ?? 0,
            });

            // Backend DTOs likely: UserActivityDto { Top: [{ User, RunCount }], TotalUsers }
            const a = usersRes.data || {};
            setUsers({
                top: (a.top ?? a.Top ?? []).map(it => ({
                    user: it.user ?? it.User,
                    count: it.count ?? it.RunCount ?? it.runCount ?? 0,
                })),
                total: a.total ?? a.TotalUsers ?? 0,
            });

            // Backend DTO: TimeseriesDto { Points: [{ At, Count }] }
            const t = tsRes.data || {};
            const pts = (t.points ?? t.Points ?? []).map(p => ({
                at: p.at ?? p.At,
                count: p.count ?? p.Count ?? 0,
            }));
            setSeries(pts);
        } catch (e) {
            console.error(e);
            setErr("Analytics request failed.");
        }
    }

    return (
        <div className="grid gap-6">
            <h1 className="text-xl font-semibold">Analytics</h1>

            <div className="grid md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                <div>
                    <label className="text-xs text-gray-600">From</label>
                    <input
                        type="datetime-local"
                        className="border px-3 py-2 rounded w-full"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-600">To</label>
                    <input
                        type="datetime-local"
                        className="border px-3 py-2 rounded w-full"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-600">Firm (optional)</label>
                    <select
                        className="border px-3 py-2 rounded w-full"
                        value={firmId}
                        onChange={(e) => setFirmId(e.target.value)}
                    >
                        <option value="">All firms</option>
                        {firms.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.firmName}
                            </option>
                        ))}
                    </select>
                </div>
                <button className="border px-4 py-2 rounded bg-black text-white" onClick={run}>
                    Run
                </button>
            </div>

            {err && <div className="text-red-600 text-sm">{err}</div>}

            <div className="grid md:grid-cols-2 gap-6">
                <section className="border rounded">
                    <div className="p-3 font-medium border-b">Top Queries</div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="text-left p-2">Query Name</th>
                                <th className="text-left p-2">Description</th>
                                <th className="text-left p-2">Firm</th>
                                <th className="text-right p-2">Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usage.top?.map((x, i) => (
                                <tr key={i} className="border-t">
                                    <td className="p-2 font-medium">{x.name}</td>
                                    <td className="p-2 text-gray-600">{x.description || "-"}</td>
                                    <td className="p-2 text-gray-600">{x.firmName || "Global"}</td>
                                    <td className="p-2 text-right">{x.count}</td>
                                </tr>
                            ))}
                            {!usage.top?.length && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-center text-gray-500">
                                        No data
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>


                <section className="border rounded">
                    <div className="p-3 font-medium border-b">Top Users</div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="text-left p-2">User</th>
                                <th className="text-left p-2">Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.top?.map((x, i) => (
                                <tr key={i} className="border-t">
                                    <td className="p-2">{x.user}</td>
                                    <td className="p-2">{x.count}</td>
                                </tr>
                            ))}
                            {!users.top?.length && (
                                <tr>
                                    <td className="p-4 text-center text-gray-500" colSpan={2}>
                                        No data
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="p-2 text-gray-500">Active users</td>
                                <td className="p-2">{users.total || 0}</td>
                            </tr>
                        </tfoot>
                    </table>
                </section>
            </div>

            <section className="border rounded">
                <div className="p-3 font-medium border-b">Executions Over Time</div>
                <div className="p-3">
                    {series.length ? (
                        <div className="grid gap-1 text-sm">
                            {series.map((p, i) => (
                                <div key={i} className="flex justify-between border-b py-1">
                                    <span className="text-gray-600">{fmt(p.at)}</span>
                                    <span className="font-medium">{p.count}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-500 text-sm">No data</div>
                    )}
                </div>
            </section>
        </div>
    );
}
