import test from "node:test";
import assert from "node:assert/strict";
import {
  SETORES_EDITAL, setorEditalDe, anoDoNumero, numeroSugerido, cicloSugerido,
  vigenciaSugerida, normalizarEdital, faltaNoEdital, vigenteDe, mesesEntre,
  aplicarEditais, editaisDoCodigo,
} from "../lib/editais.js";
import { EDITAL, DOCUMENTOS_EDITAIS } from "../lib/edital.js";
import { TURMAS_EM, turmaDe, turmaVigente } from "../lib/em.js";
import { EDITAIS_MONITORIA, editalMonitoriaDe } from "../lib/monitoria.js";

const ed = (o) => normalizarEdital(o);

test("os três setores têm série própria — é ela que agrupa a vitrine por ano", () => {
  assert.deepEqual(SETORES_EDITAL.map((s) => s.serie), ["01", "02", "03"]);
  assert.equal(setorEditalDe("IC").codigo, "ic");
  assert.equal(setorEditalDe("inexistente"), null);
  assert.equal(numeroSugerido("monitoria", 2027), "03/2027");
});

test("o ano sai do número; o ciclo e a vigência, do vocabulário do setor", () => {
  assert.equal(anoDoNumero("01/2027"), 2027);
  assert.equal(anoDoNumero("sem número"), null);
  assert.equal(cicloSugerido("ic", 2027), "2027/2028");
  assert.equal(cicloSugerido("monitoria", 2027, 2), "2027/2");
  assert.deepEqual(vigenciaSugerida("ic", 2027), { inicio: "2027-09-01", fim: "2028-08-31" });
  assert.deepEqual(vigenciaSugerida("monitoria", 2027, 2), { inicio: "2027-07-01", fim: "2027-12-31" });
});

test("faltaNoEdital diz o que impede o lançamento", () => {
  assert.deepEqual(faltaNoEdital(ed({})).length > 0, true);
  const bom = ed({ setor: "ic", numero: "01/2027", titulo: "Edital 01/2027", ciclo: "2027/2028",
    vigencia: { inicio: "2027-09-01", fim: "2028-08-31" } });
  assert.deepEqual(faltaNoEdital(bom), []);
  // vigência que termina antes de começar é erro nomeado, não silêncio
  const torto = ed({ ...bom, vigencia: { inicio: "2027-09-01", fim: "2027-08-31" } });
  assert.match(faltaNoEdital(torto).join(" "), /termine depois de começar/);
});

test("vigente é o mais recente NÃO encerrado do setor", () => {
  const lista = [
    ed({ setor: "ic", numero: "01/2026", ano: 2026, encerrado: true }),
    ed({ setor: "ic", numero: "01/2027", ano: 2027 }),
    ed({ setor: "em", numero: "02/2027", ano: 2027 }),
  ];
  assert.equal(vigenteDe(lista, "ic").numero, "01/2027");
  assert.equal(vigenteDe(lista, "em").numero, "02/2027");
  assert.equal(vigenteDe(lista, "monitoria"), null);
  // encerrar o único aberto deixa o setor sem vigente
  assert.equal(vigenteDe(lista.map((e) => ({ ...e, encerrado: true })), "ic"), null);
});

test("mesesEntre devolve a vigência em meses inteiros", () => {
  assert.equal(mesesEntre("2027-09-01", "2028-08-31"), 12);
  assert.equal(mesesEntre("2027-01-01", "2027-06-30"), 6);
  assert.equal(mesesEntre("", "2028-08-31"), 0);
  assert.equal(mesesEntre("2028-08-31", "2027-09-01"), 0);
});

/* A MUTAÇÃO é o coração: é ela que faz os vinte leitores de EDITAL.numero,
   turmaVigente() e editalMonitoriaDe() enxergarem o edital novo. */
test("lançar o edital da graduação passa a valer no EDITAL do sistema", () => {
  const antes = EDITAL.numero;
  const novo = ed({ setor: "ic", numero: "01/2027", ano: 2027, titulo: "Edital nº 01/2027",
    ciclo: "2027/2028", vigencia: { inicio: "2027-09-01", fim: "2028-08-31" },
    documento: "/api/files/abc" });
  aplicarEditais([novo]);
  assert.equal(EDITAL.numero, "01/2027");
  assert.equal(EDITAL.vigencia.inicio, "2027-09-01");
  assert.equal(EDITAL.meses, 12);
  assert.equal(DOCUMENTOS_EDITAIS["01/2027"], "/api/files/abc");
  // régua em branco repete a do edital anterior, em vez de zerar
  assert.equal(typeof EDITAL.producaoDe, "number");
  assert.equal(EDITAL.relatorios.final > 0, true);

  // ENCERRADO, ele deixa de ser o vigente e o do código volta
  aplicarEditais([{ ...novo, encerrado: true }]);
  assert.equal(EDITAL.numero, antes);
  // e sem cadastro nenhum também volta: remover não pode deixar o sistema mutado
  aplicarEditais([]);
  assert.equal(EDITAL.numero, antes);
});

test("o cadastro nunca faz o sistema RECUAR para um edital anterior", () => {
  const antes = EDITAL.numero;
  aplicarEditais([ed({ setor: "ic", numero: "01/2020", ano: 2020, titulo: "antigo",
    ciclo: "2020/2021", vigencia: { inicio: "2020-09-01", fim: "2021-08-31" } })]);
  assert.equal(EDITAL.numero, antes, "edital de ano anterior não assume o ciclo");
  aplicarEditais([]);
});

