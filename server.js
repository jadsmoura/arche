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
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getStorage } from "./lib/storage.js";
import { getFiles, slug } from "./lib/files.js";
import { varrer, varrerSeVencido, dispensar, situacao } from "./lib/cobranca.js";
import {
  ATAS_KEY, ORGAOS, CURSOS, STATUS as ATA_STATUS, normalizarAta, validarAta,
  numerar, tituloDe, anotar, encaminhamentos, orgaoDe, podeVerAta, podeEditarAta, statusVigente,
} from "./lib/atas.js";
import {
  PAUTAS, MOMENTOS, CADENCIAS, RITUAL, checklistSemestral, pautasSugeridas, janelaDe,
  matrizConformidade, placarPorCurso, ciclosDoSemestre, proximosPrazos,
} from "./lib/pautas.js";
import {
  IC_KEY, MODALIDADES as IC_MODALIDADES, STATUS as IC_STATUS, ROTULO_STATUS as IC_ROTULO_STATUS,
  SITUACOES_ETAPA, TIPOS_RELATORIO, CRITERIOS, RECOMENDACOES, normalizarProjeto, validarProjeto,
  numerar as numerarProjeto, anotar as anotarProjeto, resumir as resumirProjeto,
  papelNoProjeto, podeVerProjeto, podeEditarProjeto, podeGerirExecucao, podeAvaliar,
  podeEnviarRelatorio, podeValidarRelatorio, cronogramaDe, relatoriosDe, relatoriosPendentes,
  podeDesignarAvaliador, podeDarParecer, ehAvaliadorDe, parecerDe, visaoDoProjeto, notaFinal,
  participaDeAlgum, vincularPorCpf,
} from "./lib/ic.js";
import { normalizarCpf, soDigitos, formatarCpf } from "./lib/cpf.js";
import {
  EDITAL, LINHAS, GRUPOS_PESQUISA, FOMENTOS, TITULACOES, BLOCOS_PRODUCAO,
  pontuarProducao, normalizarProducao, notaClassificacao, modalidadePor, gruposConhecidos,
} from "./lib/edital.js";
import { gerarAlertas, resumoAlertas, porResponsavel } from "./lib/alertas.js";
import { dataCivil, hojeLocalISO } from "./lib/datas.js";
import { CREDENCIAMENTO, MARCAS, UNIEGO_DESDE } from "./lib/marca.js";
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
const AREAS_PROTEGIDAS = /^\/(extensao|pesquisa|inovacao|atas|usuarios)(\/|$)/;
app.use(async (req, res, next) => {
  if (req.method !== "GET" || !AREAS_PROTEGIDAS.test(req.path)) return next();
  const u = await usuarioDe(req, res);   // renova a sessão de quem está usando
  if (!u) return res.redirect("/entrar?next=" + encodeURIComponent(req.originalUrl));
  if (u.papel === "pendente") {
    // exceção da IC: aluno indicado e avaliador ad hoc designado entram pelo
    // convite, que já é nominal (ver sessaoIC). Vale só para este setor.
    const convidado = req.path.startsWith("/pesquisa")
      && participaDeAlgum(u.email, await lerProjetos(), (await carregarPerfis())[u.email]?.cpf || "");
    if (!convidado) return res.redirect("/entrar?pendente=1");
  }
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

  // CPF: é por ele que projetos vindos de fora (planilha da submissão
  // anterior) encontram o dono. Guarda-se só os dígitos, e um CPF não pode
  // pertencer a duas contas — senão a segunda herdaria os projetos da
  // primeira. Uma vez gravado, só a PROPPEX corrige.
  let cpf = antes.cpf || "";
  if (b.cpf !== undefined && soDigitos(b.cpf) !== soDigitos(antes.cpf)) {
    const novo = normalizarCpf(b.cpf);
    if (soDigitos(b.cpf) && !novo) return res.status(400).json({ error: "CPF inválido" });
    if (antes.cpf && novo !== antes.cpf && u.papel !== "gestor")
      return res.status(400).json({ error: "O CPF já cadastrado só pode ser alterado pela PROPPEX" });
    const dono = Object.entries(perfis).find(([mail, p]) => mail !== u.email && p?.cpf && p.cpf === novo);
    if (novo && dono) return res.status(409).json({ error: "Este CPF já está cadastrado em outra conta" });
    cpf = novo;
  }

  perfis[u.email] = {
    ...antes,
    // identificação
    nome: txt(b.nome), tratamento: txt(b.tratamento, 60), titulacao: txt(b.titulacao, 20),
    cpf,
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

  // Com o CPF conhecido, os projetos importados da submissão anterior passam
  // a ter dono: o e-mail é escrito no projeto e ele aparece para o professor
  // já na próxima tela, na situação em que foi importado.
  let vinculados = 0;
  if (cpf) {
    const r = await comProjetos((projetos) => {
      const v = vincularPorCpf(projetos, { email: u.email, cpf });
      return { ...v, gravar: v.vinculados > 0 };   // sem vínculo, nada a regravar
    });
    vinculados = r.vinculados || 0;
  }
  res.json({ ok: true, perfil: perfis[u.email], projetosVinculados: vinculados });
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
const CHAVES_INTERNAS = /^(auth-|sys-|atas-|ic-)/;

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

/* ======================== ARCHÉ AT — ATAS =============================== */
// As atas ficam numa única chave interna (atas-reunioes-v1); toda leitura e
// gravação passa por aqui, onde a permissão é aplicada. Gravações são
// serializadas para que dois registros simultâneos não recebam o mesmo número.
const ATAS_META = {
  orgaos: ORGAOS, cursos: CURSOS, status: ATA_STATUS,
  // identidade institucional por data: atas anteriores à transformação saem
  // com o timbre da FACEG (ver lib/marca.js)
  marcas: {
    unieogDesde: UNIEGO_DESDE, credenciamento: CREDENCIAMENTO,
    faceg: { nome: MARCAS.faceg.nome, sigla: MARCAS.faceg.sigla },
    uniego: { nome: MARCAS.uniego.nome, sigla: MARCAS.uniego.sigla },
  },
};

// Mesma convenção dos outros setores: por curso primeiro (atas/<curso>/…),
// e os colegiados superiores sob "institucional".
function pastaDaAta(ata) {
  const orgao = slug(orgaoDe(ata.orgao)?.sigla || "geral");
  const raiz = ata.curso ? slug(ata.curso) : "institucional";
  return `atas/${raiz}/${orgao}/${ata.ano || "sem-ano"}`;
}

async function lerAtas() {
  const raw = await storage.get(ATAS_KEY);
  let v = [];
  try { v = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(v)) return [];
  // o fluxo encolheu para rascunho → minuta → registrada; o que estava nas
  // situações extintas volta a minuta já na leitura, e persiste na próxima
  // gravação, sem migração em lote
  for (const a of v) if (a && a.status) a.status = statusVigente(a.status);
  return v;
}

let filaAtas = Promise.resolve();
/** Lê, transforma e grava as atas em série. `fn(atas)` devolve o resultado. */
function comAtas(fn) {
  const proxima = filaAtas.then(async () => {
    const atas = await lerAtas();
    const r = await fn(atas);
    if (r?.gravar !== false) await storage.set(ATAS_KEY, JSON.stringify(atas));
    return r;
  });
  filaAtas = proxima.catch(() => {});   // uma falha não trava a fila
  return proxima;
}

// Gestão do setor: gestor geral ou coordenador designado para "atas".
const gereAtas = (u) => !!u && (u.papel === "gestor" || u.modulos?.includes("atas"));
// A regra de visibilidade vive em lib/atas.js, onde é testável: cada usuário
// só enxerga as atas que registrou; a gestão enxerga todas.
const quem = (u) => ({ email: u?.email, gestao: gereAtas(u) });
const podeVer = (u, a) => podeVerAta(quem(u), a);
const podeEditar = (u, a) => podeEditarAta(quem(u), a);

async function sessaoAtas(req, res) {
  const u = await usuarioDe(req, res);
  if (!u || u.papel === "pendente") {
    res.status(403).json({ error: "Faça login para acessar as atas" });
    return null;
  }
  return u;
}

// Metadados do setor (órgãos, cursos e situações) para montar os formulários.
app.get("/api/atas/meta", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  res.json({
    ...ATAS_META, pautas: PAUTAS, momentos: MOMENTOS, cadencias: CADENCIAS, ritual: RITUAL,
    gestao: gereAtas(u), eu: u.email, ia: (await import("./lib/redator.js")).provedorAtivo(),
  });
});

// Lista enxuta (sem o corpo do texto, que pode ter dezenas de milhares de
// caracteres) — a tela de arquivo só precisa do cabeçalho de cada ata.
app.get("/api/atas", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const atas = (await lerAtas()).filter((a) => podeVer(u, a));
  res.json({
    gestao: gereAtas(u),
    atas: atas.map((a) => ({
      id: a.id, numero: a.numero, orgao: a.orgao, orgaoNome: a.orgaoNome, curso: a.curso,
      titulo: tituloDe(a), status: a.status, sessao: a.sessao, ano: a.ano,
      presidencia: a.presidencia, secretaria: a.secretaria,
      participantes: (a.participantes || []).length,
      pontos: (a.pauta || []).length, temTexto: !!a.texto, pdf: a.pdf, anexos: (a.anexos || []).length, registro: a.registro,
      criadoEm: a.criadoEm, criadoPor: a.criadoPor, atualizadoEm: a.atualizadoEm,
    })).sort((x, y) => String(y.sessao?.data || "").localeCompare(String(x.sessao?.data || ""))),
    encaminhamentos: encaminhamentos(atas).filter((e) => e.prazo),
  });
});

/* ---------------------- ARCHÉ AT — PAUTA REGULATÓRIA -------------------- */
// Situação das pautas obrigatórias de um órgão (e curso, quando for o caso).
// A conformidade é calculada sobre TODAS as atas, não só as que o usuário
// enxerga: um professor precisa saber que o tema já foi tratado pelo órgão
// mesmo sem ter acesso ao inteiro teor daquela ata.
app.get("/api/atas/pauta-regulatoria", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const orgao = String(req.query.orgao || "").toUpperCase();
  const curso = String(req.query.curso || "");
  if (!orgaoDe(orgao)) return res.status(400).json({ error: "Informe um órgão válido" });
  const atas = await lerAtas();
  // A referência é a data da sessão: numa ata retroativa o checklist cobrado
  // é o daquele semestre, não o do semestre corrente.
  const hojeReal = hojeLocalISO();
  const referencia = dataCivil(req.query.data) || hojeReal;
  const retroativa = janelaDe(referencia) !== janelaDe(hojeReal);
  const ck = checklistSemestral(atas, { orgao, curso, hoje: referencia });
  // ata da sessão anterior do mesmo órgão: item de praxe da ordem do dia
  const escopoCurso = !!orgaoDe(orgao)?.porCurso;
  const anterior = atas
    .filter((a) => a.orgao === orgao && (!escopoCurso || (a.curso || "") === curso)
      && a.id !== String(req.query.excluir || "") && a.numero && a.sessao?.data
      && a.sessao.data <= referencia
      && podeVer(u, a))
    .sort((x, y) => String(y.sessao.data).localeCompare(String(x.sessao.data)))[0] || null;
  // O checklist precisa dizer se o ÓRGÃO já tratou o tema, mesmo que a ata seja
  // de outro colega — mas sem entregar o conteúdo dela. Para quem não é gestão,
  // ficam a data e o número; o ponto de pauta e o vínculo com a ata, não.
  if (!gereAtas(u)) {
    const enxugar = (r) => r && { data: r.data, numero: r.numero, tipo: r.tipo };
    for (const p of ck.pautas) {
      p.ultima = enxugar(p.ultima);
      p.historico = (p.historico || []).map(enxugar);
    }
  }
  res.json({
    orgao, curso, ...ck,
    referencia, retroativa, janelaAtual: janelaDe(hojeReal),
    anterior: anterior && {
      id: anterior.id, numero: anterior.numero, data: anterior.sessao.data,
      status: anterior.status, tipo: anterior.sessao.tipo,
    },
    sugeridas: pautasSugeridas(atas, { orgao, curso, hoje: referencia }).map((p) => p.id),
    prazos: proximosPrazos(atas, { orgao, curso, hoje: referencia }),
  });
});

