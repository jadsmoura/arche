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
import { limparRico, textoPlano, vazioRico, MAX_RICO } from "./richtext.js";

const txt = (v, n = 4000) => String(v ?? "").trim().slice(0, n);
const baixo = (v) => txt(v, 160).toLowerCase();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const MODALIDADES = [
  { codigo: "resumo", nome: "Resumo simples", ajuda: "Título, autores, resumo (mínimo de 200 palavras), palavras-chave e curso." },
  { codigo: "completo", nome: "Trabalho completo", ajuda: "Os campos do resumo mais introdução, objetivos, metodologia, resultados e discussão, conclusões e referências (ABNT), em português ou inglês." },
];
const MODALIDADES_VALIDAS = new Set(MODALIDADES.map((m) => m.codigo));
/* O VÍNCULO do trabalho (pedido do dono, set/2026: "preciso saber quais
   trabalhos são de bolsistas"): a submissão pergunta se o trabalho é de bolsa
   CNPq, de bolsa UNIEGO ou submissão livre — o bolsista de IC tem a
   apresentação no CONINT como obrigação do edital, e a PROPPEX precisa
   conferir quem cumpriu. Lista fechada, obrigatória, e sai na planilha. */
export const VINCULOS = [
  { codigo: "cnpq", nome: "Bolsa CNPq", ajuda: "Trabalho de bolsista PIBIC/PIBITI do CNPq." },
  { codigo: "uniego", nome: "Bolsa UNIEGO", ajuda: "Trabalho de bolsista PIBIC/PIBITI/PROBEX do UNIEGO." },
  { codigo: "livre", nome: "Submissão livre", ajuda: "Trabalho sem vínculo com bolsa de iniciação científica." },
];
const VINCULOS_VALIDOS = new Set(VINCULOS.map((v) => v.codigo));
export const rotuloVinculo = (c) => VINCULOS.find((v) => v.codigo === c)?.nome || String(c || "");
export const IDIOMAS =[{ codigo: "pt", nome: "Português" }, { codigo: "en", nome: "Inglês" }];

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
  // "Material e métodos" é o nome que o modelo do CONINT usa (o dono mandou o
  // .docx em set/2026); o código continua `metodologia`, que é a chave gravada
  { codigo: "metodologia", nome: "Material e métodos", en: "Material and methods" },
  { codigo: "resultados", nome: "Resultados e discussão", en: "Results and discussion" },
  { codigo: "conclusoes", nome: "Conclusões", en: "Conclusions" },
  // no PDF sai sem número, como no modelo; a norma (ABNT ou APA) fica na ajuda
  { codigo: "referencias", nome: "Referências", en: "References", semNumero: true,
    ajuda: "Só as obras citadas no texto, em ABNT ou APA, num padrão uniforme." },
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
/* Conta o TEXTO, não a marcação: com o editor rico, `<p><b>Palavra</b></p>`
   tem uma palavra, e contar o HTML cru diria seis. */
export const contarPalavras = (s) => (textoPlano(s).trim().match(/[^\s]+/g) || []).length;

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
    /* NÃO HÁ MÁXIMO (decisão do dono, set/2026: "lembrando que não tem número
       máximo de caracteres"). O campo era um teto de palavras no resumo, e ele
       recusava a submissão de quem escrevesse mais — num trabalho completo,
       com figura e tabela no meio do texto, o teto é palpite de quem não vai
       escrever. O MÍNIMO de 200 palavras fica: é a norma publicada, e ela diz
       o que o resumo precisa contemplar. A chave continua sendo LIDA para o
       evento que já a tem gravada, mas nada mais a cobra. */
    orientacoes: txt(c?.orientacoes, 6000),
    // as NORMAS de submissão: as PADRÃO do ARCHÉ (montadas da própria
    // configuração — decisão do dono, set/2026: "se o organizador não incluir,
    // use as normas padrão") ou um texto próprio, e/ou um link
    normasPadrao: c?.normasPadrao !== false,
    normas: txt(c?.normas, 20000),
    normasUrl: urlSegura(c?.normasUrl),
    modeloUrl: urlSegura(c?.modeloUrl),
    /* O REVISOR NÃO SE INDICA NA SUBMISSÃO (decisão do dono, set/2026,
       revendo a de duas semanas antes: "remova o revisor indicado; quem faz
       essa indicação é o gestor, no painel de gestão"). Pedir ao autor o nome
       de quem vai avaliá-lo é pedir que ele escolha o próprio juiz — e a
       cegueira do parecer, que existe para proteger os dois lados, começava
       furada de um deles. A comissão convida quem quiser, na guia Trabalhos.
       `revisorIndicado` continua sendo LIDO nos trabalhos já submetidos com o
       campo: o convite de um clique segue valendo para eles. */
    // só o INSCRITO submete (decisão do dono, set/2026, com a área do
    // inscrito): exige conta e inscrição liberada — paga ou de evento
    // gratuito. Desligada, a submissão volta a ser aberta a quem chegar.
    exigeInscricao: c?.exigeInscricao !== false,
    // a PROPPEX decide direto por padrão (decisão do dono); com a chave ligada,
    // a decisão exige os pareceres entregues
    exigeParecer: c?.exigeParecer === true,
    permiteArquivo: c?.permiteArquivo !== false,
  };
}

