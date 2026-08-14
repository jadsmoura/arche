/* Testes da Pauta Regulatória: integridade do catálogo extraído dos
   instrumentos do INEP, janelas de periodicidade e cálculo de conformidade. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PAUTAS, PERIODICIDADES, pautaDe, pautasDoOrgao, janelaDe, fimDaJanela,
  situacaoPautas, pautasSugeridas, matrizConformidade, placarPorCurso, proximosPrazos,
} from "../lib/pautas.js";
import { ORGAOS, CURSOS, normalizarAta, numerar } from "../lib/atas.js";
import { somaDias } from "../lib/datas.js";

/* ------------------------------- catálogo ------------------------------- */
test("catálogo é íntegro: ids únicos, órgãos e periodicidades válidos", () => {
  const ids = PAUTAS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos no catálogo");
  const codigos = new Set(ORGAOS.map((o) => o.codigo));
  for (const p of PAUTAS) {
    assert.ok(p.orgaos.length, `${p.id} sem órgão`);
    for (const o of p.orgaos) assert.ok(codigos.has(o), `${p.id} aponta para órgão inexistente: ${o}`);
    assert.ok(PERIODICIDADES[p.periodicidade], `${p.id} com periodicidade inválida`);
    assert.ok(["curso", "institucional"].includes(p.escopo), `${p.id} com escopo inválido`);
    assert.ok(p.titulo && p.porque && p.evidencia, `${p.id} sem texto completo`);
    assert.ok(p.refs.length, `${p.id} sem indicador do instrumento`);
    for (const r of p.refs) {
      assert.ok(["curso", "ies"].includes(r.inst), `${p.id} com instrumento inválido`);
      assert.match(r.num, /^\d+\.\d+$/, `${p.id} com número de indicador estranho: ${r.num}`);
      assert.ok(r.nivel >= 1 && r.nivel <= 5, `${p.id} com conceito fora da escala`);
    }
  }
});

test("os três órgãos centrais têm pauta e os indicadores-chave estão cobertos", () => {
  for (const o of ["NDE", "COLEGIADO", "CPA", "CONSU", "PROPPEX"]) {
    assert.ok(pautasDoOrgao(o, "psicologia").length, `nenhuma pauta para ${o}`);
  }
  const refs = new Set(PAUTAS.flatMap((p) => p.refs.map((r) => `${r.inst} ${r.num}`)));
  for (const chave of ["curso 2.1", "curso 2.12", "curso 1.13", "ies 1.5", "ies 4.5"]) {
    assert.ok(refs.has(chave), `indicador central ausente do catálogo: ${chave}`);
  }
});

test("pautaDe encontra pelo id e ignora o desconhecido", () => {
  assert.equal(pautaDe("nde-ppc").periodicidade, "semestral");
  assert.equal(pautaDe("nao-existe"), null);
});

/* ------------------------------- janelas -------------------------------- */
test("janela semestral separa o primeiro do segundo semestre", () => {
  assert.equal(janelaDe("2026-01-01", "semestral"), "2026-S1");
  assert.equal(janelaDe("2026-06-30", "semestral"), "2026-S1");
  assert.equal(janelaDe("2026-07-01", "semestral"), "2026-S2");
  assert.equal(janelaDe("2026-12-31", "semestral"), "2026-S2");
  assert.equal(fimDaJanela("2026-02-10", "semestral"), "2026-06-30");
  assert.equal(fimDaJanela("2026-08-10", "semestral"), "2026-12-31");
});

test("janelas anual e bienal", () => {
  assert.equal(janelaDe("2026-03-01", "anual"), "2026");
  assert.equal(fimDaJanela("2026-03-01", "anual"), "2026-12-31");
  assert.equal(janelaDe("2025-05-01", "bienal"), "2025-26");
  assert.equal(janelaDe("2026-05-01", "bienal"), "2025-26", "o biênio não muda no ano par");
  assert.equal(janelaDe("2027-01-01", "bienal"), "2027-28");
});

test("data inválida não gera janela", () => {
  assert.equal(janelaDe("13/08/2026", "anual"), null);
  assert.equal(fimDaJanela("", "anual"), null);
});

/* ------------------------------ conformidade ---------------------------- */
const HOJE = "2026-08-14";
function ata({ orgao = "NDE", curso = "psicologia", data = HOJE, status = "registrada", pautas = [] }) {
  const a = normalizarAta({
    orgao, curso,
    sessao: { data, horaInicio: "14:00", local: "Sala 1" },
    presidencia: { nome: "Presidente" }, secretaria: { nome: "Secretário" },
    participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
    pauta: pautas.map((id) => ({ titulo: "Ponto " + id, pautaMec: id, deliberacao: "Aprovado." })),
    status,
  });
  return numerar([], a);
}
const doNde = (id) => situacaoPautas([], { orgao: "NDE", curso: "psicologia", hoje: HOJE }).find((p) => p.id === id);

test("pauta nunca tratada aparece como 'nunca'", () => {
  assert.equal(doNde("nde-ppc").estado, "nunca");
  assert.equal(doNde("nde-ppc").ultima, null);
});

test("ata registrada na janela vigente coloca a pauta em dia", () => {
  const atas = [ata({ data: "2026-07-20", pautas: ["nde-ppc"] })];
  const s = situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  const ppc = s.find((p) => p.id === "nde-ppc");
  assert.equal(ppc.estado, "em-dia");
  assert.equal(ppc.janela, "2026-S2");
  assert.equal(ppc.ultima.data, "2026-07-20");
});

