/* Diagnóstico de banda — as contas e a classificação.
   O que se protege aqui é o que o diagnóstico afirma: em que grupo cada
   byte cai, quanto dá no mês e o que se recomenda a partir disso. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GRUPOS, classificar, emMB, novoRegistro, podar, recomendacoes, resumir, somar,
} from "../lib/banda.js";

const MB = 1024 * 1024;

test("o tipo tem precedência sobre o caminho — um PDF é um PDF", () => {
  assert.equal(classificar("/api/ic/certificado.pdf", "application/pdf"), "pdf");
  assert.equal(classificar("/arche/index.html", "application/pdf"), "pdf");
  assert.equal(classificar("/api/publico/eventos/x/capa", "image/jpeg"), "imagem");
});

test("cada caminho cai no grupo que explica o gasto", () => {
  assert.equal(classificar("/arche/dossie/psicologia/"), "avaliacao");
  assert.equal(classificar("/assets/arche-nav.js"), "assets");
  assert.equal(classificar("/monitoria/index.html"), "paginas");
  assert.equal(classificar("/extensao/"), "paginas");
  assert.equal(classificar("/api/monitoria", "application/json"), "api");
  assert.equal(classificar("/ic/"), "publico");
  assert.equal(classificar("/eventos/semana-de-enfermagem"), "publico");
  assert.equal(classificar("/"), "publico");
  assert.equal(classificar("/coisa-estranha"), "outros");
});

test("somar ignora o que não é byte e agrupa por dia", () => {
  const r = novoRegistro("2026-08-01T00:00:00Z");
  somar(r, "api", 100, { quando: "2026-08-19T10:00:00Z" });
  somar(r, "api", 50, { quando: "2026-08-19T23:00:00Z" });
  somar(r, "pdf", 400, { quando: "2026-08-20T01:00:00Z" });
  somar(r, "api", 0, { quando: "2026-08-20T01:00:00Z" });
  somar(r, "api", -5, { quando: "2026-08-20T01:00:00Z" });
  somar(r, "api", NaN, { quando: "2026-08-20T01:00:00Z" });
  assert.deepEqual(r.dias["2026-08-19"].api, { bytes: 150, n: 2 });
  assert.equal(r.dias["2026-08-20"].api, undefined, "zero e negativo não viram linha");
  assert.equal(r.dias["2026-08-20"].pdf.bytes, 400);
});

test("a janela é de semanas: o que envelhece sai", () => {
  const r = novoRegistro();
  somar(r, "api", 10, { quando: "2026-05-01T00:00:00Z" });
  somar(r, "api", 10, { quando: "2026-08-18T00:00:00Z" });
  podar(r, { dias: 45, hoje: "2026-08-19T00:00:00Z" });
  assert.deepEqual(Object.keys(r.dias), ["2026-08-18"]);
});

test("o resumo ordena pelo que mais pesa e separa o que SAI do que é servido", () => {
  const r = novoRegistro("2026-08-17T00:00:00Z");
  somar(r, "avaliacao", 300 * MB, { quando: "2026-08-17T10:00:00Z" });
  somar(r, "drive-estado", 700 * MB, { quando: "2026-08-17T10:00:00Z", n: 400 });
  somar(r, "api", 100 * MB, { quando: "2026-08-18T10:00:00Z" });
  const s = resumir(r, { hoje: "2026-08-19T10:00:00Z" });
  assert.equal(s.porGrupo[0].grupo, "drive-estado");
  assert.equal(s.porGrupo[0].fatia, 63.6);
  assert.ok(s.porGrupo[0].externo);
  assert.equal(s.externoMB, 700);
  assert.equal(s.servidoMB, 400);
  assert.equal(s.totalMB, 1100);
  assert.equal(s.diasCompletos, 2);
  assert.equal(s.preliminar, false);
  // média de 550 MB/dia × 30
  assert.equal(s.projecaoMensalMB, 16500);
});

test("sem um dia inteiro medido, a projeção sai marcada como preliminar", () => {
  const r = novoRegistro();
  somar(r, "api", 10 * MB, { quando: "2026-08-19T10:00:00Z" });
  const s = resumir(r, { hoje: "2026-08-19T12:00:00Z" });
  assert.equal(s.diasCompletos, 0);
  assert.equal(s.preliminar, true);
  assert.equal(s.projecaoMensalMB, 300);
});

test("registro vazio não quebra e não inventa projeção", () => {
  const s = resumir(novoRegistro(), { hoje: "2026-08-19T10:00:00Z" });
  assert.equal(s.totalMB, 0);
  assert.deepEqual(s.porGrupo, []);
  assert.equal(s.projecaoMensalMB, 0);
});

test("a recomendação só aparece quando o número a justifica", () => {
  const r = novoRegistro("2026-08-17T00:00:00Z");
  somar(r, "drive-estado", 800 * MB, { quando: "2026-08-17T10:00:00Z", n: 900 });
  somar(r, "avaliacao", 700 * MB, { quando: "2026-08-18T10:00:00Z" });
  const rec = recomendacoes(resumir(r, { hoje: "2026-08-19T10:00:00Z" }), { franquiaGB: 5 });
  const titulos = rec.map((x) => x.titulo).join(" | ");
  assert.match(titulos, /acima da franquia/);
  assert.match(titulos, /estado no Drive/);
  assert.match(titulos, /cacheável/);
  assert.equal(rec[0].peso, "alto", "o estouro da franquia vem primeiro");

  // e num consumo pequeno e espalhado, nenhuma recomendação é forçada
  const magro = novoRegistro("2026-08-18T00:00:00Z");
  somar(magro, "api", 1 * MB, { quando: "2026-08-18T10:00:00Z" });
  const rec2 = recomendacoes(resumir(magro, { hoje: "2026-08-19T10:00:00Z" }));
  assert.equal(rec2.length, 1);
  assert.equal(rec2[0].peso, "baixo");
});

test("todo grupo do catálogo tem rótulo e explicação", () => {
  for (const g of GRUPOS) {
    assert.ok(g.chave && g.rotulo && g.dica, `grupo incompleto: ${g.chave}`);
  }
  assert.equal(emMB(1024 * 1024 * 3), 3);
});
