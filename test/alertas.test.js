/* Testes dos alertas de regularização: é o que a PROPPEX olha para saber
   quem cobrar. Nada aqui envia e-mail — o sistema só aponta. */
import test from "node:test";
import assert from "node:assert/strict";
import { gerarAlertas, resumoAlertas, porResponsavel, DIAS_ATA_PARADA } from "../lib/alertas.js";
import { CURSOS, normalizarAta, numerar } from "../lib/atas.js";
import { somaDias } from "../lib/datas.js";

const HOJE = "2026-08-14";                       // 2026-S2
const CURSO = [{ slug: "psicologia", nome: "Psicologia", sigla: "PSI" }];

function ata({ orgao = "NDE", curso = "psicologia", data = HOJE, status = "registrada",
  tipo = "ordinária", pautas = [], encaminhamentos = [] } = {}) {
  return numerar([], normalizarAta({
    orgao, curso,
    sessao: { data, horaInicio: "14:00", local: "Sala 1", tipo },
    presidencia: { nome: "Presidente" }, secretaria: { nome: "Secretário" },
    participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
    pauta: [
      ...pautas.map((id) => ({ titulo: "Ponto " + id, pautaMec: id, deliberacao: "Aprovado." })),
      ...encaminhamentos.map((e, i) => ({ titulo: "Enc " + i, deliberacao: "Aprovado.", encaminhamento: e })),
    ],
    status,
  }));
}
const so = (alertas, tipo) => alertas.filter((a) => a.tipo === tipo);

/* --------------------------------- ciclo -------------------------------- */
test("órgão sem sessão no semestre gera alerta de ciclo", () => {
  const a = gerarAlertas([], { cursos: CURSO, hoje: HOJE });
  const ciclo = so(a, "ciclo");
  const nde = ciclo.find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.ok(nde, "faltou o alerta do NDE");
  assert.equal(nde.quantidade, 2, "o NDE deve duas sessões ordinárias");
  assert.match(nde.titulo, /Núcleo Docente Estruturante — Psicologia/);
  assert.ok(ciclo.some((x) => x.orgao === "CONSU" && !x.curso), "os institucionais também entram");
});

test("ciclo cumprido some da lista de alertas", () => {
  const atas = [ata({ data: "2026-07-10" }), ata({ data: "2026-08-10" })];
  const ciclo = so(gerarAlertas(atas, { cursos: CURSO, hoje: HOJE }), "ciclo");
  assert.ok(!ciclo.some((x) => x.orgao === "NDE" && x.curso === "psicologia"));
});

test("extraordinária não tira o órgão da lista", () => {
  const atas = [ata({ data: "2026-07-10", tipo: "extraordinária" }), ata({ data: "2026-08-10", tipo: "extraordinária" })];
  const nde = so(gerarAlertas(atas, { cursos: CURSO, hoje: HOJE }), "ciclo")
    .find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.ok(nde, "duas extraordinárias não fecham o ciclo");
  assert.match(nde.detalhe, /não contam para o ciclo/);
});

/* -------------------------------- pautas -------------------------------- */
test("temas obrigatórios sem registro viram um alerta por órgão", () => {
  const pautas = so(gerarAlertas([], { cursos: CURSO, hoje: HOJE }), "pautas");
  const nde = pautas.find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.ok(nde.quantidade >= 3, "o NDE tem vários temas cobrados no semestre");
  assert.equal(nde.itens.length, nde.quantidade, "o alerta carrega a lista para a cobrança");
  assert.equal(pautas.filter((x) => x.orgao === "NDE" && x.curso === "psicologia").length, 1,
    "um alerta agregado por órgão, não um por tema");
});

test("registrar os temas reduz o alerta", () => {
  const sem = so(gerarAlertas([], { cursos: CURSO, hoje: HOJE }), "pautas")
    .find((x) => x.orgao === "NDE").quantidade;
  const com = so(gerarAlertas([ata({ pautas: ["nde-ppc"] })], { cursos: CURSO, hoje: HOJE }), "pautas")
    .find((x) => x.orgao === "NDE").quantidade;
  assert.equal(com, sem - 1);
});

