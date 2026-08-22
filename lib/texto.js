/* ==========================================================================
   LIMPEZA DA COLAGEM — o texto que vem do Word, do Google Docs e do PDF
   ==========================================================================

   Achado do dono, ago/2026, na proposta da Campanha Agosto Dourado: o texto
   aparecia certo na tela do ARCHÉ e saía embaralhado no PDF timbrado —
   "•"6öç66–VçF—¦ " vW7F çFW0, puérperas…" no lugar de "Conscientizar
   gestantes, puérperas…".

   As duas coisas são verdadeiras ao mesmo tempo, e é isso que confunde:

     • o NAVEGADOR desenha quase tudo. Ele tem fontes de sobra e, para o que
       não sabe desenhar, põe um quadradinho — o "[]" que aparecia no meio da
       metodologia. A pessoa relê o que colou, vê o texto dela, e submete;

     • o PDF NÃO desenha quase tudo. O documento oficial usa as fontes
       padrão do PDF (Helvetica), que só conhecem o repertório WinAnsi —
       grosso modo, o Latin-1 mais aspas, travessões e o marcador "•". Tudo
       o que estiver fora disso vira lixo na página.

   E o que uma colagem "com formatação" traz de fora desse repertório é mais
   do que parece:

     • LETRAS QUE NÃO SÃO LETRAS. Copiar um trecho em negrito de certos
       editores e PDFs devolve os "alfanuméricos matemáticos" (U+1D400 e
       vizinhos): 𝐂𝐨𝐧𝐬𝐜𝐢𝐞𝐧𝐭𝐢𝐳𝐚𝐫 parece a palavra escrita em negrito, mas
       nenhum daqueles símbolos é a letra C. O navegador desenha; o PDF, não;
     • MARCADORES DE LISTA DO WORD, que são caracteres da área de uso privado
       (Wingdings/Symbol: U+F0A7, U+F0B7, U+F06C). São o "[]" da tela;
     • espaços que não são espaços (NBSP, espaço fino), hifens de várias
       larguras, marcas invisíveis de direção de texto e o BOM.

   Por isso a limpeza acontece no SERVIDOR, na gravação — a tela também
   limpa na colagem, para a pessoa VER o que vai ficar gravado, mas quem
   garante é o servidor: texto que entra por uma aba velha, por uma
   importação ou por qualquer outra porta passa pela mesma régua.

   O que a limpeza NÃO faz: não mexe em acento, não mexe em ç, não corta
   pontuação e não reescreve nada. Ela devolve à forma normal o que já era
   texto e descarta o que não tem como ser impresso. Quando não sabe
   converter, prefere a letra sem acento a deixar um símbolo que o documento
   oficial não sabe desenhar.
   ========================================================================== */

/* ------------------- 1. as letras que não são letras ---------------------- */

/* Cada bloco tem 52 posições: A–Z e depois a–z. Onde o Unicode deixou um
   "buraco" (a letra mora no bloco de Símbolos Semelhantes a Letras), o
   caractere real é outro — e está na tabela AVULSOS logo abaixo. */
const BLOCOS_MATEMATICOS = [
  0x1d400, // negrito                     𝐀
  0x1d434, // itálico                     𝐴
  0x1d468, // negrito itálico             𝑨
  0x1d49c, // script                      𝒜
  0x1d4d0, // script negrito              𝓐
  0x1d504, // gótico                      𝔄
  0x1d538, // vazado                      𝔸
  0x1d56c, // gótico negrito              𝕬
  0x1d5a0, // sem serifa                  𝖠
  0x1d5d4, // sem serifa negrito          𝗔
  0x1d608, // sem serifa itálico          𝘈
  0x1d63c, // sem serifa negrito itálico  𝘼
  0x1d670, // monoespaçado                𝙰
];
const BLOCOS_DIGITOS = [0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6];

// as letras que ficaram fora dos blocos, no bloco de Símbolos Semelhantes
const AVULSOS = new Map(Object.entries({
  "ℎ": "h", "ℬ": "B", "ℰ": "E", "ℱ": "F", "ℋ": "H", "ℐ": "I", "ℒ": "L",
  "ℳ": "M", "ℛ": "R", "ℯ": "e", "ℊ": "g", "ℴ": "o", "ℭ": "C", "ℌ": "H",
  "ℑ": "I", "ℜ": "R", "ℨ": "Z", "ℂ": "C", "ℍ": "H", "ℕ": "N", "ℙ": "P",
  "ℚ": "Q", "ℝ": "R", "ℤ": "Z", "ℾ": "G", "ℼ": "p", "ℿ": "P", "⅀": "S",
}));

