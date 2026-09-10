/**
 * ARCHÉ TR — Submissão de trabalhos (set/2026).
 *
 * Pedido do dono: "teremos de implementar um sistema de submissão de resumos e
 * trabalhos completos no ARCHÉ, incluindo revisão cega, devolução para
 * correção etc. Normalmente uso o OJS, mas o nosso está com problemas e não
 * serão corrigidos até o fim do evento." E, na segunda rodada: "serão de dois
 * tipos, resumos simples e trabalhos completos; na forma de FORMULÁRIO, para
 * depois gerar os PDFs prontos nos modelos; a PROPPEX aprova diretamente, sem
 * avaliação por pares, embora a opção de submeter a revisores precise existir".
 *
 * O trabalho é um FORMULÁRIO, não um arquivo: título (e em inglês), autores
 * com nome, e-mail, filiação e titulação, o ORIENTADOR em separado (é o último
 * autor — pedido como campo próprio porque "os alunos esquecem de entrar com os
 * dados"), resumo com no mínimo 200 PALAVRAS, abstract, palavras-chave e
 * keywords, curso; o trabalho completo acrescenta o idioma e as seis seções
 * (introdução, objetivos, metodologia, resultados e discussão, conclusões,
 * referências em ABNT). É desse formulário que o PDF sai no modelo do evento.
 *
 * O fluxo: o autor submete pela página pública, sem conta, e recebe o link de
 * acompanhamento por e-mail; a PROPPEX decide — aceitar, devolver para
 * correções, recusar (as duas últimas com comentário obrigatório) — e PODE,
 * antes, mandar a revisores, cada um com o próprio link e sem ver os autores.
 * Devolvido, o autor reenvia o formulário corrigido pelo mesmo link.
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
  { codigo: "resumo", nome: "Resumo simples", ajuda: "Título, autores, resumo (mínimo de 200 palavras), palavras-chave e curso." },
  { codigo: "completo", nome: "Trabalho completo", ajuda: "Os campos do resumo mais introdução, objetivos, metodologia, resultados e discussão, conclusões e referências (ABNT), em português ou inglês." },
];
const MODALIDADES_VALIDAS = new Set(MODALIDADES.map((m) => m.codigo));
export const IDIOMAS = [{ codigo: "pt", nome: "Português" }, { codigo: "en", nome: "Inglês" }];

/* A titulação de quem assina o trabalho — vai por extenso na linha de autoria
   do PDF. É lista fechada porque titulação escrita à mão não agrupa. */
export const TITULACOES_AUTOR = [
  { codigo: "graduando", nome: "Graduando(a)" }, { codigo: "graduado", nome: "Graduado(a)" },
  { codigo: "especialista", nome: "Especialista" }, { codigo: "mestrando", nome: "Mestrando(a)" },
  { codigo: "mestre", nome: "Mestre" }, { codigo: "doutorando", nome: "Doutorando(a)" },
  { codigo: "doutor", nome: "Doutor(a)" }, { codigo: "pos-doutor", nome: "Pós-doutor(a)" },
  { codigo: "ensino-medio", nome: "Estudante do ensino médio" },
];
const TITULACOES_VALIDAS = new Set(TITULACOES_AUTOR.map((t) => t.codigo));
export const rotuloTitulacao = (c) => TITULACOES_AUTOR.find((t) => t.codigo === c)?.nome || String(c || "");

/* As seções do trabalho completo, na ordem em que saem no PDF. */
export const SECOES = [
  { codigo: "introducao", nome: "Introdução", en: "Introduction" },
  { codigo: "objetivos", nome: "Objetivos", en: "Objectives" },
  { codigo: "metodologia", nome: "Metodologia", en: "Methodology" },
  { codigo: "resultados", nome: "Resultados e Discussão", en: "Results and Discussion" },
  { codigo: "conclusoes", nome: "Conclusões", en: "Conclusions" },
  { codigo: "referencias", nome: "Referências Bibliográficas (ABNT)", en: "References (ABNT)" },
];

/* Os estados do trabalho — cada um é o que ESPERA de alguém:
   submetido    → espera a PROPPEX (decidir, ou mandar a revisores)
   em-avaliacao → espera os pareceres
   avaliado     → todos os pareceres entregues; espera a decisão
   correcao     → devolvido ao autor; espera a versão corrigida
   reenviado    → a versão corrigida chegou; espera a PROPPEX
   aceito | rejeitado | retirado → encerrado */
