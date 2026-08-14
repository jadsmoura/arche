/* Testes da Pauta Regulatória: competência exclusiva de cada órgão, ciclo
   semestral de sessões ordinárias e cálculo de conformidade. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PAUTAS, MOMENTOS, CADENCIAS, RITUAL, ritualDe, pautaDe, pautasDoOrgao,
  janelaDe, fimDaJanela, numeroDoSemestre, cobradaNoSemestre,
  situacaoPautas, checklistSemestral, ritualDoOrgao, pautasSugeridas,
  matrizConformidade, placarPorCurso, ciclosDoSemestre, proximosPrazos,
} from "../lib/pautas.js";
import { ORGAOS, CURSOS, normalizarAta, numerar } from "../lib/atas.js";
import { somaDias } from "../lib/datas.js";

/* ------------------------------- catálogo ------------------------------- */
test("catálogo é íntegro e cada pauta tem um único órgão", () => {
  const ids = PAUTAS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  const codigos = new Set(ORGAOS.map((o) => o.codigo));
  for (const p of PAUTAS) {
    assert.equal(typeof p.orgao, "string", `${p.id} deve ter um órgão único`);
    assert.ok(codigos.has(p.orgao), `${p.id} aponta para órgão inexistente: ${p.orgao}`);
    assert.ok(MOMENTOS[p.momento], `${p.id} com momento inválido`);
    assert.ok(CADENCIAS[p.cadencia], `${p.id} com cadência inválida`);
    if (p.cadencia === "anual") assert.ok([1, 2].includes(p.semestre), `${p.id} anual sem semestre definido`);
    else assert.equal(p.semestre, undefined, `${p.id} semestral não deve fixar semestre`);
    assert.ok(["curso", "institucional"].includes(p.escopo), `${p.id} com escopo inválido`);
    assert.ok(p.titulo && p.porque && p.evidencia, `${p.id} sem texto completo`);
    assert.ok(p.refs.length, `${p.id} sem indicador do instrumento`);
    for (const r of p.refs) {
      assert.ok(["curso", "ies"].includes(r.inst));
      assert.match(r.num, /^\d+\.\d+$/, `${p.id}: número estranho ${r.num}`);
      assert.ok(r.nivel >= 1 && r.nivel <= 5);
    }
  }
});

test("o momento declarado cabe no ritual do órgão", () => {
  for (const p of PAUTAS) {
    const r = ritualDe(p.orgao);
    assert.ok(r.momentos.includes(p.momento),
      `${p.id}: momento "${p.momento}" não existe no ciclo de ${p.orgao} (${r.momentos.join(", ")})`);
  }
});

test("órgãos de duas sessões usam abertura E encerramento; os de uma usam livre", () => {
  for (const [cod, r] of Object.entries(RITUAL)) {
    const ps = pautasDoOrgao(cod);
    if (!ps.length) continue;
    if (r.ordinarias >= 2) {
      assert.ok(ps.some((p) => p.momento === "abertura"), `${cod} sem pauta de abertura`);
      assert.ok(ps.some((p) => p.momento === "encerramento"), `${cod} sem pauta de encerramento`);
    } else {
      assert.ok(ps.every((p) => p.momento === "livre"), `${cod} tem uma sessão só, momento deve ser livre`);
    }
  }
});

test("competências não se misturam: currículo é do NDE, gestão é do colegiado", () => {
  const nde = pautasDoOrgao("NDE").map((p) => p.id);
  const col = pautasDoOrgao("COLEGIADO").map((p) => p.id);
  assert.equal(nde.filter((x) => col.includes(x)).length, 0, "nenhuma pauta pode estar nos dois");
  for (const id of ["nde-ppc", "nde-perfil-egresso", "nde-bibliografia", "nde-estrutura"]) {
    assert.ok(nde.includes(id), `${id} deveria ser do NDE`);
  }
  for (const id of ["col-planejamento", "col-autoavaliacao-curso", "col-desempenho-colegiado", "col-laboratorios"]) {
    assert.ok(col.includes(id), `${id} deveria ser do colegiado`);
  }
  // a autoavaliação institucional é exclusiva da CPA
  const daCpa = PAUTAS.filter((p) => p.refs.some((r) => r.inst === "ies" && r.num.startsWith("1.")));
  assert.ok(daCpa.every((p) => p.orgao === "CPA" || p.orgao === "CONSU"),
    "indicadores do Eixo 1 só cabem à CPA (ou ao CONSU, no caso do PDI)");
});

