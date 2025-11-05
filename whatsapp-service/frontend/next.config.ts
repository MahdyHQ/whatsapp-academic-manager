import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable the React Compiler for better DX in React 19
  reactCompiler: true,
  // Explicitly set the Turbopack root to this frontend directory to avoid
  // incorrect workspace root inference in monorepos/workspaces.
  // This silences the build warning and ensures consistent module resolution.
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
