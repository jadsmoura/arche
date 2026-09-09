/* Cobrança de inscrição em evento — a régua pura (lib/pagamentos.js). */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  normalizarCobranca, cobrancaAtiva, valorDaInscricao, loteVigente, novoPagamento, transitar,
  podeTransitar, inscricaoValida, reservaVencida, estadoDoProvedor, meioDoProvedor,
  lerPagamentoDoProvedor, validarAssinaturaMP, resumoFinanceiro, linhasFinanceiro, centavos, fmtReais, ocupaVaga,
  normalizarMP, normalizarLinkPicPay, estadoLinkPicPay, idDoLinkPicPay, transacaoDecisiva, dataPicPayISO, validarTokenPicPay, ehNormalizado,
} from "../lib/pagamentos.js";
import { isoComFuso, configurado, modo } from "../lib/pagamentos/mercadopago.js";
import * as provedor from "../lib/pagamentos/provedor.js";

const COB = normalizarCobranca({
  ativa: true,
  categorias: [
    { nome: "Estudante UNIEGO", valor: "0" },
    { nome: "Estudante externo", valor: "49,90" },
    { nome: "Profissional", valor: "R$ 120,00", descricao: "Egressos e comunidade" },
  ],
  lotes: [{ nome: "1º lote", ate: "2026-10-01", ajuste: "-20,00" }, { nome: "2º lote", ate: "2026-10-15", ajuste: "-10" }],
  meios: { pix: true, cartao: true }, parcelas: 3, reservaMinutos: 60, politicaReembolso: "Até 7 dias.",
});

test("centavos lê os formatos brasileiros e não erra por ponto flutuante", () => {
  assert.equal(centavos("49,90"), 4990);
  assert.equal(centavos("R$ 1.200,50"), 120050);
  assert.equal(centavos("120"), 12000);
  assert.equal(centavos("0.1"), 10);
  assert.equal(centavos("abc"), 0);
  assert.equal(fmtReais(4990), "R$ 49,90");
});

test("a configuração normaliza categorias (código estável), lotes ordenados e limites", () => {
  assert.equal(COB.ativa, true);
  assert.deepEqual(COB.categorias.map((c) => c.codigo), ["estudante-uniego", "estudante-externo", "profissional"]);
  assert.equal(COB.categorias[2].valor, 12000);
  assert.equal(COB.lotes[0].ajuste, -2000);
  assert.equal(COB.parcelas, 3);
  assert.equal(COB.reservaMinutos, 60);
  assert.equal(COB.meios.boleto, false);
  // teto e piso da reserva
  assert.equal(normalizarCobranca({ reservaMinutos: 1 }).reservaMinutos, 15);
  assert.equal(normalizarCobranca({ parcelas: 99 }).parcelas, 12);
  // evento sem cobrança: o padrão de todo evento que existe
  assert.equal(normalizarCobranca(undefined).ativa, false);
  assert.equal(cobrancaAtiva(normalizarCobranca({ ativa: true, categorias: [{ nome: "Grátis", valor: 0 }] })), false,
    "ativa sem categoria paga não cobra ninguém");
});

test("o valor é do SERVIDOR: categoria + lote vigente na data, nunca negativo", () => {
  assert.equal(loteVigente(COB, "2026-09-20").nome, "1º lote");
  assert.equal(loteVigente(COB, "2026-10-01").nome, "1º lote", "o dia do limite ainda é do lote");
  assert.equal(loteVigente(COB, "2026-10-10").nome, "2º lote");
  assert.equal(loteVigente(COB, "2026-11-01"), null);
  assert.equal(valorDaInscricao(COB, { categoria: "profissional", hojeISO: "2026-09-20" }).valor, 10000);
  assert.equal(valorDaInscricao(COB, { categoria: "profissional", hojeISO: "2026-11-01" }).valor, 12000);
  assert.equal(valorDaInscricao(COB, { categoria: "estudante-externo", hojeISO: "2026-09-20" }).valor, 2990);
  const gratis = valorDaInscricao(COB, { categoria: "estudante-uniego", hojeISO: "2026-09-20" });
  assert.equal(gratis.valor, 0); assert.equal(gratis.gratuita, true, "desconto não deixa valor negativo");
  assert.equal(valorDaInscricao(COB, { categoria: "inventada" }), null, "categoria desconhecida é recusa");
  assert.equal(valorDaInscricao(normalizarCobranca({}), { categoria: "x" }).gratuita, true, "evento gratuito ignora a categoria");
});

