/* Testes do núcleo das atas (numeração, normalização, validação) e do
   redator determinístico. Nada aqui toca em rede ou armazenamento. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  numeroAta, proximoSequencial, numerar, serieDe, siglaCurso, normalizarAta,
  validarAta, tituloDe, quorum, encaminhamentos, anotar, orgaoDe,
} from "../lib/atas.js";
import { extenso, dataExtenso, horaExtenso, redigirPorModelo, provedorAtivo, fichaDaReuniao } from "../lib/redator.js";
import { hojeLocalISO, somaDias } from "../lib/datas.js";

/* --------------------------------- fixtura ------------------------------ */
const ontem = () => somaDias(hojeLocalISO(), -1);

function bruta(extra = {}) {
  return {
    orgao: "NDE", curso: "enfermagem",
    sessao: { tipo: "ordinária", data: ontem(), horaInicio: "14:30", horaFim: "16:05", local: "Sala 12", modalidade: "presencial" },
    presidencia: { nome: "Profa. Camila", cargo: "Coordenadora" },
    secretaria: { nome: "Prof. Lucas", email: "Lucas@Uniego.edu.br" },
    participantes: [
      { nome: "Profa. Camila", condicao: "membro", presenca: "presente" },
      { nome: "Prof. Lucas", condicao: "membro", presenca: "presente" },
      { nome: "Profa. Marta", condicao: "membro", presenca: "justificada" },
    ],
    pauta: [{ titulo: "Matriz curricular", discussao: "Debateu-se a carga prática.", deliberacao: "Aprovada." }],
    ...extra,
  };
}
const nova = (extra) => normalizarAta(bruta(extra), { autor: "camila@uniego.edu.br" });

/* ------------------------------- numeração ------------------------------ */
test("número segue o formato oficial, com sigla de curso nos órgãos por curso", () => {
  assert.equal(numeroAta({ orgao: "NDE", curso: "enfermagem", ano: 2026, sequencial: 3 }), "ATA-NDE-ENF-2026-003");
  assert.equal(numeroAta({ orgao: "CONSU", ano: 2026, sequencial: 11 }), "ATA-CONSU-2026-011");
  assert.equal(numeroAta({ orgao: "COLEGIADO", curso: "direito", ano: 2025, sequencial: 1 }), "ATA-COL-DIR-2025-001");
});

test("curso desconhecido recebe sigla derivada do nome", () => {
  assert.equal(siglaCurso("teologia"), "TEO");
  assert.equal(siglaCurso(""), "GER");
  assert.equal(siglaCurso("psicologia"), "PSI");
});

test("séries de órgãos por curso são independentes", () => {
  const atas = [
    { orgao: "NDE", curso: "enfermagem", ano: 2026, numero: "x", sequencial: 4 },
    { orgao: "NDE", curso: "direito", ano: 2026, numero: "x", sequencial: 9 },
  ];
  assert.equal(proximoSequencial(atas, { orgao: "NDE", curso: "enfermagem", ano: 2026 }), 5);
  assert.equal(proximoSequencial(atas, { orgao: "NDE", curso: "direito", ano: 2026 }), 10);
  assert.equal(proximoSequencial(atas, { orgao: "NDE", curso: "psicologia", ano: 2026 }), 1);
  assert.equal(proximoSequencial(atas, { orgao: "NDE", curso: "enfermagem", ano: 2027 }), 1);
});

test("órgãos institucionais ignoram o curso na série", () => {
  assert.equal(serieDe({ orgao: "CONSU", curso: "direito", ano: 2026 }),
    serieDe({ orgao: "CONSU", curso: "enfermagem", ano: 2026 }));
});

test("rascunho não consome número e a numeração não se repete após exclusão", () => {
  const atas = [];
  const a1 = numerar(atas, nova()); atas.push(a1);
  assert.equal(a1.numero, "ATA-NDE-ENF-" + a1.ano + "-001");
  const a2 = numerar(atas, nova()); atas.push(a2);
  assert.equal(a2.sequencial, 2);
  atas.splice(0, 1);                      // apaga a primeira
  const a3 = numerar(atas, nova());
  assert.equal(a3.sequencial, 3, "o número da terceira ata não pode repetir o da primeira");
});

