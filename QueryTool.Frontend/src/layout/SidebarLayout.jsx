import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../api";

const isProd = import.meta.env.MODE === "production";

function logoutNav() {
    const returnUrl = encodeURIComponent(window.location.origin + "/login");
    // Server will clear cookie and (in prod) complete OIDC sign-out, then redirect
    window.location.href = `/api/auth/logout?returnUrl=${returnUrl}`;
}

async function logoutXhr() {
    try {
        await api.post("/auth/logout-xhr"); // 204 if backend endpoint exists
    } catch {
        // ignore; we'll still navigate
    }
    window.location.href = "/login";
}

function NavItem({ to, children }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                `px-3 py-2 rounded text-sm text-left ${isActive ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                }`
            }
            end
        >
            {children}
        </NavLink>
    );
}

function isAdminUser(user) {
    return (
        user?.isAdmin === true ||
        user?.IsAdmin === true ||
        user?.is_admin === true ||
        user?.is_admin === "true"
    );
}

export default function SidebarLayout() {
    const { user } = useAuth();
    const isAdmin = isAdminUser(user);
    const logout = isProd ? logoutNav : logoutXhr;

    return (
        <div className="min-h-screen grid grid-cols-[240px_1fr]">
            <aside className="border-r px-4 py-6">
                <div className="text-xl font-bold mb-6">Query Tool</div>
                <nav className="grid gap-1">
                    <NavItem to="/firms">Run Query</NavItem>
                    {isAdmin && (
                        <>
                            <div className="mt-4 mb-1 text-xs uppercase text-gray-500">
                                Admin
                            </div>
                            <NavItem to="/admin/users">User Management</NavItem>
                            <NavItem to="/admin/groups">Group Management</NavItem>
                            <NavItem to="/admin/queries">Query Management</NavItem>
                            <NavItem to="/admin/analytics">Analytics</NavItem>
                        </>
                    )}
                </nav>
            </aside>

            <main className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="text-sm text-gray-600">
                        Signed in as{" "}
                        <span className="font-medium">
                            {user?.name || user?.displayName || user?.email}
                        </span>
                        {isAdmin && (
                            <span className="ml-2 rounded bg-gray-900 text-white text-xs px-2 py-0.5">
                                Admin
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                        Logout
                    </button>
                </div>
                <Outlet />
            </main>
        </div>
    );
}
