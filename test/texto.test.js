/* A limpeza da colagem: o que chega do Word, do Google Docs e do PDF.
   O que se protege aqui é o documento OFICIAL — o PDF timbrado usa as fontes
   padrão do PDF, que só desenham o repertório WinAnsi. O navegador desenha
   quase tudo, e é por isso que o defeito passava despercebido na tela. */
import test from "node:test";
import assert from "node:assert/strict";
import { limparColagem, temColagemSuja, limparProfundo, letraSimples, desenhaNoPdf } from "../lib/texto.js";

// escreve a palavra num dos blocos "alfanuméricos matemáticos" do Unicode —
// é o que uma colagem de trecho em NEGRITO devolve em vários editores
const mat = (s, base) => [...s].map((c) => {
  const n = c.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(base + (n - 65));
  if (n >= 97 && n <= 122) return String.fromCodePoint(base + 26 + (n - 97));
  return c;
}).join("");

test("o português inteiro passa intacto — acento, ç, travessão e o marcador", () => {
  const t = "• Distribuir materiais educativos — informações à comunidade (100% ok);\n"
    + "  “aspas curvas”, ‘simples’, reticências… e ª/º.";
  assert.equal(limparColagem(t), t);
  assert.equal(temColagemSuja(t), false);
});

test("as letras que NÃO são letras voltam a ser letras", () => {
  // era isto que saía "6öç66–VçF—¦" no PDF da Campanha Agosto Dourado
  const sujo = mat("Conscientizar gestantes", 0x1d400) + ", puérperas e suas famílias.";
  assert.equal(temColagemSuja(sujo), true);
  assert.equal(limparColagem(sujo), "Conscientizar gestantes, puérperas e suas famílias.");
});

test("todos os treze blocos matemáticos, e os dígitos", () => {
  for (const base of [0x1d400, 0x1d434, 0x1d468, 0x1d49c, 0x1d4d0, 0x1d504, 0x1d538,
    0x1d56c, 0x1d5a0, 0x1d5d4, 0x1d608, 0x1d63c, 0x1d670]) {
    assert.equal(limparColagem(mat("Fase", base)), "Fase", `bloco ${base.toString(16)}`);
  }
  assert.equal(limparColagem(String.fromCodePoint(0x1d7ce, 0x1d7cf, 0x1d7d0)), "012");
  // e as letras avulsas, que moram fora dos blocos
  assert.equal(limparColagem("ℬℯℊℴ"), "Bego");
});

test("o marcador de lista do Word vira o marcador de verdade", () => {
  // U+F0A7 e U+F0B7 são da área de uso PRIVADO: viram "[]" no navegador e
  // lixo no PDF — são o "[]" que aparecia no meio da metodologia
  const sujo = "As atividades incluirão:  Apresentação dos benefícios  Demonstração.";
  assert.equal(limparColagem(sujo),
    "As atividades incluirão: • Apresentação dos benefícios • Demonstração.");
});

test("uso privado que não é marcador simplesmente sai", () => {
  assert.equal(limparColagem("Antes  depois"), "Antes depois");
});

test("espaços, traços e setas exóticos viram os comuns", () => {
  assert.equal(limparColagem("UBS‑Palmeiras"), "UBS-Palmeiras");
  assert.equal(limparColagem("gestante→bebê"), "gestante->bebê");
  assert.equal(limparColagem("▪ Roda de conversa"), "• Roda de conversa");
  assert.equal(limparColagem("2 h"), "2 h");
});

test("as marcas invisíveis somem sem levar letra junto", () => {
  assert.equal(limparColagem("Texto​com﻿marcas‎invisíveis"), "Textocommarcasinvisíveis");
});

test("quebras de linha e tabulações sobrevivem — é texto de formulário", () => {
  assert.equal(limparColagem("Linha 1\nLinha 2\n\nLinha 4"), "Linha 1\nLinha 2\n\nLinha 4");
});

test("a fronteira é o que o PDF desenha", () => {
  assert.equal(desenhaNoPdf("ç".codePointAt(0)), true);
  assert.equal(desenhaNoPdf("—".codePointAt(0)), true);
  assert.equal(desenhaNoPdf("•".codePointAt(0)), true);
  assert.equal(desenhaNoPdf(0x1d400), false);
  assert.equal(desenhaNoPdf(0xf0a7), false);
  assert.equal(letraSimples(0x1d400), "A");
  assert.equal(letraSimples(0x41), "");
});

test("a limpeza entra em objetos e listas, e não toca nas imagens", () => {
  const acao = {
    proposta: { objetivosEspecificos: mat("Capacitar", 0x1d400) + " a Liga.",
      componentes: [{ disciplina: mat("Saude", 0x1d5a0) + " da Mulher" }] },
    evento: { capa: "😀base64-que-nao-e-texto", assinaturas: { base64: "abc" } },
  };
  const limpo = limparProfundo(acao);
  assert.equal(limpo.proposta.objetivosEspecificos, "Capacitar a Liga.");
  assert.equal(limpo.proposta.componentes[0].disciplina, "Saude da Mulher");
  // imagem não é texto: limpá-la destruiria o arquivo
  assert.equal(limpo.evento.capa, acao.evento.capa);
  assert.equal(limpo.evento.assinaturas.base64, acao.evento.assinaturas.base64);
});

test("números, nulos e vazios atravessam sem virar string", () => {
  const o = limparProfundo({ ch: 4, ativo: true, nada: null, vazio: "" });
  assert.deepEqual(o, { ch: 4, ativo: true, nada: null, vazio: "" });
});
