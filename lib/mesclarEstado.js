/* ========================================================================
   MESCLA DO ESTADO ENTRE DUAS INSTÂNCIAS — a corrida do deploy (set/2026).

   O estado é UM arquivo no Drive; cada instância o lê UMA vez, no boot, e
   depois escreve o arquivo INTEIRO da própria memória. No deploy do Render
   as duas instâncias convivem: a nova sobe, lê o arquivo, e enquanto ela
   ainda está arrancando (migrações, lotes — dezenas de segundos) o tráfego
   continua indo à ANTIGA. Toda inscrição, presença ou gravação que a antiga
   recebe nesse intervalo sobe ao Drive — e some na PRIMEIRA escrita da nova,
   que grava por cima a foto que tirou no boot. O flush do SIGTERM não ajuda:
   ele sobe o estado completo da antiga, e a nova o cobre em seguida.

   Foram oito deploys num só dia de evento. Este módulo é a régua PURA que o
   storage usa quando descobre, antes de subir, que o arquivo mudou de versão
   desde a última vez que o viu: um merge a TRÊS — a foto que as duas
   instâncias conheciam (`base`), o que esta instância tem (`local`) e o que
   está no Drive agora (`remoto`).

   Chave a chave:
   - só o remoto mudou   → vale o remoto (foi a outra instância que gravou);
   - só o local mudou    → vale o local;
   - os dois mudaram     → mesclador da CHAVE, quando há um; sem mesclador,
                           vale o local e o conflito é DITO (o chamador loga).
   Os mescladores existem para as chaves em que a perda dói e a fusão tem
   forma conhecida: listas de registros com `id` (ações, projetos, reservas,
   bolsistas do ICEM). Registro que só um lado tem entra; registro nos dois
   lados vale o LOCAL (é a escrita mais recente de quem está pedindo para
   gravar) com UNIÃO das listas que crescem por gente diferente — os
   inscritos, as presenças de cada inscrito, os alunos, os relatórios, o
   histórico. Perder uma inscrição é o pior desfecho; repetir uma linha de
   histórico, o mais barato.
   ======================================================================== */

const parse = (s, padrao) => {
  if (s == null || s === "") return padrao;
  try { const v = JSON.parse(s); return v == null ? padrao : v; } catch { return padrao; }
};

/** A chave de um inscrito/aluno/pessoa: o token (único por inscrição), o CPF
    ou o e-mail — nessa ordem, porque é a mesma que `mesclarEventoEInscritos`
    e `jaInscrito` usam. Sem nenhuma, o registro só se identifica por si. */
function chavePessoa(x) {
  if (!x || typeof x !== "object") return "";
  const tok = String(x.token || "").trim();
  if (tok) return "t:" + tok;
  const cpf = String(x.cpf || "").replace(/\D/g, "");
  if (cpf) return "c:" + cpf;
  const email = String(x.email || "").trim().toLowerCase();
  if (email) return "e:" + email;
  const id = String(x.id || "").trim();
  return id ? "i:" + id : "";
}

const chaveOuConteudo = (chaveDe, item) => {
  // sem chave própria, o registro se identifica pelo próprio conteúdo:
  // igual nos dois lados entra uma vez; diferente, entram os dois
  const k = chaveDe(item);
  if (k) return k;
  try { return "j:" + JSON.stringify(item); } catch { return ""; }
};

/** União A TRÊS de listas de objetos por uma chave. O que só o LOCAL tem
    entra; o que só o REMOTO tem entra SE não estava na base (é novo lá) —
    se estava, foi APAGADO aqui, e apagar é decisão que a mescla não desfaz
    (a gestão removeu uma indicação, excluiu um inscrito). Nos dois lados
    vale o local, com `dentro` (sub-listas) unidas pela mesma régua. */
