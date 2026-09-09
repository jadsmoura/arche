/* =======================================================================
   ARCHÉ — COBRANÇA DE INSCRIÇÃO EM EVENTO (regras PURAS)

   Pedido do dono (set/2026): "preciso pensar um sistema de cobranças para
   inscrição de um evento pago; que receba as inscrições via Pix com
   confirmação automática" — e, decidido o provedor, "Mercado Pago mesmo,
   vamos lá". Este arquivo é a RÉGUA, sem rede e sem estado: o que um
   evento cobra (categorias, lotes, isenções, parcelas, prazo de reserva), o
   que uma inscrição deve, os ESTADOS do pagamento e as transições que o
   servidor aceita, e a leitura do que o provedor devolve. Quem fala com o
   Mercado Pago é lib/pagamentos/mercadopago.js; quem grava é o server.

   Três decisões que a régua carrega:
   - O PREÇO É SEMPRE DO SERVIDOR. O navegador manda a categoria escolhida;
     o valor sai daqui, do evento como está gravado. Valor pago diferente do
     devido NÃO confirma a inscrição — vai à coordenação decidir.
   - A CREDENCIAL SÓ EXISTE PAGA (ou isenta). Aguardando pagamento a
     inscrição reserva a vaga por um prazo; vencido o prazo, a vaga volta.
   - NADA AQUI CONFIA NO AVISO DO PROVEDOR. O webhook diz "olhe o pagamento
     tal"; quem confirma é a CONSULTA à API, e a assinatura do aviso é
     conferida antes de qualquer coisa (validarAssinaturaMP).
   ======================================================================= */
import crypto from "node:crypto";

/** Os estados do pagamento de uma inscrição. `isento` é decisão da
    coordenação; os demais seguem o provedor. */
export const ESTADOS_PAGAMENTO = ["aguardando", "pago", "expirado", "isento", "estornado", "contestado", "recusado"];

/** Estados em que a inscrição VALE (credencial, check-in, certificado). */
export const ESTADOS_VALIDOS = ["pago", "isento"];

/** Transições que o servidor aceita. Fora daqui é recusa, não gravação. */
const TRANSICOES = {
  aguardando: ["pago", "expirado", "isento", "recusado"],
  recusado: ["pago", "expirado", "isento", "aguardando"],   // recusado no cartão: tenta de novo (ou renova a reserva)
  expirado: ["pago", "isento", "aguardando"],       // pagou depois de expirar (vale se houver vaga), ou renovou a reserva
  pago: ["estornado", "contestado"],
  contestado: ["pago", "estornado"],                // contestação resolvida a favor, ou perdida
  isento: [],
  estornado: [],
};
export const podeTransitar = (de, para) => (TRANSICOES[de] || []).includes(para);

export const LIMITES = {
  categorias: 12, lotes: 6, valorMax: 5000, parcelasMax: 12,
  reservaMinMinutos: 15, reservaMaxMinutos: 7 * 24 * 60, reservaPadraoMinutos: 24 * 60,
  politicaMax: 4000,
};

const txt = (v, n = 120) => String(v ?? "").trim().slice(0, n);
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** Reais → centavos, sem erro de ponto flutuante ("49.90" → 4990). */
export const centavos = (v) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(/[R$]/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};
export const reais = (c) => (Math.round(num(c)) / 100).toFixed(2);
export const fmtReais = (c) => "R$ " + reais(c).replace(".", ",");

const slugCodigo = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/**
 * A configuração de cobrança do evento, como se grava em `evento.cobranca`.
 * `ativa:false` é evento gratuito (o padrão de todo evento que existe).
 * Categoria sem valor > 0 é gratuita de propósito (ex.: "aluno do UNIEGO").
 * Lote: até uma data, um AJUSTE em centavos (negativo = desconto, positivo =
 * acréscimo) sobre o valor da categoria; passado o último lote vale a
 * categoria cheia. Isenções ficam FORA daqui (são por inscrição, decididas
 * pela coordenação).
 */