// Painel de acompanhamento da PROPPEX: quais cursos e órgãos estão em dia.
app.get("/api/atas/conformidade", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  if (!gereAtas(u)) return res.status(403).json({ error: "Acompanhamento restrito à gestão" });
  const atas = await lerAtas();
  const alertas = gerarAlertas(atas);
  res.json({
    ...matrizConformidade(atas),
    cursos: placarPorCurso(atas),
    ciclos: ciclosDoSemestre(atas),
    alertas, resumo: resumoAlertas(alertas), responsaveis: porResponsavel(alertas),
  });
});

// Alertas de regularização: é aqui que a PROPPEX vê quem está devendo ata.
// O sistema não cobra ninguém — ele mostra a lista para a cobrança humana.
app.get("/api/atas/alertas", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  if (!gereAtas(u)) return res.status(403).json({ error: "Acompanhamento restrito à gestão" });
  const atas = await lerAtas();
  const alertas = gerarAlertas(atas);
  res.json({ alertas, resumo: resumoAlertas(alertas), responsaveis: porResponsavel(alertas) });
});

app.get("/api/atas/:id", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const a = (await lerAtas()).find((x) => x.id === req.params.id);
  if (!a || !podeVer(u, a)) return res.status(404).json({ error: "Ata não encontrada" });
  res.json({ ata: a, podeEditar: podeEditar(u, a), gestao: gereAtas(u) });
});

// Cria ou atualiza. O número só é emitido quando a ata sai de rascunho, para
// que reuniões abandonadas não consumam a sequência do órgão.
app.post("/api/atas", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const b = req.body || {};
    const r = await comAtas((atas) => {
      const i = b.id ? atas.findIndex((x) => x.id === b.id) : -1;
      const base = i >= 0 ? atas[i] : null;
      if (base && !podeEditar(u, base)) return { erro: [403, "Sem permissão para editar esta ata"], gravar: false };
      if (!base && b.id) return { erro: [404, "Ata não encontrada"], gravar: false };

      let ata = normalizarAta(b, { base, autor: u.email });
      if (!ata.id) ata.id = "ata_" + crypto.randomUUID().slice(0, 12);

      const querNumero = ata.status !== "rascunho";
      if (querNumero) {
        const erros = validarAta(ata);
        if (erros.length) return { erro: [400, erros.join(" ")], gravar: false };
        ata = numerar(atas, ata);
      }
      ata = anotar(ata, { quem: u.email, oQue: base ? `editou (${ata.status})` : "abriu a reunião" });

      if (i >= 0) atas[i] = ata; else atas.push(ata);
      return { ata };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, ata: r.ata });
  } catch (e) {
    console.error("Erro ao gravar ata:", e);
    res.status(500).json({ error: e.message || "Erro ao gravar a ata" });
  }
});

// Redige a minuta a partir dos campos estruturados. Nunca sobrescreve texto
// já revisado sem que se peça explicitamente (refazer=1).
app.post("/api/atas/:id/redigir", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const atas = await lerAtas();
    const ata = atas.find((x) => x.id === req.params.id);
    if (!ata || !podeVer(u, ata)) return res.status(404).json({ error: "Ata não encontrada" });
    if (!podeEditar(u, ata)) return res.status(403).json({ error: "Sem permissão para editar esta ata" });
    if (ata.texto && !req.body?.refazer)
      return res.status(409).json({ error: "Esta ata já tem texto. Confirme para reescrever." });
    const erros = validarAta(ata);
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });

    // a redação pode levar dezenas de segundos: fica fora da fila de gravação
    const { redigir } = await import("./lib/redator.js");
    const r = await redigir(ata);

    const out = await comAtas((lista) => {
      const i = lista.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ata não encontrada"], gravar: false };
      const nova = anotar({
        ...lista[i], texto: r.texto,
        redacao: { provedor: r.provedor, modelo: r.modelo, em: r.em },
        status: lista[i].status === "rascunho" ? "minuta" : lista[i].status,
        atualizadoEm: new Date().toISOString(), atualizadoPor: u.email,
      }, { quem: u.email, oQue: `redigiu a minuta (${r.provedor})` });
      lista[i] = numerar(lista, nova);
      return { ata: lista[i] };
    });
    if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
    res.json({ ok: true, ata: out.ata, aviso: r.aviso, provedor: r.provedor });
  } catch (e) {
    console.error("Erro ao redigir ata:", e);
    res.status(500).json({ error: e.message || "Erro ao redigir a ata" });
  }
});

