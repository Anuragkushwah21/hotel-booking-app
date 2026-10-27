import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge proxy (formerly middleware.ts). It runs without database access, so it
 * only does cheap, request-shape checks:
 *
 * 1. /admin — bounce visitors with no session cookie to /login. The
 *    authoritative role check happens in app/admin/layout.tsx and in every
 *    /api/admin route via requireManager() — this is a convenience, never the
 *    security boundary.
 *
 * 2. /api — CSRF defence in depth. Session cookies are SameSite=Lax, which
 *    already blocks cross-site POSTs from carrying them; on top of that, any
 *    state-changing request whose Origin header names another site is
 *    rejected. Requests with no Origin (server-to-server: the Razorpay webhook,
 *    Vercel Cron) pass through to their own signature checks.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.get('origin')
      if (origin && !sameOrigin(origin, request)) {
        return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 })
      }
    }
    return NextResponse.next()
  }

  const hasSession = Boolean(request.cookies.get('session_token')?.value)
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

function sameOrigin(origin: string, request: NextRequest): boolean {
  try {
    const o = new URL(origin)
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
    if (o.host === host) return true
    const configured = process.env.NEXT_PUBLIC_APP_URL
    return Boolean(configured && new URL(configured).host === o.host)
  } catch {
    return false
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
