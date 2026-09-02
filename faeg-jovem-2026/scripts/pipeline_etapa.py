"""Baixa, prepara e monta os dossiês de uma etapa. Uso: pipeline_etapa.py <id>"""
import json, os, re, sys, warnings, urllib.request, concurrent.futures as cf
warnings.filterwarnings('ignore')
import pymupdf
from PIL import Image, ExifTags
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception: pass

ETAPA = sys.argv[1]
BASE = os.getcwd()
RAIZ, VISTA = f'docs{ETAPA}', f'vista{ETAPA}'
CDN = 'https://cdn.sistemafaeg.org.br/cdn/documents/'
LADO, QUAL, MAX_PAG, MAX_FOTOS_VER = 1500, 82, 6, 8
GPS_TAG = {v: k for k, v in ExifTags.TAGS.items()}.get('GPSInfo')
IMG_EXT = {'jpg','jpeg','png','jfif','heic','webp','tif','tiff','bmp'}
VID_EXT = {'mp4','mov','avi','mkv','webm'}

def limpo(s, n=60):
    s = re.sub(r'[^A-Za-z0-9._-]+', '_', s or 'sem-nome').strip('_'); return s[:n] or 'arquivo'

inv = json.load(open(f'inventario_{ETAPA}.json'))

# ---------- 1. baixar ----------
tarefas = []
for r in inv:
    slug = limpo(r['login'].split('@')[0], 40)
    for campo, lista in r['docs'].items():
        for i, a in enumerate(lista, 1):
            tarefas.append((a['uuid'], os.path.join(RAIZ, slug, campo, f"{i:02d}_{limpo(a['nome'])}")))

def baixar(t):
    uuid, dest = t
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return ('cache', dest, os.path.getsize(dest))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        req = urllib.request.Request(CDN + uuid, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=180) as resp:
            dados = resp.read()
        open(dest, 'wb').write(dados)
        return ('ok', dest, len(dados))
    except Exception as e:
        return ('erro', dest, str(e)[:100])

print(f'[{ETAPA}] baixando {len(tarefas)} documentos', file=sys.stderr)
res = []
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for i, x in enumerate(ex.map(baixar, tarefas), 1):
        res.append(x)
        if i % 400 == 0:
            mb = sum(y[2] for y in res if isinstance(y[2], int))/1e6
            print(f'  [{ETAPA}] {i}/{len(tarefas)} ({mb:.0f} MB)', file=sys.stderr)
erros = [x for x in res if x[0] == 'erro']
print(f'[{ETAPA}] baixados {len(res)-len(erros)} | erros {len(erros)}', file=sys.stderr)
json.dump([{'destino': x[1], 'status': x[0], 'detalhe': x[2] if x[0]=="erro" else ''} for x in res],
          open(f'baixados_{ETAPA}.json','w'), ensure_ascii=False)

# ---------- 2. preparar ----------
def exif(p):
    try:
        im = Image.open(p); raw = im._getexif() or {}
    except Exception: return {}
    d = {}
    for tag, val in raw.items():
        nome = ExifTags.TAGS.get(tag, tag)
        if nome in ('DateTimeOriginal','DateTime'): d[nome] = str(val)[:40]
    gps = raw.get(GPS_TAG) if GPS_TAG else None
    if gps:
        def grau(v, ref):
            try:
                g = float(v[0]) + float(v[1])/60 + float(v[2])/3600
                return -g if ref in ('S','W') else g
            except Exception: return None
        la, lo = grau(gps.get(2), gps.get(1)), grau(gps.get(4), gps.get(3))
        if la is not None and lo is not None: d['GPS'] = f'{la:.5f},{lo:.5f}'
    return d

def reduzir(o, d):
    try:
        im = Image.open(o); im.load()
        if im.mode not in ('RGB','L'): im = im.convert('RGB')
        im.thumbnail((LADO, LADO), Image.LANCZOS)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        im.save(d, 'JPEG', quality=QUAL); return True
    except Exception as e: return str(e)[:70]

def rasteriza(o, base):
    try: doc = pymupdf.open(o)
    except Exception: return []
    out = []
    for i, p in enumerate(doc[:MAX_PAG]):
        d = f'{base}_p{i+1}.jpg'
        if os.path.exists(d) and os.path.getsize(d) > 0: out.append(d); continue
        try:
            pix = p.get_pixmap(dpi=120)
            os.makedirs(os.path.dirname(d), exist_ok=True)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            img.thumbnail((LADO, LADO), Image.LANCZOS); img.save(d, 'JPEG', quality=QUAL)
            out.append(d)
        except Exception: pass
    doc.close(); return out

def preparar(r):
    slug = limpo(r['login'].split('@')[0], 40)
    reg = {'login': r['login'], 'nome': r['nome'], 'slug': slug, 'campos': r['campos'], 'arquivos': {}}
    for campo, lista in r['docs'].items():
        itens = []
        for i, a in enumerate(lista, 1):
            orig = os.path.join(RAIZ, slug, campo, f"{i:02d}_{limpo(a['nome'])}")
            it = {'nome': a['nome'], 'ext': a['ext'], 'origem': orig}
            if not os.path.exists(orig) or os.path.getsize(orig) == 0:
                it['erro'] = 'arquivo indisponível no CDN'; itens.append(it); continue
            it['bytes'] = os.path.getsize(orig)
            base = os.path.join(VISTA, slug, campo, f'{i:02d}')
            if a['ext'] == 'pdf':
                try:
                    doc = pymupdf.open(orig); txt = '\n'.join(p.get_text() for p in doc).strip(); doc.close()
                except Exception: txt = ''
                it['texto'] = txt
                it['digitalizado'] = len(txt) < 250
                # rasteriza SEMPRE relatorio/lista/card — assinatura e carimbo são imagem
                if campo in ('relatorio','lista','card') or it['digitalizado']:
                    it['paginas_img'] = rasteriza(orig, base)
            elif a['ext'] in IMG_EXT:
                d = base + '.jpg'; ok = reduzir(orig, d)
                it['img'] = d if ok is True else None
                if ok is not True: it['erro_img'] = ok
                if campo == 'fotos': it['exif'] = exif(orig)
            elif a['ext'] in VID_EXT: it['tipo'] = 'video'
            else: it['tipo'] = 'outro'
            itens.append(it)
        reg['arquivos'][campo] = itens
    return reg

print(f'[{ETAPA}] preparando', file=sys.stderr)
corpus = []
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for k, reg in enumerate(ex.map(preparar, inv), 1):
        corpus.append(reg)
        if k % 40 == 0: print(f'  [{ETAPA}] preparadas {k}/{len(inv)}', file=sys.stderr)
json.dump(corpus, open(f'corpus_{ETAPA}.json','w'), ensure_ascii=False)
print(f'[{ETAPA}] corpus pronto', file=sys.stderr)