export function normalizarCobranca(b) {
  const c = b && typeof b === "object" ? b : {};
  const vistos = new Set();
  const categorias = (Array.isArray(c.categorias) ? c.categorias : []).slice(0, LIMITES.categorias)
    .map((x) => {
      const nome = txt(x?.nome, 60);
      if (!nome) return null;
      let codigo = slugCodigo(x?.codigo || nome);
      if (!codigo) return null;
      while (vistos.has(codigo)) codigo += "-2";
      vistos.add(codigo);
      // o valor chega em reais da tela ("49,90") e em CENTAVOS quando é o
      // próprio registro gravado sendo relido (`valor` inteiro + `emCentavos`)
      const bruto = x?.emCentavos === true ? Math.max(0, Math.round(num(x.valor))) : centavos(x?.valor);
      return {
        codigo, nome,
        valor: Math.min(bruto, LIMITES.valorMax * 100),
        emCentavos: true,
        descricao: txt(x?.descricao, 160),
      };
    }).filter(Boolean);
  const lotes = (Array.isArray(c.lotes) ? c.lotes : []).slice(0, LIMITES.lotes)
    .map((l) => ({
      nome: txt(l?.nome, 40) || "Lote",
      ate: /^\d{4}-\d{2}-\d{2}$/.test(String(l?.ate || "")) ? String(l.ate) : "",
      ajuste: l?.emCentavos === true ? Math.round(num(l.ajuste)) : centavosComSinal(l?.ajuste),
      emCentavos: true,
    })).filter((l) => l.ate).sort((a, b) => a.ate.localeCompare(b.ate));
  const parcelas = Math.min(LIMITES.parcelasMax, Math.max(1, Math.round(num(c.parcelas)) || 1));
  const reserva = Math.min(LIMITES.reservaMaxMinutos,
    Math.max(LIMITES.reservaMinMinutos, Math.round(num(c.reservaMinutos)) || LIMITES.reservaPadraoMinutos));
  return {
    ativa: c.ativa === true,
    categorias,
    lotes,
    meios: {
      pix: c.meios?.pix !== false,
      cartao: c.meios?.cartao === true,
      boleto: c.meios?.boleto === true,
    },
    parcelas,
    jurosPorConta: c.jurosPorConta === "evento" ? "evento" : "inscrito",
    reservaMinutos: reserva,
    politicaReembolso: txt(c.politicaReembolso, LIMITES.politicaMax),
    recebedor: txt(c.recebedor, 160),        // nome que sai no recibo ("em nome de…")
  };
}
function centavosComSinal(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const neg = s.startsWith("-");
  const c = centavos(s.replace(/^[-+]/, ""));
  return neg ? -c : c;
}

/** O evento cobra? (config normalizada, com ao menos uma categoria paga) */
export const cobrancaAtiva = (cobranca) => !!cobranca?.ativa && (cobranca.categorias || []).some((c) => c.valor > 0);

/** O lote vigente numa data (YYYY-MM-DD): o primeiro cujo `ate` ainda não passou. */
export function loteVigente(cobranca, hojeISO) {
  const hoje = String(hojeISO || "").slice(0, 10);
  return (cobranca?.lotes || []).find((l) => hoje <= l.ate) || null;
}

/**
 * Quanto ESTA inscrição deve, em centavos, pela categoria escolhida e pela
 * data. Categoria desconhecida → null (a rota recusa). Valor nunca fica
 * negativo: desconto maior que o preço zera, e zero é gratuito.
 */
export function valorDaInscricao(cobranca, { categoria, hojeISO } = {}) {
  if (!cobrancaAtiva(cobranca)) return { valor: 0, categoria: null, lote: null, gratuita: true };
  const cat = (cobranca.categorias || []).find((c) => c.codigo === String(categoria || ""));
  if (!cat) return null;
  const lote = loteVigente(cobranca, hojeISO);
  const valor = Math.max(0, cat.valor + (lote ? lote.ajuste : 0));
  return { valor, categoria: cat, lote, gratuita: valor === 0 };
}

/** O registro de pagamento que nasce com a inscrição paga. */
export function novoPagamento({ valor, categoria, lote, agora = new Date(), reservaMinutos, provedor = "mercadopago" } = {}) {
  const em = new Date(agora);
  const expira = new Date(em.getTime() + (reservaMinutos || LIMITES.reservaPadraoMinutos) * 60_000);
  return {
    status: "aguardando",
    valor: Math.max(0, Math.round(num(valor))),
    categoria: categoria?.codigo || "",
    categoriaNome: categoria?.nome || "",
    lote: lote?.nome || "",
    provedor: String(provedor || "mercadopago"),
    // `link` é a página do provedor (Checkout Pro); `qrCode` é o Pix "copia e
    // cola" quando o provedor devolve o QR para o ARCHÉ desenhar (PicPay)
    preferenciaId: "", pagamentoId: "", link: "", qrCode: "",
    meio: "", taxa: 0, liquido: 0,
    criadoEm: em.toISOString(), expiraEm: expira.toISOString(), pagoEm: "",
    historico: [{ em: em.toISOString(), de: "", para: "aguardando", por: "inscrição" }],
  };
}

