/* ========================================================================
   Cobrança automática do relatório final (Extensão).

   Um dia depois do encerramento do evento, o responsável pela ação recebe
   um lembrete pedindo o relatório final; a PROPPEX recebe um resumo da
   rodada. Princípios do desenho:

   - O registro do que já foi cobrado vive em chave PRÓPRIA e interna
     (`sys-extensao-cobrancas-v1`), nunca dentro de `extensao-acoes-v1`:
     o front-end regrava o array inteiro a cada salvamento e apagaria a
     marca, fazendo o professor ser cobrado de novo no dia seguinte.
   - Marca-se ANTES de enviar, com gravação forçada (claim → flush → envio).
     No plano free do Render o processo hiberna: se o registro se perdesse
     depois do envio, a rodada seguinte reenviaria tudo. O viés é sempre
     deixar de enviar, nunca cobrar duas vezes.
   - Na primeira execução o passivo histórico é registrado como tratado
     SEM enviar nada (backfill) — ninguém recebe enxurrada na estreia.
   - Datas sempre no fuso institucional (lib/datas.js), nunca em UTC.
   ======================================================================== */
import {
  hojeLocalISO, diaSerial, somaDias, dataCivil, dentroDaJanela, relogioPlausivel,
} from "./datas.js";

export const ACOES_KEY = "ex-acoes-v1";              // somente leitura aqui
export const LEDGER_KEY = "sys-extensao-cobrancas-v1"; // interna: nem lida nem gravada pela API

const LOCK_MS = 10 * 60 * 1000;      // execução considerada travada após 10 min
const THROTTLE_MS = 30 * 60 * 1000;  // intervalo mínimo entre varreduras por tráfego
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function lerConfig(env = process.env) {
  const num = (v, padrao) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : padrao);
  return {
    ativa: String(env.COBRANCA_ATIVA ?? "true").toLowerCase() !== "false",
    inicio: String(env.COBRANCA_INICIO || "").trim(),   // vazio: usa o do ledger (backfill)
    janelaDias: num(env.COBRANCA_JANELA_DIAS, 30),
    maxEmails: num(env.COBRANCA_MAX_EMAILS, 10),
    horaIni: num(env.COBRANCA_HORA_INI, 8),
    horaFim: num(env.COBRANCA_HORA_FIM, 20),
    simula: String(env.COBRANCA_SIMULA || "") === "1",
    notify: env.NOTIFY_EMAIL || "extensao@uniego.edu.br",
  };
}

/* ------------------------------- ledger --------------------------------- */
function ledgerVazio() {
  return { versao: 1, backfillEm: null, inicio: null, lock: null, ultimaVarredura: null, resumo: null, acoes: {} };
}
export async function lerLedger(storage) {
  try {
    const raw = await storage.get(LEDGER_KEY);
    const l = raw ? JSON.parse(raw) : null;
    if (!l || typeof l !== "object") return ledgerVazio();
    return { ...ledgerVazio(), ...l, acoes: l.acoes && typeof l.acoes === "object" ? l.acoes : {} };
  } catch { return ledgerVazio(); }
}
/**
 * Grava o registro preservando o que foi decidido POR FORA da rodada.
 * A varredura trabalha sobre uma cópia lida no início; sem esta mesclagem,
 * uma dispensa feita pela PROPPEX enquanto a rodada está em voo seria
 * apagada em silêncio — a tela diria "dispensada" e o professor seria
 * cobrado assim mesmo.
 */
async function gravarLedger(storage, ledger, { forcar = false } = {}) {
  try {
    const atual = await lerLedger(storage);
    for (const [id, reg] of Object.entries(atual.acoes || {})) {
      if (!reg?.dispensadaEm) continue;
      ledger.acoes[id] = ledger.acoes[id]
        ? { ...ledger.acoes[id], dispensadaEm: reg.dispensadaEm, dispensadaPor: reg.dispensadaPor || null }
        : reg;
    }
  } catch { /* sem o persistido, grava o que tem */ }
  await storage.set(LEDGER_KEY, JSON.stringify(ledger));
  if (forcar && typeof storage.flush === "function") await storage.flush();
}

