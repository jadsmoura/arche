/**
 * ARCHÉ TR — Submissão de trabalhos com revisão cega (set/2026).
 *
 * Pedido do dono: "teremos de implementar um sistema de submissão de resumos e
 * trabalhos completos no ARCHÉ, incluindo revisão cega, devolução para
 * correção etc. Normalmente uso o OJS, mas o nosso está com problemas e não
 * serão corrigidos até o fim do evento."
 *
 * O módulo é do EVENTO (a ação de extensão com página pública): o autor
 * submete pela página do evento, sem conta — como a inscrição —, e recebe por
 * e-mail o LINK de acompanhamento (token); a coordenação designa revisores por
 * trabalho, cada um recebe o próprio link (token por trabalho+revisor) e dá o
 * parecer sem ver quem escreveu; a coordenação decide (aceito, correções,
 * rejeitado) e o autor recebe a decisão com os pareceres — sem saber quem os
 * deu. Devolvido para correção, o autor sobe a versão nova pelo mesmo link, e
 * a coordenação decide de novo (ou manda de novo aos revisores).
 *
 * Este arquivo é PURO: catálogos, normalização, régua de estados e as três
 * VISÕES do mesmo registro — a do revisor (sem autores), a do autor (sem
 * revisores) e a da gestão (tudo). Quem lê e grava é o servidor.
 */
import crypto from "node:crypto";

const txt = (v, n = 4000) => String(v ?? "").trim().slice(0, n);
const baixo = (v) => txt(v, 160).toLowerCase();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const MODALIDADES = [
  { codigo: "resumo", nome: "Resumo simples", ajuda: "Resumo em até 2.500 caracteres, sem arquivo obrigatório." },
  { codigo: "expandido", nome: "Resumo expandido", ajuda: "Resumo expandido em arquivo (PDF ou Word), no modelo do evento." },
  { codigo: "completo", nome: "Trabalho completo", ajuda: "Artigo completo em arquivo (PDF ou Word), no modelo do evento." },
];
const MODALIDADES_VALIDAS = new Set(MODALIDADES.map((m) => m.codigo));

/* Os estados do trabalho — cada um é o que ESPERA de alguém:
   submetido    → espera a coordenação designar revisores (ou decidir direto)
   em-avaliacao → espera os pareceres
   avaliado     → todos os pareceres entregues; espera a decisão
   correcao     → devolvido ao autor; espera a versão corrigida
   reenviado    → a versão corrigida chegou; espera a coordenação
   aceito | rejeitado | retirado → encerrado */
export const ESTADOS = [
  { codigo: "submetido", nome: "Submetido", cor: "info", espera: "coordenação" },
  { codigo: "em-avaliacao", nome: "Em avaliação", cor: "warn", espera: "revisores" },
  { codigo: "avaliado", nome: "Avaliado — aguardando decisão", cor: "warn", espera: "coordenação" },
  { codigo: "correcao", nome: "Devolvido para correção", cor: "err", espera: "autor" },
  { codigo: "reenviado", nome: "Corrigido — aguardando decisão", cor: "info", espera: "coordenação" },
  { codigo: "aceito", nome: "Aceito", cor: "ok", espera: "" },
  { codigo: "rejeitado", nome: "Rejeitado", cor: "err", espera: "" },
  { codigo: "retirado", nome: "Retirado", cor: "muted", espera: "" },
];
export const ESTADO_ENCERRADO = new Set(["aceito", "rejeitado", "retirado"]);
export const rotuloEstado = (e) => ESTADOS.find((x) => x.codigo === e)?.nome || e;

export const RECOMENDACOES = [
  { codigo: "aceitar", nome: "Aceitar" },
  { codigo: "aceitar-com-correcoes", nome: "Aceitar com correções" },
  { codigo: "rejeitar", nome: "Rejeitar" },
];
const RECOMENDACOES_VALIDAS = new Set(RECOMENDACOES.map((r) => r.codigo));

/* Os critérios do parecer — a escala é 1 a 5 em todos. São os cinco que os
   pareceres de resumo dos eventos da casa já pedem (CONINT, semanas de curso). */
export const CRITERIOS = [
  { codigo: "relevancia", nome: "Relevância e originalidade do tema" },
  { codigo: "objetivos", nome: "Clareza dos objetivos" },
  { codigo: "metodo", nome: "Adequação metodológica" },
  { codigo: "resultados", nome: "Consistência dos resultados e conclusões" },
  { codigo: "redacao", nome: "Redação e adequação às normas" },
];

