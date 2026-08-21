/* ========================================================================
   ARCHÉ AT — núcleo de domínio das Atas de reuniões dos órgãos colegiados
   (NDE, Colegiado, CONSU, CONSEPE, PROPPEX, CPA, comissões, Reitoria, PROAC).

   Este módulo não conhece HTTP nem armazenamento: só define os órgãos, a
   numeração oficial, a normalização/validação do registro e o material que
   vai para o redator (lib/redator.js). Assim a numeração e as regras ficam
   testáveis sem servidor.
   ======================================================================== */
import { dataCivil, diaSerial, hojeLocalISO } from "./datas.js";

export const ATAS_KEY = "atas-reunioes-v1";

/* ------------------------------- ÓRGÃOS --------------------------------- */
// porCurso: a reunião pertence a um curso e a numeração é sequencial por
// curso (NDE de Enfermagem e NDE de Direito têm séries independentes).
// nomeLivre: o órgão é uma família (comissões) e exige um nome específico.
export const ORGAOS = [
  { codigo: "NDE", nome: "Núcleo Docente Estruturante", sigla: "NDE", porCurso: true },
  { codigo: "COLEGIADO", nome: "Colegiado de Curso", sigla: "COL", porCurso: true },
  { codigo: "CONSU", nome: "Conselho Universitário", sigla: "CONSU", porCurso: false },
  { codigo: "CONSEPE", nome: "Conselho de Ensino, Pesquisa e Extensão", sigla: "CONSEPE", porCurso: false },
  { codigo: "PROPPEX", nome: "Pró-Reitoria de Pesquisa, Pós-Graduação e Extensão", sigla: "PROPPEX", porCurso: false },
  { codigo: "PROAC", nome: "Pró-Reitoria Acadêmica", sigla: "PROAC", porCurso: false },
  { codigo: "REITORIA", nome: "Reitoria", sigla: "REIT", porCurso: false },
  { codigo: "CPA", nome: "Comissão Própria de Avaliação", sigla: "CPA", porCurso: false },
  { codigo: "COMISSAO", nome: "Comissão / Grupo de Trabalho", sigla: "COM", porCurso: false, nomeLivre: true },
  // Escapes para o que o catálogo não previu: o órgão existe, precisa de ata,
  // e não cabe em nenhuma das caixas acima. Sem checklist regulatório, porque
  // não há indicador do INEP para atribuir a um órgão que a instituição criou.
  { codigo: "OUTRO_CURSO", nome: "Outro órgão do curso", sigla: "ORG", porCurso: true, nomeLivre: true },
  { codigo: "OUTRO", nome: "Outro órgão institucional", sigla: "ORG", porCurso: false, nomeLivre: true },
];

export const orgaoDe = (codigo) =>
  ORGAOS.find((o) => o.codigo === String(codigo || "").toUpperCase()) || null;

/* ------------------------------- CURSOS --------------------------------- */
// Mesmos cursos do módulo de Avaliação (public/arche/dossie/*), com a sigla
// usada no número da ata.
export const CURSOS = [
  { slug: "administracao", nome: "Administração", sigla: "ADM" },
  { slug: "agronomia", nome: "Agronomia", sigla: "AGR" },
  { slug: "contabeis", nome: "Ciências Contábeis", sigla: "CTB" },
  { slug: "direito", nome: "Direito", sigla: "DIR" },
  { slug: "educacao-fisica", nome: "Educação Física", sigla: "EDF" },
  { slug: "enfermagem", nome: "Enfermagem", sigla: "ENF" },
  { slug: "engenharia-civil", nome: "Engenharia Civil", sigla: "ECI" },
  { slug: "engenharia-mecanica", nome: "Engenharia Mecânica", sigla: "EME" },
  { slug: "engenharia-software", nome: "Engenharia de Software", sigla: "ESW" },
  { slug: "medicina-veterinaria", nome: "Medicina Veterinária", sigla: "MVE" },
  { slug: "odontologia", nome: "Odontologia", sigla: "ODO" },
  { slug: "psicologia", nome: "Psicologia", sigla: "PSI" },
];

export const cursoDe = (slug) => CURSOS.find((c) => c.slug === String(slug || "")) || null;

// Sigla de curso não cadastrado: três primeiras letras, sem acento.
export function siglaCurso(slug) {
  const c = cursoDe(slug);
  if (c) return c.sigla;
  const limpo = String(slug || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "").toUpperCase();
  return limpo.slice(0, 3) || "GER";
}

/* ------------------------------ NUMERAÇÃO ------------------------------- */
/** ATA-NDE-ENF-2026-003 (órgãos por curso) · ATA-CONSU-2026-011 (demais). */
export function numeroAta({ orgao, curso, ano, sequencial }) {
  const o = orgaoDe(orgao);
  if (!o || !Number.isFinite(ano) || !Number.isFinite(sequencial)) return null;
  const partes = ["ATA", o.sigla];
  if (o.porCurso) partes.push(siglaCurso(curso));
  partes.push(String(ano), String(sequencial).padStart(3, "0"));
  return partes.join("-");
}

