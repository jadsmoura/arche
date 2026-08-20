/* ========================================================================
   As ARTES do evento — capa, foto de palestrante, logotipo de apoiador.

   Elas nasceram guardadas como data URL DENTRO do registro da ação, em
   `ex-acoes-v1`. Funcionava, e as rotas já as tiravam dos payloads (só
   `temCapa`/`temFoto`/`temLogo` viajam). O problema é outro e é invisível:
   em produção o estado é UM arquivo no Drive, reescrito INTEIRO a cada
   gravação — e a varredura de ago/2026 mediu que as artes eram ~92% dele
   (8,7 MB de 8,7; sem elas, 0,7 MB). Ou seja: cada presença marcada, cada
   inscrição, cada aprovação subia megabytes de imagem que não mudaram.

   A correção é guardar a arte como ARQUIVO no Drive — igual ao portfólio —
   e deixar na ação só a REFERÊNCIA. O arquivo do estado cai ~12×, e toda
   gravação do sistema fica mais barata junto.

   O campo continua com o MESMO nome (`capa`, `foto`, `logo`): o que muda é
   o que ele guarda. Por isso todo leitor aceita as DUAS formas — a antiga
   sobrevive a uma migração que não terminou, a um lote que falhou e a um
   registro que ninguém regravou. Aqui vivem só funções puras.
   ======================================================================== */

const RE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

/** A forma ANTIGA: a imagem inteira, embutida no registro. */
export const ehDataUrl = (v) => typeof v === "string" && RE_DATA_URL.test(v);

/** A forma NOVA: só o ponteiro para o arquivo no Drive. */
export const ehReferencia = (v) =>
  !!v && typeof v === "object" && typeof v.fileId === "string" && v.fileId.length > 0;

/** Há arte, seja qual for a forma? É o que alimenta `temCapa`/`temFoto`. */
export const temArte = (v) => ehDataUrl(v) || ehReferencia(v);

/** Os bytes e o tipo de uma data URL — null se não for uma. */
export function partesDataUrl(v) {
  const m = String(v ?? "").match(RE_DATA_URL);
  if (!m) return null;
  return { tipo: `image/${m[1]}`, buffer: Buffer.from(m[2], "base64") };
}

/**
 * Tamanho DECODIFICADO de uma data URL, em bytes (0 se não for uma). Conta o
 * `=` do fim: `len*3/4` sozinho estima 72 onde o arquivo tem 70, e é o
 * número que decide se a capa passa do teto — melhor ser o real.
 */
export function bytesDataUrl(v) {
  const m = String(v ?? "").match(RE_DATA_URL);
  if (!m) return 0;
  const b64 = m[2];
  const enchimento = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - enchimento;
}

/** A extensão do arquivo a criar no Drive, a partir do tipo declarado. */
export const extensaoDe = (tipo) =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[String(tipo || "")] || "img");

/**
 * Percorre a configuração do evento e devolve TODA arte embutida, com o
 * caminho onde ela está. É o que a migração e a subida usam para não
 * repetir a mesma travessia em três lugares.
 *
 *   [{ onde: "capa" }, { onde: "foto", id }, { onde: "logo", id }]
 */
export function artesEmbutidas(evento) {
  const achadas = [];
  if (ehDataUrl(evento?.capa)) achadas.push({ onde: "capa", valor: evento.capa });
  for (const atv of evento?.programacao || []) {
    if (atv?.id && ehDataUrl(atv.foto)) achadas.push({ onde: "foto", id: atv.id, valor: atv.foto });
  }
  for (const bloco of evento?.blocos || []) {
    for (const item of bloco?.itens || []) {
      if (item?.id && ehDataUrl(item.logo)) achadas.push({ onde: "logo", id: item.id, valor: item.logo });
    }
  }
  return achadas;
}

/**
 * Troca, no lugar certo da configuração, a arte embutida pela referência.
 * Devolve quantas trocou — a migração usa o número para saber se gravou.
 */
export function aplicarReferencia(evento, { onde, id }, ref) {
  if (!evento || !ref) return 0;
  if (onde === "capa") { evento.capa = ref; return 1; }
  if (onde === "foto") {
    const atv = (evento.programacao || []).find((x) => x?.id === id);
    if (!atv) return 0;
    atv.foto = ref; return 1;
  }
  if (onde === "logo") {
    for (const bloco of evento.blocos || []) {
      const item = (bloco?.itens || []).find((x) => x?.id === id);
      if (item) { item.logo = ref; return 1; }
    }
  }
  return 0;
}
