/* ========================================================================
   ARCHÉ — servidor unificado (portal + setores)
   - Serve o super-portal e todos os setores em public/.
   - API de persistência (/api/estado*) e uploads (/api/drive/*).
   - Modo LOCAL por padrão (arquivo + disco); MySQL/S3/Google Drive quando
     as variáveis de ambiente correspondentes estiverem definidas.
   ======================================================================== */
import "dotenv/config";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStorage } from "./lib/storage.js";
import { getFiles, slug } from "./lib/files.js";
import { varrer, varrerSeVencido, dispensar, situacao } from "./lib/cobranca.js";
import {
  lerSessao, emitirCookie, limparCookie, renovarSessao, carregarUsuarios, salvarUsuarios,
  papelDe, modulosDe, MODULOS, verificarGoogle, criarCodigo, verificarCodigo,
  iniciarAuth, definirSenha, temSenha, validarSenhaDe, senhaFraca,
  registrarFalha, bloqueado, limparFalhas,
} from "./lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");

const app = express();
const port = Number(process.env.PORT || 3000);

const storage = await getStorage();
const files = await getFiles();
const origemSegredo = await iniciarAuth(storage);
console.log(`ARCHÉ · persistência: ${storage.mode} · arquivos: ${files.mode} · sessão: ${origemSegredo}`);

// atrás do proxy do Render/Cloudflare: necessário para reconhecer o IP real
app.set("trust proxy", 1);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.text({ type: "text/plain", limit: "50mb" }));

function stateKey(req) {
  const key = String(req.query.chave || req.body?.chave || "").trim();
  if (!key) throw new Error("chave obrigatória");
  return key;
}

/* ---------------------------- AUTENTICAÇÃO ------------------------------ */
// `res` opcional: quando informado, a sessão é renovada (sessão deslizante).
async function usuarioDe(req, res) {
  const s = lerSessao(req);
  if (!s) return null;
  if (res) renovarSessao(res, s);
  const usuarios = await carregarUsuarios(storage);
  return {
    email: s.email, nome: s.nome, iat: s.iat || null,
    papel: papelDe(s.email, usuarios),
    modulos: modulosDe(s.email, usuarios),
  };
}
async function exigirGestor(req, res) {
  const u = await usuarioDe(req);
  if (!u || u.papel !== "gestor") { res.status(403).json({ error: "Acesso restrito à PROPPEX" }); return null; }
  return u;
}
// gestor geral OU coordenador do módulo em questão
async function exigirGestao(req, res, modulo) {
  const u = await usuarioDe(req);
  if (!u || !u.modulos.includes(modulo)) {
    res.status(403).json({ error: "Acesso restrito à gestão deste módulo" }); return null;
  }
  return u;
}

// Gatilho oportunista das tarefas de fundo: o plano free hiberna, então o
// tráfego do portal é o que garante que a cobrança de relatórios rode mesmo
// depois de o processo dormir. Não bloqueia a requisição (sem await).
app.use((_req, _res, next) => {
  next();
  varrerSeVencido(storage, "trafego");
});

// Setores de gestão exigem login (Avaliação Institucional continua aberta).
const AREAS_PROTEGIDAS = /^\/(extensao|pesquisa|inovacao|usuarios)(\/|$)/;
app.use(async (req, res, next) => {
  if (req.method !== "GET" || !AREAS_PROTEGIDAS.test(req.path)) return next();
  const u = await usuarioDe(req, res);   // renova a sessão de quem está usando
  if (!u) return res.redirect("/entrar?next=" + encodeURIComponent(req.originalUrl));
  if (u.papel === "pendente") return res.redirect("/entrar?pendente=1");
  if (req.path.startsWith("/usuarios") && u.papel !== "gestor") return res.redirect("/");
  next();
});

app.get("/api/authcfg", (_req, res) => res.json({ googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || null }));

const PERFIS_KEY = "auth-perfis-v1";
async function carregarPerfis() {
  const raw = await storage.get(PERFIS_KEY);
  return raw ? JSON.parse(raw) : {};
}

