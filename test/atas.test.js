/* Testes do núcleo das atas (numeração, normalização, validação) e do
   redator determinístico. Nada aqui toca em rede ou armazenamento. */
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import {
  numeroAta, proximoSequencial, numerar, serieDe, siglaCurso, normalizarAta,
  validarAta, tituloDe, quorum, encaminhamentos, anotar, orgaoDe, avisosDaAta,
} from "../lib/atas.js";
import { extenso, dataExtenso, horaExtenso, redigirPorModelo, provedorAtivo, fichaDaReuniao,
  ESTILOS, estiloDe, estiloPadrao, instrucaoDe } from "../lib/redator.js";
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
  for (const t of ["órgão", "data da sessão", "início", "local", "presidiu", "participantes", "pauta"]) {
    assert.ok(erros.toLowerCase().includes(t.toLowerCase()), `faltou cobrar "${t}" em: ${erros}`);
  }
  assert.ok(!/secretari/i.test(erros), "a secretaria é opcional e não pode travar a ata");
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

/* Lê de volta o que foi desenhado no PDF: cada trecho de texto com a posição
   em que o PDFKit o escreveu. Serve para conferir o desenho das colunas, que
   é onde nome e cargo longos se sobrepunham. */
function trechosDoPdf(buf) {
  const s = buf.toString("latin1"), fora = [];
  const re = /stream\r?\n/g;
  let m, pagina = 0;
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length, fim = s.indexOf("endstream", ini);
    let t;
    try { t = zlib.inflateSync(Buffer.from(s.slice(ini, fim), "latin1")).toString("latin1"); } catch { continue; }
    if (!t.includes("Tm")) continue;             // fluxo sem texto (imagem, fonte)
    pagina += 1;                                 // cada página tem o seu fluxo
    let x = 0, y = 0;
    for (const linha of t.split("\n")) {
      const tm = linha.match(/^1 0 0 1 ([\d.-]+) ([\d.-]+) Tm$/);
      if (tm) { x = +tm[1]; y = +tm[2]; continue; }
      if (!/T[Jj]$/.test(linha.trim())) continue;
      const txt = [...linha.matchAll(/<([0-9a-fA-F]+)>/g)]
        .map((h) => Buffer.from(h[1], "hex").toString("latin1")).join("");
      if (txt.trim()) fora.push({ pagina, x, y, txt });
    }
  }
  return fora;
}

test("nome e cargo longos não sobrepõem linhas no quadro de presença", async () => {
  const { gerarAtaPdf, gerarPresencaPdf } = await import("../lib/pdf.js");
  const longo = "Maria Aparecida dos Santos Silva Pereira Gonçalves de Albuquerque Vasconcelos";
  const a = numerar([], nova({
    presidencia: { nome: longo, cargo: "Coordenação do Curso de Enfermagem" },
    participantes: [
      { nome: longo, condicao: "membro", cargo: "Coordenação de Ação Comunitária e Extensão Universitária", presenca: "presente" },
      { nome: "Ana", condicao: "convidado", presenca: "justificada" },
      { nome: longo, condicao: "suplente", cargo: "Núcleo Docente Estruturante", presenca: "presente" },
    ],
  }));
  a.texto = redigirPorModelo(a);

  for (const [rot, gerar] of [["ata", gerarAtaPdf], ["presença", gerarPresencaPdf]]) {
    const porColuna = new Map();
    for (const t of trechosDoPdf(await gerar(a))) {
      const col = `${t.pagina}:${Math.round(t.x)}`;
      if (!porColuna.has(col)) porColuna.set(col, []);
      porColuna.get(col).push(t);
    }
    for (const [col, trechos] of porColuna) {
      trechos.sort((p, q) => q.y - p.y);
      for (let i = 1; i < trechos.length; i++) {
        const dist = trechos[i - 1].y - trechos[i].y;
        assert.ok(dist >= 8,
          `${rot}: "${trechos[i - 1].txt}" e "${trechos[i].txt}" a ${dist.toFixed(1)}pt na coluna ${col}`);
      }
    }
  }
});