// Volta a ata para rascunho ou marca a minuta como pronta. O registro tem
// rota própria, porque emite o PDF e arquiva a cópia.
app.post("/api/atas/:id/status", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const alvo = String(req.body?.status || "");
  if (!["rascunho", "minuta"].includes(alvo))
    return res.status(400).json({ error: "Situação inválida" });
  const r = await comAtas((atas) => {
    const i = atas.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVer(u, atas[i])) return { erro: [404, "Ata não encontrada"], gravar: false };
    if (!podeEditar(u, atas[i])) return { erro: [403, "Sem permissão"], gravar: false };
    // Rebaixar ata registrada apagaria em silêncio a prova de conformidade do
    // órgão. Corrigir não exige isso: edita-se em cima e gera-se o PDF de novo.
    if (atas[i].status === "registrada") {
      return { erro: [400, "Ata registrada não volta atrás. Corrija o texto e gere o PDF novamente."], gravar: false };
    }
    if (alvo !== "rascunho") {
      const erros = validarAta(atas[i]);
      if (erros.length) return { erro: [400, erros.join(" ")], gravar: false };
    }
    atas[i] = numerar(atas, anotar({ ...atas[i], status: alvo, atualizadoEm: new Date().toISOString(), atualizadoPor: u.email },
      { quem: u.email, oQue: `situação → ${alvo}` }));
    return { ata: atas[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, ata: r.ata });
});

app.get("/api/atas/:id/pdf", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const ata = (await lerAtas()).find((x) => x.id === req.params.id);
    if (!ata || !podeVer(u, ata)) return res.status(404).send("Ata não encontrada");
    if (!ata.texto) return res.status(400).send("A ata ainda não tem texto — gere a minuta primeiro.");
    const { gerarAtaPdf } = await import("./lib/pdf.js");
    const buffer = await gerarAtaPdf(ata);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${slug(ata.numero || ata.id)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF da ata:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

// Registro definitivo: fecha a ata, gera o PDF e arquiva a cópia no Drive.
// Nada sai por e-mail — o documento fica no sistema, para download por quem o
// registrou e pela PROPPEX.
app.post("/api/atas/:id/registrar", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const ata = (await lerAtas()).find((x) => x.id === req.params.id);
    if (!ata || !podeVer(u, ata)) return res.status(404).json({ error: "Ata não encontrada" });
    if (!podeEditar(u, ata)) return res.status(403).json({ error: "Sem permissão" });
    if (!ata.texto) return res.status(400).json({ error: "Gere a minuta antes de registrar" });
    // registrar uma ata já registrada é retificação: gera PDF novo e arquiva
    // ao lado do anterior, com sufixo, sem apagar o que já foi guardado
    const retificacao = ata.status === "registrada";
    const versao = (ata.historico || []).filter((h) => /registrou|retificou/.test(h.oQue || "")).length;
    const erros = validarAta(ata);
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });

    const { gerarAtaPdf } = await import("./lib/pdf.js");
    const pdfBuffer = await gerarAtaPdf(ata);
    const nomePdf = `${slug(ata.numero || ata.id)}${retificacao ? `-retificada-${versao}` : ""}.pdf`;
    const pasta = pastaDaAta(ata);

    let arquivo = null;
    try {
      arquivo = await files.save({ buffer: pdfBuffer, originalName: nomePdf, prefix: pasta });
    } catch (e) {
      console.error("Falha ao arquivar a ata no Drive:", e.message);
    }

    const r = await comAtas((atas) => {
      const i = atas.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ata não encontrada"], gravar: false };
      atas[i] = numerar(atas, anotar({
        ...atas[i], status: "registrada", pdf: arquivo,
        registro: { em: new Date().toISOString(), por: u.email, pasta, versao: versao + 1 },
        atualizadoEm: new Date().toISOString(), atualizadoPor: u.email,
      }, { quem: u.email, oQue: retificacao ? `retificou a ata (versão ${versao + 1})` : "registrou a ata" }));
      return { ata: atas[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, ata: r.ata, arquivada: !!arquivo, pasta, retificacao });
  } catch (e) {
    console.error("Erro ao registrar a ata:", e);
    res.status(500).json({ error: e.message || "Erro ao registrar a ata" });
  }
});

// Lista de presença: o papel que roda na mesa para assinatura. O arquivamento
// da via assinada é do próprio órgão; ao ARCHÉ cabe a cópia e o acompanhamento.
app.get("/api/atas/:id/presenca", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const ata = (await lerAtas()).find((x) => x.id === req.params.id);
    if (!ata || !podeVer(u, ata)) return res.status(404).send("Ata não encontrada");
    const { gerarPresencaPdf } = await import("./lib/pdf.js");
    const buffer = await gerarPresencaPdf(ata);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="presenca-${slug(ata.numero || ata.id)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro na lista de presença:", e);
    res.status(500).send("Erro ao gerar o documento: " + e.message);
  }
});

// Documentos discutidos na sessão (pareceres, planilhas, minutas).
app.post("/api/atas/:id/anexo", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const ata = (await lerAtas()).find((x) => x.id === req.params.id);
    if (!ata || !podeVer(u, ata)) return res.status(404).json({ error: "Ata não encontrada" });
    if (!podeEditar(u, ata)) return res.status(403).json({ error: "Sem permissão para anexar" });
    if ((ata.anexos || []).length >= 30) return res.status(400).json({ error: "Limite de 30 anexos por ata" });

    const pasta = `${pastaDaAta(ata)}/${slug(ata.numero || ata.id)}`;
    const arquivo = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname, prefix: pasta,
    });

    const r = await comAtas((atas) => {
      const i = atas.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ata não encontrada"], gravar: false };
      atas[i] = anotar({
        ...atas[i],
        anexos: [...(atas[i].anexos || []), { ...arquivo, em: new Date().toISOString(), por: u.email }],
        atualizadoEm: new Date().toISOString(),
      }, { quem: u.email, oQue: `anexou ${req.file.originalname}` });
      return { ata: atas[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, ata: r.ata });
  } catch (e) {
    console.error("Erro ao anexar documento:", e);
    res.status(500).json({ error: e.message || "Erro ao anexar o arquivo" });
  }
});

app.delete("/api/atas/:id/anexo/:indice", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const r = await comAtas((atas) => {
    const i = atas.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVer(u, atas[i])) return { erro: [404, "Ata não encontrada"], gravar: false };
    if (!podeEditar(u, atas[i])) return { erro: [403, "Sem permissão"], gravar: false };
    const n = Number(req.params.indice);
    const lista = atas[i].anexos || [];
    if (!Number.isInteger(n) || n < 0 || n >= lista.length)
      return { erro: [404, "Anexo não encontrado"], gravar: false };
    const [fora] = lista.splice(n, 1);
    atas[i] = anotar({ ...atas[i], anexos: lista, atualizadoEm: new Date().toISOString() },
      { quem: u.email, oQue: `removeu o anexo ${fora?.name || ""}` });
    return { ata: atas[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, ata: r.ata });
});

// Só rascunho se apaga — ata numerada some do arquivo, nunca do histórico.
app.delete("/api/atas/:id", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const r = await comAtas((atas) => {
    const i = atas.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVer(u, atas[i])) return { erro: [404, "Ata não encontrada"], gravar: false };
    if (!podeEditar(u, atas[i])) return { erro: [403, "Sem permissão"], gravar: false };
    if (atas[i].numero) return { erro: [400, "Ata numerada não pode ser excluída"], gravar: false };
    atas.splice(i, 1);
    return { ok: true };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true });
});

/* ======================================================================
   ARCHÉ IC — Iniciação Científica
   Projeto (submissão → avaliação → execução), cronograma de todos os
   projetos num só lugar e relatórios parcial/final do aluno indicado.
   As regras de quem vê e quem faz o quê vivem em lib/ic.js, onde são
   testáveis; aqui ficam só o transporte e a gravação em série.
   ====================================================================== */
