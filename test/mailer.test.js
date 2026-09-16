/* E-mail de confirmação da inscrição: a marcação que o Gmail lê para oferecer
   o passe na carteira digital (schema.org EventReservation). */
import test from "node:test";
import assert from "node:assert/strict";
// o passo entre mensagens é real e proposital em produção; aqui ele só
// deixaria a suíte lenta — quem o mede é o último teste, que o liga sozinho
process.env.MAIL_INTERVALO_MS = "0";
import { emailInscricaoEvento, destinatariosFinais, listaPara, linkEntrada,
  emailChamadaRelatorioEM, emailConviteEM, emailConviteMonitor,
  ehTransitorio, esperaPedida, mandarComRitmo } from "../lib/mailer.js";

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

/* O 429 DO GMAIL É "ESPERE", NÃO "NÃO DEU" (set/2026, com a chamada do
   cadastro do ICEM). A frase abaixo é a que chegou à tela da coordenação,
   letra por letra: se a leitura dela se perder, a repetição para de saber
   quanto esperar e a mensagem volta a ser recusada na primeira tentativa. */
const gaxios = (status, extra = {}) => Object.assign(new Error(extra.message || "erro"),
  { status, response: { status, headers: extra.headers || {}, data: extra.data } }, extra.campos || {});

test("a recusa por RITMO do Gmail é passageira; a de permissão não é", () => {
  const ritmo = gaxios(429, {
    message: "User-rate limit exceeded. Retry after 2026-09-16T18:36:26.966Z (Mail sending)",
  });
  assert.equal(ehTransitorio(ritmo), true);
  // 403 tem os dois sentidos: quem separa é a RAZÃO, nunca o número
  assert.equal(ehTransitorio(gaxios(403, { message: "Rate Limit Exceeded" })), true);
  assert.equal(ehTransitorio(gaxios(403, { message: "Insufficient Permission" })), false);
  assert.equal(ehTransitorio(gaxios(400, { message: "Invalid to header" })), false);
  assert.equal(ehTransitorio(gaxios(503, {})), true);
  // a razão do corpo basta, mesmo com status que não diz nada
  assert.equal(ehTransitorio(gaxios(0, { data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } })), true);
});

test("o instante que o Gmail pede sai do cabeçalho OU do texto do erro", () => {
  const daqui = (ms) => Math.round(ms / 1000);
  // segundos no Retry-After
  assert.equal(esperaPedida(gaxios(429, { headers: { "retry-after": "17" } })), 17000);
  // o carimbo escrito na própria mensagem — o caso real
  const alvo = Date.now() + 42_000;
  const msg = `User-rate limit exceeded. Retry after ${new Date(alvo).toISOString()} (Mail sending)`;
  assert.equal(daqui(esperaPedida(gaxios(429, { message: msg }))), 42);
  // instante JÁ passado não vira espera negativa
  assert.equal(esperaPedida(gaxios(429, { message: "Retry after 2020-01-01T00:00:00.000Z" })), 0);
  // sem pista nenhuma, quem chama decide o recuo
  assert.equal(esperaPedida(gaxios(429, { message: "Rate Limit Exceeded" })), null);
});

/* O LOTE NÃO PERDE O RESTO DA TURMA POR CAUSA DE UMA RECUSA DE RITMO. */
const gmailFalso = (roteiro) => {
  const chamadas = [];
  return {
    chamadas,
    users: { messages: { send: async () => {
      chamadas.push(Date.now());
      const e = roteiro.shift();
      if (e) throw e;
    } } },
  };
};

test("recusado por ritmo, o envio REPETE e a mensagem sai", async () => {
  const g = gmailFalso([gaxios(429, { headers: { "retry-after": "0" },
    message: "User-rate limit exceeded. Retry after 2020-01-01T00:00:00.000Z (Mail sending)" })]);
  await mandarComRitmo(g, "bruto");            // não lança: a 2ª tentativa passa
  assert.equal(g.chamadas.length, 2);
});

test("esgotadas as tentativas, o erro é EM PORTUGUÊS e diz quando voltar", async () => {
  const ritmo = () => gaxios(429, { headers: { "retry-after": "0" },
    message: "User-rate limit exceeded. Retry after 2020-01-01T00:00:00.000Z (Mail sending)" });
  const g = gmailFalso([ritmo(), ritmo(), ritmo()]);
  const e = await mandarComRitmo(g, "bruto").then(() => null, (x) => x);
  assert.ok(e, "tinha de falhar");
  assert.equal(e.ritmo, true);
  assert.match(e.message, /Gmail limitou o ritmo/);
  assert.doesNotMatch(e.message, /rate limit|Retry after/i);   // nada de inglês cru na tela
  assert.equal(g.chamadas.length, 3);
});

