/* E-mail de confirmação da inscrição: a marcação que o Gmail lê para oferecer
   o passe na carteira digital (schema.org EventReservation). */
import test from "node:test";
import assert from "node:assert/strict";
import { emailInscricaoEvento, destinatariosFinais, listaPara, linkEntrada,
  emailChamadaRelatorioEM, emailConviteEM, emailConviteMonitor } from "../lib/mailer.js";

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

/* A conta pessoal do pró-reitor não recebe comunicação do sistema (ago/2026):
   todo destino passa pela tradução pessoal → institucional, exceto o código
   de acesso do login (exato: true). */
test("a conta pessoal é traduzida para a institucional", () => {
  assert.deepEqual(destinatariosFinais("jadsonbelem@gmail.com"),
    ["jadson.moura@uniego.edu.br"]);
});

test("com as duas contas na lista, sai UMA institucional (sem duplicar)", () => {
  assert.deepEqual(
    destinatariosFinais(["jadsonbelem@gmail.com", "jadson.moura@uniego.edu.br", "extensao@uniego.edu.br"]),
    ["jadson.moura@uniego.edu.br", "extensao@uniego.edu.br"]);
});

test("exato (código de acesso do login) NÃO traduz — senão a conta pessoal não entra", () => {
  assert.deepEqual(destinatariosFinais("jadsonbelem@gmail.com", { exato: true }),
    ["jadsonbelem@gmail.com"]);
});

test("os demais endereços passam intactos", () => {
  assert.deepEqual(destinatariosFinais(["prof@uniego.edu.br", "Prof@UNIEGO.edu.br", "torto@@x"]),
    ["prof@uniego.edu.br"]);
});

test("listaPara segue validando e normalizando como sempre", () => {
  assert.deepEqual(listaPara([" A@b.co ", "quebra\ninjecao@x.co", null]), ["a@b.co"]);
});

/* O link de e-mail NOMINAL leva a conta a que se destina (ago/2026): sem
   isso, quem estava entrado com outra conta no celular chegava ao setor como
   outra pessoa, e a guia que o e-mail mandava abrir não existia para ela. */
test("o link de entrada leva o destino E a conta a que o e-mail se destina", () => {
  const u = new URL(linkEntrada("https://arche.app.br", "/pesquisa/ic/", "Ana@Escola.COM "));
  assert.equal(u.pathname, "/entrar/");
  assert.equal(u.searchParams.get("next"), "/pesquisa/ic/");
  assert.equal(u.searchParams.get("conta"), "ana@escola.com");   // normalizada
});

test("sem e-mail, o link segue só com o destino (nada de conta vazia)", () => {
  const u = new URL(linkEntrada("https://arche.app.br", "/monitoria/", ""));
  assert.equal(u.searchParams.get("next"), "/monitoria/");
  assert.equal(u.searchParams.has("conta"), false);
});

test("os e-mails nominais do ICEM e da monitoria carregam a conta no botão", () => {
  const b = { nome: "Ana", email: "ana.camargo10@aluno.educa.go.gov.br" };
  const turma = { ciclo: "2025/2026", encerrada: true, edital: "02/2025" };
  for (const html of [
    emailChamadaRelatorioEM(b, turma).corpoHtml,
    emailConviteEM(b, turma).corpoHtml,
    emailConviteMonitor({ disciplina: "Anatomia" }, b).corpoHtml,
  ]) {
    const link = (html.match(/href="([^"]*\/entrar\/[^"]*)"/) || [])[1];
    assert.ok(link, "o e-mail precisa levar ao /entrar/");
    assert.match(link, /conta=ana\.camargo10/);
    assert.match(link, /next=/);
  }
});
