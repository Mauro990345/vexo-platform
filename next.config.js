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
  // Cache-Control explícito pra todo /crm/* — reforço defensivo além do
  // `export const dynamic = "force-dynamic"` de cada página (que já devia
  // ser suficiente pro Next não deixar CACHEAR essas respostas) e do
  // staleTimes acima (cache do CLIENTE). Isso aqui cobre uma 3ª camada
  // possível: um proxy/CDN NA FRENTE do Next (ex: edge da Railway) que não
  // respeite os headers de cache que o Next já manda por padrão pra rota
  // dinâmica, e sirva uma resposta HTML antiga em cache pra requisição
  // seguinte — cenário investigado depois de confirmar que nem o código
  // (mesma fonte gerando fundo+etiqueta) nem o deploy (commit mais recente
  // já confirmadamente ativo) explicam um bug de fundo/etiqueta
  // desencontrados reproduzido de novo em produção.
  async headers() {
    return [
      {
        source: "/crm/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
