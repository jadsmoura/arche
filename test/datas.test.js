/* Datas no fuso institucional — a suíte precisa passar sob QUALQUER TZ do
   processo (o container do Render roda em UTC).                              */
import test from "node:test";
import assert from "node:assert/strict";
import {
  hojeLocalISO, diaSerial, somaDias, dataCivil, dentroDaJanela, relogioPlausivel, agoraLocal,
} from "../lib/datas.js";

test("hojeLocalISO vira o dia às 00:00 de Brasília (03:00Z), não à meia-noite UTC", () => {
  assert.equal(hojeLocalISO(new Date("2026-08-14T02:59:59Z")), "2026-08-13");
  assert.equal(hojeLocalISO(new Date("2026-08-14T03:00:00Z")), "2026-08-14");
  // 21h de Brasília ainda é o mesmo dia (em UTC já seria o seguinte)
  assert.equal(hojeLocalISO(new Date("2026-08-14T00:30:00Z")), "2026-08-13");
});

test("agoraLocal devolve hora local coerente", () => {
  assert.equal(agoraLocal(new Date("2026-08-14T12:00:00Z")).hora, 9);
  assert.equal(agoraLocal(new Date("2026-01-01T12:00:00Z")).hora, 9); // sem horário de verão
  assert.equal(agoraLocal(new Date("data inválida")), null);
});

test("diaSerial valida o calendário de verdade", () => {
  assert.equal(diaSerial("2026-02-30"), null);
  assert.equal(diaSerial("13/08/2026"), null);
  assert.equal(diaSerial(""), null);
  assert.equal(diaSerial("1999-01-01"), null);
  assert.equal(diaSerial(null), null);
  assert.equal(diaSerial("2026-08-14") - diaSerial("2026-08-13"), 1);
});

test("somaDias atravessa mês, ano e bissexto", () => {
  assert.equal(somaDias("2026-12-31", 1), "2027-01-01");
  assert.equal(somaDias("2024-02-28", 1), "2024-02-29");
  assert.equal(somaDias("2024-02-29", 1), "2024-03-01");
  assert.equal(somaDias("2026-03-01", -1), "2026-02-28");
});

test("dataCivil converte instante para o dia civil brasileiro", () => {
  assert.equal(dataCivil("2026-08-14T01:00:00.000Z"), "2026-08-13"); // slice(0,10) erraria
  assert.equal(dataCivil("2026-08-14T12:00:00.000Z"), "2026-08-14");
  assert.equal(dataCivil("2026-08-14"), "2026-08-14");
  assert.equal(dataCivil("2026-02-30"), null);
  assert.equal(dataCivil(new Date("2026-08-14T01:00:00Z")), "2026-08-13");
});

test("dentroDaJanela respeita o horário comercial de Brasília", () => {
  const em = (h, m = 0) => new Date(Date.UTC(2026, 7, 14, h + 3, m)); // BRT -> UTC
  assert.equal(dentroDaJanela(em(7, 59)), false);
  assert.equal(dentroDaJanela(em(8, 0)), true);
  assert.equal(dentroDaJanela(em(19, 59)), true);
  assert.equal(dentroDaJanela(em(20, 0)), false);
  assert.equal(dentroDaJanela(em(3, 0)), false);
});

test("relogioPlausivel barra relógio absurdo", () => {
  assert.equal(relogioPlausivel(new Date("2026-08-14T12:00:00Z")), true);
  assert.equal(relogioPlausivel(new Date("1999-08-14T12:00:00Z")), false);
  assert.equal(relogioPlausivel(new Date("2200-08-14T12:00:00Z")), false);
});
