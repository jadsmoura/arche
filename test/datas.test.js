/* Datas no fuso institucional — a suíte precisa passar sob QUALQUER TZ do
   processo (o container do Render roda em UTC).                              */
import test from "node:test";
import assert from "node:assert/strict";
import {
  hojeLocalISO, diaSerial, somaDias, dataCivil, dentroDaJanela, relogioPlausivel, agoraLocal,
  horaLocalHHMM,
  numeroDoSemestre, semestreDe as semestreCivil, semestreCorrente, periodoDoSemestre,
  fimDoSemestre, semestreSeguinte, semestreAnterior,
} from "../lib/datas.js";

test("horaLocalHHMM é o relógio de Brasília, com dois dígitos", () => {
  assert.equal(horaLocalHHMM(new Date("2026-08-14T00:05:00Z")), "21:05", "UTC-3, e ainda é dia 13");
  assert.equal(horaLocalHHMM(new Date("2026-08-14T12:00:00Z")), "09:00", "hora com zero à frente");
  assert.equal(horaLocalHHMM(new Date("2026-08-14T03:00:00Z")), "00:00");
  assert.equal(horaLocalHHMM(new Date("nada")), "", "data inválida não vira hora");
});

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

/* ======================================================================
   O SEMESTRE VIRA COM O CALENDÁRIO (decisão do dono, ago/2026).

   Em 01/01 passa a ser AAAA/1 e em 01/07 a AAAA/2, sem ninguém pedir.
   Estes testes existem porque a conta agora é UMA só — antes havia três
   cópias dela, e a que faltava (a monitoria) congelava o ciclo no último
   edital publicado.
   ====================================================================== */
test("a virada acontece exatamente em 01/01 e em 01/07", () => {
  assert.equal(semestreCivil("2026-12-31"), "2026/2");
  assert.equal(semestreCivil("2027-01-01"), "2027/1", "vira no primeiro dia do ano");
  assert.equal(semestreCivil("2027-06-30"), "2027/1");
  assert.equal(semestreCivil("2027-07-01"), "2027/2", "e no primeiro dia de julho");
  assert.equal(semestreCivil("2027-12-31"), "2027/2");
  assert.equal(semestreCivil("2028-01-01"), "2028/1", "e assim por diante");
});

test("o semestre corrente é o de hoje, não o de um catálogo", () => {
  const hoje = new Date();
  assert.equal(semestreCorrente(hoje), semestreCivil(hojeLocalISO(hoje)));
  // e é o relógio de Brasília que manda, como em todo o portal
  assert.match(semestreCorrente(), /^\d{4}\/[12]$/);
});

test("data que não é data não vira semestre nenhum", () => {
  for (const v of ["", null, undefined, "amanhã", "2026-13-01"]) {
    assert.equal(semestreCivil(v), "", `"${v}" não é uma data`);
    assert.equal(numeroDoSemestre(v), null);
    assert.equal(fimDoSemestre(v), null);
  }
});

test("o período de um semestre tem começo, fim e rótulo", () => {
  assert.deepEqual(periodoDoSemestre("2027/1"), {
    chave: "2027/1", ano: 2027, numero: 1,
    inicio: "2027-01-01", fim: "2027-06-30", rotulo: "1º semestre de 2027" });
  assert.deepEqual(periodoDoSemestre("2027/2"), {
    chave: "2027/2", ano: 2027, numero: 2,
    inicio: "2027-07-01", fim: "2027-12-31", rotulo: "2º semestre de 2027" });
  assert.equal(periodoDoSemestre("2027/3"), null, "só existem dois semestres");
  assert.equal(periodoDoSemestre("2027"), null);
});

test("o seguinte e o anterior atravessam o ano", () => {
  assert.equal(semestreSeguinte("2026/2"), "2027/1");
  assert.equal(semestreSeguinte("2027/1"), "2027/2");
  assert.equal(semestreAnterior("2027/1"), "2026/2");
  assert.equal(semestreAnterior("2027/2"), "2027/1");
  assert.equal(fimDoSemestre("2027-03-15"), "2027-06-30");
  assert.equal(fimDoSemestre("2027-09-15"), "2027-12-31");
});
