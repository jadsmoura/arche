/* Certificados de EVENTO emitidos pelo ARCHÉ.
   O que se protege aqui é o que o documento afirma: quem tem direito, com
   quantas horas, com que assinaturas — e, antes de tudo, QUANDO ele passa a
   existir (só depois de a PROPPEX validar o encerramento). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSINANTES_EVENTO, assinanteDoEventoValido, assinaturasDoCertificado,
  certificadoDe, certificadosDePessoa, certificadosDoEvento, chDoParticipante,
  codigoCertificadoEvento, eventoCertificavel, eventoEncerrado, podeEncerrar,
  programacaoDoCertificado, situacaoEncerramento,
} from "../lib/certificadosEv.js";

const CPF_A = "52998224725", CPF_B = "11144477735";

const acao = (extra = {}) => ({
  id: "ext-1", numeroAcao: "EXT-2026-010", curso: "enfermagem",
  proposta: { nomeAtividade: "Semana de Enfermagem", periodoInicio: "2026-08-10",
    periodoFim: "2026-08-12", local: "Auditório", municipio: "Goianésia/GO", cargaHoraria: "8" },
  participantes: {
    inscritos: [
      { nome: "Ana", cpf: CPF_A, email: "ana@x.com", presente: true,
        presencas: [{ atividade: "aaaa0001", em: "2026-08-10T13:00:00Z" }] },
      { nome: "Bruno", cpf: CPF_B, email: "bruno@x.com", presente: false },
    ],
    palestrantes: [{ nome: "Dra. Clara", cpf: "", email: "clara@x.com", palestra: "Cuidado e evidência", ch: "2" }],
    comissao: [{ nome: "Prof. Davi", cpf: "", email: "davi@x.com", papel: "coordenacao", funcao: "" }],
  },
  evento: {
    slug: "semana-de-enfermagem",
    programacao: [
      { id: "aaaa0001", titulo: "Abertura", dia: "2026-08-10", horaInicio: "19:00", horaFim: "21:00", ch: "2", local: "Auditório" },
      { id: "aaaa0002", titulo: "Oficina", dia: "2026-08-11", horaInicio: "14:00", ch: "4", local: "Lab 2" },
    ],
    encerramento: { status: "validado" },
    ...extra,
  },
});

/* ------------------------------ o encerramento --------------------------- */

test("o certificado não existe antes de a PROPPEX validar o encerramento", () => {
  const aberto = acao({ encerramento: null });
  assert.equal(situacaoEncerramento(aberto), "aberto");
  assert.equal(eventoCertificavel(aberto, "2026-08-20").ok, false);
  assert.equal(certificadosDoEvento(aberto, { hoje: "2026-08-20" }).length, 0);

  const pedido = acao({ encerramento: { status: "solicitado" } });
  const r = eventoCertificavel(pedido, "2026-08-20");
  assert.equal(r.ok, false);
  assert.match(r.motivo, /aguarda a validação/i);

  const devolvido = acao({ encerramento: { status: "devolvido" } });
  assert.match(eventoCertificavel(devolvido, "2026-08-20").motivo, /devolveu/i);

  assert.equal(eventoCertificavel(acao(), "2026-08-20").ok, true);
  assert.equal(eventoEncerrado(acao()), true);
});

test("encerrar só depois de o evento acontecer, e uma vez só", () => {
  const antes = acao({ encerramento: null });
  assert.equal(podeEncerrar(antes, "2026-08-11").ok, false, "no meio do evento ainda não");
  assert.equal(podeEncerrar(antes, "2026-08-12").ok, true, "no último dia, sim");
  assert.equal(podeEncerrar(acao({ encerramento: { status: "solicitado" } }), "2026-08-20").ok, false);
  assert.equal(podeEncerrar(acao(), "2026-08-20").ok, false, "já encerrado não reencerra");
  const semNumero = { ...acao({ encerramento: null }), numeroAcao: "" };
  assert.match(podeEncerrar(semNumero, "2026-08-20").motivo, /aprovado/i);
});

/* --------------------------- quem tem direito ---------------------------- */

test("participante certifica com presença; sem controle, todo inscrito", () => {
  const c = certificadosDoEvento(acao(), { hoje: "2026-08-20" });
  const nomes = c.filter((x) => x.tipo === "participante").map((x) => x.pessoa);
  assert.deepEqual(nomes, ["Ana"], "Bruno não foi credenciado");

  const semControle = acao({ controleFrequencia: false, encerramento: { status: "validado" } });
  const c2 = certificadosDoEvento(semControle, { hoje: "2026-08-20" })
    .filter((x) => x.tipo === "participante").map((x) => x.pessoa);
  assert.deepEqual(c2, ["Ana", "Bruno"], "sem controle, a inscrição é a presença");
});

test("palestrante e comissão saem com o seu papel — e o coordenador entra", () => {
  const c = certificadosDoEvento(acao(), { hoje: "2026-08-20" });
  const pal = c.find((x) => x.tipo === "palestrante");
  assert.equal(pal.pessoa, "Dra. Clara");
  assert.equal(pal.palestra, "Cuidado e evidência");
  const com = c.find((x) => x.tipo === "comissao");
  assert.equal(com.pessoa, "Prof. Davi");
  assert.equal(com.papel, "Coordenação do evento");
});