test("numerar é idempotente", () => {
  const atas = [];
  const a = numerar(atas, nova()); atas.push(a);
  assert.deepEqual(numerar(atas, a).numero, a.numero);
});

/* ----------------------------- normalização ----------------------------- */
test("normalização limpa e limita os campos livres", () => {
  const a = nova({ informes: "  linha  \n\n  outra  " });
  assert.equal(a.secretaria.email, "lucas@uniego.edu.br", "e-mail vai para minúsculas");
  assert.equal(a.informes, "linha\n\n  outra", "corta espaço no fim das linhas, preserva a indentação");
  assert.equal(a.participantes.length, 3);
  assert.equal(a.status, "rascunho");
  assert.equal(a.criadoPor, "camila@uniego.edu.br");
});

test("normalização descarta participantes e pontos sem nome/título", () => {
  const a = normalizarAta(bruta({
    participantes: [{ nome: "" }, { nome: "Fulano" }],
    pauta: [{ titulo: "" }, { titulo: "Válido" }],
  }));
  assert.equal(a.participantes.length, 1);
  assert.equal(a.pauta.length, 1);
});

test("normalização recusa valores fora das listas fechadas", () => {
  const a = normalizarAta(bruta({
    sessao: { ...bruta().sessao, tipo: "hacker", modalidade: "carta" },
    participantes: [{ nome: "X", condicao: "reitor", presenca: "talvez" }],
  }));
  assert.equal(a.sessao.tipo, "ordinária");
  assert.equal(a.sessao.modalidade, "presencial");
  assert.equal(a.participantes[0].condicao, "membro");
  assert.equal(a.participantes[0].presenca, "presente");
});

test("normalização preserva número, histórico e autoria da versão persistida", () => {
  const base = { ...nova(), id: "ata_1", numero: "ATA-NDE-ENF-2026-007", sequencial: 7, ano: 2026,
    criadoEm: "2026-01-01T00:00:00.000Z", criadoPor: "dono@uniego.edu.br", historico: [{ oQue: "x" }] };
  const a = normalizarAta({ ...bruta(), id: "outro", numero: "ATA-FALSA-1" }, { base, autor: "intruso@uniego.edu.br" });
  assert.equal(a.id, "ata_1");
  assert.equal(a.numero, "ATA-NDE-ENF-2026-007");
  assert.equal(a.criadoPor, "dono@uniego.edu.br");
  assert.equal(a.historico.length, 1);
});

/* ------------------------------- validação ------------------------------ */
test("ata completa passa na validação", () => {
  assert.deepEqual(validarAta(nova()), []);
});

test("validação cobra órgão, curso, data, presenças e pauta", () => {
  const vazia = normalizarAta({});
  const erros = validarAta(vazia).join(" ");
  for (const t of ["órgão", "data da sessão", "início", "local", "presidiu", "secretariou", "participantes", "pauta"]) {
    assert.ok(erros.toLowerCase().includes(t.toLowerCase()), `faltou cobrar "${t}" em: ${erros}`);
  }
});

test("comissão exige nome próprio e sessão futura é recusada", () => {
  const com = normalizarAta(bruta({ orgao: "COMISSAO", orgaoNome: "" }));
  assert.ok(validarAta(com).some((e) => e.includes("comissão")));
  const futura = normalizarAta(bruta({ sessao: { ...bruta().sessao, data: somaDias(hojeLocalISO(), 10) } }));
  assert.ok(validarAta(futura).some((e) => e.includes("futuro")));
});

test("dois presentes são o mínimo para haver sessão", () => {
  const so1 = normalizarAta(bruta({ participantes: [{ nome: "Só eu", presenca: "presente" }] }));
  assert.ok(validarAta(so1).some((e) => e.includes("dois participantes")));
});