/** Inscrição vale? Sem registro de pagamento é evento gratuito → vale. */
export const inscricaoValida = (inscrito) => !inscrito?.pagamento
  || ESTADOS_VALIDOS.includes(inscrito.pagamento.status);

/** A inscrição OCUPA vaga? Sem cobrança, sempre; com cobrança, quando vale
    ou quando ainda está na reserva (aguardando/recusado antes de vencer). */
export function ocupaVaga(inscrito, agora = new Date()) {
  const p = inscrito?.pagamento;
  if (!p) return true;
  if (ESTADOS_VALIDOS.includes(p.status) || p.status === "contestado") return true;
  if (["aguardando", "recusado"].includes(p.status)) return !reservaVencida(p, agora);
  return false;
}

/** Aguardando e já vencida a reserva. */
export const reservaVencida = (pagamento, agora = new Date()) => !!pagamento
  && ["aguardando", "recusado"].includes(pagamento.status)
  && !!pagamento.expiraEm && new Date(pagamento.expiraEm).getTime() <= new Date(agora).getTime();

/**
 * Aplica uma transição, gravando o histórico. Devolve o pagamento novo ou
 * `null` quando a transição não é permitida (o chamador decide o que dizer).
 */
export function transitar(pagamento, para, { por = "sistema", motivo = "", agora = new Date(), extra = {} } = {}) {
  if (!pagamento) return null;
  if (!ESTADOS_PAGAMENTO.includes(para)) return null;
  if (pagamento.status !== para && !podeTransitar(pagamento.status, para)) return null;
  const em = new Date(agora).toISOString();
  const novo = { ...pagamento, ...extra, status: para };
  if (pagamento.status !== para) {
    novo.historico = [...(pagamento.historico || []), { em, de: pagamento.status, para, por, ...(motivo ? { motivo } : {}) }].slice(-30);
    if (para === "pago" && !novo.pagoEm) novo.pagoEm = em;
  }
  return novo;
}

/* -------------------------- leitura do provedor -------------------------- */

/** O que o Mercado Pago chama de status → o nosso estado. `null` = ignorar. */
export function estadoDoProvedor(statusMP) {
  switch (String(statusMP || "").toLowerCase()) {
    case "approved": return "pago";
    case "refunded": return "estornado";
    case "charged_back": return "contestado";
    case "rejected": return "recusado";
    case "cancelled": return "expirado";
    case "pending": case "in_process": case "in_mediation": case "authorized": return "aguardando";
    default: return null;
  }
}

/** O meio, em palavras que a coordenação lê. */
export function meioDoProvedor(p) {
  const tipo = String(p?.payment_type_id || "").toLowerCase();
  const id = String(p?.payment_method_id || "").toLowerCase();
  if (id === "pix" || tipo === "bank_transfer") return "pix";
  if (tipo === "credit_card") return "cartão de crédito";
  if (tipo === "debit_card") return "cartão de débito";
  if (tipo === "ticket") return "boleto";
  if (tipo === "account_money") return "saldo Mercado Pago";
  return tipo || id || "";
}

/**
 * O PAGAMENTO NORMALIZADO — a forma ÚNICA em que qualquer provedor entra na
 * régua (set/2026, ao entrar o PicPay): cada adaptador traduz a resposta da
 * API dele para isto, e o servidor nunca lê campo de provedor. `referencia`
 * é `<ação>:<token>` quando o provedor a devolve (Mercado Pago); `token` é o
 * da inscrição quando ele vem embutido no id da cobrança (PicPay). Um dos
 * dois basta para achar a inscrição.
 */
export const ehNormalizado = (p) => !!p && typeof p === "object" && typeof p.provedor === "string" && "estado" in p;

/** O pagamento do MERCADO PAGO (`GET /v1/payments/:id`) na forma normalizada. */
export function normalizarMP(p) {
  if (!p || typeof p !== "object") return null;
  const pagoCentavos = Math.round(num(p.transaction_amount) * 100);
  const taxa = Math.round((Array.isArray(p.fee_details) ? p.fee_details : [])
    .reduce((s, f) => s + num(f?.amount), 0) * 100);
  const liquido = p.transaction_details?.net_received_amount != null
    ? Math.round(num(p.transaction_details.net_received_amount) * 100)
    : Math.max(0, pagoCentavos - taxa);
  return {
    provedor: "mercadopago",
    id: String(p.id || ""),
    referencia: String(p.external_reference || ""),
    token: "",
    estado: estadoDoProvedor(p.status),
    statusProvedor: String(p.status || ""),
    detalheProvedor: String(p.status_detail || ""),
    meio: meioDoProvedor(p),
    pagoCentavos, taxa, liquido,
    parcelas: Math.max(1, Math.round(num(p.installments)) || 1),
    pagoEm: p.date_approved ? new Date(p.date_approved).toISOString() : "",
  };
}

