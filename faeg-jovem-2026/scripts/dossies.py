"""Um dossiê por equipe: o que o avaliador precisa ler, com os caminhos das imagens."""
import json, os, re, collections

BASE = os.getcwd()
MAX_FOTOS_VER = 8
c = json.load(open('corpus_77.json'))
os.makedirs('dossies', exist_ok=True)

def classificar_insta(u):
    u = (u or '').strip()
    if not u: return 'VAZIO', 'campo em branco'
    low = u.lower()
    if 'instagram.com' not in low:
        if low.startswith('http'): return 'OUTRA_REDE', 'link fora do Instagram'
        return 'NAO_E_LINK', 'texto que não é link'
    if re.search(r'instagram\.com/(p|reel|reels|tv)/', low): return 'PUBLICACAO', 'link de publicação'
    # perfil: instagram.com/usuario  (sem /p/)
    resto = low.split('instagram.com/',1)[1].strip('/')
    if not resto: return 'PERFIL', 'link do Instagram sem publicação'
    if '/' not in resto and '?' not in resto: return 'PERFIL', 'link de PERFIL, não de publicação'
    return 'INDEFINIDO', 'link do Instagram de formato incerto'

resumo = []
for g in c:
    L = []
    ca = g['campos']
    L.append(f"# {g['nome']}")
    L.append(f"\nLogin do grupo: {g['login']}\n")
    L.append("## O que o grupo declarou no formulário\n")
    for rot, ch in [('Nome da ação','nome_acao'), ('Município','municipio'), ('Local','local'),
                    ('Data de início','data_inicio'), ('Data de encerramento','data_fim'),
                    ('Hora de início','hora_inicio'), ('Hora de encerramento','hora_fim'),
                    ('Participantes presentes','participantes'), ('Pessoas beneficiadas','beneficiados')]:
        L.append(f"- **{rot}:** {ca.get(ch) or '(em branco)'}")

    insta = ca.get('instagram') or ''
    tipo_i, obs_i = classificar_insta(insta)
    L.append(f"\n## 5. Divulgação em redes sociais (campo de texto)\n")
    L.append(f"- Conteúdo do campo: `{insta or '(em branco)'}`")
    L.append(f"- Classificação automática do formato: **{tipo_i}** — {obs_i}")
    L.append("- O link não pode ser aberto nesta conferência (publicação do Instagram exige login). Julgue pelo que o campo traz.")

    ver = []   # imagens que o avaliador deve abrir
    for campo, titulo, num in [('relatorio','1. Relatório do evento',1), ('lista','2. Lista de presença',2),
                               ('card','3. Card de divulgação',3), ('fotos','4. Fotos do evento',4)]:
        itens = g['arquivos'].get(campo, [])
        L.append(f"\n## {titulo}\n")
        L.append(f"Arquivos anexados: **{len(itens)}**\n")
        mostrados = 0
        for it in itens:
            if it.get('erro'):
                L.append(f"- `{it['nome']}` — **INDISPONÍVEL**: {it['erro']}")
                continue
            if it.get('tipo') == 'video':
                L.append(f"- `{it['nome']}` — vídeo ({it.get('bytes',0)//1024} KB); não é possível assistir nesta conferência")
                continue
            if it.get('ext') == 'pdf':
                txt = (it.get('texto') or '').strip()
                if txt and len(txt) >= 250:
                    L.append(f"- `{it['nome']}` — PDF com texto. Transcrição:\n")
                    L.append("```\n" + txt[:6000] + ("\n[...cortado...]" if len(txt) > 6000 else "") + "\n```")
                    if it.get('paginas_img'):
                        L.append("  - **A transcrição acima NÃO mostra assinatura, carimbo nem rubrica** — eles são imagem dentro do PDF. Abra as páginas abaixo para conferir:")
                        for p in it['paginas_img']:
                            ver.append(p); L.append(f"  - `{os.path.join(BASE,p)}`")
                else:
                    L.append(f"- `{it['nome']}` — PDF **digitalizado** (sem texto extraível). Páginas em imagem — leia todas:")
                    for p in it.get('paginas_img', []):
                        ver.append(p); L.append(f"  - `{os.path.join(BASE,p)}`")
                    if not it.get('paginas_img'): L.append("  - (não foi possível rasterizar)")
            elif it.get('img'):
                if campo == 'fotos':
                    ex = it.get('exif') or {}
                    marca = []
                    if ex.get('DateTimeOriginal'): marca.append('data EXIF ' + ex['DateTimeOriginal'])
                    if ex.get('GPS'): marca.append('GPS ' + ex['GPS'])
                    sufixo = (' — ' + '; '.join(marca)) if marca else ' — sem EXIF (típico de imagem que passou por aplicativo de mensagem)'
                    if mostrados < MAX_FOTOS_VER:
                        ver.append(it['img']); mostrados += 1
                        L.append(f"- `{it['nome']}`{sufixo}\n  - `{os.path.join(BASE,it['img'])}`")
                    else:
                        L.append(f"- `{it['nome']}`{sufixo} (não aberta: além das {MAX_FOTOS_VER} primeiras)")
                else:
                    ver.append(it['img'])
                    L.append(f"- `{it['nome']}`\n  - `{os.path.join(BASE,it['img'])}`")
            else:
                L.append(f"- `{it['nome']}` — formato não legível ({it.get('ext') or 'sem extensão'})")

    caminho = os.path.join('dossies', g['slug'] + '.md')
    open(caminho, 'w').write('\n'.join(L))
    resumo.append({'slug': g['slug'], 'nome': g['nome'], 'login': g['login'],
                   'dossie': os.path.join(BASE, caminho), 'n_imagens': len(ver),
                   'instagram_tipo': tipo_i,
                   'n_fotos': len(g['arquivos'].get('fotos', [])),
                   'n_relatorio': len(g['arquivos'].get('relatorio', [])),
                   'n_lista': len(g['arquivos'].get('lista', [])),
                   'n_card': len(g['arquivos'].get('card', []))})

json.dump(resumo, open('dossies.json', 'w'), ensure_ascii=False, indent=1)
print('dossiês:', len(resumo))
print('imagens a abrir por equipe — média', round(sum(r['n_imagens'] for r in resumo)/len(resumo),1),
      '| máx', max(r['n_imagens'] for r in resumo))
print('formato do link de Instagram:', dict(collections.Counter(r['instagram_tipo'] for r in resumo)))
