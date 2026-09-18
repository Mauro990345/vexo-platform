// Serializa o processamento de eventos inbound da MESMA dupla
// clínica+lead do Instagram — sem isso, duas mensagens do lead chegando
// bem próximas uma da outra (dois webhooks separados da Meta, cada um
// com seu próprio igMessageId — a deduplicação por mid, ver
// api/webhooks/instagram/route.ts, não ajuda aqui, são mensagens
// genuinamente diferentes) podiam ser processadas em paralelo pelo mesmo
// processo Node, cada uma lendo o histórico da conversa quase no mesmo
// instante, ANTES de qualquer uma delas ter terminado de escrever sua
// própria resposta/agendamento.
//
// Bug real reportado em produção, consistente no primeiro agendamento de
// cada conversa: as duas chamadas concorrentes decidiam confirmar o
// MESMO horário. A que escrevesse no Google Calendar primeiro "ganhava"
// (agendamento certo, criado uma vez só — ver confirmAppointment,
// conversation-pipeline.ts), mas a outra, ao rechecar disponibilidade
// (checkAvailability, consulta ao vivo no Google, sem cache nenhum) já
// via o horário ocupado pela primeira e corretamente recusava — só que
// só DEPOIS de já ter mandado ao lead uma mensagem confirmando a
// reserva, resultando na sequência confusa "reservado!" seguido de "esse
// horário não está mais disponível". A mesma corrida também explica o
// vídeo de confirmação saindo em dobro: as duas chamadas liam
// Appointment.confirmationVideoSentAt como null ao mesmo tempo, antes de
// qualquer uma das duas ter gravado que já mandou.
//
// Lock em memória, por processo — suficiente enquanto o serviço "web" do
// Railway rodar como uma única instância (não há scaling horizontal
// configurado hoje, ver README > Deploy). Se isso mudar no futuro
// (múltiplas réplicas do serviço web), esse lock deixa de bastar sozinho
// — precisaria de um lock distribuído (ex: advisory lock do Postgres, ou
// Redis) no lugar deste.
const tails = new Map<string, Promise<unknown>>();

export async function withConversationLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previousTail = tails.get(key) ?? Promise.resolve();

  // Cada chamada registra o PRÓPRIO gate como a nova cauda da fila dessa
  // chave — a próxima chamada com a mesma chave vai esperar por ELE, não
  // pela promise de fn() em si, pra uma exceção em fn() não vazar pra
  // quem só estava esperando a vez chegar.
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(key, gate);

  // Espera todo mundo que chegou antes — .catch aqui é só pra não travar
  // a fila se a chamada anterior tiver rejeitado; a rejeição dela já foi
  // (ou vai ser) tratada por quem a chamou.
  await previousTail.catch(() => {});

  try {
    return await fn();
  } finally {
    release!();
    // Libera a entrada do Map só se ninguém entrou na fila depois de
    // nós — senão apagaria a espera de quem está atrás, e o Map cresceria
    // pra sempre com uma entrada por lead+clínica que já conversou.
    if (tails.get(key) === gate) {
      tails.delete(key);
    }
  }
}
