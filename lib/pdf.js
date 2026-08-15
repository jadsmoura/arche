/* ========================================================================
   Relatório de Atividade (extensão) em PDF — réplica do formulário oficial
   da PROPPEX (mesmos campos e ordem do documento institucional), com
   timbrado em todas as páginas.
   gerarRelatorioPdf(acao) -> Promise<Buffer>
   ======================================================================== */
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cursoDe, orgaoDe, quorum, tituloDe } from "./atas.js";
import { pautaDe } from "./pautas.js";
import { marcaEm, MARCAS } from "./marca.js";
import { classificarProjetos, normalizarTitulacao, TITULACOES, EDITAL } from "./edital.js";

const CIDADE_PDF = process.env.INSTITUICAO_CIDADE || "Goianésia";

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

/* ---------------------- assinaturas institucionais -----------------------
   Quem assina os documentos oficiais (decisão do dono, ago/2026). Para
   trocar um nome ou cargo, é aqui — os geradores só escolhem a combinação.
   No resultado da IC assinam coordenação de pesquisa, pró-reitor e reitor;
   na Extensão, o responsável + a coordenação da ação + pró-reitor e reitor. */
const ASSINA = {
  reitor: { nome: "Dr. José Mateus dos Santos", cargo: "Reitor" },
  proReitor: {
    nome: "Dr. Jadson Belem de Moura",
    cargo: "Pró-Reitor de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária",
  },
  coordPesquisa: { nome: "Dr. Wagner Gonçalves Vieira Junior", cargo: "Coordenador de Pesquisa e Inovação" },
  coordAcaoComunitaria: { nome: "Dra. Camila Cardoso", cargo: "Coordenação de Ação Comunitária" },
  coordExtensao: { nome: "Thiago Brito Steckelberg", cargo: "Coordenador de Extensão" },
};

/* Assinatura digitalizada, usada SÓ nos certificados (decisão do dono,
   ago/2026): os demais documentos continuam saindo com a linha em branco,
   para assinatura à mão. As imagens chegam de fora, em Buffer — quem as
   guarda é o sistema (enviadas pela tela da gestão), não o repositório:
   em produção o disco é efêmero, e trocar de reitor não pode exigir um
   deploy. Sem imagem, sai só a linha e nada quebra. */

// A coordenação que assina a ação de extensão depende da CLASSIFICAÇÃO da
// proposta: cursos livres são da Coordenadoria de Extensão; eventos,
// projetos e as demais ações comunitárias, da Ação Comunitária.
const assinaturaDaAcao = (classificacao) =>
  /curso/i.test(String(classificacao || "")) ? ASSINA.coordExtensao : ASSINA.coordAcaoComunitaria;

/* Régua de assinaturas lado a lado (2 ou 3 colunas), com nome e cargo
   centrados sob cada linha. Anda o doc.y até o fundo da coluna mais alta. */
