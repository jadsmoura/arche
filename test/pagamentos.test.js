/* Cobrança de inscrição em evento — a régua pura (lib/pagamentos.js). */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  normalizarCobranca, cobrancaAtiva, valorDaInscricao, loteVigente, novoPagamento, transitar,
  podeTransitar, inscricaoValida, reservaVencida, estadoDoProvedor, meioDoProvedor,
  lerPagamentoDoProvedor, validarAssinaturaMP, resumoFinanceiro, linhasFinanceiro, centavos, fmtReais,
} from "../lib/pagamentos.js";
import { isoComFuso, configurado, modo } from "../lib/pagamentos/mercadopago.js";

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
