/* ========================================================================
   ARCHÉ AT — alertas de regularização.

   O sistema NÃO sabe quando uma reunião está marcada — esse controle é de
   cada órgão. Ele conhece apenas o que foi registrado nele, e a partir disso
   monta pontos de verificação para a PROPPEX: "este órgão deveria ter ata
   neste semestre e não tem". Quem entra em contato para regularizar é a
   PROPPEX; o sistema não convoca nem envia cobrança.

   Quatro coisas geram alerta:
     · ciclo         — o órgão ainda não registrou as sessões ordinárias
                       obrigatórias do semestre;
     · pautas        — temas obrigatórios do semestre sem registro em ata;
     · ata-parada    — a reunião aconteceu mas a ata não foi registrada;
     · encaminhamento— deliberação com prazo vencido e sem baixa.

   Severidade: "alta" (vencido ou quase), "media", "baixa".
   ======================================================================== */
import { diaSerial, hojeLocalISO } from "./datas.js";
import { CURSOS, cursoDe, orgaoDe, tituloDe } from "./atas.js";
import { RITUAL, fimDaJanela, janelaDe, ritualDoOrgao, situacaoPautas } from "./pautas.js";

// Uma ata que passa disto sem ser registrada vira alerta — a reunião
// aconteceu, o documento não existe.
export const DIAS_ATA_PARADA = 30;
// Quando falta menos que isto para o fim do semestre, o atraso é grave.
const DIAS_CRITICO = 30;
const DIAS_ATENCAO = 60;

const SEVERIDADES = { alta: 0, media: 1, baixa: 2 };
const pior = (a, b) => (SEVERIDADES[a] <= SEVERIDADES[b] ? a : b);

// Órgão que nunca registrou ata alguma não é atraso de calendário: é órgão
// que não está funcionando. Entra sempre como urgente, faltem 5 ou 150 dias.
function nuncaSeReuniu(atas, orgao, curso) {
  const escopoCurso = !!orgaoDe(orgao)?.porCurso;
  return !(atas || []).some((a) => a.orgao === orgao
    && (!escopoCurso || (a.curso || "") === (curso || ""))
    && ["aprovada", "registrada"].includes(a.status));
}

function porPrazo(dias, { critico = DIAS_CRITICO, atencao = DIAS_ATENCAO } = {}) {
  if (dias === null || dias === undefined) return "media";
  if (dias <= critico) return "alta";
  if (dias <= atencao) return "media";
  return "baixa";
}

const rotuloCurso = (slug) => (slug ? cursoDe(slug)?.nome || slug : "");
function alvo(orgao, curso) {
  const nome = orgaoDe(orgao)?.nome || orgao;
  const c = rotuloCurso(curso);
  return c ? `${nome} — ${c}` : nome;
}

/* ------------------------------- geradores ------------------------------ */
/** Órgãos que ainda devem sessão ordinária no semestre. */
function alertasDeCiclo(atas, { cursos, hoje }) {
  const saida = [];
  const dias = diaSerial(fimDaJanela(hoje)) - diaSerial(hoje);
  for (const [cod, r] of Object.entries(RITUAL)) {
    if (!r.ordinarias) continue;
    const destinos = orgaoDe(cod)?.porCurso ? cursos.map((c) => c.slug) : [""];
    for (const curso of destinos) {
      const ck = ritualDoOrgao(atas, { orgao: cod, curso, hoje });
      if (ck.completo) continue;
      const inedito = nuncaSeReuniu(atas, cod, curso);
      saida.push({
        tipo: "ciclo", orgao: cod, curso, inedito,
        severidade: inedito ? "alta"
          : ck.ordinarias === 0 ? pior("media", porPrazo(dias))
          : porPrazo(dias),
        titulo: alvo(cod, curso),
        janela: ck.janela,
        detalhe: (ck.ordinarias === 0
          ? `Nenhuma ata registrada no semestre ${ck.janela} — este órgão deve registrar ${ck.exigidas}.`
          : `${ck.ordinarias} de ${ck.exigidas} atas do semestre ${ck.janela} registradas.`)
          + `${ck.extraordinarias ? ` Há ${ck.extraordinarias} extraordinária(s), que não contam para o ciclo.` : ""}`
          + `${inedito ? " Este órgão nunca registrou ata no sistema." : ""}`,
        acao: `Cobrar o registro de ${ck.faltam} ata(s) — o semestre encerra em ${fimDaJanela(hoje)}.`,
        prazo: fimDaJanela(hoje), dias, quantidade: ck.faltam,
      });
    }
  }
  return saida;
}

/** Temas obrigatórios do semestre sem registro — agrupados por órgão. */
function alertasDePautas(atas, { cursos, hoje }) {
  const saida = [];
  const dias = diaSerial(fimDaJanela(hoje)) - diaSerial(hoje);
  for (const cod of Object.keys(RITUAL)) {
    if (!RITUAL[cod].ordinarias) continue;
    const destinos = orgaoDe(cod)?.porCurso ? cursos.map((c) => c.slug) : [""];
    for (const curso of destinos) {
      const pautas = situacaoPautas(atas, { orgao: cod, curso, hoje })
        .filter((p) => p.exigidaAgora && p.estado !== "em-dia");
      if (!pautas.length) continue;
      const nunca = pautas.filter((p) => p.estado === "nunca").length;
      const inedito = nuncaSeReuniu(atas, cod, curso);
      saida.push({
        tipo: "pautas", orgao: cod, curso, inedito,
        severidade: inedito ? "alta"
          : nunca ? pior("media", porPrazo(dias))
          : porPrazo(dias),
        titulo: alvo(cod, curso),
        janela: janelaDe(hoje),
        detalhe: `${pautas.length} tema(s) que o instrumento espera ver em ata neste semestre ` +
          `ainda sem registro${nunca ? `, sendo ${nunca} nunca tratado(s)` : ""}.`,
        acao: "Cobrar a inclusão na pauta: " + pautas.slice(0, 3).map((p) => p.titulo).join(" · ")
          + (pautas.length > 3 ? ` · e mais ${pautas.length - 3}` : ""),
        prazo: fimDaJanela(hoje), dias, quantidade: pautas.length,
        itens: pautas.map((p) => ({ id: p.id, titulo: p.titulo, estado: p.estado, momento: p.momento })),
      });
    }
  }
  return saida;
}

