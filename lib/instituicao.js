/* ==========================================================================
   ARCHÉ — INFORMAÇÕES INSTITUCIONAIS (pedido do dono, ago/2026)
   ==========================================================================

   "Um local onde eu possa editar informações institucionais: incluir e
   excluir cursos, editar coordenadores de curso e pedagógicos, salvar e
   alterar membros de NDE e Colegiado. E, para cada coordenador, um módulo
   'Seu curso' — cada um só acessa o painel do próprio curso; eu edito todos."

   Este arquivo guarda as REGRAS; a tela é `/curso/` e as rotas vivem no
   server. Três decisões de desenho:

   1. O CATÁLOGO DE CURSOS continua UM só (o array exportado por lib/atas.js,
      que todo módulo importa). Curso novo entra MUTANDO esse array no
      arranque e a cada edição — é o que faz Extensão, IC, Atas, AP e todos
      os demais enxergarem o curso sem reescrever nenhum import. "Excluir"
      curso é DESATIVAR (`ativo: false`): há atas, ações e projetos gravados
      com o slug e o nome do curso, e apagar o catálogo tornaria esse
      histórico ilegível — o desativado sai dos formulários NOVOS e continua
      resolvendo em tudo o que já existe.

   2. A COMPOSIÇÃO (coordenador, pedagógico, NDE, Colegiado) é informação
      institucional guardada por curso em `sys-instituicao-v1` (chave
      interna: tem e-mail de gente). As ATAS continuam com a presença
      digitada a cada sessão — a decisão anterior do dono ("lista fixa
      emperra o processo") não muda: a composição é o retrato institucional,
      não uma trava da reunião.

   3. A INTERLIGAÇÃO é real: gravar coordenador/pedagógico de um curso
      REESCREVE a dupla no cadastro do ARCHÉ AP (`ap-equipe-v1`), que é de
      onde saem a validação das aulas práticas, o alcance da coordenação na
      monitoria e o sino — configurar no painel É configurar o acesso.
   ========================================================================== */
import { CURSOS } from "./atas.js";

export const INSTITUICAO_KEY = "sys-instituicao-v1";

const txt = (v, m = 160) => String(v ?? "").trim().slice(0, m);
const baixo = (v) => txt(v).toLowerCase();
const email = (v) => {
  const e = baixo(v);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : "";
};

