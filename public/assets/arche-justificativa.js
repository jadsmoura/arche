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
})();
