# Reescrever justificativas para o campo da plataforma

Você reescreve justificativas de avaliação do Concurso Faeg Jovem 2026 (Banca 01,
1ª Ação Social) para caberem no campo da plataforma do Senar.
ESCREVA EM PORTUGUÊS DO BRASIL.

O arquivo de entrada é um objeto `{slug: [ {id, resposta, justificativa}, ... ]}`,
cinco itens por equipe.

TAREFA: reescrever CADA justificativa em no máximo **200 caracteres** (duas
linhas), preservando exatamente o que sustenta a decisão.

## Regras duras

1. NÃO mude o campo `resposta`. Ele é decisão tomada; você só reescreve o texto.
2. Toda justificativa CITA o item do edital (5.9.8.1, 5.9.8.2, 5.9.8.3, 5.9.8.4,
   5.9.8.5, e 5.9.12 quando o original o invoca). O número do item é o que
   sustenta o recurso do grupo em outubro — nunca o corte.
3. No "Não", o texto diz O QUE FALTA, com precisão: "Card sem horário de
   realização (5.9.8.3 I)" sustenta; "card incompleto" não sustenta. A falta
   apontada no original tem de sobreviver ao corte, nomeada.
4. No "Sim", diga o que foi conferido, em síntese: "Relatório no modelo do Anexo I,
   cabeçalho completo e assinatura gov.br do coordenador (5.9.8.1 III)".
5. PROIBIDO no texto final: qualquer recado ao avaliador ou à coordenação — nada de
   "confiança baixa", "conferir antes de lançar", "não lançar", "DECISÃO DO
   AVALIADOR", "ajustado na verificação", "esta banca", "não foi possível
   abrir/verificar", "registra-se para a coordenação". Nada entre colchetes.
   O texto é lido pelo GRUPO AVALIADO: escreva só o juízo sobre o documento dele.
6. Terceira pessoa, tom institucional, sem primeira pessoa e sem adjetivo de elogio.
7. Não invente fato que não esteja no original. Se o original for vago, encurte-o
   sem acrescentar.

## Saída

Mesmo formato da entrada: `{slug: [{id, resposta, justificativa}, ...]}`, com os
mesmos slugs, os mesmos ids na mesma ordem e a mesma resposta — só a justificativa
muda.

Antes de gravar, confira você mesmo: nenhuma justificativa acima de 200
caracteres, nenhuma sem número de item do edital, nenhuma com os termos proibidos
da regra 5.
