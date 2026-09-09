/* Cobrança de inscrição em evento — a régua pura (lib/pagamentos.js). */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  normalizarCobranca, cobrancaAtiva, valorDaInscricao, loteVigente, novoPagamento, transitar,
  podeTransitar, inscricaoValida, reservaVencida, estadoDoProvedor, meioDoProvedor,
  lerPagamentoDoProvedor, validarAssinaturaMP, resumoFinanceiro, linhasFinanceiro, centavos, fmtReais, ocupaVaga,
  normalizarMP, normalizarLinkPicPay, estadoLinkPicPay, idDoLinkPicPay, transacaoDecisiva, dataPicPayISO, validarTokenPicPay, ehNormalizado,
  normalizarAcrescimo, valorNoCartao, acrescimoTexto, pagamentoPeloLinkDoCartao,
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
  assert.equal(est.estado, "estornado"); assert.equal(est.meio, "PicPay", "sem o tipo, sai o canal");
  assert.equal(transacaoDecisiva([est, n]).id, n.id, "paga vence");
  assert.equal(transacaoDecisiva([est]).estado, "estornado");
  assert.equal(transacaoDecisiva([]), null);
  assert.equal(normalizarLinkPicPay({ status: "DENIED", amount: 100, paymentType: "CREDIT_CARD" }, {}).meio, "cartão de crédito");
  // a forma crua do Mercado Pago continua entrando pela mesma porta
  const mp = normalizarMP({ id: 9, status: "approved", transaction_amount: 50, external_reference: "acao:tok" });
  assert.equal(mp.referencia, "acao:tok"); assert.equal(mp.estado, "pago"); assert.equal(mp.pagoCentavos, 5000);
  assert.equal(lerPagamentoDoProvedor(mp, { valor: 5000 }).extra.pagamentoId, "9");
});

