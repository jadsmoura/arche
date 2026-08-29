"""Lança na plataforma a avaliação do 1º Evento de Saúde (etapa 76).

resposta = 0 para "Não" e = valor do critério (3 nesta etapa) para "Sim".
"Pendente" nunca é lançado.
"""
import fj, json, glob, time, sys

VALOR = 3
IDS = {'relatorio':257, 'lista':253, 'card':254, 'fotos':255, 'divulgacao':256}

fj.entrar()
s, part = fj.get('/desafioFaegJovem/getParticipantes/76')
prog = {p['usuarioLogin'].split('@')[0]: p['id'] for p in part}

curtas = {}
for f in sorted(glob.glob('curtas76/lote_*.json')):
    curtas.update(json.load(open(f)))

ok = falhas = pulados = 0
erros = []
for slug in sorted(curtas):
    pid = prog.get(slug)
    if pid is None:
        erros.append((slug, '-', 'sem progressoId')); falhas += 1; continue
    for it in curtas[slug]:
        if it['resposta'] == 'Pendente':
            pulados += 1
            print(f'  PULADO {slug}/{it["id"]} (pendência da plataforma)', flush=True)
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
json.dump(erros, open('erros_lancamento_76.json','w'), ensure_ascii=False)
sys.exit(1 if falhas else 0)
