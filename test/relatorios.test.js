/* Relatório Semestral de Atividades — as contas.
   O que se protege aqui é o que o documento afirma: que semestre é esse,
   o que entra nele e de onde sai cada número. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SETORES_RELATORIO, dentroDoSemestre, panoramaAtas, panoramaEspacos,
  panoramaEventos, panoramaExtensao, panoramaIC, panoramaMonitoria, periodoDe,
  semestreDe, semestresDisponiveis, setorRelatorioDe, setoresDe,
} from "../lib/relatorios.js";

const CURSOS = [{ slug: "enfermagem", nome: "Enfermagem" }, { slug: "agronomia", nome: "Agronomia" }];
const P = periodoDe("2026/2");

/* -------------------------------- o semestre --------------------------- */

test("o semestre é civil e tem começo e fim explícitos", () => {
  assert.deepEqual(periodoDe("2026/1"), {
    chave: "2026/1", ano: 2026, semestre: 1,
    inicio: "2026-01-01", fim: "2026-06-30", rotulo: "1º semestre de 2026",
  });
  assert.equal(periodoDe("2026/2").inicio, "2026-07-01");
  assert.equal(periodoDe("2026/2").fim, "2026-12-31");
  assert.equal(periodoDe("2026/3"), null);
  assert.equal(periodoDe("lixo"), null);
});

test("a data cai no semestre certo, e a lista anda para trás", () => {
  assert.equal(semestreDe("2026-06-30"), "2026/1");
  assert.equal(semestreDe("2026-07-01"), "2026/2");
  assert.equal(semestreDe(""), "");
  const l = semestresDisponiveis("2026-08-19", 4);
  assert.deepEqual(l, ["2026/2", "2026/1", "2025/2", "2025/1"]);
});

test("entra o que ACONTECEU no semestre — atravessar conta nos dois", () => {
  const atravessa = { inicio: "2026-05-01", fim: "2026-08-30" };
  assert.ok(dentroDoSemestre(atravessa, "2026-01-01", "2026-06-30"));
  assert.ok(dentroDoSemestre(atravessa, "2026-07-01", "2026-12-31"));
  // encostar na borda conta; ficar fora, não
  assert.ok(dentroDoSemestre({ inicio: "2026-12-31", fim: "2027-02-01" }, "2026-07-01", "2026-12-31"));
  assert.ok(!dentroDoSemestre({ inicio: "2027-01-01", fim: "2027-02-01" }, "2026-07-01", "2026-12-31"));
  // com uma data só, é ela que decide
  assert.ok(dentroDoSemestre({ inicio: "2026-09-10" }, "2026-07-01", "2026-12-31"));
  assert.ok(!dentroDoSemestre({}, "2026-07-01", "2026-12-31"));
});

/* -------------------------------- extensão ----------------------------- */

const ACOES = [
  { status: "registrada", numeroAcao: "EXT-2026-001",
    proposta: { titulo: "Semana de Enfermagem", curso: "enfermagem", classificacao: "Projeto",
      responsavel: "Talita", periodoInicio: "2026-09-01", periodoFim: "2026-09-05",
      curricularizacao: { componentes: [{ ch: 20 }, { ch: 10 }] } },
    participantes: { inscritos: [{ nome: "a", presente: true }, { nome: "b" }] },
    relatorio: { entregueEm: "2026-10-01" },
    evento: { ativo: true } },
  { status: "aprovada", numeroAcao: "EXT-2026-002",
    proposta: { titulo: "Abril Laranja", curso: "agronomia", classificacao: "Curso Livre",
      responsavel: "Alexandre", periodoInicio: "2026-04-01", periodoFim: "2026-04-30" },
    participantes: { inscritos: [{ nome: "c" }] } },
];

test("a extensão conta ação, relatório, participante e hora curricularizada", () => {
  const p = panoramaExtensao(ACOES, P, { cursos: CURSOS });
  assert.equal(p.total, 1, "só a de setembro cai no 2º semestre");
  assert.equal(p.numeros.find((n) => /Relatórios/.test(n.rotulo)).valor, 1);
  assert.equal(p.numeros.find((n) => /Participantes/.test(n.rotulo)).valor, 2);
  assert.equal(p.numeros.find((n) => /curricularizadas/.test(n.rotulo)).valor, 30);
  assert.deepEqual(p.quadros[0].linhas, [{ rotulo: "Enfermagem", valor: 1 }]);
  assert.equal(p.itens[0].numero, "EXT-2026-001");
  // e a de abril aparece no 1º semestre
  assert.equal(panoramaExtensao(ACOES, periodoDe("2026/1"), { cursos: CURSOS }).total, 1);
});

test("os eventos só contam a ação que TEM evento", () => {
  const p = panoramaEventos(ACOES, P, { cursos: CURSOS });
  assert.equal(p.total, 1);
  assert.equal(p.numeros.find((n) => /Presenças/.test(n.rotulo)).valor, 1);
  assert.equal(panoramaEventos(ACOES, periodoDe("2026/1"), { cursos: CURSOS }).total, 0);
});

/* ---------------------------------- IC --------------------------------- */

