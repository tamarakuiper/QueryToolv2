import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";

const isProd = import.meta.env.MODE === "production";

function logoutNav() {
    const returnUrl = encodeURIComponent(window.location.origin + "/login");
    window.location.href = `/api/auth/logout?returnUrl=${returnUrl}`;
}

async function logoutXhr() {
    try {
        await api.post("/auth/logout-xhr");
    } catch { }
    window.location.href = "/login";
}

function isAdminUser(user) {
    return (
        user?.isAdmin === true ||
        user?.IsAdmin === true ||
        user?.is_admin === true ||
        user?.is_admin === "true"
    );
}

export default function Layout() {
    const { user } = useAuth();
    const isAdmin = isAdminUser(user);
    const logout = isProd ? logoutNav : logoutXhr;

    return (
        <div className="h-screen flex bg-gray-50">
            <aside className="w-64 bg-white border-r">
                <div className="p-4 font-semibold text-lg">Query Tool</div>
                <nav className="px-2 space-y-1">
                    <NavLink
                        to="/firms"
                        end
                        className="block px-3 py-2 rounded hover:bg-gray-100"
                    >
                        Run Query
                    </NavLink>
                    {isAdmin && (
                        <>
                            <NavLink
                                to="/admin/queries"
                                className="block px-3 py-2 rounded hover:bg-gray-100"
                            >
                                Query Management
                            </NavLink>
                            <NavLink
                                to="/admin/users"
                                className="block px-3 py-2 rounded hover:bg-gray-100"
                            >
                                User Management
                            </NavLink>
                            <NavLink
                                to="/admin/groups"
                                className="block px-3 py-2 rounded hover:bg-gray-100"
                            >
                                Group Management
                            </NavLink>
                            <NavLink
                                to="/admin/analytics"
                                className="block px-3 py-2 rounded hover:bg-gray-100"
                            >
                                Analytics
                            </NavLink>
                        </>
                    )}
                </nav>
            </aside>

            <div className="flex-1 flex flex-col">
                <header className="h-14 bg-white border-b flex items-center justify-between px-4">
                    <div className="font-medium">
                        Welcome, {user?.name || user?.displayName || user?.email}
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
                    >
                        Logout
                    </button>
                </header>
                <main className="flex-1 overflow-auto p-4">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
