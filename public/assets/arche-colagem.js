/* ==========================================================================
   LIMPEZA DA COLAGEM, NA TELA — o espelho de lib/texto.js
   ==========================================================================

   Quem GARANTE é o servidor: toda gravação passa por `limparProfundo`, e o
   gerador de PDF blinda o documento uma última vez antes da tinta. Este
   arquivo existe por outra razão — para a pessoa VER, no instante em que
   cola, o texto que vai ficar gravado.

   Sem ele, a colagem do Word entra com as "letras que não são letras" (os
   alfanuméricos matemáticos que certos editores devolvem quando se copia um
   trecho em negrito) e com os marcadores de lista da área de uso privado.
   O navegador desenha tudo isso, a pessoa relê o que colou, vê o texto dela
   e submete — e o defeito só aparece dias depois, no PDF timbrado que a
   PROPPEX abre. Foi assim na proposta da Campanha Agosto Dourado (ago/2026).

   Instala-se sozinho em todo <textarea> e <input type="text"> da página,
   inclusive nos que forem criados depois: as SPAs do ARCHÉ redesenham os
   formulários a cada navegação, e uma lista de campos escrita à mão
   envelheceria calada.
   ========================================================================== */
(function () {
  "use strict";

  var BLOCOS = [0x1d400, 0x1d434, 0x1d468, 0x1d49c, 0x1d4d0, 0x1d504, 0x1d538,
    0x1d56c, 0x1d5a0, 0x1d5d4, 0x1d608, 0x1d63c, 0x1d670];
  var DIGITOS = [0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6];
  var AVULSOS = { "ℎ": "h", "ℬ": "B", "ℰ": "E", "ℱ": "F",
    "ℋ": "H", "ℐ": "I", "ℒ": "L", "ℳ": "M", "ℛ": "R",
    "ℯ": "e", "ℊ": "g", "ℴ": "o", "ℭ": "C", "ℌ": "H",
    "ℑ": "I", "ℜ": "R", "ℨ": "Z", "ℂ": "C", "ℍ": "H",
    "ℕ": "N", "ℙ": "P", "ℚ": "Q", "ℝ": "R", "ℤ": "Z" };
  var TROCAS = { "\u00a0": " ", " ": " ", " ": " ", " ": " ",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    "　": " ", " ": " ",
    "‐": "-", "‑": "-", "‒": "-", "⁃": "-", "−": "-",
    "⁄": "/", "­": "", "ʼ": "'", "′": "'", "″": '"',
    "▪": "•", "■": "•", "●": "•", "◦": "•",
    "‣": "•", "∙": "•", "❖": "•", "➢": "•",
    "✓": "-", "✔": "-", "✗": "-",
    "→": "->", "⇒": "=>", "←": "<-",
    "≤": "<=", "≥": ">=", "≠": "!=" };
  var MARCADOR_PUA = [0xf0a7, 0xf0b7, 0xf06c, 0xf0d8, 0xf0fc, 0xf0a8, 0xf075, 0xf09f];
  var EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹"
    + "ŒŽ‘’“”•–—˜™š"
    + "›œžŸ";
  var RE_INVISIVEL = /[​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g;
  var RE_LIMPO = /[^ -~\u00a0-\u00ff\n\r\t]/;

  function desenhaNoPdf(cp) {
    return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)
      || EXTRAS.indexOf(String.fromCharCode(cp)) >= 0;
  }
  function letraSimples(cp) {
    for (var i = 0; i < BLOCOS.length; i++) {
      var d = cp - BLOCOS[i];
      if (d >= 0 && d <= 51) {
        return d < 26 ? String.fromCharCode(65 + d) : String.fromCharCode(97 + (d - 26));
      }
    }
    for (var j = 0; j < DIGITOS.length; j++) {
      var e = cp - DIGITOS[j];
      if (e >= 0 && e <= 9) return String(e);
    }
    return "";
  }

  function limpar(txt) {
    if (typeof txt !== "string" || !txt) return txt || "";
    if (!RE_LIMPO.test(txt)) return txt;                       // já está limpo
    var s = txt.normalize ? txt.normalize("NFC") : txt;
    s = s.replace(RE_INVISIVEL, "");
    var fora = "";
    for (var ch of s) {
      var cp = ch.codePointAt(0);
      if (ch === "\n" || ch === "\r" || ch === "\t" || desenhaNoPdf(cp)) { fora += ch; continue; }
      if (TROCAS[ch] !== undefined) { fora += TROCAS[ch]; continue; }
      var letra = letraSimples(cp) || AVULSOS[ch] || "";
      if (letra) { fora += letra; continue; }
      if (cp >= 0xe000 && cp <= 0xf8ff) {
        fora += MARCADOR_PUA.indexOf(cp) >= 0 ? "•" : "\u0001";
        continue;
      }
      var sem = ch.normalize ? ch.normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
      var cabe = !!sem;
      for (var k = 0; k < sem.length; k++) if (!desenhaNoPdf(sem.charCodeAt(k))) cabe = false;
      fora += cabe ? sem : "\u0001";
    }
    return fora.replace(/ ?\u0001 ?/g, function (m) { return m.indexOf(" ") >= 0 ? " " : ""; });
  }
  window.archeLimparColagem = limpar;

  /* A colagem é interceptada e reinserida limpa. `execCommand` é o que
     preserva o DESFAZER do navegador — trocar o value inteiro apagaria o
     histórico de quem está redigindo há meia hora. */
  function aoColar(ev) {
    var alvo = ev.target;
    if (!alvo || !alvo.tagName) return;
    var tag = alvo.tagName.toLowerCase();
    if (tag !== "textarea" && !(tag === "input" && /^(text|search|)$/i.test(alvo.type || ""))) return;
    var bruto = (ev.clipboardData || window.clipboardData);
    if (!bruto) return;
    var txt = bruto.getData("text/plain");
    var limpo = limpar(txt);
    if (limpo === txt) return;                       // nada a fazer: deixa colar
    ev.preventDefault();
    var ok = false;
    try { ok = document.execCommand("insertText", false, limpo); } catch (e) { ok = false; }
    if (!ok) {
      var i = alvo.selectionStart, f = alvo.selectionEnd, v = alvo.value || "";
      alvo.value = v.slice(0, i) + limpo + v.slice(f);
      alvo.selectionStart = alvo.selectionEnd = i + limpo.length;
    }
    alvo.dispatchEvent(new Event("input", { bubbles: true }));
  }
  document.addEventListener("paste", aoColar, true);
})();
