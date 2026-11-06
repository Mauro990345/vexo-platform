// Conteúdo do "Bônus Full Face" (guia de vendas em 7 passos, ver
// /dashboard/bonus e FullFaceBonusGuide). Textos fornecidos pelo Mauro —
// usar EXATAMENTE como estão, sem reescrever/resumir/corrigir.
//
// Cada bloco de roteiro é um item de dados próprio (ScriptBlock) pra poder
// receber, no futuro, um vídeo ou áudio por bloco (campo `media`) sem
// mexer no layout — hoje nenhum bloco tem mídia, e o guia não mostra
// nenhum espaço reservado pra isso.

export type ScriptBlockItem = { type: "p"; text: string } | { type: "subtitle"; text: string };

export type ScriptBlockMedia = { kind: "video" | "audio"; url: string };

export type ScriptBlock = {
  id: string;
  title?: string;
  items: ScriptBlockItem[];
  media?: ScriptBlockMedia;
};

export type BonusStep = {
  number: number;
  title: string;
  idea: string;
  phrase: string;
  phraseNote?: string;
  blocks: ScriptBlock[];
  actions: string[];
};

export type BonusChecklistGroup = { id: "antes" | "durante" | "depois"; title: string; items: string[] };

export type BonusMessageTemplate = { id: string; title: string; text: string };

// Divide um texto em parágrafos (linha em branco) e transforma linhas
// "[SUBTÍTULO] ..." em subtítulos internos do bloco.
function parseBlock(raw: string): ScriptBlockItem[] {
  return raw
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) =>
      chunk.startsWith("[SUBTÍTULO]")
        ? { type: "subtitle" as const, text: chunk.slice("[SUBTÍTULO]".length).trim() }
        : { type: "p" as const, text: chunk }
    );
}

export const BONUS_OVERVIEW = {
  eyebrow: "Bônus para clínicas",
  title: "Como vender planos de tratamento full face de alto valor",
  subtitle:
    "Sete passos, do agendamento ao follow-up. Cada passo tem um roteiro para ler, uma frase pronta e uma ação para aplicar.",
  howTo: [
    { title: "1. Leia o roteiro", text: "Leia com calma, um passo por vez." },
    { title: "2. Aplique uma ação", text: "Cada passo termina com ações curtas. Marque o que você já fez." },
    { title: "3. Treine e ajuste", text: "Ensaie em voz alta e use o checklist antes de cada consulta." },
  ],
};