async function lerProjetos() {
  const raw = await storage.get(IC_KEY);
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

let filaIC = Promise.resolve();
/** Lê, transforma e grava os projetos em série. `fn(projetos)` devolve o resultado. */
function comProjetos(fn) {
  const proxima = filaIC.then(async () => {
    const projetos = await lerProjetos();
    const r = await fn(projetos);
    if (r?.gravar !== false) await storage.set(IC_KEY, JSON.stringify(projetos));
    return r;
  });
  filaIC = proxima.catch(() => {});
  return proxima;
}

// Gestão do setor: gestor geral ou coordenador designado para "pesquisa".
const gereIC = (u) => !!u && (u.papel === "gestor" || u.modulos?.includes("pesquisa"));
// O CPF entra junto com o e-mail: projeto importado da submissão anterior
// chega sem e-mail e só encontra o dono pelo CPF do perfil.
const quemIC = (u) => ({ email: u?.email, cpf: u?.cpf || "", gestao: gereIC(u) });

async function sessaoIC(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) {
    res.status(403).json({ error: "Faça login para acessar a Iniciação Científica" });
    return null;
  }
  // Conta pendente entra na IC se — e só se — já estiver em algum projeto:
  // aluno indicado pela orientação ou avaliador designado pela coordenação.
  // O convite é por e-mail exato e a visibilidade continua sendo a do papel.
  const cpf = (await carregarPerfis())[u.email]?.cpf || "";
  const eu = { ...u, cpf };
  if (u.papel === "pendente" && !participaDeAlgum(u.email, await lerProjetos(), cpf)) {
    res.status(403).json({ error: "Seu acesso ainda está pendente de aprovação da PROPPEX" });
    return null;
  }
  return eu;
}

/**
 * Como a pessoa entra no setor — é o que monta a tela. São quatro acessos:
 * a gestão (pró-reitoria e coordenação de pesquisa), quem orienta, o aluno
 * indicado e o avaliador ad hoc. Os três últimos vêm do próprio projeto:
 * ninguém precisa cadastrar papel à parte.
 */
function perfilIC(u, projetos, quem = null) {
  const meu = quem || quemIC(u);
  if (meu.gestao) return "gestao";
  const papeis = projetos.map((p) => papelNoProjeto(meu, p)).filter(Boolean);
  if (papeis.includes("orientador")) return "orientador";
  if (!papeis.length) return "orientador";     // docente ainda sem projeto: pode submeter
  if (papeis.every((x) => x === "aluno")) return "aluno";
  if (papeis.every((x) => x === "avaliador")) return "avaliador";
  return "orientador";                          // acumula papéis: vê o setor inteiro
}

/**
 * A planilha de pontuação é do coordenador, não do projeto: quem submete a
 * segunda proposta não deveria digitar tudo de novo. Devolve a produção mais
 * recente que a pessoa informou em qualquer projeto seu.
 */
/**
 * "Ver como" — a coordenação abre o setor pelos olhos de outra pessoa, para
 * conferir o que ela enxerga (é a pergunta que chega no suporte: "o professor
 * diz que não vê o projeto dele"). Não é um atalho de permissão: o alvo é
 * tratado como quem ele é, sem gestão, e as regras de sigilo valem iguais.
 * Vale só para leitura — a trava de escrita está no middleware abaixo.
 */
async function visaoComo(req, u) {
  const alvo = String(req.query?.como || "").trim().toLowerCase();
  if (!alvo || !gereIC(u)) return null;
  // "cpf:00000000000" — quem ainda não tem conta, mas já está em projeto
  // importado: mostra o que a pessoa vai encontrar quando se cadastrar
  if (alvo.startsWith("cpf:")) {
    return { email: "", cpf: normalizarCpf(alvo.slice(4)), gestao: false, simulado: true };
  }
  const perfis = await carregarPerfis();
  return { email: alvo, cpf: perfis[alvo]?.cpf || "", gestao: false, simulado: true };
}

// Nada se grava enquanto se olha pelos olhos de outro: o histórico do projeto
// diria que foi a pessoa quem mexeu, e não foi.
app.use("/api/ic", (req, res, next) => {
  if (req.method !== "GET" && req.query?.como) {
    return res.status(403).json({ error: "Você está vendo como outra pessoa — esta visualização é somente leitura." });
  }
  next();
});

/**
 * Quem é quem no setor, para a coordenação escolher por quais olhos olhar.
 * Sai dos próprios projetos: não há cadastro de papel à parte.
 */
function pessoasDoSetor(projetos) {
  // A chave é o e-mail; quem ainda não tem conta entra pelo CPF, que é como
  // o projeto importado o identifica (ver visaoComo).
  const põe = (mapa, { email, cpf, nome }) => {
    const k = String(email || "").toLowerCase() || (cpf ? `cpf:${cpf}` : "");
    if (!k) return;
    const atual = mapa.get(k) || { id: k, email: email || "", semConta: !email, nome: "", projetos: 0 };
    mapa.set(k, { ...atual, nome: atual.nome || nome || "", projetos: atual.projetos + 1 });
  };
  const orientadores = new Map(), alunos = new Map(), avaliadores = new Map();
  for (const p of projetos || []) {
    põe(orientadores, { email: p.orientador?.email || p.criadoPor, cpf: p.orientador?.cpf, nome: p.orientador?.nome });
    for (const a of p.alunos || []) põe(alunos, a);
    for (const a of p.avaliacoes || []) põe(avaliadores, a);
  }
  const lista = (m) => [...m.values()].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
  return { orientadores: lista(orientadores), alunos: lista(alunos), avaliadores: lista(avaliadores) };
}

/**
 * Editais com projeto no sistema, do mais recente para o mais antigo.
 * É o que alimenta o filtro do histórico e a emissão do resultado — o
 * vigente entra sempre, mesmo antes da primeira submissão.
 */
function editaisConhecidos(projetos) {
  const mapa = new Map([[EDITAL.numero, 0]]);
  for (const p of projetos || []) {
    const n = String(p.edital || EDITAL.numero);
    if (p.status === "rascunho") continue;
    mapa.set(n, (mapa.get(n) || 0) + 1);
  }
  return [...mapa].map(([numero, projetos]) => ({ numero, projetos, vigente: numero === EDITAL.numero }))
    .sort((a, b) => b.numero.localeCompare(a.numero, "pt-BR"));
}

/** Catálogo do edital mais o que já foi informado à mão, num array só. */
function todosOsGrupos(projetos) {
  const { certificados, informados } = gruposConhecidos(projetos);
  return [...certificados, ...informados];
}

function producaoMaisRecente(projetos, u) {
  const meus = (projetos || [])
    .filter((p) => papelNoProjeto(quemIC(u), p) === "orientador" && Object.keys(p.producao || {}).length)
    .sort((a, b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || "")));
  return meus.length ? meus[0].producao : null;
}

/** Nenhuma resposta devolve o projeto cru: o sigilo do parecer é aplicado aqui. */
const verProjeto = (u, p) => visaoDoProjeto(p, quemIC(u));

app.get("/api/ic/meta", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const projetos = await lerProjetos();
  const como = await visaoComo(req, u);
  const meu = como || quemIC(u);
  res.json({
    cursos: CURSOS, modalidades: IC_MODALIDADES, status: IC_STATUS, rotulos: IC_ROTULO_STATUS,
    situacoesEtapa: SITUACOES_ETAPA, tiposRelatorio: TIPOS_RELATORIO,
    criterios: CRITERIOS, recomendacoes: RECOMENDACOES,
    // catálogo do edital vigente (lib/edital.js)
    edital: EDITAL, linhas: LINHAS, fomentos: FOMENTOS,
    // a lista de grupos cresce com o uso: certificados no DGP mais os que
    // foram informados à mão em projetos já submetidos
    ...gruposConhecidos(projetos),
    titulacoes: TITULACOES, blocosProducao: BLOCOS_PRODUCAO,
    // a produção acadêmica é a mesma para todos os projetos do professor:
    // o formulário já abre com o que ele informou da última vez
    producaoAnterior: como ? null : producaoMaisRecente(projetos, u),
    gestao: meu.gestao, eu: meu.email, nome: como ? "" : (u.nome || ""),
    perfil: perfilIC(u, projetos, meu),
    // quem a coordenação pode simular, e por quais olhos está olhando agora
    ...(gereIC(u) ? { pessoas: pessoasDoSetor(projetos), editais: editaisConhecidos(projetos) } : {}),
    ...(como ? { simulando: como.email } : {}),
  });
});

// Lista enxuta: o resumo é o bastante para o painel e para as listas.
app.get("/api/ic", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = (await visaoComo(req, u)) || quemIC(u);
  const projetos = (await lerProjetos()).filter((p) => podeVerProjeto(meu, p));
  res.json({
    gestao: meu.gestao, eu: meu.email,
    projetos: projetos.map((p) => resumirProjeto(p, meu))
      .sort((a, b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || ""))),
  });
});

