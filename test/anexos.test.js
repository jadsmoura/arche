/* Os anexos do edital 01/2026 (cronogramas e planilhas de produção lidos dos
   arquivos que os professores enviaram) precisam casar com o lote de
   projetos: é o arquivo do Drive gravado em `origem` que faz o vínculo. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ITENS_PRODUCAO, pontuarProducao } from "../lib/edital.js";

const lote = JSON.parse(await readFile(new URL("../dados/ic-edital-01-2026.json", import.meta.url), "utf8"));
const anexos = JSON.parse(await readFile(new URL("../dados/ic-edital-01-2026-anexos.json", import.meta.url), "utf8"));
const idDe = (url) => (String(url || "").match(/[?&]id=([\w-]+)/) || [])[1] || "";

test("todo projeto do lote encontra o seu cronograma", () => {
  for (const p of lote.projetos) {
    const id = idDe(p.anexosOrigem?.cronograma);
    assert.ok(id, `projeto "${p.titulo?.slice(0, 40)}" sem link de cronograma`);
    assert.ok(anexos.cronogramas[id], `cronograma do Drive ${id} não foi lido`);
  }
});

test("as planilhas de produção cobrem o lote — menos a única que não veio", () => {
  const sem = lote.projetos.filter((p) => !anexos.producoes[idDe(p.anexosOrigem?.producao)]);
  // Sara Aragão anexou o projeto em .docx no lugar do formulário de pontuação
  assert.equal(sem.length, 1);
  assert.match(sem[0].orientador?.nome || "", /Luana|Sara/i);
});

test("as etapas têm forma de cronograma: atividade e datas ISO ou vazias", () => {
  for (const [id, c] of Object.entries(anexos.cronogramas)) {
    assert.ok(c.etapas.length >= 3, `${id}: só ${c.etapas.length} etapa(s)`);
    assert.ok(c.etapas.length <= 60);
    for (const e of c.etapas) {
      assert.ok(e.atividade?.trim(), `${id}: etapa sem atividade`);
      for (const d of [e.inicio, e.fim]) {
        if (d) assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `${id}: data "${d}" fora do ISO`);
      }
      if (e.inicio && e.fim) assert.ok(e.inicio <= e.fim, `${id}: etapa "${e.atividade}" termina antes de começar`);
      // régua de sanidade: entre ago/2025 (o cronograma mais antigo enviado)
      // e dez/2027 — um ano digitado errado num mês não pode datar o projeto
      // inteiro fora da vigência (aconteceu com um "23" no meio de 2026/27)
      for (const d of [e.inicio, e.fim]) {
        if (d) assert.ok(d >= "2025-08-01" && d <= "2027-12-31", `${id}: "${e.atividade}" datada em ${d}`);
      }
    }
  }
});

test("as quantidades de produção usam os códigos do edital e pontuam de 0 a 100", () => {
  const codigos = new Set(ITENS_PRODUCAO.map((i) => i.codigo));
  for (const [id, p] of Object.entries(anexos.producoes)) {
    for (const [codigo, qtd] of Object.entries(p.quantidades)) {
      assert.ok(codigos.has(codigo), `${id}: código desconhecido "${codigo}"`);
      assert.ok(Number.isInteger(qtd) && qtd > 0 && qtd < 1000, `${id}: quantidade estranha em ${codigo}: ${qtd}`);
    }
    const total = pontuarProducao(p.quantidades).total;
    assert.ok(total >= 0 && total <= 100, `${id}: pontuação ${total} fora da régua`);
  }
});

test("os totais conferidos à mão continuam saindo da leitura", () => {
  // Amostras verificadas contra o total impresso na própria planilha (modo
  // íntegro) ou recalculadas quando o professor digitou no lugar da fórmula.
  const casos = [
    ["15NN9UYafOLLg-r5MsWEY_luW34l9wGbn", 64.4],   // Marlana (março) — planilha íntegra
    ["1WNVqvJFHtoyoP45M9Gs2fy9RAbz84Wp4", 71.2],   // Marlana (abril) — planilha íntegra
    ["1aRfaJus_ooRU855EjMz4GmQKS797z7jq", 83.3],   // Eduardo — PDF assinado, íntegro
    ["1eStakqLiqYWr4NYSXJeeXtPbyn7QagPv", 84.9],   // Kenia — digitou no total; nota justa
    ["1ni3eXxNcp4LlynIa7K4gJBIommaVtoBy", 47.1],   // Keren — idem
  ];
  for (const [id, esperado] of casos) {
    assert.equal(pontuarProducao(anexos.producoes[id].quantidades).total, esperado, id);
  }
});
