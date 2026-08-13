/* ========================================================================
   Relatório de Atividade (extensão) em PDF — réplica do formulário oficial
   da PROPPEX (mesmos campos e ordem do documento institucional), com
   timbrado em todas as páginas.
   gerarRelatorioPdf(acao) -> Promise<Buffer>
   ======================================================================== */
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_UNIEGO = path.join(__dirname, "..", "templates", "logo-uniego.png");

const TEAL = "#1c3742", CYAN = "#40717e", MUTED = "#657179", LINE = "#cbd6db", CINZA = "#eef3f5";
const M = 56, LARG = 483;   // margem esquerda e largura útil
const TOPO = 108, RODAPE_Y = 780;
const SITE = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");

// Grade de classificação idêntica ao formulário oficial (2 colunas)
const CLASS_GRID = [
  ["Projeto", "Atividade Desportiva"],
  ["Curso Livre", "Atividade Assistencial"],
  ["Prestação de Serviço", "Atividade Artística"],
  ["Produção Cultural", "Outro"],
];
const CLASS_OFICIAIS = CLASS_GRID.flat().filter((c) => c !== "Outro");

function fmtData(iso) {
  if (!iso) return "___/___/___";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : String(iso);
}
function fmtDataHora(iso) {
  const n = iso ? new Date(iso) : null;
  if (!n || isNaN(n)) return "—";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} às ${p(n.getHours())}h${p(n.getMinutes())}`;
}
function hojeExtenso() {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];
  const n = new Date();
  return `${n.getDate()} de ${meses[n.getMonth()]} de ${n.getFullYear()}`;
}

// Timbrado idêntico ao do documento oficial: logo UNIEGO à esquerda,
// "PRÓ-REITORIA DE PESQUISA E EXTENSÃO" centralizado e linha inferior.
function timbrado(doc) {
  try { doc.image(LOGO_UNIEGO, M, 42, { height: 42 }); } catch { /* segue sem logo */ }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEAL)
    .text("PRÓ-REITORIA DE PESQUISA", M, 50, { width: LARG, align: "center" })
    .text("E EXTENSÃO", M, 64, { width: LARG, align: "center" });
  doc.moveTo(M, 92).lineTo(M + LARG, 92).lineWidth(1.1).strokeColor(TEAL).stroke();
}
function rodape(doc) {
  // padrão do documento oficial: apenas a paginação (adicionada no final);
  // mantém-se somente uma nota discreta de origem do arquivo
  doc.font("Helvetica").fontSize(7).fillColor(MUTED)
    .text("Documento gerado pelo ARCHÉ", M, RODAPE_Y + 6, { width: LARG, align: "left" });
}

// Documento A4 timbrado com os helpers de composição usados pelos
// formulários da PROPPEX (relatório e proposta).
function criarDoc() {
  const doc = new PDFDocument({ size: "A4", margins: { top: TOPO, bottom: 70, left: M, right: M }, bufferPages: true });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const quebra = (alt = 0) => { if (doc.y + alt > RODAPE_Y - 18) { doc.addPage(); } };

  // Barra de seção no estilo do formulário (faixa cinza com título em negrito)
  const secao = (t) => {
    quebra(34); doc.moveDown(0.55);
    const y = doc.y;
    doc.rect(M, y, LARG, 16).fill(CINZA);
    doc.rect(M, y, LARG, 16).lineWidth(0.7).strokeColor(LINE).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL).text(t, M + 6, y + 3.5, { width: LARG - 12, lineBreak: false });
    doc.y = y + 21; doc.x = M;
  };
  const campo = (k, v, inline = true) => { quebra(15);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(k + ": ", M, doc.y, { continued: inline, width: LARG })
      .font("Helvetica").fillColor("#222");
    if (inline) doc.text(String(v ?? "") || "—", { width: LARG });
  };
  const texto = (v) => { for (const l of String(v ?? "—").split(/\r?\n/)) {
      quebra(13); doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(l || " ", M, doc.y, { width: LARG }); } };

  return { doc, fim, quebra, secao, campo, texto };
}

// Timbrado + paginação em todas as páginas e fechamento do documento.
function finalizar(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    timbrado(doc); rodape(doc);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Página ${i + 1} de ${range.count}`, M, RODAPE_Y + 6, { width: LARG, align: "right" });
  }
  doc.end();
}

