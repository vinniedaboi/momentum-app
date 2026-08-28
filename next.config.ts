import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `postgres` opens raw TCP sockets, so route handlers that touch the database
  // must run on the Node.js runtime. Keeping the driver external stops the
  // bundler from trying to inline it into the edge/middleware bundles.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
