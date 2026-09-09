/* =======================================================================
   ARCHÉ — adaptador do PICPAY (API de Checkout, cobrança Pix por QR Code)

   As mesmas quatro operações do adaptador do Mercado Pago, na mesma
   interface: criar a cobrança, consultar, procurar os pagamentos de uma
   inscrição e estornar. A diferença de desenho: o PicPay devolve o QR Code
   Pix para o PRÓPRIO ARCHÉ desenhar — a pessoa não sai da página de
   pagamento, escaneia ou copia o código e a página confirma sozinha.

   Só PIX, de propósito: o cartão pela API do PicPay é "checkout
   transparente", em que o dado do cartão passaria pelo nosso servidor.

   As credenciais vêm SÓ do ambiente do Render (nunca do código):
     PICPAY_CLIENT_ID / PICPAY_CLIENT_SECRET — Painel Empresas → Integrações
     PICPAY_WEBHOOK_TOKEN — gerado ao ativar a URL de notificação
                            (Configurações → Meu Checkout)
     PICPAY_AMBIENTE      — "staging" (testes) ou "producao" (padrão)
   ======================================================================= */

import { normalizarPicPay, idCobrancaPicPay, validarTokenPicPay } from "../pagamentos.js";

export const nome = "picpay";
export const rotulo = "PicPay";
/** O que este provedor cobra: só Pix. */
export const meios = () => ({ pix: true, cartao: false, boleto: false });

const AMBIENTES = {
  producao: "https://ecommerce-api.svcp.picpay.com",
  staging: "https://ecommerce-api.svcp.ppay.me",
};
const env = (k) => (process.env[k] || "").trim();

export function configurado() {
  return !!(env("PICPAY_CLIENT_ID") && env("PICPAY_CLIENT_SECRET"));
}
export function modo() {
  if (!configurado()) return "desligado";
  return /^(staging|teste|sandbox)$/i.test(env("PICPAY_AMBIENTE")) ? "teste" : "producao";
}
// PICPAY_API_BASE existe só para os testes locais apontarem a um servidor
// falso; em produção fica vazio e vale o ambiente
const base = () => env("PICPAY_API_BASE") || (modo() === "teste" ? AMBIENTES.staging : AMBIENTES.producao);
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
      const r = await fetch(`${base()}/oauth2/token`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ grant_type: "client_credentials", client_id: env("PICPAY_CLIENT_ID"), client_secret: env("PICPAY_CLIENT_SECRET") }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) {
        const e = new Error(`PicPay: autenticação recusada (${j.message || j.error || `HTTP ${r.status}`})`); e.status = r.status; throw e;
      }
      TOKEN = { valor: String(j.access_token), ate: Date.now() + Math.max(60, Number(j.expires_in) || 300) * 1000, pedido: null };
      return TOKEN.valor;
    } finally { clearTimeout(t); TOKEN.pedido = null; }
  })();
  return TOKEN.pedido;
}

async function chamar(caminho, { method = "GET", body } = {}) {
  if (!configurado()) throw new Error("PicPay não configurado (PICPAY_CLIENT_ID/PICPAY_CLIENT_SECRET ausentes).");
  const headers = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(base() + caminho, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = { raw: texto }; }
    if (!r.ok) {
      const detalhe = Array.isArray(j?.errors) ? j.errors.map((x) => x?.message || x?.description || JSON.stringify(x)).join("; ") : "";
      const msg = detalhe || j?.message || j?.error || j?.detail || `HTTP ${r.status}`;
      const e = new Error(`PicPay: ${msg}`); e.status = r.status; e.detalhe = j; throw e;
    }
    return j;
  } finally { clearTimeout(t); }
}

/* O nome do pagador só aceita letras, dígitos, espaço e "&" na API deles;
   o resto vira espaço (o nome que sai no recibo é o do PicPay, não este). */