export const ESTADOS = [
  { codigo: "submetido", nome: "Submetido", cor: "info", espera: "PROPPEX" },
  { codigo: "em-avaliacao", nome: "Com os revisores", cor: "warn", espera: "revisores" },
  { codigo: "avaliado", nome: "Pareceres entregues — aguardando decisão", cor: "warn", espera: "PROPPEX" },
  { codigo: "correcao", nome: "Devolvido para correções", cor: "err", espera: "autor" },
  { codigo: "reenviado", nome: "Corrigido — aguardando decisão", cor: "info", espera: "PROPPEX" },
  { codigo: "aceito", nome: "Aceito", cor: "ok", espera: "" },
  { codigo: "rejeitado", nome: "Recusado", cor: "err", espera: "" },
  { codigo: "retirado", nome: "Retirado", cor: "muted", espera: "" },
];
export const ESTADO_ENCERRADO = new Set(["aceito", "rejeitado", "retirado"]);
export const rotuloEstado = (e) => ESTADOS.find((x) => x.codigo === e)?.nome || e;

export const RECOMENDACOES = [
  { codigo: "aceitar", nome: "Aceitar" },
  { codigo: "aceitar-com-correcoes", nome: "Aceitar com correções" },
  { codigo: "rejeitar", nome: "Recusar" },
];
const RECOMENDACOES_VALIDAS = new Set(RECOMENDACOES.map((r) => r.codigo));

/* Os critérios do parecer — a escala é 1 a 5 em todos. */
export const CRITERIOS = [
  { codigo: "relevancia", nome: "Relevância e originalidade do tema" },
  { codigo: "objetivos", nome: "Clareza dos objetivos" },
  { codigo: "metodo", nome: "Adequação metodológica" },
  { codigo: "resultados", nome: "Consistência dos resultados e conclusões" },
  { codigo: "redacao", nome: "Redação e adequação às normas" },
];

export const DECISOES = [
  { codigo: "aceito", nome: "Aceitar" },
  { codigo: "correcao", nome: "Devolver para correções" },
  { codigo: "rejeitado", nome: "Recusar" },
];

export const MIN_PALAVRAS_RESUMO = 200;
export const contarPalavras = (s) => (String(s || "").trim().match(/[^\s]+/g) || []).length;

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
    maxPalavrasResumo: num(c?.maxPalavrasResumo, 500, MIN_PALAVRAS_RESUMO, 5000),
    orientacoes: txt(c?.orientacoes, 6000),
    // as NORMAS de submissão: um texto (sai numa janela na página) e/ou um link
    normas: txt(c?.normas, 20000),
    normasUrl: urlSegura(c?.normasUrl),
    modeloUrl: urlSegura(c?.modeloUrl),
    // a PROPPEX decide direto por padrão (decisão do dono); com a chave ligada,
    // a decisão exige os pareceres entregues
    exigeParecer: c?.exigeParecer === true,
    permiteArquivo: c?.permiteArquivo !== false,
  };
}
export function urlSegura(u) {
  const s = txt(u, 500);
  return /^https?:\/\//i.test(s) ? s : "";
}

