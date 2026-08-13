/* ========================================================================
   Exportadores do módulo Extensão:
   - gerarRegistroDocx(acao)      -> Buffer .docx  (Registro/Relatório de Atividade)
   - gerarCertificadosXlsx(acao)  -> Buffer .xlsx  (modelo oficial de certificados)
   ======================================================================== */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, VerticalAlign,
} from "docx";
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CERT = path.join(__dirname, "..", "templates", "certificados-template.xlsx");

const CLASSIFICACOES = [
  "Projeto", "Evento", "Curso Livre", "Prestação de Serviço",
  "Produção Cultural", "Atividade Desportiva", "Atividade Assistencial",
  "Atividade Artística", "Outro", "",
];

function fmtData(iso) {
  if (!iso) return "____________";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}
function hoje() {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];
  const n = new Date();
  return `${n.getDate()} de ${meses[n.getMonth()]} de ${n.getFullYear()}`;
}

const th = (t) => new TableCell({
  verticalAlign: VerticalAlign.CENTER,
  shading: { type: "clear", fill: "1C3742" },
  children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 20 })] })],
});
const td = (t, opts = {}) => new TableCell({
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), size: 20, bold: !!opts.bold })] })],
});

const H = (t) => new Paragraph({
  spacing: { before: 280, after: 120 },
  children: [new TextRun({ text: t, bold: true, size: 24, color: "1C3742" })],
});
const P = (label, value) => new Paragraph({
  spacing: { after: 60 },
  children: [
    ...(label ? [new TextRun({ text: label + ": ", bold: true, size: 21 })] : []),
    new TextRun({ text: String(value ?? "—"), size: 21 }),
  ],
});
const multiline = (txt) => String(txt ?? "—").split(/\r?\n/).map(
  (l) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: l, size: 21 })] }),
);

