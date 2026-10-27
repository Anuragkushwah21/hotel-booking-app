import { prisma } from './prisma'
import type { User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { randomToken, sha256 } from './security'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12)
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
    console.error('[auth] Error getting user by email:', error)
    return null
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({
      where: { id },
    })
  } catch (error) {
    console.error('[auth] Error getting user by id:', error)
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
      console.warn('[auth] createUser: email already registered')
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
    console.error('[auth] Error creating user:', error)
    return null
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export const SESSION_TTL_DAYS = 30
/** Staff sessions are shorter-lived: they can move money and see guest data. */
export const STAFF_SESSION_TTL_HOURS = 12

/**
 * Sessions are looked up by a SHA-256 of the cookie value, so a leaked
 * Session table can't be replayed as live cookies.
 */
export async function createSession(
  userId: string,
  token: string,
  ttlMs: number = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
): Promise<Date | null> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs)
    await prisma.session.create({
      data: { userId, token: sha256(token), expiresAt },
    })
    return expiresAt
  } catch (error) {
    console.error('[auth] Error creating session:', error)
    return null
  }
}

export async function getSessionByToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const session = await prisma.session.findUnique({
      where: { token: sha256(token) },
    })

    if (!session || session.expiresAt < new Date()) {
      return null
    }

    return { userId: session.userId }
  } catch (error) {
    console.error('[auth] Error getting session:', error)
    return null
  }
}

export async function deleteSession(token: string): Promise<boolean> {
  try {
    await prisma.session.deleteMany({
      where: { token: sha256(token) },
    })
    return true
  } catch (error) {
    console.error('[auth] Error deleting session:', error)
    return false
  }
}

/** Sign out everywhere — after a password change or deactivation. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

/** Create a session for `user` and set the cookie on the response. */
export async function startSession(
  response: NextResponse,
  user: Pick<User, 'id' | 'role'>,
): Promise<boolean> {
  const token = generateSessionToken()
  const ttlMs = isStaff(user.role)
    ? STAFF_SESSION_TTL_HOURS * 60 * 60 * 1000
    : SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const expiresAt = await createSession(user.id, token, ttlMs)
  if (!expiresAt) return false
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return true
}

// ============================================================
// Password reset / staff invite links
// ============================================================

export const RESET_TTL_MS = 60 * 60 * 1000
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000

/** Issue a single-use link token. Only its hash is stored. */
export async function createPasswordToken(email: string, ttlMs: number): Promise<string> {
  const token = randomToken(32)
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { email, token: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ])
  return token
}

/** Burn a link token and return the email it was issued for. */
export async function consumePasswordToken(token: string): Promise<string | null> {
  const row = await prisma.passwordResetToken.findUnique({ where: { token: sha256(token) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) return null
  const used = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  return used.count === 1 ? row.email : null
}

export const MIN_PASSWORD_LENGTH = 8

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
