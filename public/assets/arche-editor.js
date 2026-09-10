/* ==========================================================================
   ARCHÉ · EDITOR DE TEXTO RICO (set/2026)

   Pedido do dono, no ARCHÉ TR: "inclua a possibilidade de se copiar e colar
   imagens dentro das caixas de texto, e editar negrito, itálico, etc., visto
   que alguns trabalhos precisam disso".

   O componente se põe POR CIMA de um <textarea> que já existe, em vez de
   substituí-lo — a mesma escolha do campo rico da Avaliação. O textarea
   continua no DOM, escondido, e recebe o HTML a cada tecla: quem já lia
   `campo.value` continua lendo, o `form` continua o mesmo, e a gravação segue
   pelo caminho de sempre. Ligar o editor numa tela é uma linha.

   O que sobrevive à colagem é o que o SERVIDOR aceita (lib/richtext.js):
   negrito, itálico, sublinhado, sobrescrito, subscrito, parágrafo, quebra,
   lista e imagem. Fonte, tamanho, cor, fundo, tabela e link saem — colar do
   Word traz HTML arbitrário, e o que se quer preservar é a ÊNFASE que a
   pessoa escolheu, não o tema do editor dela. A limpeza acontece TAMBÉM aqui,
   na colagem, para a pessoa VER o que vai ficar gravado: sem isso o defeito
   só apareceria dias depois, no PDF.

   A IMAGEM colada sobe na hora para o sistema (`subirImagem`) e o que entra
   no texto é a referência `/api/files/<id>` — imagem em base64 dentro do
   campo engordaria o arquivo de estado, que é reescrito inteiro a cada
   gravação. Enquanto sobe, a figura aparece esmaecida; falhando, ela sai e o
   aviso explica por quê.
   ========================================================================== */
