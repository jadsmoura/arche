/* =======================================================================
   ARCHÉ Dossiê — O "EXPORTAR RELATÓRIO PDF" PASSA A SAIR DO SERVIDOR.

   Pedido do dono, ago/2026: "tem como ele vir com os elementos gráficos,
   como fotos, o quadro de produções, o regime de trabalho, etc? pra ficar
   bonito".

   O botão gerava o documento no NAVEGADOR (jsPDF de CDN): texto puro, sem
   timbre, sem foto, sem o quadro do 2.16 — e dependia de um CDN externo
   para funcionar. Agora o clique baixa o relatório do servidor
   (`/api/avaliacao/producao.pdf?curso=…`), gerado pelo MESMO motor dos
   demais documentos oficiais do ARCHÉ: timbrado UNIEGO, foto de cada
   docente, o quadro do Indicador 2.16 com a escada de conceitos, as
   distribuições por tipo de produção, regime e titulação, e o comprovante
   como LINK clicável (a decisão de antes: embutir os arquivos deixava o
   documento grande demais).

   O gerador antigo fica como SAÍDA DE EMERGÊNCIA: se o servidor recusar
   (dossiê nunca gravado, rede fora), o clique é reencaminhado a ele — um
   botão que falha sem alternativa é pior que o documento feio.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeDossieRel) return;
  window.__archeDossieRel = true;

  var m = (typeof DOSSIE_KEY === "string" ? DOSSIE_KEY : "").match(/^dossie-(.+)-v\d+$/);
  var curso = m ? m[1] : "";
  if (!curso) return;

  var deixarPassar = false; // liga só para reencaminhar o clique ao gerador antigo

  document.addEventListener("click", function (ev) {
    var el = ev.target;
    if (!el || el.id !== "btnExportPdf" || deixarPassar) return;
    // captura: impede o gerador do navegador de rodar em paralelo
    ev.preventDefault();
    ev.stopPropagation();
    if (el.disabled) return;

    var rotulo = el.textContent;
    el.disabled = true;
    el.textContent = "Gerando o relatório…";
    var restaurar = function () { el.disabled = false; el.textContent = rotulo; };

    fetch("/api/avaliacao/producao.pdf?curso=" + encodeURIComponent(curso))
      .then(function (r) {
        if (!r.ok) throw new Error("erro " + r.status);
        return r.blob();
      })
      .then(function (b) {
        var u = URL.createObjectURL(b);
        var a = document.createElement("a");
        a.href = u;
        a.download = "producao-docente-" + curso + ".pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
        restaurar();
      })
      .catch(function () {
        // o servidor não respondeu o documento: vale o gerador antigo, do
        // navegador — o botão precisa ter saída mesmo com o dossiê por gravar
        restaurar();
        deixarPassar = true;
        try { el.click(); } finally { deixarPassar = false; }
      });
  }, true);
})();
