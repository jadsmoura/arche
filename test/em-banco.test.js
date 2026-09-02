import test from "node:test";
import assert from "node:assert/strict";
import {
  exigeBancoDoBrasil, ehBancoDoBrasil, faltaDadosBancariosEM, dadosBancariosCompletosEM,
} from "../lib/em.js";

const conta = { banco: "Banco do Brasil", agencia: "1234-5", conta: "98765-4", pix: "701.234.211-51" };

test("a exigência do Banco do Brasil é do CNPq — e só dele", () => {
  assert.equal(exigeBancoDoBrasil("cnpq"), true);
  assert.equal(exigeBancoDoBrasil("uniego"), false);
  assert.equal(exigeBancoDoBrasil("voluntario"), false);
  assert.equal(exigeBancoDoBrasil(""), false);
});

test("o banco se escreve de muitos jeitos, inclusive pelo número", () => {
  for (const n of ["Banco do Brasil", "banco do brasil", "BANCO DO BRASIL S/A", "BB", "bb", "001", "1"])
    assert.equal(ehBancoDoBrasil(n), true, n);
  for (const n of ["", "Caixa", "Nubank", "Bradesco", "Banco Inter", "Brasil Card"])
    assert.equal(ehBancoDoBrasil(n), false, n);
});

test("voluntário e quem ainda não tem bolsa não devem dados bancários", () => {
  assert.deepEqual(faltaDadosBancariosEM({ bolsa: "voluntario" }), []);
  assert.deepEqual(faltaDadosBancariosEM({ bolsa: "" }), []);
  assert.equal(dadosBancariosCompletosEM({ bolsa: "voluntario" }), true);
});

test("bolsa do UNIEGO aceita qualquer banco; a do CNPq, só o BB", () => {
  assert.deepEqual(faltaDadosBancariosEM({ ...conta, banco: "Nubank", bolsa: "uniego" }), []);
  const falta = faltaDadosBancariosEM({ ...conta, banco: "Nubank", bolsa: "cnpq" });
  assert.equal(falta.length, 1);
  assert.match(falta[0], /Banco do Brasil/);
  assert.deepEqual(faltaDadosBancariosEM({ ...conta, bolsa: "cnpq" }), []);
});

test("campo em branco é o que falta — e o banco vazio não vira 'não é o BB'", () => {
  const falta = faltaDadosBancariosEM({ bolsa: "cnpq" });
  assert.deepEqual(falta, ["banco", "agência", "conta", "Pix"]);
  assert.deepEqual(faltaDadosBancariosEM({ ...conta, pix: "", bolsa: "uniego" }), ["Pix"]);
});