app.get("/api/me", async (req, res) => {
  const u = await usuarioDe(req, res);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const perfis = await carregarPerfis();
  res.json({ ...u, perfil: perfis[u.email] || null, temSenha: await temSenha(storage, u.email) });
});

// Ficha do usuário vinculada à conta (a chave é o e-mail da sessão).
// Campos livres são limitados no tamanho para não inflar o estado, que é
// regravado por inteiro a cada gravação.
const txt = (v, max = 120) => String(v ?? "").trim().slice(0, max);

app.post("/api/perfil", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const b = req.body || {};
  if (!txt(b.nome) || !txt(b.funcao) || !txt(b.curso))
    return res.status(400).json({ error: "Preencha nome, função e curso" });

  const perfis = await carregarPerfis();
  const antes = perfis[u.email] || {};
  perfis[u.email] = {
    ...antes,
    // identificação
    nome: txt(b.nome), tratamento: txt(b.tratamento, 60), titulacao: txt(b.titulacao, 20),
    // vínculo institucional
    funcao: txt(b.funcao), curso: txt(b.curso), vinculo: txt(b.vinculo, 40),
    matricula: txt(b.matricula, 40),
    // contato
    telefone: txt(b.telefone, 40), whatsapp: txt(b.whatsapp, 40),
    emailAlternativo: txt(b.emailAlternativo, 120).toLowerCase(),
    // currículo
    lattes: txt(b.lattes, 200), orcid: txt(b.orcid, 40),
    resumo: txt(b.resumo, 600),
    // foto é gravada pela rota própria
    foto: antes.foto || null,
    email: u.email,
    criadoEm: antes.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
  await storage.set(PERFIS_KEY, JSON.stringify(perfis));
  res.json({ ok: true, perfil: perfis[u.email] });
});

// Foto do perfil. O navegador já envia a imagem redimensionada; aqui só
// entram tipos de imagem e um limite de tamanho, e o arquivo vai para o
// mesmo armazenamento dos demais (Drive em produção).
app.post("/api/perfil/foto", upload.single("file"), async (req, res) => {
  try {
    const u = await usuarioDe(req);
    if (!u) return res.status(401).json({ error: "não autenticado" });
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
    if (!/^image\/(jpeg|png|webp)$/.test(req.file.mimetype || ""))
      return res.status(400).json({ error: "Envie uma imagem JPG, PNG ou WEBP" });
    if (req.file.size > 3 * 1024 * 1024)
      return res.status(400).json({ error: "Imagem muito grande (máximo 3 MB)" });

    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const data = await files.save({
      buffer: req.file.buffer,
      originalName: `foto-${slug(u.email)}.${ext}`,
      prefix: `perfis/${slug(u.email)}`,
    });
    const perfis = await carregarPerfis();
    perfis[u.email] = { ...(perfis[u.email] || {}), email: u.email, foto: data.link,
      atualizadoEm: new Date().toISOString() };
    await storage.set(PERFIS_KEY, JSON.stringify(perfis));
    res.json({ ok: true, foto: data.link });
  } catch (e) {
    console.error("Erro ao gravar a foto do perfil:", e);
    res.status(500).json({ error: e.message || "Não foi possível gravar a foto" });
  }
});

app.delete("/api/perfil/foto", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const perfis = await carregarPerfis();
  if (perfis[u.email]) {
    perfis[u.email] = { ...perfis[u.email], foto: null, atualizadoEm: new Date().toISOString() };
    await storage.set(PERFIS_KEY, JSON.stringify(perfis));
  }
  res.json({ ok: true });
});

