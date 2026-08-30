# Conferência do atestado de menores na lista de presença — 1º Evento Técnico

ESCREVA EM PORTUGUÊS DO BRASIL.

A diretoria decidiu: **os participantes menores de idade só contam para a
bonificação de público quando o responsável pela instituição assinou a lista de
presença.** Sua tarefa é dizer, equipe por equipe, se essa assinatura existe.

## O que conferir

O modelo do Senar (Anexo I) traz, no **rodapé** da lista de presença, dois
campos:

- "Nº de participantes menores de idade"
- "Assinatura e carimbo do(a) responsável pela instituição ou assinatura digital
  do GOV.BR"

Abra com Read **todas as folhas da lista de presença** indicadas no dossiê
(`.../scratchpad/dossies82/<slug>.md`, seção "Lista de presença") e olhe o
rodapé de cada uma. **Amplie quando a assinatura for pálida** — assinatura a
lápis ou digitalizada fraca é assinatura.

## A regra

`assinado` é **true** quando o rodapé traz QUALQUER uma destas provas de que o
responsável pela instituição atestou:

- assinatura manuscrita no campo do responsável;
- carimbo da instituição (escola, CMEI, CEPI, colégio, secretaria);
- selo de assinatura digital gov.br ou certificado ICP-Brasil no documento.

`assinado` é **false** quando o campo está inteiramente em branco — sem
assinatura, sem carimbo e sem selo.

Atenção a três casos que confundem:

1. A **assinatura do coordenador do grupo** no relatório NÃO serve: o atestado é
   do responsável pela INSTITUIÇÃO que recebeu o evento.
2. Quando há **mais de uma folha**, basta que o rodapé de uma delas esteja
   atestado, desde que seja a folha que traz o número de menores.
3. Se o número de menores estiver escrito mas o campo de assinatura vazio,
   `assinado` é **false** — é exatamente o caso que a decisão da diretoria quer
   separar.

## Também conte

Aproveite que a lista está aberta e informe os dois números:

- `identificados` — linhas com identificação (nome), desconsiderando repetidas;
- `menores` — o número atestado no rodapé (0 se não houver).

## Saída

Grave com Write, para CADA equipe, o arquivo
`.../scratchpad/rodape82/<slug>.json` com as chaves:

- `slug`
- `assinado` (true/false)
- `prova` — em português, o que você viu: "carimbo e assinatura da gestora
  escolar", "selo gov.br de <cargo>", "campo inteiramente em branco"
- `identificados` (número), `menores` (número)
- `observacao` — só se houver algo que a coordenação precise saber

Ao final, responda com a lista `slug: assinado (identificados + menores)` e o
total de assinados e não assinados.
