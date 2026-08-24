/* ========================================================================
   Assistente de escrita das ATAS — ajuda a passar a limpo os campos longos
   dos pontos de pauta (discussão, deliberação, informes, encaminhamentos).

   Vale só para o ARCHÉ AT, por decisão do dono: proposta e relatório de
   extensão são autoria intelectual do professor e ficam fora, para não
   induzir dependência num documento que é dele. A ata é registro de fato
   ocorrido, lavrado às pressas depois da reunião — ali passar a limpo ajuda.

   Princípio que vale para tudo aqui: o assistente NÃO INVENTA CONTEÚDO.
   Ele só trabalha em cima do que a pessoa escreveu — melhora a redação,
   desenvolve as notas, enxuga o excesso, corrige a gramática. Um sistema
   institucional que gera deliberação do nada produz documento falso, e é a
   instituição que responde por ele.

   Por isso o texto de origem é obrigatório e há um mínimo de caracteres:
   sem matéria-prima, o pedido é recusado antes de chegar ao provedor.
   ======================================================================== */
import { gerarTexto, provedorAtivo } from "./redator.js";

export const MIN_TEXTO = 15;      // abaixo disto não há o que trabalhar
export const MAX_TEXTO = 8000;    // corta antes de gastar cota à toa

/* ------------------------------- ações ---------------------------------- */
export const ACOES = {
  melhorar: {
    rotulo: "Melhorar a redação",
    dica: "Reescreve em norma culta, sem mudar o conteúdo.",
    ordem: "Reescreva o texto em português culto e institucional, corrigindo gramática, "
      + "coesão e repetições. NÃO acrescente informação que não esteja no original e NÃO retire "
      + "nenhum fato, número, nome ou data.",
  },
  desenvolver: {
    rotulo: "Desenvolver as notas",
    dica: "Transforma tópicos soltos em texto corrido.",
    ordem: "Transforme as notas em texto corrido, no registro institucional. Encadeie as ideias "
      + "e explicite as conexões que estão implícitas, mas NÃO invente fatos, números, nomes, "
      + "datas, resultados ou referências que não estejam nas notas.",
  },
  resumir: {
    rotulo: "Enxugar",
    dica: "Reduz mantendo tudo que importa.",
    ordem: "Reduza o texto, preservando integralmente os fatos, números, nomes e datas. "
      + "Corte redundância e rodeio, não conteúdo.",
  },
  revisar: {
    rotulo: "Só corrigir",
    dica: "Ortografia, concordância e pontuação — nada mais.",
    ordem: "Corrija apenas ortografia, acentuação, concordância, regência e pontuação. "
      + "Preserve as escolhas de vocabulário e a estrutura das frases do autor. "
      + "Se o texto já estiver correto, devolva-o sem alteração.",
  },
};

/* ------------------------------- campos --------------------------------- */
// Cada campo assistido diz o que se espera dele, para que o texto saia com o
// conteúdo certo e não uma redação genérica. Campos de ata e, desde ago/2026
// (pedido do dono), os dois campos longos do relatório de aula prática.
// Proposta e relatório da EXTENSÃO seguem fora, por decisão anterior dele.
export const CAMPOS = {
  /* --------------------------- ARCHÉ AT ---------------------------- */
  "atas.discussao": {
    rotulo: "Notas da discussão",
    onde: "um ponto de pauta de ata de órgão colegiado",
    espera: "o que foi debatido, quem se manifestou e os argumentos apresentados",
    formato: "texto corrido em terceira pessoa e tempo passado",
  },
  "atas.deliberacao": {
    rotulo: "Deliberação",
    onde: "um ponto de pauta de ata de órgão colegiado",
    espera: "o que o colegiado decidiu, com clareza sobre a extensão da decisão",
    formato: "uma a três frases, em terceira pessoa e tempo passado",
  },
  "atas.informes": {
    rotulo: "Informes",
    onde: "a ata de um órgão colegiado",
    espera: "as comunicações da presidência que não geraram deliberação",
    formato: "texto corrido em terceira pessoa e tempo passado",
  },
  "atas.observacoes": {
    rotulo: "Outras ocorrências",
    onde: "a ata de um órgão colegiado",
    espera: "fatos da sessão dignos de registro que não couberam nos pontos de pauta",
    formato: "texto corrido em terceira pessoa e tempo passado",
  },
  "atas.encaminhamento": {
    rotulo: "Encaminhamento",
    onde: "um ponto de pauta de ata de órgão colegiado",
    espera: "a providência a ser tomada, começando por verbo no infinitivo",
    formato: "uma frase objetiva",
  },
  /* --------------------------- ARCHÉ AP ---------------------------- */
  "praticas.objetivo": {
    rotulo: "Objetivo da aula prática",
    onde: "o relatório de aula prática que o professor entrega à coordenação do curso",
    espera: "o que a aula se propôs a desenvolver nos acadêmicos — competências, "
      + "habilidades e conteúdos trabalhados na prática",
    formato: "texto corrido, um a dois parágrafos",
  },
  "praticas.atividades": {
    rotulo: "Atividades desenvolvidas",
    onde: "o relatório de aula prática que o professor entrega à coordenação do curso",
    espera: "o que foi feito na aula, na ordem em que aconteceu, com o papel dos "
      + "acadêmicos em cada etapa",
    formato: "texto corrido em tempo passado, na ordem cronológica da aula",
  },
};