export const BONUS_STEPS: BonusStep[] = [
  {
    number: 1,
    title: "Venda plano de tratamento, não procedimento",
    idea: "Procedimento se compara por preço. Plano de tratamento descreve o resultado final do rosto, e isso ninguém tem igual a você.",
    phrase: "“Como você quer se sentir quando olhar no espelho?”",
    blocks: [
      {
        id: "p1-b1",
        items: parseBlock(`
Olá, tudo bem? Neste primeiro passo eu quero mudar a forma como você pensa naquilo que vende.

Muita clínica vive assim: a paciente chega com uma queixa, a profissional trata a queixa, vende um botox, um preenchimento, e a paciente vai embora. A agenda fica cheia, mas no fim do mês o dinheiro não aparece na mesma proporção. Agenda cheia não é sinônimo de clínica lucrativa.

O motivo é simples. Quando você vende procedimento, você vende algo que a paciente consegue comparar. Um preenchimento labial existe em qualquer clínica da cidade. Ela compara preço, e quem ganha a briga é quem cobra menos. Você entra num jogo que não precisa jogar.

Quando você vende um plano de tratamento, a conversa muda. O plano descreve o resultado final do rosto, tem a sua assinatura, e não existe igual em outro lugar. A paciente deixa de decidir pelo preço da seringa e passa a decidir pelo resultado que quer ter.

Por isso, dê um nome ao seu plano. Um nome próprio, seu. Isso o torna único e difícil de comparar.

Pense numa loja de roupas. Quem mostra duas peças vende uma ou duas. Quem mostra a arara inteira dá à cliente a chance de levar mais. Aqui é igual, com uma diferença importante: mostrar tudo o que a paciente poderia fazer não é empurrar produto. É entregar um resultado melhor, porque o rosto é um conjunto e fica mais bonito e mais natural quando é tratado como um todo.

A mudança prática começa numa pergunta. Em vez de perguntar “qual procedimento você quer?”, pergunte “como você quer se sentir quando olhar no espelho?”. A partir daí, você monta o plano.
`),
      },
    ],
    actions: [
      "Escolha um nome para o seu plano de tratamento.",
      "Liste tudo o que a sua clínica oferece e que poderia entrar num plano completo.",
      "Na próxima consulta, comece com a pergunta sobre como ela quer se sentir.",
    ],
  },
  {
    number: 2,
    title: "Mentalidade e postura de valor",
    idea: "Antes do roteiro vem a postura. Quem tem medo de cobrar não fecha, por melhor que seja o roteiro.",
    phrase: "“Eu estou aqui para ajudar a chegar a um resultado.”",
    blocks: [
      {
        id: "p2-b1",
        items: parseBlock(`
Neste passo vamos falar da cabeça, porque é ela que trava a venda na hora de falar o preço. Não adianta ter o melhor roteiro se você fica com medo de cobrar.

[SUBTÍTULO] Cinco ideias para mudar

Primeira ideia: quem sabe quanto dinheiro a paciente tem é ela, não você. Você não sabe o que ela guardou, vendeu ou herdou. Então pare de julgar pela roupa ou pelo carro. Atenda todas do mesmo jeito e entregue o seu melhor plano. Primeiro você entrega, depois você fecha.

Segunda: não oferecer o que a paciente precisa é privá-la do melhor resultado. Se você indica só um preenchimento e não fala da qualidade da pele ou de um tratamento de sustentação, você está entregando menos do que poderia. Você não está empurrando nada. Está mostrando tudo o que pode deixá-la mais bonita.

Terceira: se você acha caro o que vende, você ainda não enxergou o valor do seu trabalho. Quem vende carro de luxo não acha o carro caro, porque vê a tecnologia e a experiência embutidas. No seu preço estão os cursos que você fez, a sua experiência, a estrutura e o acompanhamento. Não é o custo de uma seringa.

Quarta: quem não investe em si tem dificuldade de pedir investimento. E investir não é só aprender técnica nova. É aprender a conduzir uma consulta e a apresentar o seu valor.

Quinta: clínica barata não é sua concorrente. Quem só quer saber de preço atende a outro público. Você não precisa dessa paciente. Precisa da que valoriza o seu trabalho.

[SUBTÍTULO] A postura em três atitudes

Agora, a postura. Ela se apoia em três atitudes.

A primeira é se valorizar. Na consulta, você é a autoridade, com educação e delicadeza. Conte sua experiência em poucas frases e construa conexão, porque ninguém compra de quem não confia.

A segunda é não fazer questão. Quando você está desesperada por dinheiro, a paciente percebe. Antes de cada consulta, respire e pense: eu estou aqui para ajudar a chegar a um resultado. Isso muda o tom da sua voz.

A terceira é conduzir. Quem controla os passos da consulta, o preço e o fechamento é você. A paciente não monta o plano. Você monta, porque sabe o que funciona.

Cada pessoa trava em uma dessas três. Descubra a sua e treine.
`),
      },
    ],
    actions: [
      "Anote qual das cinco crenças mais pesa para você hoje.",
      "Escolha uma das três atitudes (valorizar-se, não fazer questão, conduzir) para treinar.",
      "Escreva em duas frases como você se apresenta no início da consulta.",
    ],
  },
  {
    number: 3,
    title: "Prepare a consulta antes de ela acontecer",
    idea: "Cada pergunta feita antes da consulta tira um possível “não” de dentro da sala.",
    phrase: "“Tem mais alguém que decide junto com você? Se tiver, vale trazer essa pessoa.”",
    blocks: [
      {
        id: "p3-b1",
        items: parseBlock(`
A venda de alto valor não começa quando a paciente senta na sua frente. Começa antes, no agendamento.

O primeiro ponto é a consulta paga antecipadamente. Quando a paciente paga para ser atendida, ela leva o encontro a sério, e quem estava só curioso tende a não marcar. Defina um valor que faça sentido para o seu posicionamento hoje e vá subindo com o tempo.

O segundo ponto é explicar, ainda no WhatsApp, o que vai acontecer. Quem agenda deve contar que haverá uma avaliação e um planejamento do rosto, e deixar claro se o valor da consulta será descontado ou não do tratamento. Uma sugestão: não desconte, e guarde o desconto da consulta como uma carta na manga para o momento do fechamento. A equipe não oferece isso antes. Quem usa é você, na hora certa.

O terceiro ponto é perguntar quem decide. A equipe pode dizer: “Tem mais alguém que decide junto com você? Se tiver, vale trazer essa pessoa, porque o que a doutora vai apresentar pode mudar a sua rotina e a sua autoestima.” Se a resposta for não, ótimo: uma objeção já foi desarmada.

O quarto ponto é perguntar o motivo: “o que fez você procurar a clínica agora?”. A resposta já dá pistas valiosas para a consulta.

Por que isso importa? Porque cada pergunta feita antes tira um possível “não” de dentro da sala. Quanto mais cedo você entende a situação da paciente, menos surpresas aparecem na hora do preço.
`),
      },
    ],
    actions: [
      "Defina o valor e a regra da sua consulta e escreva o texto de agendamento.",
      "Inclua no agendamento a pergunta sobre quem decide junto.",
      "Treine a equipe para explicar o que acontece na consulta.",
    ],
  },
  {
    number: 4,
    title: "Conduza a consulta",
    idea: "A paciente decide pela emoção e justifica com a razão. Fale do que ela vai sentir, não da técnica.",
    phrase: "“Ficou claro?”",
    phraseNote: "Use no lugar de “ficou alguma dúvida?”. A primeira convida ao sim, a segunda convida ao não.",
    blocks: [
      {
        id: "p4-b1",
        title: "Parte 1. Abra a consulta",
        items: parseBlock(`
Uma consulta com começo, meio e fim deixa a paciente tranquila e leva a uma decisão clara. Vou mostrar a sequência.

Antes de abrir a porta, mude a pergunta que você faz a si mesma. Em vez de “o que vou vender hoje?”, pense “como posso ajudar esta pessoa hoje?”. Toda venda honesta ajuda alguém a sair de um ponto A, onde há uma dor, para um ponto B, melhor.

Comece combinando o roteiro. Diga: “primeiro eu me apresento, depois quero ouvir tudo o que te incomoda. Em seguida faço um planejamento do seu rosto, monto o seu plano e, no final, decidimos juntas o que faz sentido.” Quando a paciente sabe o que vai acontecer, ela relaxa e decide melhor.

Depois, crie conexão. Quebre a tensão do início: se a paciente veio por indicação, fale da pessoa que indicou; se é de outra cidade, puxe esse assunto. Acompanhe o ritmo dela: se ela fala muito, você acompanha; se é mais quieta, você fala com calma. Apresente-se com autoridade, em poucas frases, e então ouça. Faça uma pergunta aberta: “o que te trouxe aqui hoje?”. Pergunte também o que ela já fez antes e como foi a experiência. Enquanto ela fala, anote tudo no prontuário, principalmente as palavras que ela usa para falar da dor e do que quer mudar. Essas palavras valem ouro: você vai usá-las durante toda a consulta, e é isso que faz a paciente sentir que foi realmente ouvida.

Em seguida, faça a paciente se ver. Tire fotos de frente e de perfil, com fundo neutro, e deixe a foto aberta na tela durante toda a consulta. O ideal é usar um tablet ou o computador, para você desenhar em cima e a paciente acompanhar tudo olhando o próprio rosto. Não precisa ser um aparelho caro. Ver-se na foto ajuda a paciente a enxergar o que você enxerga e a dizer: “eu quero mudar isso”. Pergunte o que mais incomoda e deixe que ela explique como isso afeta o dia a dia e a autoestima.
`),
      },
      {
        id: "p4-b2",
        title: "Parte 2. Construa o plano",
        items: parseBlock(`
Agora, o ponto mais importante: pare de falar de técnica e fale do que ela vai sentir. A paciente não quer preencher a olheira, ela quer parecer menos cansada. Não quer preencher a mandíbula, quer o contorno de volta. Não quer só aumentar o lábio, quer se sentir mais feminina e mais confiante. Ela decide pela emoção e depois justifica com a razão. Se você fala de camada e de mililitro, ela começa a duvidar. Se você fala do espelho concordando com o que ela sente por dentro, ela imagina o resultado.

Explique a causa do que ela sente, sem linguagem técnica e com as palavras que ela trouxe. Se ela falou do bigode chinês, mostre na foto como a face desce com o tempo e por que aquela marca aparece. Use analogias: o seu rosto é como uma casa, primeiro cuidamos da estrutura, depois das paredes, por último da pintura. Então desenhe em cima da foto as regiões que serão tratadas, sem falar de quantidade nem de nome de técnica. Diga o que vai mudar: “vamos sustentar essa região, melhorar o contorno, elevar o rosto e cuidar da pele”.

Ao longo do caminho, faça pequenas confirmações, os micro-acordos: “é isso que você quer melhorar?”, “faz sentido para você?”, “ficou claro?”. Troque “ficou alguma dúvida?” por “ficou claro?”: a primeira convida ao não, a segunda convida ao sim. Isso funciona porque o cérebro não gosta de incoerência. Quando a paciente já disse vários “sim” durante a consulta, fica difícil dizer “não” no final. Além disso, qualquer dúvida aparece cedo, quando é fácil resolver, e não na hora do preço. O objetivo é que, ao chegar no valor, sobre só a negociação e não a quebra de objeções. Venda nasce da pergunta certa, e quem vende bem ouve mais do que fala.

Antes de falar o valor, faça duas perguntas: “como você vai se sentir sem esse problema?” e “se você não fizer nada, o que você acha que acontece?”. Depois monte o plano completo, com tudo o que é indicado. Não monte um plano menor por medo de ela achar caro. Pense: se você indica só um mililitro para um problema que pede mais, o resultado fica fraco, a paciente paga e sai frustrada. Para ela, aquilo ficou caro, porque não trouxe o que ela esperava, e ela não volta. Já quem investe mais e vê a transformação sente que foi barato. É como um celular muito barato que trava em dois meses, contra um que dura anos e faz tudo o que você precisa: o barato saiu caro. Valor está ligado ao resultado, não ao preço.

Por fim, registre o plano por escrito, no sistema ou no receituário, detalhando o que será feito e ligando cada item ao desenho que você fez na foto. Mostre isso à paciente e pergunte uma última vez se está tudo claro. Só então passe para o valor.
`),
      },
    ],
    actions: [
      "Escreva o seu roteiro de abertura da consulta e ensaie em voz alta.",
      "Passe a anotar, em todo atendimento, as palavras exatas que a paciente usa para falar da dor.",
      "Tire foto de frente e de perfil e deixe aberta durante toda a consulta, num tablet ou computador.",
      "Troque “ficou alguma dúvida?” por “ficou claro?” e faça de 3 a 4 confirmações ao longo da consulta.",
    ],
  },
  {
    number: 5,
    title: "Quebre as objeções antes do preço",
    idea: "A maior parte das objeções só se revela na hora do preço. Desarme cada uma antes, e nunca discuta.",
    phrase: "“Claro. E o que você gostaria de pensar? É sobre o resultado, sobre o valor ou sobre a forma de pagamento?”",
    blocks: [
      {
        id: "p5-b1",
        items: parseBlock(`
A maior parte das objeções não aparece na hora do preço. Ela só se revela ali. Por isso o segredo é desarmar cada uma antes de chegar nesse momento.

Vamos às três mais comuns.

A primeira: “preciso falar com meu marido”, ou com a mãe, ou com quem for. Você já se antecipou no agendamento, perguntando quem decide junto. Se a pessoa veio sozinha, na consulta pergunte de novo, com calma: “você decide isso sozinha ou tem mais alguém envolvido?”. Se disser que decide sozinha, ótimo. Se a objeção aparecer no final, lembre com gentileza: “quando agendamos, você me disse que a decisão era sua, certo?”. Sem pressão, sem confronto.

A segunda: “vou pensar”. Quase sempre, “vou pensar” quer dizer “ainda não fiquei convencida de que vale” ou “tenho medo de dizer que não tenho o dinheiro”. Então pergunte, com interesse real: “claro, e o que você gostaria de pensar? É sobre o resultado, sobre o valor ou sobre a forma de pagamento?”. A resposta mostra a objeção verdadeira, e aí você resolve a objeção real, não a de fachada.

A terceira: o valor, ou “não consigo pagar tudo agora”. Aqui, lembre o que ela mesma disse que sente e quer mudar. Retome a dor: “você me disse que isso te incomoda há anos e que quer se sentir diferente. Vamos achar um jeito de começar?”. Em seguida, mostre as formas de pagamento. Parcelar em mais vezes não muda o valor do seu trabalho, só facilita para quem quer mesmo fazer.

O ponto que vale para as três: nunca discuta. Quem discute perde a conexão. Ouça, confirme que entendeu, e faça uma pergunta que leve a paciente a olhar de novo para o que ela quer.

E lembre sempre da analogia da reforma. Ninguém reforma só um cômodo e deixa o resto da casa caindo. Quando a paciente entende que o rosto é um projeto, e não um conserto, a objeção de preço perde força.
`),
      },
    ],
    actions: [
      "Escreva sua resposta para as três objeções e ensaie em voz alta.",
      "Prepare a pergunta “o que você gostaria de pensar?” para usar sempre que ouvir “vou pensar”.",
      "Defina as formas de pagamento que você pode oferecer.",
    ],
  },
  {
    number: 6,
    title: "Apresente o plano e conduza o fechamento",
    idea: "Duas opções mudam a pergunta da paciente: de “vou fazer ou não?” para “qual combina mais comigo?”.",
    phrase: "“Das duas opções, qual delas você sente que combina mais com você?”",
    blocks: [
      {
        id: "p6-b1",
        items: parseBlock(`
Chegou a hora do valor. Aqui, a postura que você treinou no passo 2 faz toda a diferença.

Primeiro, apresente o plano como um todo. Mostre o que será feito, em que ordem e qual resultado a paciente vai ter. Retome com as palavras dela o que ela disse que a incomodava e o que quer sentir. Depois, fale o valor com calma, olhando nos olhos, sem pedir desculpa e sem acelerar. Fale o número e fique em silêncio. Quem fala primeiro depois do preço, perde força.

Se possível, mostre duas opções de plano, uma completa e uma mais enxuta. Quando a paciente escolhe entre duas opções, a pergunta deixa de ser “vou fazer ou não?” e passa a ser “qual delas faz mais sentido para mim?”. Essa mudança de pergunta aumenta muito o fechamento.

Em seguida, conduza. Pergunte: “das duas opções, qual delas você sente que combina mais com você?”. Se ela escolher, vá direto para o agendamento e o pagamento. Não pergunte se ela quer fechar. Pergunte como ela prefere pagar e quando prefere começar. Aqui começa outra etapa, a negociação: depois de tudo o que você construiu, é a paciente quem diz o que pode fazer, à vista, parcelado, com entrada, ou em etapas, se não puder fazer tudo agora. Você apresenta as formas de pagamento e deixa que ela escolha a que cabe no bolso dela. Quem conduziu bem a consulta não precisa ter medo dessa conversa.

Um detalhe importante: não entregue o plano em mãos para ela levar para casa antes de decidir. Plano em mãos vira comparação com outras clínicas e adiamento. Se ela precisar mesmo de tempo, combine que você envia depois um PDF com as duas opções e marque já um horário para retorno.

E tenha uma condição especial definida antes de a consulta começar. Decida de antemão até onde você pode ir, por exemplo um desconto ou o abatimento do valor da consulta, válido só para fechar no mesmo dia. Assim você não improvisa nem se desvaloriza. Ofereça uma vez, quando a paciente estiver decidida mas ainda hesitante, e deixe claro que a condição vale apenas hoje.
`),
      },
    ],
    actions: [
      "Monte dois formatos do seu plano, um completo e um enxuto.",
      "Defina a sua condição especial de fechamento e o limite dela.",
      "Treine falar o valor e ficar em silêncio, em frente ao espelho ou com a equipe.",
    ],
  },
  {
    number: 7,
    title: "Feche no dia e faça o follow-up",
    idea: "O melhor dia para fechar é o da consulta. Quem não fecha na hora, fecha no follow-up.",
    phrase: "“Posso te chamar amanhã às duas da tarde para ver como você está pensando?”",
    blocks: [
      {
        id: "p7-b1",
        items: parseBlock(`
Aqui vai a regra mais simples e mais esquecida: o melhor dia para fechar é o dia da consulta. Quanto mais tempo passa, mais a emoção esfria e mais a paciente compara e adia. Por isso, tudo o que você fez até aqui existe para que a decisão aconteça naquele dia.

Mas nem toda paciente fecha na hora, e isso é normal. A diferença está em não deixar a conversa morrer. Quem fecha mais não é quem tem mais sorte, é quem faz follow-up.

O acompanhamento tem hora e jeito. No fim da consulta, combine o próximo contato: “posso te chamar amanhã às duas da tarde para ver como você está pensando?”. A paciente já sai sabendo que vai ser procurada, e isso mostra seriedade.

No dia seguinte, mande uma mensagem curta, humana e sem pressão, retomando o que ela contou. Algo como lembrar o que ela disse que mais queria mudar e perguntar se ficou alguma coisa que você possa esclarecer. Não mande texto longo, nem lista de preços. Mande uma conversa.

Se ela ainda não decidiu, volte em dois ou três dias com o PDF das duas opções, se for o caso, e a sua condição especial, com prazo. Prazo real, porque quem não tem data limite nunca decide.

Por fim, registre tudo. Quem foi atendida, o que decidiu, o que pediu para pensar e quando você retorna. Sem registro, o follow-up depende da memória e de bom humor, e a venda se perde no meio da rotina.

Se depois de dois ou três contatos ela disser que não, tudo bem. Agradeça, deixe a porta aberta e siga em frente. Sem ressentimento. Nem toda consulta vira venda, mas toda consulta bem feita gera indicação e abre caminho para a próxima.
`),
      },
    ],
    actions: [
      "Crie uma planilha simples para registrar cada consulta e a data do follow-up.",
      "Combine no final de toda consulta o dia e a hora do próximo contato.",
      "Defina quem da equipe faz o follow-up e em qual prazo.",
    ],
  },
];

