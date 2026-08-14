/* ========================================================================
   Identidade institucional por data.

   A instituição transformou-se de Faculdade Evangélica de Goianésia (FACEG)
   em Centro Universitário Evangélico de Goianésia (UNIEGO). Uma ata lavrada
   antes da transformação é documento da FACEG e precisa sair com o timbre da
   FACEG — senão o documento mente sobre quem se reuniu.

   A data de corte vive numa constante só, sobreponível por ambiente
   (MARCA_UNIEGO_DESDE), porque é o tipo de coisa que se descobre estar um
   mês deslocada depois de conferir a portaria.
   ======================================================================== */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataCivil, hojeLocalISO } from "./datas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, "..", "templates");

/** Primeiro dia em que a instituição já era UNIEGO. */
export const UNIEGO_DESDE = process.env.MARCA_UNIEGO_DESDE || "2025-10-01";

export const MARCAS = {
  faceg: {
    codigo: "faceg",
    nome: "Faculdade Evangélica de Goianésia",
    sigla: "FACEG",
    artigo: "na",                       // "…, na Faculdade Evangélica…"
    logo: path.join(TEMPLATES, "logo-faceg.png"),
    logoAltura: 30,
    cor: "#7a6236",
    rodape: "Av. Brasil, nº 1000 — Bairro Covoá — Goianésia/GO · (62) 3389-7350 · evangelicagoianesia.edu.br",
    versiculo: "“…grandes coisas fez o Senhor por nós, por isso estamos alegres.” (Sl 126:3)",
    ate: "2025-09-30",
  },
  uniego: {
    codigo: "uniego",
    nome: process.env.INSTITUICAO_NOME || "Centro Universitário Evangélico de Goianésia — UNIEGO",
    sigla: "UNIEGO",
    artigo: "no",                       // "…, no Centro Universitário…"
    logo: path.join(TEMPLATES, "logo-uniego.png"),
    logoAltura: 42,
    cor: "#1c3742",
    rodape: null,
    versiculo: null,
    desde: UNIEGO_DESDE,
  },
};

/**
 * Identidade vigente numa data. Sem data (ou data inválida) devolve a atual —
 * um documento sem data é documento de hoje.
 */
export function marcaEm(data) {
  const iso = dataCivil(data) || hojeLocalISO();
  return iso < UNIEGO_DESDE ? MARCAS.faceg : MARCAS.uniego;
}

/** A data cai no período anterior à transformação? */
export const eraFaceg = (data) => marcaEm(data).codigo === "faceg";

/** Resumo para a interface (o professor precisa saber qual timbre vai sair). */
export function marcaParaCliente(data) {
  const m = marcaEm(data);
  return { codigo: m.codigo, nome: m.nome, sigla: m.sigla, unieogDesde: UNIEGO_DESDE };
}
