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
    // staleTimes.dynamic desliga o CACHE DE ROTA DO CLIENTE (Router Cache)
    // pras páginas dinâmicas — algo diferente e independente de
    // `export const dynamic = "force-dynamic"` de cada página, que só
    // controla o cache do SERVIDOR. Sem isso, o Next reaproveita a última
    // versão renderizada de uma rota por até 30s numa navegação client-side
    // (ex: clicar num <Link> pra voltar pra Agenda), mesmo que uma Server
    // Action em outra página já tenha chamado revalidatePath — foi
    // exatamente o bug relatado (mudar o status de um agendamento na tela
    // da conversa e voltar pra Agenda ainda mostrando o card antigo/
    // parcialmente desatualizado). 0 = sempre busca de novo no servidor.
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
