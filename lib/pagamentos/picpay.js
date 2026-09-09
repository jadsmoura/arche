/* =======================================================================
   ARCHÉ — adaptador do PICPAY (API de Link de Pagamento)

   A conta PJ da instituição oferece, em Integrações, a "Link de Pagamento -
   API" (e a versão Sandbox dela). É esta a API que se usa: cada inscrição
   vira UM link de pagamento, com o BR Code Pix (`brcode`, o "copia e cola"
   que vale em qualquer banco) e a página hospedada do PicPay (`link`, onde
   entram cartão e saldo PicPay — nenhum dado de cartão passa pelo ARCHÉ).

   A mesma interface do adaptador do Mercado Pago: criar a cobrança,
   consultar, procurar os pagamentos de uma inscrição e estornar. O que se
   paga é a TRANSAÇÃO do link — é ela que o webhook avisa, que se consulta
   (`GET /paymentlink/:id/transactions`) e que se estorna.

   As credenciais vêm SÓ do ambiente do Render (nunca do código):
     PICPAY_CLIENT_ID / PICPAY_CLIENT_SECRET — Painel Empresas → Integrações →
                            "Link de Pagamento - API" → Gerar credenciais
     PICPAY_WEBHOOK_TOKEN — a API Key gerada ao ativar a URL de notificação
                            (Configurações → Meu checkout)
     PICPAY_AMBIENTE      — "staging" (credenciais Sandbox) ou "producao" (padrão)
   ======================================================================= */

import { normalizarLinkPicPay, idDoLinkPicPay, validarTokenPicPay, ehUuid } from "../pagamentos.js";

export const nome = "picpay";
export const rotulo = "PicPay";
/** O que este provedor cobra: Pix (pelo QR) e cartão (pela página do link). Boleto, não. */
export const meios = () => ({ pix: true, cartao: true, boleto: false });

/* Os HOSTS, como a documentação os escreve: produção em ecommerce-api.svc
   (o token e a API no mesmo host, a API sob /v1); o Sandbox noutro host,
   com a API sob /sandbox/v1. PICPAY_API_BASE existe só para os testes locais
   apontarem a um servidor falso (o token em /oauth2/token e a API em /v1). */
/* Em produção são DOIS hosts candidatos, na ordem: o da documentação e o
   gateway `api.picpay.com`, que serve as mesmas rotas (set/2026: o primeiro
   passou a responder toda rota /v1 com a página de bloqueio do Cloudflare
   para chamadas de fora do Brasil; o gateway respondeu em JSON). Bloqueado
   um, o adaptador passa ao seguinte sozinho e fica nele. */
const AMBIENTES = {
  producao: [
    { token: "https://ecommerce-api.svc.picpay.com/oauth2/token", api: "https://ecommerce-api.svc.picpay.com/v1" },
    { token: "https://api.picpay.com/oauth2/token", api: "https://api.picpay.com/v1" },
  ],
  staging: [{ token: "https://api.ms.qa.limbo.work/oauth2/token", api: "https://api.ms.qa.limbo.work/sandbox/v1" }],
};
const env = (k) => (process.env[k] || "").trim();
let HOST_IDX = 0;   // qual candidato está em uso (muda só quando o anterior bloqueia)

export function configurado() {
  return !!(env("PICPAY_CLIENT_ID") && env("PICPAY_CLIENT_SECRET"));
}
export function modo() {
  if (!configurado()) return "desligado";
  return /^(staging|teste|sandbox)$/i.test(env("PICPAY_AMBIENTE")) ? "teste" : "producao";
}
/* Os candidatos do ambiente em uso. PICPAY_API_BASE (teste local) aceita
   mais de uma base separada por vírgula, para o teste reproduzir a troca. */
function candidatos() {
  const bases = env("PICPAY_API_BASE").split(",").map((b) => b.trim().replace(/\/$/, "")).filter(Boolean);
  if (bases.length) return bases.map((b) => ({ token: `${b}/oauth2/token`, api: `${b}/v1` }));
  return modo() === "teste" ? AMBIENTES.staging : AMBIENTES.producao;
}
function hosts() {
  const c = candidatos();
  return c[Math.min(HOST_IDX, c.length - 1)];
}
/* Bloqueado o host em uso, passa ao seguinte (se houver) e zera o token —
   o token se pede ao MESMO host da API. Devolve se houve troca. */
