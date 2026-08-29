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
const ETAPA = process.argv[4] || '77'
const DIR_CONS = path.join(BASE, 'consolidado' + (ETAPA === '77' ? '' : ETAPA))
const DIR_AVAL = fs.existsSync(DIR_CONS) && fs.readdirSync(DIR_CONS).some(f => f.endsWith('.json'))
  ? DIR_CONS
  : path.join(BASE, 'avaliacoes' + (ETAPA === '77' ? '' : ETAPA))
const SAIDA = process.argv[2] || path.join(BASE, 'Avaliacao_1a_Acao_Social_Banca01.docx')
const DATA_GERACAO = process.argv[3] || '28/08/2026'

const AZUL = '1F3864'
const VERDE = '1E6B3A'
const VERMELHO = '9A2A16'
const CINZA = '595959'
const LINHA = 'BFBFBF'

const ROTULO_ETAPA = { '77': 'PRIMEIRO EVENTO SOCIAL', '76': 'PRIMEIRO EVENTO DE SAÚDE', '79': 'SEGUNDO EVENTO DE SAÚDE', '82': 'PRIMEIRO EVENTO TÉCNICO' }
const VALOR_DOC = { '77': 2, '76': 3, '79': 3, '82': 3 }
const NOME_ETAPA = { '77': 'PRIMEIRA AÇÃO SOCIAL', '76': 'PRIMEIRO EVENTO DE SAÚDE', '79': 'SEGUNDO EVENTO DE SAÚDE', '82': 'PRIMEIRO EVENTO TÉCNICO' }

const RE = ROTULO_ETAPA[ETAPA]
const VD = VALOR_DOC[ETAPA]
const PERGUNTAS = [
  { id: 'relatorio',  rotulo: `${RE} - RELATÓRIO`,                   item: '5.9.8.1', valor: VD },
  { id: 'lista',      rotulo: `${RE} - LISTA DE PRESENÇA`,           item: '5.9.8.2', valor: VD },
  { id: 'card',       rotulo: `${RE} - CARD DE DIVULGAÇÃO`,          item: '5.9.8.3', valor: VD },
  { id: 'fotos',      rotulo: `${RE} - FOTOS`,                       item: '5.9.8.4', valor: VD },
  { id: 'divulgacao', rotulo: `${RE} - DIVULGAÇÃO EM REDES SOCIAIS`, item: '5.9.8.5', valor: VD },
].concat(ETAPA === '82' ? [
  { id: 'publico30',     rotulo: `${RE} - Público >= 30 pessoas`, item: '5.9.15', valor: 5 },
  { id: 'publico60',     rotulo: `${RE} - Público >= 60 pessoas`, item: '5.9.15', valor: 5 },
  { id: 'publico100',    rotulo: `${RE} - Público >= 100`,        item: '5.9.15', valor: 5 },
  { id: 'independencia', rotulo: `${RE} - Independência`,         item: '5.9.15', valor: 5 },
  { id: 'duracao',       rotulo: `${RE} - Duração dias >= 2`,     item: '5.9.15', valor: 5 },
] : [])
const TETO = PERGUNTAS.reduce((n, p) => n + p.valor, 0)

const corpus = JSON.parse(fs.readFileSync(path.join(BASE, `corpus_${ETAPA}.json`), 'utf8'))
const porSlug = Object.fromEntries(corpus.map(g => [g.slug, g]))

const DIR_VERIF = path.join(BASE, 'verificacoes' + (ETAPA === '77' ? '' : ETAPA))
const DIR_REAVAL = path.join(BASE, 'reavaliacoes' + (ETAPA === '77' ? '' : ETAPA))

function leJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }
function lista(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch (e) { return [] } }

// camada 2 — vereditos da refutação de cada "Não"
const verif = {}
lista(DIR_VERIF).forEach(f => {
  const d = leJson(path.join(DIR_VERIF, f))
  if (d && d.slug) verif[d.slug] = d.vereditos || []
})

// camada 3 — reavaliações vindas do passe de isometria
const reaval = {}
lista(DIR_REAVAL).forEach(f => {
  const d = leJson(path.join(DIR_REAVAL, f))
  if (d && d.slug && d.id) (reaval[d.slug] = reaval[d.slug] || {})[d.id] = d
})

// camada 4 — sobreposições manuais do avaliador (pendências da plataforma)
// Quando o consolidado JÁ traz o texto final (caso do que foi lançado na
// plataforma), as camadas 2 e 3 só marcam que houve revisão — não reescrevem
// a justificativa, senão o documento passaria a divergir do que está lançado.
const SO_MARCA = process.env.TEXTO_FINAL === '1'

const sobre = (leJson(path.join(BASE, 'sobreposicoes' + (ETAPA === '77' ? '' : ETAPA) + '.json')) || {})