/** Série de numeração a que uma ata pertence (mesmo órgão, curso e ano). */
export function serieDe(ata) {
  const o = orgaoDe(ata?.orgao);
  if (!o) return null;
  return [o.codigo, o.porCurso ? String(ata.curso || "") : "", String(ata.ano || "")].join("|");
}

/**
 * Próximo sequencial da série. Considera apenas atas já numeradas (rascunho
 * não consome número) e nunca reaproveita: usa o maior já emitido + 1, de
 * modo que apagar uma ata não faz a seguinte repetir o número.
 */
export function proximoSequencial(atas, { orgao, curso, ano }) {
  const alvo = serieDe({ orgao, curso, ano });
  if (!alvo) return null;
  let maior = 0;
  for (const a of atas || []) {
    if (!a?.numero || serieDe(a) !== alvo) continue;
    const n = Number(a.sequencial) || 0;
    if (n > maior) maior = n;
  }
  return maior + 1;
}

/** O ano que o próprio número afirma — 0 quando não dá para ler. */
export const anoDoNumero = (ata) =>
  Number(String(ata?.numero || "").match(/-(\d{4})-\d{3}$/)?.[1]) || 0;

/** O número diz um ano e a sessão diz outro? */
export function numeroIncoerente(ata) {
  const daSessao = Number(String(ata?.sessao?.data || "").slice(0, 4)) || 0;
  const doNumero = anoDoNumero(ata);
  return !!daSessao && !!doNumero && daSessao !== doNumero;
}

/**
 * REEMITE o número na série do ano em que a sessão aconteceu.
 *
 * Existe para as atas que saíram com o ano errado antes da correção de
 * ago/2026 — sessão de 2025 numerada na série de 2026. É ato da GESTÃO e só
 * roda sobre a incoerência: renumerar ata coerente não teria razão, e número
 * de ata registrada não se troca por engano de clique.
 *
 * O número antigo **não some**: fica em `numerosAnteriores`, porque ele pode
 * ter sido citado noutra ata, num ofício ou num dossiê já entregue — e quem
 * for conferir precisa achar o rastro. O lugar que ele deixou na série velha
 * fica vago de propósito: número não se reaproveita.
 */
export function renumerar(atas, ata, { agora = new Date() } = {}) {
  if (!ata?.numero) return { erro: "Esta ata ainda não tem número emitido." };
  const ano = Number(String(ata.sessao?.data || "").slice(0, 4)) || 0;
  if (!ano) return { erro: "A ata não tem data de sessão — sem ela não há série a que pertencer." };
  if (!numeroIncoerente(ata))
    return { erro: `O número ${ata.numero} já corresponde ao ano da sessão.` };
  const sequencial = proximoSequencial(atas, { orgao: ata.orgao, curso: ata.curso, ano });
  const numero = numeroAta({ orgao: ata.orgao, curso: ata.curso, ano, sequencial });
  if (!numero) return { erro: "Não foi possível emitir o número na série correta." };
  return {
    ata: {
      ...ata, ano, sequencial, numero,
      numerosAnteriores: [...(ata.numerosAnteriores || []),
        { numero: ata.numero, ano: ata.ano || null, em: agora.toISOString() }],
    },
    anterior: ata.numero,
  };
}

/**
 * REORGANIZA A NUMERAÇÃO DO ACERVO INTEIRO (autorização do dono, ago/2026:
 * "pode reenumerar todas — minha equipe está avisada para reimprimir").
 *
 * Dentro de cada série (órgão + curso + ANO DA SESSÃO), as atas passam a ser
 * numeradas 001, 002, 003… **na ordem em que as sessões aconteceram**. É o
 * que faltava: além das de 2025 numeradas na série de 2026, a própria ordem
 * estava embaralhada — a sessão de 21/02 tinha o número 017 e a de 18/09, o
 * 010. Num arquivo que se apresenta ao MEC, o número precisa acompanhar o
 * tempo, senão a série não se lê.
 *
 * O que NÃO entra: rascunho (não tem número a reorganizar) e ata sem data de
 * sessão (não há série a que pertencer). Empate de data desempata pela ordem
 * de criação, para a passada dar sempre o mesmo resultado.
 *
 * Todo número trocado fica em `numerosAnteriores` — ele pode ter sido citado
 * noutra ata ou num ofício já entregue.
 */
export function renumerarAcervo(atas, { agora = new Date() } = {}) {
  const series = new Map();
  for (const a of atas || []) {
    if (!a?.numero) continue;                       // rascunho não tem o que reorganizar
    const ano = Number(String(a.sessao?.data || "").slice(0, 4)) || 0;
    if (!ano || !orgaoDe(a.orgao)) continue;
    const chave = serieDe({ orgao: a.orgao, curso: a.curso, ano });
    if (!series.has(chave)) series.set(chave, { orgao: a.orgao, curso: a.curso, ano, lista: [] });
    series.get(chave).lista.push(a);
  }

  const porId = new Map();
  const trocas = [];
  for (const { orgao, curso, ano, lista } of series.values()) {
    lista.sort((x, y) =>
      String(x.sessao?.data || "").localeCompare(String(y.sessao?.data || ""))
      || String(x.criadoEm || "").localeCompare(String(y.criadoEm || ""))
      || String(x.id || "").localeCompare(String(y.id || "")));
    lista.forEach((a, i) => {
      const sequencial = i + 1;
      const numero = numeroAta({ orgao, curso, ano, sequencial });
      if (!numero) return;
      if (numero === a.numero && a.ano === ano) { porId.set(a.id, a); return; }
      porId.set(a.id, {
        ...a, ano, sequencial, numero,
        numerosAnteriores: [...(a.numerosAnteriores || []),
          { numero: a.numero, ano: a.ano || null, em: agora.toISOString() }],
      });
      trocas.push({ id: a.id, de: a.numero, para: numero });
    });
  }
  return { atas: (atas || []).map((a) => porId.get(a?.id) || a), trocas };
}