function trocarDeHost(motivo) {
  const c = candidatos();
  if (HOST_IDX >= c.length - 1) return false;
  const de = new URL(c[HOST_IDX].api).host;
  HOST_IDX += 1;
  TOKEN = { valor: "", ate: 0, pedido: null };
  console.warn(`[pagamentos] PicPay: ${de} bloqueou (${String(motivo || "").slice(0, 80)}); passando a ${new URL(c[HOST_IDX].api).host}`);
  return true;
}
const rotuloAmbiente = () => (env("PICPAY_API_BASE") ? "teste local" : modo() === "teste" ? "Sandbox" : "produção");
export const segredoWebhook = () => env("PICPAY_WEBHOOK_TOKEN");

/**
 * Testa a credencial AGORA (pede um token novo, ignorando o guardado) e
 * devolve o resultado para a tela da gestão — nunca a chave. É o que
 * separa "credencial errada" de "Pix desligado" sem ninguém precisar
 * inscrever alguém para ver a cobrança falhar.
 */
export async function testar() {
  const saida = { provedor: nome, ambiente: rotuloAmbiente(), host: new URL(hosts().token).host, configurado: configurado(),
    ok: false, credencial: false, api: false, bloqueio: false, erro: "" };
  if (!saida.configurado) { saida.erro = "PICPAY_CLIENT_ID/PICPAY_CLIENT_SECRET ausentes no ambiente do servidor."; return saida; }
  TOKEN = { valor: "", ate: 0, pedido: null };
  try { await token(); saida.credencial = true; }
  catch (e) { saida.erro = String(e?.message || e).slice(0, 300); registrarErro(e, "teste da credencial"); return saida; }
  // A credencial valer não basta: em produção o firewall do PicPay pode
  // bloquear as rotas da API (foi o caso, set/2026). Consulta um link que não
  // existe — a resposta certa é um 404 em JSON; página HTML é bloqueio.
  const hostAntes = saida.host;
  try {
    await chamar("/paymentlink/00000000-0000-0000-0000-000000000000/transactions");
    saida.api = true;
  } catch (e) {
    if (e?.status === 404 && !e.bloqueio) saida.api = true;
    else { saida.bloqueio = !!e.bloqueio; saida.erro = String(e?.message || e).slice(0, 300); }
  }
  // a chamada pode ter trocado de host no meio: o retrato diz qual ficou valendo
  saida.host = new URL(hosts().api).host;
  if (saida.host !== hostAntes) saida.trocouDe = hostAntes;
  if (!saida.api) return saida;
  // A API responder também não basta (set/2026: token e consulta passavam, e a
  // CRIAÇÃO voltava B005/B028 — a conta não estava habilitada no serviço). O
  // teste cria dois links de R$ 0,01, um Pix e um de cartão, que vencem amanhã
  // e ninguém paga: é o único jeito de o "✓" do painel valer para a inscrição.
  const teste = (metodos, arranjos, comParcelas) => ({
    charge: { name: "Teste de credencial — ARCHÉ", order_number: "teste-arche", payment: { methods: metodos, ...(arranjos ? { brcode_arrangements: arranjos } : {}) }, amounts: { product: 1 } },
    options: { allow_create_pix_key: true, ...(comParcelas ? { card_max_installment_number: 1 } : {}), expired_at: dataDeExpiracao(new Date().toISOString()) },
  });
  saida.pix = { ok: false, erro: "" }; saida.cartao = { ok: false, erro: "" };
  try { const j = await chamar("/paymentlink/create", { method: "POST", body: teste(["BRCODE"], ["PIX", "PICPAY"], false) }); saida.pix.ok = !!(j?.brcode || j?.link); }
  catch (e) { saida.pix.erro = String(e?.message || e).slice(0, 300); }
  try { const j = await chamar("/paymentlink/create", { method: "POST", body: teste(["CREDIT_CARD"], null, true) }); saida.cartao.ok = !!(j?.link || j?.deeplink); }
  catch (e) { saida.cartao.erro = String(e?.message || e).slice(0, 300); }
  saida.ok = saida.credencial && saida.api && (saida.pix.ok || saida.cartao.ok);
  if (!saida.ok) saida.erro = saida.pix.erro || saida.cartao.erro;
  return saida;
}
export const validarWebhook = (authorization) => validarTokenPicPay(authorization, segredoWebhook());

/* O token OAuth dura 5 minutos; guarda-se em memória e renova-se 30 s
   antes de vencer. Duas chamadas simultâneas dividem o mesmo pedido. */