test("o pagamento nasce aguardando, com reserva, e só transita pelo que a régua permite", () => {
  const agora = new Date("2026-09-10T12:00:00Z");
  const p = novoPagamento({ valor: 10000, categoria: COB.categorias[2], lote: COB.lotes[0], agora, reservaMinutos: 60 });
  assert.equal(p.status, "aguardando");
  assert.equal(p.expiraEm, "2026-09-10T13:00:00.000Z");
  assert.equal(reservaVencida(p, new Date("2026-09-10T12:59:00Z")), false);
  assert.equal(reservaVencida(p, new Date("2026-09-10T13:00:00Z")), true);
  assert.equal(inscricaoValida({ pagamento: p }), false, "aguardando não vale");
  assert.equal(inscricaoValida({}), true, "sem pagamento = evento gratuito");
  const pago = transitar(p, "pago", { por: "webhook", agora, extra: { meio: "pix" } });
  assert.equal(pago.status, "pago"); assert.equal(pago.pagoEm, agora.toISOString()); assert.equal(pago.meio, "pix");
  assert.equal(pago.historico.length, 2);
  assert.equal(inscricaoValida({ pagamento: pago }), true);
  assert.equal(transitar(pago, "aguardando"), null, "pago não volta a aguardando");
  assert.equal(transitar(pago, "expirado"), null, "pago não expira");
  assert.equal(transitar(pago, "estornado", { por: "gestor" }).status, "estornado");
  assert.equal(podeTransitar("expirado", "pago"), true, "quem paga depois de expirar entra, se houver vaga");
  assert.equal(podeTransitar("isento", "pago"), false);
  assert.equal(transitar(p, "inventado"), null);
  // repetir o mesmo estado não duplica histórico (webhook em dobro)
  assert.equal(transitar(pago, "pago").historico.length, 2);
});

test("a leitura do provedor traduz status e meio, e confere o VALOR", () => {
  assert.equal(estadoDoProvedor("approved"), "pago");
  assert.equal(estadoDoProvedor("refunded"), "estornado");
  assert.equal(estadoDoProvedor("charged_back"), "contestado");
  assert.equal(estadoDoProvedor("rejected"), "recusado");
  assert.equal(estadoDoProvedor("pending"), "aguardando");
  assert.equal(estadoDoProvedor("xyz"), null);
  assert.equal(meioDoProvedor({ payment_type_id: "bank_transfer", payment_method_id: "pix" }), "pix");
  assert.equal(meioDoProvedor({ payment_type_id: "credit_card" }), "cartão de crédito");
  const dev = { valor: 10000 };
  const ok = lerPagamentoDoProvedor({ id: 123, status: "approved", transaction_amount: 100, fee_details: [{ amount: 0.99 }],
    transaction_details: { net_received_amount: 99.01 }, payment_type_id: "bank_transfer", payment_method_id: "pix", date_approved: "2026-09-10T12:00:00.000-03:00" }, dev);
  assert.equal(ok.estado, "pago"); assert.equal(ok.divergente, false);
  assert.equal(ok.extra.taxa, 99); assert.equal(ok.extra.liquido, 9901); assert.equal(ok.extra.pagamentoId, "123");
  const menos = lerPagamentoDoProvedor({ id: 1, status: "approved", transaction_amount: 50 }, dev);
  assert.equal(menos.divergente, true, "pagou menos que o devido: não confirma");
  const mais = lerPagamentoDoProvedor({ id: 1, status: "approved", transaction_amount: 150 }, dev);
  assert.equal(mais.divergente, false); assert.equal(mais.extra.pagoCentavos, 15000);
});

