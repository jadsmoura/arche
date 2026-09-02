"""Dossiê por equipe, de uma etapa. Uso: dossies_etapa.py <id>"""
import json, os, re, sys, collections

ETAPA = sys.argv[1]
BASE = os.getcwd()
MAX_FOTOS_VER = 8
TIPO = {'82': 'tecnico', '76': 'saude', '79': 'saude', '77': 'social', '78': 'social'}[ETAPA]
c = json.load(open(f'corpus_{ETAPA}.json'))
MOSAICO = {}
_mp = f'mosaicos_vista{ETAPA}.json'
if os.path.exists(_mp):
    MOSAICO = json.load(open(_mp))
MAX_FOLHAS_FOTOS = 2   # 4 fotos por folha: cobre as 8 que a régua manda abrir

DOS = f'dossies{ETAPA}'
os.makedirs(DOS, exist_ok=True)

def classificar_insta(u):
    u = (u or '').strip()
    if not u: return 'VAZIO', 'campo em branco'
    low = u.lower()
    if 'instagram.com' not in low:
        return ('OUTRA_REDE', 'link fora do Instagram') if low.startswith('http') else ('NAO_E_LINK', 'texto que não é link')
    if re.search(r'instagram\.com/(p|reel|reels|tv)/', low): return 'PUBLICACAO', 'link de publicação'
    resto = low.split('instagram.com/', 1)[1].strip('/')
    if not resto: return 'PERFIL', 'link do Instagram sem publicação'
    if '/' not in resto and '?' not in resto: return 'PERFIL', 'link de PERFIL, não de publicação'
    return 'INDEFINIDO', 'formato incerto'

