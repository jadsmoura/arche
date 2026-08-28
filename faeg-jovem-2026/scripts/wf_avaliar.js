export const meta = {
  name: 'faeg-jovem-1as-avaliar',
  description: 'Avaliar a 1ª Ação Social: 5 itens Sim/Não com justificativa e refutação independente de cada "Não"',
  phases: [
    { title: 'Avaliar', detail: 'um agente por equipe, lendo relatório, lista, card, fotos e o campo de divulgação' },
    { title: 'Verificar', detail: 'refutação independente de cada "Não" — o Não é o que vira recurso' },
  ],
}

const RUBRICA = '/home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md'
const SAIDA = '/tmp/claude-0/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/scratchpad/avaliacoes'
const EQUIPES = args

const ITENS = [
  { id: 'relatorio',  rotulo: 'PRIMEIRO EVENTO SOCIAL - RELATÓRIO',                   item: '5.9.8.1' },
  { id: 'lista',      rotulo: 'PRIMEIRO EVENTO SOCIAL - LISTA DE PRESENÇA',           item: '5.9.8.2' },
  { id: 'card',       rotulo: 'PRIMEIRO EVENTO SOCIAL - CARD DE DIVULGAÇÃO',          item: '5.9.8.3' },
  { id: 'fotos',      rotulo: 'PRIMEIRO EVENTO SOCIAL - FOTOS',                       item: '5.9.8.4' },
  { id: 'divulgacao', rotulo: 'PRIMEIRO EVENTO SOCIAL - DIVULGAÇÃO EM REDES SOCIAIS', item: '5.9.8.5' },
]

const ESQUEMA_AVALIACAO = {
  type: 'object',
  required: ['slug', 'itens', 'observacoes'],
  properties: {
    slug: { type: 'string' },
    itens: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object',
        required: ['id', 'resposta', 'justificativa', 'confianca', 'evidencia'],
        properties: {
          id: { type: 'string', enum: ['relatorio', 'lista', 'card', 'fotos', 'divulgacao'] },
          resposta: { type: 'string', enum: ['Sim', 'Não'] },
          justificativa: { type: 'string', description: 'Uma ou duas frases em português, citando o item do edital, que vão para o campo Justificativa da plataforma' },
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

const instrucaoBase = `Você é avaliador da Banca 01 da Etapa Regional do Concurso Faeg Jovem 2026, conferindo a PRIMEIRA AÇÃO SOCIAL de uma equipe.

ESCREVA TUDO EM PORTUGUÊS DO BRASIL — justificativas, evidências e observações vão direto para a plataforma do Senar e são lidas pelo grupo avaliado.

ANTES DE QUALQUER COISA, leia a rubrica em ${RUBRICA}. Ela é a régua e vale para as 173 equipes — não invente critério próprio, não aperte nem afrouxe o que ela diz.

Depois leia o dossiê da equipe, que traz o que o grupo declarou no formulário e o caminho de cada documento anexado.

ABRA COM A FERRAMENTA Read TODAS as imagens listadas no dossiê: as páginas do relatório, as da lista de presença, o card e as fotos. Isto é obrigatório e é onde a conferência acontece de verdade — a transcrição de texto de um PDF NÃO mostra assinatura, carimbo, rubrica nem selo gov.br, que são imagem. Não responda sobre um documento sem tê-lo visto; dizer "não foi possível verificar" quando a imagem está ali é falha de conferência, não cautela.

Atenção especial ao relatório: a assinatura do coordenador pode aparecer como rubrica manuscrita digitalizada OU como selo de assinatura digital (gov.br, com nome, data e link de validação, ou certificado ICP-Brasil). As três formas são aceitas pelo item 5.9.8.1 III.

Responda os cinco itens com Sim ou Não e uma justificativa de uma ou duas frases que cite o item do edital. A justificativa é o que responde ao recurso do grupo em outubro: "card incompleto" não sustenta; "card sem horário de realização (5.9.8.3 I)" sustenta. No Sim, a justificativa diz o que foi conferido — não fica em branco nem vira "atende".

Marque confiança "baixa" quando o documento estiver ilegível ou a decisão ficar na fronteira, e explique na evidência.`

phase('Avaliar')

const resultados = await pipeline(
  EQUIPES,

  (eq) => agent(
    `${instrucaoBase}

Equipe: ${eq.nome} (slug ${eq.slug})
Dossiê: ${eq.dossie}

Ao terminar, ANTES de devolver o resultado estruturado, grave o mesmo conteúdo com a ferramenta Write em ${SAIDA}/${eq.slug}.json (um JSON com as chaves slug, itens, observacoes). Isso torna o trabalho recuperável se a execução for interrompida.

Devolva o slug exatamente como "${eq.slug}".`,
    { label: `aval:${eq.slug}`, phase: 'Avaliar', schema: ESQUEMA_AVALIACAO }
  ),

  async (aval, eq) => {
    if (!aval) return null
    const naos = (aval.itens || []).filter(i => i.resposta === 'Não')
    if (naos.length === 0) return { eq, aval, vereditos: [] }

    const lista = naos.map(n => {
      const meta = ITENS.find(x => x.id === n.id)
      return `- id "${n.id}" (${meta ? meta.rotulo + ', item ' + meta.item : n.id}): "${n.justificativa}" — evidência alegada: ${n.evidencia || '(não informada)'}`
    }).join('\n')

    const v = await agent(
      `Você confere criticamente decisões de OUTRO avaliador da Banca 01 do Concurso Faeg Jovem, na 1ª Ação Social. ESCREVA EM PORTUGUÊS DO BRASIL.

Leia a rubrica em ${RUBRICA} e o dossiê da equipe ${eq.nome}: ${eq.dossie}. ABRA as imagens dos documentos em questão com Read — não confie na descrição do outro avaliador. Lembre que assinatura, carimbo e selo gov.br são imagem e não aparecem na transcrição de texto do PDF.

Ele marcou "Não" nestes itens:
${lista}

Sua tarefa é TENTAR REFUTAR cada "Não". Um "Não" tira 2 pontos da equipe e é o que ela contesta no recurso de outubro, então ele só se sustenta se o documento realmente descumpre o edital.

Refute o "Não" quando: o documento atende e o avaliador não viu; a exigência apontada não existe no edital para ação social (lembre do item 5.9.12, que aceita a assinatura dos próprios envolvidos — membros do grupo, recebedores ou parceiros); a falha é de forma e não compromete a comprovação; ou a rubrica manda pesar a favor do grupo naquele caso (coordenada geográfica ausente na foto, link do Instagram que não abre).

Mantenha o "Não" quando o descumprimento é real e verificável na imagem.

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
      return { ...it, resposta: 'Sim', justificativa: v.razao, revisado: 'revertido para Sim na verificação' }
    }
    if (it.resposta === 'Não' && v && v.justificativa_corrigida) {
      return { ...it, justificativa: v.justificativa_corrigida, revisado: 'justificativa ajustada na verificação' }
    }
    return it
  })
  return { slug: r.eq.slug, nome: r.eq.nome, login: r.eq.login, itens, observacoes: r.aval.observacoes || '' }
})

log(`${consolidado.length} equipes; ${consolidado.reduce((n, e) => n + e.itens.filter(i => i.resposta === 'Não').length, 0)} itens com "Não" após verificação`)

return { avaliacoes: consolidado }
