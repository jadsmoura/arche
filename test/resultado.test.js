/* Resultado do processo seletivo em PDF: o documento que a PROPPEX publica e
   arquiva ao fim de um edital. O que se cobra aqui é o que o documento não
   pode errar — os dois quadros de classificação (doutores e geral), a ordem
   pela nota final, o que foi concedido e a contagem do resumo. */
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

/* Lê de volta o texto desenhado no PDF, na ordem em que foi escrito. */
function textoDoPdf(buf) {
  const s = buf.toString("latin1"), fora = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length, fim = s.indexOf("endstream", ini);
    let t;
    try { t = zlib.inflateSync(Buffer.from(s.slice(ini, fim), "latin1")).toString("latin1"); } catch { continue; }
    if (!t.includes("Tm")) continue;
    for (const linha of t.split("\n")) {
      if (!/T[Jj]$/.test(linha.trim())) continue;
      const txt = [...linha.matchAll(/<([0-9a-fA-F]+)>/g)]
        .map((h) => Buffer.from(h[1], "hex").toString("latin1")).join("");
      if (txt.trim()) fora.push(txt);
    }
  }
  return fora;
}

const EDITAL = { numero: "01/2026", vigencia: { inicio: "2026-09-01", fim: "2027-08-31" } };

const proj = (extra) => ({
  numero: "IC-2026-001", titulo: "Micorrizas e produtividade do milho", curso: "agronomia",
  linha: "ic", status: "aprovado", orientador: { nome: "Profa. Renata", titulacao: "doutor" },
  alunos: [{ nome: "Marcos" }],
  ...extra,
});

test("o resultado sai em PDF, com o resumo e a nota final somada", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL, emitidoPor: "proppex@uniego.edu.br",
    projetos: [
      proj({ fomento: { tipo: "cnpq", modalidade: "pibic-cnpq" }, classificacao: { np: 86, cl: 64.4, total: 150.4 } }),
      proj({ numero: "IC-2026-002", titulo: "Compostagem de resíduos", status: "submetido",
        orientador: { nome: "Prof. Caio", titulacao: "mestre" } }),
      proj({ numero: "IC-2026-003", titulo: "Leitura no ensino médio", status: "reprovado",
        orientador: { nome: "Profa. Lia", titulacao: "mestre" } }),
    ],
  });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 2000);
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");

  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /RESULTADO DO PROCESSO SELETIVO/);
  assert.match(t, /Edital n. 01\/2026/, "o número do edital vem no cabeçalho");
  assert.match(t, /Propostas submetidas ao edital\s*3/);
  assert.match(t, /Bolsa CNPq\s*1/);
  assert.match(t, /professores doutores/, "o quadro dos doutores existe");
  assert.match(t, /Classifica..o geral/, "e o quadro geral também");
  assert.match(t, /150\.4/, "a nota final somada aparece na linha");
  assert.match(t, /Nota\s*final\s*\(Total\)\s*=\s*NP\s*\+\s*CL/, "o critério explica a soma");
  assert.match(t, /proppex@uniego\.edu\.br/, "quem emitiu fica no documento");
});

test("doutores no primeiro quadro; o geral tem todos, na ordem da nota final", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [
      proj({ numero: "IC-2026-010", orientador: { nome: "A", titulacao: "mestre" }, classificacao: { np: 70, cl: 40, total: 110 } }),
      proj({ numero: "IC-2026-011", orientador: { nome: "B", titulacao: "doutor" }, classificacao: { np: 80, cl: 90, total: 170 } }),
      proj({ numero: "IC-2026-012", orientador: { nome: "C", titulacao: "doutor" }, classificacao: { np: 90, cl: 30, total: 120 } }),
      proj({ numero: "IC-2026-001", orientador: { nome: "D", titulacao: "mestre" }, status: "submetido" }),
    ],
  });
  const t = textoDoPdf(buf);
  const pos = (n, aPartir = 0) => t.findIndex((x, i) => i >= aPartir && x.includes(n));
  // os quadros por categoria vêm primeiro; a ordem de mérito, depois deles
  const capDoutores = pos("professores doutores");
  const capGeral = pos("Classificação geral");
  assert.ok(capDoutores > 0 && capGeral > capDoutores, "os dois quadros de mérito continuam no documento");
  // quadro dos doutores: só B e C, B antes (170 > 120)
  const d11 = pos("IC-2026-011", capDoutores), d12 = pos("IC-2026-012", capDoutores);
  assert.ok(d11 > capDoutores && d12 > d11, "no quadro dos doutores, B (170) vem antes de C (120)");
  assert.ok(pos("IC-2026-010", capDoutores) > capGeral, "o mestre não entra no quadro dos doutores");
  // quadro geral: B (170) > C (120) > A (110) > D (sem nota)
  const g11 = pos("IC-2026-011", capGeral);
  const g12 = pos("IC-2026-012", g11 + 1);
  const g10 = pos("IC-2026-010", g12 + 1);
  const g01 = pos("IC-2026-001", g10 + 1);
  assert.ok(g11 > capGeral && g12 > g11 && g10 > g12 && g01 > g10,
    "no geral: 170, depois 120, depois 110, e sem nota ao fim");
});

