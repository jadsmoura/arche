/* E-mail de confirmação da inscrição: a marcação que o Gmail lê para oferecer
   o passe na carteira digital (schema.org EventReservation). */
import test from "node:test";
import assert from "node:assert/strict";
import { emailInscricaoEvento } from "../lib/mailer.js";

const acao = {
  curso: "Agronomia",
  proposta: {
    nomeAtividade: "III Semana de Ciências Agrárias",
    periodoInicio: "2026-08-31", periodoFim: "2026-09-01",
    local: "Auditório Central — UNIEGO",
  },
  evento: {
    slug: "iii-semana-ciencias-agrarias",
    programacao: [
      { id: "a1", titulo: "Abertura", dia: "2026-08-31", horaInicio: "19:00", horaFim: "22:00" },
      { id: "a2", titulo: "Encerramento", dia: "2026-09-01", horaInicio: "19:00", horaFim: "22:00" },
    ],
  },
};
const inscrito = { nome: "Maria de Souza", email: "maria@exemplo.com", token: "4de297aaaa1111bbbb22", atividades: ["a1"] };

const reservaDe = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1].replace(/\\u003c/g, "<")) : null;
};

test("a reserva vai descrita no e-mail, com o QR como ticketToken", () => {
  const msg = emailInscricaoEvento(acao, inscrito);
  const r = reservaDe(msg.corpoHtml);
  assert.ok(r, "o e-mail precisa carregar o bloco JSON-LD");
  assert.equal(r["@type"], "EventReservation");
  assert.equal(r.reservationStatus, "http://schema.org/ReservationConfirmed");
  assert.equal(r.underName.name, "Maria de Souza");
  assert.equal(r.reservationFor.name, "III Semana de Ciências Agrárias");
  // é o prefixo qrCode: que faz o passe nascer com o QR escaneável
  assert.equal(r.ticketToken, `qrCode:${inscrito.token}`);
  assert.equal(r.reservationNumber, "4DE297");
});

test("início e fim saem no horário de Brasília, tirados da própria programação", () => {
  const r = reservaDe(emailInscricaoEvento(acao, inscrito).corpoHtml);
  assert.equal(r.reservationFor.startDate, "2026-08-31T19:00:00-03:00");
  assert.equal(r.reservationFor.endDate, "2026-09-01T22:00:00-03:00");
  assert.equal(r.reservationFor.location.address.addressCountry, "BR");
});

test("sem data de início não há reserva a descrever — e o e-mail sai igual", () => {
  const semData = { ...acao, proposta: { ...acao.proposta, periodoInicio: "", periodoFim: "" } };
  const msg = emailInscricaoEvento(semData, inscrito);
  assert.equal(reservaDe(msg.corpoHtml), null);
  assert.match(msg.corpoHtml, /Sua inscrição está confirmada/);
});

test("o botão da carteira só sai onde há conta de emissor, e é link simples", () => {
  const sem = emailInscricaoEvento(acao, inscrito);
  assert.equal(/Google Wallet/.test(sem.corpoHtml), false);

  const com = emailInscricaoEvento(acao, inscrito, { wallet: true });
  assert.match(com.corpoHtml, /Adicionar ao Google Wallet/);
  // aponta para a rota que assina o passe na hora — o link não envelhece
  assert.match(com.corpoHtml, new RegExp(`inscricao/${inscrito.token}/wallet\\?ir=1`));
});

test("o QR viaja embutido, e o bloco da reserva não atrapalha o corpo", () => {
  const msg = emailInscricaoEvento(acao, inscrito, { qrPng: Buffer.from("png") });
  assert.equal(msg.anexos[0].cid, "qr-inscricao");
  assert.match(msg.corpoHtml, /cid:qr-inscricao/);
  // o JSON-LD vem antes do que se lê, e escapado — nenhum "<" cru dentro dele
  const bloco = msg.corpoHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(bloco.includes("<"), false);
});