function unirLista(localL, remotoL, baseL, chaveDe, dentro = {}) {
  const l = Array.isArray(localL) ? localL : [];
  const r = Array.isArray(remotoL) ? remotoL : [];
  const b = Array.isArray(baseL) ? baseL : [];
  const naBase = new Map();
  for (const x of b) { const k = chaveOuConteudo(chaveDe, x); if (k) naBase.set(k, x); }
  const idx = new Map();
  const saida = [];
  for (const x of l) {
    const k = chaveOuConteudo(chaveDe, x);
    if (k && !idx.has(k)) idx.set(k, saida.length);
    saida.push(x);
  }
  for (const x of r) {
    const k = chaveOuConteudo(chaveDe, x);
    if (!k) { saida.push(x); continue; }
    const pos = idx.get(k);
    if (pos != null) { saida[pos] = unirDentro(saida[pos], x, naBase.get(k), dentro); continue; }
    if (naBase.has(k)) continue;          // estava na base e o local o tirou: apagado
    idx.set(k, saida.length); saida.push(x);
  }
  return saida;
}

function unirDentro(local, remoto, base, dentro) {
  if (!local || typeof local !== "object" || !remoto || typeof remoto !== "object") return local;
  const out = { ...local };
  for (const [campo, regra] of Object.entries(dentro)) {
    const temL = Array.isArray(local[campo]), temR = Array.isArray(remoto[campo]);
    if (!temL && !temR) continue;
    out[campo] = unirLista(local[campo], remoto[campo], base?.[campo], regra.chave, regra.dentro || {});
  }
  return out;
}

/* As sub-listas de um INSCRITO que crescem por gente diferente: a presença
   por atividade, lançada na porta, no telão e pela gestão. */
const DENTRO_INSCRITO = {
  presencas: { chave: (p) => `${p?.atividade || ""}|${p?.fase || ""}|${p?.em || ""}` },
};

function mesclarAcao(local, remoto, base) {
  if (!local || typeof local !== "object") return remoto;
  if (!remoto || typeof remoto !== "object") return local;
  const out = { ...local };
  const pl = local.participantes || {}, pr = remoto.participantes || {}, pb = base?.participantes || {};
  if (local.participantes || remoto.participantes) {
    out.participantes = { ...pr, ...pl };
    for (const lista of ["inscritos", "palestrantes", "comissao"]) {
      if (Array.isArray(pl[lista]) || Array.isArray(pr[lista]))
        out.participantes[lista] = unirLista(pl[lista], pr[lista], pb[lista], chavePessoa, lista === "inscritos" ? DENTRO_INSCRITO : {});
    }
  }
  // o mural do evento e as fotos do portfólio também crescem por gente diferente
  if (local.evento || remoto.evento) {
    const el = local.evento || {}, er = remoto.evento || {};
    out.evento = { ...er, ...el };
    if (Array.isArray(el.mural) || Array.isArray(er.mural))
      out.evento.mural = unirLista(el.mural, er.mural, base?.evento?.mural, (m) => (m?.id ? "i:" + m.id : ""));
  }
  if (Array.isArray(local.anexos) || Array.isArray(remoto.anexos))
    out.anexos = unirLista(local.anexos, remoto.anexos, base?.anexos, (a) => String(a?.ref || a?.fileId || a?.path || a?.nome || ""));
  return out;
}

function mesclarProjeto(local, remoto, base) {
  if (!local || typeof local !== "object") return remoto;
  if (!remoto || typeof remoto !== "object") return local;
  const out = { ...local };
  const b = base && typeof base === "object" ? base : {};
  if (Array.isArray(local.alunos) || Array.isArray(remoto.alunos))
    out.alunos = unirLista(local.alunos, remoto.alunos, b.alunos, chavePessoa);
  if (Array.isArray(local.relatorios) || Array.isArray(remoto.relatorios))
    out.relatorios = unirLista(local.relatorios, remoto.relatorios, b.relatorios, (r) => (r?.id ? "i:" + r.id : `${r?.tipo || ""}|${r?.enviadoEm || ""}`));
  if (Array.isArray(local.historico) || Array.isArray(remoto.historico))
    out.historico = unirLista(local.historico, remoto.historico, b.historico, (h) => `${h?.em || ""}|${h?.texto || h?.acao || ""}`);
  if (Array.isArray(local.avaliadores) || Array.isArray(remoto.avaliadores))
    out.avaliadores = unirLista(local.avaliadores, remoto.avaliadores, b.avaliadores, chavePessoa);
  return out;
}

