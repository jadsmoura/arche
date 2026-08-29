# Reescrever justificativas — 1º EVENTO DE SAÚDE

Você reescreve justificativas de avaliação do Concurso Faeg Jovem 2026 (Banca 01,
**1º Evento de Saúde**) para caberem no campo da plataforma do Senar.
ESCREVA EM PORTUGUÊS DO BRASIL.

O arquivo de entrada é um objeto `{slug: [ {id, resposta, justificativa}, ... ]}`,
cinco itens por equipe.

TAREFA: reescrever CADA justificativa em no máximo **200 caracteres** (duas
linhas), preservando exatamente o que sustenta a decisão.

## Regras duras

1. NÃO mude o campo `resposta`. Ele é decisão tomada; você só reescreve o texto.
   Resposta `Pendente` também se preserva.
2. Toda justificativa CITA o item do edital (5.9.8.1, 5.9.8.2, 5.9.8.3, 5.9.8.4
   ou 5.9.8.5). O número do item é o que sustenta o recurso do grupo em outubro —
   nunca o corte.
3. No "Não", o texto diz O QUE FALTA, com precisão: "Card sem horário de
   realização (5.9.8.3 I)" sustenta; "card incompleto" não sustenta. A falta
   apontada no original tem de sobreviver ao corte, nomeada.
4. No "Sim", diga o que foi conferido, em síntese: "Relatório no modelo do Anexo I,
   cabeçalho completo e assinatura gov.br do coordenador (5.9.8.1 III)".
5. **ATENÇÃO — esta etapa NÃO é ação social.** O item 5.9.12, que admite lista
   assinada só pelos membros do grupo, **não vale aqui**: a lista é do público
   atendido. Não introduza esse item em nenhuma justificativa, e se o texto
   original o mencionar, não repita a menção.
6. PROIBIDO no texto final: qualquer recado ao avaliador ou à coordenação — nada de
   "confiança baixa", "conferir antes de lançar", "não lançar", "DECISÃO DO
   AVALIADOR", "ajustado na verificação", "esta banca", "não foi possível
   abrir/verificar", "registra-se para a coordenação". Nada entre colchetes.
   O texto é lido pelo GRUPO AVALIADO: escreva só o juízo sobre o documento dele.
7. Terceira pessoa, tom institucional, sem primeira pessoa e sem adjetivo de elogio.
8. Não invente fato que não esteja no original. Se o original for vago, encurte-o
   sem acrescentar.

## Saída

Mesmo formato da entrada: `{slug: [{id, resposta, justificativa}, ...]}`, com os
mesmos slugs, os mesmos ids na mesma ordem e a mesma resposta — só a justificativa
muda.

Antes de gravar, confira você mesmo: nenhuma justificativa acima de 200
caracteres, nenhuma sem número de item do edital, nenhuma com os termos proibidos
da regra 6, nenhuma citando o 5.9.12.
