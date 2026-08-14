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
    ano: base?.ano || Number(sessaoData.slice(0, 4)) || null,
    sequencial: base?.sequencial || null,
    numero: base?.numero || null,

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