/** Atribui número à ata (idempotente: ata já numerada não muda de número). */
export function numerar(atas, ata) {
  if (ata.numero) return ata;
  const ano = Number(ata.ano) || Number(String(ata.sessao?.data || "").slice(0, 4));
  if (!ano) return ata;
  const sequencial = proximoSequencial(atas, { orgao: ata.orgao, curso: ata.curso, ano });
  const numero = numeroAta({ orgao: ata.orgao, curso: ata.curso, ano, sequencial });
  if (!numero) return ata;
  return { ...ata, ano, sequencial, numero };
}

/* -------------------------- NORMALIZAÇÃO / LIMITES ---------------------- */
// O estado inteiro é regravado a cada gravação: campos livres são cortados
// para o arquivo não crescer sem limite.
const LIM = {
  curto: 160, medio: 400, longo: 6000, item: 4000,
  participantes: 200, pontos: 60, anexos: 30,
};
export const CONDICOES = ["membro", "suplente", "convidado", "secretaria"];
export const PRESENCAS = ["presente", "justificada", "ausente"];
export const MODALIDADES = ["presencial", "híbrida", "remota"];
export const TIPOS_SESSAO = ["ordinária", "extraordinária", "solene"];
// Três situações, por decisão do dono: "em revisão" e "aprovada" saíram
// porque quem revisa e quem aprova é o mesmo órgão que lavrou — eram dois
// cliques sem interlocutor do outro lado.
export const STATUS = ["rascunho", "minuta", "registrada"];
// Atas gravadas antes da simplificação: nenhuma delas tinha chegado ao
// registro, então voltam a ser minuta.
const STATUS_ANTIGOS = { revisao: "minuta", aprovada: "minuta" };
export const statusVigente = (s) => STATUS_ANTIGOS[String(s || "")] || String(s || "");

const t = (v, max = LIM.curto) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const bloco = (v, max = LIM.longo) =>
  String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim().slice(0, max);
const umDe = (v, lista, padrao) => (lista.includes(String(v || "")) ? String(v) : padrao);
const hora = (v) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? String(v) : "");

function normalizarParticipante(p) {
  return {
    nome: t(p?.nome, 120),
    email: t(p?.email, 160).toLowerCase(),
    cargo: t(p?.cargo, 120),
    condicao: umDe(p?.condicao, CONDICOES, "membro"),
    presenca: umDe(p?.presenca, PRESENCAS, "presente"),
  };
}

function normalizarPonto(p) {
  const enc = p?.encaminhamento || {};
  return {
    titulo: t(p?.titulo, 200),
    // vínculo com o catálogo da Pauta Regulatória (lib/pautas.js): é o que
    // permite provar ao avaliador que o tema voltou à mesa na periodicidade
    // esperada pelo instrumento do INEP.
    pautaMec: t(p?.pautaMec, 60),
    // quando o ponto é a leitura e aprovação da ata da sessão anterior
    ataAnterior: t(p?.ataAnterior, 40),
    discussao: bloco(p?.discussao, LIM.item),
    deliberacao: bloco(p?.deliberacao, LIM.medio * 4),
    votacao: {
      favor: Number(p?.votacao?.favor) || 0,
      contra: Number(p?.votacao?.contra) || 0,
      abstencoes: Number(p?.votacao?.abstencoes) || 0,
      houve: !!p?.votacao?.houve,
    },
    encaminhamento: {
      acao: t(enc.acao, 300),
      responsavel: t(enc.responsavel, 120),
      prazo: dataCivil(enc.prazo) || "",
    },
  };
}

/**
 * Normaliza o registro vindo do navegador. `base` é a versão já persistida
 * (para preservar número, histórico, PDF e autoria, que o cliente não manda).
 */
