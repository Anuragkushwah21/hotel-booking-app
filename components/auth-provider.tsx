'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * Who is signed in, shared across the site chrome.
 *
 * The header used to fetch /api/auth/me itself, once, on mount. It sits in the
 * layout and therefore never unmounts, so a client-side navigation after login
 * left it showing the signed-out state until the user reloaded the page. The
 * session lives in an httpOnly cookie, so the only way to learn about it is to
 * ask the server — which is what `refresh()` is for: login calls it, and every
 * consumer updates together.
 */

export type CurrentUser = {
  id: string
  email: string
  name?: string | null
  isAdmin: boolean
  role: 'USER' | 'ADMIN'
}

type AuthContextValue = {
  user: CurrentUser | null
  loading: boolean
  /** Re-read the session from the server (after login). */
  refresh: () => Promise<CurrentUser | null>
  /** Drop the local user immediately (after logout), without a round trip. */
  clear: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        // The session must never come from the bfcache after a login.
        cache: 'no-store',
      })
      const data = await res.json()
      const next: CurrentUser | null = data.user ?? null
      setUser(next)
      return next
    } catch (error) {
      console.error('Failed to fetch current user', error)
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ user, loading, refresh, clear: () => setUser(null) }),
    [user, loading, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}