test("a IC conta projeto vigente, aluno, bolsista e relatório validado", () => {
  const projetos = [
    { status: "aprovado", numero: "IC-2026-001", titulo: "Solos", curso: "agronomia",
      linha: "Iniciação Científica", inicio: "2026-09-01", fim: "2027-08-31",
      orientador: { nome: "Jadson" }, alunos: [{ nome: "Ana", bolsista: true }, { nome: "Bia" }],
      relatorios: [{ status: "validado" }, { status: "enviado" }] },
    { status: "rascunho", titulo: "não conta", inicio: "2026-09-01", fim: "2027-08-31" },
  ];
  const p = panoramaIC(projetos, P, { cursos: CURSOS });
  assert.equal(p.total, 1, "rascunho não entra em relatório de atividades");
  assert.equal(p.numeros.find((n) => /Acadêmicos/.test(n.rotulo)).valor, 2);
  assert.equal(p.numeros.find((n) => /Bolsistas/.test(n.rotulo)).valor, 1);
  assert.equal(p.numeros.find((n) => /validados/.test(n.rotulo)).valor, 1);
  assert.equal(p.itens[0].situacao, "Ana, Bia");
});

/* ------------------------------- monitoria ----------------------------- */

test("a monitoria conta as horas do jeito que o certificado conta", () => {
  const projetos = [{ status: "concluido", protocolo: "MON-2026-001", disciplina: "Semiologia",
    curso: "enfermagem", ciclo: "2026/2", inicio: "2026-09-16", fim: "2026-12-12", chSemanal: 4,
    orientador: { nome: "Talita" },
    monitores: [{ nome: "Marina", relatorio: { status: "homologado" } },
      { nome: "Pedro", relatorio: { status: "enviado" } }] }];
  const p = panoramaMonitoria(projetos, P, { cursos: CURSOS });
  assert.equal(p.total, 1);
  assert.equal(p.numeros.find((n) => /Monitores/.test(n.rotulo)).valor, 2);
  // 13 semanas × 4h × 2 monitores
  assert.equal(p.numeros.find((n) => /Horas/.test(n.rotulo)).valor, 104);
  assert.equal(p.numeros.find((n) => /homologados/.test(n.rotulo)).valor, 1);
});

/* ---------------------------------- atas ------------------------------- */

test("as atas contam sessão, registro, deliberação e participação", () => {
  const atas = [
    { status: "registrada", numero: "ATA-NDE-ENF-2026-003", orgao: "nde", orgaoNome: "NDE",
      curso: "enfermagem", secretaria: "Ana", sessao: { data: "2026-09-10" },
      participantes: [{}, {}, {}], pauta: [{ deliberacao: "aprovado" }, { deliberacao: "" }] },
    { status: "minuta", orgao: "nde", orgaoNome: "NDE", curso: "enfermagem",
      sessao: { data: "2026-11-05" }, participantes: [{}], pauta: [] },
    { status: "registrada", orgao: "cpa", orgaoNome: "CPA", sessao: { data: "2026-03-01" } },
  ];
  const p = panoramaAtas(atas, P, { cursos: CURSOS });
  assert.equal(p.total, 2, "a de março é do outro semestre");
  assert.equal(p.numeros.find((n) => /registradas/.test(n.rotulo)).valor, 1);
  assert.equal(p.numeros.find((n) => /Deliberações/.test(n.rotulo)).valor, 1);
  assert.equal(p.numeros.find((n) => /Participações/.test(n.rotulo)).valor, 3);
});

/* -------------------------------- espaços ------------------------------ */

test("os espaços contam só a reserva CONFIRMADA, e os dias que ela ocupa", () => {
  const reservas = [
    { status: "confirmada", protocolo: "RES-2026-001", atividade: "CONINT", orgao: "Institucional",
      dataInicio: "2026-10-19", dataFim: "2026-10-23", espacos: [{ espaco: "auditorio-bloco-a" }],
      solicitante: { nome: "Raiane" } },
    { status: "solicitada", atividade: "não conta", dataInicio: "2026-10-01", espacos: [] },
  ];
  const p = panoramaEspacos(reservas, P, { espacos: [{ id: "auditorio-bloco-a", nome: "Auditório" }] });
  assert.equal(p.total, 1);
  assert.equal(p.numeros.find((n) => /Dias/.test(n.rotulo)).valor, 5);
  assert.equal(p.quadros[0].linhas[0].rotulo, "Auditório");
});

/* ------------------------------- catálogo ------------------------------ */

test("cada setor do relatório aponta para o módulo que o autoriza", () => {
  assert.equal(SETORES_RELATORIO.length, 6);
  assert.equal(setorRelatorioDe("monitoria").modulo, "monitoria");
  assert.equal(setorRelatorioDe("inexistente"), null);
  // o gestor geral relata tudo; o coordenador, só o que coordena
  assert.equal(setoresDe({ papel: "gestor", modulos: [] }).length, 6);
  assert.deepEqual(setoresDe({ papel: "aprovado", modulos: ["atas"] }).map((s) => s.chave), ["atas"]);
  assert.deepEqual(setoresDe({ papel: "aprovado", modulos: [] }), []);
});
