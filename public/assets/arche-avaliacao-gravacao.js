/* =======================================================================
   ARCHÉ Avaliação — A GRAVAÇÃO DOS INDICADORES NÃO ATROPELA QUEM ESTAVA
   JUNTO, E DIZ QUANDO GRAVOU.

   Achado do dono, ago/2026: "algumas professoras disseram que tentaram
   anexar documentos nesse setor e não estava firmando".

   O app compilado dos indicadores guarda TODO o curso numa chave só
   (`avaliacao-mec-<curso>-uniego-v1`: os anexos de todos os indicadores,
   as configurações, o modo de comprovação) e grava assim:

     await window.storage.set(nc, JSON.stringify(estadoInteiroDaAba))
     // catch(a){ console.error(a) }

   Dois defeitos no mesmo lugar — os MESMOS que o dossiê tinha:

   1. A gravação manda o retrato da ABA por cima de tudo. Duas professoras
      do mesmo curso com a página aberta, cada uma anexando no seu
      indicador: a última a gravar devolve o curso ao estado de quando a
      aba DELA carregou — o anexo da primeira some, sem aviso e sem rastro.
      É exatamente "anexei e não firmou".
   2. A falha morre no console. O 403 do selo de visualização, a rede que
      caiu — a professora anexa, vê o documento na tela, fecha a página, e
      nada tinha sido gravado.

   A correção é a mesma do dossiê: a gravação vira LER → MESCLAR → GRAVAR,
   numa fila — relê o documento do servidor e escreve por cima dele só o
   que esta aba conhece, seção por seção (o `estado` de cada indicador, a
   `cfg` de cada chave), preservando o que os outros gravaram no meio
   tempo. E a tela passa a DIZER: um selo com a hora do último salvamento
   e uma faixa quando a gravação falha.

   Se a releitura falhar, grava como vinha: segurar a gravação de quem está
   trabalhando seria pior que o risco que isto corrige.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeAvGrav) return;
  window.__archeAvGrav = true;

  /* O `window.storage` do bundle grava no localStorage, tenta o servidor
     SEM conferir a resposta e devolve sucesso sempre — foi assim que o 403
     do selo de visualização passou calado: a tela da professora continuava
     mostrando tudo (o get lê o localStorage DELA), e no servidor não havia
     nada. Por isso o embrulho cobre TODAS as chaves que o app grava, e a
     gravação confere o status com os próprios olhos. */
  var EH_CHAVE = /^(avaliacao-mec-|docs-institucionais|links-pastas|indicador-)/;

  /* Grava no servidor CONFERINDO a resposta — o set do bundle não confere.
     O localStorage só é atualizado quando o servidor aceitou: cache local
     que diverge do servidor é o que fazia o defeito ficar invisível. */
  function porNoServidor(chave, valor) {
    return fetch("/api/estado", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: chave, valor: valor }),
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.error || ("erro " + r.status)); e.status = r.status; throw e;
      });
      try { localStorage.setItem(chave, valor); } catch (e) { /* modo restrito */ }
      return { key: chave, value: valor };
    });
  }

  /* ------------------------------ a tela ------------------------------- */
  var CSS = ""
    + "#avgSelo{position:fixed;right:14px;bottom:14px;z-index:9999;border-radius:999px;"
    + "padding:7px 14px;font-size:12.5px;font-family:inherit;font-weight:600;"
    + "border:1px solid #cfeeda;background:#eaf7ef;color:#1f6b45;"
    + "box-shadow:0 6px 18px rgba(18,38,50,.14)}"
    + "#avgSelo.avg-mal{border-color:#eed6d3;background:#fdeeec;color:#8c2f22}"
    + "#avgSelo.avg-meio{border-color:#e8d3a8;background:#fbf3e4;color:#7a5714}"
    + "#avgFaixa{position:fixed;left:14px;right:14px;bottom:56px;z-index:9999;max-width:640px;"
    + "margin:0 auto;border-radius:10px;padding:11px 14px;font-size:13.5px;line-height:1.5;"
    + "font-family:inherit;border:1px solid #eed6d3;background:#fdeeec;color:#8c2f22;"
    + "box-shadow:0 8px 24px rgba(18,38,50,.16)}"
    + "#avgFaixa a{color:inherit;font-weight:700}"
    + "#avgFaixa .avg-x{float:right;background:none;border:0;font-size:17px;line-height:1;"
    + "cursor:pointer;color:inherit;opacity:.65;padding:0 2px}";

  function css() {
    if (document.getElementById("avgEstilo")) return;
    var st = document.createElement("style");
    st.id = "avgEstilo"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function selo(txt, tom) {
    css();
    var el = document.getElementById("avgSelo");
    if (!el) { el = document.createElement("div"); el.id = "avgSelo"; document.body.appendChild(el); }
    el.className = tom ? "avg-" + tom : "";
    el.textContent = txt;
  }
  function faixa(html) {
    css();
    var el = document.getElementById("avgFaixa");
    if (!el) { el = document.createElement("div"); el.id = "avgFaixa"; document.body.appendChild(el); }
    el.innerHTML = '<button class="avg-x" title="Fechar" onclick="this.parentNode.remove()">×</button>' + html;
  }
  function limparFaixa() { var el = document.getElementById("avgFaixa"); if (el) el.remove(); }
  function hora() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
  }

  /* ----------------------------- a mescla ------------------------------ */
  var ehMapa = function (v) { return v && typeof v === "object" && !Array.isArray(v); };

  /**
   * O documento do curso é um objeto de SEÇÕES (`estado`, `cfg`, …), e cada
   * seção é um mapa por chave (o indicador "2.1", a configuração x). A aba
   * escreve por cima do servidor SÓ as entradas que ela tem — o indicador
   * que outra pessoa gravou no meio tempo, e que esta aba nem conhece,
   * fica onde está. Mesclar nunca descarta ninguém.
   */
  function mesclar(remoto, meu) {
    if (!ehMapa(remoto) || !ehMapa(meu)) return meu;
    var saida = {};
    var chaves = {};
    Object.keys(remoto).forEach(function (k) { chaves[k] = 1; });
    Object.keys(meu).forEach(function (k) { chaves[k] = 1; });
    Object.keys(chaves).forEach(function (k) {
      if (!(k in meu)) { saida[k] = remoto[k]; return; }        // só o servidor tem: fica
      if (!(k in remoto)) { saida[k] = meu[k]; return; }        // só a aba tem: entra
      saida[k] = (ehMapa(remoto[k]) && ehMapa(meu[k]))
        ? Object.assign({}, remoto[k], meu[k])                  // seção: entrada a entrada
        : meu[k];                                               // valor simples: o da aba
    });
    return saida;
  }
  window.__archeAvMesclar = mesclar;                            // testável

  /* --------------------------- o embrulho ------------------------------ */
  var fila = Promise.resolve();

  function embrulhar() {
    var s = window.storage;
    if (!s || typeof s.set !== "function" || typeof s.get !== "function" || s.__avGrav) return false;
    var _set = s.set.bind(s);
    var _get = s.get.bind(s);
    s.set = function (chave, valor) {
      if (!EH_CHAVE.test(String(chave)) || typeof valor !== "string") return _set(chave, valor);
      var pronto = fila.then(function () {
        selo("salvando…", "meio");
        return Promise.resolve(_get(chave)).then(function (r) {
          var remoto = null, meu = null;
          try { meu = JSON.parse(valor); } catch (e) { return porNoServidor(chave, valor); }
          try { remoto = r && r.value ? JSON.parse(r.value) : null; } catch (e) { remoto = null; }
          return porNoServidor(chave, JSON.stringify(mesclar(remoto, meu)));
        }, function () {
          return porNoServidor(chave, valor);   // releitura falhou: grava sem mesclar
        });
      }).then(function (r) {
        limparFaixa(); selo("✓ salvo " + hora());
        return r;
      }, function (e) {
        selo("✗ não salvo", "mal");
        faixa("<b>O envio não foi gravado.</b> O que está na tela ainda não chegou ao servidor — "
          + "não feche a página. Confira a conexão e tente de novo. ("
          + ((e && e.message) || e) + ")");
        try {
          fetch("/api/av/quem").then(function (x) { return x.json(); }).then(function (q) {
            if (!q || q.via !== "avaliador" || q.logado) return;
            faixa("<b>O envio não foi gravado: este navegador está com o selo de "
              + "VISUALIZAÇÃO.</b> Ele fica guardado desde a primeira vez que se abre "
              + "<b>arche.app.br/avaliador</b>, e com ele o ARCHÉ recusa toda gravação. "
              + '<a href="/entrar?next=' + encodeURIComponent(location.pathname) + '">Entre no '
              + "portal</a> e recarregue esta página; o que está na tela ainda não se perdeu.");
          }).catch(function () {});
        } catch (x) { /* sem rede: fica o aviso genérico */ }
        throw e;
      });
      // a fila nunca trava: um erro tratado não segura a gravação seguinte
      fila = pronto.catch(function () {});
      return pronto;
    };
    s.__avGrav = true;
    return true;
  }
  if (!embrulhar()) {
    var n = 0;
    var t = setInterval(function () { if (embrulhar() || ++n > 40) clearInterval(t); }, 250);
  }

  /* O UPLOAD do documento também fala (o mesmo padrão do dossiê): o app
     mostra só o código do erro, e o motivo mais comum — o selo de
     visualização — precisa ser dito com o caminho de saída. O
     arche-av-somenteleitura já traduz o 403; aqui entra a CONFIRMAÇÃO de
     que o arquivo subiu, que era o que faltava para "firmou" ter resposta. */
  var _fetch = window.fetch;
  window.fetch = function (entrada) {
    var url = "";
    try { url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || ""; } catch (e) { url = ""; }
    var p = _fetch.apply(this, arguments);
    if (url.indexOf("/api/drive/upload-avaliacao") < 0 && url.indexOf("/api/drive/upload-doc-institucional") < 0) return p;
    selo("enviando arquivo…", "meio");
    return p.then(function (r) {
      if (r && r.ok) { selo("✓ arquivo no servidor " + hora()); }
      else { selo("✗ arquivo não subiu", "mal"); }
      return r;
    }, function (e) { selo("✗ arquivo não subiu", "mal"); throw e; });
  };
})();
