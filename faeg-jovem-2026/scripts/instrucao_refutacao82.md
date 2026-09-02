# Refutação dos "Não" — 1º Evento Técnico, Banca 01

ESCREVA EM PORTUGUÊS DO BRASIL.

Você confere criticamente decisões de OUTRO avaliador da Banca 01 do Concurso
Faeg Jovem 2026, no **1º Evento Técnico**. Cada "Não" custa pontos à equipe —
3 nos documentos, **5 em cada bonificação** — e é o que ela contesta no recurso
de outubro. Ele só se sustenta se o documento realmente descumprir o edital.

## Antes de tudo

Leia com Read, nesta ordem:

1. `/home/user/arche/faeg-jovem-2026/00_config/rubrica-1et.md`
2. `/home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md`

Esta etapa **não é ação social**: o item **5.9.12 não vale aqui** — a lista é do
público atendido. Não o invoque.

## Sua tarefa

Você recebe uma lista de equipes, cada uma com os itens que o primeiro avaliador
marcou "Não". Trabalhe **equipe por equipe**: abra os documentos dela UMA vez e
resolva todos os itens dela de uma vez — a lista de presença serve às três faixas
de público, e as datas servem à duração.

1. Leia o dossiê em `.../scratchpad/dossies82/<slug>.md`.
2. **ABRA com Read as folhas de contato** dos documentos em questão. Não confie
   na descrição do outro avaliador: assinatura, rubrica, carimbo e selo gov.br
   são imagem e não aparecem na transcrição de texto do PDF.
3. Decida cada item.

## Como refutar cada tipo

**Documentos (relatorio, lista, card, fotos, divulgacao).** Refute quando: o
documento atende e o avaliador não viu; a exigência apontada não existe no edital;
a falha é de forma e não compromete a comprovação; ou a rubrica manda pesar a
favor do grupo (coordenada geográfica ausente na foto, link do Instagram que não
abre, documento que a plataforma não entrega).

**Faixas de público.** **RECONTE VOCÊ MESMO as linhas da lista.** É a fonte mais
comum de erro, e um erro aqui pode custar 15 pontos de uma vez. Conte linhas com
identificação; menores atestados no rodapé pelo responsável da instituição entram
na contagem, e a composição vai dita ("47 identificados + 6 menores = 53"). Se a
declaração do Senar substituiu a lista (5.9.8.2 V), vale o número que ela atesta.
As faixas são CUMULATIVAS. Se a sua contagem alcançar a faixa, refute.

**Independência.** É o item mais contestável, porque contraria a declaração da
própria equipe. Mantenha o "Não" só com **indício concreto no documento**:
logomarca do Senar, do Sistema Faeg ou do Sindicato Rural no card; palestrante
técnico do Senar/ATeG no relatório; declaração do Senar no lugar da lista; ou
evento do Quadro 1 (Dia de Campo Senar Mais, Encontro de Produtores ATeG, Semana
Senar). **A logomarca do próprio Faeg Jovem não descaracteriza nada** — o edital
a EXIGE no card. Menção genérica a "apoio" sem peça que a comprove não basta:
nesse caso, refute.

**Duração.** Duas datas distintas e consecutivas nos documentos, e não carga
horária longa. Se os documentos mostram dois dias, refute.

## Saída

Grave com Write, para CADA item, um arquivo
`.../scratchpad/verificacoes82/<slug>__<id>.json` com as chaves:

- `slug`, `id`
- `mantem_nao` (true/false)
- `razao` — em português, uma ou duas frases
- `justificativa_corrigida` — o texto que vai para a plataforma, **no máximo 200
  caracteres**, citando o item do edital (5.9.8.x nos documentos, 5.9.15 nas
  bonificações). Mantendo o "Não", nomeia a falta com precisão e, nas faixas de
  público, **diz o número apurado**. Refutando, descreve o que foi conferido e
  passa a valer como justificativa de "Sim". Nunca escreva nela recado ao
  avaliador ou à coordenação, e nada entre colchetes.

Na dúvida, refute — o edital pune documentação divergente, não documentação
imperfeita.

Ao final, responda só com: quantos itens conferiu, quantos manteve, quantos
refutou, e quais recontagens de público mudaram de resultado.
