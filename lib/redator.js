/* ========================================================================
   ARCHÉ AT — redator da ata.

   Três provedores, escolhidos por ambiente (ATA_IA):
     - "modelo"    : gerador determinístico, custo zero, sem chave nenhuma.
                     É o padrão e também o socorro quando a IA falha.
     - "gemini"    : Google AI Studio (camada gratuita) — GEMINI_API_KEY.
     - "anthropic" : API da Anthropic (paga) — ANTHROPIC_API_KEY.

   Em qualquer caso o texto volta para revisão humana antes de virar ata
   aprovada: a IA redige a minuta, o colegiado aprova.
   ======================================================================== */
import { CURSOS, cursoDe, orgaoDe, quorum, tituloDe } from "./atas.js";
import { marcaEm } from "./marca.js";

// O nome da instituição depende da data da sessão: uma ata de 2024 foi
// lavrada na FACEG, e o texto tem de dizer isso (ver lib/marca.js).
const CIDADE = process.env.INSTITUICAO_CIDADE || "Goianésia";
const INSTITUICAO = marcaEm(null).nome;

/* --------------------------- números por extenso ------------------------ */
const UNI = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const FEM = { um: "uma", dois: "duas" };

/** Por extenso de 0 a 99 (`genero: "f"` para "uma hora"/"duas horas"). */
export function extenso(n, genero = "m") {
  n = Math.trunc(Number(n) || 0);
  if (n < 0 || n > 99) return String(n);
  const nome = n < 20 ? UNI[n] : DEZ[Math.floor(n / 10)] + (n % 10 ? " e " + UNI[n % 10] : "");
  if (genero !== "f") return nome;
  return nome.replace(/\b(um|dois)\b/g, (m) => FEM[m]);
}

