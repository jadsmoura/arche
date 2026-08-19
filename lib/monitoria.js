/**
 * ARCHÉ MO — Monitoria Acadêmica.
 *
 * Por ora, só o ARQUIVO dos editais. O módulo em si está em protótipo
 * (/prototipos/monitoria.html); o que já existe e não pode se perder é o
 * histórico dos processos seletivos.
 *
 * Uma nota que o catálogo precisa carregar: até 2025 o programa era conduzido
 * pela **Diretoria Acadêmica (DIAC) da FACEG** — a instituição era a Faculdade
 * Evangélica de Goianésia até 04/09/2025, e o edital de 2025 traz esse nome e
 * essa assinatura. A partir de 2026, por decisão da reitoria, a monitoria
 * passa à **PROPPEX** do UNIEGO. O documento antigo não se reescreve: ele
 * aparece com o órgão e a marca da época, como as atas fazem (lib/marca.js).
 *
 * A série segue o padrão dos demais programas da pró-reitoria: 01/AAAA para a
 * graduação na IC, 02/AAAA no ICEM — a monitoria usa **03/AAAA**, para os três
 * conviverem no mesmo quadro por ano da vitrine pública.
 */

export const EDITAIS_MONITORIA = [
  {
    numero: "01/2025",                 // como o documento foi publicado
    serie: "03/2025",                  // como ele se ordena na vitrine
    ano: 2025,
    ciclo: "2025/1",
    titulo: "Programa de Monitoria Acadêmica 2025/1",
    orgao: "Diretoria Acadêmica (DIAC)",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-01-2025.pdf",
    encerrado: true,
    observacao: "Publicado em 10/02/2025, antes da transformação em UNIEGO. "
      + "A partir de 2026 o programa passa à PROPPEX.",
  },
];

export const editalMonitoriaDe = (numero) =>
  EDITAIS_MONITORIA.find((e) => e.numero === String(numero || "") || e.serie === String(numero || "")) || null;

/** O que a vitrine pública mostra — documento e identificação, nada além. */
export const editaisMonitoriaParaLista = () => EDITAIS_MONITORIA
  .map((e) => ({
    numero: e.numero, serie: e.serie, ano: e.ano, ciclo: e.ciclo, titulo: e.titulo,
    orgao: e.orgao, instituicao: e.instituicao, documento: e.documento || null,
    vigente: !e.encerrado, observacao: e.observacao || "",
  }))
  .sort((a, b) => String(b.serie).localeCompare(String(a.serie), "pt-BR"));
