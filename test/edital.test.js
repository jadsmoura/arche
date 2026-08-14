/* Edital 01/2026: modalidades, pontuação da produção acadêmica e a
   classificação das propostas. Confere também o lote de submissões que
   acompanha o sistema (dados/ic-edital-01-2026.json). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDITAL, LINHAS, MODALIDADES, GRUPOS_PESQUISA, FOMENTOS, BLOCOS_PRODUCAO, ITENS_PRODUCAO,
  PONTUACAO_MAXIMA, modalidadeDe, modalidadePor, modalidadeVigente, modalidadesDaLinha,
  normalizarTitulacao, titulacaoAtende, pontuarProducao, normalizarProducao, notaClassificacao,
} from "../lib/edital.js";
import { cpfValido } from "../lib/cpf.js";
import { normalizarProjeto, validarProjeto, modalidadeEfetiva } from "../lib/ic.js";

/* ----------------------------- modalidades ------------------------------ */
test("as oito modalidades do edital, três linhas e o cruzamento entre elas", () => {
  assert.equal(MODALIDADES.length, 8);
  assert.deepEqual(LINHAS.map((l) => l.codigo), ["ic", "it", "ie"]);
  for (const l of LINHAS) {
    const daLinha = modalidadesDaLinha(l.codigo);
    assert.ok(daLinha.length >= 2, `${l.codigo} precisa de ao menos bolsa e voluntária`);
    assert.ok(daLinha.some((m) => !m.bolsa), `${l.codigo} sem modalidade voluntária`);
  }
  assert.equal(modalidadePor("ic", "cnpq").codigo, "pibic-cnpq");
  assert.equal(modalidadePor("ic", "uniego").codigo, "pbic-uniego");
  assert.equal(modalidadePor("ic", "voluntario").codigo, "pvic-uniego");
  assert.equal(modalidadePor("ie", "voluntario").codigo, "pvie-uniego");
  assert.equal(modalidadePor("it", "cnpq").codigo, "pibiti-cnpq");
  assert.equal(modalidadePor("ie", "cnpq"), null, "o CNPq não financia iniciação à extensão neste edital");
});

test("a bolsa do UNIEGO vale R$ 350 e a do CNPq segue a tabela do órgão", () => {
  assert.equal(modalidadeDe("pbic-uniego").valor, 350);
  assert.equal(modalidadeDe("pibic-cnpq").valor, null, "o valor do CNPq não é fixado por nós");
  assert.equal(modalidadeDe("pvic-uniego").valor, 0);
});

test("os códigos curtos antigos continuam resolvendo", () => {
  assert.equal(modalidadeVigente("pibic"), "pibic-cnpq");
  assert.equal(modalidadeVigente("voluntaria"), "pvic-uniego");
  assert.equal(modalidadeDe(modalidadeVigente("pibiti")).nome, "PIBITI/CNPq");
});

test("a titulação vem como texto livre e precisa ser entendida assim", () => {
  for (const [escrito, esperado] of [
    ["Doutor", "doutor"], ["Doutora", "doutor"], ["DOUTORA", "doutor"], ["Dr.", "doutor"],
    ["Mestre", "mestre"], ["mestra", "mestre"], ["Especialista", "especialista"], ["", ""], ["Graduado", ""],
  ]) assert.equal(normalizarTitulacao(escrito), esperado, `"${escrito}"`);
});

test("cada modalidade cobra a titulação mínima do item 4.4", () => {
  assert.equal(titulacaoAtende("Doutora", "pibic-cnpq"), true);
  assert.equal(titulacaoAtende("Mestre", "pibic-cnpq"), false, "PIBIC/CNPq é para doutor");
  assert.equal(titulacaoAtende("Mestre", "pbic-uniego"), true);
  assert.equal(titulacaoAtende("Especialista", "pbic-uniego"), false);
  assert.equal(titulacaoAtende("Especialista", "pvic-uniego"), true, "a voluntária aceita especialista");
});

/* -------------------------- pontuação da produção ------------------------ */
test("a planilha replica os pesos e os tetos da oficial", () => {
  assert.equal(PONTUACAO_MAXIMA, 100);
  assert.deepEqual(BLOCOS_PRODUCAO.map((b) => b.teto), [30, 60, 10]);
  assert.equal(ITENS_PRODUCAO.length, 28);
  assert.equal(new Set(ITENS_PRODUCAO.map((i) => i.codigo)).size, 28, "códigos não se repetem");
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "art-a1").peso, 4);
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "or-dout-conc").peso, 2.5);
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "banca-grad").peso, 0.2);
});

test("pontua por quantidade × peso, respeitando o teto de cada bloco", () => {
  const r = pontuarProducao({ "art-a1": 2, "art-b1": 3, livro: 1, "or-ic-conc": 4, "banca-grad": 10, evento: 5 });
  const bloco = (c) => r.blocos.find((b) => b.codigo === c);
  assert.equal(bloco("bibliografica").pontos, 20.7, "2×4 + 3×3,4 + 1×2,5");
  assert.equal(bloco("orientacoes").pontos, 6, "4×1,5");
  assert.equal(bloco("bancas").pontos, 7, "10×0,2 + 5×1");
  assert.equal(r.total, 33.7);
});