export const BONUS_CHECKLIST_SCREEN = {
  eyebrow: "Para usar todo dia",
  title: "Checklist e mensagens para copiar",
  subtitle: "O checklist fica salvo neste navegador. Desmarque tudo antes de cada consulta nova.",
  resetLabel: "Desmarcar o checklist",
  messagesTitle: "Modelos de mensagem",
};

export const BONUS_CHECKLIST: BonusChecklistGroup[] = [
  {
    id: "antes",
    title: "Antes",
    items: [
      "Consulta paga e confirmada.",
      "Perguntado no agendamento quem decide junto e o motivo da procura.",
      "Dois formatos de plano prontos (completo e enxuto).",
      "Condição especial de fechamento definida de antemão.",
    ],
  },
  {
    id: "durante",
    title: "Durante",
    items: [
      "Roteiro da consulta combinado no início.",
      "Paciente falou da dor e do que quer sentir, olhando a própria foto.",
      "Plano explicado com analogia, falando de resultado e não de técnica.",
      "Perguntado “ficou claro?” em vez de “ficou alguma dúvida?”.",
      "Plano completo apresentado, valor dito com calma e silêncio depois.",
      "Pergunta de condução feita: “qual das duas opções combina mais com você?”.",
    ],
  },
  {
    id: "depois",
    title: "Depois",
    items: [
      "Consulta registrada na planilha.",
      "Follow-up combinado com dia e hora.",
      "Mensagem do dia seguinte enviada.",
    ],
  },
];

