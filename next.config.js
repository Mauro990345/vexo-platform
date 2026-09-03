/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Default de Server Actions é 1MB — pequeno demais pro upload de
    // anexo (imagem/vídeo) dos passos de follow-up (ver src/lib/uploads.ts,
    // que já limita a 25MB por arquivo).
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

module.exports = nextConfig;
