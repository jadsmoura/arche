"""Coleta respostas + inventário de documentos de UMA etapa. Uso: coletar_etapa.py <id>"""
import json, os, sys, re, urllib.parse, collections, concurrent.futures as cf
import fj

ETAPA = sys.argv[1]
fj.entrar()

s, part = fj.get(f'/desafioFaegJovem/getParticipantes/{ETAPA}')
grupos = sorted({(p['usuarioLogin'], p['faegJovem'], p['id']) for p in part})
print(f'etapa {ETAPA}: {len(grupos)} grupos', file=sys.stderr)

def puxar(g):
    login, nome, gid = g
    st, d = fj.get(f'/desafioFaegJovem/getRespostasByUsuario/{ETAPA}/{login}')
    return {'login': login, 'nome': nome, 'id': gid, 'status': st,
            'respostas': d if isinstance(d, list) else []}

out = []
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for i, r in enumerate(ex.map(puxar, grupos), 1):
        out.append(r)
        if i % 40 == 0: print(f'  {i}/{len(grupos)}', file=sys.stderr)

json.dump(out, open(f'respostas_{ETAPA}.json', 'w'), ensure_ascii=False)

# perguntas do formulário desta etapa
perg = collections.Counter()
for g in out:
    for r in g['respostas']:
        p = r['pergunta']
        perg[(p['ordem'], p['id'], p['tipo'], p['pergunta'][:80])] += 1
print(f'\ngrupos: {len(out)} | sem respostas: {sum(1 for g in out if not g["respostas"])}')
print('perguntas do formulário:')
for (o, pid, t, txt), n in sorted(perg.items(), key=lambda x: (x[0][0] or 99)):
    print(f'  ordem={o} id={pid} tipo={t:<8} n={n:>3} | {txt}')
