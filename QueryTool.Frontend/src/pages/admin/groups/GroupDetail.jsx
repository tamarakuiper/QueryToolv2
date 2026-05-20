// src/pages/admin/groups/GroupDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api";

export default function GroupDetail() {
    const { groupId } = useParams();
    const nav = useNavigate();

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [groupName, setGroupName] = useState("");

    // Users
    const [users, setUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState(new Set());
    const [userSearch, setUserSearch] = useState("");
    const filteredUsers = useMemo(() => {
        const s = userSearch.trim().toLowerCase();
        if (!s) return users;
        return users.filter(
            (u) =>
                (u.displayName || "").toLowerCase().includes(s) ||
                (u.email || "").toLowerCase().includes(s)
        );
    }, [users, userSearch]);
    const allUsersSelected =
        filteredUsers.length > 0 &&
        filteredUsers.every((u) => selectedUsers.has(u.id));

    // Firms & Queries
    const [firms, setFirms] = useState([]);
    const [queriesAll, setQueriesAll] = useState([]);
    const [selectedQueries, setSelectedQueries] = useState(new Set());
    const [firmFilter, setFirmFilter] = useState("all");
    const [qSearch, setQSearch] = useState("");

    const filteredQueries = useMemo(() => {
        const search = qSearch.trim().toLowerCase();
        return queriesAll.filter((q) => {
            const firmOk =
                firmFilter === "all"
                    ? true
                    : firmFilter === "0"
                        ? (q.firmId ?? 0) === 0
                        : String(q.firmId ?? "") === firmFilter;

            const textOk =
                !search ||
                (q.name || "").toLowerCase().includes(search) ||
                (q.description || "").toLowerCase().includes(search);

            return firmOk && textOk;
        });
    }, [queriesAll, firmFilter, qSearch]);

    async function load() {
        setLoading(true);
        setErr("");
        try {
            const [{ data: groupsData }] = await Promise.all([api.get("/admin/groups")]);
            const g = (groupsData || []).find((x) => String(x.groupId) === String(groupId));
            setGroupName(g?.name || `Group #${groupId}`);

            const [{ data: usersData }, { data: members }] = await Promise.all([
                api.get("/admin/users"),
                api.get(`/admin/groups/${groupId}/members`), // { userIds: [] }
            ]);
            setUsers(usersData || []);
            setSelectedUsers(new Set(members?.userIds || []));

            const [{ data: firmData }, { data: qAll }, { data: qAssigned }] = await Promise.all([
                api.get("/catalog/firms"),
                api.get("/admin/queries"),
                api.get(`/admin/groups/${groupId}/queries`),
            ]);

            setFirms([{ id: 0, firmName: "Global (all firms)" }, ...(firmData || [])]);
            setQueriesAll(qAll || []);
            setSelectedQueries(new Set((qAssigned || []).map((q) => q.id)));
        } catch {
            setErr("Failed to load group data");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, [groupId]);

    function toggleUser(id) {
        setSelectedUsers((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    function selectAllUsers() {
        setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
    function clearAllUsers() {
        setSelectedUsers((prev) => {
            const next = new Set(prev);
            filteredUsers.forEach((u) => next.delete(u.id));
            return next;
        });
    }
    function toggleAllUsers() {
        allUsersSelected ? clearAllUsers() : selectAllUsers();
    }

    function toggleQuery(id) {
        setSelectedQueries((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function saveUsers() {
        const body = { userIds: Array.from(selectedUsers) };
        await api.post(`/admin/groups/${groupId}/members`, body);
    }

    async function saveQueries() {
        const body = { queryIds: Array.from(selectedQueries) };
        await api.post(`/admin/groups/${groupId}/queries`, body);
    }

    return (
        <div className="grid gap-6">
            {/* Header w/ Back button and name */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        onClick={() => nav(-1)}
                        className="border px-3 py-2 rounded"
                        title="Back"
                    >
                        Back
                    </button>
                    <div className="text-xl font-semibold truncate">{groupName}</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={load} className="border px-3 py-2 rounded">
                        Refresh
                    </button>
                </div>
            </div>

            {err && <div className="text-red-600 text-sm">{err}</div>}

            {loading ? (
                <div>Loading...</div>
            ) : (
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* USERS */}
                    <section className="border rounded overflow-hidden">
                        <div className="p-3 border-b flex items-center justify-between gap-2">
                            <div className="font-medium">Assign Users</div>
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                                {/* User search */}
                                <input
                                    className="border px-2 py-1 rounded text-sm min-w-0 w-[200px]"
                                    placeholder="Search users..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                                <button
                                    onClick={toggleAllUsers}
                                    className="border px-3 py-2 rounded"
                                    title={allUsersSelected ? "Clear all" : "Select all"}
                                >
                                    {allUsersSelected ? "Clear all" : "Select all"}
                                </button>
                                <button
                                    onClick={saveUsers}
                                    className="border px-3 py-2 rounded bg-black text-white"
                                >
                                    Save Users
                                </button>
                            </div>
                        </div>

                        <div className="p-3 max-h-[70vh] overflow-auto space-y-2">
                            {filteredUsers.map((u) => (
                                <label key={u.id} className="flex items-center gap-3 border rounded px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.has(u.id)}
                                        onChange={() => toggleUser(u.id)}
                                    />
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">
                                            {u.displayName || u.email}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                    </div>
                                </label>
                            ))}
                            {!filteredUsers.length && (
                                <div className="text-sm text-gray-500">No users match your search.</div>
                            )}
                        </div>
                    </section>

                    {/* QUERIES */}
                    <section className="border rounded overflow-hidden">
                        <div className="p-3 border-b flex items-center justify-between gap-2">
                            <div className="font-medium">Assign Queries</div>
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                                {/* Scope */}
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-600 shrink-0">Scope</label>
                                    <select
                                        className="border px-2 py-1 rounded text-sm"
                                        value={firmFilter}
                                        onChange={(e) => setFirmFilter(e.target.value)}
                                        title="Filter by firm scope"
                                    >
                                        <option value="all">All</option>
                                        <option value="0">Global</option>
                                        {firms
                                            .filter((f) => f.id !== 0)
                                            .map((f) => (
                                                <option key={f.id} value={String(f.id)}>
                                                    {f.firmName}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                {/* Query search */}
                                <input
                                    className="border px-2 py-1 rounded text-sm min-w-0 w-[200px]"
                                    placeholder="Search queries..."
                                    value={qSearch}
                                    onChange={(e) => setQSearch(e.target.value)}
                                />

                                <button
                                    onClick={saveQueries}
                                    className="border px-3 py-2 rounded bg-black text-white shrink-0"
                                >
                                    Save Queries
                                </button>
                            </div>
                        </div>

                        <div className="p-3 max-h-[70vh] overflow-auto space-y-2">
                            {filteredQueries.map((q) => (
                                <label key={q.id} className="flex items-center gap-3 border rounded px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedQueries.has(q.id)}
                                        onChange={() => toggleQuery(q.id)}
                                    />
                                    <div className="w-full min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-medium truncate">{q.name}</div>
                                            <span className="text-[10px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-700 shrink-0">
                                                {(q.firmId === 0 || q.firmId == null) ? "Global" : `Firm ${q.firmId}`}
                                            </span>
                                        </div>
                                        {q.description && (
                                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                                {q.description}
                                            </div>
                                        )}
                                    </div>
                                </label>
                            ))}
                            {!filteredQueries.length && (
                                <div className="text-sm text-gray-500">
                                    No queries match your filter.
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