/* ------------------------- apresentação e apoio ------------------------- */
test("título junta órgão e curso", () => {
  assert.equal(tituloDe(nova()), "Núcleo Docente Estruturante — Enfermagem");
  assert.equal(tituloDe(normalizarAta(bruta({ orgao: "CONSU", curso: "" }))), "Conselho Universitário");
  assert.equal(tituloDe(normalizarAta(bruta({ orgao: "COMISSAO", orgaoNome: "Comissão de Ética" }))), "Comissão de Ética");
});

test("quórum conta presentes, justificadas e convidados", () => {
  const q = quorum(nova());
  assert.deepEqual([q.total, q.presentes, q.justificadas, q.ausentes], [3, 2, 1, 0]);
});

test("encaminhamentos vencidos são marcados como atrasados", () => {
  const a = numerar([], nova({
    pauta: [
      { titulo: "P1", encaminhamento: { acao: "Enviar ofício", responsavel: "Camila", prazo: somaDias(hojeLocalISO(), -3) } },
      { titulo: "P2", encaminhamento: { acao: "Publicar edital", prazo: somaDias(hojeLocalISO(), 30) } },
      { titulo: "P3", deliberacao: "sem encaminhamento" },
    ],
  }));
  const e = encaminhamentos([a]);
  assert.equal(e.length, 2);
  assert.equal(e[0].atrasado, true);
  assert.equal(e[1].atrasado, false);
});

test("histórico é acumulado e limitado", () => {
  let a = nova();
  for (let i = 0; i < 80; i++) a = anotar(a, { quem: "x@y.z", oQue: "passo " + i });
  assert.equal(a.historico.length, 60);
  assert.equal(a.historico.at(-1).oQue, "passo 79");
});

/* -------------------------------- redator ------------------------------- */
test("números por extenso, com gênero", () => {
  assert.equal(extenso(0), "zero");
  assert.equal(extenso(14), "quatorze");
  assert.equal(extenso(31), "trinta e um");
  assert.equal(extenso(1, "f"), "uma");
  assert.equal(extenso(22, "f"), "vinte e duas");
});

test("data e hora por extenso seguem a fórmula das atas", () => {
  assert.equal(dataExtenso("2026-08-01"), "Ao primeiro dia do mês de agosto do ano de dois mil e vinte e seis");
  assert.equal(dataExtenso("2026-03-12"), "Aos doze dias do mês de março do ano de dois mil e vinte e seis");
  assert.equal(horaExtenso("14:30"), "às quatorze horas e trinta minutos");
  assert.equal(horaExtenso("09:00"), "às nove horas");
  assert.equal(horaExtenso("01:01"), "às uma hora e um minuto");
});