export function normalizarAta(bruto, { base = null, autor = null, agora = new Date() } = {}) {
  const b = bruto || {};
  const o = orgaoDe(b.orgao) || orgaoDe(base?.orgao);
  const sessaoData = dataCivil(b.sessao?.data) || "";
  const participantes = (Array.isArray(b.participantes) ? b.participantes : [])
    .slice(0, LIM.participantes).map(normalizarParticipante).filter((p) => p.nome);
  const pauta = (Array.isArray(b.pauta) ? b.pauta : [])
    .slice(0, LIM.pontos).map(normalizarPonto).filter((p) => p.titulo);

  return {
    id: base?.id || t(b.id, 40) || null,
    orgao: o?.codigo || "",
    orgaoNome: o?.nomeLivre ? t(b.orgaoNome, 160) : (o?.nome || ""),
    curso: o?.porCurso ? t(b.curso, 60) : "",
    /* O ANO É O DA SESSÃO, e acompanha a data enquanto a ata não tem número
       (achado do dono, ago/2026): uma ata do NDE de Psicologia com sessão em
       21/02/2025 saiu numerada ATA-NDE-PSI-**2026**-017. O ano congelava no
       primeiro valor gravado — o rascunho nasce com a data de hoje, e trocar
       a data para a sessão retroativa não desfazia isso —, e a numeração usa
       justamente esse campo.

       Datas passadas são aceitas de propósito, para os órgãos regularizarem
       o arquivo; o número precisa dizer o ano em que a reunião aconteceu,
       senão a série do órgão fica incoerente com as próprias atas.

       Depois de NUMERADA o ano se fixa: o número já foi emitido e é a chave
       do que está arquivado — mudá-lo em silêncio seria pior que o erro. */
    ano: base?.numero
      ? (base.ano || Number(sessaoData.slice(0, 4)) || null)
      : (Number(sessaoData.slice(0, 4)) || base?.ano || null),
    sequencial: base?.sequencial || null,
    numero: base?.numero || null,
    // os números que esta ata já teve (reemissão pela gestão): o antigo pode
    // ter sido citado noutra ata ou num ofício, e o rastro precisa existir
    numerosAnteriores: Array.isArray(base?.numerosAnteriores)
      ? base.numerosAnteriores.slice(0, 10) : [],

    sessao: {
      tipo: umDe(b.sessao?.tipo, TIPOS_SESSAO, "ordinária"),
      data: sessaoData,
      horaInicio: hora(b.sessao?.horaInicio),
      horaFim: hora(b.sessao?.horaFim),
      local: t(b.sessao?.local, 200),
      modalidade: umDe(b.sessao?.modalidade, MODALIDADES, "presencial"),
      convocacao: t(b.sessao?.convocacao, 200),
    },
    presidencia: { nome: t(b.presidencia?.nome, 120), cargo: t(b.presidencia?.cargo, 120) },
    secretaria: {
      nome: t(b.secretaria?.nome, 120),
      email: t(b.secretaria?.email, 160).toLowerCase(),
    },
    participantes,
    pauta,
    informes: bloco(b.informes, LIM.item),
    observacoes: bloco(b.observacoes, LIM.item),

    texto: bloco(b.texto, 40000),
    redacao: base?.redacao || null,
    status: umDe(statusVigente(b.status), STATUS, statusVigente(base?.status) || "rascunho"),

    criadoEm: base?.criadoEm || agora.toISOString(),
    criadoPor: base?.criadoPor || autor || "",
    atualizadoEm: agora.toISOString(),
    atualizadoPor: autor || base?.atualizadoPor || "",
    historico: base?.historico || [],
    pdf: base?.pdf || null,
    anexos: base?.anexos || [],
    registro: base?.registro || null,
  };
}

/* ------------------------------ VALIDAÇÃO ------------------------------- */
/** Requisitos para a ata deixar de ser rascunho e receber número. */
export function validarAta(ata) {
  const erros = [];
  const o = orgaoDe(ata?.orgao);
  if (!o) erros.push("Escolha o órgão da reunião.");
  if (o?.porCurso && !ata.curso) erros.push("Escolha o curso do órgão.");
  if (o?.nomeLivre && !ata.orgaoNome) erros.push("Informe o nome do órgão (comissão, núcleo, câmara…).");

  const dia = diaSerial(ata?.sessao?.data);
  if (dia === null) erros.push("Informe a data da sessão.");
  else if (dia > diaSerial(hojeLocalISO()) + 1)
    erros.push("A data da sessão está no futuro — a ata registra reunião já ocorrida.");

  if (!ata?.sessao?.horaInicio) erros.push("Informe o horário de início.");
  if (!ata?.sessao?.local) erros.push("Informe o local (ou a plataforma, se remota).");
  if (!ata?.presidencia?.nome) erros.push("Informe quem presidiu a sessão.");
  // A secretaria é opcional: nem todo órgão designa quem secretarie, e a ata
  // não pode ficar travada por isso. Em branco, ela simplesmente não aparece
  // no documento — nem no texto, nem no quadro, nem na folha de assinaturas.

  const presentes = (ata?.participantes || []).filter((p) => p.presenca === "presente");
  if (presentes.length < 2) erros.push("Registre ao menos dois participantes presentes.");

  const pauta = ata?.pauta || [];
  if (!pauta.length) erros.push("Registre ao menos um ponto de pauta.");
  else if (!pauta.some((p) => p.discussao || p.deliberacao))
    erros.push("Descreva a discussão ou a deliberação de ao menos um ponto de pauta.");

  return erros;
}

/**
 * AVISOS ANTES DE REGISTRAR — o que não impede o registro, mas quase sempre
 * é engano de digitação. `validarAta` diz o que FALTA; isto diz o que está
 * ESTRANHO. A diferença importa: registrar é ato do órgão, e travar a ata
 * por uma suspeita seria o sistema decidindo no lugar de quem se reuniu.
 * Cada aviso aponta a incoerência entre dois campos que a pessoa preencheu
 * em momentos diferentes — é aí que o erro mora.
 */
