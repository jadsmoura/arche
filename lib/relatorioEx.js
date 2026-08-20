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
