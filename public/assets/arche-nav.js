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

  var MODULOS = [
    { href: "/",             rot: "Portal",            teste: function (p) { return p === "/" || p === "/index.html"; } },
    // mesma ordem dos cartões do portal
    { href: "/atas/",        rot: "Atas",              teste: function (p) { return p.indexOf("/atas") === 0; } },
    { href: "/extensao/",    rot: "Extensão",          teste: function (p) { return p.indexOf("/extensao") === 0; } },
    { href: "/pesquisa/ic/", rot: "Pesquisa · IC",     teste: function (p) { return p.indexOf("/pesquisa") === 0; } },
    { href: "/arche/",       rot: "Avaliação",         teste: function (p) { return p.indexOf("/arche") === 0; } },
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
      ".arche-alertas{position:fixed;z-index:10000;top:52px;right:16px;width:min(380px,calc(100vw - 24px));" +
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
      "@media(max-width:600px){.arche-topnav{padding:8px 12px;gap:4px}" +
      ".arche-topnav a{font-size:12px;padding:5px 9px}.arche-topnav .nav-brand{font-size:13px}" +
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

  function conta() {
    var caixa = document.createElement("span");
    caixa.className = "nav-conta";
    fetch("/api/me")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { if (me && me.email) logado(caixa, me); else entrar(caixa); })
      .catch(function () { entrar(caixa); });
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
  function aplicarVisibilidade() {
    fetch("/api/me")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me || !me.email) return;                      // visitante: tudo como hoje
        var gestao = me.papel === "gestor" || (me.modulos || []).length > 0;
        if (gestao) return;                                // gestão e coordenações veem tudo
        var aluno = me.perfil && me.perfil.funcao === "aluno";
        var esconder = aluno ? ["/atas/", "/inovacao/", "/arche/"] : ["/arche/"];
        esconder.forEach(function (href) {
          var alvos = document.querySelectorAll(
            '[data-setor="' + href + '"], .arche-topnav a[data-arche-nav="' + href + '"]');
          for (var i = 0; i < alvos.length; i++) alvos[i].style.display = "none";
        });
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
      MODULOS.forEach(function (m) {
        if (m.teste(caminho)) return;                       // o módulo atual já está na barra
        if (existente.querySelector('[data-arche-nav="' + m.href + '"]')) return;
        dir.appendChild(link(m));
      });
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
    MODULOS.forEach(function (m) { nav.appendChild(link(m)); });

    var dir2 = document.createElement("span");
    dir2.className = "nav-dir";
    // no próprio portal o "voltar" não faz sentido — ali fica só a conta
    if (!(caminho === "/" || caminho === "/index.html")) dir2.appendChild(voltarPortal());
    if (TEM_CONTA) dir2.appendChild(conta());
    nav.appendChild(dir2);

    document.body.insertBefore(nav, document.body.firstChild);
  }

  function iniciar() { montar(); aplicarVisibilidade(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