export const campoDe = (id) => CAMPOS[String(id || "")] || null;

/* -------------------------------- prompt -------------------------------- */
const REGRAS = [
  "Você é assistente de redação de uma instituição de ensino superior brasileira.",
  "",
  "Regras invioláveis:",
  "1. NUNCA invente fatos, números, datas, nomes, resultados, referências ou citações.",
  "   Se a informação não está no texto do autor, ela não pode aparecer na sua resposta.",
  "2. Se faltar informação para o campo ficar completo, deixe o texto como está — não preencha",
  "   a lacuna com suposição, e jamais escreva marcadores como [inserir] ou 'a definir'.",
  "3. Escreva em português do Brasil, registro formal institucional.",
  "4. Devolva SOMENTE o texto do campo, pronto para colar no formulário. Sem títulos, sem",
  "   markdown, sem aspas ao redor, sem comentários seus, sem explicar o que você mudou.",
].join("\n");

/** Monta o pedido enviado ao provedor — exposto para poder ser testado. */
export function montarPedido({ campo, acao, texto, contexto }) {
  const c = campoDe(campo);
  const a = ACOES[acao];
  const partes = [
    `Campo: ${c.rotulo}, em ${c.onde}.`,
    `O que este campo deve conter: ${c.espera}.`,
    `Formato esperado: ${c.formato}.`,
  ];
  const ctx = linhasDeContexto(contexto);
  if (ctx) partes.push("", "Contexto do documento (use apenas para dar coerência ao texto, " +
    "não repita estes dados como se fossem conteúdo do campo):", ctx);
  partes.push("", `Tarefa: ${a.ordem}`, "", "Texto do autor:", '"""', texto, '"""');
  return { sistema: REGRAS, usuario: partes.join("\n") };
}

// O contexto vem do formulário (curso, título da ação, órgão…). Só entram
// pares curtos, de valor simples: nada de objeto aninhado vindo do navegador.
function linhasDeContexto(contexto) {
  if (!contexto || typeof contexto !== "object") return "";
  return Object.entries(contexto)
    .filter(([k, v]) => k && (typeof v === "string" || typeof v === "number") && String(v).trim())
    .slice(0, 12)
    .map(([k, v]) => `- ${String(k).slice(0, 40)}: ${String(v).trim().slice(0, 200)}`)
    .join("\n");
}

/* --------------------------------- api ---------------------------------- */
export const disponivel = () => provedorAtivo() !== "modelo";

/** Campos e ações que a interface pode oferecer. */
export function catalogo() {
  return {
    disponivel: disponivel(),
    provedor: provedorAtivo(),
    minimo: MIN_TEXTO,
    acoes: Object.entries(ACOES).map(([id, a]) => ({ id, rotulo: a.rotulo, dica: a.dica })),
    campos: Object.entries(CAMPOS).map(([id, c]) => ({ id, rotulo: c.rotulo })),
  };
}

/**
 * Devolve `{ texto, provedor, modelo }` ou lança com mensagem legível.
 * O texto de origem é obrigatório: o assistente reescreve, não cria.
 */
export async function assistir({ campo, acao = "melhorar", texto, contexto } = {}) {
  if (!disponivel()) {
    throw new Error("O assistente de IA não está configurado. Peça à PROPPEX para ativar a chave.");
  }
  if (!campoDe(campo)) throw new Error("Campo não reconhecido pelo assistente.");
  if (!ACOES[acao]) throw new Error("Ação não reconhecida pelo assistente.");

  const original = String(texto ?? "").trim();
  if (original.length < MIN_TEXTO) {
    throw new Error(`Escreva ao menos ${MIN_TEXTO} caracteres no campo — o assistente melhora o `
      + "que você escreveu, não inventa conteúdo.");
  }

  const { sistema, usuario } = montarPedido({
    campo, acao, texto: original.slice(0, MAX_TEXTO), contexto,
  });
  const r = await gerarTexto({ sistema, usuario, maxTokens: 2048 });

  const limpo = limparResposta(r.texto);
  if (!limpo) throw new Error("O assistente devolveu resposta vazia. Tente novamente.");
  return { texto: limpo, provedor: r.provedor, modelo: r.modelo, acao, campo };
}

/** Tira o que o modelo às vezes acrescenta apesar da instrução. */
export function limparResposta(bruto) {
  let t = String(bruto ?? "").trim();
  t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();     // cerca de código
  if (/^".*"$/s.test(t) || /^“.*”$/s.test(t)) t = t.slice(1, -1).trim(); // aspas ao redor
  t = t.replace(/^(texto\s+(revisado|reescrito|final)|resposta)\s*:\s*/i, "");
  return t.trim();
}
