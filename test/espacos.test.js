/* ARCHÉ ES — reserva de espaços (lib/espacos.js): a regra que importa é que
   espaço confirmado trava o pedido seguinte, e que nem todo espaço é único. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ESPACOS_PADRAO, INTERESSADOS, STATUS, OCUPA, VIVA, normalizarEspacos, normalizarReserva,
  normalizarBloqueio, validarReserva, sobrepoe, conflitos, impedimentos, agenda,
  reservaPublica, ocupacaoPorEspaco, diasDaReserva, rotuloItem, itensEmDisputa, minhaReserva,
} from "../lib/espacos.js";

const ESP = normalizarEspacos(ESPACOS_PADRAO);
const HOJE = "2026-08-01";
const pedido = (x = {}) => normalizarReserva({
  id: x.id || "r1",
  itens: x.itens || [{ espaco: "auditorio-bloco-a" }],
  dataInicio: "2026-09-10", dataFim: x.dataFim ?? "2026-09-10",
  horaInicio: "19:00", horaFim: "22:00",
  atividade: "Aula inaugural", orgao: "Enfermagem",
  justificativa: "Recepção dos calouros", interessado: "coordenador",
  ...x,
}, { espacos: ESP, base: x.base || null });

test("o catálogo semente cobre os espaços que a instituição indicou", () => {
  const nomes = ESP.map((e) => e.nome);
  assert.equal(ESP.length, 12);
  assert.ok(nomes.includes("Auditório"));
  assert.ok(nomes.includes("Área de Convivência"));
  assert.ok(nomes.includes("Quadra de Esportes"));
  assert.equal(ESP.filter((e) => e.nome.startsWith("Mini Auditório")).length, 4);
  // os três modos de conflito estão representados
  assert.equal(ESP.find((e) => e.id === "sala-aula").conflito, "multiplo");
  assert.equal(ESP.find((e) => e.id === "sala-reunioes-coordenacao").conflito, "por-detalhe");
  assert.equal(ESP.find((e) => e.id === "auditorio-bloco-a").conflito, "unico");
});

test("a situação nunca vem do formulário — ela é da gestão", () => {
  const r = pedido({ status: "confirmada" });
  assert.equal(r.status, "solicitada");
  const editada = pedido({ status: "confirmada", base: { status: "confirmada", id: "r1" } });
  assert.equal(editada.status, "confirmada", "a situação vem da base, que é o que está gravado");
  assert.ok(STATUS.includes(r.status));
});

test("sem data de término, a reserva é de um dia só", () => {
  assert.equal(pedido({ dataFim: "" }).dataFim, "2026-09-10");
  assert.equal(diasDaReserva(pedido({ dataFim: "2026-09-12" })).length, 3);
  assert.deepEqual(diasDaReserva(pedido({ dataFim: "" })), ["2026-09-10"]);
});

test("validação: o pedido diz o que é, para quem e por quê", () => {
  assert.deepEqual(validarReserva(pedido(), { espacos: ESP, hoje: HOJE }), []);
  const vazio = normalizarReserva({ id: "x", itens: [] }, { espacos: ESP });
  const erros = validarReserva(vazio, { espacos: ESP, hoje: HOJE });
  assert.ok(erros.some((e) => /espaço/i.test(e)));
  assert.ok(erros.some((e) => /atividade/i.test(e)));
  assert.ok(erros.some((e) => /órgão/i.test(e)));
  assert.ok(erros.some((e) => /justificativa/i.test(e)));
});

test("passado não se reserva, e término tem de vir depois do início", () => {
  assert.ok(validarReserva(pedido({ dataInicio: "2026-07-01", dataFim: "2026-07-01" }),
    { espacos: ESP, hoje: HOJE }).some((e) => /já passou/.test(e)));
  assert.ok(validarReserva(pedido({ horaInicio: "22:00", horaFim: "19:00" }),
    { espacos: ESP, hoje: HOJE }).some((e) => /depois do início/.test(e)));
});

test("espaço com complemento cobra o complemento — e o bloco é de A a E", () => {
  const semBloco = pedido({ itens: [{ espaco: "sala-aula", quantidade: 5 }] });
  assert.ok(validarReserva(semBloco, { espacos: ESP, hoje: HOJE }).some((e) => /bloco/i.test(e)));
  const blocoErrado = pedido({ itens: [{ espaco: "sala-aula", detalhe: "Z", quantidade: 5 }] });
  assert.ok(validarReserva(blocoErrado, { espacos: ESP, hoje: HOJE }).some((e) => /Bloco inválido/.test(e)));
  const ok = pedido({ itens: [{ espaco: "sala-aula", detalhe: "C", quantidade: 5 }] });
  assert.deepEqual(validarReserva(ok, { espacos: ESP, hoje: HOJE }), []);
  assert.match(rotuloItem(ESP, ok.itens[0]), /Sala de Aula — C \(5 salas\)/);
});

test("capacidade só barra quando UM espaço foi pedido", () => {
  const so = pedido({ itens: [{ espaco: "sala-transmissao-odonto" }], participantes: 200 });
  assert.ok(validarReserva(so, { espacos: ESP, hoje: HOJE }).some((e) => /comporta 20/.test(e)));
  // num pedido com vários espaços o público se distribui: somar tetos não diz nada
  const varios = pedido({ participantes: 200,
    itens: [{ espaco: "sala-transmissao-odonto" }, { espaco: "auditorio-bloco-a" }] });
  assert.deepEqual(validarReserva(varios, { espacos: ESP, hoje: HOJE }), []);
});

test("espaço confirmado TRAVA o pedido sobreposto", () => {
  const confirmada = { ...pedido({ id: "a" }), status: "confirmada" };
  const nova = pedido({ id: "b", horaInicio: "20:00", horaFim: "23:00" });
  assert.equal(sobrepoe(ESP, confirmada, nova), true);
  const imp = impedimentos(nova, { reservas: [confirmada], espacos: ESP });
  assert.equal(imp.livre, false);
  assert.match(imp.motivos[0], /Auditório/);
});

test("encostar não é sobrepor: 19–22 e 22–23 cabem no mesmo espaço", () => {
  const confirmada = { ...pedido({ id: "a" }), status: "confirmada" };
  const depois = pedido({ id: "b", horaInicio: "22:00", horaFim: "23:00" });
  assert.equal(sobrepoe(ESP, confirmada, depois), false);
  assert.equal(impedimentos(depois, { reservas: [confirmada], espacos: ESP }).livre, true);
});

test("sala de aula não disputa: há dezenas delas", () => {
  const cinco = { ...pedido({ id: "a", itens: [{ espaco: "sala-aula", detalhe: "C", quantidade: 5 }] }), status: "confirmada" };
  const tres = pedido({ id: "b", itens: [{ espaco: "sala-aula", detalhe: "C", quantidade: 3 }] });
  assert.deepEqual(itensEmDisputa(ESP, tres, cinco), []);
  assert.equal(impedimentos(tres, { reservas: [cinco], espacos: ESP }).livre, true);
});

test("sala de reuniões da coordenação disputa pelo CURSO, não pelo espaço", () => {
  const enf = { ...pedido({ id: "a", itens: [{ espaco: "sala-reunioes-coordenacao", detalhe: "Enfermagem" }] }), status: "confirmada" };
  const psi = pedido({ id: "b", itens: [{ espaco: "sala-reunioes-coordenacao", detalhe: "Psicologia" }] });
  const outraEnf = pedido({ id: "c", itens: [{ espaco: "sala-reunioes-coordenacao", detalhe: "enfermagem" }] });
  assert.equal(impedimentos(psi, { reservas: [enf], espacos: ESP }).livre, true);
  assert.equal(impedimentos(outraEnf, { reservas: [enf], espacos: ESP }).livre, false,
    "o mesmo curso é a mesma sala, com ou sem maiúscula");
});

test("pedido com vários espaços choca por QUALQUER um deles", () => {
  const quadra = { ...pedido({ id: "a", itens: [{ espaco: "quadra-esportes" }] }), status: "confirmada" };
  const grande = pedido({ id: "b",
    itens: [{ espaco: "auditorio-bloco-a" }, { espaco: "quadra-esportes" }, { espaco: "area-convivencia" }] });
  const imp = impedimentos(grande, { reservas: [quadra], espacos: ESP });
  assert.equal(imp.livre, false);
  assert.match(imp.motivos[0], /Quadra/);
});

test("período de datas: a semana inteira choca com um dia lá dentro", () => {
  const semana = pedido({ id: "b", dataInicio: "2026-09-07", dataFim: "2026-09-12" });
  const umDia = { ...pedido({ id: "a" }), status: "confirmada" };   // 10/09
  assert.equal(impedimentos(semana, { reservas: [umDia], espacos: ESP }).livre, false);
  const antes = pedido({ id: "c", dataInicio: "2026-09-01", dataFim: "2026-09-05" });
  assert.equal(impedimentos(antes, { reservas: [umDia], espacos: ESP }).livre, true);
});

test("solicitação concorrente não trava, mas a gestão a enxerga", () => {
  const outra = pedido({ id: "a" });                     // status solicitada
  const nova = pedido({ id: "b" });
  assert.equal(impedimentos(nova, { reservas: [outra], espacos: ESP }).livre, true);
  assert.equal(conflitos([outra], nova, { espacos: ESP, apenasConfirmadas: false }).length, 1);
  assert.equal(VIVA(outra), true);
  assert.equal(OCUPA(outra), false);
});

test("reserva cancelada ou recusada libera o espaço", () => {
  for (const status of ["cancelada", "recusada"]) {
    const morta = { ...pedido({ id: "a" }), status };
    assert.equal(impedimentos(pedido({ id: "b" }), { reservas: [morta], espacos: ESP }).livre, true);
    assert.equal(VIVA(morta), false);
  }
});

test("bloqueio da gestão trava como reserva confirmada, e é do dia inteiro", () => {
  const b = normalizarBloqueio({ id: "b1", espacos: ["auditorio-bloco-a"],
    dataInicio: "2026-09-09", dataFim: "2026-09-11", motivo: "Reforma do palco" });
  const imp = impedimentos(pedido(), { bloqueios: [b], espacos: ESP });
  assert.equal(imp.livre, false);
  assert.match(imp.motivos[0], /bloqueado.*Reforma do palco/);
  // outro espaço no mesmo dia segue livre
  assert.equal(impedimentos(pedido({ itens: [{ espaco: "quadra-esportes" }] }),
    { bloqueios: [b], espacos: ESP }).livre, true);
});

test("a agenda pública diz onde e para quê — nunca quem, nem por quê", () => {
  const r = { ...pedido(), solicitante: { email: "a@b.c", nome: "Fulano", telefone: "62999" } };
  const p = reservaPublica(ESP, r);
  const txt = JSON.stringify(p);
  assert.ok(!txt.includes("a@b.c") && !txt.includes("62999") && !txt.includes("Recepção dos calouros"));
  assert.equal(p.atividade, "Aula inaugural");
  assert.equal(p.orgao, "Enfermagem");
  assert.match(p.itens[0].rotulo, /Auditório/);
});

test("a agenda cobre o período e ignora o que morreu", () => {
  const viva = { ...pedido({ id: "a" }), status: "confirmada" };
  const morta = { ...pedido({ id: "b" }), status: "cancelada" };
  const outra = pedido({ id: "c", dataInicio: "2026-10-01", dataFim: "2026-10-01" });
  const lista = agenda([viva, morta, outra], { de: "2026-09-01", ate: "2026-09-30" });
  assert.deepEqual(lista.map((x) => x.id), ["a"]);
  assert.equal(agenda([viva, outra], {}).length, 2);
  assert.equal(agenda([viva, outra], { somenteConfirmadas: true }).length, 1);
});

test("ocupação conta só o confirmado, multiplicando pelos dias", () => {
  const tres = { ...pedido({ dataFim: "2026-09-12" }), status: "confirmada" };   // 3h × 3 dias
  const pedida = pedido({ id: "z" });
  const q = ocupacaoPorEspaco([tres, pedida], ESP);
  const aud = q.find((x) => x.id === "auditorio-bloco-a");
  assert.equal(aud.horas, 9);
  assert.equal(aud.reservas, 1);
});

test("interessado sai do catálogo, e o dono da reserva é quem a pediu", () => {
  assert.ok(INTERESSADOS.some((i) => i.codigo === "comunidade"));
  assert.equal(pedido({ interessado: "inventado" }).interessado, "professor");
  const r = { ...pedido(), solicitante: { email: "Ana@X.com", nome: "Ana", telefone: "" } };
  assert.equal(minhaReserva("ana@x.com", r), true);
  assert.equal(minhaReserva("outro@x.com", r), false);
  assert.equal(minhaReserva("", r), false);
});
