/* ARCHÉ Eventos: os helpers puros do evento gratuito — slug, token assinado,
   programação, vagas, prazo e dedupe da inscrição (lib/eventos.js). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  slugDeNome, slugUnico, SLUG_VALIDO, gerarChaveQr, gerarCodigoMonitor,
  gerarToken, tokenValido, codigoDe, inscritoPorToken, normalizarProgramacao,
  vagasRestantes, prazoInscricao, podeInscrever, jaInscrito,
} from "../lib/eventos.js";

/* --------------------------------- slug --------------------------------- */
test("slug: minúsculo, sem acento, hífens no lugar do resto", () => {
  assert.equal(slugDeNome("XII Semana de Enfermagem & I Simpósio"), "xii-semana-de-enfermagem-i-simposio");
  assert.equal(slugDeNome("  Ação  Comunitária!!  "), "acao-comunitaria");
  assert.equal(slugDeNome("çãéîõü"), "caeiou");
  assert.equal(slugDeNome("***"), "", "só símbolo não vira endereço");
  assert.ok(SLUG_VALIDO.test(slugDeNome("Semana 2026")));
});

test("slug único: colisão ganha sufixo numérico, e vazio vira 'evento'", () => {
  assert.equal(slugUnico("Semana de Enfermagem", []), "semana-de-enfermagem");
  assert.equal(slugUnico("Semana de Enfermagem", ["semana-de-enfermagem"]), "semana-de-enfermagem-2");
  assert.equal(
    slugUnico("Semana de Enfermagem", ["semana-de-enfermagem", "semana-de-enfermagem-2"]),
    "semana-de-enfermagem-3",
  );
  assert.equal(slugUnico("!!!", []), "evento");
  assert.ok(SLUG_VALIDO.test(slugUnico("!!!", ["evento"])));
});

/* -------------------------------- token --------------------------------- */
test("token: assinado com a chave do evento, curto e conferível", () => {
  const chave = gerarChaveQr();
  const t = gerarToken(chave);
  assert.match(t, /^[0-9a-f]{22}$/, "22 hex — cabe num QR pequeno");
  assert.equal(tokenValido(chave, t), true);
  assert.equal(tokenValido(chave, t.toUpperCase()), true, "caixa alta não invalida");
  assert.equal(codigoDe(t), t.slice(0, 6), "o código manual são os 6 primeiros");
});

test("token adulterado, de outro evento ou fora do formato não passa", () => {
  const chave = gerarChaveQr();
  const t = gerarToken(chave);
  const trocado = (t[21] === "0" ? "1" : "0");
  assert.equal(tokenValido(chave, t.slice(0, 21) + trocado), false, "um caractere trocado derruba");
  assert.equal(tokenValido(gerarChaveQr(), t), false, "a chave é POR evento");
  assert.equal(tokenValido(chave, ""), false);
  assert.equal(tokenValido(chave, t + "00"), false, "comprimento errado");
  assert.equal(tokenValido("", t), false, "sem chave nada valida");
  assert.equal(tokenValido(chave, null), false);
});

test("código do monitor: curto e sem os caracteres que se confundem", () => {
  const c = gerarCodigoMonitor();
  assert.match(c, /^[2-9A-HJ-NP-Z]{6}$/, "sem 0/O/1/I — soletra-se por telefone");
  assert.notEqual(gerarCodigoMonitor(), c, "aleatório");
});

/* --------------------- busca da inscrição no check-in -------------------- */
test("check-in encontra pelo token assinado e pelo código de 6", () => {
  const chave = gerarChaveQr();
  const ev = { chaveQr: chave };
  const t1 = gerarToken(chave), t2 = gerarToken(chave);
  const inscritos = [{ nome: "Ana", token: t1 }, { nome: "Bia", token: t2 }];
  assert.equal(inscritoPorToken(ev, inscritos, { token: t1 })?.nome, "Ana");
  assert.equal(inscritoPorToken(ev, inscritos, { codigo: codigoDe(t2) })?.nome, "Bia");
  assert.equal(inscritoPorToken(ev, inscritos, { codigo: codigoDe(t2).toUpperCase() })?.nome, "Bia");
});

test("check-in recusa token inválido e prefixo ambíguo", () => {
  const chave = gerarChaveQr();
  const ev = { chaveQr: chave };
  const t = gerarToken(chave);
  const outro = gerarToken(gerarChaveQr());
  assert.equal(inscritoPorToken(ev, [{ nome: "Ana", token: t }], { token: outro }), null,
    "token de outro evento não abre este");
  // duas inscrições com o mesmo início de token: na dúvida, ninguém — o
  // monitor pede o token completo em vez de credenciar o errado
  const gemeo = t.slice(0, 6) + "abcdefabcdefabcd";
  const ambiguos = [{ nome: "Ana", token: t }, { nome: "Bia", token: gemeo }];
  assert.equal(inscritoPorToken(ev, ambiguos, { codigo: codigoDe(t) }), null);
  assert.equal(inscritoPorToken(ev, ambiguos, { codigo: "zz" }), null, "código curto demais");
});