test("PicPay (Link de Pagamento): a transação normaliza para a MESMA régua, e a leitura confere o valor igual", () => {
  assert.equal(estadoLinkPicPay("PAYED"), "pago");
  assert.equal(estadoLinkPicPay("PARTREFUNDED"), "pago", "estorno parcial não desfaz a inscrição");
  assert.equal(estadoLinkPicPay("REFUNDED"), "estornado");
  assert.equal(estadoLinkPicPay("CANCELLED"), "expirado");
  assert.equal(estadoLinkPicPay("DENIED"), "recusado");
  assert.equal(estadoLinkPicPay("PENDING"), "aguardando");
  assert.equal(estadoLinkPicPay("AUTHORIZED"), "aguardando");
  assert.equal(estadoLinkPicPay("xyz"), null);
  // a resposta da criação não traz id: aceita o que vier, senão o trecho final do link
  assert.equal(idDoLinkPicPay({ paymentLinkId: "3c567a2c-f800-351d-9b43-256d45949e89", link: "https://link.picpay.com/p/abc" }), "3c567a2c-f800-351d-9b43-256d45949e89");
  assert.equal(idDoLinkPicPay({ link: "https://link.picpay.com/p/1688060808649dc38881cdc" }), "1688060808649dc38881cdc");
  assert.equal(idDoLinkPicPay({}), "");
  assert.equal(dataPicPayISO("2025-04-15 09:47:19"), "2025-04-15T12:47:19.000Z", "data sem fuso é Brasília");

  const cob = { paymentLinkId: "66a2dc04-6fcc-3a66-b570-ea367d7df281", checkoutLink: "https://link.picpay.com/p/xyz", qrCode: "00020126580014br.gov.bcb.pix" };
  const n = normalizarLinkPicPay({ id: "afd2901c-db02-3fda-bba4-30023baeb2a2", status: "PAYED", amount: 5000, paymentType: "PIX", updatedAt: "2026-09-10 15:10:00" }, cob);
  assert.equal(ehNormalizado(n), true);
  assert.equal(n.provedor, "picpay"); assert.equal(n.id, "afd2901c-db02-3fda-bba4-30023baeb2a2");
  assert.equal(n.cobrancaId, cob.paymentLinkId); assert.equal(n.link, cob.checkoutLink); assert.equal(n.qrCode, cob.qrCode);
  assert.equal(n.estado, "pago"); assert.equal(n.meio, "pix"); assert.equal(n.pagoCentavos, 5000);
  assert.ok(n.pagoEm.startsWith("2026-09-10T18:10"), "hora do pagamento em UTC");
  const leitura = lerPagamentoDoProvedor(n, { valor: 5000 });
  assert.equal(leitura.estado, "pago"); assert.equal(leitura.divergente, false);
  assert.equal(leitura.extra.pagamentoId, n.id); assert.equal(leitura.extra.provedor, "picpay");
  assert.equal(lerPagamentoDoProvedor(n, { valor: 6000 }).divergente, true, "pagou menos: não confirma");
  // entre as transações do link, a paga decide; o estorno é outra transação
  const est = normalizarLinkPicPay({ transactionId: "b1", status: "REFUNDED", amount: 5000 }, cob);
  assert.equal(est.estado, "estornado"); assert.equal(est.meio, "");
  assert.equal(transacaoDecisiva([est, n]).id, n.id, "paga vence");
  assert.equal(transacaoDecisiva([est]).estado, "estornado");
  assert.equal(transacaoDecisiva([]), null);
  assert.equal(normalizarLinkPicPay({ status: "DENIED", amount: 100, paymentType: "CREDIT_CARD" }, {}).meio, "cartão de crédito");
  // a forma crua do Mercado Pago continua entrando pela mesma porta
  const mp = normalizarMP({ id: 9, status: "approved", transaction_amount: 50, external_reference: "acao:tok" });
  assert.equal(mp.referencia, "acao:tok"); assert.equal(mp.estado, "pago"); assert.equal(mp.pagoCentavos, 5000);
  assert.equal(lerPagamentoDoProvedor(mp, { valor: 5000 }).extra.pagamentoId, "9");
});

test("PicPay: o webhook se autentica pelo token do painel, com ou sem 'Bearer' — e sem token nada passa", () => {
  assert.equal(validarTokenPicPay("abc123", "abc123"), true);
  assert.equal(validarTokenPicPay("Bearer abc123", "abc123"), true);
  assert.equal(validarTokenPicPay("abc124", "abc123"), false);
  assert.equal(validarTokenPicPay("", "abc123"), false);
  assert.equal(validarTokenPicPay("abc123", ""), false, "sem token configurado");
});

