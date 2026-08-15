/* ========================================================================
   Portaria do ARCHÉ AV — Avaliação Institucional.

   O módulo da Avaliação é aberto de propósito: quem avalia (INEP/MEC) e quem
   alimenta o dossiê (professores, coordenações) precisam entrar sem depender
   de conta no portal. Só que o cartão dele mora na PÁGINA INICIAL, à vista de
   qualquer visitante — daí esta portaria: uma senha compartilhada única
   (`AV_SENHA`, "uniego" por padrão), só para barrar quem passou por ali sem
   ter o que fazer lá dentro.

   NÃO é login e não deve virar um: a portaria não sabe quem entrou, não tem
   papel, não abre nenhum setor da gestão e não grava nada em nome de
   ninguém. O que ela decide é uma coisa só — se a porta abre.

   Três formas de passar, todas equivalentes:
     1. digitar a senha na portaria;
     2. já estar logado no ARCHÉ (professor, coordenação, gestão);
     3. chegar por um LINK DE ACESSO (`?acesso=…`) — é o que se manda ao
        avaliador do MEC, que não tem conta nem precisa decorar senha.

   A chave do link é derivada do segredo da sessão com um rótulo versionado:
   trocar `AV_LINK_VERSAO` invalida todos os links distribuídos de uma vez,
   sem mexer no código nem derrubar as sessões de ninguém.
   ======================================================================== */
import { selar, conferirSelo, derivado } from "./auth.js";

const COOKIE = "arche_av";
const DIAS = 30;

/** A senha da portaria. Trocar = mexer na env var, não no código. */
export const senhaAv = () => String(process.env.AV_SENHA || "uniego");

/** Confere a senha digitada (sem caixa nem espaço às bordas). */
export const senhaConfere = (v) =>
  String(v ?? "").trim().toLowerCase() === senhaAv().trim().toLowerCase();

/** A chave do link de acesso direto — estável enquanto a versão não mudar. */
export const chaveAcesso = () =>
  derivado(`av-link-v${process.env.AV_LINK_VERSAO || "1"}`);

export const linkAcesso = (base) =>
  `${String(base || "").replace(/\/$/, "")}/arche/?acesso=${chaveAcesso()}`;

/** A área que a portaria protege. */
export const AREA_AV = /^\/arche(\/|$)/;

export function lerSelo(req) {
  const raw = String(req.headers.cookie || "").split(/;\s*/)
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const selo = conferirSelo(decodeURIComponent(raw.slice(COOKIE.length + 1)));
  return selo?.av ? selo : null;
}

export function emitirSelo(res, via = "senha") {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const token = selar({ av: true, via }, DIAS);
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DIAS * 24 * 60 * 60}${seguro}`);
}

/**
 * Para onde voltar depois de abrir a porta. Só endereços de dentro do
 * próprio módulo — um `next` livre viraria redirecionamento aberto.
 */
export function destinoSeguro(v) {
  const alvo = String(v || "");
  return /^\/arche(\/|$|\?)/.test(alvo) ? alvo : "/arche/";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** A tela da portaria. Autossuficiente: só depende do CSS institucional. */
export function paginaPortaria(destino = "/arche/") {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Avaliação Institucional · ARCHÉ</title>
<link rel="icon" href="/arche/favicon.svg">
<link rel="stylesheet" href="/assets/arche-ui.css">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:24px;background:#eef1f4;color:#182632;
       font-family:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  /* flex:none anula o main{flex:1} do CSS institucional, que esticaria o cartão */
  .cx{flex:none;width:100%;max-width:420px;background:#fff;border:1px solid #dde4e8;
      border-radius:16px;padding:32px 28px;box-shadow:0 12px 32px rgba(28,55,66,.08)}
  .mod{display:block;font-size:12px;letter-spacing:.18em;color:#40717e;margin-bottom:14px}
  .mod b{color:#1c3742}
  h1{font-size:21px;margin:0 0 6px;color:#1c3742}
  p.sub{margin:0 0 22px;color:#657179;font-size:14px;line-height:1.5}
  label{display:block;font-size:13px;color:#657179;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #dde4e8;
        border-radius:10px;font-size:15px;font-family:inherit;background:#fff;color:#182632}
  input:focus{outline:none;border-color:#40717e;box-shadow:0 0 0 3px #e6f5fa}
  button{width:100%;margin-top:16px;padding:12px 14px;border:0;border-radius:10px;
         background:#1c3742;color:#fff;font-size:15px;font-family:inherit;cursor:pointer}
  button:hover{background:#2d535c}
  .erro{margin-top:14px;padding:10px 12px;border-radius:10px;background:#fdecea;color:#a1524c;
        font-size:13.5px;display:none}
  .pe{margin-top:22px;padding-top:18px;border-top:1px solid #dde4e8;color:#657179;
      font-size:12.5px;line-height:1.55}
  .pe a{color:#40717e}
</style>
</head>
<body>
  <main class="cx">
    <span class="mod">ARCHÉ <b>AV</b></span>
    <h1>Avaliação Institucional</h1>
    <p class="sub">Área de apoio à avaliação in loco. Informe a senha de acesso
      institucional para continuar.</p>
    <form id="f" autocomplete="off">
      <label for="s">Senha de acesso</label>
      <input id="s" type="password" name="senha" required autofocus>
      <button type="submit">Entrar</button>
      <div class="erro" id="e"></div>
    </form>
    <p class="pe">Avaliadores do MEC, professores e coordenações recebem um
      <b>link de acesso direto</b> da PROPPEX — por ele a senha não é pedida.
      Quem já tem conta no ARCHÉ pode <a href="/entrar?next=${esc(encodeURIComponent(destino))}">entrar
      pelo portal</a>.</p>
  </main>
<script>
const dest = ${JSON.stringify(destino)};
document.getElementById("f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById("e");
  erro.style.display = "none";
  try {
    const r = await fetch("/api/av/entrar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: document.getElementById("s").value, next: dest }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { location.href = d.next || dest; return; }
    erro.textContent = d.error || "Senha incorreta.";
  } catch {
    erro.textContent = "Não foi possível verificar agora. Tente de novo.";
  }
  erro.style.display = "block";
  document.getElementById("s").select();
});
</script>
</body>
</html>`;
}
