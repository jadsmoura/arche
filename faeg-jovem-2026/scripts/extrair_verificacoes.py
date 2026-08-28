"""Recupera os vereditos da verificação a partir dos transcritos dos agentes.

O JSON que os agentes gravam em avaliacoes/ é a PRIMEIRA passada, antes da
refutação. O veredito só existe no retorno do workflow — e daí nos transcritos.
Sem isto, o documento sairia com "Não" que a verificação derrubou.
"""
import glob, json, os, re, sys

RAIZ = '/root/.claude/projects/-home-user-arche/330836b2-2a25-54ca-8f38-b17d5d126135/subagents/workflows'
saida = {}

for d in sorted(glob.glob(os.path.join(RAIZ, 'wf_*'))):
    for arq in glob.glob(os.path.join(d, 'agent-*.jsonl')):
        if arq.endswith('.meta.json'): continue
        slug = None; vereditos = None; ehVerificacao = False
        try:
            linhas = open(arq, encoding='utf-8').read().splitlines()
        except Exception:
            continue
        for l in linhas:
            try: reg = json.loads(l)
            except Exception: continue
            msg = reg.get('message', reg)
            cont = msg.get('content')
            blocos = cont if isinstance(cont, list) else ([{'type': 'text', 'text': cont}] if isinstance(cont, str) else [])
            for b in blocos:
                if b.get('type') == 'text':
                    t = b.get('text') or ''
                    if 'TENTAR REFUTAR' in t or 'confere criticamente decisões' in t:
                        ehVerificacao = True
                    m = re.search(r'/dossies/([a-z0-9._-]+)\.md', t)
                    if m and not slug: slug = m.group(1)
                if b.get('type') == 'tool_use' and b.get('name') in ('StructuredOutput', 'structured_output'):
                    ent = b.get('input') or {}
                    if 'vereditos' in ent:
                        vereditos = ent['vereditos']
        if ehVerificacao and slug and vereditos is not None:
            saida[slug] = vereditos

os.makedirs('verificacoes', exist_ok=True)
for slug, v in saida.items():
    json.dump({'slug': slug, 'vereditos': v}, open(f'verificacoes/{slug}.json', 'w'), ensure_ascii=False, indent=1)

print('vereditos recuperados:', len(saida))
for slug, v in list(saida.items())[:6]:
    for x in v:
        print(f"  {slug} · {x.get('id')}: mantem_nao={x.get('mantem_nao')} — {str(x.get('razao'))[:110]}")