export function avisosDaAta(ata) {
  const avisos = [];
  const q = quorum(ata);

  /* O número diz um ano e a sessão diz outro (achado do dono, ago/2026):
     ATA-NDE-PSI-**2026**-017 numa sessão de 21/02/2025. A causa foi corrigida
     — o ano agora acompanha a data enquanto a ata não tem número —, mas as
     que já saíram assim continuam no arquivo, e é a série do órgão que fica
     incoerente. O aviso é o que permite encontrá-las: número emitido não se
     troca em silêncio, e quem decide reemitir é a gestão. */
  if (numeroIncoerente(ata)) {
    avisos.push({ tipo: "ano-do-numero",
      texto: `O número ${ata.numero} é da série de ${anoDoNumero(ata)}, mas a sessão aconteceu em `
        + `${String(ata.sessao.data).split("-").reverse().join("/")}. A gestão pode reemitir o número `
        + `na série do ano certo.` });
  }
  const presentes = (ata?.participantes || []).filter((p) => p.presenca === "presente");
  const nomes = presentes.map((p) => String(p.nome || "").trim().toLowerCase()).filter(Boolean);
  const comparavel = (v) => String(v || "").trim().toLowerCase();

  // quem presidiu e quem secretariou têm de estar na lista de presentes:
  // ata que registra ausente conduzindo a sessão não se sustenta
  const presidente = comparavel(ata?.presidencia?.nome);
  if (presidente && !nomes.includes(presidente)) {
    avisos.push({ tipo: "presidencia-ausente",
      texto: `${ata.presidencia.nome} presidiu a sessão, mas não consta como presente na lista de participantes.` });
  }
  const secretaria = comparavel(ata?.secretaria?.nome);
  if (secretaria && !nomes.includes(secretaria)) {
    avisos.push({ tipo: "secretaria-ausente",
      texto: `${ata.secretaria.nome} secretariou a sessão, mas não consta como presente na lista de participantes.` });
  }

  (ata?.pauta || []).forEach((p, i) => {
    const n = i + 1;
    const titulo = String(p.titulo || "").trim() || `Ponto ${n}`;
    // votação com mais votos do que gente na sala
    const v = p.votacao || {};
    if (v.houve) {
      const votos = (Number(v.favor) || 0) + (Number(v.contra) || 0) + (Number(v.abstencoes) || 0);
      if (votos > q.presentes) {
        avisos.push({ tipo: "votos-acima-do-quorum", ponto: n,
          texto: `“${titulo}”: ${votos} voto(s) registrado(s) para ${q.presentes} presente(s).` });
      }
      if (!votos) {
        avisos.push({ tipo: "votacao-sem-votos", ponto: n,
          texto: `“${titulo}”: a votação está marcada, mas nenhum voto foi contado.` });
      }
    }
    // ponto discutido e não deliberado: acontece, mas quase sempre é esquecimento
    if (String(p.discussao || "").trim() && !String(p.deliberacao || "").trim()) {
      avisos.push({ tipo: "sem-deliberacao", ponto: n,
        texto: `“${titulo}”: há discussão registrada, mas nenhuma deliberação.` });
    }
    // encaminhamento é tarefa: sem responsável ou sem prazo, ninguém o retoma
    const e = p.encaminhamento || {};
    if (String(e.acao || "").trim()) {
      const falta = [!String(e.responsavel || "").trim() && "responsável",
        !String(e.prazo || "").trim() && "prazo"].filter(Boolean);
      if (falta.length) {
        avisos.push({ tipo: "encaminhamento-incompleto", ponto: n,
          texto: `“${titulo}”: o encaminhamento está sem ${falta.join(" e sem ")} — assim ele não volta à mesa.` });
      }
    }
  });

  // sessão sem hora de término: o documento fica sem o fecho que o modelo pede
  if (ata?.sessao?.horaInicio && !ata?.sessao?.horaFim) {
    avisos.push({ tipo: "sem-encerramento", texto: "A sessão está sem horário de término." });
  }
  return avisos;
}

/* -------------------------- FOLHA DE ASSINATURAS ------------------------
   Quem assina a ata, na ordem em que o PDF desenha: a presidência, a
   secretaria e todo participante PRESENTE. Ausente e justificada não
   assinam — a folha registra quem esteve na sessão.

   A presidência é declarada por NOME (o formulário não pede o e-mail dela),
   e `validarAta` já exige que ela conste entre os presentes: é de lá que sai
   o e-mail, que é a chave da assinatura digitalizada. Sem esse casamento,
   quem presidiu apareceria sem assinatura mesmo tendo enviado a sua — e o
   remédio seria pedir o mesmo e-mail duas vezes no formulário.

   O NOME COMPLETO é a SEGUNDA CHAVE (pedido do dono, ago/2026: "rastreie
   pelo nome, para ganharmos tempo"). Boa parte das listas de presença não
   traz e-mail nenhum, e a mesma professora aparece em dezenas de atas de NDE
   e de Colegiado — enviar a assinatura dela uma vez por ata seria justamente
   o trabalho que este recurso existe para evitar. Com o nome, a assinatura
   enviada numa ata passa a sair em TODAS as outras em que aquele nome
   consta, inclusive nas já registradas.

   Duas regras mantêm isso honesto: o **e-mail manda quando existe** (é a
   chave forte, e é o que separa dois homônimos), e **nome de uma palavra só
   não é chave** — "Ana" não identifica ninguém, e uma assinatura colada em
   toda "Ana" do acervo seria pior do que nenhuma.
   ------------------------------------------------------------------------ */
