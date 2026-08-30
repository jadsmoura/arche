# Critérios internos da coordenação e da presidência

Este arquivo é a única camada que muda com as reuniões de gestão. Edite aqui, não
nos outros arquivos da skill.

Formato de cada entrada: **decisão**, **quem decidiu**, **data**, **efeito no
cálculo**. Sem a data e a origem, ninguém consegue defender a nota no recurso de
outubro.

---

## Status

Nenhuma decisão registrada até o momento (cópia de trabalho aberta em 28/08/2026). As pendências abaixo saíram da leitura
do edital e são pontos em que o texto admite mais de uma interpretação. Leve-as
para a reunião: decididas antes da avaliação, viram regra; decididas depois de
metade das equipes avaliadas, viram retrabalho.

---

## Decisões pendentes

### P1 — Documento faltante: perde pontos ou invalida o evento?

O item 5.9.11 diz que documentação divergente é penalizada com a perda da
pontuação correspondente, e na mesma frase diz que obrigatoriamente todos devem
ser enviados para que o evento seja válido. O item 5.9.14 repete a segunda ideia.

As duas leituras dão resultados muito diferentes. Evento técnico com público de
120, independente, sem o card:

- Leitura A, penalidade proporcional: 40 − 3 = **37 pontos**
- Leitura B, invalidação: **0 pontos**

Enquanto não houver decisão, o script calcula pela leitura A e marca o evento
como `PENDENTE_P1` na saída. Nada é fechado com pendência aberta.

### P2 — Consolidação das notas dos três avaliadores

O item 5.6.1.6 diz que cada critério é analisado por três avaliadores, com
máximo de 50 pontos por critério e 250 no total. Como 3 × 5 × 50 = 750, a
consolidação só pode ser média — mas o edital não escreve isso.

Definir: média aritmética simples, média após descarte do extremo, ou consenso
obrigatório acima de determinada divergência. E definir o limiar de divergência
que dispara reunião entre avaliadores. Sugestão de partida: média simples, com
reunião quando a diferença entre o maior e o menor for superior a 15 pontos no
mesmo critério.

### P3 — Data de corte da Retificação nº 02

A Retificação nº 01 traz data de 24/02/2026. A cópia da Retificação nº 02 em
mãos não mostra data de publicação, e o item VIII dela vincula toda a
flexibilização a "eventos realizados a partir da data de publicação desta
retificação". Sem essa data, não dá para decidir quais eventos com menores entram
no regime flexibilizado.

Confirmar a data com o Senar/AR-GO e registrar aqui. Até lá, o script usa
24/02/2026 como valor provisório e marca `DATA_PROVISORIA` nas saídas afetadas.

**Indício levantado em 28/08/2026** (evidência, não decisão): os metadados do PDF
da Retificação nº 02 registram criação em **15/05/2026 14:41 (-03)**. Metadado de
criação não é data de publicação e não sustenta indeferimento, mas sugere que a
data provisória está quase três meses adiantada. O efeito é grande: com corte em
24/02, quase todos os eventos do ano entram no regime flexibilizado; com corte em
15/05, os do primeiro lote de envio (até 28/05) ficam quase todos de fora. Não
altere `DATA_RETIFICACAO_02` no script antes da confirmação do Senar/AR-GO.

### P4 — RESOLVIDA pela diretoria em 30/08/2026 (decisão D5)

**Os menores só entram na contagem de público quando o responsável pela
instituição atestou a lista de presença.** Vale como atestado a assinatura
manuscrita no campo do responsável, o carimbo da instituição ou o selo gov.br;
campo inteiramente em branco não vale, ainda que o número de menores esteja
escrito. A assinatura do coordenador do GRUPO não serve — quem atesta é a
instituição que recebeu o evento.

Conferência feita nas 105 equipes do 1º Evento Técnico cuja faixa dependia
disso: **79 com atestado assinado, 26 sem**. A decisão **não alterou nenhuma
pontuação**, porque nas 26 sem assinatura o campo de menores está em branco
também — não havia menor sendo somado. A régua já vinha sendo aplicada de fato
antes de estar escrita.

O texto original da pendência fica abaixo, como registro do que se decidiu.

### P4 (texto original) — Contagem de público quando há menores na lista

O item 5.9.8.2 IV manda que menores não sejam identificados na lista; o número
deles é atestado no rodapé pelo responsável da instituição. Para a bonificação
de público do evento técnico, esse número entra na contagem?

Somar faz sentido, já que a bonificação mede alcance. Mas isso precisa estar
escrito, porque muda a faixa de bônus em evento escolar — que é justamente o
formato mais comum no tema saúde. Enquanto não houver decisão, o script **soma**
e registra a composição da contagem.

### P5 — Evento fora do Quadro 1

O item 5.9.7 diz que eventos diferentes dos listados serão tratados pontualmente
pela coordenação. Definir quem decide a classificação (técnico, saúde ou social),
em que prazo, e se a decisão é registrada por escrito. Sem registro, equipes
comparáveis acabam classificadas de modo diferente por avaliadores diferentes.

### P6 — Peso relativo entre os cinco critérios do projeto