const avaliacoes = lista(DIR_AVAL).map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR_AVAL, f), 'utf8'))
  d.slug = d.slug || path.basename(f, '.json')

  // precedência: reavaliação (isometria) > veredito da refutação > primeira passada
  d.itens = (d.itens || []).map(it => {
    const v = (verif[d.slug] || []).find(x => x.id === it.id)
    let out = { ...it }
    if (it.resposta === 'Não' && v) {
      if (v.mantem_nao === false) {
        out = { ...out, resposta: 'Sim', revisado: 'revertido para Sim na verificação' }
        if (!SO_MARCA) out.justificativa = v.razao || out.justificativa
      } else if (v.justificativa_corrigida && v.justificativa_corrigida.trim()) {
        out = { ...out, revisado: 'justificativa ajustada na verificação' }
        if (!SO_MARCA) out.justificativa = v.justificativa_corrigida
      }
    }
    const r = (reaval[d.slug] || {})[it.id]
    if (r && r.mudou) {
      out = { ...out, resposta: r.resposta, revisado: 'revisto no passe de isometria' }
      if (!SO_MARCA) out.justificativa = r.justificativa
    }
    const so = ((sobre[d.slug] || {})[it.id])
    if (so) out = { ...out, ...so, revisado: so.revisado || 'sobreposto pelo avaliador' }
    return out
  })
  return d
})

const nRevistos = avaliacoes.reduce((n, a) => n + a.itens.filter(i => i.revisado).length, 0)
console.log(`fonte: ${path.basename(DIR_AVAL)}/ · ${Object.keys(verif).length} equipes com veredito em disco, ${Object.keys(reaval).length} com reavaliação, ${nRevistos} itens revistos`)

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

const AMARELO = '8A6100'

function blocoItem(perg, item) {
  const resp = item ? item.resposta : '—'
  const sim = resp === 'Sim'
  const pend = resp === 'Pendente'
  const cor = pend ? AMARELO : (sim ? VERDE : VERMELHO)
  const filhos = []

  filhos.push(new Paragraph({
    spacing: { before: 220, after: 60 },
    children: [txt(perg.rotulo, { bold: true, size: 19, color: AZUL })],
  }))

  filhos.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      txt('Resposta:  ', { bold: true, size: 19 }),
      txt(resp.toUpperCase(), { bold: true, size: 22, color: cor }),
      txt(`     (item ${perg.item} do edital · ${pend ? 'não lançar antes de resolver' : (sim ? perg.valor : 0) + ' de ' + perg.valor + ' pontos'})`, { size: 16, color: CINZA }),
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

// Quadro de avaliação: uma linha por critério — critério | resposta | justificativa
const CURTO = {
  relatorio: 'Relatório', lista: 'Lista de presença', card: 'Card de divulgação',
  fotos: 'Fotos', divulgacao: 'Divulgação em redes sociais',
  publico30: 'Público ≥ 30', publico60: 'Público ≥ 60', publico100: 'Público ≥ 100',
  independencia: 'Independência', duracao: 'Duração ≥ 2 dias',
}

function quadroItens(a) {
  const larg = [2600, 1100, 5660]
  const cab = new TableRow({
    tableHeader: true,
    children: [
      celula([new Paragraph({ children: [txt('Critério', { bold: true, size: 18 })] })], larg[0], { fundo: 'E8EDF5' }),
      celula([new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Resposta', { bold: true, size: 18 })] })], larg[1], { fundo: 'E8EDF5' }),
      celula([new Paragraph({ children: [txt('Justificativa', { bold: true, size: 18 })] })], larg[2], { fundo: 'E8EDF5' }),
    ],
  })

  const linhas = PERGUNTAS.map(p => {
    const item = a.itens.find(x => x.id === p.id)
    const resp = item ? item.resposta : '—'
    const sim = resp === 'Sim'
    const pend = resp === 'Pendente'
    const cor = pend ? AMARELO : (sim ? VERDE : VERMELHO)

    const cCriterio = [
      new Paragraph({ spacing: { after: 20 }, children: [txt(CURTO[p.id] || p.rotulo, { bold: true, size: 18, color: AZUL })] }),
      new Paragraph({ children: [txt(`item ${p.item} · ${p.valor} ${p.valor === 1 ? 'ponto' : 'pontos'}`, { size: 14, color: CINZA })] }),
    ]

    const cResposta = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 },
        children: [txt(resp.toUpperCase(), { bold: true, size: 20, color: cor })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [txt(pend ? 'não lançar' : `${sim ? p.valor : 0} de ${p.valor}`, { size: 14, color: CINZA })] }),
    ]

    const cJust = [new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [txt(item ? item.justificativa : 'Não avaliado.', { size: 17 })],
    })]
    if (item && item.revisado) {
      cJust.push(new Paragraph({ spacing: { before: 40 },
        children: [txt(`[${item.revisado}]`, { size: 14, italics: true, color: CINZA })] }))
    }
    if (item && item.confianca === 'baixa') {
      cJust.push(new Paragraph({ spacing: { before: 40 },
        children: [txt('[confiança baixa — conferir antes de lançar]', { size: 14, italics: true, color: VERMELHO })] }))
    }

    return new TableRow({
      children: [
        celula(cCriterio, larg[0], { fundo: sim ? undefined : (pend ? 'FBF3DF' : 'FBE9E5') }),
        celula(cResposta, larg[1], { fundo: sim ? undefined : (pend ? 'FBF3DF' : 'FBE9E5') }),
        celula(cJust, larg[2]),
      ],
    })
  })

  return new Table({
    columnWidths: larg,
    width: { size: larg.reduce((x, y) => x + y, 0), type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINHA },
    },
    rows: [cab].concat(linhas),
  })
}