(function () {
  "use strict";
  if (window.ArcheEditor) return;

  var PERMITIDAS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, SUP: 1, SUB: 1, P: 1, BR: 1, UL: 1, OL: 1, LI: 1, IMG: 1 };
  var BLOCOS = { P: 1, UL: 1, OL: 1, LI: 1, DIV: 1 };

  /* O estilo mora aqui: a tela que chama não precisa saber de nada. */
  function estilo() {
    if (document.getElementById("arche-editor-css")) return;
    var s = document.createElement("style");
    s.id = "arche-editor-css";
    s.textContent = [
      ".aed{border:1px solid var(--line,#dde4e8);border-radius:10px;background:#fff;overflow:hidden;margin-top:4px}",
      ".aed:focus-within{border-color:var(--accent,#40717e);box-shadow:0 0 0 3px rgba(64,113,126,.12)}",
      ".aed-bar{display:flex;flex-wrap:wrap;gap:2px;padding:5px 6px;border-bottom:1px solid var(--line,#dde4e8);background:var(--wash,#f4f7f9)}",
      ".aed-bar button{appearance:none;border:1px solid transparent;background:transparent;border-radius:7px;cursor:pointer;",
      "  min-width:30px;height:28px;padding:0 7px;font-size:13px;color:var(--ink-soft,#41525e);font-family:inherit;line-height:1}",
      ".aed-bar button:hover{background:#fff;border-color:var(--line,#dde4e8)}",
      ".aed-bar button.on{background:var(--accent-wash,#e6f5fa);border-color:var(--accent,#40717e);color:var(--brand,#1c3742)}",
      ".aed-bar .sep{width:1px;background:var(--line,#dde4e8);margin:3px 4px}",
      ".aed-cx{padding:11px 13px;min-height:120px;max-height:60vh;overflow:auto;font-size:14px;line-height:1.65;color:var(--ink,#182632);outline:0}",
      ".aed-cx:empty:before{content:attr(data-vazio);color:var(--muted,#657179)}",
      ".aed-cx p{margin:0 0 9px}.aed-cx p:last-child{margin-bottom:0}",
      ".aed-cx ul,.aed-cx ol{margin:0 0 9px;padding-left:22px}.aed-cx li{margin:2px 0}",
      ".aed-cx img{max-width:100%;height:auto;border-radius:6px;display:block;margin:8px auto}",
      ".aed-cx img.subindo{opacity:.45;filter:grayscale(1)}",
      ".aed-msg{font-size:12px;padding:0 13px 8px;color:var(--err,#b4232c)}",
      ".aed-pe{font-size:11.5px;color:var(--muted,#657179);padding:0 13px 8px}",
    ].join("\n");
    document.head.appendChild(s);
  }

  /* Ícones em SVG: emoji e símbolo raro saem como QUADRADO em parte dos
     sistemas, e um botão que não se lê não se usa. */
  var SVGA = 'viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  var SVG_LIMPAR = '<svg ' + SVGA + '><path d="M4 13h8M3.5 9.5l5-5a1.5 1.5 0 0 1 2 0l1 1a1.5 1.5 0 0 1 0 2l-5 5-3-3z"/></svg>';
  var SVG_IMAGEM = '<svg ' + SVGA + '><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1"/><path d="M2.5 11.5l3.5-3 2.5 2 2-1.5 3 3"/></svg>';

  /* ---------------------- a limpeza, no NAVEGADOR ------------------------
     Espelha a régua do servidor. Não é ela que protege (quem protege é o
     servidor, que refaz tudo): é o que faz a pessoa VER, na hora, o que vai
     ficar gravado. */
  function limpar(no, saida) {
    for (var f = no.firstChild; f; f = f.nextSibling) {
      if (f.nodeType === 3) { saida.push(esc(f.nodeValue)); continue; }
      if (f.nodeType !== 1) continue;
      var tag = f.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") continue;
      if (tag === "IMG") { saida.push(imgHtml(f)); continue; }
      if (tag === "BR") { saida.push("<br>"); continue; }
      if (!PERMITIDAS[tag]) {
        // a marcação sai e o texto fica; bloco vira quebra, para duas linhas
        // do Word não virarem uma só
        var dentro = [];
        limpar(f, dentro);
        var t = dentro.join("");
        saida.push(BLOCOS[tag] && t ? "<p>" + t + "</p>" : t);
        continue;
      }
      var nome = { STRONG: "b", EM: "i" }[tag] || tag.toLowerCase();
      var dentro2 = [];
      limpar(f, dentro2);
      var texto = dentro2.join("");
      if (!texto && nome !== "li" && nome !== "p") continue;      // <b></b> vazio some
      saida.push("<" + nome + ">" + texto + "</" + nome + ">");
    }
    return saida;
  }
  function imgHtml(el) {
    var src = el.getAttribute("src") || "";
    if (!/^\/api\/files\//.test(src) || src.indexOf("..") >= 0) return "";
    var alt = (el.getAttribute("alt") || "").slice(0, 200);
    return '<img src="' + esc(src) + '"' + (alt ? ' alt="' + esc(alt) + '"' : "") + ">";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function limparHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "");
    return limpar(d, []).join("");
  }

  /* -------------------------------- a barra ------------------------------ */
  var BOTOES = [
    { cmd: "bold", rot: "<b>B</b>", tit: "Negrito (Ctrl+B)" },
    { cmd: "italic", rot: "<i>I</i>", tit: "Itálico (Ctrl+I)" },
    { cmd: "underline", rot: "<u>S</u>", tit: "Sublinhado (Ctrl+U)" },
    { sep: 1 },
    { cmd: "superscript", rot: "x²", tit: "Sobrescrito" },
    { cmd: "subscript", rot: "x₂", tit: "Subscrito" },
    { sep: 1 },
    { cmd: "insertUnorderedList", rot: "&bull;&mdash;", tit: "Lista com marcadores" },
    { cmd: "insertOrderedList", rot: "1.", tit: "Lista numerada" },
    { sep: 1 },
    { cmd: "removeFormat", rot: SVG_LIMPAR, tit: "Limpar a formatação do trecho selecionado" },
  ];

  function montar(alvo, opcoes) {
    estilo();
    var op = opcoes || {};
    var ta = typeof alvo === "string" ? document.getElementById(alvo) : alvo;
    if (!ta || ta.dataset.aed === "1") return null;
    ta.dataset.aed = "1";
    ta.style.display = "none";

    var cx = document.createElement("div");
    cx.className = "aed";
    var bar = document.createElement("div");
    bar.className = "aed-bar";
    var cp = document.createElement("div");
    cp.className = "aed-cx";
    cp.contentEditable = "true";
    cp.setAttribute("role", "textbox");
    cp.setAttribute("aria-multiline", "true");
    if (op.vazio) cp.setAttribute("data-vazio", op.vazio);
    if (ta.getAttribute("aria-label")) cp.setAttribute("aria-label", ta.getAttribute("aria-label"));
    var msg = document.createElement("div");
    msg.className = "aed-msg";
    var pe = document.createElement("div");
    pe.className = "aed-pe";
    pe.textContent = op.subirImagem
      ? "Negrito, itálico, listas e imagens — cole ou arraste a figura direto no texto. Não há limite de tamanho."
      : "Negrito, itálico e listas. Não há limite de tamanho.";

    BOTOES.forEach(function (b) {
      if (b.sep) { var s = document.createElement("span"); s.className = "sep"; bar.appendChild(s); return; }
      var el = document.createElement("button");
      el.type = "button"; el.innerHTML = b.rot; el.title = b.tit; el.dataset.cmd = b.cmd;
      el.addEventListener("mousedown", function (e) { e.preventDefault(); });  // não perder a seleção
      el.addEventListener("click", function () { document.execCommand(b.cmd, false, null); cp.focus(); sincronizar(); marcar(); });
      bar.appendChild(el);
    });
    if (op.subirImagem) {
      var img = document.createElement("button");
      img.type = "button"; img.innerHTML = SVG_IMAGEM; img.title = "Inserir imagem (ou cole a figura direto no texto)";
      img.addEventListener("mousedown", function (e) { e.preventDefault(); });
      img.addEventListener("click", function () { escolher.click(); });
      bar.appendChild(img);
    }
    var escolher = document.createElement("input");
    escolher.type = "file"; escolher.accept = "image/*"; escolher.style.display = "none";
    escolher.addEventListener("change", function () {
      var f = escolher.files && escolher.files[0];
      escolher.value = "";
      if (f) inserirImagem(f);
    });

    cx.appendChild(bar); cx.appendChild(cp); cx.appendChild(msg); cx.appendChild(pe); cx.appendChild(escolher);
    ta.parentNode.insertBefore(cx, ta);
    cp.innerHTML = limparHtml(paraHtml(ta.value));

    function aviso(t) {
      msg.textContent = t || "";
      if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 9000);
    }
    function sincronizar() {
      var html = limparHtml(cp.innerHTML);
      if (ta.value !== html) {
        ta.value = html;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (op.aoMudar) op.aoMudar(html);
    }
    function marcar() {
      bar.querySelectorAll("button[data-cmd]").forEach(function (b) {
        var on = false;
        try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { on = false; }
        b.classList.toggle("on", !!on);
      });
    }

    /* A IMAGEM: entra esmaecida e só vira definitiva quando o servidor
       devolve o endereço. Falhando, ela SAI — figura que fica na tela e não
       está gravada é a pior das saídas. */
    function inserirImagem(arquivo) {
      if (!op.subirImagem) return;
      if (!/^image\//.test(arquivo.type || "")) { aviso("Só imagens (JPEG, PNG, WebP ou GIF)."); return; }
      var marca = "aed-" + Math.random().toString(36).slice(2, 10);
      var provisoria = '<img class="subindo" data-marca="' + marca + '" src="' + URL.createObjectURL(arquivo) + '">';
      document.execCommand("insertHTML", false, provisoria);
      var el = cp.querySelector('img[data-marca="' + marca + '"]');
      op.subirImagem(arquivo).then(function (url) {
        var alvoImg = cp.querySelector('img[data-marca="' + marca + '"]');
        if (!alvoImg) return;
        alvoImg.setAttribute("src", url);
        alvoImg.removeAttribute("class");
        alvoImg.removeAttribute("data-marca");
        sincronizar();
      }).catch(function (e) {
        var alvoImg = cp.querySelector('img[data-marca="' + marca + '"]');
        if (alvoImg) alvoImg.remove();
        aviso((e && e.message) || "Não foi possível enviar a imagem.");
        sincronizar();
      });
      if (el) sincronizar();
    }

    cp.addEventListener("paste", function (e) {
      var dt = e.clipboardData;
      if (!dt) return;
      // 1) imagem na área de transferência (print, foto, figura do Word)
      var arquivos = [];
      for (var i = 0; i < (dt.files || []).length; i++) if (/^image\//.test(dt.files[i].type)) arquivos.push(dt.files[i]);
      if (arquivos.length) {
        e.preventDefault();
        arquivos.forEach(inserirImagem);
        return;
      }
      // 2) HTML: entra LIMPO, e as imagens de fora (data:, blob:, http) sobem
      e.preventDefault();
      var html = dt.getData("text/html");
      if (html) {
        var d = document.createElement("div");
        d.innerHTML = html;
        var externas = [];
        d.querySelectorAll("img").forEach(function (im) {
          var src = im.getAttribute("src") || "";
          if (/^\/api\/files\//.test(src)) return;
          externas.push(src);
          im.parentNode.removeChild(im);
        });
        document.execCommand("insertHTML", false, limparHtml(d.innerHTML));
        if (externas.length && op.subirImagem) baixarEInserir(externas);
        else if (externas.length) aviso("A imagem colada não entrou — use o botão 🖼 para enviá-la.");
      } else {
        var texto = dt.getData("text/plain") || "";
        document.execCommand("insertHTML", false, limparHtml(paraHtml(texto)));
      }
      sincronizar();
    });
    /* A figura colada do Word/Docs vem como `data:` ou `blob:` no HTML — o
       navegador consegue lê-la, então ela sobe como se tivesse sido escolhida
       pelo botão. `http(s)` de outro site não se baixa (o navegador barraria
       por CORS, e o que se quer é uma cópia nossa, não um link que morre). */
    function baixarEInserir(lista) {
      lista.forEach(function (src) {
        if (!/^(data:|blob:)/.test(src)) { aviso("Imagem de outro site não entra — salve-a e use o botão 🖼."); return; }
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
          inserirImagem(new File([b], "imagem.png", { type: b.type || "image/png" }));
        }).catch(function () { aviso("Não foi possível ler a imagem colada — use o botão 🖼."); });
      });
    }
    cp.addEventListener("drop", function (e) {
      var fs = (e.dataTransfer && e.dataTransfer.files) || [];
      var imgs = [];
      for (var i = 0; i < fs.length; i++) if (/^image\//.test(fs[i].type)) imgs.push(fs[i]);
      if (!imgs.length) return;
      e.preventDefault();
      imgs.forEach(inserirImagem);
    });
    cp.addEventListener("input", sincronizar);
    cp.addEventListener("blur", sincronizar);
    cp.addEventListener("keyup", marcar);
    cp.addEventListener("mouseup", marcar);

    return {
      ler: function () { return limparHtml(cp.innerHTML); },
      por: function (html) { cp.innerHTML = limparHtml(paraHtml(html)); sincronizar(); },
      foco: function () { cp.focus(); },
    };
  }

  /** Texto puro (o campo antigo) vira parágrafos; HTML passa direto. */
  function paraHtml(v) {
    var s = String(v == null ? "" : v);
    if (/<[a-zA-Z/]/.test(s)) return s;
    if (!s.trim()) return "";
    return s.split(/\n{2,}/).map(function (p) {
      return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /** O texto sem marcação — é ele que se conta e se mostra em lista. */
  function texto(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "");
    d.querySelectorAll("br,p,li,ul,ol").forEach(function (el) { el.insertAdjacentText("afterend", "\n"); });
    return (d.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  window.ArcheEditor = { montar: montar, limpar: limparHtml, texto: texto, paraHtml: paraHtml };
})();
