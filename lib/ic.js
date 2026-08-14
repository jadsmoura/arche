/* ========================================================================
   ARCHÉ IC — Iniciação Científica: núcleo do setor.

   Fluxo do projeto:
     rascunho → submetido → aprovado (em execução) → concluído
                          ↘ devolvido (volta a ser editável)
                          ↘ reprovado

   Quem faz o quê:
     - o ORIENTADOR submete o projeto, indica os alunos e mantém o cronograma;
     - a GESTÃO (PROPPEX / coordenação de pesquisa) avalia a submissão;
     - o ALUNO INDICADO envia os relatórios parcial e final;
     - o ORIENTADOR valida (ou devolve) cada relatório do seu aluno.

   Visibilidade: cada um enxerga os projetos em que está — o orientador os
   seus, o aluno aqueles em que foi indicado. Só a gestão vê todos.
   ======================================================================== */
import { CURSOS, cursoDe, siglaCurso } from "./atas.js";   // catálogo comum de cursos
import { hojeLocalISO } from "./datas.js";

export { CURSOS, cursoDe, siglaCurso };
export const IC_KEY = "ic-projetos-v1";

/* ------------------------------ catálogos -------------------------------- */
export const MODALIDADES = [
  { codigo: "pibic", nome: "PIBIC", desc: "Bolsa de Iniciação Científica" },
  { codigo: "pibiti", nome: "PIBITI", desc: "Bolsa de Iniciação em Desenvolvimento Tecnológico e Inovação" },
  { codigo: "voluntaria", nome: "IC Voluntária", desc: "Iniciação Científica sem bolsa" },
];
export const modalidadeDe = (c) =>
  MODALIDADES.find((m) => m.codigo === String(c || "").toLowerCase()) || null;

export const STATUS = ["rascunho", "submetido", "devolvido", "aprovado", "concluido", "reprovado"];
export const ROTULO_STATUS = {
  rascunho: "Rascunho", submetido: "Em avaliação", devolvido: "Devolvido",
  aprovado: "Em execução", concluido: "Concluído", reprovado: "Reprovado",
};
/** Situações em que o projeto está valendo (conta nos indicadores e no cronograma). */
export const EM_ANDAMENTO = new Set(["aprovado", "concluido"]);

export const SITUACOES_ETAPA = ["prevista", "andamento", "concluida"];
export const TIPOS_RELATORIO = ["parcial", "final"];
export const SITUACOES_RELATORIO = ["enviado", "validado", "devolvido"];

/* -------------------------------- números -------------------------------- */
/** IC-2026-001 — protocolo emitido na submissão e nunca reaproveitado. */
export function numeroProjeto({ ano, sequencial }) {
  return `IC-${ano}-${String(sequencial).padStart(3, "0")}`;
}

export function proximoSequencial(projetos, ano) {
  const usados = (projetos || [])
    .filter((p) => p?.numero && p.ano === ano)
    .map((p) => Number(String(p.numero).split("-").pop()) || 0);
  return (usados.length ? Math.max(...usados) : 0) + 1;
}

/** Emite o número do projeto, se ele ainda não tiver um. */
export function numerar(projetos, projeto) {
  if (projeto.numero) return projeto;
  const ano = projeto.ano || Number(String(projeto.criadoEm || hojeLocalISO()).slice(0, 4));
  return { ...projeto, ano, numero: numeroProjeto({ ano, sequencial: proximoSequencial(projetos, ano) }) };
}

/* ------------------------------ normalização ----------------------------- */
const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const email = (v) => t(v, 160).toLowerCase();
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const umDe = (v, lista, padrao) => (lista.includes(String(v || "")) ? String(v) : padrao);
const id = (prefixo) => `${prefixo}-${Math.random().toString(36).slice(2, 10)}`;

