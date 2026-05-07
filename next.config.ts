import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Turbopack uses its "root" directory for module resolution. In a repo that
// contains multiple projects (without a package.json at the repo root),
// Turbopack can accidentally pick the repo root and then fail to resolve
// dependencies like `tailwindcss`. Force Turbopack root to this app directory.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.kain.id.vn',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  turbopack: {
    root: turbopackRoot,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
