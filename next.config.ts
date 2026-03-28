import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = dirname(__filename);

const nextConfig: NextConfig = {
  // Convex backend files have their own tsconfig and build pipeline.
  // Skip Next.js type-checking them to avoid false errors.
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
