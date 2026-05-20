// src/App.jsx
import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import SidebarLayout from "./layout/SidebarLayout";

// user pages
import FirmsList from "./pages/FirmsList";
import FirmQueries from "./pages/FirmQueries";
import QueryRun from "./pages/QueryRun";

// admin pages
import UsersAdmin from "./pages/admin/UsersAdmin";
import GroupsAdminList from "./pages/admin/groups/GroupsAdminList";
import GroupDetail from "./pages/admin/groups/GroupDetail";
import QueriesAdminList from "./pages/admin/queries/QueriesAdminList.jsx";
import QueryForm from "./pages/admin/queries/QueryForm.jsx";
import AnalyticsAdmin from "./pages/admin/AnalyticsAdmin";

import Login from "./auth/Login";
import Register from "./auth/Register";
import Activate from "./auth/Activate";

function logoutNav() {
    const returnUrl = encodeURIComponent(window.location.origin + "/login");
    window.location.href = `/api/auth/logout?returnUrl=${returnUrl}`;
}


// normalize admin truthiness across shapes
function isAdminUser(user) {
    return (
        user?.isAdmin === true ||
        user?.IsAdmin === true ||
        user?.is_admin === true ||
        user?.is_admin === "true"
    );
}

// Guards that wait for auth to be ready
function RequireAuth({ children }) {
    const { user, ready } = useAuth();
    if (!ready) return null; // or a loading spinner
    return user ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }) {
    const { user, ready } = useAuth();
    if (!ready) return null; // or a loading spinner
    if (!user) return <Navigate to="/login" replace />;
    return isAdminUser(user) ? children : <Navigate to="/firms" replace />;
}

export default function App() {
    return (
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/activate" element={<Activate />} />

                <Route
                    path="/"
                    element={
                        <RequireAuth>
                            <SidebarLayout />
                        </RequireAuth>
                    }
                >
                    {/* Landing */}
                    <Route index element={<Navigate to="/firms" replace />} />

                    {/* User flow */}
                    <Route path="firms" element={<FirmsList />} />
                    <Route path="firms/:firmId/queries" element={<FirmQueries />} />
                    <Route path="firms/:firmId/queries/:queryId" element={<QueryRun />} />

                    {/* Admin area */}
                    <Route
                        path="admin"
                        element={
                            <RequireAdmin>
                                <Outlet />
                            </RequireAdmin>
                        }
                    >
                        <Route index element={<Navigate to="users" replace />} />
                        <Route path="users" element={<UsersAdmin />} />// src/App.jsx (admin routes section)
                        // src/App.jsx (admin routes section)
                        <Route path="groups" element={<GroupsAdminList />} />
                        <Route path="groups/:groupId" element={<GroupDetail />} />
                        <Route path="queries" element={<QueriesAdminList />} />
                        <Route path="queries/new" element={<QueryForm mode="create" />} />
                        <Route path="queries/:id" element={<QueryForm mode="edit" />} />
                        <Route path="analytics" element={<AnalyticsAdmin />} />
                    </Route>
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/firms" replace />} />
            </Routes>
        </AuthProvider>
    );
}
