/**
 * Gera o documento de avaliação da 1ª Ação Social — uma equipe por página.
 * Fonte: avaliacoes/<slug>.json (gravados pelos agentes) + corpus_77.json (dados declarados).
 */
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Header, Footer,
  PageNumber, TabStopType, TabStopPosition,
} = require('docx')

const BASE = __dirname
const DIR_AVAL = path.join(BASE, 'avaliacoes')
const SAIDA = process.argv[2] || path.join(BASE, 'Avaliacao_1a_Acao_Social_Banca01.docx')
const DATA_GERACAO = process.argv[3] || '28/08/2026'

const AZUL = '1F3864'
const VERDE = '1E6B3A'
const VERMELHO = '9A2A16'
const CINZA = '595959'
const LINHA = 'BFBFBF'

const PERGUNTAS = [
  { id: 'relatorio',  rotulo: 'PRIMEIRO EVENTO SOCIAL - RELATÓRIO',                   item: '5.9.8.1' },
  { id: 'lista',      rotulo: 'PRIMEIRO EVENTO SOCIAL - LISTA DE PRESENÇA',           item: '5.9.8.2' },
  { id: 'card',       rotulo: 'PRIMEIRO EVENTO SOCIAL - CARD DE DIVULGAÇÃO',          item: '5.9.8.3' },
  { id: 'fotos',      rotulo: 'PRIMEIRO EVENTO SOCIAL - FOTOS',                       item: '5.9.8.4' },
  { id: 'divulgacao', rotulo: 'PRIMEIRO EVENTO SOCIAL - DIVULGAÇÃO EM REDES SOCIAIS', item: '5.9.8.5' },
]

const corpus = JSON.parse(fs.readFileSync(path.join(BASE, 'corpus_77.json'), 'utf8'))
const porSlug = Object.fromEntries(corpus.map(g => [g.slug, g]))

const avaliacoes = fs.readdirSync(DIR_AVAL).filter(f => f.endsWith('.json')).map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR_AVAL, f), 'utf8'))
  d.slug = d.slug || path.basename(f, '.json')
  return d
})

// ordena pelo nome da equipe, como na plataforma
avaliacoes.sort((a, b) => {
  const na = (porSlug[a.slug] || {}).nome || a.slug
  const nb = (porSlug[b.slug] || {}).nome || b.slug
  return na.localeCompare(nb, 'pt-BR')
})

const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

function txt(t, o = {}) {
  return new TextRun({ text: t, font: 'Calibri', size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color, break: o.break })
}

