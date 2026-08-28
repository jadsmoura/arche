"""Reordena o ZIP do .docx: [Content_Types].xml primeiro e sem entradas de diretório.
O Word aceita a ordem que o docx-js gera; o LibreOffice recusa."""
import shutil, sys, zipfile

origem = sys.argv[1]
destino = sys.argv[2] if len(sys.argv) > 2 else origem

with zipfile.ZipFile(origem) as z:
    nomes = [n for n in z.namelist() if not n.endswith('/')]
    dados = {n: z.read(n) for n in nomes}

ordem = ['[Content_Types].xml'] + [n for n in nomes if n != '[Content_Types].xml']
tmp = destino + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
    for i, n in enumerate(ordem):
        # o primeiro entra sem compressão, como o Word faz
        z.writestr(n, dados[n], zipfile.ZIP_STORED if i == 0 else zipfile.ZIP_DEFLATED)
shutil.move(tmp, destino)
print('reempacotado:', destino)
