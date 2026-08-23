/* =======================================================================
   ARCHÉ Avaliação — O RELATÓRIO DE PRODUÇÃO LEVA O LINK DO COMPROVANTE,
   NÃO O COMPROVANTE INTEIRO.

   Pedido do dono, ago/2026: "naquele botão 'Exportar Relatório PDF' você
   está incluindo todas as comprovações? Se sim, não faça — coloque só o
   link, para o avaliador por acaso clicar e acessar o que está salvo no
   sistema. Senão fica um arquivo muito grande."

   Estava. Para cada produção com comprovante, o gerador baixava o arquivo,
   renderizava a primeira página com o PDF.js e a colava no relatório como
   imagem JPEG — uma página de comprovante por item, em resolução de tela.
   Num curso com vinte docentes e algumas centenas de produções, o
   documento passa facilmente de cem megabytes: não abre no celular do
   avaliador, não vai por e-mail e demora minutos para ser gerado.

   E era trabalho perdido de todo jeito: o comprovante JÁ ESTÁ no sistema,
   com endereço próprio e permanente (`/api/files/<id>`). O relatório
   precisa dizer ONDE ele está, não carregá-lo junto.

   Agora a linha do comprovante é um LINK clicável dentro do PDF. O
   avaliador clica no nome do arquivo e o ARCHÉ o abre. O relatório fica em
   alguns poucos megabytes — é texto — e continua dizendo exatamente a
   mesma coisa: quantas produções, quais têm comprovante e qual é.

   Como isto é feito sem tocar no app compilado (a regra do /arche):

     1. o download do comprovante é interrompido — enquanto a exportação
        corre, um pedido a `/api/files/` responde "não deu", que é o caso
        que o gerador já tratava, e nenhuma imagem é colada;
     2. a linha "✓ nome-do-arquivo" que ele desenha em seguida passa a ser
        desenhada COM link, na mesma posição e com o mesmo texto, mais o
        convite a clicar.

   O endereço de cada comprovante vem de uma FILA montada na ordem exata em
   que o gerador percorre docentes e itens — não do nome do arquivo, que se
   repete entre docentes e faria um link apontar para o comprovante de
   outra pessoa. Se a fila se esgotar (o gerador mudou), a linha sai sem
   link, como texto: um link errado num documento que vai ao MEC é pior que
   nenhum link.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeExportLink) return;
  window.__archeExportLink = true;

  var EXPORTANDO = false;
  var fila = [];

  function absoluto(p) {
    var s = String(p || "");
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : location.origin + s;
  }

  /* A MESMA varredura do gerador: `professors` na ordem, os que têm `data`,
     e de cada um os itens com anexo. Qualquer divergência aqui viraria link
     trocado, por isso a régua é copiada, não reinventada. */
  function montarFila() {
    fila = [];
    if (typeof professors === "undefined" || typeof profItems !== "function") return;
    professors.forEach(function (p) {
      if (!p || !p.data) return;
      profItems(p).forEach(function (it) {
        if (it && it.anexo && it.anexo.path) fila.push(absoluto(it.anexo.path));
      });
    });
  }

  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest || !e.target.closest("#btnExportPdf")) return;
    // não impede nada: só prepara a fila e liga a chave antes de o gerador correr
    EXPORTANDO = true;
    montarFila();
  }, true);

  /* 1. O comprovante não é baixado. `fetchAsDataUrl` já trata a resposta
        que não vem — devolve null, e o gerador segue sem colar imagem. */
  var _fetch = window.fetch;
  window.fetch = function (entrada) {
    try {
      var url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
      if (EXPORTANDO && url.indexOf("/api/files/") >= 0) {
        // 404 de propósito: `fetchAsDataUrl` confere `r.ok` e devolve null,
        // que é exatamente o caminho que o gerador já sabia tratar
        return Promise.resolve(new Response("", { status: 404, statusText: "sem embutir" }));
      }
    } catch (x) { /* qualquer dúvida: deixa passar */ }
    return _fetch.apply(this, arguments);
  };

  /* O convite a clicar cabe na linha ou o nome do arquivo encolhe: o texto
     do jsPDF não quebra sozinho, e uma linha comprida sairia por cima da
     margem direita do relatório. A margem é a mesma do gerador (15 mm). */
  var LARGURA_UTIL = 210 - 15 - 15;
  var CONVITE = "  (clique para abrir)";

  function comConvite(doc, txt, x) {
    var sobra = LARGURA_UTIL - (Number(x) - 15);
    try {
      if (doc.getTextWidth(txt + CONVITE) <= sobra) return txt + CONVITE;
      var nome = txt;
      while (nome.length > 12 && doc.getTextWidth(nome + "..." + CONVITE) > sobra) {
        nome = nome.slice(0, -1);
      }
      return nome + "..." + CONVITE;
    } catch (e) { return txt; }
  }

  /* 2. A linha do comprovante ganha o link. O gerador desenha "✓ nome"; a
        posição, a fonte e a cor continuam as dele — muda só o fato de a
        linha ser clicável e dizer isso. */
  /* O jsPDF 2.x monta `text` e `save` como propriedades DA INSTÂNCIA, no
     construtor — não no protótipo nem em `jsPDF.API`. Por isso quem se
     envolve aqui é o CONSTRUTOR: ele fabrica o documento de verdade e
     acrescenta a camada nele antes de devolvê-lo. */
  function envolverDocumento(doc) {
    if (!doc || doc.__archeLink) return doc;
    var _text = doc.text;
    var _save = doc.save;
    /* REENTRÂNCIA: `textWithLink` desenha chamando o próprio `text`. Sem
       esta guarda, a primeira linha entrava de novo aqui, consumia a fila
       inteira e saía com seis convites colados — e as outras cinco ficavam
       sem link. */
    var dentro = false;
    doc.text = function (txt, x, y) {
      if (!dentro && EXPORTANDO && typeof txt === "string" && typeof this.textWithLink === "function") {
        if (txt.charAt(0) === "✓" && fila.length) {
          var url = fila.shift();
          if (url) {
            dentro = true;
            try {
              return this.textWithLink(comConvite(this, txt, x), x, y, { url: url });
            } catch (e) { /* sem link: sai como texto, abaixo */
            } finally { dentro = false; }
          }
        }
        /* A nota da capa, para quem receber o documento impresso ou por
           e-mail entender por que os comprovantes não estão dentro dele. */
        if (txt.indexOf("Sem comprovante: ") === 0) {
          var r = _text.apply(this, arguments);
          try {
            this.setFontSize(8.5);
            _text.call(this, "Os comprovantes nao vao embutidos: cada um e um link para o arquivo "
              + "guardado no ARCHE.", x, y + 7);
            this.setFontSize(10);
          } catch (e) { /* a nota nunca derruba o relatorio */ }
          return r;
        }
      }
      return _text.apply(this, arguments);
    };
    /* A chave desliga sozinha: o gerador termina com `doc.save(...)`. Sem
       isto, um `/api/files/` pedido depois da exportação — o avaliador
       clicando num link — continuaria recusado. */
    doc.save = function () {
      EXPORTANDO = false; fila = [];
      return _save.apply(this, arguments);
    };
    doc.__archeLink = true;
    return doc;
  }

  function armar() {
    var ns = window.jspdf;
    if (!ns || typeof ns.jsPDF !== "function" || ns.jsPDF.__archeEnvolvido) return !!(ns && ns.jsPDF);
    var Real = ns.jsPDF;
    function Envolvido() {
      return envolverDocumento(Reflect.construct(Real, arguments, Real));
    }
    Envolvido.prototype = Real.prototype;
    Object.keys(Real).forEach(function (k) { try { Envolvido[k] = Real[k]; } catch (e) { /* só leitura */ } });
    Envolvido.API = Real.API;
    Envolvido.__archeEnvolvido = true;
    ns.jsPDF = Envolvido;
    return true;
  }
  if (!armar()) {
    var n = 0;
    var t = setInterval(function () { if (armar() || ++n > 80) clearInterval(t); }, 250);
  }
  // rede de segurança: exportação que falhou no meio não deixa a chave ligada
  setInterval(function () {
    if (EXPORTANDO && !document.getElementById("exportLog")) { EXPORTANDO = false; fila = []; }
  }, 4000);
})();
