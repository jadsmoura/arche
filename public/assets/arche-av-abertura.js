/* =======================================================================
   ARCHÉ Avaliação — O AVALIADOR NÃO VÊ A TELA DE LOGIN PISCAR.

   Achado do dono, ago/2026: "no modo avaliador, quando clico em Produção
   Docente a página vai alguns segundos para essa tela e depois vai pra
   página correta."

   A tela que piscava é a de entrada do dossiê — "Entrar como docente",
   "Entrar como Pró-Reitoria (PROPPEX)" e um parágrafo que ainda começa com
   "Demonstração. Aqui o acesso é simulado…". O app compilado a mostra
   enquanto decide o que fazer:

     if (perfil === "avaliador") { await loadSavedState(); loginAsAvaliador(); }

   O `await` lê o dossiê INTEIRO do curso no Drive. São alguns segundos, e
   durante eles a tela de entrada fica no ar. Não é lentidão que se conserte
   com truque: o documento é grande e precisa chegar. O que se conserta é o
   que se mostra na espera.

   E o que se mostrava era o pior possível para essa visita: dois botões de
   acesso que não são do avaliador — um deles entrando como PRÓ-REITORIA —
   e a palavra "Demonstração" na tela de quem veio avaliar o curso. Mesmo
   por três segundos, mesmo sem clicar.

   Este append não acelera nada e não muda o fluxo: ele só cobre a espera
   com o que ela é — "Abrindo o painel do avaliador…" — e sai quando o app
   termina de abrir.

   TRÊS CUIDADOS, porque uma cobertura que não sai é uma página morta:

     1. só age com `?perfil=avaliador` no endereço. Sem isso, a tela de
        entrada é a tela certa e não se toca nela;
     2. sai assim que o `#appView` aparece — que é o app dizendo "terminei";
     3. se em 20 s nada acontecer (Drive fora do ar, dossiê que não existe),
        a cobertura sai sozinha e devolve a tela de entrada. Ficar olhando
        uma cobertura para sempre seria pior que ver a tela errada por três
        segundos.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeAvAbertura) return;
  window.__archeAvAbertura = true;
  if (!/(^|[?&])perfil=avaliador(&|$)/.test(location.search)) return;

  var CSS = ""
    + "#loginView{display:none!important}"
    + "#avAbrindo{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;"
    + "align-items:center;justify-content:center;gap:14px;background:#eef1f4;"
    + "font-family:'Figtree','IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif}"
    + "#avAbrindo .av-ab-t{font-size:15px;font-weight:600;color:#1c3742}"
    + "#avAbrindo .av-ab-s{font-size:13px;color:#657179}"
    + "#avAbrindo .av-ab-r{width:34px;height:34px;border-radius:50%;border:3px solid #dde4e8;"
    + "border-top-color:#40717e;animation:avGira .8s linear infinite}"
    + "@keyframes avGira{to{transform:rotate(360deg)}}"
    + "@media (prefers-reduced-motion:reduce){#avAbrindo .av-ab-r{animation-duration:2.4s}}";

  var estilo = document.createElement("style");
  estilo.id = "avAberturaCss";
  estilo.textContent = CSS;
  (document.head || document.documentElement).appendChild(estilo);

  var capa = null;
  function cobrir() {
    if (capa || !document.body) return;
    capa = document.createElement("div");
    capa.id = "avAbrindo";
    capa.setAttribute("role", "status");
    capa.innerHTML = '<div class="av-ab-r"></div>'
      + '<div class="av-ab-t">Abrindo o painel do avaliador…</div>'
      + '<div class="av-ab-s">Carregando os documentos do curso.</div>';
    document.body.appendChild(capa);
  }
  if (document.body) cobrir();
  else document.addEventListener("DOMContentLoaded", cobrir);

  function descobrir() {
    clearTimeout(desistir);
    if (relogio) clearInterval(relogio);
    if (capa) { capa.remove(); capa = null; }
    // a regra que esconde a entrada some junto: fora deste momento, ela é a
    // tela certa para quem não é avaliador
    if (estilo) { estilo.remove(); estilo = null; }
  }

  /* O app não avisa quando termina — quem avisa é o `#appView` deixando de
     estar escondido. Observa-se o atributo, não um tempo fixo: o dossiê de
     um curso grande demora mais que o de um pequeno. */
  var relogio = setInterval(function () {
    var app = document.getElementById("appView");
    if (app && !app.classList.contains("hidden")) descobrir();
  }, 120);

  var desistir = setTimeout(function () {
    descobrir();   // devolve a tela de entrada: melhor que uma página morta
  }, 20000);
})();
