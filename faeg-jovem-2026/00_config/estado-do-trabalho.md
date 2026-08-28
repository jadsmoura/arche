# Estado do trabalho — 28/08/2026, 23h30 UTC

## Interrompido pelo limite semanal de uso da conta

A avaliação do 1º Evento de Saúde parou no meio: **130 dos 173 agentes falharam**
com "You've hit your weekly limit". Não é falha do pipeline nem dos dados — é
cota da conta, e nenhuma nova execução passa até o limite ser reposto.

## O que está pronto

| Etapa | Equipes | Situação |
|---|---|---|
| **1AS** — 1ª Ação Social (77) | 173 de 173 | **Completa.** Avaliada, refutada, isometria, anomalias e documento gerado. Atualizada com as decisões D1–D4 da diretoria. |
| **1ES** — 1º Evento de Saúde (76) | 52 de 173 | Parcial. As 52 têm avaliação + refutação. Documento parcial gerado. |
| **2ES** — 2º Evento de Saúde (79) | 0 de 153 | Documentos baixados e dossiês prontos. Não avaliada. |
| **1ET** — 1º Evento Técnico (82) | 0 de 169 | Documentos baixados e dossiês prontos. Não avaliada. |

Os 6.036 documentos das três etapas restantes já estão baixados, preparados e com
dossiê montado. Quando a cota voltar, o que falta é **rodar as avaliações** — o
trabalho de coleta e preparo não se repete.

## Para retomar

```
cd <scratchpad>
# 1ES: as 121 equipes que faltam (as 52 prontas não se refazem)
python3 montar_args_etapa.py 76 4    # regerar os lotes
# lançar wf_avaliar_etapa.js com cada args_76_N.json, pulando os slugs já em consolidado76/
python3 montar_args_etapa.py 79 4
python3 montar_args_etapa.py 82 4
```

Depois de cada etapa: `consolidar.py` (adaptado à etapa), passe de isometria
(`wf_isometria.js`), e `gerar_docx_etapa.js <saida> <data> <etapa>`.

## O que a 1ES já mostra, nas 52 conferidas

- 43 equipes com os 15 pontos, 9 com 12.
- Os 9 "Não": **5 de lista**, 2 de card, 1 de fotos, 1 de relatório.
- A inversão em relação à ação social é o dado: lá o card respondia por 80% das
  perdas; aqui **a lista é o item que mais reprova**, e pela razão que a rubrica
  desta etapa isolou — a lista do evento de saúde é do **público atendido**, e
  várias equipes anexaram a relação da própria equipe organizadora. O item 5.9.12,
  que socorreria na ação social, não vale aqui.

É um achado que vale levar à reunião de 01/09: se o padrão se confirmar nas 121
restantes, não é falha de conferência — é mal-entendido das equipes sobre o que a
lista de presença deve conter em cada tipo de evento, e isso se resolve por
comunicado, não por avaliação.
