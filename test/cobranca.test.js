/* Cobrança automática do relatório final — regras de elegibilidade,
   idempotência e salvaguardas. Nenhum e-mail real: `enviar` é injetado.     */
import test from "node:test";
import assert from "node:assert/strict";
import { varrer, selecionar, lerConfig, dispensar, ACOES_KEY, LEDGER_KEY } from "../lib/cobranca.js";

/* ------------------------------ utilidades ------------------------------ */
function storageFalso(inicial = {}) {
  const dados = { ...inicial };
  return {
    dados,
    flushes: 0,
    async get(k) { return k in dados ? dados[k] : null; },
    async set(k, v) { dados[k] = String(v); },
    async del(k) { delete dados[k]; },
    async list(p) { return Object.keys(dados).filter((k) => !p || k.startsWith(p)); },
    async flush() { this.flushes++; },
  };
}

let seq = 0;
function acao(over = {}) {
  const { proposta = {}, ...resto } = over;
  return {
    id: over.id || `ext-${++seq}`,
    numeroAcao: "EXT-2026-001",
    status: "aprovada",
    curso: "Enfermagem",
    criadoPor: "prof@uniego.edu.br",
    criadoEm: "2026-07-01T12:00:00.000Z",
    relatorio: {},
    proposta: {
      nomeAtividade: "Semana de Enfermagem",
      periodoInicio: "2026-08-01",
      periodoFim: "2026-08-10",
      respNome: "Prof. Teste",
      respEmail: "prof@uniego.edu.br",
      ...proposta,
    },
    ...resto,
  };
}

// 14/08/2026 às 09:00 de Brasília
const AGORA = new Date("2026-08-14T12:00:00Z");
const ENV = {
  COBRANCA_ATIVA: "true", COBRANCA_JANELA_DIAS: "30", COBRANCA_MAX_EMAILS: "10",
  NOTIFY_EMAIL: "extensao@uniego.edu.br",
};

function coletor() {
  const enviados = [];
  const fn = async (msg) => { enviados.push(msg); return String(msg.para); };
  fn.enviados = enviados;
  // só as cobranças nominais (o resumo vai para a PROPPEX)
  fn.cobrancas = () => enviados.filter((m) => !String(m.assunto).includes("Cobrança de relatórios")
    && !String(m.assunto).includes("histórico preservado"));
  return fn;
}

/** Prepara um storage já "estreado" (backfill feito), sem passivo histórico. */
async function comBackfillFeito(acoes, env = ENV) {
  const st = storageFalso({ [ACOES_KEY]: JSON.stringify(acoes) });
  const enviar = coletor();
  await varrer({ storage: st, agora: AGORA, enviar, env });   // 1ª rodada = backfill
  return st;
}

/* ------------------------------- estreia -------------------------------- */
test("estreia: registra o passivo histórico e NÃO envia cobrança a ninguém", async () => {
  const st = storageFalso({ [ACOES_KEY]: JSON.stringify([acao(), acao(), acao()]) });
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: AGORA, enviar, env: ENV });

  assert.equal(r.modo, "backfill");
  assert.equal(r.marcadas, 3);
  assert.equal(enviar.cobrancas().length, 0, "nenhuma cobrança na estreia");
  const resumo = enviar.enviados.filter((m) => String(m.assunto).includes("histórico preservado"));
  assert.equal(resumo.length, 1, "a PROPPEX recebe um único resumo");
  const ledger = JSON.parse(st.dados[LEDGER_KEY]);
  assert.ok(ledger.backfillEm);
  assert.equal(ledger.inicio, "2026-08-14");
});

test("depois da estreia, uma ação nova vencida é cobrada normalmente", async () => {
  const antiga = acao({ proposta: { periodoFim: "2026-08-10" } });
  const st = await comBackfillFeito([antiga]);

  const nova = acao({
    id: "ext-nova", numeroAcao: "EXT-2026-050",
    criadoPor: "outro@uniego.edu.br",
    proposta: { periodoFim: "2026-08-20", respEmail: "outro@uniego.edu.br" },
  });
  st.dados[ACOES_KEY] = JSON.stringify([antiga, nova]);

  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-21T12:00:00Z"), enviar, env: ENV });
  assert.equal(r.modo, "cobranca");
  assert.equal(enviar.cobrancas().length, 1);
  assert.equal(enviar.cobrancas()[0].para[0], "outro@uniego.edu.br");
  assert.equal(r.enviados[0].acoes[0], "EXT-2026-050");
});

