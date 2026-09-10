/* ========================================================================
   TEXTO RICO — o que o autor escreve no ARCHÉ TR (set/2026).

   Pedido do dono: "inclua a possibilidade de se copiar e colar imagens
   dentro das caixas de texto, e editar negrito, itálico, etc., visto que
   alguns trabalhos precisam disso". Um trabalho científico tem ênfase no
   texto (nome de espécie em itálico, destaque no resultado), fórmula com
   índice e expoente, lista, e — nos completos — gráfico e fotografia da
   coleta. Nada disso cabe num `<textarea>`.

   O que se guarda é HTML SANEADO, e a régua é a mesma da justificativa do
   conceito na Avaliação: **lista de permissão fechada, nenhum atributo
   passa**. Colar do Word traz HTML arbitrário, e guardá-lo para desenhar na
   tela de quem avalia seria pôr código de fora dentro da página do ARCHÉ.
   Sobrevivem a ÊNFASE e a ESTRUTURA — negrito, itálico, sublinhado,
   sobrescrito, subscrito, parágrafo, quebra e lista —, mais a IMAGEM, que é
   a novidade; sai todo o resto (fonte, tamanho, cor, fundo, tabela, link).

   A IMAGEM é a única exceção à regra de "nenhum atributo": ela precisa do
   `src`, e por isso o `src` é conferido contra uma lista fechada — só o
   endereço dos arquivos do PRÓPRIO sistema (`/api/files/<id>`). Imagem de
   fora não entra: ela vazaria o IP de quem abre o trabalho para um servidor
   qualquer, morreria quando o site de origem saísse do ar (e o documento vai
   aos anais) e serviria de rastreador dentro de um PDF institucional. O
   `data:` também não entra — imagem em base64 no meio do texto engordaria o
   arquivo de estado, que é reescrito inteiro a cada gravação; a foto sobe ao
   Drive como as demais artes e aqui fica só a referência.

   Este arquivo é PURO: não conhece DOM, nem rede, nem estado. Ele sabe
   sanear, contar palavras, tirar o texto simples (para a planilha, o e-mail
   e a régua das 200 palavras) e partir o HTML em BLOCOS, que é o que o
   gerador de PDF desenha.
   ======================================================================== */

/** As tags que sobrevivem. Tudo o mais perde a marcação e mantém o texto. */
const PERMITIDAS = new Set(["b", "strong", "i", "em", "u", "sup", "sub", "p", "br", "ul", "ol", "li", "img"]);
/** As que fecham sozinhas (não esperam `</tag>`). */
const VAZIAS = new Set(["br", "img"]);
/* O `src` que se aceita: só arquivo do PRÓPRIO ARCHÉ. O id é opaco no Drive,
   mas é o CAMINHO no modo local e no S3 (a rota é `/api/files/*`), então a
   régua aceita barras e percent-encoding — e recusa `..`, que é o que
   transformaria a referência numa saída da pasta. */