export const BONUS_MESSAGES: BonusMessageTemplate[] = [
  {
    id: "agendamento",
    title: "Texto de agendamento",
    text: "Oi, [nome]! Sua consulta está confirmada para [dia] às [hora]. Nela, a doutora vai avaliar o seu rosto e montar um planejamento completo para o resultado que você deseja. Para eu me preparar, me conta: o que te fez procurar a clínica agora? E tem mais alguém que participa dessa decisão com você? Se tiver, vale trazer essa pessoa.",
  },
  {
    id: "follow-up",
    title: "Follow-up do dia seguinte",
    text: "Oi, [nome], tudo bem? Fiquei pensando no que você contou ontem sobre [o que ela disse que queria mudar]. Ficou alguma coisa que eu possa te esclarecer para você decidir com tranquilidade?",
  },
  {
    id: "retorno",
    title: "Retorno com prazo (2 a 3 dias depois)",
    text: "Oi, [nome]! Separei para você o resumo das duas opções do seu planejamento. Mantenho a condição especial que conversamos até [data]. Qual das duas opções você sente que combina mais com você?",
  },
  {
    id: "vou-pensar",
    title: "Resposta ao “vou pensar”",
    text: "Claro, [nome], é uma decisão importante. Me ajuda a entender: o que você gostaria de pensar? É sobre o resultado, sobre o valor ou sobre a forma de pagamento? Assim eu consigo te ajudar com o que realmente importa.",
  },
];

// Telas do guia, em ordem (setas/Anterior/Próximo seguem esta lista).
export type BonusScreenId = "overview" | `step-${number}` | "checklist";
export const BONUS_SCREENS: BonusScreenId[] = [
  "overview",
  ...BONUS_STEPS.map((s) => `step-${s.number}` as const),
  "checklist",
];

export function adjacentBonusScreen(current: BonusScreenId, dir: -1 | 1): BonusScreenId | null {
  const i = BONUS_SCREENS.indexOf(current);
  if (i < 0) return null;
  return BONUS_SCREENS[i + dir] ?? null;
}

// Regra de acesso da rota do guia (ver /dashboard/bonus e
// /crm/painel-cliente/[id]/bonus): admin/staff interno sempre abre;
// cliente só com o interruptor ligado na conta.
export function canViewFullFaceBonus(params: { internal: boolean; enabled: boolean }): boolean {
  return params.internal || params.enabled;
}
