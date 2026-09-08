/* =======================================================================
   ARCHÉ Avaliação — O ACESSO É O DA CONTA DO PORTAL (pedido do dono, set/2026:
   "unificar a autenticação ao usuário; eliminar aquela autenticação com as
   duas senhas").

   Até aqui o módulo tinha DUAS senhas compartilhadas — "uniego" abria os
   indicadores, "docente" abria a produção — e, dentro do dossiê, o professor
   escolhia o PRÓPRIO NOME numa lista para entrar. Ninguém sabia quem entrou,
   e qualquer pessoa com a senha editava a ficha de qualquer docente.

   Quem decide agora é o SERVIDOR (`/api/av/acesso`, lib/avaliacao.js): a
   gestão alcança todos os cursos; a coordenação e o pedagógico, os seus; o
   docente, só a própria ficha; o avaliador do MEC continua entrando pelo
   link, só para ver. Este append faz as três telas do app compilado
   ESPELHAREM essa decisão — e nada além disso: a régua de verdade está nas
   rotas de leitura, gravação e upload, e uma tela que mostrasse mais do que
   o servidor permite só levaria a um 403.

     - PÁGINA INICIAL do módulo: somem as caixas de senha; os cartões levam
       direto ao curso, e o seletor de curso mostra só os cursos da pessoa;
     - INDICADORES: o portão de senha vira "conferindo o acesso…" e abre para
       a coordenação do curso; para os demais, diz por que não abre;
     - PRODUÇÃO DOCENTE: a tela de "entrar como" some. Coordenação e gestão
       caem no quadro do curso (o antigo modo "Pró-Reitoria"); o docente cai
       na própria ficha. Quem é as duas coisas alterna entre elas. E a
       coordenação inclui docentes BUSCANDO ENTRE OS USUÁRIOS do portal — o
       vínculo passa a ser o e-mail da conta, que é por onde o professor
       encontra a ficha ao entrar.

   Por append, como todo ajuste em /arche: o app é compilado e não se
   refatora. Só funções DECLARADAS do app (function …) são substituíveis por
   `window.nome = …` — é o que se usa aqui; nada de mexer no código dele.
   ======================================================================= */