/* ---------------------------- elegibilidade ------------------------------ */
/** Data-base da cobrança: protege contra datas invertidas e cadastro retroativo. */
export function baseCobranca(acao) {
  const p = acao?.proposta || {};
  const cands = [p.periodoFim, p.periodoInicio, dataCivil(acao?.aprovadoEm || acao?.criadoEm)]
    .map((d) => diaSerial(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dataCivil(d)))
    .filter((n) => n !== null);
  return cands.length ? Math.max(...cands) : null;
}

/** Responsáveis pela entrega do relatório (quem recebe a cobrança nominal). */
export function destinatariosDaAcao(acao) {
  return [...new Set(
    [acao?.proposta?.respEmail, acao?.criadoPor]
      .map((e) => String(e ?? "").trim().toLowerCase())
      .filter((e) => RE_EMAIL.test(e)),
  )];
}

/** Gestores + coordenadores de extensão + NOTIFY_EMAIL (recebem só o resumo). */
export async function destinatariosResumo(storage, cfg = lerConfig()) {
  const lista = [cfg.notify];
  try {
    const { carregarUsuarios } = await import("./auth.js");
    const u = await carregarUsuarios(storage);
    lista.push(...(u.gestores || []));
    for (const [email, mods] of Object.entries(u.coordenadores || {}))
      if ((mods || []).includes("extensao")) lista.push(email);
  } catch { /* sem usuários: fica só o NOTIFY_EMAIL */ }
  return [...new Set(lista.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => RE_EMAIL.test(e)))];
}

const resumoAcao = (a, motivo) => ({
  id: a.id, numeroAcao: a.numeroAcao || null, nomeAtividade: a.proposta?.nomeAtividade || "(sem título)",
  curso: a.curso || "—", periodoFim: a.proposta?.periodoFim || null, ...(motivo ? { motivo } : {}),
});

/**
 * Separa as ações em: alvos da cobrança, sem e-mail e inconsistentes.
 * `ignorarCorte` é usado pelo backfill, que imuniza todo o histórico.
 */
export function selecionar(acoes, { hoje, ledger, cfg, ignorarCorte = false }) {
  const hojeSerial = diaSerial(hoje);
  const alvos = [], semEmail = [], inconsistentes = [];
  if (hojeSerial === null) return { alvos, semEmail, inconsistentes };

  const corte = ignorarCorte ? null : (cfg.inicio || ledger.inicio || null);

  const corteSerial = corte ? diaSerial(corte) : null;
  const ID_PROIBIDO = /^(__proto__|constructor|prototype)$/;

  for (const a of Array.isArray(acoes) ? acoes : []) {
    if (!a || typeof a !== "object" || !a.id) continue;
    // o id vem do navegador: não pode virar chave especial do objeto do ledger
    if (ID_PROIBIDO.test(String(a.id))) continue;
    // 1. só ações aprovadas e ainda sem relatório entregue
    if (a.status !== "aprovada" && a.status !== "pendente") continue;
    if (a.relatorio?.entregueEm) continue;           // prova de entrega autoritativa
    // 2. sem número da ação o próprio portal não exibe a seção de relatório
    if (!a.numeroAcao) { inconsistentes.push(resumoAcao(a, "aprovada sem número da ação")); continue; }
    // 3. data de encerramento precisa ser válida
    const fim = a.proposta?.periodoFim;
    if (diaSerial(fim) === null) { inconsistentes.push(resumoAcao(a, "data de término ausente ou inválida")); continue; }
    // 4. D+1 em diante (>= 1, nunca === 1: uma rodada perdida não pode zerar a cobrança)
    const base = baseCobranca(a);
    if (base === null) { inconsistentes.push(resumoAcao(a, "sem data-base válida")); continue; }
    const dias = hojeSerial - base;
    if (dias < 1) continue;
    // 5. janela de elegibilidade e corte histórico. O corte vale sobre a
    // data-base (não sobre o fim do evento): uma ação aprovada depois da
    // estreia entra no fluxo mesmo que o evento tenha terminado antes.
    if (dias > cfg.janelaDias) continue;
    if (corteSerial !== null && base < corteSerial) continue;
    // 6. registro: dispensada ou já cobrada. "enviando" NÃO é retentado: se o
    // processo caiu depois de enviar, repetir a cobrança seria pior do que
    // deixar de lembrar (a ação continua visível como pendente na tela).
    const reg = ledger.acoes?.[a.id];
    if (reg?.dispensadaEm) continue;
    const envio = reg?.envios?.d1;
    if (envio) {
      // retentativa no MÁXIMO uma por dia: as rodadas acontecem de hora em
      // hora, e uma indisponibilidade passageira do Gmail queimaria as três
      // tentativas em minutos, deixando a ação sem cobrança para sempre.
      const outroDia = (dataCivil(envio.em) || "") < hoje;
      if (!(envio.status === "erro" && (envio.tentativas || 0) < 3 && outroDia)) continue;
    }
    // 7. precisa haver a quem cobrar
    const para = destinatariosDaAcao(a);
    if (!para.length) { semEmail.push(resumoAcao(a)); continue; }
    // dias corridos desde o fim do evento (o que o e-mail mostra ao professor)
    const diasEvento = hojeSerial - diaSerial(fim);
    alvos.push({ acao: a, dias: diasEvento, diasBase: dias, para, fim });
  }
  alvos.sort((x, y) => String(x.fim).localeCompare(String(y.fim)));  // mais atrasado primeiro
  return { alvos, semEmail, inconsistentes };
}

