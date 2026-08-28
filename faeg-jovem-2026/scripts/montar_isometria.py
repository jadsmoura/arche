"""Monta os args do workflow de isometria a partir das avaliações consolidadas."""
import json, glob, os, sys

CRITERIOS = [
    ('relatorio',  'PRIMEIRO EVENTO SOCIAL - RELATÓRIO',                   '5.9.8.1'),
    ('lista',      'PRIMEIRO EVENTO SOCIAL - LISTA DE PRESENÇA',           '5.9.8.2'),
    ('card',       'PRIMEIRO EVENTO SOCIAL - CARD DE DIVULGAÇÃO',          '5.9.8.3'),
    ('fotos',      'PRIMEIRO EVENTO SOCIAL - FOTOS',                       '5.9.8.4'),
    ('divulgacao', 'PRIMEIRO EVENTO SOCIAL - DIVULGAÇÃO EM REDES SOCIAIS', '5.9.8.5'),
]

so = sys.argv[1:] or None   # opcional: rodar só alguns critérios

def verif(slug):
    p = f'verificacoes/{slug}.json'
    return (json.load(open(p))['vereditos'] if os.path.exists(p) else [])

regs = []
for a in sorted(glob.glob('avaliacoes/*.json')):
    d = json.load(open(a))
    v = verif(d['slug'])
    itens = {}
    for it in d['itens']:
        resp, just = it['resposta'], it['justificativa']
        ver = next((x for x in v if x.get('id') == it['id']), None)
        if resp == 'Não' and ver:
            if ver.get('mantem_nao') is False:
                resp, just = 'Sim', ver.get('razao') or just
            elif ver.get('justificativa_corrigida'):
                just = ver['justificativa_corrigida']
        itens[it['id']] = (resp, just)
    regs.append((d['slug'], itens))

os.makedirs('isometria', exist_ok=True)
BASE = os.getcwd()
saida = {'criterios': []}
for cid, rot, item in CRITERIOS:
    if so and cid not in so: continue
    linhas = []
    for slug, itens in regs:
        if cid in itens:
            r, j = itens[cid]
            linhas.append(f'{slug} | {r} | {j}')
    caminho = os.path.join(BASE, 'isometria', f'{cid}.txt')
    with open(caminho, 'w') as fh:
        fh.write(f'# {rot} (item {item}) — {len(linhas)} decisões\n')
        fh.write('# formato: slug | resposta | justificativa\n\n')
        fh.write('\n'.join(linhas) + '\n')
    saida['criterios'].append({'id': cid, 'rotulo': rot, 'item': item, 'arquivo': caminho, 'n': len(linhas)})

# arquivo das observações, para a fase de anomalias
obs_path = os.path.join(BASE, 'isometria', 'observacoes.txt')
n_obs = 0
with open(obs_path, 'w') as fh:
    fh.write('# Observações registradas pelos avaliadores, por equipe\n\n')
    for a in sorted(glob.glob('avaliacoes/*.json')):
        d = json.load(open(a))
        o = (d.get('observacoes') or '').strip()
        if not o: continue
        n_obs += 1
        fh.write(f'## {d["slug"]}\n{o}\n\n')
saida['observacoes'] = obs_path

json.dump(saida, open('args_isometria.json', 'w'), ensure_ascii=False)
for c in saida['criterios']:
    print(f"  {c['id']}: {c['n']} decisões -> {c['arquivo']}")
print(f'  observações: {n_obs} equipes -> {obs_path} ({os.path.getsize(obs_path)//1024} KB)')
print('args:', len(json.dumps(saida)), 'bytes')