let TOKEN = { valor: "", ate: 0, pedido: null };
async function token() {
  if (TOKEN.valor && Date.now() < TOKEN.ate - 30_000) return TOKEN.valor;
  if (TOKEN.pedido) return TOKEN.pedido;
  TOKEN.pedido = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(hosts().token, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ grant_type: "client_credentials", client_id: env("PICPAY_CLIENT_ID"), client_secret: env("PICPAY_CLIENT_SECRET") }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) {
        // a mensagem DIZ o ambiente: "invalid_client" em produção com a
        // credencial do Sandbox (ou o contrário) é o engano mais comum, e a
        // frase do PicPay é a mesma nos dois hosts
        const e = new Error(`PicPay: autenticação recusada no ambiente de ${rotuloAmbiente()} (${j.error_description || j.message || j.error || `HTTP ${r.status}`})`);
        e.status = r.status; throw e;
      }
      TOKEN = { valor: String(j.access_token), ate: Date.now() + Math.max(60, Number(j.expires_in) || 300) * 1000, pedido: null };
      return TOKEN.valor;
    } finally { clearTimeout(t); TOKEN.pedido = null; }
  })();
  return TOKEN.pedido;
}

/* O ÚLTIMO ERRO da API fica em memória e sai no retrato do provedor (guia
   Cobrança): em produção ninguém lê o log do Render, e "não foi possível
   gerar a cobrança" sem o motivo não diz se é credencial, Pix desligado na
   conta ou a integração ainda não liberada. Nunca guarda a chave. */
let ULTIMO_ERRO = null;
export const ultimoErro = () => ULTIMO_ERRO;
function registrarErro(e, onde) {
  ULTIMO_ERRO = { em: new Date().toISOString(), onde, status: e?.status || 0, mensagem: String(e?.message || e).slice(0, 300) };
}

/* O firewall do PicPay (Cloudflare) responde a rota bloqueada com uma PÁGINA
   HTML — "Sorry, you have been blocked" — e não com JSON. Foi assim que a
   primeira cobrança de produção falhou (set/2026): o token saía, e toda rota
   sob /v1 voltava bloqueada, do Render e de fora. A mensagem precisa dizer
   isso e trazer o Ray ID, que é o que o suporte do PicPay pede. */
export function mensagemDeBloqueio(texto, status) {
  const t = String(texto || "");
  if (!/<html|<!doctype/i.test(t)) return "";
  const bloqueado = /you have been blocked|attention required|access denied|error code 10\d\d/i.test(t);
  const ray = (/Ray ID:?\s*(?:<[^>]*>\s*)*([a-f0-9]{12,20})/i.exec(t) || [])[1] || "";
  if (bloqueado || /cloudflare/i.test(t))
    return `o acesso do servidor à API foi BLOQUEADO pelo firewall do PicPay (Cloudflare, HTTP ${status || 403}${ray ? `, Ray ID ${ray}` : ""}) — costuma ser restrição por país ou IP; peça ao suporte do PicPay a liberação dos IPs de saída do servidor`;
  return `a API respondeu uma página HTML (HTTP ${status || "?"}) em vez de JSON`;
}

/* Erro do PIX da conta (não da chamada): o PicPay responde 422 com `type: "pix"`
   — "Seller conta liquidação não é elegível para pix" (B001) — ou "Falha ao criar
   a url dinâmica" (B005), que é o Pix dinâmico da cobrança não nascendo. */
export function ehErroDePix(e) {
  const err = e?.detalhe?.error || e?.detalhe?.errors;
  const tipo = String((Array.isArray(err) ? err[0]?.type : err?.type) || "").toLowerCase();
  const codigo = String((Array.isArray(err) ? err[0]?.code : err?.code) || "").toUpperCase();
  return tipo === "pix" || codigo === "B001" || codigo === "B005" || /url din[aâ]mica|eleg[ií]vel para pix/i.test(String(e?.message || ""));
}
const DICA_PIX = "o Pix da conta PicPay não está ativo ou sem chave Pix cadastrada — confira em PicPay Empresas → Gerenciar recebimentos";
/* "Cadastro do seller não encontrado" (B028): a credencial autentica, mas a
   conta ainda não está habilitada no serviço de Link de Pagamento — é ativação
   do lado do PicPay, não configuração nossa. */
export function ehErroDeCadastro(e) {
  const err = e?.detalhe?.error || e?.detalhe?.errors;
  const codigo = String((Array.isArray(err) ? err[0]?.code : err?.code) || "").toUpperCase();
  return codigo === "B028" || /cadastro do seller n[aã]o encontrado/i.test(String(e?.message || ""));
}
const DICA_CADASTRO = "a conta ainda não está habilitada no serviço Link de Pagamento - API do PicPay (a credencial vale, o cadastro do vendedor não existe lá) — peça ao suporte do PicPay a ativação da integração em produção";

