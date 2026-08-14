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
      "@media(max-width:600px){.arche-topnav{padding:8px 12px;gap:4px}" +
      ".arche-topnav a{font-size:12px;padding:5px 9px}.arche-topnav .nav-brand{font-size:13px}}";
    document.head.appendChild(s);
  }

  function link(m) {
    var a = document.createElement("a");
    a.href = m.href; a.textContent = m.rot;
    a.dataset.archeNav = m.href;
    if (m.teste(caminho)) a.className = "active";
    return a;
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
    dir2.appendChild(voltarPortal());
    nav.appendChild(dir2);

    document.body.insertBefore(nav, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