// Cronograma de todos os projetos num só lugar (a regra de recorte por
// pessoa está em lib/ic.js: o aluno só vê o que é dele).
app.get("/api/ic/cronograma", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = (await visaoComo(req, u)) || quemIC(u);
  res.json({ etapas: cronogramaDe(await lerProjetos(), meu), eu: meu.email, hoje: hojeLocalISO() });
});

app.get("/api/ic/relatorios", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const projetos = await lerProjetos();
  const meu = (await visaoComo(req, u)) || quemIC(u);
  res.json({
    relatorios: relatoriosDe(projetos, meu),
    pendentes: projetos.filter((p) => podeVerProjeto(meu, p)).flatMap((p) =>
      relatoriosPendentes(p)
        .filter((x) => papelNoProjeto(meu, p) !== "aluno" || x.aluno === meu.email)
        .map((x) => ({ ...x, projetoId: p.id, numero: p.numero, titulo: p.titulo }))),
    eu: meu.email,
  });
});

/**
 * Resultado do processo seletivo de um edital, em PDF timbrado.
 *
 * É o documento que a PROPPEX publica e arquiva. Vale para o edital vigente
 * e para os antigos — o filtro é o campo `edital` gravado no projeto, então
 * o histórico que entrar depois sai por aqui do mesmo jeito.
 * Precisa vir antes de /api/ic/:id, senão "resultado.pdf" viraria um id.
 */