/** Agrupa por pessoa: uma mensagem por destinatário, com todas as ações dele. */
export function agrupar(alvos, maxEmails) {
  const porPessoa = new Map();
  for (const alvo of alvos) {
    for (const email of alvo.para) {
      if (!porPessoa.has(email)) porPessoa.set(email, []);
      porPessoa.get(email).push(alvo);
    }
  }
  const todos = [...porPessoa.entries()];
  return { lotes: todos.slice(0, maxEmails), restantes: Math.max(0, todos.length - maxEmails) };
}

/* ------------------------------- varredura ------------------------------- */
let rodando = null;       // mutex de processo
let ultimaVarredura = 0;  // throttle dos gatilhos oportunistas

async function enviarPadrao(msg, cfg) {
  if (cfg.simula) {
    console.log(`[cobranca][simulado] para=${msg.para} assunto=${msg.assunto}`);
    return String(msg.para);
  }
  const { enviarEmail } = await import("./mailer.js");
  return enviarEmail(msg);
}

/**
 * Executa uma rodada de cobrança. Idempotente: pode ser chamada por vários
 * gatilhos (boot, tráfego, intervalo, cron externo) sem duplicar envios.
 */
export async function varrer({
  storage, motivo = "manual", dry = false, force = false,
  agora = new Date(), enviar, env = process.env,
} = {}) {
  // Consulta (dry) não disputa o mutex: ela não grava nem envia, e travar a
  // rodada real por causa de uma prévia — ou devolver ao gestor o resultado
  // de outra rodada — seria pior do que rodar as duas.
  if (!dry && rodando) return rodando;
  const execucao = (async () => {
    const t0 = Date.now();
    const cfg = lerConfig(env);
    const enviarMsg = enviar || ((msg) => enviarPadrao(msg, cfg));
    const hoje = hojeLocalISO(agora);

    if (!relogioPlausivel(agora)) {
      console.error("[cobranca] relógio implausível — rodada abortada");
      return { modo: "relogio-invalido", hoje, enviados: [], erros: [] };
    }

    const ledger = await lerLedger(storage);
    const soLeitura = dry || !cfg.ativa;

    // lock persistido: ampara a janela de deploy com duas instâncias vivas
    if (!soLeitura && !force && motivo !== "cron" &&
        ledger.lock?.em && Date.now() - ledger.lock.em < LOCK_MS) {
      return { modo: "pulada", motivo: "outra execução em andamento", hoje, enviados: [], erros: [] };
    }

    const acoes = await (async () => {
      try { return JSON.parse((await storage.get(ACOES_KEY)) || "[]"); } catch { return []; }
    })();

    const primeiraVez = !ledger.backfillEm;
    const sel = selecionar(acoes, { hoje, ledger, cfg, ignorarCorte: primeiraVez && !soLeitura });
    // pendências ainda não relatadas à PROPPEX (evita repetir a cada rodada)
    const avisadas = ledger.avisadas || {};
    const novas = [...sel.semEmail, ...sel.inconsistentes].filter((x) => !avisadas[x.id]);
    const base = {
      hoje, motivo, total: acoes.length,
      semEmail: sel.semEmail, inconsistentes: sel.inconsistentes,
      novidades: novas.length, enviados: [], erros: [], restantes: 0,
    };

    // ---- modo conferência: calcula tudo, não envia e não grava ----
    if (soLeitura) {
      return {
        ...base, modo: dry ? "previa" : "desativada",
        alvos: sel.alvos.map((x) => ({ ...resumoAcao(x.acao), dias: x.dias, para: x.para })),
        ms: Date.now() - t0,
      };
    }

    // Se o estado não puder ser gravado, a rodada nem começa: sem registro
    // confiável, um envio agora vira cobrança repetida na próxima rodada.
    ledger.lock = { em: Date.now(), motivo };
    try {
      await gravarLedger(storage, ledger, { forcar: true });
    } catch (e) {
      console.error("[cobranca] estado indisponível — rodada abortada:", e.message);
      return { ...base, modo: "erro-persistencia", erro: e.message, ms: Date.now() - t0 };
    }

    try {
      // ---- estreia: registra o passivo histórico sem enviar nada ----
      if (primeiraVez) {
        const agoraIso = agora.toISOString();
        for (const alvo of sel.alvos) {
          ledger.acoes[alvo.acao.id] = {
            dispensadaEm: null,
            envios: { d1: { status: "backfill", tentativas: 0, em: agoraIso, para: [], erro: null } },
          };
        }
        ledger.backfillEm = agoraIso;
        ledger.inicio = hoje;             // a partir de hoje a cobrança vale
        ledger.ultimaVarredura = agoraIso;
        ledger.lock = null;
        const relatorio = {
          ...base, modo: "backfill", marcadas: sel.alvos.length,
          backlog: sel.alvos.map((x) => resumoAcao(x.acao)), ms: Date.now() - t0,
        };
        ledger.resumo = { modo: "backfill", hoje, marcadas: sel.alvos.length };
        await gravarLedger(storage, ledger, { forcar: true });
        console.log(`[cobranca] estreia: ${sel.alvos.length} ação(ões) do histórico registradas sem envio`);
        await avisarGestores(storage, cfg, relatorio, enviarMsg);
        return relatorio;
      }

      // ---- fora do horário comercial: adia (a regra é >= 1 dia, nada se perde) ----
      if (!dentroDaJanela(agora, cfg.horaIni, cfg.horaFim)) {
        ledger.lock = null;
        await gravarLedger(storage, ledger);
        return { ...base, modo: "fora-de-janela", alvos: sel.alvos.length, ms: Date.now() - t0 };
      }

      if (!sel.alvos.length) {
        ledger.lock = null;
        ledger.ultimaVarredura = agora.toISOString();
        if (novas.length) {
          ledger.avisadas = { ...avisadas };
          for (const x of novas) ledger.avisadas[x.id] = ledger.ultimaVarredura;
        }
        await gravarLedger(storage, ledger);
        const relatorio = { ...base, modo: "nada-a-cobrar", ms: Date.now() - t0 };
        await avisarGestores(storage, cfg, relatorio, enviarMsg);
        return relatorio;
      }

      const { lotes, restantes } = agrupar(sel.alvos, cfg.maxEmails);
      base.restantes = restantes;

      // ---- CLAIM: marca antes de enviar e força a gravação ----
      const agoraIso = agora.toISOString();
      const noLote = new Set(lotes.flatMap(([, itens]) => itens.map((i) => i.acao.id)));
      for (const id of noLote) {
        const reg = ledger.acoes[id] || { dispensadaEm: null, envios: {} };
        const ant = reg.envios?.d1;
        reg.envios = { ...reg.envios, d1: {
          status: "enviando", tentativas: (ant?.tentativas || 0) + 1, em: agoraIso, para: [], erro: null,
        } };
        ledger.acoes[id] = reg;
      }
      try {
        await gravarLedger(storage, ledger, { forcar: true });
      } catch (e) {
        console.error("[cobranca] falha ao gravar o registro — nada foi enviado:", e.message);
        return { ...base, modo: "erro-persistencia", erro: e.message, ms: Date.now() - t0 };
      }

      // ---- ENVIO: uma mensagem por pessoa; falha isolada não aborta a rodada ----
      const { emailCobrancaRelatorio } = await import("./mailer.js");
      const enviadoPara = new Map();   // acaoId -> e-mails que receberam
      const erroDaAcao = new Map();    // acaoId -> último erro
      for (const [email, itens] of lotes) {
        const nome = itens[0]?.acao?.proposta?.respNome || itens[0]?.acao?.criadoPorNome || "";
        try {
          await enviarMsg({ para: [email], ...emailCobrancaRelatorio(itens, { nome }) });
          base.enviados.push({ para: email, acoes: itens.map((i) => i.acao.numeroAcao || i.acao.id) });
          for (const i of itens)
            enviadoPara.set(i.acao.id, [...(enviadoPara.get(i.acao.id) || []), email]);
          console.log(`[cobranca] cobrança enviada para ${email} (${itens.length} ação/ões)`);
        } catch (e) {
          const msg = e?.message || String(e);
          base.erros.push({ para: email, erro: msg });
          for (const i of itens) erroDaAcao.set(i.acao.id, msg);
          console.error(`[cobranca] falha ao cobrar ${email}:`, msg);
        }
      }

      // ---- fecha o registro de cada ação ----
      // Basta um destinatário ter recebido para a ação contar como cobrada.
      const fimIso = agora.toISOString();
      for (const id of noLote) {
        const reg = ledger.acoes[id];
        const para = enviadoPara.get(id) || [];
        const tentativas = reg.envios.d1.tentativas || 1;
        reg.envios.d1 = para.length
          ? { status: "enviado", tentativas, em: fimIso, para, erro: null }
          : { status: tentativas >= 3 ? "desistiu" : "erro", tentativas, em: fimIso, para: [],
              erro: (erroDaAcao.get(id) || "falha desconhecida").slice(0, 200) };
      }
      podar(ledger, acoes);
      // registra as pendências relatadas para não repeti-las no próximo resumo
      ledger.avisadas = { ...avisadas };
      for (const x of novas) ledger.avisadas[x.id] = fimIso;
      ledger.lock = null;
      ledger.ultimaVarredura = fimIso;
      ledger.resumo = {
        modo: "cobranca", hoje, motivo, enviados: base.enviados.length,
        erros: base.erros.length, restantes, ms: Date.now() - t0,
      };
      await gravarLedger(storage, ledger, { forcar: true });

      const relatorio = { ...base, modo: "cobranca", ms: Date.now() - t0 };
      await avisarGestores(storage, cfg, relatorio, enviarMsg);
      return relatorio;
    } catch (e) {
      ledger.lock = null;
      await gravarLedger(storage, ledger).catch(() => {});
      throw e;
    }
  })();

  if (dry) return execucao;                 // prévia não ocupa o mutex
  rodando = execucao.finally(() => { rodando = null; ultimaVarredura = Date.now(); });
  return rodando;
}

