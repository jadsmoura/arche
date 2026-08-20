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
import { normalizarCurricularizacao, chCurricularizada, rotuloPeriodo } from "./curricularizacao.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CERT = path.join(__dirname, "..", "templates", "certificados-template.xlsx");
const TEMPLATE_AEE = path.join(__dirname, "..", "templates", "lista-certificados-aee.xlsx");

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

/* O quadro da curricularização no Registro de Atividade (.docx): a mesma
   informação do PDF, escrita como o documento escreve. */
function blocoCurricularizacao(p) {
  const cur = normalizarCurricularizacao(p?.curricularizacao);
  if (!cur.vinculada || !cur.componentes.length) return [];
  const linhas = cur.componentes.map((c) => P(c.disciplina, [
    c.periodo ? rotuloPeriodo(c.periodo) : "",
    c.curso || "",
    c.cargaHoraria ? `${c.cargaHoraria}h curricularizadas` : "",
    c.academicos ? `${c.academicos} acadêmicos` : "",
    c.docente ? `docente: ${c.docente}` : "",
  ].filter(Boolean).join(" · ") || "—"));
  return [
    H("Curricularização da Extensão"),
    P("Fundamento", "Resolução CNE/CES nº 7/2018 — mínimo de 10% da carga horária do curso em extensão"),
    ...linhas,
    P("Carga horária curricularizada (total)", `${chCurricularizada(cur)}h`),
    ...(cur.integracao ? [P("Integração com o componente curricular", ""), ...multiline(cur.integracao)] : []),
  ];
}

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

        // Curricularização: só entra quando a ação está vinculada a componente
        // curricular. É a peça que comprova os 10% da matriz ao avaliador —
        // seção vazia num registro oficial sugeriria descumprimento.
        ...blocoCurricularizacao(p),

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

        // snapshot do sistema de inscrições, gravado pelo servidor na entrega
        // do relatório (ações com evento): documento é documento — o quadro
        // sai como estava naquele momento
        ...blocoNumerosEvento(r.numerosEvento),

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