test("o edital do ICEM vira TURMA — e reaplicar não duplica", () => {
  const n = TURMAS_EM.length;
  const novo = ed({ setor: "em", numero: "02/2027", ano: 2027, titulo: "ICEM 2027",
    ciclo: "2027/2028", vigencia: { inicio: "2027-09-01", fim: "2028-08-31" },
    documento: "/api/files/em27" });
  aplicarEditais([novo]);
  assert.equal(TURMAS_EM.length, n + 1);
  assert.equal(turmaDe("2027/2028").edital, "02/2027");
  assert.equal(turmaVigente().ciclo, "2027/2028");
  aplicarEditais([novo]);
  assert.equal(TURMAS_EM.length, n + 1, "idempotente");
  // encerrar a turma pelo cadastro se reflete no catálogo
  aplicarEditais([{ ...novo, encerrado: true }]);
  assert.equal(turmaDe("2027/2028").encerrada, true);
  TURMAS_EM.splice(TURMAS_EM.findIndex((t) => t.ciclo === "2027/2028"), 1);
});

test("o edital da monitoria entra no catálogo com o órgão que o expediu", () => {
  const n = EDITAIS_MONITORIA.length;
  const novo = ed({ setor: "monitoria", numero: "03/2027", ano: 2027, ciclo: "2027/1",
    titulo: "Programa de Monitoria Acadêmica 2027/1",
    vigencia: { inicio: "2027-01-01", fim: "2027-06-30" }, publicadoEm: "2027-01-10" });
  aplicarEditais([novo]);
  assert.equal(EDITAIS_MONITORIA.length, n + 1);
  assert.equal(editalMonitoriaDe("03/2027").ciclo, "2027/1");
  assert.match(editalMonitoriaDe("03/2027").orgao, /PROAC/, "o órgão padrão do setor entra sozinho");
  aplicarEditais([novo]);
  assert.equal(EDITAIS_MONITORIA.length, n + 1, "idempotente");
  EDITAIS_MONITORIA.splice(EDITAIS_MONITORIA.findIndex((e) => e.numero === "03/2027"), 1);
});

test("o acervo do CÓDIGO é um retrato, tirado antes de qualquer mutação", () => {
  const acervo = editaisDoCodigo();
  assert.ok(acervo.every((e) => e.doCodigo));
  assert.ok(acervo.some((e) => e.numero === "01/2026"));
  assert.ok(acervo.some((e) => e.setor === "monitoria"));
  // o edital lançado pelo portal NÃO aparece como se estivesse no código
  aplicarEditais([ed({ setor: "ic", numero: "01/2099", ano: 2099, titulo: "futuro",
    ciclo: "2099/2100", vigencia: { inicio: "2099-09-01", fim: "2100-08-31" } })]);
  assert.ok(!editaisDoCodigo().some((e) => e.numero === "01/2099"));
  aplicarEditais([]);
});

/* O CRONOGRAMA DA MONITORIA: sem ele, o edital lançado ficaria listado com os
   prazos do ciclo anterior — submissão fechada antes de abrir. */
test("o edital da monitoria do CICLO CORRENTE reescreve os prazos; o futuro, não", async () => {
  const { PRAZOS, VIGENCIA, CRONOGRAMA } = await import("../lib/monitoria.js");
  const { semestreCorrente } = await import("../lib/datas.js");
  const submissaoAntes = PRAZOS.submissao;
  const ciclo = semestreCorrente();
  const ano = Number(ciclo.split("/")[0]);

  // um edital de OUTRO ciclo não toca nos prazos de agora
  aplicarEditais([normalizarEdital({ setor: "monitoria", numero: "03/2099", ano: 2099,
    ciclo: "2099/1", titulo: "futuro", vigencia: { inicio: "2099-01-01", fim: "2099-06-30" },
    prazos: { submissao: "2099-01-05", relatorio: "2099-06-10" } })]);
  assert.equal(PRAZOS.submissao, submissaoAntes, "edital de outro ciclo não fecha a submissão de agora");

  // o do ciclo CORRENTE, sim
  aplicarEditais([normalizarEdital({ setor: "monitoria", numero: "03/9998", ano,
    ciclo, titulo: "deste ciclo", vigencia: { inicio: `${ano}-08-01`, fim: `${ano}-11-30` },
    prazos: { submissao: `${ano}-07-20`, cadastroMonitor: `${ano}-07-25`,
      relatorio: `${ano}-12-01`, validacao: `${ano}-12-05`, homologacao: `${ano}-12-10` } })]);
  assert.equal(PRAZOS.submissao, `${ano}-07-20`);
  assert.equal(PRAZOS.relatorio, `${ano}-12-01`);
  assert.equal(VIGENCIA.fim, `${ano}-11-30`);
  assert.equal(CRONOGRAMA[0].ate, `${ano}-07-20`, "o cronograma impresso acompanha");
  assert.equal(CRONOGRAMA[4].ate, `${ano}-11-30`, "a linha da vigência sai da vigência");

  // sem cadastro, os prazos do código voltam
  aplicarEditais([]);
  assert.equal(PRAZOS.submissao, submissaoAntes);
  assert.equal(CRONOGRAMA[0].ate, submissaoAntes);
});
