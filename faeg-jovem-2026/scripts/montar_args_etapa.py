"""Gera os args do workflow de avaliação, por etapa e lote. Uso: montar_args_etapa.py <etapa> <n_lotes>"""
import json, os, sys

ETAPA = sys.argv[1]; NLOTES = int(sys.argv[2]) if len(sys.argv) > 2 else 4
BASE = os.getcwd()
CFG = {
 '82': {'tipo':'tecnico','nome':'PRIMEIRO EVENTO TÉCNICO','rubrica':'/home/user/arche/faeg-jovem-2026/00_config/rubrica-1et.md',
        'itens':[('relatorio','PRIMEIRO EVENTO TÉCNICO - RELATÓRIO','5.9.8.1',3),
                 ('lista','PRIMEIRO EVENTO TÉCNICO - LISTA DE PRESENÇA','5.9.8.2',3),
                 ('card','PRIMEIRO EVENTO TÉCNICO - CARD DE DIVULGAÇÃO','5.9.8.3',3),
                 ('fotos','PRIMEIRO EVENTO TÉCNICO - FOTOS','5.9.8.4',3),
                 ('divulgacao','PRIMEIRO EVENTO TÉCNICO - DIVULGAÇÃO EM REDES SOCIAIS','5.9.8.5',3),
                 ('publico30','PRIMEIRO EVENTO TÉCNICO - Público >= 30 pessoas','5.9.15',5),
                 ('publico60','PRIMEIRO EVENTO TÉCNICO - Público >= 60 pessoas','5.9.15',5),
                 ('publico100','PRIMEIRO EVENTO TÉCNICO - Público >= 100','5.9.15',5),
                 ('independencia','PRIMEIRO EVENTO TÉCNICO - Independência','5.9.15',5),
                 ('duracao','PRIMEIRO EVENTO TÉCNICO - Duração dias >= 2','5.9.15',5)]},
 '76': {'tipo':'saude','nome':'PRIMEIRO EVENTO DE SAÚDE','rubrica':'/home/user/arche/faeg-jovem-2026/00_config/rubrica-es.md',
        'itens':[('relatorio','PRIMEIRO EVENTO DE SAÚDE - RELATÓRIO','5.9.8.1',3),
                 ('lista','PRIMEIRO EVENTO DE SAÚDE - LISTA DE PRESENÇA','5.9.8.2',3),
                 ('card','PRIMEIRO EVENTO DE SAÚDE - CARD DE DIVULGAÇÃO','5.9.8.3',3),
                 ('fotos','PRIMEIRO EVENTO DE SAÚDE - FOTOS','5.9.8.4',3),
                 ('divulgacao','PRIMEIRO EVENTO DE SAÚDE - DIVULGAÇÃO EM REDES SOCIAIS','5.9.8.5',3)]},
 '79': {'tipo':'saude','nome':'SEGUNDO EVENTO DE SAÚDE','rubrica':'/home/user/arche/faeg-jovem-2026/00_config/rubrica-es.md',
        'itens':[('relatorio','SEGUNDO EVENTO DE SAÚDE - RELATÓRIO','5.9.8.1',3),
                 ('lista','SEGUNDO EVENTO DE SAÚDE - LISTA DE PRESENÇA','5.9.8.2',3),
                 ('card','SEGUNDO EVENTO DE SAÚDE - CARD DE DIVULGAÇÃO','5.9.8.3',3),
                 ('fotos','SEGUNDO EVENTO DE SAÚDE - FOTOS','5.9.8.4',3),
                 ('divulgacao','SEGUNDO EVENTO DE SAÚDE - DIVULGAÇÃO EM REDES SOCIAIS','5.9.8.5',3)]},
}[ETAPA]

eq = json.load(open(f'dossies_{ETAPA}.json'))
saida = os.path.join(BASE, f'avaliacoes{ETAPA}')
os.makedirs(saida, exist_ok=True)
base = {'etapa': ETAPA, 'tipo': CFG['tipo'], 'nomeEtapa': CFG['nome'], 'rubrica': CFG['rubrica'], 'saida': saida,
        'dossies': os.path.join(BASE, f'dossies{ETAPA}'),
        'itens': [{'id':i,'rotulo':r,'item':it,'valor':v} for i,r,it,v in CFG['itens']]}
for k in range(NLOTES):
    a = dict(base); a['slugs'] = [x['slug'] for x in eq[k::NLOTES]]
    json.dump(a, open(f'args_{ETAPA}_{k+1}.json','w'), ensure_ascii=False)
    print(f'  args_{ETAPA}_{k+1}.json: {len(a["slugs"])} equipes, {len(json.dumps(a))} bytes')
