/* =======================================================================
   ARCHÉ — o REGISTRO de provedores de pagamento (set/2026)

   O servidor fala com "o provedor"; QUAL é, decide o ambiente:
     PAGAMENTO_PROVEDOR = picpay | mercadopago
   Sem a variável, vale o que estiver configurado — PicPay primeiro (é a
   conta PJ da instituição), senão o Mercado Pago. Trocar de provedor é
   trocar a variável: a régua de estados, a reserva de vaga, a página de
   pagamento, o Financeiro e o estorno não sabem quem está por baixo.

   Todo adaptador expõe a MESMA interface: nome, rotulo, meios(),
   configurado(), modo(), segredoWebhook(), criarCobranca(), consultarPagamento()
   [normalizado], pagamentosDaReferencia() [normalizados], estornar().
   ======================================================================= */

import * as mercadopago from "./mercadopago.js";
import * as picpay from "./picpay.js";

export const TODOS = { mercadopago, picpay };

export function ativo() {
  const forcado = (process.env.PAGAMENTO_PROVEDOR || "").trim().toLowerCase();
  if (forcado && TODOS[forcado]) return TODOS[forcado];
  if (picpay.configurado()) return picpay;
  return mercadopago;
}

export const nome = () => ativo().nome;
export const rotulo = () => ativo().rotulo;
export const configurado = () => ativo().configurado();
export const modo = () => ativo().modo();
export const segredoWebhook = () => ativo().segredoWebhook();
export const criarCobranca = (args) => ativo().criarCobranca(args);
export const estornar = (pagamento, opts) => ativo().estornar(pagamento, opts);

/** Os meios que o evento configurou RECORTADOS pelo que o provedor cobra. */
export function meiosEfetivos(meiosDoEvento) {
  const p = ativo().meios();
  const m = meiosDoEvento || {};
  return { pix: !!p.pix && m.pix !== false, cartao: !!p.cartao && m.cartao === true, boleto: !!p.boleto && m.boleto === true };
}

/** O retrato do provedor para as telas da gestão — nunca a chave. */
export function retrato() {
  const p = ativo();
  return { nome: p.nome, rotulo: p.rotulo, configurado: p.configurado(), modo: p.modo(), webhook: !!p.segredoWebhook(), meios: p.meios() };
}

/** O adaptador que emitiu um registro de pagamento (para consultar/estornar o que ele criou). */
export const de = (pagamento) => TODOS[String(pagamento?.provedor || "")] || ativo();