app.get("/api/ic/resultado.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Somente a coordenação de pesquisa emite o resultado do processo.");
    const numero = String(req.query.edital || EDITAL.numero).trim();
    const todos = await lerProjetos();
    const meu = quemIC(u);
    const projetos = todos
      .filter((p) => String(p.edital || EDITAL.numero) === numero && p.status !== "rascunho")
      .map((p) => resumirProjeto(p, meu));
    const { gerarResultadoEditalPdf } = await import("./lib/pdf.js");
    const buffer = await gerarResultadoEditalPdf({
      edital: numero === EDITAL.numero ? EDITAL : { numero },
      projetos, emitidoPor: u.email,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resultado-edital-${slug(numero)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF do resultado:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

app.get("/api/ic/:id", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = (await visaoComo(req, u)) || quemIC(u);
  const p = (await lerProjetos()).find((x) => x.id === req.params.id);
  if (!p || !podeVerProjeto(meu, p)) return res.status(404).json({ error: "Projeto não encontrado" });
  res.json({
    projeto: visaoDoProjeto(p, meu), papel: papelNoProjeto(meu, p),
    podeEditar: podeEditarProjeto(meu, p), podeGerir: podeGerirExecucao(meu, p),
    podeAvaliar: podeAvaliar(meu, p), podeEnviar: podeEnviarRelatorio(meu, p),
    podeValidar: podeValidarRelatorio(meu, p),
    podeDesignar: podeDesignarAvaliador(meu, p), podeDarParecer: podeDarParecer(meu, p),
  });
});

// Cria ou atualiza a proposta. O número só sai na submissão, para que
// rascunho abandonado não consuma a sequência do ano.
app.post("/api/ic", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    const b = req.body || {};
    const meu = quemIC(u);
    // o convidado (aluno, avaliador) entra pelo convite, mas não abre projeto:
    // submeter é da orientação, com conta aprovada
    if (!b.id && u.papel === "pendente")
      return res.status(403).json({ error: "Seu acesso ainda está pendente: só é possível submeter projeto com a conta aprovada" });

    // Inclusão manual: a coordenação abre o projeto em nome de quem orienta —
    // é o caso do pedido fora do prazo deferido pela pró-reitoria. O dono é o
    // professor informado, não quem digitou; e o motivo fica gravado.
    const manual = !b.id && gereIC(u) && !!b.inclusaoManual;
    if (manual) {
      const dono = String(b.orientador?.email || "").trim().toLowerCase();
      const cpfDono = normalizarCpf(b.orientador?.cpf);
      if (!dono && !cpfDono) {
        return res.status(400).json({ error: "Informe o e-mail ou o CPF de quem vai orientar o projeto" });
      }
      if (String(b.inclusaoManual?.motivo || "").trim().length < 10) {
        return res.status(400).json({ error: "Escreva o motivo da inclusão manual — ele fica no histórico do projeto" });
      }
    }
    const r = await comProjetos((projetos) => {
      const i = b.id ? projetos.findIndex((x) => x.id === b.id) : -1;
      const base = i >= 0 ? projetos[i] : null;
      if (!base && b.id) return { erro: [404, "Projeto não encontrado"], gravar: false };
      // grupo digitado é casado com os já conhecidos: mesma grafia, mesma linha na lista
      const conhecidos = todosOsGrupos(projetos);
      if (base && !podeEditarProjeto(meu, base) && !podeGerirExecucao(meu, base))
        return { erro: [403, "Sem permissão para editar este projeto"], gravar: false };
      // em execução, a proposta está fechada: seguem só cronograma e alunos
      if (base && !podeEditarProjeto(meu, base)) {
        // A planilha de produção e o grupo de pesquisa não são argumento da
        // proposta: são fato sobre quem coordena e sobre a que grupo o
        // trabalho se liga. Seguem editáveis depois de submeter — os projetos
        // importados do edital chegaram sem os dois, e alguém precisa
        // completá-los sem reabrir o texto.
        const p = normalizarProjeto({
          ...base,
          alunos: b.alunos, cronograma: b.cronograma,
          producao: b.producao ?? base.producao,
          grupoPesquisa: b.grupoPesquisa ?? base.grupoPesquisa,
        }, { base, autor: u.email, grupos: conhecidos });
        projetos[i] = anotarProjeto(p, { quem: u.email, oQue: "atualizou cronograma, alunos, produção ou grupo" });
        return { projeto: projetos[i] };
      }
      // na inclusão manual o autor é o professor: senão a coordenação viraria
      // "orientador" do projeto e deixaria de ser gestão nele
      const autor = manual ? String(b.orientador?.email || "").trim().toLowerCase() : u.email;
      let projeto = normalizarProjeto(b, { base, autor, grupos: conhecidos });
      if (manual) {
        projeto = {
          ...projeto,
          inclusaoManual: {
            por: u.email, em: new Date().toISOString(),
            motivo: String(b.inclusaoManual?.motivo || "").trim().slice(0, 2000),
          },
        };
      }
      projeto = anotarProjeto(projeto, {
        quem: u.email,
        oQue: base ? "editou a proposta"
          : manual ? `incluiu o projeto manualmente em nome de ${projeto.orientador?.nome || projeto.orientador?.email || "quem orienta"}`
          : "abriu o projeto",
      });
      if (i >= 0) projetos[i] = projeto; else projetos.push(projeto);
      return { projeto };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
  } catch (e) {
    console.error("Erro ao gravar projeto de IC:", e);
    res.status(500).json({ error: e.message || "Erro ao gravar o projeto" });
  }
});

// Submete à avaliação da PROPPEX: aqui o projeto ganha número.
app.post("/api/ic/:id/submeter", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeEditarProjeto(meu, projetos[i])) return { erro: [403, "Este projeto não está mais em edição"], gravar: false };
    const erros = validarProjeto(projetos[i]);
    if (erros.length) return { erro: [400, erros.join(" ")], gravar: false };
    projetos[i] = anotarProjeto(numerarProjeto(projetos, {
      ...projetos[i], status: "submetido", submetidoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }), { quem: u.email, oQue: "submeteu à avaliação" });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

// Avaliação de mérito: aprova, devolve para ajustes ou reprova.
app.post("/api/ic/:id/avaliar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const decisao = String(req.body?.decisao || "");
  const parecer = String(req.body?.parecer || "").trim().slice(0, 8000);
  if (!["aprovado", "devolvido", "reprovado"].includes(decisao))
    return res.status(400).json({ error: "Decisão inválida" });
  if (decisao !== "aprovado" && parecer.length < 10)
    return res.status(400).json({ error: "Escreva o parecer: quem recebe precisa saber o que corrigir." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeAvaliar(meu, projetos[i]))
      return { erro: [403, "Só a coordenação avalia, e apenas projetos submetidos"], gravar: false };
    projetos[i] = anotarProjeto({
      ...projetos[i], status: decisao,
      avaliacao: { decisao, parecer, por: u.email, em: new Date().toISOString() },
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `avaliou: ${decisao}` });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/**
 * Importação do banco da submissão anterior (só a PROPPEX).
 * Cada projeto entra pelo CPF de quem orienta — sem depender de e-mail, que
 * a planilha não tem — e na situação informada (por padrão, `submetido`).
 * Quando o professor se cadastra e grava o CPF, o projeto aparece para ele
 * já submetido, com o protocolo emitido (ver vincularPorCpf).
 *
 * É idempotente: `origem.id` identifica a linha da planilha, e reimportar o
 * mesmo arquivo atualiza em vez de duplicar. Nada aqui apaga projeto.
 */
/**
 * Sobe um lote de projetos vindo de fora. Usada pela rota da PROPPEX e pela
 * migração que roda no arranque — daí ficar fora do Express.
 *
 * Cada projeto é identificado pelo CPF de quem orienta e pela linha de origem
 * (`origem.lote` + `origem.id`), o que torna a reimportação idempotente:
 * atualiza, não duplica. Nada aqui apaga projeto.
 */
async function importarLoteIC({ lote, projetos: entrada, status = "submetido", simular = false, por = "" }) {
  const origem = String(lote || "submissao-anterior").slice(0, 60);
  if (!IC_STATUS.includes(status)) throw new Error("Situação inválida");

  const r = await comProjetos((projetos) => {
    const relatorio = { criados: 0, atualizados: 0, semCpf: 0, invalidos: [] };
    entrada.forEach((bruto, linha) => {
      const cpf = normalizarCpf(bruto?.orientador?.cpf ?? bruto?.cpf);
      if (!cpf) {
        relatorio.semCpf++;
        relatorio.invalidos.push({ linha: linha + 1, erro: "CPF de quem orienta ausente ou inválido" });
        return;
      }

      const chave = String(bruto?.origemId ?? bruto?.id ?? `${origem}:${linha + 1}`);
      const i = projetos.findIndex((p) => p.origem?.lote === origem && p.origem?.id === chave);
      const base = i >= 0 ? projetos[i] : null;

      let p = normalizarProjeto({
        ...bruto,
        orientador: { ...(bruto?.orientador || {}), cpf },
        alunos: (bruto?.alunos || []).map((a) => ({ ...a, cpf: normalizarCpf(a?.cpf) })),
      }, { base, autor: "", grupos: todosOsGrupos(projetos) });

      const erros = validarProjeto(p);
      if (erros.length && status !== "rascunho") {
        relatorio.invalidos.push({ linha: linha + 1, titulo: p.titulo, erro: erros.join(" ") });
        return;
      }
      p = {
        ...p, status,
        // a data real da submissão veio no formulário — não é a data de hoje
        ...(bruto?.submetidoEm ? { submetidoEm: String(bruto.submetidoEm) } : {}),
        origem: {
          lote: origem, id: chave, importadoEm: new Date().toISOString(), por,
          ...(bruto?.anexosOrigem || {}),
        },
        // o projeto nasce sem dono de e-mail: quem o reivindica é o CPF
        criadoPor: base?.criadoPor || "",
      };
      if (status !== "rascunho") p = numerarProjeto(projetos, p);
      p = anotarProjeto(p, { quem: por, oQue: base ? `reimportado de ${origem}` : `importado de ${origem}` });

      if (simular) { base ? relatorio.atualizados++ : relatorio.criados++; return; }
      if (i >= 0) { projetos[i] = p; relatorio.atualizados++; } else { projetos.push(p); relatorio.criados++; }
    });
    return { ...relatorio, gravar: !simular };
  });

  // Com os projetos no lugar, quem já tem CPF no perfil recebe os seus na
  // hora — sem precisar entrar no perfil de novo só para disparar o vínculo.
  const vinculo = simular ? { pessoas: 0, projetos: 0 } : await vincularPerfisIC();
  return { ...r, vinculo };
}

/** Passa todos os perfis com CPF pelos projetos, ligando o que estiver órfão. */
async function vincularPerfisIC() {
  const perfis = await carregarPerfis();
  const comCpf = Object.entries(perfis).filter(([, p]) => p?.cpf);
  if (!comCpf.length) return { pessoas: 0, projetos: 0 };
  return comProjetos((projetos) => {
    let pessoas = 0, total = 0;
    for (const [email, perfil] of comCpf) {
      const { vinculados } = vincularPorCpf(projetos, { email, cpf: perfil.cpf });
      if (vinculados) { pessoas++; total += vinculados; }
    }
    return { pessoas, projetos: total, gravar: total > 0 };
  });
}

/** Lê um dos lotes que acompanham o sistema (dados/ic-<nome>.json). */
async function lerLoteDoDisco(nome) {
  const limpo = String(nome).replace(/[^a-z0-9-]/gi, "");
  const bruto = await readFile(path.join(__dirname, "dados", `ic-${limpo}.json`), "utf8");
  return { ...JSON.parse(bruto), lote: JSON.parse(bruto).lote || limpo };
}

app.post("/api/ic/importar", async (req, res) => {
  const u = await exigirGestor(req, res);
  if (!u) return;
  let corpo = req.body || {};
  if (corpo.arquivo) {
    try {
      corpo = { ...(await lerLoteDoDisco(corpo.arquivo)), ...corpo };
      corpo.projetos = (await lerLoteDoDisco(req.body.arquivo)).projetos;
    } catch {
      return res.status(404).json({ error: `Arquivo de importação "${corpo.arquivo}" não encontrado` });
    }
  }
  if (!Array.isArray(corpo.projetos)) {
    return res.status(400).json({ error: "Envie { projetos: [...] } ou { arquivo: \"edital-01-2026\" }" });
  }
  if (corpo.projetos.length > 500) return res.status(400).json({ error: "Limite de 500 projetos por lote" });
  try {
    const r = await importarLoteIC({
      lote: corpo.lote || corpo.origem, projetos: corpo.projetos,
      status: String(corpo.status || "submetido"), simular: !!corpo.simular, por: u.email,
    });
    res.json({ ok: true, simulacao: !!corpo.simular, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message || "Falha na importação" });
  }
});

/**
 * Migração de dados no arranque: sobe uma única vez o lote que acompanha o
 * sistema. A marca em `sys-*` é o que garante o "uma vez só" — sem ela, cada
 * deploy ressuscitaria projeto que a PROPPEX tivesse apagado de propósito.
 */
const LOTES_INICIAIS = ["edital-01-2026"];
async function subirLotesIniciais() {
  for (const nome of LOTES_INICIAIS) {
    const marca = `sys-ic-lote-${nome}`;
    try {
      if (await storage.get(marca)) continue;
      const lote = await lerLoteDoDisco(nome);
      const r = await importarLoteIC({
        lote: lote.lote, projetos: lote.projetos, status: lote.status || "submetido",
        por: "sistema (importação inicial)",
      });
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
      console.log(`ARCHÉ IC · lote ${nome}: ${r.criados} projeto(s) importado(s)` +
        `${r.invalidos.length ? `, ${r.invalidos.length} recusado(s)` : ""}` +
        `${r.vinculo.projetos ? `, ${r.vinculo.projetos} vinculado(s) a ${r.vinculo.pessoas} conta(s) pelo CPF` : ""}`);
    } catch (e) {
      console.error(`ARCHÉ IC · falha ao importar o lote ${nome}:`, e.message);
    }
  }
}

/**
 * Segunda migração do lote: liga a cada projeto o cronograma e a planilha de
 * produção que o professor anexou no formulário (dados/ic-<lote>-anexos.json,
 * chaveado pelo arquivo do Drive gravado em `origem`). Roda uma vez, depois
 * da importação, e nunca sobrescreve o que alguém já mexeu: o cronograma só
 * troca se ainda for o genérico do lote, e a planilha só entra se estiver
 * vazia.
 */
const CRONOGRAMA_DO_LOTE = ["Execução do plano de trabalho", "Relatório parcial", "Relatório final"];
const idDoDrive = (url) => (String(url || "").match(/[?&]id=([\w-]+)/) || [])[1] || "";
const cronogramaAindaDoLote = (cron) => !(cron || []).length ||
  ((cron || []).length === CRONOGRAMA_DO_LOTE.length &&
    (cron || []).every((e, i) => e.atividade === CRONOGRAMA_DO_LOTE[i]));

async function aplicarAnexosIniciais() {
  for (const nome of LOTES_INICIAIS) {
    const marca = `sys-ic-anexos-${nome}`;
    try {
      if (await storage.get(marca)) continue;
      let anexos;
      try {
        anexos = JSON.parse(await readFile(path.join(__dirname, "dados", `ic-${nome}-anexos.json`), "utf8"));
      } catch { continue; }                       // lote sem arquivo de anexos
      const r = await comProjetos((projetos) => {
        let cron = 0, prod = 0;
        for (let i = 0; i < projetos.length; i++) {
          const p = projetos[i];
          if (p.origem?.lote !== (anexos.lote || nome)) continue;
          const doCron = anexos.cronogramas?.[idDoDrive(p.origem?.cronograma)];
          const daProd = anexos.producoes?.[idDoDrive(p.origem?.producao)];
          const trocaCron = !!doCron && cronogramaAindaDoLote(p.cronograma);
          const poeProd = !!daProd && !Object.keys(p.producao || {}).length;
          if (!trocaCron && !poeProd) continue;
          let novo = normalizarProjeto({
            ...p,
            ...(trocaCron ? { cronograma: doCron.etapas } : {}),
            ...(poeProd ? { producao: daProd.quantidades } : {}),
          }, { base: p });
          if (trocaCron) cron++;
          if (poeProd) prod++;
          projetos[i] = anotarProjeto(novo, {
            quem: "sistema (anexos do formulário)",
            oQue: [
              trocaCron && `incorporou o cronograma anexado no formulário (${doCron.etapas.length} atividades)`,
              poeProd && "incorporou a planilha de produção acadêmica anexada no formulário",
            ].filter(Boolean).join(" e "),
          });
        }
        return { cron, prod, gravar: cron + prod > 0 };
      });
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), cronogramas: r.cron, producoes: r.prod }));
      console.log(`ARCHÉ IC · anexos do lote ${nome}: ${r.cron} cronograma(s) e ${r.prod} planilha(s) de produção incorporados`);
    } catch (e) {
      console.error(`ARCHÉ IC · falha ao aplicar os anexos do lote ${nome}:`, e.message);
    }
  }
}

