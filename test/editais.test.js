import test from "node:test";
import assert from "node:assert/strict";
import {
  SETORES_EDITAL, setorEditalDe, anoDoNumero, proximoNumero, ordemDoNumero,
  orgaoDoSetor, ORGAOS_EDITAL, cicloSugerido,
  vigenciaSugerida, normalizarEdital, faltaNoEdital, vigenteDe, mesesEntre,
  aplicarEditais, editaisDoCodigo,
} from "../lib/editais.js";
import { EDITAL, DOCUMENTOS_EDITAIS } from "../lib/edital.js";
import { TURMAS_EM, turmaDe, turmaVigente } from "../lib/em.js";
import { EDITAIS_MONITORIA, editalMonitoriaDe } from "../lib/monitoria.js";

const ed = (o) => normalizarEdital(o);

test("TODO setor lança edital — e os três que conduzem ciclo exigem o ciclo", () => {
  const cods = SETORES_EDITAL.map((s) => s.codigo);
  for (const c of ["ic", "em", "monitoria", "inovacao", "extensao", "eventos", "ensino"])
    assert.ok(cods.includes(c), c);
  assert.equal(setorEditalDe("IC").codigo, "ic");
  assert.equal(setorEditalDe("inexistente"), null);
  // só quem casa com um catálogo do código precisa do ciclo
  assert.deepEqual(SETORES_EDITAL.filter((s) => s.exigeCiclo).map((s) => s.codigo),
    ["ic", "em", "monitoria"]);
});

/* O NÚMERO sai na ORDEM DE CRIAÇÃO, na sequência geral da instituição
   (decisão do dono, ago/2026) — contando o acervo já publicado. */
test("o número é o próximo do ANO, contando o acervo já publicado", () => {
  assert.equal(ordemDoNumero("03/2027"), 3);
  assert.equal(ordemDoNumero("002/2020"), 2);
  assert.equal(ordemDoNumero("sem número"), 0);
  // ano sem nada começa no 01, e a contagem é POR ANO
  assert.equal(proximoNumero(2030, editaisDoCodigo()), "01/2030");
  const lista = [
    { ano: 2030, numero: "01/2030", setor: "ic" },
    { ano: 2030, numero: "02/2030", setor: "extensao" },
  ];
  assert.equal(proximoNumero(2030, lista), "03/2030");
  assert.equal(proximoNumero(2031, lista), "01/2031", "o ano seguinte recomeça");
});

/* PROPPEX e PROAC numeram SEPARADO (decisão do dono, ago/2026): são duas
   pró-reitorias que expedem e assinam os próprios atos, e uma sequência
   comum faria o número de uma pular por causa do ato da outra. */
test("a numeração da PROPPEX e a da PROAC são independentes", () => {
  assert.deepEqual(ORGAOS_EDITAL.map((o) => o.codigo), ["proppex", "proac"]);
  assert.equal(orgaoDoSetor("ic"), "proppex");
  assert.equal(orgaoDoSetor("extensao"), "proppex");
  assert.equal(orgaoDoSetor("monitoria"), "proac");
  assert.equal(orgaoDoSetor("ensino"), "proac");

  const lista = [
    { ano: 2030, numero: "01/2030", setor: "ic" },        // PROPPEX
    { ano: 2030, numero: "02/2030", setor: "eventos" },   // PROPPEX
    { ano: 2030, numero: "01/2030", setor: "monitoria" }, // PROAC
  ];
  assert.equal(proximoNumero(2030, lista, "proppex"), "03/2030");
  assert.equal(proximoNumero(2030, lista, "proac"), "02/2030",
    "o ato da PROPPEX não faz o número da PROAC pular");
  // e o acervo conta dentro do órgão de cada um
  assert.equal(proximoNumero(2026, editaisDoCodigo(), "proppex"), "03/2026",
    "2026 tem 01 (graduação) e 02 (ICEM) na PROPPEX");
});

test("o ano sai do número; o ciclo e a vigência, do vocabulário do setor", () => {
  assert.equal(anoDoNumero("01/2027"), 2027);
  assert.equal(anoDoNumero("sem número"), null);
  assert.equal(cicloSugerido("ic", 2027), "2027/2028");
  assert.equal(cicloSugerido("monitoria", 2027, 2), "2027/2");
  assert.equal(cicloSugerido("extensao", 2027), "2027", "edital avulso: o ciclo é o ano");
  assert.deepEqual(vigenciaSugerida("ic", 2027), { inicio: "2027-09-01", fim: "2028-08-31" });
  assert.deepEqual(vigenciaSugerida("monitoria", 2027, 2), { inicio: "2027-07-01", fim: "2027-12-31" });
});