resumo = []
for g in c:
    L, ca = [], g['campos']
    L.append(f"# {g['nome']}")
    L.append(f"\nLogin do grupo: {g['login']}\n")
    L.append("## O que o grupo declarou no formulário\n")
    campos = [('Nome da ação','nome_acao'), ('Município','municipio'), ('Local','local'),
              ('Data de início','data_inicio'), ('Data de encerramento','data_fim'),
              ('Hora de início','hora_inicio'), ('Hora de encerramento','hora_fim'),
              ('Participantes presentes','participantes')]
    if 'beneficiados' in ca: campos.append(('Pessoas beneficiadas','beneficiados'))
    for rot, ch in campos:
        L.append(f"- **{rot}:** {ca.get(ch) or '(em branco)'}")
    if TIPO == 'tecnico':
        dec = ca.get('independente')
        L.append(f"- **Evento independente (declarado pela equipe):** {dec or '(não respondeu)'}")
        L.append("\n> Atenção: o número de participantes acima é o DIGITADO pela equipe. Para as três")
        L.append("> bonificações de público vale o número CONTADO na lista de presença — linhas com nome")
        L.append("> completo e telefone, sem duplicidade, mais os menores atestados no rodapé. Registre os")
        L.append("> dois números na justificativa. A declaração de independência é ponto de partida, não")
        L.append("> prova: confira contra o card, o relatório e a lista.")

    insta = ca.get('instagram') or ''
    ti, oi = classificar_insta(insta)
    L.append(f"\n## Divulgação em redes sociais (campo de texto)\n")
    L.append(f"- Conteúdo do campo: `{insta or '(em branco)'}`")
    L.append(f"- Classificação automática do formato: **{ti}** — {oi}")
    L.append("- O link não pode ser aberto nesta conferência (publicação do Instagram exige login). Julgue pelo que o campo traz.")

    ver = []
    for campo, titulo in [('relatorio','Relatório do evento'), ('lista','Lista de presença'),
                          ('card','Card de divulgação'), ('fotos','Fotos do evento')]:
        itens = g['arquivos'].get(campo, [])
        folhas = (MOSAICO.get(g['slug']) or {}).get(campo) or []
        if campo == 'fotos':
            folhas = folhas[:MAX_FOLHAS_FOTOS]
        L.append(f"\n## {titulo}\n")
        L.append(f"Arquivos anexados: **{len(itens)}**\n")
        mostrados = 0
        for it in itens:
            if it.get('erro'):
                L.append(f"- `{it['nome']}` — **INDISPONÍVEL**: {it['erro']} (falha da plataforma, não da equipe)"); continue
            if it.get('tipo') == 'video':
                L.append(f"- `{it['nome']}` — vídeo ({it.get('bytes',0)//1024} KB); não é possível assistir nesta conferência"); continue
            if it.get('ext') == 'pdf':
                txt = (it.get('texto') or '').strip()
                if txt and len(txt) >= 250:
                    L.append(f"- `{it['nome']}` — PDF com texto. Transcrição:\n")
                    L.append("```\n" + txt[:6000] + ("\n[...cortado...]" if len(txt) > 6000 else "") + "\n```")
                    if it.get('paginas_img'):
                        L.append("  - **A transcrição NÃO mostra assinatura, carimbo nem selo gov.br** — são imagem. Abra as páginas:")
                        if not folhas:
                            for p in it['paginas_img']: ver.append(p); L.append(f"  - `{os.path.join(BASE,p)}`")
                else:
                    L.append(f"- `{it['nome']}` — PDF **digitalizado**. Páginas em imagem — leia todas:")
                    if not folhas:
                        for p in it.get('paginas_img', []): ver.append(p); L.append(f"  - `{os.path.join(BASE,p)}`")
                    if not it.get('paginas_img'): L.append("  - (não foi possível rasterizar)")
            elif it.get('img'):
                if campo == 'fotos':
                    ex = it.get('exif') or {}
                    m = []
                    if ex.get('DateTimeOriginal'): m.append('data EXIF ' + ex['DateTimeOriginal'])
                    if ex.get('GPS'): m.append('GPS ' + ex['GPS'])
                    suf = (' — ' + '; '.join(m)) if m else ' — sem EXIF (típico de imagem que passou por aplicativo de mensagem)'
                    if folhas:
                        L.append(f"- `{it['nome']}`{suf}")
                    elif mostrados < MAX_FOTOS_VER:
                        ver.append(it['img']); mostrados += 1
                        L.append(f"- `{it['nome']}`{suf}\n  - `{os.path.join(BASE,it['img'])}`")
                    else:
                        L.append(f"- `{it['nome']}`{suf} (não aberta: além das {MAX_FOTOS_VER} primeiras)")
                elif folhas:
                    L.append(f"- `{it['nome']}`")
                else:
                    ver.append(it['img']); L.append(f"- `{it['nome']}`\n  - `{os.path.join(BASE,it['img'])}`")
            else:
                L.append(f"- `{it['nome']}` — formato não legível ({it.get('ext') or 'sem extensão'})")

        if folhas:
            n = len(folhas)
            L.append(f"\n**ABRA {'a folha' if n == 1 else 'as ' + str(n) + ' folhas'} abaixo — {'é' if n == 1 else 'são'} a imagem do que foi anexado:**")
            for f in folhas:
                ver.append(f); L.append(f"  - `{os.path.join(BASE, f)}`")

    caminho = os.path.join(DOS, g['slug'] + '.md')
    open(caminho, 'w').write('\n'.join(L))
    resumo.append({'slug': g['slug'], 'nome': g['nome'], 'login': g['login'],
                   'dossie': os.path.join(BASE, caminho), 'n_imagens': len(ver), 'instagram_tipo': ti})

json.dump(resumo, open(f'dossies_{ETAPA}.json','w'), ensure_ascii=False)
print(f'etapa {ETAPA} ({TIPO}): {len(resumo)} dossiês | imagens/equipe média {sum(r["n_imagens"] for r in resumo)/len(resumo):.1f}, máx {max(r["n_imagens"] for r in resumo)}')
print('  formato do link:', dict(collections.Counter(r['instagram_tipo'] for r in resumo)))
