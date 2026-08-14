/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This is a standalone deployment (Vercel project root = member-lookup-frontend).
  // It talks to the existing YUNITE backend over HTTPS; it is NOT a monorepo app.
};

export default nextConfig;