test("erro DEFINITIVO não se repete — repetir um endereço inválido é ruído", async () => {
  const g = gmailFalso([gaxios(400, { message: "Invalid to header" })]);
  const e = await mandarComRitmo(g, "bruto").then(() => null, (x) => x);
  assert.match(e.message, /Invalid to header/);
  assert.equal(e.ritmo, undefined);
  assert.equal(g.chamadas.length, 1);
});

test("o teto DIÁRIO se diz como é — e não vira espera de alguns minutos", async () => {
  const g = gmailFalso([gaxios(429, { message: "Daily user sending quota exceeded. (Mail sending)" })]);
  const e = await mandarComRitmo(g, "bruto").then(() => null, (x) => x);
  assert.equal(e.diaria, true);
  assert.match(e.message, /limite DIÁRIO/);
  assert.doesNotMatch(e.message, /a partir das/);   // nada de hora inventada
  assert.equal(g.chamadas.length, 1, "repetir o teto do dia é desperdício");
  // e NÃO deixa espera guardada: o código de acesso do login tenta do mesmo jeito
  const g2 = gmailFalso([]);
  await mandarComRitmo(g2, "bruto");
  assert.equal(g2.chamadas.length, 1);
});

/* Este vem por ÚLTIMO: ele deixa a espera do módulo lá na frente, que é
   exatamente o que se quer provar — e o que atrapalharia os testes acima. */
test("batido o limite, o RESTO DO LOTE falha na hora (não espera 250 vezes)", async () => {
  const g = gmailFalso([gaxios(429, { headers: { "retry-after": "3600" },
    message: "User-rate limit exceeded" })]);
  const e1 = await mandarComRitmo(g, "bruto").then(() => null, (x) => x);
  assert.equal(e1.ritmo, true);
  assert.equal(g.chamadas.length, 1, "espera maior que o orçamento não se repete");
  assert.match(e1.message, /a partir das \d{2}:\d{2}/);        // diz a HORA de voltar

  // a mensagem seguinte do mesmo lote nem chega a bater no Gmail
  const g2 = gmailFalso([]);
  const e2 = await mandarComRitmo(g2, "bruto").then(() => null, (x) => x);
  assert.equal(e2.ritmo, true);
  assert.equal(g2.chamadas.length, 0);

  /* MAS a mensagem que alguém está esperando na tela TENTA — é o código de
     acesso do login, e a espera guardada foi ganha pelo lote, não por ela.
     Foi isto que aconteceu em set/2026: a chamada do ICEM bateu no limite e
     um bolsista, minutos depois, leu "Não foi possível enviar o código". */
  const g3 = gmailFalso([]);
  await mandarComRitmo(g3, "bruto", { prioritaria: true });
  assert.equal(g3.chamadas.length, 1, "a prioritária não espera na fila do lote");
});

/* O passo entre mensagens é o que conserta a CAUSA: "user rate limit" é o
   limite POR SEGUNDO da conta, e um lote num `for` com `await` passa dele
   por volta da décima mensagem. Roda depois dos demais porque é o único
   teste que mede tempo de relógio. */
test("o lote sai PASSEADO — é o ritmo que derrubava o envio, não o volume", async () => {
  process.env.MAIL_INTERVALO_MS = "40";
  try {
    const g = gmailFalso([]);
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) await mandarComRitmo(g, "bruto", { prioritaria: true });
    assert.equal(g.chamadas.length, 4);
    assert.ok(Date.now() - t0 >= 100, "quatro mensagens não podem sair todas no mesmo instante");

    /* E o passo vale também para chamadas que se CRUZAM: a vaga se reserva
       antes de dormir, senão as duas leriam o mesmo instante, dormiriam
       juntas e sairiam juntas — o passo valendo para uma só. */
    const g2 = gmailFalso([]);
    const t1 = Date.now();
    await Promise.all([0, 1, 2].map(() => mandarComRitmo(g2, "bruto", { prioritaria: true })));
    assert.equal(g2.chamadas.length, 3);
    assert.ok(Date.now() - t1 >= 80, "três mensagens em paralelo ainda saem passeadas");
  } finally { process.env.MAIL_INTERVALO_MS = "0"; }
});
