"""Confere minha consolidação por arquivos contra o retorno oficial dos workflows.

O workflow devolve as avaliações já consolidadas (avaliação + veredito). Se a
minha reconstrução por arquivos divergir dela, o defeito é meu — e sairia
impresso no documento.
"""
import json, glob, os

TAREFAS = '/tmp/claude-0/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/tasks'

oficial = {}
for f in glob.glob(os.path.join(TAREFAS, 'w*.output')):
    if os.path.getsize(f) == 0: continue
    try:
        d = json.load(open(f))
        r = d.get('result')
        if isinstance(r, str): r = json.loads(r)
        for a in (r or {}).get('avaliacoes', []):
            oficial[a['slug']] = {i['id']: i['resposta'] for i in a['itens']}
    except Exception as e:
        print('  (ignorado)', os.path.basename(f), str(e)[:60])

def verif(slug):
    p = f'verificacoes/{slug}.json'
    return json.load(open(p))['vereditos'] if os.path.exists(p) else []

meu = {}
for a in sorted(glob.glob('avaliacoes/*.json')):
    d = json.load(open(a)); v = verif(d['slug'])
    r = {}
    for it in d['itens']:
        resp = it['resposta']
        ver = next((x for x in v if x.get('id') == it['id']), None)
        if resp == 'Não' and ver and ver.get('mantem_nao') is False:
            resp = 'Sim'
        r[it['id']] = resp
    meu[d['slug']] = r

print(f'equipes no retorno oficial dos workflows: {len(oficial)}')
print(f'equipes na minha consolidação: {len(meu)}')
comuns = set(oficial) & set(meu)
print(f'comparáveis: {len(comuns)}')
div = []
for s in sorted(comuns):
    for cid, resp in oficial[s].items():
        if meu[s].get(cid) != resp:
            div.append((s, cid, resp, meu[s].get(cid)))
if div:
    print(f'\nDIVERGÊNCIAS ({len(div)}):')
    for s, cid, of, mm in div: print(f'   {s} · {cid}: oficial={of} · meu={mm}')
else:
    print('\nsem divergência — a reconstrução por arquivos bate com o retorno dos workflows')
