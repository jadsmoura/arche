/* =======================================================================
   ARCHÉ Avaliação — A JUSTIFICATIVA DO CONCEITO É DE UM CURSO SÓ, E DIZ
   QUANDO NÃO GRAVA.

   Achado do dono, ago/2026: "acabei de atualizar o texto da justificativa
   do conceito e parece que não está salvando".

   Não estava mesmo, e por dois motivos independentes — os dois no append
   que injeta o campo (`JUSTIFICATIVA CONCEITO INJECT`, no fim de cada
   página de avaliação).

   1. A CHAVE É UMA SÓ PARA OS DOZE CURSOS.

      `STORAGE_KEY = "justificativas-conceito-v1"` está escrito igual nas
      doze páginas, e o que se guarda ali é um mapa por INDICADOR — "2.1",
      "3.4". Ou seja: a justificativa do indicador 2.1 de Psicologia e a do
      2.1 de Enfermagem são a MESMA gaveta. Quem escreve por último apaga o
      texto do outro curso, sem aviso e sem rastro — e, como as duas telas
      leem a mesma gaveta, o texto de um curso aparece no outro como se
      fosse dele.

      Num documento que sustenta o conceito de cada curso perante o MEC,
      isso é o defeito mais caro possível: a justificativa que o avaliador
      lê pode ser a de outro curso.

   2. A GRAVAÇÃO MANDA O MAPA INTEIRO DA ABA, E FALHA CALADA.

      `saveState()` faz PUT do `justState` que está na memória DAQUELA aba,
      por cima de tudo. Duas abas abertas, e a última a gravar devolve o
      registro ao estado em que ele estava quando ela carregou. E, quando o
      PUT é recusado — o caso comum é o SELO DE VISUALIZAÇÃO, que fica
      guardado no navegador de quem abriu `arche.app.br/avaliador` uma vez
      e faz o ARCHÉ recusar toda escrita —, o erro morre num
      `console.warn`: a pessoa digita, sai da tela e só descobre depois.

   A CORREÇÃO NÃO TOCA NO APP NEM NO APPEND ANTIGO. Ela se põe entre eles e
   o servidor, no `fetch`:

     - GRAVAR passa a escrever na chave DO CURSO
       (`justificativas-conceito-<curso>-v1`), relendo antes o que está lá
       e mesclando indicador a indicador — a aba manda o que ela mudou, não
       um retrato do mundo;
     - LER passa a ler a chave do curso e, **só enquanto ela não existe**,
       cai na antiga. É o que faz a separação acontecer sem ninguém perder
       o texto que já está na tela: o curso continua exibindo o que exibia,
       e passa a ter gaveta própria na primeira gravação;
     - a chave antiga NUNCA MAIS É ESCRITA. Ela fica como estava, de onde
       se lê o que sobreviveu à mistura.

   E a tela passa a DIZER: um selo no canto com a hora do último
   salvamento, e uma faixa quando a gravação é recusada — nomeando o selo
   de visualização quando é ele, com o caminho para sair dessa situação.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeJust) return;
  window.__archeJust = true;

  var ANTIGA = "justificativas-conceito-v1";

  /* O curso sai do endereço. Psicologia mora um nível acima (`/avaliacao/`),
     que é como o app compilado foi publicado — por isso o padrão. */
  function curso() {
    var m = location.pathname.match(/\/arche\/avaliacao\/([^/]+)\//);
    var c = m && m[1] ? m[1] : "";
    return (!c || c.indexOf(".") >= 0) ? "psicologia" : c;
  }
  var NOVA = "justificativas-conceito-" + curso() + "-v1";

  /* ------------------------------ a tela ------------------------------- */
  var CSS = ""
    + "#ajSelo{position:fixed;right:14px;bottom:14px;z-index:9999;border-radius:999px;"
    + "padding:7px 14px;font-size:12.5px;font-family:inherit;font-weight:600;"
    + "border:1px solid #cfeeda;background:#eaf7ef;color:#1f6b45;"
    + "box-shadow:0 6px 18px rgba(18,38,50,.14)}"
    + "#ajSelo.aj-mal{border-color:#eed6d3;background:#fdeeec;color:#8c2f22}"
    + "#ajFaixa{position:fixed;left:14px;right:14px;bottom:56px;z-index:9999;max-width:640px;"
    + "margin:0 auto;border-radius:10px;padding:11px 14px;font-size:13.5px;line-height:1.5;"
    + "font-family:inherit;border:1px solid #eed6d3;background:#fdeeec;color:#8c2f22;"
    + "box-shadow:0 8px 24px rgba(18,38,50,.16)}"
    + "#ajFaixa a{color:inherit;font-weight:700}"
    + "#ajFaixa .aj-x{float:right;background:none;border:0;font-size:17px;line-height:1;"
    + "cursor:pointer;color:inherit;opacity:.65;padding:0 2px}";

  function css() {
    if (document.getElementById("ajEstilo")) return;
    var st = document.createElement("style");
    st.id = "ajEstilo"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function selo(txt, mal) {
    css();
    var el = document.getElementById("ajSelo");
    if (!el) { el = document.createElement("div"); el.id = "ajSelo"; document.body.appendChild(el); }
    el.className = mal ? "aj-mal" : "";
    el.textContent = txt;
  }

  function faixa(html) {
    css();
    var el = document.getElementById("ajFaixa");
    if (!el) { el = document.createElement("div"); el.id = "ajFaixa"; document.body.appendChild(el); }
    el.innerHTML = '<button class="aj-x" title="Fechar" onclick="this.parentNode.remove()">×</button>' + html;
  }
  function limparFaixa() {
    var el = document.getElementById("ajFaixa");
    if (el) el.remove();
  }

  function hora() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
  }

  /* Quem recusou pode ser o selo de VISUALIZAÇÃO — ele gruda no navegador
     desde a primeira visita ao /avaliador, e depois recusa toda escrita
     mesmo entrando pelo endereço normal. Vale a pena dizer o nome disso. */
  function explicarRecusa(status) {
    faixa("<b>A justificativa não foi salva.</b> O texto continua na tela, mas não chegou ao "
      + "servidor (erro " + status + "). Não feche a página.");
    if (status !== 403) return;
    fetch("/api/av/quem").then(function (r) { return r.json(); }).then(function (q) {
      if (!q || q.via !== "avaliador" || q.logado) return;
      faixa("<b>A justificativa não foi salva: este navegador está com o selo de "
        + "VISUALIZAÇÃO.</b> Ele fica guardado desde a primeira vez que se abre "
        + "<b>arche.app.br/avaliador</b>, e com ele o ARCHÉ recusa toda gravação — inclusive "
        + "aqui, mesmo entrando pelo endereço normal. "
        + '<a href="/entrar?next=' + encodeURIComponent(location.pathname + location.search)
        + '">Entre no portal</a> e recarregue esta página; o texto ainda está na tela.');
    }).catch(function () { /* sem rede: fica o aviso acima */ });
  }

  /* ----------------------------- o servidor ---------------------------- */
  var _fetch = window.fetch.bind(window);
  var fila = Promise.resolve();

  function ler(chave) {
    return _fetch("/api/estado?chave=" + encodeURIComponent(chave)).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      if (!d || !d.value) return null;
      try { return JSON.parse(d.value); } catch (e) { return null; }
    }).catch(function () { return null; });
  }

  function gravar(mapaDaAba) {
    /* Fila: duas gravações seguidas leriam o mesmo registro, e a segunda
       desfaria a primeira — é o mesmo cuidado do dossiê. */
    fila = fila.then(function () {
      selo("salvando…");
      return ler(NOVA).then(function (servidor) {
        var saida = servidor || {};
        // a aba manda o que ela mudou; o que ela nunca viu fica como está
        Object.keys(mapaDaAba || {}).forEach(function (k) { saida[k] = mapaDaAba[k]; });
        return _fetch("/api/estado", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chave: NOVA, valor: JSON.stringify(saida) }),
        });
      }).then(function (r) {
        if (!r || !r.ok) { selo("✗ não salvo", true); explicarRecusa(r ? r.status : "sem resposta"); return r; }
        limparFaixa(); selo("✓ justificativa salva " + hora());
        return r;
      }).catch(function (e) {
        selo("✗ não salvo", true);
        faixa("<b>A justificativa não foi salva.</b> O texto continua na tela, mas não chegou ao "
          + "servidor. Confira a conexão e digite qualquer coisa para tentar de novo. ("
          + ((e && e.message) || e) + ")");
        return new Response("{}", { status: 599 });
      });
    });
    return fila;
  }

  /* O append antigo continua chamando `/api/estado` com a chave partilhada.
     Aqui esse pedido é redirecionado — ele não sabe, e não precisa saber. */
  window.fetch = function (entrada, init) {
    try {
      var url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
      var metodo = String((init && init.method) || (entrada && entrada.method) || "GET").toUpperCase();

      if (metodo === "GET" && url.indexOf("chave=" + encodeURIComponent(ANTIGA)) >= 0) {
        return ler(NOVA).then(function (doCurso) {
          // enquanto o curso não tem gaveta própria, vale a antiga: assim
          // ninguém perde de vista o texto que já estava na tela
          if (doCurso) return new Response(JSON.stringify({ value: JSON.stringify(doCurso) }),
            { status: 200, headers: { "Content-Type": "application/json" } });
          return _fetch(entrada, init);
        });
      }

      if (metodo === "PUT" && url.indexOf("/api/estado") >= 0 && init && typeof init.body === "string") {
        var corpo = null;
        try { corpo = JSON.parse(init.body); } catch (e) { corpo = null; }
        if (corpo && corpo.chave === ANTIGA) {
          var mapa = null;
          try { mapa = JSON.parse(corpo.valor); } catch (e) { mapa = null; }
          if (mapa && typeof mapa === "object") return gravar(mapa);
        }
      }
    } catch (x) { /* qualquer dúvida: deixa passar como estava */ }
    return _fetch(entrada, init);
  };

  /* ===================================================================
     O NEGRITO DA COLAGEM SOBREVIVE (pedido do dono, ago/2026: "colo o
     texto com algumas marcações em negrito e gostaria que a formatação
     fosse e ficasse salva").

     O campo é um `<textarea>`, e textarea não guarda formatação nenhuma —
     o negrito do Word morre na colagem, antes mesmo de chegar ao servidor.

     A troca é por um campo RICO, e ele se põe POR CIMA do antigo em vez de
     substituí-lo: o textarea continua no DOM, escondido, porque é NELE que
     o append original escutou `input` e `blur` para guardar o texto. O
     campo rico escreve o HTML no textarea e dispara os mesmos eventos —
     o código antigo continua funcionando sem saber que mudou de vizinho, e
     a gravação segue pelo caminho já corrigido (chave do curso, mescla,
     fila, aviso na tela).

     O QUE SOBREVIVE, e é uma lista curta de propósito: **negrito, itálico,
     sublinhado, quebras de linha e listas**. Sai TODO o resto — fonte,
     tamanho, cor, fundo, tabelas, imagens, links. Duas razões:

       1. SEGURANÇA. Colar do Word ou do Google Docs traz HTML arbitrário.
          Guardar isso e desenhar como HTML na tela do avaliador seria pôr
          código de fora dentro da página do ARCHÉ. O que entra passa por
          uma lista de permissão fechada, sem NENHUM atributo — nem
          `style`, nem `class`, nem `href`;
       2. O DOCUMENTO. A justificativa vai ao MEC dentro do dossiê do
          curso: a fonte Calibri 11 azul que veio colada do Word não deve
          decidir a aparência do indicador. O que se quer preservar é a
          ÊNFASE que a pessoa escolheu, não o tema do editor dela.

     O `<span style="font-weight:700">` que o Google Docs cola é lido e
     convertido em `<b>` — senão o negrito da colagem se perderia
     justamente no caso mais comum.
     =================================================================== */
  var PERMITIDAS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, P: 1, UL: 1, OL: 1, LI: 1, SUP: 1, SUB: 1 };
  var TEM_TAG = /<(b|strong|i|em|u|br|p|ul|ol|li|sup|sub)\b[^>]*>/i;
  /* Tags que não sobrevivem mas separam blocos de texto: o conteúdo delas
     fica, e precisa continuar separado. */
  var BLOCOS = { TD: 1, TH: 1, TR: 1, TABLE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1 };

  function escapar(t) {
    var d = document.createElement("div");
    d.textContent = String(t == null ? "" : t);
    return d.innerHTML;
  }

  /* O que o editor de fora manda como `style` e aqui vira marcação real. */
  function daEstilo(el) {
    var s = "";
    try { s = (el.getAttribute("style") || "").toLowerCase(); } catch (e) { s = ""; }
    var fora = [];
    if (/font-weight\s*:\s*(bold|[6-9]00)/.test(s)) fora.push("b");
    if (/font-style\s*:\s*italic/.test(s)) fora.push("i");
    if (/text-decoration[^;]*underline/.test(s)) fora.push("u");
    return fora;
  }

  function limparNo(no, saida) {
    for (var f = no.firstChild; f; f = f.nextSibling) {
      if (f.nodeType === 3) { saida.push(escapar(f.nodeValue)); continue; }
      if (f.nodeType !== 1) continue;
      var tag = f.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") continue;      // nunca, nem o conteúdo
      if (tag === "BR") { saida.push("<br>"); continue; }

      var envolve = PERMITIDAS[tag] ? [tag.toLowerCase()] : daEstilo(f);
      // DIV colado do Word é parágrafo; sem isto o texto vira um bloco só
      if (!envolve.length && (tag === "DIV" || tag === "SECTION")) envolve = ["p"];

      /* A marcação some, mas o texto fica — e sem isto o conteúdo de duas
         células de tabela sairia grudado numa palavra só. Separa dos dois
         lados; a colagem de `<br>` repetido é colapsada no fim. */
      var separa = !envolve.length && BLOCOS[tag];
      if (separa) saida.push("<br>");
      envolve.forEach(function (t) { saida.push("<" + t + ">"); });
      limparNo(f, saida);
      envolve.slice().reverse().forEach(function (t) { saida.push("</" + t + ">"); });
      if (separa) saida.push("<br>");
    }
  }

  function limpar(html) {
    var caixa = document.createElement("div");
    // innerHTML numa div solta não executa script nem carrega imagem
    caixa.innerHTML = String(html == null ? "" : html);
    var saida = [];
    limparNo(caixa, saida);
    return saida.join("")
      .replace(/<p>\s*<\/p>/g, "")
      .replace(/(<br>\s*){3,}/g, "<br><br>");
  }

  /* O que está gravado pode ser texto puro (tudo o que veio antes disto). */
  function paraHtml(valor) {
    var v = String(valor == null ? "" : valor);
    if (!v) return "";
    return TEM_TAG.test(v) ? limpar(v) : escapar(v).replace(/\n/g, "<br>");
  }

  var CSS_RICO = ""
    + ".just-rico{width:100%;min-height:100px;padding:12px;border:1px solid var(--line-soft,#e2e8f0);"
    + "border-radius:6px;font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:13px;"
    + "line-height:1.6;color:var(--txt-1,#1e293b);background:var(--bg,#fff);overflow-y:auto;"
    + "transition:border-color .2s}"
    + ".just-rico:focus{outline:none;border-color:#178A5E;box-shadow:0 0 0 2px rgba(23,138,94,.1)}"
    + ".just-rico:empty:before{content:attr(data-vazio);color:var(--txt-3,#94a3b8)}"
    + ".just-rico p{margin:0 0 6px}.just-rico ul,.just-rico ol{margin:0 0 6px;padding-left:20px}"
    + ".just-barra{display:flex;gap:5px;margin:0 0 6px}"
    + ".just-barra button{border:1px solid var(--line-soft,#e2e8f0);background:#fff;border-radius:5px;"
    + "width:26px;height:26px;font-size:12.5px;cursor:pointer;color:var(--txt-1,#1e293b);"
    + "font-family:Georgia,serif;line-height:1}"
    + ".just-barra button:hover{border-color:#178A5E;color:#178A5E}"
    + ".just-rico-readonly p{margin:0 0 6px}"
    + ".just-rico-readonly ul,.just-rico-readonly ol{margin:0 0 6px;padding-left:20px}";

  function cssRico() {
    if (document.getElementById("ajRicoEstilo")) return;
    var st = document.createElement("style");
    st.id = "ajRicoEstilo"; st.textContent = CSS_RICO;
    document.head.appendChild(st);
  }

  function avisar(area, rico) {
    area.value = limpar(rico.innerHTML);
    // os MESMOS eventos que o append antigo escuta: ele guarda e manda gravar
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function enriquecer(area) {
    if (!area || area.getAttribute("data-rico") === "1") return;
    area.setAttribute("data-rico", "1");
    cssRico();
    area.style.display = "none";

    var barra = document.createElement("div");
    barra.className = "just-barra";
    [["b", "N", "Negrito (Ctrl+B)"], ["i", "I", "Itálico (Ctrl+I)"], ["u", "S", "Sublinhado (Ctrl+U)"]]
      .forEach(function (x) {
        var bt = document.createElement("button");
        bt.type = "button"; bt.title = x[2];
        bt.innerHTML = x[0] === "b" ? "<b>" + x[1] + "</b>"
          : x[0] === "i" ? "<i>" + x[1] + "</i>" : "<u>" + x[1] + "</u>";
        // mousedown, não click: o clique tiraria o foco do texto selecionado
        bt.addEventListener("mousedown", function (e) {
          e.preventDefault();
          try { document.execCommand(x[0] === "b" ? "bold" : x[0] === "i" ? "italic" : "underline"); } catch (err) { /* sem suporte */ }
        });
        barra.appendChild(bt);
      });

    var rico = document.createElement("div");
    rico.className = "just-rico";
    rico.contentEditable = "true";
    rico.setAttribute("data-vazio", area.getAttribute("placeholder") || "");
    rico.innerHTML = paraHtml(area.value);

    rico.addEventListener("input", function () { avisar(area, rico); });
    rico.addEventListener("blur", function () {
      area.value = limpar(rico.innerHTML);
      area.dispatchEvent(new Event("blur"));      // grava na hora, como antes
    });
    /* A COLAGEM é o ponto do pedido: o que vem da área de transferência
       passa pela lista de permissão ANTES de entrar na página. */
    rico.addEventListener("paste", function (e) {
      var dt = e.clipboardData;
      if (!dt) return;
      e.preventDefault();
      var html = dt.getData("text/html");
      var limpo = html ? limpar(html) : escapar(dt.getData("text/plain")).replace(/\n/g, "<br>");
      try { document.execCommand("insertHTML", false, limpo); } catch (err) { rico.innerHTML += limpo; }
      avisar(area, rico);
    });

    area.parentNode.insertBefore(barra, area);
    area.parentNode.insertBefore(rico, area);
  }

  /* A visão do AVALIADOR desenha o texto já escapado; aqui ele volta a ser
     marcação — passando pela mesma lista de permissão, porque é a tela que
     se apresenta na visita. */
  function enriquecerLeitura(el) {
    if (!el || el.getAttribute("data-rico") === "1") return;
    el.setAttribute("data-rico", "1");
    var bruto = el.textContent || "";
    if (!TEM_TAG.test(bruto)) return;    // texto puro: já está certo como está
    cssRico();
    el.classList.add("just-rico-readonly");
    el.innerHTML = limpar(bruto);
  }

  function varrer() {
    document.querySelectorAll(".just-conceito-textarea:not([data-rico])").forEach(enriquecer);
    document.querySelectorAll(".just-conceito-readonly:not([data-rico])").forEach(enriquecerLeitura);
  }

  function ligar() {
    varrer();
    // o append antigo injeta o campo quando um indicador é aberto
    new MutationObserver(function () { setTimeout(varrer, 60); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();
