import test from "node:test";
import assert from "node:assert/strict";
import { mesclarComposicao, normalizarComposicao } from "../lib/instituicao.js";

const gravada = {
  coordenador: { nome: "Gleidson Andrade", email: "gleidson@uniego.edu.br" },
  pedagogico: { nome: "Luanna Miranda", email: "luanna@uniego.edu.br" },
  nde: [{ nome: "NDE Um", email: "n1@x.com" }, { nome: "NDE Dois", email: "n2@x.com" }],
  colegiado: [{ nome: "Col Um", email: "c1@x.com" }],
};

test("salvar só os dados do curso não apaga NDE nem Colegiado (campo ausente = não mexi)", () => {
  const m = normalizarComposicao(mesclarComposicao(gravada, { pedagogico: { nome: "Ped Nova", email: "ped@uniego.edu.br" } }));
  assert.equal(m.pedagogico.nome, "Ped Nova");
  assert.equal(m.coordenador.email, "gleidson@uniego.edu.br");
  assert.equal(m.nde.length, 2);
  assert.equal(m.colegiado.length, 1);
});

test("salvar só as listas não apaga a dupla, e lista vazia explícita é remoção", () => {
  const m = normalizarComposicao(mesclarComposicao(gravada, { nde: [], colegiado: [{ nome: "Col Dois", email: "" }] }));
  assert.equal(m.coordenador.nome, "Gleidson Andrade");
  assert.equal(m.pedagogico.nome, "Luanna Miranda");
  assert.deepEqual(m.nde, []);
  assert.equal(m.colegiado[0].nome, "Col Dois");
});

test("a composição inteira no corpo continua valendo como antes", () => {
  const m = normalizarComposicao(mesclarComposicao(gravada, { coordenador: {}, pedagogico: {}, nde: [], colegiado: [] }));
  assert.equal(m.coordenador.nome, "");
  assert.deepEqual(m.nde, []);
});