/* ---------------------------- elegibilidade ----------------------------- */
test("evento que termina hoje não é cobrado — nem às 23h de Brasília", () => {
  const cfg = lerConfig(ENV);
  const ledger = { acoes: {}, inicio: null };
  const hoje = "2026-08-14";
  const a = acao({ proposta: { periodoFim: "2026-08-14" } });
  assert.equal(selecionar([a], { hoje, ledger, cfg }).alvos.length, 0);
});

test("hibernação: ação encerrada há 4 dias continua devida (>= 1, nunca === 1)", () => {
  const cfg = lerConfig(ENV);
  const sel = selecionar([acao({ proposta: { periodoFim: "2026-08-10" } })],
    { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg });
  assert.equal(sel.alvos.length, 1);
  assert.equal(sel.alvos[0].dias, 4);
});

test("status que não devem ser cobrados", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  for (const status of ["submetida", "devolvida", "relatorio-entregue", "registrada"])
    assert.equal(selecionar([acao({ status })], ctx).alvos.length, 0, status);
  assert.equal(selecionar([acao({ status: "aprovada" })], ctx).alvos.length, 1);
});

test("relatório entregue encerra a cobrança; apreciação salva pela PROPPEX não", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  const entregue = acao({ relatorio: { entregueEm: "2026-08-12T10:00:00Z", avaliacaoResultados: "ok" } });
  assert.equal(selecionar([entregue], ctx).alvos.length, 0);
  // salvarApreciacao() preenche o relatório SEM entregueEm — ainda é devido
  const soApreciacao = acao({ relatorio: { conteudoProgramatico: "x", despesa: "0" } });
  assert.equal(selecionar([soApreciacao], ctx).alvos.length, 1);
});

test("aprovada sem número da ação e data inválida entram em inconsistentes", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  const semNumero = acao({ numeroAcao: null });
  const semData = acao({ proposta: { periodoFim: "" } });
  const dataTorta = acao({ proposta: { periodoFim: "10/08/2026" } });
  const sel = selecionar([semNumero, semData, dataTorta], ctx);
  assert.equal(sel.alvos.length, 0);
  assert.equal(sel.inconsistentes.length, 3);
});

test("base = max(fim, início, aprovação): cadastro retroativo não é cobrado no mesmo dia", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  // evento de julho, cadastrado e aprovado hoje
  const retroativa = acao({
    aprovadoEm: "2026-08-14T11:00:00Z", criadoEm: "2026-08-14T10:00:00Z",
    proposta: { periodoInicio: "2026-07-01", periodoFim: "2026-07-05" },
  });
  assert.equal(selecionar([retroativa], ctx).alvos.length, 0);
  // datas invertidas por erro de digitação: vale a maior
  const invertida = acao({ proposta: { periodoInicio: "2026-08-20", periodoFim: "2026-08-02" } });
  assert.equal(selecionar([invertida], ctx).alvos.length, 0);
});

test("janela de elegibilidade descarta ação vencida há mais de 30 dias", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  const antiga = acao({
    criadoEm: "2026-06-01T12:00:00.000Z",
    proposta: { periodoInicio: "2026-06-15", periodoFim: "2026-06-20" },
  });
  assert.equal(selecionar([antiga], ctx).alvos.length, 0);
});

test("corte histórico: ação anterior ao início da rotina é ignorada", () => {
  const cfg = lerConfig(ENV);
  const ledger = { acoes: {}, inicio: "2026-08-12" };
  const ctx = { hoje: "2026-08-14", ledger, cfg };
  assert.equal(selecionar([acao({ proposta: { periodoFim: "2026-08-10" } })], ctx).alvos.length, 0);
  assert.equal(selecionar([acao({ proposta: { periodoFim: "2026-08-13" } })], ctx).alvos.length, 1);
});