function anoExtenso(ano) {
  const a = Number(ano) || 0;
  if (a < 2000 || a > 2099) return String(ano);
  const r = a - 2000;
  return r ? `dois mil e ${extenso(r)}` : "dois mil";
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Aos quatorze dias do mês de agosto do ano de dois mil e vinte e seis". */
export function dataExtenso(iso) {
  const [a, m, d] = String(iso || "").split("-").map(Number);
  if (!a || !m || !d) return "Em data não informada";
  const dia = d === 1 ? "Ao primeiro dia" : `Aos ${extenso(d)} dias`;
  return `${dia} do mês de ${MESES[m - 1] || "—"} do ano de ${anoExtenso(a)}`;
}

/** "às quatorze horas e trinta minutos". */
export function horaExtenso(hhmm) {
  const [h, mi] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  const horas = `${extenso(h, "f")} ${h === 1 ? "hora" : "horas"}`;
  if (!mi) return `às ${horas}`;
  return `às ${horas} e ${extenso(mi, "m")} ${mi === 1 ? "minuto" : "minutos"}`;
}

const nomeCurso = (slug) => cursoDe(slug)?.nome || slug || "";
const lista = (arr) => {
  const v = arr.filter(Boolean);
  if (!v.length) return "";
  if (v.length === 1) return v[0];
  return v.slice(0, -1).join(", ") + " e " + v[v.length - 1];
};
const pessoa = (p) => (p.cargo ? `${p.nome} (${p.cargo})` : p.nome);

/* ------------------------ gerador determinístico ------------------------ */
/**
 * Monta a ata a partir dos campos estruturados, no formato consagrado dos
 * colegiados brasileiros (abertura por extenso, corpo por ponto de pauta,
 * fecho de encerramento). Não depende de rede nem de chave de API.
 */
export function redigirPorModelo(ata, { estilo = estiloPadrao() } = {}) {
  const longo = estilo === "detalhada";
  const curto = estilo === "concisa";
  const s = ata.sessao || {};
  const marca = marcaEm(s.data);
  const o = orgaoDe(ata.orgao);
  const orgaoTxt = o?.nomeLivre ? (ata.orgaoNome || o.nome) : (o?.nome || "colegiado");
  const doCurso = ata.curso ? ` do curso de ${nomeCurso(ata.curso)}` : "";
  const parts = ata.participantes || [];
  const presentes = parts.filter((p) => p.presenca === "presente" && p.condicao !== "convidado");
  const convidados = parts.filter((p) => p.presenca === "presente" && p.condicao === "convidado");
  const justificadas = parts.filter((p) => p.presenca === "justificada");
  const ausentes = parts.filter((p) => p.presenca === "ausente");

  const modal = s.modalidade === "remota"
    ? `de forma remota, pela plataforma ${s.local || "indicada na convocação"}`
    : s.modalidade === "híbrida"
      ? `de forma híbrida, com participação presencial ${s.local ? `em ${s.local}` : ""} e remota`
      : `${s.local ? `em ${s.local}` : "na sede da instituição"}`;

  const blocos = [];

  /* abertura — na redação detalhada, a finalidade nomeia os pontos da
     pauta: é o que permite a quem lê a ata anos depois saber do que se
     tratou sem percorrer o documento inteiro */
  const titulos = (ata.pauta || []).map((p) => String(p.titulo || "").trim()).filter(Boolean);
  const finalidade = longo && titulos.length
    ? `para deliberar sobre ${titulos.length === 1 ? "o seguinte ponto de pauta" : "os seguintes pontos de pauta"}: ${lista(titulos)}.`
    : "para deliberar sobre a pauta adiante transcrita.";
  blocos.push(
    `${dataExtenso(s.data)}, ${horaExtenso(s.horaInicio)}, ${modal}, ${marca.artigo} ${marca.nome}, ` +
    `reuniu-se em sessão ${s.tipo || "ordinária"} o ${orgaoTxt}${doCurso}, ` +
    `sob a presidência de ${ata.presidencia?.nome || "—"}` +
    `${ata.presidencia?.cargo ? `, ${ata.presidencia.cargo}` : ""}, ` +
    `${s.convocacao ? `mediante convocação ${s.convocacao}, ` : ""}` +
    finalidade,
  );

  /* presenças */
  const pres = [];
  if (presentes.length) {
    pres.push(`Verificada a presença de ${extenso(presentes.length)} ` +
      `${presentes.length === 1 ? "membro" : "membros"}, a saber: ${lista(presentes.map(pessoa))}.`);
  }
  if (convidados.length) {
    pres.push(`Participaram ainda, na condição de ${convidados.length === 1 ? "convidado" : "convidados"}, ` +
      `${lista(convidados.map(pessoa))}.`);
  }
  if (justificadas.length) {
    pres.push(`${justificadas.length === 1 ? "Justificou" : "Justificaram"} ausência ` +
      `${lista(justificadas.map((p) => p.nome))}.`);
  }
  if (ausentes.length) {
    pres.push(`${ausentes.length === 1 ? "Registrou-se a ausência de" : "Registraram-se as ausências de"} ` +
      `${lista(ausentes.map((p) => p.nome))}.`);
  }
  // Sem secretaria designada, a frase se encerra na abertura da sessão: a ata
  // não inventa quem secretariou, nem deixa um travessão no lugar do nome.
  const totalPresentes = presentes.length + convidados.length;
  pres.push(
    (longo && totalPresentes
      ? `Constatada a presença de ${extenso(totalPresentes)} ${totalPresentes === 1 ? "participante" : "participantes"} `
        + `e verificado o quórum regimental, `
      : "Constatado o quórum regimental, ")
    + `${ata.presidencia?.nome || "a presidência"} declarou aberta a sessão`
    + `${ata.secretaria?.nome ? `, secretariada por ${ata.secretaria.nome}` : ""}`
    + `${longo ? ", saudando os presentes e submetendo a pauta à apreciação do colegiado" : ""}.`);
  blocos.push(pres.join(" "));

  /* informes */
  if (ata.informes) blocos.push(`INFORMES. ${ata.informes.replace(/\n+/g, " ")}`);

  /* pontos de pauta
     Três graus de elaboração. O que muda são as FÓRMULAS de procedimento
     ("submetido à apreciação", "aberta a discussão"), nunca o conteúdo: o
     texto que a pessoa digitou entra inteiro, letra por letra, depois de
     dois-pontos. Isso não é preciosismo — mexer na frase dela para encaixar
     numa fórmula é reescrever o que a reunião disse.

     As fórmulas só aparecem quando o campo correspondente foi preenchido:
     afirmar que houve debate sobre um ponto sem nota nenhuma seria inventar. */
  const fecha = (t) => {
    const x = String(t || "").replace(/\n+/g, " ").trim();
    return /[.!?;:]$/.test(x) ? x : x + ".";
  };
  (ata.pauta || []).forEach((p, i) => {
    const partes = [`${i + 1}. ${String(p.titulo || "").toUpperCase()}.`];
    const titulo = String(p.titulo || "").trim();
    if (longo && titulo) {
      partes.push(`A presidência submeteu à apreciação do colegiado a matéria relativa ao ponto “${titulo}”.`);
    }
    if (p.discussao) {
      partes.push(longo ? `Aberta a discussão, registrou-se o seguinte: ${fecha(p.discussao)}`
        : fecha(p.discussao));
    }
    if (p.deliberacao) {
      const rot = longo ? "Após o debate, o colegiado deliberou o seguinte: "
        : curto ? "Deliberação: " : "O colegiado deliberou o seguinte: ";
      partes.push(rot + fecha(p.deliberacao));
    }
    if (p.votacao?.houve) {
      const total = (Number(p.votacao.favor) || 0) + (Number(p.votacao.contra) || 0)
        + (Number(p.votacao.abstencoes) || 0);
      partes.push(`Submetida a matéria a votação, obteve-se ${extenso(p.votacao.favor)} ` +
        `${p.votacao.favor === 1 ? "voto favorável" : "votos favoráveis"}, ` +
        `${extenso(p.votacao.contra)} ${p.votacao.contra === 1 ? "voto contrário" : "votos contrários"} e ` +
        `${extenso(p.votacao.abstencoes, "f")} ${p.votacao.abstencoes === 1 ? "abstenção" : "abstenções"}` +
        `${longo && total ? `, perfazendo ${extenso(total)} ${total === 1 ? "voto computado" : "votos computados"}` : ""}.`);
    }
    const e = p.encaminhamento;
    if (e?.acao) {
      const rot = longo ? "Como encaminhamento, o colegiado definiu o seguinte: "
        : curto ? "Encaminhamento: " : "Ficou encaminhado o seguinte: ";
      partes.push(rot + String(e.acao).replace(/\n+/g, " ").trim()
        + `${e.responsavel ? `, sob responsabilidade de ${e.responsavel}` : ""}`
        + `${e.prazo ? `, com prazo até ${e.prazo.split("-").reverse().join("/")}` : ""}.`);
    }
    blocos.push(partes.join(" "));
  });

  if (ata.observacoes) blocos.push(`OUTRAS OCORRÊNCIAS. ${ata.observacoes.replace(/\n+/g, " ")}`);

  /* encerramento */
  blocos.push(
    (longo ? "Nada mais havendo a tratar e não havendo quem quisesse fazer uso da palavra, "
      : "Nada mais havendo a tratar, ") +
    `a presidência deu por encerrada a sessão ` +
    `${s.horaFim ? horaExtenso(s.horaFim) : "no horário regimental"}, ` +
    (ata.secretaria?.nome
      ? `da qual eu, ${ata.secretaria.nome}, lavrei a presente ata que, ` +
        `lida e aprovada, vai assinada por mim, pela presidência e pelos demais presentes.`
      : `da qual se lavrou a presente ata que, lida e aprovada, ` +
        `vai assinada pela presidência e pelos demais presentes.`),
  );

  return blocos.join("\n\n");
}

/* --------------------------- material para a IA ------------------------- */
/** Ficha estruturada da reunião — é o único insumo que a IA recebe. */
export function fichaDaReuniao(ata) {
  const s = ata.sessao || {};
  const q = quorum(ata);
  const p = (cond) => (ata.participantes || []).filter(cond)
    .map((x) => `- ${x.nome}${x.cargo ? ` — ${x.cargo}` : ""} (${x.condicao})`).join("\n") || "- (nenhum)";
  const pauta = (ata.pauta || []).map((x, i) => [
    `PONTO ${i + 1}: ${x.titulo}`,
    x.discussao ? `Notas da discussão: ${x.discussao}` : null,
    x.deliberacao ? `Deliberação: ${x.deliberacao}` : null,
    x.votacao?.houve
      ? `Votação: ${x.votacao.favor} favoráveis, ${x.votacao.contra} contrários, ${x.votacao.abstencoes} abstenções`
      : null,
    x.encaminhamento?.acao
      ? `Encaminhamento: ${x.encaminhamento.acao}${x.encaminhamento.responsavel ? ` (responsável: ${x.encaminhamento.responsavel})` : ""}${x.encaminhamento.prazo ? ` (prazo: ${x.encaminhamento.prazo})` : ""}`
      : null,
  ].filter(Boolean).join("\n")).join("\n\n") || "(pauta não informada)";

  return [
    `Instituição: ${marcaEm(s.data).nome}`,
    `Órgão: ${tituloDe(ata)}`,
    `Número da ata: ${ata.numero || "(ainda não emitido)"}`,
    `Sessão: ${s.tipo || "ordinária"}, ${s.modalidade || "presencial"}`,
    `Data: ${s.data || "—"} · Início: ${s.horaInicio || "—"} · Término: ${s.horaFim || "—"}`,
    `Local: ${s.local || "—"}`,
    s.convocacao ? `Convocação: ${s.convocacao}` : null,
    `Presidência: ${ata.presidencia?.nome || "—"}${ata.presidencia?.cargo ? ` — ${ata.presidencia.cargo}` : ""}`,
    ata.secretaria?.nome ? `Secretaria: ${ata.secretaria.nome}` : null,
    `Quórum: ${q.presentes} presentes, ${q.justificadas} com ausência justificada, ${q.ausentes} ausentes`,
    "",
    "PRESENTES:", p((x) => x.presenca === "presente"),
    "AUSÊNCIAS JUSTIFICADAS:", p((x) => x.presenca === "justificada"),
    "AUSENTES:", p((x) => x.presenca === "ausente"),
    "",
    ata.informes ? `INFORMES:\n${ata.informes}\n` : null,
    "PAUTA E DISCUSSÕES:", pauta,
    ata.observacoes ? `\nOUTRAS OCORRÊNCIAS:\n${ata.observacoes}` : null,
  ].filter((x) => x !== null).join("\n");
}

/* ------------------------- extensão da redação ---------------------------
   Quanto o texto se alonga. Não é gosto: uma ata de NDE que vai ao INEP
   pede desenvolvimento, e uma ata de comissão interna, não. O que MUDA é o
   grau de elaboração da prosa — nunca o conteúdo. Em qualquer estilo vale a
   regra que sustenta o documento: só os fatos da ficha, sem inventar fala,
   número ou decisão que ninguém tomou.

   Trocar o padrão institucional é mexer em ATA_ESTILO, não no código. */
export const ESTILOS = [
  { codigo: "concisa", nome: "Concisa",
    desc: "O essencial, em texto direto. Boa para reuniões curtas e comissões internas." },
  { codigo: "padrao", nome: "Padrão",
    desc: "A ata institucional de sempre: cada ponto num parágrafo, em prosa corrente." },
  { codigo: "detalhada", nome: "Detalhada",
    desc: "Desenvolve cada ponto — contexto, encadeamento do debate e a decisão por extenso. É a que o avaliador do INEP lê melhor." },
];
export const estiloDe = (c) => ESTILOS.find((e) => e.codigo === String(c || "").toLowerCase()) || null;
/** O estilo institucional: o do ambiente, e "detalhada" por padrão. */
export const estiloPadrao = () => estiloDe(process.env.ATA_ESTILO)?.codigo || "detalhada";

const ORIENTACAO_POR_ESTILO = {
  concisa: [
    "EXTENSÃO: concisa. Um parágrafo curto por ponto de pauta, direto ao que foi tratado e decidido.",
    "Não alongue a abertura nem o encerramento além das fórmulas necessárias.",
  ],
  padrao: [
    "EXTENSÃO: padrão. Um parágrafo por ponto de pauta, em prosa corrente, com a discussão e a deliberação encadeadas.",
  ],
  detalhada: [
    "EXTENSÃO: detalhada. Este é o registro que será lido por avaliadores externos, então desenvolva.",
    "Em cada ponto de pauta, escreva de dois a quatro parágrafos que percorram, nesta ordem: (a) a apresentação da matéria à mesa; (b) o desenvolvimento do debate, explicitando os argumentos que a ficha registra e a articulação entre eles; (c) a deliberação, enunciada por extenso e sem abreviar a decisão; (d) quando houver, a votação e o encaminhamento, com responsável e prazo escritos na frase.",
    "Alongue a prosa apenas EXPANDINDO o que a ficha traz — explicitando o nexo entre um argumento e outro, retomando o assunto pelo nome, escrevendo por extenso o que a nota abreviou. É proibido acrescentar fato novo: nenhuma fala, número, justificativa, participante ou decisão que não esteja na ficha pode aparecer no texto, por mais natural que pareça.",
    "Se um ponto vier com nota curta, ele fica curto. Não invente conteúdo para equilibrar o tamanho dos parágrafos.",
  ],
};

export function instrucaoDe(estilo = estiloPadrao()) {
  return [
    "Você redige atas de reuniões de órgãos colegiados de uma instituição de ensino superior brasileira.",
    "",
    "Regras obrigatórias:",
    "1. Escreva em português do Brasil, registro formal institucional, terceira pessoa, tempo pretérito.",
    "2. Use EXCLUSIVAMENTE os fatos da ficha. Nunca invente nomes, números, deliberações, votos ou datas.",
    "3. Se um dado não constar da ficha, simplesmente não o mencione — não escreva lacunas, colchetes nem '[preencher]'.",
    "4. Abra com a fórmula consagrada: dia, mês e ano por extenso, horário por extenso, local, órgão, presidência e finalidade.",
    "5. Registre as presenças, as ausências justificadas e o quórum.",
    "6. Desenvolva cada ponto de pauta em parágrafo próprio, numerado, transformando as notas em prosa corrente e encadeada; preserve integralmente o sentido das deliberações e dos encaminhamentos.",
    "7. Encerre com a fórmula de praxe ('Nada mais havendo a tratar…'), citando quem lavrou a ata quando a ficha trouxer a secretaria; se não trouxer, escreva a forma impessoal ('da qual se lavrou a presente ata') e não atribua a lavratura a ninguém.",
    "8. Devolva apenas o texto corrido da ata, em parágrafos separados por linha em branco. Sem markdown, sem títulos, sem listas com marcadores, sem comentários seus.",
    "",
    ...(ORIENTACAO_POR_ESTILO[estilo] || ORIENTACAO_POR_ESTILO.padrao),
  ].join("\n");
}

/* ------------------------------- provedores ----------------------------- */
export function provedorAtivo() {
  const escolhido = String(process.env.ATA_IA || "").trim().toLowerCase();
  if (escolhido === "modelo") return "modelo";
  if (escolhido === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : "modelo";
  if (escolhido === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "modelo";
  // automático: usa o que houver de chave, preferindo a camada gratuita
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "modelo";
}

// Modelos Flash da camada gratuita, do mais novo para o mais antigo. O Google
// aposenta versões com regularidade (o 2.5-flash sai em outubro de 2026), então
// o adaptador tenta a lista em ordem e usa o primeiro que responder — assim uma
// aposentadoria não derruba a redação da ata.
const MODELOS_GEMINI = [
  process.env.GEMINI_MODELO,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
].filter(Boolean);
const MODELO_ANTHROPIC = process.env.ANTHROPIC_MODELO || "claude-sonnet-5";

async function chamarGemini(modelo, { sistema, usuario, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, {
      method: "POST", signal: ctrl.signal,
      // a chave vai no cabeçalho, não na URL: assim não vaza em log de proxy
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: usuario }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      }),
    });
    const corpo = await r.text();
    if (!r.ok) {
      const erro = new Error(`Gemini ${r.status}: ${corpo.slice(0, 300)}`);
      // 404 = modelo inexistente ou aposentado: vale tentar o próximo da lista
      erro.modeloInvalido = r.status === 404 || /not found|NOT_FOUND/i.test(corpo);
      throw erro;
    }
    const j = JSON.parse(corpo);
    const texto = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!texto) throw new Error("Gemini devolveu resposta vazia");
    return { texto, modelo };
  } finally { clearTimeout(timer); }
}

