/* =======================================================================
   ARCHÉ Avaliação — A GRAVAÇÃO DO DOSSIÊ PASSA A DIZER QUANDO NÃO GRAVA.

   Achado do dono, ago/2026: "entrei na página de produção dos professores e
   notei que algumas coisas que eu havia feito sumiram. Fotos dos professores,
   e o currículo do professor José Mateus dos Santos."

   Nada tinha sumido: aquilo nunca chegou a ser gravado. O app compilado
   recusa a gravação em três situações, e nas TRÊS ele sai calado — a pessoa
   sobe a foto, vê a foto na tela, fecha a página, e no dia seguinte não há
   foto nenhuma. Do lado de quem trabalhou, isso é indistinguível de perda de
   dado, e foi assim que a suspeita caiu sobre o sistema.

   As três portas mudas (as duas primeiras são regra do app, não defeito; a
   terceira é um erro que ninguém vê):

     1. `state.role !== "docente"` — a PROPPEX e o avaliador NUNCA gravam.
        A tela, no entanto, deixa mexer em algumas coisas;
     2. `!professors.some(p => p.data)` — enquanto NENHUM docente do curso
        tiver importado o XML do Lattes, o dossiê inteiro não grava. É uma
        proteção com razão de ser (uma aba que não carregou o documento
        gravaria vazio por cima do que está no servidor) e, para quem só
        queria subir uma foto, é uma parede invisível;
     3. `catch(e){ console.error(...) }` — a falha de rede, o Drive fora do ar
        e o 403 do selo de VISUALIZAÇÃO (quem abriu o /avaliador uma vez leva
        o selo grudado no navegador) morrem no console.

   Este append não muda nenhuma das regras: a proteção 2 continua de pé, e a
   PROPPEX continua sem gravar. Ele só faz o que faltava — DIZER. Uma faixa
   no alto da ficha, com o motivo e o que fazer.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeGrav) return;
  window.__archeGrav = true;

  var CSS = ""
    + ".agv-faixa{position:sticky;top:0;z-index:70;margin:0 0 10px;border-radius:10px;"
    + "padding:11px 14px;font-size:13.5px;line-height:1.5;font-family:inherit;"
    + "border:1px solid #e8d3a8;background:#fbf3e4;color:#7a5714}"
    + ".agv-faixa.agv-err{border-color:#eed6d3;background:#fdeeec;color:#8c2f22}"
    + ".agv-faixa.agv-ok{border-color:#cfeeda;background:#eaf7ef;color:#1f6b45}"
    + ".agv-selo{position:fixed;right:14px;bottom:14px;z-index:80;border-radius:999px;"
    + "padding:7px 14px;font-size:12.5px;font-family:inherit;font-weight:600;"
    + "border:1px solid #cfeeda;background:#eaf7ef;color:#1f6b45;"
    + "box-shadow:0 6px 18px rgba(18,38,50,.14)}"
    + ".agv-selo.agv-salvando{border-color:#e8d3a8;background:#fbf3e4;color:#7a5714}"
    + ".agv-faixa b{font-weight:700}"
    + ".agv-faixa .agv-x{float:right;background:none;border:0;font-size:17px;line-height:1;"
    + "cursor:pointer;color:inherit;opacity:.65;padding:0 2px}"
    + ".agv-faixa .agv-x:hover{opacity:1}";

  function css() {
    if (document.getElementById("agvEstilo")) return;
    var st = document.createElement("style");
    st.id = "agvEstilo"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function faixa(html, erro, extra) {
    css();
    var el = document.getElementById("agvFaixa");
    if (!el) {
      el = document.createElement("div");
      el.id = "agvFaixa";
      el.className = "agv-faixa";
      var alvo = document.getElementById("profView") || document.getElementById("appView")
        || document.body;
      alvo.insertBefore(el, alvo.firstChild);
    }
    el.className = "agv-faixa" + (erro ? " agv-err" : "") + (extra ? " " + extra : "");
    el.innerHTML = '<button class="agv-x" title="Fechar" onclick="this.parentNode.remove()">×</button>' + html;
    el.style.display = "";
  }

  function limpar() {
    var el = document.getElementById("agvFaixa");
    if (el) el.remove();
  }

  /* A CONFIRMAÇÃO DE QUE GRAVOU (pedido do dono, ago/2026: "tem como incluir
     uma confirmação de que o envio foi concluído?").

     São duas peças, porque respondem a perguntas diferentes: a FAIXA verde
     responde "acabou de salvar?" e some sozinha; o SELO no canto responde
     "está tudo guardado?" e fica, dizendo a hora do último salvamento. Sem o
     selo, quem se afasta da tela por um minuto perde a única confirmação que
     houve — e foi justamente não ter confirmação nenhuma que fez o trabalho
     de um dia parecer perdido sem ninguém saber por quê. */
  var somem = null;

  function hora() {
    var d = new Date();
    var dois = function (n) { return (n < 10 ? "0" : "") + n; };
    return dois(d.getHours()) + ":" + dois(d.getMinutes()) + ":" + dois(d.getSeconds());
  }

  function selo(txt, salvando) {
    css();
    var el = document.getElementById("agvSelo");
    if (!el) {
      el = document.createElement("div");
      el.id = "agvSelo";
      document.body.appendChild(el);
    }
    el.className = "agv-selo" + (salvando ? " agv-salvando" : "");
    el.textContent = txt;
  }

  function confirmou() {
    var h = hora();
    limpar();
    faixa("<b>✓ Salvo no servidor às " + h + ".</b> O que você fez até aqui está guardado — "
      + "pode fechar a página com segurança.", false, "agv-ok");
    selo("✓ salvo " + h, false);
    clearTimeout(somem);
    somem = setTimeout(limpar, 6000);   // a faixa some; o selo fica
  }

  var PAPEL = { proreitoria: "Pró-Reitoria (PROPPEX)", avaliador: "avaliador" };

  /* Por que esta gravação não vai acontecer? "" quando ela vai. */
  function porQueNaoGrava() {
    if (typeof state !== "object" || !state) return "";
    if (state.role !== "docente") {
      return "<b>Nada aqui está sendo salvo.</b> Esta página está aberta como <b>"
        + (PAPEL[state.role] || "visitante") + "</b>, e nesse acesso o dossiê é somente leitura — "
        + "o documento é do docente, e só ele o grava. Para alterar de verdade, saia e entre "
        + "escolhendo o professor na lista da tela inicial.";
    }
    if (typeof professors === "object" && professors && professors.length
      && !professors.some(function (p) { return p && p.data; })) {
      return "<b>Nada aqui está sendo salvo ainda.</b> Nenhum docente deste curso importou o XML "
        + "do Lattes, e o dossiê só começa a ser gravado depois da primeira importação — é o que "
        + "impede uma aba que não carregou o documento de gravar vazio por cima do que já existe. "
        + "<b>Importe o XML do Lattes primeiro</b>; depois a foto e o resto ficam guardados.";
    }
    return "";
  }

  /* 1. As duas recusas mudas do app: dizer, em vez de sair calado.

     ESTE APPEND NÃO DECIDE NADA. Ele avisa e SEMPRE chama o original — nunca
     impede uma gravação (pedido do dono, ago/2026: "não altere inclusões que
     foram feitas depois, não posso ter que refazer tudo"). Se a minha leitura
     da condição divergisse da do app, um observador que bloqueia viraria
     exatamente o defeito que ele veio denunciar. Quem recusa continua sendo o
     app; o que muda é que a recusa passa a ser dita. */
  function vigiar(nome) {
    if (typeof window[nome] !== "function") return;
    var _orig = window[nome];
    window[nome] = function () {
      var motivo = porQueNaoGrava();
      if (motivo) faixa(motivo, false);
      return _orig.apply(this, arguments);
    };
  }
  vigiar("doSave");
  vigiar("scheduleSave");

  /* 2. A falha de gravação, que hoje morre no console. Embrulhar o `set` do
        storage pega TODOS os caminhos — o save com mescla, o save direto e o
        que roda depois de cada upload de comprovante. */
  function vigiarStorage() {
    var s = window.storage;
    if (!s || typeof s.set !== "function" || s.__agv) return false;
    var _set = s.set.bind(s);
    s.set = function () {
      selo("salvando…", true);
      return Promise.resolve(_set.apply(null, arguments)).then(function (r) {
        confirmou();
        return r;
      }).catch(function (e) {
        selo("✗ não salvo", true);
        // o erro é RELANÇADO abaixo, exatamente como vinha: quem chamou segue
        // tratando-o como antes, e o observador só acrescenta o aviso na tela
        var msg = (e && e.message) ? String(e.message) : String(e || "falha desconhecida");
        faixa("<b>Não foi possível salvar.</b> O que você alterou continua na tela, mas <b>não foi "
          + "gravado</b>. Não feche a página: confira a conexão e altere qualquer campo para "
          + "tentar de novo. (" + msg + ")", true);
        /* O erro que sobe do storage costuma vir sem o código, então quem diz
           se é o SELO DE VISUALIZAÇÃO é o próprio servidor. O selo gruda no
           navegador: quem abriu arche.app.br/avaliador uma vez entra pelo
           /arche com ele nas visitas seguintes, e toda escrita é recusada. */
        try {
          fetch("/api/av/quem").then(function (r) { return r.json(); }).then(function (q) {
            if (q && q.via === "avaliador" && !q.logado) {
              faixa("<b>Não foi possível salvar: este navegador está com o selo de "
                + "VISUALIZAÇÃO.</b> Ele fica guardado desde a primeira vez que se abre "
                + "<b>arche.app.br/avaliador</b>, e com ele o ARCHÉ recusa toda gravação — "
                + "inclusive aqui, mesmo entrando pelo endereço normal. "
                + '<a href="/entrar?next=' + encodeURIComponent(location.pathname) + '">Entre no '
                + "portal</a> e recarregue esta página; o que está na tela ainda não se perdeu.", true);
            }
          }).catch(function () {});
        } catch (x) { /* sem rede: fica o aviso genérico acima */ }
        throw e;
      });
    };
    s.__agv = true;
    return true;
  }
  if (!vigiarStorage()) {
    // o firebase-config.js pode ainda não ter definido window.storage
    var tentativas = 0;
    var t = setInterval(function () {
      if (vigiarStorage() || ++tentativas > 40) clearInterval(t);
    }, 250);
  }
})();
