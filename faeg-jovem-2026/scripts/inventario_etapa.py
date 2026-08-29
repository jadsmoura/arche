"""Inventário de documentos de uma etapa. Uso: inventario_etapa.py <id>"""
import json, sys, urllib.parse, collections

ETAPA = sys.argv[1]

# mapa de campos por etapa: id da pergunta -> chave
MAPAS = {
 '82': {2485:'relatorio',2486:'lista',2487:'card',2488:'fotos',2492:'instagram',2490:'independente',
        2493:'nome_acao',2494:'data_inicio',2497:'data_fim',2491:'participantes',2496:'hora_inicio',
        2495:'hora_fim',2489:'local',2498:'municipio'},
 '76': {2575:'relatorio',2576:'lista',2570:'card',2577:'fotos',2578:'instagram',2579:'nome_acao',
        2580:'participantes',2572:'data_inicio',2581:'data_fim',2583:'hora_inicio',2582:'hora_fim',
        2573:'local',2574:'municipio'},
 '79': {2598:'relatorio',2604:'lista',2599:'card',2600:'fotos',2602:'instagram',2601:'nome_acao',
        2603:'beneficiados',2605:'participantes',2606:'data_inicio',2607:'data_fim',2611:'hora_inicio',
        2610:'hora_fim',2608:'local',2609:'municipio'},
 '78': {2588:'relatorio',2594:'lista',2590:'card',2595:'fotos',2584:'instagram',2592:'nome_acao',
        2596:'beneficiados',2591:'participantes',2593:'data_inicio',2587:'data_fim',2585:'hora_inicio',
        2589:'hora_fim',2597:'local',2586:'municipio'},
}
MAPA = MAPAS[ETAPA]

def arquivos(resp):
    if not resp: return []
    out = []
    for parte in resp.split(';'):
        parte = parte.strip()
        if 'cdn/documents/' not in parte: continue
        uuid = parte.split('cdn/documents/')[1].split('?')[0].strip()
        nome = urllib.parse.unquote(parte.split('fileName=')[1]) if 'fileName=' in parte else ''
        out.append({'uuid': uuid, 'nome': nome, 'ext': (nome.rsplit('.',1)[-1].lower() if '.' in nome else '')})
    return out

d = json.load(open(f'respostas_{ETAPA}.json'))
inv = []
for g in d:
    reg = {'login': g['login'], 'nome': g['nome'], 'id': g['id'], 'campos': {}, 'docs': {}}
    for r in g['respostas']:
        chave = MAPA.get(r['pergunta']['id'])
        if not chave: continue
        val = r.get('resposta')
        if r['pergunta']['tipo'] == 'arquivo':
            reg['docs'][chave] = arquivos(val)
        else:
            reg['campos'][chave] = (val or '').strip()
    inv.append(reg)

json.dump(inv, open(f'inventario_{ETAPA}.json','w'), ensure_ascii=False, indent=1)
tot = collections.Counter(); vaz = collections.Counter(); exts = collections.Counter()
for r in inv:
    for k in ['relatorio','lista','card','fotos']:
        n = len(r['docs'].get(k, [])); tot[k] += n
        if n == 0: vaz[k] += 1
        for a in r['docs'].get(k, []): exts[a['ext']] += 1
    if not r['campos'].get('instagram'): vaz['instagram'] += 1
print(f'etapa {ETAPA}: {len(inv)} grupos | documentos {dict(tot)} = {sum(tot.values())}')
print(f'  campos sem conteúdo: {dict(vaz) or "nenhum"}')
print(f'  extensões: {dict(exts.most_common(8))}')