test("secretaria em branco some da ata; preenchida, aparece nos três lugares", async () => {
  const { gerarAtaPdf, gerarPresencaPdf } = await import("../lib/pdf.js");
  const monta = (secretaria) => {
    const a = numerar([], normalizarAta(bruta({ secretaria })));
    a.texto = redigirPorModelo(a);
    return a;
  };
  const escritoEm = async (gerar, a) => trechosDoPdf(await gerar(a)).map((t) => t.txt).join(" ");

  const semNome = monta({ nome: "", email: "" });
  assert.deepEqual(validarAta(semNome), [], "sem secretaria a ata continua válida");
  assert.ok(!/secretari/i.test(semNome.texto), `o texto citou a secretaria: ${semNome.texto}`);
  assert.match(semNome.texto, /da qual se lavrou a presente ata/, "falta a forma impessoal do fecho");
  for (const gerar of [gerarAtaPdf, gerarPresencaPdf]) {
    assert.ok(!/Secretaria/i.test(await escritoEm(gerar, semNome)), "o PDF trouxe o campo vazio");
  }

  const com = monta({ nome: "Prof. Lucas", email: "" });
  assert.match(com.texto, /secretariada por Prof\. Lucas/);
  assert.match(com.texto, /da qual eu, Prof\. Lucas, lavrei/);
  const naAta = await escritoEm(gerarAtaPdf, com);
  assert.match(naAta, /Secretaria: *Prof\. Lucas/, "falta no quadro de identificação");
  assert.match(naAta, /Secretaria da sessão/, "falta a linha de assinatura");
  assert.match(await escritoEm(gerarPresencaPdf, com), /Secretaria da sessão/);
});