app.post("/auth/google", async (req, res) => {
  try {
    const { email, nome } = await verificarGoogle(req.body?.credential);
    emitirCookie(res, { email, nome });
    const usuarios = await carregarUsuarios(storage);
    const papel = papelDe(email, usuarios);
    if (papel === "pendente" && !usuarios.pendentes.some((p) => p.email === email.toLowerCase())) {
      usuarios.pendentes.push({ email: email.toLowerCase(), nome, quando: new Date().toISOString() });
      await salvarUsuarios(storage, usuarios);
      notificarPendente(email, nome).catch(() => {});
    }
    res.json({ ok: true, papel });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

async function enviarCodigoPorEmail(email, codigo) {
  // Modo de desenvolvimento: sem os segredos do Gmail o envio real é
  // impossível — o código vai para o log em vez de travar o teste local.
  // Nunca ativar em produção (o professor ficaria esperando um e-mail).
  if (process.env.AUTH_CODIGO_LOG === "1") {
    console.log(`[auth][dev] código de ${email}: ${codigo}`);
    return;
  }
  const { enviarEmail } = await import("./lib/mailer.js");
  await enviarEmail({
    para: email,
    assunto: `${codigo} é o seu código de acesso ao ARCHÉ`,
    corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:480px">
      <h2 style="color:#1c3742">Acesso ao ARCHÉ · PROPPEX</h2>
      <p>Use o código abaixo na tela de acesso. Ele vale por <b>30 minutos</b>.</p>
      <p style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1c3742;background:#e8f4f8;
        border-radius:10px;padding:16px 20px;text-align:center">${codigo}</p>
      <p style="color:#5b7280;font-size:13px">Depois de entrar, você pode <b>criar uma senha</b> e não
        precisar mais esperar por este e-mail.</p>
      <p style="color:#5b7280;font-size:12px">Se você não solicitou este acesso, ignore este e-mail.</p></div>`,
  });
}

app.post("/auth/codigo", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "E-mail inválido" });
    await enviarCodigoPorEmail(email, await criarCodigo(storage, email));
    res.json({ ok: true });
  } catch (e) {
    console.error("codigo:", e.message);
    res.status(500).json({ ok: false, error: "Falha ao enviar o e-mail" });
  }
});

app.post("/auth/codigo/verificar", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const okCodigo = await verificarCodigo(storage, email, req.body?.codigo);
  if (!okCodigo) return res.status(400).json({ ok: false, error: "Código inválido ou expirado" });
  emitirCookie(res, { email, nome: email });
  const usuarios = await carregarUsuarios(storage);
  const papel = papelDe(email, usuarios);
  if (papel === "pendente" && !usuarios.pendentes.some((p) => p.email === email)) {
    usuarios.pendentes.push({ email, nome: email, quando: new Date().toISOString() });
    await salvarUsuarios(storage, usuarios);
    notificarPendente(email, email).catch(() => {});
  }
  // temSenha diz à tela se vale oferecer a criação de senha logo após entrar
  res.json({ ok: true, papel, temSenha: await temSenha(storage, email) });
});

/* ------------------------------ SENHA ----------------------------------- */
// Identificação em duas etapas: a tela pergunta só o e-mail e o servidor
// responde por qual caminho aquela conta entra. A resposta é a mesma para
// conta inexistente, para não revelar quem tem cadastro.
app.post("/auth/inicio", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ ok: false, error: "Digite um e-mail válido." });
  try {
    if (await temSenha(storage, email)) return res.json({ ok: true, metodo: "senha" });
    const codigo = await criarCodigo(storage, email);
    await enviarCodigoPorEmail(email, codigo);
    res.json({ ok: true, metodo: "codigo" });
  } catch (e) {
    console.error("inicio:", e.message);
    res.status(500).json({ ok: false, error: "Não foi possível enviar o código agora." });
  }
});

app.post("/auth/senha", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  const chaveIp = "ip:" + (req.ip || "0"), chaveEmail = "em:" + email;
  if (bloqueado(chaveEmail) || bloqueado(chaveIp))
    return res.status(429).json({ ok: false, error: "Muitas tentativas. Aguarde 15 minutos ou entre com um código por e-mail." });
  if (!email || !senha) return res.status(400).json({ ok: false, error: "Informe e-mail e senha." });

  if (!(await validarSenhaDe(storage, email, senha))) {
    registrarFalha(chaveEmail); registrarFalha(chaveIp);
    return res.status(400).json({ ok: false, error: "Senha incorreta." });
  }
  limparFalhas(chaveEmail); limparFalhas(chaveIp);
  emitirCookie(res, { email, nome: email });
  const usuarios = await carregarUsuarios(storage);
  res.json({ ok: true, papel: papelDe(email, usuarios) });
});

// Criar ou trocar a senha. Exige a senha atual, exceto logo após entrar por
// código/Google (aí a posse do e-mail acabou de ser provada).
app.post("/auth/senha/definir", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ ok: false, error: "Faça login para definir a senha." });
  const senha = String(req.body?.senha || "");
  const fraca = senhaFraca(senha);
  if (fraca) return res.status(400).json({ ok: false, error: fraca });

  const jaTem = await temSenha(storage, u.email);
  const loginRecente = u.iat && (Date.now() / 1000 - u.iat) < 30 * 60;
  if (jaTem && !loginRecente) {
    const atual = String(req.body?.senhaAtual || "");
    if (!(await validarSenhaDe(storage, u.email, atual)))
      return res.status(400).json({ ok: false, error: "A senha atual não confere." });
  }
  await definirSenha(storage, u.email, senha);
  emitirCookie(res, { email: u.email, nome: u.nome });   // renova a sessão
  res.json({ ok: true });
});

// Sair por POST: como GET, o link era disparado por pré-carregamento do
// navegador, antivírus e toque acidental no celular — deslogando sozinho.
app.post("/auth/sair", (req, res) => { limparCookie(res); res.json({ ok: true }); });
app.get("/auth/sair", (req, res) => {
  res.type("html").send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Sair · ARCHÉ</title>
    <link rel="stylesheet" href="/assets/arche-ui.css"><style>body{align-items:center;justify-content:center;padding:20px}
    .box{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px;max-width:400px;
    width:100%;text-align:center;box-shadow:var(--shadow-lg)}</style></head><body><div class="box">
    <h1 style="font-family:Archivo,sans-serif;font-size:20px;margin-bottom:8px">Sair do ARCHÉ?</h1>
    <p style="color:var(--muted);font-size:14px;margin-bottom:20px">Você precisará entrar novamente para acessar os setores de gestão.</p>
    <form method="POST" action="/auth/sair" onsubmit="fetch('/auth/sair',{method:'POST'}).then(()=>location.href='/');return false">
      <button class="bt bt-pri" style="width:100%" type="submit">Sim, sair</button></form>
    <p style="margin-top:14px"><a href="/" style="color:var(--brand-2);font-weight:600;font-size:13px">← voltar ao portal</a></p>
    </div></body></html>`);
});

async function notificarPendente(email, nome) {
  const { enviarEmail } = await import("./lib/mailer.js");
  await enviarEmail({
    assunto: `[ARCHÉ] Novo acesso aguardando aprovação: ${email}`,
    corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif">
      <p><b>${nome}</b> (${email}) entrou no ARCHÉ e aguarda aprovação como submissor.</p>
      <p><a href="${(process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "")}/usuarios/">Abrir gestão de acessos</a></p></div>`,
  });
}

/* usuários (somente gestor) */
app.get("/api/usuarios", async (req, res) => {
  if (!(await exigirGestor(req, res))) return;
  res.json(await carregarUsuarios(storage));
});
app.post("/api/usuarios", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const { acao, email, modulos } = req.body || {};
  const e = String(email || "").trim().toLowerCase();
  if (!e) return res.status(400).json({ error: "e-mail obrigatório" });
  const u = await carregarUsuarios(storage);
  u.pendentes = u.pendentes.filter((p) => p.email !== e);
  u.aprovados = u.aprovados.filter((x) => x !== e);
  u.gestores = u.gestores.filter((x) => x !== e);
  delete u.coordenadores[e];
  if (acao === "aprovar") u.aprovados.push(e);
  else if (acao === "promover") u.gestores.push(e);
  else if (acao === "coordenar") {
    const mods = (Array.isArray(modulos) ? modulos : []).filter((m) => MODULOS.includes(m));
    if (!mods.length) return res.status(400).json({ error: "Informe ao menos um módulo" });
    u.coordenadores[e] = mods;
  }
  else if (acao !== "remover") return res.status(400).json({ error: "ação inválida" });
  await salvarUsuarios(storage, u); // gestores fixos são re-garantidos no carregar
  res.json(await carregarUsuarios(storage));
});

// Curso de origem do upload: campo explícito no form, ou deduzido da página
// que enviou (Referer). A página raiz de avaliação/dossiê é a piloto
// (Psicologia); as demais vivem em subpastas com o slug do curso.
function cursoFrom(req) {
  const explicit = String(req.body?.curso || "").trim();
  if (explicit) return slug(explicit);
  const ref = String(req.headers.referer || "");
  const sub = ref.match(/\/arche\/(?:avaliacao|dossie)\/([a-z0-9-]+)\/?/i);
  if (sub) return slug(sub[1]);
  if (/\/arche\/(avaliacao|dossie)\/?([?#]|$)/i.test(ref)) return "psicologia";
  return "geral";
}

/* ------------------------------- ESTADO --------------------------------- */
// Chaves internas do servidor: invisíveis e não graváveis pela API pública.
// "auth-*" guarda sessão/usuários; "sys-*", registros operacionais (ex.: quais
// ações já receberam cobrança de relatório).
const CHAVES_INTERNAS = /^(auth-|sys-)/;

app.get("/api/estado", async (req, res) => {
  try {
    const chave = stateKey(req);
    if (CHAVES_INTERNAS.test(chave)) return res.status(404).json({ error: "nf" });
    // Os setores de gestão guardam dados pessoais (e-mail, telefone e CPF de
    // participantes): a LEITURA também exige sessão. As chaves da Avaliação
    // Institucional continuam abertas, como manda a regra do projeto.
    if (CHAVES_PROTEGIDAS.test(chave)) {
      const u = await usuarioDe(req);
      if (!u || u.papel === "pendente")
        return res.status(403).json({ error: "Faça login para acessar este setor" });
    }
    const valor = await storage.get(chave);
    if (valor === null) return res.status(404).json({ error: "nf" });
    res.json({ key: chave, value: valor });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Chaves dos setores de gestão só aceitam escrita de usuário autenticado
// e aprovado (as da Avaliação Institucional continuam abertas).
const CHAVES_PROTEGIDAS = /^(extensao-|pesquisa-|inovacao-|auth-usuarios)/;
async function podeEscrever(req, chave) {
  if (CHAVES_INTERNAS.test(chave)) return false; // só o próprio servidor grava
  if (!CHAVES_PROTEGIDAS.test(chave)) return true;
  const u = await usuarioDe(req);
  return !!u && u.papel !== "pendente";
}

app.put("/api/estado", async (req, res) => {
  try {
    const chave = stateKey(req);
    if (!(await podeEscrever(req, chave)))
      return res.status(403).json({ error: "Faça login para salvar neste setor" });
    await storage.set(chave, req.body.valor);
    res.json({ key: chave, value: req.body.valor || "" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// sendBeacon do dossiê (envia os cookies da sessão): passa pelas mesmas regras
// de escrita do PUT — sem isso, qualquer requisição anônima gravaria em
// qualquer chave, inclusive as dos setores de gestão.
app.post("/api/estado-beacon", async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const chave = String(body?.chave || "").trim();
    if (!chave) return res.status(400).end();
    if (!(await podeEscrever(req, chave))) return res.status(403).end();
    await storage.set(chave, body.valor);
    res.status(204).end();
  } catch {
    res.status(500).end();
  }
});

app.delete("/api/estado", async (req, res) => {
  try {
    const chave = stateKey(req);
    if (!(await podeEscrever(req, chave)))
      return res.status(403).json({ error: "Faça login para alterar este setor" });
    await storage.del(chave);
    res.json({ key: chave, deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/estado/list", async (req, res) => {
  try {
    const keys = (await storage.list(String(req.query.prefixo || "")))
      .filter((k) => !CHAVES_INTERNAS.test(k));
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ------------------------------- UPLOADS -------------------------------- */
app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const professor = slug(req.body.professor || "desconhecido");
    const categoria = slug(req.body.categoria || "geral");
    const codigo = String(req.body.codigo || "");
    const originalName = codigo ? `${codigo}_${req.file.originalname}` : req.file.originalname;
    res.json(await files.save({
      buffer: req.file.buffer, originalName,
      prefix: `dossie/${cursoFrom(req)}/${professor}/${categoria}`,
    }));
  } catch (error) {
    console.error("Erro no upload do dossiê:", error);
    res.status(500).json({ error: error.message || "Erro no upload" });
  }
});

app.post("/api/drive/upload-avaliacao", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const indicador = String(req.body.indicador || "geral");
    const criterio = Number(req.body.criterioIndice || 0) + 1;
    const originalName = `Indicador-${indicador}_Criterio-${criterio}_${req.file.originalname}`;
    res.json(await files.save({
      buffer: req.file.buffer, originalName,
      prefix: `avaliacao/${cursoFrom(req)}/indicador-${slug(indicador)}`,
    }));
  } catch (error) {
    console.error("Erro no upload da avaliação:", error);
    res.status(500).json({ error: error.message || "Erro no upload" });
  }
});

app.post("/api/drive/upload-doc-institucional", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const section = slug(req.body.secao || "DI.1");
    const provided = String(req.body.nomeArquivo || "").trim();
    const originalName = provided
      ? `${provided}.${req.file.originalname.split(".").pop() || ""}`
      : req.file.originalname;
    const data = await files.save({
      buffer: req.file.buffer, originalName,
      prefix: `docs-institucionais/${cursoFrom(req)}/${section}`,
    });
    res.json({
      ...data, name: provided || req.file.originalname,
      descricao: req.body.descricao || "", secao: section,
      originalName: req.file.originalname,
    });
  } catch (error) {
    console.error("Erro no upload institucional:", error);
    res.status(500).json({ error: error.message || "Erro no upload" });
  }
});

/* ------------------------- EXTENSÃO: NOTIFICAÇÃO ------------------------ */
app.post("/api/extensao/notificar", async (req, res) => {
  try {
    const { id } = req.body || {};
    const raw = await storage.get("extensao-acoes-v1");
    const acoes = raw ? JSON.parse(raw) : [];
    const acao = acoes.find((a) => a.id === id);
    if (!acao) return res.status(404).json({ error: "Ação não encontrada" });
    const { enviarEmail, emailNovaProposta, emailConfirmacaoProposta } = await import("./lib/mailer.js");

    // Cópia da proposta em PDF (mesmo timbrado do relatório final): segue
    // anexa aos dois e-mails e é arquivada no Drive da PROPPEX.
    let anexos = [];
    try {
      const { gerarPropostaPdf } = await import("./lib/pdf.js");
      const pdf = await gerarPropostaPdf(acao);
      const nomePdf = `Proposta-${slug(acao.proposta?.nomeAtividade || acao.id)}.pdf`;
      anexos = [{ nome: nomePdf, tipo: "application/pdf", conteudo: pdf }];
      files.save({
        buffer: pdf, originalName: nomePdf,
        prefix: `extensao/${slug(acao.curso || "geral")}/propostas`,
      }).catch((e) => console.error("Falha ao arquivar PDF da proposta no Drive:", e.message));
    } catch (e) {
      console.error("Falha ao gerar PDF da proposta:", e.message);
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const destino = await enviarEmail({ ...emailNovaProposta(acao, baseUrl), anexos });

    // confirmação ao responsável, com a mesma cópia em PDF
    let paraResponsavel = null;
    const confirmacao = emailConfirmacaoProposta(acao);
    // e-mail inválido cairia no destinatário padrão e a PROPPEX receberia uma
    // mensagem escrita para o professor
    const paraValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(confirmacao.para || "").trim());
    if (paraValido && confirmacao.para.toLowerCase() !== destino.toLowerCase()) {
      try {
        paraResponsavel = await enviarEmail({ ...confirmacao, anexos });
      } catch (e) {
        console.error("Falha ao enviar confirmação ao responsável:", e.message);
      }
    }
    res.json({ ok: true, para: destino, paraResponsavel });
  } catch (error) {
    console.error("Falha ao notificar por e-mail:", error.message);
    // não é fatal para o fluxo — a proposta já foi salva
    res.status(200).json({ ok: false, error: error.message });
  }
});

/* -------------------- EXTENSÃO: PORTFÓLIO DO RELATÓRIO ------------------- */
// Anexos do relatório final (fotos, cartazes, materiais de divulgação…):
// o arquivo vai para o Drive (extensao/<curso>/<nº da ação>/portfolio) e a
// referência é gravada na própria ação, para constar no PDF do relatório.
app.post("/api/extensao/anexo", upload.single("file"), async (req, res) => {
  try {
    const u = await usuarioDe(req);
    if (!u || u.papel === "pendente")
      return res.status(403).json({ error: "Faça login para anexar arquivos" });
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const id = String(req.body.id || "");
    const raw = await storage.get("extensao-acoes-v1");
    const acoes = raw ? JSON.parse(raw) : [];
    const acao = acoes.find((a) => a.id === id);
    if (!acao) return res.status(404).json({ error: "Ação não encontrada" });
    if (acao.status === "registrada")
      return res.status(400).json({ error: "Ação registrada — anexos travados" });

    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `extensao/${slug(acao.curso || "geral")}/${slug(acao.numeroAcao || acao.id)}/portfolio`,
    });
    const anexo = { ...data, enviadoEm: new Date().toISOString(), enviadoPor: u.email };
    acao.portfolio = acao.portfolio || {};
    acao.portfolio.anexos = [...(acao.portfolio.anexos || []), anexo];
    acao.atualizadoEm = new Date().toISOString();
    await storage.set("extensao-acoes-v1", JSON.stringify(acoes));
    res.json({ ok: true, anexo, anexos: acao.portfolio.anexos });
  } catch (error) {
    console.error("Erro no anexo do portfólio:", error);
    res.status(500).json({ error: error.message || "Erro no upload" });
  }
});

/* ------------- EXTENSÃO: COBRANÇA DO RELATÓRIO FINAL (D+1) -------------- */
// A rotina roda sozinha (no boot, por tráfego e de hora em hora). O endpoint
// abaixo existe para quem quiser um horário fixo via cron externo — protegido
// por COBRANCA_TOKEN e respondendo 404 sem token, para não anunciar a rota.
function tokenCobrancaOk(req) {
  try {
    const esperado = Buffer.from(String(process.env.COBRANCA_TOKEN || ""));
    const dado = Buffer.from(String(req.get("x-cobranca-token") || req.query.token || ""));
    // comparar o tamanho em BYTES: caractere multibyte quebraria timingSafeEqual
    if (!esperado.length || dado.length !== esperado.length) return false;
    return crypto.timingSafeEqual(dado, esperado);
  } catch { return false; }
}

app.all("/api/extensao/cobranca/varrer", (req, res) => {
  if (!tokenCobrancaOk(req)) return res.status(404).end();
  // responde antes de varrer: o cold start do plano free estoura o timeout do cron
  res.status(202).json({ ok: true, iniciada: true });
  varrer({ storage, motivo: "cron", dry: req.query.dry === "1", force: req.query.force === "1" })
    .catch((e) => console.error("[cobranca] falha no gatilho externo:", e.message));
});

// Prévia: mostra à PROPPEX o que seria cobrado, sem enviar nada.
app.get("/api/extensao/cobranca/previa", async (req, res) => {
  if (!(await exigirGestao(req, res, "extensao"))) return;
  try {
    res.json(await varrer({ storage, motivo: "previa", dry: true }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/extensao/cobranca/situacao", async (req, res) => {
  if (!(await exigirGestao(req, res, "extensao"))) return;
  res.json(await situacao(storage));
});

app.post("/api/extensao/cobranca/dispensar", async (req, res) => {
  const g = await exigirGestao(req, res, "extensao"); if (!g) return;
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "informe a ação" });
  res.json({ ok: true, registro: await dispensar(storage, id, g.email) });
});

/* ------------------------- EXTENSÃO: EXPORTS ---------------------------- */
app.get("/api/extensao/export/:tipo/:id", async (req, res) => {
  try {
    if (!(await exigirGestao(req, res, "extensao"))) return;
    const { tipo, id } = req.params;
    const raw = await storage.get("extensao-acoes-v1");
    const acoes = raw ? JSON.parse(raw) : [];
    const acao = acoes.find((a) => a.id === id);
    if (!acao) return res.status(404).send("Ação não encontrada");

    const { gerarRegistroDocx, gerarCertificadosXlsx } = await import("./lib/exports.js");
    let buffer, nome, mime;
    const num = (acao.numeroAcao || acao.id).replace(/[^A-Za-z0-9-]/g, "-");
    if (tipo === "registro") {
      buffer = await gerarRegistroDocx(acao);
      nome = `Registro-Atividade-${num}.docx`;
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (tipo === "certificados") {
      buffer = await gerarCertificadosXlsx(acao);
      nome = `Certificados-${num}.xlsx`;
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (tipo === "pdf") {
      const { gerarRelatorioPdf } = await import("./lib/pdf.js");
      buffer = await gerarRelatorioPdf(acao);
      nome = `Relatorio-Final-${num}.pdf`;
      mime = "application/pdf";
    } else {
      return res.status(400).send("Tipo inválido");
    }

    // Arquiva uma cópia versionada no Drive (extensao/<curso>/<nº da ação>/)
    try {
      const ts = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "h");
      const nomeArq = nome.replace(/(\.[a-z]+)$/i, `_${ts}$1`);
      await files.save({
        buffer, originalName: nomeArq,
        prefix: `extensao/${slug(acao.curso || "geral")}/${slug(acao.numeroAcao || acao.id)}`,
      });
    } catch (e) {
      console.error("Falha ao arquivar export no Drive:", e.message);
    }

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Erro no export da extensão:", error);
    res.status(500).send("Erro ao gerar documento: " + error.message);
  }
});

app.get("/api/files/*", async (req, res) => {
  try {
    const fileId = decodeURIComponent(req.params[0]);
    await files.serve(fileId, res);
  } catch {
    res.status(404).send("Arquivo não encontrado");
  }
});

// Endereço leve para monitor externo manter o serviço acordado (o plano free
// do Render hiberna após ~15 min sem acesso e o próximo visitante espera o
// religamento). Não toca no estado nem no Drive.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, servico: "arche", em: new Date().toISOString() });
});

/* ------------------------------- ESTÁTICO ------------------------------- */
app.use(express.static(PUBLIC));

/* --------------------- ENCERRAMENTO E TAREFAS DE FUNDO ------------------- */
// O Render hiberna o serviço no plano free: sem este flush, qualquer gravação
// feita nos instantes anteriores ao desligamento morre em memória.
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, async () => {
    try {
      await storage.flush?.();
      console.log("ARCHÉ · estado gravado antes de encerrar");
    } catch (e) {
      console.error("Falha ao gravar o estado no encerramento:", e.message);
    } finally {
      process.exit(0);
    }
  });
}

app.listen(port, () => {
  console.log(`ARCHÉ disponível em http://localhost:${port}/`);
  // Cobrança do relatório final: varre ao acordar e de hora em hora enquanto
  // o processo estiver vivo. O tráfego do portal também dispara (com throttle),
  // o que cobre as hibernações do plano free.
  setTimeout(() => varrerSeVencido(storage, "boot"), 20_000).unref();
  setInterval(() => varrerSeVencido(storage, "intervalo"), 60 * 60 * 1000).unref();
});
