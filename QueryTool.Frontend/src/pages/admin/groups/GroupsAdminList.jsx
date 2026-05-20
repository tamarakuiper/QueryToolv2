import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api";

export default function GroupsAdminList() {
    const nav = useNavigate();
    const [groups, setGroups] = useState([]);
    const [newName, setNewName] = useState("");
    const [renamingId, setRenamingId] = useState(null);
    const [renameText, setRenameText] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    async function load() {
        setErr("");
        try {
            const { data } = await api.get("/admin/groups");
            setGroups(data || []);
        } catch {
            setErr("Failed to load groups");
        }
    }
    useEffect(() => { load(); }, []);

    async function addGroup() {
        if (!newName.trim()) return;
        setBusy(true);
        try {
            await api.post("/admin/groups", { name: newName.trim() });
            setNewName("");
            await load();
        } finally { setBusy(false); }
    }

    async function saveRename(id) {
        if (!renameText.trim()) { setRenamingId(null); return; }
        setBusy(true);
        try {
            await api.put(`/admin/groups/${id}`, { name: renameText.trim() });
            setRenamingId(null);
            setRenameText("");
            await load();
        } finally { setBusy(false); }
    }

    async function del(id) {
        if (!window.confirm("Delete this group?")) return;
        setBusy(true);
        try {
            await api.delete(`/admin/groups/${id}`);
            await load();
        } finally { setBusy(false); }
    }

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Groups</h1>
                <button onClick={load} className="border px-3 py-2 rounded">Refresh</button>
            </div>

            {err && <div className="text-red-600 text-sm">{err}</div>}

            {/* Create */}
            <div className="flex gap-2 items-center">
                <input
                    className="border px-3 py-2 rounded w-full max-w-md"
                    placeholder="New group name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button
                    onClick={addGroup}
                    disabled={busy || !newName.trim()}
                    className="border px-4 py-2 rounded bg-black text-white disabled:opacity-80"
                >
                    Add
                </button>
            </div>

            {/* List */}
            <div className="border rounded divide-y">
                {groups.map(g => (
                    <div key={g.groupId} className="flex items-center justify-between p-3">
                        <div className="min-w-0 flex items-center gap-3">
                            {/* CLICKABLE NAME */}
                            <button
                                className="truncate font-medium text-left hover:underline"
                                onClick={() => nav(`/admin/groups/${g.groupId}`)}
                                title="Open group detail"
                            >
                                {g.name}
                            </button>

                            {renamingId === g.groupId && (
                                <div className="flex items-center gap-2">
                                    <input
                                        className="border px-2 py-1 rounded"
                                        value={renameText}
                                        onChange={(e) => setRenameText(e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        className="border px-2 py-1 rounded bg-black text-white"
                                        onClick={() => saveRename(g.groupId)}
                                        disabled={busy}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="border px-2 py-1 rounded"
                                        onClick={() => { setRenamingId(null); setRenameText(""); }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>


                        <div className="flex gap-2 shrink-0">
                            <button
                                className="border px-2 py-1 rounded"
                                onClick={() => nav(`/admin/groups/${g.groupId}`)}
                            >
                                Open
                            </button>
                            {renamingId !== g.groupId && (
                                <button
                                    className="border px-2 py-1 rounded"
                                    onClick={() => { setRenamingId(g.groupId); setRenameText(g.name || ""); }}
                                >
                                    Rename
                                </button>
                            )}
                            
                            <button
                                className="border px-2 py-1 rounded text-red-600"
                                onClick={() => del(g.groupId)}
                                disabled={busy}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
                {!groups.length && (
                    <div className="p-4 text-sm text-gray-500">No groups</div>
                )}
            </div>
        </div>
    );
}