export const chaveDoNome = (v) => String(v || "").trim().toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/** Nome com uma palavra só não identifica ninguém — não serve de chave. */
export const nomeServeDeChave = (v) => chaveDoNome(v).split(" ").filter(Boolean).length >= 2;

/**
 * O ENDEREÇO da assinatura de um assinante: o e-mail quando existe, o nome
 * completo quando não. É o que a tela usa para falar de uma linha da folha e
 * o que a rota usa para saber de quem é a imagem que está subindo.
 */
export const refDoAssinante = (a) => String(a?.email || "").trim().toLowerCase()
  || (nomeServeDeChave(a?.nome) ? `nome:${chaveDoNome(a.nome)}` : "");

export function assinantesDaAta(ata) {
  const presentes = (ata?.participantes || []).filter((p) => p.presenca === "presente");
  const porNome = (nome) => presentes.find((p) => chaveDoNome(p.nome) === chaveDoNome(nome)) || null;
  const email = (v) => String(v || "").trim().toLowerCase();
  const saida = [];
  if (ata?.presidencia?.nome) {
    saida.push({
      papel: "presidencia", rotulo: "Presidência da sessão",
      nome: ata.presidencia.nome, cargo: ata.presidencia.cargo || "",
      email: email(porNome(ata.presidencia.nome)?.email),
    });
  }
  if (ata?.secretaria?.nome) {
    saida.push({
      papel: "secretaria", rotulo: "Secretaria da sessão", nome: ata.secretaria.nome, cargo: "",
      // o e-mail da secretaria é campo próprio; na falta dele, vale o da
      // lista de presença, que é a mesma pessoa
      email: email(ata.secretaria.email) || email(porNome(ata.secretaria.nome)?.email),
    });
  }
  // os membros: quem já assinou acima não repete a assinatura embaixo
  const jaAssina = new Set(saida.map((x) => chaveDoNome(x.nome)));
  for (const p of presentes) {
    if (jaAssina.has(chaveDoNome(p.nome))) continue;
    saida.push({ papel: "membro", rotulo: "", nome: p.nome, cargo: p.cargo || "", email: email(p.email) });
  }
  // o `ref` é o endereço da assinatura de cada um — e-mail quando há, nome
  // completo quando não. Quem não tem nenhum dos dois assina à caneta.
  return saida.map((x) => ({ ...x, ref: refDoAssinante(x), chaveNome: chaveDoNome(x.nome) }));
}

/**
 * ESPALHA O E-MAIL CONHECIDO DE UMA PESSOA PELO ACERVO (pedido do dono,
 * ago/2026: "coloque como regra principal o nome, inclusive, atualizando os
 * e-mails").
 *
 * Quem identifica alguém no acervo é o NOME COMPLETO — é o que toda lista de
 * presença tem, desde as mais antigas. O e-mail é melhor (separa homônimos,
 * liga a pessoa à conta do portal), mas está preenchido só em parte das
 * atas. Quando a secretaria informa o e-mail de alguém numa reunião, ela
 * está dizendo ao sistema uma coisa que vale para o acervo inteiro: este
 * nome é esta pessoa. A partir daí, toda ata em que o mesmo nome aparece
 * **sem e-mail** recebe o e-mail — e passa a ter o vínculo forte.
 *
 * Duas regras que impedem isso de estragar o arquivo:
 *  - **nunca sobrescreve** um e-mail já preenchido. Endereço diferente para o
 *    mesmo nome pode ser a mesma pessoa noutra conta ou um homônimo; nos dois
 *    casos, quem decide é gente, não a varredura;
 *  - **nome de uma palavra só não é chave** — espalhar um e-mail por toda
 *    "Ana" do acervo seria pior que não espalhar nenhum.
 *
 * Acento, caixa e espaço repetido não contam: "Jadson Belem de Moura" e
 * "Jadson Belém de Moura" são a mesma pessoa.
 *
 * ALTERA as atas recebidas (o chamador está dentro da fila de escrita e grava
 * o array logo em seguida) e devolve o que mudou, para o ato poder ser dito
 * em número a quem o praticou.
 */
const EMAIL_PLAUSIVEL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export function propagarEmailPorNome(atas, { nome, email }, { exceto = "" } = {}) {
  const chave = chaveDoNome(nome);
  const e = String(email || "").trim().toLowerCase();
  if (!nomeServeDeChave(nome) || !EMAIL_PLAUSIVEL.test(e)) return { atas: [], pessoas: 0 };
  const tocadas = [];
  const divergentes = [];
  let pessoas = 0;
  for (const a of atas || []) {
    if (!a || a.id === exceto) continue;
    let mudou = false;
    for (const p of a.participantes || []) {
      if (chaveDoNome(p.nome) !== chave) continue;
      const atual = String(p.email || "").trim().toLowerCase();
      if (atual) {
        // o mesmo nome com OUTRO endereço: pode ser a segunda conta da pessoa
        // ou um homônimo. Nenhuma varredura decide isso — mas quem acabou de
        // informar o e-mail precisa saber que existe a divergência
        if (atual !== e) divergentes.push({ ata: a.numero || a.id, email: atual });
        continue;
      }
      p.email = e; mudou = true; pessoas++;
    }
    // a secretaria da sessão tem campo próprio de e-mail, e é a mesma pessoa
    if (a.secretaria?.nome && chaveDoNome(a.secretaria.nome) === chave
      && !String(a.secretaria.email || "").trim()) {
      a.secretaria.email = e; mudou = true;
    }
    if (mudou) tocadas.push(a.numero || a.id);
  }
  return { atas: tocadas, pessoas, divergentes };
}