/* ----------------------------- programação ------------------------------- */
test("programação: apara, descarta linha sem título e ordena por dia/hora", () => {
  const prog = normalizarProgramacao([
    { dia: "2026-05-14", hora: "19:00", titulo: " Minicurso B ", responsavel: " Profa. X ", local: " Sala 2 " },
    { dia: "2026-05-13", hora: "19:00", titulo: "Abertura" },
    { dia: "2026-05-13", hora: "08:00", titulo: "Credenciamento" },
    { dia: "2026-05-15", hora: "", titulo: "" },              // sem título: fora
    { dia: "13/05/2026", hora: "20:00", titulo: "Data torta" }, // dia inválido vira ""
  ]);
  assert.deepEqual(prog.map((p) => p.titulo), ["Data torta", "Credenciamento", "Abertura", "Minicurso B"]);
  assert.equal(prog[3].responsavel, "Profa. X");
  assert.equal(prog[3].local, "Sala 2");
  assert.equal(prog[0].dia, "", "dia fora do formato não passa adiante");
  assert.deepEqual(normalizarProgramacao("nada"), [], "entrada torta vira lista vazia");
});

/* --------------------------- vagas e inscrição --------------------------- */
const acaoEv = (evento, inscritos = []) => ({
  proposta: { periodoInicio: "2026-05-13", periodoFim: "2026-05-15" },
  evento, participantes: { inscritos },
});

test("vagas: 0 é ilimitado (null) e a contagem nunca fica negativa", () => {
  assert.equal(vagasRestantes({ vagas: 0 }, [{}, {}]), null);
  assert.equal(vagasRestantes({}, []), null);
  assert.equal(vagasRestantes({ vagas: 3 }, [{}]), 2);
  assert.equal(vagasRestantes({ vagas: 2 }, [{}, {}, {}]), 0, "lista maior que a cota não vira -1");
});

test("prazo: o configurado, ou o fim do evento por padrão", () => {
  const a = acaoEv({ ativo: true });
  assert.equal(prazoInscricao(a.evento, a), "2026-05-15");
  assert.equal(prazoInscricao({ inscricoesAte: "2026-05-10" }, a), "2026-05-10");
});

test("podeInscrever: ativo, dentro do prazo e com vaga", () => {
  assert.equal(podeInscrever(acaoEv({ ativo: true }), "2026-05-10").ok, true);
  assert.equal(podeInscrever(acaoEv({ ativo: false }), "2026-05-10").ok, false, "página desativada fecha");
  assert.equal(podeInscrever(acaoEv(null), "2026-05-10").ok, false, "sem configuração não há evento");
  assert.equal(podeInscrever(acaoEv({ ativo: true }), "2026-05-15").ok, true, "no último dia ainda vale");
  const vencido = podeInscrever(acaoEv({ ativo: true }), "2026-05-16");
  assert.equal(vencido.ok, false);
  assert.match(vencido.motivo, /prazo/i);
  const cedo = podeInscrever(acaoEv({ ativo: true, inscricoesAte: "2026-05-01" }), "2026-05-10");
  assert.equal(cedo.ok, false, "o prazo configurado vence antes do fim do evento");
  const lotado = podeInscrever(acaoEv({ ativo: true, vagas: 1 }, [{ nome: "Ana" }]), "2026-05-10");
  assert.equal(lotado.ok, false);
  assert.match(lotado.motivo, /vagas/i);
  assert.equal(podeInscrever(acaoEv({ ativo: true, vagas: 0 }, [{}, {}, {}]), "2026-05-10").ok, true,
    "vagas 0 = ilimitado");
});

test("dedupe: CPF OU e-mail já inscrito barra a segunda inscrição", () => {
  const lista = [
    { nome: "Ana", cpf: "390.533.447-05", email: "ana@exemplo.com" },
    { nome: "Bia", matricula: "G123" },   // lançada à mão, sem CPF nem e-mail
  ];
  assert.ok(jaInscrito(lista, { cpf: "39053344705", email: "outra@exemplo.com" }), "mesmo CPF, formatação diferente");
  assert.ok(jaInscrito(lista, { cpf: "11144477735", email: "ANA@exemplo.com" }), "mesmo e-mail, outra caixa");
  assert.equal(jaInscrito(lista, { cpf: "11144477735", email: "novo@exemplo.com" }), null);
  assert.equal(jaInscrito(lista, { cpf: "", email: "" }), null, "vazio não casa com o registro sem CPF");
});
