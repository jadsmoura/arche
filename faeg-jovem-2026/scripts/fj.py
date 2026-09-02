"""Cliente de LEITURA da plataforma Faeg Jovem. Só GET, exceto o login."""
import json, os, sys, urllib.request, urllib.error

API = "https://api.infosindical.sistemafaeg.org.br/rest"
ORIGEM = "https://faegjovem.sistemafaeg.org.br"
_token = None

def _req(url, dados=None, metodo=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    r = urllib.request.Request(url, data=corpo, method=metodo or ("POST" if corpo else "GET"))
    r.add_header("Content-Type", "application/json")
    r.add_header("Origin", ORIGEM)
    r.add_header("Referer", ORIGEM + "/")
    if _token:
        r.add_header("Authorization", "Bearer " + _token)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return 0, str(e)[:200]

def entrar():
    global _token
    s, d = _req(f"{API}/login/logar", {
        "email": os.environ["FJ_EMAIL"], "password": os.environ["FJ_SENHA"], "rememberMe": ""})
    if s == 200 and isinstance(d, dict) and d.get("access_token"):
        _token = d["access_token"]
        return d
    raise SystemExit(f"login falhou: {s} {d}")

def get(caminho):
    return _req(f"{API}{caminho}")

def esqueleto(o, prof=0, max_prof=3):
    """Mostra a FORMA do dado, não o conteúdo — nomes e contatos ficam de fora."""
    if prof > max_prof: return "..."
    if isinstance(o, dict):
        return {k: esqueleto(v, prof+1, max_prof) for k, v in list(o.items())[:40]}
    if isinstance(o, list):
        return [f"<lista de {len(o)}>"] + ([esqueleto(o[0], prof+1, max_prof)] if o else [])
    if isinstance(o, str):
        return f"<str:{len(o)}>" if len(o) > 60 else o
    return o
