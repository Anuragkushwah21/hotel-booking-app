import { prisma } from './prisma'
import type { User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({
      where: { email },
    })
  } catch (error) {
    console.error('[v0] Error getting user by email:', error)
    return null
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({
      where: { id },
    })
  } catch (error) {
    console.error('[v0] Error getting user by id:', error)
    return null
  }
}

export async function createUser(
  email: string,
  password: string,
  name?: string,
): Promise<User | null> {
  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    })

    if (existing) {
      // yahan ya to error throw karo, ya null return karo – abhi null return kar rahe hain
      console.warn('[v0] User already exists with email:', email)
      return null
    }

    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        isAdmin: false,
        role: 'GUEST',     // schema enums ke saath match
        status: 'ACTIVE',
      },
    })

    return user
  } catch (error) {
    console.error('[v0] Error creating user:', error)
    return null
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createSession(
  userId: string,
  token: string,
): Promise<boolean> {
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    })
    return true
  } catch (error) {
    console.error('[v0] Error creating session:', error)
    return false
  }
}

export async function getSessionByToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const session = await prisma.session.findUnique({
      where: { token },
    })

    if (!session || session.expiresAt < new Date()) {
      return null
    }

    return { userId: session.userId }
  } catch (error) {
    console.error('[v0] Error getting session:', error)
    return null
  }
}

export async function deleteSession(token: string): Promise<boolean> {
  try {
    await prisma.session.delete({
      where: { token },
    })
    return true
  } catch (error) {
    console.error('[v0] Error deleting session:', error)
    return false
  }
}
// ============================================================
// Role-based access control
// ============================================================
//
// Route handlers use the non-throwing guard API:
//
//   const auth = await requireManager()
//   if (!auth.ok) return auth.response
//   // auth.user is a fully typed AuthUser from here on
//
// `getCurrentUser()` is the read-only variant for server components.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'

export type AuthUser = {
  id: string
  email: string
  name: string | null
  role: UserRole
  status: 'ACTIVE' | 'DEACTIVE'
  emailVerified: boolean
}

export const SESSION_COOKIE = 'session_token'

/** Roles allowed to operate the admin dashboard. */
export const STAFF_ROLES: UserRole[] = ['HOTEL_MANAGER', 'ADMIN']

/**
 * Resolve the signed-in user from the session cookie.
 * Returns null when there is no session, the session expired, or the
 * account has been deactivated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const session = await getSessionByToken(token)
    if (!session) return null

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerified: true,
      },
    })

    if (!user || user.status !== 'ACTIVE') return null
    return user as AuthUser
  } catch (error) {
    console.error('[auth] getCurrentUser failed:', error)
    return null
  }
}

type Guard =
  | { ok: true; user: AuthUser; response?: never }
  | { ok: false; user?: never; response: NextResponse }

function deny(message: string, status: number): Guard {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) }
}

/** Any signed-in, active user. */
export async function requireAuth(): Promise<Guard> {
  const user = await getCurrentUser()
  if (!user) return deny('Not authenticated. Please log in.', 401)
  return { ok: true, user }
}

/**
 * A signed-in guest — explicitly NOT staff.
 *
 * Managers and admins take bookings through the dashboard's walk-in flow,
 * which records who took the booking and settles at the desk. Letting a staff
 * account book through the public site would file that booking as ONLINE with
 * no `bookedBy`, so it would vanish from the walk-in ledger and land in that
 * staff member's own "My Bookings" instead.
 */
export async function requireGuestAccount(): Promise<Guard> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (isStaff(auth.user.role)) {
    return deny(
      'Staff accounts book from the admin dashboard (New walk-in booking), not the public site.',
      403,
    )
  }
  return auth
}

/** Signed-in user holding one of `roles`. */
export async function requireRole(roles: UserRole[]): Promise<Guard> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (!roles.includes(auth.user.role)) {
    return deny('Forbidden. Insufficient permissions for this action.', 403)
  }
  return auth
}

/** HOTEL_MANAGER or ADMIN — the admin dashboard audience. */
export async function requireManager(): Promise<Guard> {
  return requireRole(STAFF_ROLES)
}

/** ADMIN only — user management, role changes, destructive inventory ops. */
export async function requireAdmin(): Promise<Guard> {
  return requireRole(['ADMIN'])
}

export function isStaff(role: UserRole | undefined | null): boolean {
  return role === 'HOTEL_MANAGER' || role === 'ADMIN'
}