export const DECISOES = [
  { codigo: "aceito", nome: "Aceitar" },
  { codigo: "correcao", nome: "Devolver para correção" },
  { codigo: "rejeitado", nome: "Rejeitar" },
];

/** A configuração do módulo no evento (`evento.trabalhos`). */
export function normalizarConfig(c = {}) {
  const modalidades = [...new Set((Array.isArray(c?.modalidades) ? c.modalidades : ["resumo"])
    .map((m) => baixo(m)).filter((m) => MODALIDADES_VALIDAS.has(m)))];
  const areas = [...new Set((Array.isArray(c?.areas) ? c.areas : [])
    .map((a) => txt(a, 80)).filter(Boolean))].slice(0, 40);
  const num = (v, padrao, min, max) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  return {
    ativo: c?.ativo === true,
    modalidades: modalidades.length ? modalidades : ["resumo"],
    areas,
    prazoSubmissao: ISO.test(String(c?.prazoSubmissao || "")) ? c.prazoSubmissao : "",
    prazoCorrecaoDias: num(c?.prazoCorrecaoDias, 7, 1, 60),
    revisoresPorTrabalho: num(c?.revisoresPorTrabalho, 2, 1, 5),
    maxAutores: num(c?.maxAutores, 6, 1, 15),
    limiteResumo: num(c?.limiteResumo, 2500, 300, 20000),
    orientacoes: txt(c?.orientacoes, 4000),
    normasUrl: urlSegura(c?.normasUrl),
    modeloUrl: urlSegura(c?.modeloUrl),
    // a coordenação PODE decidir sem parecer (o resumo simples de um evento
    // pequeno); com a chave ligada, a decisão exige os pareceres entregues
    exigeParecer: c?.exigeParecer === true,
  };
}
export function urlSegura(u) {
  const s = txt(u, 500);
  return /^https?:\/\//i.test(s) ? s : "";
}

/** A parte da configuração que a PÁGINA PÚBLICA vê. */
export function configPublica(c, hoje) {
  const cfg = normalizarConfig(c);
  if (!cfg.ativo) return null;
  const aberta = podeSubmeter(cfg, hoje);
  return {
    modalidades: cfg.modalidades.map((m) => MODALIDADES.find((x) => x.codigo === m)),
    areas: cfg.areas, prazoSubmissao: cfg.prazoSubmissao, maxAutores: cfg.maxAutores,
    limiteResumo: cfg.limiteResumo, orientacoes: cfg.orientacoes,
    normasUrl: cfg.normasUrl, modeloUrl: cfg.modeloUrl,
    aberta: aberta.ok, motivo: aberta.motivo,
  };
}

export function podeSubmeter(cfg, hoje) {
  const c = normalizarConfig(cfg);
  if (!c.ativo) return { ok: false, motivo: "A submissão de trabalhos não está aberta neste evento." };
  if (c.prazoSubmissao && String(hoje) > c.prazoSubmissao)
    return { ok: false, motivo: `O prazo de submissão encerrou em ${dataBR(c.prazoSubmissao)}.` };
  return { ok: true, motivo: "" };
}
export const dataBR = (iso) => (ISO.test(String(iso || "")) ? iso.split("-").reverse().join("/") : "—");

export const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Os autores como chegam do formulário: nome, e-mail, instituição, vínculo. */
export function normalizarAutores(lista, max = 6) {
  return (Array.isArray(lista) ? lista : []).slice(0, max).map((a) => ({
    nome: txt(a?.nome, 120), email: baixo(a?.email), instituicao: txt(a?.instituicao, 120),
    vinculo: txt(a?.vinculo, 60),
  })).filter((a) => a.nome);
}