function celula(filhos, larg, o = {}) {
  return new TableCell({
    width: { size: larg, type: WidthType.DXA },
    shading: o.fundo ? { type: ShadingType.CLEAR, fill: o.fundo, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: filhos,
  })
}

function fichaDados(g) {
  const c = (g && g.campos) || {}
  const larg = [1900, 7460]
  const linha = (rot, val) => new TableRow({
    children: [
      celula([new Paragraph({ children: [txt(rot, { bold: true, size: 17, color: CINZA })] })], larg[0], { fundo: 'F2F2F2' }),
      celula([new Paragraph({ children: [txt(val || '—', { size: 17 })] })], larg[1]),
    ],
  })
  const periodo = [c.data_inicio, c.hora_inicio && `${c.hora_inicio}`, '→', c.data_fim, c.hora_fim].filter(Boolean).join(' ')
  return new Table({
    columnWidths: larg,
    width: { size: larg[0] + larg[1], type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    },
    rows: [
      linha('Ação', c.nome_acao),
      linha('Local', [c.local, c.municipio].filter(Boolean).join(' — ')),
      linha('Quando', periodo),
      linha('Público', [c.participantes && `${c.participantes} presentes`, c.beneficiados && `${c.beneficiados} beneficiadas`].filter(Boolean).join(' · ')),
      linha('Divulgação', c.instagram),
    ],
  })
}

function blocoItem(perg, item) {
  const resp = item ? item.resposta : '—'
  const sim = resp === 'Sim'
  const filhos = []

  filhos.push(new Paragraph({
    spacing: { before: 220, after: 60 },
    children: [txt(perg.rotulo, { bold: true, size: 19, color: AZUL })],
  }))

  filhos.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      txt('Resposta:  ', { bold: true, size: 19 }),
      txt(resp.toUpperCase(), { bold: true, size: 22, color: sim ? VERDE : VERMELHO }),
      txt(`     (item ${perg.item} do edital · ${sim ? '2' : '0'} de 2 pontos)`, { size: 16, color: CINZA }),
    ],
  }))

  filhos.push(new Paragraph({
    spacing: { after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      txt('Justificativa: ', { bold: true, size: 18 }),
      txt(item ? item.justificativa : 'Não avaliado.', { size: 18 }),
    ],
  }))

  if (item && item.revisado) {
    filhos.push(new Paragraph({
      spacing: { after: 40 },
      children: [txt(`[${item.revisado}]`, { size: 15, italics: true, color: CINZA })],
    }))
  }
  if (item && item.confianca === 'baixa') {
    filhos.push(new Paragraph({
      spacing: { after: 40 },
      children: [txt('[confiança baixa — conferir antes de lançar]', { size: 15, italics: true, color: VERMELHO })],
    }))
  }
  return filhos
}

const filhos = []

// ---------------- capa ----------------
filhos.push(
  new Paragraph({ spacing: { before: 1400, after: 120 }, alignment: AlignmentType.CENTER,
    children: [txt('CONCURSO DO PROGRAMA FAEG JOVEM — 8ª EDIÇÃO/2026', { bold: true, size: 20, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [txt('Etapa Regional', { size: 20, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [txt('PRIMEIRA AÇÃO SOCIAL', { bold: true, size: 44, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 },
    children: [txt('Conferência documental — Banca 01', { size: 26 })] }),
)

const totalNao = avaliacoes.reduce((n, a) => n + a.itens.filter(i => i.resposta === 'Não').length, 0)
const totalItens = avaliacoes.length * 5
const equipes10 = avaliacoes.filter(a => a.itens.every(i => i.resposta === 'Sim')).length

const resumo = [
  ['Equipes avaliadas', String(avaliacoes.length)],
  ['Itens conferidos', `${totalItens}  (5 por equipe)`],
  ['Itens com "Não"', `${totalNao}`],
  ['Equipes com os 10 pontos', `${equipes10}`],
  ['Data da conferência', DATA_GERACAO],
]
filhos.push(new Table({
  columnWidths: [3600, 3600],
  width: { size: 7200, type: WidthType.DXA },
  alignment: AlignmentType.CENTER,
  borders: {
    top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    insideVertical: { style: BorderStyle.NONE },
  },
  rows: resumo.map(([a, b]) => new TableRow({
    children: [
      celula([new Paragraph({ children: [txt(a, { size: 18, color: CINZA })] })], 3600),
      celula([new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(b, { size: 18, bold: true })] })], 3600),
    ],
  })),
}))

filhos.push(new Paragraph({
  spacing: { before: 600 }, alignment: AlignmentType.JUSTIFIED,
  children: [txt(
    'Cada item vale 2 pontos e é respondido com Sim ou Não, conforme a Tabela 1 do edital para ação social (10 pontos por evento). ' +
    'A régua aplicada é a mesma para todas as equipes e está registrada na rubrica da banca. As justificativas citam o item do edital ' +
    'e descrevem o que foi conferido no documento — é esse texto que responde ao recurso do grupo no prazo de 09 a 13/10/2026.',
    { size: 17, color: CINZA, italics: true })],
}))

filhos.push(new Paragraph({ children: [new PageBreak()] }))

// ---------------- uma equipe por página ----------------
avaliacoes.forEach((a, idx) => {
  const g = porSlug[a.slug]
  const nome = (g && g.nome) || a.slug
  const pontos = a.itens.filter(i => i.resposta === 'Sim').length * 2

  filhos.push(new Paragraph({
    spacing: { after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 6 } },
    children: [txt(nome, { bold: true, size: 30, color: AZUL })],
  }))

  filhos.push(new Paragraph({
    spacing: { after: 200 },
    children: [
      txt((g && g.login) || '', { size: 16, color: CINZA }),
      txt('\t', {}),
      txt(`${pontos} de 10 pontos`, { bold: true, size: 20, color: pontos === 10 ? VERDE : VERMELHO }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  }))

  filhos.push(fichaDados(g))

  PERGUNTAS.forEach(p => {
    const it = a.itens.find(x => x.id === p.id)
    blocoItem(p, it).forEach(f => filhos.push(f))
  })

  if (a.observacoes && a.observacoes.trim()) {
    filhos.push(new Paragraph({
      spacing: { before: 260, after: 60 },
      children: [txt('Observações para a coordenação', { bold: true, size: 18, color: CINZA })],
    }))
    filhos.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [txt(a.observacoes, { size: 17, italics: true, color: CINZA })],
    }))
  }

  if (idx < avaliacoes.length - 1) filhos.push(new Paragraph({ children: [new PageBreak()] }))
})

// ---------------- quadro-resumo ----------------
filhos.push(new Paragraph({ children: [new PageBreak()] }))
filhos.push(new Paragraph({
  spacing: { after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 6 } },
  children: [txt('Quadro-resumo', { bold: true, size: 28, color: AZUL })],
}))

const largR = [3560, 1000, 1000, 1000, 1000, 1000, 800]
const cab = ['Equipe', 'Rel.', 'Lista', 'Card', 'Fotos', 'Divulg.', 'Pontos']
const linhasResumo = [new TableRow({
  tableHeader: true,
  children: cab.map((c, i) => celula(
    [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [txt(c, { bold: true, size: 16 })] })],
    largR[i], { fundo: 'E8EDF5' })),
})]