const filhos = []

// ---------------- capa ----------------
filhos.push(
  new Paragraph({ spacing: { before: 1400, after: 120 }, alignment: AlignmentType.CENTER,
    children: [txt('CONCURSO DO PROGRAMA FAEG JOVEM — 8ª EDIÇÃO/2026', { bold: true, size: 20, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [txt('Etapa Regional', { size: 20, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [txt(NOME_ETAPA[ETAPA], { bold: true, size: 40, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 },
    children: [txt('Conferência documental — Banca 01', { size: 26 })] }),
)

const totalNao = avaliacoes.reduce((n, a) => n + a.itens.filter(i => i.resposta === 'Não').length, 0)
const totalItens = avaliacoes.length * PERGUNTAS.length
const equipes10 = avaliacoes.filter(a => a.itens.every(i => i.resposta === 'Sim')).length

const resumo = [
  ['Equipes avaliadas', String(avaliacoes.length)],
  ['Itens conferidos', `${totalItens}  (${PERGUNTAS.length} por equipe)`],
  ['Itens com "Não"', `${totalNao}`],
  [`Equipes com os ${TETO} pontos`, `${equipes10}`],
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
    `Cada item é respondido com Sim ou Não, conforme a Tabela 1 do edital (teto de ${TETO} pontos neste evento). ` +
    'A régua aplicada é a mesma para todas as equipes e está registrada na rubrica da banca. As justificativas citam o item do edital ' +
    'e descrevem o que foi conferido no documento — é esse texto que responde ao recurso do grupo no prazo de 09 a 13/10/2026.',
    { size: 17, color: CINZA, italics: true })],
}))

filhos.push(new Paragraph({ children: [new PageBreak()] }))

// ---------------- uma equipe por página ----------------
avaliacoes.forEach((a, idx) => {
  const g = porSlug[a.slug]
  const nome = (g && g.nome) || a.slug
  const pontos = a.itens.filter(i => i.resposta === 'Sim').reduce((n, i) => n + (PERGUNTAS.find(p => p.id === i.id)?.valor || 0), 0)
  const temPendente = a.itens.some(i => i.resposta === 'Pendente')

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
      txt(temPendente ? `${pontos} de ${TETO} pontos + 1 item pendente` : `${pontos} de ${TETO} pontos`,
        { bold: true, size: 20, color: temPendente ? AMARELO : (pontos === TETO ? VERDE : VERMELHO) }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  }))

  filhos.push(fichaDados(g))

  filhos.push(new Paragraph({ spacing: { before: 200 }, children: [] }))
  filhos.push(quadroItens(a))

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
  const pontos = a.itens.filter(i => i.resposta === 'Sim').reduce((n, i) => n + (PERGUNTAS.find(p => p.id === i.id)?.valor || 0), 0)
  const cels = [celula([new Paragraph({ children: [txt((g && g.nome) || a.slug, { size: 15 })] })], largR[0])]
  PERGUNTAS.forEach((p, i) => {
    const it = a.itens.find(x => x.id === p.id)
    const r = it ? it.resposta : '—'
    const sim = r === 'Sim', pnd = r === 'Pendente'
    cels.push(celula([new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt(pnd ? 'Pend.' : (sim ? 'Sim' : 'Não'), { size: 15, bold: !sim, color: pnd ? AMARELO : (sim ? VERDE : VERMELHO) })],
    })], largR[i + 1], { fundo: sim ? undefined : (pnd ? 'FBF3DF' : 'FBE9E5') }))
  })
  cels.push(celula([new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [txt(String(pontos), { size: 15, bold: true, color: pontos === TETO ? VERDE : VERMELHO })],
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
          children: [txt(`Faeg Jovem 2026 · Etapa Regional · ${NOME_ETAPA[ETAPA]} · Banca 01`, { size: 14, color: CINZA })],
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
