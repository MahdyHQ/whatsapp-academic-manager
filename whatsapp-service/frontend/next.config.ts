import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable the React Compiler for better DX in React 19
  reactCompiler: true,
  // Ensure both Next.js output file tracing root and Turbopack root
  // point to this frontend directory. Vercel sets outputFileTracingRoot
  // to the repo root by default in monorepos; mismatched roots can cause
  // module resolution issues during build.
  outputFileTracingRoot: __dirname,
  // Explicitly set the Turbopack root to this frontend directory to avoid
  // incorrect workspace root inference in monorepos/workspaces.
  // This silences the build warning and ensures consistent module resolution.
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
