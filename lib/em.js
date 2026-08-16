/* ========================================================================
   ARCHÉ IC — PIBIC-EM (Ensino Médio).

   OUTRO programa de bolsas, com outra lógica: o bolsista do Ensino Médio
   não pertence a um projeto — ele ACOMPANHA projetos de pesquisa do UNIEGO
   para conhecer os cursos, a ciência e a instituição, e pode trocar de
   projeto ao longo do ano. Por isso o registro é DA PESSOA, com uma
   TRAJETÓRIA de acompanhamentos, e não um vínculo fixo:

     turma       — o ciclo (2025/2026, 2026/2027…), um por edital próprio
     bolsa       — cnpq (R$ 300) ou uniego (R$ 150), 12 + 12 por turma
     trajetoria  — [{projetoId, numero, titulo, orientador, de, ate}]
                   o acompanhamento vigente é o que não tem `ate`
     relatorio   — SIMPLIFICADO, um por turma (não é o relatório da IC)
     conint      — participação no evento de IC de outubro

   Quem conduz é a COORDENAÇÃO DE PESQUISA (decisão do dono, ago/2026): ela
   apresenta o aluno ao orientador e faz a troca quando o aluno desejar. A
   indicação é da PROPPEX, não do professor. São menores de idade: o termo
   leva a autorização do responsável (anexo), e os dados do responsável
   moram aqui.
   ======================================================================== */
import { normalizarCpf } from "./cpf.js";
import { hojeLocalISO } from "./datas.js";

/* ------------------------------- catálogo ------------------------------- */
/** As turmas do programa — uma por edital próprio (série 02/AAAA). O nome
 *  mudou com a instituição: PBIC-EM na FACEG, ICEM no UNIEGO (edital
 *  02/2026). Os PDFs publicados de cada edição ficam no arquivo. */
export const TURMAS_EM = [
  // relatoriosFinalizados: os relatórios desta turma já foram entregues e
  // encerrados FORA do sistema (decisão do dono, ago/2026) — nada pendente
  { ciclo: "2024/2025", edital: "02/2024", vigencia: { inicio: "2024-09-01", fim: "2025-08-31" }, encerrada: true,
    documento: "/ic/docs/edital-02-2024.pdf", resultado: "/ic/docs/resultado-02-2024.pdf",
    relatoriosFinalizados: true },
  // prazoRelatorioFinal: a turma encerrou sem os relatórios, e a PROPPEX
  // reabriu a entrega até setembro/2026 (decisão do dono, ago/2026)
  { ciclo: "2025/2026", edital: "02/2025", vigencia: { inicio: "2025-09-01", fim: "2026-08-31" }, encerrada: true,
    documento: "/ic/docs/edital-02-2025.pdf", resultado: "/ic/docs/resultado-02-2025.pdf",
    prazoRelatorioFinal: "2026-09-30" },
  { ciclo: "2026/2027", edital: "02/2026", vigencia: { inicio: "2026-09-01", fim: "2027-08-31" }, encerrada: false,
    documento: "/ic/docs/edital-02-2026.pdf", resultado: null },
];
export const turmaDe = (ciclo) => TURMAS_EM.find((t) => t.ciclo === String(ciclo || "")) || null;
export const turmaVigente = () => TURMAS_EM.find((t) => !t.encerrada) || TURMAS_EM[TURMAS_EM.length - 1];

/** As bolsas do programa e a cota por turma (12 + 12, decisão do dono). */
export const BOLSAS_EM = [
  { codigo: "cnpq", nome: "Bolsa CNPq (PIBIC-EM)", valor: 300, cota: 12 },
  { codigo: "uniego", nome: "Bolsa UNIEGO (PIBIC-EM)", valor: 150, cota: 12 },
  // o resultado de 02/2025 traz também VOLUNTÁRIOS: participam sem bolsa e
  // sem cota — a categoria existe para o registro dizer a verdade
  { codigo: "voluntario", nome: "Voluntário (ICEM)", valor: 0, cota: null },
];
export const bolsaEmDe = (c) => BOLSAS_EM.find((b) => b.codigo === String(c || "").toLowerCase()) || null;

export const SITUACOES_EM = ["ativo", "concluido", "desligado"];

/* Os relatórios do ICEM (decisão do dono, ago/2026): a turma VIGENTE entrega
   parcial e final; as ANTIGAS, só o final — e quem valida é a PROPPEX, não a
   orientação (o bolsista de EM acompanha projetos, não pertence a eles).
   O formulário é simples, três campos: */
export const RELATORIOS_EM = ["parcial", "final"];
export const SITUACOES_RELATORIO_EM = ["pendente", "entregue", "validado", "devolvido"];
export const CAMPOS_RELATORIO_EM = [
  { campo: "atividades", rot: "Descreva as atividades realizadas na vigência da sua bolsa" },
  { campo: "motivacao", rot: "A participação no projeto de Iniciação Científica EM te motivou a seguir carreira acadêmica, a cursar uma faculdade, a ser um cientista?" },
  { campo: "cursoPretendido", rot: "Em qual curso do UNIEGO você pretende ingressar?" },
];
export const relatoriosExigidos = (turma) =>
  turma?.relatoriosFinalizados ? [] : (turma?.encerrada ? ["final"] : ["parcial", "final"]);

/* ----------------------------- normalização ----------------------------- */
const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const umDe = (v, lista, padrao) => (lista.includes(String(v || "")) ? String(v) : padrao);

