"""Junta as imagens de cada equipe em poucas folhas de contato.

O custo de token não está no tamanho das imagens: está no NÚMERO de aberturas,
porque cada Read reenvia todo o contexto acumulado. Treze aberturas custam
1+2+...+13 = 91 instâncias de imagem; cinco custam 15.

Régua: relatório e lista ficam em resolução CHEIA — é neles que se decide
assinatura, rubrica e selo gov.br. Card e fotos entram reduzidos.
Uso: mosaicos.py <vistaNN>
"""
import os, sys, glob
from PIL import Image

VISTA = sys.argv[1]
LARG_DOC = 1240      # largura de cada página de relatório/lista (resolução cheia)
LARG_FOTO = 900      # fotos: reduzidas, mas com o carimbo de data/GPS legível
LARG_CARD = 1000
POR_FOLHA = {'relatorio': 2, 'lista': 2, 'fotos': 4}
FUNDO = (255, 255, 255)


def redimensiona(f, larg):
    im = Image.open(f)
    im = im.convert('RGB')
    if im.width > larg:
        im = im.resize((larg, round(im.height * larg / im.width)), Image.LANCZOS)
    return im


def empilha(imgs, saida):
    """Empilha na vertical, centralizado, com um filete separando as peças."""
    w = max(i.width for i in imgs)
    h = sum(i.height for i in imgs) + 8 * (len(imgs) - 1)
    folha = Image.new('RGB', (w, h), FUNDO)
    y = 0
    for k, i in enumerate(imgs):
        folha.paste(i, ((w - i.width) // 2, y))
        y += i.height
        if k < len(imgs) - 1:
            for x in range(w):
                folha.putpixel((x, y + 3), (170, 170, 170))
            y += 8
    folha.save(saida, quality=88, optimize=True)
    return saida


def campo_de(equipe, campo, larg, por_folha):
    fs = sorted(f for f in glob.glob(os.path.join(equipe, campo, '*'))
                if not os.path.basename(f).startswith('folha_'))
    if not fs:
        return []
    for f in glob.glob(os.path.join(equipe, campo, 'folha_*')):
        os.remove(f)
    if len(fs) == 1:
        return fs
    folhas = []
    for k in range(0, len(fs), por_folha):
        pedaco = [redimensiona(f, larg) for f in fs[k:k + por_folha]]
        alvo = os.path.join(equipe, campo, 'folha_%02d.jpg' % (k // por_folha + 1))
        folhas.append(empilha(pedaco, alvo))
    return folhas


mapa = {}
for equipe in sorted(glob.glob(os.path.join(VISTA, '*'))):
    slug = os.path.basename(equipe)
    mapa[slug] = {
        'relatorio': campo_de(equipe, 'relatorio', LARG_DOC, POR_FOLHA['relatorio']),
        'lista': campo_de(equipe, 'lista', LARG_DOC, POR_FOLHA['lista']),
        'card': campo_de(equipe, 'card', LARG_CARD, 1),
        'fotos': campo_de(equipe, 'fotos', LARG_FOTO, POR_FOLHA['fotos']),
    }

antes = depois = 0
for slug, c in mapa.items():
    for campo, fs in c.items():
        depois += len(fs)
    antes += len(glob.glob(os.path.join(VISTA, slug, '*', '*'))) - sum(
        1 for f in glob.glob(os.path.join(VISTA, slug, '*', '*'))
        if os.path.basename(f).startswith('folha_'))
import json
json.dump(mapa, open(f'mosaicos_{os.path.basename(VISTA)}.json', 'w'))
print(f'{VISTA}: {len(mapa)} equipes | aberturas antes {antes} -> depois {depois}')
print('media por equipe: %.1f -> %.1f' % (antes / len(mapa), depois / len(mapa)))
