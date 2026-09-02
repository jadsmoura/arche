/* ========================================================================
   Relatório de Atividade (extensão) em PDF — réplica do formulário oficial
   da PROPPEX (mesmos campos e ordem do documento institucional), com
   timbrado em todas as páginas.
   gerarRelatorioPdf(acao) -> Promise<Buffer>
   ======================================================================== */
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assinantesDaAta, cursoDe, orgaoDe, quorum, tituloDe } from "./atas.js";
import { pautaDe } from "./pautas.js";
import { marcaEm, MARCAS } from "./marca.js";
import { classificarProjetos, normalizarTitulacao, TITULACOES, EDITAL, MODALIDADES, LINHAS,
  modalidadeDe, modalidadePor } from "./edital.js";
import { formatarCpf } from "./cpf.js";
import { cursosEmTexto, PAPEIS_COMISSAO } from "./eventos.js";
import { normalizarCurricularizacao, chCurricularizada, rotuloPeriodo } from "./curricularizacao.js";
import { limparColagem } from "./texto.js";
import { termoDoAluno, termoDoOrientador, termoDoAlunoEM, autorizacaoResponsavelEM,
  alunosDoLote, fomentoDoProjeto } from "./termos.js";

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
export const ASSINA = {
  reitor: { nome: "Dr. José Mateus dos Santos", cargo: "Reitor" },
  proReitor: {
    nome: "Dr. Jadson Belem de Moura",
    cargo: "Pró-Reitor de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária",
  },
  coordPesquisa: { nome: "Dr. Wagner Gonçalves Vieira Junior", cargo: "Coordenador de Pesquisa e Inovação" },
  /* A PROAC entra no edital de monitoria (decisão do dono, ago/2026): o
     Programa é ação de ENSINO, concebida por ela; a PROPPEX opera. */
  proReitoraAcademica: { nome: "Dra. Matildes José de Oliveira", cargo: "Pró-Reitora Acadêmica" },
  // entrou com o relatório de curricularização da extensão (ago/2026): é
  // quem assina o modelo institucional da PROAC, ao lado da pró-reitora
  coordGestaoAcademica: { nome: "Profa. Me. Rosa Maria de Brito Steckelberg",
    cargo: "Coordenadora de Gestão Acadêmica" },
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
   centrados sob cada linha. Anda o doc.y até o fundo da coluna mais alta.
   Entrada com `img` desenha a assinatura digitalizada do banco sobre a
   linha (pedido do dono, ago/2026: "todos os documentos gerados que
   possuírem usuários com assinatura cadastrada devem ter suas respectivas
   assinaturas"); sem imagem, sai só a linha, como sempre. */
/* ------------------ A ASSINATURA DIGITALIZADA E A LINHA ------------------
   Achado do dono (ago/2026): "abri um projeto de extensão aprovado e as
   assinaturas estão sobrepostas". Estavam mesmo — em cima do "Goianésia, …
   de 2026." e do nome do responsável.

   A imagem mora ENTRE o texto anterior e a linha. O espaço era aberto com
   `moveDown(2.6)` — que depende do corpo da fonte em uso, e dava cerca de 30
   pontos — enquanto a imagem era desenhada 42 pontos ACIMA da linha: ela
   subia uns 12 pontos para dentro do que já estava escrito. Duas contas
   diferentes para a mesma distância, e em cinco lugares do arquivo.

   Agora é UMA conta só, em pontos, e a mesma serve para reservar o espaço e
   para posicionar a imagem — assim as duas não podem voltar a discordar. */
const ASS_ALT = 34;        // altura máxima da assinatura desenhada
const ASS_LARG = 96;
const ASS_FOLGA = 6;       // respiro entre o pé da assinatura e a linha
/** Quanto descer antes de traçar a linha (com imagem, cabe a assinatura). */
const espacoDaAssinatura = (temImg) => (temImg ? ASS_ALT + ASS_FOLGA + 12 : 30);
/** Desenha a assinatura APOIADA na linha, centrada em `centroX`. */
function assinaturaSobreLinha(doc, img, centroX, yLinha) {
  if (!img) return;
  try {
    doc.image(img, centroX - ASS_LARG / 2, yLinha - ASS_ALT - ASS_FOLGA,
      { fit: [ASS_LARG, ASS_ALT], align: "center" });
  } catch { /* sem a imagem, sai só a linha */ }
}

function blocoAssinaturas(doc, quebra, lista, imgs = {}) {
  const temImg = lista.some((a) => a.img && imgs[a.img]);
  quebra(temImg ? 145 : 95);
  doc.y += espacoDaAssinatura(temImg);
  const y = doc.y;
  const w = LARG / lista.length;
  let fundo = y;
  lista.forEach((a, i) => {
    const x = M + i * w;
    assinaturaSobreLinha(doc, a.img && imgs[a.img], x + w / 2, y);
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
/* O nome da pró-reitoria por extenso, como ela se chama (correção do dono,
   ago/2026): documento oficial não abrevia o órgão que o expede. São duas
   linhas longas, e por isso o texto do timbrado começa DEPOIS do logotipo —
   centrado na largura cheia, ele passava por cima da marca. */
const TIMBRE_PADRAO = ["PRÓ-REITORIA DE PÓS-GRADUAÇÃO, PESQUISA,", "EXTENSÃO E AÇÃO COMUNITÁRIA"];
const TIMBRE_PROAC = ["PRÓ-REITORIA ACADÊMICA"];
function timbrado(doc, linhas = TIMBRE_PADRAO, marca = MARCAS.uniego) {
  try { doc.image(marca.logo, M, 42, { height: marca.logoAltura }); } catch { /* segue sem logo */ }
  const l = (linhas.length ? linhas : TIMBRE_PADRAO).slice(0, 2);
  // faixa à direita do logotipo: é o que permite escrever o nome inteiro
  const X = M + 128, W = LARG - 128;
  let y = l.length > 1 ? 50 : 57;
  doc.font("Helvetica-Bold").fontSize(l.some((x) => String(x).length > 30) ? 9.5 : 11).fillColor(marca.cor);
  for (const linha of l) { doc.text(linha, X, y, { width: W, align: "center" }); y += 14; }
  // a FACEG identifica-se pelo nome por extenso abaixo do órgão: o logotipo
  // dela não traz "Goianésia" em corpo legível na altura do timbrado
  if (marca.codigo !== "uniego") {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(marca.nome, X, y + 1, { width: W, align: "center" });
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

/* A ÚLTIMA DEFESA DO DOCUMENTO OFICIAL (achado do dono, ago/2026): as fontes
   padrão do PDF só desenham o repertório WinAnsi, e o que estiver fora dele
   sai como lixo na página — foi o que aconteceu com a proposta da Campanha
   Agosto Dourado, colada do Word com "letras que não são letras".

   A limpeza já acontece na GRAVAÇÃO, que é onde ela conserta o dado. Aqui
   ela roda de novo, no último ponto antes da tinta, por dois motivos: os
   registros gravados ANTES desta correção continuam com o defeito, e um
   texto que chegue por um caminho novo (uma importação, um lote) não pode
   voltar a estragar um documento assinado. Vale para TODO PDF do ARCHÉ. */
function blindarTexto(doc) {
  const original = doc.text.bind(doc);
  doc.text = (t, ...resto) => original(typeof t === "string" ? limparColagem(t) : t, ...resto);
  return doc;
}

// Documento A4 timbrado com os helpers de composição usados pelos
// formulários da PROPPEX (relatório e proposta).
function criarDoc() {
  const doc = blindarTexto(new PDFDocument({ size: "A4", margins: { top: TOPO, bottom: 70, left: M, right: M }, bufferPages: true }));
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

/* O REGISTRO FOTOGRÁFICO, dentro do documento (pedido do dono, ago/2026):
   o relatório final é o que a PROPPEX apresenta ao avaliador do MEC, e uma
   lista de nomes de arquivo não comprova nada — quem comprova a realização é
   a foto. As imagens chegam já lidas (`fotos: [{ nome, buffer }]`), porque
   ler o Drive é trabalho do servidor, não do desenhista do PDF.

   Duas fotos por linha, três linhas por página. Imagem que o PDFKit não sabe
   ler (HEIC, WEBP) é PULADA com o nome dito na legenda: um formato exótico
   não pode derrubar o relatório inteiro. */
const FOTOS_POR_LINHA = 2, LINHAS_POR_PAGINA = 3;

function paginasDeFotos(doc, fotos, { M, LARG, RODAPE_Y, TOPO, legenda = "" }) {
  if (!fotos.length) return;
  const gap = 14;
  const cel = (LARG - gap * (FOTOS_POR_LINHA - 1)) / FOTOS_POR_LINHA;
  const alt = cel * 0.72;                       // a moldura; a foto cabe dentro
  const passo = alt + 22;                       // + a legenda
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEAL)
    .text("REGISTRO FOTOGRÁFICO", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text(legenda || `${fotos.length} imagem(ns) do portfólio da ação, na ordem em que foram anexadas.`,
      M, doc.y + 3, { width: LARG, align: "center" });
  let y = doc.y + 12, col = 0, naPagina = 0;
  for (const [i, f] of fotos.entries()) {
    if (naPagina >= FOTOS_POR_LINHA * LINHAS_POR_PAGINA) {
      doc.addPage(); y = TOPO; col = 0; naPagina = 0;
    }
    const x = M + col * (cel + gap);
    doc.rect(x, y, cel, alt).lineWidth(0.5).strokeColor(LINE).stroke();
    try {
      doc.image(f.buffer, x + 3, y + 3, { fit: [cel - 6, alt - 6], align: "center", valign: "center" });
    } catch {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
        .text("(formato de imagem não suportado neste documento)", x + 6, y + alt / 2 - 6,
          { width: cel - 12, align: "center" });
    }
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`${i + 1}. ${String(f.nome || "foto").slice(0, 60)}`, x, y + alt + 3,
        { width: cel, align: "center", lineBreak: false });
    col += 1; naPagina += 1;
    if (col >= FOTOS_POR_LINHA) { col = 0; y += passo; }
    if (y + passo > RODAPE_Y - 10 && col === 0 && naPagina < FOTOS_POR_LINHA * LINHAS_POR_PAGINA) {
      doc.addPage(); y = TOPO; naPagina = 0;
    }
  }
}

export async function gerarRelatorioPdf(acao, { fotos = [], assinaturas = {} } = {}) {
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
  campo("Departamento Responsável", cursosEmTexto(acao) || p.departamento);
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

  /* ------------------- curricularização da extensão ----------------------
     Só sai quando a ação está vinculada a componente curricular: é a peça
     que comprova os 10% da matriz (Res. CNE/CES 7/2018) ao avaliador, e num
     documento oficial uma seção vazia sugeriria que nada foi cumprido. */
  const cur = normalizarCurricularizacao(p.curricularizacao);
  if (cur.vinculada && cur.componentes.length) {
    secao("Curricularização da Extensão");
    campo("Fundamento", "Resolução CNE/CES nº 7/2018 — mínimo de 10% da carga horária do curso em extensão");
    for (const c of cur.componentes) {
      const linha = [
        c.periodo ? rotuloPeriodo(c.periodo) : "",
        c.curso || "",
        c.cargaHoraria ? `${c.cargaHoraria}h curricularizadas` : "",
        c.academicos ? `${c.academicos} acadêmicos` : "",
        c.docente ? `docente: ${c.docente}` : "",
      ].filter(Boolean).join(" · ");
      campo(c.disciplina, linha || "—");
    }
    campo("Carga horária curricularizada (total)", `${chCurricularizada(cur)}h`);
    if (cur.integracao) {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text("Integração com o componente curricular:", M);
      doc.moveDown(0.1);
      texto(cur.integracao);
    }
  }
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

  /* ------------------------- números do evento ---------------------------- */
  // Snapshot gravado pelo servidor na ENTREGA do relatório de ação com
  // evento — os números do sistema de inscrições como estavam naquele
  // momento, incluindo o recorte por atividade. Documento é documento:
  // aqui só se desenha o que ficou gravado.
  const ne = r.numerosEvento;
  if (ne) {
    secao("Números do evento (inscrições e credenciamento)");
    campo("Inscritos", `${ne.inscritos} — ${ne.online} pela inscrição online e ${ne.manuais} da lista da coordenação`);
    campo("Presentes credenciados", `${ne.presentes}${ne.presentesOnline ? ` (${ne.presentesOnline} pela transmissão online)` : ""}`);
    if (ne.comentariosMural) campo("Comentários no mural do evento", ne.comentariosMural);
    if ((ne.porAtividade || []).length) {
      const colsNe = [[M, 330, "Atividade"], [M + 335, 70, "Inscritos"], [M + 410, 73, "Presentes"]];
      const cabNe = () => {
        const y = doc.y;
        doc.rect(M, y, LARG, 14).fill(TEAL);
        for (const [x, w, t] of colsNe)
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff").text(t, x + 3, y + 3, { width: w, lineBreak: false });
        doc.y = y + 17; doc.fillColor("#222");
      };
      quebra(40); cabNe();
      for (const atv of ne.porAtividade) {
        if (doc.y + 13 > RODAPE_Y - 18) { doc.addPage(); cabNe(); }
        const y = doc.y;
        doc.font("Helvetica").fontSize(8);
        doc.text(cortar(doc, atv.titulo, colsNe[0][1] - 6), colsNe[0][0] + 3, y, { width: colsNe[0][1], lineBreak: false });
        doc.text(String(atv.inscritos ?? ""), colsNe[1][0] + 3, y, { width: colsNe[1][1], lineBreak: false });
        doc.text(String(atv.presentes ?? ""), colsNe[2][0] + 3, y, { width: colsNe[2][1], lineBreak: false });
        doc.moveTo(M, y + 10.5).lineTo(M + LARG, y + 10.5).lineWidth(0.4).strokeColor(LINE).stroke();
        doc.y = y + 13; doc.x = M;
      }
    }
    doc.moveDown(0.2);
    quebra(13);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
      .text(`Apurado em ${fmtDataHora(ne.geradoEm)}, pelo sistema de inscrições do ARCHÉ.`, M, doc.y, { width: LARG });
  }

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
      // `lineBreak: false` NÃO impede a quebra quando há `width` (o PDFKit só
      // deixa de calcular um width padrão): nome comprido em caixa alta —
      // como vêm as listas importadas de planilha — descia uma linha e era
      // impresso sobre o participante seguinte. Quem corta é `cortar`, o
      // mesmo helper que as tabelas vizinhas já usam.
      doc.text(cortar(doc, t.nome, cols[0][1] - 6), cols[0][0] + 3, y, { width: cols[0][1], lineBreak: false });
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
  const ass = (linhaTopo, nome, cargo, img) => {
    quebra(img ? 125 : 70);
    doc.y += espacoDaAssinatura(!!img);
    const y = doc.y;
    assinaturaSobreLinha(doc, img, M + LARG / 2, y);
    doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
    if (linhaTopo) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(linhaTopo, M, y + 3, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(nome, M, doc.y + 1, { width: LARG, align: "center" });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(cargo, M, doc.y, { width: LARG, align: "center" });
  };
  /* As assinaturas digitalizadas do banco entram no RELATÓRIO VALIDADO
     (achado do dono, ago/2026, num relatório da Veterinária que saiu com as
     linhas em branco): este PDF timbrado só existe depois do encerramento —
     os atos que ele afirma já aconteceram, e as imagens são as mesmas da
     proposta aprovada. Sem imagem, sai a linha em branco, como sempre. */
  ass("Responsável pelo Projeto de Extensão", p.respNome || "____________________________",
    p.respCargo || "", assinaturas.responsavel);
  // a coordenação da ação (Extensão para cursos livres; Ação Comunitária
  // para eventos, projetos e demais), o pró-reitor e o reitor
  reguaDeAssinaturas(doc, quebra, [
    { ...assinaturaDaAcao(p.classificacao), img: "coordenacao" },
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);

  // as fotos vêm DEPOIS das assinaturas, em páginas próprias: o corpo do
  // relatório é o que se assina, e o registro fotográfico é o anexo que o
  // comprova — misturar os dois empurraria a assinatura para o fim de tudo
  paginasDeFotos(doc, fotos, { M, LARG, RODAPE_Y, TOPO });

  finalizar(doc);
  return fim;
}

/* ========================================================================
   Proposta de Ação de Extensão em PDF — mesmo timbrado e diagramação do
   relatório final; enviada por e-mail ao responsável e à PROPPEX no ato
   da submissão.  gerarPropostaPdf(acao) -> Promise<Buffer>
   ======================================================================== */
export async function gerarPropostaPdf(acao, { assinaturas = {} } = {}) {
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
  campo("Curso / Departamento responsável", cursosEmTexto(acao) || p.departamento);
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

  /* ------------------- palestrantes e comissão organizadora ---------------
     Desde ago/2026 a proposta os indica ESTRUTURADOS (pedido do dono: o
     mesmo desenho da equipe do ARCHÉ EV, porque é daí que saem os
     certificados). O texto livre antigo (`comissaoTexto`) continua saindo
     nas ações gravadas antes da mudança. */
  const pal = acao.participantes?.palestrantes || [];
  const com = acao.participantes?.comissao || [];
  if (pal.length) {
    secao("Palestrantes e ministrantes");
    for (const x of pal) campo(x.nome || "—", [x.palestra ? `“${x.palestra}”` : "", x.instituicao || "", x.ch ? `${x.ch}h` : ""].filter(Boolean).join(" · ") || "—");
  }
  if (com.length) {
    secao("Comissão organizadora");
    const rot = Object.fromEntries(PAPEIS_COMISSAO.map((x) => [x.codigo, x.rotulo]));
    for (const x of com) campo(x.nome || "—", [x.funcao || "", rot[x.papel] || x.papel || "", x.ch ? `${x.ch}h` : ""].filter(Boolean).join(" · ") || "—");
  }
  if (!com.length && p.comissaoTexto) { secao("Comissão organizadora"); texto(p.comissaoTexto); }

  /* --------------------------- recursos e parcerias ----------------------- */
  secao("Recursos Físicos e Materiais");
  campo("a) Instalação", p.recursoInstalacao || "Não se aplica");
  campo("b) Multimídia", p.recursoMultimidia || "Não se aplica");
  campo("c) Outros", p.recursoOutros || "Não se aplica");
  campo("Parcerias externas", p.parceria || "Não se aplica");

  /* ------------------- curricularização da extensão ----------------------
     Só sai quando a ação está vinculada a componente curricular: é a peça
     que comprova os 10% da matriz (Res. CNE/CES 7/2018) ao avaliador, e num
     documento oficial uma seção vazia sugeriria que nada foi cumprido. */
  const cur = normalizarCurricularizacao(p.curricularizacao);
  if (cur.vinculada && cur.componentes.length) {
    secao("Curricularização da Extensão");
    campo("Fundamento", "Resolução CNE/CES nº 7/2018 — mínimo de 10% da carga horária do curso em extensão");
    for (const c of cur.componentes) {
      const linha = [
        c.periodo ? rotuloPeriodo(c.periodo) : "",
        c.curso || "",
        c.cargaHoraria ? `${c.cargaHoraria}h curricularizadas` : "",
        c.academicos ? `${c.academicos} acadêmicos` : "",
        c.docente ? `docente: ${c.docente}` : "",
      ].filter(Boolean).join(" · ");
      campo(c.disciplina, linha || "—");
    }
    campo("Carga horária curricularizada (total)", `${chCurricularizada(cur)}h`);
    if (cur.integracao) {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text("Integração com o componente curricular:", M);
      doc.moveDown(0.1);
      texto(cur.integracao);
    }
  }

  /* -------------------------------- responsável --------------------------- */
  secao("Responsável pela ação");
  campo("Nome", p.respNome);
  campo("Título / cargo / função", p.respCargo);
  campo("Telefone", p.respTelefone);
  campo("E-mail", p.respEmail);

  /* -------------------------------- assinatura ---------------------------- */
  quebra(assinaturas.responsavel ? 150 : 120);
  doc.moveDown(1.6);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`Goianésia, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  // a do RESPONSÁVEL também sai do banco quando existe (ago/2026)
  doc.y += espacoDaAssinatura(!!assinaturas.responsavel);
  const y = doc.y;
  assinaturaSobreLinha(doc, assinaturas.responsavel, M + LARG / 2, y);
  doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("Responsável pela proposta", M, y + 3, { width: LARG, align: "center" });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
    .text(p.respNome || "____________________________", M, doc.y + 1, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(p.respCargo || "", M, doc.y, { width: LARG, align: "center" });
  // a coordenação da ação (Extensão para cursos livres; Ação Comunitária
  // para eventos, projetos e demais), o pró-reitor e o reitor
  /* As assinaturas digitalizadas do banco entram na PROPOSTA APROVADA
     (pedido do dono, ago/2026): este PDF só existe depois da validação, e o
     ato que ele afirma já aconteceu. Sem imagem, sai a linha em branco. */
  reguaDeAssinaturas(doc, quebra, [
    { ...assinaturaDaAcao(p.classificacao), img: "coordenacao" },
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);

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

export async function gerarAtaPdf(ata, { assinaturas = {} } = {}) {
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

  /* A assinatura digitalizada de quem a tem guardada no portal (pedido dos
     órgãos, ago/2026). Ela é DESENHADA ACIMA DA LINHA, e a linha continua
     ali: a via impressa é a que circula na mesa, e quem não enviou imagem
     assina à caneta no mesmo lugar. Por isso a folha nunca perde linha
     nenhuma — o contrário do certificado, onde quem não tem imagem
     simplesmente não aparece. */
  const ALTURA_IMG = 26;
  const desenharImagem = (buf, x, larguraCaixa, yLinha) => {
    if (!buf) return;
    try {
      // ancorada no rodapé da caixa: a assinatura "pousa" sobre a linha
      doc.image(buf, x, yLinha - ALTURA_IMG - 1, {
        fit: [larguraCaixa, ALTURA_IMG], align: "center", valign: "bottom",
      });
    } catch { /* imagem que o PDFKit não lê não derruba a ata: fica a linha */ }
  };

  const lista = assinantesDaAta(ata);
  // a chave é o `ref` do assinante: o e-mail quando a lista de presença o
  // traz, o nome completo quando não — quem resolve isso é quem monta o mapa
  const imagemDe = (a) => (a.ref ? assinaturas[a.ref] || null : null);

  const assinatura = (item) => {
    quebra(96);
    doc.moveDown(2.4);
    const y = doc.y + ALTURA_IMG;
    desenharImagem(imagemDe(item), M + 95, LARG - 190, y);
    doc.moveTo(M + 95, y).lineTo(M + LARG - 95, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.y = y;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(item.rotulo, M, y + 3, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(item.nome || "____________________", M, doc.y + 1, { width: LARG, align: "center" });
    if (item.cargo) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(item.cargo, M, doc.y, { width: LARG, align: "center" });
  };
  for (const item of lista.filter((x) => x.papel !== "membro")) assinatura(item);

  const membros = lista.filter((x) => x.papel === "membro");
  if (membros.length) {
    quebra(50);
    doc.moveDown(1.4);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL)
      .text("Membros presentes", M, doc.y, { width: LARG });
    doc.moveDown(0.4);
    const col = (LARG - 20) / 2;
    for (let i = 0; i < membros.length; i += 2) {
      quebra(34 + ALTURA_IMG);
      const y = doc.y + 16 + ALTURA_IMG;
      for (const [j, p] of [membros[i], membros[i + 1]].entries()) {
        if (!p) continue;
        const x = M + j * (col + 20);
        desenharImagem(imagemDe(p), x, col, y);
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

export async function gerarResultadoEditalPdf({ edital = {}, projetos = [], emitidoPor = "", fase = "final", assinaturas = {} } = {}) {
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

  // O CURSO virou coluna (pedido do dono, ago/2026) no lugar de "Resultado":
  // com os quadros separados por categoria de bolsa, o resultado é o próprio
  // título do quadro — repeti-lo linha a linha só gastaria largura.
  const COL = { pos: 0.045, n: 0.11, t: 0.30, o: 0.175, c: 0.145, np: 0.06, cl: 0.06, tot: 0.105 };
  const cab = () => {
    quebra(20);
    const y = doc.y;
    doc.rect(M, y, LARG, 15).fill("#f2f6f8");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    let x = M + 4;
    for (const [rot, w] of [["", COL.pos], ["Protocolo", COL.n], ["Título", COL.t], ["Orientação", COL.o],
      ["Curso", COL.c], ["NP", COL.np], ["CL", COL.cl], ["Total", COL.tot]]) {
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
      const curso = p.curso || "—";

      doc.font("Helvetica").fontSize(8);
      const alt = Math.max(
        doc.heightOfString(titulo2, { width: LARG * COL.t - 8 }),
        doc.heightOfString(orient, { width: LARG * COL.o - 8 }),
        doc.heightOfString(curso, { width: LARG * COL.c - 6 }), 11) + 4;
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
      celula(curso, COL.c);
      // Nota do projeto e nota final só quando a seleção as apurou: sem
      // parecer (ou nota da coordenação) o zero impresso viraria nota.
      doc.font("Helvetica").fillColor("#333");
      celula(p.classificacao?.np != null ? String(p.classificacao.np) : "—", COL.np, { lineBreak: false });
      celula(p.classificacao?.cl != null ? String(p.classificacao.cl) : "—", COL.cl, { lineBreak: false });
      doc.font("Helvetica-Bold").fillColor("#111");
      celula(comNota ? String(p.classificacao.total) : "—", COL.tot, { lineBreak: false });

      // A SUBLINHA (linha · titulação · bolsistas) precisa ser MEDIDA antes de
      // desenhada: ela não entrava no cálculo da altura, e a linha seguinte
      // começava numa posição fixa — com dois bolsistas de nome completo, a
      // segunda linha da sublinha era impressa POR CIMA do título da próxima
      // colocada, e as duas ficavam ilegíveis. É o documento que a PROPPEX
      // publica como resultado do edital (achado da varredura de ago/2026).
      const sub = `${ROTULO_LINHA[p.linha] || p.linha || "—"}`
        + `${rotTitulacao(p.orientador?.titulacao) ? ` · ${rotTitulacao(p.orientador?.titulacao)}` : ""}`
        + `${p.alunos?.length ? ` · ${p.alunos.map((a) => a.nome).filter(Boolean).join(", ")}` : ""}`
        // como a proposta entrou é assunto do processo, não da divulgação
        // preliminar (pedido do dono): a marca fica só no resultado final
        + `${p.inclusaoManual && !preliminar ? " · inclusão deferida fora do prazo" : ""}`;
      const largSub = LARG * (COL.t + COL.o) - 8;
      doc.font("Helvetica").fontSize(7).fillColor(MUTED);
      const altSub = doc.heightOfString(sub, { width: largSub });
      doc.text(sub, M + 4 + LARG * (COL.pos + COL.n), y + alt - 3, { width: largSub });
      doc.y = y + alt + altSub + 1; doc.x = M;
      doc.moveTo(M, doc.y - 3).lineTo(M + LARG, doc.y - 3).lineWidth(0.4).strokeColor(LINE).stroke();
    }
    doc.moveDown(0.5);
  };

  /* ------------------------- quadros por categoria ------------------------
     A apresentação principal do documento (pedido do dono, ago/2026). São
     duas categorias diferentes, porque são dois momentos do processo:

       PRELIMINAR — a LINHA da proposta (Iniciação Científica, Inovação
         Tecnológica, Iniciação à Extensão). É o que existe nesta altura: a
         bolsa ainda não foi distribuída, e é com este documento que a
         PROPPEX vai à presidência definir a cota.
       FINAL — a BOLSA concedida (PIBIC/CNPq, PIBIC/UNIEGO, voluntário…),
         que é o que o processo passou a ter depois da cota. */
  const categoriaDe = (p) => {
    if (preliminar) {
      const l = LINHAS.find((x) => x.codigo === String(p.linha || "").toLowerCase());
      return l ? { ordem: LINHAS.indexOf(l), rot: l.nome }
        : { ordem: 90, rot: "Sem linha indicada" };
    }
    if (!p.fomento) return { ordem: 92, rot: "Sem decisão de fomento" };
    if (p.fomento.tipo === "voluntario") {
      const v = MODALIDADES.find((x) => x.codigo === "voluntario");
      return { ordem: MODALIDADES.indexOf(v), rot: "Voluntário — sem bolsa" };
    }
    // o quadro diz a MODALIDADE, nunca o valor da bolsa (pedido do dono,
    // ago/2026): o valor é do edital e do termo de compromisso, e num
    // documento de resultado ele só cria promessa que a cota pode desmentir
    const m = MODALIDADES.find((x) => x.codigo === p.fomento.modalidade);
    return m
      ? { ordem: MODALIDADES.indexOf(m), rot: m.nome }
      : { ordem: 91, rot: fomentoDePdf(p.fomento.tipo) };
  };
  const porCategoria = new Map();
  for (const p of geral) {                    // geral já vem na ordem de mérito
    const c = categoriaDe(p);
    if (!porCategoria.has(c.rot)) porCategoria.set(c.rot, { ordem: c.ordem, projetos: [] });
    porCategoria.get(c.rot).projetos.push(p);
  }
  for (const [rot, g] of [...porCategoria.entries()].sort((a, b) => a[1].ordem - b[1].ordem)) {
    quadro(`${rot} — ${g.projetos.length} proposta(s)`, g.projetos);
  }

  /* Os quadros de mérito (doutores e geral) NÃO entram no documento — nem no
     preliminar nem no final (pedido do dono, ago/2026). Os quadros por
     categoria já trazem cada proposta com a sua nota, na ordem de mérito
     dentro do recorte que importa; repeti-las todas em mais dois quadros só
     alonga o documento. A classificação completa continua na tela, para a
     gestão trabalhar. */
  if (!geral.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text(preliminar ? "Nenhuma proposta aprovada neste edital."
        : "Nenhuma proposta registrada para este edital.", M + 4, doc.y, { width: LARG });
  }

  /* -------------------------------- critério ------------------------------ */
  secao("Como a classificação foi apurada");
  doc.font("Helvetica").fontSize(8.5).fillColor("#222").text(
    (preliminar
      ? "Os quadros iniciais reúnem as propostas aprovadas por linha — Iniciação Científica, "
        + "Inovação Tecnológica e Iniciação à Extensão. A modalidade de bolsa de cada uma será "
        + "divulgada no resultado final. "
      : "Os quadros reúnem as propostas pela bolsa concedida a cada uma, "
        + "em ordem de mérito dentro de cada categoria. ")
    + "Nota final (Total) = NP + CL. NP é a nota do projeto (0 a 100): a média dos "
    + "pareceres da seleção — ou a nota atribuída diretamente pela coordenação, quando a avaliação foi "
    + "conduzida fora do sistema. CL é a pontuação do currículo: a da planilha oficial de produção "
    + "acadêmica do coordenador, em valor absoluto e sem teto. "
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
  blocoAssinaturas(doc, quebra, [
    { ...ASSINA.coordPesquisa, img: "coordpesquisa" },
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);
  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, TIMBRE_PADRAO);
  return fim;
}

const fomentoDePdf = (t) => ({ cnpq: "Bolsa CNPq", uniego: "Bolsa UNIEGO", voluntario: "Voluntário" }[t] || t || "—");

/* ========================================================================
   ARCHÉ IC — Resultado do processo seletivo do ICEM (Ensino Médio).

   O mesmo desenho em duas fases do resultado da graduação (decisão do dono,
   ago/2026): o PRELIMINAR sai só com a lista dos estudantes selecionados,
   em ordem de classificação e SEM bolsa — é com ele que a PROPPEX define as
   cotas; o FINAL sai em quadros por bolsa (CNPq, UNIEGO, voluntário).
   Nenhum dos dois cita valor de bolsa, CPF ou contato — são menores de
   idade, e o documento é público.

   gerarResultadoEMPdf({ turma, bolsistas, emitidoPor, fase }) -> Promise<Buffer>
   ======================================================================== */
const BOLSA_EM_ROT = {
  cnpq: "Bolsa CNPq (PIBIC-EM)", uniego: "Bolsa UNIEGO (PIBIC-EM)", voluntario: "Voluntário (ICEM)",
};
/* ========================================================================
   MONITORIA — Resultado do ciclo, para publicar em Editais e Resultados.

   Por que existe: o certificado é o que a PESSOA leva; o resultado é o que
   a INSTITUIÇÃO publica. Sem ele, um semestre inteiro de monitoria fica
   provado só nos certificados de quem os baixou, e o avaliador do MEC que
   pergunta "quais foram os monitores de 2026/1?" não tem onde ler.

   Sai no TIMBRE DA PROAC, pela mesma razão do certificado: o programa é
   ação de ENSINO, concebida e expedida pela Pró-Reitoria Acadêmica — a
   PROPPEX opera o processo, e operar não põe ninguém no documento.

   A fonte são as DUAS origens juntas: os projetos que correram no ARCHÉ e
   os do arquivo (planilhas dos ciclos anteriores à existência do módulo).
   O que veio do arquivo sai dito — número que ninguém sabe explicar é pior
   que número menor.

   gerarResultadoMonitoriaPdf({ edital, projetos, emitidoPor }) -> Buffer
   ======================================================================== */
export async function gerarResultadoMonitoriaPdf({ edital = {}, projetos = [], emitidoPor = "", assinaturas = {} } = {}) {
  const { doc, fim, quebra, secao } = criarDoc();
  const lista = (projetos || []).slice();
  // o timbre é o da ÉPOCA do ciclo: a monitoria de 2020 correu na FACEG
  const marca = marcaEm(lista.find((p) => p.fim)?.fim || "");
  const doArquivo = lista.filter((p) => p.arquivo).length;
  const monitores = lista.reduce((n, p) => n + (p.monitores || []).length, 0);
  const horas = lista.reduce((n, p) => n + (p.monitores || [])
    .reduce((h, m) => h + (Number(m.horas) || Number(p.horasPorMonitor) || 0), 0), 0);

  const nomeCurso = (p) => p.cursoNome || cursoDe(p.curso)?.nome || p.curso || "—";

  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("RESULTADO DO PROGRAMA DE MONITORIA ACADÊMICA", M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(`Edital nº ${edital.numero || "—"} — ${edital.titulo || "Monitoria Acadêmica"}`,
      { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Ciclo ${edital.ciclo || "—"}${edital.orgao ? ` · ${edital.orgao}` : ""}`,
      { width: LARG, align: "center" });
  doc.moveDown(0.5);

  secao("Resumo do ciclo");
  for (const [rot, n] of [["Projetos de monitoria", lista.length],
    ["Monitores certificados", monitores], ["Horas de monitoria", horas]]) {
    quebra(13);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(rot, M + 4, y, { width: LARG - 60 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(String(n), M + LARG - 56, y, { width: 52, align: "right" });
    doc.y = y + 13; doc.x = M;
  }
  if (doArquivo) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text(
      `${doArquivo} projeto(s) deste ciclo vêm do ARQUIVO do programa — semestres conduzidos antes `
      + "de o processo passar a correr no ARCHÉ, transcritos das planilhas das coordenações de curso. "
      + "A carga horária deles é a declarada na planilha, que é a que a coordenação certificou.",
      M + 4, doc.y + 3, { width: LARG - 8, align: "justify", lineGap: 1.2 });
    doc.moveDown(0.4);
  }

  /* ------------------------------- os quadros ----------------------------- */
  const COL = { disc: 0.32, monitor: 0.30, orient: 0.28, ch: 0.10 };
  const cab = () => {
    quebra(20);
    const y = doc.y;
    doc.rect(M, y, LARG, 15).fill("#f2f6f8");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    let x = M + 4;
    for (const [rot, w] of [["Disciplina", COL.disc], ["Monitor(a)", COL.monitor],
      ["Orientação", COL.orient], ["CH", COL.ch]]) {
      doc.text(rot.toUpperCase(), x, y + 4.5, { width: LARG * w - 5, lineBreak: false });
      x += LARG * w;
    }
    doc.y = y + 18; doc.x = M;
  };

  // um quadro por CURSO: é assim que a coordenação lê e que o avaliador
  // pergunta — "quais foram os monitores de Enfermagem neste semestre?"
  const cursos = [...new Set(lista.map(nomeCurso))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const curso of cursos) {
    const doCurso = lista.filter((p) => nomeCurso(p) === curso)
      .sort((a, b) => String(a.disciplina || "").localeCompare(String(b.disciplina || ""), "pt-BR"));
    const qt = doCurso.reduce((n, p) => n + (p.monitores || []).length, 0);
    secao(`${curso} — ${qt} monitor(es)`);
    cab();
    for (const p of doCurso) {
      for (const m of p.monitores || []) {
        doc.font("Helvetica").fontSize(8);
        const disc = p.disciplina || "—";
        const orient = p.orientador?.nome || "—";
        const alt = Math.max(
          doc.heightOfString(disc, { width: LARG * COL.disc - 8 }),
          doc.heightOfString(m.nome || "—", { width: LARG * COL.monitor - 8 }),
          doc.heightOfString(orient, { width: LARG * COL.orient - 8 }), 11) + 4;
        quebra(alt + 4);
        if (doc.y < TOPO + 6) cab();
        const y = doc.y;
        let x = M + 4;
        const celula = (t, w, opc = {}) => { doc.text(t, x, y, { width: LARG * w - 6, ...opc }); x += LARG * w; };
        doc.fillColor("#333"); celula(disc, COL.disc);
        doc.font("Helvetica-Bold").fillColor("#1a1a1a"); celula(m.nome || "—", COL.monitor);
        doc.font("Helvetica").fillColor("#333"); celula(orient, COL.orient);
        doc.fillColor("#111");
        const ch = Number(m.horas) || Number(p.horasPorMonitor) || 0;
        celula(ch ? `${ch} h` : "—", COL.ch, { lineBreak: false });
        doc.y = y + alt + 4; doc.x = M;
        doc.moveTo(M, doc.y - 2).lineTo(M + LARG, doc.y - 2).lineWidth(0.4).strokeColor(LINE).stroke();
      }
    }
    doc.moveDown(0.5);
  }
  if (!lista.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text("Nenhum projeto de monitoria registrado neste ciclo.", M + 4, doc.y, { width: LARG });
  }

  secao("Sobre este resultado");
  doc.font("Helvetica").fontSize(8.5).fillColor("#222").text(
    "Relaciona os projetos de monitoria do ciclo e os acadêmicos que atuaram como monitores, por curso. "
    + "A carga horária indicada é a cumprida por cada monitor no semestre, e é a que consta do respectivo "
    + "certificado. Não constam neste documento CPF, matrícula ou dados de contato.",
    M + 4, doc.y, { width: LARG - 8, align: "justify", lineGap: 1.4 });

  quebra(150);
  doc.moveDown(1.4);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  // assinam os mesmos do edital e do certificado da monitoria: a Pró-Reitoria
  // Acadêmica, que concebe o programa, e o Reitor
  blocoAssinaturas(doc, quebra, [
    { ...ASSINA.proReitoraAcademica, img: "proacademica" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);
  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, TIMBRE_PROAC, marca);
  return fim;
}

export async function gerarResultadoEMPdf({ turma = {}, bolsistas = [], emitidoPor = "", fase = "final", assinaturas = {} } = {}) {
  const { doc, fim, quebra, secao } = criarDoc();
  const preliminar = fase === "preliminar";
  const marca = marcaEm(turma.vigencia?.inicio);
  // fora do documento: desligados e quem não compareceu à seleção — num
  // resultado público, listar o não-compareceu como selecionado mentiria
  const lista = (bolsistas || []).filter((b) => b.situacao !== "desligado" && b.compareceu !== false);
  // a ordem é a da seleção: colocação quando existe, depois a nota, depois o nome
  const ordenar = (xs) => xs.slice().sort((a, b) =>
    (a.colocacao ?? 999) - (b.colocacao ?? 999)
    || (b.notaSelecao ?? -1) - (a.notaSelecao ?? -1)
    || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

  /* -------------------------------- cabeçalho ----------------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text(preliminar ? "RESULTADO PRELIMINAR DO PROCESSO SELETIVO" : "RESULTADO DO PROCESSO SELETIVO",
      M, TOPO, { width: LARG, align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111")
    .text(`Edital nº ${turma.edital || "—"} — Iniciação Científica no Ensino Médio (ICEM)`,
      { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Turma ${turma.ciclo || "—"}`
      + (turma.vigencia?.inicio ? ` · vigência: ${fmtDataLonga(turma.vigencia.inicio)} a ${fmtDataLonga(turma.vigencia.fim)}` : ""),
      { width: LARG, align: "center" });
  doc.moveDown(0.5);

  /* --------------------------------- resumo ------------------------------- */
  secao("Resumo do processo");
  const conta = (cod) => lista.filter((b) => b.bolsa === cod).length;
  const linhas = preliminar
    ? [["Estudantes selecionados", lista.length]]
    : [
      ["Estudantes selecionados", lista.length],
      ["Bolsa CNPq (PIBIC-EM)", conta("cnpq")],
      ["Bolsa UNIEGO (PIBIC-EM)", conta("uniego")],
      ["Voluntários", conta("voluntario")],
    ];
  for (const [rot, n] of linhas) {
    quebra(13);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(rot, M + 4, y, { width: LARG - 60 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(String(n), M + LARG - 56, y, { width: 52, align: "right" });
    doc.y = y + 13; doc.x = M;
  }
  if (preliminar) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
      .text("Resultado preliminar: a distribuição das bolsas (CNPq e UNIEGO) será divulgada no resultado final.",
        M + 4, doc.y + 3, { width: LARG - 8 });
  }

  /* --------------------------------- quadros ------------------------------ */
  const COL = { pos: 0.07, nome: 0.40, escola: 0.31, serie: 0.10, nota: 0.12 };
  const cab = () => {
    quebra(20);
    const y = doc.y;
    doc.rect(M, y, LARG, 15).fill("#f2f6f8");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    let x = M + 4;
    for (const [rot, w] of [["", COL.pos], ["Estudante", COL.nome], ["Escola", COL.escola],
      ["Série", COL.serie], ["Nota", COL.nota]]) {
      doc.text(rot.toUpperCase(), x, y + 4.5, { width: LARG * w - 5, lineBreak: false });
      x += LARG * w;
    }
    doc.y = y + 18; doc.x = M;
  };
  const quadro = (titulo, xs) => {
    secao(titulo);
    if (!xs.length) {
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
        .text("Nenhum estudante neste quadro.", M + 4, doc.y, { width: LARG });
      doc.moveDown(0.6);
      return;
    }
    cab();
    let seq = 0;
    for (const b of xs) {
      // posição só para quem a seleção classificou — sem colocação nem nota,
      // um número sequencial sugeriria mérito que o processo não apurou
      const temPos = b.colocacao != null || b.notaSelecao != null;
      if (temPos) seq += 1;
      const nome = b.nome || "—";
      const escola = b.escola || "—";
      doc.font("Helvetica").fontSize(8);
      const alt = Math.max(
        doc.heightOfString(nome, { width: LARG * COL.nome - 8 }),
        doc.heightOfString(escola, { width: LARG * COL.escola - 8 }), 11) + 4;
      quebra(alt + 4);
      if (doc.y < TOPO + 6) cab();
      const y = doc.y;
      let x = M + 4;
      const celula = (txt, w, opc = {}) => {
        doc.text(txt, x, y, { width: LARG * w - 6, ...opc });
        x += LARG * w;
      };
      doc.font("Helvetica-Bold").fontSize(8).fillColor(temPos ? "#111" : MUTED);
      celula(temPos ? `${b.colocacao || seq}º` : "—", COL.pos, { lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#1a1a1a");
      celula(nome, COL.nome);
      doc.fillColor("#333");
      celula(escola, COL.escola);
      celula(b.serie || "—", COL.serie, { lineBreak: false });
      doc.font("Helvetica-Bold").fillColor("#111");
      celula(b.notaSelecao != null ? String(b.notaSelecao) : "—", COL.nota, { lineBreak: false });
      doc.y = y + alt + 4; doc.x = M;
      doc.moveTo(M, doc.y - 2).lineTo(M + LARG, doc.y - 2).lineWidth(0.4).strokeColor(LINE).stroke();
    }
    doc.moveDown(0.5);
  };

  if (preliminar) {
    quadro(`Estudantes selecionados — ${lista.length}`, ordenar(lista));
  } else {
    for (const cod of ["cnpq", "uniego", "voluntario"]) {
      const xs = ordenar(lista.filter((b) => b.bolsa === cod));
      if (xs.length || cod !== "voluntario") quadro(`${BOLSA_EM_ROT[cod]} — ${xs.length}`, xs);
    }
    const semBolsa = ordenar(lista.filter((b) => !b.bolsa));
    if (semBolsa.length) quadro(`Sem decisão de bolsa — ${semBolsa.length}`, semBolsa);
  }
  if (!lista.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text("Nenhum estudante registrado nesta turma.", M + 4, doc.y, { width: LARG });
  }

  /* -------------------------------- critério ------------------------------ */
  secao("Sobre este resultado");
  doc.font("Helvetica").fontSize(8.5).fillColor("#222").text(
    "A classificação é a do processo seletivo do edital próprio do ICEM: a nota indicada é a nota "
    + "final da seleção de cada estudante. "
    + (preliminar
      ? "Este é o resultado PRELIMINAR: relaciona os estudantes selecionados. A distribuição das "
        + "bolsas entre eles será divulgada no resultado final."
      : "Os quadros reúnem os estudantes pela bolsa concedida; o estudante voluntário participa do "
        + "programa sem bolsa."),
    M + 4, doc.y, { width: LARG - 8, align: "justify", lineGap: 1.4 });

  /* ------------------------------ assinaturas ----------------------------- */
  quebra(150);
  doc.moveDown(1.4);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [
    { ...ASSINA.coordPesquisa, img: "coordpesquisa" },
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);
  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, TIMBRE_PADRAO, marca);
  return fim;
}

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

/* ========================================================================
   ARCHÉ EV — Certificado do EVENTO, frente e verso.

   Frente: o texto padrão do certificado, na mesma moldura dos demais do
   UNIEGO — um certificado da instituição tem de parecer um certificado da
   instituição, seja de qual programa for. Verso (página 2): a PROGRAMAÇÃO,
   que é o que dá lastro ao número de horas da frente; quem lê o documento
   quer saber de que atividades aquelas horas vieram.

   As assinaturas chegam prontas de quem chamou (lib/certificadosEx.js
   monta a lista, já sem as vazias): coordenador que não enviou a sua não
   deixa linha em branco no lugar — some do documento.

   gerarCertificadoEventoPdf({ cert, programacao, assinaturas }) -> Buffer
   ======================================================================== */
export async function gerarCertificadoEventoPdf({ cert = {}, programacao = [], assinaturas = [] } = {}) {
  const marca = marcaEm(cert.fim);
  const doc = blindarTexto(new PDFDocument({ size: "A4", layout: "landscape",
    margins: { top: 60, bottom: 50, left: 60, right: 60 }, bufferPages: true }));
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.width - 120;
  const X = 60;
  const moldura = () => {
    doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56)
      .lineWidth(2).strokeColor(marca.cor).stroke();
    doc.rect(34, 34, doc.page.width - 68, doc.page.height - 68)
      .lineWidth(0.6).strokeColor(marca.cor).stroke();
  };

  /* ------------------------------ FRENTE -------------------------------- */
  moldura();
  try { doc.image(marca.logo, X, 52, { height: marca.logoAltura + 6 }); } catch { /* segue sem logo */ }
  doc.font("Helvetica-Bold").fontSize(10).fillColor(marca.cor)
    .text("PRÓ-REITORIA DE PÓS-GRADUAÇÃO, PESQUISA, EXTENSÃO E AÇÃO COMUNITÁRIA",
      X, 62, { width: L, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(marca.nome, X, doc.y + 1, { width: L, align: "right" });

  doc.font("Helvetica-Bold").fontSize(30).fillColor(marca.cor)
    .text("CERTIFICADO", X, 138, { width: L, align: "center", characterSpacing: 5 });

  const periodo = periodoPorExtenso(cert.inicio, cert.fim);
  const horas = cert.ch ? `, com carga horária de ${formatarHoras(cert.ch)}` : "";
  const ondeQuando = `${cert.local ? `${cert.local}${cert.municipio ? ` — ${cert.municipio}` : ""}, ` : ""}${periodo}`;
  // "promovido PELO UNIEGO" / "promovido PELA FACEG": quem promove é agente,
  // não posse — o "do/da" das outras frases não serve aqui
  const pelaInst = marca.artigo === "na" ? "pela" : "pelo";
  // "no evento" quando é evento; "na ação de extensão" quando a ação correu
  // por fora e a lista foi digitada na Extensão — é o mesmo certificado, e o
  // que muda é só o nome do que aconteceu
  const evAcao = cert.ehEvento === false ? "ação de extensão" : "evento";
  const noQue = `${cert.ehEvento === false ? "na" : "no"} ${evAcao}`;
  const doQue = `${cert.ehEvento === false ? "da" : "do"} ${evAcao}`;
  // o particípio concorda com o que foi promovido: o EVENTO promovido, a
  // AÇÃO promovida
  const promov = cert.ehEvento === false ? "promovida" : "promovido";

  const corpo = cert.tipo === "palestrante"
    ? `Certificamos que ${String(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ""} `
      + `atuou como PALESTRANTE ${noQue} “${cert.evento || ""}”, ${promov} ${pelaInst} ${marca.sigla}, `
      + `${ondeQuando}${horas}${cert.palestra ? `, com a apresentação intitulada “${cert.palestra}”` : ""}.`
    : cert.tipo === "comissao"
      ? `Certificamos que ${String(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ""} `
        + `integrou a COMISSÃO ORGANIZADORA ${doQue} “${cert.evento || ""}”${cert.papel ? `, na função de ${cert.papel}` : ""}, `
        + `${promov} ${pelaInst} ${marca.sigla}, ${ondeQuando}${horas}.`
      : `Certificamos que ${String(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ""} `
        + `participou ${doQue} “${cert.evento || ""}”, ${promov} ${pelaInst} ${marca.sigla}, `
        + `${ondeQuando}${horas}.`;

  doc.font("Helvetica").fontSize(13).fillColor("#1a1a1a")
    .text(corpo, X + 30, 200, { width: L - 60, align: "justify", lineGap: 6 });

  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, X, doc.y + 16, { width: L, align: "center" });

  desenharAssinaturas(doc, assinaturas, { X, L, y: Math.max(doc.y + 58, doc.page.height - 150) });

  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text(`Documento emitido pelo ARCHÉ · ${cert.numeroAcao ? `ação ${cert.numeroAcao} · ` : ""}`
      + `código de validação ${cert.codigo || "—"}`
      + `${programacao.length ? " · a programação do evento consta no verso" : ""}`,
      X, doc.page.height - 62, { width: L, align: "center" });

  /* ------------------------------- VERSO -------------------------------- */
  if (programacao.length) {
    doc.addPage();
    moldura();
    doc.font("Helvetica-Bold").fontSize(13).fillColor(marca.cor)
      .text("PROGRAMAÇÃO DO EVENTO", X, 56, { width: L, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#111")
      .text(cert.evento || "", X, doc.y + 4, { width: L, align: "center" });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(ondeQuando, X, doc.y + 2, { width: L, align: "center" });

    // colunas: dia+hora | atividade (com responsável) | local | CH
    const cols = [96, L - 96 - 130 - 46, 130, 46];
    const cx = [X, X + cols[0], X + cols[0] + cols[1], X + cols[0] + cols[1] + cols[2]];
    let y = doc.y + 16;
    const cabecalho = () => {
      doc.rect(X, y - 4, L, 17).fillColor(CINZA).fill();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(TEAL);
      ["DIA E HORÁRIO", "ATIVIDADE", "LOCAL", "CH"].forEach((t, i) =>
        doc.text(t, cx[i] + 4, y, { width: cols[i] - 8 }));
      y += 18;
    };
    cabecalho();

    let diaAtual = "";
    for (const a of programacao) {
      const quando = `${fmtDataLonga(a.dia)}${a.horaInicio ? `  ${a.horaInicio}${a.horaFim ? `–${a.horaFim}` : ""}` : ""}`;
      const titulo = a.titulo || "(sem título)";
      const sub = [a.responsavel, a.modalidade === "online" ? "online" : ""].filter(Boolean).join(" · ");
      // a altura da linha sai da célula mais alta — senão o texto invade a de baixo
      const hs = [
        doc.font("Helvetica").fontSize(8).heightOfString(quando, { width: cols[0] - 8 }),
        doc.font("Helvetica-Bold").fontSize(8.5).heightOfString(titulo, { width: cols[1] - 8 })
          + (sub ? doc.font("Helvetica").fontSize(7.5).heightOfString(sub, { width: cols[1] - 8 }) + 1 : 0),
        doc.font("Helvetica").fontSize(8).heightOfString(a.local || "—", { width: cols[2] - 8 }),
      ];
      const alt = Math.max(...hs) + 9;
      if (y + alt > doc.page.height - 76) { doc.addPage(); moldura(); y = 56; cabecalho(); diaAtual = ""; }
      if (a.dia && a.dia !== diaAtual) {
        diaAtual = a.dia;
        doc.moveTo(X, y - 3).lineTo(X + L, y - 3).lineWidth(0.5).strokeColor(LINE).stroke();
      }
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(quando, cx[0] + 4, y, { width: cols[0] - 8 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111").text(titulo, cx[1] + 4, y, { width: cols[1] - 8 });
      if (sub) doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(sub, cx[1] + 4, doc.y + 1, { width: cols[1] - 8 });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(a.local || "—", cx[2] + 4, y, { width: cols[2] - 8 });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text(a.ch ? formatarHoras(a.ch) : "—", cx[3] + 4, y, { width: cols[3] - 8 });
      y += alt;
    }

    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Verso do certificado de ${cert.pessoa || ""} · código ${cert.codigo || "—"}`,
        X, doc.page.height - 62, { width: L, align: "center" });
  }

  doc.end();
  return fim;
}

/* As assinaturas do certificado: só as que TÊM imagem (decisão do dono,
   ago/2026). A linha e o nome existem para sustentar uma assinatura — sem
   ela, o que sobra é um espaço em branco com o nome de alguém embaixo. */
function desenharAssinaturas(doc, assinaturas, { X, L, y }) {
  const lista = (assinaturas || []).filter((a) => a && a.nome);
  if (!lista.length) return;
  const w = L / lista.length;
  lista.forEach((a, i) => {
    const x = X + i * w;
    if (a.img) {
      try { doc.image(a.img, x + w / 2 - 55, y - 46, { fit: [110, 42], align: "center" }); }
      catch { /* imagem ruim não derruba o documento */ }
    }
    doc.moveTo(x + 18, y).lineTo(x + w - 18, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
      .text(a.nome, x + 4, y + 5, { width: w - 8, align: "center" });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(a.cargo || "", x + 4, doc.y + 1, { width: w - 8, align: "center" });
  });
}

/** "12 e 13 de outubro de 2026" / "de 12 a 15 de outubro de 2026". */
function periodoPorExtenso(inicio, fim) {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];
  const parte = (iso) => {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    return (y && m && d) ? { y, m, d } : null;
  };
  const a = parte(inicio), b = parte(fim) || parte(inicio);
  if (!a) return "";
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d))
    return `em ${a.d} de ${meses[a.m - 1]} de ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `de ${a.d} a ${b.d} de ${meses[a.m - 1]} de ${a.y}`;
  if (a.y === b.y) return `de ${a.d} de ${meses[a.m - 1]} a ${b.d} de ${meses[b.m - 1]} de ${a.y}`;
  return `de ${a.d} de ${meses[a.m - 1]} de ${a.y} a ${b.d} de ${meses[b.m - 1]} de ${b.y}`;
}

/** 4 → "4 horas"; 1 → "1 hora"; 2.5 → "2,5 horas". */
function formatarHoras(n) {
  const v = Number(n) || 0;
  const s = Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  return `${s} ${v === 1 ? "hora" : "horas"}`;
}

export async function gerarCertificadoPdf(cert = {}) {
  const marca = marcaEm(cert.vigencia?.fim);
  const doc = blindarTexto(new PDFDocument({ size: "A4", layout: "landscape",
    margins: { top: 60, bottom: 50, left: 60, right: 60 }, bufferPages: true }));
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.width - 120;              // largura útil na paisagem
  const X = 60;
  // A monitoria certifica outra coisa (o semestre na disciplina, com a carga
  // horária cumprida), mas na MESMA moldura: um certificado do UNIEGO tem de
  // parecer um certificado do UNIEGO, seja de qual programa for.
  const monitoria = cert.programa === "monitoria";
  const orientacao = cert.tipo === "orientacao" || cert.tipo === "orientacao-monitoria";

  // moldura discreta, na cor da marca da época
  doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56)
    .lineWidth(2).strokeColor(marca.cor).stroke();
  doc.rect(34, 34, doc.page.width - 68, doc.page.height - 68)
    .lineWidth(0.6).strokeColor(marca.cor).stroke();

  try { doc.image(marca.logo, X, 52, { height: marca.logoAltura + 6 }); } catch { /* segue sem logo */ }
  // O timbre é o do órgão que CONCEBE o programa (pedido do dono, ago/2026):
  // a monitoria é ação de ENSINO, e o edital dela é expedido pela PROAC — a
  // PROPPEX opera o processo, e operar não põe ninguém no documento. A IC
  // segue com o timbre da PROPPEX, que é dela o programa.
  doc.font("Helvetica-Bold").fontSize(10).fillColor(marca.cor)
    .text(monitoria ? "PRÓ-REITORIA ACADÊMICA"
      : "PRÓ-REITORIA DE PÓS-GRADUAÇÃO, PESQUISA, EXTENSÃO E AÇÃO COMUNITÁRIA",
    X, 62, { width: L, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(marca.nome, X, doc.y + 2, { width: L, align: "right" });

  doc.font("Helvetica-Bold").fontSize(26).fillColor(marca.cor)
    .text("CERTIFICADO", X, 132, { width: L, align: "center", characterSpacing: 3 });
  const subtitulo = monitoria
    ? (orientacao ? "de orientação em Monitoria Acadêmica" : "de Monitoria Acadêmica")
    : (orientacao ? "de orientação em Iniciação Científica" : "de participação em Iniciação Científica");
  doc.font("Helvetica").fontSize(11).fillColor(MUTED)
    .text(subtitulo, X, doc.y + 4, { width: L, align: "center" });

  /* --------------------------------- texto -------------------------------- */
  const vig = cert.vigencia || {};
  const periodo = vig.inicio && vig.fim
    ? `de ${mesAnoExtenso(vig.inicio)} a ${mesAnoExtenso(vig.fim)}`
    : `no ciclo ${cert.edital || ""}`;
  const modal = cert.modalidade ? ` na modalidade ${cert.modalidade},` : (cert.bolsista ? " na condição de bolsista," : ",");

  const daInst = marca.artigo === "na" ? "da" : "do";
  const horas = Number(cert.horas) > 0 ? `, perfazendo ${Number(cert.horas)} horas` : "";
  const corpoMonitoria = orientacao
    ? `Certificamos que ${(cert.pessoa || "").toUpperCase()} orientou o Projeto de Monitoria Acadêmica `
      + `da disciplina de ${cert.disciplina || "—"}, do curso de ${cert.curso || "—"}, no Programa de `
      + `Monitoria Acadêmica ${daInst} ${marca.sigla}, ${periodo}, `
      + `com a atuação de ${(cert.monitores || []).join(", ") || "seu(s) monitor(es)"}.`
    : `Certificamos que ${(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ""} `
      + `atuou como MONITOR(A) ACADÊMICO(A) na disciplina de ${cert.disciplina || "—"}, do curso de `
      + `${cert.curso || "—"}, no Programa de Monitoria Acadêmica ${daInst} ${marca.sigla}, `
      + `${periodo}${horas}, sob orientação de ${cert.orientador || "—"}.`;

  const corpo = monitoria ? corpoMonitoria : orientacao
    ? `Certificamos que ${(cert.pessoa || "").toUpperCase()} orientou o(a) acadêmico(a) `
      + `${cert.aluno || ""}${modal} no Programa de Iniciação Científica ${marca.artigo === "na" ? "da" : "do"} `
      + `${marca.sigla}, ${periodo}, com o plano de trabalho intitulado “${cert.titulo || ""}”.`
    : `Certificamos que ${(cert.pessoa || "").toUpperCase()}${cert.cpf ? `, inscrito(a) no CPF nº ${formatarCpfPdf(cert.cpf)},` : ""} `
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
  // quem assina acompanha o timbre: na monitoria, a pró-reitora acadêmica —
  // é a assinatura que consta nos editais do programa em todos os ciclos,
  // inclusive nos que correram fora do ARCHÉ
  const assina = monitoria
    ? [
      { ...ASSINA.proReitoraAcademica, img: imgs.proacademica },
      { ...ASSINA.reitor, img: imgs.reitor },
    ]
    : [
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
      // o único dos três campos do sumário que não passava por `cortar`:
      // orientador de nome longo quebrava e caía sobre a linha de baixo
      .text(cortar(doc, p.orientador?.nome || "—", 104), M + LARG - 108, y,
        { width: 104, lineBreak: false, align: "right" });
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
  finalizar(doc, TIMBRE_PADRAO);
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

/* ======================= termos de compromisso da IC =====================
   O documento que a PROPPEX leva à cerimônia de assinaturas — e a cópia
   digital que fica para o aluno e para quem orienta.

   O texto NÃO nasceu aqui: são os modelos institucionais que a coordenação
   já usava em .docx com mala direta (PIBIC/CNPq, PBIC/UNIEGO, PVIC e o do
   orientador), transcritos em lib/termos.js. O que o Word preenchia à mão o
   ARCHÉ preenche do registro: o aluno informa os dados dele na guia Bolsa, a
   orientação vem do perfil, o projeto vem do projeto.

   Uma folha por pessoa. Campo que ninguém preencheu sai como linha
   pontilhada — o termo se imprime e completa-se à caneta, em vez de travar.
   As assinaturas do pró-reitor e do reitor entram DIGITALIZADAS, como nos
   certificados; a do aluno (ou do professor) é a que se colhe na cerimônia.
   ======================================================================== */
const LINHA_VAZIA = "............................................................";
// mesma regra de lib/ic.js (modalidadeEfetiva), sem importar o módulo da IC:
// decidido o fomento, vale o cruzamento linha × fomento; antes, a pretendida
const modalidadeEfetivaPdf = (p) =>
  (p?.fomento?.tipo ? modalidadePor(p.linha, p.fomento.tipo) : null) || modalidadeDe(p?.modalidade);

/** As pessoas que assinam um termo, na ordem em que aparecem na régua. */
function reguaDeAssinaturas(doc, quebra, quemAssina, imgs = {}) {
  const temImg2 = quemAssina.some((a) => a.img && imgs[a.img]);
  quebra(temImg2 ? 145 : 120);
  doc.y += espacoDaAssinatura(temImg2);
  const y = doc.y;
  const w = LARG / quemAssina.length;
  let fundo = y;
  quemAssina.forEach((a, i) => {
    const x = M + i * w;
    assinaturaSobreLinha(doc, a.img && imgs[a.img], x + w / 2, y);
    doc.moveTo(x + 14, y).lineTo(x + w - 14, y).lineWidth(0.8).strokeColor("#333").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
      .text(a.nome || " ", x + 4, y + 4, { width: w - 8, align: "center" });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(a.cargo, x + 4, doc.y + 1, { width: w - 8, align: "center" });
    fundo = Math.max(fundo, doc.y);
  });
  doc.y = fundo + 6;
  doc.x = M;
}

/**
 * Termos de compromisso de um ciclo.
 *   tipo — "bolsista" (alunos), "orientador" (professores) ou "todos"
 *   projetos — já filtrados pelo ciclo e pela permissão de quem pediu
 *   assinaturas — { proreitor, reitor } em Buffer, como nos certificados
 *   perfis — { email: perfil } para completar o contato de quem orienta
 */
export async function gerarTermoCompromissoPdf({
  edital = {}, projetos = [], tipo = "todos", assinaturas = {}, perfis = {}, emitidoPor = "",
} = {}) {
  const { doc, fim, quebra, secao, campo } = criarDoc();
  const vigencia = edital.vigencia || {};
  const marca = marcaEm(vigencia.inicio);
  const inst = { ...marca, cidade: CIDADE_PDF };

  /* ------------------------- blocos de composição ------------------------- */
  const par = (t, opcoes = {}) => {
    quebra(30);
    doc.font(opcoes.negrito ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor("#222")
      .text(t, M, doc.y, { width: LARG, align: "justify", lineGap: 1.2 });
    doc.moveDown(0.4); doc.x = M;
  };
  const subtitulo = (t) => {
    quebra(20); doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL).text(t, M, doc.y, { width: LARG });
    doc.moveDown(0.15); doc.x = M;
  };
  // a lista mantém o algarismo do próprio documento ("I - …"); onde o modelo
  // usa marcador, entra o ponto — a numeração nunca é recriada aqui
  const itens = (lista, marcador = false) => {
    for (const t of lista) {
      quebra(24);
      const y = doc.y;
      if (marcador) {
        doc.font("Helvetica").fontSize(9).fillColor(TEAL).text("•", M + 8, y, { width: 10, lineBreak: false });
      }
      doc.font("Helvetica").fontSize(9).fillColor("#222")
        .text(t, M + (marcador ? 22 : 14), y, { width: LARG - (marcador ? 26 : 18), align: "justify", lineGap: 1 });
      doc.moveDown(0.18); doc.x = M;
    }
  };
  const clausula = (c) => {
    quebra(46); doc.moveDown(0.45);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(c.rot, M, doc.y, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(c.tit, M, doc.y + 1, { width: LARG, align: "center" });
    doc.moveDown(0.35); doc.x = M;
    for (const b of c.blocos) {
      if (b.p) par(b.p);
      else if (b.sub) subtitulo(b.sub);
      else if (b.itens) itens(b.itens, !!b.marcador);
    }
  };
  const cabecalho = (t, s) => {
    doc.font("Helvetica-Bold").fontSize(13.5).fillColor(TEAL)
      .text(t, M, TOPO, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111")
      .text(s, M, doc.y + 3, { width: LARG, align: "center" });
    doc.moveDown(0.7); doc.x = M;
  };
  const fecho = (quemAssina) => {
    quebra(40); doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9.5).fillColor("#222")
      .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "right" });
    reguaDeAssinaturas(doc, quebra, quemAssina, assinaturas);
  };

  /* --------------------------- quem entra no PDF -------------------------- */
  /* O termo do aluno tem TRÊS modelos, e o do voluntário é um deles (PVIC:
     8h semanais, sem bolsa e sem conta bancária). A coordenação imprime cada
     conjunto à parte — bolsistas e voluntários assinam documentos diferentes,
     e o lote existe para ir à cerimônia —, e "aluno" traz os dois juntos,
     que é o que a via individual precisa: cada um baixa o seu, seja qual for. */
  const querOrientador = tipo === "orientador" || tipo === "todos";
  const folhas = alunosDoLote(projetos, tipo).map(({ p, a }) => ({ tipo: "aluno", p, a }));
  if (querOrientador) {
    // um por PROFESSOR, não por projeto: quem orienta dois planos assina um
    // termo de orientação, com os títulos listados
    const porProfessor = new Map();
    for (const p of projetos) {
      const chave = String(p.orientador?.email || p.orientador?.nome || "").toLowerCase();
      if (!chave) continue;
      if (!porProfessor.has(chave)) porProfessor.set(chave, []);
      porProfessor.get(chave).push(p);
    }
    for (const ps of porProfessor.values()) folhas.push({ tipo: "orientador", p: ps[0], projetos: ps });
  }

  folhas.forEach((folha, i) => {
    if (i) doc.addPage();
    if (folha.tipo === "aluno") folhaDoAluno(folha);
    else folhaDoOrientador(folha);
  });

  function folhaDoAluno({ p, a }) {
    const mod = modalidadeEfetivaPdf(p);
    const fomento = fomentoDoProjeto(p);
    // no documento o programa vai por extenso; a sigla é como o aluno se
    // identifica nas publicações. O voluntário não tem sigla no catálogo
    // (a modalidade se chama "Voluntário"), então é aqui que ela aparece
    const sigla = fomento === "voluntario" ? "PVIC" : (mod?.nome || "Bolsa de Iniciação Científica");
    const programa = fomento === "voluntario"
      ? `Programa Voluntário de Iniciação Científica (PVIC) ${inst.artigo === "na" ? "da" : "do"} ${inst.sigla}`
      : sigla;
    const t = termoDoAluno({ tipo: fomento, inst, programa, sigla, valor: mod?.valor ?? 350, vigencia });

    cabecalho(t.titulo, t.subtitulo);

    secao(fomento === "voluntario" ? "Voluntário" : "Bolsista");
    campo("Nome completo", a.nome || LINHA_VAZIA);
    campo("Curso", a.curso || cursoDe(p.curso)?.nome || p.curso || LINHA_VAZIA);
    if (fomento !== "voluntario") campo("CPF", formatarCpf(a.cpf) || LINHA_VAZIA);
    campo("Telefones", a.telefone || LINHA_VAZIA);
    campo("E-mail", a.email || LINHA_VAZIA);
    if (fomento !== "voluntario") {
      // conta no Banco do Brasil é exigência do CNPq — o modelo já vinha com
      // o banco fixo, e é o que a coordenação confere na hora do pagamento
      campo("Banco", fomento === "cnpq" ? (a.banco || "Banco do Brasil") : (a.banco || LINHA_VAZIA));
      campo("Agência", a.agencia || LINHA_VAZIA);
      campo("Nº conta", a.conta || LINHA_VAZIA);
    }
    campo("Professor(a) orientador(a)", p.orientador?.nome || LINHA_VAZIA);
    campo("Título do plano de trabalho", p.titulo || LINHA_VAZIA);

    doc.moveDown(0.4); doc.x = M;
    par(t.abertura);
    for (const c of t.clausulas) clausula(c);

    fecho([
      { nome: a.nome || "", cargo: fomento === "voluntario" ? "Aluno(a) voluntário(a)" : "Aluno(a) bolsista" },
      { ...ASSINA.proReitor, img: "proreitor" },
      { ...ASSINA.reitor, img: "reitor" },
    ]);
  }

  function folhaDoOrientador({ p, projetos: dele }) {
    const t = termoDoOrientador({ inst, vigencia });
    const perfil = perfis[String(p.orientador?.email || "").toLowerCase()] || {};
    cabecalho(t.titulo, t.subtitulo);

    secao("Orientação");
    campo("Instituição", inst.nome);
    campo("Curso", cursoDe(p.curso)?.nome || p.curso || LINHA_VAZIA);
    campo("Orientador(a)", p.orientador?.nome || perfil.nome || LINHA_VAZIA);
    campo("Telefone", p.orientador?.telefone || perfil.telefone || perfil.whatsapp || LINHA_VAZIA);
    campo("E-mail", p.orientador?.email || LINHA_VAZIA);
    campo(dele.length > 1 ? "Títulos dos projetos" : "Título do projeto",
      dele.map((x) => `${x.numero ? `${x.numero} — ` : ""}${x.titulo || ""}`).join("; ") || LINHA_VAZIA);

    doc.moveDown(0.4); doc.x = M;
    par(t.abertura);
    for (const s of t.secoes) {
      quebra(40); doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
        .text(s.tit, M, doc.y, { width: LARG });
      doc.moveDown(0.25); doc.x = M;
      for (const b of s.blocos) {
        if (b.p) par(b.p);
        else if (b.itens) itens(b.itens, !!b.marcador);
      }
    }
    doc.moveDown(0.3);
    par(t.declaracao);

    fecho([
      { nome: p.orientador?.nome || perfil.nome || "", cargo: "Professor(a) orientador(a)" },
      { ...ASSINA.proReitor, img: "proreitor" },
      { ...ASSINA.reitor, img: "reitor" },
    ]);
  }

  if (!folhas.length) {
    doc.font("Helvetica-Bold").fontSize(13.5).fillColor(TEAL)
      .text("TERMO DE COMPROMISSO", M, TOPO, { width: LARG, align: "center" });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      // o conjunto vai NOMEADO: "nenhum termo" num lote de voluntários quer
      // dizer que não há voluntário no ciclo, e não que o sistema falhou
      .text(`Nenhum termo de ${{
        bolsista: "bolsista", voluntario: "voluntário", aluno: "aluno",
        orientador: "orientador",
      }[tipo] || "compromisso"} a emitir no Edital nº ${edital.numero || "—"}: os termos saem dos projetos aprovados, depois da indicação dos alunos.`,
        M, doc.y + 14, { width: LARG, align: "center" });
  }

  if (emitidoPor) {
    quebra(30);
    doc.font("Helvetica").fontSize(7).fillColor(MUTED)
      .text(`Documento gerado pelo ARCHÉ a pedido de ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }
  finalizar(doc, TIMBRE_PADRAO, marca);
  return fim;
}


/* ======================= dossiê de conformidade (Atas) ===================
   O documento que a PROPPEX entrega ao avaliador do INEP.

   A tela de Acompanhamento responde "quanto falta"; este PDF responde a
   pergunta que o avaliador faz de verdade — **onde está a ata que comprova
   este indicador?**. Por isso cada tema sai com o número e a data da ata
   que o registrou, e com a referência do instrumento ao lado. Sinal verde
   ninguém protocola.

   gerarDossieConformidadePdf({ dossie, emitidoPor }) -> Promise<Buffer>
   ======================================================================== */
const ESTADO_DOSSIE = {
  "em-dia": { rot: "Comprovado", cor: "#2f7d55" },
  vencendo: { rot: "Pendente — prazo próximo", cor: "#a8762a" },
  pendente: { rot: "Pendente no semestre", cor: "#a8762a" },
  nunca: { rot: "Sem registro", cor: "#a1524c" },
  "fora-da-janela": { rot: "Não cobrado neste semestre", cor: MUTED },
};

/* A referência do instrumento como o avaliador a procura: "Curso 2.1",
   "IES 4.5" — o número do indicador é o que ele confere na lista dele. */
const refDoInstrumento = (refs) => (refs || [])
  .map((r) => `${r.inst === "ies" ? "IES" : "Curso"} ${r.num}`).join("; ") || "—";

export async function gerarDossieConformidadePdf({ dossie = {}, emitidoPor = "", assinaturas = {} } = {}) {
  const { doc, fim, quebra, secao } = criarDoc();
  const doCurso = dossie.escopo === "curso";
  const alvo = doCurso ? (dossie.cursoNome || dossie.curso) : "Órgãos institucionais";

  /* -------------------------------- capa --------------------------------- */
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text("DOSSIÊ DE CONFORMIDADE", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text("Pauta Regulatória — temas que os instrumentos do INEP esperam ver registrados em ata",
      M, doc.y + 2, { width: LARG, align: "center" });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111")
    .text(doCurso ? `Curso de ${alvo}` : alvo, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(`Semestre ${dossie.janela || "—"} · encerra em ${fmtDataLonga(dossie.fimDaJanela)}`,
      { width: LARG, align: "center" });
  doc.moveDown(0.6); doc.x = M;

  secao("Resumo");
  const linhaResumo = (rot, valor) => {
    quebra(13);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(rot, M + 4, y, { width: LARG - 70 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(String(valor), M + LARG - 66, y, { width: 62, align: "right" });
    doc.y = y + 13; doc.x = M;
  };
  linhaResumo("Temas cobrados neste semestre", dossie.exigidos ?? 0);
  linhaResumo("Comprovados por ata registrada", dossie.comprovados ?? 0);
  linhaResumo("Conformidade do semestre", `${dossie.percentual ?? 0}%`);
  linhaResumo("Atas que sustentam este dossiê", (dossie.atas || []).length);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
    .text("Só ata REGISTRADA entra como prova: rascunho e minuta ainda podem mudar. "
      + "Cada tema abaixo traz o número e a data da ata que o registrou.",
      M + 4, doc.y + 3, { width: LARG - 8 });
  doc.moveDown(0.4); doc.x = M;

  /* ------------------------------ por órgão ------------------------------ */
  const COLD = { tema: 0.44, ref: 0.13, sit: 0.19, ata: 0.24 };
  const larg = (k) => LARG * COLD[k];

  for (const o of dossie.orgaos || []) {
    quebra(80);
    secao(`${o.nome}${doCurso ? ` — ${alvo}` : ""}`);

    // ciclo de sessões: o instrumento cobra a periodicidade, não só o tema
    const r = o.ritual || {};
    const cicloOk = r.completo;
    doc.font("Helvetica").fontSize(9).fillColor(cicloOk ? "#2f7d55" : "#a8762a")
      .text(`Ciclo de sessões do semestre: ${r.ordinarias || 0} de ${r.exigidas || 0} ordinária(s) registrada(s)`
        + `${r.extraordinarias ? ` · ${r.extraordinarias} extraordinária(s)` : ""}`
        + `${cicloOk ? "" : ` · faltam ${r.faltam}`}`, M + 4, doc.y, { width: LARG - 8 });
    doc.moveDown(0.2); doc.x = M;
    if ((r.sessoes || []).length) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
        .text("Sessões: " + r.sessoes.map((s) => `${s.numero || "s/nº"} (${fmtDataLonga(s.data)}${s.tipo === "extraordinária" ? ", extr." : ""})`).join(" · "),
          M + 4, doc.y, { width: LARG - 8 });
      doc.moveDown(0.2); doc.x = M;
    }

    if (!(o.temas || []).length) {
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED)
        .text("Órgão sem temas da pauta regulatória — o ARCHÉ registra e arquiva as atas.",
          M + 4, doc.y + 2, { width: LARG - 8 });
      doc.moveDown(0.4); doc.x = M;
      continue;
    }

    // cabeçalho da tabela
    quebra(30); doc.moveDown(0.3);
    let y = doc.y;
    doc.rect(M, y, LARG, 15).fill(CINZA);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEAL);
    let x = M + 4;
    for (const [k, rot] of [["tema", "TEMA / INDICADOR"], ["ref", "REFERÊNCIA"],
      ["sit", "SITUAÇÃO"], ["ata", "ATA QUE COMPROVA"]]) {
      doc.text(rot, x, y + 4, { width: larg(k) - 8, lineBreak: false });
      x += larg(k);
    }
    doc.y = y + 18; doc.x = M;

    for (const t of o.temas) {
      quebra(34);
      y = doc.y;
      const est = ESTADO_DOSSIE[t.estado] || ESTADO_DOSSIE.pendente;
      const prova = t.provas?.[0] || t.ultima;
      // a prova mais recente identifica a ata; as demais viram "e mais N"
      const textoAta = prova
        ? `${prova.numero || "sem número"}\n${fmtDataLonga(prova.data)}`
          + (t.provas?.length > 1 ? `\n(e mais ${t.provas.length - 1})` : "")
        : "—";

      x = M + 4;
      doc.font("Helvetica").fontSize(8).fillColor("#222")
        .text(t.titulo, x, y, { width: larg("tema") - 8 });
      const fundoTema = doc.y;
      x += larg("tema");
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
        .text(refDoInstrumento(t.refs), x, y, { width: larg("ref") - 8 });
      x += larg("ref");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(est.cor)
        .text(est.rot, x, y, { width: larg("sit") - 8 });
      x += larg("sit");
      doc.font("Helvetica").fontSize(7.5).fillColor(prova ? "#222" : MUTED)
        .text(textoAta, x, y, { width: larg("ata") - 8 });

      doc.y = Math.max(fundoTema, doc.y) + 5;
      doc.x = M;
      doc.moveTo(M, doc.y - 2).lineTo(M + LARG, doc.y - 2).lineWidth(0.4).strokeColor(LINE).stroke();
    }
    doc.moveDown(0.3);
  }

  /* ------------------------------ como ler -------------------------------- */
  quebra(70);
  secao("Como ler este documento");
  doc.font("Helvetica").fontSize(8.5).fillColor("#222").text(
    "Cada linha é um tema que os instrumentos de avaliação do INEP esperam encontrar debatido e "
    + "registrado em ata, atribuído ao órgão de competência. A coluna REFERÊNCIA aponta o indicador "
    + "do instrumento; a coluna ATA QUE COMPROVA traz o número e a data da sessão em que o tema foi "
    + "tratado — o documento está arquivado no ARCHÉ e pode ser apresentado na íntegra. "
    + "“Comprovado” significa registro no semestre em curso; “Sem registro” significa que o tema "
    + "ainda não aparece em nenhuma ata registrada do órgão. Temas anuais aparecem como “não cobrado "
    + "neste semestre” no semestre em que não vencem, com a ata da última vez em que foram tratados.",
    M + 4, doc.y, { width: LARG - 8, align: "justify", lineGap: 1.4 });

  quebra(130);
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);
  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(`Documento emitido por ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, doCurso
    ? ["PAUTA REGULATÓRIA", `CURSO DE ${String(alvo).toUpperCase()}`]
    : ["PAUTA REGULATÓRIA", "ÓRGÃOS INSTITUCIONAIS"]);
  return fim;
}

/* ========================= termos do ICEM (Ensino Médio) =================
   O quinto modelo institucional: o termo do bolsista de Iniciação
   Científica no Ensino Médio, com o ANEXO 01 — a autorização do responsável
   — na página seguinte. São menores de idade: assinam o aluno, o
   responsável e a coordenação de pesquisa, e a autorização é o que permite
   ao aluno frequentar a instituição e receber a bolsa.
   ======================================================================== */
export async function gerarTermosEMPdf({ turma = {}, bolsistas = [], assinaturas = {}, emitidoPor = "" } = {}) {
  const { doc, fim, quebra, secao, campo } = criarDoc();
  const marca = marcaEm(turma.vigencia?.inicio);
  const inst = { ...marca, cidade: CIDADE_PDF };
  const t = termoDoAlunoEM({ inst, vigencia: turma.vigencia });

  const par = (txt) => {
    quebra(30);
    doc.font("Helvetica").fontSize(9.5).fillColor("#222")
      .text(txt, M, doc.y, { width: LARG, align: "justify", lineGap: 1.2 });
    doc.moveDown(0.4); doc.x = M;
  };
  const itens = (lista) => {
    for (const x of lista) {
      quebra(24);
      doc.font("Helvetica").fontSize(9).fillColor("#222")
        .text(x, M + 14, doc.y, { width: LARG - 18, align: "justify", lineGap: 1 });
      doc.moveDown(0.18); doc.x = M;
    }
  };
  const clausula = (c) => {
    quebra(46); doc.moveDown(0.45);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL)
      .text(c.rot, M, doc.y, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
      .text(c.tit, M, doc.y + 1, { width: LARG, align: "center" });
    doc.moveDown(0.35); doc.x = M;
    for (const b of c.blocos) {
      if (b.p) par(b.p);
      else if (b.sub) {
        quebra(20); doc.moveDown(0.2);
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL).text(b.sub, M, doc.y, { width: LARG });
        doc.moveDown(0.15); doc.x = M;
      } else if (b.itens) itens(b.itens);
    }
  };
  const regua = (lista) => {
    const temImg3 = lista.some((a) => a.img && assinaturas[a.img]);
    quebra(temImg3 ? 145 : 120);
    doc.y += espacoDaAssinatura(temImg3);
    const y = doc.y;
    const w = LARG / lista.length;
    let fundo = y;
    lista.forEach((a, i) => {
      const x = M + i * w;
      assinaturaSobreLinha(doc, a.img && assinaturas[a.img], x + w / 2, y);
      doc.moveTo(x + 14, y).lineTo(x + w - 14, y).lineWidth(0.8).strokeColor("#333").stroke();
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
        .text(a.nome || " ", x + 4, y + 4, { width: w - 8, align: "center" });
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
        .text(a.cargo, x + 4, doc.y + 1, { width: w - 8, align: "center" });
      fundo = Math.max(fundo, doc.y);
    });
    doc.y = fundo + 6; doc.x = M;
  };

  bolsistas.forEach((b, i) => {
    if (i) doc.addPage();
    const atual = (b.trajetoria || []).find((e) => !e.ate) || (b.trajetoria || [])[0] || null;

    doc.font("Helvetica-Bold").fontSize(13.5).fillColor(TEAL)
      .text(t.titulo, M, TOPO, { width: LARG, align: "center" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111")
      .text(t.subtitulo, M, doc.y + 3, { width: LARG, align: "center" });
    doc.moveDown(0.7); doc.x = M;

    secao("Bolsista");
    campo("Nome completo", b.nome || LINHA_VAZIA);
    campo("CPF", formatarCpf(b.cpf) || LINHA_VAZIA);
    campo("RG", b.rg || LINHA_VAZIA);
    campo("Escola", b.escola || LINHA_VAZIA);
    campo("Série", b.serie || LINHA_VAZIA);
    campo("Curso de interesse", b.cursoInteresse || LINHA_VAZIA);
    campo("Telefone (WhatsApp)", b.telefone || LINHA_VAZIA);
    campo("E-mail", b.email || LINHA_VAZIA);
    campo("Responsável", b.responsavel?.nome || LINHA_VAZIA);
    campo("CPF do responsável", formatarCpf(b.responsavel?.cpf) || LINHA_VAZIA);
    if (b.bolsa) campo("Bolsa", (BOLSAS_EM_PDF[b.bolsa] || b.bolsa));
    campo("Banco", b.banco || LINHA_VAZIA);
    campo("Agência", b.agencia || LINHA_VAZIA);
    campo("Nº conta", b.conta || LINHA_VAZIA);
    if (atual) {
      campo("Projeto acompanhado", `${atual.numero ? atual.numero + " — " : ""}${atual.titulo}`);
      campo("Professor(a) orientador(a)", atual.orientador || LINHA_VAZIA);
    }

    doc.moveDown(0.4); doc.x = M;
    par(t.abertura);
    for (const c of t.clausulas) clausula(c);

    quebra(40); doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9.5).fillColor("#222")
      .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "right" });
    regua([
      { nome: b.nome || "", cargo: `Bolsista${b.cpf ? ` · CPF ${formatarCpf(b.cpf)}` : ""}` },
      { nome: b.responsavel?.nome || "", cargo: `Responsável${b.responsavel?.cpf ? ` · CPF ${formatarCpf(b.responsavel.cpf)}` : ""}` },
      ASSINA.coordPesquisa,
    ]);

    /* ------------------- Anexo 01: autorização do responsável ------------- */
    doc.addPage();
    const aut = autorizacaoResponsavelEM({ inst, bolsista: {
      nome: b.nome, escola: b.escola,
      responsavel: { nome: b.responsavel?.nome, cpf: formatarCpf(b.responsavel?.cpf) },
      projetoTitulo: atual?.titulo || "", orientador: atual?.orientador || "",
    } });
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(TEAL)
      .text(aut.titulo, M, TOPO, { width: LARG, align: "center" });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text(aut.subtitulo, M, doc.y + 2, { width: LARG, align: "center" });
    doc.moveDown(1.2); doc.x = M;
    doc.font("Helvetica").fontSize(10).fillColor("#222")
      .text(aut.texto, M, doc.y, { width: LARG, align: "justify", lineGap: 3 });
    doc.moveDown(1); doc.x = M;
    doc.font("Helvetica").fontSize(9.5).fillColor("#222")
      .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "right" });
    regua([
      { nome: b.nome || "", cargo: "Aluno(a)" },
      { nome: b.responsavel?.nome || "", cargo: "Responsável" },
    ]);
  });

  if (!bolsistas.length) {
    doc.font("Helvetica-Bold").fontSize(13.5).fillColor(TEAL)
      .text(t.titulo, M, TOPO, { width: LARG, align: "center" });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text(`Nenhum bolsista na turma ${turma.ciclo || "—"}.`, M, doc.y + 14, { width: LARG, align: "center" });
  }
  if (emitidoPor) {
    quebra(30);
    doc.font("Helvetica").fontSize(7).fillColor(MUTED)
      .text(`Documento gerado pelo ARCHÉ a pedido de ${emitidoPor}.`, M, doc.y + 8, { width: LARG, align: "center" });
  }
  finalizar(doc, TIMBRE_PADRAO, marca);
  return fim;
}
const BOLSAS_EM_PDF = { cnpq: "Bolsa CNPq (PIBIC-EM)", uniego: "Bolsa UNIEGO (PIBIC-EM)" };

/* ========================================================================
   ARCHÉ MO — Monitoria Acadêmica: os documentos do processo.

   Quatro peças, e cada uma substitui um papel que circulava por e-mail:

     · gerarEditalMonitoriaPdf()          — o edital do ciclo (texto em lib/monitoria.js)
     · gerarProjetoMonitoriaPdf(p)        — o antigo Anexo I  (Projeto de Monitoria)
     · gerarFichaMonitoriaPdf(p, m)       — o antigo Anexo II (Ficha de Inscrição)
     · gerarRelatorioMonitoriaPdf(p, m)   — o antigo Anexo III (Relatório + avaliação)

   Os três anexos saem PREENCHIDOS com o que está gravado: o processo corre
   dentro do ARCHÉ, e o PDF é o que se arquiva e se assina. Campo em branco
   sai como travessão — o documento se imprime e completa-se à caneta, como
   os termos de compromisso da IC.
   ======================================================================== */
// O timbrado dos ANEXOS é o da PROPPEX, que é quem opera o processo; o
// EDITAL sai com o da PROAC, que é quem o expede.
const TIMBRE_MON = TIMBRE_PADRAO;
const nn = (v) => (String(v ?? "").trim() || "—");
// as datas de gravação são carimbos ISO com hora; a linha do "Goianésia, ..."
// quer só o dia — sem isto sai "12T10:00:00Z/12/2026"
const soDia = (v) => String(v ?? "").slice(0, 10);

export async function gerarEditalMonitoriaPdf({ edital = {}, texto = {}, cronograma = [], acessos = [],
  assinam = [
    { ...ASSINA.proReitoraAcademica, img: "proacademica" },
    { ...ASSINA.proReitor, img: "proreitor" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas = {} } = {}) {
  const marca = marcaEm(edital.publicadoEm);
  const { doc, fim, quebra, secao, texto: par } = criarDoc();

  // caixa do número do edital, como no documento publicado
  doc.font("Helvetica-Bold").fontSize(15).fillColor(TEAL)
    .text(`Edital ${edital.numero || "—"}`, M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED)
    .text("PROAC", M, doc.y + 2, { width: LARG, align: "center" });
  doc.moveTo(M + 150, doc.y + 8).lineTo(M + LARG - 150, doc.y + 8)
    .lineWidth(0.8).strokeColor(LINE).stroke();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#111")
    .text((edital.titulo || "").toUpperCase(), M, doc.y + 16, { width: LARG, align: "center" });
  doc.moveDown(1);

  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(String(texto.abertura || "").replace(/\*\*/g, ""), M, doc.y + 6,
      { width: LARG, align: "justify", lineGap: 3 });

  for (const s of texto.secoes || []) {
    secao(s.titulo);
    for (const it of s.itens || []) {
      quebra(24);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111")
        .text(`${it.n} `, M, doc.y, { continued: true })
        .font("Helvetica").fillColor("#222")
        .text(it.texto, { width: LARG, align: "justify", lineGap: 2 });
      (it.alineas || []).forEach((a, i) => {
        quebra(16);
        doc.font("Helvetica").fontSize(9).fillColor("#222")
          .text(`${String.fromCharCode(97 + i)}) ${a}`, M + 18, doc.y + 2,
            { width: LARG - 18, align: "justify", lineGap: 1.5 });
      });
      (it.romanos || []).forEach((r, i) => {
        quebra(16);
        doc.font("Helvetica").fontSize(9).fillColor("#222")
          .text(`${["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][i]}. ${r}`,
            M + 18, doc.y + 2, { width: LARG - 18, align: "justify", lineGap: 1.5 });
      });
      doc.x = M;
    }
  }

  if (cronograma.length) {
    secao("7. CRONOGRAMA DO PROGRAMA DE MONITORIA ACADÊMICA");
    const cols = [230, 165, 88];
    /* A altura da linha é a da CÉLULA MAIS ALTA, medida antes de escrever.
       Deduzi-la do doc.y depois de escrever as três dá a altura da última —
       e a linha seguinte subia por cima de "PROPPEX, ouvida a Coordenação do
       Curso", que ocupa duas linhas (achado do dono, ago/2026). */
    const linha = (a, b, c, cab = false) => {
      const fonte = cab ? "Helvetica-Bold" : "Helvetica";
      doc.font(fonte).fontSize(8.5);
      const alt = Math.max(...[a, b, c].map((t, i) =>
        doc.heightOfString(String(t ?? ""), { width: cols[i] - 8 })));
      const h = Math.max(16, alt + 8);
      quebra(h + 4);
      const y = doc.y;
      if (cab) doc.rect(M, y, LARG, h).fill(CINZA);
      doc.font(fonte).fontSize(8.5).fillColor(cab ? TEAL : "#222");
      doc.text(a, M + 4, y + 4, { width: cols[0] - 8 });
      doc.text(b, M + cols[0] + 4, y + 4, { width: cols[1] - 8 });
      doc.text(c, M + cols[0] + cols[1] + 4, y + 4, { width: cols[2] - 8 });
      doc.rect(M, y, LARG, h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y = y + h; doc.x = M;
    };
    linha("Atividade", "Responsável", "Até", true);
    for (const c of cronograma) linha(c.etapa, c.responsavel, fmtData(c.ate));
  }

  /* Onde o processo acontece. Um edital que manda "submeter no sistema" sem
     dizer o endereço obriga quem lê a procurar — e quem procura desiste ou
     pergunta à coordenação. Os links vão impressos e clicáveis. */
  if (acessos.length) {
    secao("8. DOS CANAIS DE ACESSO");
    for (const a of acessos) {
      quebra(26);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111")
        .text(`${a.quem}: `, M, doc.y + 2, { continued: true })
        .font("Helvetica").fillColor("#222").text(a.oque, { width: LARG });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(CYAN)
        .text(a.url, M + 14, doc.y + 1, { width: LARG - 14, link: a.url, underline: true });
      doc.fillColor("#222");
    }
  }

  quebra(60);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${fmtDataLonga(edital.publicadoEm)}.`, M, doc.y + 20,
      { width: LARG, align: "right" });
  blocoAssinaturas(doc, quebra, assinam.length ? assinam
    : [{ ...ASSINA.proReitor, img: "proreitor" }, { ...ASSINA.reitor, img: "reitor" }], assinaturas);

  finalizar(doc, TIMBRE_PROAC, marca);
  return fim;
}

/** Anexo I — Projeto de Atividades de Monitoria, preenchido. */
export async function gerarProjetoMonitoriaPdf(p = {}, { campos = [], assinaturas = {} } = {}) {
  const marca = marcaEm(p.fim);
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();

  doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL)
    .text("PROJETO DE ATIVIDADES DE MONITORIA", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(`Edital ${nn(p.edital)} · ciclo ${nn(p.ciclo)}${p.protocolo ? ` · protocolo ${p.protocolo}` : ""}`,
      M, doc.y + 3, { width: LARG, align: "center" });

  secao("1 — DADOS DO PROJETO");
  campo("Disciplina de vinculação do Projeto", nn(p.disciplina));
  campo("Curso", nn(cursoDe(p.curso)?.nome || p.curso));
  campo("Professor Orientador", nn(p.orientador?.nome));
  campo("Titulação", nn(p.orientador?.titulacao));
  campo("Ano/Semestre", nn(p.ciclo));

  secao("2 — DADOS QUANTITATIVOS");
  campo("Carga horária semanal", `${p.chSemanal || "—"} hora(s)`);
  campo("Carga horária total prevista", `${p.cargaTotal || "—"} hora(s)`);
  campo("Monitores previstos", String((p.monitores || []).length || "—"));

  secao("3 — PERÍODO DA MONITORIA");
  campo("Data de início", fmtData(p.inicio));
  campo("Data de conclusão", fmtData(p.fim));

  secao("4 — ATIVIDADES A SEREM DESENVOLVIDAS PELO ALUNO MONITOR");
  texto(p.atividades);

  if (p.ementa) { secao("5 — EMENTA / CONTEÚDO DA DISCIPLINA"); texto(p.ementa); }

  const mons = p.monitores || [];
  if (mons.length) {
    secao(`${p.ementa ? 6 : 5} — MONITOR(ES) INDICADO(S) E PLANO DE TRABALHO`);
    mons.forEach((m, i) => {
      quebra(40);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CYAN)
        .text(`${i + 1}. ${nn(m.nome)}`, M, doc.y + 4, { width: LARG });
      campo("Matrícula", nn(m.matricula));
      campo("Curso / período", `${nn(cursoDe(m.curso)?.nome || m.curso)} · ${nn(m.periodo)}`);
      planoNoPdf(doc, quebra, texto, m, campos);
    });
  }

  if (Number(p.selecao?.candidatos) > 0) {
    secao("PROCESSO SELETIVO (item 4 do edital)");
    campo("Candidatos inscritos", String(p.selecao.candidatos));
    campo("Entrevista realizada em", fmtData(p.selecao.realizadaEm));
    if (p.selecao.observacao) texto(p.selecao.observacao);
  }

  quebra(70);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${fmtDataLonga(soDia(p.submetidoEm || p.criadoEm)) || hojeExtenso()}.`,
      M, doc.y + 18, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [
    { nome: nn(p.orientador?.nome), cargo: "Professor(a) Orientador(a)", img: "orientador" },
    { ...ASSINA.proReitor, img: "proreitor" },
  ], assinaturas);

  finalizar(doc, TIMBRE_PROAC, marca);
  return fim;
}

/** Anexo II — Ficha de Inscrição do candidato à monitoria. */
export async function gerarFichaMonitoriaPdf(p = {}, m = {}, { campos = [], assinaturas = {} } = {}) {
  const marca = marcaEm(p.fim);
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();

  doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL)
    .text("FICHA DE INSCRIÇÃO DE CANDIDATO À MONITORIA ACADÊMICA",
      M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(`Edital ${nn(p.edital)}${p.protocolo ? ` · projeto ${p.protocolo}` : ""}`,
      M, doc.y + 3, { width: LARG, align: "center" });

  secao("1 — DADOS DO PROJETO");
  campo("Disciplina de vinculação do Projeto", nn(p.disciplina));
  campo("Curso", nn(cursoDe(p.curso)?.nome || p.curso));
  campo("Professor Orientador", nn(p.orientador?.nome));
  campo("Ano/Semestre", nn(p.ciclo));

  secao("2 — DADOS DO ALUNO");
  campo("Nome completo", nn(m.nome));
  campo("Número de matrícula", nn(m.matricula));
  campo("CPF", m.cpf ? formatarCpfPdf(m.cpf) : "—");
  campo("Curso / período", `${nn(cursoDe(m.curso)?.nome || m.curso)} · ${nn(m.periodo)}`);
  campo("E-mail", nn(m.email));
  campo("Telefone", nn(m.telefone));
  campo("Carga horária semanal", `${m.chSemanal || p.chSemanal || "—"} hora(s)`);

  if (Object.values(m.plano || {}).some(Boolean)) {
    secao("PLANO DE TRABALHO");
    planoNoPdf(doc, quebra, texto, m, campos);
  }

  secao("3 — DOCUMENTO ANEXADO");
  campo("Histórico escolar da graduação",
    m.documentos?.historico ? `${m.documentos.historico.nome || "anexado"} — anexado no ARCHÉ` : "não anexado");
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
    .text("O histórico comprova a regularidade da matrícula e o aproveitamento na disciplina "
      + "pretendida (itens 3.1 e 3.2 do edital).", M, doc.y + 3, { width: LARG });

  secao("4 — DECLARAÇÃO DE DISPONIBILIDADE DE CARGA HORÁRIA");
  doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(
    `Eu, ${nn(m.nome)}, declaro que possuo disponibilidade de agenda semanal para cumprimento `
    + "da carga horária estabelecida em Projeto de Monitoria.",
    M, doc.y + 2, { width: LARG, align: "justify", lineGap: 3 });
  if (m.declaracao?.aceita) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED)
      .text(`Declaração firmada eletronicamente no ARCHÉ em ${fmtDataHora(m.declaracao.em)}.`,
        M, doc.y + 6, { width: LARG });
  }

  quebra(70);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${fmtDataLonga(soDia(m.cadastradoEm)) || hojeExtenso()}.`,
      M, doc.y + 18, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [{ nome: nn(m.nome), cargo: "Assinatura do(a) Aluno(a)", img: "monitor" }], assinaturas);

  finalizar(doc, TIMBRE_MON, marca);
  return fim;
}

/* O plano de trabalho, campo a campo. O que estiver em branco não sai: um
   documento cheio de travessões esconde o que foi de fato escrito. */
function planoNoPdf(doc, quebra, texto, m, campos) {
  const plano = m?.plano || {};
  for (const c of campos) {
    const v = String(plano[c.codigo] ?? "").trim();
    if (!v) continue;
    quebra(20);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(CYAN)
      .text(c.rotulo, M + 8, doc.y + 4, { width: LARG - 8 });
    doc.x = M;
    texto(v);
  }
}

const RESP_MON = { sim: "Sim", nao: "Não", parcialmente: "Parcialmente" };

/** Anexo III — Relatório de Atividades de Monitoria + avaliação do orientador. */
export async function gerarRelatorioMonitoriaPdf(p = {}, m = {}, { criterios = [], assinaturas = {} } = {}) {
  const marca = marcaEm(p.fim);
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();
  const r = m.relatorio || {};

  doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL)
    .text("RELATÓRIO DE ATIVIDADES DE MONITORIA", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(`Edital ${nn(p.edital)}${p.protocolo ? ` · projeto ${p.protocolo}` : ""}`,
      M, doc.y + 3, { width: LARG, align: "center" });

  secao("1 — DADOS DO PROJETO");
  campo("Disciplina de vinculação do Projeto", nn(p.disciplina));
  campo("Curso", nn(cursoDe(p.curso)?.nome || p.curso));
  campo("Professor Orientador", nn(p.orientador?.nome));
  campo("Ano/Semestre", nn(p.ciclo));
  campo("Período da monitoria", `${fmtData(p.inicio)} a ${fmtData(p.fim)}`);

  secao("2 — DADOS DO ALUNO");
  campo("Nome completo", nn(m.nome));
  campo("Número de matrícula", nn(m.matricula));
  campo("Carga horária semanal", `${m.chSemanal || p.chSemanal || "—"} hora(s)`);
  campo("Carga horária total", `${p.cargaTotal || "—"} hora(s)`);

  secao("3 — ATIVIDADES DESENVOLVIDAS");
  texto(r.atividades);
  if (r.dificuldades) { secao("DIFICULDADES ENCONTRADAS"); texto(r.dificuldades); }
  if (r.aprendizado) { secao("CONTRIBUIÇÃO PARA A FORMAÇÃO DO MONITOR"); texto(r.aprendizado); }
  if (r.enviadoEm) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED)
      .text(`Relatório enviado pelo monitor em ${fmtDataHora(r.enviadoEm)}.`, M, doc.y + 6, { width: LARG });
  }

  secao("4 — AVALIAÇÃO DA ATUAÇÃO DO MONITOR");
  const av = r.avaliacao || {};
  for (const c of criterios) {
    quebra(18);
    doc.font("Helvetica").fontSize(9).fillColor("#222")
      .text(c.pergunta, M, doc.y + 2, { width: LARG - 90, continued: false });
    const resp = RESP_MON[av.criterios?.[c.codigo]] || "(     )";
    doc.font("Helvetica-Bold").fontSize(9).fillColor(CYAN)
      .text(resp, M + LARG - 86, doc.y - 11, { width: 86, align: "right" });
    doc.x = M;
  }
  if (av.observacao) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111")
      .text("Informações adicionais sobre o desempenho do aluno monitor:", M, doc.y + 8, { width: LARG });
    texto(av.observacao);
  }
  campo("Parecer final", av.parecer === "aprovado" ? "APROVADO"
    : av.parecer === "reprovado" ? "REPROVADO" : "( ) Aprovado   ( ) Reprovado");
  if (r.validadoEm) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED)
      .text(`Validado pelo orientador em ${fmtDataHora(r.validadoEm)}.`, M, doc.y + 4, { width: LARG });
  }
  if (r.homologadoEm) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED)
      .text(`Homologado pela PROPPEX em ${fmtDataHora(r.homologadoEm)}.`, M, doc.y + 2, { width: LARG });
  }

  const fotos = (r.anexos || []).filter((a) => String(a.tipo || "").startsWith("image/"));
  const docs = (r.anexos || []).filter((a) => !String(a.tipo || "").startsWith("image/"));
  if (r.anexos?.length) {
    secao("5 — EVIDÊNCIAS ANEXADAS");
    campo("Fotos das atividades", String(fotos.length));
    for (const a of fotos) { quebra(14);
      doc.font("Helvetica").fontSize(8.5).fillColor(CYAN)
        .text(`• ${a.nome || "foto"}`, M + 8, doc.y + 2, { width: LARG - 8, link: a.url });
      doc.x = M;
    }
    if (docs.length) {
      campo("Outros documentos", String(docs.length));
      for (const a of docs) { quebra(14);
        doc.font("Helvetica").fontSize(8.5).fillColor(CYAN)
          .text(`• ${a.nome || "documento"}`, M + 8, doc.y + 2, { width: LARG - 8, link: a.url });
        doc.x = M;
      }
    }
    doc.fillColor("#222");
  }

  quebra(70);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${fmtDataLonga(soDia(r.validadoEm || r.enviadoEm)) || hojeExtenso()}.`,
      M, doc.y + 18, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [
    { nome: nn(m.nome), cargo: "Monitor(a) Acadêmico(a)", img: "monitor" },
    { nome: nn(p.orientador?.nome), cargo: "Professor(a) Orientador(a)", img: "orientador" },
  ], assinaturas);

  finalizar(doc, TIMBRE_MON, marca);
  return fim;
}

/* ========================================================================
   RELATÓRIO SEMESTRAL DE ATIVIDADES — um por setor.

   O documento que a pró-reitoria entrega ao conselho e ao avaliador do MEC.
   Três partes, nesta ordem, e a ordem é o argumento:

     1. os NÚMEROS do semestre, grandes, para responder de relance;
     2. os GRÁFICOS de distribuição — por curso, por situação, por órgão —,
        que é onde se lê concentração e lacuna;
     3. a LISTA nominal de tudo que foi contado, que é o que transforma o
        documento em comprovação: cada número acima pode ser conferido
        linha a linha aqui embaixo.

   As barras são desenhadas à mão (o PDFKit não tem gráfico) e de UMA COR
   só, a da marca: o que se compara é tamanho, e quem diz "quem é" é o
   rótulo da linha — cor por categoria obrigaria a consultar legenda.

   gerarRelatorioSemestralPdf({ setor, periodo, panorama, emitidoPor })
   ======================================================================== */
export async function gerarRelatorioSemestralPdf({ setor = {}, periodo = {}, panorama = {},
  emitidoPor = "", marca = MARCAS.uniego, assinaturas = {} } = {}) {
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();

  /* ------------------------------- capa --------------------------------- */
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("RELATÓRIO SEMESTRAL DE ATIVIDADES", M, TOPO, { width: LARG, align: "center", characterSpacing: 1.6 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(TEAL)
    .text(panorama.titulo || setor.nome || "Setor", M, doc.y + 6, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(12).fillColor(CYAN)
    .text(periodo.rotulo || periodo.chave || "", M, doc.y + 2, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Período considerado: ${fmtData(periodo.inicio)} a ${fmtData(periodo.fim)}`,
      M, doc.y + 6, { width: LARG, align: "center" });
  doc.moveTo(M + 120, doc.y + 10).lineTo(M + LARG - 120, doc.y + 10)
    .lineWidth(0.8).strokeColor(LINE).stroke();
  doc.y += 20;

  /* --------------------------- 1. os números ---------------------------- */
  const nums = (panorama.numeros || []).slice(0, 4);
  if (nums.length) {
    const w = LARG / nums.length;
    const y0 = doc.y + 6;
    let alturaMax = 0;
    nums.forEach((n, i) => {
      const x = M + i * w;
      doc.rect(x + 3, y0, w - 6, 62).fill(CINZA);
      doc.rect(x + 3, y0, w - 6, 62).lineWidth(0.6).strokeColor(LINE).stroke();
      doc.font("Helvetica-Bold").fontSize(21).fillColor(TEAL)
        .text(String(n.valor ?? 0), x + 8, y0 + 12, { width: w - 16, align: "center" });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text(n.rotulo || "", x + 8, y0 + 40, { width: w - 16, align: "center" });
      alturaMax = Math.max(alturaMax, 62);
    });
    doc.y = y0 + alturaMax + 14;
    doc.x = M;
  }

  /* De onde vieram os números, quando parte deles não correu no ARCHÉ. Um
     relatório que some com a origem não se confere depois — e é justamente
     este documento que vai ao avaliador. */
  if (panorama.nota) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
      .text(panorama.nota, M, doc.y, { width: LARG, align: "justify" });
    doc.y += 8; doc.x = M;
  }

  /* --------------------------- 2. os gráficos --------------------------- */
  const barras = (q) => {
    if (!q?.linhas?.length) return;
    quebra(40);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL)
      .text(q.titulo, M, doc.y + 10, { width: LARG });
    if (q.nota) {
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(q.nota, M, doc.y + 1, { width: LARG });
    }
    doc.y += 6;
    const maior = Math.max(...q.linhas.map((l) => l.valor), 1);
    const ROT = 176, VAL = 34, TRILHO = LARG - ROT - VAL - 8;
    for (const l of q.linhas.slice(0, 14)) {
      quebra(18);
      const y = doc.y;
      doc.font("Helvetica").fontSize(8.5).fillColor("#222")
        .text(cortar(doc, l.rotulo, ROT - 6), M, y + 1, { width: ROT - 6, lineBreak: false });
      doc.roundedRect(M + ROT, y, TRILHO, 9, 4.5).fill("#eef1f5");
      const larg = Math.max(3, (l.valor / maior) * TRILHO);
      doc.roundedRect(M + ROT, y, larg, 9, 4.5).fill(CYAN);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEAL)
        .text(String(l.valor), M + ROT + TRILHO + 6, y + 1, { width: VAL, align: "right", lineBreak: false });
      doc.y = y + 15; doc.x = M;
    }
    if (q.linhas.length > 14) {
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(MUTED)
        .text(`+ ${q.linhas.length - 14} linha(s) na relação completa`, M, doc.y, { width: LARG });
    }
  };

  const comDados = (panorama.quadros || []).filter((q) => q.linhas?.length);
  if (comDados.length) {
    secao("1 — DISTRIBUIÇÃO NO SEMESTRE");
    for (const q of comDados) barras(q);
  }

  /* ---------------------------- 3. a relação ---------------------------- */
  const itens = panorama.itens || [];
  secao(`${comDados.length ? 2 : 1} — RELAÇÃO DOS REGISTROS (${itens.length})`);
  if (!itens.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text("Nenhum registro neste setor no semestre considerado.", M, doc.y + 4, { width: LARG });
  } else {
    const cols = [40, 178, 96, 96, 73];
    const linha = (c, cab = false) => {
      const fonte = cab ? "Helvetica-Bold" : "Helvetica";
      doc.font(fonte).fontSize(7.6);
      const alt = Math.max(...c.map((t, i) => doc.heightOfString(String(t ?? ""), { width: cols[i] - 6 })));
      const h = Math.max(14, alt + 6);
      quebra(h + 4);
      const y = doc.y;
      if (cab) doc.rect(M, y, LARG, h).fill(CINZA);
      doc.font(fonte).fontSize(7.6).fillColor(cab ? TEAL : "#222");
      let x = M;
      c.forEach((t, i) => { doc.text(String(t ?? ""), x + 3, y + 3, { width: cols[i] - 6 }); x += cols[i]; });
      doc.rect(M, y, LARG, h).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y = y + h; doc.x = M;
    };
    linha(["Nº", "Identificação", "Curso / órgão", "Responsável", "Período"], true);
    for (const it of itens) {
      linha([it.numero || "—", `${it.titulo}${it.situacao ? `\n${it.situacao}` : ""}`,
        it.curso || "—", it.responsavel || "—", it.periodo || "—"]);
    }
  }

  /* ------------------------------ fechamento ---------------------------- */
  quebra(80);
  doc.font("Helvetica").fontSize(8) .fillColor(MUTED)
    .text("Documento gerado pelo ARCHÉ a partir dos registros do próprio sistema: cada linha da "
      + "relação corresponde a um registro preenchido pelos responsáveis, e pode ser conferida no "
      + "portal.", M, doc.y + 14, { width: LARG, align: "justify" });
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${hojeExtenso()}.`, M, doc.y + 12, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [{ ...ASSINA.proReitor, img: "proreitor" }], assinaturas);
  if (emitidoPor) {
    quebra(24);
    doc.font("Helvetica").fontSize(7).fillColor(MUTED)
      .text(`Emitido por ${emitidoPor}.`, M, doc.y + 6, { width: LARG, align: "center" });
  }

  finalizar(doc, TIMBRE_PADRAO, marca);
  return fim;
}

/* ========================================================================
   ARCHÉ AP — Aulas Práticas.

   Dois documentos, e eles respondem a perguntas diferentes:

   · o RELATÓRIO DE UMA AULA — o que o professor registrou e a coordenação
     validou, com as fotos que comprovam a realização. É a peça do processo.
   · o RELATÓRIO SEMESTRAL — o panorama do semestre, que a coordenação
     apresenta e que vai à pasta do MEC.

   Os dois saem no TIMBRE DA PROAC, porque o módulo é dela: aula prática é
   ensino, e quem responde por ela é a Pró-Reitoria Acadêmica. A PROPPEX
   opera o portal, e operar não põe ninguém no documento — é a mesma regra
   que já vale no certificado de monitoria.

   Quem assina difere, e também por quê: na aula, o PROFESSOR (que a deu) e
   o COORDENADOR (que a validou); no semestral, o coordenador, a pró-reitora
   acadêmica e o reitor — é documento institucional.
   ======================================================================== */

/** O relatório de UMA aula prática, com o registro fotográfico ao final. */
export async function gerarRelatorioAulaPraticaPdf({
  relatorio = {}, curso = "", professor = {}, coordenador = null,
  fotos = [], assinaturas = {},
} = {}) {
  const r = relatorio;
  const marca = marcaEm(r.data);
  const { doc, fim, quebra, secao, campo, texto } = criarDoc();
  /* Dois documentos no mesmo gerador (pedido da PROAC, ago/2026): o relatório
     de AULA PRÁTICA e o de EXTENSÃO CURRICULAR. O segundo segue as seções do
     modelo institucional da PROAC — com as três que o dono cortou (7, 11 e 12)
     fora e as tabelas das seções 3, 4, 6 e 8 reduzidas ao que elas afirmam. */
  const ext = String(r.tipo || "") === "extensao";

  doc.font("Helvetica-Bold").fontSize(14).fillColor(TEAL)
    .text(ext ? "RELATÓRIO DE CURRICULARIZAÇÃO DA EXTENSÃO" : "RELATÓRIO DE AULA PRÁTICA",
      M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text([r.protocolo, curso, r.semestre ? `${r.semestre}` : ""].filter(Boolean).join(" · "),
      M, doc.y + 3, { width: LARG, align: "center" });
  doc.moveDown(0.5);

  secao("1 — IDENTIFICAÇÃO");
  campo(ext ? "Docente responsável" : "Professor(a)", professor.nome || r.professor?.nome);
  campo("Curso", curso);
  campo("Disciplina", r.disciplina);
  campo(ext ? "Data da atividade" : "Data da aula", fmtDataLonga(r.data));
  campo("Local", r.local);
  if (ext) {
    campo("Semestre letivo", r.semestre || "—");
    campo("Carga horária da disciplina", r.chDisciplina ? `${r.chDisciplina} h` : "—");
    campo("Carga horária extensionista desenvolvida", r.cargaHoraria ? `${r.cargaHoraria} h` : "—");
    campo("Estudantes participantes", String(r.academicos || 0));
    if (r.parceiras) campo("Instituições parceiras", r.parceiras);
    if (r.acaoExtensao) campo("Ação de extensão vinculada", r.acaoExtensao);
  }

  if (ext) {
    secao("2 — RESUMO EXECUTIVO");
    texto(r.resumo);
    secao("3 — OBJETIVOS PREVISTOS E RESULTADOS ALCANÇADOS");
    campo("Situação dos objetivos", { alcancados: "Alcançados",
      parcialmente: "Parcialmente alcançados", nao: "Não alcançados" }[r.situacaoObjetivos] || "—");
    texto(r.objetivo);
    secao("4 — DESCRIÇÃO DAS ATIVIDADES REALIZADAS");
    texto(r.atividades);
    secao("5 — PARTICIPAÇÃO DISCENTE");
    texto(r.participacaoDiscente);
    secao("6 — IMPACTO SOCIAL E COMUNITÁRIO");
    campo("Público atendido", r.publico);
    campo("Pessoas atendidas", String(r.pessoasAtendidas || 0));
    texto(r.impacto);
    if (r.valorSocial) { secao("9 — VALOR SOCIAL ESTIMADO DA AÇÃO"); texto(r.valorSocial); }
    if (r.avaliacaoComunidade) { secao("10 — AVALIAÇÃO DA COMUNIDADE"); texto(r.avaliacaoComunidade); }
    if ((r.produtos || []).length) {
      secao("13 — PRODUTOS E EVIDÊNCIAS GERADAS");
      texto(r.produtos.join(" · "));
    }
    if ((r.evidencias || []).length) {
      secao("14 — ANEXOS");
      // o arquivo já está no sistema com endereço próprio: o documento diz
      // ONDE ele está, não o carrega junto (a mesma decisão do relatório de
      // produção docente — embutir deixava o arquivo 274× maior)
      for (const e of r.evidencias) {
        campo(e.nome || "anexo", e.link || `/api/files/${e.fileId || ""}`);
      }
    }
    if (r.observacao) { secao("OBSERVAÇÕES"); texto(r.observacao); }
  } else {
    secao("2 — OBJETIVO DA AULA PRÁTICA");
    texto(r.objetivo);

    secao("3 — ATIVIDADES DESENVOLVIDAS");
    texto(r.atividades);

    if (r.observacao) { secao("4 — OBSERVAÇÕES"); texto(r.observacao); }
  }

  /* A validação faz parte do documento: é ela que o distingue de um
     rascunho, e é o que a coordenação precisa poder mostrar depois. */
  secao("VALIDAÇÃO DA COORDENAÇÃO");
  if (r.parecer?.decisao === "validado") {
    campo("Situação", "Validado");
    campo("Validado por", r.parecer.nome || r.parecer.por || "—");
    campo("Em", fmtDataHora(r.parecer.em));
    if (r.parecer.comentario) texto(r.parecer.comentario);
  } else if (r.parecer?.decisao === "devolvido") {
    campo("Situação", "Devolvido para ajustes");
    campo("Devolvido por", r.parecer.nome || r.parecer.por || "—");
    campo("Em", fmtDataHora(r.parecer.em));
    if (r.parecer.comentario) texto(r.parecer.comentario);
  } else if (r.parecer?.decisao === "reprovado") {
    campo("Situação", "Reprovado");
    campo("Reprovado por", r.parecer.nome || r.parecer.por || "—");
    campo("Em", fmtDataHora(r.parecer.em));
    if (r.parecer.comentario) texto(r.parecer.comentario);
  } else if (r.parecer?.decisao === "reaberto") {
    campo("Situação", "Processo reaberto pela PROAC/PROPPEX — aguardando nova decisão");
    campo("Reaberto por", r.parecer.nome || r.parecer.por || "—");
    campo("Em", fmtDataHora(r.parecer.em));
    if (r.parecer.comentario) texto(r.parecer.comentario);
  } else {
    campo("Situação", r.status === "enviado" ? "Aguardando validação da coordenação" : "Não enviado");
  }
  campo("Fotos anexadas", `${(r.fotos || []).length}`);

  quebra(40); doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "right" });

  /* O relatório de extensão curricular sai com as QUATRO assinaturas do
     modelo da PROAC; o de aula prática segue com as duas de sempre. As duas
     institucionais vêm do banco, como em todo documento gerado. */
  reguaDeAssinaturas(doc, quebra, ext ? [
    { nome: professor.nome || r.professor?.nome || "", cargo: "Responsável pelo projeto de extensão", img: "professor" },
    { nome: coordenador?.nome || "", cargo: coordenador?.cargo || "Coordenação do curso", img: "coordenador" },
    { ...ASSINA.coordGestaoAcademica, img: "coordgestao" },
    { ...ASSINA.proReitoraAcademica, img: "proacademica" },
  ] : [
    { nome: professor.nome || r.professor?.nome || "", cargo: "Professor(a) responsável pela aula", img: "professor" },
    { nome: coordenador?.nome || "", cargo: coordenador?.cargo || "Coordenação do curso", img: "coordenador" },
  ], assinaturas);

  // as fotos vêm DEPOIS das assinaturas, em páginas próprias: o corpo é o
  // que se assina; a foto é o anexo que o comprova
  paginasDeFotos(doc, fotos, { M, LARG, RODAPE_Y, TOPO,
    legenda: `${fotos.length} imagem(ns) d${ext ? "a atividade" : "a aula prática"}, na ordem em que foram anexadas.` });

  finalizar(doc, TIMBRE_PROAC, marca);
  return fim;
}

/** O panorama do semestre: números, quadros e a relação nominal das aulas. */
export async function gerarRelatorioSemestralPraticasPdf({
  semestre = "", curso = "", panorama = {}, relatorios = [],
  coordenador = null, assinaturas = {}, emitidoPor = "",
} = {}) {
  const marca = marcaEm(`${String(semestre).slice(0, 4)}-06-30`);
  const { doc, fim, quebra, secao, campo } = criarDoc();

  doc.font("Helvetica-Bold").fontSize(14).fillColor(TEAL)
    .text("RELATÓRIO SEMESTRAL DE AULAS PRÁTICAS", M, TOPO, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text([curso || "Todos os cursos", semestre ? `${semestre}` : ""].filter(Boolean).join(" · "),
      M, doc.y + 3, { width: LARG, align: "center" });
  doc.moveDown(0.6);

  secao("1 — O SEMESTRE EM NÚMEROS");
  const n = panorama;
  const quadro = [
    ["Relatórios entregues", n.entregues ?? 0],
    ["Validados pela coordenação", n.validados ?? 0],
    ["Aguardando validação", n.enviados ?? 0],
    ["Devolvidos para ajustes", n.devolvidos ?? 0],
    ["Professores cadastrados no semestre", n.professores ?? 0],
    ["Professores que registraram ao menos uma aula", n.professoresQueRegistraram ?? 0],
    ["Disciplinas cadastradas", n.disciplinas ?? 0],
    ["Disciplinas sem nenhum relatório", (n.disciplinasSemRelatorio || []).length],
  ];
  for (const [k, v] of quadro) campo(k, String(v));

  if ((n.porCurso || []).length > 1) {
    secao("2 — POR CURSO");
    for (const c of n.porCurso) {
      campo(c.curso, `${c.relatorios} relatório(s) · ${c.professores} professor(es)`);
    }
  }

  /* O que a coordenação precisa VER para cobrar: quem não registrou e que
     disciplina ficou sem nenhum registro. Número sozinho não move ninguém —
     o nome, sim. */
  if ((n.professoresSemRegistro || []).length) {
    secao("PROFESSORES SEM NENHUM RELATÓRIO NO SEMESTRE");
    for (const p of n.professoresSemRegistro) {
      campo(p.nome || p.email, `${cursoDe(p.curso)?.nome || p.curso} · ${p.disciplinas} disciplina(s)`);
    }
  }
  if ((n.disciplinasSemRelatorio || []).length) {
    secao("DISCIPLINAS SEM NENHUM RELATÓRIO NO SEMESTRE");
    for (const d of n.disciplinasSemRelatorio) {
      campo(d.disciplina, `${cursoDe(d.curso)?.nome || d.curso} · ${(d.professores || []).join(", ") || "—"}`);
    }
  }

  /* A RELAÇÃO NOMINAL é o que transforma o número em comprovação: cada
     linha existe no sistema e pode ser conferida. */
  secao("RELAÇÃO DAS AULAS PRÁTICAS REGISTRADAS");
  if (!relatorios.length) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED)
      .text("Nenhuma aula prática registrada no período.", M, doc.y + 2, { width: LARG });
  } else {
    // LARG = 483: a última coluna é o que sobra, e precisa caber "Em validação"
    const cols = [52, 128, 128, 100, 0];
    cols[4] = LARG - cols.slice(0, 4).reduce((a, b) => a + b, 0);
    const linha = (vals, negrito = false) => {
      quebra(16);
      const y = doc.y;
      let x = M;
      doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8)
        .fillColor(negrito ? TEAL : "#222");
      vals.forEach((v, i) => {
        doc.text(cortar(doc, String(v ?? ""), cols[i] - 5), x, y, { width: cols[i] - 5, lineBreak: false });
        x += cols[i];
      });
      doc.y = y + 12;
      doc.moveTo(M, doc.y - 3).lineTo(M + LARG, doc.y - 3).lineWidth(0.3).strokeColor(LINE).stroke();
    };
    linha(["Data", "Disciplina", "Professor(a)", "Local", "Situação"], true);
    for (const r of relatorios) {
      linha([fmtData(r.data), r.disciplina, r.professor?.nome || r.professor?.email,
        r.local, r.status === "validado" ? "Validado" : (r.status === "enviado" ? "Em validação" : "—")]);
    }
  }

  quebra(40); doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}, ${hojeExtenso()}.`, M, doc.y, { width: LARG, align: "right" });

  reguaDeAssinaturas(doc, quebra, [
    { nome: coordenador?.nome || "", cargo: coordenador?.cargo || "Coordenação do curso", img: "coordenador" },
    { ...ASSINA.proReitoraAcademica, img: "proacademica" },
    { ...ASSINA.reitor, img: "reitor" },
  ], assinaturas);

  if (emitidoPor) {
    doc.font("Helvetica").fontSize(7).fillColor(MUTED)
      .text(`Emitido por ${emitidoPor} pelo ARCHÉ.`, M, doc.y + 8, { width: LARG, align: "center" });
  }

  finalizar(doc, TIMBRE_PROAC, marca);
  return fim;
}

/* ========================================================================
   ARCHÉ Avaliação — RELATÓRIO DE PRODUÇÃO DOCENTE em PDF (pedido do dono,
   ago/2026: "tem como ele vir com os elementos gráficos, como fotos, o
   quadro de produções, o regime de trabalho, etc? pra ficar bonito").

   O relatório sai do SERVIDOR, do mesmo gerador dos demais documentos
   oficiais — timbrado, tipografia e paleta institucionais —, lendo o
   dossiê gravado (`dossie-<curso>-v1`): a foto de cada docente, o quadro
   do Indicador 2.16 (a escada de conceitos, como o painel a mostra), a
   distribuição por tipo de produção, o regime de trabalho e a titulação.

   Duas regras herdadas de decisões anteriores do dono:
   · o comprovante entra como LINK, nunca embutido ("senão fica um arquivo
     muito grande") — clicável, para o avaliador abrir o que está salvo;
   · a janela de anos é UMA (ano corrente + três anteriores), a mesma da
     tela e da conta do 2.16 — o texto diz o período e a conta o cumpre.

   A foto é a única imagem embutida (é pequena); acima de ~1,5 MB ela sai
   como as iniciais do nome, porque o documento não pode voltar a pesar.

   Os documentos PESSOAIS (RG, CTPS…) ficam FORA de propósito: comprovam
   vínculo, não produção, e este documento circula com o avaliador.
   ======================================================================== */
const CATS_DOSSIE = {
  formacao: "Formação acadêmica (Indicador 2.5)",
  artigos: "Artigos publicados em periódicos",
  livros: "Livros publicados ou organizados",
  capitulos: "Capítulos de livros",
  eventos: "Trabalhos em eventos",
  orientacoes: "Orientações concluídas",
  tecnica: "Produção técnica",
};
// os tipos que o MEC considera na conta do 2.16 (glossário do instrumento)
const PROD_CATS_DOSSIE = ["artigos", "livros", "capitulos", "eventos", "tecnica"];
const MINIMO_216 = 9;
const ESCADA_216 = [{ c: 2, p: 10 }, { c: 3, p: 20 }, { c: 4, p: 30 }, { c: 5, p: 50 }];
const VERDE = "#1f6b45", AMBAR = "#a75a0b";

function imagemDeDataUrl(v) {
  const m = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(v || ""));
  if (!m) return null;
  try {
    const b = Buffer.from(m[1], "base64");
    return b.length && b.length <= 1_500_000 ? b : null;
  } catch { return null; }
}

export async function gerarProducaoDocentePdf({ curso = "", cursoNome = "", dossie = {}, assinaturas = {} } = {}) {
  const { doc, fim, quebra, secao } = criarDoc();
  /* O "✓" não existe no repertório WinAnsi das fontes padrão do PDF (a
     blindagem o trocaria por outro sinal) — o certo aqui é DESENHAR o
     visto, que é o que também o deixa com a cara da tela. */
  const visto = (x, y, cor = VERDE, s = 1) => {
    doc.save();
    doc.moveTo(x, y + 3 * s).lineTo(x + 2.2 * s, y + 5.2 * s).lineTo(x + 6.4 * s, y)
      .lineWidth(1.3 * s).lineCap("round").strokeColor(cor).stroke();
    doc.restore();
  };
  const anoAtual = new Date().getFullYear();
  const anoMin = anoAtual - 3;
  const FAIXA = `${anoMin}–${anoAtual}`;
  const profs = Array.isArray(dossie?.profs) ? dossie.profs : [];

  /* Os itens de um docente, com o estado (anexo) casado por id e a janela
     de anos aplicada — o MESMO recorte da tela: produção fora da janela não
     se mostra, formação não tem régua de ano. */
  const gruposDe = (p) => {
    const est = new Map((p.itemStates || []).filter((s) => s && s.id).map((s) => [s.id, s]));
    return (p.data?.groups || []).map((g) => ({
      key: g.key,
      label: CATS_DOSSIE[g.key] || g.label || g.key,
      itens: (g.items || [])
        .filter((it) => g.key === "formacao" || !it.year || (+it.year) >= anoMin)
        .map((it) => {
          const s = est.get(it.id) || {};
          return { ...it, anexo: s.anexo && s.anexo.path ? s.anexo : null };
        }),
    })).filter((g) => g.itens.length);
  };
  const producoesDe = (p) => gruposDe(p).filter((g) => PROD_CATS_DOSSIE.includes(g.key))
    .flatMap((g) => g.itens);
  // a conta do 2.16 exige o ano declarado, como no painel do curso
  const validas216 = (p) => producoesDe(p).filter((i) => i.year && (+i.year) >= anoMin).length;

  const comData = profs.filter((p) => p.data);
  const semData = profs.filter((p) => !p.data);
  const todasProd = profs.flatMap(producoesDe);
  const comComprov = todasProd.filter((i) => i.anexo).length;
  const alcancam = profs.filter((p) => validas216(p) >= MINIMO_216).length;
  const pct = profs.length ? Math.round((alcancam / profs.length) * 100) : 0;
  let conceito = 1;
  for (const n of ESCADA_216) if (pct >= n.p) conceito = n.c;

  /* ------------------------------- capa --------------------------------- */
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("RELATÓRIO DE PRODUÇÃO DOCENTE", M, TOPO, { width: LARG, align: "center", characterSpacing: 1.6 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(TEAL)
    .text(`Curso de ${cursoNome || curso}`, M, doc.y + 6, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(CYAN)
    .text("Indicador 2.16 — Produção científica, cultural, artística ou tecnológica",
      M, doc.y + 4, { width: LARG, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Instrumento de Avaliação de Cursos de Graduação (MEC/INEP) · produções de ${FAIXA} · emitido em ${hojeExtenso()}`,
      M, doc.y + 4, { width: LARG, align: "center" });
  doc.moveTo(M + 120, doc.y + 10).lineTo(M + LARG - 120, doc.y + 10)
    .lineWidth(0.8).strokeColor(LINE).stroke();
  doc.y += 20; doc.x = M;

  /* os números grandes */
  const nums = [
    { valor: profs.length, rotulo: "docentes no curso" },
    { valor: comData.length, rotulo: "currículos importados" },
    { valor: todasProd.length, rotulo: `produções em ${FAIXA}` },
    { valor: comComprov, rotulo: `com comprovante (${todasProd.length ? Math.round((comComprov / todasProd.length) * 100) : 0}%)` },
  ];
  {
    const w = LARG / nums.length, y0 = doc.y + 6;
    nums.forEach((n, i) => {
      const x = M + i * w;
      doc.rect(x + 3, y0, w - 6, 62).fill(CINZA);
      doc.rect(x + 3, y0, w - 6, 62).lineWidth(0.6).strokeColor(LINE).stroke();
      doc.font("Helvetica-Bold").fontSize(21).fillColor(TEAL)
        .text(String(n.valor), x + 8, y0 + 12, { width: w - 16, align: "center" });
      doc.font("Helvetica").fontSize(7.6).fillColor(MUTED)
        .text(n.rotulo, x + 8, y0 + 40, { width: w - 16, align: "center" });
    });
    doc.y = y0 + 62 + 14; doc.x = M;
  }
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
    .text("Os comprovantes citados neste documento são LINKS: cada um abre, no próprio ARCHÉ, o "
      + "arquivo anexado pelo docente — o relatório aponta onde a prova está, sem carregá-la junto.",
      M, doc.y, { width: LARG, align: "justify" });
  doc.y += 6;

  /* ------------------ o quadro do Indicador 2.16 ------------------------- */
  secao("1 — INDICADOR 2.16 · CONCEITO SIMULADO");
  {
    const y0 = doc.y + 2, CAIXA = 84;
    // a caixa do conceito
    doc.rect(M, y0, CAIXA, 84).fill(TEAL);
    doc.font("Helvetica-Bold").fontSize(38).fillColor("#ffffff")
      .text(String(conceito), M, y0 + 14, { width: CAIXA, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor("#cfe3ea")
      .text("CONCEITO\nSIMULADO", M, y0 + 60, { width: CAIXA, align: "center" });
    // a frase e a escada
    const X = M + CAIXA + 12, W = LARG - CAIXA - 12;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#222")
      .text(`${alcancam} de ${profs.length} docente(s) (${pct}%) têm ${MINIMO_216} ou mais produções em ${FAIXA}.`,
        X, y0 + 1, { width: W });
    doc.font("Helvetica").fontSize(7.4).fillColor(MUTED)
      .text("Regra do instrumento: o número de produções é fixo (9, nos tipos do glossário do MEC) e o que "
        + "varia é a proporção de docentes que o alcança. O denominador são todos os docentes do curso, "
        + "inclusive os que ainda não importaram o Lattes.", X, doc.y + 1.5, { width: W, align: "justify" });
    let y = doc.y + 5;
    for (const n of ESCADA_216) {
      const ok = pct >= n.p;
      const precisa = Math.ceil(profs.length * n.p / 100);
      doc.rect(X, y, W, 12.6).fill(ok ? "#eaf7ef" : "#f6f8f9");
      doc.rect(X, y, W, 12.6).lineWidth(0.4).strokeColor(ok ? "#cfeeda" : LINE).stroke();
      doc.font("Helvetica-Bold").fontSize(7.8).fillColor(ok ? VERDE : MUTED)
        .text(`Conceito ${n.c}`, X + 5, y + 3, { lineBreak: false });
      // "≥" não é WinAnsi: escreve-se por extenso, que também se lê melhor
      doc.font("Helvetica").fontSize(7.8).fillColor(ok ? "#222" : MUTED)
        .text(`${n.p}% ou mais dos docentes — a partir de ${precisa} docente(s) com ${MINIMO_216}+`,
          X + 58, y + 3, { width: W - 78, lineBreak: false });
      if (ok) visto(X + W - 15, y + 3.2);
      y += 14.4;
    }
    doc.y = Math.max(y, y0 + 86) + 6; doc.x = M;
  }

  /* --------------------- as distribuições em barras ---------------------- */
  const barras = (titulo, linhas) => {
    if (!linhas.length) return;
    quebra(30 + linhas.length * 15);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL).text(titulo, M, doc.y + 10, { width: LARG });
    doc.y += 4;
    const maior = Math.max(...linhas.map((l) => l.valor), 1);
    const ROT = 176, VAL = 34, TRILHO = LARG - ROT - VAL - 8;
    for (const l of linhas) {
      quebra(18);
      const y = doc.y;
      doc.font("Helvetica").fontSize(8.5).fillColor("#222")
        .text(cortar(doc, l.rotulo, ROT - 6), M, y + 1, { width: ROT - 6, lineBreak: false });
      doc.roundedRect(M + ROT, y, TRILHO, 9, 4.5).fill("#eef1f5");
      if (l.valor > 0) doc.roundedRect(M + ROT, y, Math.max(3, (l.valor / maior) * TRILHO), 9, 4.5).fill(CYAN);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEAL)
        .text(String(l.valor), M + ROT + TRILHO + 6, y + 1, { width: VAL, align: "right", lineBreak: false });
      doc.y = y + 15; doc.x = M;
    }
  };
  const contar = (lista, de) => {
    const c = new Map();
    for (const x of lista) { const k = de(x); c.set(k, (c.get(k) || 0) + 1); }
    return c;
  };

  secao("2 — DISTRIBUIÇÕES DO CURSO");
  barras(`Produções por tipo (${FAIXA}, tipos considerados pelo MEC)`,
    PROD_CATS_DOSSIE.map((k) => ({
      rotulo: CATS_DOSSIE[k],
      valor: profs.reduce((s, p) => s + gruposDe(p).filter((g) => g.key === k)
        .reduce((t, g) => t + g.itens.length, 0), 0),
    })));
  {
    const reg = contar(profs, (p) => String(p.regime || "").trim() || "Não informado");
    barras("Regime de trabalho do corpo docente",
      ["Integral", "Parcial", "Horista", "Não informado"]
        .filter((k) => reg.has(k)).map((k) => ({ rotulo: k, valor: reg.get(k) }))
        .concat([...reg.keys()].filter((k) => !["Integral", "Parcial", "Horista", "Não informado"].includes(k))
          .map((k) => ({ rotulo: k, valor: reg.get(k) }))));
    const tit = contar(profs, (p) => {
      const t = String(p.titulo || "").trim();
      if (/^dr/i.test(t) || /doutor/i.test(t)) return "Doutorado";
      if (/^(me|ma|msc|mestr)/i.test(t)) return "Mestrado";
      if (/^esp/i.test(t)) return "Especialização";
      return t ? `Outra (${t})` : "Não informada";
    });
    barras("Titulação do corpo docente (Indicador 2.5)",
      ["Doutorado", "Mestrado", "Especialização"].filter((k) => tit.has(k))
        .map((k) => ({ rotulo: k, valor: tit.get(k) }))
        .concat([...tit.keys()].filter((k) => !["Doutorado", "Mestrado", "Especialização"].includes(k))
          .map((k) => ({ rotulo: k, valor: tit.get(k) }))));
  }
  if (semData.length) {
    quebra(40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(AMBAR)
      .text(`Currículo ainda não importado (${semData.length}):`, M, doc.y + 8, { width: LARG });
    doc.font("Helvetica").fontSize(8.5).fillColor("#222")
      .text(semData.map((p) => p.nome).filter(Boolean).join(" · ") || "—", M, doc.y + 2, { width: LARG });
    doc.font("Helvetica").fontSize(7.4).fillColor(MUTED)
      .text("Estes docentes contam no denominador do 2.16 — é o que o instrumento manda.",
        M, doc.y + 2, { width: LARG });
  }

  /* --------------------- a ficha de cada docente ------------------------- */
  const FOTO = 46;
  const fotoDoDocente = (p, x, y) => {
    const buf = imagemDeDataUrl(p.photo);
    const cx = x + FOTO / 2, cy = y + FOTO / 2;
    let desenhou = false;
    if (buf) {
      doc.save();
      doc.circle(cx, cy, FOTO / 2).clip();
      try { doc.image(buf, x, y, { cover: [FOTO, FOTO], align: "center", valign: "center" }); desenhou = true; }
      catch { /* formato exótico: caem as iniciais */ }
      doc.restore();
    }
    if (!desenhou) {
      const partes = String(p.nome || "").trim().split(/\s+/);
      const inic = ((partes[0] || "")[0] || "?") + ((partes.length > 1 ? partes[partes.length - 1][0] : "") || "");
      doc.circle(cx, cy, FOTO / 2).fill(TEAL);
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff")
        .text(inic.toUpperCase(), x, y + FOTO / 2 - 8, { width: FOTO, align: "center", lineBreak: false });
    }
    doc.circle(cx, cy, FOTO / 2).lineWidth(1).strokeColor(CYAN).stroke();
  };

  let n = 0;
  for (const p of comData) {
    n += 1;
    doc.addPage();
    if (n === 1) secao(`3 — PRODUÇÃO DE CADA DOCENTE (${comData.length})`);

    // o cartão do docente: foto, nome, titulação · função · regime
    quebra(70);
    const y0 = doc.y + 4;
    doc.rect(M, y0, LARG, FOTO + 16).fill(CINZA);
    doc.rect(M, y0, LARG, FOTO + 16).lineWidth(0.6).strokeColor(LINE).stroke();
    fotoDoDocente(p, M + 10, y0 + 8);
    const X = M + 10 + FOTO + 12, W = LARG - 10 - FOTO - 12 - 10;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL)
      .text(cortar(doc, p.nome || "Docente", W), X, y0 + 10, { width: W, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor("#222")
      .text([p.titulo, p.funcao, p.regime ? `Regime ${p.regime}` : ""].filter(Boolean).join("  ·  "),
        X, y0 + 27, { width: W, lineBreak: false });
    const prods = producoesDe(p);
    const nCompr = prods.filter((i) => i.anexo).length;
    const nForm = gruposDe(p).filter((g) => g.key === "formacao").reduce((s, g) => s + g.itens.length, 0);
    doc.font("Helvetica").fontSize(7.8).fillColor(CYAN)
      .text(`${prods.length} produção(ões) em ${FAIXA} · ${nCompr} com comprovante · ${nForm} formação(ões)`
        + (p.data?.atual ? ` · Lattes atualizado em ${p.data.atual}` : ""),
        X, y0 + 41, { width: W, lineBreak: false });
    doc.y = y0 + FOTO + 16; doc.x = M;

    /* O link do Lattes EM EVIDÊNCIA abaixo do cartão (pedido do dono,
       ago/2026): é a fonte do que o relatório afirma, e o avaliador confere
       no próprio CNPq. O identificador vem da importação (`lattesId` no
       cadastro ou o NUMERO-IDENTIFICADOR do XML); sem ele, a faixa diz que
       falta — currículo importado sem o número é coisa a corrigir, não a
       esconder. */
    {
      const idLattes = String(p.lattesId || p.data?.id || "").replace(/\D/g, "");
      const y = doc.y;
      doc.rect(M, y, LARG, 17).fill("#e6f5fa");
      doc.rect(M, y, LARG, 17).lineWidth(0.6).strokeColor("#bfe3ef").stroke();
      doc.font("Helvetica-Bold").fontSize(8.2).fillColor(TEAL)
        .text("Currículo Lattes:", M + 8, y + 4.5, { lineBreak: false });
      if (idLattes) {
        const url = `http://lattes.cnpq.br/${idLattes}`;
        doc.font("Helvetica-Bold").fontSize(8.2).fillColor(CYAN)
          .text(url, M + 88, y + 4.5, { width: LARG - 96, link: url, underline: true, lineBreak: false });
      } else {
        doc.font("Helvetica-Oblique").fontSize(8.2).fillColor(MUTED)
          .text("identificador não informado no cadastro", M + 88, y + 4.5, { lineBreak: false });
      }
      doc.y = y + 23; doc.x = M;
    }

    // os itens, na ordem das guias da tela
    const ORDEM = ["formacao", "artigos", "livros", "capitulos", "eventos", "orientacoes", "tecnica"];
    const grupos = gruposDe(p).sort((a, b) => ORDEM.indexOf(a.key) - ORDEM.indexOf(b.key));
    for (const g of grupos) {
      quebra(30);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CYAN)
        .text(`${g.label} (${g.itens.length})`, M, doc.y + 6, { width: LARG });
      doc.moveTo(M, doc.y + 1.5).lineTo(M + LARG, doc.y + 1.5).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y += 5;
      for (const it of g.itens) {
        quebra(30);
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(8.2).fillColor(TEAL)
          .text(it.year || "s/ ano", M, y, { width: 34, lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor("#222")
          .text(String(it.title || "(sem título)"), M + 40, y, { width: LARG - 40 });
        const meta = [it.typeTag && it.typeTag !== g.label ? it.typeTag : "", it.detail, it.authors]
          .filter(Boolean).join(" · ");
        if (meta) doc.font("Helvetica").fontSize(7.4).fillColor(MUTED)
          .text(meta, M + 40, doc.y + 1, { width: LARG - 40 });
        if (it.anexo) {
          const url = /^https?:/i.test(it.anexo.path) ? it.anexo.path : SITE + it.anexo.path;
          visto(M + 40, doc.y + 2.5, VERDE, 0.85);
          doc.font("Helvetica").fontSize(7.4).fillColor(VERDE)
            .text(cortar(doc, it.anexo.name || "comprovante", LARG - 70),
              M + 49, doc.y + 1.5, { width: LARG - 49, link: url, underline: true });
        } else {
          doc.font("Helvetica-Oblique").fontSize(7.4).fillColor(AMBAR)
            .text("sem comprovante anexado", M + 40, doc.y + 1.5, { width: LARG - 40 });
        }
        doc.y += 5; doc.x = M;
      }
    }
  }

  /* ------------------------------ fechamento ---------------------------- */
  quebra(60);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text("Documento gerado pelo ARCHÉ a partir do dossiê de produção docente do curso: cada item foi "
      + "importado do Currículo Lattes ou incluído pelo próprio docente, e os comprovantes anexados "
      + "podem ser abertos pelos links ao longo do relatório.", M, doc.y + 12, { width: LARG, align: "justify" });
  doc.font("Helvetica").fontSize(9.5).fillColor("#222")
    .text(`${CIDADE_PDF}-GO, ${hojeExtenso()}.`, M, doc.y + 10, { width: LARG, align: "center" });
  blocoAssinaturas(doc, quebra, [{ ...ASSINA.proReitor, img: "proreitor" }], assinaturas);

  finalizar(doc, TIMBRE_PADRAO);
  return fim;
}
