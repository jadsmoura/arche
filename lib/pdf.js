/* ========================================================================
   Relatório final de atividade de extensão em PDF, com timbrado
   institucional (cabeçalho e rodapé em todas as páginas).
   gerarRelatorioPdf(acao) -> Promise<Buffer>
   ======================================================================== */
import PDFDocument from "pdfkit";

const TEAL = "#1c3742", CYAN = "#4aa5c4", MUTED = "#5b7280", LINE = "#d8d4c8";
const M = 56;               // margem lateral
const TOPO = 108;           // início do corpo (abaixo do timbrado)
const RODAPE_Y = 780;       // linha do rodapé (A4 = 842pt de altura)

function fmtData(iso) {
  if (!iso) return "____________";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}
function hojeExtenso() {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];
  const n = new Date();
  return `${n.getDate()} de ${meses[n.getMonth()]} de ${n.getFullYear()}`;
}

function timbrado(doc) {
  // logotipo ARCHÉ (arco + ponto), traçado vetorial
  doc.save();
  doc.lineWidth(2.6).strokeColor(TEAL)
    .path(`M ${M} 74 L ${M} 56 A 15 15 0 0 1 ${M + 30} 56 L ${M + 30} 74`).stroke();
  doc.circle(M + 15, 58, 4).fill(CYAN);
  doc.restore();
  // identificação institucional
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEAL)
    .text("CENTRO UNIVERSITÁRIO EVANGÉLICO DE GOIANÉSIA — UNIEGO", M + 44, 46, { width: 455 });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("Pró-Reitoria de Pesquisa, Pós-Graduação e Extensão — PROPPEX", M + 44, 62)
    .text("ARCHÉ · Sistema de Gestão da PROPPEX", M + 44, 74);
  doc.moveTo(M, 92).lineTo(539, 92).lineWidth(1).strokeColor(CYAN).stroke();
}
function rodape(doc) {
  doc.moveTo(M, RODAPE_Y).lineTo(539, RODAPE_Y).lineWidth(0.7).strokeColor(LINE).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text("ARCHÉ · PROPPEX / UNIEGO · Goianésia – GO", M, RODAPE_Y + 6, { width: 483, align: "left" });
}

