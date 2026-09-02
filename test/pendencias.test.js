import test from "node:test";
import assert from "node:assert/strict";
import {
  pendenciasDoPerfil, pendenciasIC, pendenciasICEM, pendenciasMonitoria,
  pendenciasExtensao, pendenciasAC, ordenar,
} from "../lib/pendencias.js";

const EU = { email: "ana@uniego.edu.br", cpf: "111.444.777-35" };

/* ------------------------------------------------------------- perfil */
test("perfil completo não gera pendência; incompleto nomeia o que falta", () => {
  assert.deepEqual(pendenciasDoPerfil([]), []);
  const [i] = pendenciasDoPerfil([{ campo: "cpf", rotulo: "CPF" }, { campo: "telefone" }]);
  assert.match(i.detalhe, /CPF, telefone/);
  assert.equal(i.link, "/perfil/?completar=1");
  assert.equal(i.urgente, true);
});

/* ----------------------------------------------------------------- IC */
const PROJ = {
  id: "p1", numero: "IC-2026-001", titulo: "Projeto de teste", status: "aprovado",
  orientador: { email: "ana@uniego.edu.br" }, alunos: [], relatorios: [],
};

test("projeto aprovado sem aluno indicado cobra a INDICAÇÃO de quem orienta", () => {
  const r = pendenciasIC([PROJ], EU);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /Indique o bolsista/);
  assert.equal(r[0].urgente, true);
  // com aluno indicado, a cobrança some
  assert.equal(pendenciasIC([{ ...PROJ, alunos: [{ nome: "Léo", email: "leo@x.com" }] }], EU).length, 0);
});

test("relatório entregue pelo aluno espera a validação de quem orienta", () => {
  const p = { ...PROJ, alunos: [{ nome: "Léo", email: "leo@x.com" }],
    relatorios: [{ tipo: "parcial", aluno: "leo@x.com", situacao: "enviado" }] };
  const r = pendenciasIC([p], EU);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /aguardando a sua validação/);
  // o relatório JÁ VALIDADO não espera mais ninguém
  assert.equal(pendenciasIC([{ ...p, relatorios: [{ ...p.relatorios[0], situacao: "validado" }] }], EU).length, 0);
});

test("o aluno só é cobrado do relatório cuja janela JÁ ABRIU", () => {
  const p = { ...PROJ, orientador: { email: "prof@x.com" },
    alunos: [{ nome: "Ana", email: EU.email }] };
  const opts = (hoje) => ({
    hoje,
    pendentesDe: () => [{ tipo: "final", aluno: EU.email, devolvido: false }],
    prazosDe: () => ({ prazos: [{ tipo: "final", abre: "2026-07-01", vence: "2026-08-31", atrasado: true }] }),
  });
  assert.equal(pendenciasIC([p], EU, opts("2026-06-30")).length, 0, "antes de abrir, não se cobra");
  const [i] = pendenciasIC([p], EU, opts("2026-09-02"));
  assert.match(i.texto, /Envie o relatório final/);
  assert.match(i.detalhe, /prazo: 31\/08\/2026/);
  assert.equal(i.urgente, true, "vencido é urgente");
});

test("o cadastro do bolsista sai UMA vez, com a união do que falta nos dois projetos", () => {
  const a = { nome: "Ana", email: EU.email, bolsista: true };
  const p1 = { ...PROJ, id: "p1", orientador: { email: "x@x.com" }, alunos: [a] };
  const p2 = { ...PROJ, id: "p2", numero: "IC-2026-002", orientador: { email: "y@y.com" }, alunos: [a] };
  const faltas = { p1: ["RG", "Pix"], p2: ["RG", "endereço"] };
  const r = pendenciasIC([p1, p2], EU, {
    pendentesDe: () => [], prazosDe: () => null,
    faltaNoCadastroDe: () => faltas.p1.concat(faltas.p2).filter((v, i, l) => l.indexOf(v) === i),
  }).filter((i) => /cadastro de bolsista/.test(i.texto));
  assert.equal(r.length, 1, "o cadastro é da pessoa, não do projeto");
  assert.match(r[0].detalhe, /RG, Pix, endereço/);
});

test("quem não é parte do projeto não recebe nada dele", () => {
  assert.deepEqual(pendenciasIC([PROJ], { email: "outro@x.com" }), []);
});

/* --------------------------------------------------------------- ICEM */
const opcoesEM = { turmaDe: (c) => ({ ciclo: c, encerrada: c === "2025/2026", prazoRelatorioFinal: "2026-09-30" }),
  exigidosDe: (t) => (t.encerrada ? ["final"] : ["parcial", "final"]) };

test("bolsista da turma em curso sem projeto é levado a escolher um", () => {
  const b = { turma: "2026/2027", situacao: "ativo", trajetoria: [], relatorios: {} };
  const r = pendenciasICEM([b], opcoesEM);
  assert.match(r[0].texto, /Escolha o projeto/);
  // já acompanhando um projeto, a cobrança some
  const comProjeto = { ...b, trajetoria: [{ projetoId: "x", de: "2026-09-01" }] };
  assert.equal(pendenciasICEM([comProjeto], opcoesEM).filter((i) => /Escolha o projeto/.test(i.texto)).length, 0);
});

