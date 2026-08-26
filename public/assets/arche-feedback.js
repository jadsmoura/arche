/* ==========================================================================
   ARCHÉ · botão de feedback — a JOANINHA do canto (pedido do dono, ago/2026:
   "um ícone de reportar bug ou sugestão, algo discreto que fique fixo na
   página, um botãozinho engraçado, que reagisse ao passar o mouse").

   Fica quieta no canto inferior direito, meio adormecida; no hover ela
   acorda, balança e estende o balão "Achou um problema? Tem uma ideia?".
   O clique abre o mini-formulário (Problema | Sugestão), e o relato vai a
   POST /api/feedback — com quem mandou e a página, e-mail à PROPPEX e cópia
   guardada no sistema. Quem carrega este arquivo é o arche-nav, e SÓ para
   quem está logado: relato anônimo seria caixa de spam, e o visitante das
   páginas públicas não é o público do botão.
   ========================================================================== */
(function () {
  "use strict";
  if (document.getElementById("arche-fb")) return;

  var css = `
  #arche-fb{position:fixed;right:16px;bottom:16px;z-index:9990;font-family:Figtree,system-ui,sans-serif}
  #arche-fb .fb-bt{display:flex;align-items:center;gap:0;border:1px solid #dde4e8;background:#fff;
    border-radius:999px;cursor:pointer;box-shadow:0 4px 14px -6px rgba(20,45,55,.35);
    padding:0;height:46px;min-width:46px;justify-content:center;transition:.18s;font:inherit}
  #arche-fb .fb-joa{font-size:22px;line-height:1;width:46px;text-align:center;flex:none;
    filter:grayscale(.45) opacity(.8);transition:.18s;display:inline-block}
  #arche-fb .fb-rot{max-width:0;overflow:hidden;white-space:nowrap;font-size:12.5px;font-weight:700;
    color:#2d535c;transition:max-width .25s ease,padding .25s ease;padding:0}
  #arche-fb .fb-bt:hover,#arche-fb .fb-bt:focus-visible{border-color:#40717e;
    box-shadow:0 8px 22px -8px rgba(28,55,66,.45)}
  #arche-fb .fb-bt:hover .fb-joa,#arche-fb .fb-bt:focus-visible .fb-joa{filter:none;
    animation:fb-acorda .55s ease}
  #arche-fb .fb-bt:hover .fb-rot,#arche-fb .fb-bt:focus-visible .fb-rot{max-width:280px;padding-right:16px}
  @keyframes fb-acorda{0%{transform:rotate(0) scale(1)}25%{transform:rotate(-14deg) scale(1.22)}
    50%{transform:rotate(12deg) scale(1.22)}75%{transform:rotate(-7deg) scale(1.12)}100%{transform:rotate(0) scale(1.08)}}
  @media (prefers-reduced-motion: reduce){#arche-fb .fb-bt:hover .fb-joa{animation:none;transform:scale(1.08)}}
  #arche-fb .fb-cx{position:absolute;right:0;bottom:58px;width:min(320px,calc(100vw - 32px));
    background:#fff;border:1px solid #dde4e8;border-radius:14px;padding:16px;
    box-shadow:0 12px 34px -12px rgba(20,45,55,.45);display:none}
  #arche-fb.aberto .fb-cx{display:block}
  #arche-fb .fb-t{font-family:Sora,sans-serif;font-weight:700;font-size:14.5px;color:#182632;margin:0 0 10px}
  #arche-fb .fb-tipos{display:flex;gap:8px;margin-bottom:10px}
  #arche-fb .fb-tipo{flex:1;border:1.5px solid #cbd6db;background:#fff;border-radius:10px;
    padding:7px 6px;font:inherit;font-size:12.5px;font-weight:700;color:#2d535c;cursor:pointer;transition:.15s}
  #arche-fb .fb-tipo.on{background:#1c3742;border-color:#1c3742;color:#fff}
  #arche-fb textarea{width:100%;border:1.5px solid #dde4e8;border-radius:10px;padding:9px 11px;
    font:inherit;font-size:13px;min-height:88px;resize:vertical;background:#fff;color:#182632}
  #arche-fb textarea:focus{outline:none;border-color:#40717e;box-shadow:0 0 0 3px rgba(64,113,126,.14)}
  #arche-fb .fb-nota{font-size:11px;color:#657179;margin:7px 0 10px;line-height:1.45}
  #arche-fb .fb-envia{width:100%;border:0;border-radius:10px;padding:10px 14px;font:inherit;
    font-size:13.5px;font-weight:700;color:#fff;background:linear-gradient(160deg,#40717e,#1c3742);cursor:pointer}
  #arche-fb .fb-envia:disabled{opacity:.6}
  #arche-fb .fb-msg{font-size:12px;margin-top:8px;min-height:1em;color:#c62828}
  #arche-fb .fb-fim{text-align:center;font-size:13.5px;color:#2e7d32;padding:14px 4px;line-height:1.5}
  #arche-fb .fb-fim .gr{font-size:30px;display:block;margin-bottom:6px}`;
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var raiz = document.createElement("div");
  raiz.id = "arche-fb";
  raiz.innerHTML =
    '<div class="fb-cx" role="dialog" aria-label="Reportar problema ou sugestão">' +
      '<p class="fb-t">Conte para a PROPPEX</p>' +
      '<div class="fb-corpo"></div>' +
    "</div>" +
    '<button type="button" class="fb-bt" aria-label="Reportar problema ou sugestão">' +
      '<span class="fb-joa" aria-hidden="true">🐞</span>' +
      '<span class="fb-rot">Achou um problema? Tem uma ideia?</span>' +
    "</button>";
  document.body.appendChild(raiz);

  var TIPO = "bug";
  var PLACEHOLDERS = {
    bug: "O que aconteceu? Onde você clicou, e o que esperava que acontecesse?",
    sugestao: "Qual é a sua ideia? O que o ARCHÉ poderia fazer melhor?",
  };

  /* O formulário se monta (e remonta, depois do "obrigado") sempre do zero:
     estado limpo a cada relato. */
  function montarCorpo() {
    var corpo = raiz.querySelector(".fb-corpo");
    corpo.innerHTML =
      '<div class="fb-tipos">' +
        '<button type="button" class="fb-tipo' + (TIPO === "bug" ? " on" : "") + '" data-t="bug">🐞 Problema</button>' +
        '<button type="button" class="fb-tipo' + (TIPO === "sugestao" ? " on" : "") + '" data-t="sugestao">💡 Sugestão</button>' +
      "</div>" +
      '<textarea class="fb-texto" placeholder="' + PLACEHOLDERS[TIPO] + '"></textarea>' +
      '<p class="fb-nota">Vai junto: o seu nome e a página em que você está — é o que permite responder e reproduzir.</p>' +
      '<button type="button" class="fb-envia">Enviar</button>' +
      '<div class="fb-msg"></div>';
    var texto = corpo.querySelector(".fb-texto");
    var msg = corpo.querySelector(".fb-msg");
    corpo.querySelectorAll(".fb-tipo").forEach(function (b) {
      b.addEventListener("click", function () {
        TIPO = b.dataset.t;
        corpo.querySelectorAll(".fb-tipo").forEach(function (x) { x.classList.toggle("on", x === b); });
        texto.placeholder = PLACEHOLDERS[TIPO];
      });
    });
    corpo.querySelector(".fb-envia").addEventListener("click", function () {
      var v = (texto.value || "").trim();
      if (v.length < 5) { msg.textContent = "Escreva um pouquinho mais — é o que permite entender."; return; }
      var envia = corpo.querySelector(".fb-envia");
      envia.disabled = true; msg.textContent = "";
      fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: TIPO, texto: v, pagina: location.pathname + location.search }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error((r.j && r.j.error) || "Não foi possível enviar agora.");
          corpo.innerHTML =
            '<div class="fb-fim"><span class="gr">🐞💚</span>Recebido! Obrigado por ajudar a melhorar o ARCHÉ.</div>';
          setTimeout(function () {
            raiz.classList.remove("aberto");
            setTimeout(montarCorpo, 350);   // formulário limpo para o próximo
          }, 2600);
        })
        .catch(function (e) { envia.disabled = false; msg.textContent = e.message; });
    });
  }
  montarCorpo();

  raiz.querySelector(".fb-bt").addEventListener("click", function () {
    raiz.classList.toggle("aberto");
    var texto = raiz.querySelector(".fb-texto");
    if (raiz.classList.contains("aberto") && texto) texto.focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") raiz.classList.remove("aberto");
  });
  document.addEventListener("click", function (e) {
    if (!raiz.contains(e.target)) raiz.classList.remove("aberto");
  });
})();