test("os indicadores-chave dos instrumentos estão cobertos", () => {
  const refs = new Set(PAUTAS.flatMap((p) => p.refs.map((r) => `${r.inst} ${r.num}`)));
  for (const chave of ["curso 2.1", "curso 2.12", "curso 1.13", "curso 3.6", "ies 1.5", "ies 4.5"]) {
    assert.ok(refs.has(chave), `indicador central ausente: ${chave}`);
  }
});

test("pautaDe encontra pelo id e ignora o desconhecido", () => {
  assert.equal(pautaDe("nde-ppc").orgao, "NDE");
  assert.equal(pautaDe("nao-existe"), null);
});

/* ------------------------------- janelas -------------------------------- */
test("a janela é sempre o semestre civil", () => {
  assert.equal(janelaDe("2026-01-01"), "2026-S1");
  assert.equal(janelaDe("2026-06-30"), "2026-S1");
  assert.equal(janelaDe("2026-07-01"), "2026-S2");
  assert.equal(janelaDe("2026-12-31"), "2026-S2");
  assert.equal(fimDaJanela("2026-02-10"), "2026-06-30");
  assert.equal(fimDaJanela("2026-08-10"), "2026-12-31");
  assert.equal(numeroDoSemestre("2026-08-10"), 2);
  assert.equal(janelaDe("13/08/2026"), null);
});

test("a semestral é cobrada sempre; a anual só no semestre dela", () => {
  const sem = { cadencia: "semestral" };
  assert.ok(cobradaNoSemestre(sem, "2026-03-01"));
  assert.ok(cobradaNoSemestre(sem, "2026-09-01"));
  const anual2 = { cadencia: "anual", semestre: 2 };
  assert.equal(cobradaNoSemestre(anual2, "2026-03-01"), false);
  assert.equal(cobradaNoSemestre(anual2, "2026-09-01"), true);
});

/* ------------------------------ fixtura --------------------------------- */
const HOJE = "2026-08-14";           // 2026-S2
function ata({ orgao = "NDE", curso = "psicologia", data = HOJE, status = "registrada",
  tipo = "ordinária", pautas = [] } = {}) {
  return numerar([], normalizarAta({
    orgao, curso,
    sessao: { data, horaInicio: "14:00", local: "Sala 1", tipo },
    presidencia: { nome: "Presidente" }, secretaria: { nome: "Secretário" },
    participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
    pauta: pautas.map((id) => ({ titulo: "Ponto " + id, pautaMec: id, deliberacao: "Aprovado." })),
    status,
  }));
}
const noNde = (atas, id, hoje = HOJE) =>
  situacaoPautas(atas, { orgao: "NDE", curso: "psicologia", hoje }).find((p) => p.id === id);

/* --------------------------- ata retroativa ----------------------------- */
test("o checklist de uma sessão passada não conta o que só foi registrado depois", () => {
  // O NDE tratou o PPC em junho; agora se lavra a ata da sessão de março do
  // mesmo semestre. Para março, o tema ainda não estava cumprido — e é
  // justamente ali que o responsável precisa poder marcá-lo.
  const junho = ata({ data: "2026-06-20", pautas: ["nde-ppc"] });

  const emJunho = noNde([junho], "nde-ppc", "2026-06-20");
  assert.equal(emJunho.estado, "em-dia", "na data do registro, o tema está cumprido");

  const emMarco = noNde([junho], "nde-ppc", "2026-03-15");
  assert.notEqual(emMarco.estado, "em-dia",
    "para a sessão de março, o registro de junho ainda não existia");
  assert.equal(emMarco.registrosNaJanela, 0);
  assert.equal(emMarco.ultima, null, "e não se cita como prova uma ata do futuro daquela sessão");
});