/* Pedido do dono (ago/2026): o resultado se lê por categoria de bolsa, e o
   curso é coluna. Quem recebe o documento quer saber quem ficou com cada
   modalidade — antes isso só se descobria lendo a coluna "Resultado" linha
   a linha. */
test("o resultado agrupa por categoria de bolsa e traz a coluna curso", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [
      proj({ numero: "IC-2026-021", curso: "Agronomia", classificacao: { np: 90, cl: 60, total: 150 },
        fomento: { tipo: "cnpq", modalidade: "pibic-cnpq" } }),
      proj({ numero: "IC-2026-022", curso: "Enfermagem", classificacao: { np: 70, cl: 40, total: 110 },
        fomento: { tipo: "uniego", modalidade: "pbic-uniego" } }),
      proj({ numero: "IC-2026-023", curso: "Direito", classificacao: { np: 60, cl: 30, total: 90 },
        fomento: { tipo: "voluntario", modalidade: "voluntario" } }),
    ],
  });
  const t = textoDoPdf(buf);
  const pos = (n) => t.findIndex((x) => x.includes(n));
  assert.ok(pos("CURSO") > 0, "o cabeçalho da tabela tem a coluna Curso");
  for (const c of ["Agronomia", "Enfermagem", "Direito"]) assert.ok(pos(c) > 0, `o curso ${c} sai na linha`);
  // um quadro por categoria, na ordem do catálogo: CNPq, UNIEGO, voluntário
  // o extrator lê latin1: o travessão do rótulo não sobrevive, então a âncora
  // é o trecho depois dele
  const cnpq = pos("PIBIC/CNPq"), uniego = pos("PIBIC/UNIEGO"), vol = pos("sem bolsa");
  assert.ok(cnpq > 0 && uniego > cnpq && vol > uniego, "os quadros saem na ordem do catálogo de modalidades");
  // cada projeto aparece sob a sua categoria, antes da ordem de mérito geral
  assert.ok(pos("IC-2026-021") > cnpq && pos("IC-2026-021") < uniego);
  assert.ok(pos("IC-2026-022") > uniego && pos("IC-2026-022") < vol);
});

/* No preliminar a bolsa ainda não existe — é com este documento que a PROPPEX
   vai à presidência definir a cota. A categoria ali é a LINHA da proposta
   (correção do dono, ago/2026). */
test("no preliminar o agrupamento é por LINHA, não por bolsa", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL, fase: "preliminar",
    projetos: [
      proj({ numero: "IC-2026-031", linha: "ic", modalidade: "pibic-cnpq", classificacao: { np: 90, cl: 60, total: 150 } }),
      proj({ numero: "IC-2026-032", linha: "it", modalidade: "pibiti-cnpq", classificacao: { np: 80, cl: 40, total: 120 } }),
      proj({ numero: "IC-2026-033", linha: "ie", modalidade: "", classificacao: { np: 70, cl: 40, total: 110 } }),
      proj({ numero: "IC-2026-034", linha: "", modalidade: "", classificacao: { np: 60, cl: 30, total: 90 } }),
    ],
  });
  const linhas = textoDoPdf(buf);
  const t = linhas.join(" ");
  const pos = (n) => linhas.findIndex((x) => x.includes(n));
  // as três linhas do edital viram quadros, na ordem do catálogo. O subtítulo
  // do cabeçalho também cita as três, e o travessão do título não sobrevive à
  // leitura em latin1 — por isso a âncora é "nome + contagem" na MESMA linha
  const cab = (nome) => linhas.findIndex((x) => x.includes(nome) && x.includes("proposta(s)"));
  const ic = cab("Iniciação Científica"), it = cab("Inovação Tecnológica"), ie = cab("Iniciação à Extensão");
  assert.ok(ic > 0 && it > ic && ie > it, "IC, depois IT, depois IE");
  assert.ok(pos("Sem linha indicada") > ie, "proposta sem linha tem quadro próprio, ao fim");
  // e nada de bolsa: nem modalidade pretendida, nem valor
  assert.ok(!/Modalidade pretendida/.test(t), "o preliminar não fala em modalidade de bolsa");
  assert.ok(!/350 mensais/.test(t), "o preliminar não anuncia valor de bolsa");
  assert.ok(!/PIBIC\/CNPq/.test(t), "a bolsa pretendida não aparece como categoria");
});