/** O que falta para a submissão entrar. Lista vazia = pode entrar. */
export function validarSubmissao(cfg, d = {}, { temArquivo = false } = {}) {
  const c = normalizarConfig(cfg);
  const faltas = [];
  const titulo = txt(d.titulo, 300);
  if (titulo.length < 10) faltas.push("o título (ao menos 10 caracteres)");
  if (!c.modalidades.includes(baixo(d.modalidade))) faltas.push("a modalidade (escolha uma das oferecidas)");
  if (c.areas.length && !c.areas.includes(txt(d.area, 80))) faltas.push("a área temática");
  const resumo = txt(d.resumo, 30000);
  if (resumo.length < 200) faltas.push("o resumo (ao menos 200 caracteres)");
  if (resumo.length > c.limiteResumo) faltas.push(`o resumo dentro do limite (${c.limiteResumo} caracteres; o seu tem ${resumo.length})`);
  const autores = normalizarAutores(d.autores, c.maxAutores);
  if (!autores.length) faltas.push("ao menos um autor");
  if (autores.length && !RE_EMAIL.test(autores[0].email)) faltas.push("o e-mail do autor correspondente (o primeiro da lista)");
  const palavras = normalizarPalavrasChave(d.palavrasChave);
  if (palavras.length < 3) faltas.push("três palavras-chave");
  if (baixo(d.modalidade) !== "resumo" && !temArquivo) faltas.push("o arquivo do trabalho (PDF ou Word)");
  if (d.consentimento !== true) faltas.push("a concordância com o tratamento dos dados e a declaração de autoria");
  return faltas;
}
export function normalizarPalavrasChave(v) {
  const lista = Array.isArray(v) ? v : String(v || "").split(/[;,\n]/);
  return [...new Set(lista.map((p) => txt(p, 60)).filter(Boolean))].slice(0, 6);
}

export const gerarToken = () => crypto.randomBytes(12).toString("hex");
export const TOKEN_VALIDO = /^[0-9a-f]{24}$/;

/** O número do trabalho no evento: TR-001, TR-002… na ordem de chegada. */
export function proximoNumero(trabalhos = []) {
  const n = trabalhos.reduce((m, t) => Math.max(m, Number(String(t.numero || "").replace(/\D/g, "")) || 0), 0) + 1;
  return `TR-${String(n).padStart(3, "0")}`;
}

/** Um trabalho novo, a partir do que o formulário mandou (já validado). */
export function novoTrabalho(cfg, d, { arquivo = null, agora = new Date().toISOString(), numero } = {}) {
  const c = normalizarConfig(cfg);
  const autores = normalizarAutores(d.autores, c.maxAutores);
  return {
    id: crypto.randomBytes(6).toString("hex"),
    numero,
    token: gerarToken(),
    titulo: txt(d.titulo, 300),
    modalidade: baixo(d.modalidade),
    area: txt(d.area, 80),
    palavrasChave: normalizarPalavrasChave(d.palavrasChave),
    autores,
    emailContato: autores[0]?.email || "",
    versoes: [{ n: 1, em: agora, resumo: txt(d.resumo, 30000), arquivo: arquivo || null, nota: "" }],
    estado: "submetido",
    revisores: [],          // [{ email, nome, token, designadoEm, parecer|null }]
    decisao: null,          // { codigo, mensagem, em, por, versao }
    historico: [{ em: agora, o: "submetido", por: autores[0]?.email || "" }],
    consentimento: { em: agora, versao: d.versaoLgpd || "" },
    criadoEm: agora, atualizadoEm: agora,
  };
}
export const versaoAtual = (t) => (t.versoes || [])[t.versoes.length - 1] || null;

/**
 * A designação: cada revisor ganha o PRÓPRIO token — é o token que identifica
 * o parecer, e ele nunca sai para o autor. Revisor já designado no mesmo
 * trabalho não entra duas vezes.
 */
export function designar(t, revisores = [], { agora = new Date().toISOString(), por = "" } = {}) {
  const novos = [];
  for (const r of revisores) {
    const email = baixo(r?.email);
    if (!RE_EMAIL.test(email)) continue;
    if ((t.autores || []).some((a) => a.email === email)) continue;   // autor não revisa o próprio trabalho
    if ((t.revisores || []).some((x) => x.email === email && !x.removidoEm)) continue;
    const rev = { email, nome: txt(r?.nome, 120), token: gerarToken(), designadoEm: agora, parecer: null };
    t.revisores = [...(t.revisores || []), rev];
    novos.push(rev);
  }
  if (novos.length) {
    t.estado = "em-avaliacao";
    t.historico.push({ em: agora, o: `revisores designados (${novos.length})`, por });
    t.atualizadoEm = agora;
  }
  return novos;
}

