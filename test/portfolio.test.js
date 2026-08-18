/* Portfólio de comprovação: o mínimo de fotos que a entrega do relatório
   exige (lib/portfolio.js). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_FOTOS_RELATORIO, ehFoto, fotosDoPortfolio, faltamFotos, avisoFotos,
} from "../lib/portfolio.js";

const acaoCom = (anexos) => ({ portfolio: { anexos } });

test("foto: pelo tipo do upload e, nos registros antigos, pela extensão", () => {
  assert.equal(ehFoto({ tipo: "image/jpeg", name: "sem-extensao" }), true);
  assert.equal(ehFoto({ tipo: "application/pdf", name: "foto.jpg" }), false,
    "o tipo declarado manda: um PDF chamado .jpg não é foto");
  assert.equal(ehFoto({ name: "DSC_0043.JPEG" }), true);
  assert.equal(ehFoto({ name: "lista-de-presenca.pdf" }), false);
  assert.equal(ehFoto(null), false);
});

test("faltam fotos: a régua é a mesma da tela e do servidor", () => {
  const tres = acaoCom([
    { tipo: "image/jpeg", name: "a.jpg" }, { tipo: "image/png", name: "b.png" },
    { tipo: "image/webp", name: "c.webp" }, { tipo: "application/pdf", name: "lista.pdf" },
  ]);
  assert.equal(fotosDoPortfolio(tres).length, 3);
  assert.equal(faltamFotos(tres), MIN_FOTOS_RELATORIO - 3);
  assert.match(avisoFotos(tres), /pelo menos 5 fotos/);

  const cinco = acaoCom(Array.from({ length: 5 }, (_, i) => ({ tipo: "image/jpeg", name: `f${i}.jpg` })));
  assert.equal(faltamFotos(cinco), 0);
  assert.equal(avisoFotos(cinco), "", "cumprido o mínimo, não há aviso");

  const dez = acaoCom(Array.from({ length: 10 }, (_, i) => ({ tipo: "image/jpeg", name: `f${i}.jpg` })));
  assert.equal(faltamFotos(dez), 0, "não há teto: dez fotos passam igual");
});

test("faltam fotos: ação sem portfólio nenhum", () => {
  assert.equal(faltamFotos({}), MIN_FOTOS_RELATORIO);
  assert.equal(fotosDoPortfolio(undefined).length, 0);
});