function blocoAssinaturas(doc, quebra, lista) {
  quebra(95);
  doc.moveDown(2.6);
  const y = doc.y;
  const w = LARG / lista.length;
  let fundo = y;
  lista.forEach((a, i) => {
    const x = M + i * w;
    doc.moveTo(x + 12, y).lineTo(x + w - 12, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
      .text(a.nome, x + 4, y + 4, { width: w - 8, align: "center" });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(a.cargo, x + 4, doc.y + 1, { width: w - 8, align: "center" });
    fundo = Math.max(fundo, doc.y);
  });
  doc.y = fundo + 6;
  doc.x = M;
}

function fmtData(iso) {
  if (!iso) return "___/___/___";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : String(iso);
}
// Nas atas o ano vai por inteiro (o formulário da extensão usa 2 dígitos).
function fmtDataLonga(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : "—";
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
const TIMBRE_PADRAO = ["PRÓ-REITORIA DE PESQUISA", "E EXTENSÃO"];
function timbrado(doc, linhas = TIMBRE_PADRAO, marca = MARCAS.uniego) {
  try { doc.image(marca.logo, M, 42, { height: marca.logoAltura }); } catch { /* segue sem logo */ }
  const l = (linhas.length ? linhas : TIMBRE_PADRAO).slice(0, 2);
  let y = l.length > 1 ? 50 : 57;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(marca.cor);
  for (const linha of l) { doc.text(linha, M, y, { width: LARG, align: "center" }); y += 14; }
  // a FACEG identifica-se pelo nome por extenso abaixo do órgão: o logotipo
  // dela não traz "Goianésia" em corpo legível na altura do timbrado
  if (marca.codigo !== "uniego") {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(marca.nome, M, y + 1, { width: LARG, align: "center" });
  }
  doc.moveTo(M, 92).lineTo(M + LARG, 92).lineWidth(1.1).strokeColor(marca.cor).stroke();
}
function rodape(doc, marca = MARCAS.uniego) {
  // padrão do documento oficial: apenas a paginação (adicionada no final);
  // mantém-se somente uma nota discreta de origem do arquivo
  doc.font("Helvetica").fontSize(7).fillColor(MUTED)
    .text("Documento gerado pelo ARCHÉ", M, RODAPE_Y + 6, { width: LARG, align: "left" });
  // o timbrado da FACEG traz endereço e versículo na tarja inferior
  if (marca.rodape) {
    doc.moveTo(M, RODAPE_Y - 6).lineTo(M + LARG, RODAPE_Y - 6).lineWidth(0.6).strokeColor(marca.cor).stroke();
    doc.font("Helvetica").fontSize(6.8).fillColor(marca.cor)
      .text(marca.rodape, M, RODAPE_Y - 1, { width: LARG, align: "center" });
    if (marca.versiculo) {
      doc.font("Helvetica-Oblique").fontSize(6.2).fillColor(MUTED)
        .text(marca.versiculo, M, doc.y, { width: LARG, align: "center" });
    }
  }
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

// Corta o texto na largura da coluna, com reticências. Serve para as células
// de largura fixa (linhas de assinatura), onde o PDFKit deixaria o texto
// transbordar por cima da coluna vizinha em vez de quebrar.
function cortar(doc, txt, largura) {
  const s = String(txt ?? "");
  if (!s || doc.widthOfString(s) <= largura) return s;
  let corte = s;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte.trimEnd() + "…";
}

// Timbrado + paginação em todas as páginas e fechamento do documento.
//
// O rodapé é escrito ABAIXO da margem inferior (RODAPE_Y = 780, contra 771,89
// de área útil no A4). Nessa faixa o PDFKit entende que a linha não cabe e
// cria uma página nova — uma por escrita, todas em branco, no fim do arquivo.
// Zerar a margem inferior enquanto se desenha o timbrado resolve: o PDFKit
// passa a aceitar a escrita no pé da página. A margem volta ao valor original
// logo depois, para não afetar nada que venha a ser escrito adiante.
function finalizar(doc, linhasTimbre, marca = MARCAS.uniego) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const margemAntes = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try {
      timbrado(doc, linhasTimbre, marca);
      rodape(doc, marca);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
        .text(`Página ${i + 1} de ${range.count}`, M, RODAPE_Y + 6, { width: LARG, align: "right" });
    } finally {
      doc.page.margins.bottom = margemAntes;
    }
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
  // a coordenação da ação (Extensão para cursos livres; Ação Comunitária
  // para eventos, projetos e demais), o pró-reitor e o reitor
  blocoAssinaturas(doc, quebra, [assinaturaDaAcao(p.classificacao), ASSINA.proReitor, ASSINA.reitor]);

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
  // a coordenação da ação (Extensão para cursos livres; Ação Comunitária
  // para eventos, projetos e demais), o pró-reitor e o reitor
  blocoAssinaturas(doc, quebra, [assinaturaDaAcao(p.classificacao), ASSINA.proReitor, ASSINA.reitor]);

  finalizar(doc);
  return fim;
}

/* ========================================================================
   ARCHÉ AT — Ata de reunião em PDF. Mesmo timbrado institucional, com a
   identificação do órgão no cabeçalho de todas as páginas, corpo do texto
   justificado, quadro de encaminhamentos e folha de assinaturas.
   gerarAtaPdf(ata) -> Promise<Buffer>
   ======================================================================== */
function timbreDaAta(ata) {
  const o = orgaoDe(ata?.orgao);
  if (!o || o.codigo === "PROPPEX") return TIMBRE_PADRAO;
  const nome = (o.nomeLivre ? (ata.orgaoNome || o.nome) : o.nome).toUpperCase();
  const curso = ata.curso ? `CURSO DE ${(cursoDe(ata.curso)?.nome || ata.curso).toUpperCase()}` : "";
  return curso ? [nome, curso] : [nome];
}

export async function gerarAtaPdf(ata) {
  const s = ata.sessao || {};
  const q = quorum(ata);
  const { doc, fim, quebra, secao, campo } = criarDoc();

  /* -------------------------------- cabeçalho ----------------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("ATA DE REUNIÃO", M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(tituloDe(ata), { width: LARG, align: "center" });
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(CYAN)
    .text(ata.numero || "(número a emitir)", { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Sessão ${s.tipo || "ordinária"} · ${s.modalidade || "presencial"} · ${fmtDataLonga(s.data)}`,
      { width: LARG, align: "center" });
  doc.moveDown(0.5);

  /* ------------------------------- identificação -------------------------- */
  secao("Identificação da sessão");
  campo("Data", `${fmtDataLonga(s.data)}    Início: ${s.horaInicio || "—"}    Término: ${s.horaFim || "—"}`);
  campo("Local", s.local);
  if (s.convocacao) campo("Convocação", s.convocacao);
  campo("Presidência", `${ata.presidencia?.nome || "—"}${ata.presidencia?.cargo ? ` — ${ata.presidencia.cargo}` : ""}`);
  // Secretaria é opcional: sem nome preenchido, o campo não sai no documento
  // (nem aqui, nem na folha de assinaturas) — melhor omitir que imprimir um
  // traço que ninguém sabe se é para preencher à mão.
  if (ata.secretaria?.nome) campo("Secretaria", ata.secretaria.nome);
  campo("Quórum", `${q.presentes} presente(s) · ${q.justificadas} ausência(s) justificada(s) · ${q.ausentes} ausente(s)`);

  /* -------------------------------- presenças ----------------------------- */
  secao("Registro de presença");
  const rotulos = { membro: "Membro", suplente: "Suplente", convidado: "Convidado(a)", secretaria: "Secretaria" };
  const marca = { presente: "Presente", justificada: "Ausência justificada", ausente: "Ausente" };
  // Quadro de três colunas. Nome e cargo são texto livre e estouram a coluna
  // com frequência ("Coordenação de Ação Comunitária"): a linha quebra em
  // duas e, com passo fixo, invadia a linha seguinte. A altura da linha passa
  // a ser a da maior célula, medida antes de escrever.
  const COL_NOME = { x: M + 4, l: LARG * 0.44 };
  const COL_FUNC = { x: M + LARG * 0.47, l: LARG * 0.30 };
  const COL_PRES = { x: M + LARG * 0.78, l: LARG * 0.22 };
  for (const p of ata.participantes || []) {
    const funcao = `${rotulos[p.condicao] || p.condicao}${p.cargo ? " · " + p.cargo : ""}`;
    const situacao = marca[p.presenca] || p.presenca || "—";
    doc.font("Helvetica-Bold").fontSize(9);
    const hNome = doc.heightOfString(p.nome || "—", { width: COL_NOME.l });
    doc.font("Helvetica").fontSize(8.5);
    const alt = Math.max(hNome,
      doc.heightOfString(funcao, { width: COL_FUNC.l }),
      doc.heightOfString(situacao, { width: COL_PRES.l }), 11) + 3.5;
    quebra(alt);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111")
      .text(p.nome || "—", COL_NOME.x, y, { width: COL_NOME.l });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(funcao, COL_FUNC.x, y + 0.5, { width: COL_FUNC.l });
    doc.font("Helvetica").fontSize(8.5)
      .fillColor(p.presenca === "presente" ? "#3f8a5d" : p.presenca === "justificada" ? "#c98a2b" : "#a1524c")
      .text(situacao, COL_PRES.x, y + 0.5, { width: COL_PRES.l, align: "right" });
    doc.y = y + alt; doc.x = M;
  }
  if (!(ata.participantes || []).length) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#222").text("—", M, doc.y, { width: LARG });
  }

  /* ---------------------------------- texto ------------------------------- */
  secao("Deliberações");
  for (const par of String(ata.texto || "").split(/\n{2,}/)) {
    const limpo = par.trim();
    if (!limpo) continue;
    quebra(30);
    doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a")
      .text(limpo, M, doc.y, { width: LARG, align: "justify", lineGap: 1.6, indent: 18 });
    doc.moveDown(0.5);
  }

  /* ----------------------------- encaminhamentos -------------------------- */
  const encs = (ata.pauta || []).map((p, i) => ({ i, ...p.encaminhamento })).filter((e) => e.acao);
  if (encs.length) {
    secao("Encaminhamentos");
    for (const e of encs) {
      quebra(26);
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL)
        .text(`${e.i + 1}.`, M + 2, y, { width: 18, lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a")
        .text(e.acao, M + 22, y, { width: LARG - 22 });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text(`Responsável: ${e.responsavel || "—"}${e.prazo ? `    Prazo: ${fmtDataLonga(e.prazo)}` : ""}`,
          M + 22, doc.y + 1, { width: LARG - 22 });
      doc.moveDown(0.35); doc.x = M;
    }
  }

  /* -------------------------- pauta regulatória (MEC) --------------------- */
  // Deixa explícito, no próprio documento, quais indicadores do instrumento
  // do INEP esta sessão atendeu — é o que o avaliador procura na ata.
  const regs = (ata.pauta || [])
    .map((p, i) => ({ i, p, reg: pautaDe(p.pautaMec) })).filter((x) => x.reg);
  if (regs.length) {
    secao("Pauta regulatória atendida nesta sessão");
    for (const { i, reg } of regs) {
      quebra(24);
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL)
        .text(`${i + 1}.`, M + 2, y, { width: 18, lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a")
        .text(reg.titulo, M + 22, y, { width: LARG - 22 });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text(reg.refs.map((r) => `${r.inst === "curso" ? "Curso" : "IES"} ${r.num} — ${r.nome} (conceito ${r.nivel})`).join(" · ")
          + ` · ${reg.cadencia === "anual" ? `anual, ${reg.semestre}º semestre` : "todo semestre"}`,
          M + 22, doc.y + 1, { width: LARG - 22 });
      doc.moveDown(0.3); doc.x = M;
    }
  }

  /* --------------------------- documentos anexos -------------------------- */
  if ((ata.anexos || []).length) {
    secao("Documentos anexos");
    for (const [i, ax] of ata.anexos.entries()) {
      quebra(14);
      doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a")
        .text(`${i + 1}. ${ax.name}`, M + 4, doc.y, { width: LARG - 4 });
    }
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(MUTED)
      .text("Arquivos mantidos no acervo do ARCHÉ, vinculados a esta ata.", M + 4, doc.y + 2, { width: LARG - 4 });
  }

  /* ------------------------------- assinaturas ---------------------------- */
  quebra(230);
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${fmtDataLonga(s.data)}.`, M, doc.y, { width: LARG, align: "center" });

  const assinatura = (rotulo, nome, cargo) => {
    quebra(64);
    doc.moveDown(2.4);
    const y = doc.y;
    doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(rotulo, M, y + 3, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(nome || "____________________", M, doc.y + 1, { width: LARG, align: "center" });
    if (cargo) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(cargo, M, doc.y, { width: LARG, align: "center" });
  };
  assinatura("Presidência da sessão", ata.presidencia?.nome, ata.presidencia?.cargo);
  if (ata.secretaria?.nome) assinatura("Secretaria da sessão", ata.secretaria.nome, "");

  const assinantes = (ata.participantes || []).filter((p) => p.presenca === "presente");
  if (assinantes.length) {
    quebra(50);
    doc.moveDown(1.4);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL)
      .text("Membros presentes", M, doc.y, { width: LARG });
    doc.moveDown(0.4);
    const col = (LARG - 20) / 2;
    for (let i = 0; i < assinantes.length; i += 2) {
      quebra(34);
      const y = doc.y + 16;
      for (const [j, p] of [assinantes[i], assinantes[i + 1]].entries()) {
        if (!p) continue;
        const x = M + j * (col + 20);
        doc.moveTo(x, y).lineTo(x + col, y).lineWidth(0.7).strokeColor("#666").stroke();
        // nome longo é cortado com reticências: aqui a linha tem largura fixa
        // e o texto transbordaria por cima da coluna vizinha
        doc.font("Helvetica").fontSize(8).fillColor("#333")
          .text(cortar(doc, p.nome, col), x, y + 2.5, { width: col, lineBreak: false });
      }
      doc.y = y + 16; doc.x = M;
    }
  }

  // Sem bloco de procedência no pé da ata: a ata é documento do órgão, e a
  // origem do arquivo (situação, provedor da minuta) fica só na tela do
  // ARCHÉ, onde interessa a quem edita — não no papel que vai à assinatura.
  finalizar(doc, timbreDaAta(ata), marcaEm(ata.sessao?.data));
  return fim;
}

/* ========================================================================
   ARCHÉ AT — lista de presença: o papel que roda na mesa para assinatura.
   O arquivamento da via assinada é do próprio órgão; ao ARCHÉ cabe guardar
   a cópia gerada e dar à PROPPEX a visão de acompanhamento.
   ======================================================================== */
export async function gerarPresencaPdf(ata) {
  const s = ata.sessao || {};
  const { doc, fim, quebra, secao, campo } = criarDoc();

  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("LISTA DE PRESENÇA", M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(tituloDe(ata), { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(`Sessão ${s.tipo || "ordinária"} de ${fmtDataLonga(s.data)}` +
      `${s.horaInicio ? ` · ${s.horaInicio}` : ""}${s.local ? ` · ${s.local}` : ""}`,
      { width: LARG, align: "center" });
  doc.moveDown(0.7);

  secao("Membros e convidados");
  // Nome e cargo empilhados à esquerda; a linha de assinatura desce até
  // abaixo dos dois, para que um nome ou um cargo longo (que quebra em duas
  // linhas) não escreva por cima do traço nem da pessoa seguinte.
  const COL = LARG * 0.42;
  const linha = (nome, cargo) => {
    doc.font("Helvetica").fontSize(9);
    const hNome = nome ? doc.heightOfString(nome, { width: COL }) : 0;
    doc.font("Helvetica").fontSize(7.5);
    const hCargo = cargo ? doc.heightOfString(cargo, { width: COL }) : 0;
    const alt = Math.max(hNome + hCargo, 20) + 4;
    quebra(alt + 14);
    const topo = doc.y, y = topo + alt;
    if (nome) doc.font("Helvetica").fontSize(9).fillColor("#111")
      .text(nome, M + 2, topo, { width: COL });
    if (cargo) doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(cargo, M + 2, topo + hNome, { width: COL });
    doc.moveTo(M + LARG * 0.45, y).lineTo(M + LARG, y).lineWidth(0.7).strokeColor("#666").stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED)
      .text("assinatura", M + LARG * 0.45, y + 2.5, { width: LARG * 0.55, lineBreak: false });
    doc.y = y + 14; doc.x = M;
  };
  const inscritos = ata.participantes || [];
  for (const p of inscritos) {
    linha(p.nome, [p.cargo, p.condicao === "convidado" ? "convidado(a)" : p.condicao === "suplente" ? "suplente" : ""]
      .filter(Boolean).join(" · "));
  }
  // linhas em branco para quem chegar sem estar na lista prévia
  for (let i = 0; i < Math.max(3, 6 - inscritos.length); i++) linha("", "");

  // sem secretaria designada no sistema, a folha termina nas assinaturas
  if (ata.secretaria?.nome) {
    quebra(90);
    doc.moveDown(2);
    const y2 = doc.y;
    doc.moveTo(M + 95, y2).lineTo(M + LARG - 95, y2).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text("Secretaria da sessão", M, y2 + 3, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(ata.secretaria.nome, M, doc.y + 1, { width: LARG, align: "center" });
  }

  finalizar(doc, timbreDaAta(ata), marcaEm(ata.sessao?.data));
  return fim;
}

/* ========================================================================
   ARCHÉ IC — Resultado do processo seletivo de um edital, em PDF timbrado.

   É o documento que a PROPPEX publica e arquiva: a lista dos projetos
   submetidos àquele edital, com a classificação e o que foi concedido a
   cada um. Serve tanto para o edital corrente quanto para os antigos, que
   entram no sistema como histórico.

   gerarResultadoEditalPdf({ edital, projetos, emitidoPor, fase }) -> Promise<Buffer>

   A publicação tem duas fases (decisão do dono, ago/2026): o resultado
   PRELIMINAR sai só com os projetos aprovados, antes da distribuição das
   bolsas — é com essa lista que a PROPPEX negocia as cotas com a
   presidência; o resultado FINAL sai depois, com a bolsa concedida a cada
   projeto. fase = "preliminar" | "final" (padrão).
   ======================================================================== */
const ROTULO_LINHA = { ic: "IC", it: "IT", ie: "IE" };

export async function gerarResultadoEditalPdf({ edital = {}, projetos = [], emitidoPor = "", fase = "final" } = {}) {
  const { doc, fim, quebra, secao } = criarDoc();
  const numero = edital.numero || "—";
  const preliminar = fase === "preliminar";
  // no preliminar, os quadros listam SÓ os aprovados — sem bolsa, que ainda
  // não existe; o total de submissões continua no resumo, para o contexto
  const lista = preliminar
    ? projetos.filter((p) => ["aprovado", "concluido"].includes(p.status))
    : projetos;

  /* -------------------------------- cabeçalho ----------------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text(preliminar ? "RESULTADO PRELIMINAR DO PROCESSO SELETIVO" : "RESULTADO DO PROCESSO SELETIVO",
      M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(`Edital nº ${numero}`, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("Iniciação Científica · Inovação Tecnológica · Iniciação à Extensão",
      { width: LARG, align: "center" });
  if (edital.vigencia?.inicio) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(`Vigência dos planos de trabalho: ${fmtDataLonga(edital.vigencia.inicio)} a ${fmtDataLonga(edital.vigencia.fim)}`,
        { width: LARG, align: "center" });
  }
  doc.moveDown(0.5);

  /* --------------------------------- resumo ------------------------------- */
  const conta = (f) => projetos.filter(f).length;
  const comBolsa = conta((p) => p.fomento?.tipo === "cnpq" || p.fomento?.tipo === "uniego");
  secao("Resumo do processo");
  // preliminar: as bolsas ainda não foram distribuídas — as linhas de
  // fomento sairiam todas zeradas e leriam como decisão, não como pendência
  const linhas = preliminar
    ? [
      ["Propostas submetidas ao edital", projetos.length],
      ["Aprovadas", lista.length],
      ["Devolvidas ou reprovadas", conta((p) => ["devolvido", "reprovado"].includes(p.status))],
    ]
    : [
      ["Propostas submetidas ao edital", projetos.length],
      ["Aprovadas", conta((p) => ["aprovado", "concluido"].includes(p.status))],
      ["Bolsa CNPq", conta((p) => p.fomento?.tipo === "cnpq")],
      ["Bolsa UNIEGO", conta((p) => p.fomento?.tipo === "uniego")],
      ["Voluntárias", conta((p) => p.fomento?.tipo === "voluntario")],
      ["Sem decisão de fomento", conta((p) => !p.fomento)],
      ["Devolvidas ou reprovadas", conta((p) => ["devolvido", "reprovado"].includes(p.status))],
      ["Em avaliação", conta((p) => p.status === "submetido")],
    ];
  for (const [rot, n] of linhas) {
    quebra(13);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(rot, M + 4, y, { width: LARG - 60 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(String(n), M + LARG - 56, y, { width: 52, align: "right" });
    doc.y = y + 13; doc.x = M;
  }
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
    .text(preliminar
      ? "Resultado preliminar: a distribuição das bolsas (CNPq e UNIEGO) será divulgada no resultado final."
      : `${comBolsa} proposta(s) contemplada(s) com bolsa.`, M + 4, doc.y + 3, { width: LARG - 8 });

  /* ------------------------------ classificação --------------------------- */
  // Dois quadros, na ordem do processo: primeiro os professores doutores
  // (as bolsas PIBIC/CNPq exigem doutorado), depois o geral com todos —
  // doutores inclusive. Quem tem nota vem antes, da maior para a menor; o
  // resto segue pelo protocolo, para o documento não sugerir posição que a
  // seleção não deu.
  const { doutores, geral } = classificarProjetos(lista);
  const rotTitulacao = (tit) =>
    (TITULACOES.find((x) => x.codigo === normalizarTitulacao(tit)) || {}).nome || "";

  const COL = { pos: 0.045, n: 0.115, t: 0.315, o: 0.185, np: 0.065, cl: 0.065, tot: 0.085, f: 0.125 };
  const cab = () => {
    quebra(20);
    const y = doc.y;
    doc.rect(M, y, LARG, 15).fill("#f2f6f8");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    let x = M + 4;
    for (const [rot, w] of [["", COL.pos], ["Protocolo", COL.n], ["Título", COL.t], ["Orientação", COL.o],
      ["NP", COL.np], ["CL", COL.cl], ["Total", COL.tot], ["Resultado", COL.f]]) {
      doc.text(rot.toUpperCase(), x, y + 4.5, { width: LARG * w - 5, lineBreak: false });
      x += LARG * w;
    }
    doc.y = y + 18; doc.x = M;
  };

  const quadro = (titulo, lista) => {
    secao(titulo);
    if (!lista.length) {
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
        .text("Nenhuma proposta neste quadro.", M + 4, doc.y, { width: LARG });
      doc.moveDown(0.6);
      return;
    }
    cab();
    let posicao = 0;
    for (const p of lista) {
      const comNota = p.classificacao?.total != null;
      if (comNota) posicao += 1;
      const titulo2 = p.titulo || "(sem título)";
      const orient = p.orientador?.nome || p.orientador?.email || "—";
      // no preliminar todo projeto listado é aprovado — a bolsa (ou não)
      // é justamente o que o resultado final vai dizer
      const resultado = preliminar ? "Aprovada"
        : p.fomento
          ? (fomentoDePdf(p.fomento.tipo) + (p.fomento.modalidade ? ` · ${p.fomento.modalidade.toUpperCase()}` : ""))
          : (p.status === "reprovado" ? "Não recomendado"
            : p.status === "devolvido" ? "Devolvido"
            : p.status === "submetido" ? "Em avaliação" : "—");

      doc.font("Helvetica").fontSize(8);
      const alt = Math.max(
        doc.heightOfString(titulo2, { width: LARG * COL.t - 8 }),
        doc.heightOfString(orient, { width: LARG * COL.o - 8 }),
        doc.heightOfString(resultado, { width: LARG * COL.f - 5 }), 11) + 4;
      quebra(alt + 4);
      if (doc.y < TOPO + 6) cab();        // recomeçou a página: repete o cabeçalho
      const y = doc.y;
      let x = M + 4;
      const celula = (txt, w, opc = {}) => {
        doc.text(txt, x, y, { width: LARG * w - 6, ...opc });
        x += LARG * w;
      };
      doc.font("Helvetica-Bold").fontSize(8).fillColor(comNota ? "#111" : MUTED);
      celula(comNota ? `${posicao}º` : "—", COL.pos, { lineBreak: false });
      doc.fillColor(TEAL);
      celula(p.numero || "—", COL.n, { lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#1a1a1a");
      celula(titulo2, COL.t);
      doc.fillColor("#333");
      celula(orient, COL.o);
      // Nota do projeto e nota final só quando a seleção as apurou: sem
      // parecer (ou nota da coordenação) o zero impresso viraria nota.
      doc.font("Helvetica").fillColor("#333");
      celula(p.classificacao?.np != null ? String(p.classificacao.np) : "—", COL.np, { lineBreak: false });
      celula(p.classificacao?.cl != null ? String(p.classificacao.cl) : "—", COL.cl, { lineBreak: false });
      doc.font("Helvetica-Bold").fillColor("#111");
      celula(comNota ? String(p.classificacao.total) : "—", COL.tot, { lineBreak: false });
      doc.font("Helvetica").fillColor(p.fomento && p.fomento.tipo !== "voluntario" ? "#3f8a5d" : "#333");
      celula(resultado, COL.f);

      doc.font("Helvetica").fontSize(7).fillColor(MUTED)
        .text(`${(p.curso || "—")} · ${ROTULO_LINHA[p.linha] || p.linha || "—"}` +
          `${rotTitulacao(p.orientador?.titulacao) ? ` · ${rotTitulacao(p.orientador?.titulacao)}` : ""}` +
          `${p.alunos?.length ? ` · ${p.alunos.map((a) => a.nome).filter(Boolean).join(", ")}` : ""}` +
          `${p.inclusaoManual ? " · inclusão deferida fora do prazo" : ""}`,
          M + 4 + LARG * (COL.pos + COL.n), y + alt - 3, { width: LARG * (COL.t + COL.o) - 8 });
      doc.y = y + alt + 6; doc.x = M;
      doc.moveTo(M, doc.y - 3).lineTo(M + LARG, doc.y - 3).lineWidth(0.4).strokeColor(LINE).stroke();
    }
    doc.moveDown(0.5);
  };

  quadro(preliminar ? "Projetos aprovados — professores doutores" : "Classificação — professores doutores", doutores);
  quadro(preliminar ? "Projetos aprovados — classificação geral" : "Classificação geral — todos os professores", geral);
  if (!geral.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text(preliminar ? "Nenhuma proposta aprovada neste edital."
        : "Nenhuma proposta registrada para este edital.", M + 4, doc.y, { width: LARG });
  }

  /* -------------------------------- critério ------------------------------ */
  secao("Como a classificação foi apurada");
  doc.font("Helvetica").fontSize(8.5).fillColor("#222").text(
    "Nota final (Total) = NP + CL. NP é a nota do projeto (0 a 100): a média dos "
    + "pareceres da seleção — ou a nota atribuída diretamente pela coordenação, quando a avaliação foi "
    + "conduzida fora do sistema. CL é a pontuação do currículo: a da planilha oficial de produção "
    + "acadêmica do coordenador, em valor absoluto e sem teto. O quadro dos professores doutores atende às "
    + "modalidades que exigem doutorado (bolsas CNPq); o quadro geral classifica todas as propostas. "
    + "Proposta ainda sem nota de projeto aparece sem nota final; planilha não preenchida pontua zero no currículo."
    + (preliminar ? " Este é o resultado PRELIMINAR: relaciona apenas os projetos aprovados. A distribuição das "
      + "bolsas entre eles será divulgada no resultado final." : ""),
    M + 4, doc.y, { width: LARG - 8, align: "justify", lineGap: 1.4 });

  /* ------------------------------ assinaturas ----------------------------- */
  quebra(150);
  doc.moveDown(1.4);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  // quem assina o resultado do processo: a coordenação de pesquisa, o
  // pró-reitor e o reitor — no preliminar e no final
  blocoAssinaturas(doc, quebra, [ASSINA.coordPesquisa, ASSINA.proReitor, ASSINA.reitor]);
  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, ["PRÓ-REITORIA DE PESQUISA", "E EXTENSÃO"]);
  return fim;
}

const fomentoDePdf = (t) => ({ cnpq: "Bolsa CNPq", uniego: "Bolsa UNIEGO", voluntario: "Voluntário" }[t] || t || "—");

/* ========================================================================
   ARCHÉ IC — Certificado de participação (aluno) e de orientação (professor).

   Paisagem, uma página, timbre DA ÉPOCA: os ciclos encerrados antes da
   transformação saem com a marca da FACEG (marcaEm decide pela data de
   encerramento da vigência), e os de agora, com a do UNIEGO. É a mesma
   regra das atas — documento antigo não pode sair com marca que não existia.

   gerarCertificadoPdf(cert) -> Promise<Buffer>
   ======================================================================== */
const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function mesAnoExtenso(iso) {
  const [y, m] = String(iso || "").split("-");
  return y && m ? `${MESES_EXT[Number(m) - 1]} de ${y}` : "—";
}

export async function gerarCertificadoPdf(cert = {}) {
  const marca = marcaEm(cert.vigencia?.fim);
  const doc = new PDFDocument({ size: "A4", layout: "landscape",
    margins: { top: 60, bottom: 50, left: 60, right: 60 }, bufferPages: true });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.width - 120;              // largura útil na paisagem
  const X = 60;
  const orientacao = cert.tipo === "orientacao";

  // moldura discreta, na cor da marca da época
  doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56)
    .lineWidth(2).strokeColor(marca.cor).stroke();
  doc.rect(34, 34, doc.page.width - 68, doc.page.height - 68)
    .lineWidth(0.6).strokeColor(marca.cor).stroke();

  try { doc.image(marca.logo, X, 52, { height: marca.logoAltura + 6 }); } catch { /* segue sem logo */ }
  doc.font("Helvetica-Bold").fontSize(10).fillColor(marca.cor)
    .text("PRÓ-REITORIA DE PÓS-GRADUAÇÃO, PESQUISA, EXTENSÃO E AÇÃO COMUNITÁRIA",
      X, 62, { width: L, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(marca.nome, X, doc.y + 2, { width: L, align: "right" });

  doc.font("Helvetica-Bold").fontSize(26).fillColor(marca.cor)
    .text("CERTIFICADO", X, 132, { width: L, align: "center", characterSpacing: 3 });
  doc.font("Helvetica").fontSize(11).fillColor(MUTED)
    .text(orientacao ? "de orientação em Iniciação Científica"
      : "de participação em Iniciação Científica", X, doc.y + 4, { width: L, align: "center" });

  /* --------------------------------- texto -------------------------------- */
  const vig = cert.vigencia || {};
  const periodo = vig.inicio && vig.fim
    ? `de ${mesAnoExtenso(vig.inicio)} a ${mesAnoExtenso(vig.fim)}`
    : `no ciclo ${cert.edital || ""}`;
  const modal = cert.modalidade ? ` na modalidade ${cert.modalidade},` : (cert.bolsista ? " na condição de bolsista," : ",");

  const corpo = orientacao
    ? `Certificamos que ${(cert.pessoa || "").toUpperCase()} orientou o(a) acadêmico(a) `
      + `${cert.aluno || ""}${modal} no Programa de Iniciação Científica ${marca.artigo === "na" ? "da" : "do"} `
      + `${marca.sigla}, ${periodo}, com o plano de trabalho intitulado “${cert.titulo || ""}”.`
    : `Certificamos que ${(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ","} `
      + `participou do Programa de Iniciação Científica ${marca.artigo === "na" ? "da" : "do"} ${marca.sigla}${modal.replace(/,$/, "")}, `
      + `${periodo}, com o plano de trabalho intitulado “${cert.titulo || ""}”, `
      + `sob orientação de ${cert.orientador || "—"}.`;

  doc.font("Helvetica").fontSize(13).fillColor("#1a1a1a")
    .text(corpo, X + 30, 206, { width: L - 60, align: "justify", lineGap: 6 });

  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, X, doc.y + 18, { width: L, align: "center" });

  /* ------------------------------ assinaturas ----------------------------- */
  // no certificado assinam o pró-reitor e o reitor — e aqui a assinatura vem
  // digitalizada, quando o PNG existe em templates/
  const y = Math.max(doc.y + 62, doc.page.height - 150);
  const imgs = cert.assinaturas || {};
  const assina = [
    { ...ASSINA.proReitor, img: imgs.proreitor },
    { ...ASSINA.reitor, img: imgs.reitor },
  ];
  const w = L / assina.length;
  assina.forEach((a, i) => {
    const x = X + i * w;
    // a imagem fica ACIMA da linha, centrada e sem encostar no nome
    if (a.img) {
      try { doc.image(a.img, x + w / 2 - 55, y - 46, { fit: [110, 42], align: "center" }); }
      catch { /* sem o arquivo, sai só a linha */ }
    }
    doc.moveTo(x + 22, y).lineTo(x + w - 22, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
      .text(a.nome, x + 6, y + 5, { width: w - 12, align: "center" });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(a.cargo, x + 6, doc.y + 1, { width: w - 12, align: "center" });
  });

  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text(`Documento emitido pelo ARCHÉ · ${cert.numero ? `projeto ${cert.numero} · ` : ""}`
      + `edital ${cert.edital || "—"} · código de validação ${cert.codigo || "—"}`,
      X, doc.page.height - 62, { width: L, align: "center" });

  doc.end();
  return fim;
}

// o CPF sai formatado no documento, mas é guardado só em dígitos
function formatarCpfPdf(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

/* ========================================================================
   ARCHÉ IC — Fichas dos projetos, para arquivo e conferência.

   Um documento com a FICHA COMPLETA de cada projeto, uma por página: é o
   que a PROPPEX imprime para a reunião da seleção e para o arquivo do
   processo. Sai com o recorte que estiver na tela (mesmos filtros).

   gerarProjetosPdf({ projetos, titulo, filtros, emitidoPor }) -> Promise<Buffer>
   ======================================================================== */
export async function gerarProjetosPdf({ projetos = [], titulo = "", filtros = "", emitidoPor = "" } = {}) {
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();
  const rot = (c, lista) => (lista.find((x) => x.codigo === c) || {}).nome || c || "—";

  /* ------------------------------- capa ---------------------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("FICHAS DOS PROJETOS", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor("#111")
    .text(titulo || "Iniciação Científica · Inovação Tecnológica · Iniciação à Extensão",
      M, doc.y + 4, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`${projetos.length} projeto(s)${filtros ? ` · ${filtros}` : ""} · emitido em ${hojeExtenso()}`,
      M, doc.y + 3, { width: LARG, align: "center" });

  secao("Sumário");
  for (const [i, p] of projetos.entries()) {
    quebra(13);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEAL)
      .text(p.numero || `#${i + 1}`, M + 4, y, { width: 70, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor("#222")
      .text(cortar(doc, p.titulo || "(sem título)", LARG - 190), M + 78, y, { width: LARG - 190, lineBreak: false });
    doc.fillColor(MUTED)
      .text(p.orientador?.nome || "—", M + LARG - 108, y, { width: 104, lineBreak: false, align: "right" });
    doc.y = y + 12; doc.x = M;
  }

  /* ------------------------- uma ficha por projeto ------------------------ */
  for (const p of projetos) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL)
      .text(p.numero || "(sem protocolo)", M, TOPO, { width: LARG });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      // campo em branco = ciclo vigente, como no resto do sistema
      .text(`${rot(p.status, STATUS_FICHA)} · edital ${p.edital || EDITAL.numero}`, M, doc.y + 1, { width: LARG });
    doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#111")
      .text(p.titulo || "(sem título)", M, doc.y + 6, { width: LARG });

    secao("Identificação");
    campo("Curso", cursoDe(p.curso)?.nome || p.curso);
    campo("Linha", rot(p.linha, LINHAS_FICHA));
    campo("Modalidade", modalidadeDeFicha(p));
    campo("Grupo de pesquisa (DGP/CNPq)", p.grupoPesquisa || "não informado");
    campo("Vigência do plano", `${fmtDataLonga(p.inicio)} a ${fmtDataLonga(p.fim)}`);
    if (p.linhaPesquisa) campo("Linha de pesquisa", p.linhaPesquisa);
    if (p.inclusaoManual) campo("Observação", "inclusão deferida fora do prazo");

    secao("Orientação");
    campo("Nome", p.orientador?.nome);
    campo("Titulação", rot(normalizarTitulacao(p.orientador?.titulacao), TITULACOES));
    campo("E-mail", p.orientador?.email);
    if (p.orientador?.telefone) campo("Telefone", p.orientador.telefone);
    if (p.orientador?.lattes) campo("Currículo Lattes", p.orientador.lattes);

    secao("Resumo"); texto(p.resumo);
    if (p.palavrasChave) campo("Palavras-chave", p.palavrasChave);
    secao("Objetivos"); texto(p.objetivos);
    secao("Justificativa e relevância"); texto(p.justificativa);
    secao("Metodologia"); texto(p.metodologia);
    if (p.resultadosEsperados) { secao("Resultados esperados"); texto(p.resultadosEsperados); }
    if (p.referencias) { secao("Referências"); texto(p.referencias); }

    if (p.etica?.exige) {
      secao("Comitê de ética");
      campo("Comitê", (p.etica.comite || "").toUpperCase() || "—");
      campo("Protocolo", `${p.etica.protocolo || "—"}${p.etica.situacao ? ` · ${p.etica.situacao}` : ""}`);
    }

    if ((p.cronograma || []).length) {
      secao("Cronograma");
      for (const e of p.cronograma) {
        quebra(13);
        const y = doc.y;
        doc.font("Helvetica").fontSize(8.5).fillColor("#222")
          .text(cortar(doc, e.atividade || "—", LARG - 210), M + 4, y, { width: LARG - 210, lineBreak: false });
        doc.fillColor(MUTED)
          .text(`${fmtData(e.inicio)} a ${fmtData(e.fim)}`, M + LARG - 200, y, { width: 110, lineBreak: false });
        doc.text(e.responsavel === "aluno" ? "aluno" : (e.responsavel ? "aluno indicado" : "orientação"),
          M + LARG - 86, y, { width: 82, lineBreak: false, align: "right" });
        doc.y = y + 12; doc.x = M;
      }
    }

    if ((p.alunos || []).length) {
      secao("Alunos indicados");
      for (const a of p.alunos) {
        campo(a.nome || "—", [a.curso, a.periodo, a.email, a.bolsista ? "bolsista" : "voluntário"]
          .filter(Boolean).join(" · "));
      }
    }

    if (p.classificacao || p.producao) {
      secao("Seleção");
      if (p.producao != null) campo("Pontuação do currículo (CL)", String(p.producao));
      if (p.classificacao) {
        campo("Nota do projeto (NP)", p.classificacao.np ?? "—");
        campo("Nota final (NP + CL)", p.classificacao.total ?? "—");
      }
      if (p.fomento) campo("Fomento concedido", fomentoDePdf(p.fomento.tipo));
    }
  }

  if (emitidoPor) {
    quebra(30);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 10, { width: LARG, align: "center" });
  }
  finalizar(doc, ["PRÓ-REITORIA DE PESQUISA", "E EXTENSÃO"]);
  return fim;
}

// catálogos usados só na ficha (evita importar o módulo inteiro da IC)
const STATUS_FICHA = [
  { codigo: "rascunho", nome: "Rascunho" }, { codigo: "submetido", nome: "Em avaliação" },
  { codigo: "devolvido", nome: "Devolvido" }, { codigo: "aprovado", nome: "Em execução" },
  { codigo: "concluido", nome: "Concluído" }, { codigo: "reprovado", nome: "Reprovado" },
];
const LINHAS_FICHA = [
  { codigo: "ic", nome: "Iniciação Científica" }, { codigo: "it", nome: "Inovação Tecnológica" },
  { codigo: "ie", nome: "Iniciação à Extensão" },
];
const modalidadeDeFicha = (p) => p.modalidadeHistorica
  || (p.fomento ? fomentoDePdf(p.fomento.tipo) : "")
  || (p.modalidade ? `${p.modalidade} (pretendida)` : "a definir na seleção");