export async function gerarRelatorioPdf(acao) {
  const p = acao.proposta || {}, r = acao.relatorio || {}, parts = acao.participantes || {};
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();

  /* ------------------------- cabeçalho do formulário ---------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("RELATÓRIO DE ATIVIDADE", M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(`Número da Ação ${acao.numeroAcao || "________"}`, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("(Para uso exclusivo da PROPPEX)", { width: LARG, align: "center" });
  doc.moveDown(0.4);

  /* ------------------------------ identificação --------------------------- */
  secao("Identificação");
  campo("Departamento Responsável", p.departamento || acao.curso);
  campo("Nome da Atividade", p.nomeAtividade);
  campo("Número da Proposta-Ação", acao.numeroAcao || "—");

  /* ------------------------------ caracterização -------------------------- */
  secao("Caracterização — Classificação");
  const marcada = CLASS_OFICIAIS.includes(p.classificacao) ? p.classificacao : "Outro";
  const rotuloOutro = marcada === "Outro"
    ? `Outro: ${p.classificacao === "Outro" ? (p.classificacaoOutro || "____________") : p.classificacao}`
    : "Outro: ____________";
  quebra(70);
  for (const [c1, c2] of CLASS_GRID) {
    const y = doc.y;
    const cel = (c, x) => {
      const sel = c === marcada;
      const rot = c === "Outro" ? rotuloOutro : c;
      doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(sel ? "( x )" : "(     )", x, y, { lineBreak: false });
      doc.font(sel ? "Helvetica-Bold" : "Helvetica").text(rot, x + 34, y, { width: 200, lineBreak: false });
    };
    cel(c1, M + 4); cel(c2, M + 248);
    doc.y = y + 15; doc.x = M;
  }

  /* ------------------------------- realização ----------------------------- */
  secao("Período de realização");
  campo("Início", `${fmtData(p.periodoInicio)}    Término: ${fmtData(p.periodoFim)}    Carga Horária: ${p.cargaHoraria ? p.cargaHoraria + " horas" : "—"}`);
  campo("Público Alvo", p.publicoAlvo);
  campo("Local de realização", p.local);
  campo("Município", p.municipio);

  /* -------------------------------- objetivos ----------------------------- */
  secao("Objetivos");
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text("Geral", M); doc.moveDown(0.1);
  texto(p.objetivoGeral);
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text("Específicos", M); doc.moveDown(0.1);
  texto(p.objetivosEspecificos);

  /* --------------------------- conteúdo programático ---------------------- */
  secao("Conteúdo programático");
  texto(r.conteudoProgramatico || "Não se aplica");

  /* --------------------------- recursos físicos --------------------------- */
  secao("Recursos Físicos e Materiais");
  campo("a) Instalação", p.recursoInstalacao || "Não se aplica");
  campo("b) Multimídia", p.recursoMultimidia || "Não se aplica");
  campo("c) Outros", p.recursoOutros || "Não se aplica");

  /* ----------------------------- pessoal envolvido ------------------------ */
  secao("Pessoal Envolvido");
  campo("Parceria", p.parceria || "Não se aplica");
  campo("Bolsistas", r.bolsistas || "Não se aplica");
  campo("Alunos envolvidos (atividade curricular)", r.alunosCurricular || "—");
  campo("Alunos envolvidos (atividade não curricular)", r.alunosNaoCurricular || "—");
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text("Docentes envolvidos:", M); doc.moveDown(0.1);
  texto(r.docentesEnvolvidos || "—");

  /* -------------------------------- responsável --------------------------- */
  quebra(60);
  doc.moveDown(0.4);
  campo("Responsável pelo projeto", p.respNome);
  campo("Título / cargo / função", p.respCargo);
  campo("Telefone", p.respTelefone);
  campo("E-mail", p.respEmail);

  /* --------------------------- avaliação / resultados --------------------- */
  secao("Avaliação / Resultados Alcançados");
  texto(r.avaliacaoResultados);
  doc.moveDown(0.3);
  quebra(15);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`Houve a participação de: ${r.qtdDiscentes ?? "___"} Discentes, ${r.qtdDocentes ?? "___"} Docentes e ${r.qtdTecnicos ?? "___"} Téc. Administrativos.`, M, doc.y, { width: LARG });

  /* --------------------- portfólio / evidências de divulgação -------------- */
  const anexosPf = acao.portfolio?.anexos || [];
  const linksPf = String(r.linksPortfolio || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (anexosPf.length || linksPf.length) {
    secao("Portfólio / Evidências de Divulgação");
    if (linksPf.length) {
      quebra(15);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
        .text("Links (redes sociais, vídeos, publicações):", M); doc.moveDown(0.1);
      for (const l of linksPf) {
        quebra(13);
        const url = /^https?:\/\//i.test(l) ? l : "https://" + l;
        doc.font("Helvetica").fontSize(9).fillColor(CYAN)
          .text(l, M + 8, doc.y, { width: LARG - 8, link: url, underline: true });
      }
      doc.moveDown(0.25);
    }
    if (anexosPf.length) {
      quebra(15);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
        .text("Arquivos anexados (arquivados no Drive da PROPPEX):", M); doc.moveDown(0.1);
      for (const ax of anexosPf) {
        quebra(13);
        const url = ax.link ? SITE + ax.link : null;
        doc.font("Helvetica").fontSize(9).fillColor(url ? CYAN : "#222")
          .text("• " + (ax.name || "arquivo"), M + 8, doc.y,
            { width: LARG - 8, ...(url ? { link: url, underline: true } : {}) });
      }
    }
  }

  /* ------------------- participantes aptos a certificado ------------------ */
  const todos = [
    ...(parts.inscritos || []),
    ...(parts.palestrantes || []).map((x) => ({ ...x, matricula: x.matricula || "Palestrante" })),
    ...(parts.comissao || []).map((x) => ({ ...x, matricula: x.matricula || "Comissão" })),
  ];
  secao("Participantes Aptos a receber Certificado");
  const cols = [[M, 225, "Nome"], [M + 230, 80, "Matrícula"], [M + 315, 100, "CPF"], [M + 420, 63, "Carga Horária"]];
  const cab = () => {
    const y = doc.y;
    doc.rect(M, y, LARG, 14).fill(TEAL);
    for (const [x, w, t] of cols) doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff").text(t, x + 3, y + 3, { width: w, lineBreak: false });
    doc.y = y + 17; doc.fillColor("#222");
  };
  if (todos.length) {
    quebra(40); cab();
    for (const t of todos) {
      if (doc.y + 13 > RODAPE_Y - 18) { doc.addPage(); cab(); }
      const y = doc.y;
      doc.font("Helvetica").fontSize(8);
      doc.text(String(t.nome || "").slice(0, 60), cols[0][0] + 3, y, { width: cols[0][1], lineBreak: false });
      doc.text(String(t.matricula || ""), cols[1][0] + 3, y, { width: cols[1][1], lineBreak: false });
      doc.text(String(t.cpf || ""), cols[2][0] + 3, y, { width: cols[2][1], lineBreak: false });
      doc.text(String(t.ch || p.cargaHoraria || ""), cols[3][0] + 3, y, { width: cols[3][1], lineBreak: false });
      doc.moveTo(M, y + 10.5).lineTo(M + LARG, y + 10.5).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y = y + 13; doc.x = M;
    }
  } else texto("—");

  /* --------------------------- recursos financeiros ----------------------- */
  secao("Recursos Financeiros");
  campo("Despesa Total", r.despesa || "Não se aplica");
  campo("Receita", r.receita || "Não se aplica");

  /* ------------------------------- apreciação ----------------------------- */
  secao("Apreciação preliminar da Coordenadoria de Extensão");
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
    .text("(reservado à coordenadoria de Extensão e Cultura)", M, doc.y, { width: LARG });
  doc.moveDown(0.2);
  texto(acao.apreciacao || " ");

  /* -------------------------------- assinaturas --------------------------- */
  quebra(170);
  doc.moveDown(1.6);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`Goianésia, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  const ass = (linhaTopo, nome, cargo) => {
    quebra(70);
    doc.moveDown(2.6);
    const y = doc.y;
    doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
    if (linhaTopo) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(linhaTopo, M, y + 3, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(nome, M, doc.y + 1, { width: LARG, align: "center" });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(cargo, M, doc.y, { width: LARG, align: "center" });
  };
  ass("Responsável pelo Projeto de Extensão", p.respNome || "____________________________", p.respCargo || "");
  ass("", "Prof. Dr. Jadson Belém de Moura", "Pró-Reitoria de Pesquisa e Extensão");

  finalizar(doc);
  return fim;
}

/* ========================================================================
   Proposta de Ação de Extensão em PDF — mesmo timbrado e diagramação do
   relatório final; enviada por e-mail ao responsável e à PROPPEX no ato
   da submissão.  gerarPropostaPdf(acao) -> Promise<Buffer>
   ======================================================================== */
export async function gerarPropostaPdf(acao) {
  const p = acao.proposta || {};
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();

  const rotulo = (t) => { quebra(15);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(t, M); doc.moveDown(0.1); };

  /* ------------------------- cabeçalho do formulário ---------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("PROPOSTA DE AÇÃO DE EXTENSÃO", M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Protocolo ${acao.id || "—"} · submetida em ${fmtDataHora(acao.criadoEm)}`, { width: LARG, align: "center" });
  doc.moveDown(0.4);

  /* ------------------------------ identificação --------------------------- */
  secao("Identificação");
  campo("Curso / Departamento responsável", p.departamento || acao.curso);
  campo("Nome da atividade", p.nomeAtividade);
  campo("Classificação", p.classificacao === "Outro" && p.classificacaoOutro
    ? `Outro — ${p.classificacaoOutro}` : p.classificacao);
  if (p.temaCentral) campo("Tema central", p.temaCentral);

  /* ------------------------------- realização ----------------------------- */
  secao("Período de realização");
  campo("Início", `${fmtData(p.periodoInicio)}    Término: ${fmtData(p.periodoFim)}    Carga Horária: ${p.cargaHoraria ? p.cargaHoraria + " horas" : "—"}`);
  campo("Público Alvo", p.publicoAlvo);
  campo("Local de realização", p.local);
  campo("Município", p.municipio);

  /* --------------------------------- projeto ------------------------------ */
  secao("Justificativa");
  texto(p.justificativa);

  secao("Objetivos");
  rotulo("Geral"); texto(p.objetivoGeral);
  doc.moveDown(0.2);
  rotulo("Específicos"); texto(p.objetivosEspecificos);

  secao("Metodologia");
  texto(p.metodologia);

  if (p.programacao) { secao("Programação"); texto(p.programacao); }
  if (p.certificacaoSolicitada) { secao("Certificação solicitada"); texto(p.certificacaoSolicitada); }
  if (p.comissaoTexto) { secao("Comissão organizadora"); texto(p.comissaoTexto); }

  /* --------------------------- recursos e parcerias ----------------------- */
  secao("Recursos Físicos e Materiais");
  campo("a) Instalação", p.recursoInstalacao || "Não se aplica");
  campo("b) Multimídia", p.recursoMultimidia || "Não se aplica");
  campo("c) Outros", p.recursoOutros || "Não se aplica");
  campo("Parcerias externas", p.parceria || "Não se aplica");

  /* -------------------------------- responsável --------------------------- */
  secao("Responsável pela ação");
  campo("Nome", p.respNome);
  campo("Título / cargo / função", p.respCargo);
  campo("Telefone", p.respTelefone);
  campo("E-mail", p.respEmail);

  /* -------------------------------- assinatura ---------------------------- */
  quebra(120);
  doc.moveDown(1.6);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`Goianésia, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  doc.moveDown(2.6);
  const y = doc.y;
  doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("Responsável pela proposta", M, y + 3, { width: LARG, align: "center" });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
    .text(p.respNome || "____________________________", M, doc.y + 1, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(p.respCargo || "", M, doc.y, { width: LARG, align: "center" });

  finalizar(doc);
  return fim;
}
