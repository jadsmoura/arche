/* =======================================================================
   ARCHÉ Avaliação — DE QUEM É O XML QUE ESTÁ NESTA FICHA?

   Pergunta do dono, ago/2026: "a profa. Naiara Oliveira Silva — consegue
   conferir se o XML que ela subiu é realmente do currículo dela?"

   Consegue, e a resposta estava guardada o tempo todo. O que faltava era
   alguém mostrar.

   O leitor do Lattes (`parseLattes`) extrai do XML o NOME-COMPLETO e o
   NUMERO-IDENTIFICADOR — o ID Lattes, que é único por pessoa. Só que, na
   importação, a linha `data.nome = p.nome` troca o nome do XML pelo nome do
   docente selecionado na tela. O ID sobrevive em `data.id`, e ninguém o
   compara com o `lattesId` do cadastro. Resultado: quem sobe o XML de outra
   pessoa — por engano, por arquivo trocado na pasta de downloads — vê o
   PRÓPRIO nome sobre a produção alheia, e nada denuncia a troca. O dossiê
   que vai ao MEC passa a atribuir artigos a quem não os escreveu.

   Este append confere e DIZ, em três frentes:

     1. o ID Lattes do XML contra o ID do cadastro — é a prova forte, e vale
        para o que já foi importado, sem reimportar nada;
     2. o NOME-COMPLETO, lido do XML bruto que o app guarda em `xmlArchive`
        (as cinco últimas importações) — serve quando o cadastro não tem o
        ID, e é o que se lê num relatório para a coordenação;
     3. na importação nova, o aviso sai na hora, antes de a pessoa fechar a
        página achando que está tudo certo.

   NÃO BLOQUEIA NADA. Um XML pode divergir por motivo legítimo (cadastro com
   o ID errado, professora que mudou de nome), e travar a importação faria o
   sistema recusar trabalho correto. Quem decide é gente; o que muda é que
   agora a divergência aparece.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeXml) return;
  window.__archeXml = true;

  var CSS = ""
    + "#axConfere{margin:0 0 12px;border-radius:10px;padding:10px 13px;font-size:13px;"
    + "line-height:1.5;font-family:inherit;border:1px solid #dde4e8;background:#f6f8fa;color:#657179}"
    + "#axConfere.ax-ok{border-color:#cfeeda;background:#eaf7ef;color:#1f6b45}"
    + "#axConfere.ax-mal{border-color:#eed6d3;background:#fdeeec;color:#8c2f22}"
    + "#axConfere b{font-weight:700}"
    + "#axConfere .ax-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}";

  function css() {
    if (document.getElementById("axEstilo")) return;
    var st = document.createElement("style");
    st.id = "axEstilo"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  var soDigitos = function (v) { return String(v == null ? "" : v).replace(/\D/g, ""); };

  /* Nomes se comparam sem acento, sem caixa e sem espaço repetido — e sem as
     partículas, que entram e saem conforme quem digitou ("Naiara Oliveira da
     Silva" e "Naiara Oliveira Silva" são a mesma pessoa). */
  function chaveNome(v) {
    return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z ]/g, " ")
      .split(/\s+/).filter(function (t) {
        return t && ["de", "da", "do", "das", "dos", "e"].indexOf(t) < 0;
      }).join(" ");
  }

  /* O XML bruto das últimas importações fica no próprio dossiê. É de lá que
     sai o nome REAL — o que a tela mostra já foi trocado pelo do cadastro. */
  function doArquivoXml(p) {
    var a = (p && p.xmlArchive) || [];
    if (!a.length) return null;
    var ultimo = a[a.length - 1] || {};
    var txt = String(ultimo.content || "");
    var nome = (txt.match(/NOME-COMPLETO="([^"]*)"/) || [])[1] || "";
    var id = (txt.match(/NUMERO-IDENTIFICADOR="([^"]*)"/) || [])[1] || "";
    return { nome: nome, id: soDigitos(id), arquivo: ultimo.filename || "", em: ultimo.date || "" };
  }

  /**
   * Confere de quem é o XML desta ficha.
   * veredito: "confere" | "diverge" | "sem-como" | "sem-xml"
   */
  function conferir(p) {
    if (!p || !p.data) return { veredito: "sem-xml" };
    var arq = doArquivoXml(p);
    var idXml = soDigitos((p.data && p.data.id) || (arq && arq.id) || "");
    var idCad = soDigitos(p.lattesId);
    var nomeXml = (arq && arq.nome) || "";
    var out = { veredito: "sem-como", idXml: idXml, idCad: idCad, nomeXml: nomeXml, arq: arq };

    if (idXml && idCad) {
      out.veredito = idXml === idCad ? "confere" : "diverge";
      out.porque = idXml === idCad
        ? "o ID Lattes do XML é o mesmo do cadastro"
        : "o ID Lattes do XML não é o do cadastro";
      return out;
    }
    if (nomeXml) {
      var a = chaveNome(nomeXml), b = chaveNome(p.nome);
      // um nome contido no outro é a mesma pessoa com o cadastro abreviado
      var mesmo = a === b || (a && b && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
      out.veredito = mesmo ? "confere" : "diverge";
      out.porque = mesmo
        ? "o nome no XML é o mesmo do cadastro"
        : "o nome no XML é de outra pessoa";
      return out;
    }
    return out;
  }
  window.archeConferirXml = conferir;

  function bloco(p) {
    var el = document.getElementById("axConfere");
    var r = conferir(p);
    if (r.veredito === "sem-xml") { if (el) el.remove(); return; }
    css();
    if (!el) {
      el = document.createElement("div");
      el.id = "axConfere";
      var alvo = document.getElementById("profView") || document.body;
      alvo.insertBefore(el, alvo.firstChild);
    }
    var quando = "";
    if (r.arq && r.arq.em) {
      try { quando = " · importado em " + new Date(r.arq.em).toLocaleString("pt-BR"); } catch (e) { /* data ilegível */ }
    }
    var arquivo = r.arq && r.arq.arquivo ? ' · arquivo <span class="ax-mono">' + r.arq.arquivo + "</span>" : "";

    if (r.veredito === "diverge") {
      el.className = "ax-mal";
      el.innerHTML = "<b>⚠ Este currículo parece ser de outra pessoa.</b><br>"
        + "O XML importado está em nome de <b>" + (r.nomeXml || "(nome não declarado)") + "</b>"
        + (r.idXml ? ' — ID Lattes <span class="ax-mono">' + r.idXml + "</span>" : "")
        + ", e esta ficha é de <b>" + (p.nome || "") + "</b>"
        + (r.idCad ? ' — ID Lattes <span class="ax-mono">' + r.idCad + "</span>" : " (sem ID no cadastro)")
        + ".<br>Confira o arquivo antes de validar: a produção listada abaixo pode não ser desta "
        + "pessoa." + arquivo + quando;
      return;
    }
    if (r.veredito === "confere") {
      el.className = "ax-ok";
      el.innerHTML = "<b>✓ O XML é desta pessoa</b> — " + r.porque
        + (r.idXml ? ' (ID Lattes <span class="ax-mono">' + r.idXml + "</span>)" : "")
        + "." + arquivo + quando;
      return;
    }
    el.className = "";
    el.innerHTML = "<b>Não dá para conferir automaticamente de quem é este XML.</b> "
      + "O cadastro deste docente não tem o ID Lattes e o arquivo importado não ficou guardado "
      + "(só as cinco últimas importações ficam). Uma reimportação do XML resolve." + quando;
  }

  /* Desenha junto com a ficha — é ali que a conferência importa. */
  if (typeof renderProf === "function") {
    var _render = renderProf;
    renderProf = function () {
      var r = _render.apply(this, arguments);
      try { bloco(typeof current === "function" ? current() : null); } catch (e) { /* nunca derruba a tela */ }
      return r;
    };
  }

  /* E na importação NOVA, o aviso sai na hora: o `data.nome` do XML é
     substituído pelo do cadastro logo em seguida, então a conferência é
     agendada para depois disso — lendo o ID, que sobrevive. */
  if (typeof parseLattes === "function") {
    var _parse = parseLattes;
    parseLattes = function () {
      var d = _parse.apply(this, arguments);
      try {
        window.__archeUltimoXml = { nome: (d && d.nome) || "", id: soDigitos(d && d.id) };
        setTimeout(function () {
          var p = typeof current === "function" ? current() : null;
          if (!p) return;
          var r = conferir(p);
          if (r.veredito !== "diverge") return;
          alert("Atenção: este XML parece ser de outra pessoa.\n\n"
            + "O currículo importado está em nome de "
            + (window.__archeUltimoXml.nome || r.nomeXml || "(não declarado)")
            + (r.idXml ? " (ID Lattes " + r.idXml + ")" : "")
            + ",\ne esta ficha é de " + (p.nome || "")
            + (r.idCad ? " (ID Lattes " + r.idCad + ")" : " — sem ID no cadastro")
            + ".\n\nA importação NÃO foi bloqueada: confira o arquivo e, se estiver errado, "
            + "importe o XML correto por cima.");
        }, 0);
      } catch (e) { /* a conferência nunca atrapalha a importação */ }
      return d;
    };
  }
})();
