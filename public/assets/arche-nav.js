/* ========================================================================
   Barra de navegação institucional — presente em todos os módulos.
   Dá sempre um caminho de volta ao portal e o trânsito direto entre os
   setores, sem depender do botão "voltar" do navegador.

   Convive com o que já existe: quando a página já tem uma barra própria
   (o módulo de Avaliação tem), os atalhos globais são acrescentados a ela
   em vez de criar uma segunda barra.
   ======================================================================== */
(function () {
  if (window.__archeNav) return;
  window.__archeNav = true;

  /* ---------------------------- os atalhos -----------------------------
     A barra foi de 11 atalhos soltos a SEIS entradas, agrupadas pelo que a
     pessoa vem fazer (ideia do dono, ago/2026): Portal, Ensino, Pesquisa,
     Extensão, Serviços e a visão pública. Onze rótulos lado a lado não são
     um menu — são uma lista que se lê inteira toda vez, e no celular
     viravam uma faixa rolante em que ninguém achava nada.

     CERTIFICADOS aparece em TRÊS grupos, apontando sempre para a mesma
     página (decisão do dono): o histórico é UM só, do usuário, e quem foi
     monitor procura o certificado em "Ensino", quem foi bolsista em
     "Pesquisa" e quem organizou um evento em "Extensão". Repetir o link é
     mais barato do que obrigar a adivinhar em qual gaveta ele mora.

     `principal: false` diz que o item não acende o grupo: sem isso, estando
     em /certificados/ os três grupos ficariam marcados como o lugar onde
     você está, o que não ajuda ninguém a se localizar. */
  function em(prefixo) {
    return function (p) { return p.indexOf(prefixo) === 0; };
  }
  var CERTIFICADOS = { href: "/certificados/", rot: "Certificados",
    sub: "Todos os seus, num lugar só", teste: em("/certificados"), principal: false };

  var NAV = [
    { href: "/", rot: "Portal", teste: function (p) { return p === "/" || p === "/index.html"; } },
    { grupo: "Ensino", itens: [
      { href: "/praticas/", rot: "Aulas Práticas", sub: "Relatórios das aulas práticas · PROAC", teste: em("/praticas") },
      { href: "/monitoria/", rot: "Monitoria", sub: "Projetos, monitores e relatórios", teste: em("/monitoria") },
      CERTIFICADOS,
    ] },
    { grupo: "Pesquisa", itens: [
      { href: "/pesquisa/ic/", rot: "Pesquisa · IC", sub: "Iniciação Científica e ICEM", teste: em("/pesquisa") },
      CERTIFICADOS,
    ] },
    { grupo: "Extensão", itens: [
      // o EV vem antes do EX na ordem do dono: quem organiza um evento entra
      // por ele todo dia; a proposta da ação, uma vez
      { href: "/eventos/gestao/", rot: "Eventos", sub: "Inscrições, credenciamento e transmissão", teste: em("/eventos/gestao") },
      { href: "/extensao/", rot: "Extensão", sub: "Ações, aprovação e relatório final", teste: em("/extensao") },
      CERTIFICADOS,
    ] },
    { grupo: "Serviços", itens: [
      { href: "/atas/", rot: "Atas", sub: "Reuniões dos órgãos colegiados", teste: em("/atas") },
      { href: "/espacos/", rot: "Espaços", sub: "Reserva de auditório, salas e laboratórios", teste: em("/espacos") },
      { href: "/relatorios/", rot: "Relatórios", sub: "Relatório semestral por setor", teste: em("/relatorios") },
      { href: "/arche/", rot: "Avaliação", sub: "Avaliação Institucional · SINAES", teste: em("/arche") },
    ] },
    // a VISÃO PÚBLICA do portal (pedido do dono, ago/2026): a mesma página que
    // o visitante sem login encontra — vitrine dos editais e resultados da IC e
    // dos eventos abertos. Quem está logado chega nela por aqui, sem sair da
    // conta, para conferir o que o público está vendo
    { href: "/?publico=1", rot: "Página inicial", teste: function () { return false; } },
  ];

  var caminho = location.pathname;

  function estilo() {
    if (document.getElementById("arche-nav-css")) return;
    var s = document.createElement("style");
    s.id = "arche-nav-css";
    s.textContent =
      ".arche-topnav{position:sticky;top:0;z-index:9999;display:flex;align-items:center;gap:8px;" +
      "padding:9px 22px;background:#1c3742;border-bottom:2px solid #40717e;" +
      "font-family:'Figtree','IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;flex-wrap:wrap}" +
      ".arche-topnav a{color:#fff;text-decoration:none;font-size:13px;font-weight:500;padding:6px 12px;" +
      "border-radius:6px;transition:.15s;opacity:.82;white-space:nowrap}" +
      ".arche-topnav a:hover{opacity:1;background:rgba(255,255,255,.12)}" +
      ".arche-topnav a.active{opacity:1;background:rgba(113,200,226,.18);color:#fff}" +
      ".arche-topnav .nav-brand{font-weight:800;letter-spacing:.08em;font-size:14px;opacity:1;display:flex;align-items:center;gap:7px}" +
      ".arche-topnav .nav-sep{width:1px;height:20px;background:rgba(255,255,255,.18);margin:0 4px}" +
      ".arche-topnav .nav-dir{margin-left:auto;display:flex;align-items:center;gap:6px}" +
      /* GRUPO que expande ao clicar. O painel é `fixed` e posicionado a
         partir do botão, não `absolute` dentro da barra: no celular a barra
         é um contêiner com rolagem horizontal, e um painel absoluto seria
         recortado por ela — abriria pela metade, ou não abriria. */
      ".arche-topnav .nav-gr{background:none;border:0;font-family:inherit;color:#fff;font-size:13px;" +
      "font-weight:500;padding:6px 12px;border-radius:6px;opacity:.82;cursor:pointer;white-space:nowrap;" +
      "display:inline-flex;align-items:center;gap:6px;transition:.15s}" +
      ".arche-topnav .nav-gr:hover{opacity:1;background:rgba(255,255,255,.12)}" +
      ".arche-topnav .nav-gr.active{opacity:1;background:rgba(113,200,226,.18)}" +
      '.arche-topnav .nav-gr[aria-expanded="true"]{opacity:1;background:rgba(255,255,255,.16)}' +
      ".arche-topnav .nav-gr .seta{font-size:8px;opacity:.75;transition:transform .15s}" +
      '.arche-topnav .nav-gr[aria-expanded="true"] .seta{transform:rotate(180deg)}' +
      ".arche-menu{position:fixed;z-index:10001;min-width:236px;max-width:min(320px,calc(100vw - 16px));" +
      "background:#fff;border:1px solid #dde4e8;border-radius:12px;padding:6px;" +
      "box-shadow:0 14px 40px -12px rgba(24,38,50,.35);font-family:inherit}" +
      ".arche-menu a{display:block;padding:9px 11px;border-radius:8px;text-decoration:none;transition:.12s}" +
      ".arche-menu a:hover,.arche-menu a:focus-visible{background:#e6f5fa;outline:none}" +
      ".arche-menu a.aqui{background:#e6f5fa;box-shadow:inset 3px 0 0 #40717e}" +
      ".arche-menu b{display:block;font-size:13px;font-weight:700;color:#1c3742}" +
      ".arche-menu span{display:block;font-size:11.5px;color:#657179;margin-top:1px;line-height:1.35}" +
      ".arche-topnav .nav-portal{border:1px solid rgba(113,200,226,.5);color:#71c8e2;font-weight:600}" +
      ".arche-topnav .nav-portal:hover{background:rgba(113,200,226,.15);color:#fff}" +
      /* conta do usuário, à direita de tudo */
      ".arche-topnav .nav-conta{display:flex;align-items:center;gap:2px;margin-left:4px;" +
      "padding-left:8px;border-left:1px solid rgba(255,255,255,.18)}" +
      ".arche-topnav a.nav-perfil{display:flex;align-items:center;gap:8px;padding:4px 8px;opacity:.92}" +
      ".arche-topnav a.nav-perfil:hover{opacity:1}" +
      ".arche-topnav .nav-av{width:26px;height:26px;border-radius:50%;background:#40717e;color:#fff;" +
      "display:grid;place-items:center;font-size:11.5px;font-weight:700;flex:none;overflow:hidden}" +
      ".arche-topnav .nav-av img{width:100%;height:100%;object-fit:cover;display:block}" +
      ".arche-topnav .nav-id{display:flex;flex-direction:column;line-height:1.2;max-width:150px}" +
      ".arche-topnav .nav-id b{font-size:12.5px;font-weight:700;color:#fff;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".arche-topnav .nav-id span{font-size:10px;color:rgba(255,255,255,.6);" +
      "text-transform:uppercase;letter-spacing:.06em}" +
      ".arche-topnav .nav-sair{background:none;border:0;font-family:inherit;font-size:11.5px;font-weight:600;" +
      "color:rgba(255,255,255,.6);cursor:pointer;padding:6px 9px;border-radius:6px;transition:.15s}" +
      ".arche-topnav .nav-sair:hover{color:#fff;background:rgba(255,255,255,.12)}" +
      ".arche-topnav .nav-sair[disabled]{opacity:.6;cursor:default}" +
      ".arche-topnav a.nav-entrar{border:1px solid rgba(113,200,226,.5);color:#71c8e2;font-weight:600;opacity:1}" +
      ".arche-topnav a.nav-entrar:hover{background:rgba(113,200,226,.15);color:#fff}" +
      /* sino de alertas da gestão: badge com o total e painel suspenso */
      ".arche-topnav .nav-sino{position:relative;background:none;border:0;cursor:pointer;color:#fff;" +
      "font-size:16px;padding:6px 9px;border-radius:8px;opacity:.85;transition:.15s;line-height:1}" +
      ".arche-topnav .nav-sino:hover{opacity:1;background:rgba(255,255,255,.12)}" +
      ".arche-topnav .nav-sino .qt{position:absolute;top:0;right:0;min-width:16px;height:16px;" +
      "border-radius:9px;background:#e2a63d;color:#1c3742;font-size:10px;font-weight:800;" +
      "display:grid;place-items:center;padding:0 4px;border:2px solid #1c3742}" +
      /* ancorado ao FIM da barra, não a uma altura fixa: com a barra em mais
         de uma linha, os 52px abriam o painel POR CIMA dela */
      ".arche-alertas{position:fixed;z-index:10000;top:var(--nav-alt,52px);right:16px;width:min(380px,calc(100vw - 24px));" +
      "background:#fff;border:1px solid #dde4e8;border-radius:14px;box-shadow:0 14px 40px -12px rgba(24,38,50,.35);" +
      "overflow:hidden;font-family:inherit}" +
      ".arche-alertas .cab{padding:12px 16px;font-weight:800;font-size:13px;color:#1c3742;" +
      "border-bottom:1px solid #dde4e8;background:#eef3f5}" +
      ".arche-alertas a.it{display:block;padding:11px 16px;border-bottom:1px solid #eef1f4;" +
      "text-decoration:none;transition:.12s}" +
      ".arche-alertas a.it:hover{background:#e6f5fa}" +
      ".arche-alertas a.it:last-child{border-bottom:0}" +
      ".arche-alertas .set{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#40717e}" +
      ".arche-alertas .tx{font-size:13px;color:#182632;font-weight:600;margin-top:2px}" +
      ".arche-alertas .dt{font-size:11.5px;color:#657179;margin-top:2px}" +
      ".arche-alertas .zero{padding:18px 16px;font-size:13px;color:#657179}" +
      /* No CELULAR a barra rola na horizontal, em UMA linha (varredura de
         ago/2026): com `flex-wrap:wrap` os 11 atalhos viravam ~4 linhas
         grudadas no topo — cerca de um quinto da tela, em toda rolagem, em
         todas as páginas. É o mesmo recurso que as barras internas dos
         setores já usam. A CONTA fica fora da rolagem, colada à direita:
         sair do sistema não pode depender de rolar a barra até o fim. */
      "@media(max-width:600px){.arche-topnav{padding:8px 12px;gap:4px;flex-wrap:nowrap;" +
      "overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}" +
      ".arche-topnav::-webkit-scrollbar{display:none}" +
      ".arche-topnav a{font-size:12px;padding:5px 9px}.arche-topnav .nav-brand{font-size:13px}" +
      ".arche-topnav .nav-dir{position:sticky;right:0;flex:none;background:#1c3742;padding-left:6px}" +
      /* no celular a barra é estreita e fica presa no topo: a conta se reduz
         ao avatar (que leva ao perfil) e o botão de voltar sai, já que o link
         "Portal" está ali do lado. Assim ela não come a tela. */
      ".arche-topnav .nav-id{display:none}.arche-topnav .nav-portal{display:none}" +
      ".arche-topnav .nav-conta{margin-left:0;padding-left:6px}}";
    document.head.appendChild(s);
  }

  function link(m) {
    var a = document.createElement("a");
    a.href = m.href; a.textContent = m.rot;
    a.dataset.archeNav = m.href;
    if (m.teste(caminho)) a.className = "active";
    return a;
  }

  /* ---------------------- grupos que expandem ao clicar -----------------
     Um painel por vez, aberto no clique (não no passar do mouse: metade do
     portal é usada no celular, onde não existe "passar o mouse", e menu que
     abre sozinho no desktop atrapalha quem só estava a caminho de outro
     botão). Fecha ao clicar fora, com Esc, ao rolar e ao redimensionar —
     um painel `fixed` que não seguisse o botão ficaria solto na tela. */
  var ABERTO = null;

  function fecharMenu() {
    if (!ABERTO) return;
    ABERTO.painel.remove();
    ABERTO.botao.setAttribute("aria-expanded", "false");
    ABERTO = null;
  }

  function abrirMenu(g, botao) {
    fecharMenu();
    var painel = document.createElement("div");
    painel.className = "arche-menu";
    painel.setAttribute("role", "menu");
    g.itens.filter(visivel).forEach(function (m) {
      var a = document.createElement("a");
      a.href = m.href;
      a.dataset.archeNav = m.href;
      a.setAttribute("role", "menuitem");
      if (m.teste(caminho)) a.className = "aqui";
      a.innerHTML = "<b>" + esc(m.rot) + "</b>" + (m.sub ? "<span>" + esc(m.sub) + "</span>" : "");
      painel.appendChild(a);
    });
    document.body.appendChild(painel);
    botao.setAttribute("aria-expanded", "true");
    ABERTO = { painel: painel, botao: botao };
    posicionar();
    setTimeout(function () {
      document.addEventListener("click", function fora(ev) {
        if (ABERTO && !ABERTO.painel.contains(ev.target) && ev.target !== ABERTO.botao
          && !ABERTO.botao.contains(ev.target)) {
          fecharMenu(); document.removeEventListener("click", fora);
        }
      });
    }, 0);
  }

  /** Cola o painel embaixo do botão, sem deixá-lo sair da tela. */
  function posicionar() {
    if (!ABERTO) return;
    var r = ABERTO.botao.getBoundingClientRect();
    // botão que saiu inteiro da vista (barra rolada) leva o painel junto
    if (r.bottom < 0 || r.top > window.innerHeight) { fecharMenu(); return; }
    var larg = ABERTO.painel.offsetWidth;
    ABERTO.painel.style.top = (r.bottom + 6) + "px";
    ABERTO.painel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - larg - 8)) + "px";
  }

  function grupo(g) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "nav-gr";
    b.dataset.archeGrupo = g.grupo;
    b.setAttribute("aria-haspopup", "true");
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = esc(g.grupo) + '<span class="seta" aria-hidden="true">▼</span>';
    // o grupo acende quando você está DENTRO dele — menos os itens marcados
    // com principal:false (Certificados mora em três grupos)
    if (g.itens.some(function (m) { return m.principal !== false && m.teste(caminho); })) {
      b.classList.add("active");
    }
    b.onclick = function (ev) {
      ev.stopPropagation();
      if (ABERTO && ABERTO.botao === b) fecharMenu(); else abrirMenu(g, b);
    };
    return b;
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && ABERTO) { var b = ABERTO.botao; fecharMenu(); b.focus(); }
  });
  /* O painel SEGUE o botão em vez de fechar (achado do teste no celular,
     ago/2026): fechar ao rolar parecia certo, mas ali a própria barra é um
     contêiner com rolagem horizontal — tocar num botão que está meio fora
     da tela faz o navegador rolá-la para trazê-lo à vista, e esse rolar
     fechava o menu que o toque acabara de abrir. O painel abria e sumia. */
  window.addEventListener("resize", posicionar);
  window.addEventListener("scroll", posicionar, true);

  /** Uma entrada da barra: link solto ou grupo. */
  function entrada(n) { return n.grupo ? grupo(n) : link(n); }

  /* ------------------------------- conta -------------------------------- */
  // A Avaliação é setor aberto (não pede login) e a tela de entrada já é o
  // próprio login: nas duas, a conta não entra na barra.
  var TEM_CONTA = caminho.indexOf("/arche") !== 0 && caminho.indexOf("/entrar") !== 0;

  var PAPEL = {
    gestor: "PROPPEX", coordenador: "Coordenação",
    aprovado: "Docente", pendente: "Acesso pendente",
  };

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function entrar(caixa) {
    caixa.innerHTML = '<a class="nav-entrar" href="/entrar/?next='
      + encodeURIComponent(caminho + location.search) + '">Entrar</a>';
  }

  /* Sino de alertas — só para quem gere algo (gestor geral ou coordenador
     de módulo): o servidor recorta os alertas pelo setor de cada um, então
     aqui basta pedir e mostrar. Clicar fora fecha o painel. */
  function sino(caixa, me) {
    if (me.papel !== "gestor" && me.papel !== "coordenador") return;
    var btn = document.createElement("button");
    btn.className = "nav-sino"; btn.type = "button"; btn.title = "Alertas da gestão";
    btn.innerHTML = "🔔";
    caixa.insertBefore(btn, caixa.firstChild);
    var painel = null, dados = null;

    function fechar() { if (painel) { painel.remove(); painel = null; } }
    function abrir() {
      fechar();
      painel = document.createElement("div");
      painel.className = "arche-alertas";
      var itens = (dados && dados.alertas) || [];
      painel.innerHTML = '<div class="cab">Alertas da gestão</div>'
        + (itens.length ? itens.map(function (a) {
          return '<a class="it" href="' + esc(a.link || "#") + '">'
            + '<div class="set">' + esc(a.setor || "") + "</div>"
            + '<div class="tx">' + esc(a.texto || "") + "</div>"
            + (a.detalhe ? '<div class="dt">' + esc(a.detalhe) + "</div>" : "")
            + "</a>";
        }).join("") : '<div class="zero">Tudo em dia — nada aguardando validação ou autorização.</div>');
      document.body.appendChild(painel);
      setTimeout(function () {
        document.addEventListener("click", function fora(ev) {
          if (painel && !painel.contains(ev.target) && ev.target !== btn) {
            fechar(); document.removeEventListener("click", fora);
          }
        });
      }, 0);
    }

    btn.onclick = function (ev) { ev.stopPropagation(); if (painel) fechar(); else abrir(); };

    fetch("/api/alertas")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        dados = j;
        if (j.total > 0) {
          var q = document.createElement("span");
          q.className = "qt"; q.textContent = j.total > 99 ? "99+" : String(j.total);
          btn.appendChild(q);
        }
      })
      .catch(function () {});
  }

  function logado(caixa, me) {
    var nome = (me.perfil && me.perfil.nome) || me.nome || me.email || "";
    if (nome.indexOf("@") > 0) nome = nome.split("@")[0];      // conta sem perfil preenchido
    var curto = String(nome).trim().split(/\s+/).slice(0, 2).join(" ");
    var foto = me.perfil && me.perfil.foto;
    var inicial = String(curto || "?").trim().charAt(0).toUpperCase() || "?";
    caixa.innerHTML = '<a class="nav-perfil" href="/perfil/" title="Meu perfil">'
      + '<span class="nav-av">' + (foto ? '<img src="' + esc(foto) + '" alt="">' : esc(inicial)) + "</span>"
      + '<span class="nav-id"><b>' + esc(curto) + "</b><span>"
      // "Docente" é o rótulo de quem foi aprovado — mas o aluno indicado para
      // a IC também tem conta aprovada, e chamá-lo de docente é errado
      + esc((me.perfil && me.perfil.funcao === "aluno" && me.papel === "aprovado")
        ? "Estudante" : (PAPEL[me.papel] || me.papel)) + "</span></span></a>"
      + '<button class="nav-sair" type="button">sair</button>';
    sino(caixa, me);
    caixa.querySelector(".nav-sair").onclick = function () {
      this.disabled = true; this.textContent = "saindo…";
      // no portal a página não depende da sessão e basta redesenhar a barra;
      // dentro de um setor, o conteúdo já não vale mais — volta-se ao portal
      var noPortal = caminho === "/" || caminho === "/index.html";
      fetch("/auth/sair", { method: "POST" })
        .then(function (r) {
          if (r.ok && noPortal) entrar(caixa);
          else location.href = noPortal ? location.href : "/";
        })
        .catch(function () { location.reload(); });
    };
  }

  // um único /api/me por página: a caixa da conta e o filtro de setores
  // partilham a mesma resposta (duas chamadas renovavam a sessão duas vezes)
  var ME_PROMESSA = null;
  function quemSou() {
    if (!ME_PROMESSA) {
      ME_PROMESSA = fetch("/api/me")
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return ME_PROMESSA;
  }

  function conta() {
    var caixa = document.createElement("span");
    caixa.className = "nav-conta";
    quemSou().then(function (me) { if (me && me.email) logado(caixa, me); else entrar(caixa); });
    return caixa;
  }

  function voltarPortal() {
    var a = document.createElement("a");
    a.href = "/"; a.className = "nav-portal";
    a.textContent = "← Voltar à página principal";
    a.dataset.archeNav = "portal";
    return a;
  }

  /* ------------------------- o que cada um vê ---------------------------
     Filtro de APRESENTAÇÃO (decisão do dono, ago/2026): a página inicial e
     os atalhos da barra mostram a cada usuário só os setores do seu dia a
     dia — aluno vê Extensão e Pesquisa·IC; professor e demais veem tudo
     menos a Avaliação; gestores gerais e coordenadores veem tudo; visitante
     sem login vê o portal como sempre. Quem BARRA acesso continua sendo o
     servidor (login nos setores, portaria na Avaliação) — esconder cartão
     não é porta. Os cartões do portal carregam data-setor com o href. */
  var OCULTOS = {};
  function visivel(m) { return !OCULTOS[m.href]; }

  /** Aplica o estado à barra: link oculto some, e GRUPO sem nenhum item
      visível some junto — quatro menus vazios seriam pior que nenhum. */
  function atualizarBarra() {
    var links = document.querySelectorAll(".arche-topnav a[data-arche-nav]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].dataset.archeNav;
      if (href && href !== "portal") links[i].style.display = OCULTOS[href] ? "none" : "";
    }
    NAV.forEach(function (n) {
      if (!n.grupo) return;
      var b = document.querySelector('.arche-topnav [data-arche-grupo="' + n.grupo + '"]');
      if (b) b.style.display = n.itens.some(visivel) ? "" : "none";
    });
  }

  function aplicarVisibilidade() {
    quemSou()
      .then(function (me) {
        var esconder;
        if (!me || !me.email) {
          // visitante (decisão do dono, ago/2026): a barra deixa de anunciar
          // os setores de gestão — os atalhos levariam à tela de login. As
          // páginas públicas (vitrines, hotsites) ficam só com "Portal" e a
          // visão pública; os quatro grupos somem inteiros, por ficarem vazios.
          esconder = ["/atas/", "/extensao/", "/eventos/gestao/", "/pesquisa/ic/", "/monitoria/",
            "/praticas/", "/relatorios/", "/espacos/", "/arche/", "/certificados/"];
        } else if (me.papel === "gestor" || (me.modulos || []).length > 0) {
          esconder = [];                                   // gestão e coordenações veem tudo
        } else {
          // Espaços fica visível a TODO usuário logado (decisão do dono,
          // ago/2026): quem solicita reserva é professor, coordenação, setor,
          // acadêmico — e até a comunidade, pela conta de quem a recebe.
          // Monitoria idem, e por um motivo mais forte: metade do setor é do
          // ALUNO (é ele quem se inscreve como monitor e entrega o relatório).
          // Aluno não organiza evento (participa pela página pública) — o setor
          // EV é de quem propõe e opera. Relatórios é da gestão: quem não
          // coordena setor nenhum não tem o que emitir, e a rota o recusaria.
          esconder = (me.perfil && me.perfil.funcao === "aluno")
            ? ["/atas/", "/inovacao/", "/arche/", "/eventos/gestao/", "/relatorios/", "/praticas/"]
            : ["/arche/", "/relatorios/"];
        }
        OCULTOS = {};
        esconder.forEach(function (href) { OCULTOS[href] = true; });
        atualizarBarra();
        // os cartões do portal carregam data-setor com o mesmo href
        esconder.forEach(function (href) {
          var alvos = document.querySelectorAll('[data-setor="' + href + '"]');
          for (var i = 0; i < alvos.length; i++) alvos[i].style.display = "none";
        });
        /* E o GRUPO some quando nenhum cartão dele sobrou: o aluno veria um
           título "SERVIÇOS" sobre o vazio, que é pior do que não ter grupo. */
        var grupos = document.querySelectorAll(".setor-grupo[data-grupo]");
        for (var g = 0; g < grupos.length; g++) {
          var cartoes = grupos[g].querySelectorAll("[data-setor]");
          var algum = false;
          for (var c = 0; c < cartoes.length; c++) {
            if (cartoes[c].style.display !== "none") { algum = true; break; }
          }
          if (!algum) grupos[g].style.display = "none";
        }
      })
      .catch(function () {});
  }

  function montar() {
    estilo();
    var existente = document.querySelector(".arche-topnav");

    if (existente) {
      // a página já tem barra própria (Avaliação): completa com os atalhos
      // globais que faltarem, preservando os links internos do módulo
      var dir = document.createElement("span");
      dir.className = "nav-dir";
      NAV.forEach(function (n) { dir.appendChild(entrada(n)); });
      dir.appendChild(voltarPortal());
      if (TEM_CONTA) dir.appendChild(conta());
      existente.appendChild(dir);
      return;
    }

    var nav = document.createElement("nav");
    nav.className = "arche-topnav";
    var marca = document.createElement("a");
    marca.href = "/"; marca.className = "nav-brand";
    marca.innerHTML = '<svg width="18" height="18" viewBox="0 0 40 42" aria-hidden="true">' +
      '<path d="M7 39 V20 a13 13 0 0 1 26 0 V39" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"></path>' +
      '<circle cx="20" cy="20" r="3.6" fill="#71c8e2"></circle></svg>ARCHÉ';
    nav.appendChild(marca);
    var sep = document.createElement("span"); sep.className = "nav-sep"; nav.appendChild(sep);
    NAV.forEach(function (n) { nav.appendChild(entrada(n)); });

    var dir2 = document.createElement("span");
    dir2.className = "nav-dir";
    // no próprio portal o "voltar" não faz sentido — ali fica só a conta
    if (!(caminho === "/" || caminho === "/index.html")) dir2.appendChild(voltarPortal());
    if (TEM_CONTA) dir2.appendChild(conta());
    nav.appendChild(dir2);

    document.body.insertBefore(nav, document.body.firstChild);
    // a altura REAL da barra alimenta o painel do sino: no celular ela pode
    // ser mais alta que os 52px que estavam cravados, e o painel abria por
    // cima dela (varredura de ago/2026)
    var medir = function () {
      document.documentElement.style.setProperty("--nav-alt", (nav.offsetHeight + 4) + "px");
    };
    medir();
    window.addEventListener("resize", medir);
  }

  /* --------------------- modo AVALIADOR (visualização) -------------------
     Quem entrou pelo atalho arche.app.br/avaliador carrega o selo de
     visualização e NÃO deve ver os atalhos dos setores (só o levariam a
     telas de login): dentro da Avaliação, a barra se reduz à navegação dele
     — a marca e o "← Página do avaliador". Os links do próprio app que
     apontam ao início do módulo (/arche/, com os acessos de submissão)
     passam a voltar à página do avaliador. Quem tem sessão no ARCHÉ nunca
     entra neste modo. */
  function montarModoAvaliador() {
    var alvo = document.querySelector(".arche-topnav");
    if (!alvo) {
      alvo = document.createElement("nav");
      alvo.className = "arche-topnav";
      var marca = document.createElement("a");
      marca.href = "/avaliador"; marca.className = "nav-brand"; marca.textContent = "ARCHÉ";
      alvo.appendChild(marca);
      document.body.insertBefore(alvo, document.body.firstChild);
    }
    var dir = document.createElement("span");
    dir.className = "nav-dir";
    var volta = document.createElement("a");
    volta.href = "/avaliador"; volta.className = "nav-portal";
    volta.textContent = "← Página do avaliador";
    dir.appendChild(volta);
    alvo.appendChild(dir);
    // "Início"/marca do app apontam ao módulo completo — no modo avaliador,
    // voltam à página dele (compara o caminho resolvido, não o texto)
    var links = alvo.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      try {
        var p = new URL(links[i].href, location.origin).pathname;
        if (p === "/arche/" || p === "/arche") links[i].href = "/avaliador";
      } catch (e) { /* href torto: deixa como está */ }
    }
  }

  function iniciar() {
    // dentro da Avaliação, primeiro se descobre QUEM olha: o selo de
    // visualização troca a barra inteira (a consulta é local e rápida;
    // qualquer erro cai na barra normal)
    if (caminho.indexOf("/arche") === 0) {
      fetch("/api/av/quem")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (q) {
          if (q && q.via === "avaliador" && !q.logado) montarModoAvaliador();
          else { montar(); aplicarVisibilidade(); }
        })
        .catch(function () { montar(); aplicarVisibilidade(); });
      return;
    }
    montar(); aplicarVisibilidade();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