avaliacoes.forEach(a => {
  const g = porSlug[a.slug]
  const pontos = a.itens.filter(i => i.resposta === 'Sim').length * 2
  const cels = [celula([new Paragraph({ children: [txt((g && g.nome) || a.slug, { size: 15 })] })], largR[0])]
  PERGUNTAS.forEach((p, i) => {
    const it = a.itens.find(x => x.id === p.id)
    const sim = it && it.resposta === 'Sim'
    cels.push(celula([new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt(sim ? 'Sim' : 'Não', { size: 15, bold: !sim, color: sim ? VERDE : VERMELHO })],
    })], largR[i + 1], { fundo: sim ? undefined : 'FBE9E5' }))
  })
  cels.push(celula([new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [txt(String(pontos), { size: 15, bold: true, color: pontos === 10 ? VERDE : VERMELHO })],
  })], largR[6]))
  linhasResumo.push(new TableRow({ children: cels }))
})

filhos.push(new Table({
  columnWidths: largR,
  width: { size: largR.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    left: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    right: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
  },
  rows: linhasResumo,
}))

const doc = new Document({
  creator: 'Banca 01 — Concurso Faeg Jovem 2026',
  title: 'Avaliação da 1ª Ação Social — Banca 01',
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [txt('Faeg Jovem 2026 · Etapa Regional · 1ª Ação Social · Banca 01', { size: 14, color: CINZA })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [txt('', { size: 14, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: CINZA, font: 'Calibri' })],
        })],
      }),
    },
    children: filhos,
  }],
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(SAIDA, buf)
  console.log(`gerado: ${SAIDA}`)
  console.log(`equipes: ${avaliacoes.length} | itens "Não": ${totalNao} | equipes com 10 pontos: ${equipes10}`)
})
