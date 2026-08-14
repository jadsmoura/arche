/* ========================================================================
   Assistente de escrita nos campos — ARCHÉ.

   Liga-se a qualquer <textarea data-ia="atas.discussao"> da página. Não
   sobrescreve nada sozinho: mostra a sugestão ao lado do original e só troca
   o texto se a pessoa clicar em "usar".

   Se não houver provedor de IA configurado, o script se cala — nenhum botão
   aparece e nada muda na tela.
   ======================================================================== */
(function () {
  "use strict";
  if (window.__archeIA) return;
  window.__archeIA = true;

  var CFG = null;         // { disponivel, acoes, minimo, ... }
  var abertos = new WeakMap();

  /* --------------------------------- css -------------------------------- */
  var CSS = [
    ".ia-bar{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}",
    ".ia-bt{display:inline-flex;align-items:center;gap:5px;border:1px solid #d5dce4;background:#fff;",
    "  color:#40717e;border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;",
    "  font-family:inherit;transition:.15s}",
    ".ia-bt:hover{border-color:#40717e;background:#f2f8fb}",
    ".ia-bt[disabled]{opacity:.5;cursor:not-allowed}",
    ".ia-bt.pri{background:#1c3742;border-color:#1c3742;color:#fff}",
    ".ia-bt.pri:hover{background:#2d535c}",
    ".ia-bt.ok{background:#e5f3ea;border-color:#cfeeda;color:#3f8a5d}",
    ".ia-nota{font-size:11.5px;color:#8a949e}",
    ".ia-painel{border:1px solid #cfe6f2;background:#f7fbfd;border-radius:10px;padding:12px 14px;margin-top:8px}",
    ".ia-painel h6{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;",
    "  color:#40717e;font-weight:700;font-family:inherit}",
    ".ia-saida{white-space:pre-wrap;font-size:13.5px;line-height:1.6;color:#1c2b33;background:#fff;",
    "  border:1px solid #e3e7ee;border-radius:8px;padding:11px 13px;max-height:340px;overflow:auto}",
    ".ia-erro{color:#a1524c;font-size:12.5px;line-height:1.5}",
    ".ia-carregando{font-size:12.5px;color:#657179}",
    ".ia-rodape{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}",
  ].join("");

  function estilo() {
    if (document.getElementById("arche-ia-css")) return;
    var s = document.createElement("style");
    s.id = "arche-ia-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* -------------------------------- infra ------------------------------- */
  function ler(url, corpo) {
    var opc = corpo
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }
      : undefined;
    return fetch(url, opc).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Falha (" + r.status + ")");
        return j;
      });
    });
  }

  // A página informa o contexto do documento (órgão, curso, ponto de pauta)
  // definindo window.archeIAContexto — opcional.
  function contexto(campo, el) {
    try {
      var f = window.archeIAContexto;
      var c = typeof f === "function" ? f(campo, el) : null;
      return c && typeof c === "object" ? c : undefined;
    } catch (e) { return undefined; }
  }

  /* ------------------------------- widget ------------------------------- */
  function anexar(el) {
    if (el.dataset.iaPronto) return;
    var campo = el.getAttribute("data-ia");
    if (!campo) return;
    el.dataset.iaPronto = "1";

    var bar = document.createElement("div");
    bar.className = "ia-bar";
    var painel = document.createElement("div");
    painel.style.display = "none";

    CFG.acoes.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ia-bt" + (i === 0 ? " pri" : "");
      b.textContent = (i === 0 ? "✨ " : "") + a.rotulo;
      b.title = a.dica;
      b.onclick = function () { pedir(el, campo, a.id, bar, painel); };
      bar.appendChild(b);
    });
    var nota = document.createElement("span");
    nota.className = "ia-nota";
    nota.textContent = "escreva primeiro; a IA passa a limpo o que você digitou";
    bar.appendChild(nota);

    el.insertAdjacentElement("afterend", bar);
    bar.insertAdjacentElement("afterend", painel);
    abertos.set(el, { bar: bar, painel: painel });
    sincronizar(el);
    el.addEventListener("input", function () { sincronizar(el); });
  }

  // Abaixo do mínimo de caracteres os botões ficam desligados: sem texto do
  // autor não há o que melhorar, e o servidor recusaria de qualquer forma.
  function sincronizar(el) {
    var w = abertos.get(el);
    if (!w) return;
    var curto = (el.value || "").trim().length < CFG.minimo;
    var bts = w.bar.querySelectorAll(".ia-bt");
    for (var i = 0; i < bts.length; i++) bts[i].disabled = curto || el.disabled;
    var nota = w.bar.querySelector(".ia-nota");
    if (nota) {
      nota.textContent = curto
        ? "escreva ao menos " + CFG.minimo + " caracteres para o assistente atuar"
        : "a sugestão aparece ao lado; nada muda sem você confirmar";
    }
  }

  function pedir(el, campo, acao, bar, painel) {
    var original = (el.value || "").trim();
    painel.style.display = "";
    painel.className = "ia-painel";
    painel.innerHTML = '<div class="ia-carregando">Consultando o assistente…</div>';

    ler("/api/ia/assistente", { campo: campo, acao: acao, texto: original, contexto: contexto(campo, el) })
      .then(function (r) { mostrar(el, painel, r, original, campo, acao, bar); })
      .catch(function (e) {
        painel.innerHTML = '<div class="ia-erro"></div>';
        painel.firstChild.textContent = e.message;
        var fechar = document.createElement("button");
        fechar.type = "button"; fechar.className = "ia-bt"; fechar.textContent = "Fechar";
        fechar.style.marginTop = "8px";
        fechar.onclick = function () { painel.style.display = "none"; };
        painel.appendChild(fechar);
      });
  }

  function mostrar(el, painel, r, original, campo, acao, bar) {
    painel.innerHTML = "";
    var t = document.createElement("h6");
    t.textContent = "Sugestão do assistente";
    var saida = document.createElement("div");
    saida.className = "ia-saida";
    saida.textContent = r.texto;
    var rod = document.createElement("div");
    rod.className = "ia-rodape";

    var usar = document.createElement("button");
    usar.type = "button"; usar.className = "ia-bt ok"; usar.textContent = "✓ Usar este texto";
    usar.onclick = function () {
      el.value = r.texto;
      // avisa o app dono do campo (o ARCHÉ AT guarda o valor no onchange)
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      painel.innerHTML = "";
      var volta = document.createElement("div");
      volta.className = "ia-rodape";
      var msg = document.createElement("span");
      msg.className = "ia-nota"; msg.textContent = "Texto substituído.";
      var desfazer = document.createElement("button");
      desfazer.type = "button"; desfazer.className = "ia-bt"; desfazer.textContent = "↩ Desfazer";
      desfazer.onclick = function () {
        el.value = original;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        painel.style.display = "none";
        sincronizar(el);
      };
      volta.appendChild(msg); volta.appendChild(desfazer);
      painel.appendChild(volta);
      sincronizar(el);
    };

    var refazer = document.createElement("button");
    refazer.type = "button"; refazer.className = "ia-bt"; refazer.textContent = "↻ Tentar de novo";
    refazer.onclick = function () { pedir(el, campo, acao, bar, painel); };

    var descartar = document.createElement("button");
    descartar.type = "button"; descartar.className = "ia-bt"; descartar.textContent = "Descartar";
    descartar.onclick = function () { painel.style.display = "none"; };

    var origem = document.createElement("span");
    origem.className = "ia-nota";
    origem.textContent = "gerado por " + (r.provedor || "IA")
      + (r.modelo ? " · " + r.modelo : "") + " — confira antes de usar";

    rod.appendChild(usar); rod.appendChild(refazer); rod.appendChild(descartar); rod.appendChild(origem);
    painel.appendChild(t); painel.appendChild(saida); painel.appendChild(rod);
  }

  /* ------------------------------- varredura ---------------------------- */
  function varrer() {
    var campos = document.querySelectorAll("[data-ia]");
    for (var i = 0; i < campos.length; i++) anexar(campos[i]);
  }

  function iniciar() {
    ler("/api/ia/estado").then(function (c) {
      if (!c || !c.disponivel || !(c.acoes || []).length) return;   // sem chave: nada aparece
      CFG = c;
      estilo();
      varrer();
      // as telas do ARCHÉ AT são redesenhadas a cada edição: reanexa sozinho
      new MutationObserver(function () { varrer(); })
        .observe(document.body, { childList: true, subtree: true });
    }).catch(function () { /* sem sessão ou setor sem IA: silêncio */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
