/* =======================================================================
   ARCHÉ Avaliação — RÓTULOS RENOMEADOS POR CIMA DO APP COMPILADO.

   Pedido do dono, ago/2026: "mude o nome de 'Documentos de Ensino' para
   'Documentos do Curso'" (a seção DI.2 dos Documentos Institucionais).

   O nome está dentro do JavaScript MINIFICADO do app — e a regra do
   /arche é não tocar no compilado: alterações só por append. Este append
   troca o texto NO DOM, onde quer que ele apareça (a lista das seções, o
   título da seção aberta, o rastro de navegação), e continua trocando a
   cada redesenho — o app reescreve as listas o tempo todo, e uma troca
   única perderia o texto redesenhado.

   Só nós de TEXTO são tocados: nenhum atributo, nenhum id, nenhuma chave
   de dado — o que o app grava continua igual, muda o que se lê.
   ======================================================================= */
(function () {
  if (window.__archeRotulos) return;
  window.__archeRotulos = true;

  var TROCAS = [
    ["Documentos de Ensino", "Documentos do Curso"],
  ];

  function trocarEm(no) {
    if (no.nodeType === 3) {
      var t = no.nodeValue;
      for (var i = 0; i < TROCAS.length; i++) {
        if (t.indexOf(TROCAS[i][0]) >= 0) t = t.split(TROCAS[i][0]).join(TROCAS[i][1]);
      }
      if (t !== no.nodeValue) no.nodeValue = t;
      return;
    }
    if (no.nodeType !== 1 || no.tagName === "SCRIPT" || no.tagName === "STYLE"
      || no.tagName === "TEXTAREA" || no.isContentEditable) return;
    for (var f = no.firstChild; f; f = f.nextSibling) trocarEm(f);
  }

  var agendado = false;
  function varrer() {
    agendado = false;
    try { if (document.body) trocarEm(document.body); } catch (e) { /* nunca derruba a tela */ }
  }
  function agendar() {
    if (agendado) return;
    agendado = true;
    setTimeout(varrer, 40);
  }

  function ligar() {
    varrer();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();