/** O parecer, como o revisor o entrega. Devolve as faltas ou grava. */
export function validarParecer(p = {}) {
  const faltas = [];
  for (const c of CRITERIOS) {
    const n = Number(p?.notas?.[c.codigo]);
    if (!Number.isInteger(n) || n < 1 || n > 5) faltas.push(c.nome);
  }
  if (!RECOMENDACOES_VALIDAS.has(baixo(p.recomendacao))) faltas.push("a recomendação");
  if (txt(p.comentariosAutor, 20000).length < 30) faltas.push("os comentários ao autor (ao menos 30 caracteres)");
  return faltas;
}
export function registrarParecer(t, token, p, { agora = new Date().toISOString() } = {}) {
  const rev = (t.revisores || []).find((r) => r.token === token && !r.removidoEm);
  if (!rev) return { erro: "Revisão não encontrada." };
  if (ESTADO_ENCERRADO.has(t.estado)) return { erro: "Este trabalho já foi decidido — o parecer não é mais aceito." };
  const faltas = validarParecer(p);
  if (faltas.length) return { erro: `Falta: ${faltas.join("; ")}.` };
  rev.parecer = {
    em: agora,
    versao: versaoAtual(t)?.n || 1,
    notas: Object.fromEntries(CRITERIOS.map((c) => [c.codigo, Number(p.notas[c.codigo])])),
    recomendacao: baixo(p.recomendacao),
    comentariosAutor: txt(p.comentariosAutor, 20000),
    comentariosComissao: txt(p.comentariosComissao, 20000),
  };
  t.historico.push({ em: agora, o: "parecer entregue", por: "revisor" });
  t.atualizadoEm = agora;
  if (todosPareceresEntregues(t) && t.estado === "em-avaliacao") t.estado = "avaliado";
  return { ok: true };
}
export const pareceresEntregues = (t) => (t.revisores || []).filter((r) => !r.removidoEm && r.parecer);
export const todosPareceresEntregues = (t) => {
  const ativos = (t.revisores || []).filter((r) => !r.removidoEm);
  return ativos.length > 0 && ativos.every((r) => r.parecer);
};
export const notaMedia = (t) => {
  const ps = pareceresEntregues(t);
  if (!ps.length) return null;
  const soma = ps.reduce((s, r) => s + Object.values(r.parecer.notas).reduce((a, b) => a + b, 0) / CRITERIOS.length, 0);
  return Math.round((soma / ps.length) * 10) / 10;
};

/** A decisão da coordenação. */
export function decidir(t, cfg, { codigo, mensagem = "", por = "", agora = new Date().toISOString() }) {
  const c = normalizarConfig(cfg);
  const d = baixo(codigo);
  if (!DECISOES.some((x) => x.codigo === d)) return { erro: "Decisão inválida." };
  if (t.estado === "retirado") return { erro: "O trabalho foi retirado pelo autor." };
  if (c.exigeParecer && !pareceresEntregues(t).length)
    return { erro: "A configuração do evento exige ao menos um parecer entregue antes da decisão." };
  if (d === "correcao" && txt(mensagem).length < 10)
    return { erro: "Diga ao autor o que corrigir (ao menos 10 caracteres)." };
  t.decisao = { codigo: d, mensagem: txt(mensagem, 20000), em: agora, por, versao: versaoAtual(t)?.n || 1 };
  t.estado = d;
  t.historico.push({ em: agora, o: `decisão: ${rotuloEstado(d)}`, por });
  t.atualizadoEm = agora;
  return { ok: true };
}

/** A versão corrigida do autor (só com o trabalho devolvido para correção). */
export function reenviar(t, { resumo, arquivo = null, nota = "", agora = new Date().toISOString() }) {
  if (t.estado !== "correcao") return { erro: "Este trabalho não está aguardando correção." };
  const r = txt(resumo, 30000);
  if (r.length < 200) return { erro: "O resumo precisa ter ao menos 200 caracteres." };
  if (t.modalidade !== "resumo" && !arquivo && !versaoAtual(t)?.arquivo)
    return { erro: "Envie o arquivo corrigido." };
  const n = (versaoAtual(t)?.n || 1) + 1;
  t.versoes.push({ n, em: agora, resumo: r, arquivo: arquivo || versaoAtual(t)?.arquivo || null, nota: txt(nota, 2000) });
  t.estado = "reenviado";
  t.historico.push({ em: agora, o: `versão ${n} enviada pelo autor`, por: t.emailContato });
  t.atualizadoEm = agora;
  return { ok: true, versao: n };
}