/* ------------------------------ ata parada ------------------------------ */
test("reunião antiga sem ata registrada vira alerta", () => {
  const antiga = ata({ data: somaDias(HOJE, -(DIAS_ATA_PARADA + 5)), status: "minuta" });
  const alerta = so(gerarAlertas([antiga], { cursos: CURSO, hoje: HOJE }), "ata-parada");
  assert.equal(alerta.length, 1);
  assert.equal(alerta[0].ataId, antiga.id);
  assert.match(alerta[0].detalhe, /sem ata registrada há 35 dias/);
});

test("reunião recente ainda não alerta, e a registrada nunca alerta", () => {
  const recente = ata({ data: somaDias(HOJE, -3), status: "rascunho" });
  assert.equal(so(gerarAlertas([recente], { cursos: CURSO, hoje: HOJE }), "ata-parada").length, 0);
  const pronta = ata({ data: somaDias(HOJE, -200), status: "registrada" });
  assert.equal(so(gerarAlertas([pronta], { cursos: CURSO, hoje: HOJE }), "ata-parada").length, 0);
});

/* --------------------------- encaminhamentos ---------------------------- */
test("encaminhamento com prazo vencido gera alerta com o responsável", () => {
  const a = ata({ encaminhamentos: [{ acao: "Enviar minuta à PROAC", responsavel: "Profa. Camila", prazo: somaDias(HOJE, -20) }] });
  const alerta = so(gerarAlertas([a], { cursos: CURSO, hoje: HOJE }), "encaminhamento");
  assert.equal(alerta.length, 1);
  assert.match(alerta[0].detalhe, /Profa\. Camila/);
  assert.match(alerta[0].acao, /há 20 dias/);
  assert.equal(alerta[0].severidade, "media");
});

test("encaminhamento no prazo, sem prazo, ou de ata não aprovada não alerta", () => {
  const futuro = ata({ encaminhamentos: [{ acao: "X", prazo: somaDias(HOJE, 10) }] });
  const semPrazo = ata({ encaminhamentos: [{ acao: "Y", prazo: "" }] });
  const rascunho = ata({ status: "rascunho", encaminhamentos: [{ acao: "Z", prazo: somaDias(HOJE, -30) }] });
  for (const x of [futuro, semPrazo, rascunho]) {
    assert.equal(so(gerarAlertas([x], { cursos: CURSO, hoje: HOJE }), "encaminhamento").length, 0);
  }
});

/* ------------------------------ agregações ------------------------------ */
test("resumo conta por severidade e por tipo", () => {
  const r = resumoAlertas(gerarAlertas([], { cursos: CURSO, hoje: HOJE }));
  assert.equal(r.total, r.alta + r.media + r.baixa);
  assert.ok(r.porTipo.ciclo > 0 && r.porTipo.pautas > 0);
  assert.equal(r.porTipo["ata-parada"], 0);
});

test("alertas vêm ordenados: urgentes primeiro", () => {
  const a = gerarAlertas([
    ata({ data: somaDias(HOJE, -120), status: "minuta" }),
    ata({ encaminhamentos: [{ acao: "Atrasado", prazo: somaDias(HOJE, -90) }] }),
  ], { cursos: CURSO, hoje: HOJE });
  const ordem = ["alta", "media", "baixa"];
  const idx = a.map((x) => ordem.indexOf(x.severidade));
  assert.deepEqual(idx, [...idx].sort((p, q) => p - q), "a lista não está ordenada por severidade");
  assert.equal(a[0].severidade, "alta");
});

test("agrupamento por responsável junta tudo do mesmo órgão e curso", () => {
  const g = porResponsavel(gerarAlertas([], { cursos: CURSO, hoje: HOJE }));
  const nde = g.find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.equal(nde.alertas.length, 2, "ciclo + pautas do mesmo órgão num grupo só");
  assert.equal(nde.alta + nde.media + nde.baixa, nde.alertas.length);
  assert.ok(g[0].alta >= g[g.length - 1].alta, "os piores vêm primeiro");
});

test("com os 12 cursos reais o volume é o esperado e não há duplicata", () => {
  const a = gerarAlertas([], { hoje: HOJE });
  const ciclo = so(a, "ciclo");
  const chaves = ciclo.map((x) => `${x.orgao}|${x.curso}`);
  assert.equal(new Set(chaves).size, chaves.length, "nenhum órgão aparece duas vezes");
  assert.equal(ciclo.filter((x) => x.orgao === "NDE").length, CURSOS.length);
});