/* AS NORMAS PADRÃO — o que o formulário exige, escrito para o autor ler
   antes de submeter. Saem da CONFIGURAÇÃO (modalidades, limites, prazo), para
   o texto nunca dizer uma coisa e o formulário cobrar outra; o desenho do PDF
   é o do modelo do CONINT (Modelo_CONINT13.docx). O organizador que tiver
   normas próprias troca pelo texto dele na guia Trabalhos. */
export function normasPadrao(cfg = {}) {
  const c = normalizarConfig(cfg);
  const mods = c.modalidades.map((m) => MODALIDADES.find((x) => x.codigo === m)).filter(Boolean);
  const temCompleto = c.modalidades.includes("completo");
  const b = [];
  b.push("NORMAS DE SUBMISSÃO DE TRABALHOS");
  b.push(`1. TIPOS DE TRABALHO\n${mods.map((m) => `• ${m.nome}: ${m.ajuda}`).join("\n")}`);
  b.push("2. FORMA DE SUBMISSÃO\nO trabalho é submetido pelo formulário desta página — não se envia arquivo formatado. O PDF é gerado pelo sistema no modelo do evento (A4, margens de 2,5 cm, Times New Roman 12, entrelinha 1,5, texto justificado), com a identificação do evento no alto e o rodapé institucional."
    + (c.permiteArquivo ? " Um arquivo em PDF ou Word pode ser anexado, opcionalmente, para tabelas, figuras ou material complementar." : ""));
  b.push("3. TÍTULO\nTítulo completo, com a primeira letra em maiúscula e sem abreviações, como sairá nos anais. O título em inglês é opcional.");
  b.push(`4. AUTORIA\nAté ${c.maxAutores} autores, listados na ordem de contribuição, cada um com nome completo, filiação institucional e titulação. O primeiro é o autor correspondente e informa o e-mail em que receberá as comunicações. O orientador é informado em campo próprio e entra como último autor.`);
  b.push(`5. RESUMO\nUm único parágrafo, com no mínimo ${MIN_PALAVRAS_RESUMO} palavras, contemplando introdução, objetivo, metodologia, resultados e conclusões. Não há limite máximo. Não inclua referências no resumo. O abstract (em inglês) é opcional.`);
  b.push("6. PALAVRAS-CHAVE\nDe três a seis palavras-chave, separadas por vírgula, sem repetir termos do título. As keywords (em inglês) são opcionais.");
  if (temCompleto) {
    b.push(`7. TRABALHO COMPLETO\nEm português ou em inglês, com as seções: ${SECOES.map((s, i) => (s.semNumero ? s.nome : `${i + 1} ${s.nome}`)).join("; ")}. Cada seção com ao menos 50 caracteres. Nas Referências, liste apenas as obras citadas no texto, em ABNT ou APA, num padrão uniforme em todo o trabalho.`);
  }
  const n = temCompleto ? 8 : 7;
  b.push(`${n}. AVALIAÇÃO E DECISÃO\nA comissão organizadora avalia o trabalho diretamente ou o envia a revisores, em avaliação cega (o revisor não vê os autores; o autor não vê quem avaliou). Critérios: ${CRITERIOS.map((x) => x.nome.toLowerCase()).join("; ")}. A decisão — aceito, devolvido para correções ou recusado — é comunicada ao autor correspondente por e-mail, com os pareceres. O trabalho devolvido para correções é reenviado pelo mesmo link, em até ${c.prazoCorrecaoDias} dias, e a autoria não muda.`);
  b.push(`${n + 1}. PRAZOS E ACOMPANHAMENTO\n${c.prazoSubmissao ? `Submissões até ${dataBR(c.prazoSubmissao)}. ` : ""}O autor recebe por e-mail o número do trabalho e o link de acompanhamento, pelo qual consulta a situação, reenvia a versão corrigida e pode retirar o trabalho enquanto não houver decisão.`);
  b.push(`${n + 2}. AUTORIA E DADOS PESSOAIS\nAo submeter, o autor declara que o trabalho é de autoria dos nomeados e não fere direitos de terceiros, e concorda com o tratamento dos dados dos autores pela UNIEGO/PROPPEX para a avaliação, a comunicação e a publicação dos trabalhos do evento (Lei nº 13.709/2018).`);
  return b.join("\n\n");
}
/** O texto das normas que vale: o padrão, ou o do organizador. */
export const normasDe = (cfg) => { const c = normalizarConfig(cfg); return c.normasPadrao ? normasPadrao(c) : c.normas; };
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
    minPalavrasResumo: MIN_PALAVRAS_RESUMO,
    orientacoes: cfg.orientacoes, normas: normasDe(cfg), normasUrl: cfg.normasUrl, modeloUrl: cfg.modeloUrl,
    exigeInscricao: cfg.exigeInscricao,
    permiteArquivo: cfg.permiteArquivo, cursos, titulacoes: TITULACOES_AUTOR, idiomas: IDIOMAS, secoes: SECOES, vinculos: VINCULOS,
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
  /* TEXTO RICO (set/2026): resumo, abstract e as seções chegam do editor com
     ênfase, listas e imagens, e passam pelo saneador — lista de permissão
     fechada, nenhum atributo, imagem só do próprio sistema. Campo antigo, em
     texto puro, atravessa intacto (não tem tag para sanear).
     A caixa VAZIA do editor não é vazia como string: ela devolve `<p><br></p>`,
     e guardar isso num campo opcional faria a página e o PDF desenharem o
     título "Abstract" com nada embaixo. `rico` guarda "" quando não há texto
     nem figura — é o que o campo opcional em branco sempre significou. */
  const rico = (v) => (vazioRico(v) ? "" : limparRico(v));
  const c = {
    resumo: rico(d.resumo), abstract: rico(d.abstract),
    palavrasChave: normalizarPalavrasChave(d.palavrasChave), keywords: normalizarPalavrasChave(d.keywords),
    nota: txt(d.nota, 2000),
  };
  if (modalidade === "completo") {
    c.idioma = IDIOMAS.some((i) => i.codigo === baixo(d.idioma)) ? baixo(d.idioma) : "pt";
    c.secoes = Object.fromEntries(SECOES.map((s) => [s.codigo, rico(d.secoes?.[s.codigo])]));
  }
  return c;
}
export { MAX_RICO, textoPlano };

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
  if (!VINCULOS_VALIDOS.has(baixo(d.vinculo))) faltas.push("o vínculo do trabalho (bolsa CNPq, bolsa UNIEGO ou submissão livre)");
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
  if (conteudo.palavrasChave.length < 3) f.push("três palavras-chave");
  if (modalidade === "completo") {
    for (const s of SECOES) {
      if (textoPlano(conteudo.secoes?.[s.codigo]).trim().length < 50) f.push(`a seção ${s.nome} (ao menos 50 caracteres)`);
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
export function novoTrabalho(cfg, d, { arquivo = null, agora = new Date().toISOString(), numero, conta = "" } = {}) {
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
    vinculo: VINCULOS_VALIDOS.has(baixo(d.vinculo)) ? baixo(d.vinculo) : "livre",
    autores, orientador,
    emailContato: autores[0]?.email || "",
    // a CONTA que submeteu (quando a submissão exige inscrição): é por ela
    // que a área do inscrito lista os trabalhos da pessoa
    contaEmail: baixo(conta),
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
    vinculo: t.vinculo || "", autores: t.autores, orientador: t.orientador, revisorIndicado: t.revisorIndicado || null,
    estado: t.estado, rotulo: rotuloEstado(t.estado),
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