export function normalizarBolsistaEM(b = {}, { base = null } = {}) {
  const cpf = normalizarCpf(b.cpf) || base?.cpf || "";
  return {
    id: b.id || base?.id || "",
    turma: turmaDe(b.turma)?.ciclo || base?.turma || turmaVigente().ciclo,
    nome: t(b.nome, 120) || base?.nome || "",
    cpf,
    rg: t(b.rg, 40),
    escola: t(b.escola, 120),
    serie: t(b.serie, 20),                 // "2º ano", "3º ano"
    email: t(b.email, 120).toLowerCase(),
    telefone: t(b.telefone, 30),
    cursoInteresse: t(b.cursoInteresse, 80),
    responsavel: {
      nome: t(b.responsavel?.nome, 120),
      cpf: normalizarCpf(b.responsavel?.cpf),
    },
    banco: t(b.banco, 60), agencia: t(b.agencia, 20), conta: t(b.conta, 30), pix: t(b.pix, 120),
    bolsa: umDe(b.bolsa, BOLSAS_EM.map((x) => x.codigo), ""),
    situacao: umDe(b.situacao, SITUACOES_EM, "ativo"),
    // seleção do edital próprio (Notas Finais)
    colocacao: Number.isFinite(Number(b.colocacao)) && Number(b.colocacao) > 0 ? Number(b.colocacao) : null,
    notaSelecao: Number.isFinite(Number(b.notaSelecao)) ? Math.round(Number(b.notaSelecao) * 100) / 100 : null,
    trajetoria: (Array.isArray(b.trajetoria) ? b.trajetoria : []).map((e) => ({
      projetoId: t(e.projetoId, 60), numero: t(e.numero, 30), titulo: t(e.titulo, 300),
      orientador: t(e.orientador, 120), de: data(e.de), ate: data(e.ate),
    })).filter((e) => e.projetoId),
    relatorios: normalizarRelatoriosEM(b),
    conint: { participou: b.conint?.participou === true, ano: t(b.conint?.ano, 10) },
    historico: Array.isArray(b.historico) ? b.historico.slice(-40) : [],
    origem: b.origem || base?.origem || null,
    criadoEm: base?.criadoEm || b.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Os dois relatórios (parcial e final), com os três campos do formulário.
 * Registro antigo com `relatorio` único (o "simplificado" da primeira
 * versão) migra para o FINAL — texto vira `atividades` — sem perder nada.
 */
function normalizarRelatorioEM(r) {
  if (!r) r = {};
  return {
    situacao: umDe(r.situacao, SITUACOES_RELATORIO_EM, "pendente"),
    em: t(r.em, 30),
    atividades: t(r.atividades, 8000),
    motivacao: t(r.motivacao, 4000),
    cursoPretendido: t(r.cursoPretendido, 80),
    cursoOutro: t(r.cursoOutro, 120),
    obs: t(r.obs, 500),
    porAluno: r.porAluno === true,
    // a validação é da PROPPEX: comentário e carimbo de quem validou/devolveu
    comentario: t(r.comentario, 1000),
    validadoPor: t(r.validadoPor, 160),
    validadoEm: t(r.validadoEm, 30),
  };
}
function normalizarRelatoriosEM(b) {
  const legado = b.relatorio && !b.relatorios
    ? { final: { ...b.relatorio, atividades: b.relatorio.texto || b.relatorio.atividades } }
    : (b.relatorios || {});
  return {
    parcial: normalizarRelatorioEM(legado.parcial),
    final: normalizarRelatorioEM(legado.final),
  };
}

/** O acompanhamento vigente — o último trecho da trajetória ainda aberto. */
export const projetoAtual = (b) =>
  (b?.trajetoria || []).find((e) => !e.ate) || null;

/**
 * Troca (ou define) o projeto acompanhado: fecha o trecho aberto com a data
 * de hoje e abre o novo. A trajetória NUNCA se apaga — é ela que conta, no
 * fim do ano, por onde o aluno passou (e é o que o certificado vai dizer).
 */
export function trocarProjeto(b, novo, { hoje = hojeLocalISO() } = {}) {
  const trajetoria = (b.trajetoria || []).map((e) => (e.ate ? e : { ...e, ate: hoje }));
  if (novo?.projetoId) {
    trajetoria.push({
      projetoId: t(novo.projetoId, 60), numero: t(novo.numero, 30), titulo: t(novo.titulo, 300),
      orientador: t(novo.orientador, 120), de: hoje, ate: "",
    });
  }
  return { ...b, trajetoria };
}

/** Registro de quem mexeu — mesma convenção dos projetos. */
export function anotarEM(b, { quem, oQue, agora = new Date() }) {
  const historico = [...(b.historico || []), { quando: agora.toISOString(), quem: quem || "", oQue }];
  return { ...b, historico: historico.slice(-40) };
}

/** As cotas da turma: quantas bolsas de cada fonte já foram atribuídas. */
export function cotasDaTurma(bolsistas, ciclo) {
  const daTurma = (bolsistas || []).filter((b) => b.turma === ciclo && b.situacao !== "desligado");
  // só as bolsas PAGAS têm cota; o voluntário entra sem limite
  return BOLSAS_EM.filter((t) => t.cota != null).map((tipo) => ({
    ...tipo,
    usadas: daTurma.filter((b) => b.bolsa === tipo.codigo).length,
  }));
}

/** O que falta no cadastro de um bolsista EM — régua própria do programa. */
export function faltaNoBolsistaEM(b = {}) {
  return [
    !b.nome && "nome", !b.cpf && "CPF", !b.escola && "escola",
    !b.telefone && "telefone", !b.email && "e-mail",
    !b.responsavel?.nome && "nome do responsável",
    !b.bolsa && "tipo de bolsa",
    !projetoAtual(b) && b.situacao === "ativo" && "projeto acompanhado",
  ].filter(Boolean);
}
