/* O TEXTO RICO do ARCHÉ TR (set/2026): o que a colagem pode trazer, o que
   sobrevive à limpeza e como o HTML vira desenho no PDF. A régua é de
   SEGURANÇA — o texto do autor é mostrado ao revisor e à gestão dentro da
   página do ARCHÉ, então nada de fora pode virar código lá dentro. */
import test from "node:test";
import assert from "node:assert/strict";
import { limparRico, textoPlano, vazioRico, idsDeImagens, blocosDoRico, MAX_RICO } from "../lib/richtext.js";

test("a ênfase e a estrutura sobrevivem; o resto da colagem sai", () => {
  assert.equal(limparRico("<p>Um <b>teste</b> com <i>ênfase</i></p>"), "<p>Um <b>teste</b> com <i>ênfase</i></p>");
  assert.equal(limparRico("<ul><li>um</li><li>dois</li></ul>"), "<ul><li>um</li><li>dois</li></ul>");
  assert.equal(limparRico("H<sub>2</sub>O e m<sup>2</sup>"), "H<sub>2</sub>O e m<sup>2</sup>");
  // o Word manda estilo, fonte e cor: some tudo, o texto fica
  assert.equal(limparRico(`<p style="font:12px Calibri"><span class="c" style="color:#f00">Texto</span> colado</p>`),
    "<p>Texto colado</p>");
  // <strong>/<em> normalizam para <b>/<i>? (não: as duas formas são aceitas)
  assert.equal(limparRico("<strong>a</strong>"), "<strong>a</strong>");
  // texto puro atravessa intacto — é o campo de antes do editor
  assert.equal(limparRico("Sem tag nenhuma"), "Sem tag nenhuma");
});

test("nada de fora vira código dentro da página", () => {
  assert.equal(limparRico(`<p>oi</p><script>alert(1)</` + `script>`), "<p>oi</p>");
  assert.equal(limparRico(`<img src="/api/files/abc" onerror="alert(1)">`), `<img src="/api/files/abc">`);
  assert.equal(limparRico(`<a href="javascript:alert(1)">clique</a>`), "clique");
  assert.equal(limparRico(`<iframe src="https://x.com"></iframe>`), "");
  assert.equal(limparRico("a <b"), "a &lt;b");                       // o < solto vira entidade
  assert.equal(limparRico("<b>solto"), "<b>solto</b>", "tag aberta se fecha");
  assert.equal(limparRico("texto</b>"), "texto", "fechamento órfão sai");
});

test("a imagem só entra se for arquivo do próprio sistema", () => {
  assert.equal(limparRico(`<img src="/api/files/1A2b-_C3">`), `<img src="/api/files/1A2b-_C3">`);
  assert.equal(limparRico(`<img src="/api/files/Pasta/x%20y.png" alt="Figura 1">`),
    `<img src="/api/files/Pasta/x%20y.png" alt="Figura 1">`, "o id é o caminho no modo local");
  assert.equal(limparRico(`<img src="https://malvado.com/rastreador.png">`), "", "imagem de fora não entra");
  assert.equal(limparRico(`<img src="data:image/png;base64,AAAA">`), "", "base64 não entra no estado");
  assert.equal(limparRico(`<img src="/api/files/../../.env">`), "", "não se sai da pasta");
  assert.equal(limparRico(`<img src="/api/estado/chave">`), "", "outra rota não é arquivo");
});

test("o texto simples é o que se conta, e o campo vazio se reconhece", () => {
  assert.equal(textoPlano("<p>Um <b>teste</b> com <i>ênfase</i></p>"), "Um teste com ênfase");
  assert.equal(textoPlano("linha 1\nlinha 2"), "linha 1\nlinha 2");
  assert.equal(textoPlano("<p>a &amp; b</p>"), "a & b");
  assert.equal(vazioRico("<p><br></p>"), true, "a caixa vazia do editor é vazia");
  assert.equal(vazioRico(`<p><img src="/api/files/x"></p>`), false, "só a figura já é conteúdo");
  assert.deepEqual(idsDeImagens(`<img src="/api/files/a"><p>x</p><img src="/api/files/b">`), ["a", "b"]);
});

test("o HTML vira blocos com as marcas de cada trecho — é o que o PDF desenha", () => {
  const b = blocosDoRico("<p>Uma <b>frase</b> boa</p><ul><li>item</li></ul><p><img src=\"/api/files/z\" alt=\"Figura\"></p>");
  assert.equal(b[0].tipo, "p");
  assert.deepEqual(b[0].trechos.map((t) => [t.t, t.b]), [["Uma ", false], ["frase", true], [" boa", false]]);
  const li = b.find((x) => x.tipo === "li");
  assert.equal(li.marcador, "•");
  const img = b.find((x) => x.tipo === "img");
  assert.deepEqual([img.id, img.alt], ["z", "Figura"]);
  // a lista numerada conta
  assert.equal(blocosDoRico("<ol><li>a</li><li>b</li></ol>").map((x) => x.marcador).join(), "1.,2.");
  // texto puro: um bloco por linha, como o gerador fazia antes do editor
  assert.equal(blocosDoRico("linha um\nlinha dois").length, 2);
});

test("há um teto de tamanho, mas ele não é limite de escrita", () => {
  const gigante = "<p>" + "a".repeat(MAX_RICO * 2) + "</p>";
  assert.ok(limparRico(gigante).length <= MAX_RICO);
  // 400 mil caracteres são umas 80 páginas: o autor não esbarra nisso
  assert.ok(MAX_RICO >= 200_000);
});

test("a caixa vazia do editor guarda campo VAZIO, não `<p><br></p>`", async () => {
  const tr = await import("../lib/trabalhos.js");
  // o abstract é opcional: guardar a caixa vazia faria a página e o PDF
  // desenharem o título "Abstract" com nada embaixo
  const c = tr.normalizarConteudo({ resumo: "<p>texto</p>", abstract: "<p><br></p>", secoes: { introducao: "<p>  </p>" } }, "completo");
  assert.equal(c.abstract, "");
  assert.equal(c.secoes.introducao, "");
  assert.equal(c.resumo, "<p>texto</p>");
  // figura sozinha é conteúdo, e fica
  assert.match(tr.normalizarConteudo({ abstract: `<p><img src="/api/files/x"></p>` }).abstract, /<img/);
});
