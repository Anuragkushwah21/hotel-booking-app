import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge proxy (formerly middleware.ts) runs without database access, so it can only check that a
 * session cookie is *present*. That is enough to bounce anonymous traffic off
 * /admin without a round trip. The authoritative role check happens in
 * app/admin/layout.tsx (server component) and in every /api/admin route via
 * requireManager() — middleware is a convenience, never the security boundary.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get('session_token')?.value)

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