(function () {
  "use strict";
  if (window.__archeAvAcesso) return;
  window.__archeAvAcesso = true;

  var params = new URLSearchParams(location.search);
  var perfilAvaliador = params.get("perfil") === "avaliador";

  /* O curso da página: /arche/dossie/<slug>/ e /arche/avaliacao/<slug>/;
     a raiz de cada um é Psicologia (foi assim que o app foi publicado). */
  var m = location.pathname.match(/\/arche\/(dossie|avaliacao)\/(?:([a-z0-9-]+)\/)?/);
  var MODULO = m ? m[1] : (/\/arche\/?$/.test(location.pathname) || /\/arche\/index\.html$/.test(location.pathname) ? "inicio" : "");
  var CURSO = m ? (m[2] || "psicologia") : "";
  if (!MODULO) return;

  var ACESSO = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nomeCurso(slug) {
    return (ACESSO && ACESSO.cursosNomes && ACESSO.cursosNomes[slug]) || slug;
  }
  function coordena(slug) { return !!ACESSO && (ACESSO.gestao || (ACESSO.cursos || []).indexOf(slug) >= 0); }
  function docenteDe(slug) { return ACESSO && ACESSO.docenteEm ? ACESSO.docenteEm[slug] || null : null; }
  function entrar() {
    location.href = "/entrar?next=" + encodeURIComponent(location.pathname + location.search);
  }

  var CSS = ""
    + ".ava-aviso{max-width:560px;margin:48px auto;background:#fff;border:1px solid #dde4e8;border-radius:16px;"
    + "padding:28px 26px;font-family:Figtree,'IBM Plex Sans',system-ui,sans-serif;color:#182632;"
    + "box-shadow:0 12px 32px rgba(28,55,66,.08);line-height:1.55}"
    + ".ava-aviso h2{margin:0 0 8px;font-size:19px;color:#1c3742}"
    + ".ava-aviso p{margin:0 0 10px;font-size:14px;color:#465660}"
    + ".ava-aviso .ava-bts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}"
    + ".ava-bt{cursor:pointer;font:600 13px Figtree,system-ui,sans-serif;border:0;border-radius:9px;"
    + "padding:9px 14px;background:#1c3742;color:#fff;text-decoration:none;display:inline-block}"
    + ".ava-bt.sec{background:#eceff3;color:#1c3742}"
    + ".ava-troca{cursor:pointer;font:600 12px Figtree,system-ui,sans-serif;border:1px solid #c9e6f0;"
    + "border-radius:999px;padding:5px 11px;background:#e6f5fa;color:#2d535c;margin-top:6px}"
    + ".ava-emnome{margin:0 0 0 10px;vertical-align:middle}"
    + ".ava-busca{position:relative}"
    + ".ava-lista{margin-top:8px;border:1px solid #dde4e8;border-radius:10px;max-height:260px;overflow:auto;background:#fff}"
    + ".ava-item{display:flex;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid #eef1f4;cursor:pointer}"
    + ".ava-item:last-child{border-bottom:0}.ava-item:hover{background:#f4f8fa}"
    + ".ava-item .n{flex:1;font-size:13.5px;color:#182632}.ava-item .n small{display:block;font-size:11.5px;color:#657179}"
    + ".ava-item .t{font-size:11px;font-weight:700;color:#40717e;background:#e6f5fa;border-radius:999px;padding:2px 8px}"
    + ".ava-vazio{padding:12px;font-size:13px;color:#657179}"
    + ".ava-nota{font-size:12px;color:#657179;margin-top:10px;line-height:1.5}";
  var estilo = document.createElement("style");
  estilo.textContent = CSS;
  (document.head || document.documentElement).appendChild(estilo);

  function aviso(alvo, titulo, corpo, botoes) {
    var d = document.createElement("div");
    d.className = "ava-aviso";
    d.innerHTML = "<h2>" + esc(titulo) + "</h2>" + corpo
      + '<div class="ava-bts">' + (botoes || "") + "</div>";
    alvo.innerHTML = "";
    alvo.appendChild(d);
    return d;
  }
  var BT_PORTAL = '<a class="ava-bt sec" href="/">Voltar ao portal</a>';
  var BT_ENTRAR = '<a class="ava-bt" href="/entrar?next=' + esc(encodeURIComponent(location.pathname + location.search)) + '">Entrar com a minha conta</a>';

  function textoSemAcesso(quePagina) {
    if (!ACESSO || !ACESSO.logado) {
      return { t: "Entre no portal para abrir a Avaliação",
        c: "<p>A Avaliação Institucional usa a conta do ARCHÉ: quem coordena o curso vê o curso; o professor vê a própria ficha de produção; o avaliador do MEC entra pelo link que a PROPPEX envia.</p>",
        b: BT_ENTRAR + BT_PORTAL };
    }
    if (ACESSO.papel === "docente" && quePagina === "avaliacao") {
      var meus = Object.keys(ACESSO.docenteEm || {});
      return { t: "Os indicadores são da coordenação do curso",
        c: "<p>A sua conta está no dossiê de produção docente" + (meus.length ? " de <b>" + esc(meus.map(nomeCurso).join(", ")) + "</b>" : "") + ". O painel de indicadores é preenchido pela coordenação e pelo pedagógico do curso.</p>",
        b: (meus.length ? '<a class="ava-bt" href="/arche/dossie/' + (meus[0] === "psicologia" ? "" : esc(meus[0]) + "/") + '">Abrir a minha ficha</a>' : "") + BT_PORTAL };
    }
    if (ACESSO.papel === "coordenacao" || ACESSO.papel === "docente") {
      var lista = (ACESSO.cursos || []).concat(Object.keys(ACESSO.docenteEm || {}));
      lista = lista.filter(function (s, i) { return lista.indexOf(s) === i; });
      return { t: "Este curso não é o seu",
        c: "<p>A sua conta alcança " + (lista.length ? "<b>" + esc(lista.map(nomeCurso).join(", ")) + "</b>" : "nenhum curso ainda") + ". Cada coordenação vê o próprio curso; cada professor, a própria ficha.</p>",
        b: '<a class="ava-bt" href="/arche/">Escolher o curso</a>' + BT_PORTAL };
    }
    return { t: "A sua conta ainda não tem acesso à Avaliação",
      c: "<p>Quem entra aqui é a coordenação e o pedagógico de cada curso (pela composição do curso, em <b>Seu Curso</b>), a gestão da Avaliação (designada em Usuários e acessos) e os professores que a coordenação incluiu no dossiê de produção docente.</p>"
        + "<p>Se você é professor(a), peça à coordenação do seu curso que inclua a sua conta no dossiê — ela busca pelo seu nome ou e-mail.</p>",
      b: BT_PORTAL };
  }

  /* ================================================================
     PÁGINA INICIAL do módulo (/arche/)
     ================================================================ */
  function inicio() {
    // as caixas de senha somem — não há mais senha
    document.querySelectorAll(".card-auth").forEach(function (el) { el.remove(); });
    var sel = document.getElementById("course-select");
    var cardInd = document.getElementById("card-indicadores")
      || (document.querySelector("#card-dossie") && document.querySelector("#card-dossie").previousElementSibling);
    var cardDos = document.getElementById("card-dossie");
    var linkAv = function (mod) {
      var c = sel ? sel.value : "psicologia";
      return "/arche/" + mod + "/" + (c === "psicologia" ? "" : c + "/");
    };
    var apontar = function () {
      document.querySelectorAll(".card-cta").forEach(function (cta) {
        var card = cta.closest(".card");
        if (!card) return;
        var mod = card.id === "card-dossie" || /dossie/.test(card.id || "") ? "dossie" : "avaliacao";
        cta.removeAttribute("onclick");
        cta.onclick = function () { location.href = linkAv(mod) + (mod === "avaliacao" ? "?auth=ok" : ""); };
      });
    };

    if (!ACESSO || !ACESSO.logado) {
      // visitante com o selo do avaliador: só o bloco do avaliador lhe serve
      if (cardInd) cardInd.remove();
      if (cardDos) cardDos.remove();
      var alvo = document.querySelector(".cards") || document.querySelector("main") || document.body;
      var x = textoSemAcesso("inicio");
      var box = aviso(document.createElement("div"), x.t, x.c, x.b);
      alvo.parentNode.insertBefore(box, alvo);
      return;
    }
    if (ACESSO.papel === "nenhum") {
      if (cardInd) cardInd.remove();
      if (cardDos) cardDos.remove();
      var alvo2 = document.querySelector(".cards") || document.querySelector("main") || document.body;
      var y = textoSemAcesso("inicio");
      alvo2.parentNode.insertBefore(aviso(document.createElement("div"), y.t, y.c, y.b), alvo2);
      return;
    }
    // os cursos que a pessoa alcança — e só eles no seletor
    var permitidos = (ACESSO.cursos || []).concat(Object.keys(ACESSO.docenteEm || {}));
    if (sel && !ACESSO.gestao) {
      Array.prototype.slice.call(sel.options).forEach(function (o) {
        if (permitidos.indexOf(o.value) < 0) o.remove();
      });
      if (sel.options.length && permitidos.indexOf(sel.value) < 0) sel.selectedIndex = 0;
      sel.dispatchEvent(new Event("change"));
    }
    // o docente que não coordena não tem o que fazer nos indicadores
    if (ACESSO.papel === "docente" && cardInd) cardInd.remove();
    apontar();
  }

  /* ================================================================
     INDICADORES (/arche/avaliacao/…)
     ================================================================ */
  function indicadores() {
    var gate = document.getElementById("auth-gate");
    if (!gate) return;
    if (coordena(CURSO)) { gate.style.display = "none"; return; }
    var x = textoSemAcesso("avaliacao");
    gate.style.display = "flex";
    gate.style.alignItems = "flex-start";
    gate.style.overflow = "auto";
    aviso(gate, x.t, x.c, x.b);
  }

  /* ================================================================
     PRODUÇÃO DOCENTE (/arche/dossie/…)
     ================================================================ */
  var carregou = null;
  function esperarCarga() {
    /* O app lê o dossiê no arranque (`await loadSavedState()`), e só depois
       disso o quadro está montado. Ele não avisa quando termina — quem avisa
       é `deserializeAndMerge` sendo chamado (embrulhado aqui). Mas a resposta
       pode chegar ANTES de este append rodar (a página tem 600 KB para o
       navegador analisar), e quando o dossiê ainda não existe, ou a leitura é
       recusada, a função nunca é chamada. Por isso a segunda pista: o próprio
       PEDIDO de rede, que o navegador registra — terminado ele, com um respiro
       para o app digerir a resposta, o quadro é o que vai ser. E um prazo, para
       a tela nunca ficar esperando o que não vem. */
    if (carregou) return carregou;
    carregou = new Promise(function (resolve) {
      var pronto = false;
      var fim = function () { if (!pronto) { pronto = true; clearInterval(olho); resolve(); } };
      if (typeof window.deserializeAndMerge === "function") {
        var _des = window.deserializeAndMerge;
        window.deserializeAndMerge = function (json) {
          var r = _des.apply(this, arguments);
          try { reporEmails(json); } catch (e) { /* segue */ }
          setTimeout(fim, 0);
          return r;
        };
      }
      var url = (typeof DOSSIE_KEY === "string")
        ? location.origin + "/api/estado?chave=" + encodeURIComponent(DOSSIE_KEY) : "";
      var olho = setInterval(function () {
        if (!url || typeof performance === "undefined" || !performance.getEntriesByName) return;
        var feitos = performance.getEntriesByName(url, "resource").filter(function (e) { return e.responseEnd > 0; });
        if (feitos.length) { clearInterval(olho); setTimeout(fim, 400); }
      }, 120);
      setTimeout(fim, 6000);
    });
    return carregou;
  }

  /* O E-MAIL É O VÍNCULO FORTE, e o app compilado não o conhece: o
     `serializeState` dele grava só os campos que conhece, e o
     `deserializeAndMerge` reconstrói o quadro sem ele. Sem estes dois
     embrulhos, a primeira gravação de um docente apagaria o e-mail de todo o
     quadro — e ninguém mais encontraria a própria ficha. */
  function reporEmails(json) {
    var saved = JSON.parse(json);
    if (!saved || !Array.isArray(saved.profs) || typeof professors !== "object") return;
    if (saved.version < 3) return;
    saved.profs.forEach(function (sp, i) {
      if (professors[i] && sp && sp.email) professors[i].email = sp.email;
    });
  }
  function embrulharSerializacao() {
    if (typeof window.serializeState !== "function") return;
    var _ser = window.serializeState;
    window.serializeState = function () {
      var json = _ser.apply(this, arguments);
      try {
        var o = JSON.parse(json);
        if (o && Array.isArray(o.profs)) {
          o.profs.forEach(function (sp, i) {
            if (professors[i] && professors[i].email) sp.email = professors[i].email;
          });
          return JSON.stringify(o);
        }
      } catch (e) { /* devolve o original */ }
      return json;
    };
  }

  function chaveNome(v) {
    var s = String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    return s.split(" ").filter(Boolean).length >= 2 ? s : "";
  }
  /* A mesma identidade do servidor: e-mail, depois Lattes, depois nome com
     UMA candidata — nunca um registro que já é de outro e-mail. */
  function meuIndice() {
    if (typeof professors !== "object" || !ACESSO || !ACESSO.eu) return -1;
    var eu = ACESSO.eu.email;
    var livre = function (p) { return !p.email || p.email === eu; };
    for (var i = 0; i < professors.length; i++) if (professors[i] && professors[i].email === eu) return i;
    var d = docenteDe(CURSO);
    var cand = [];
    for (var j = 0; j < professors.length; j++) {
      var p = professors[j];
      if (p && livre(p) && d && chaveNome(p.nome) && chaveNome(p.nome) === chaveNome(d.nome)) cand.push(j);
    }
    if (cand.length === 1) return cand[0];
    if (d && professors[d.idx] && livre(professors[d.idx]) && chaveNome(professors[d.idx].nome) === chaveNome(d.nome)) return d.idx;
    return -1;
  }

  function rotulo(html) {
    var el = document.getElementById("roleLabel");
    if (el) el.innerHTML = html;
  }
  function trocaBotao(rot, fn) {
    var el = document.getElementById("roleLabel");
    if (!el) return;
    var b = document.createElement("button");
    b.className = "ava-troca"; b.type = "button"; b.textContent = rot; b.onclick = fn;
    el.appendChild(document.createElement("br"));
    el.appendChild(b);
  }

  function entrarComoCoordenacao() {
    if (typeof loginAsProppex !== "function") return;
    loginAsProppex();
    rotulo("<b>" + esc(ACESSO.eu && ACESSO.eu.nome || "") + "</b><br>"
      + (ACESSO.gestao ? "Gestão da Avaliação" : "Coordenação") + " · " + esc(nomeCurso(CURSO)));
    var i = meuIndice();
    if (i >= 0) trocaBotao("✎ Editar a minha ficha", function () { entrarComoDocente(i); });
    instalarGestaoDoQuadro();
    instalarEmNomeDo();
  }
  function entrarComoDocente(i) {
    if (typeof loginAsDocente !== "function") return;
    if (professors[i] && ACESSO.eu && !professors[i].email) professors[i].email = ACESSO.eu.email;
    loginAsDocente(i);
    rotulo("<b>" + esc(professors[i] ? professors[i].nome : "") + "</b><br>Docente · " + esc(nomeCurso(CURSO)));
    if (coordena(CURSO)) trocaBotao("← Quadro do curso", entrarComoCoordenacao);
  }

  /* EM NOME DO DOCENTE (pedido do dono, set/2026: "pode ser que precisemos
     anexar documentos em nome deles; alguns têm dificuldades com o sistema"):
     a coordenação e a gestão abrem a ficha de qualquer docente do curso no
     MESMO modo em que ele a abriria — importar o XML, anexar e excluir
     comprovantes, incluir produção à mão. O servidor já lhes dá a gravação
     total do curso e os uploads; o que faltava era a TELA, que só oferecia a
     ficha em leitura. Duas diferenças para a entrada do próprio docente: o
     e-mail de quem está olhando NUNCA é carimbado na ficha (seria ligar a
     conta da coordenação ao registro do professor), e o rótulo diz quem está
     agindo por quem — quem lê a tela precisa saber que ali não é o docente. */
  function entrarEmNomeDo(i) {
    if (typeof loginAsDocente !== "function" || !professors[i]) return;
    loginAsDocente(i);
    rotulo("<b>" + esc(professors[i].nome) + "</b><br>Editando em nome do docente · "
      + esc(ACESSO.eu && ACESSO.eu.nome || "coordenação"));
    trocaBotao("← Quadro do curso", entrarComoCoordenacao);
  }
  var emNomeInstalado = false;
  function instalarEmNomeDo() {
    if (emNomeInstalado || typeof window.openProfFromRoster !== "function") return;
    emNomeInstalado = true;
    var _abrir = window.openProfFromRoster;
    window.openProfFromRoster = function (idx) {
      var r = _abrir.apply(this, arguments);
      try {
        var barra = document.getElementById("backbar");
        if (!barra || !(typeof state === "object" && state.role === "proreitoria") || !coordena(CURSO)) return r;
        var b = barra.querySelector(".ava-emnome");
        if (!b) {
          b = document.createElement("button");
          b.type = "button"; b.className = "ava-troca ava-emnome";
          barra.appendChild(b);
        }
        b.textContent = "✎ Editar em nome do docente";
        b.title = "Abrir a ficha como o docente a abriria — importar o XML, anexar e excluir comprovantes";
        b.onclick = function () { entrarEmNomeDo(idx); };
      } catch (e) { /* a ficha abriu; o botão é o acessório */ }
      return r;
    };
  }

  /* A saída volta ao PORTAL: a tela de "entrar como" deixou de existir. */
  function saidaParaOPortal() {
    var b = document.getElementById("logout");
    if (!b) return;
    var novo = b.cloneNode(true);
    novo.textContent = "Sair para o portal";
    novo.addEventListener("click", function () { location.href = "/"; });
    b.parentNode.replaceChild(novo, b);
  }

  /* ---------------- o quadro docente pela coordenação ----------------
     Incluir = buscar entre os usuários do portal; retirar = tirar do
     documento gravado. Os dois vão ao servidor, que confere quem pede e
     grava; a tela só relê o dossiê e redesenha. */
  var filaQuadro = Promise.resolve();
  function relerQuadro() {
    return Promise.resolve(typeof loadSavedState === "function" ? loadSavedState() : null)
      .then(function () { if (typeof renderRoster === "function") renderRoster(); });
  }
  function dirCurso() { return CURSO; }

  function modalIncluir() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = '<div class="modal-box">'
      + "<h3>Incluir docente no dossiê</h3>"
      + '<div class="ava-nota" style="margin:0 0 6px">O professor precisa ter conta no ARCHÉ: busque pelo nome ou pelo e-mail. '
      + "Incluído, ele entra com a própria conta e preenche a ficha — XML do Lattes e comprovantes.</div>"
      + "<label>Nome ou e-mail</label>"
      + '<div class="ava-busca"><input id="avaBusca" placeholder="Ex.: Maria da Silva" autocomplete="off"></div>'
      + '<div class="ava-lista" id="avaLista"><div class="ava-vazio">Digite ao menos duas letras.</div></div>'
      + "<label>Função no curso</label>"
      + '<select id="avaFuncao">'
      + '<option value="Docente do Curso">Docente do Curso</option>'
      + '<option value="Coordenação Pedagógica">Coordenação Pedagógica</option>'
      + '<option value="Coordenação do Curso">Coordenação do Curso</option>'
      + '<option value="Coordenador de TCC">Coordenador de TCC</option>'
      + '<option value="Coordenação de Estágio">Coordenação de Estágio</option>'
      + '<option value="Coordenação de Atividades Complementares">Coordenação de Atividades Complementares</option>'
      + '<option value="Coordenador da Clínica Escola">Coordenador da Clínica Escola</option>'
      + "</select>"
      + '<div class="ava-nota">Não achou? A pessoa ainda não entrou no portal ou não completou o perfil: peça que acesse <b>arche.app.br/entrar</b> e preencha o cadastro; depois ela aparece aqui.</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="ava-bt sec" id="avaFechar" type="button">Fechar</button></div>'
      + "</div>";
    document.body.appendChild(overlay);
    var fechar = function () { overlay.remove(); };
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });
    overlay.querySelector("#avaFechar").onclick = fechar;
    var campo = overlay.querySelector("#avaBusca");
    var lista = overlay.querySelector("#avaLista");
    var t = null;
    var buscar = function () {
      var q = campo.value.trim();
      if (q.length < 2) { lista.innerHTML = '<div class="ava-vazio">Digite ao menos duas letras.</div>'; return; }
      lista.innerHTML = '<div class="ava-vazio">Buscando…</div>';
      fetch("/api/av/usuarios?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
        var us = (d && d.usuarios) || [];
        if (!us.length) { lista.innerHTML = '<div class="ava-vazio">Nenhum usuário com esse nome ou e-mail.</div>'; return; }
        lista.innerHTML = us.map(function (u) {
          var ja = typeof professors === "object" && professors.some(function (p) { return p && p.email === u.email; });
          return '<div class="ava-item" data-email="' + esc(u.email) + '">'
            + '<div class="n">' + esc(u.nome) + "<small>" + esc(u.email) + (u.curso ? " · " + esc(u.curso) : "") + "</small></div>"
            + (u.titulacao ? '<span class="t">' + esc(u.titulacao) + "</span>" : "")
            + (ja ? '<span class="t" style="background:#eceff3;color:#657179">já está</span>' : "")
            + "</div>";
        }).join("");
      }).catch(function () { lista.innerHTML = '<div class="ava-vazio">Não foi possível buscar agora.</div>'; });
    };
    campo.addEventListener("input", function () { clearTimeout(t); t = setTimeout(buscar, 280); });
    setTimeout(function () { campo.focus(); }, 30);
    lista.addEventListener("click", function (e) {
      var it = e.target.closest(".ava-item");
      if (!it) return;
      var email = it.getAttribute("data-email");
      var funcao = overlay.querySelector("#avaFuncao").value;
      it.style.opacity = ".5";
      filaQuadro = filaQuadro.then(function () {
        return fetch("/api/av/dossie/" + encodeURIComponent(dirCurso()) + "/docentes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, funcao: funcao }),
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (!x.ok) { alert(x.j && x.j.error || "Não foi possível incluir."); it.style.opacity = ""; return; }
            fechar();
            return relerQuadro().then(function () {
              if (x.j.jaEstava) alert((x.j.docente && x.j.docente.nome || "Esse docente") + " já estava no quadro — agora com a conta vinculada.");
            });
          }).catch(function () { alert("Não foi possível incluir agora."); it.style.opacity = ""; });
      });
    });
  }

  function retirar(idx) {
    var p = typeof professors === "object" ? professors[idx] : null;
    if (!p) return;
    var itens = p.data && p.data.groups ? p.data.groups.reduce(function (s, g) { return s + ((g.items || []).length); }, 0) : 0;
    if (!confirm("Retirar " + p.nome + " do quadro docente deste curso?"
      + (itens ? "\n\nA ficha tem " + itens + " item(ns) de produção importados; eles saem do dossiê (os arquivos ficam no Drive)." : "")
      + "\n\nA pessoa continua com a conta no portal; só deixa de aparecer neste dossiê.")) return;
    filaQuadro = filaQuadro.then(function () {
      return fetch("/api/av/dossie/" + encodeURIComponent(dirCurso()) + "/docentes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: p.email || "", lattesId: p.lattesId || "", nome: p.nome || "" }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) {
            /* dossiê ainda não gravado (só o quadro embutido na página): o
               registro sai da tela e o quadro inteiro é gravado como está */
            if (x.j && /não foi gravado/.test(x.j.error || "") && typeof serializeState === "function" && window.storage) {
              professors.splice(idx, 1);
              professors.forEach(function (q, i) { q.idx = i; });
              return window.storage.set(DOSSIE_KEY, serializeState()).then(relerQuadro);
            }
            alert(x.j && x.j.error || "Não foi possível retirar.");
            return;
          }
          return relerQuadro();
        }).catch(function () { alert("Não foi possível retirar agora."); });
    });
  }

  var gestaoInstalada = false;
  function instalarGestaoDoQuadro() {
    if (gestaoInstalada) return;
    gestaoInstalada = true;
    var bt = document.getElementById("btnAddDocente");
    if (bt) {
      var novo = bt.cloneNode(true);       // derruba o ouvinte do app (o modal antigo, digitado à mão)
      novo.textContent = "+ Incluir docente (buscar usuário)";
      novo.addEventListener("click", modalIncluir);
      bt.parentNode.replaceChild(novo, bt);
    }
    // o app chama `removeDocente(idx)` pelo nome global: a nossa versão grava
    if (typeof window.removeDocente === "function") window.removeDocente = retirar;
  }

  function dossie() {
    if (perfilAvaliador) return;             // o caminho do avaliador é do app, e fica como está
    var login = document.getElementById("loginView");
    if (!login) return;
    embrulharSerializacao();

    if (!ACESSO || !ACESSO.logado) {
      // selo do avaliador sem sessão: a visão dele é a de leitura, pelo caminho do app
      if (ACESSO && ACESSO.visualizacao) {
        var u = new URL(location.href); u.searchParams.set("perfil", "avaliador"); location.replace(u.toString()); return;
      }
      var x = textoSemAcesso("dossie"); aviso(login, x.t, x.c, x.b); return;
    }
    var souCoord = coordena(CURSO);
    var souDoc = !!docenteDe(CURSO);
    if (!souCoord && !souDoc) { var y = textoSemAcesso("dossie"); aviso(login, y.t, y.c, y.b); return; }

    // enquanto o dossiê carrega, a tela de "entrar como" não aparece
    login.innerHTML = '<div class="ava-aviso"><h2>Abrindo o dossiê…</h2><p>Carregando o quadro docente de '
      + esc(nomeCurso(CURSO)) + ".</p></div>";
    saidaParaOPortal();
    esperarCarga().then(function () {
      if (souCoord) { entrarComoCoordenacao(); return; }
      var i = meuIndice();
      if (i < 0) {
        aviso(login, "A sua ficha não foi encontrada neste dossiê",
          "<p>A coordenação incluiu <b>" + esc(docenteDe(CURSO).nome) + "</b> no quadro, mas o registro carregado nesta página não casou com a sua conta. Recarregue a página; se persistir, peça à coordenação que inclua a sua conta de novo pela busca de usuários.</p>",
          '<a class="ava-bt" href="' + esc(location.pathname) + '">Recarregar</a>' + BT_PORTAL);
        return;
      }
      entrarComoDocente(i);
    });
  }

  /* ================================================================ */
  function comAcesso(fn) {
    fetch("/api/av/acesso", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (a) { ACESSO = a; fn(); })
      .catch(function () { ACESSO = null; fn(); });
  }
  function rodar() {
    // o dossiê precisa embrulhar a carga ANTES de o app terminar de ler
    if (MODULO === "dossie" && !perfilAvaliador) esperarCarga();
    comAcesso(function () {
      try {
        if (MODULO === "inicio") inicio();
        else if (MODULO === "avaliacao") indicadores();
        else if (MODULO === "dossie") dossie();
      } catch (e) { console.error("[ARCHÉ AV] acesso:", e); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rodar);
  else rodar();
})();