async function porGemini(pedido) {
  let ultimo = null;
  for (const modelo of MODELOS_GEMINI) {
    try {
      return await chamarGemini(modelo, pedido);
    } catch (e) {
      ultimo = e;
      if (!e.modeloInvalido) throw e;      // cota, chave inválida, rede: não adianta insistir
      console.warn(`[atas] modelo ${modelo} indisponível, tentando o seguinte`);
    }
  }
  throw ultimo || new Error("Nenhum modelo do Gemini respondeu");
}

async function porAnthropic({ sistema, usuario, maxTokens }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODELO_ANTHROPIC,
    max_tokens: maxTokens,
    system: sistema,
    messages: [{ role: "user", content: usuario }],
  });
  const texto = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!texto) throw new Error("Anthropic devolveu resposta vazia");
  return { texto, modelo: MODELO_ANTHROPIC };
}

/**
 * Chamada crua ao provedor configurado — usada pela redação da ata e pelo
 * assistente de escrita dos formulários (lib/assistente.js). LANÇA em caso de
 * falha: quem chama decide se há plano B.
 */
export async function gerarTexto({ sistema, usuario, maxTokens = 4096, provedor = provedorAtivo() }) {
  if (provedor === "modelo") throw new Error("Nenhum provedor de IA configurado");
  const pedido = { sistema, usuario, maxTokens };
  const r = provedor === "gemini" ? await porGemini(pedido) : await porAnthropic(pedido);
  return { ...r, provedor };
}