const SRC_VALIDO = /^\/api\/files\/[^"'<>\s?#\\]{1,400}$/;
const srcOk = (s) => SRC_VALIDO.test(s) && !s.includes("..");

/** Teto de tamanho do campo. Não é limite de ESCRITA (o dono decidiu que não
 *  há número máximo de caracteres): é o freio que impede uma colagem
 *  descontrolada de derrubar o arquivo de estado, e cabem umas 80 páginas. */
export const MAX_RICO = 400_000;

const escapar = (s) => String(s)
  .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** O valor de um atributo, com aspas simples, duplas ou sem aspas. */
function atributo(bruto, nome) {
  const re = new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(bruto);
  if (!m) return "";
  return (m[2] ?? m[3] ?? m[4] ?? "").trim();
}

/**
 * Saneia o HTML que veio do navegador. Devolve HTML com as tags da lista de
 * permissão, SEM atributo nenhum — a `img` fica só com `src` (conferido) e
 * `alt`. Texto que chega sem tag nenhuma continua saindo sem tag: o campo
 * antigo, em texto puro, atravessa isto intacto.
 */
export function limparRico(html, { max = MAX_RICO } = {}) {
  const bruto = String(html ?? "");
  if (!bruto) return "";
  const saida = [];
  const pilha = [];          // as tags abertas, para fechar na ordem certa
  const RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;
  let i = 0, m;
  let pulando = "";          // dentro de <script>/<style>: o conteúdo some inteiro
  while ((m = RE.exec(bruto))) {
    const texto = bruto.slice(i, m.index);
    if (texto && !pulando) saida.push(escapar(texto));
    i = RE.lastIndex;
    if (!m[1]) continue;                                  // comentário/CDATA: fora
    const tag = m[1].toLowerCase();
    const fechando = m[0][1] === "/";
    if (tag === "script" || tag === "style") { pulando = fechando ? "" : tag; continue; }
    if (pulando) continue;
    if (!PERMITIDAS.has(tag)) {
      // a marcação sai, o TEXTO fica: um <div> vira nada, e o que estava
      // dentro dele continua no lugar. `div`/`tr` viram quebra de parágrafo,
      // senão duas linhas coladas do Word virariam uma só.
      if (!fechando && (tag === "div" || tag === "tr" || tag === "h1" || tag === "h2" || tag === "h3"
        || tag === "h4" || tag === "h5" || tag === "h6" || tag === "blockquote")) saida.push("<br>");
      if (tag === "td" || tag === "th") saida.push(fechando ? " " : "");
      continue;
    }
    if (VAZIAS.has(tag)) {
      if (fechando) continue;
      if (tag === "br") { saida.push("<br>"); continue; }
      const src = atributo(m[2] || "", "src");
      if (!srcOk(src)) continue;                          // imagem de fora não entra
      const alt = escapar(atributo(m[2] || "", "alt")).slice(0, 200);
      saida.push(`<img src="${src}"${alt ? ` alt="${alt}"` : ""}>`);
      continue;
    }
    if (fechando) {
      const k = pilha.lastIndexOf(tag);
      if (k < 0) continue;                                // fechamento órfão: fora
      while (pilha.length > k) saida.push(`</${pilha.pop()}>`);
      continue;
    }
    // `li` fora de lista, `p` dentro de `p`: o navegador tolera, o desenho não
    if (tag === "p" && pilha.includes("p")) { while (pilha.at(-1) === "p") saida.push(`</${pilha.pop()}>`); }
    if (pilha.length > 24) continue;                       // aninhamento absurdo
    pilha.push(tag);
    saida.push(`<${tag}>`);
  }
  const resto = bruto.slice(i);
  if (resto && !pulando) saida.push(escapar(resto));
  while (pilha.length) saida.push(`</${pilha.pop()}>`);
  return saida.join("").slice(0, max);
}

/** O texto simples: é ele que conta palavras, vai à planilha e ao e-mail. */
export function textoPlano(html) {
  const s = String(html ?? "");
  if (!/[<&]/.test(s)) return s;                           // texto puro: intocado
  return s
    .replace(/<\s*(br|\/p|\/li|\/ul|\/ol|\/div)\s*\/?>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Tem alguma coisa escrita? (a caixa vazia do editor vem como "<p><br></p>") */
export const vazioRico = (html) => textoPlano(html).replace(/\s+/g, "") === "" && !/<img\b/i.test(String(html || ""));

/** Os arquivos que o texto referencia — os ids das imagens coladas. */
export function idsDeImagens(html) {
  const ids = [];
  const re = /<img\b[^>]*\bsrc\s*=\s*"\/api\/files\/([^"]{1,400})"/gi;
  let m;
  while ((m = re.exec(String(html || "")))) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

/* ---------------------------- para o PDF --------------------------------
   O gerador não entende HTML: ele desenha BLOCOS. Cada bloco é um parágrafo,
   um item de lista ou uma imagem, e o parágrafo é uma lista de TRECHOS —
   pedaços de texto com as marcas de ênfase que valem naquele pedaço. É o que
   permite ao PDFKit trocar de fonte no meio da linha (`continued`).
   Texto SEM tag nenhuma (o campo antigo) vira um bloco por linha, que é
   exatamente o que o gerador fazia antes. */

/** Parte o HTML saneado em blocos. */
export function blocosDoRico(html) {
  const s = String(html ?? "");
  if (!s.trim()) return [];
  if (!/<[a-zA-Z/]/.test(s)) {                             // texto puro
    return s.split(/\r?\n/).map((l) => ({ tipo: "p", trechos: l.trim() ? [{ t: l }] : [] }));
  }
  const blocos = [];
  let atual = null;                                        // { tipo, trechos, marcador }
  const marcas = { b: 0, i: 0, u: 0, sup: 0, sub: 0 };
  let lista = [];                                          // pilha de ul/ol, com o contador do ol
  const abrir = (tipo, extra = {}) => { atual = { tipo, trechos: [], ...extra }; blocos.push(atual); };
  const garantir = () => { if (!atual) abrir("p"); return atual; };
  const push = (texto) => {
    const t = texto.replace(/\s+/g, " ");
    if (!t) return;
    const bloco = garantir();
    const ultimo = bloco.trechos.at(-1);
    const marca = { b: !!marcas.b, i: !!marcas.i, u: !!marcas.u, sup: !!marcas.sup, sub: !!marcas.sub };
    if (ultimo && ultimo.t !== undefined && ["b", "i", "u", "sup", "sub"].every((k) => !!ultimo[k] === marca[k]))
      ultimo.t += t;
    else bloco.trechos.push({ t, ...marca });
  };
  const RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let i = 0, m;
  while ((m = RE.exec(s))) {
    push(desescapar(s.slice(i, m.index)));
    i = RE.lastIndex;
    const tag = m[1].toLowerCase();
    const fechando = m[0][1] === "/";
    if (tag === "b" || tag === "strong") marcas.b += fechando ? -1 : 1;
    else if (tag === "i" || tag === "em") marcas.i += fechando ? -1 : 1;
    else if (tag === "u") marcas.u += fechando ? -1 : 1;
    else if (tag === "sup") marcas.sup += fechando ? -1 : 1;
    else if (tag === "sub") marcas.sub += fechando ? -1 : 1;
    else if (tag === "br") { atual = null; blocos.push({ tipo: "p", trechos: [] }); }
    else if (tag === "p") { atual = null; if (!fechando) abrir("p"); }
    else if (tag === "ul" || tag === "ol") {
      atual = null;
      if (fechando) lista.pop();
      else lista.push({ tipo: tag, n: 0 });
    } else if (tag === "li") {
      atual = null;
      if (!fechando) {
        const l = lista.at(-1) || { tipo: "ul", n: 0 };
        l.n += 1;
        abrir("li", { marcador: l.tipo === "ol" ? `${l.n}.` : "•", nivel: Math.max(0, lista.length - 1) });
      }
    } else if (tag === "img" && !fechando) {
      const src = atributo(m[2] || "", "src");
      const id = /^\/api\/files\/(.+)$/.exec(src)?.[1] || "";
      if (id) { atual = null; blocos.push({ tipo: "img", id, alt: desescapar(atributo(m[2] || "", "alt")) }); }
    }
    for (const k of Object.keys(marcas)) if (marcas[k] < 0) marcas[k] = 0;
  }
  push(desescapar(s.slice(i)));
  // parágrafos vazios no fim não desenham nada; no meio, são a linha em branco
  while (blocos.length && blocos.at(-1).tipo === "p" && !blocos.at(-1).trechos.length) blocos.pop();
  return blocos;
}
const desescapar = (s) => String(s || "")
  .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, "&");