const nomeAceito = (s) => (String(s || "").replace(/[^\p{L}\d &]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 255)) || "Participante";
/* Telefone brasileiro em DDD + número (a inscrição já exige 10 dígitos). */
function telefone(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) d = (d + "00000000000").slice(0, 11);
  return { countryCode: "55", areaCode: d.slice(0, 2), number: d.slice(2, 11), type: "MOBILE" };
}

/**
 * Cria a cobrança Pix de UMA inscrição. `valor` em centavos; `token` é o da
 * inscrição e `criadoEm` a hora da reserva — juntos formam o id da cobrança
 * (é por ele que o webhook volta à inscrição). Devolve { id, link: "",
 * qrCode } — sem link: o QR se desenha na página de pagamento do ARCHÉ.
 */
export async function criarCobranca({ valor, token: tokenInscricao, criadoEm, pagador, expiraEm, externalRef }) {
  const id = idCobrancaPicPay(tokenInscricao || String(externalRef || "").split(":").pop(), criadoEm);
  // o QR vale até o fim da reserva (mínimo de 5 min, para a pessoa que
  // abriu a página no último minuto ainda conseguir pagar)
  const seg = Math.max(300, Math.floor((new Date(expiraEm || 0).getTime() - Date.now()) / 1000) || 0);
  const cpf = String(pagador?.cpf || "").replace(/\D/g, "");
  const body = {
    paymentSource: "GATEWAY",
    merchantChargeId: id,
    customer: {
      name: nomeAceito(pagador?.nome),
      email: String(pagador?.email || "").trim().toLowerCase(),
      documentType: cpf.length === 11 ? "CPF" : "CNPJ",
      document: cpf,
      phone: telefone(pagador?.telefone),
    },
    transactions: [{ amount: Math.max(1, Math.round(valor)), pix: { expiration: seg } }],
  };
  const j = await chamar("/charge/pix", { method: "POST", body });
  const n = normalizarPicPay(j);
  if (!n?.qrCode) throw new Error("PicPay: a cobrança foi criada sem o QR Code Pix.");
  return { id: n.id || id, link: "", qrCode: n.qrCode };
}

/** Uma cobrança, como o PicPay a vê — já normalizada. */
export async function consultarPagamento(id) {
  if (!/^[A-Za-z0-9-]{6,36}$/.test(String(id))) throw new Error("id de cobrança inválido");
  return normalizarPicPay(await chamar(`/charge/${encodeURIComponent(String(id))}`));
}

/**
 * Os pagamentos de uma inscrição: o PicPay não busca por referência, então
 * consulta-se a cobrança VIGENTE da inscrição (e a anterior, se a reserva
 * foi renovada). Cobrança que o PicPay não conhece (404) não é erro.
 */
export async function pagamentosDaReferencia(externalRef, pagamento) {
  const ids = [...new Set([pagamento?.preferenciaId, pagamento?.pagamentoId, ...(pagamento?.cobrancasAnteriores || [])]
    .map((x) => String(x || "")).filter((x) => /^[A-Za-z0-9-]{6,36}$/.test(x)))];
  const lista = [];
  for (const id of ids) {
    try { const n = await consultarPagamento(id); if (n?.estado) lista.push(n); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  return lista;
}

/** Estorno total (ou parcial, em centavos) de uma cobrança paga. */
export async function estornar(pagamento, { valorCentavos } = {}) {
  const id = String(pagamento?.pagamentoId || pagamento?.preferenciaId || "");
  if (!/^[A-Za-z0-9-]{6,36}$/.test(id)) throw new Error("id de cobrança inválido");
  const amount = Math.round(valorCentavos || pagamento?.pagoCentavos || pagamento?.valor || 0);
  if (amount < 1) throw new Error("valor do estorno inválido");
  const j = await chamar(`/charge/${encodeURIComponent(id)}/refund`, { method: "POST", body: { amount } });
  return { id: String(j?.id || id), ...normalizarPicPay(j) };
}