test("turma ENCERRADA ainda cobra o relatório — é justamente quem está em atraso", () => {
  const b = { turma: "2025/2026", situacao: "concluido", trajetoria: [{ projetoId: "x", de: "2025-09-01" }],
    relatorios: { final: { situacao: "pendente" } } };
  const r = pendenciasICEM([b], opcoesEM);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /Envie o seu relatório final/);
  assert.match(r[0].detalhe, /30\/09\/2026/);
  // encerrada não pede escolha de projeto: não há o que escolher
  assert.equal(r.filter((i) => /Escolha o projeto/.test(i.texto)).length, 0);
});

test("desligado não deve nada; voluntário não deve conta bancária", () => {
  const base = { turma: "2026/2027", trajetoria: [{ projetoId: "x" }], relatorios: { parcial: { situacao: "validado" }, final: { situacao: "validado" } } };
  assert.deepEqual(pendenciasICEM([{ ...base, situacao: "desligado" }], opcoesEM), []);
  assert.deepEqual(pendenciasICEM([{ ...base, situacao: "ativo", bolsa: "voluntario", faltaNoCadastro: ["banco"] }], opcoesEM), []);
  const [i] = pendenciasICEM([{ ...base, situacao: "ativo", bolsa: "cnpq", faltaNoCadastro: ["banco", "Pix"] }], opcoesEM);
  assert.match(i.texto, /dados bancários/);
  assert.match(i.detalhe, /banco, Pix/);
});

/* ---------------------------------------------------------- monitoria */
test("monitoria: ficha do monitor, relatório dele e validação da orientação", () => {
  const cadastrado = (m) => !!m.matricula;
  const p = { protocolo: "MON-2026-001", disciplina: "Anatomia", status: "aguardando-aluno",
    orientador: { email: "prof@x.com" }, monitores: [{ email: EU.email }] };
  assert.match(pendenciasMonitoria([p], EU, { cadastrado })[0].texto, /ficha de inscrição/);
  // cadastrado, a cobrança some
  assert.equal(pendenciasMonitoria([{ ...p, monitores: [{ email: EU.email, matricula: "G1" }] }], EU, { cadastrado }).length, 0);

  const emCurso = { ...p, status: "aprovado", monitores: [{ email: EU.email, matricula: "G1" }] };
  assert.match(pendenciasMonitoria([emCurso], EU, { cadastrado })[0].texto, /Envie o seu relatório/);

  const paraValidar = { ...emCurso, orientador: { email: EU.email },
    monitores: [{ email: "monitor@x.com", relatorio: { status: "enviado" } }] };
  assert.match(pendenciasMonitoria([paraValidar], EU, { cadastrado })[0].texto, /aguardando a sua avaliação/);
});

/* ----------------------------------------------------------- extensão */
test("extensão: devolvida e relatório final pendente", () => {
  const a = { numeroAcao: "EXT-2026-010", proposta: { titulo: "Semana X", periodoFim: "2026-08-20" } };
  const [d] = pendenciasExtensao([{ ...a, status: "devolvida" }], { devePendencia: () => false });
  assert.match(d.texto, /devolvida para alterações/);
  const [r] = pendenciasExtensao([{ ...a, status: "aprovada" }], { devePendencia: () => true });
  assert.match(r.texto, /Entregue o relatório final/);
  assert.match(r.detalhe, /20\/08\/2026/);
  // relatório JÁ entregue não é pendência
  assert.deepEqual(pendenciasExtensao([{ ...a, status: "aprovada", relatorio: { entregueEm: "2026-08-30" } }],
    { devePendencia: () => true }), []);
});

/* ----------------------------------------- atividades curriculares (AC) */
test("AC: só o relatório DEVOLVIDO ao próprio professor", () => {
  const base = { protocolo: "AP-2026-003", disciplina: "Prática I", professor: { email: EU.email } };
  assert.match(pendenciasAC([{ ...base, status: "devolvido" }], EU)[0].texto, /devolvido pela coordenação/);
  assert.deepEqual(pendenciasAC([{ ...base, status: "enviado" }], EU), []);
  assert.deepEqual(pendenciasAC([{ ...base, status: "devolvido", professor: { email: "outro@x.com" } }], EU), []);
});

/* ---------------------------------------------------------------- fila */
test("a fila põe o urgente na frente, tira repetido e tem teto", () => {
  const itens = [
    { setor: "A", texto: "calmo", detalhe: "" },
    { setor: "B", texto: "urgente", detalhe: "", urgente: true },
    { setor: "A", texto: "calmo", detalhe: "" },
  ];
  const r = ordenar(itens);
  assert.equal(r.length, 2, "o repetido sai");
  assert.equal(r[0].texto, "urgente");
  assert.equal(ordenar(Array.from({ length: 30 },
    (_, i) => ({ setor: "A", texto: "x" + i })), 12).length, 12);
});
