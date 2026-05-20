// src/pages/admin/UsersAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

export default function UsersAdmin() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ email: "", displayName: "", isAdmin: false, isEnabled: false });
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s
            ? items.filter(x =>
                (x.email || "").toLowerCase().includes(s) ||
                (x.displayName || "").toLowerCase().includes(s)
            )
            : items;
    }, [items, q]);

    async function load() {
        const { data } = await api.get("/admin/users");
        setItems(data);
    }

    useEffect(() => { load(); }, []);

    async function create(e) {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post("/admin/users", {
                email: form.email,
                displayName: form.displayName,
                isAdmin: !!form.isAdmin,
                isEnabled: !!form.isEnabled, // backend may ignore and default to disabled
            });
            setForm({ email: "", displayName: "", isAdmin: false, isEnabled: false });
            await load();
        } finally {
            setLoading(false);
        }
    }

    async function setAdmin(u, val) {
        await api.put(`/admin/users/${u.id}`, {
            displayName: u.displayName,
            isAdmin: val,
            isEnabled: u.isEnabled,
        });
        await load();
    }

    // Toggle enabled via checkbox
    async function setEnabled(u, val) {
        await api.put(`/admin/users/${u.id}`, {
            displayName: u.displayName,
            isAdmin: u.isAdmin,
            isEnabled: val,
        });
        await load();
    }

    // HARD DELETE (uses dedicated endpoint that deletes dependents first)
    async function deleteHard(u) {
        if (!window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
        await api.delete(`/admin/users/${u.id}/hard`);
        await load();
    }

    return (
        <div>
            <h1 className="text-xl font-semibold mb-4">Users</h1>

            {/* Create */}
            <form onSubmit={create} className="grid md:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 mb-4 items-center">
                <input
                    className="border px-3 py-2 rounded"
                    placeholder="Email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                />
                <input
                    className="border px-3 py-2 rounded"
                    placeholder="Display name"
                    value={form.displayName}
                    onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                />
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!form.isAdmin}
                        onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                    />
                    Admin
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!form.isEnabled}
                        onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))}
                    />
                    Enabled
                </label>
                <button disabled={loading} className="border px-4 py-2 rounded bg-black text-white">
                    {loading ? "Creating..." : "Create"}
                </button>
            </form>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">{filtered.length} users</div>
                <input
                    className="border px-3 py-2 rounded text-sm"
                    placeholder="Search.."
                    value={q}
                    onChange={e => setQ(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="border rounded overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left p-2">ID</th>
                            <th className="text-left p-2">Email</th>
                            <th className="text-left p-2">Name</th>
                            <th className="text-left p-2">Admin</th>
                            <th className="text-left p-2">Enabled</th>
                            <th className="text-left p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(u => (
                            <tr key={u.id} className="border-t">
                                <td className="p-2">{u.id}</td>
                                <td className="p-2">
                                    <div className="flex items-center gap-2">
                                        <span>{u.email}</span>
                                        <span
                                            className={[
                                                "text-[10px] rounded px-1.5 py-0.5",
                                                u.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                                            ].join(" ")}
                                        >
                                            {u.isEnabled ? "ENABLED" : "DISABLED"}
                                        </span>
                                        <span
                                            className={[
                                                "text-[10px] rounded px-1.5 py-0.5",
                                                u.isAdmin ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                                            ].join(" ")}
                                        >
                                            {u.isAdmin ? "ADMIN" : ""}
                                        </span>
                                    </div>
                                </td>
                                <td className="p-2">{u.displayName}</td>
                                <td className="p-2">
                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!u.isAdmin}
                                            onChange={e => setAdmin(u, e.target.checked)}
                                        />
                                        {u.isAdmin ? "Yes" : "No"}
                                    </label>
                                </td>
                                <td className="p-2">
                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!u.isEnabled}
                                            onChange={e => setEnabled(u, e.target.checked)}
                                        />
                                        {u.isEnabled ? "Yes" : "No"}
                                    </label>
                                </td>
                                <td className="p-2 text-right">
                                    <button
                                        onClick={() => deleteHard(u)}
                                        className="px-2 py-1 border rounded hover:bg-gray-50 text-red-600"
                                        title="Permanently delete user"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!filtered.length && (
                            <tr>
                                <td className="p-4 text-center text-gray-500" colSpan={6}>
                                    No users
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-gray-500 mt-3">
                Tip: Enable a newly registered user, then they can set their password on the Activate tab.
            </p>
        </div>
    );
}
