/* Relatório final da ação de extensão: os campos e a régua da entrega.
   O que se protege aqui: a régua é UMA — a mesma que o formulário do ARCHÉ
   EX aplica e a que o encerramento do evento no ARCHÉ EV aplica. Se as duas
   divergirem, um caminho aceita o que o outro recusa e o relatório entra
   pela metade. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_RELATORIO_FINAL, normalizarRelatorioFinal, faltaParaEntregar, relatorioEntregue,
} from "../lib/relatorioEx.js";
import { MIN_FOTOS_RELATORIO } from "../lib/portfolio.js";

const fotos = (n) => ({ portfolio: { anexos: Array.from({ length: n },
  (_, i) => ({ name: `foto${i}.jpg`, tipo: "image/jpeg" })) } });

test("o catálogo tem chave única e a avaliação é o campo obrigatório", () => {
  assert.equal(new Set(CAMPOS_RELATORIO_FINAL.map((c) => c.chave)).size, CAMPOS_RELATORIO_FINAL.length);
  const obrig = CAMPOS_RELATORIO_FINAL.filter((c) => c.obrigatorio).map((c) => c.chave);
  assert.deepEqual(obrig, ["avaliacaoResultados"]);
  for (const c of CAMPOS_RELATORIO_FINAL) {
    assert.ok(c.rotulo, `campo sem rótulo: ${c.chave}`);
    assert.ok(["longo", "curto", "numero"].includes(c.tipo), `tipo inválido em ${c.chave}`);
  }
});

test("normalizar fica só com o catálogo, e número é número", () => {
  const r = normalizarRelatorioFinal({
    avaliacaoResultados: "  correu bem  ", qtdDiscentes: "40", qtdDocentes: "muitos",
    entregueEm: "2026-01-01", status: "registrada", inventado: "x",
  });
  assert.equal(r.avaliacaoResultados, "correu bem", "apara as pontas");
  assert.equal(r.qtdDiscentes, "40");
  assert.equal(r.qtdDocentes, "", "texto num campo de número não vira número");
  assert.equal(r.entregueEm, undefined, "a data da entrega é do servidor, não do formulário");
  assert.equal(r.status, undefined, "a situação da ação não viaja pelo relatório");
  assert.equal(r.inventado, undefined);
  // campo ausente vira string vazia — o relatório gravado tem sempre a mesma forma
  assert.equal(normalizarRelatorioFinal({}).despesa, "");
});

test("a entrega exige a avaliação e o mínimo de fotos", () => {
  const cheio = { avaliacaoResultados: "os resultados alcançados foram…" };
  assert.deepEqual(faltaParaEntregar(fotos(MIN_FOTOS_RELATORIO), cheio), [],
    "com avaliação e fotos, nada falta");

  const semTexto = faltaParaEntregar(fotos(MIN_FOTOS_RELATORIO), {});
  assert.equal(semTexto.length, 1);
  assert.match(semTexto[0], /Avaliação/i);

  const semFoto = faltaParaEntregar(fotos(2), cheio);
  assert.equal(semFoto.length, 1);
  assert.match(semFoto[0], /fotos/i, "a frase das fotos é a mesma do formulário do EX");

  // documento anexado entra no portfólio e NÃO conta como foto
  const soDoc = { portfolio: { anexos: [{ name: "lista.pdf", tipo: "application/pdf" }] } };
  assert.equal(faltaParaEntregar(soDoc, cheio).length, 1);
});

test("entregue é o que tem entregueEm — rascunho não conta", () => {
  assert.equal(relatorioEntregue({ relatorio: { avaliacaoResultados: "x" } }), false);
  assert.equal(relatorioEntregue({ relatorio: { entregueEm: "2026-08-20T10:00:00Z" } }), true);
  assert.equal(relatorioEntregue(null), false);
});
