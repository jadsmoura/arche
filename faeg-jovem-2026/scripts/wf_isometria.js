export const meta = {
  name: 'faeg-jovem-1as-isometria',
  description: 'Conferir se a mesma régua foi aplicada às 173 equipes, critério a critério, e reavaliar as equipes que o passe apontar',
  phases: [
    { title: 'Isometria', detail: 'um agente por critério, revendo as 173 decisões daquele critério' },
    { title: 'Reavaliar', detail: 'reabre a equipe apontada e decide com a prova à vista' },
    { title: 'Anomalias', detail: 'lê as observações das 173 equipes e separa o que a coordenação precisa decidir' },
  ],
}

const RUBRICA = '/home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md'
const DOSSIES = '/tmp/claude-0/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/scratchpad/dossies'
const SAIDA = '/tmp/claude-0/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/scratchpad/reavaliacoes'

// args = { criterios: [{id, rotulo, item, linhas: "slug | resposta | justificativa\n..."}] }
const CRITERIOS = args.criterios

const ESQUEMA_ISOMETRIA = {
  type: 'object',
  required: ['criterio', 'diagnostico', 'suspeitas'],
  properties: {
    criterio: { type: 'string' },
    diagnostico: { type: 'string', description: 'Em português: a régua foi aplicada igual? Onde escorregou?' },
    suspeitas: {
      type: 'array',
      description: 'Equipes cuja decisão destoa das demais em situação comparável. Vazio se a régua está coerente.',
      items: {
        type: 'object',
        required: ['slug', 'problema', 'comparar_com'],
        properties: {
          slug: { type: 'string' },
          problema: { type: 'string', description: 'Em português' },
          comparar_com: { type: 'array', items: { type: 'string' }, description: 'slugs de equipes em situação comparável que receberam decisão diferente' },
        },
      },
    },
  },
}

const ESQUEMA_REAVALIACAO = {
  type: 'object',
  required: ['slug', 'id', 'resposta', 'justificativa', 'mudou'],
  properties: {
    slug: { type: 'string' },
    id: { type: 'string' },
    resposta: { type: 'string', enum: ['Sim', 'Não'] },
    justificativa: { type: 'string', description: 'Em português, citando o item do edital' },
    mudou: { type: 'boolean', description: 'true se a resposta difere da que constava antes' },
    razao: { type: 'string', description: 'Em português: por que manteve ou mudou' },
  },
}

phase('Isometria')

const achados = await parallel(CRITERIOS.map(crit => () => agent(
  `Você confere a ISOMETRIA de uma banca do Concurso Faeg Jovem: se a mesma régua foi aplicada da primeira à última equipe. ESCREVA EM PORTUGUÊS DO BRASIL.

Critério sob análise: **${crit.rotulo}** (item ${crit.item} do edital).
Régua que deveria valer: leia ${RUBRICA}.

As ${crit.n} decisões deste critério, em todas as equipes, estão em ${crit.arquivo} — LEIA esse arquivo inteiro com Read. O formato de cada linha é "slug | resposta | justificativa".

Procure RÉGUA TORTA, não erro isolado:
- equipes reprovadas por um defeito que passou em outras;
- equipes aprovadas apesar de um defeito que reprovou outras;
- justificativas que descrevem a MESMA situação e terminam em respostas diferentes;
- justificativas vagas demais para sustentar recurso ("documento incompleto", "não atende", "atende ao edital" sem dizer o que foi conferido).

Não abra documento nenhum: sua matéria-prima é a coerência entre as decisões escritas. Para cada suspeita, nomeie o slug e as equipes comparáveis que receberam tratamento diferente — é essa comparação que justifica reabrir o caso.

Seja criterioso: apontar tudo é o mesmo que não apontar nada. Se a régua estiver coerente, diga isso e devolva a lista de suspeitas vazia.`,
  { label: `isometria:${crit.id}`, phase: 'Isometria', schema: ESQUEMA_ISOMETRIA }
)))

const validos = achados.filter(Boolean)
const paraReavaliar = []
validos.forEach((a, i) => {
  const crit = CRITERIOS[i]
  ;(a.suspeitas || []).forEach(s => paraReavaliar.push({ ...s, criterio: crit }))
})