/* ------------------------------- PicPay -------------------------------- */

/** O que o PicPay chama de status da COBRANÇA → o nosso estado. */
export function estadoPicPay(chargeStatus, transactionStatus) {
  const c = String(chargeStatus || "").toUpperCase(), t = String(transactionStatus || "").toUpperCase();
  if (t === "CHARGEBACK") return "contestado";
  switch (c) {
    case "PAID": return "pago";
    // estorno PARCIAL não desfaz a inscrição — o que a coordenação devolveu
    // a mais fica registrado no valor; só o estorno total a cancela
    case "PARTIAL": return "pago";
    case "REFUNDED": return "estornado";
    case "CANCELED": return "expirado";
    case "DENIED": case "ERROR": return "recusado";
    case "PRE_AUTHORIZED": return t === "EXPIRED" ? "expirado" : t === "PAID" ? "pago" : "aguardando";
    default: return null;
  }
}

/* O id da cobrança no PicPay É o token da inscrição mais um sufixo da hora
   da reserva (renovar a reserva gera cobrança nova): "<22 hex>-<10 dígitos>",
   33 caracteres, dentro do que a API aceita (6–36, [A-Za-z0-9-]). É assim
   que o aviso do webhook volta à inscrição sem tabela à parte. */
export function idCobrancaPicPay(token, criadoEm) {
  const t = String(token || "").toLowerCase();
  const suf = String(criadoEm || "").replace(/\D/g, "").slice(4, 14) || String(Date.now()).slice(-10);
  return `${t}-${suf}`;
}
export const tokenDoIdPicPay = (id) => {
  const m = /^([0-9a-f]{22})-\d+$/.exec(String(id || "").toLowerCase());
  return m ? m[1] : "";
};

/** A cobrança do PICPAY (`GET /charge/:merchantChargeId`) na forma normalizada. */
export function normalizarPicPay(c) {
  if (!c || typeof c !== "object") return null;
  const txs = Array.isArray(c.transactions) ? c.transactions : [];
  const tx = txs.find((t) => String(t?.paymentType || "").toUpperCase() === "PIX") || txs[0] || {};
  const id = String(c.merchantChargeId || "");
  const estado = estadoPicPay(c.chargeStatus, tx.transactionStatus);
  // depois de um estorno o `amount` vem zerado e o pago está em `originalAmount`
  const pagoCentavos = Math.round(num(c.originalAmount ?? tx.originalAmount ?? c.amount));
  return {
    provedor: "picpay",
    id, referencia: "", token: tokenDoIdPicPay(id),
    estado,
    statusProvedor: String(c.chargeStatus || ""),
    detalheProvedor: [tx.transactionStatus, c.id, tx.pix?.endToEndId].filter(Boolean).join(" · "),
    meio: String(tx.paymentType || "PIX").toUpperCase() === "PIX" ? "pix" : String(tx.paymentType || "").toLowerCase(),
    pagoCentavos, taxa: 0, liquido: pagoCentavos,
    parcelas: 1,
    pagoEm: estado === "pago" && tx.updatedAt ? new Date(tx.updatedAt).toISOString() : "",
    refundedCentavos: Math.round(num(c.refundedAmount)),
    qrCode: String(tx.pix?.qrCode || ""),
  };
}

/**
 * O webhook do PicPay se autentica pelo TOKEN que o painel gerou ao ativar a
 * URL de notificação, enviado no cabeçalho `Authorization` (com ou sem o
 * prefixo "Bearer"). Sem token configurado nada passa.
 */
