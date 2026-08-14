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

  function logado(caixa, me) {
    var nome = (me.perfil && me.perfil.nome) || me.nome || me.email || "";
    if (nome.indexOf("@") > 0) nome = nome.split("@")[0];      // conta sem perfil preenchido
    var curto = String(nome).trim().split(/\s+/).slice(0, 2).join(" ");
    var foto = me.perfil && me.perfil.foto;
    var inicial = String(curto || "?").trim().charAt(0).toUpperCase() || "?";
    caixa.innerHTML = '<a class="nav-perfil" href="/perfil/" title="Meu perfil">'
      + '<span class="nav-av">' + (foto ? '<img src="' + esc(foto) + '" alt="">' : esc(inicial)) + "</span>"
      + '<span class="nav-id"><b>' + esc(curto) + "</b><span>"
      + esc(PAPEL[me.papel] || me.papel) + "</span></span></a>"
      + '<button class="nav-sair" type="button">sair</button>';
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
