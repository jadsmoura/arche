/* ========================================================================
   Autenticação do ARCHÉ (setores de gestão: Pesquisa, Extensão, Inovação).
   - Login: Google (ID token, botão GIS) e/ou link mágico por e-mail.
   - Sessão: cookie HttpOnly assinado (HMAC, sem dependências novas).
   - Papéis: gestor (PROPPEX) · aprovado (submissor) · pendente.
     Regra: gestores e aprovados ficam em `auth-usuarios-v1`;
     e-mails @uniego.edu.br são aprovados automaticamente.
   - Avaliação Institucional (/arche/) segue sem login: a barreira dela é a
     portaria (lib/portaria.js), que usa os selos daqui e não cria sessão.
   ======================================================================== */
import crypto from "node:crypto";
import { promisify } from "node:util";

const COOKIE = "arche_sessao";
const DIA = 24 * 60 * 60;
const SESSAO_DIAS = 30;      // validade do cookie
const RENOVAR_APOS = 10;     // renova quando faltar menos de 20 dias
const TETO_DIAS = 180;       // um cookie não se renova para sempre
const USERS_KEY = "auth-usuarios-v1";
const CONFIG_KEY = "auth-config-v1";
const SENHAS_KEY = "auth-senhas-v1";

// Segredo de assinatura da sessão. Prioridade: variável de ambiente; se ela
// não existir, um segredo próprio é gerado e PERSISTIDO no estado — assim o
// sistema nunca assina sessão com o valor de desenvolvimento que está no
// repositório, e as sessões sobrevivem a mudanças de ambiente.
let SEGREDO = null;
export async function iniciarAuth(storage) {
  if (process.env.SESSION_SECRET) { SEGREDO = process.env.SESSION_SECRET; return "ambiente"; }
  try {
    const raw = await storage.get(CONFIG_KEY);
    const cfg = raw ? JSON.parse(raw) : {};
    if (cfg.sessionSecret) { SEGREDO = cfg.sessionSecret; return "persistido"; }
    SEGREDO = crypto.randomBytes(32).toString("base64url");
    await storage.set(CONFIG_KEY, JSON.stringify({ ...cfg, sessionSecret: SEGREDO, criadoEm: new Date().toISOString() }));
    await storage.flush?.();
    console.warn("[auth] SESSION_SECRET ausente — segredo próprio gerado e persistido");
    return "gerado";
  } catch (e) {
    console.error("[auth] falha ao preparar o segredo de sessão:", e.message);
    return "falhou";
  }
}
function secret() {
  return SEGREDO || process.env.SESSION_SECRET || "arche-dev-secret-trocar-em-producao";
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

/* ---------------------- selos (barreiras sem pessoa) --------------------- */
/* A sessão acima identifica QUEM entrou. Há barreiras que não identificam
   ninguém — hoje só a portaria da Avaliação Institucional, que é uma senha
   compartilhada. Elas usam o mesmo segredo, mas nunca viram sessão: o selo
   não carrega e-mail e não abre nenhum setor da gestão. */
export function selar(dados, dias = 30) {
  const agora = Math.floor(Date.now() / 1000);
  return sign({ ...dados, exp: agora + dias * DIA });
}
export function conferirSelo(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const esperado = b64u(crypto.createHmac("sha256", secret()).update(body).digest());
  if (mac.length !== esperado.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(esperado))) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return p.exp && p.exp >= Date.now() / 1000 ? p : null;
  } catch { return null; }
}
/** Valor estável derivado do segredo — a chave do link de acesso direto. */
export function derivado(rotulo) {
  return crypto.createHmac("sha256", secret()).update(String(rotulo)).digest("hex").slice(0, 24);
}

const seguro = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");
export function emitirCookie(res, { email, nome, iat }) {
  const agora = Math.floor(Date.now() / 1000);
  const token = sign({
    email: email.toLowerCase(), nome: nome || "",
    iat: iat || agora,                       // instante do login original
    exp: agora + SESSAO_DIAS * DIA,
  });
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSAO_DIAS * DIA}${seguro()}`);
}

/**
 * Sessão deslizante: quem usa o sistema não deve ser deslogado.
 * Antes, os 30 dias contavam do login e nunca se estendiam — quem entrava
 * todo dia era desconectado no 30º igual a quem nunca voltou. Agora a janela
 * se renova a cada acesso, com teto absoluto para um cookie roubado não valer
 * para sempre.
 */
export function renovarSessao(res, sessao) {
  if (!res || !sessao || res.headersSent) return false;
  const agora = Math.floor(Date.now() / 1000);
  if (sessao.exp - agora > RENOVAR_APOS * DIA) return false;   // ainda tem folga
  if (agora - (sessao.iat || agora) > TETO_DIAS * DIA) return false;
  emitirCookie(res, { email: sessao.email, nome: sessao.nome, iat: sessao.iat });
  return true;
}

export function limparCookie(res) {
  // os atributos precisam espelhar os do cookie emitido, senão o navegador
  // trata como outro cookie e a sessão continua de pé
  res.setHeader("Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro()}`);
}