test("o teto corta o excesso, e o bruto continua à vista", () => {
  const r = pontuarProducao({ "art-a1": 50 });          // 200 pontos brutos
  const b = r.blocos.find((x) => x.codigo === "bibliografica");
  assert.equal(b.bruto, 200);
  assert.equal(b.pontos, 60, "o bloco tem teto de 60");
  assert.equal(r.total, 60);

  const cheia = pontuarProducao(Object.fromEntries(ITENS_PRODUCAO.map((i) => [i.codigo, 99])));
  assert.equal(cheia.total, 100, "com tudo no máximo, a planilha fecha em 100");
});

test("quantidade inválida não pontua", () => {
  assert.equal(pontuarProducao({ "art-a1": -3 }).total, 0);
  assert.equal(pontuarProducao({ "art-a1": "abc" }).total, 0);
  assert.equal(pontuarProducao({ "item-que-nao-existe": 10 }).total, 0);
  assert.equal(pontuarProducao({ "art-a1": 2.7 }).total, 8, "conta itens inteiros");
  assert.deepEqual(normalizarProducao({ "art-a1": 0, "art-b1": 2, xxx: 5 }), { "art-b1": 2 },
    "só o que foi preenchido e existe");
});

/* ---------------------------- classificação ------------------------------ */
test("NFC = NP×0,6 + CL×0,4, com o currículo trazido de 0–100 para 0–10", () => {
  const r = notaClassificacao({ notaPareceres: 8, pontuacaoProducao: 50 });
  assert.equal(r.np, 8);
  assert.equal(r.cl, 5, "50 pontos de produção viram 5");
  assert.equal(r.nfc, 6.8, "8×0,6 + 5×0,4");

  assert.equal(notaClassificacao({ notaPareceres: 10, pontuacaoProducao: 100 }).nfc, 10, "o teto é 10");
  assert.equal(notaClassificacao({}), null, "sem nota nenhuma não se inventa classificação");
  assert.equal(notaClassificacao({ pontuacaoProducao: 100 }).nfc, 4, "só currículo pesa 40%");
});

test("a modalidade efetiva sai da linha com o fomento decidido na seleção", () => {
  const p = { linha: "ic", modalidade: "pibic-cnpq" };
  assert.equal(modalidadeEfetiva(p).codigo, "pibic-cnpq", "antes da decisão vale a pretendida");
  assert.equal(modalidadeEfetiva({ ...p, fomento: { tipo: "uniego" } }).codigo, "pbic-uniego");
  assert.equal(modalidadeEfetiva({ ...p, fomento: { tipo: "voluntario" } }).codigo, "pvic-uniego");
  assert.equal(modalidadeEfetiva({ linha: "ie", fomento: { tipo: "uniego" } }).codigo, "pbie-uniego");
});

/* ------------------------- grupos de pesquisa ---------------------------- */
test("os grupos do DGP/CNPq entram só pelo nome, sem repetição", () => {
  assert.ok(GRUPOS_PESQUISA.length >= 15);
  assert.equal(new Set(GRUPOS_PESQUISA).size, GRUPOS_PESQUISA.length, "sem duplicatas");
  assert.ok(GRUPOS_PESQUISA.every((g) => typeof g === "string" && g.trim().length > 5));
  assert.ok(GRUPOS_PESQUISA.includes("Solos, Ecologia e Dinâmica da Matéria Orgânica"));
});

test("o fomento tem exatamente as três saídas da seleção", () => {
  assert.deepEqual(FOMENTOS.map((f) => f.codigo), ["cnpq", "uniego", "voluntario"]);
});

/* ------------------ lote de submissões que acompanha o sistema ----------- */
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("o banco do edital 01/2026 importa inteiro, sem linha órfã", async () => {
  const lote = JSON.parse(await readFile(path.join(RAIZ, "dados", "ic-edital-01-2026.json"), "utf8"));
  assert.equal(lote.lote, "edital-01-2026");
  assert.equal(lote.status, "submetido");
  assert.ok(lote.projetos.length >= 30, `são ${lote.projetos.length} submissões`);

  const chaves = new Set();
  for (const bruto of lote.projetos) {
    const rot = `${bruto.origemId} — ${String(bruto.titulo).slice(0, 40)}`;
    assert.ok(!chaves.has(bruto.origemId), `origemId repetido em ${rot}`);
    chaves.add(bruto.origemId);

    // o CPF é a chave do vínculo: sem ele o projeto nunca acharia o dono
    assert.ok(cpfValido(bruto.orientador.cpf), `CPF inválido em ${rot}: ${bruto.orientador.cpf}`);

    const p = normalizarProjeto(bruto, { autor: "" });
    assert.deepEqual(validarProjeto(p), [], `${rot} não passaria na validação`);
    assert.equal(p.orientador.email, "", `${rot} não deve trazer e-mail: o vínculo é por CPF`);
    assert.ok(p.cronograma.length >= 1, `${rot} sem cronograma`);
    assert.ok(["ic", "it", "ie"].includes(p.linha), `${rot} com linha inválida`);
    assert.ok(p.curso, `${rot} sem curso mapeado`);
  }
});

test("as submissões cobrem o período de execução do edital", async () => {
  const lote = JSON.parse(await readFile(path.join(RAIZ, "dados", "ic-edital-01-2026.json"), "utf8"));
  for (const p of lote.projetos) {
    assert.equal(p.inicio, EDITAL.vigencia.inicio);
    assert.equal(p.fim, EDITAL.vigencia.fim);
    assert.match(p.submetidoEm, /^2026-(0[1-9])/, "submissões são de 2026");
  }
});
