/* Testes do núcleo da Iniciação Científica: numeração, normalização,
   validação, quem vê o quê e os recortes do cronograma e dos relatórios.
   Nada aqui toca em rede ou armazenamento. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MODALIDADES, STATUS, numeroProjeto, proximoSequencial, numerar,
  normalizarProjeto, validarProjeto, papelNoProjeto, podeVerProjeto, podeEditarProjeto,
  podeGerirExecucao, podeAvaliar, podeEnviarRelatorio, podeValidarRelatorio,
  cronogramaDe, etapaAtrasada, relatoriosDe, relatoriosPendentes, resumir, anotar,
} from "../lib/ic.js";

/* -------------------------------- fixtura ------------------------------- */
const PROF = { email: "renata@uniego.edu.br", gestao: false };
const ALUNO = { email: "marcos@uniego.edu.br", gestao: false };
const ALUNO2 = { email: "beatriz@uniego.edu.br", gestao: false };
const ALHEIO = { email: "alheio@uniego.edu.br", gestao: false };
const PROPPEX = { email: "proppex@uniego.edu.br", gestao: true };

function bruto(extra = {}) {
  return {
    titulo: "Micorrizas e produtividade do milho no Cerrado",
    resumo: "Investiga a relação entre colonização micorrízica e produtividade do milho em solos do Cerrado goiano. ".repeat(2),
    curso: "agronomia", modalidade: "pibic", edital: "PIBIC 01/2026",
    objetivos: "Quantificar a colonização.", metodologia: "Blocos casualizados.",
    orientador: { nome: "Profa. Renata", email: PROF.email, titulacao: "Doutora" },
    alunos: [{ nome: "Marcos", email: ALUNO.email, matricula: "2024001", bolsista: true }],
    cronograma: [
      { atividade: "Revisão bibliográfica", responsavel: ALUNO.email, inicio: "2026-08-01", fim: "2026-09-30" },
      { atividade: "Análise dos dados", responsavel: "", inicio: "2027-01-05", fim: "2027-03-31" },
    ],
    ...extra,
  };
}
const novo = (extra) => normalizarProjeto(bruto(extra), { autor: PROF.email });
const emExecucao = (extra) => ({ ...novo(extra), status: "aprovado", numero: "IC-2026-001" });

/* ------------------------------- numeração ------------------------------ */
test("o protocolo segue IC-ANO-SEQ e não se repete", () => {
  assert.equal(numeroProjeto({ ano: 2026, sequencial: 7 }), "IC-2026-007");
  const lista = [{ numero: "IC-2026-001", ano: 2026 }, { numero: "IC-2026-002", ano: 2026 }, { numero: "IC-2025-009", ano: 2025 }];
  assert.equal(proximoSequencial(lista, 2026), 3, "a série é por ano");
  assert.equal(proximoSequencial(lista, 2027), 1);
});

test("numerar só emite uma vez; rascunho não consome a sequência", () => {
  const p = numerar([], { ...novo(), ano: 2026 });
  assert.equal(p.numero, "IC-2026-001");
  assert.equal(numerar([p], p).numero, "IC-2026-001", "não renumera quem já tem número");
  // um rascunho sem número no meio não altera a contagem
  assert.equal(numerar([p, { ...novo(), ano: 2026 }], { ...novo(), ano: 2026 }).numero, "IC-2026-002");
});

/* ----------------------------- normalização ----------------------------- */
test("os campos de controle vêm do que está gravado, não do navegador", () => {
  const base = { ...novo(), id: "ic-1", numero: "IC-2026-001", status: "aprovado", criadoPor: PROF.email, criadoEm: "2026-01-01T00:00:00.000Z" };
  const p = normalizarProjeto(
    { ...bruto(), id: "outro", numero: "IC-2026-999", status: "concluido", criadoPor: ALHEIO.email, relatorios: [{ tipo: "final" }] },
    { base, autor: ALHEIO.email },
  );
  assert.equal(p.id, "ic-1");
  assert.equal(p.numero, "IC-2026-001", "o número não vem do formulário");
  assert.equal(p.status, "aprovado", "a situação não vem do formulário");
  assert.equal(p.criadoPor, PROF.email, "a autoria não muda");
  assert.deepEqual(p.relatorios, [], "relatório não entra pela proposta");
});

test("normalização limpa listas e aceita só valores conhecidos", () => {
  const p = normalizarProjeto(bruto({
    modalidade: "inventada",
    alunos: [{ nome: "", email: "" }, { nome: "Marcos", email: "MARCOS@Uniego.edu.BR" }],
    cronograma: [{ atividade: "", inicio: "2026-01-01" }, { atividade: "Coleta", inicio: "hoje", fim: "2026-03-01", situacao: "voando" }],
  }), { autor: PROF.email });
  assert.equal(p.modalidade, "pibic", "modalidade desconhecida cai no padrão");
  assert.equal(p.alunos.length, 1, "aluno vazio sai da lista");
  assert.equal(p.alunos[0].email, "marcos@uniego.edu.br", "e-mail vai para minúsculas");
  assert.equal(p.cronograma.length, 1, "atividade sem nome sai da lista");
  assert.equal(p.cronograma[0].inicio, "", "data inválida vira vazio");
  assert.equal(p.cronograma[0].situacao, "prevista");
  assert.ok(p.cronograma[0].id, "toda atividade ganha id");
});

