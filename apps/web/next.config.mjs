/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundle the workspace packages we import on the server.
  transpilePackages: ["@hiredesq/shared"],
  async rewrites() {
    // SSR / client calls to /api/* proxy to the NestJS api.
    const api = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
