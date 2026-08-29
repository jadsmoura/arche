"""Confere as justificativas encurtadas antes de qualquer lançamento.

Três perguntas: mudou alguma RESPOSTA? sobrou algum recado interno? o texto
ainda cita o item do edital? Nada vai para a plataforma sem passar por aqui.
"""
import json, glob, re, sys, unicodedata

LIMITE = 200
PROIBIDO = [
    'confianca baixa', 'conferir antes', 'nao lancar', 'decisao do avaliador',
    'ajustada na verificacao', 'ajustado na verificacao', 'revertido para sim',
    'esta banca', 'nao foi possivel', 'registra-se para a coordenacao',
    'para a coordenacao', 'isometria', 'avaliador', 'coordenacao precisa',
]
ITEM = re.compile(r'5\.9\.\d')

def sem(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()

orig = json.load(open('final_77.json'))
curtas = {}
for f in sorted(glob.glob('curtas/lote_*.json')):
    curtas.update(json.load(open(f)))

falhas = []
long_ = sem_item = 0
for slug, itens in curtas.items():
    o = {x['id']: x for x in orig[slug]}
    if len(itens) != len(o):
        falhas.append((slug, '-', f'{len(itens)} itens, esperados {len(o)}')); continue
    for it in itens:
        ref = o.get(it['id'])
        if ref is None:
            falhas.append((slug, it['id'], 'id inexistente no original')); continue
        if it['resposta'] != ref['resposta']:
            falhas.append((slug, it['id'], f"RESPOSTA MUDOU: {ref['resposta']} -> {it['resposta']}"))
        j = it['justificativa'] or ''
        if len(j) > LIMITE:
            long_ += 1; falhas.append((slug, it['id'], f'{len(j)} caracteres'))
        if '[' in j or ']' in j:
            falhas.append((slug, it['id'], 'colchete no texto'))
        for p in PROIBIDO:
            if p in sem(j):
                falhas.append((slug, it['id'], f'termo proibido: "{p}"'))
        if not ITEM.search(j):
            sem_item += 1; falhas.append((slug, it['id'], 'sem citação de item do edital'))

print(f'equipes encurtadas: {len(curtas)} | itens: {sum(len(v) for v in curtas.values())}')
print(f'acima de {LIMITE} caracteres: {long_} | sem item do edital: {sem_item}')
print(f'falhas totais: {len(falhas)}')
for f in falhas[:40]:
    print('  ', ' | '.join(map(str, f)))
sys.exit(1 if falhas else 0)