log(`isometria: ${paraReavaliar.length} decisões a reabrir em ${validos.length} critérios`)

phase('Reavaliar')

const reavaliadas = await parallel(paraReavaliar.map(s => () => agent(
  `Você reabre UMA decisão de avaliação do Concurso Faeg Jovem, na 1ª Ação Social, porque a conferência de isometria apontou que ela pode destoar das demais. ESCREVA EM PORTUGUÊS DO BRASIL.

Equipe: ${s.slug}
Critério: ${s.criterio.rotulo} (item ${s.criterio.item})
Por que foi reaberta: ${s.problema}
Equipes em situação comparável que receberam decisão diferente: ${(s.comparar_com || []).join(', ') || '(não informado)'}

Leia a rubrica em ${RUBRICA} e o dossiê em ${DOSSIES}/${s.slug}.md. ABRA com Read as imagens do documento em questão — assinatura, carimbo e selo gov.br são imagem e não aparecem na transcrição de texto do PDF.

Decida de novo, com a prova à vista e a régua na mão. Você pode manter a decisão anterior: o passe de isometria levanta suspeita, não veredito. O que não pode é a decisão ficar diferente da das equipes comparáveis sem uma razão que esteja no documento.

Ao terminar, grave o resultado com Write em ${SAIDA}/${s.slug}__${s.criterio.id}.json, com as chaves slug, id, resposta, justificativa, mudou e razao. O campo "id" é "${s.criterio.id}".`,
  { label: `reaval:${s.slug}/${s.criterio.id}`, phase: 'Reavaliar', schema: ESQUEMA_REAVALIACAO }
)))

phase('Anomalias')

const ESQUEMA_ANOMALIAS = {
  type: 'object',
  required: ['grupos', 'sintese'],
  properties: {
    sintese: { type: 'string', description: 'Em português: o quadro geral do que os avaliadores levantaram' },
    grupos: {
      type: 'array',
      description: 'Anomalias agrupadas por natureza, da mais grave para a menos',
      items: {
        type: 'object',
        required: ['tema', 'gravidade', 'equipes', 'descricao', 'encaminhamento'],
        properties: {
          tema: { type: 'string' },
          gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          equipes: { type: 'array', items: { type: 'string' }, description: 'slugs' },
          descricao: { type: 'string', description: 'Em português: o que se repete nesses casos' },
          encaminhamento: { type: 'string', description: 'Em português: o que a coordenação precisa decidir ou fazer' },
        },
      },
    },
  },
}

const anomalias = await agent(
  `Você organiza, para a coordenação do Concurso Faeg Jovem, o que os avaliadores da Banca 01 anotaram fora das cinco respostas da 1ª Ação Social. ESCREVA EM PORTUGUÊS DO BRASIL.

Leia com Read o arquivo ${args.observacoes} — ele traz, por equipe, o campo "observações" de cada avaliação. São anotações que NÃO alteraram as respostas, mas que alguém precisa ver.

Agrupe por NATUREZA, não por equipe, e ordene da mais grave para a menos. O que interessa à coordenação:
- documentação que aponta para OUTRO evento ou outra data (item 5.9.11);
- ação cuja natureza não é claramente social e cai no item 5.9.7 (evento fora do Quadro 1, tratado pontualmente pela coordenação);
- evento realizado fora da janela de 03/09/2025 a 28/05/2026;
- divergência entre o público declarado no formulário e o comprovado nos documentos;
- falhas da plataforma (arquivo que não abre) — nunca falha da equipe;
- defeitos de forma repetidos que talvez mereçam orientação às equipes no próximo ciclo.

Descarte o que for elogio ou constatação de que está tudo coerente: a coordenação não precisa ler que 90 equipes estão em ordem. Se um tema tiver muitas equipes, diga quantas e liste os slugs.

Gravidade "alta" é o que pode mudar pontuação ou exigir decisão antes do resultado preliminar de 09/10.`,
  { label: 'anomalias', phase: 'Anomalias', schema: ESQUEMA_ANOMALIAS }
)

return {
  isometria: validos.map((a, i) => ({ criterio: CRITERIOS[i].id, diagnostico: a.diagnostico, suspeitas: (a.suspeitas || []).length })),
  reavaliadas: reavaliadas.filter(Boolean),
  anomalias,
}