test("o que já estava registrado antes da sessão continua contando", () => {
  const marco = ata({ data: "2026-03-10", pautas: ["nde-ppc"] });
  const emJunho = noNde([marco], "nde-ppc", "2026-06-20");
  assert.equal(emJunho.estado, "em-dia", "o registro anterior vale para a sessão posterior");
  assert.equal(emJunho.ultima?.data, "2026-03-10");
});

test("no uso corrente o corte por data não muda nada", () => {
  // ata de hoje e ata de meses atrás: as duas continuam contando hoje
  const atas = [ata({ data: "2026-07-01", pautas: ["nde-ppc"] }), ata({ data: HOJE, pautas: ["nde-bibliografia"] })];
  assert.equal(noNde(atas, "nde-ppc").estado, "em-dia");
  assert.equal(noNde(atas, "nde-bibliografia").estado, "em-dia");
  const ck = checklistSemestral(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.ok(ck.emDia >= 2, `${ck.emDia} tema(s) em dia`);
});

test("o catálogo do órgão inteiro fica ao alcance de quem registra, cobrado ou não", () => {
  // A tela oferece todas as pautas do órgão: as cobradas no semestre em
  // destaque e as demais num bloco à parte. Nenhuma some — sessão pode ter
  // tratado tema anual do outro semestre, e a ata precisa poder dizer isso.
  const doNde = situacaoPautas([], { orgao: "NDE", curso: "psicologia", hoje: "2026-03-15" });
  const cobradas = doNde.filter((p) => p.exigidaAgora);
  const outras = doNde.filter((p) => !p.exigidaAgora);
  assert.ok(cobradas.length, "há temas cobrados no semestre");
  assert.ok(outras.length, "e há temas anuais do outro semestre");
  assert.equal(cobradas.length + outras.length, doNde.length, "juntos, são o catálogo inteiro do órgão");
  assert.ok(outras.every((p) => p.cadencia === "anual"),
    "só cai fora da janela o que é anual do outro semestre");
});

/* ------------------------ ciclo de sessões ordinárias ------------------- */
test("o ciclo do NDE exige duas sessões ordinárias por semestre", () => {
  const vazio = ritualDoOrgao([], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(vazio.exigidas, 2);
  assert.equal(vazio.ordinarias, 0);
  assert.equal(vazio.faltam, 2);
  assert.equal(vazio.completo, false);
  assert.equal(vazio.proximoMomento, "abertura");

  const uma = ritualDoOrgao([ata({ data: "2026-08-01" })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(uma.ordinarias, 1);
  assert.equal(uma.faltam, 1);
  assert.equal(uma.proximoMomento, "encerramento", "a segunda sessão do ciclo é a de encerramento");

  const duas = ritualDoOrgao([ata({ data: "2026-08-01" }), ata({ data: "2026-11-20" })],
    { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(duas.completo, true);
  assert.equal(duas.faltam, 0);
});

test("sessão extraordinária não fecha o ciclo, mas é contada à parte", () => {
  const r = ritualDoOrgao([ata({ tipo: "extraordinária" })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(r.ordinarias, 0);
  assert.equal(r.extraordinarias, 1);
  assert.equal(r.completo, false, "extraordinária não substitui a ordinária do ciclo");
});

test("os temas tratados numa extraordinária contam como registro", () => {
  const atas = [ata({ tipo: "extraordinária", pautas: ["nde-ppc"] })];
  assert.equal(noNde(atas, "nde-ppc").estado, "em-dia",
    "se o tema foi debatido e registrado, ele foi debatido — independe do tipo da sessão");
});

test("órgãos institucionais exigem uma sessão ordinária por semestre", () => {
  assert.equal(ritualDoOrgao([], { orgao: "CONSU", hoje: HOJE }).exigidas, 1);
  assert.equal(ritualDoOrgao([], { orgao: "CPA", hoje: HOJE }).exigidas, 2);
});

/* ------------------------------ conformidade ---------------------------- */
test("pauta nunca tratada aparece como 'nunca'", () => {
  assert.equal(noNde([], "nde-ppc").estado, "nunca");
  assert.equal(noNde([], "nde-ppc").ultima, null);
});

test("ata registrada no semestre corrente coloca a pauta em dia", () => {
  const p = noNde([ata({ data: "2026-07-20", pautas: ["nde-ppc"] })], "nde-ppc");
  assert.equal(p.estado, "em-dia");
  assert.equal(p.janela, "2026-S2");
  assert.equal(p.ultima.data, "2026-07-20");
});

test("pauta semestral tratada no semestre anterior volta a pendente", () => {
  const p = noNde([ata({ data: "2026-03-10", pautas: ["nde-ppc"] })], "nde-ppc");
  assert.equal(p.estado, "pendente");
  assert.equal(p.ultima.data, "2026-03-10");
});

test("pauta anual não é cobrada fora do semestre dela", () => {
  const anual2 = PAUTAS.find((p) => p.orgao === "NDE" && p.cadencia === "anual" && p.semestre === 2);
  const anual1 = PAUTAS.find((p) => p.orgao === "NDE" && p.cadencia === "anual" && p.semestre === 1);
  assert.equal(noNde([], anual2.id, "2026-08-14").exigidaAgora, true);
  assert.equal(noNde([], anual2.id, "2026-03-14").estado, "fora-da-janela");
  assert.equal(noNde([], anual1.id, "2026-08-14").estado, "fora-da-janela");
});

test("perto do fim do semestre a pauta passa a 'vencendo'", () => {
  const atas = [ata({ data: "2026-03-10", pautas: ["nde-ppc"] })];
  const p = noNde(atas, "nde-ppc", "2026-12-10");
  assert.equal(p.estado, "vencendo");
  assert.ok(p.diasRestantes <= 45);
});

test("só ata REGISTRADA vale como prova", () => {
  for (const status of ["rascunho", "minuta"]) {
    assert.equal(noNde([ata({ status, pautas: ["nde-ppc"] })], "nde-ppc").estado, "nunca",
      `${status} ainda pode mudar — não conta como prova`);
  }
  // situações do fluxo antigo migram para minuta e, portanto, também não contam
  assert.equal(noNde([ata({ status: "aprovada", pautas: ["nde-ppc"] })], "nde-ppc").estado, "nunca");
  assert.equal(noNde([ata({ status: "registrada", pautas: ["nde-ppc"] })], "nde-ppc").estado, "em-dia");
});

test("o crédito não atravessa cursos nem órgãos", () => {
  const outroCurso = [ata({ curso: "enfermagem", pautas: ["nde-ppc"] })];
  assert.equal(noNde(outroCurso, "nde-ppc").estado, "nunca");
  assert.equal(situacaoPautas(outroCurso, { orgao: "NDE", curso: "enfermagem", hoje: HOJE })
    .find((p) => p.id === "nde-ppc").estado, "em-dia");

  // o colegiado não tem a pauta do NDE no seu catálogo
  const doColegiado = situacaoPautas([], { orgao: "COLEGIADO", curso: "psicologia", hoje: HOJE });
  assert.ok(!doColegiado.some((p) => p.id === "nde-ppc"), "pauta do NDE não aparece no colegiado");
});

/* ------------------------------- checklist ------------------------------ */
test("checklist conta só o que é cobrado no semestre", () => {
  const ck = checklistSemestral([], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  const cobradas = ck.pautas.filter((p) => p.exigidaAgora).length;
  assert.equal(ck.exigidas, cobradas);
  assert.ok(cobradas < ck.pautas.length, "as anuais do 1º semestre ficam de fora em agosto");
  assert.equal(ck.emDia, 0);
  assert.equal(ck.percentual, 0);
});

test("checklist chega a 100% quando tudo que vence foi registrado", () => {
  const ck0 = checklistSemestral([], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  const ids = ck0.pautas.filter((p) => p.exigidaAgora).map((p) => p.id);
  const ck = checklistSemestral([ata({ pautas: ids })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(ck.percentual, 100);
  assert.equal(ck.emDia, ck.exigidas);
});

/* ------------------------------- sugestões ------------------------------ */
test("sugestões trazem só o que falta e priorizam o momento do ciclo", () => {
  const sug = pautasSugeridas([], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(sug[0].momento, "abertura", "sem nenhuma sessão, a próxima é a de abertura");
  assert.ok(sug.every((p) => p.exigidaAgora), "não sugerir o que não vence neste semestre");

  const comUma = pautasSugeridas([ata({ data: "2026-08-01" })], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(comUma[0].momento, "encerramento", "com uma sessão feita, a próxima puxa o encerramento");
});

test("o que já está em dia não é sugerido", () => {
  const sug = pautasSugeridas([ata({ data: "2026-07-20", pautas: ["nde-ppc"] })],
    { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.ok(!sug.some((p) => p.id === "nde-ppc"));
});

test("próximos prazos respeitam a janela de dias pedida", () => {
  assert.ok(proximosPrazos([], { orgao: "NDE", curso: "psicologia", hoje: "2026-12-01", dias: 60 }).length);
  assert.equal(proximosPrazos([], { orgao: "NDE", curso: "psicologia", hoje: "2026-01-05", dias: 10 }).length, 0);
});

/* ------------------------- visão da PROPPEX ----------------------------- */
test("matriz cobre o catálogo e ignora o que não vence no semestre", () => {
  const m = matrizConformidade([], { hoje: HOJE });
  assert.equal(m.linhas.length, PAUTAS.length, "uma linha por pauta — não há mais duplicação por órgão");
  assert.equal(m.janela, "2026-S2");
  assert.equal(m.emDia, 0);
  const foraDaJanela = m.linhas.filter((l) => !l.exigidaAgora);
  assert.ok(foraDaJanela.length, "as anuais do 1º semestre não entram na conta em agosto");
  assert.equal(foraDaJanela.every((l) => l.total === 0), true);
  assert.equal(m.linhas.find((l) => l.pauta === "nde-ppc").total, CURSOS.length);
  assert.equal(m.linhas.find((l) => l.pauta === "cpa-divulgacao").total, 1);
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
  assert.equal(placar[0].slug, "psicologia");
  assert.equal(psi.sessoesFaltando, 2, "faltam a 2ª do NDE e a 2ª do colegiado");
  assert.equal(placar.find((c) => c.slug === "direito").emDia, 0);
});

test("ciclos do semestre listam todo órgão com sessão obrigatória", () => {
  const c = ciclosDoSemestre([], { hoje: HOJE });
  const comCiclo = Object.entries(RITUAL).filter(([, r]) => r.ordinarias);
  const porCurso = CURSOS.length * 2;                       // NDE e Colegiado
  const institucionais = comCiclo.length - 2;
  assert.equal(c.length, porCurso + institucionais);
  assert.ok(c.every((x) => !x.completo));
  const nde = c.find((x) => x.orgao === "NDE" && x.curso === "psicologia");
  assert.equal(nde.exigidas, 2);
});

test("ata do ano passado não conta na janela de hoje", () => {
  const atas = [ata({ data: somaDias(HOJE, -400), pautas: ["nde-ppc"] })];
  assert.equal(matrizConformidade(atas, { hoje: HOJE }).emDia, 0);
});

/* -------------------- regularização retroativa -------------------------- */
test("o checklist de uma sessão antiga é o daquele semestre, não o de hoje", () => {
  // ata de 2025-S1 tratando um tema que só é cobrado no 1º semestre
  const anual1 = PAUTAS.find((p) => p.orgao === "NDE" && p.cadencia === "anual" && p.semestre === 1);
  const antiga = ata({ data: "2025-03-20", pautas: [anual1.id] });

  // olhando de hoje (2026-S2), o tema nem é cobrado
  assert.equal(situacaoPautas([antiga], { orgao: "NDE", curso: "psicologia", hoje: HOJE })
    .find((p) => p.id === anual1.id).estado, "fora-da-janela");

  // olhando da data da sessão, ele está em dia — foi o que a ata regularizou
  const naEpoca = situacaoPautas([antiga], { orgao: "NDE", curso: "psicologia", hoje: "2025-03-20" })
    .find((p) => p.id === anual1.id);
  assert.equal(naEpoca.estado, "em-dia");
  assert.equal(naEpoca.janela, "2025-S1");
});

test("atas retroativas fecham o ciclo do semestre a que pertencem", () => {
  const atas = [ata({ data: "2025-03-10" }), ata({ data: "2025-05-20" })];
  const passado = ritualDoOrgao(atas, { orgao: "NDE", curso: "psicologia", hoje: "2025-06-01" });
  assert.equal(passado.completo, true, "as duas sessões de 2025-S1 fecham aquele ciclo");
  const agora = ritualDoOrgao(atas, { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(agora.completo, false, "e não contam para o semestre corrente");
});

test("a numeração retroativa respeita a série do ano da sessão", () => {
  const atas = [];
  for (const data of ["2024-04-10", "2024-09-12", "2025-03-05"]) {
    atas.push(numerar(atas, normalizarAta({
      orgao: "NDE", curso: "psicologia",
      sessao: { data, horaInicio: "14:00", local: "Sala 1" },
      presidencia: { nome: "P" }, secretaria: { nome: "S" },
      participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
      pauta: [{ titulo: "Ponto" }], status: "registrada",
    })));
  }
  assert.deepEqual(atas.map((a) => a.numero),
    ["ATA-NDE-PSI-2024-001", "ATA-NDE-PSI-2024-002", "ATA-NDE-PSI-2025-001"]);
});

/* --------------------- órgãos sem pauta regulatória --------------------- */
test("órgão não previsto não tem checklist nem entra no ciclo obrigatório", () => {
  for (const cod of ["OUTRO_CURSO", "OUTRO", "COMISSAO"]) {
    assert.equal(pautasDoOrgao(cod).length, 0, `${cod} não deve ter pauta do INEP`);
    assert.equal(ritualDe(cod).ordinarias, 0, `${cod} não deve exigir sessão`);
    const ck = checklistSemestral([], { orgao: cod, curso: "direito", hoje: HOJE });
    assert.equal(ck.exigidas, 0);
    assert.equal(ck.percentual, 100, "sem obrigação, o checklist está completo por definição");
    assert.equal(ck.ritual.completo, true);
  }
  assert.ok(!ciclosDoSemestre([], { hoje: HOJE }).some((c) => c.orgao === "OUTRO"),
    "não entra no acompanhamento de ciclos da PROPPEX");
});

/* ---------------- checkpoints compartilhados dentro do órgão ------------ */
test("o que um colega registrou conta para todos do mesmo órgão e curso", () => {
  // Pessoa A lavra a 1ª ata do NDE de Agronomia e marca duas pautas
  const daPessoaA = { ...ata({ curso: "agronomia", data: "2026-08-03", pautas: ["nde-ppc", "nde-bibliografia"] }),
    criadoPor: "pessoa.a@uniego.edu.br" };

  // Pessoa B, ao abrir a 2ª ata do MESMO órgão, vê os dois temas cumpridos
  const ck = checklistSemestral([daPessoaA], { orgao: "NDE", curso: "agronomia", hoje: HOJE });
  const emDia = ck.pautas.filter((p) => p.estado === "em-dia").map((p) => p.id);
  assert.deepEqual(emDia.sort(), ["nde-bibliografia", "nde-ppc"]);
  assert.equal(ck.emDia, 2, "o checklist é do órgão, não de quem lavrou");
  assert.equal(ck.ritual.ordinarias, 1, "e a sessão de A conta no ciclo do órgão");

  // o rastro aponta a ata de A, para que B saiba onde o tema foi tratado
  const ppc = ck.pautas.find((p) => p.id === "nde-ppc");
  assert.equal(ppc.ultima.numero, daPessoaA.numero);
  assert.equal(ppc.ultima.data, "2026-08-03");

  // e nada disso vaza para outro curso
  const outro = checklistSemestral([daPessoaA], { orgao: "NDE", curso: "psicologia", hoje: HOJE });
  assert.equal(outro.emDia, 0);
});

test("as sugestões de B não repetem o que A já registrou", () => {
  const daPessoaA = ata({ curso: "agronomia", data: "2026-08-03", pautas: ["nde-ppc", "nde-bibliografia"] });
  const sug = pautasSugeridas([daPessoaA], { orgao: "NDE", curso: "agronomia", hoje: HOJE }).map((p) => p.id);
  assert.ok(!sug.includes("nde-ppc"));
  assert.ok(!sug.includes("nde-bibliografia"));
  assert.ok(sug.length, "o que falta continua sendo sugerido");
});