/** A parte da configuração que a PÁGINA PÚBLICA vê. */
export function configPublica(c, hoje, { cursos = [] } = {}) {
  const cfg = normalizarConfig(c);
  if (!cfg.ativo) return null;
  const aberta = podeSubmeter(cfg, hoje);
  return {
    modalidades: cfg.modalidades.map((m) => MODALIDADES.find((x) => x.codigo === m)),
    areas: cfg.areas, prazoSubmissao: cfg.prazoSubmissao, maxAutores: cfg.maxAutores,
    minPalavrasResumo: MIN_PALAVRAS_RESUMO, maxPalavrasResumo: cfg.maxPalavrasResumo,
    orientacoes: cfg.orientacoes, normas: cfg.normas, normasUrl: cfg.normasUrl, modeloUrl: cfg.modeloUrl,
    permiteArquivo: cfg.permiteArquivo, cursos, titulacoes: TITULACOES_AUTOR, idiomas: IDIOMAS, secoes: SECOES,
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

/** Uma pessoa da autoria: nome, e-mail, filiação institucional e titulação. */
export function normalizarPessoa(a = {}) {
  return {
    nome: txt(a?.nome, 120), email: baixo(a?.email), instituicao: txt(a?.instituicao, 120),
    titulacao: TITULACOES_VALIDAS.has(baixo(a?.titulacao)) ? baixo(a.titulacao) : "",
  };
}
export function normalizarAutores(lista, max = 6) {
  return (Array.isArray(lista) ? lista : []).slice(0, max).map(normalizarPessoa).filter((a) => a.nome);
}
export function normalizarPalavrasChave(v) {
  const lista = Array.isArray(v) ? v : String(v || "").split(/[;,\n]/);
  return [...new Set(lista.map((p) => txt(p, 60)).filter(Boolean))].slice(0, 6);
}

/** O CONTEÚDO de uma versão do trabalho, como chega do formulário. */
export function normalizarConteudo(d = {}, modalidade) {
  const c = {
    resumo: txt(d.resumo, 30000), abstract: txt(d.abstract, 30000),
    palavrasChave: normalizarPalavrasChave(d.palavrasChave), keywords: normalizarPalavrasChave(d.keywords),
    nota: txt(d.nota, 2000),
  };
  if (modalidade === "completo") {
    c.idioma = IDIOMAS.some((i) => i.codigo === baixo(d.idioma)) ? baixo(d.idioma) : "pt";
    c.secoes = Object.fromEntries(SECOES.map((s) => [s.codigo, txt(d.secoes?.[s.codigo], 60000)]));
  }
  return c;
}

/** O que falta na PESSOA (autor ou orientador). */
function faltaNaPessoa(p, rotulo, { exigeEmail = true } = {}) {
  const f = [];
  if (!p.nome || p.nome.split(/\s+/).length < 2) f.push(`o nome completo (${rotulo})`);
  if (exigeEmail ? !RE_EMAIL.test(p.email) : (p.email && !RE_EMAIL.test(p.email))) f.push(`um e-mail válido (${rotulo})`);
  if (!p.instituicao) f.push(`a filiação institucional (${rotulo})`);
  if (!p.titulacao) f.push(`a titulação (${rotulo})`);
  return f;
}

/** O que falta para a submissão entrar. Lista vazia = pode entrar. */
export function validarSubmissao(cfg, d = {}, { cursos = [] } = {}) {
  const c = normalizarConfig(cfg);
  const faltas = [];
  if (txt(d.titulo, 300).length < 10) faltas.push("o título (ao menos 10 caracteres)");
  const modalidade = baixo(d.modalidade);
  if (!c.modalidades.includes(modalidade)) faltas.push("a modalidade (escolha uma das oferecidas)");
  if (c.areas.length && !c.areas.includes(txt(d.area, 80))) faltas.push("a área temática");
  const curso = txt(d.curso, 120);
  if (!curso || (cursos.length && !cursos.includes(curso))) faltas.push("o curso (escolha um da lista)");
  const autores = normalizarAutores(d.autores, c.maxAutores);
  if (!autores.length) faltas.push("ao menos um autor");
  // só o correspondente precisa de e-mail: é nele que chegam as decisões
  autores.forEach((a, i) => faltas.push(...faltaNaPessoa(a, i === 0 ? "autor correspondente" : `autor ${i + 1}`, { exigeEmail: i === 0 })));
  const orientador = normalizarPessoa(d.orientador);
  if (!orientador.nome) faltas.push("o orientador (nome, e-mail, filiação e titulação)");
  else faltas.push(...faltaNaPessoa(orientador, "orientador"));
  faltas.push(...validarConteudo(c, normalizarConteudo(d, modalidade), modalidade));
  if (d.consentimento !== true) faltas.push("a concordância com o tratamento dos dados e a declaração de autoria");
  return faltas;
}
export function validarConteudo(cfg, conteudo, modalidade) {
  const c = normalizarConfig(cfg);
  const f = [];
  const n = contarPalavras(conteudo.resumo);
  if (n < MIN_PALAVRAS_RESUMO) f.push(`o resumo com ao menos ${MIN_PALAVRAS_RESUMO} palavras (tem ${n})`);
  if (n > c.maxPalavrasResumo) f.push(`o resumo dentro do limite de ${c.maxPalavrasResumo} palavras (tem ${n})`);
  if (conteudo.palavrasChave.length < 3) f.push("três palavras-chave");
  if (modalidade === "completo") {
    for (const s of SECOES) {
      if (txt(conteudo.secoes?.[s.codigo]).length < 50) f.push(`a seção ${s.nome} (ao menos 50 caracteres)`);
    }
  }
  return f;
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
  const modalidade = baixo(d.modalidade);
  const autores = normalizarAutores(d.autores, c.maxAutores);
  const orientador = normalizarPessoa(d.orientador);
  return {
    id: crypto.randomBytes(6).toString("hex"),
    numero,
    token: gerarToken(),
    titulo: txt(d.titulo, 300),
    tituloEn: txt(d.tituloEn, 300),
    modalidade,
    area: txt(d.area, 80),
    curso: txt(d.curso, 120),
    autores, orientador,
    emailContato: autores[0]?.email || "",
    versoes: [{ n: 1, em: agora, ...normalizarConteudo(d, modalidade), arquivo: arquivo || null }],
    estado: "submetido",
    revisores: [],          // [{ email, nome, token, designadoEm, parecer|null }]
    decisao: null,          // { codigo, mensagem, em, por, versao }
    historico: [{ em: agora, o: "submetido", por: autores[0]?.email || "" }],
    consentimento: { em: agora, versao: d.versaoLgpd || "" },
    criadoEm: agora, atualizadoEm: agora,
  };
}
export const versaoAtual = (t) => (t.versoes || [])[t.versoes.length - 1] || null;
/** A autoria completa: os autores e, por último, o orientador. */
export const autoriaCompleta = (t) => [...(t.autores || []), ...(t.orientador?.nome ? [{ ...t.orientador, orientador: true }] : [])];

/**
 * A designação: cada revisor ganha o PRÓPRIO token — é o token que identifica
 * o parecer, e ele nunca sai para o autor. Revisor já designado no mesmo
 * trabalho não entra duas vezes; autor e orientador não revisam o próprio.
 */
export function designar(t, revisores = [], { agora = new Date().toISOString(), por = "" } = {}) {
  const novos = [];
  for (const r of revisores) {
    const email = baixo(r?.email);
    if (!RE_EMAIL.test(email)) continue;
    if (autoriaCompleta(t).some((a) => a.email === email)) continue;
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

/** O parecer, como o revisor o entrega. */
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

/** A decisão da PROPPEX: aceitar, devolver para correções (com o que corrigir), recusar (com o motivo). */
export function decidir(t, cfg, { codigo, mensagem = "", por = "", agora = new Date().toISOString() }) {
  const c = normalizarConfig(cfg);
  const d = baixo(codigo);
  if (!DECISOES.some((x) => x.codigo === d)) return { erro: "Decisão inválida." };
  if (t.estado === "retirado") return { erro: "O trabalho foi retirado pelo autor." };
  if (c.exigeParecer && !pareceresEntregues(t).length)
    return { erro: "A configuração do evento exige ao menos um parecer entregue antes da decisão." };
  if (d === "correcao" && txt(mensagem).length < 10)
    return { erro: "Diga ao autor o que corrigir (ao menos 10 caracteres)." };
  if (d === "rejeitado" && txt(mensagem).length < 10)
    return { erro: "Diga ao autor o motivo da recusa (ao menos 10 caracteres)." };
  t.decisao = { codigo: d, mensagem: txt(mensagem, 20000), em: agora, por, versao: versaoAtual(t)?.n || 1 };
  t.estado = d;
  t.historico.push({ em: agora, o: `decisão: ${rotuloEstado(d)}`, por });
  t.atualizadoEm = agora;
  return { ok: true };
}

/** A versão corrigida do autor (só com o trabalho devolvido para correções): o formulário inteiro de novo. */
export function reenviar(t, cfg, d = {}, { arquivo = null, agora = new Date().toISOString() } = {}) {
  if (t.estado !== "correcao") return { erro: "Este trabalho não está aguardando correção." };
  const conteudo = normalizarConteudo(d, t.modalidade);
  const faltas = validarConteudo(cfg, conteudo, t.modalidade);
  if (faltas.length) return { erro: `Falta: ${faltas.join("; ")}.` };
  // o título também se corrige; a autoria, não (é a identidade do trabalho)
  if (txt(d.titulo, 300).length >= 10) t.titulo = txt(d.titulo, 300);
  if (d.tituloEn !== undefined) t.tituloEn = txt(d.tituloEn, 300);
  const n = (versaoAtual(t)?.n || 1) + 1;
  t.versoes.push({ n, em: agora, ...conteudo, arquivo: arquivo || versaoAtual(t)?.arquivo || null });
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
const versaoPublica = (v) => ({
  n: v.n, em: v.em, resumo: v.resumo, abstract: v.abstract || "", palavrasChave: v.palavrasChave || [],
  keywords: v.keywords || [], idioma: v.idioma || "", secoes: v.secoes || null, nota: v.nota || "",
  arquivo: v.arquivo ? { name: v.arquivo.name, link: v.arquivo.link, size: v.arquivo.size } : null,
});
const versoesPublicas = (t) => (t.versoes || []).map(versaoPublica);

/** O que o REVISOR vê: o trabalho sem quem o escreveu. */
export function paraRevisor(t, token) {
  const rev = (t.revisores || []).find((r) => r.token === token && !r.removidoEm);
  if (!rev) return null;
  const v = versaoAtual(t);
  return {
    numero: t.numero, titulo: t.titulo, tituloEn: t.tituloEn, modalidade: t.modalidade, area: t.area, curso: t.curso,
    estado: t.estado,
    versao: v ? versaoPublica(v) : null,
    parecer: rev.parecer, designadoEm: rev.designadoEm, encerrado: ESTADO_ENCERRADO.has(t.estado),
  };
}

/** O que o AUTOR vê: tudo o que é dele, os pareceres sem quem os deu. */
export function paraAutor(t) {
  return {
    numero: t.numero, titulo: t.titulo, tituloEn: t.tituloEn, modalidade: t.modalidade, area: t.area, curso: t.curso,
    autores: t.autores, orientador: t.orientador, estado: t.estado, rotulo: rotuloEstado(t.estado),
    versoes: versoesPublicas(t),
    // os pareceres saem ao autor só DEPOIS da decisão: é a decisão que os publica
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