export function validarTokenPicPay(authorization, tokenConfigurado) {
  const esperado = String(tokenConfigurado || "").trim();
  const dado = String(authorization || "").trim().replace(/^Bearer\s+/i, "");
  if (!esperado || !dado) return false;
  const a = Buffer.from(esperado, "utf8"), b = Buffer.from(dado, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Lê um pagamento consultado na API e diz o que fazer com a inscrição.
 * Aceita a forma NORMALIZADA (qualquer provedor) ou a resposta crua do
 * Mercado Pago, que era o formato de antes. Confere o VALOR: pago menos que
 * o devido não confirma — vira pendência da coordenação (`divergente`). Mais
 * que o devido confirma e registra a diferença, para a coordenação devolver.
 */
export function lerPagamentoDoProvedor(p, pagamento) {
  const n = ehNormalizado(p) ? p : normalizarMP(p);
  if (!n) return { estado: null };
  const devido = Math.round(num(pagamento?.valor));
  const divergente = n.estado === "pago" && n.pagoCentavos < devido;
  return {
    estado: n.estado,
    divergente,
    extra: {
      pagamentoId: n.id,
      provedor: n.provedor,
      meio: n.meio,
      pagoCentavos: n.pagoCentavos, taxa: n.taxa, liquido: n.liquido,
      parcelas: n.parcelas,
      statusProvedor: n.statusProvedor,
      detalheProvedor: n.detalheProvedor,
      pagoEmProvedor: n.pagoEm || "",
    },
  };
}

/**
 * A assinatura do webhook do Mercado Pago (cabeçalho `x-signature`:
 * "ts=…,v1=…"; manifesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * assinado em HMAC-SHA256 com a chave secreta da aplicação). Sem chave
 * configurada devolve false — aviso sem assinatura conferida não move nada.
 * `dataId` alfanumérico vai em minúsculas, como a documentação manda.
 */
export function validarAssinaturaMP({ xSignature, xRequestId, dataId, segredo, agoraMs = Date.now(), toleranciaMs = 10 * 60_000 }) {
  if (!segredo || !xSignature || !dataId) return false;
  const partes = Object.fromEntries(String(xSignature).split(",").map((kv) => {
    const i = kv.indexOf("="); return i < 0 ? [kv.trim(), ""] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
  }));
  const ts = partes.ts, v1 = partes.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;
  const tsMs = Number(ts) * (ts.length <= 10 ? 1000 : 1);
  if (Math.abs(agoraMs - tsMs) > toleranciaMs) return false;
  const id = /^[a-zA-Z0-9]+$/.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifesto = `id:${id};request-id:${xRequestId || ""};ts:${ts};`;
  const esperado = crypto.createHmac("sha256", String(segredo)).update(manifesto).digest("hex");
  const a = Buffer.from(esperado, "utf8"), b = Buffer.from(String(v1), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------ financeiro ------------------------------ */

/** O quadro da guia Financeiro: totais por estado, por meio e por categoria. */
export function resumoFinanceiro(inscritos) {
  const r = { total: 0, porEstado: {}, porMeio: {}, porCategoria: {}, bruto: 0, taxa: 0, liquido: 0, aReceber: 0 };
  for (const i of inscritos || []) {
    const p = i?.pagamento; if (!p) continue;
    r.total++;
    r.porEstado[p.status] = (r.porEstado[p.status] || 0) + 1;
    const cat = p.categoriaNome || p.categoria || "—";
    r.porCategoria[cat] = r.porCategoria[cat] || { n: 0, valor: 0 };
    r.porCategoria[cat].n++;
    if (p.status === "pago") {
      r.bruto += num(p.pagoCentavos || p.valor); r.taxa += num(p.taxa); r.liquido += num(p.liquido || (p.pagoCentavos || p.valor) - (p.taxa || 0));
      r.porCategoria[cat].valor += num(p.pagoCentavos || p.valor);
      const m = p.meio || "—"; r.porMeio[m] = r.porMeio[m] || { n: 0, valor: 0 }; r.porMeio[m].n++; r.porMeio[m].valor += num(p.pagoCentavos || p.valor);
    } else if (["aguardando", "recusado"].includes(p.status)) {
      r.aReceber += num(p.valor);
    }
  }
  return r;
}

/** Linhas da planilha da prestação de contas (sem CPF: é documento que circula). */
export function linhasFinanceiro(inscritos) {
  return (inscritos || []).filter((i) => i?.pagamento).map((i) => {
    const p = i.pagamento;
    return {
      codigo: i.codigo || "", nome: i.nome || "", email: i.email || "",
      categoria: p.categoriaNome || p.categoria || "", lote: p.lote || "",
      estado: p.status, meio: p.meio || "", parcelas: p.parcelas || "",
      valorDevido: reais(p.valor), valorPago: p.pagoCentavos != null ? reais(p.pagoCentavos) : "",
      taxa: p.taxa ? reais(p.taxa) : "", liquido: p.liquido ? reais(p.liquido) : "",
      pagoEm: p.pagoEm || "", provedorId: p.pagamentoId || "",
      isentoPor: p.isentoPor || "", motivoIsencao: p.motivoIsencao || "",
    };
  });
}
