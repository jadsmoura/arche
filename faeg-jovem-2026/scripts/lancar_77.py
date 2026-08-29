"""Lança na plataforma do Senar a avaliação da 1ª Ação Social.

resposta = 0 para "Não" e = valor do critério (2) para "Sim" — é o que o
próprio código da página faz. "Pendente" nunca é lançado.
"""
import fj, json, glob, time, sys

VALOR = 2
IDS = {'relatorio':199, 'lista':200, 'card':201, 'fotos':202, 'divulgacao':203}
JA_LANCADAS = {'abadiania'}

fj.entrar()
s, part = fj.get('/desafioFaegJovem/getParticipantes/77')
prog = {p['usuarioLogin'].split('@')[0]: p['id'] for p in part}

curtas = {}
for f in sorted(glob.glob('curtas/lote_*.json')):
    curtas.update(json.load(open(f)))

ok = falhas = pulados = 0
erros = []
for slug in sorted(curtas):
    if slug in JA_LANCADAS:
        continue
    pid = prog.get(slug)
    if pid is None:
        erros.append((slug, '-', 'sem progressoId')); falhas += 1; continue
    for it in curtas[slug]:
        if it['resposta'] == 'Pendente':
            pulados += 1
            print(f'  PULADO {slug}/{it["id"]} (pendência da plataforma)')
            continue
        p = {'resposta': VALOR if it['resposta'] == 'Sim' else 0,
             'justificativa': it['justificativa'], 'recurso': None,
             'pergunta': {'id': IDS[it['id']]}, 'progresso': {'id': pid}}
        st, d = fj._req(fj.API + '/desafioFaegJovem/saveAvaliacao', p)
        if st in (200, 201):
            ok += 1
        else:
            falhas += 1; erros.append((slug, it['id'], f'{st} {str(d)[:120]}'))
        time.sleep(0.12)
    if ok % 100 < 5:
        print(f'  ... {ok} itens lançados', flush=True)

print(f'\nlançados: {ok} | falhas: {falhas} | pulados (pendente): {pulados}')
for e in erros[:30]:
    print('  ERRO', ' | '.join(map(str, e)))
json.dump(erros, open('erros_lancamento_77.json','w'), ensure_ascii=False)
sys.exit(1 if falhas else 0)
