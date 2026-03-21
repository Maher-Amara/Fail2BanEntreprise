import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Trust Cloudflare proxy headers (cf-connecting-ip, x-forwarded-for)
  serverExternalPackages: ["maxmind", "better-sqlite3"],

  // Restrict Server Actions to same origin
  experimental: {
    serverActions: {
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : [],
    },
  },

  // Additional security headers (applied to all responses)
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "origin-when-cross-origin" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        {
          key: "Permissions-Policy",
          value: "geolocation=(), microphone=(), camera=(), payment=()",
        },
      ],
    },
  ],
};

export default nextConfig;
