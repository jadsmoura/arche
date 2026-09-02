# Como a conferência foi feita

Encadeamento dos scripts, na ordem em que rodam. Todos leem e escrevem no
diretório de trabalho (fora do repositório — o acervo tem dado pessoal).

| Script | O que faz |
|---|---|
| `fj.py` | Cliente de LEITURA da plataforma. Só faz GET, exceto o login. A senha entra por variável de ambiente e não é gravada em lugar nenhum. |
| `coletar.py` | Puxa as respostas das 173 equipes da etapa 77 (`getRespostasByUsuario`). |
| `inventario.py` | Separa os documentos de cada campo — a resposta traz N arquivos separados por `;`. |
| `baixar.py` | Baixa os 1.899 documentos do CDN, organizados por equipe e campo. |
| `preparar.py` | Extrai texto dos PDFs, lê EXIF das fotos e reduz as imagens para leitura. |
| `rasterizar_faltantes.py` | Rasteriza **todo** PDF de relatório, lista e card. |
| `dossies.py` | Monta um dossiê por equipe: o que o grupo declarou + o caminho de cada imagem a abrir. |
| `wf_avaliar.js` | O workflow: um agente por equipe aplica a rubrica, e cada "Não" passa por um agente independente que tenta refutá-lo. |
| `gerar_docx.js` | Monta o documento Word, uma equipe por página. |
| `reempacotar.py` | Reordena o ZIP do .docx. |

## Duas decisões que mudaram o resultado

**Todo PDF é rasterizado, não só o digitalizado.** A primeira versão só gerava
imagem dos PDFs sem texto extraível. Só que **assinatura, carimbo, rubrica e
selo gov.br são imagem dentro do PDF** — a extração de texto do relatório de
Abadiânia termina em "Assinatura do coordenador:" e não mostra o selo gov.br que
está logo abaixo. Eram **119 PDFs** de relatório e lista nessa situação: sem a
correção, essas equipes seriam reprovadas no item 5.9.8.1 por assinatura que
está no documento.

**A contagem de público não vem da lista.** O número de participantes é o que o
grupo digitou no formulário. Na ação social isso não altera nota — não há
bonificação por público —, mas a divergência entre o declarado e o que a lista
mostra é registrada nas observações.

## Reproduzir

```
export FJ_EMAIL=...  FJ_SENHA=...
python3 coletar.py && python3 inventario.py && python3 baixar.py
PYTHONPATH=/tmp/pylibs python3 preparar.py
PYTHONPATH=/tmp/pylibs python3 rasterizar_faltantes.py
python3 dossies.py
# o workflow roda pela ferramenta Workflow, com args = lista de equipes
node gerar_docx.js saida.docx && python3 reempacotar.py saida.docx
```

Dependências fora da imagem padrão: `pymupdf`, `pillow`, `pillow-heif`,
`pdfminer.six`, `defusedxml`, `lxml` (Python) e `docx` (npm).