/** A letra comum por trás do símbolo matemático — "" quando não é um. */
export function letraSimples(cp) {
  for (const base of BLOCOS_MATEMATICOS) {
    const d = cp - base;
    if (d < 0 || d > 51) continue;
    return d < 26
      ? String.fromCharCode(65 + d)
      : String.fromCharCode(97 + (d - 26));
  }
  for (const base of BLOCOS_DIGITOS) {
    const d = cp - base;
    if (d >= 0 && d <= 9) return String(d);
  }
  return "";
}

/* ------------------- 2. o repertório que o PDF sabe desenhar --------------- */

/* WinAnsi (CP1252) é o que as fontes padrão do PDF conhecem: o Latin-1
   inteiro mais os 27 caracteres da faixa 0x80–0x9F — as aspas curvas, os
   travessões, o marcador "•", as reticências. Fora daqui, o documento
   oficial desenha lixo, e é essa a fronteira que a limpeza defende. */
const EXTRAS_WINANSI = "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178";
const NO_WINANSI = new Set([...EXTRAS_WINANSI].map((c) => c.codePointAt(0)));
export const desenhaNoPdf = (cp) =>
  (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || NO_WINANSI.has(cp);

/* ------------------- 3. o que se troca antes de descartar ------------------ */

// espaços que não são o espaço comum, e traços/aspas de larguras exóticas
const TROCAS = new Map([
  // espaços que não são o espaço comum (NBSP, fino, de tabela, ideográfico…)
  ["\u00a0", " "], ["\u1680", " "], ["\u2000", " "], ["\u2001", " "], ["\u2002", " "],
  ["\u2003", " "], ["\u2004", " "], ["\u2005", " "], ["\u2006", " "], ["\u2007", " "],
  ["\u2008", " "], ["\u2009", " "], ["\u200a", " "], ["\u202f", " "], ["\u205f", " "],
  ["\u3000", " "],
  // hifens e traços de larguras exóticas
  ["\u2010", "-"], ["\u2011", "-"], ["\u2012", "-"], ["\u2043", "-"], ["\u2212", "-"],
  ["\u2044", "/"], ["\u00ad", ""],
  // aspas e apóstrofos que o WinAnsi não tem
  ["\u02bc", "'"], ["\u2032", "'"], ["\u2033", '"'],
  // marcadores de lista que não são o "\u2022" do WinAnsi
  ["\u25aa", "\u2022"], ["\u25a0", "\u2022"], ["\u25cf", "\u2022"], ["\u25e6", "\u2022"],
  ["\u2023", "\u2022"], ["\u2219", "\u2022"], ["\u2756", "\u2022"], ["\u27a2", "\u2022"],
  ["\u2713", "-"], ["\u2714", "-"], ["\u2717", "-"],
  // símbolos de texto corrente
  ["\u2192", "->"], ["\u21d2", "=>"], ["\u2190", "<-"],
  ["\u2264", "<="], ["\u2265", ">="], ["\u2260", "!="],
]);

// invisíveis: marcas de direção, junções, largura zero e o BOM
const RE_INVISIVEL = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/* Área de uso PRIVADO: é onde vivem os marcadores do Wingdings/Symbol que o
   Word cola junto com a lista. Não têm significado fora da fonte que os
   desenha — os de marcador viram "•", os demais saem. */
const PUA_MARCADOR = new Set([0xf0a7, 0xf0b7, 0xf06c, 0xf0d8, 0xf0fc, 0xf0a8, 0xf075, 0xf09f]);
/* marca interna do lugar de onde um caractere impresentável saiu — some no
   fim, junto com o espaço que ficaria sobrando */
const SUMIU = "\u0001";
const ehPua = (cp) => (cp >= 0xe000 && cp <= 0xf8ff)
  || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd);

/* ------------------------------ 4. a limpeza ------------------------------ */

/**
 * Devolve o texto pronto para ser gravado e impresso: sem os caracteres que
 * o PDF não sabe desenhar, e sem perder nada do que era texto de verdade.
 * Preserva quebras de linha, tabulações, acentos e pontuação.
 */