/**
 * Resumo à PROPPEX. Silêncio é o estado normal.
 * Pendências sem e-mail ou com dado inconsistente permanecem em toda rodada;
 * repeti-las de hora em hora viraria spam, então só entram no resumo quando
 * são novidade (`novidades`), e ficam registradas como já avisadas.
 */
async function avisarGestores(storage, cfg, relatorio, enviarMsg) {
  const temAssunto = relatorio.modo === "backfill" ||
    relatorio.enviados.length || relatorio.erros.length || relatorio.novidades;
  if (!temAssunto) return;
  try {
    const { emailResumoCobranca } = await import("./mailer.js");
    const para = await destinatariosResumo(storage, cfg);
    if (para.length) await enviarMsg({ para, ...emailResumoCobranca(relatorio) });
  } catch (e) {
    console.error("[cobranca] falha ao enviar o resumo à PROPPEX:", e.message);
  }
}

/**
 * Mantém o ledger enxuto: ele vive dentro do mesmo JSON de estado do sistema.
 * Nunca poda a partir de uma lista vazia — se a leitura das ações falhar,
 * apagar o registro faria a rodada seguinte recobrar todo mundo.
 */
function podar(ledger, acoes) {
  if (!Array.isArray(acoes) || !acoes.length) return;
  const vivos = new Set(acoes.map((a) => a?.id).filter(Boolean));
  const limite = Date.now() - 180 * 86400000;
  for (const [id, reg] of Object.entries(ledger.acoes)) {
    if (vivos.has(id)) continue;
    // só descarta registros antigos: uma ação ausente por gravação parcial do
    // portal voltaria a ser cobrada se a marca sumisse na hora
    const quando = Date.parse(reg?.envios?.d1?.em || "") || 0;
    if (quando && quando < limite) delete ledger.acoes[id];
  }
}

