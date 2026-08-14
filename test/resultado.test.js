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
  // quadro dos doutores: só B e C, B antes (170 > 120)
  const d11 = pos("IC-2026-011"), d12 = pos("IC-2026-012");
  assert.ok(d11 >= 0 && d12 > d11, "no quadro dos doutores, B (170) vem antes de C (120)");
  assert.ok(pos("IC-2026-010") > d12, "o mestre só aparece depois, no quadro geral");
  // quadro geral: B (170) > C (120) > A (110) > D (sem nota)
  const g11 = pos("IC-2026-011", d12 + 1);
  const g12 = pos("IC-2026-012", g11 + 1);
  const g10 = pos("IC-2026-010", d12 + 1);
  const g01 = pos("IC-2026-001", d12 + 1);
  assert.ok(g11 > 0 && g12 > g11 && g10 > g12 && g01 > g10,
    "no geral: 170, depois 120, depois 110, e sem nota ao fim");
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
