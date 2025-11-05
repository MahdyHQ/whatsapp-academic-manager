const nextConfig = {
  // Enable the React Compiler for better DX in React 19
  reactCompiler: true,
  // Helpful defaults for Vercel
  poweredByHeader: false,
  compress: true,
    // Silence workspace root inference warning in monorepo by pinning root here
    // (Only affects local/Turbopack inference; Vercel auto-detects project root.)
    turbopack: {
      // Use this directory as the project root for Turbopack
      root: __dirname,
    },
  // You can add rewrites to proxy APIs through Next if you prefer not to do CORS
  // rewrites: async () => {
  //   const WHATSAPP_URL = process.env.NEXT_PUBLIC_API_URL;
  //   const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
  //   const rules = [] as { source: string; destination: string }[];
  //   if (WHATSAPP_URL) {
  //     rules.push({ source: "/api/auth/:path*", destination: `${WHATSAPP_URL}/api/auth/:path*` });
  //     rules.push({ source: "/api/send", destination: `${WHATSAPP_URL}/api/send` });
  //   }
  //   if (BACKEND_URL) {
  //     rules.push({ source: "/api/whatsapp/:path*", destination: `${BACKEND_URL}/api/whatsapp/:path*` });
  //     rules.push({ source: "/api/whatsapp/status", destination: `${BACKEND_URL}/api/whatsapp/status` });
  //   }
  //   return rules;
  // },
};

export default nextConfig;