/**
 * Redige a minuta da ata. Nunca lança: se o provedor de IA falhar (chave
 * inválida, cota esgotada, rede fora), cai no gerador determinístico e
 * devolve o motivo em `aviso` — a reunião não pode ficar sem ata por causa
 * de uma API de terceiro.
 */
export async function redigir(ata, { provedor = provedorAtivo(), estilo = estiloPadrao() } = {}) {
  const em = new Date().toISOString();
  const est = estiloDe(estilo)?.codigo || estiloPadrao();
  if (provedor === "modelo") {
    return { texto: redigirPorModelo(ata, { estilo: est }), provedor: "modelo", modelo: "arche-modelo-v1", em, estilo: est, aviso: null };
  }
  try {
    const r = await gerarTexto({
      sistema: instrucaoDe(est),
      usuario: `Redija a ata desta reunião.\n\n${fichaDaReuniao(ata)}`,
      // a redação detalhada precisa de espaço: o teto de sempre cortaria a
      // ata no meio de um ponto de pauta, e ata truncada não se aprova
      maxTokens: est === "detalhada" ? 8192 : 4096,
      provedor,
    });
    return { texto: r.texto, provedor, modelo: r.modelo, em, estilo: est, aviso: null };
  } catch (e) {
    console.error(`[atas] redação por ${provedor} falhou:`, e.message);
    return {
      texto: redigirPorModelo(ata, { estilo: est }), provedor: "modelo", modelo: "arche-modelo-v1", em, estilo: est,
      aviso: `A redação por IA (${provedor}) falhou — a minuta foi montada pelo gerador do ARCHÉ. Detalhe: ${e.message}`,
    };
  }
}

export const _cursosParaTeste = CURSOS;
export { CIDADE, INSTITUICAO };
