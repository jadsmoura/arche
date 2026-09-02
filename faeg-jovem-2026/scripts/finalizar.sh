#!/bin/bash
# Fecha a conferência: recupera vereditos, consolida e gera o documento.
set -e
cd "$(dirname "$0")"
SAIDA="${1:-Avaliacao_1a_Acao_Social_Banca01.docx}"

echo "== 1. vereditos da refutação (dos transcritos dos agentes)"
python3 extrair_verificacoes.py

echo
echo "== 2. reavaliações do passe de isometria"
echo "   arquivos em reavaliacoes/: $(ls reavaliacoes/*.json 2>/dev/null | wc -l)"

echo
echo "== 3. documento"
node gerar_docx.js "$SAIDA"
python3 reempacotar.py "$SAIDA"

echo
echo "== 4. validação"
SK=/root/.claude/skills/synced/83411a22-f674-4b96-980f-dfbfb3e31f8b_6953197f-36c7-43de-8068-1e6e230ea040/docx
PYTHONPATH=/tmp/pylibs python3 "$SK/scripts/office/validate.py" "$SAIDA" | tail -2
ls -la "$SAIDA"
