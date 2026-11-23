import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // endereços antigos da Caderneta em PHP (favoritos do navegador)
  async redirects() {
    return [
      { source: "/cliente/:id", destination: "/clientes/:id", permanent: true },
      { source: "/relatorio", destination: "/relatorios", permanent: true },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
