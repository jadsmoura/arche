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

FONTE = 'consolidado' if glob.glob('consolidado/*.json') else 'avaliacoes'
regs = []
for a in sorted(glob.glob(f'{FONTE}/*.json')):
    d = json.load(open(a))
    itens = {it['id']: (it['resposta'], it['justificativa']) for it in d['itens']}
    regs.append((d['slug'], itens))
print(f'fonte: {FONTE}/ ({len(regs)} equipes)')

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
    for a in sorted(glob.glob(f'{FONTE}/*.json')):
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
