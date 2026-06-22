/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["sanitize-html", "pdf-lib", "jszip", "googleapis"],
};

export default nextConfig;
