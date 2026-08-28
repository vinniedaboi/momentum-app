import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `postgres` opens raw TCP sockets, so route handlers that touch the database
  // must run on the Node.js runtime. Keeping the driver external stops the
  // bundler from trying to inline it into the edge/proxy bundles.
  serverExternalPackages: ["postgres"],

  // No reason to advertise the framework.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app has no reason to be framed, and every page is behind auth.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
