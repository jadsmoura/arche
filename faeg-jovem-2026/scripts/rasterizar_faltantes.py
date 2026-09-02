"""Rasteriza TODO PDF de relatório, lista e card — a assinatura e o carimbo são visuais,
não saem na extração de texto. Sem isto, 119 equipes seriam reprovadas por assinatura
que está no documento como imagem."""
import json, os, sys, warnings, concurrent.futures as cf
warnings.filterwarnings('ignore')
import pymupdf
from PIL import Image

LADO, QUALIDADE, MAX_PAG = 1500, 82, 6
corpus = json.load(open('corpus_77.json'))

def rasteriza(origem, base):
    try: doc = pymupdf.open(origem)
    except Exception: return []
    out = []
    for i, p in enumerate(doc[:MAX_PAG]):
        d = f'{base}_p{i+1}.jpg'
        if os.path.exists(d) and os.path.getsize(d) > 0:
            out.append(d); continue
        try:
            pix = p.get_pixmap(dpi=120)
            os.makedirs(os.path.dirname(d), exist_ok=True)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            img.thumbnail((LADO, LADO), Image.LANCZOS)
            img.save(d, 'JPEG', quality=QUALIDADE)
            out.append(d)
        except Exception: pass
    doc.close()
    return out

def trata(g):
    n = 0
    for campo in ('relatorio', 'lista', 'card'):
        for i, it in enumerate(g['arquivos'].get(campo, []), 1):
            if it.get('ext') != 'pdf' or it.get('erro'): continue
            if it.get('paginas_img'): continue          # já rasterizado
            base = os.path.join('vista', g['slug'], campo, f'{i:02d}')
            imgs = rasteriza(it['origem'], base)
            if imgs:
                it['paginas_img'] = imgs
                it['rasterizado_depois'] = True
                n += len(imgs)
    return g, n

total = 0
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for k, (g, n) in enumerate(ex.map(trata, corpus), 1):
        total += n
        if k % 40 == 0: print(f'  {k}/{len(corpus)}', file=sys.stderr)

json.dump(corpus, open('corpus_77.json', 'w'), ensure_ascii=False)
print('páginas rasterizadas nesta passada:', total)
faltam = sum(1 for g in corpus for c in ('relatorio','lista','card')
             for it in g['arquivos'].get(c, [])
             if it.get('ext')=='pdf' and not it.get('erro') and not it.get('paginas_img'))
print('PDFs de relatório/lista/card ainda sem imagem:', faltam)