// Designação de avaliador ad hoc: é a indicação pelo e-mail que dá o acesso,
// como acontece com o aluno. Fora do @uniego.edu.br a conta nasce pendente e
// a PROPPEX ainda precisa liberá-la em /usuarios/.
app.post("/api/ic/:id/avaliadores", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const alvo = String(req.body?.email || "").trim().toLowerCase();
  const nome = String(req.body?.nome || "").trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) return res.status(400).json({ error: "E-mail inválido" });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeDesignarAvaliador(meu, projetos[i]))
      return { erro: [403, "Só a coordenação designa avaliador"], gravar: false };
    const p = projetos[i];
    // ninguém avalia projeto de que participa
    if (papelNoProjeto({ email: alvo }, p) === "orientador" || papelNoProjeto({ email: alvo }, p) === "aluno")
      return { erro: [400, "Quem participa do projeto não pode avaliá-lo"], gravar: false };
    if (ehAvaliadorDe({ email: alvo }, p)) return { erro: [400, "Esta pessoa já foi designada"], gravar: false };
    if ((p.avaliacoes || []).length >= 5) return { erro: [400, "Limite de 5 avaliadores por projeto"], gravar: false };

    projetos[i] = anotarProjeto({
      ...p,
      avaliacoes: [...(p.avaliacoes || []), {
        email: alvo, nome, designadoEm: new Date().toISOString(), designadoPor: u.email,
        situacao: "designado", notas: {}, recomendacao: "", parecer: "", entregueEm: "",
      }],
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `designou ${alvo} como avaliador`, sigilo: true });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

app.delete("/api/ic/:id/avaliadores/:email", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const alvo = decodeURIComponent(req.params.email || "").toLowerCase();
  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeDesignarAvaliador(meu, projetos[i])) return { erro: [403, "Sem permissão"], gravar: false };
    const atual = parecerDe(projetos[i], alvo);
    if (!atual) return { erro: [404, "Avaliador não designado neste projeto"], gravar: false };
    // parecer entregue faz parte do processo de seleção: não se apaga
    if (atual.situacao === "entregue")
      return { erro: [400, "Parecer já entregue — dispensar apagaria a prova da seleção"], gravar: false };
    projetos[i] = anotarProjeto({
      ...projetos[i],
      avaliacoes: (projetos[i].avaliacoes || []).filter((a) => a.email !== alvo),
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `dispensou o avaliador ${alvo}`, sigilo: true });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

// Parecer ad hoc: notas por critério, recomendação e texto. Também serve para
// recusar a avaliação (impedimento, falta de aderência à área).
app.post("/api/ic/:id/parecer", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const b = req.body || {};
  const recusar = !!b.recusar;
  const texto = String(b.parecer || "").trim().slice(0, 20000);
  const recomendacao = String(b.recomendacao || "");

  if (recusar && texto.length < 10) return res.status(400).json({ error: "Diga por que está recusando a avaliação." });
  if (!recusar) {
    if (!RECOMENDACOES.some((r) => r.codigo === recomendacao))
      return res.status(400).json({ error: "Escolha a recomendação." });
    if (texto.length < 200) return res.status(400).json({ error: "O parecer precisa de ao menos 200 caracteres." });
    for (const c of CRITERIOS) {
      const n = Number(b.notas?.[c.codigo]);
      if (!Number.isFinite(n) || n < 0 || n > 10)
        return res.status(400).json({ error: `Dê uma nota de 0 a 10 em "${c.nome}".` });
    }
  }

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeDarParecer(meu, projetos[i]))
      return { erro: [403, "Parecer é de quem foi designado, e só enquanto o projeto está em avaliação"], gravar: false };
    // a coordenação avalia sem ter sido designada: entra na lista ao entregar
    const existente = (projetos[i].avaliacoes || []).some((a) => a.email === u.email);
    const base = existente ? (projetos[i].avaliacoes || []) : [...(projetos[i].avaliacoes || []), {
      email: u.email, nome: u.nome || "", designadoEm: new Date().toISOString(),
      designadoPor: u.email, situacao: "designado", notas: {}, recomendacao: "", parecer: "", entregueEm: "",
    }];
    const lista = base.map((a) => a.email !== u.email ? a : {
      ...a,
      situacao: recusar ? "recusado" : "entregue",
      notas: recusar ? {} : Object.fromEntries(CRITERIOS.map((c) => [c.codigo, Number(b.notas[c.codigo])])),
      recomendacao: recusar ? "" : recomendacao,
      parecer: texto, entregueEm: new Date().toISOString(),
    });
    const daGestao = papelNoProjeto(meu, projetos[i]) === "gestao";
    projetos[i] = anotarProjeto({ ...projetos[i], avaliacoes: lista, atualizadoEm: new Date().toISOString() },
      { quem: u.email,
        oQue: recusar ? "recusou a avaliação"
          : daGestao ? "entregou o parecer da coordenação" : "entregou o parecer ad hoc",
        sigilo: true });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto), nota: notaFinal(parecerDe(r.projeto, u.email)) });
});

/**
 * Resultado da seleção quanto ao fomento: bolsa do CNPq, bolsa do UNIEGO ou
 * voluntário. É o que define a modalidade efetiva (PIBIC/CNPq, PBIC/UNIEGO,
 * PVIC…) e marca quais alunos são bolsistas. Só a coordenação decide.
 */