/**
 * Os pares nome+e-mail que uma ata AFIRMA — o que ela tem a ensinar ao
 * acervo. Sai da lista de presença e da secretaria da sessão.
 */
export function paresDeIdentidade(ata) {
  const vistos = new Map();
  const põe = (nome, email) => {
    const e = String(email || "").trim().toLowerCase();
    // endereço pela metade não ensina nada ao acervo — e, como a propagação
    // nunca sobrescreve, um "jadson@unieg" espalhado ficaria para sempre
    if (!EMAIL_PLAUSIVEL.test(e) || !nomeServeDeChave(nome)) return;
    if (!vistos.has(chaveDoNome(nome))) vistos.set(chaveDoNome(nome), { nome, email: e });
  };
  for (const p of ata?.participantes || []) põe(p?.nome, p?.email);
  põe(ata?.secretaria?.nome, ata?.secretaria?.email);
  return [...vistos.values()];
}

/* ------------------------------ PERMISSÕES ------------------------------ */
/**
 * Visibilidade: cada usuário enxerga apenas as atas que ele mesmo registrou.
 * A gestão (PROPPEX e coordenadores do setor) enxerga todas — é ela que
 * acompanha a conformidade dos órgãos.
 *
 * Não basta ter participado da sessão nem constar como secretaria: a ata é do
 * acervo de quem a lavrou, e quem precisa de cópia recebe o PDF por e-mail no
 * registro.
 */
export function podeVerAta({ email, gestao } = {}, ata) {
  if (gestao) return true;
  if (!email || !ata) return false;
  return ata.criadoPor === email;
}

/**
 * Edição: quem vê, edita — inclusive depois de registrada.
 *
 * Ata registrada era documento fechado. Por decisão do dono, deixou de ser:
 * erro em ata é coisa que aparece meses depois, e obrigar a PROPPEX a
 * intermediar cada correção de vírgula não protegia nada. A retificação fica
 * registrada no histórico, que é o que de fato dá segurança.
 */
export function podeEditarAta({ email, gestao } = {}, ata) {
  if (!ata) return false;
  return podeVerAta({ email, gestao }, ata);
}

/* ============================== BUSCA ===================================
   "Isso já foi discutido em alguma reunião?" é a pergunta que se faz ao
   acervo (pedido do dono, ago/2026), e ela não se responde abrindo ata por
   ata. A busca varre TODOS os campos onde a discussão mora — pontos de
   pauta, deliberações, encaminhamentos, informes, o texto da minuta, e
   também quem estava lá — e devolve o TRECHO em que a expressão aparece,
   com o lugar ("Ponto 3 · deliberação"). É o trecho que responde a
   pergunta; o número e a data dizem onde provar.

   O recorte do acervo vale igual: quem busca só encontra o que já podia
   ver (`podeVerAta`) — isso se aplica na rota, com a lista já filtrada.

   Acento e caixa não contam: quem procura "curriculo" acha "currículo". */