test("pauta tratada no semestre anterior volta a pendente na janela nova", () => {
  const atas = [ata({ data: "2026-03-10", pautas: ["nde-ppc"] })];
  const ppc = situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE }).find((p) => p.id === "nde-ppc");
  assert.equal(ppc.estado, "pendente", "o semestral precisa voltar à mesa a cada semestre");
  assert.equal(ppc.ultima.data, "2026-03-10");
});

test("perto do fim da janela a pauta passa a 'vencendo'", () => {
  const atas = [ata({ data: "2026-03-10", pautas: ["nde-ppc"] })];
  const perto = situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje: "2026-12-10" })
    .find((p) => p.id === "nde-ppc");
  assert.equal(perto.estado, "vencendo");
  assert.ok(perto.diasRestantes <= 45);
});

test("só ata aprovada ou registrada vale como prova", () => {
  for (const status of ["rascunho", "minuta", "revisao"]) {
    const s = situacaoPautas([ata({ status, pautas: ["nde-ppc"] })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
    assert.equal(s.find((p) => p.id === "nde-ppc").estado, "nunca", `${status} não pode contar como prova`);
  }
  const ok = situacaoPautas([ata({ status: "aprovada", pautas: ["nde-ppc"] })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(ok.find((p) => p.id === "nde-ppc").estado, "em-dia");
});

test("a ata de um curso não credita a pauta de outro curso", () => {
  const atas = [ata({ curso: "enfermagem", pautas: ["nde-ppc"] })];
  assert.equal(situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE })
    .find((p) => p.id === "nde-ppc").estado, "nunca");
  assert.equal(situacaoPautas(atas, { orgao: "NDE", curso: "enfermagem", hoje: HOJE })
    .find((p) => p.id === "nde-ppc").estado, "em-dia");
});

test("a ata de um órgão não credita a pauta de outro órgão", () => {
  const atas = [ata({ orgao: "COLEGIADO", pautas: ["nde-ppc"] })];
  assert.equal(situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE })
    .find((p) => p.id === "nde-ppc").estado, "nunca");
});

test("pauta de dois órgãos é creditada em cada um separadamente", () => {
  const compartilhada = PAUTAS.find((p) => p.orgaos.length > 1 && p.escopo === "curso");
  const atas = [ata({ orgao: compartilhada.orgaos[0], pautas: [compartilhada.id] })];
  const a = situacaoPautas(atas, { orgao: compartilhada.orgaos[0], curso: "psicologia", hoje: HOJE });
  const b = situacaoPautas(atas, { orgao: compartilhada.orgaos[1], curso: "psicologia", hoje: HOJE });
  assert.equal(a.find((p) => p.id === compartilhada.id).estado, "em-dia");
  assert.equal(b.find((p) => p.id === compartilhada.id).estado, "nunca");
});

/* ------------------------------- sugestões ------------------------------ */
test("sugestões trazem só o que falta, com as nunca tratadas na frente", () => {
  const atas = [ata({ data: "2026-07-20", pautas: ["nde-ppc"] })];
  const sug = pautasSugeridas(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.ok(!sug.some((p) => p.id === "nde-ppc"), "o que está em dia não deve ser sugerido");
  assert.equal(sug[0].estado, "nunca");
  assert.ok(sug.length, "deveria sobrar pauta a sugerir");
});

test("próximos prazos respeitam a janela de dias pedida", () => {
  const p = proximosPrazos([], { orgao: "NDE", curso: "psicologia", hoje: "2026-12-01", dias: 60 });
  assert.ok(p.length, "em dezembro tudo vence em 31/12");
  const vazio = proximosPrazos([], { orgao: "NDE", curso: "psicologia", hoje: "2026-01-05", dias: 10 });
  assert.equal(vazio.length, 0, "em janeiro nada vence em 10 dias");
});

/* ------------------------- matriz e placar (PROPPEX) -------------------- */
test("matriz cobre todo o catálogo e conta os quadrinhos corretamente", () => {
  const m = matrizConformidade([], { hoje: HOJE });
  const esperado = PAUTAS.reduce((n, p) => n + p.orgaos.length, 0);
  assert.equal(m.linhas.length, esperado, "uma linha por par pauta×órgão");
  assert.equal(m.emDia, 0);
  assert.equal(m.percentual, 0);
  const daPauta = m.linhas.find((l) => l.pauta === "nde-ppc");
  assert.equal(daPauta.total, CURSOS.length, "pauta de curso tem uma coluna por curso");
  assert.equal(m.linhas.find((l) => l.pauta === "cpa-relatorio").total, 1, "pauta institucional tem coluna única");
});

test("matriz e placar refletem o que foi registrado", () => {
  const atas = [
    ata({ curso: "psicologia", data: "2026-07-20", pautas: ["nde-ppc", "nde-bibliografia"] }),
    ata({ curso: "psicologia", orgao: "COLEGIADO", data: "2026-08-01", pautas: ["col-autoavaliacao-curso"] }),
  ];
  const m = matrizConformidade(atas, { hoje: HOJE });
  assert.equal(m.emDia, 3);
  assert.ok(m.percentual > 0 && m.percentual < 100);

  const placar = placarPorCurso(atas, { hoje: HOJE });
  const psi = placar.find((c) => c.slug === "psicologia");
  assert.equal(psi.emDia, 3);
  assert.equal(placar[0].slug, "psicologia", "o curso mais em dia lidera o placar");
  assert.equal(placar.find((c) => c.slug === "direito").emDia, 0);
});

test("ata do ano passado não conta na janela de hoje", () => {
  const atas = [ata({ data: somaDias(HOJE, -400), pautas: ["nde-ppc"] })];
  assert.equal(matrizConformidade(atas, { hoje: HOJE }).emDia, 0);
});