test("o registro escolhe o provedor pelo ambiente e recorta os meios pelo que ele cobre", () => {
  const antes = { P: process.env.PAGAMENTO_PROVEDOR, ID: process.env.PICPAY_CLIENT_ID, SEC: process.env.PICPAY_CLIENT_SECRET, MP: process.env.MP_ACCESS_TOKEN };
  try {
    delete process.env.PAGAMENTO_PROVEDOR; delete process.env.PICPAY_CLIENT_ID; delete process.env.PICPAY_CLIENT_SECRET;
    assert.equal(provedor.nome(), "mercadopago", "sem nada configurado, o padrão de sempre");
    process.env.PICPAY_CLIENT_ID = "id"; process.env.PICPAY_CLIENT_SECRET = "s";
    assert.equal(provedor.nome(), "picpay", "PicPay configurado vence sem a variável");
    assert.deepEqual(provedor.meiosEfetivos({ pix: true, cartao: true, boleto: true }), { pix: true, cartao: true, boleto: false }, "PicPay: sem boleto");
    process.env.PAGAMENTO_PROVEDOR = "mercadopago";
    assert.equal(provedor.nome(), "mercadopago", "a variável manda");
    assert.deepEqual(provedor.meiosEfetivos({ pix: true, cartao: true }), { pix: true, cartao: true, boleto: false });
    assert.equal(provedor.de({ provedor: "picpay" }).nome, "picpay", "o registro de pagamento sabe quem o emitiu");
    assert.equal(provedor.retrato().rotulo, "Mercado Pago");
  } finally {
    for (const [k, v] of [["PAGAMENTO_PROVEDOR", antes.P], ["PICPAY_CLIENT_ID", antes.ID], ["PICPAY_CLIENT_SECRET", antes.SEC], ["MP_ACCESS_TOKEN", antes.MP]])
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test("a assinatura do webhook confere pelo manifesto documentado — e sem segredo nada passa", () => {
  const segredo = "s3gr3d0";
  const ts = String(Math.floor(Date.now() / 1000));
  const dataId = "12345";
  const reqId = "abc-def";
  const v1 = crypto.createHmac("sha256", segredo).update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex");
  const xSignature = `ts=${ts},v1=${v1}`;
  assert.equal(validarAssinaturaMP({ xSignature, xRequestId: reqId, dataId, segredo }), true);
  assert.equal(validarAssinaturaMP({ xSignature, xRequestId: reqId, dataId: "99999", segredo }), false, "outro id");
  assert.equal(validarAssinaturaMP({ xSignature: `ts=${ts},v1=${v1.slice(0, -1)}0`, xRequestId: reqId, dataId, segredo }), false);
  assert.equal(validarAssinaturaMP({ xSignature, xRequestId: reqId, dataId, segredo: "" }), false, "sem segredo configurado");
  // relógio: aviso de uma hora atrás não vale
  const velho = String(Math.floor(Date.now() / 1000) - 3600);
  const v1v = crypto.createHmac("sha256", segredo).update(`id:${dataId};request-id:${reqId};ts:${velho};`).digest("hex");
  assert.equal(validarAssinaturaMP({ xSignature: `ts=${velho},v1=${v1v}`, xRequestId: reqId, dataId, segredo }), false);
  // id alfanumérico vai em minúsculas
  const alfa = "ABC123";
  const v1a = crypto.createHmac("sha256", segredo).update(`id:abc123;request-id:${reqId};ts:${ts};`).digest("hex");
  assert.equal(validarAssinaturaMP({ xSignature: `ts=${ts},v1=${v1a}`, xRequestId: reqId, dataId: alfa, segredo }), true);
});

test("o quadro financeiro soma só o PAGO e separa o que ainda se espera; a planilha não leva CPF", () => {
  const ins = [
    { codigo: "A1", nome: "Ana", cpf: "11111111111", pagamento: { status: "pago", valor: 10000, pagoCentavos: 10000, taxa: 99, liquido: 9901, meio: "pix", categoriaNome: "Profissional" } },
    { codigo: "B2", nome: "Bia", pagamento: { status: "aguardando", valor: 2990, categoriaNome: "Estudante externo" } },
    { codigo: "C3", nome: "Caio", pagamento: { status: "isento", valor: 0, categoriaNome: "Profissional", isentoPor: "g@x", motivoIsencao: "palestrante" } },
    { codigo: "D4", nome: "Duda" },   // evento gratuito / sem cobrança
  ];
  const r = resumoFinanceiro(ins);
  assert.equal(r.total, 3); assert.equal(r.bruto, 10000); assert.equal(r.taxa, 99); assert.equal(r.liquido, 9901);
  assert.equal(r.aReceber, 2990); assert.equal(r.porEstado.pago, 1); assert.equal(r.porMeio.pix.n, 1);
  assert.equal(r.porCategoria.Profissional.n, 2); assert.equal(r.porCategoria.Profissional.valor, 10000);
  const linhas = linhasFinanceiro(ins);
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].valorPago, "100.00"); assert.equal(linhas[0].taxa, "0.99");
  assert.ok(!Object.keys(linhas[0]).includes("cpf"));
  assert.equal(linhas[2].isentoPor, "g@x");
});

test("o adaptador se declara desligado sem credencial e escreve a data com fuso de Brasília", () => {
  const antes = process.env.MP_ACCESS_TOKEN;
  delete process.env.MP_ACCESS_TOKEN;
  assert.equal(configurado(), false); assert.equal(modo(), "desligado");
  process.env.MP_ACCESS_TOKEN = "TEST-abc";
  assert.equal(modo(), "teste");
  process.env.MP_ACCESS_TOKEN = "APP_USR-abc";
  assert.equal(modo(), "producao");
  if (antes === undefined) delete process.env.MP_ACCESS_TOKEN; else process.env.MP_ACCESS_TOKEN = antes;
  assert.equal(isoComFuso("2026-09-10T15:30:00.000Z"), "2026-09-10T12:30:00.000-03:00");
  assert.equal(isoComFuso("lixo"), undefined);
});

test("cartão recusado renova a reserva (recusado → aguardando) e a reserva vencida não ocupa vaga", () => {
  const pg = novoPagamento({ valor: 5000, categoria: { codigo: "x", nome: "X" }, agora: new Date("2026-09-01T12:00:00Z"), reservaMinutos: 60 });
  const recusado = transitar(pg, "recusado", { por: "mercadopago" });
  const renovado = transitar(recusado, "aguardando", { por: "inscrição", motivo: "reserva renovada" });
  assert.equal(renovado.status, "aguardando");
  assert.equal(renovado.historico.at(-1).motivo, "reserva renovada");
  // dentro do prazo ocupa; vencida, devolve a vaga; paga ocupa sempre
  assert.equal(ocupaVaga({ pagamento: pg }, new Date("2026-09-01T12:30:00Z")), true);
  assert.equal(ocupaVaga({ pagamento: pg }, new Date("2026-09-01T13:30:00Z")), false);
  assert.equal(ocupaVaga({ pagamento: transitar(pg, "pago") }, new Date("2027-01-01T00:00:00Z")), true);
  assert.equal(ocupaVaga({}, new Date()), true);   // evento gratuito: toda inscrição ocupa
});

test("as vagas restantes do evento e os números do relatório ignoram a reserva vencida e a não paga", async () => {
  const { vagasRestantes, numerosDoEvento } = await import("../lib/eventos.js");
  const agora = new Date("2026-09-01T14:00:00Z");
  const pg = novoPagamento({ valor: 5000, categoria: { codigo: "x", nome: "X" }, agora: new Date("2026-09-01T12:00:00Z"), reservaMinutos: 60 });
  const inscritos = [
    { nome: "Paga", pagamento: transitar(pg, "pago") },
    { nome: "Vencida", pagamento: pg },
    { nome: "Isenta", pagamento: transitar(pg, "isento") },
    { nome: "Gratuita sem cobrança" },
  ];
  assert.equal(vagasRestantes({ vagas: 10 }, inscritos, agora), 7);
  const n = numerosDoEvento({ evento: { controleFrequencia: false }, participantes: { inscritos } });
  assert.equal(n.inscritos, 3);
  assert.equal(n.presentes, 3);
});
