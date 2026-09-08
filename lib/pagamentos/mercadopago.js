/* =======================================================================
   ARCHÉ — adaptador do MERCADO PAGO (Checkout Pro)

   Quatro operações, e só: criar a cobrança (uma "preferência" de Checkout
   Pro, que devolve o link para a página de pagamento deles), consultar um
   pagamento, procurar pagamentos por referência (conciliação) e estornar.
   Nenhum dado de cartão passa pelo ARCHÉ — a página é do Mercado Pago.

   As credenciais vêm SÓ do ambiente do Render (nunca do código):
     MP_ACCESS_TOKEN     — o Access Token (de teste ou de produção)
     MP_WEBHOOK_SECRET   — a assinatura secreta do webhook (painel → Webhooks)
   Sem MP_ACCESS_TOKEN o adaptador se declara desligado e as rotas dizem
   isso à tela; nada quebra nos eventos gratuitos.

   Um segundo provedor é outro arquivo nesta pasta com a mesma interface.
   ======================================================================= */

const API = "https://api.mercadopago.com";

export function configurado() {
  return !!(process.env.MP_ACCESS_TOKEN || "").trim();
}
export function modo() {
  const t = (process.env.MP_ACCESS_TOKEN || "").trim();
  if (!t) return "desligado";
  return /^TEST-/i.test(t) ? "teste" : "producao";
}
export const segredoWebhook = () => (process.env.MP_WEBHOOK_SECRET || "").trim();

async function chamar(caminho, { method = "GET", body, idempotencia } = {}) {
  const token = (process.env.MP_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Mercado Pago não configurado (MP_ACCESS_TOKEN ausente).");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (idempotencia) headers["X-Idempotency-Key"] = idempotencia;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(API + caminho, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = { raw: texto }; }
    if (!r.ok) {
      const msg = j?.message || j?.error || `HTTP ${r.status}`;
      const e = new Error(`Mercado Pago: ${msg}`); e.status = r.status; e.detalhe = j; throw e;
    }
    return j;
  } finally { clearTimeout(t); }
}

/**
 * Cria a cobrança de UMA inscrição. `valor` em centavos; `externalRef` é o
 * identificador da inscrição (é por ele que o pagamento volta a ela);
 * `expiraEm` ISO; `voltar` são as três URLs de retorno; `webhook` a URL do
 * aviso. Devolve { id, link } — o link é o `init_point` (em teste, o
 * `sandbox_init_point` abre com o usuário de teste comprador).
 */
export async function criarCobranca({
  titulo, descricao, valor, externalRef, pagador, expiraEm, voltar, webhook, parcelas, meios, jurosPorConta, referenciaExtrato,
  chave,
}) {
  const excluidos = [];
  if (!meios?.cartao) { excluidos.push({ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }); }
  if (!meios?.boleto) excluidos.push({ id: "ticket" }, { id: "atm" });
  if (!meios?.pix) excluidos.push({ id: "bank_transfer" });
  const body = {
    items: [{
      id: String(externalRef), title: String(titulo || "Inscrição").slice(0, 120),
      description: String(descricao || "").slice(0, 200) || undefined,
      quantity: 1, currency_id: "BRL", unit_price: Math.round(valor) / 100,
    }],
    payer: {
      email: pagador?.email || undefined,
      name: pagador?.nome || undefined,
      identification: pagador?.cpf ? { type: "CPF", number: String(pagador.cpf).replace(/\D/g, "") } : undefined,
    },
    external_reference: String(externalRef),
    back_urls: voltar ? { success: voltar.sucesso, pending: voltar.pendente, failure: voltar.falha } : undefined,
    auto_return: voltar ? "approved" : undefined,
    notification_url: webhook || undefined,
    expires: !!expiraEm,
    expiration_date_to: expiraEm ? isoComFuso(expiraEm) : undefined,
    payment_methods: {
      excluded_payment_types: excluidos,
      installments: Math.max(1, Math.min(12, Number(parcelas) || 1)),
      default_installments: 1,
    },
    statement_descriptor: String(referenciaExtrato || "ARCHE EVENTO").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 16) || "ARCHE",
    metadata: { arche: "inscricao-evento", ref: String(externalRef), juros_por_conta: jurosPorConta || "inscrito" },
    binary_mode: false,
  };
  // a chave de idempotência muda a cada RENOVAÇÃO da reserva (quem paga
  // depois de expirar precisa de uma preferência nova, com prazo novo)
  const j = await chamar("/checkout/preferences", { method: "POST", body, idempotencia: chave || `pref-${externalRef}` });
  return {
    id: String(j.id || ""),
    link: modo() === "teste" ? (j.sandbox_init_point || j.init_point) : (j.init_point || j.sandbox_init_point),
  };
}

/** Um pagamento, como o Mercado Pago o vê. */
export async function consultarPagamento(id) {
  if (!/^\d+$/.test(String(id))) throw new Error("id de pagamento inválido");
  return chamar(`/v1/payments/${id}`);
}

/** Todos os pagamentos ligados a uma inscrição (conciliação quando o webhook se perde). */
export async function pagamentosDaReferencia(externalRef) {
  const q = new URLSearchParams({ external_reference: String(externalRef), sort: "date_created", criteria: "desc" });
  const j = await chamar(`/v1/payments/search?${q}`);
  return Array.isArray(j?.results) ? j.results : [];
}

/** Estorno total (ou parcial, em centavos). Idempotente por inscrição+tentativa. */
export async function estornar(pagamentoId, { valorCentavos, chave } = {}) {
  if (!/^\d+$/.test(String(pagamentoId))) throw new Error("id de pagamento inválido");
  const body = valorCentavos ? { amount: Math.round(valorCentavos) / 100 } : undefined;
  return chamar(`/v1/payments/${pagamentoId}/refunds`, { method: "POST", body, idempotencia: chave || `ref-${pagamentoId}-${Date.now()}` });
}

/* O Mercado Pago quer a data com o deslocamento de fuso escrito
   ("2026-09-10T18:00:00.000-03:00"); o ISO em Z ele recusa em alguns
   campos. Escreve-se em Brasília, que é o relógio do evento. */
export function isoComFuso(iso, offset = "-03:00") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const local = new Date(d.getTime() - 3 * 60 * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}.000${offset}`;
}