test("a carga horária do participante é a das atividades em que ele esteve", () => {
  const a = acao();
  assert.equal(chDoParticipante(a, a.participantes.inscritos[0]), 2, "só a abertura, de 2h");
  // sem presença por atividade, vale a CH da ação
  assert.equal(chDoParticipante(a, { nome: "X", presencas: [] }), 8);
  // duas atividades somam
  assert.equal(chDoParticipante(a, { presencas: [{ atividade: "aaaa0001" }, { atividade: "aaaa0002" }] }), 6);
});

test("o código de validação é estável para o mesmo documento e muda para outro", () => {
  const k = (tipo, pessoa) => codigoCertificadoEvento({ acaoId: "ext-1", tipo, pessoa });
  assert.equal(k("participante", "Ana"), k("participante", "Ana"));
  assert.notEqual(k("participante", "Ana"), k("comissao", "Ana"));
  assert.notEqual(k("participante", "Ana"), k("participante", "Bruno"));
  assert.match(k("participante", "Ana"), /^[0-9A-F]{10}$/);
});

/* ------------------------------ a pessoa --------------------------------- */

test("o certificado de uma pessoa vem por CPF, e-mail ou nome", () => {
  const a = acao();
  assert.equal(certificadoDe(a, { cpf: CPF_A }, { hoje: "2026-08-20" }).pessoa, "Ana");
  assert.equal(certificadoDe(a, { email: "clara@x.com" }, { hoje: "2026-08-20" }).tipo, "palestrante");
  assert.equal(certificadoDe(a, { email: "davi@x.com" }, { hoje: "2026-08-20" }).tipo, "comissao");
  // o NOME só casa quem não tem chave forte — é o caso dos registros antigos
  const semChave = { ...a, participantes: { ...a.participantes,
    comissao: [{ nome: "Elza Antiga", papel: "apoio" }] } };
  assert.equal(certificadoDe(semChave, { nome: "elza  antiga" }, { hoje: "2026-08-20" }).tipo, "comissao");
  assert.equal(certificadoDe(a, { nome: "Prof. Davi" }, { hoje: "2026-08-20" }), null,
    "quem tem e-mail no registro não é encontrado só pelo nome");
  assert.equal(certificadoDe(a, { cpf: CPF_B }, { hoje: "2026-08-20" }), null, "sem presença, sem certificado");
  assert.equal(certificadoDe(a, { email: "ninguem@x.com" }, { hoje: "2026-08-20" }), null);
});

test("o histórico reúne os eventos da pessoa, do mais novo para o mais antigo", () => {
  const velho = { ...acao(), id: "ext-0",
    proposta: { ...acao().proposta, nomeAtividade: "Jornada 2025", periodoFim: "2025-05-10" } };
  const lista = certificadosDePessoa([acao(), velho], { cpf: CPF_A }, { hoje: "2026-08-20" });
  assert.deepEqual(lista.map((c) => c.evento), ["Semana de Enfermagem", "Jornada 2025"]);
  // e não vaza o certificado de outra pessoa
  assert.equal(certificadosDePessoa([acao()], { cpf: CPF_B }, { hoje: "2026-08-20" }).length, 0);
});

/* ----------------------------- as assinaturas ---------------------------- */

test("assinatura sem imagem não aparece — nem deixa linha em branco", () => {
  const a = acao({
    encerramento: { status: "validado" },
    assinaturas: {
      coordenacao: { nome: "Prof. Davi", cargo: "Coordenação", base64: "AAA" },
      organizador: { nome: "Sem imagem", cargo: "Responsável" },   // não enviou a arte
    },
  });
  const inst = { proreitor: { nome: "Pró-Reitor", cargo: "PROPPEX", img: Buffer.from("x") } };
  const assinam = assinaturasDoCertificado(a, inst);
  assert.deepEqual(assinam.map((x) => x.chave), ["coordenacao", "proreitor"]);
  // a ordem do catálogo é a ordem do documento
  assert.deepEqual(ASSINANTES_EVENTO.map((x) => x.chave),
    ["organizador", "coordenacao", "proreitor", "reitor"]);
  assert.equal(assinanteDoEventoValido("coordenacao"), true);
  assert.equal(assinanteDoEventoValido("reitor"), false, "a institucional não se envia por evento");
  assert.equal(assinaturasDoCertificado({ evento: {} }, {}).length, 0);
});

/* -------------------------------- o verso -------------------------------- */

test("o verso traz a programação em ordem de dia e hora", () => {
  const prog = programacaoDoCertificado(acao());
  assert.deepEqual(prog.map((p) => p.titulo), ["Abertura", "Oficina"]);
  assert.equal(prog[0].ch, 2);
  assert.equal(prog[1].dia, "2026-08-11");
  assert.deepEqual(programacaoDoCertificado({ evento: {} }), []);
});
