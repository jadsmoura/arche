import json, os, sys, concurrent.futures as cf
import fj

fj.entrar()
part = json.load(open('participantes_77.json'))
grupos = sorted({(p['usuarioLogin'], p['faegJovem'], p['id']) for p in part})

def puxar(g):
    login, nome, gid = g
    s, d = fj.get(f'/desafioFaegJovem/getRespostasByUsuario/77/{login}')
    return {'login': login, 'nome': nome, 'id': gid, 'status': s, 'respostas': d if isinstance(d, list) else []}

out = []
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for i, r in enumerate(ex.map(puxar, grupos), 1):
        out.append(r)
        if i % 25 == 0: print(f'  {i}/{len(grupos)}', file=sys.stderr)

json.dump(out, open('respostas_77.json', 'w'), ensure_ascii=False)
ok = sum(1 for r in out if r['status'] == 200)
vaz = sum(1 for r in out if not r['respostas'])
print(f'grupos: {len(out)} | HTTP 200: {ok} | sem respostas: {vaz}')
