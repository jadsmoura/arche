import { test } from "node:test";
import assert from "node:assert/strict";
import { destinatariosFinais, listaPara } from "../lib/mailer.js";

/* A conta pessoal do pró-reitor não recebe comunicação do sistema (ago/2026):
   todo destino passa pela tradução pessoal → institucional, exceto o código
   de acesso do login (exato: true). */
test("a conta pessoal é traduzida para a institucional", () => {
  assert.deepEqual(destinatariosFinais("jadsonbelem@gmail.com"),
    ["jadson.moura@uniego.edu.br"]);
});

test("com as duas contas na lista, sai UMA institucional (sem duplicar)", () => {
  assert.deepEqual(
    destinatariosFinais(["jadsonbelem@gmail.com", "jadson.moura@uniego.edu.br", "extensao@uniego.edu.br"]),
    ["jadson.moura@uniego.edu.br", "extensao@uniego.edu.br"]);
});

test("exato (código de acesso do login) NÃO traduz — senão a conta pessoal não entra", () => {
  assert.deepEqual(destinatariosFinais("jadsonbelem@gmail.com", { exato: true }),
    ["jadsonbelem@gmail.com"]);
});

test("os demais endereços passam intactos", () => {
  assert.deepEqual(destinatariosFinais(["prof@uniego.edu.br", "Prof@UNIEGO.edu.br", "torto@@x"]),
    ["prof@uniego.edu.br"]);
});

test("listaPara segue validando e normalizando como sempre", () => {
  assert.deepEqual(listaPara([" A@b.co ", "quebra\ninjecao@x.co", null]), ["a@b.co"]);
});