test("gerador determinístico produz ata com abertura, pauta e fecho", () => {
  const a = numerar([], nova({
    pauta: [{
      titulo: "Matriz curricular", discussao: "Debateu-se a carga prática.", deliberacao: "Aprovada.",
      votacao: { houve: true, favor: 4, contra: 0, abstencoes: 1 },
      encaminhamento: { acao: "Enviar à PROAC", responsavel: "Camila", prazo: "2026-09-10" },
    }],
  }));
  const t = redigirPorModelo(a);
  assert.ok(t.startsWith("Aos ") || t.startsWith("Ao primeiro"));
  assert.ok(t.includes("Núcleo Docente Estruturante do curso de Enfermagem"));
  assert.ok(t.includes("Profa. Camila"));
  assert.ok(t.includes("Justificou ausência Profa. Marta"));
  assert.ok(t.includes("1. MATRIZ CURRICULAR."));
  assert.ok(t.includes("uma abstenção"), "abstenção é feminina");
  assert.ok(t.includes("prazo até 10/09/2026"));
  assert.ok(t.includes("Nada mais havendo a tratar"));
  assert.ok(!/undefined|NaN|\[object/.test(t));
});

test("ata sem participantes ou pauta ainda gera texto (não quebra)", () => {
  const t = redigirPorModelo(normalizarAta({ orgao: "CONSU", sessao: { data: "2026-05-05" } }));
  assert.ok(t.includes("Nada mais havendo a tratar"));
  assert.ok(!/undefined|NaN/.test(t));
});

test("a ficha enviada à IA não inventa nem omite os dados da reunião", () => {
  const f = fichaDaReuniao(numerar([], nova()));
  assert.ok(f.includes("Núcleo Docente Estruturante — Enfermagem"));
  assert.ok(f.includes("Profa. Marta"));
  assert.ok(f.includes("PONTO 1: Matriz curricular"));
  assert.ok(f.includes("Quórum: 2 presentes"));
});

test("sem chave de API o provedor é o gerador local", () => {
  const g = process.env.GEMINI_API_KEY, a = process.env.ANTHROPIC_API_KEY, e = process.env.ATA_IA;
  delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.ATA_IA;
  try {
    assert.equal(provedorAtivo(), "modelo");
    process.env.ATA_IA = "gemini";
    assert.equal(provedorAtivo(), "modelo", "ATA_IA=gemini sem chave não pode quebrar o setor");
    process.env.GEMINI_API_KEY = "k";
    assert.equal(provedorAtivo(), "gemini");
  } finally {
    if (g) process.env.GEMINI_API_KEY = g; else delete process.env.GEMINI_API_KEY;
    if (a) process.env.ANTHROPIC_API_KEY = a; else delete process.env.ANTHROPIC_API_KEY;
    if (e) process.env.ATA_IA = e; else delete process.env.ATA_IA;
  }
});

test("órgãos conhecidos têm sigla e o desconhecido não resolve", () => {
  assert.equal(orgaoDe("consu").sigla, "CONSU");
  assert.equal(orgaoDe("PROAC").nome, "Pró-Reitoria Acadêmica");
  assert.equal(orgaoDe("inexistente"), null);
});

/* ------------------------- documentos da sessão -------------------------- */
test("ata e lista de presença geram PDF válido, com anexos listados", async () => {
  const { gerarAtaPdf, gerarPresencaPdf } = await import("../lib/pdf.js");
  const a = numerar([], nova({
    pauta: [{ titulo: "Atualização do PPC", pautaMec: "nde-ppc", deliberacao: "Aprovada." }],
  }));
  a.texto = redigirPorModelo(a);
  a.anexos = [{ name: "parecer-01.pdf", link: "/api/files/x", em: "2026-08-10T12:00:00.000Z" }];
  for (const [rot, gerar] of [["ata", gerarAtaPdf], ["presença", gerarPresencaPdf]]) {
    const buf = await gerar(a);
    assert.ok(Buffer.isBuffer(buf), `${rot} não devolveu Buffer`);
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-", `${rot} não é PDF`);
    assert.ok(buf.length > 3000, `${rot} saiu pequeno demais (${buf.length} bytes)`);
  }
});

test("a lista de presença não quebra com ata mínima (sem pauta nem participantes)", async () => {
  const { gerarPresencaPdf } = await import("../lib/pdf.js");
  const vazia = normalizarAta({ orgao: "CONSU", sessao: { data: "2026-05-05" } });
  const buf = await gerarPresencaPdf(vazia);
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
});

/* ----------------------- órgãos não previstos ---------------------------- */
test("há escape para órgão não listado, no curso e no institucional", () => {
  const doCurso = orgaoDe("OUTRO_CURSO"), institucional = orgaoDe("OUTRO");
  assert.equal(doCurso.porCurso, true);
  assert.equal(institucional.porCurso, false);
  for (const o of [doCurso, institucional]) assert.equal(o.nomeLivre, true, "exige nome próprio");
});

test("órgão não previsto exige nome e recebe número na própria série", () => {
  const semNome = normalizarAta(bruta({ orgao: "OUTRO_CURSO", orgaoNome: "" }));
  assert.ok(validarAta(semNome).some((e) => e.includes("nome do órgão")));

  const nucleo = normalizarAta(bruta({ orgao: "OUTRO_CURSO", orgaoNome: "Núcleo de Práticas Jurídicas", curso: "direito" }));
  assert.deepEqual(validarAta(nucleo), []);
  const numerada = numerar([], nucleo);
  assert.equal(numerada.numero, `ATA-ORG-DIR-${numerada.ano}-001`);
  assert.equal(tituloDe(numerada), "Núcleo de Práticas Jurídicas — Direito");

  const camara = normalizarAta(bruta({ orgao: "OUTRO", orgaoNome: "Câmara de Pós-Graduação", curso: "direito" }));
  assert.equal(camara.curso, "", "órgão institucional não carrega curso");
  assert.equal(numerar([], camara).numero, `ATA-ORG-${camara.ano}-001`);
});

/* --------------------- identidade institucional por data ---------------- */
test("ata anterior à transformação sai como FACEG; posterior, como UNIEGO", async () => {
  const { marcaEm, UNIEGO_DESDE } = await import("../lib/marca.js");
  const { somaDias: menos } = await import("../lib/datas.js");
  assert.equal(marcaEm(menos(UNIEGO_DESDE, -1)).codigo, "faceg");
  assert.equal(marcaEm(UNIEGO_DESDE).codigo, "uniego");
  assert.equal(marcaEm(null).codigo, "uniego", "sem data, vale a identidade de hoje");
  assert.equal(marcaEm("data inválida").codigo, "uniego");
});

test("o texto da ata nomeia a instituição vigente na data da sessão", () => {
  const em = (data) => redigirPorModelo(normalizarAta({
    orgao: "NDE", curso: "psicologia",
    sessao: { data, horaInicio: "14:00", local: "Sala 4" },
    presidencia: { nome: "P" }, secretaria: { nome: "S" },
    participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
    pauta: [{ titulo: "Ponto" }],
  }));
  assert.match(em("2024-05-10"), /na Faculdade Evangélica de Goianésia/);
  assert.ok(!/UNIEGO/.test(em("2024-05-10")), "ata da FACEG não pode citar a UNIEGO");
  assert.match(em("2026-08-10"), /no Centro Universitário Evangélico de Goianésia/);
});

test("cada PDF sai com o timbre da sua época, e o texto da pauta regulatória é válido", async () => {
  const { gerarAtaPdf } = await import("../lib/pdf.js");
  const mk = (data) => {
    const a = numerar([], normalizarAta({
      orgao: "NDE", curso: "psicologia",
      sessao: { data, horaInicio: "14:00", local: "Sala 4" },
      presidencia: { nome: "P" }, secretaria: { nome: "S" },
      participantes: [{ nome: "A", presenca: "presente" }, { nome: "B", presenca: "presente" }],
      pauta: [{ titulo: "PPC", pautaMec: "nde-ppc", deliberacao: "Aprovada." }],
    }));
    a.texto = redigirPorModelo(a);
    return a;
  };
  for (const data of ["2024-05-10", "2026-08-10"]) {
    const buf = await gerarAtaPdf(mk(data));
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buf.length > 3000);
    assert.ok(!buf.includes(Buffer.from("undefined")), `PDF de ${data} traz "undefined"`);
  }
});

test("a data de corte é a da publicação da Portaria MEC nº 623/2025", async () => {
  const { UNIEGO_DESDE, CREDENCIAMENTO, marcaEm } = await import("../lib/marca.js");
  assert.equal(UNIEGO_DESDE, "2025-09-05");
  assert.match(CREDENCIAMENTO.ato, /Portaria MEC nº 623, de 5 de setembro de 2025/);
  assert.equal(marcaEm("2025-09-04").sigla, "FACEG", "véspera da publicação ainda é FACEG");
  assert.equal(marcaEm("2025-09-05").sigla, "UNIEGO", "no dia da publicação já é UNIEGO");
});