test("acréscimo no cartão: percentual ou fixo, o valor no cartão sai da régua, e o link do cartão muda o devido e o meio", () => {
  assert.deepEqual(normalizarAcrescimo("5%"), { modo: "percentual", valor: 5 });
  assert.deepEqual(normalizarAcrescimo("4,5 %"), { modo: "percentual", valor: 4.5 });
  assert.deepEqual(normalizarAcrescimo("3,00"), { modo: "fixo", valor: 300 });
  assert.deepEqual(normalizarAcrescimo(""), { modo: "percentual", valor: 0 });
  assert.deepEqual(normalizarAcrescimo("99%"), { modo: "percentual", valor: 30 }, "teto");
  assert.deepEqual(normalizarAcrescimo({ modo: "fixo", valor: 250 }), { modo: "fixo", valor: 250 }, "o gravado relido");
  const cob = normalizarCobranca({ ativa: true, categorias: [{ nome: "Única", valor: "50,00" }], meios: { pix: true, cartao: true }, acrescimoCartao: "5%" });
  assert.equal(acrescimoTexto(cob), "5%");
  assert.equal(valorNoCartao(5000, cob), 5250);
  assert.equal(valorNoCartao(0, cob), 0, "gratuita segue gratuita");
  assert.equal(valorNoCartao(5000, normalizarCobranca({ ...cob, acrescimoCartao: "3,00" })), 5300);
  assert.equal(valorNoCartao(5000, normalizarCobranca({ ...cob, acrescimoCartao: "" })), 5000);
  const v = valorDaInscricao(cob, { categoria: "unica", hojeISO: "2026-09-10" });
  assert.equal(v.valor, 5000); assert.equal(v.valorCartao, 5250);
  const semCartao = normalizarCobranca({ ...cob, meios: { pix: true, cartao: false } });
  assert.equal(valorDaInscricao(semCartao, { categoria: "unica", hojeISO: "2026-09-10" }).valorCartao, 5000, "sem cartão não há acréscimo");
  const pg = { ...novoPagamento({ valor: 5000, valorCartao: 5250, categoria: v.categoria }), preferenciaId: "linkpix", preferenciaCartaoId: "linkcartao", linkCartao: "https://link.picpay.com/p/c" };
  assert.equal(pg.valorCartao, 5250);
  const pagoNoCartao = normalizarLinkPicPay({ id: "t1", status: "PAYED", amount: 5250 }, { paymentLinkId: "linkcartao" });
  assert.equal(pagamentoPeloLinkDoCartao(pagoNoCartao, pg), true);
  const l = lerPagamentoDoProvedor(pagoNoCartao, pg);
  assert.equal(l.divergente, false, "pagou o valor do cartão: não é divergência");
  assert.equal(l.extra.meio, "cartão de crédito"); assert.equal(l.extra.peloLinkDoCartao, true);
  const pagoNoPix = normalizarLinkPicPay({ id: "t2", status: "PAYED", amount: 5000, paymentType: "PIX" }, { paymentLinkId: "linkpix" });
  assert.equal(pagamentoPeloLinkDoCartao(pagoNoPix, pg), false);
  assert.equal(lerPagamentoDoProvedor(pagoNoPix, pg).divergente, false);
  // pagou o valor do Pix pelo link do cartão (não deveria acontecer): é divergência
  assert.equal(lerPagamentoDoProvedor(normalizarLinkPicPay({ id: "t3", status: "PAYED", amount: 5000 }, { paymentLinkId: "linkcartao" }), pg).divergente, true);
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

// ---- o bloqueio do firewall do PicPay vira mensagem legível (set/2026) ----
import { mensagemDeBloqueio } from "../lib/pagamentos/picpay.js";
test("PicPay: página 'you have been blocked' do Cloudflare vira mensagem com Ray ID", () => {
  const html = `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>
    <h1>Sorry, you have been blocked</h1><p>Cloudflare Ray ID: <strong>a3882b20980ef455</strong> &bull; Your IP</p></body></html>`;
  const m = mensagemDeBloqueio(html, 403);
  assert.match(m, /BLOQUEADO pelo firewall/);
  assert.match(m, /Ray ID a3882b20980ef455/);
  assert.match(m, /HTTP 403/);
  assert.equal(mensagemDeBloqueio('{"error":"x"}', 422), "");
  assert.match(mensagemDeBloqueio("<html><body>Bad gateway</body></html>", 502), /página HTML \(HTTP 502\)/);
});

// ---- o Pix da conta que falha (B005) se reconhece pela resposta, não pelo texto só ----
import { ehErroDePix } from "../lib/pagamentos/picpay.js";
test("PicPay: erro de Pix da conta (B005/B001, type pix) é reconhecido", () => {
  const e1 = new Error("PicPay: Falha ao criar a url dinâmica. (B005)"); e1.detalhe = { error: { message: "Falha ao criar a url dinâmica.", type: "pix", code: "B005" } };
  assert.equal(ehErroDePix(e1), true);
  const e2 = new Error("PicPay: x"); e2.detalhe = { errors: [{ message: "Seller conta liquidação não é elegível para pix.", type: "pix", code: "B001" }] };
  assert.equal(ehErroDePix(e2), true);
  const e3 = new Error("PicPay: Campos obrigatórios ausentes. (B002)"); e3.detalhe = { errors: { type: "charge", code: "B002" } };
  assert.equal(ehErroDePix(e3), false);
  assert.equal(ehErroDePix(new Error("PicPay: autenticação recusada")), false);
});

/* O teste de credencial do Mercado Pago (set/2026, na troca do PicPay pelo MP
   em produção): três etapas contra um servidor falso — token, meios ativos e
   a criação de uma preferência de centavo. Cada falha diz de que etapa é. */
import http from "node:http";
import { testar as testarMP, ultimoErro as ultimoErroMP } from "../lib/pagamentos/mercadopago.js";
test("o teste do Mercado Pago separa token inválido, meio desligado e conta que não cria cobrança", async () => {
  const MODO = { pix: true, prefFalha: false };
  const srv = http.createServer((req, res) => {
    const auth = req.headers.authorization || "";
    const json = (code, b) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
    if (auth !== "Bearer APP_USR-ok") return json(401, { message: "invalid_token", error: "unauthorized", status: 401 });
    if (req.url === "/users/me") return json(200, { id: 123, nickname: "UNIEGO", site_id: "MLB", email: "x@y" });
    if (req.url === "/v1/payment_methods") return json(200, [
      ...(MODO.pix ? [{ id: "pix", payment_type_id: "bank_transfer", status: "active" }] : []),
      { id: "visa", payment_type_id: "credit_card", status: "active" }, { id: "bolbradesco", payment_type_id: "ticket", status: "inactive" },
    ]);
    if (req.url === "/checkout/preferences" && req.method === "POST") {
      let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => {
        const b = JSON.parse(s);
        if (MODO.prefFalha) return json(400, { message: "invalid preference", cause: [{ description: "collector not allowed" }] });
        if (b.items?.[0]?.unit_price !== 0.01) return json(400, { message: "valor" });
        json(201, { id: "p1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=p1" });
      }); return;
    }
    json(404, { message: "not found" });
  });
  await new Promise((ok) => srv.listen(0, ok));
  const antes = { T: process.env.MP_ACCESS_TOKEN, B: process.env.MP_API_BASE };
  process.env.MP_API_BASE = `http://127.0.0.1:${srv.address().port}`;
  try {
    delete process.env.MP_ACCESS_TOKEN;
    let r = await testarMP();
    assert.equal(r.configurado, false); assert.match(r.erro, /MP_ACCESS_TOKEN/);
    process.env.MP_ACCESS_TOKEN = "APP_USR-errado";
    r = await testarMP();
    assert.equal(r.credencial, false); assert.match(r.erro, /invalid_token/); assert.equal(r.ambiente, "teste local");
    assert.match(ultimoErroMP()?.mensagem || "", /invalid_token/, "o último erro fica no retrato");
    process.env.MP_ACCESS_TOKEN = "APP_USR-ok";
    r = await testarMP();
    assert.equal(r.credencial, true); assert.equal(r.api, true); assert.equal(r.ok, true);
    assert.equal(r.conta.apelido, "UNIEGO"); assert.equal(r.conta.tipoToken, "producao"); assert.equal(r.aviso, undefined);
    assert.equal(r.pix.ok, true); assert.equal(r.cartao.ok, true); assert.equal(r.boleto.ok, false, "inativo não conta");
    assert.equal(r.cobranca.ok, true);
    MODO.pix = false;
    r = await testarMP();
    assert.equal(r.ok, true, "sem Pix a conta ainda cobra pelo cartão"); assert.equal(r.pix.ok, false); assert.match(r.pix.erro, /meios ativos/);
    MODO.prefFalha = true;
    r = await testarMP();
    assert.equal(r.ok, false); assert.equal(r.credencial, true); assert.equal(r.api, true);
    assert.match(r.cobranca.erro, /invalid preference \(collector not allowed\)/, "a causa do MP vai junto");
    assert.equal(r.erro, r.cobranca.erro);
  } finally {
    srv.close();
    for (const [k, v] of [["MP_ACCESS_TOKEN", antes.T], ["MP_API_BASE", antes.B]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