export function limparColagem(valor) {
  if (typeof valor !== "string" || !valor) return valor === 0 ? valor : (valor || "");
  /* Caminho rápido: a esmagadora maioria dos textos do ARCHÉ já está no
     repertório do PDF, e a limpeza roda em TODA gravação e em TODA linha de
     documento. Uma varredura de regex resolve esses casos sem entrar no
     laço caractere a caractere. */
  if (!/[^ -~ -ÿ\n\r\t]/.test(valor)) return valor;
  let s = valor.normalize("NFC").replace(RE_INVISIVEL, "");
  let fora = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === "\n" || ch === "\r" || ch === "\t") { fora += ch; continue; }
    if (desenhaNoPdf(cp)) { fora += ch; continue; }

    const troca = TROCAS.get(ch);
    if (troca !== undefined) { fora += troca; continue; }

    const letra = letraSimples(cp) || AVULSOS.get(ch) || "";
    if (letra) { fora += letra; continue; }

    if (ehPua(cp)) { fora += PUA_MARCADOR.has(cp) ? "•" : SUMIU; continue; }

    /* A REDE QUE NÃO DEPENDE DE CATÁLOGO (achado do dono, ago/2026: o defeito
       da Agosto Dourado sobreviveu à primeira correção). A tabela de blocos
       acima cobre o que se conhece, e o Unicode tem mais formas de escrever
       uma letra do que cabe numa lista — matemáticos de outras faixas,
       letras em círculo, de largura inteira, ligaduras, dígitos decorados.
       Todas elas trazem a letra real declarada pelo PRÓPRIO Unicode, na
       decomposição de compatibilidade: `"𝗖".normalize("NFKD")` devolve "C".
       Isto não é adivinhação nem reescrita — é ler o que o padrão afirma.

       Só roda em quem JÁ não desenha no PDF, então acento e ç nunca passam
       por aqui (eles desenham, e o NFKD os partiria em letra + acento). */
    const compat = ch.normalize("NFKD");
    if (compat !== ch) {
      if ([...compat].every((c) => desenhaNoPdf(c.codePointAt(0)))) { fora += compat; continue; }
      const compatSem = compat.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (compatSem && [...compatSem].every((c) => desenhaNoPdf(c.codePointAt(0)))) {
        fora += compatSem; continue;
      }
    }

    /* último recurso: a letra sem o acento. É melhor "Goiania" do que um
       símbolo que o documento oficial não desenha — mas isto quase nunca
       roda, porque o português cabe inteiro no repertório acima. */
    const sem = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    fora += [...sem].every((c) => desenhaNoPdf(c.codePointAt(0))) ? sem : SUMIU;
  }
  /* O que SUMIU costuma estar entre dois espaços (era um símbolo isolado), e
     deixar os dois deixaria um buraco no meio da frase. A marca some junto
     com um dos espaços — e só ali: colapsar espaços no texto inteiro
     desfaria recuo e alinhamento que a pessoa digitou de propósito. */
  return fora.replace(/ ?\u0001 ?/g, (m) => (m.includes(" ") ? " " : ""))
    .replace(/[ \t]+$/gm, "");
}

/** O texto tem algo que o PDF não desenharia? (é o que a tela avisa) */
export function temColagemSuja(valor) {
  if (typeof valor !== "string" || !valor) return false;
  for (const ch of valor.normalize("NFC")) {
    const cp = ch.codePointAt(0);
    if (ch === "\n" || ch === "\r" || ch === "\t") continue;
    if (!desenhaNoPdf(cp)) return true;
  }
  return false;
}

/**
 * Limpa TODO texto de um objeto, entrando em listas e objetos aninhados.
 * É o que a gravação usa: campo novo no formulário já nasce protegido, sem
 * ninguém precisar lembrar de acrescentá-lo a uma lista.
 *
 * `pular` traz as chaves que não se toca — as imagens em base64, que não são
 * texto e cujo conteúdo a limpeza destruiria.
 */
const PULAR_PADRAO = new Set(["base64", "capa", "foto", "logo", "assinatura", "chaveQr", "token"]);
export function limparProfundo(valor, pular = PULAR_PADRAO) {
  if (typeof valor === "string") return limparColagem(valor);
  if (Array.isArray(valor)) return valor.map((v) => limparProfundo(v, pular));
  if (valor && typeof valor === "object") {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = pular.has(k) ? v : limparProfundo(v, pular);
    return out;
  }
  return valor;
}