export async function gerarRegistroDocx(acao) {
  const p = acao.proposta || {};
  const r = acao.relatorio || {};
  const parts = acao.participantes || {};
  const todos = [
    ...(parts.inscritos || []).map((x) => ({ ...x })),
    ...(parts.palestrantes || []).map((x) => ({ ...x, matricula: x.matricula || "Palestrante" })),
    ...(parts.comissao || []).map((x) => ({ ...x, matricula: x.matricula || "Comissão" })),
  ];

  const classLinhas = [];
  for (let i = 0; i < CLASSIFICACOES.length; i += 2) {
    const mk = (c) => {
      if (!c) return [td(""), td("")];
      const sel = (p.classificacao || "") === c;
      const label = c === "Outro" && sel && p.classificacaoOutro ? `Outro: ${p.classificacaoOutro}` : c;
      return [td(sel ? "( x )" : "(    )"), td(label, { bold: sel })];
    };
    classLinhas.push(new TableRow({ children: [...mk(CLASSIFICACOES[i]), ...mk(CLASSIFICACOES[i + 1])] }));
  }

  const partRows = [
    new TableRow({ children: [th("Nome"), th("Matrícula"), th("CPF"), th("Carga Horária")] }),
    ...todos.map((x) => new TableRow({
      children: [td(x.nome), td(x.matricula || ""), td(x.cpf || ""), td(x.ch || p.cargaHoraria || "")],
    })),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 1100, right: 1100 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 60 },
          children: [new TextRun({ text: "RELATÓRIO DE ATIVIDADE", bold: true, size: 32, color: "1C3742" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 40 },
          children: [new TextRun({ text: `Número da Ação: ${acao.numeroAcao || "—"}`, bold: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "(Para uso exclusivo da PROPPEX)", italics: true, size: 18 })],
        }),

        H("Identificação"),
        P("Departamento Responsável", p.departamento || acao.curso),
        P("Nome da Atividade", p.nomeAtividade),
        P("Número da Proposta-Ação", acao.numeroAcao || "—"),

        H("Caracterização"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders(), rows: classLinhas,
        }),

        H("Realização"),
        P("Período", `Início: ${fmtData(p.periodoInicio)}   Término: ${fmtData(p.periodoFim)}`),
        P("Carga Horária", p.cargaHoraria ? `${p.cargaHoraria} horas` : "—"),
        P("Público Alvo", p.publicoAlvo),
        P("Local de realização", p.local),
        P("Município", p.municipio),

        H("Objetivos"),
        P("Geral", ""), ...multiline(p.objetivoGeral),
        P("Específicos", ""), ...multiline(p.objetivosEspecificos),

        H("Conteúdo programático"),
        ...multiline(r.conteudoProgramatico || "Não se aplica"),

        H("Recursos Físicos e Materiais"),
        P("a) Instalação", p.recursoInstalacao || "Não se aplica"),
        P("b) Multimídia", p.recursoMultimidia || "Não se aplica"),
        P("c) Outros", p.recursoOutros || "Não se aplica"),

        H("Pessoal Envolvido"),
        P("Parceria", p.parceria || "Não se aplica"),
        P("Bolsistas", r.bolsistas || "Não se aplica"),
        P("Alunos envolvidos (atividade curricular)", r.alunosCurricular || "—"),
        P("Alunos envolvidos (atividade não curricular)", r.alunosNaoCurricular || "—"),
        P("Docentes envolvidos", ""), ...multiline(r.docentesEnvolvidos || "—"),

        H("Responsável"),
        P("Responsável pelo projeto", p.respNome),
        P("Título / cargo / função", p.respCargo),
        P("Telefone", p.respTelefone),
        P("E-mail", p.respEmail),

        H("Avaliação / Resultados Alcançados"),
        ...multiline(r.avaliacaoResultados || "—"),
        P("Participação", `${r.qtdDiscentes ?? "—"} discentes, ${r.qtdDocentes ?? "—"} docentes e ${r.qtdTecnicos ?? "—"} técnicos administrativos.`),

        H("Participantes Aptos a Receber Certificado"),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: partRows }),

        H("Recursos Financeiros"),
        P("Despesa Total", r.despesa || "Não se aplica"),
        P("Receita", r.receita || "Não se aplica"),

        H("Apreciação preliminar da Coordenadoria de Extensão"),
        ...multiline(acao.apreciacao || " "),

        new Paragraph({ spacing: { before: 400, after: 500 }, alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `Goianésia – GO, ${hoje()}.`, size: 21 })] }),

        assinatura(p.respNome || "Responsável pelo Projeto de Extensão", p.respCargo || ""),
        assinatura("Prof. Dr. Jadson Belém de Moura", "Pró-Reitoria de Pesquisa, Pós-Graduação e Extensão"),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}
function assinatura(nome, cargo) {
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 500, after: 60 },
    children: [
      new TextRun({ text: "_________________________________________", size: 21 }), new TextRun({ break: 1 }),
      new TextRun({ text: nome, bold: true, size: 21 }), new TextRun({ break: 1 }),
      new TextRun({ text: cargo, size: 19 }),
    ],
  });
}

/* ------------------------- CERTIFICADOS (.xlsx) ------------------------- */
export async function gerarCertificadosXlsx(acao) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_CERT);
  const parts = acao.participantes || {};
  const ch = (x) => x.ch || acao.proposta?.cargaHoraria || "";
  const idOuCpf = (x) => x.matricula || x.cpf || "";

  const fill = (sheetName, rows) => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) return;
    // escreve a partir da linha 2 (o template já vem sem dados; escrever por
    // índice evita o addRow após a "linha fantasma" de dimensão do arquivo)
    rows.forEach((r, i) => { ws.getRow(i + 2).values = r; });
  };

  fill("Inscrições", (parts.inscritos || []).map((x) => [idOuCpf(x), x.nome, x.email || "", x.telefone || "", ch(x)]));
  fill("Palestrantes", (parts.palestrantes || []).map((x) => [x.palestra || "", idOuCpf(x), x.nome, x.email || "", x.telefone || ""]));
  fill("Comissão Organizadora", (parts.comissao || []).map((x) => [idOuCpf(x), x.nome, x.email || "", x.telefone || "", ch(x)]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
