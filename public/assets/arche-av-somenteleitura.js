/* ==========================================================================
   AVALIAÇÃO — quando o acesso é SÓ DE VISUALIZAÇÃO, a tela precisa dizer
   ==========================================================================

   Achado do dono, ago/2026: uma professora tentou enviar o PDI na guia
   Documentos Institucionais e recebeu "✗ Erro: Erro 403", sem mais nada.

   O 403 estava certo. Ela entrou pelo atalho público `arche.app.br/avaliador`
   — o endereço que a PROPPEX manda ao avaliador do MEC —, e esse atalho emite
   um selo de VISUALIZAÇÃO: as páginas abrem, as leituras passam e NENHUMA
   escrita passa (`somenteLeituraNaAv` no servidor). É a regra que impede um
   avaliador externo de alterar o dossiê que está avaliando, e ela fica.

   O que estava errado era o silêncio. O app da Avaliação é COMPILADO e mostra
   só o código do erro; a explicação que o servidor escreve ("O acesso de
   avaliador é somente de visualização") não chegava a lugar nenhum. A pessoa
   ficava sem saber o que fazer — e o que ela precisava fazer era simples:
   entrar com a conta dela do ARCHÉ, que devolve os próprios direitos
   (a sessão vence o selo, no próprio servidor).

   Este arquivo entra por APPEND nas páginas do app compilado — nunca por
   refatoração dele — e faz duas coisas:

     1. avisa, numa faixa no alto, quem está com o selo de visualização,
        com o botão que leva ao login e volta para a mesma página;
     2. traduz o 403: intercepta as respostas das rotas de escrita da
        Avaliação e mostra a frase que o servidor escreveu, no lugar do
        "Erro 403" mudo.
   ========================================================================== */
(function () {
  "use strict";
  var ESCRITAS = /\/api\/drive\/upload|\/api\/estado/;
  var visualizacao = false;

  function entrar() {
    var volta = location.pathname + location.search + location.hash;
    location.href = "/entrar?next=" + encodeURIComponent(volta);
  }

  function faixa() {
    if (document.getElementById("av-so-leitura")) return;
    var d = document.createElement("div");
    d.id = "av-so-leitura";
    d.setAttribute("role", "status");
    d.style.cssText = "position:sticky;top:0;z-index:99999;display:flex;gap:10px;"
      + "align-items:center;flex-wrap:wrap;justify-content:center;"
      + "background:#fdf3e3;color:#8a5a12;border-bottom:1px solid #f0e0bd;"
      + "font:500 13px/1.45 Figtree,system-ui,sans-serif;padding:9px 14px";
    d.innerHTML = '<span>👁 <b>Acesso de visualização</b> — você entrou pelo link do avaliador. '
      + 'Dá para ver tudo, mas <b>nada pode ser enviado ou alterado</b> por aqui.</span>';
    var b = document.createElement("button");
    b.textContent = "Entrar com a minha conta";
    b.style.cssText = "cursor:pointer;font:600 12.5px Figtree,system-ui,sans-serif;"
      + "background:#1c3742;color:#fff;border:0;border-radius:8px;padding:7px 13px";
    b.onclick = entrar;
    d.appendChild(b);
    document.body.insertBefore(d, document.body.firstChild);
  }

  /* A explicação do 403 aparece como aviso próprio: o app compilado imprime
     só o número, e é a frase do servidor que diz o que fazer. */
  function avisar(msg) {
    var v = document.getElementById("av-erro-escrita");
    if (!v) {
      v = document.createElement("div");
      v.id = "av-erro-escrita";
      v.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:18px;"
        + "z-index:100000;max-width:min(560px,92vw);background:#fff;color:#182632;"
        + "border:1px solid #dde4e8;border-left:4px solid #a1524c;border-radius:10px;"
        + "box-shadow:0 8px 28px rgba(24,38,50,.18);padding:13px 15px;"
        + "font:500 13.5px/1.5 Figtree,system-ui,sans-serif";
      document.body.appendChild(v);
    }
    v.innerHTML = "";
    var p = document.createElement("div");
    p.textContent = msg;
    v.appendChild(p);
    var linha = document.createElement("div");
    linha.style.cssText = "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap";
    if (visualizacao) {
      var b = document.createElement("button");
      b.textContent = "Entrar com a minha conta";
      b.style.cssText = "cursor:pointer;font:600 12.5px Figtree,system-ui,sans-serif;"
        + "background:#1c3742;color:#fff;border:0;border-radius:8px;padding:7px 13px";
      b.onclick = entrar;
      linha.appendChild(b);
    }
    var f = document.createElement("button");
    f.textContent = "Fechar";
    f.style.cssText = "cursor:pointer;font:600 12.5px Figtree,system-ui,sans-serif;"
      + "background:#eceff3;color:#657179;border:0;border-radius:8px;padding:7px 13px";
    f.onclick = function () { v.remove(); };
    linha.appendChild(f);
    v.appendChild(linha);
  }

  var fetchOriginal = window.fetch;
  window.fetch = function (entrada, init) {
    var url = "";
    try { url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || ""; } catch (e) { url = ""; }
    var p = fetchOriginal.apply(this, arguments);
    if (!ESCRITAS.test(url)) return p;
    return p.then(function (r) {
      if (r && r.status === 403) {
        // a resposta é lida numa CÓPIA: o app compilado ainda vai ler o corpo
        r.clone().json().then(function (j) {
          avisar((j && j.error) || "Esta ação não é permitida com o acesso atual.");
        }).catch(function () {
          avisar("Esta ação não é permitida com o acesso atual.");
        });
      }
      return r;
    });
  };

  fetchOriginal("/api/av/quem", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      visualizacao = j && j.via === "avaliador" && !j.logado;
      if (!visualizacao) return;
      if (document.body) faixa();
      else document.addEventListener("DOMContentLoaded", faixa);
    })
    .catch(function () { /* sem resposta, a tela segue como está */ });
})();
