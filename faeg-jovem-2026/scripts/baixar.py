import json, os, re, sys, urllib.request, urllib.error, concurrent.futures as cf

BASE = 'https://cdn.sistemafaeg.org.br/cdn/documents/'
RAIZ = 'docs'
inv = json.load(open('inventario_77.json'))

def limpo(s, n=60):
    s = re.sub(r'[^A-Za-z0-9._-]+', '_', s or 'sem-nome').strip('_')
    return s[:n] or 'arquivo'

tarefas = []
for r in inv:
    slug = limpo(r['login'].split('@')[0], 40)
    for campo, lista in r['docs'].items():
        for i, a in enumerate(lista, 1):
            destino = os.path.join(RAIZ, slug, campo, f"{i:02d}_{limpo(a['nome'])}")
            tarefas.append((a['uuid'], destino))

def baixar(t):
    uuid, destino = t
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return ('cache', destino, os.path.getsize(destino))
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    try:
        req = urllib.request.Request(BASE + uuid, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=120) as resp, open(destino, 'wb') as fh:
            dados = resp.read()
            fh.write(dados)
        return ('ok', destino, len(dados))
    except Exception as e:
        return ('erro', destino, str(e)[:120])

print(f'baixando {len(tarefas)} documentos...', file=sys.stderr)
res = []
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for i, r in enumerate(ex.map(baixar, tarefas), 1):
        res.append(r)
        if i % 200 == 0:
            mb = sum(x[2] for x in res if isinstance(x[2], int)) / 1e6
            print(f'  {i}/{len(tarefas)}  ({mb:.0f} MB)', file=sys.stderr)

ok = [r for r in res if r[0] in ('ok', 'cache')]
erros = [r for r in res if r[0] == 'erro']
print(f'baixados: {len(ok)} | erros: {len(erros)} | total {sum(r[2] for r in ok)/1e6:.0f} MB')
for e in erros[:15]: print('  ERRO', e[1], e[2])
json.dump([{'destino': r[1], 'status': r[0]} for r in res], open('baixados.json', 'w'))
