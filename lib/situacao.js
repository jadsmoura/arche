/* ==========================================================================
   A SITUAÇÃO DA AÇÃO DE EXTENSÃO — um vocabulário só (decisão do dono, ago/2026)
   ==========================================================================

   Toda ação de extensão — evento gerido aqui ou atividade que correu por
   fora — produz TRÊS documentos: o **projeto**, o **relatório final** e os
   **certificados**. Eles saem sempre na mesma ordem, e é essa ordem que este
   arquivo nomeia.

   O problema que ele resolve: o mesmo fato tinha nomes diferentes em cada
   tela. No ARCHÉ EX a ação era "submetida", "aprovada", "relatório entregue"
   ou "registrada"; no ARCHÉ EV o evento era "não publicado", "encerramento
   solicitado", "validado". Quem organizou um evento encerrava no EV e ia
   procurar o relatório no EX sem saber qual dos rótulos era o dele — e a
   pró-reitoria lia "Registrada" numa guia e "aguardando validação" na outra
   sobre a MESMA ação.

   São DOIS EIXOS, e essa é a razão de a lista de status nunca fechar quando
   se tenta escrevê-la numa linha só:

     1. a ETAPA do processo   → em preenchimento · aguardando validação ·
                                validado (evento a realizar / em andamento) ·
                                aguardando encerramento · aguardando validação
                                do encerramento · encerrado
     2. a PUBLICAÇÃO da página → publicado · não publicado

   O segundo é INDEPENDENTE do primeiro (decisão do dono): a PROPPEX pode ter
   validado o evento e o organizador ainda não querer abrir as inscrições.
   Daí as leituras compostas — "validado e não publicado", "aguardando
   validação e não publicado".

   A conta é do SERVIDOR e viaja pronta em `acao.situacao`: as duas SPAs são
   HTML estático e não importam este módulo — se cada uma refizesse a conta,
   as duas telas voltariam a discordar, que é justamente o que se corrige.
   ========================================================================== */

import { faltaNoProjetoDoEvento } from "./eventos.js";
import { situacaoEncerramento } from "./certificadosEx.js";
import { hojeLocalISO } from "./datas.js";

const txt = (v) => String(v ?? "").trim();
const brl = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(iso)) ? txt(iso).split("-").reverse().join("/") : "");

/** As etapas, na ordem em que acontecem. */
export const ETAPAS = [
  "preenchimento",
  "aguardando-validacao",
  "validado",
  "aguardando-encerramento",
  "encerramento-em-validacao",
  "encerrado",
  // desvio, não degrau: a proposta reprovada sai do fluxo aqui (ago/2026)
  "reprovada",
];

/**
 * A situação de uma ação, nos dois eixos.
 *
 * Devolve sempre o mesmo formato — a tela não precisa saber se a ação tem
 * evento para desenhar o selo:
 *
 *   { etapa, rotulo, detalhe, publicacao, rotuloPublicacao, rotuloCompleto,
 *     falta[], temEvento, relatorioEntregue, certificados }
 */
