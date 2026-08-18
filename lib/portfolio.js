/* ========================================================================
   Portfólio de comprovação da ação de extensão.

   O relatório final se prova com IMAGEM: o registro fotográfico é o que a
   PROPPEX arquiva e o que o avaliador pede para ver — proposta e relatório
   dizem o que se pretendia e o que se fez; as fotos mostram que aconteceu.
   Por isso a entrega do relatório passou a exigir um MÍNIMO de fotos
   (decisão do dono, ago/2026), sem teto: quem tiver vinte, manda vinte.

   As fotos são os próprios anexos do portfólio (`acao.portfolio.anexos`) —
   não há segunda lista: o que se anexa como imagem conta como foto, e o que
   é documento (lista de presença, folder, ofício) continua entrando ali do
   mesmo jeito, sem contar para o mínimo.
   ======================================================================== */

/** Quantas fotos o relatório exige para ser entregue. */
export const MIN_FOTOS_RELATORIO = 5;

const EXT_FOTO = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

/**
 * Um anexo é FOTO pelo tipo declarado no upload (o caminho normal) ou, nos
 * registros antigos que não guardaram o tipo, pela extensão do arquivo.
 */
export function ehFoto(anexo) {
  if (!anexo) return false;
  const tipo = String(anexo.tipo || anexo.mimetype || "");
  if (tipo) return tipo.startsWith("image/");
  return EXT_FOTO.test(String(anexo.name || anexo.nome || ""));
}

/** As fotos do portfólio da ação. */
export function fotosDoPortfolio(acao) {
  return (acao?.portfolio?.anexos || []).filter(ehFoto);
}

/**
 * Quantas fotos ainda faltam para o relatório poder ser entregue — 0 quando
 * o mínimo está cumprido. É a régua ÚNICA: a tela do professor mostra o
 * mesmo número que o servidor cobra na entrega.
 */
export function faltamFotos(acao, minimo = MIN_FOTOS_RELATORIO) {
  return Math.max(0, minimo - fotosDoPortfolio(acao).length);
}

/** A frase que a tela e o servidor dizem quando ainda faltam fotos. */
export function avisoFotos(acao, minimo = MIN_FOTOS_RELATORIO) {
  const faltam = faltamFotos(acao, minimo);
  if (!faltam) return "";
  const tem = fotosDoPortfolio(acao).length;
  return `O relatório final precisa de pelo menos ${minimo} fotos do evento no portfólio `
    + `(há ${tem}${tem === 1 ? " foto" : " fotos"}; ${faltam === 1 ? "falta 1" : `faltam ${faltam}`}). `
    + "Anexe as fotos no bloco “Portfólio de comprovação” e entregue o relatório em seguida.";
}
