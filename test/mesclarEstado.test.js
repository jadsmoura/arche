/* A mescla do estado entre duas instâncias (lib/mesclarEstado.js): o merge a
   três chave a chave, e os mescladores das listas por id — inscritos,
   presenças, alunos — que é onde a corrida do deploy dói. */
import test from "node:test";
import assert from "node:assert/strict";
import { mesclarEstado, MESCLADORES } from "../lib/mesclarEstado.js";

const J = (v) => JSON.stringify(v);
const P = (s) => JSON.parse(s);

test("chave que só um lado mudou: vale quem mudou", () => {
  const base = { a: "1", b: "1", c: "1" };
  const local = { a: "2", b: "1", c: "1" };
  const remoto = { a: "1", b: "3", c: "1" };
  const { estado, conflitos } = mesclarEstado({ base, local, remoto });
  assert.deepEqual(estado, { a: "2", b: "3", c: "1" });
  assert.deepEqual(conflitos, []);
});

test("chave nova no remoto entra; chave apagada localmente fica apagada", () => {
  const base = { a: "1", x: "1" };
  const local = { a: "1" };                 // apagou x
  const remoto = { a: "1", x: "1", n: "9" }; // criou n
  const { estado } = mesclarEstado({ base, local, remoto });
  assert.deepEqual(estado, { a: "1", n: "9" });
});

test("conflito sem mesclador: vale o local e o conflito é dito", () => {
  const { estado, conflitos } = mesclarEstado({ base: { k: "0" }, local: { k: "L" }, remoto: { k: "R" }, mescladores: {} });
  assert.equal(estado.k, "L");
  assert.deepEqual(conflitos, ["k"]);
});

test("ex-acoes-v1: inscrições feitas nas DUAS instâncias sobrevivem", () => {
  const acao = (inscritos) => ({ id: "ev1", participantes: { inscritos } });
  const base = { "ex-acoes-v1": J([acao([{ token: "t1", nome: "A" }])]) };
  const local = { "ex-acoes-v1": J([acao([{ token: "t1", nome: "A" }, { token: "t2", nome: "B" }])]) };
  const remoto = { "ex-acoes-v1": J([acao([{ token: "t1", nome: "A" }, { token: "t3", nome: "C" }])]) };
  const { estado, conflitos } = mesclarEstado({ base, local, remoto });
  const ins = P(estado["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token);
  assert.deepEqual(ins.sort(), ["t1", "t2", "t3"]);
  assert.deepEqual(conflitos, ["ex-acoes-v1 (mesclada)"]);
});

test("ex-acoes-v1: presença lançada na outra instância entra no inscrito", () => {
  const base = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1", presencas: [] }] } }]) };
  const local = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1", presente: true, presencas: [{ atividade: "a1", em: "x" }] }] } }]) };
  const remoto = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1", presencas: [{ atividade: "a2", em: "y" }] }] } }]) };
  const { estado } = mesclarEstado({ base, local, remoto });
  const i = P(estado["ex-acoes-v1"])[0].participantes.inscritos[0];
  assert.equal(i.presente, true);
  assert.deepEqual(i.presencas.map((p) => p.atividade).sort(), ["a1", "a2"]);
});

test("ex-acoes-v1: inscrito apagado aqui NÃO ressuscita do remoto", () => {
  const base = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1" }, { token: "t2" }] } }]) };
  const local = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1" }] } }]) };        // gestão tirou t2
  const remoto = { "ex-acoes-v1": J([{ id: "ev1", participantes: { inscritos: [{ token: "t1" }, { token: "t2" }, { token: "t3" }] } }]) };
  const { estado } = mesclarEstado({ base, local, remoto });
  const ins = P(estado["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token);
  assert.deepEqual(ins.sort(), ["t1", "t3"]);
});

test("ex-acoes-v1: ação criada na outra instância entra; ação apagada aqui fica apagada", () => {
  const base = { "ex-acoes-v1": J([{ id: "a" }, { id: "b" }]) };
  const local = { "ex-acoes-v1": J([{ id: "a", titulo: "editada" }]) };       // apagou b
  const remoto = { "ex-acoes-v1": J([{ id: "a" }, { id: "b" }, { id: "c" }]) }; // criou c
  const { estado } = mesclarEstado({ base, local, remoto });
  const l = P(estado["ex-acoes-v1"]);
  assert.deepEqual(l.map((x) => x.id), ["a", "c"]);
  assert.equal(l[0].titulo, "editada");
});

test("ex-acoes-v1: os campos do evento que a outra instância salvou não apagam os daqui", () => {
  const base = { "ex-acoes-v1": J([{ id: "a", evento: { vagas: 10 } }]) };
  const local = { "ex-acoes-v1": J([{ id: "a", evento: { vagas: 10, descricao: "nova" } }]) };
  const remoto = { "ex-acoes-v1": J([{ id: "a", evento: { vagas: 50 } }]) };
  const { estado } = mesclarEstado({ base, local, remoto });
  const ev = P(estado["ex-acoes-v1"])[0].evento;
  assert.equal(ev.descricao, "nova");   // local manda no que ambos têm
  assert.equal(ev.vagas, 10);           // e no campo comum também (é a escrita mais recente)
});

test("ic-projetos-v1: aluno indicado numa instância e relatório enviado na outra", () => {
  const base = { "ic-projetos-v1": J([{ id: "p1", alunos: [], relatorios: [] }]) };
  const local = { "ic-projetos-v1": J([{ id: "p1", alunos: [{ email: "a@x" }], relatorios: [] }]) };
  const remoto = { "ic-projetos-v1": J([{ id: "p1", alunos: [], relatorios: [{ id: "r1", tipo: "parcial" }] }]) };
  const { estado } = mesclarEstado({ base, local, remoto });
  const p = P(estado["ic-projetos-v1"])[0];
  assert.equal(p.alunos.length, 1);
  assert.equal(p.relatorios.length, 1);
});

test("mesclador que quebra não derruba a gravação: vale o local", () => {
  const { estado, conflitos } = mesclarEstado({
    base: { "ex-acoes-v1": "x" }, local: { "ex-acoes-v1": "{bad" }, remoto: { "ex-acoes-v1": "[]" },
    mescladores: { "ex-acoes-v1": () => { throw new Error("boom"); } },
  });
  assert.equal(estado["ex-acoes-v1"], "{bad");
  assert.deepEqual(conflitos, ["ex-acoes-v1"]);
});

test("MESCLADORES cobre as chaves em que a perda dói", () => {
  for (const k of ["ex-acoes-v1", "ic-projetos-v1", "esp-reservas-v1", "ic-em-v1"]) assert.equal(typeof MESCLADORES[k], "function");
});
