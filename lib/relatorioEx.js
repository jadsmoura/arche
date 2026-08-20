/* ========================================================================
   Relatório final da ação de extensão — os campos e a régua da entrega.

   O relatório sempre foi do ARCHÉ EX, preenchido no formulário da ação. Só
   que o coordenador de um EVENTO termina o trabalho dele no ARCHÉ EV: lança
   presenças, fecha a comissão, clica em "Encerrar evento" — e o relatório
   ficava esperando num setor que ele não voltava a abrir (achado do dono,
   ago/2026: o evento encerrou, os certificados saíram, e a ação continuou
   sem relatório).

   Por isso o ENCERRAMENTO passou a pedir os mesmos campos: encerrar o
   evento é entregar o relatório final da ação. Os campos são UM catálogo
   só — este —, e a régua da entrega é a MESMA nos dois caminhos, senão o
   formulário do EX aceitaria o que o encerramento recusa (ou o contrário).

   Aqui vivem só funções PURAS: quem lê e grava é o servidor.
   ======================================================================== */
import { avisoFotos } from "./portfolio.js";

const txt = (v) => String(v ?? "").trim();

/**
 * Os campos do relatório final, na ordem em que a tela os pede. `chave` é o
 * que está gravado em `acao.relatorio` desde sempre — preservar.
 */
export const CAMPOS_RELATORIO_FINAL = [
  { chave: "conteudoProgramatico", rotulo: "Conteúdo programático", tipo: "longo" },
  { chave: "bolsistas", rotulo: "Bolsistas", tipo: "curto", dica: "Não se aplica" },
  { chave: "alunosCurricular", rotulo: "Alunos (atividade curricular)", tipo: "curto" },
  { chave: "alunosNaoCurricular", rotulo: "Alunos (atividade não curricular)", tipo: "curto" },
  { chave: "docentesEnvolvidos", rotulo: "Docentes envolvidos (um por linha)", tipo: "longo" },
  { chave: "avaliacaoResultados", rotulo: "Avaliação / resultados alcançados", tipo: "longo",
    obrigatorio: true },
  { chave: "qtdDiscentes", rotulo: "Nº de discentes", tipo: "numero" },
  { chave: "qtdDocentes", rotulo: "Nº de docentes", tipo: "numero" },
  { chave: "qtdTecnicos", rotulo: "Nº de técnicos adm.", tipo: "numero" },
  { chave: "despesa", rotulo: "Despesa total", tipo: "curto", dica: "Não se aplica" },
  { chave: "receita", rotulo: "Receita", tipo: "curto", dica: "Não se aplica" },
  { chave: "linksPortfolio", rotulo: "Links de divulgação (um por linha)", tipo: "longo" },
];

const TETO = { longo: 8000, curto: 400, numero: 10 };

/** Só os campos do catálogo, aparados — o resto do que vier é descartado. */
export function normalizarRelatorioFinal(bruto = {}) {
  const out = {};
  for (const c of CAMPOS_RELATORIO_FINAL) {
    const v = txt(bruto?.[c.chave]).slice(0, TETO[c.tipo] || 400);
    if (c.tipo === "numero") out[c.chave] = /^\d+$/.test(v) ? v : "";
    else out[c.chave] = v;
  }
  return out;
}

/**
 * O que ainda falta para o relatório poder ser ENTREGUE — lista de frases,
 * vazia quando está pronto. A entrega exige a avaliação dos resultados (é o
 * que a PROPPEX lê) e o mínimo de fotos do portfólio (é o que ela arquiva).
 */
export function faltaParaEntregar(acao, campos = acao?.relatorio || {}) {
  const faltas = [];
  for (const c of CAMPOS_RELATORIO_FINAL) {
    if (c.obrigatorio && !txt(campos?.[c.chave])) faltas.push(`preencher “${c.rotulo}”`);
  }
  const fotos = avisoFotos(acao);
  if (fotos) faltas.push(fotos);
  return faltas;
}

/** Já entregue? É o `entregueEm` que separa rascunho de entrega. */
export const relatorioEntregue = (acao) => !!txt(acao?.relatorio?.entregueEm);

/* ======================================================================
   O RASCUNHO QUE O SISTEMA JÁ SABE ESCREVER

   Pedido do dono (ago/2026): o evento correu DENTRO do ARCHÉ — a
   programação está lançada, os palestrantes e a comissão estão nomeados,
   os inscritos estão contados — e ainda assim o relatório abria em branco,
   pedindo que alguém copiasse à mão o que o sistema tem gravado. Redigitar
   o que já existe não é prestação de contas, é trabalho perdido.

   Duas regras que mantêm o rascunho honesto:

     1. Sugestão NÃO sobrescreve: só entra em campo vazio. O que a pessoa
        escreveu vale mais que o que o sistema deduz.
     2. A AVALIAÇÃO/RESULTADOS fica de fora, sempre. É o único campo
        obrigatório e é juízo de quem conduziu a ação — inventar essa frase
        seria assinar uma conclusão que ninguém tirou.

   `de` diz de onde cada número veio, para a tela poder dizê-lo também: um
   número sugerido que a pessoa não sabe explicar é pior que campo vazio.
   ====================================================================== */