/* ---------------------------- destinatários ----------------------------- */
test("uma mensagem por pessoa, agrupando as ações dela", async () => {
  const base = { criadoPor: "ana@uniego.edu.br", proposta: { respEmail: "ana@uniego.edu.br" } };
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([
    acao({ ...base, id: "a1", numeroAcao: "EXT-2026-001", proposta: { ...base.proposta, periodoFim: "2026-08-16" } }),
    acao({ ...base, id: "a2", numeroAcao: "EXT-2026-002", proposta: { ...base.proposta, periodoFim: "2026-08-17" } }),
    acao({ ...base, id: "a3", numeroAcao: "EXT-2026-003", proposta: { ...base.proposta, periodoFim: "2026-08-18" } }),
  ]);
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-20T12:00:00Z"), enviar, env: ENV });
  assert.equal(enviar.cobrancas().length, 1, "três ações do mesmo professor = um e-mail");
  assert.equal(r.enviados[0].acoes.length, 3);
  assert.match(enviar.cobrancas()[0].assunto, /3 ações/);
});

test("responsável e submissor iguais não geram envio duplicado; e-mail inválido vai para semEmail", () => {
  const cfg = lerConfig(ENV);
  const ctx = { hoje: "2026-08-14", ledger: { acoes: {}, inicio: null }, cfg };
  const mesmo = acao({ criadoPor: "Prof@Uniego.edu.br", proposta: { respEmail: "prof@uniego.edu.br" } });
  assert.deepEqual(selecionar([mesmo], ctx).alvos[0].para, ["prof@uniego.edu.br"]);

  const invalidos = acao({ criadoPor: "  ", proposta: { respEmail: "sem-arroba" } });
  const sel = selecionar([invalidos], ctx);
  assert.equal(sel.alvos.length, 0);
  assert.equal(sel.semEmail.length, 1);

  // tentativa de injeção de cabeçalho nunca vira destinatário
  const injecao = acao({ criadoPor: "", proposta: { respEmail: "a@b.com\nBcc: x@y.com" } });
  assert.equal(selecionar([injecao], ctx).alvos.length, 0);
});

/* ---------------------------- idempotência ------------------------------ */
test("duas varreduras seguidas cobram uma única vez", async () => {
  const a = acao({ proposta: { periodoFim: "2026-08-16" } });
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([a]);
  const quando = new Date("2026-08-18T12:00:00Z");

  const e1 = coletor();
  await varrer({ storage: st, agora: quando, enviar: e1, env: ENV });
  assert.equal(e1.cobrancas().length, 1);

  const e2 = coletor();
  const r2 = await varrer({ storage: st, agora: quando, enviar: e2, env: ENV, force: true });
  assert.equal(e2.cobrancas().length, 0);
  assert.equal(r2.modo, "nada-a-cobrar");

  // e nem dias depois
  const e3 = coletor();
  await varrer({ storage: st, agora: new Date("2026-08-21T12:00:00Z"), enviar: e3, env: ENV, force: true });
  assert.equal(e3.cobrancas().length, 0);
});

test("o registro sobrevive ao PUT do array inteiro feito pelo front-end", async () => {
  const a = acao({ proposta: { periodoFim: "2026-08-16" } });
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([a]);
  await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar: coletor(), env: ENV });

  // front-end regrava o array inteiro (cópia antiga, sem qualquer marca)
  st.dados[ACOES_KEY] = JSON.stringify([{ ...a, atualizadoEm: "2026-08-18T15:00:00Z" }]);

  const e2 = coletor();
  await varrer({ storage: st, agora: new Date("2026-08-19T12:00:00Z"), enviar: e2, env: ENV, force: true });
  assert.equal(e2.cobrancas().length, 0, "a marca vive em chave própria e não foi apagada");
});