function normalizarAluno(a) {
  return {
    nome: t(a?.nome, 120),
    email: email(a?.email),
    matricula: t(a?.matricula, 40),
    curso: t(a?.curso, 60),
    // a bolsa é do aluno, não do projeto: o mesmo projeto pode ter um
    // bolsista e um voluntário
    bolsista: !!a?.bolsista,
  };
}

function normalizarEtapa(e) {
  return {
    id: t(e?.id, 40) || id("et"),
    atividade: t(e?.atividade, 220),
    inicio: data(e?.inicio),
    fim: data(e?.fim),
    // responsável é o e-mail de um aluno indicado; vazio = o orientador
    responsavel: email(e?.responsavel),
    situacao: umDe(e?.situacao, SITUACOES_ETAPA, "prevista"),
    observacao: t(e?.observacao, 400),
  };
}

function normalizarRelatorio(r) {
  return {
    id: t(r?.id, 40) || id("rel"),
    tipo: umDe(r?.tipo, TIPOS_RELATORIO, "parcial"),
    aluno: email(r?.aluno),
    periodo: t(r?.periodo, 60),
    resumo: t(r?.resumo, 20000),
    anexos: Array.isArray(r?.anexos) ? r.anexos.slice(0, 10) : [],
    enviadoEm: t(r?.enviadoEm, 40),
    situacao: umDe(r?.situacao, SITUACOES_RELATORIO, "enviado"),
    parecer: t(r?.parecer, 4000),
    avaliadoPor: email(r?.avaliadoPor),
    avaliadoEm: t(r?.avaliadoEm, 40),
  };
}

/**
 * Devolve o projeto no formato canônico. `base` é o projeto já gravado: os
 * campos de controle (número, situação, autoria, histórico) vêm dele e nunca
 * do que chega do navegador.
 */
export function normalizarProjeto(bruto, { base = null, autor = null, agora = new Date() } = {}) {
  const b = bruto || {};
  const agoraISO = agora.toISOString();
  const criadoEm = base?.criadoEm || agoraISO;
  return {
    id: base?.id || t(b.id, 40) || id("ic"),
    numero: base?.numero || "",
    ano: base?.ano || Number(criadoEm.slice(0, 4)),
    status: umDe(base?.status, STATUS, "rascunho"),
    criadoEm,
    criadoPor: base?.criadoPor || email(autor) || "",
    atualizadoEm: agoraISO,

    titulo: t(b.titulo, 300),
    resumo: t(b.resumo, 20000),
    palavrasChave: t(b.palavrasChave, 300),
    curso: t(b.curso, 60),
    modalidade: umDe(b.modalidade, MODALIDADES.map((m) => m.codigo), "pibic"),
    edital: t(b.edital, 80),
    linhaPesquisa: t(b.linhaPesquisa, 200),
    objetivos: t(b.objetivos, 20000),
    metodologia: t(b.metodologia, 20000),
    inicio: data(b.inicio),
    fim: data(b.fim),

    orientador: {
      nome: t(b.orientador?.nome, 120),
      email: email(b.orientador?.email) || base?.orientador?.email || email(autor),
      titulacao: t(b.orientador?.titulacao, 60),
    },
    alunos: (Array.isArray(b.alunos) ? b.alunos : []).slice(0, 10)
      .map(normalizarAluno).filter((a) => a.nome || a.email),
    cronograma: (Array.isArray(b.cronograma) ? b.cronograma : []).slice(0, 60)
      .map(normalizarEtapa).filter((e) => e.atividade),

    // não vêm do formulário: só o servidor mexe
    relatorios: (base?.relatorios || []).map(normalizarRelatorio),
    avaliacao: base?.avaliacao || null,
    historico: base?.historico || [],
  };
}

