"""Prepara o corpus de leitura: texto dos PDFs, EXIF das fotos, imagens reduzidas."""
import json, os, re, sys, warnings
warnings.filterwarnings('ignore')
import pymupdf
from PIL import Image, ExifTags
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception: pass

RAIZ, VISTA = 'docs', 'vista'
LADO = 1500           # lado maior das imagens para leitura
QUALIDADE = 82
GPS_TAG = {v: k for k, v in ExifTags.TAGS.items()}.get('GPSInfo')

def exif(caminho):
    try:
        im = Image.open(caminho)
        raw = im._getexif() or {}
    except Exception:
        return {}
    d = {}
    for tag, val in raw.items():
        nome = ExifTags.TAGS.get(tag, tag)
        if nome in ('DateTimeOriginal', 'DateTime', 'Make', 'Model'):
            d[nome] = str(val)[:40]
    gps = raw.get(GPS_TAG) if GPS_TAG else None
    if gps:
        def grau(v, ref):
            try:
                g = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
                return -g if ref in ('S', 'W') else g
            except Exception: return None
        la = grau(gps.get(2), gps.get(1)); lo = grau(gps.get(4), gps.get(3))
        if la is not None and lo is not None:
            d['GPS'] = f'{la:.5f},{lo:.5f}'
    return d

def reduzir(origem, destino):
    try:
        im = Image.open(origem); im.load()
        if im.mode not in ('RGB', 'L'): im = im.convert('RGB')
        im.thumbnail((LADO, LADO), Image.LANCZOS)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        im.save(destino, 'JPEG', quality=QUALIDADE)
        return True
    except Exception as e:
        return str(e)[:80]

def pdf_texto_e_paginas(origem, destino_base, max_pag=4):
    """Devolve (texto, [imagens]) — rasteriza quando o PDF é digitalizado."""
    try:
        doc = pymupdf.open(origem)
    except Exception as e:
        return f'<ERRO ao abrir PDF: {e}>', []
    txt = []
    for p in doc:
        try: txt.append(p.get_text())
        except Exception: pass
    texto = '\n'.join(txt).strip()
    imgs = []
    # digitalizado (pouco texto) -> rasteriza as primeiras páginas
    if len(texto) < 250:
        for i, p in enumerate(doc[:max_pag]):
            try:
                pix = p.get_pixmap(dpi=120)
                d = f'{destino_base}_p{i+1}.jpg'
                os.makedirs(os.path.dirname(d), exist_ok=True)
                img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                img.thumbnail((LADO, LADO), Image.LANCZOS)
                img.save(d, 'JPEG', quality=QUALIDADE)
                imgs.append(d)
            except Exception: pass
    doc.close()
    return texto, imgs

IMG_EXT = {'jpg','jpeg','png','jfif','heic','webp','tif','tiff','bmp'}
VIDEO_EXT = {'mp4','mov','avi','mkv','webm'}

inv = json.load(open('inventario_77.json'))
def limpo(s, n=60):
    s = re.sub(r'[^A-Za-z0-9._-]+', '_', s or 'sem-nome').strip('_'); return s[:n] or 'arquivo'

import concurrent.futures as cf

def processar(par):
    k, r = par
    slug = limpo(r['login'].split('@')[0], 40)
    reg = {'login': r['login'], 'nome': r['nome'], 'slug': slug, 'campos': r['campos'], 'arquivos': {}}
    for campo, lista in r['docs'].items():
        itens = []
        for i, a in enumerate(lista, 1):
            orig = os.path.join(RAIZ, slug, campo, f"{i:02d}_{limpo(a['nome'])}")
            it = {'nome': a['nome'], 'ext': a['ext'], 'origem': orig}
            if not os.path.exists(orig) or os.path.getsize(orig) == 0:
                it['erro'] = 'arquivo indisponível no CDN (erro 500 do servidor)'
                itens.append(it); continue
            it['bytes'] = os.path.getsize(orig)
            base = os.path.join(VISTA, slug, campo, f"{i:02d}")
            if a['ext'] == 'pdf':
                texto, imgs = pdf_texto_e_paginas(orig, base)
                it['texto'] = texto
                it['paginas_img'] = imgs
                it['digitalizado'] = len(texto) < 250
            elif a['ext'] in IMG_EXT:
                d = base + '.jpg'
                ok = reduzir(orig, d)
                it['img'] = d if ok is True else None
                if ok is not True: it['erro_img'] = ok
                if campo == 'fotos': it['exif'] = exif(orig)
            elif a['ext'] in VIDEO_EXT:
                it['tipo'] = 'video'
            else:
                it['tipo'] = 'outro'
            itens.append(it)
        reg['arquivos'][campo] = itens
    return reg

saida = []
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for k, reg in enumerate(ex.map(processar, list(enumerate(inv, 1))), 1):
        saida.append(reg)
        if k % 20 == 0: print(f'  {k}/{len(inv)}', file=sys.stderr)

json.dump(saida, open('corpus_77.json', 'w'), ensure_ascii=False)
print('corpus pronto:', len(saida), 'grupos')
