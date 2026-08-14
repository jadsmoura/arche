/* ========================================================================
   Identidade institucional por data.

   A instituição transformou-se de Faculdade Evangélica de Goianésia (FACEG)
   em Centro Universitário Evangélico de Goianésia (UNIEGO). Uma ata lavrada
   antes da transformação é documento da FACEG e precisa sair com o timbre da
   FACEG — senão o documento mente sobre quem se reuniu.

   Marco legal: PORTARIA MEC Nº 623, DE 5 DE SETEMBRO DE 2025, que homologou o
   Parecer CNE/CES nº 95/2025 (Processo e-MEC nº 202404601) e credenciou o
   Centro Universitário Evangélico de Goianésia — UNIEGO (cód. 3789) "por
   transformação da Faculdade Evangélica de Goianésia". O art. 4º manda a
   portaria entrar em vigor na data da publicação, que foi a do próprio dia 5.
   Daí a data de corte: sessão até 04/09/2025 é da FACEG; de 05/09/2025 em
   diante, da UNIEGO.

   A data continua sobreponível por ambiente (MARCA_UNIEGO_DESDE) — se algum
   dia aparecer ato retificador, muda-se a variável, não o código.
   ======================================================================== */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataCivil, hojeLocalISO } from "./datas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, "..", "templates");

/** Primeiro dia em que a instituição já era UNIEGO (publicação da Portaria 623). */
export const UNIEGO_DESDE = process.env.MARCA_UNIEGO_DESDE || "2025-09-05";

/** Ato que credenciou o centro universitário — citado na interface. */
export const CREDENCIAMENTO = {
  ato: "Portaria MEC nº 623, de 5 de setembro de 2025",
  parecer: "Parecer CNE/CES nº 95/2025",
  processo: "e-MEC nº 202404601",
  codigoMec: "3789",
};

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
    ate: "2025-09-04",
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
  return { codigo: m.codigo, nome: m.nome, sigla: m.sigla, unieogDesde: UNIEGO_DESDE, credenciamento: CREDENCIAMENTO };
}
