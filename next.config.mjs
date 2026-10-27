/** @type {import('next').NextConfig} */

// Baseline security headers. A full script-src CSP is deliberately not set yet:
// the Razorpay checkout widget and remote room photos need an audited
// allow-list first (see AUDIT.md). `frame-ancestors` alone already stops
// clickjacking of the payment and admin pages.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig = {
  // `typescript.ignoreBuildErrors` was on, which is why ~20 real type errors
  // (missing modules, wrong enum casing, bad route signatures) shipped
  // silently. They are fixed; keep this off so new ones can't hide.
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Pages that show booking / guest data must never be cached by a proxy.
      {
        source: '/(booking-status|booking-confirmed|bookings|invoice|admin)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ]
  },
}

export default nextConfig