export function normalizarBusca(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Os termos da expressão: 2+ caracteres, sem repetir, no máximo 8. */
export function termosDaBusca(q) {
  return [...new Set(normalizarBusca(q).split(/[^a-z0-9@.]+/).filter((x) => x.length >= 2))].slice(0, 8);
}

/** Os campos de uma ata onde se procura, com o rótulo do lugar. */
function camposDaAta(ata) {
  const campos = [];
  const põe = (onde, texto) => { if (String(texto || "").trim()) campos.push({ onde, texto: String(texto) }); };
  // a identificação entra na varredura para o número da ata também ser
  // encontrável por aqui — quem tem o número na mão não quer trocar de tela
  põe("Identificação", [ata?.numero, tituloDe(ata), ata?.sessao?.tipo].filter(Boolean).join(" · "));
  põe("Local da sessão", ata?.sessao?.local);
  põe("Convocação", ata?.sessao?.convocacao);
  põe("Presidência", ata?.presidencia?.nome);
  põe("Secretaria", ata?.secretaria?.nome);
  const nomes = (ata?.participantes || []).map((p) => [p.nome, p.cargo].filter(Boolean).join(" — ")).join("; ");
  põe("Presenças", nomes);
  (ata?.pauta || []).forEach((p, i) => {
    const n = `Ponto ${i + 1}`;
    põe(`${n} · título`, p?.titulo);
    põe(`${n} · discussão`, p?.discussao);
    põe(`${n} · deliberação`, p?.deliberacao);
    const e = p?.encaminhamento || {};
    põe(`${n} · encaminhamento`, [e.acao, e.responsavel, e.prazo].filter(Boolean).join(" · "));
  });
  põe("Informes", ata?.informes);
  põe("Observações", ata?.observacoes);
  põe("Texto da ata", ata?.texto);
  return campos;
}

/* O trecho com a expressão no meio, quebrado em PARTES (marcada/não
   marcada). Quem destaca é quem monta a tela, e assim o destaque não depende
   de a tela repetir a normalização de acentos. */
function trechoDe(texto, termos, { janela = 150 } = {}) {
  const alvo = normalizarBusca(texto);
  let pos = -1, achado = "";
  for (const termo of termos) {
    const i = alvo.indexOf(termo);
    if (i >= 0 && (pos < 0 || i < pos)) { pos = i; achado = termo; }
  }
  if (pos < 0) return null;
  const ini = Math.max(0, pos - Math.floor(janela / 3));
  const fim = Math.min(texto.length, pos + achado.length + janela);
  const bruto = texto.slice(ini, fim);
  const partes = [];
  const norm = normalizarBusca(bruto);
  let cursor = 0;
  while (cursor < bruto.length) {
    let melhor = -1, qual = "";
    for (const termo of termos) {
      const i = norm.indexOf(termo, cursor);
      if (i >= 0 && (melhor < 0 || i < melhor)) { melhor = i; qual = termo; }
    }
    if (melhor < 0) { partes.push({ t: bruto.slice(cursor), m: false }); break; }
    if (melhor > cursor) partes.push({ t: bruto.slice(cursor, melhor), m: false });
    partes.push({ t: bruto.slice(melhor, melhor + qual.length), m: true });
    cursor = melhor + qual.length;
  }
  return {
    partes,
    inicioCortado: ini > 0,
    fimCortado: fim < texto.length,
  };
}

/**
 * Procura a expressão nas atas recebidas (JÁ filtradas pelo que a pessoa
 * pode ver). Todos os termos precisam aparecer na ata — quem digita duas
 * palavras quer as duas —, e o resultado traz os trechos de cada lugar em
 * que apareceram, da sessão mais recente para a mais antiga.
 */
export function buscarAtas(atas, q, { limite = 60, trechosPorAta = 4 } = {}) {
  const termos = termosDaBusca(q);
  if (!termos.length) return { termos, total: 0, resultados: [] };
  const achados = [];
  for (const ata of atas || []) {
    const campos = camposDaAta(ata);
    const tudo = normalizarBusca(campos.map((c) => c.texto).join(" \n "));
    if (!termos.every((t2) => tudo.includes(t2))) continue;
    const trechos = [];
    for (const c of campos) {
      if (trechos.length >= trechosPorAta) break;
      const tr = trechoDe(c.texto, termos);
      if (tr) trechos.push({ onde: c.onde, ...tr });
    }
    achados.push({
      id: ata.id, numero: ata.numero || null, status: ata.status || "rascunho",
      orgao: ata.orgao, orgaoNome: ata.orgaoNome || "", curso: ata.curso || "",
      titulo: tituloDe(ata), tipo: ata?.sessao?.tipo || "", data: ata?.sessao?.data || "",
      pontos: (ata.pauta || []).length, trechos,
    });
  }
  achados.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { termos, total: achados.length, resultados: achados.slice(0, limite) };
}

/* -------------------------- APOIO À APRESENTAÇÃO ------------------------ */
export function tituloDe(ata) {
  const o = orgaoDe(ata?.orgao);
  if (!o) return "Reunião";
  const nome = o.nomeLivre ? (ata.orgaoNome || o.nome) : o.nome;
  const c = ata.curso ? cursoDe(ata.curso)?.nome || ata.curso : "";
  return c ? `${nome} — ${c}` : nome;
}

export function quorum(ata) {
  const p = ata?.participantes || [];
  return {
    total: p.length,
    presentes: p.filter((x) => x.presenca === "presente").length,
    justificadas: p.filter((x) => x.presenca === "justificada").length,
    ausentes: p.filter((x) => x.presenca === "ausente").length,
    convidados: p.filter((x) => x.condicao === "convidado" && x.presenca === "presente").length,
  };
}

/** Encaminhamentos com prazo, para o painel de pendências. */
export function encaminhamentos(atas) {
  const hoje = diaSerial(hojeLocalISO());
  const saida = [];
  for (const a of atas || []) {
    for (const [i, p] of (a.pauta || []).entries()) {
      const e = p.encaminhamento;
      if (!e?.acao) continue;
      const d = diaSerial(e.prazo);
      saida.push({
        ataId: a.id, numero: a.numero, orgao: tituloDe(a), ponto: p.titulo, indice: i,
        acao: e.acao, responsavel: e.responsavel, prazo: e.prazo,
        atrasado: d !== null && hoje !== null && d < hoje,
      });
    }
  }
  return saida;
}

/** Registro de auditoria (quem mudou o quê e quando). */
export function anotar(ata, { quem, oQue, agora = new Date() }) {
  const historico = [...(ata.historico || []), { quando: agora.toISOString(), quem: quem || "", oQue }];
  return { ...ata, historico: historico.slice(-60) };
}
