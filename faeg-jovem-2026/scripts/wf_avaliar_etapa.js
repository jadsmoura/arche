export const meta = {
  name: 'faeg-jovem-avaliar-etapa',
  description: 'Avaliar uma etapa de eventos: itens Sim/Não com justificativa e refutação independente de cada "Não"',
  phases: [
    { title: 'Avaliar', detail: 'um agente por equipe, lendo relatório, lista, card, fotos e o campo de divulgação' },
    { title: 'Verificar', detail: 'refutação independente de cada "Não" — o Não é o que vira recurso' },
  ],
}

// args = { etapa, tipo, nomeEtapa, rubrica, saida, dossies, itens: [...], slugs: [...] }
const CFG = args
const EQUIPES = CFG.slugs.map(s => ({ slug: s, dossie: `${CFG.dossies}/${s}.md` }))
const ITENS = CFG.itens
const IDS = ITENS.map(i => i.id)

const ESQUEMA_AVALIACAO = {
  type: 'object',
  required: ['slug', 'itens', 'observacoes'],
  properties: {
    slug: { type: 'string' },
    itens: {
      type: 'array', minItems: ITENS.length, maxItems: ITENS.length,
      items: {
        type: 'object',
        required: ['id', 'resposta', 'justificativa', 'confianca', 'evidencia'],
        properties: {
          id: { type: 'string', enum: IDS },
          resposta: { type: 'string', enum: ['Sim', 'Não'] },
          justificativa: { type: 'string', description: 'Uma ou duas frases em português, citando o item do edital; vai para o campo Justificativa da plataforma' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          evidencia: { type: 'string', description: 'O que exatamente foi visto no documento (em português)' },
        },
      },
    },
    observacoes: { type: 'string', description: 'Anomalias para a coordenação, em português. String vazia se não houver.' },
  },
}

const ESQUEMA_VERIFICACAO = {
  type: 'object',
  required: ['vereditos'],
  properties: {
    vereditos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'mantem_nao', 'razao'],
        properties: {
          id: { type: 'string' },
          mantem_nao: { type: 'boolean' },
          razao: { type: 'string', description: 'Em português' },
          justificativa_corrigida: { type: 'string', description: 'Em português; vazio se a original serve' },
        },
      },
    },
  },
}

const listaItens = ITENS.map(i => `- **${i.rotulo}** (item ${i.item}, ${i.valor} pontos) — devolva com id "${i.id}"`).join('\n')

const extraTecnico = CFG.tipo === 'tecnico' ? `

ATENÇÃO ÀS CINCO BONIFICAÇÕES, que são metade dos pontos desta etapa:

As três faixas de público (≥ 30, ≥ 60, ≥ 100) são CUMULATIVAS e se decidem pelo número COMPROVADO na lista de presença — linhas com nome completo e telefone, sem assinatura duplicada —, não pelo número que a equipe digitou no formulário. Conte as linhas. Registre na justificativa o número apurado e o declarado quando divergirem: "48 assinaturas válidas (5 linhas sem telefone desconsideradas), abaixo da faixa de 60" sustenta recurso; "público insuficiente" não sustenta. Menores atestados no rodapé pelo responsável da instituição entram na contagem, e a composição vai registrada ("47 assinaturas + 6 menores = 53"). Se a declaração do Senar substituiu a lista, vale o número que ela atesta.

A independência traz a declaração da própria equipe no formulário — ela é ponto de partida, não prova. Evento do Quadro 1 (Dia de Campo Senar Mais, Encontro de Produtores ATeG, Semana Senar) é do Senar por definição e NÃO é independente, ainda que a equipe declare que sim; logomarca do Senar, do Sistema Faeg ou do Sindicato Rural no card, palestrante técnico do Senar/ATeG no relatório e declaração do Senar no lugar da lista indicam apoio institucional. A logomarca do próprio Faeg Jovem não descaracteriza nada — o edital a EXIGE no card. Havendo contradição entre a declaração e os documentos, prevalecem os documentos, e a justificativa aponta a peça.

A duração de 2 dias ou mais se lê das datas de início e encerramento, confirmadas pelos documentos. Um dia com carga horária longa não é dois dias.` : ''