/* Uma chamada à API. Bloqueada pelo firewall do host em uso, troca de host
   UMA vez e repete — é a saída para o bloqueio de set/2026 sem ninguém
   mexer no Render. Esgotados os hosts, o erro sai como está (com o Ray ID). */
async function chamar(caminho, opts = {}) {
  try { return await chamarEm(caminho, opts); }
  catch (e) {
    if (e?.bloqueio && trocarDeHost(e.message)) return chamarEm(caminho, opts);
    throw e;
  }
}

async function chamarEm(caminho, { method = "GET", body } = {}) {
  if (!configurado()) throw new Error("PicPay não configurado (PICPAY_CLIENT_ID/PICPAY_CLIENT_SECRET ausentes).");
  let tok;
  try { tok = await token(); } catch (e) { registrarErro(e, "autenticação"); throw e; }
  const headers = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Accept: "application/json" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(hosts().api + caminho, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = { raw: texto }; }
    if (!r.ok) {
      const err = j?.error || j?.errors;
      const bloqueio = j?.raw ? mensagemDeBloqueio(j.raw, r.status) : "";
      const msg = bloqueio || (Array.isArray(err) ? err.map((x) => x?.message || JSON.stringify(x)).join("; ") : err?.message)
        || j?.message || j?.error_description || (j?.raw ? String(j.raw).slice(0, 160) : "") || `HTTP ${r.status}`;
      const e = new Error(`PicPay: ${msg}${err?.code ? ` (${err.code})` : ""}`); e.status = r.status; e.detalhe = j; e.bloqueio = !!bloqueio;
      if (ehErroDeCadastro(e)) e.message += ` — ${DICA_CADASTRO}`;
      else if (ehErroDePix(e)) e.message += ` — ${DICA_PIX}`;
      if (r.status !== 404) registrarErro(e, `${method} ${caminho}`);
      throw e;
    }
    return j;
  } catch (e) {
    if (!e.status) registrarErro(e, `${method} ${caminho}`);   // rede, timeout
    throw e;
  } finally { clearTimeout(t); }
}

/* `expired_at` é só a DATA (AAAA-MM-DD): o link vence no dia SEGUINTE ao
   fim da reserva, em Brasília, para não fechar antes dela — quem manda no
   prazo é a reserva do ARCHÉ (pagamento depois dela vale, marcado). */