O edital trata os cinco critérios como iguais, 50 pontos cada. Se a presidência
quiser sinalizar prioridade — por exemplo, valorizar resultados mensuráveis
acima de formatação —, isso **não pode** virar peso diferente, porque
contrariaria o edital e é recurso ganho. O caminho legítimo é apertar os
descritores de faixa em `rubrica-projeto.md`, mantendo o teto de 50 em cada.

Registre aqui a orientação de ênfase; a tradução em descritores vai para a
rubrica.

---

## Como registrar uma decisão nova

Copie o bloco abaixo para a seção "Decisões registradas" e preencha:

```
### D<n> — <título curto>

Decidido por: <nome/instância>
Data: <AAAA-MM-DD>
Origem: <reunião, ofício, e-mail>

Decisão: <o que passa a valer, em uma ou duas frases>

Efeito no cálculo: <o que muda no script, na rubrica ou no fluxo>
Aplica-se a: <todas as equipes | equipes avaliadas a partir de tal data>
```

Se uma decisão nova mudar cálculo já aplicado, **reprocesse todas as equipes**.
Aplicar critério novo só às equipes restantes destrói a isometria, que é o
motivo de a skill existir.

Se uma decisão contrariar o edital, não a implemente em silêncio. Avise o
usuário, aponte o item do edital em conflito e pergunte como proceder.

---

## Decisões registradas

### D1 — A lista de presença não precisa estar assinada

Decidido por: Diretoria do Concurso
Data: 2026-08-28
Origem: orientação repassada à Banca 01

Decisão: a assinatura do participante **deixa de ser exigência** do item 5.9.8.2.
A lista se confere pelo conteúdo — as pessoas relacionadas —, não pela existência
de rubrica manuscrita.

Efeito no cálculo: cai a hipótese de "Não" por lista passada a limpo, por letras
iguais ou por lista digitada sem assinatura. Lista preenchida por digitação passa
a atender. Segue valendo o "Não" da lista **inteiramente em branco** — ali não há
conteúdo nenhum a conferir, não é questão de assinatura.
Aplica-se a: todas as equipes, em todas as etapas. **Reprocessar** o que foi
decidido pela régua anterior.

### D2 — Sobrenome basta na lista; rubrica e assinatura eletrônica bastam no relatório

Decidido por: Diretoria do Concurso
Data: 2026-08-28
Origem: orientação repassada à Banca 01

Decisão: na **lista de presença**, um sobrenome vale como identificação completa
do participante. No **relatório**, valem a rubrica e a assinatura eletrônica.

Efeito no cálculo: linha com nome abreviado ou só sobrenome passa a contar. No
relatório, confirma o que a régua já praticava (rubrica manuscrita, gov.br e
certificado ICP-Brasil).
Aplica-se a: todas as equipes, em todas as etapas.

### D3 — Documento não inserido zera a pontuação do evento

Decidido por: Diretoria do Concurso
Data: 2026-08-28
Origem: orientação repassada à Banca 01

Decisão: quando o grupo **não insere** o link, o card, o relatório ou a lista de
presença, a pontuação do evento é **zerada**, e o motivo da zeragem deve ficar
explicado.

Efeito no cálculo: **resolve a pendência P1** para o caso da ausência — prevalece
a segunda parte do item 5.9.11 ("obrigatoriamente todos devem ser enviados para
que o evento seja válido"). A zeragem incide sobre o EVENTO, não sobre o item.
Aplica-se a: todas as equipes, em todas as etapas.

**Documento que a plataforma não entrega não é documento não inserido.** Nos
quatro casos de erro 500 do CDN (lista de Goiás, relatório de Padre Bernardo,
relatório de Itajá e card de Montividiu do Norte) o grupo inseriu; quem falha é o
servidor. Esses itens seguem pendentes, e não zerados — ver
`pendencias-plataforma.md`.

### D4 — Card sem qualquer das informações do 5.9.8.3 não pontua

Decidido por: Diretoria do Concurso
Data: 2026-08-28
Origem: orientação repassada à Banca 01, com o exemplo do card de Vianópolis

Decisão: o item 5.9.8.3 I se lê ao pé da letra. O card deve trazer nome do
evento, local, data, horário, palestrantes quando houver e a logomarca oficial do
grupo; nas ações com arrecadação, também data de início e término da arrecadação,
local e horário de recebimento. Faltando qualquer uma, **não há ponto**.

Efeito no cálculo: confirma a régua que a banca vinha aplicando, inclusive no
caso citado (campanha de arrecadação de Vianópolis, card sem horário).
Aplica-se a: todas as equipes, em todas as etapas.

---

## Pendência aberta por esta rodada

### P7 — A zeragem da D3 alcança o documento INCOMPLETO?

A D3 trata do documento **não inserido**. A D4 trata do card **inserido e
incompleto** e diz "não tem ponto" — leitura natural: o card perde os seus pontos,
e o evento conserva os demais.

Se a intenção for outra — documento que não atende equivale a documento não
inserido, e portanto zera o evento —, o efeito é grande: na 1ª Ação Social, as 31
equipes com card irregular passariam de 8 para **0 pontos**.

Enquanto não houver resposta, o cálculo segue a leitura natural (o item perde os
seus pontos) e as equipes afetadas ficam marcadas na saída. As respostas Sim/Não
de cada item **não mudam** com essa definição — muda só a soma.
