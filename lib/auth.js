/* ========================================================================
   Autenticação do ARCHÉ (setores de gestão: Pesquisa, Extensão, Inovação).
   - Login: Google (ID token, botão GIS) e/ou link mágico por e-mail.
   - Sessão: cookie HttpOnly assinado (HMAC, sem dependências novas).
   - Papéis: gestor (PROPPEX) · aprovado (submissor) · pendente.
     Regra: gestores e aprovados ficam em `auth-usuarios-v1`;
     e-mails @uniego.edu.br são aprovados automaticamente.
   - Avaliação Institucional (/arche/) permanece pública.
   ======================================================================== */
import crypto from "node:crypto";

const COOKIE = "arche_sessao";
const DIA = 24 * 60 * 60;
const SESSAO_DIAS = 30;
const USERS_KEY = "auth-usuarios-v1";

function secret() {
  return process.env.SESSION_SECRET || "arche-dev-secret-trocar-em-producao";
}
function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}
function verify(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const esperado = b64u(crypto.createHmac("sha256", secret()).update(body).digest());
  if (mac.length !== esperado.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(esperado))) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (!p.email || !p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

export function lerSessao(req) {
  const raw = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  return raw ? verify(decodeURIComponent(raw.slice(COOKIE.length + 1))) : null;
}
export function emitirCookie(res, { email, nome }) {
  const token = sign({ email: email.toLowerCase(), nome: nome || "", exp: Math.floor(Date.now() / 1000) + SESSAO_DIAS * DIA });
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSAO_DIAS * DIA}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
export function limparCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}

/* ------------------------------ usuários -------------------------------- */
export async function carregarUsuarios(storage) {
  const raw = await storage.get(USERS_KEY);
  const u = raw ? JSON.parse(raw) : {};
  u.gestores = u.gestores?.length ? u.gestores : ["jadsonbelem@gmail.com"];
  u.aprovados = u.aprovados || [];
  u.pendentes = u.pendentes || [];
  return u;
}
export async function salvarUsuarios(storage, u) {
  await storage.set(USERS_KEY, JSON.stringify(u));
}
export function papelDe(email, usuarios) {
  const e = String(email || "").toLowerCase();
  if (usuarios.gestores.includes(e)) return "gestor";
  if (e.endsWith("@uniego.edu.br") || usuarios.aprovados.includes(e)) return "aprovado";
  return "pendente";
}

/* --------------------------- google id token ---------------------------- */
export async function verificarGoogle(credential) {
  const { OAuth2Client } = await import("google-auth-library");
  const cid = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!cid) throw new Error("GOOGLE_WEB_CLIENT_ID não configurado");
  const client = new OAuth2Client(cid);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: cid });
  const p = ticket.getPayload();
  return { email: p.email, nome: p.name || p.email };
}

/* ------------------------------ link mágico ----------------------------- */
export async function criarLinkMagico(storage, email, baseUrl) {
  const token = crypto.randomBytes(24).toString("base64url");
  await storage.set("auth-magic-" + token,
    JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + 20 * 60 * 1000 }));
  return `${baseUrl}/auth/magic/cb?t=${token}`;
}
export async function consumirLinkMagico(storage, token) {
  const raw = await storage.get("auth-magic-" + String(token || ""));
  if (!raw) return null;
  await storage.del("auth-magic-" + token);
  const p = JSON.parse(raw);
  if (p.exp < Date.now()) return null;
  return p.email;
}