function dataDeExpiracao(expiraEm) {
  const d = new Date(new Date(expiraEm || Date.now()).getTime() - 3 * 60 * 60_000 + 24 * 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Cria o link de pagamento de UMA inscrição. `valor` em centavos; `token` é
 * o da inscrição (os 15 primeiros vão em `order_number`, que a consulta do
 * link devolve); `voltar.sucesso` é para onde a página do PicPay devolve a
 * pessoa. Devolve { id, link, qrCode } — o QR só quando o evento aceita Pix.
 */
export async function criarCobranca({ titulo, descricao, valor, valorCartao, token: tokenInscricao, expiraEm, voltar, meios: m, parcelas }) {
  const pix = m?.pix !== false, cartao = m?.cartao === true;
  // COM ACRÉSCIMO no cartão são DOIS links: o do Pix, no valor da categoria
  // (só arranjo PIX — pela carteira PicPay dá para pagar com cartão, e isso
  // passaria ao largo do acréscimo), e o do cartão, no valor acrescido
  const comAcrescimo = cartao && Math.round(valorCartao || 0) > Math.round(valor);
  const base = (metodos, arranjos, valorC, comParcelas) => ({
    charge: {
      name: String(titulo || "Inscrição").slice(0, 100),
      description: String(descricao || "").slice(0, 200) || undefined,
      order_number: String(tokenInscricao || "").slice(0, 15) || undefined,
      redirect_url: voltar?.sucesso ? String(voltar.sucesso).slice(0, 1000) : undefined,
      payment: { methods: metodos, ...(arranjos ? { brcode_arrangements: arranjos } : {}) },
      amounts: { product: Math.max(1, Math.round(valorC)) },
    },
    options: {
      allow_create_pix_key: true,
      ...(comParcelas ? { card_max_installment_number: Math.max(1, Math.min(12, Number(parcelas) || 1)) } : {}),
      expired_at: dataDeExpiracao(expiraEm),
    },
  });
  const principal = comAcrescimo
    ? base(["BRCODE"], pix ? ["PIX"] : ["PICPAY"], valor, false)
    : base(["BRCODE", ...(cartao ? ["CREDIT_CARD"] : [])], pix ? ["PIX", "PICPAY"] : ["PICPAY"], valor, cartao);
  let j;
  try { j = await chamar("/paymentlink/create", { method: "POST", body: principal }); }
  catch (e) {
    // O PIX DA CONTA FALHOU ("Falha ao criar a url dinâmica", B005 — set/2026: a
    // conta PJ sem o Pix ativo/chave). Aceitando cartão, a cobrança sai SÓ com
    // o link da página do PicPay (sem QR), para o evento não parar; só Pix, o
    // erro sobe com a orientação. O motivo fica no "Último erro" da gestão.
    if (!ehErroDePix(e) || !cartao) throw e;
    console.warn("[pagamentos] PicPay: Pix da conta falhou; cobrança só pelo cartão:", e.message);
    const jc = await chamar("/paymentlink/create", { method: "POST", body: base(["CREDIT_CARD"], null, comAcrescimo ? valorCartao : valor, true) });
    const linkC = String(jc?.link || jc?.deeplink || "");
    if (!linkC) throw e;
    return { id: idDoLinkPicPay(jc), link: linkC, qrCode: "", deeplink: String(jc?.deeplink || ""), pixIndisponivel: String(e.message || "").slice(0, 300),
      cartao: comAcrescimo ? { id: idDoLinkPicPay(jc), link: linkC, valor: Math.round(valorCartao) } : null };
  }
  const link = String(j?.link || j?.deeplink || "");
  const qrCode = pix ? String(j?.brcode || "") : "";
  if (!link && !qrCode) throw new Error("PicPay: o link de pagamento veio sem endereço e sem QR Code.");
  const saida = { id: idDoLinkPicPay(j), link, qrCode, deeplink: String(j?.deeplink || ""), cartao: null };
  if (comAcrescimo) {
    // o segundo link não derruba o primeiro: sem ele a pessoa ainda paga no Pix
    try {
      const jc = await chamar("/paymentlink/create", { method: "POST", body: base(["CREDIT_CARD"], null, valorCartao, true) });
      const linkC = String(jc?.link || jc?.deeplink || "");
      if (linkC) saida.cartao = { id: idDoLinkPicPay(jc), link: linkC, valor: Math.round(valorCartao) };
    } catch (e) { console.error("[pagamentos] PicPay: link do cartão não criado:", e.message); }
  }
  return saida;
}

/** As transações de UM link, normalizadas (uma por pagamento/estorno). */
async function transacoesDoLink(idLink) {
  const id = String(idLink || "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return [];
  const j = await chamar(`/paymentlink/${encodeURIComponent(id)}/transactions?perPage=50`);
  // o id que a inscrição conhece é o que a acha; o `originId` da resposta
  // pode ser o uuid interno, e vai junto só como informação
  const cob = { paymentLinkId: id, uuid: j?.originId || "" };
  return (Array.isArray(j?.transactions) ? j.transactions : []).map((t) => normalizarLinkPicPay(t, cob)).filter((n) => n?.estado);
}

/** A transação decisiva de um link (paga vence; senão a mais recente). */
export async function consultarPagamento(idLink) {
  const lista = await transacoesDoLink(idLink);
  return lista.find((t) => t.estado === "pago") || lista.find((t) => t.estado === "estornado") || lista[0] || null;
}

/**
 * Os pagamentos de uma inscrição: o PicPay não busca por referência nossa,
 * então consulta-se o link VIGENTE da inscrição (e os anteriores, se a
 * reserva foi renovada). Link que o PicPay não conhece (404) não é erro.
 */
export async function pagamentosDaReferencia(externalRef, pagamento) {
  const ids = [...new Set([pagamento?.preferenciaId, pagamento?.preferenciaCartaoId,
    ...(pagamento?.cobrancasAnteriores || []), ...(pagamento?.cobrancasAnterioresCartao || [])]
    .map((x) => String(x || "")).filter((x) => /^[A-Za-z0-9_-]{6,80}$/.test(x)))];
  const lista = [];
  for (const id of ids) {
    try { lista.push(...await transacoesDoLink(id)); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  return lista;
}

/** Estorno total (ou parcial, em centavos) de uma TRANSAÇÃO paga. */
export async function estornar(pagamento, { valorCentavos } = {}) {
  const id = String(pagamento?.pagamentoId || "");
  if (!ehUuid(id) && !/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new Error("id de transação inválido");
  const amount = Math.round(valorCentavos || pagamento?.pagoCentavos || pagamento?.valor || 0);
  if (amount < 1) throw new Error("valor do estorno inválido");
  const j = await chamar(`/paymentlink/transaction/${encodeURIComponent(id)}/refund`, { method: "POST", body: { amount } });
  return { id: String(j?.transactionId || id), amount: j?.amount, originalAmount: j?.originalAmount };
}
