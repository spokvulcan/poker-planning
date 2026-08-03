import type { NextConfig } from "next";

// Baseline security headers for every route. The CSP only restricts framing:
// locking down script-src/style-src properly requires nonce support across
// all pages, which is a separate piece of work.
const securityHeaders = [
  // Clickjacking protection (frame-ancestors for modern browsers,
  // X-Frame-Options as legacy fallback). The homepage demo iframe is
  // same-origin, so 'self' preserves it.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app is HTTPS-only in production; browsers ignore HSTS over HTTP,
  // so local development is unaffected.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