/** Slug de curso novo: o nome sem acento, minúsculo, com hífens. */
export function slugDeCursoNovo(nome) {
  return baixo(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Sigla de curso novo: as três primeiras letras, sem acento. */
export function siglaDeCursoNovo(nome) {
  return baixo(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "CUR";
}

/** Uma pessoa da composição: o NOME é obrigatório (é o que consta); o
    e-mail é o vínculo com a conta — e com os acessos. */
export function pessoaInst(b = {}) {
  return { nome: txt(b.nome, 120), email: email(b.email) };
}

/** A composição de UM curso. Listas com teto; entrada sem nome não conta. */
export function normalizarComposicao(b = {}) {
  const lista = (l, max) => (Array.isArray(l) ? l : [])
    .map(pessoaInst).filter((p) => p.nome).slice(0, max);
  return {
    coordenador: pessoaInst(b.coordenador || {}),
    pedagogico: pessoaInst(b.pedagogico || {}),
    nde: lista(b.nde, 40),
    colegiado: lista(b.colegiado, 80),
    atualizadoEm: txt(b.atualizadoEm, 40),
    por: email(b.por),
  };
}

/* -------------------------------- REITORIA --------------------------------
   O registro de quem ocupa os cargos da reitoria e das pró-reitorias
   (pedido do dono, ago/2026: "Reitoria: inclusão e edição dos usuários como
   reitor, pró-reitores, gestores, coordenadores institucionais"). É o
   RETRATO institucional — quem pode o quê continua nas listas de acesso
   (auth-usuarios-v1), geridas na mesma tela; e as assinaturas dos
   documentos oficiais continuam no catálogo ASSINA + banco de imagens. */
export const CARGOS_REITORIA = [
  { chave: "reitor", cargo: "Reitor(a)" },
  { chave: "proreitor", cargo: "Pró-Reitor(a) de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária (PROPPEX)" },
  { chave: "proacademica", cargo: "Pró-Reitor(a) Acadêmico(a) (PROAC)" },
];
export function normalizarReitoria(b = {}) {
  const fixos = {};
  for (const c of CARGOS_REITORIA) fixos[c.chave] = pessoaInst(b.fixos?.[c.chave] || {});
  const outros = (Array.isArray(b.outros) ? b.outros : [])
    .map((x) => ({ cargo: txt(x?.cargo, 120), ...pessoaInst(x) }))
    .filter((x) => x.cargo && x.nome).slice(0, 40);
  return { fixos, outros, atualizadoEm: txt(b.atualizadoEm, 40), por: email(b.por) };
}

/** O registro institucional inteiro, como sai do estado. */
export function normalizarInstituicao(b = {}) {
  const extras = (Array.isArray(b.extras) ? b.extras : [])
    .map((c) => ({ slug: txt(c.slug, 40), nome: txt(c.nome, 80), sigla: txt(c.sigla, 4).toUpperCase() }))
    .filter((c) => c.slug && c.nome).slice(0, 60);
  const desativados = [...new Set((Array.isArray(b.desativados) ? b.desativados : [])
    .map((s) => txt(s, 40)).filter(Boolean))];
  const cursos = {};
  for (const [slug, comp] of Object.entries(b.cursos || {})) {
    const s = txt(slug, 40);
    if (s) cursos[s] = normalizarComposicao(comp);
  }
  return { extras, desativados, cursos, reitoria: normalizarReitoria(b.reitoria || {}) };
}

/**
 * Aplica o registro ao CATÁLOGO VIVO, mutando o array que todo módulo
 * importa: curso extra entra (ou tem o nome atualizado), e `ativo` marca o
 * que sai dos formulários novos. Idempotente — roda no arranque e a cada
 * edição do gestor.
 */
export function aplicarNoCatalogo(inst) {
  for (const c of inst.extras || []) {
    const atual = CURSOS.find((x) => x.slug === c.slug);
    if (atual) {
      atual.nome = c.nome;
      if (c.sigla) atual.sigla = c.sigla;
    } else {
      CURSOS.push({ slug: c.slug, nome: c.nome, sigla: c.sigla || siglaDeCursoNovo(c.nome), extra: true });
    }
  }
  const fora = new Set(inst.desativados || []);
  for (const x of CURSOS) x.ativo = !fora.has(x.slug);
  return CURSOS;
}

/** Os cursos que entram nos formulários NOVOS (o desativado fica de fora,
    mas continua resolvendo em tudo o que já foi gravado). */
export const cursosAtivos = () => CURSOS.filter((c) => c.ativo !== false);

/** Os cursos que ESTA pessoa coordena segundo a composição institucional
    (coordenador ou pedagógico do curso). */
export function cursosDaPessoa(inst, quemEmail) {
  const e = email(quemEmail);
  if (!e) return [];
  return Object.entries(inst.cursos || {})
    .filter(([, c]) => c.coordenador?.email === e || c.pedagogico?.email === e)
    .map(([slug]) => slug);
}

/**
 * A composição virando a DUPLA do cadastro do ARCHÉ AP: é a interligação
 * pedida — quem entra como coordenador/pedagógico aqui passa a validar as
 * aulas práticas do curso e a alcançar a monitoria dele. As entradas de
 * outros papéis que a coordenação tenha incluído na guia do AP ficam.
 */
export function equipeApDaComposicao(equipeAtual, slug, comp) {
  const equipe = { ...(equipeAtual || {}) };
  equipe.cursos = { ...(equipe.cursos || {}) };
  const atuais = (equipe.cursos[slug]?.coordenadores || [])
    .filter((p) => p && !["coordenador", "pedagogico"].includes(p.papel));
  const dupla = [];
  if (comp.coordenador?.email) dupla.push({ email: comp.coordenador.email, nome: comp.coordenador.nome, papel: "coordenador" });
  if (comp.pedagogico?.email) dupla.push({ email: comp.pedagogico.email, nome: comp.pedagogico.nome, papel: "pedagogico" });
  const lista = [...dupla, ...atuais];
  if (lista.length) equipe.cursos[slug] = { coordenadores: lista };
  else delete equipe.cursos[slug];
  return equipe;
}
