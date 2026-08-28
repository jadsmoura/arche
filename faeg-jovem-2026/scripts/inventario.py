import json, re, urllib.parse, collections

MAPA = {2499: 'relatorio', 2501: 'lista', 2500: 'card', 2502: 'fotos', 2503: 'instagram',
        2506: 'nome_acao', 2507: 'beneficiados', 2504: 'participantes', 2511: 'data_inicio',
        2509: 'data_fim', 2512: 'hora_inicio', 2508: 'hora_fim', 2505: 'local', 2510: 'municipio'}

def arquivos(resp):
    """Uma resposta-arquivo traz N documentos separados por ';'."""
    if not resp: return []
    out = []
    for parte in resp.split(';'):
        parte = parte.strip()
        if 'cdn/documents/' not in parte: continue
        uuid = parte.split('cdn/documents/')[1].split('?')[0].strip()
        nome = ''
        if 'fileName=' in parte:
            nome = urllib.parse.unquote(parte.split('fileName=')[1])
        out.append({'uuid': uuid, 'nome': nome, 'ext': (nome.rsplit('.', 1)[-1].lower() if '.' in nome else '')})
    return out

d = json.load(open('respostas_77.json'))
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

json.dump(inv, open('inventario_77.json', 'w'), ensure_ascii=False, indent=1)

print('grupos:', len(inv))
tot = collections.Counter(); vazios = collections.Counter(); exts = collections.Counter()
for r in inv:
    for k in ['relatorio', 'lista', 'card', 'fotos']:
        n = len(r['docs'].get(k, []))
        tot[k] += n
        if n == 0: vazios[k] += 1
        for a in r['docs'].get(k, []): exts[a['ext']] += 1
    if not r['campos'].get('instagram'): vazios['instagram'] += 1
print('documentos por campo:', dict(tot), '| total', sum(tot.values()))
print('grupos SEM o campo:', dict(vazios))
print('extensões:', dict(exts.most_common()))
