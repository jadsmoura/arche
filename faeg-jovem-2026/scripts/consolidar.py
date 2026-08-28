"""Grava a versão consolidada (avaliação + veredito da refutação) que os
workflows devolveram. É a fonte oficial; a reconstrução por arquivos serve
de conferência."""
import json, glob, os, collections

TAREFAS = '/tmp/claude-0/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/tasks'
os.makedirs('consolidado', exist_ok=True)

n = 0
for f in sorted(glob.glob(os.path.join(TAREFAS, 'w*.output'))):
    if os.path.getsize(f) == 0: continue
    try:
        d = json.load(open(f)); r = d.get('result')
        if isinstance(r, str): r = json.loads(r)
    except Exception:
        continue
    for a in (r or {}).get('avaliacoes', []):
        json.dump(a, open(f'consolidado/{a["slug"]}.json', 'w'), ensure_ascii=False, indent=1)
        n += 1

print('equipes consolidadas:', n)

# retrato final
pontos = collections.Counter(); porcrit = collections.Counter(); rev = 0
for f in glob.glob('consolidado/*.json'):
    a = json.load(open(f)); nao = 0
    for i in a['itens']:
        if i['resposta'] == 'Não': nao += 1; porcrit[i['id']] += 1
        if i.get('revisado'): rev += 1
    pontos[10 - nao*2] += 1
print('pontos:', dict(sorted(pontos.items(), reverse=True)))
print('"Não" por critério:', dict(porcrit.most_common()), '| total', sum(porcrit.values()))
print('itens tocados pela verificação:', rev)
