# Faeg Jovem 2026 — Etapa Regional · área de avaliação

Espaço de trabalho da avaliação dos grupos do Concurso Faeg Jovem, 8ª Edição/2026.
A régua vem da skill `avaliacao-faeg-jovem`; esta pasta guarda a configuração, as
normas e as saídas do trabalho.

## Dado pessoal não entra no repositório

`01_equipes/`, `02_saidas/` e `00_config/equipes.csv` estão no `.gitignore`, e a
razão é substantiva, não burocrática: as listas de presença trazem nome completo
e telefone, o Anexo I da Retificação nº 02 traz CPF, RG e data de nascimento de
menores, e boa parte dos eventos acontece em escola. A Retificação vincula o
programa ao ECA, à LGPD e à Lei nº 15.211/2025. **O acervo das equipes fica na
máquina de trabalho ou na pasta institucional, nunca versionado.**

O que pode ser versionado: as normas, os critérios internos, e números agregados
sem identificação de pessoa.

## Estrutura

```
faeg-jovem-2026/
├── 00_config/
│   ├── criterios_internos.md   decisões da coordenação (cópia de trabalho)
│   ├── equipes.csv             cadastro das equipes  (fora do git)
│   └── dados_evento_modelo.txt modelo do dados.txt de cada evento
├── 00_normas/
│   ├── edital-etapa-regional-2026.pdf
│   ├── comunicado-01-encontros-regionais.pdf
│   ├── retificacao-02.pdf
│   └── conferencia-normas.md   o que foi conferido contra os PDFs, e o que falta
├── 01_equipes/                 acervo das equipes    (fora do git)
└── 02_saidas/                  saídas do validador   (fora do git)
```

A convenção de nomes de pasta e o formato do `dados.txt` estão em
`references/estrutura-de-pastas.md` da skill. Ela não é preciosismo: o validador
não roda sem ela, e normalizar depois custa mais do que impor antes.

## Rodar o validador

```
SK=~/.claude/skills/.../avaliacao-faeg-jovem

# diagnóstico de nomenclatura e documentos, sem calcular pontos
python3 "$SK/scripts/validar.py" --raiz . --checar-estrutura

# validação completa: conformidade, pontos automáticos e pendências humanas
python3 "$SK/scripts/validar.py" --raiz . --saida 02_saidas
```

Saídas: `conformidade_eventos.csv` (uma linha por evento), `pontos_automaticos.csv`
(Atividades 3, 4 e 5 por equipe) e `pendencias_humanas.md` — **leia este último
primeiro**, é ele que diz onde o tempo de leitura rende.

Testado em 28/08/2026 com acervo sintético: as duas passadas rodam, o
arredondamento dos 75% do LíderAgro confere com o exemplo do item 5.8.4.2.1, e a
tabela do Comunicado nº 01 confere. Arquivo de 0 byte é tratado como documento
ausente, o que é o comportamento desejado.

## O que ainda depende de decisão

As seis pendências de `00_config/criterios_internos.md` (P1 a P6) saíram da
leitura do edital, não de dúvida sobre ele: são pontos em que o texto admite mais
de uma interpretação. Decididas antes da avaliação, viram regra; decididas com
metade das equipes avaliadas, viram reprocessamento de todas — aplicar critério
novo só às restantes destrói a isometria.

Prioridade: **P1** (documento faltante penaliza ou invalida o evento) e **P2**
(como consolidar as notas dos três avaliadores) travam o fechamento de qualquer
nota. **P3** (data da Retificação nº 02) tem indício novo registrado lá.
