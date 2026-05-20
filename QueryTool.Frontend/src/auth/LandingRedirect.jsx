import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * LandingRedirect:
 * When a logged-in user hits "/", decide where to send them.
 * - Admins → /admin
 * - Regular users → /firms
 * - Not logged in → /login
 */
export default function LandingRedirect() {
    const { user, isAdmin, ready } = useAuth()
    const nav = useNavigate()

    useEffect(() => {
        if (!ready) return <div className="h-screen grid place-items-center text-gray-500">Loading...</div>
        if (!user) nav('/login', { replace: true })
        else if (isAdmin) nav('/admin', { replace: true })
        else nav('/firms', { replace: true })
    }, [user, isAdmin, ready, nav])

    // nothing to render; it's a redirect component
    return null
}
