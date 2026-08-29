# Conferência da 2ª Ação Social — Banca 01, Faeg Jovem 2026

ESCREVA TUDO EM PORTUGUÊS DO BRASIL — o texto vai para a plataforma do Senar e é
lido pelo grupo avaliado.

## Antes de tudo

Leia com Read as duas rubricas, nesta ordem:

1. `/home/user/arche/faeg-jovem-2026/00_config/rubrica-2as.md`
2. `/home/user/arche/faeg-jovem-2026/00_config/rubrica-1as.md`

A régua é a mesma das 173 equipes já avaliadas na 1ª Ação Social. Não invente
critério próprio, não aperte nem afrouxe.

**O ponto que mais engana:** esta é uma AÇÃO SOCIAL, e o item **5.9.12 VALE
aqui** — a lista pode estar assinada pelos próprios envolvidos (membros do
grupo, pessoas atendidas ou parceiros), e lista composta só por integrantes do
grupo **não é defeito**.

## Para cada equipe do lote, uma de cada vez

1. Leia o dossiê em `.../scratchpad/dossies78/<slug>.md`.
2. **ABRA com Read TODAS as folhas de contato** que o dossiê indicar (as linhas
   "ABRA a folha abaixo"). Isto é obrigatório: assinatura, rubrica, carimbo e
   selo gov.br são IMAGEM e não aparecem na transcrição de texto do PDF. Não
   responda sobre um documento sem tê-lo visto — dizer "não foi possível
   verificar" com a imagem à mão é falha de conferência, não cautela.
3. Responda os cinco itens com Sim ou Não:
   - `relatorio` (item 5.9.8.1, 2 pontos)
   - `lista` (item 5.9.8.2, 2 pontos)
   - `card` (item 5.9.8.3, 2 pontos)
   - `fotos` (item 5.9.8.4, 2 pontos)
   - `divulgacao` (item 5.9.8.5, 2 pontos)
4. Grave com Write em `.../scratchpad/avaliacoes78/<slug>.json`, com as chaves
   `slug`, `itens` (lista de `{id, resposta, justificativa, confianca,
   evidencia}`) e `observacoes`.

## A justificativa

No máximo **200 caracteres**, duas linhas, citando o número do item do edital.
Ela é o que responde ao recurso do grupo em outubro: "card incompleto" não
sustenta; "card sem horário de realização (5.9.8.3 I)" sustenta. No "Sim", diga
em síntese o que foi conferido.

**Nunca** escreva recado ao avaliador ou à coordenação no campo justificativa —
nada de "confiança baixa", "conferir antes de lançar", "não foi possível
verificar", nada entre colchetes. Isso vai em `evidencia` ou em `observacoes`.

## Regras que decidem casos concretos

A assinatura do coordenador vale em três formas (5.9.8.1 III): rubrica
manuscrita digitalizada, selo gov.br com nome/data/link de validação e
certificado ICP-Brasil.

Documento marcado **INDISPONÍVEL** no dossiê é falha da PLATAFORMA, nunca da
equipe: responda pelo que o conjunto permite, registre a impossibilidade em
`evidencia` e `observacoes`, e marque `confianca` "baixa".

Marque `confianca` "baixa" quando o documento estiver ilegível ou a decisão
ficar na fronteira.

## O campo observacoes

Não vai para a plataforma. Registre ali o que a coordenação precisa ver:
documentação que aponta para outro evento ou outra data (5.9.11), evento fora da
janela de **03/09/2025 a 27/08/2026**, ação cuja natureza não seja claramente
social (5.9.7), divergência entre o público declarado e o comprovado, e falhas
da plataforma.

## Resposta final

Só isto: quantas equipes gravou, quantos "Não" ao todo e em que itens.