/* ------------------------------- validação ------------------------------ */
test("projeto completo passa; rascunho incompleto é barrado na submissão", () => {
  assert.deepEqual(validarProjeto(novo()), []);
  const erros = validarProjeto(normalizarProjeto({}, { autor: PROF.email })).join(" ").toLowerCase();
  for (const t of ["título", "resumo", "curso", "orienta", "objetivos", "metodologia", "cronograma"]) {
    assert.ok(erros.includes(t), `faltou cobrar "${t}" em: ${erros}`);
  }
});

test("a validação cobra prazos coerentes e e-mail de cada aluno indicado", () => {
  const semData = novo({ cronograma: [{ atividade: "Coleta", inicio: "", fim: "" }] });
  assert.ok(validarProjeto(semData).some((e) => /início e fim/.test(e)));

  const invertido = novo({ cronograma: [{ atividade: "Coleta", inicio: "2026-10-01", fim: "2026-08-01" }] });
  assert.ok(validarProjeto(invertido).some((e) => /antes de começar/.test(e)));

  const semEmail = novo({ alunos: [{ nome: "Marcos", email: "" }] });
  assert.ok(validarProjeto(semEmail).some((e) => /e-mail/.test(e)),
    "sem e-mail o aluno nunca acessaria o próprio plano de trabalho");
});

/* ------------------------------ permissões ------------------------------ */
test("cada um tem o seu papel no projeto, e quem é de fora não vê nada", () => {
  const p = novo();
  assert.equal(papelNoProjeto(PROF, p), "orientador");
  assert.equal(papelNoProjeto(ALUNO, p), "aluno");
  assert.equal(papelNoProjeto(PROPPEX, p), "gestao");
  assert.equal(papelNoProjeto(ALHEIO, p), null);
  assert.equal(podeVerProjeto(ALHEIO, p), false);
  for (const u of [PROF, ALUNO, PROPPEX]) assert.equal(podeVerProjeto(u, p), true);
});

test("quem coordena e também orienta age como orientador no próprio projeto", () => {
  const p = novo({ orientador: { nome: "Pró-reitor", email: PROPPEX.email } });
  assert.equal(papelNoProjeto(PROPPEX, p), "orientador");
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "submetido" }), false,
    "ninguém avalia o próprio projeto");
});

test("a proposta fecha ao ser submetida; cronograma e alunos seguem com a orientação", () => {
  const rascunho = novo();
  assert.equal(podeEditarProjeto(PROF, rascunho), true);
  assert.equal(podeEditarProjeto(ALUNO, rascunho), false, "aluno não edita a proposta");

  const submetido = { ...rascunho, status: "submetido" };
  assert.equal(podeEditarProjeto(PROF, submetido), false);
  assert.equal(podeGerirExecucao(PROF, submetido), true);
  assert.equal(podeGerirExecucao(ALUNO, submetido), false);

  const devolvido = { ...rascunho, status: "devolvido" };
  assert.equal(podeEditarProjeto(PROF, devolvido), true, "devolvido volta a ser editável");
});

test("só a gestão avalia, e só projeto submetido", () => {
  const p = novo();
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "submetido" }), true);
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "aprovado" }), false, "não se reavalia o aprovado");
  assert.equal(podeAvaliar(PROF, { ...p, status: "submetido" }), false);
});

test("relatório: o aluno indicado envia, a orientação valida", () => {
  const p = emExecucao();
  assert.equal(podeEnviarRelatorio(ALUNO, p), true);
  assert.equal(podeEnviarRelatorio(PROF, p), false, "a orientação não escreve pelo aluno");
  assert.equal(podeEnviarRelatorio(ALUNO, { ...p, status: "submetido" }), false,
    "sem aprovação não há relatório");
  assert.equal(podeValidarRelatorio(PROF, p), true);
  assert.equal(podeValidarRelatorio(PROPPEX, p), true);
  assert.equal(podeValidarRelatorio(ALUNO, p), false, "ninguém valida o próprio relatório");
});

/* ------------------------------ cronograma ------------------------------ */
test("o cronograma junta os projetos, mas o aluno só vê o plano dele", () => {
  const a = { ...emExecucao(), id: "p1" };
  // projeto de outra orientação, com outro aluno: é o que separa os recortes
  const b = {
    ...emExecucao({
      orientador: { nome: "Prof. Caio", email: "caio@uniego.edu.br" },
      alunos: [{ nome: "Beatriz", email: ALUNO2.email }],
      cronograma: [{ atividade: "Montagem das leiras", responsavel: ALUNO2.email, inicio: "2026-09-01", fim: "2026-10-31" }],
    }), id: "p2", numero: "IC-2026-002", criadoPor: "caio@uniego.edu.br",
  };

  assert.equal(cronogramaDe([a, b], PROF).length, 2, "quem orienta vê o seu projeto inteiro, não o do colega");
  const doAluno = cronogramaDe([a, b], ALUNO);
  assert.equal(doAluno.length, 1, "o aluno vê só a atividade sob a responsabilidade dele");
  assert.equal(doAluno[0].atividade, "Revisão bibliográfica");
  assert.equal(doAluno[0].meu, true);
  assert.equal(cronogramaDe([a, b], ALUNO2).length, 1);
  assert.equal(cronogramaDe([a, b], ALHEIO).length, 0);
  assert.equal(cronogramaDe([a, b], PROPPEX).length, 3, "a gestão vê tudo");

  const ordenado = cronogramaDe([a, b], PROPPEX).map((e) => e.inicio);
  assert.deepEqual(ordenado, [...ordenado].sort(), "as atividades saem em ordem de início");
});