/** Reuniões que aconteceram e cuja ata não foi registrada. */
function alertasDeAtaParada(atas, { hoje }) {
  const hojeSerial = diaSerial(hoje);
  return (atas || [])
    .filter((a) => a.status !== "registrada" && diaSerial(a.sessao?.data) !== null)
    .map((a) => ({ a, dias: hojeSerial - diaSerial(a.sessao.data) }))
    .filter(({ dias }) => dias >= DIAS_ATA_PARADA)
    .map(({ a, dias }) => ({
      tipo: "ata-parada", orgao: a.orgao, curso: a.curso || "", ataId: a.id, numero: a.numero,
      severidade: dias >= 90 ? "alta" : dias >= 60 ? "media" : "baixa",
      titulo: tituloDe(a),
      detalhe: `Sessão de ${a.sessao.data} sem ata registrada há ${dias} dias (situação: ${a.status}).`,
      janela: janelaDe(a.sessao.data),
      acao: a.numero ? `Cobrar a conclusão e o registro da ${a.numero}.`
        : "Cobrar a conclusão da minuta e o registro da ata.",
      prazo: a.sessao.data, dias: -dias, quantidade: 1,
    }));
}

/** Encaminhamentos com prazo vencido em atas já registradas ou aprovadas. */
function alertasDeEncaminhamento(atas, { hoje }) {
  const hojeSerial = diaSerial(hoje);
  const saida = [];
  for (const a of atas || []) {
    if (!["aprovada", "registrada"].includes(a.status)) continue;
    for (const p of a.pauta || []) {
      const e = p.encaminhamento;
      const d = diaSerial(e?.prazo);
      if (!e?.acao || d === null || d >= hojeSerial) continue;
      const atraso = hojeSerial - d;
      saida.push({
        tipo: "encaminhamento", orgao: a.orgao, curso: a.curso || "", ataId: a.id, numero: a.numero,
        severidade: atraso >= 60 ? "alta" : atraso >= 15 ? "media" : "baixa",
        titulo: alvo(a.orgao, a.curso),
        detalhe: `${e.acao}${e.responsavel ? ` — responsável: ${e.responsavel}` : ""}.`,
        janela: janelaDe(a.sessao?.data),
        acao: `Prazo venceu em ${e.prazo} (há ${atraso} dias), deliberado na ${a.numero || "ata"}. Cobrar a baixa.`,
        prazo: e.prazo, dias: -atraso, quantidade: 1,
      });
    }
  }
  return saida;
}

/* --------------------------------- api ---------------------------------- */
/**
 * Todos os alertas, do mais urgente para o menos. `tipos` permite recortar
 * (o painel do professor só quer o do próprio órgão, por exemplo).
 */
export function gerarAlertas(atas, { cursos = CURSOS, hoje = hojeLocalISO(), tipos = null } = {}) {
  const ctx = { cursos, hoje };
  let todos = [
    ...alertasDeCiclo(atas, ctx),
    ...alertasDePautas(atas, ctx),
    ...alertasDeAtaParada(atas, ctx),
    ...alertasDeEncaminhamento(atas, ctx),
  ];
  if (tipos?.length) todos = todos.filter((x) => tipos.includes(x.tipo));
  return todos.sort((x, y) =>
    SEVERIDADES[x.severidade] - SEVERIDADES[y.severidade]
    || (x.dias ?? 0) - (y.dias ?? 0)
    || String(x.titulo).localeCompare(String(y.titulo)));
}

/** Contagens para os cartões do painel. */
export function resumoAlertas(alertas) {
  const conta = (f) => alertas.filter(f).length;
  return {
    total: alertas.length,
    alta: conta((a) => a.severidade === "alta"),
    media: conta((a) => a.severidade === "media"),
    baixa: conta((a) => a.severidade === "baixa"),
    porTipo: {
      ciclo: conta((a) => a.tipo === "ciclo"),
      pautas: conta((a) => a.tipo === "pautas"),
      "ata-parada": conta((a) => a.tipo === "ata-parada"),
      encaminhamento: conta((a) => a.tipo === "encaminhamento"),
    },
    janela: janelaDe(hojeLocalISO()),
  };
}

/**
 * Quem cobrar: agrupa os alertas por órgão e curso, para a PROPPEX abrir a
 * lista e sair ligando. Ordena pelo que está pior.
 */
export function porResponsavel(alertas) {
  const mapa = new Map();
  for (const a of alertas) {
    const chave = `${a.orgao}|${a.curso || ""}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        orgao: a.orgao, curso: a.curso || "", titulo: a.titulo,
        alertas: [], alta: 0, media: 0, baixa: 0,
      });
    }
    const g = mapa.get(chave);
    g.alertas.push(a); g[a.severidade]++;
  }
  return [...mapa.values()]
    .sort((x, y) => y.alta - x.alta || y.media - x.media || y.alertas.length - x.alertas.length);
}