/* -------------------------------- validação ------------------------------ */
/** Erros que impedem a SUBMISSÃO. Rascunho pode ficar incompleto à vontade. */
export function validarProjeto(p) {
  const erros = [];
  if (t(p?.titulo).length < 8) erros.push("Informe o título do projeto.");
  if (t(p?.resumo).length < 120) erros.push("O resumo precisa de ao menos 120 caracteres.");
  if (!cursoDe(p?.curso)) erros.push("Escolha o curso.");
  if (!modalidadeDe(p?.modalidade)) erros.push("Escolha a modalidade (PIBIC, PIBITI ou voluntária).");
  if (!t(p?.orientador?.nome)) erros.push("Informe o nome de quem orienta.");
  if (!t(p?.orientador?.email)) erros.push("Informe o e-mail de quem orienta.");
  if (!t(p?.objetivos)) erros.push("Descreva os objetivos.");
  if (!t(p?.metodologia)) erros.push("Descreva a metodologia.");

  const etapas = p?.cronograma || [];
  if (!etapas.length) erros.push("Monte o cronograma: ao menos uma atividade.");
  else if (etapas.some((e) => !e.inicio || !e.fim))
    erros.push("Cada atividade do cronograma precisa de início e fim.");
  else if (etapas.some((e) => e.fim < e.inicio))
    erros.push("Há atividade do cronograma terminando antes de começar.");

  for (const a of p?.alunos || []) {
    if (!a.nome) erros.push("Aluno indicado sem nome.");
    if (!a.email) erros.push(`Informe o e-mail de ${a.nome || "cada aluno indicado"} — é por ele que o aluno acessa o projeto.`);
  }
  return erros;
}

/* ------------------------------- permissões ------------------------------ */
const mesmo = (a, b) => !!a && String(a).toLowerCase() === String(b || "").toLowerCase();

/** "gestao" | "orientador" | "aluno" | null — o que a pessoa é NESTE projeto. */
export function papelNoProjeto({ email: quem, gestao } = {}, p) {
  if (!p) return null;
  if (mesmo(quem, p.orientador?.email) || mesmo(quem, p.criadoPor)) return "orientador";
  if ((p.alunos || []).some((a) => mesmo(quem, a.email))) return "aluno";
  // a gestão vem por último: quem orienta o próprio projeto age como
  // orientador, mesmo sendo da PROPPEX
  return gestao ? "gestao" : null;
}

export const podeVerProjeto = (u, p) => !!papelNoProjeto(u, p);

/** Editar a proposta: a gestão sempre; quem orienta, enquanto não estiver em avaliação. */
export function podeEditarProjeto(u, p) {
  const papel = papelNoProjeto(u, p);
  if (papel === "gestao") return true;
  if (papel !== "orientador") return false;
  return ["rascunho", "devolvido"].includes(p.status);
}

/** Cronograma e indicação de alunos seguem com quem orienta durante a execução. */
export function podeGerirExecucao(u, p) {
  const papel = papelNoProjeto(u, p);
  return papel === "gestao" || papel === "orientador";
}

/** Só a gestão avalia a submissão. */
export const podeAvaliar = (u, p) => papelNoProjeto(u, p) === "gestao" && p.status === "submetido";

/** Relatório é do aluno indicado — é ele quem envia. */
export function podeEnviarRelatorio(u, p) {
  return papelNoProjeto(u, p) === "aluno" && EM_ANDAMENTO.has(p.status);
}

/** Validar (ou devolver) o relatório é do orientador; a gestão também pode. */
export function podeValidarRelatorio(u, p) {
  const papel = papelNoProjeto(u, p);
  return papel === "orientador" || papel === "gestao";
}