test("proposta sem nota de projeto sai sem nota final, não com zero", async () => {
  // Zero impresso num documento oficial vira nota; o que existe é ausência
  // de avaliação, e é isso que o quadro precisa dizer.
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [proj({ status: "submetido", classificacao: { np: null, cl: 64.4, total: null } })],
  });
  const t = textoDoPdf(buf);
  const linha = t.slice(t.findIndex((x) => x.includes("IC-2026-001"))).slice(0, 7).join(" ");
  assert.match(linha, /64\.4/, "o currículo, absoluto, aparece — ele é fato da planilha");
  assert.match(t.join(" "), /Em avalia..o/);
  assert.doesNotMatch(linha, /(^|\s)0(\s|$)/, "nada de nota final 0 para quem não foi avaliado");
});

test("a inclusão deferida fora do prazo fica dita no documento", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [proj({ inclusaoManual: { por: "proppex@uniego.edu.br", motivo: "deferido pelo pró-reitor" } })],
  });
  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /inclus.o deferida fora do prazo/);
  assert.doesNotMatch(t, /deferido pelo pr/, "o motivo é interno: no documento basta o fato");
});

test("edital sem proposta não gera documento mentiroso", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({ edital: { numero: "02/2025" }, projetos: [] });
  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /Nenhuma proposta registrada para este edital/);
  assert.match(t, /Propostas submetidas ao edital\s*0/);
});

/* A publicação tem duas fases (decisão do dono, ago/2026): o PRELIMINAR sai
   só com os aprovados, antes da distribuição das bolsas — é a lista que a
   PROPPEX leva à presidência para definir as cotas. */
test("o resultado preliminar lista só os aprovados, sem bolsa", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL, fase: "preliminar",
    projetos: [
      proj({ classificacao: { np: 86, cl: 64.4, total: 150.4 } }),
      proj({ numero: "IC-2026-002", titulo: "Compostagem de resíduos", status: "submetido",
        orientador: { nome: "Prof. Caio", titulacao: "mestre" } }),
      proj({ numero: "IC-2026-003", titulo: "Leitura no ensino médio", status: "reprovado",
        orientador: { nome: "Profa. Lia", titulacao: "mestre" } }),
    ],
  });
  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /RESULTADO PRELIMINAR DO PROCESSO SELETIVO/);
  assert.match(t, /Propostas submetidas ao edital\s*3/, "o total de submissões segue no resumo");
  assert.match(t, /Aprovadas\s*1/);
  assert.match(t, /Micorrizas/, "o aprovado está no quadro");
  assert.doesNotMatch(t, /Compostagem/, "o em avaliação não aparece");
  assert.doesNotMatch(t, /Leitura no ensino m/, "o reprovado não aparece");
  assert.doesNotMatch(t, /Bolsa CNPq/, "bolsa ainda não existe no preliminar");
  assert.match(t, /distribui..o das bolsas .CNPq e UNIEGO. ser. divulgada no resultado final/);
});

test("no preliminar o aprovado sai como 'Aprovada', mesmo já havendo fomento", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL, fase: "preliminar",
    projetos: [proj({ fomento: { tipo: "cnpq", modalidade: "pibic-cnpq" } })],
  });
  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /Aprovada/, "a coluna Resultado diz só a aprovação");
  assert.doesNotMatch(t, /PIBIC-CNPQ/, "a modalidade da bolsa fica para o final");
});
