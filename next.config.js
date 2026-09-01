/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Padrão é 1MB — insuficiente para os anexos (imagem/vídeo) da
    // sequência de follow-up (ver src/app/crm/follow-up).
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

module.exports = nextConfig;