/* --------------------------- leituras derivadas -------------------------- */
export function tituloCurto(p, max = 90) {
  const s = t(p?.titulo) || "(sem título)";
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export const alunoDe = (p, mail) =>
  (p?.alunos || []).find((a) => mesmo(mail, a.email)) || null;

/**
 * Cronograma de todos os projetos num só lugar, do jeito que cada um precisa
 * ver: quem orienta enxerga as atividades dos seus projetos; o aluno, apenas
 * o próprio plano de trabalho (o que está sob a responsabilidade dele).
 */
export function cronogramaDe(projetos, u) {
  const linhas = [];
  for (const p of projetos || []) {
    const papel = papelNoProjeto(u, p);
    if (!papel) continue;
    for (const e of p.cronograma || []) {
      // o aluno só vê o que é dele; etapa sem responsável é do orientador
      if (papel === "aluno" && !mesmo(u?.email, e.responsavel)) continue;
      linhas.push({
        projetoId: p.id, numero: p.numero, titulo: p.titulo, status: p.status,
        curso: p.curso, modalidade: p.modalidade,
        orientador: p.orientador?.nome || p.orientador?.email || "",
        responsavelNome: e.responsavel ? (alunoDe(p, e.responsavel)?.nome || e.responsavel)
          : (p.orientador?.nome || "orientação"),
        meu: papel === "aluno" || mesmo(u?.email, e.responsavel),
        ...e,
      });
    }
  }
  return linhas.sort((a, b) => (a.inicio || "9999").localeCompare(b.inicio || "9999"));
}

/** Situação da etapa levando a data em conta — "atrasada" não é campo, é fato. */
export function etapaAtrasada(etapa, hoje = hojeLocalISO()) {
  if (!etapa || etapa.situacao === "concluida") return false;
  return !!etapa.fim && etapa.fim < hoje;
}

/** Relatórios visíveis, achatados para a tela de acompanhamento. */
export function relatoriosDe(projetos, u) {
  const linhas = [];
  for (const p of projetos || []) {
    const papel = papelNoProjeto(u, p);
    if (!papel) continue;
    for (const r of p.relatorios || []) {
      if (papel === "aluno" && !mesmo(u?.email, r.aluno)) continue;
      linhas.push({
        projetoId: p.id, numero: p.numero, titulo: p.titulo, curso: p.curso,
        orientador: p.orientador?.nome || p.orientador?.email || "",
        alunoNome: alunoDe(p, r.aluno)?.nome || r.aluno,
        podeValidar: podeValidarRelatorio(u, p) && r.situacao === "enviado",
        ...r,
      });
    }
  }
  return linhas.sort((a, b) => String(b.enviadoEm || "").localeCompare(String(a.enviadoEm || "")));
}

/**
 * O que ainda falta de relatório em cada projeto em execução: um parcial e um
 * final por aluno indicado. É o que alimenta a lista de pendências.
 */
export function relatoriosPendentes(p) {
  if (!EM_ANDAMENTO.has(p?.status)) return [];
  const faltando = [];
  for (const a of p.alunos || []) {
    for (const tipo of TIPOS_RELATORIO) {
      const r = (p.relatorios || []).find((x) => x.tipo === tipo && mesmo(x.aluno, a.email));
      if (!r || r.situacao === "devolvido") faltando.push({ tipo, aluno: a.email, nome: a.nome, devolvido: !!r });
    }
  }
  return faltando;
}

/** Registro de quem mexeu no quê — mesma convenção das atas. */
export function anotar(p, { quem, oQue, agora = new Date() }) {
  const historico = [...(p.historico || []), { quando: agora.toISOString(), quem: quem || "", oQue }];
  return { ...p, historico: historico.slice(-60) };
}

/** Resumo para as listas e o painel — sem os campos longos. */
export function resumir(p, u) {
  const pend = relatoriosPendentes(p);
  return {
    id: p.id, numero: p.numero, titulo: p.titulo, status: p.status, curso: p.curso,
    modalidade: p.modalidade, edital: p.edital,
    orientador: p.orientador, alunos: p.alunos,
    inicio: p.inicio, fim: p.fim,
    etapas: (p.cronograma || []).length,
    etapasConcluidas: (p.cronograma || []).filter((e) => e.situacao === "concluida").length,
    atrasadas: (p.cronograma || []).filter((e) => etapaAtrasada(e)).length,
    relatorios: (p.relatorios || []).length,
    relatoriosPendentes: pend.length,
    aValidar: (p.relatorios || []).filter((r) => r.situacao === "enviado").length,
    papel: papelNoProjeto(u, p),
    criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm,
  };
}