app.post("/api/ic/:id/fomento", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const tipo = String(req.body?.tipo || "");
  const obs = String(req.body?.observacao || "").trim().slice(0, 2000);
  if (!FOMENTOS.some((f) => f.codigo === tipo)) return res.status(400).json({ error: "Fomento inválido" });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (papelNoProjeto(meu, projetos[i]) !== "gestao")
      return { erro: [403, "A concessão de bolsa é decidida pela coordenação"], gravar: false };
    const p = projetos[i];
    const mod = modalidadePor(p.linha, tipo);
    projetos[i] = anotarProjeto({
      ...p,
      fomento: { tipo, modalidade: mod?.codigo || "", observacao: obs, por: u.email, em: new Date().toISOString() },
      // bolsa é do aluno: marca quem recebe (voluntário desmarca todos)
      alunos: (p.alunos || []).map((a) => ({ ...a, bolsista: tipo !== "voluntario" })),
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `fomento: ${mod?.nome || tipo}` });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

// Relatório do aluno indicado — parcial ou final.
app.post("/api/ic/:id/relatorio", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const b = req.body || {};
  const tipo = String(b.tipo || "");
  if (!TIPOS_RELATORIO.includes(tipo)) return res.status(400).json({ error: "Tipo de relatório inválido" });
  if (String(b.resumo || "").trim().length < 200)
    return res.status(400).json({ error: "O relatório precisa de ao menos 200 caracteres." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeEnviarRelatorio(meu, projetos[i]))
      return { erro: [403, "O relatório é enviado pelo aluno indicado, com o projeto em execução"], gravar: false };
    const lista = [...(projetos[i].relatorios || [])];
    // reenvio depois de devolvido substitui o anterior, guardando o parecer
    const j = lista.findIndex((x) => x.tipo === tipo && x.aluno === u.email);
    const novo = {
      id: j >= 0 ? lista[j].id : "rel_" + crypto.randomUUID().slice(0, 10),
      tipo, aluno: u.email, periodo: String(b.periodo || "").slice(0, 60),
      resumo: String(b.resumo || "").slice(0, 20000),
      anexos: j >= 0 ? lista[j].anexos || [] : [],
      enviadoEm: new Date().toISOString(), situacao: "enviado",
      parecer: j >= 0 ? lista[j].parecer || "" : "", avaliadoPor: "", avaliadoEm: "",
    };
    if (j >= 0) lista[j] = novo; else lista.push(novo);
    projetos[i] = anotarProjeto({ ...projetos[i], relatorios: lista, atualizadoEm: new Date().toISOString() },
      { quem: u.email, oQue: `enviou o relatório ${tipo}` });
    return { projeto: projetos[i], relatorio: novo };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto), relatorio: r.relatorio });
});

app.post("/api/ic/:id/relatorio/:rid/anexo", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const meu = quemIC(u);
    const p = (await lerProjetos()).find((x) => x.id === req.params.id);
    if (!p || !podeVerProjeto(meu, p)) return res.status(404).json({ error: "Projeto não encontrado" });
    const rel = (p.relatorios || []).find((x) => x.id === req.params.rid);
    if (!rel) return res.status(404).json({ error: "Relatório não encontrado" });
    if (rel.aluno !== u.email) return res.status(403).json({ error: "O anexo é de quem assina o relatório" });

    const arquivo = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `ic/${slug(p.curso || "geral")}/${slug(p.numero || p.id)}`,
    });
    const r = await comProjetos((projetos) => {
      const i = projetos.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Projeto não encontrado"], gravar: false };
      const lista = (projetos[i].relatorios || []).map((x) => x.id !== req.params.rid ? x
        : { ...x, anexos: [...(x.anexos || []).slice(0, 9), { ...arquivo, em: new Date().toISOString() }] });
      projetos[i] = anotarProjeto({ ...projetos[i], relatorios: lista, atualizadoEm: new Date().toISOString() },
        { quem: u.email, oQue: `anexou ${req.file.originalname}` });
      return { projeto: projetos[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
  } catch (e) {
    console.error("Erro ao anexar ao relatório de IC:", e);
    res.status(500).json({ error: e.message || "Erro ao anexar o arquivo" });
  }
});

// Validação do relatório — de quem orienta.
app.post("/api/ic/:id/relatorio/:rid/validar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const decisao = String(req.body?.decisao || "");
  const parecer = String(req.body?.parecer || "").trim().slice(0, 8000);
  if (!["validado", "devolvido"].includes(decisao)) return res.status(400).json({ error: "Decisão inválida" });
  if (decisao === "devolvido" && parecer.length < 10)
    return res.status(400).json({ error: "Diga o que o aluno precisa corrigir." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeValidarRelatorio(meu, projetos[i]))
      return { erro: [403, "Quem valida o relatório é a orientação"], gravar: false };
    const lista = projetos[i].relatorios || [];
    const j = lista.findIndex((x) => x.id === req.params.rid);
    if (j < 0) return { erro: [404, "Relatório não encontrado"], gravar: false };
    lista[j] = { ...lista[j], situacao: decisao, parecer, avaliadoPor: u.email, avaliadoEm: new Date().toISOString() };

    // final validado de todos os alunos encerra o projeto
    const finaisOk = (projetos[i].alunos || []).length > 0 && (projetos[i].alunos || []).every((a) =>
      lista.some((x) => x.tipo === "final" && x.aluno === a.email && x.situacao === "validado"));
    projetos[i] = anotarProjeto({
      ...projetos[i], relatorios: [...lista],
      status: finaisOk && projetos[i].status === "aprovado" ? "concluido" : projetos[i].status,
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `${decisao === "validado" ? "validou" : "devolveu"} o relatório ${lista[j].tipo}` });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

app.delete("/api/ic/:id", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeEditarProjeto(meu, projetos[i])) return { erro: [403, "Sem permissão"], gravar: false };
    if (projetos[i].numero) return { erro: [400, "Projeto já protocolado não pode ser excluído"], gravar: false };
    projetos.splice(i, 1);
    return { ok: true };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true });
});

/* ===================== ASSISTENTE DE ESCRITA (IA) ======================= */
// Ajuda a redigir os campos longos dos formulários — proposta e relatório da
// extensão, pontos de pauta das atas. Nunca cria conteúdo do zero: reescreve
// o que o professor digitou (ver lib/assistente.js).
const IA_LIMITE = { chamadas: 40, janelaMs: 10 * 60 * 1000 };
const iaUso = new Map();   // email -> [timestamps]

function iaExcedeu(email) {
  const agora = Date.now();
  const recentes = (iaUso.get(email) || []).filter((t) => agora - t < IA_LIMITE.janelaMs);
  if (recentes.length >= IA_LIMITE.chamadas) { iaUso.set(email, recentes); return true; }
  recentes.push(agora);
  iaUso.set(email, recentes);
  if (iaUso.size > 500) for (const [k, v] of iaUso) if (!v.some((t) => agora - t < IA_LIMITE.janelaMs)) iaUso.delete(k);
  return false;
}

// A interface consulta isto para saber se deve mostrar os botões.
app.get("/api/ia/estado", async (req, res) => {
  const u = await usuarioDe(req, res);
  if (!u || u.papel === "pendente") return res.status(403).json({ error: "Faça login" });
  const { catalogo } = await import("./lib/assistente.js");
  res.json(catalogo());
});

app.post("/api/ia/assistente", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u || u.papel === "pendente") return res.status(403).json({ error: "Faça login" });
    if (iaExcedeu(u.email)) {
      return res.status(429).json({
        error: "Muitos pedidos ao assistente em pouco tempo. Espere alguns minutos.",
      });
    }
    const { assistir } = await import("./lib/assistente.js");
    const r = await assistir({
      campo: req.body?.campo, acao: req.body?.acao,
      texto: req.body?.texto, contexto: req.body?.contexto,
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error("[ia] assistente:", e.message);
    // erro de uso (texto curto, campo inválido) é 400; falha do provedor é 502
    const doUsuario = /assistente melhora|não reconhecid[ao]|não está configurado|ao menos/i.test(e.message);
    res.status(doUsuario ? 400 : 502).json({
      error: doUsuario ? e.message
        : "O assistente não conseguiu responder agora. O texto que você escreveu está preservado.",
    });
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
app.get("/healthz", async (_req, res) => {
  // `ia` diz apenas QUAL provedor está configurado — nunca a chave, nunca o
  // modelo. Serve para conferir de fora se a ativação pegou, sem precisar de
  // sessão, e para o monitor externo notar se a IA caiu sozinha.
  let ia = "desconhecido";
  try { ia = (await import("./lib/redator.js")).provedorAtivo(); } catch { /* segue */ }
  res.json({ ok: true, servico: "arche", ia, em: new Date().toISOString() });
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
  // Lotes que acompanham o sistema (as submissões do edital) sobem sozinhos
  // no primeiro arranque que os encontrar — ver subirLotesIniciais. Depois
  // deles (e só depois: num arranque limpo os projetos precisam existir
  // primeiro), os anexos dos formulários — cronogramas e planilhas de
  // produção — são ligados a cada projeto.
  subirLotesIniciais().then(aplicarAnexosIniciais);
  // Cobrança do relatório final: varre ao acordar e de hora em hora enquanto
  // o processo estiver vivo. O tráfego do portal também dispara (com throttle),
  // o que cobre as hibernações do plano free.
  setTimeout(() => varrerSeVencido(storage, "boot"), 20_000).unref();
  setInterval(() => varrerSeVencido(storage, "intervalo"), 60 * 60 * 1000).unref();
});