const instrucao = `Você é avaliador da Banca 01 da Etapa Regional do Concurso Faeg Jovem 2026, conferindo a etapa **${CFG.nomeEtapa}** de uma equipe.

ESCREVA TUDO EM PORTUGUÊS DO BRASIL — justificativas, evidências e observações vão direto para a plataforma do Senar e são lidas pelo grupo avaliado.

ANTES DE QUALQUER COISA, leia a rubrica em ${CFG.rubrica}. Ela remete à rubrica da 1ª Ação Social em /home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md para as exigências dos cinco documentos — LEIA AS DUAS. A régua é a mesma das 173 equipes já avaliadas na ação social, com as diferenças que a rubrica desta etapa aponta; não invente critério próprio, não aperte nem afrouxe.

A diferença que mais engana: o item 5.9.12, que na AÇÃO SOCIAL admite a lista assinada só pelos membros do grupo, NÃO vale nesta etapa. Aqui a lista é do público atendido.

Depois leia o dossiê da equipe, que traz o que o grupo declarou no formulário e o caminho de cada documento anexado.

ABRA COM A FERRAMENTA Read TODAS as imagens listadas no dossiê: as páginas do relatório, as da lista de presença, o card e as fotos. Isto é obrigatório e é onde a conferência acontece — a transcrição de texto de um PDF NÃO mostra assinatura, carimbo, rubrica nem selo gov.br, que são imagem. Não responda sobre um documento sem tê-lo visto; dizer "não foi possível verificar" quando a imagem está ali é falha de conferência, não cautela.

A assinatura do coordenador vale em três formas, todas aceitas pelo item 5.9.8.1 III: rubrica manuscrita digitalizada, selo gov.br (com nome, data e link de validação) e certificado ICP-Brasil.

Documento que o servidor não entrega é falha da PLATAFORMA, nunca da equipe: o dossiê o marca como INDISPONÍVEL. Nesse caso, responda pelo que o conjunto permite e registre a impossibilidade na evidência e nas observações, com confiança baixa.

Os itens a responder são estes, nesta ordem:
${listaItens}${extraTecnico}

Cada resposta é Sim ou Não com uma justificativa de uma ou duas frases citando o item do edital. A justificativa responde ao recurso do grupo em outubro: "card incompleto" não sustenta; "card sem horário de realização (5.9.8.3 I)" sustenta. No Sim, a justificativa diz o que foi conferido — não fica em branco nem vira "atende".

Marque confiança "baixa" quando o documento estiver ilegível ou a decisão ficar na fronteira, e explique na evidência.`

phase('Avaliar')

const resultados = await pipeline(
  EQUIPES,

  (eq) => agent(
    `${instrucao}

Equipe: slug "${eq.slug}" — o nome está na primeira linha do dossiê.
Dossiê: ${eq.dossie}

Ao terminar, ANTES de devolver o resultado estruturado, grave o mesmo conteúdo com Write em ${CFG.saida}/${eq.slug}.json (chaves slug, itens, observacoes), para o trabalho ser recuperável se a execução for interrompida.

Devolva o slug exatamente como "${eq.slug}".`,
    { label: `aval:${eq.slug}`, phase: 'Avaliar', schema: ESQUEMA_AVALIACAO }
  ),

  async (aval, eq) => {
    if (!aval) return null
    const naos = (aval.itens || []).filter(i => i.resposta === 'Não')
    if (naos.length === 0) return { eq, aval, vereditos: [] }

    const lista = naos.map(n => {
      const m = ITENS.find(x => x.id === n.id)
      return `- id "${n.id}" (${m ? m.rotulo + ', item ' + m.item + ', ' + m.valor + ' pontos' : n.id}): "${n.justificativa}" — evidência alegada: ${n.evidencia || '(não informada)'}`
    }).join('\n')

    const v = await agent(
      `Você confere criticamente decisões de OUTRO avaliador da Banca 01 do Concurso Faeg Jovem, na etapa ${CFG.nomeEtapa}. ESCREVA EM PORTUGUÊS DO BRASIL.

Leia a rubrica em ${CFG.rubrica} e a rubrica-base em /home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md, e o dossiê da equipe (slug ${eq.slug}): ${eq.dossie}. ABRA as imagens dos documentos em questão com Read — não confie na descrição do outro avaliador. Assinatura, carimbo e selo gov.br são imagem e não aparecem na transcrição de texto do PDF.

Ele marcou "Não" nestes itens:
${lista}

Sua tarefa é TENTAR REFUTAR cada "Não". Cada um tira pontos da equipe e é o que ela contesta no recurso de outubro, então só se sustenta se o documento realmente descumprir o edital.

Refute quando: o documento atende e o avaliador não viu; a exigência apontada não existe no edital para este tipo de evento; a falha é de forma e não compromete a comprovação; ou a rubrica manda pesar a favor do grupo (coordenada geográfica ausente na foto, link do Instagram que não abre, documento que a plataforma não entrega).

Numa bonificação de público, refute se a contagem do outro avaliador estiver errada — reconte as linhas você mesmo.

Mantenha o "Não" quando o descumprimento é real e verificável na imagem. Cuidado com o inverso: o item 5.9.12 é da AÇÃO SOCIAL e não socorre lista sem público nesta etapa.

Na dúvida, refute — o edital pune documentação divergente, não documentação imperfeita.`,
      { label: `verif:${eq.slug}`, phase: 'Verificar', schema: ESQUEMA_VERIFICACAO }
    )
    return { eq, aval, vereditos: (v && v.vereditos) || [] }
  }
)

const consolidado = resultados.filter(Boolean).map(r => {
  const itens = (r.aval.itens || []).map(it => {
    const v = (r.vereditos || []).find(x => x.id === it.id)
    if (it.resposta === 'Não' && v && v.mantem_nao === false) {
      return { ...it, resposta: 'Sim', justificativa: v.razao || it.justificativa, revisado: 'revertido para Sim na verificação' }
    }
    if (it.resposta === 'Não' && v && v.justificativa_corrigida) {
      return { ...it, justificativa: v.justificativa_corrigida, revisado: 'justificativa ajustada na verificação' }
    }
    return it
  })
  return { slug: r.eq.slug, itens, observacoes: r.aval.observacoes || '' }
})

log(`${CFG.nomeEtapa}: ${consolidado.length} equipes; ${consolidado.reduce((n, e) => n + e.itens.filter(i => i.resposta === 'Não').length, 0)} itens com "Não" após verificação`)

return { etapa: CFG.etapa, avaliacoes: consolidado }
