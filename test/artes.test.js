/* As artes do evento fora do arquivo de estado.
   O que se protege aqui: a forma ANTIGA (imagem embutida no registro) e a
   NOVA (referência ao arquivo no Drive) precisam conviver — a migração pode
   não ter alcançado um evento, pode ter falhado numa arte, e o que ficou
   para trás tem de continuar sendo servido. E a normalização não pode
   apagar a referência já migrada: seria perder a imagem na primeira
   gravação depois da migração. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  artesEmbutidas, aplicarReferencia, bytesDataUrl, ehDataUrl, ehReferencia,
  extensaoDe, partesDataUrl, temArte,
} from "../lib/artes.js";
import { imagemPequena, normalizarProgramacao, normalizarBlocos } from "../lib/eventos.js";

// 1×1 transparente — o menor PNG válido
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
  + "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REF = { fileId: "1a2b3c", tipo: "image/png", bytes: 72 };

test("as duas formas são reconhecidas, e o vazio não é arte", () => {
  assert.equal(ehDataUrl(PX), true);
  assert.equal(ehDataUrl(REF), false);
  assert.equal(ehReferencia(REF), true);
  assert.equal(ehReferencia({ fileId: "" }), false, "referência sem id não é referência");
  assert.equal(ehReferencia(PX), false);
  for (const v of [PX, REF]) assert.equal(temArte(v), true);
  for (const v of ["", null, undefined, {}, "não é imagem"]) assert.equal(temArte(v), false);
  // formato que não é imagem não passa por data URL
  assert.equal(ehDataUrl("data:application/pdf;base64,AAAA"), false);
});

test("partes e tamanho saem da data URL, e o nome do arquivo do tipo", () => {
  const p = partesDataUrl(PX);
  assert.equal(p.tipo, "image/png");
  assert.ok(Buffer.isBuffer(p.buffer) && p.buffer.length > 0);
  assert.equal(partesDataUrl(REF), null, "referência não tem bytes aqui");
  assert.equal(bytesDataUrl(PX), p.buffer.length, "o tamanho declarado é o real, com o enchimento descontado");
  assert.equal(bytesDataUrl(REF), 0);
  assert.equal(extensaoDe("image/jpeg"), "jpg");
  assert.equal(extensaoDe("image/webp"), "webp");
  assert.equal(extensaoDe("qualquer outra coisa"), "img");
});

test("a travessia acha as três artes e a troca acontece no lugar certo", () => {
  const ev = {
    capa: PX,
    programacao: [
      { id: "aaaa0001", titulo: "Abertura", foto: PX },
      { id: "aaaa0002", titulo: "Sem foto" },
    ],
    blocos: [{ tipo: "apoio", itens: [
      { id: "bbbb0001", nome: "Apoiador", logo: PX },
      { id: "bbbb0002", nome: "Sem logo" },
    ] }],
  };
  const achadas = artesEmbutidas(ev);
  assert.deepEqual(achadas.map((a) => a.onde), ["capa", "foto", "logo"]);
  assert.deepEqual(achadas.map((a) => a.id), [undefined, "aaaa0001", "bbbb0001"]);

  for (const a of achadas) assert.equal(aplicarReferencia(ev, a, REF), 1);
  assert.deepEqual(ev.capa, REF);
  assert.deepEqual(ev.programacao[0].foto, REF);
  assert.deepEqual(ev.blocos[0].itens[0].logo, REF);
  assert.equal(ev.programacao[1].foto, undefined, "quem não tinha arte não ganha uma");

  // já migrado não é achado de novo: a migração não repete trabalho
  assert.deepEqual(artesEmbutidas(ev), []);
  // id que não existe não estraga nada
  assert.equal(aplicarReferencia(ev, { onde: "foto", id: "zzzzzzzz" }, REF), 0);
  assert.equal(aplicarReferencia(null, { onde: "capa" }, REF), 0);
});

test("a normalização PRESERVA a referência migrada — senão a imagem sumiria ao salvar", () => {
  const [atv] = normalizarProgramacao([{ id: "aaaa0001", titulo: "Abertura", foto: REF }]);
  assert.deepEqual(atv.foto, REF);
  // a data URL continua sujeita ao teto de tamanho, como antes
  assert.equal(imagemPequena(PX, 10), "", "acima do teto, não se guarda");
  assert.equal(imagemPequena(PX, 10_000), PX);
  assert.deepEqual(imagemPequena(REF, 10), REF, "a referência não tem teto: quem subiu já conferiu");

  const [bloco] = normalizarBlocos([{ tipo: "apoiadores", titulo: "Apoio",
    itens: [{ id: "bbbb0001", nome: "Apoiador", categoria: "apoio", logo: REF }] }]);
  assert.deepEqual(bloco.itens[0].logo, REF);
});