/* -------------------------- salvaguardas -------------------------------- */
test("teto por rodada limita os envios e o resto volta na próxima", async () => {
  // eventos encerrados DEPOIS da estreia da rotina (14/08), varridos em 23/08
  const acoes = Array.from({ length: 8 }, (_, i) => acao({
    id: `x${i}`, numeroAcao: `EXT-2026-1${i}`,
    criadoPor: `p${i}@uniego.edu.br`,
    proposta: {
      periodoInicio: "2026-08-15", periodoFim: `2026-08-${15 + i}`,
      respEmail: `p${i}@uniego.edu.br`,
    },
  }));
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify(acoes);

  const e1 = coletor();
  const r1 = await varrer({ storage: st, agora: new Date("2026-08-23T12:00:00Z"), enviar: e1,
    env: { ...ENV, COBRANCA_MAX_EMAILS: "3" } });
  assert.equal(e1.cobrancas().length, 3);
  assert.equal(r1.restantes, 5);

  const e2 = coletor();
  await varrer({ storage: st, agora: new Date("2026-08-23T13:00:00Z"), enviar: e2, force: true,
    env: { ...ENV, COBRANCA_MAX_EMAILS: "3" } });
  assert.equal(e2.cobrancas().length, 3, "os que sobraram são cobrados depois");
});

test("fora do horário comercial nada é enviado", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([acao({ proposta: { periodoFim: "2026-08-16" } })]);
  const enviar = coletor();
  // 03:00 de Brasília
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T06:00:00Z"), enviar, env: ENV, force: true });
  assert.equal(r.modo, "fora-de-janela");
  assert.equal(enviar.cobrancas().length, 0);
});

test("COBRANCA_ATIVA=false congela a rotina sem novo deploy", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([acao({ proposta: { periodoFim: "2026-08-16" } })]);
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar,
    env: { ...ENV, COBRANCA_ATIVA: "false" }, force: true });
  assert.equal(r.modo, "desativada");
  assert.equal(enviar.enviados.length, 0);
});

test("se a gravação do registro falhar, nada é enviado", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([acao({ proposta: { periodoFim: "2026-08-16" } })]);
  st.flush = async () => { throw new Error("Drive indisponível"); };
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar, env: ENV, force: true });
  assert.equal(r.modo, "erro-persistencia");
  assert.equal(enviar.enviados.length, 0, "sem registro gravado, não se envia");
});

test("falha de envio a um destinatário não derruba a rodada e é retentada depois", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([
    acao({ id: "f1", criadoPor: "ruim@uniego.edu.br", proposta: { respEmail: "ruim@uniego.edu.br", periodoFim: "2026-08-16" } }),
    acao({ id: "f2", criadoPor: "bom@uniego.edu.br", proposta: { respEmail: "bom@uniego.edu.br", periodoFim: "2026-08-16" } }),
  ]);
  const enviados = [];
  const enviar = async (msg) => {
    if (String(msg.para).includes("ruim")) throw new Error("caixa cheia");
    enviados.push(msg);
    return "ok";
  };
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar, env: ENV, force: true });
  assert.equal(r.erros.length, 1);
  assert.ok(enviados.length >= 1, "o destinatário bom recebeu mesmo com a falha do outro");

  // a que falhou volta na rodada seguinte
  const e2 = coletor();
  const r2 = await varrer({ storage: st, agora: new Date("2026-08-19T12:00:00Z"), enviar: e2, env: ENV, force: true });
  assert.equal(r2.enviados.some((e) => e.para === "ruim@uniego.edu.br"), true);
});

test("dispensa manual da PROPPEX impede qualquer cobrança futura", async () => {
  const a = acao({ id: "disp", proposta: { periodoFim: "2026-08-16" } });
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([a]);
  await dispensar(st, "disp", "jadsonbelem@gmail.com");

  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar, env: ENV, force: true });
  assert.equal(enviar.cobrancas().length, 0);
  assert.equal(r.modo, "nada-a-cobrar");
});

test("prévia mostra o que seria cobrado sem enviar nem gravar", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([acao({ proposta: { periodoFim: "2026-08-16" } })]);
  const antes = st.dados[LEDGER_KEY];
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("2026-08-18T12:00:00Z"), enviar, env: ENV, dry: true });
  assert.equal(r.modo, "previa");
  assert.equal(r.alvos.length, 1);
  assert.equal(enviar.enviados.length, 0);
  assert.equal(st.dados[LEDGER_KEY], antes, "prévia não altera o registro");
});