const DOCENTES = new Set(["coordenacao", "professor"]);
const APOIO = new Set(["apoio"]);

const nomesUnicos = (lista) => [...new Set((lista || [])
  .map((p) => txt(p?.nome)).filter(Boolean))];

/** A programação virando texto corrido — é o conteúdo programático. */
function programacaoEmTexto(evento) {
  const itens = (evento?.programacao || []).filter((a) => txt(a?.titulo));
  if (!itens.length) return "";
  const dia = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(d)) ? txt(d).split("-").reverse().join("/") : txt(d));
  return [...itens]
    .sort((x, y) => txt(x.dia).localeCompare(txt(y.dia)) || txt(x.horaInicio).localeCompare(txt(y.horaInicio)))
    .map((a) => {
      const quando = [dia(a.dia), [txt(a.horaInicio), txt(a.horaFim)].filter(Boolean).join("–")]
        .filter(Boolean).join(", ");
      const extra = [txt(a.responsavel), txt(a.local), txt(a.ch) ? `${txt(a.ch)}h` : ""]
        .filter(Boolean).join(" · ");
      return `${quando ? `${quando} — ` : ""}${txt(a.titulo)}${extra ? ` (${extra})` : ""}`;
    }).join("\n");
}

/**
 * O rascunho do relatório a partir do que a ação já guarda. Devolve
 * `{ campos, de }` — `campos` só com o que dá para afirmar, `de` com a
 * origem de cada um, em português.
 */
export function sugestaoDoEvento(acao) {
  const ev = acao?.evento || null;
  const parts = acao?.participantes || {};
  const inscritos = parts.inscritos || [];
  const palestrantes = parts.palestrantes || [];
  const comissao = parts.comissao || [];
  const campos = {}, de = {};

  // 1. conteúdo programático: a programação lançada; sem ela, a que a
  //    própria proposta descreveu (é o mesmo texto, e já foi aprovado)
  const prog = programacaoEmTexto(ev);
  if (prog) { campos.conteudoProgramatico = prog; de.conteudoProgramatico = "programação do evento"; }
  else if (txt(acao?.proposta?.programacao)) {
    campos.conteudoProgramatico = txt(acao.proposta.programacao);
    de.conteudoProgramatico = "programação declarada na proposta";
  }

  // 2. docentes envolvidos: quem apresentou e quem organizou como docente
  const docentes = nomesUnicos([
    ...palestrantes,
    ...comissao.filter((c) => DOCENTES.has(txt(c?.papel))),
  ]);
  if (docentes.length) {
    campos.docentesEnvolvidos = docentes.join("\n");
    de.docentesEnvolvidos = "palestrantes e comissão organizadora";
  }

  // 3. as contagens. A de discentes é a de PARTICIPANTES: os presentes,
  //    quando houve credenciamento; os inscritos, quando não houve — dizer
  //    "0 discentes" num evento com 57 inscritos e nenhum crachá lido seria
  //    trocar um campo vazio por um número errado.
  const presentes = inscritos.filter((i) => i?.presente || (i?.presencas || []).length).length;
  const participantes = presentes || inscritos.length;
  if (participantes) {
    campos.qtdDiscentes = String(participantes);
    de.qtdDiscentes = presentes ? "presentes credenciados" : "inscritos (não houve credenciamento)";
  }
  if (docentes.length) { campos.qtdDocentes = String(docentes.length); de.qtdDocentes = "palestrantes e comissão docente"; }
  const tecnicos = nomesUnicos(comissao.filter((c) => APOIO.has(txt(c?.papel))));
  if (tecnicos.length) { campos.qtdTecnicos = String(tecnicos.length); de.qtdTecnicos = "apoio técnico na comissão"; }

  return { campos, de };
}

/**
 * Aplica a sugestão SEM sobrescrever: devolve os campos que realmente
 * mudariam. Vazio = não há o que sugerir, e a tela não promete nada.
 */
export function aplicarSugestao(acao, atuais = acao?.relatorio || {}) {
  const { campos, de } = sugestaoDoEvento(acao);
  const novos = {}, origem = {};
  for (const [k, v] of Object.entries(campos)) {
    if (txt(atuais?.[k])) continue;             // o que a pessoa escreveu manda
    novos[k] = v; origem[k] = de[k];
  }
  return { campos: novos, de: origem };
}
