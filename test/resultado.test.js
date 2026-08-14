/* Resultado do processo seletivo em PDF: o documento que a PROPPEX publica e
   arquiva ao fim de um edital. O que se cobra aqui é o que o documento não
   pode errar — a ordem da classificação, o que foi concedido a cada proposta
   e a contagem do resumo. */
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
  linha: "ic", status: "aprovado", orientador: { nome: "Profa. Renata" }, alunos: [{ nome: "Marcos" }],
  ...extra,
});

test("o resultado sai em PDF, com o resumo do processo", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL, emitidoPor: "proppex@uniego.edu.br",
    projetos: [
      proj({ fomento: { tipo: "cnpq", modalidade: "pibic-cnpq" }, classificacao: { np: 8.6, cl: 8.1, nfc: 8.4 } }),
      proj({ numero: "IC-2026-002", titulo: "Compostagem de resíduos", status: "submetido" }),
      proj({ numero: "IC-2026-003", titulo: "Leitura no ensino médio", status: "reprovado" }),
    ],
  });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 2000);
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");

  const t = textoDoPdf(buf).join(" ");
  assert.match(t, /RESULTADO DO PROCESSO SELETIVO/);
  assert.match(t, /Edital n. 01\/2026/, "o número do edital vem no cabeçalho");
  assert.match(t, /Propostas submetidas ao edital\s*3/);
  assert.match(t, /Bolsa CNPq\s*1/);
  assert.match(t, /Em avalia..o\s*1/);
  assert.match(t, /IC-2026-001/);
  assert.match(t, /8\.4/, "a NFC aparece na linha do projeto");
  assert.match(t, /proppex@uniego\.edu\.br/, "quem emitiu fica no documento");
});

test("a classificação manda na ordem; sem nota, o protocolo", async () => {
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [
      proj({ numero: "IC-2026-010", classificacao: { np: 6.5, cl: 5.5, nfc: 6.1 } }),
      proj({ numero: "IC-2026-002", status: "submetido" }),
      proj({ numero: "IC-2026-011", classificacao: { np: 9.5, cl: 8.8, nfc: 9.2 } }),
      proj({ numero: "IC-2026-001", status: "submetido" }),
    ],
  });
  const t = textoDoPdf(buf);
  const pos = (n) => t.findIndex((x) => x.includes(n));
  assert.ok(pos("IC-2026-011") < pos("IC-2026-010"), "nota maior vem primeiro");
  assert.ok(pos("IC-2026-010") < pos("IC-2026-001"), "quem tem nota vem antes de quem não tem");
  assert.ok(pos("IC-2026-001") < pos("IC-2026-002"), "sem nota, a ordem é a do protocolo");
});

test("proposta sem parecer sai sem NFC, não com zero", async () => {
  // Zero impresso num documento oficial vira nota; o que existe é ausência
  // de parecer, e é isso que o quadro precisa dizer.
  const { gerarResultadoEditalPdf } = await import("../lib/pdf.js");
  const buf = await gerarResultadoEditalPdf({
    edital: EDITAL,
    projetos: [proj({ status: "submetido", classificacao: { np: null, cl: 0, nfc: 0 } })],
  });
  const t = textoDoPdf(buf);
  const linha = t.slice(t.findIndex((x) => x.includes("IC-2026-001")), t.length).slice(0, 6).join(" ");
  assert.doesNotMatch(linha, /(^|\s)0(\s|$)/, "nada de NFC 0 para quem ainda não foi avaliado");
  assert.match(t.join(" "), /Em avalia..o/);
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