export function retirar(t, { agora = new Date().toISOString() } = {}) {
  if (ESTADO_ENCERRADO.has(t.estado)) return { erro: "O trabalho já está encerrado." };
  t.estado = "retirado";
  t.historico.push({ em: agora, o: "retirado pelo autor", por: t.emailContato });
  t.atualizadoEm = agora;
  return { ok: true };
}

/* ------------------------------ as visões -------------------------------- */
const semToken = ({ token, ...r }) => r;
const versoesPublicas = (t) => (t.versoes || []).map((v) => ({
  n: v.n, em: v.em, resumo: v.resumo, nota: v.nota,
  arquivo: v.arquivo ? { name: v.arquivo.name, link: v.arquivo.link, size: v.arquivo.size } : null,
}));

/** O que o REVISOR vê: o trabalho sem quem o escreveu. */
export function paraRevisor(t, token) {
  const rev = (t.revisores || []).find((r) => r.token === token && !r.removidoEm);
  if (!rev) return null;
  const v = versaoAtual(t);
  return {
    numero: t.numero, titulo: t.titulo, modalidade: t.modalidade, area: t.area,
    palavrasChave: t.palavrasChave, estado: t.estado,
    versao: v ? { n: v.n, em: v.em, resumo: v.resumo, arquivo: v.arquivo ? { name: v.arquivo.name, link: v.arquivo.link } : null } : null,
    parecer: rev.parecer, designadoEm: rev.designadoEm, encerrado: ESTADO_ENCERRADO.has(t.estado),
  };
}

/** O que o AUTOR vê: tudo o que é dele, os pareceres sem quem os deu. */
export function paraAutor(t) {
  return {
    numero: t.numero, titulo: t.titulo, modalidade: t.modalidade, area: t.area,
    palavrasChave: t.palavrasChave, autores: t.autores, estado: t.estado, rotulo: rotuloEstado(t.estado),
    versoes: versoesPublicas(t),
    // os pareceres saem ao autor só DEPOIS da decisão: é a decisão que os
    // publica — antes disso ele veria a metade de uma avaliação em curso
    pareceres: t.decisao ? pareceresEntregues(t)
      .filter((r) => r.parecer.versao <= t.decisao.versao)
      .map((r, i) => ({ revisor: `Revisor ${String.fromCharCode(65 + i)}`, notas: r.parecer.notas,
        recomendacao: r.parecer.recomendacao, comentarios: r.parecer.comentariosAutor, em: r.parecer.em })) : [],
    decisao: t.decisao ? { codigo: t.decisao.codigo, mensagem: t.decisao.mensagem, em: t.decisao.em } : null,
    criadoEm: t.criadoEm, atualizadoEm: t.atualizadoEm,
    podeReenviar: t.estado === "correcao",
    podeRetirar: !ESTADO_ENCERRADO.has(t.estado),
  };
}

/** O que a GESTÃO vê: tudo, menos os tokens (que abrem portas). */
export function paraGestao(t) {
  return {
    ...semToken(t),
    versoes: versoesPublicas(t),
    revisores: (t.revisores || []).map(semToken),
    rotulo: rotuloEstado(t.estado),
    notaMedia: notaMedia(t),
    pareceresEntregues: pareceresEntregues(t).length,
    pareceresEsperados: (t.revisores || []).filter((r) => !r.removidoEm).length,
  };
}

/** Os números do painel. */
export function resumo(trabalhos = []) {
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e.codigo, 0]));
  for (const t of trabalhos) porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
  return {
    total: trabalhos.length, porEstado,
    aguardandoCoordenacao: trabalhos.filter((t) => ["submetido", "avaliado", "reenviado"].includes(t.estado)).length,
    aguardandoRevisores: trabalhos.filter((t) => t.estado === "em-avaliacao").length,
    aguardandoAutor: trabalhos.filter((t) => t.estado === "correcao").length,
    aceitos: porEstado.aceito || 0,
  };
}

/** O cadastro de revisores do evento (a lista de onde se designa). */
export function normalizarRevisores(lista = []) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map((r) => ({
    nome: txt(r?.nome, 120), email: baixo(r?.email), instituicao: txt(r?.instituicao, 120),
    areas: [...new Set((Array.isArray(r?.areas) ? r.areas : String(r?.areas || "").split(/[;,]/)).map((a) => txt(a, 80)).filter(Boolean))].slice(0, 10),
  })).filter((r) => r.nome && RE_EMAIL.test(r.email) && !vistos.has(r.email) && vistos.add(r.email)).slice(0, 200);
}