export function situacaoDaAcao(acao, hoje = hojeLocalISO()) {
  const a = acao || {};
  const ev = a.evento || null;
  const p = a.proposta || {};
  const inicio = txt(p.periodoInicio);
  const fim = txt(p.periodoFim);
  const entregue = !!a.relatorio?.entregueEm;
  const enc = ev ? situacaoEncerramento(a) : "";

  const publicacao = ev ? (ev.ativo ? "publicado" : "nao-publicado") : null;
  const rotuloPublicacao = ev ? (ev.ativo ? "publicado" : "não publicado") : "";

  const saida = (etapa, rotulo, detalhe, extra = {}) => ({
    etapa, rotulo, detalhe,
    publicacao, rotuloPublicacao,
    // "validado e publicado" é como o dono lê os dois eixos — mas quando a
    // etapa já traz um "e" ("evento validado e certificados emitidos"), um
    // segundo "e" faria a frase tropeçar; aí o separador é o ponto
    rotuloCompleto: rotulo + (rotuloPublicacao
      ? `${/ e /.test(rotulo) ? " · " : " e "}${rotuloPublicacao}` : ""),
    falta: [], temEvento: !!ev,
    relatorioEntregue: entregue,
    certificados: ev ? enc === "validado" : txt(a.status) === "registrada",
    // o recorte da guia Relatórios e a fila de quem ainda espera alguém —
    // calculados aqui para a tela não refazer a régua pela segunda vez
    /* O correlato em Relatórios ABRE NA VALIDAÇÃO (pedido do dono, ago/2026:
       "o módulo Relatórios deve ser aberto assim que o seu paralelo em
       Propostas for criado e validado" — revendo a regra anterior, que o
       segurava até o período começar). Aprovada, a ação já tem o documento
       a caminho, e é na guia Relatórios que ele vive. */
    relatorioNoCiclo: !["preenchimento", "aguardando-validacao"].includes(etapa),
    relatorioPendente: ["validado", "aguardando-encerramento"].includes(etapa),
    ...extra,
  });

  /* ---------- eixo 1, antes da validação: o PROJETO ---------------------- */
  if (!txt(a.numeroAcao)) {
    /* REPROVADA é fim de linha (pedido do dono, ago/2026: as três saídas da
       análise são aprovar, devolver para alterações e reprovar). Difere da
       devolvida no que importa: a devolvida volta a ser editável e reentra
       na fila pelo reenvio; a reprovada não — o registro fica, com o motivo,
       como prova da decisão. Ela não entra na guia Relatórios nem em fila
       nenhuma, e por isso os dois recortes vão zerados no `extra` (a conta
       padrão, feita pela etapa, os deixaria ligados). */
    if (txt(a.status) === "reprovada")
      return saida("reprovada", "Reprovada",
        "A PROPPEX reprovou a proposta — o motivo está registrado na ficha.",
        { relatorioNoCiclo: false, relatorioPendente: false });
    // devolvida é uma volta ao preenchimento — com o motivo escrito pela
    // PROPPEX, que é o que a distingue de quem ainda está digitando
    if (txt(a.status) === "devolvida")
      return saida("preenchimento", "Devolvida para ajustes",
        "A PROPPEX apontou o que corrigir — reenvie depois de ajustar.");
    // o assistente do ARCHÉ EV cria a ação com o essencial: enquanto o
    // projeto não fecha, não há o que a pró-reitoria valide
    const falta = ev ? faltaNoProjetoDoEvento(a) : [];
    if (falta.length)
      return saida("preenchimento", "Em preenchimento",
        `Falta no projeto: ${falta.join(", ")}.`, { falta });
    return saida("aguardando-validacao", "Aguardando validação",
      "O projeto está completo e espera a validação da PROPPEX.");
  }

  /* ---------- eixo 1, depois da validação: a REALIZAÇÃO ------------------ */
  if (ev) {
    if (enc === "validado")
      return saida("encerrado", "Evento validado e certificados emitidos",
        "O relatório final está encerrado e os certificados foram liberados.");
    if (enc === "solicitado")
      return saida("encerramento-em-validacao", "Aguardando validação",
        "O encerramento foi enviado — validando, a PROPPEX encerra o relatório final e libera os certificados.");
    if (enc === "devolvido")
      return saida("aguardando-encerramento", "Evento aguardando encerramento",
        "A PROPPEX devolveu o encerramento para ajustes. Corrija o que foi apontado e envie de novo.");
    if (fim && hoje > fim)
      return saida("aguardando-encerramento", "Evento aguardando encerramento",
        "O evento terminou — encerre-o para entregar o relatório final e liberar os certificados.");
    if (inicio && hoje < inicio)
      return saida("validado", "Validado",
        `Evento a realizar${inicio ? ` a partir de ${brl(inicio)}` : ""}.`);
    return saida("validado", "Evento em andamento",
      fim ? `Encerra em ${brl(fim)}.` : "");
  }

  // ação SEM evento: o mesmo degrau, com os atos que valem lá — o relatório
  // final se entrega no formulário do ARCHÉ EX e quem encerra é o REGISTRO
  if (txt(a.status) === "registrada")
    return saida("encerrado", "Registrada e certificados emitidos",
      "O relatório final está encerrado e os certificados foram liberados.");
  if (entregue)
    return saida("encerramento-em-validacao", "Aguardando validação",
      "O relatório final foi entregue e espera o registro da PROPPEX.");
  if (fim && hoje > fim)
    return saida("aguardando-encerramento", "Aguardando relatório final",
      "O período da ação terminou — entregue o relatório final com as fotos e a lista de participantes.");
  if (inicio && hoje < inicio)
    return saida("validado", "Validado",
      `Ação a realizar${inicio ? ` a partir de ${brl(inicio)}` : ""}.`);
  return saida("validado", "Ação em andamento", fim ? `Encerra em ${brl(fim)}.` : "");
}

/**
 * A ação já chegou ao ponto em que o RELATÓRIO FINAL existe (ou é devido)?
 *
 * É o recorte da guia Relatórios: entra tudo o que tem relatório a entregar,
 * entregue ou encerrado — inclusive o concluído, que antes sumia da guia
 * justamente quando o documento passava a existir (achado do dono, ago/2026:
 * "um evento acabou de ser encerrado e ele não aparece na guia relatórios").
 * Fica de fora só o que ainda não foi validado e o que não começou: não há
 * relatório de ação que ainda não aconteceu, e listá-la enterraria os
 * atrasados.
 */
export const temRelatorioNoCiclo = (acao, hoje = hojeLocalISO()) =>
  situacaoDaAcao(acao, hoje).relatorioNoCiclo;

/** O relatório ainda espera alguém: é o que ordena a guia e conta no painel. */
export const relatorioPendente = (acao, hoje = hojeLocalISO()) =>
  situacaoDaAcao(acao, hoje).relatorioPendente;