export async function gerarRelatorioPdf(acao) {
  const p = acao.proposta || {}, r = acao.relatorio || {}, parts = acao.participantes || {};
  const doc = new PDFDocument({ size: "A4", margins: { top: TOPO, bottom: 70, left: M, right: M }, bufferPages: true });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const quebra = (alt = 0) => { if (doc.y + alt > RODAPE_Y - 20) doc.addPage(); };
  const secao = (t) => { quebra(40); doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(11.5).fillColor(TEAL).text(t, M);
    doc.moveTo(M, doc.y + 2).lineTo(230, doc.y + 2).lineWidth(1.4).strokeColor(CYAN).stroke();
    doc.moveDown(0.45); };
  const campo = (k, v) => { quebra(16);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(k + ": ", M, doc.y, { continued: true })
      .font("Helvetica").fillColor("#222").text(String(v ?? "—") || "—"); };
  const texto = (v) => { for (const l of String(v ?? "—").split(/\r?\n/)) {
      quebra(14); doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(l || " ", M, doc.y, { width: 483 }); } };

  /* capa/cabeçalho do documento */
  doc.font("Helvetica-Bold").fontSize(16).fillColor(TEAL)
    .text("RELATÓRIO FINAL DE ATIVIDADE DE EXTENSÃO", M, TOPO, { width: 483, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(`Número da Ação: ${acao.numeroAcao || "—"}`, { width: 483, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("(Documento gerado pelo ARCHÉ para arquivamento institucional)", { width: 483, align: "center" });

  secao("1. Identificação");
  campo("Nome da atividade", p.nomeAtividade);
  campo("Classificação", p.classificacao + (p.classificacao === "Outro" && p.classificacaoOutro ? ` — ${p.classificacaoOutro}` : ""));
  campo("Curso / Departamento", p.departamento || acao.curso);
  if (p.temaCentral) campo("Tema central", p.temaCentral);
  campo("Período de realização", `${fmtData(p.periodoInicio)} a ${fmtData(p.periodoFim)}`);
  campo("Carga horária", p.cargaHoraria ? `${p.cargaHoraria} horas` : "—");
  campo("Público-alvo", p.publicoAlvo);
  campo("Local / Município", `${p.local || "—"} — ${p.municipio || "—"}`);
  campo("Parcerias", p.parceria || "Não se aplica");

  secao("2. Objetivos");
  campo("Objetivo geral", "");
  texto(p.objetivoGeral);
  campo("Objetivos específicos", "");
  texto(p.objetivosEspecificos);

  secao("3. Execução");
  campo("Metodologia", "");
  texto(p.metodologia);
  if (p.programacao) { campo("Programação", ""); texto(p.programacao); }
  campo("Conteúdo programático", r.conteudoProgramatico || "Não se aplica");
  campo("Recursos", `Instalações: ${p.recursoInstalacao || "n/a"} · Multimídia: ${p.recursoMultimidia || "n/a"} · Outros: ${p.recursoOutros || "n/a"}`);

  secao("4. Pessoal Envolvido");
  campo("Responsável", `${p.respNome || "—"} — ${p.respCargo || "—"} · ${p.respTelefone || ""} · ${p.respEmail || ""}`);
  campo("Bolsistas", r.bolsistas || "Não se aplica");
  if (r.docentesEnvolvidos) { campo("Docentes envolvidos", ""); texto(r.docentesEnvolvidos); }

  secao("5. Avaliação e Resultados");
  texto(r.avaliacaoResultados);
  campo("Participação", `${r.qtdDiscentes ?? "—"} discentes · ${r.qtdDocentes ?? "—"} docentes · ${r.qtdTecnicos ?? "—"} técnicos administrativos`);
  campo("Recursos financeiros", `Despesa: ${r.despesa || "Não se aplica"} · Receita: ${r.receita || "Não se aplica"}`);

  /* participantes */
  const todos = [
    ...(parts.inscritos || []).map((x) => ({ ...x, cat: "Participante" })),
    ...(parts.palestrantes || []).map((x) => ({ ...x, cat: "Palestrante" })),
    ...(parts.comissao || []).map((x) => ({ ...x, cat: "Comissão" })),
  ];
  secao(`6. Participantes Aptos a Certificação (${todos.length})`);
  const cols = [[M, 200, "Nome"], [M + 205, 75, "Matrícula"], [M + 285, 95, "CPF"], [M + 385, 55, "CH"], [M + 425, 58, "Categoria"]];
  const cab = () => {
    doc.rect(M - 4, doc.y - 2, 491, 14).fill(TEAL);
    for (const [x, w, t] of cols) doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff").text(t, x, doc.y, { width: w, lineBreak: false });
    doc.moveDown(0.9); doc.fillColor("#222");
  };
  if (todos.length) {
    quebra(40); cab();
    for (const t of todos) {
      if (doc.y + 13 > RODAPE_Y - 20) { doc.addPage(); cab(); }
      const y = doc.y;
      doc.font("Helvetica").fontSize(8);
      doc.text(String(t.nome || "").slice(0, 55), cols[0][0], y, { width: cols[0][1], lineBreak: false });
      doc.text(String(t.matricula || ""), cols[1][0], y, { width: cols[1][1], lineBreak: false });
      doc.text(String(t.cpf || ""), cols[2][0], y, { width: cols[2][1], lineBreak: false });
      doc.text(String(t.ch || p.cargaHoraria || ""), cols[3][0], y, { width: cols[3][1], lineBreak: false });
      doc.text(t.cat, cols[4][0], y, { width: cols[4][1], lineBreak: false });
      doc.moveTo(M - 4, y + 10.5).lineTo(539, y + 10.5).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y = y + 13; doc.x = M;
    }
  } else texto("Nenhum participante registrado.");

  secao("7. Apreciação da Coordenadoria de Extensão");
  texto(acao.apreciacao || " ");

  /* assinaturas */
  quebra(150);
  doc.moveDown(2);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`Goianésia – GO, ${hojeExtenso()}.`, M, doc.y, { width: 483, align: "right" });
  doc.moveDown(3);
  const ass = (nome, cargo) => {
    quebra(60);
    doc.moveDown(2.4);
    const y = doc.y;
    doc.moveTo(150, y).lineTo(445, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(nome, M, y + 4, { width: 483, align: "center" });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(cargo, M, doc.y, { width: 483, align: "center" });
  };
  ass(p.respNome || "Responsável pela Ação de Extensão", p.respCargo || "");
  ass("Prof. Dr. Jadson Belém de Moura", "Pró-Reitoria de Pesquisa, Pós-Graduação e Extensão — PROPPEX");

  /* timbrado + numeração em todas as páginas */
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    timbrado(doc); rodape(doc);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Página ${i + 1} de ${range.count}`, M, RODAPE_Y + 6, { width: 483, align: "right" });
  }
  doc.end();
  return fim;
}