/* ------------------------------- senhas --------------------------------- */
// scrypt do próprio Node (sem dependência nova). Parâmetros no formato do
// registro para permitir endurecer o custo no futuro sem invalidar o que
// já está gravado.
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

export async function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(String(senha), salt, SCRYPT.keylen,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function conferirSenha(senha, registro) {
  try {
    const [alg, N, r, p, salt, hash] = String(registro || "").split("$");
    if (alg !== "scrypt" || !salt || !hash) return false;
    const esperado = Buffer.from(hash, "base64");
    const dk = await scrypt(String(senha), Buffer.from(salt, "base64"), esperado.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
    return dk.length === esperado.length && crypto.timingSafeEqual(dk, esperado);
  } catch { return false; }
}

export async function carregarSenhas(storage) {
  try {
    const raw = await storage.get(SENHAS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
export async function definirSenha(storage, email, senha, extra = {}) {
  const e = String(email || "").toLowerCase();
  const senhas = await carregarSenhas(storage);
  const antes = senhas[e];
  senhas[e] = {
    hash: await hashSenha(senha),
    criadoEm: antes?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    // Senha provisória: a que o gestor coloca quando a pessoa perdeu o
    // acesso. Vale por poucos dias e obriga a troca no primeiro login —
    // quando a pessoa define a própria senha, a marca some sozinha (este
    // registro é reescrito sem `provisoria`).
    ...(extra.provisoria ? { provisoria: true, por: String(extra.por || "").toLowerCase() } : {}),
  };
  await storage.set(SENHAS_KEY, JSON.stringify(senhas));
  await storage.flush?.();   // senha só vale se estiver realmente gravada
}

/** O que se sabe da senha de alguém — sem nunca expor o hash. */
export async function senhaInfo(storage, email) {
  const reg = (await carregarSenhas(storage))[String(email || "").toLowerCase()];
  if (!reg?.hash) return { tem: false };
  return {
    tem: true,
    provisoria: !!reg.provisoria,
    por: reg.por || "",
    atualizadoEm: reg.atualizadoEm || reg.criadoEm || "",
  };
}
export async function temSenha(storage, email) {
  const senhas = await carregarSenhas(storage);
  return !!senhas[String(email || "").toLowerCase()]?.hash;
}
export async function validarSenhaDe(storage, email, senha) {
  const reg = (await carregarSenhas(storage))[String(email || "").toLowerCase()];
  if (!reg?.hash) {
    // custo semelhante ao de uma conferência real, para não revelar pelo
    // tempo de resposta se a conta existe
    await hashSenha(String(senha || "") + "inexistente");
    return false;
  }
  return conferirSenha(senha, reg.hash);
}

/** Regra mínima de senha: uma só exigência, para não afastar os docentes. */
export function senhaFraca(senha) {
  const s = String(senha || "");
  if (s.length < 8) return "Use pelo menos 8 caracteres.";
  if (/^(\d)\1+$/.test(s) || /^(012345|123456|1234567|12345678|senha|password)/i.test(s))
    return "Escolha uma senha menos óbvia.";
  return null;
}

/* --------------- proteção contra tentativas repetidas -------------------- */
// Contador em memória: o processo hiberna no plano free, mas um ataque em
// curso mantém o serviço acordado, que é justamente quando o limite importa.
const tentativas = new Map();
const JANELA_MS = 15 * 60 * 1000, MAX_TENTATIVAS = 8;
export function registrarFalha(chave) {
  const agora = Date.now();
  const t = tentativas.get(chave)?.filter((x) => agora - x < JANELA_MS) || [];
  t.push(agora);
  tentativas.set(chave, t);
  if (tentativas.size > 5000) tentativas.clear();   // guarda contra crescimento
}
export function bloqueado(chave) {
  const agora = Date.now();
  const t = tentativas.get(chave)?.filter((x) => agora - x < JANELA_MS) || [];
  tentativas.set(chave, t);
  return t.length >= MAX_TENTATIVAS;
}
export function limparFalhas(chave) { tentativas.delete(chave); }

/* ------------------------------ usuários -------------------------------- */
// Papéis: gestor (geral) > coordenador (gestão limitada a módulos) >
//         aprovado (submissor) > pendente.
export const MODULOS = ["extensao", "pesquisa", "inovacao", "atas"];

/* --------------------------- função na instituição -----------------------
   O que a pessoa FAZ na instituição — diferente do papel no sistema (gestor,
   coordenador de módulo, submissor), que diz o que ela pode. A lista é
   fechada, com "outro" para o que não couber: sem isso cada um escreve o
   cargo de um jeito e a gestão não consegue agrupar ninguém.
   Ao mexer aqui, preserve os `codigo` — é o que fica gravado no perfil. */
export const FUNCOES = [
  { codigo: "professor", nome: "Professor(a)" },
  { codigo: "professor-pesquisador", nome: "Professor(a) Pesquisador(a)" },
  { codigo: "coord-curso", nome: "Coordenador(a) de Curso" },
  { codigo: "coord-pedagogico", nome: "Coordenador(a) Pedagógico(a)" },
  { codigo: "secretaria", nome: "Secretaria" },
  { codigo: "coord-pesquisa", nome: "Coordenação de Pesquisa e Inovação", orgao: "PROPPEX" },
  { codigo: "coord-extensao", nome: "Coordenação de Extensão", orgao: "PROPPEX" },
  { codigo: "coord-acao-comunitaria", nome: "Coordenação de Ação Comunitária", orgao: "PROPPEX" },
  { codigo: "coord-ensino", nome: "Coordenação de Ensino", orgao: "PROAC" },
  { codigo: "coord-politicas", nome: "Coordenação de Políticas Institucionais", orgao: "PROAC" },
  { codigo: "outro", nome: "Outro (especificar)" },
];

/**
 * Aceita o código, o nome por extenso ou o texto livre que já estava
 * gravado — os perfis antigos traziam "Docente do curso", "Coordenadora"…
 * O que não casar vira "outro", e o texto original se preserva à parte
 * (funcaoOutro), para nada se perder na conversão.
 */
export function normalizarFuncao(v) {
  const t = String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return "";
  const achado = FUNCOES.find((f) => f.codigo === t
    || f.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === t);
  if (achado) return achado.codigo;
  if (/secretari/.test(t)) return "secretaria";
  if (/pesquisador/.test(t)) return "professor-pesquisador";
  if (/coorden/.test(t) && /pedagog/.test(t)) return "coord-pedagogico";
  if (/coorden/.test(t) && /(curso|graduacao)/.test(t)) return "coord-curso";
  if (/coorden/.test(t) && /(pesquisa|inovacao)/.test(t)) return "coord-pesquisa";
  if (/coorden/.test(t) && /extensao/.test(t)) return "coord-extensao";
  if (/coorden/.test(t) && /(acao comunitaria|comunitari)/.test(t)) return "coord-acao-comunitaria";
  if (/coorden/.test(t) && /ensino/.test(t)) return "coord-ensino";
  if (/coorden/.test(t) && /politic/.test(t)) return "coord-politicas";
  if (/(docente|professor)/.test(t)) return "professor";
  return "outro";
}
export const funcaoNome = (codigo, outro = "") => {
  const f = FUNCOES.find((x) => x.codigo === codigo);
  if (!f) return String(outro || "") || "—";
  return f.codigo === "outro" ? (String(outro || "").trim() || "Outro") : f.nome;
};
const GESTORES_FIXOS = ["jadsonbelem@gmail.com", "jadson.moura@uniego.edu.br"];

export async function carregarUsuarios(storage) {
  const raw = await storage.get(USERS_KEY);
  const u = raw ? JSON.parse(raw) : {};
  u.gestores = Array.from(new Set([...(u.gestores || []), ...GESTORES_FIXOS]));
  u.coordenadores = u.coordenadores || {}; // { email: ["extensao", ...] }
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
  if (usuarios.coordenadores[e]?.length) return "coordenador";
  if (e.endsWith("@uniego.edu.br") || usuarios.aprovados.includes(e)) return "aprovado";
  return "pendente";
}
export function modulosDe(email, usuarios) {
  const e = String(email || "").toLowerCase();
  if (usuarios.gestores.includes(e)) return [...MODULOS];
  return usuarios.coordenadores[e] || [];
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

/* --------------------------- código por e-mail --------------------------- */
export async function criarCodigo(storage, email) {
  const codigo = String(crypto.randomInt(100000, 1000000));
  // 30 minutos: o trajeto real é sair do site, abrir o e-mail, esperar a
  // entrega e voltar — com 10 minutos o código expirava e a pessoa pedia
  // outro, que é exatamente a queixa dos professores.
  await storage.set("auth-otp-" + email.toLowerCase(),
    JSON.stringify({ codigo, exp: Date.now() + 30 * 60 * 1000, tent: 0 }));
  return codigo;
}
export async function verificarCodigo(storage, email, codigo) {
  const chave = "auth-otp-" + String(email || "").toLowerCase();
  const raw = await storage.get(chave);
  if (!raw) return false;
  const p = JSON.parse(raw);
  if (p.exp < Date.now() || p.tent >= 5) { await storage.del(chave); return false; }
  if (String(codigo || "").trim() !== p.codigo) {
    p.tent++; await storage.set(chave, JSON.stringify(p)); return false;
  }
  await storage.del(chave);
  return true;
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