/** Lista de registros com `id`, a três: o que só o local tem entra; o que
    só o remoto tem entra se NÃO estava na base (registro novo lá — a ação
    que a outra instância criou) e fica de fora se estava (o local o apagou);
    nos dois lados, `mesclarUm(local, remoto, base)`. */
function mesclarListaPorId(localStr, remotoStr, baseStr, mesclarUm) {
  const l = parse(localStr, []), r = parse(remotoStr, []), b = parse(baseStr, []);
  if (!Array.isArray(l) || !Array.isArray(r)) return localStr;
  const chave = (x) => (x && typeof x === "object" && x.id != null ? String(x.id) : "");
  const naBase = new Map();
  for (const x of Array.isArray(b) ? b : []) { const k = chave(x); if (k) naBase.set(k, x); }
  const porId = new Map();
  const saida = [];
  for (const x of l) { const k = chave(x); if (k && !porId.has(k)) porId.set(k, saida.length); saida.push(x); }
  for (const x of r) {
    const k = chave(x);
    if (!k) { saida.push(x); continue; }
    const pos = porId.get(k);
    if (pos != null) { saida[pos] = mesclarUm(saida[pos], x, naBase.get(k)); continue; }
    if (naBase.has(k)) continue;          // apagado localmente
    porId.set(k, saida.length); saida.push(x);
  }
  return JSON.stringify(saida);
}

/** Os mescladores por CHAVE do estado, `(local, remoto, base) → string`.
    Quem não está aqui, em conflito, fica com o local — e o chamador diz que
    houve conflito. */
export const MESCLADORES = {
  "ex-acoes-v1": (l, r, b) => mesclarListaPorId(l, r, b, mesclarAcao),
  "ic-projetos-v1": (l, r, b) => mesclarListaPorId(l, r, b, mesclarProjeto),
  "esp-reservas-v1": (l, r, b) => mesclarListaPorId(l, r, b, (a) => a),
  "ic-em-v1": (l, r, b) => mesclarListaPorId(l, r, b, (a, c) => ({ ...c, ...a })),
};

/**
 * O merge a três. `base` é a foto que as duas instâncias conheciam; `local`
 * o que esta tem agora; `remoto` o que está no Drive. Devolve o estado
 * mesclado e a lista das chaves em que os dois mudaram (para o log).
 */
export function mesclarEstado({ base = {}, local = {}, remoto = {}, mescladores = MESCLADORES } = {}) {
  const saida = {};
  const conflitos = [];
  const chaves = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto)]);
  for (const k of chaves) {
    const b = base[k], l = local[k], r = remoto[k];
    const mudouLocal = l !== b, mudouRemoto = r !== b;
    if (!mudouLocal && !mudouRemoto) { if (l !== undefined) saida[k] = l; continue; }
    if (mudouLocal && !mudouRemoto) { if (l !== undefined) saida[k] = l; continue; }   // apagada localmente fica apagada
    if (!mudouLocal && mudouRemoto) { if (r !== undefined) saida[k] = r; continue; }
    // os dois mudaram
    if (l === undefined) { if (r !== undefined) saida[k] = r; conflitos.push(k); continue; }
    if (r === undefined) { saida[k] = l; conflitos.push(k); continue; }
    if (l === r) { saida[k] = l; continue; }
    const m = mescladores[k];
    if (m) {
      try { saida[k] = m(l, r, b); conflitos.push(k + " (mesclada)"); continue; }
      catch { /* mesclador falhou: vale o local, dito abaixo */ }
    }
    saida[k] = l;
    conflitos.push(k);
  }
  return { estado: saida, conflitos };
}
