import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const pagesBasePath = isGitHubPages ? "/mp-road-watch" : "";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  trailingSlash: isGitHubPages,
  images: {
    unoptimized: isGitHubPages,
  },
  // The Pages build does not use the Cloudflare-only database and worker modules.
  typescript: {
    ignoreBuildErrors: isGitHubPages,
  },
};

export default nextConfig;
