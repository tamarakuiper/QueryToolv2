import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function RequireAdmin({ children }) {
    const { user, isAdmin, ready } = useAuth()
    if (!ready) return null
    if (!user) return <Navigate to="/login" replace />
    if (!isAdmin) return <Navigate to="/firms" replace />
    return children
}