test("a ata não carrega o rodapé de procedência do sistema", async () => {
  const { gerarAtaPdf } = await import("../lib/pdf.js");
  const a = numerar([], nova({}));
  a.texto = redigirPorModelo(a);
  a.redacao = { provedor: "gemini" };
  a.registro = { em: "2026-08-10T12:00:00.000Z" };
  const escrito = trechosDoPdf(await gerarAtaPdf(a)).map((t) => t.txt).join(" ");
  // o documento é do órgão: situação e provedor da minuta ficam só na tela
  assert.ok(!/emitido pelo ARCH/.test(escrito), "a ata voltou a citar o ARCHÉ como emissor");
  assert.ok(!/minuta redigida por/.test(escrito), "a ata voltou a citar o provedor da minuta");
  assert.ok(!/situação:/.test(escrito), "a ata voltou a citar a situação do registro");
  assert.match(escrito, /ATA DE REUNI/, "o extrator não leu o texto do PDF");
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

/* ------------------------------ permissões ------------------------------ */
test("cada um vê só as atas que registrou; a gestão vê todas", async () => {
  const { podeVerAta } = await import("../lib/atas.js");
  const ata = {
    criadoPor: "camila@uniego.edu.br",
    secretaria: { email: "lucas@uniego.edu.br" },
    participantes: [{ nome: "Marta", email: "marta@uniego.edu.br" }],
    status: "registrada",
  };
  assert.equal(podeVerAta({ email: "camila@uniego.edu.br" }, ata), true, "quem registrou vê");
  assert.equal(podeVerAta({ email: "lucas@uniego.edu.br" }, ata), false,
    "constar como secretaria não dá acesso ao acervo do colega");
  assert.equal(podeVerAta({ email: "marta@uniego.edu.br" }, ata), false,
    "ter participado da sessão não dá acesso");
  assert.equal(podeVerAta({ email: "outro@uniego.edu.br" }, ata), false);
  assert.equal(podeVerAta({ email: "qualquer@uniego.edu.br", gestao: true }, ata), true,
    "a PROPPEX vê tudo");
  assert.equal(podeVerAta({}, ata), false, "sem e-mail, nada");
  assert.equal(podeVerAta({ email: "camila@uniego.edu.br" }, null), false);
});

test("quem vê a ata edita, inclusive depois de registrada", async () => {
  const { podeEditarAta, STATUS } = await import("../lib/atas.js");
  const dono = { email: "camila@uniego.edu.br" };
  const gestor = { email: "proppex@uniego.edu.br", gestao: true };
  const base = { criadoPor: "camila@uniego.edu.br" };

  for (const status of STATUS) {
    assert.equal(podeEditarAta(dono, { ...base, status }), true,
      `quem lavrou corrige em ${status} — erro em ata aparece meses depois`);
    assert.equal(podeEditarAta(gestor, { ...base, status }), true, `a PROPPEX corrige em ${status}`);
  }
  assert.equal(podeEditarAta({ email: "outro@uniego.edu.br" }, { ...base, status: "rascunho" }), false,
    "quem não vê a ata também não a edita");
  assert.equal(podeEditarAta(dono, null), false);
});

test("o fluxo tem três situações e as extintas migram para minuta", async () => {
  const { STATUS, statusVigente, normalizarAta } = await import("../lib/atas.js");
  assert.deepEqual(STATUS, ["rascunho", "minuta", "registrada"]);
  assert.equal(statusVigente("revisao"), "minuta");
  assert.equal(statusVigente("aprovada"), "minuta");
  for (const s of STATUS) assert.equal(statusVigente(s), s, `${s} não pode ser remapeado`);

  // ata gravada no fluxo antigo, ao ser normalizada, cai numa situação válida
  const antiga = normalizarAta({ ...bruta(), status: "aprovada" });
  assert.equal(antiga.status, "minuta");
  const registrada = normalizarAta({ ...bruta(), status: "registrada" });
  assert.equal(registrada.status, "registrada", "o que já estava registrado continua registrado");
});

/* ------------------- avisos antes de registrar --------------------------- */
/* `validarAta` diz o que FALTA e trava; `avisosDaAta` diz o que está
   ESTRANHO e não trava. Registrar é ato do órgão — o sistema aponta a
   incoerência e deixa a decisão com quem se reuniu. */
test("ata coerente não gera aviso nenhum", () => {
  assert.deepEqual(avisosDaAta(nova()), []);
});

test("quem presidiu ou secretariou tem de constar como presente", () => {
  const a = nova({ presidencia: { nome: "Prof. Fantasma", cargo: "Coordenador" } });
  const tipos = avisosDaAta(a).map((x) => x.tipo);
  assert.ok(tipos.includes("presidencia-ausente"));
  // ausente na lista também conta como não presente
  const b = nova({
    participantes: [
      { nome: "Profa. Camila", condicao: "membro", presenca: "presente" },
      { nome: "Prof. Lucas", condicao: "membro", presenca: "ausente" },
      { nome: "Profa. Marta", condicao: "membro", presenca: "presente" },
    ],
  });
  assert.ok(avisosDaAta(b).some((x) => x.tipo === "secretaria-ausente"));
});

test("votos não podem passar do número de presentes", () => {
  const a = nova({ pauta: [{ titulo: "Reforma do PPC", discussao: "d", deliberacao: "Aprovada.",
    votacao: { houve: true, favor: 5, contra: 1, abstencoes: 0 } }] });
  const av = avisosDaAta(a).find((x) => x.tipo === "votos-acima-do-quorum");
  assert.ok(av, "6 votos com 2 presentes tem de avisar");
  assert.match(av.texto, /6 voto\(s\) registrado\(s\) para 2 presente\(s\)/);
  // votação marcada e zerada é o outro engano comum
  const b = nova({ pauta: [{ titulo: "X", discussao: "d", deliberacao: "ok",
    votacao: { houve: true, favor: 0, contra: 0, abstencoes: 0 } }] });
  assert.ok(avisosDaAta(b).some((x) => x.tipo === "votacao-sem-votos"));
});

test("discussão sem deliberação e encaminhamento sem prazo aparecem", () => {
  const a = nova({ pauta: [
    { titulo: "Calendário", discussao: "Debateu-se o calendário.", deliberacao: "" },
    { titulo: "Estágio", discussao: "d", deliberacao: "Aprovado.",
      encaminhamento: { acao: "Revisar o convênio", responsavel: "", prazo: "" } },
  ] });
  const av = avisosDaAta(a);
  assert.ok(av.some((x) => x.tipo === "sem-deliberacao" && x.ponto === 1));
  const enc = av.find((x) => x.tipo === "encaminhamento-incompleto");
  assert.equal(enc.ponto, 2);
  assert.match(enc.texto, /sem responsável e sem prazo/);
  // encaminhamento completo não avisa
  assert.ok(!avisosDaAta(nova({ pauta: [{ titulo: "T", discussao: "d", deliberacao: "ok",
    encaminhamento: { acao: "a", responsavel: "Lucas", prazo: "2026-12-01" } }] }))
    .some((x) => x.tipo === "encaminhamento-incompleto"));
});

test("aviso não é erro: a ata com avisos continua válida", () => {
  const a = nova({ sessao: { ...bruta().sessao, horaFim: "" } });
  assert.ok(avisosDaAta(a).some((x) => x.tipo === "sem-encerramento"));
  assert.deepEqual(validarAta(a), [], "o horário de término não é obrigatório");
});

/* --------------------- extensão da redação ------------------------------ */
/* Três graus de elaboração. O que muda são as fórmulas de procedimento —
   o conteúdo é sempre o mesmo, e o texto que o autor digitou entra inteiro.
   É essa a linha que separa "elaborar" de "inventar". */
const comPauta = () => nova({ pauta: [{
  titulo: "Atualização da matriz curricular",
  discussao: "A carga prática de Fitotecnia está abaixo do recomendado pelas DCN.",
  deliberacao: "Aprovado o acréscimo de 30 horas práticas em Fitotecnia II.",
  votacao: { houve: true, favor: 2, contra: 0, abstencoes: 0 },
  encaminhamento: { acao: "Encaminhar a minuta ao Colegiado", responsavel: "Prof. Lucas", prazo: "2026-09-15" },
}] });

test("o catálogo de estilos é íntegro e o padrão vem do ambiente", () => {
  assert.deepEqual(ESTILOS.map((e) => e.codigo), ["concisa", "padrao", "detalhada"]);
  for (const e of ESTILOS) assert.ok(e.nome && e.desc, `${e.codigo} sem nome ou descrição`);
  assert.equal(estiloDe("DETALHADA")?.codigo, "detalhada", "aceita o código em qualquer caixa");
  assert.equal(estiloDe("prolixa"), null, "estilo inventado não passa");
  const antes = process.env.ATA_ESTILO;
  process.env.ATA_ESTILO = "concisa";
  assert.equal(estiloPadrao(), "concisa");
  process.env.ATA_ESTILO = "inexistente";
  assert.equal(estiloPadrao(), "detalhada", "valor inválido cai no padrão institucional");
  if (antes === undefined) delete process.env.ATA_ESTILO; else process.env.ATA_ESTILO = antes;
});

test("a redação detalhada é mais longa que a padrão, e a padrão que a concisa", () => {
  const a = comPauta();
  const tam = (estilo) => redigirPorModelo(a, { estilo }).split(/\s+/).length;
  assert.ok(tam("detalhada") > tam("padrao"), "detalhada desenvolve mais");
  assert.ok(tam("padrao") > tam("concisa"), "padrão escreve as fórmulas por extenso");
});

test("elaborar não é reescrever: o texto do autor entra inteiro, letra por letra", () => {
  const a = comPauta();
  const p = a.pauta[0];
  for (const estilo of ["concisa", "padrao", "detalhada"]) {
    const t = redigirPorModelo(a, { estilo });
    assert.ok(t.includes(p.discussao), `${estilo}: a nota da discussão sai como foi digitada`);
    assert.ok(t.includes(p.deliberacao), `${estilo}: a deliberação sai como foi digitada`);
    assert.ok(t.includes(p.encaminhamento.acao), `${estilo}: o encaminhamento sai como foi digitado`);
  }
});

test("a fórmula só aparece quando o campo existe — ata não inventa debate", () => {
  const semNotas = nova({ pauta: [{ titulo: "Comunicação da presidência", discussao: "", deliberacao: "" }] });
  const t = redigirPorModelo(semNotas, { estilo: "detalhada" });
  assert.ok(!/Aberta a discussão/.test(t), "sem nota, não se afirma que houve debate");
  assert.ok(!/o colegiado deliberou/.test(t), "sem deliberação, não se afirma que houve decisão");
  assert.match(t, /COMUNICAÇÃO DA PRESIDÊNCIA/, "o ponto continua na ata");
  // e a votação zerada não inventa "votos computados"
  assert.ok(!/votos computados/.test(t));
});

test("a instrução da IA leva a orientação do estilo sem afrouxar a regra de não inventar", () => {
  for (const e of ESTILOS) {
    const i = instrucaoDe(e.codigo);
    assert.match(i, /Use EXCLUSIVAMENTE os fatos da ficha/, `${e.codigo}: a regra 2 é inegociável`);
    assert.match(i, /EXTENSÃO:/, `${e.codigo}: a instrução diz a extensão`);
  }
  assert.match(instrucaoDe("detalhada"), /proibido acrescentar fato novo/i);
  assert.match(instrucaoDe("concisa"), /concisa/i);
  // estilo desconhecido não deixa a instrução sem orientação nenhuma
  assert.match(instrucaoDe("qualquer"), /EXTENSÃO: padrão/);
});
