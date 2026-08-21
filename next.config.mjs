/** @type {import('next').NextConfig} */
const nextConfig = {
  // `typescript.ignoreBuildErrors` was on, which is why ~20 real type errors
  // (missing modules, wrong enum casing, bad route signatures) shipped
  // silently. They are fixed; keep this off so new ones can't hide.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