/* --------- regressões dos achados da revisão adversarial ---------------- */
test("ação aprovada depois da estreia é cobrada mesmo se o evento terminou antes", () => {
  const cfg = lerConfig(ENV);
  // rotina estreou em 12/08; evento terminou em 10/08 mas só foi aprovado em 13/08
  const ledger = { acoes: {}, inicio: "2026-08-12" };
  const a = acao({
    aprovadoEm: "2026-08-13T12:00:00Z",
    proposta: { periodoInicio: "2026-08-05", periodoFim: "2026-08-10" },
  });
  const sel = selecionar([a], { hoje: "2026-08-15", ledger, cfg });
  assert.equal(sel.alvos.length, 1, "o corte vale sobre a data-base, não sobre o fim do evento");
  assert.equal(sel.alvos[0].dias, 5, "o e-mail informa os dias desde o fim do evento");
});

test("registro em enviando NÃO é reenviado (queda após o envio não duplica cobrança)", () => {
  const cfg = lerConfig(ENV);
  const ledger = { inicio: null, acoes: { "ext-x": {
    dispensadaEm: null, envios: { d1: { status: "enviando", tentativas: 1, em: "2026-08-14T12:00:00Z" } } } } };
  const a = acao({ id: "ext-x", proposta: { periodoFim: "2026-08-12" } });
  assert.equal(selecionar([a], { hoje: "2026-08-15", ledger, cfg }).alvos.length, 0);
});

test("id malicioso não polui o prototype do registro", () => {
  const cfg = lerConfig(ENV);
  const a = acao({ id: "__proto__", proposta: { periodoFim: "2026-08-12" } });
  const sel = selecionar([a], { hoje: "2026-08-15", ledger: { acoes: {}, inicio: null }, cfg });
  assert.equal(sel.alvos.length, 0);
  assert.equal({}.dispensadaEm, undefined);
});

test("prévia não bloqueia nem sequestra a rodada real", async () => {
  const st = await comBackfillFeito([]);
  st.dados[ACOES_KEY] = JSON.stringify([acao({ proposta: { periodoFim: "2026-08-16" } })]);
  const quando = new Date("2026-08-18T12:00:00Z");
  const enviar = coletor();
  const [previa, real] = await Promise.all([
    varrer({ storage: st, agora: quando, enviar, env: ENV, dry: true }),
    varrer({ storage: st, agora: quando, enviar, env: ENV, force: true }),
  ]);
  assert.equal(previa.modo, "previa");
  assert.equal(real.modo, "cobranca", "a rodada real não virou no-op por causa da prévia");
  assert.equal(enviar.cobrancas().length, 1);
});

test("pendência sem e-mail é relatada uma vez, não a cada rodada", async () => {
  const st = await comBackfillFeito([]);
  const semEmail = acao({ id: "sem", criadoPor: "", proposta: { periodoFim: "2026-08-16", respEmail: "invalido" } });
  st.dados[ACOES_KEY] = JSON.stringify([semEmail]);
  const quando = new Date("2026-08-18T12:00:00Z");

  const e1 = coletor();
  await varrer({ storage: st, agora: quando, enviar: e1, env: ENV, force: true });
  assert.equal(e1.enviados.length, 1, "a PROPPEX é avisada da pendência");

  const e2 = coletor();
  await varrer({ storage: st, agora: quando, enviar: e2, env: ENV, force: true });
  assert.equal(e2.enviados.length, 0, "e não é avisada de novo na rodada seguinte");
});

test("relógio implausível aborta a rodada", async () => {
  const st = await comBackfillFeito([]);
  const enviar = coletor();
  const r = await varrer({ storage: st, agora: new Date("1999-08-18T12:00:00Z"), enviar, env: ENV, force: true });
  assert.equal(r.modo, "relogio-invalido");
  assert.equal(enviar.enviados.length, 0);
});