/* ---------------------- severidade de quem nunca se reuniu -------------- */
test("órgão que nunca registrou ata é sempre urgente, mesmo com o semestre longe", () => {
  const cedo = "2026-07-05";                      // 179 dias até 31/12
  const a = gerarAlertas([], { cursos: CURSO, hoje: cedo });
  assert.ok(a.length, "deveria haver alertas");
  assert.ok(a.every((x) => x.severidade === "alta"),
    "sem nenhuma ata no sistema, tudo é urgente — é órgão que não funciona");
  assert.match(so(a, "ciclo")[0].detalhe, /nunca registrou ata no sistema/);
});

test("órgão que já se reuniu antes é cobrado pelo prazo, não pelo inédito", () => {
  const historico = [ata({ data: "2026-03-10" }), ata({ data: "2026-05-10" })];   // 1º semestre
  const a = gerarAlertas(historico, { cursos: CURSO, hoje: "2026-07-05" });
  const nde = so(a, "ciclo").find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.equal(nde.inedito, false);
  assert.equal(nde.severidade, "media", "zero sessões no semestre novo: atenção, não urgência");
});

test("quem está só parcialmente atrasado fica abaixo de quem nunca se reuniu", () => {
  const atas = [ata({ data: "2026-07-20", pautas: ["nde-ppc"] })];
  const a = gerarAlertas(atas, { cursos: CURSO, hoje: HOJE });
  const psi = a.find((x) => x.tipo === "ciclo" && x.curso === "psicologia" && x.orgao === "NDE");
  const cpa = a.find((x) => x.tipo === "ciclo" && x.orgao === "CPA");
  assert.equal(psi.severidade, "baixa",
    "já fez uma das duas sessões e tem o semestre inteiro pela frente: fica no radar");
  assert.equal(cpa.severidade, "alta", "a CPA não registrou nada");
  assert.ok(a.indexOf(cpa) < a.indexOf(psi), "o pior tem de vir primeiro na lista");
});

/* ------------- órgãos institucionais nunca carregam curso --------------- */
test("os órgãos que não são de curso aparecem uma vez só, sem curso", () => {
  const a = gerarAlertas([], { hoje: HOJE });                 // 12 cursos reais
  const institucionais = ["CONSU", "CONSEPE", "PROPPEX", "PROAC", "REITORIA", "CPA"];
  for (const cod of institucionais) {
    const seus = a.filter((x) => x.orgao === cod);
    assert.ok(seus.length, `${cod} deveria gerar alerta`);
    assert.ok(seus.every((x) => x.curso === ""), `${cod} não pode ser vinculado a curso`);
    assert.equal(seus.filter((x) => x.tipo === "ciclo").length, 1,
      `${cod} deve aparecer uma vez, não uma por curso`);
    assert.ok(!/—/.test(seus[0].titulo), `${cod} não deve exibir sufixo de curso: ${seus[0].titulo}`);
  }
  // e os de curso aparecem uma vez por curso
  for (const cod of ["NDE", "COLEGIADO"]) {
    assert.equal(a.filter((x) => x.orgao === cod && x.tipo === "ciclo").length, CURSOS.length);
  }
});

test("a ata de um órgão institucional não é creditada a curso nenhum", () => {
  const doConsu = ata({ orgao: "CONSU", curso: "psicologia", pautas: ["consu-pdi"] });
  assert.equal(doConsu.curso, "", "a normalização descarta o curso num órgão institucional");
  const a = gerarAlertas([doConsu], { hoje: HOJE });
  assert.ok(!a.some((x) => x.orgao === "CONSU" && x.tipo === "ciclo"), "o CONSU cumpriu o ciclo");
  assert.ok(a.some((x) => x.orgao === "NDE" && x.curso === "psicologia"),
    "e isso não regularizou nada em Psicologia");
});

test("o alerta diz o semestre a que se refere", () => {
  const a = gerarAlertas([], { cursos: CURSO, hoje: HOJE });
  assert.ok(a.every((x) => x.janela), "todo alerta precisa dizer de que semestre fala");
  assert.match(so(a, "ciclo")[0].detalhe, /Nenhuma ata registrada no semestre 2026-S2/);
  assert.match(so(a, "ciclo")[0].acao, /Cobrar o registro/);
});