/** A seção "Números do evento" do Registro — só quando o snapshot existe. */
function blocoNumerosEvento(ne) {
  if (!ne) return [];
  const fmtEm = (iso) => {
    const n = iso ? new Date(iso) : null;
    if (!n || isNaN(n)) return "—";
    const p = (x) => String(x).padStart(2, "0");
    return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} às ${p(n.getHours())}h${p(n.getMinutes())}`;
  };
  const tabela = (ne.porAtividade || []).length ? [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [th("Atividade"), th("Inscritos"), th("Presentes")] }),
        ...ne.porAtividade.map((x) => new TableRow({
          children: [td(x.titulo), td(x.inscritos), td(x.presentes)],
        })),
      ],
    }),
  ] : [];
  return [
    H("Números do evento (inscrições e credenciamento)"),
    P("Inscritos", `${ne.inscritos} (${ne.online} pela inscrição online e ${ne.manuais} da lista da coordenação)`),
    P("Presentes credenciados", `${ne.presentes}${ne.presentesOnline ? ` — ${ne.presentesOnline} pela transmissão online` : ""}`),
    ...(ne.comentariosMural ? [P("Comentários no mural", ne.comentariosMural)] : []),
    ...tabela,
    P("Apurado em", `${fmtEm(ne.geradoEm)}, pelo sistema de inscrições do ARCHÉ.`),
  ];
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

/* --------------------- LISTA PARA A AEE (.xlsx) --------------------------
   A certificação dos eventos é do sistema da AEE (decisão do dono): o ARCHÉ
   exporta os inscritos NO TEMPLATE de importação de lá — as abas
   "Inscrições", "Palestrantes", "Comissão Organizadora" e "CONFIG" (com o
   ID/VERSAO que o importador confere). A estrutura é intocável: só as
   LINHAS de dados são substituídas. O template acompanha o repositório com
   linhas de exemplo, que são limpas antes de preencher — senão os inscritos
   do evento de amostra sairiam misturados aos do evento real. */
// texto que a pessoa digitou (nome, e-mail, resposta): um valor começando
// com = + - @ vira FÓRMULA quando o Excel abre a planilha — neutraliza-se
// com um apóstrofo à frente (vira texto). Vale para TODO export de dado
// digitado por inscritos; célula numérica/CH não passa por aqui.
/* Célula que começa com =, +, - ou @ é FÓRMULA para o Excel: o texto que a
   pessoa digitou (nome, endereço, título, Pix) vira comando quando a
   planilha abre. A aspa simples à frente faz o Excel tratar como texto — e
   ela não aparece na célula. Exportada porque as planilhas da IC, que vivem
   no server.js, precisam da MESMA blindagem (achado da varredura ago/2026:
   o cadastro do bolsista é digitado por ele e sai numa planilha com CPF,
   RG, endereço e conta de todos os bolsistas). */
export const seguro = (v) => {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};

export async function gerarInscritosAeeXlsx(acao, { somentePresentes = false, atividade = null } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_AEE);
  const parts = acao.participantes || {};
  // com recorte por atividade, vale a CH DELA (minicurso de 4h dentro de um
  // evento de 20h certifica 4h); senão a do inscrito ou a da proposta
  const ch = (x) => (atividade ? atividade.ch || "" : "") || x.ch || acao.proposta?.cargaHoraria || "";
  // o campo da AEE é "CPF/Matrícula": sai o CPF quando existe (é a chave da
  // certificação), a matrícula quando é o que se tem
  const cpfOuMatricula = (x) => String(x.cpf || "").replace(/\D/g, "") || x.matricula || "";

  const fill = (sheetName, rows) => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) return;
    // remove as linhas de dados que vieram no template (cabeçalho fica) e
    // escreve por índice — addRow depois da "linha fantasma" de dimensão do
    // arquivo deixaria um vão no meio da planilha
    const sobra = ws.actualRowCount - 1;
    if (sobra > 0) ws.spliceRows(2, sobra);
    rows.forEach((r, i) => { ws.getRow(i + 2).values = r; });
  };

  // recorte por atividade: quem a MARCOU; "presentes" passa a ser a presença
  // registrada NAQUELA atividade (presencas[]), não a geral do evento
  // evento SEM controle de frequência: a inscrição é a presença — o filtro
  // "só presentes" não pode esvaziar a planilha de quem participou
  const semControle = acao?.evento?.controleFrequencia === false;
  const inscritos = (parts.inscritos || [])
    .filter((x) => !atividade || (Array.isArray(x.atividades) && x.atividades.includes(atividade.id)))
    .filter((x) => !somentePresentes || semControle
      || (atividade
        ? (x.presencas || []).some((p) => String(p?.atividade || "") === atividade.id)
          || atividade.frequencia === "nenhum"
        : x.presente === true));
  fill("Inscrições", inscritos.map((x) => [seguro(cpfOuMatricula(x)), seguro(x.nome), seguro(x.email || ""), seguro(x.telefone || ""), ch(x)]));
  fill("Palestrantes", (parts.palestrantes || []).map((x) => [seguro(x.palestra || ""), seguro(cpfOuMatricula(x)), seguro(x.nome), seguro(x.email || ""), seguro(x.telefone || "")]));
  fill("Comissão Organizadora", (parts.comissao || []).map((x) => [seguro(cpfOuMatricula(x)), seguro(x.nome), seguro(x.email || ""), seguro(x.telefone || ""), ch(x)]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------ LISTA COMPLETA DO ARCHÉ (.xlsx) ----------------------
   O export interno da coordenação: tudo o que a inscrição online coletou —
   contato, atividades marcadas, presenças por atividade, consentimento
   LGPD, tempo de transmissão e os campos extras do formulário (uma coluna
   por campo). Workbook próprio, sem template: as colunas variam por evento.
   O consentimento em branco é informação — é quem entrou pela planilha da
   coordenação e nunca consentiu online. */
export async function gerarInscritosCompletoXlsx(acao) {
  const ev = acao.evento || {};
  const prog = ev.programacao || [];
  const campos = ev.formulario || [];
  const tituloAtv = (id) => prog.find((p) => p?.id === id)?.titulo || id;
  const dataHora = (iso) => {
    const n = iso ? new Date(iso) : null;
    if (!n || isNaN(n)) return "";
    const p = (x) => String(x).padStart(2, "0");
    return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
  };
  const resposta = (x, c) => {
    const v = x.respostas?.[c.id];
    if (v === undefined || v === null) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "boolean") return v ? "sim" : "não";
    return String(v);
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inscritos");
  ws.addRow([
    "Nome", "CPF", "E-mail", "Telefone", "Curso / instituição", "Origem",
    "Inscrito em", "Presente", "Presenças", "Atividades escolhidas",
    "Consentimento LGPD", "Comunicações", "Online (min)",
    ...campos.map((c) => seguro(c.rotulo)),
  ]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col, i) => { col.width = i === 0 ? 34 : 20; });

  for (const x of acao.participantes?.inscritos || []) {
    ws.addRow([
      seguro(x.nome || ""),
      String(x.cpf || "").replace(/\D/g, ""),
      seguro(x.email || ""),
      seguro(x.telefone || ""),
      seguro(x.curso || ""),
      x.origem === "online" ? "online" : "lista da coordenação",
      dataHora(x.inscritoEm),
      (x.presente === true || acao?.evento?.controleFrequencia === false) ? "sim" : "não",
      seguro((x.presencas || [])
        .map((p) => (p?.atividade ? tituloAtv(p.atividade) : "credenciamento geral")).join("; ")),
      seguro((x.atividades || []).map(tituloAtv).join("; ")),
      x.consentimento?.em ? dataHora(x.consentimento.em) : "",
      x.consentimento ? (x.comunicacoes === true ? "sim" : "não") : "",
      x.online?.segundos ? Math.round(x.online.segundos / 60) : "",
      ...campos.map((c) => seguro(resposta(x, c))),
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