test("faltaNoEdital diz o que impede o lançamento", () => {
  assert.deepEqual(faltaNoEdital(ed({})).length > 0, true);
  const bom = ed({ setor: "ic", numero: "01/2027", titulo: "Edital 01/2027", ciclo: "2027/2028",
    vigencia: { inicio: "2027-09-01", fim: "2028-08-31" } });
  assert.deepEqual(faltaNoEdital(bom), []);
  // o ciclo só é exigido de quem casa com um catálogo do código
  const avulso = ed({ setor: "extensao", numero: "04/2027", ano: 2027, titulo: "Chamada",
    vigencia: { inicio: "2027-01-01", fim: "2027-12-31" } });
  assert.deepEqual(faltaNoEdital(avulso), []);
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

/* Com sequências independentes, o mesmo número pode existir nas DUAS
   pró-reitorias — e a sigla do órgão é o que separa os dois documentos. */
test("a designação nomeia o órgão: o número sozinho deixou de identificar", async () => {
  const { designacaoDoEdital } = await import("../lib/editais.js");
  assert.equal(designacaoDoEdital({ setor: "extensao", numero: "03/2027" }), "Edital PROPPEX nº 03/2027");
  assert.equal(designacaoDoEdital({ setor: "monitoria", numero: "03/2027" }), "Edital PROAC nº 03/2027");
});

test("o documento da GRADUAÇÃO é o único que entra no catálogo por número", () => {
  const { DOCUMENTOS_EDITAIS } = requireEdital();
  aplicarEditais([
    normalizarEdital({ setor: "ic", numero: "07/2028", ano: 2028, titulo: "grad", ciclo: "2028/2029",
      vigencia: { inicio: "2028-09-01", fim: "2029-08-31" }, documento: "/api/files/grad" }),
    // mesma chave, outro órgão: se entrasse aqui, sobrescreveria o da graduação
    normalizarEdital({ setor: "ensino", numero: "07/2028", ano: 2028, titulo: "proac",
      vigencia: { inicio: "2028-01-01", fim: "2028-12-31" }, documento: "/api/files/proac" }),
  ]);
  assert.equal(DOCUMENTOS_EDITAIS["07/2028"], "/api/files/grad");
  delete DOCUMENTOS_EDITAIS["07/2028"];
  aplicarEditais([]);
});
function requireEdital() {
  // o import estático já traz o objeto; a função existe só para deixar o
  // teste legível ao lado dos demais
  return { DOCUMENTOS_EDITAIS };
}

/* ============ O TEXTO DO EDITAL, ESCRITO NO PORTAL ============
   A régua existe para a coordenação COLAR o que já redigiu e o documento
   sair formatado — e para o PDF nunca renumerar o que ela escreveu. */
test("o texto do edital se lê como o edital é escrito", async () => {
  const { analisarTextoEdital, temTextoDeEdital } = await import("../lib/editais.js");
  const r = analisarTextoEdital(`Preâmbulo em duas
linhas soltas.

1. DAS DISPOSIÇÕES
1.1. Primeiro item.
1.2. Segundo item:
a) alínea um
b) alínea dois
2. DOS OBJETIVOS
2.1. Objetivo.
I. inciso um
II. inciso dois`);
  assert.equal(r.abertura, "Preâmbulo em duas\nlinhas soltas.");
  assert.equal(r.secoes.length, 2);
  assert.equal(r.secoes[0].titulo, "1. DAS DISPOSIÇÕES");
  assert.equal(r.secoes[0].itens.length, 2);
  assert.equal(r.secoes[0].itens[0].n, "1.1.", "o número é o que a pessoa escreveu");
  assert.deepEqual(r.secoes[0].itens[1].alineas, ["alínea um", "alínea dois"]);
  assert.deepEqual(r.secoes[1].itens[0].romanos, ["inciso um", "inciso dois"]);
  assert.equal(temTextoDeEdital({ corpo: "1. X\n1.1. Y" }), true);
  assert.equal(temTextoDeEdital({ corpo: "só um parágrafo" }), false, "sem seção não há edital");
  assert.equal(temTextoDeEdital({}), false);
});

test("o item de dois níveis vence o título de seção — 1.1. não abre seção", async () => {
  const { analisarTextoEdital } = await import("../lib/editais.js");
  const r = analisarTextoEdital("1. TÍTULO\n1.1. item\n1.1.2 subitem");
  assert.equal(r.secoes.length, 1);
  assert.deepEqual(r.secoes[0].itens.map((i) => i.n), ["1.1.", "1.1.2."]);
});

test("linha solta depois de um item continua o parágrafo dele", async () => {
  const { analisarTextoEdital } = await import("../lib/editais.js");
  const r = analisarTextoEdital("1. T\n1.1. começo\ncontinuação");
  assert.equal(r.secoes[0].itens.length, 1);
  assert.match(r.secoes[0].itens[0].texto, /começo\ncontinuação/);
});

test("o edital gerado sai em PDF, com o timbre do órgão que expede", async () => {
  const { gerarEditalPdf } = await import("../lib/pdf.js");
  const { analisarTextoEdital } = await import("../lib/editais.js");
  const corpo = analisarTextoEdital("Abertura.\n\n1. DAS DISPOSIÇÕES\n1.1. Item.");
  for (const orgao of ["proppex", "proac"]) {
    const buf = await gerarEditalPdf({
      edital: { numero: "05/2027", titulo: "Chamada", publicadoEm: "2026-12-10",
        vigencia: { inicio: "2027-01-01", fim: "2027-12-31" } },
      corpo, orgao,
      cronograma: [{ etapa: "Submissão", responsavel: "Proponente", ate: "2027-02-28" }],
    });
    assert.ok(buf.length > 5000, orgao);
    assert.equal(buf.subarray(0, 4).toString(), "%PDF", orgao);
  }
});