/** Gatilho oportunista (boot, tráfego, intervalo): nunca bloqueia a requisição. */
export function varrerSeVencido(storage, motivo = "trafego") {
  if (rodando || Date.now() - ultimaVarredura < THROTTLE_MS) return;
  ultimaVarredura = Date.now();
  varrer({ storage, motivo }).catch((e) => console.error("[cobranca] falha na varredura:", e.message));
}

/** Válvula manual da PROPPEX: a ação nunca mais é cobrada automaticamente. */
export async function dispensar(storage, id, email) {
  // Não espera a rodada em voo (isso travaria se a chamada viesse de dentro
  // dela): quem garante a convivência é a mesclagem feita em gravarLedger,
  // que preserva a dispensa ao fechar a rodada.
  const ledger = await lerLedger(storage);
  const reg = ledger.acoes[id] || { envios: {} };
  ledger.acoes[id] = { ...reg, dispensadaEm: new Date().toISOString(), dispensadaPor: email || null };
  await gravarLedger(storage, ledger, { forcar: true });
  return ledger.acoes[id];
}

/** Situação da rotina, para o painel da PROPPEX. */
export async function situacao(storage) {
  const l = await lerLedger(storage);
  return {
    ultimaVarredura: l.ultimaVarredura, resumo: l.resumo,
    backfillEm: l.backfillEm, inicio: l.inicio,
    dispensadas: Object.entries(l.acoes || {})
      .filter(([, r]) => r?.dispensadaEm).map(([id]) => id),
    cobradas: Object.entries(l.acoes || {})
      .filter(([, r]) => r?.envios?.d1?.status === "enviado").map(([id]) => id),
    // ações que ficaram sem cobrança por falha de envio: sem isto elas
    // sumiriam do sistema depois da última tentativa
    falhas: Object.entries(l.acoes || {})
      .filter(([, r]) => ["erro", "desistiu", "enviando"].includes(r?.envios?.d1?.status))
      .map(([id, r]) => ({ id, status: r.envios.d1.status, tentativas: r.envios.d1.tentativas,
        em: r.envios.d1.em, erro: r.envios.d1.erro })),
  };
}
