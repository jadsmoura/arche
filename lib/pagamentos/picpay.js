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
const AMBIENTES = {
  producao: { token: "https://ecommerce-api.svc.picpay.com/oauth2/token", api: "https://ecommerce-api.svc.picpay.com/v1" },
  staging: { token: "https://api.ms.qa.limbo.work/oauth2/token", api: "https://api.ms.qa.limbo.work/sandbox/v1" },
};
const env = (k) => (process.env[k] || "").trim();

export function configurado() {
  return !!(env("PICPAY_CLIENT_ID") && env("PICPAY_CLIENT_SECRET"));
}
export function modo() {
  if (!configurado()) return "desligado";
  return /^(staging|teste|sandbox)$/i.test(env("PICPAY_AMBIENTE")) ? "teste" : "producao";
}
function hosts() {
  const b = env("PICPAY_API_BASE").replace(/\/$/, "");
  if (b) return { token: `${b}/oauth2/token`, api: `${b}/v1` };
  return modo() === "teste" ? AMBIENTES.staging : AMBIENTES.producao;
}
export const segredoWebhook = () => env("PICPAY_WEBHOOK_TOKEN");
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
        const e = new Error(`PicPay: autenticação recusada (${j.error_description || j.message || j.error || `HTTP ${r.status}`})`); e.status = r.status; throw e;
      }
      TOKEN = { valor: String(j.access_token), ate: Date.now() + Math.max(60, Number(j.expires_in) || 300) * 1000, pedido: null };
      return TOKEN.valor;
    } finally { clearTimeout(t); TOKEN.pedido = null; }
  })();
  return TOKEN.pedido;
}

async function chamar(caminho, { method = "GET", body } = {}) {
  if (!configurado()) throw new Error("PicPay não configurado (PICPAY_CLIENT_ID/PICPAY_CLIENT_SECRET ausentes).");
  const headers = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Accept: "application/json" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(hosts().api + caminho, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = { raw: texto }; }
    if (!r.ok) {
      const err = j?.error || j?.errors;
      const msg = (Array.isArray(err) ? err.map((x) => x?.message || JSON.stringify(x)).join("; ") : err?.message)
        || j?.message || j?.error_description || `HTTP ${r.status}`;
      const e = new Error(`PicPay: ${msg}${err?.code ? ` (${err.code})` : ""}`); e.status = r.status; e.detalhe = j; throw e;
    }
    return j;
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
export async function criarCobranca({ titulo, descricao, valor, token: tokenInscricao, expiraEm, voltar, meios: m, parcelas }) {
  const pix = m?.pix !== false, cartao = m?.cartao === true;
  const body = {
    charge: {
      name: String(titulo || "Inscrição").slice(0, 100),
      description: String(descricao || "").slice(0, 200) || undefined,
      order_number: String(tokenInscricao || "").slice(0, 15) || undefined,
      redirect_url: voltar?.sucesso ? String(voltar.sucesso).slice(0, 1000) : undefined,
      payment: {
        methods: ["BRCODE", ...(cartao ? ["CREDIT_CARD"] : [])],
        brcode_arrangements: pix ? ["PIX", "PICPAY"] : ["PICPAY"],
      },
      amounts: { product: Math.max(1, Math.round(valor)) },
    },
    options: {
      allow_create_pix_key: true,
      ...(cartao ? { card_max_installment_number: Math.max(1, Math.min(12, Number(parcelas) || 1)) } : {}),
      expired_at: dataDeExpiracao(expiraEm),
    },
  };
  const j = await chamar("/paymentlink/create", { method: "POST", body });
  const link = String(j?.link || j?.deeplink || "");
  const qrCode = pix ? String(j?.brcode || "") : "";
  if (!link && !qrCode) throw new Error("PicPay: o link de pagamento veio sem endereço e sem QR Code.");
  return { id: idDoLinkPicPay(j), link, qrCode, deeplink: String(j?.deeplink || "") };
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
  const ids = [...new Set([pagamento?.preferenciaId, ...(pagamento?.cobrancasAnteriores || [])]
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