test("atraso é fato da data, não campo preenchido à mão", () => {
  assert.equal(etapaAtrasada({ fim: "2026-01-01", situacao: "prevista" }, "2026-06-01"), true);
  assert.equal(etapaAtrasada({ fim: "2026-01-01", situacao: "concluida" }, "2026-06-01"), false);
  assert.equal(etapaAtrasada({ fim: "", situacao: "prevista" }, "2026-06-01"), false);
});

/* ------------------------------ relatórios ------------------------------ */
test("faltam um parcial e um final por aluno; devolvido volta a faltar", () => {
  const p = emExecucao({ alunos: [{ nome: "Marcos", email: ALUNO.email }, { nome: "Beatriz", email: ALUNO2.email }] });
  assert.equal(relatoriosPendentes(p).length, 4, "dois alunos × parcial e final");

  const comParcial = { ...p, relatorios: [{ tipo: "parcial", aluno: ALUNO.email, situacao: "validado" }] };
  assert.equal(relatoriosPendentes(comParcial).length, 3);

  const devolvido = { ...p, relatorios: [{ tipo: "parcial", aluno: ALUNO.email, situacao: "devolvido" }] };
  assert.equal(relatoriosPendentes(devolvido).length, 4, "devolvido continua pendente");
  assert.ok(relatoriosPendentes(devolvido).some((x) => x.devolvido));

  assert.deepEqual(relatoriosPendentes({ ...p, status: "submetido" }), [],
    "projeto sem aprovação não cobra relatório");
});

test("o aluno só enxerga os próprios relatórios; a orientação vê os do projeto", () => {
  const p = {
    ...emExecucao({ alunos: [{ nome: "Marcos", email: ALUNO.email }, { nome: "Beatriz", email: ALUNO2.email }] }),
    relatorios: [
      { id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "enviado", enviadoEm: "2026-11-01T10:00:00.000Z" },
      { id: "r2", tipo: "parcial", aluno: ALUNO2.email, situacao: "validado", enviadoEm: "2026-12-01T10:00:00.000Z" },
    ],
  };
  assert.deepEqual(relatoriosDe([p], ALUNO).map((r) => r.id), ["r1"]);
  assert.deepEqual(relatoriosDe([p], ALUNO2).map((r) => r.id), ["r2"]);
  assert.equal(relatoriosDe([p], PROF).length, 2);
  assert.equal(relatoriosDe([p], ALHEIO).length, 0);
  assert.deepEqual(relatoriosDe([p], PROF).map((r) => r.id), ["r2", "r1"], "mais recente primeiro");
  assert.equal(relatoriosDe([p], PROF)[1].podeValidar, true, "o enviado espera validação");
  assert.equal(relatoriosDe([p], ALUNO)[0].podeValidar, false);
});

/* -------------------------------- resumo -------------------------------- */
test("o resumo da lista conta etapas, atrasos e relatórios a validar", () => {
  const p = {
    ...emExecucao(),
    cronograma: [
      { atividade: "A", inicio: "2020-01-01", fim: "2020-02-01", situacao: "concluida" },
      { atividade: "B", inicio: "2020-01-01", fim: "2020-02-01", situacao: "prevista" },
    ],
    relatorios: [{ id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "enviado" }],
  };
  const r = resumir(p, PROF);
  assert.equal(r.etapas, 2);
  assert.equal(r.etapasConcluidas, 1);
  assert.equal(r.atrasadas, 1, "a prevista com fim em 2020 está atrasada");
  assert.equal(r.aValidar, 1);
  assert.equal(r.papel, "orientador");
  assert.equal(r.resumo, undefined, "o resumo da lista não carrega os campos longos");
});

test("o histórico guarda quem fez o quê, com teto", () => {
  let p = novo();
  for (let i = 0; i < 70; i++) p = anotar(p, { quem: PROF.email, oQue: "editou " + i });
  assert.equal(p.historico.length, 60, "o histórico não cresce sem limite");
  assert.equal(p.historico.at(-1).oQue, "editou 69");
});

test("as situações do projeto e as modalidades são as previstas", () => {
  assert.deepEqual(STATUS, ["rascunho", "submetido", "devolvido", "aprovado", "concluido", "reprovado"]);
  assert.deepEqual(MODALIDADES.map((m) => m.codigo), ["pibic", "pibiti", "voluntaria"]);
});
