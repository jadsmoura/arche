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
  participaDeAlgum, vincularPorCpf, modalidadeEfetiva as modalidadeEfetivaIC,
  producaoDoOrientador, prazosRelatorios, fomentoDe, notaTranscrita,
} from "./lib/ic.js";
import { normalizarCpf, soDigitos, formatarCpf } from "./lib/cpf.js";
import { certificadosDe, destinatariosDoCiclo, certificavel } from "./lib/certificados.js";
import {
  EDITAL, LINHAS, GRUPOS_PESQUISA, FOMENTOS, TITULACOES, BLOCOS_PRODUCAO, normalizarTitulacao,
  pontuarProducao, normalizarProducao, notaClassificacao, modalidadePor, gruposConhecidos,
  DOCUMENTOS_EDITAIS, RESULTADOS_EDITAIS,
} from "./lib/edital.js";
import { gerarAlertas, resumoAlertas, porResponsavel } from "./lib/alertas.js";
import { dataCivil, hojeLocalISO } from "./lib/datas.js";
import { CREDENCIAMENTO, MARCAS, UNIEGO_DESDE } from "./lib/marca.js";
import {
  lerSessao, emitirCookie, limparCookie, renovarSessao, carregarUsuarios, salvarUsuarios,
  papelDe, modulosDe, MODULOS, verificarGoogle, criarCodigo, verificarCodigo,
  iniciarAuth, definirSenha, temSenha, validarSenhaDe, senhaFraca, senhaInfo,
  registrarFalha, bloqueado, limparFalhas, FUNCOES, normalizarFuncao,
} from "./lib/auth.js";
import {
  AREA_AV, chaveAcesso, destinoSeguro, emitirSelo, lerSelo, linkAcesso,
  paginaPortaria, senhaConfere,
} from "./lib/portaria.js";

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

/* O caminho que os guardas olham tem de ser o MESMO que o servidor de
   arquivos resolve. `req.path` vem cru do pedido — sem decodificar `%2f` nem
   colapsar `//` —, enquanto o express.static decodifica e normaliza antes de
   procurar o arquivo. Sem esta linha, `//usuarios/` e `/arche%2findex.html`
   passavam ao largo da guarda e caíam direto no disco: a SPA da gestão abria
   sem login. Normaliza-se uma vez, e todo guarda daqui para baixo compara
   contra `req.caminho`. */
app.use((req, res, next) => {
  let bruto;
  try { bruto = decodeURIComponent(req.path); }
  catch { return res.status(400).send("Endereço inválido"); }   // %ZZ: recusa de saída
  req.caminho = path.posix.normalize(bruto);
  next();
});

// Setores de gestão exigem login (Avaliação Institucional continua aberta).
const AREAS_PROTEGIDAS = /^\/(extensao|pesquisa|inovacao|atas|usuarios)(\/|$)/;
app.use(async (req, res, next) => {
  if (req.method !== "GET" || !AREAS_PROTEGIDAS.test(req.caminho)) return next();
  const u = await usuarioDe(req, res);   // renova a sessão de quem está usando
  if (!u) return res.redirect("/entrar?next=" + encodeURIComponent(req.originalUrl));
  if (u.papel === "pendente") {
    // exceção da IC: aluno indicado e avaliador ad hoc designado entram pelo
    // convite, que já é nominal (ver sessaoIC). Vale só para este setor.
    const convidado = req.caminho.startsWith("/pesquisa")
      && participaDeAlgum(u.email, await lerProjetos(), (await carregarPerfis())[u.email]?.cpf || "");
    if (!convidado) return res.redirect("/entrar?pendente=1");
  }
  if (req.caminho.startsWith("/usuarios") && u.papel !== "gestor") return res.redirect("/");
  next();
});

/* ---------------------- PORTARIA DA AVALIAÇÃO (ARCHÉ AV) ------------------
   A Avaliação continua SEM login, como sempre: quem avalia (MEC) e quem
   alimenta o dossiê não tem conta no portal e não vai criar uma. O que mudou
   é que o cartão dela fica na PÁGINA INICIAL, à vista de qualquer visitante —
   então entra uma senha compartilhada só para barrar a passagem de quem caiu
   ali sem ter o que fazer. Não é login: o selo não identifica ninguém.
   Passam sem digitar nada quem chega pelo link de acesso (`?acesso=…`, o que
   se manda ao avaliador) e quem já está logado no ARCHÉ. */
const liberadoNaAv = (req) => !!lerSelo(req) || !!lerSessao(req);

app.use((req, res, next) => {
  if (!AREA_AV.test(req.caminho)) return next();
  if (req.query.acesso !== undefined && String(req.query.acesso) === chaveAcesso()) {
    emitirSelo(res, "link");
    // tira a chave da barra de endereços: o link circula por e-mail, e não há
    // razão para ela ficar no histórico do navegador de quem recebeu
    const limpo = new URL(req.originalUrl, "http://arche");
    limpo.searchParams.delete("acesso");
    return res.redirect(limpo.pathname + limpo.search);
  }
  if (liberadoNaAv(req)) return next();
  if (req.method !== "GET") return res.status(403).json({ error: "Acesso restrito" });
  res.status(401).type("html").send(paginaPortaria(destinoSeguro(req.originalUrl)));
});

// Abrir a porta pela senha. Erra a senha, não entra — e nada mais acontece:
// não há conta para bloquear nem sessão para criar.
app.post("/api/av/entrar", (req, res) => {
  if (!senhaConfere(req.body?.senha))
    return res.status(401).json({ error: "Senha incorreta." });
  emitirSelo(res, "senha");
  res.json({ ok: true, next: destinoSeguro(req.body?.next) });
});

// O link para mandar a quem não tem conta (avaliadores do MEC, sobretudo).
// Só a gestão geral vê — é ele que dispensa a senha.
app.get("/api/av/link", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u || u.papel !== "gestor") return res.status(403).json({ error: "Acesso restrito" });
  res.json({ url: linkAcesso(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`) });
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
  let herdado = null;
  if (b.cpf !== undefined && soDigitos(b.cpf) !== soDigitos(antes.cpf)) {
    const novo = normalizarCpf(b.cpf);
    if (soDigitos(b.cpf) && !novo) return res.status(400).json({ error: "CPF inválido" });
    if (antes.cpf && novo !== antes.cpf && u.papel !== "gestor")
      return res.status(400).json({ error: "O CPF já cadastrado só pode ser alterado pela PROPPEX" });
    const dono = Object.entries(perfis).find(([mail, p]) => mail !== u.email && p?.cpf && p.cpf === novo);
    // PRÉ-CADASTRO: o CPF pode estar num registro que a PROPPEX criou a
    // partir dos documentos do edital, num e-mail que a pessoa não usa mais.
    // Nesse caso o certo é TRANSFERIR para a conta de quem está entrando —
    // recusar deixaria a pessoa fora dos próprios projetos. Registro já
    // reivindicado (alguém entrou e salvou) continua recusando.
    if (novo && dono && dono[1]?.preCadastro) {
      herdado = { email: dono[0], perfil: dono[1] };
      delete perfis[dono[0]];
      console.log(`[perfil] pré-cadastro de ${dono[0]} transferido para ${u.email} (mesmo CPF)`);
    } else if (novo && dono) {
      return res.status(409).json({ error: "Este CPF já está cadastrado em outra conta" });
    }
    cpf = novo;
  }

  perfis[u.email] = {
    // o que veio do pré-cadastro preenche o que a pessoa não informou
    ...(herdado ? { curso: herdado.perfil.curso, funcao: herdado.perfil.funcao } : {}),
    ...antes,
    // a marca some assim que a própria pessoa salva: o registro passa a ser dela
    preCadastro: false,
    // identificação
    nome: txt(b.nome), tratamento: txt(b.tratamento, 60), titulacao: txt(b.titulacao, 20),
    cpf,
    // função vem do catálogo (lib/auth.js); o texto livre só sobrevive em "outro"
    funcaoOutro: normalizarFuncao(b.funcao) === "outro" ? txt(b.funcaoOutro, 120) : "",
    // vínculo institucional
    funcao: normalizarFuncao(b.funcao), curso: txt(b.curso), vinculo: txt(b.vinculo, 40),
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
    // cadastro novo (ou conta ainda pendente) entra aprovado na hora
    const papel = await aprovarCadastroNovo(email, nome);
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
  // cadastro novo (ou conta ainda pendente) entra aprovado na hora
  const papel = await aprovarCadastroNovo(email, email);
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

  // Senha provisória (colocada pela PROPPEX): vale por 7 dias e só serve
  // para entrar UMA vez e definir a senha definitiva — o front recebe
  // `trocarSenha` e não deixa seguir sem trocar.
  const info = await senhaInfo(storage, email);
  if (info.provisoria) {
    const idade = Date.now() - Date.parse(info.atualizadoEm || 0);
    if (!Number.isFinite(idade) || idade > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ ok: false, error: "A senha provisória expirou. Peça uma nova à PROPPEX ou entre com um código por e-mail." });
    }
    emitirCookie(res, { email, nome: email });
    const usuarios = await carregarUsuarios(storage);
    return res.json({ ok: true, papel: papelDe(email, usuarios), trocarSenha: true });
  }

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
    assunto: `[ARCHÉ] Novo cadastro aprovado automaticamente: ${email}`,
    corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif">
      <p><b>${nome}</b> (${email}) entrou no ARCHÉ e foi <b>aprovado automaticamente</b> como submissor
        (decisão da PROPPEX: cadastro novo não fica barrado esperando).</p>
      <p>Se algo estiver errado, a gestão de acessos permite rever.</p>
      <p><a href="${(process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "")}/usuarios/">Abrir gestão de acessos</a></p></div>`,
  });
}

/**
 * Cadastro novo entra APROVADO (decisão do dono, ago/2026): ninguém fica
 * barrado esperando a PROPPEX — a gestão fica sabendo pelo sino de alertas
 * (e por e-mail) e pode rever em /usuarios/. O registro dos cadastros
 * automáticos fica em chave auth-* (invisível pelo /api/estado) e alimenta
 * o alerta "cadastros novos".
 */
const CADASTROS_KEY = "auth-novos-cadastros-v1";
async function aprovarCadastroNovo(email, nome) {
  const e = String(email || "").toLowerCase();
  const usuarios = await carregarUsuarios(storage);
  if (papelDe(e, usuarios) !== "pendente") return papelDe(e, usuarios);
  usuarios.aprovados = [...new Set([...usuarios.aprovados, e])];
  usuarios.pendentes = usuarios.pendentes.filter((p) => p.email !== e);
  await salvarUsuarios(storage, usuarios);
  const lista = JSON.parse((await storage.get(CADASTROS_KEY)) || "[]");
  lista.unshift({ email: e, nome: String(nome || e), quando: new Date().toISOString() });
  await storage.set(CADASTROS_KEY, JSON.stringify(lista.slice(0, 100)));
  await storage.flush?.();
  console.log(`[auth] cadastro novo aprovado automaticamente: ${e}`);
  notificarPendente(e, nome || e).catch(() => {});
  return "aprovado";
}

/**
 * O sino de alertas do topo: o que espera decisão ou atenção, com o recorte
 * do setor de cada gestor — o gestor geral vê tudo (acessos inclusive); o
 * coordenador vê só os módulos que coordena (modulosDe). Quem não gere nada
 * recebe lista vazia e o sino nem aparece. Nada aqui é sigiloso: contagens,
 * nomes e o link da tela onde a ação acontece.
 */
app.get("/api/alertas", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "não autenticado" });
    if (!u.modulos.length) return res.json({ alertas: [], total: 0 });
    const geral = u.papel === "gestor";
    const alertas = [];
    const corte14 = Date.now() - 14 * 24 * 3600 * 1000;

    if (geral) {
      const usuarios = await carregarUsuarios(storage);
      if (usuarios.pendentes.length) {
        alertas.push({ setor: "Acessos", n: usuarios.pendentes.length, link: "/usuarios/",
          texto: `${usuarios.pendentes.length} acesso(s) aguardando aprovação`,
          detalhe: usuarios.pendentes.slice(0, 5).map((p) => p.nome || p.email).join(" · ") });
      }
      const novos = JSON.parse((await storage.get(CADASTROS_KEY)) || "[]")
        .filter((c) => +new Date(c.quando) > corte14);
      if (novos.length) {
        alertas.push({ setor: "Acessos", n: novos.length, link: "/usuarios/",
          texto: `${novos.length} cadastro(s) novo(s) aprovado(s) automaticamente (últimos 14 dias)`,
          detalhe: novos.slice(0, 5).map((c) => c.nome || c.email).join(" · ") });
      }
    }

    if (u.modulos.includes("pesquisa")) {
      const projetos = await lerProjetos();
      const doCiclo = projetos.filter((p) =>
        String(p.edital || EDITAL.numero) === EDITAL.numero && p.status !== "rascunho");
      const emAval = doCiclo.filter((p) => p.status === "submetido").length;
      if (emAval) alertas.push({ setor: "Pesquisa · IC", n: emAval, link: "/pesquisa/ic/",
        texto: `${emAval} projeto(s) aguardando avaliação da seleção` });
      const subst = projetos.reduce((s, p) =>
        s + (p.substituicoes || []).filter((x) => x.situacao === "solicitada").length, 0);
      if (subst) alertas.push({ setor: "Pesquisa · IC", n: subst, link: "/pesquisa/ic/",
        texto: `${subst} pedido(s) de substituição de bolsista aguardando decisão` });
      const atrasados = doCiclo.filter((p) => prazosRelatorios(p)?.atrasado).length;
      if (atrasados) alertas.push({ setor: "Pesquisa · IC", n: atrasados, link: "/pesquisa/ic/",
        texto: `${atrasados} projeto(s) com relatório em atraso` });
    }

    if (u.modulos.includes("extensao")) {
      const acoes = await lerAcoes();
      const submetidas = acoes.filter((a) => a.status === "submetida").length;
      if (submetidas) alertas.push({ setor: "Extensão", n: submetidas, link: "/extensao/",
        texto: `${submetidas} proposta(s) aguardando aprovação` });
      const relatorios = acoes.filter((a) => a.status === "relatorio-entregue").length;
      if (relatorios) alertas.push({ setor: "Extensão", n: relatorios, link: "/extensao/",
        texto: `${relatorios} relatório(s) final(is) entregue(s) para conferir` });
    }

    if (u.modulos.includes("atas")) {
      const atas = await lerAtas();
      const deAtas = gerarAlertas(atas);
      if (deAtas.length) alertas.push({ setor: "Atas", n: deAtas.length, link: "/atas/",
        texto: `${deAtas.length} órgão(s) fora de dia com o registro de atas` });
      // decisão tomada em ata com prazo vencido é o que mais se perde de vista
      const vencidos = encaminhamentos(atas).filter((e) => e.atrasado);
      if (vencidos.length) alertas.push({ setor: "Atas", n: vencidos.length, link: "/atas/",
        texto: `${vencidos.length} encaminhamento(s) com prazo vencido`,
        detalhe: vencidos.slice(0, 3).map((e) => `${e.orgao}: ${e.acao}`.slice(0, 70)).join(" · ") });
    }

    res.json({ alertas, total: alertas.reduce((s, a) => s + (a.n || 1), 0) });
  } catch (e) {
    console.error("Erro nos alertas:", e);
    res.status(500).json({ error: "Falha ao montar os alertas" });
  }
});


/* --------------------- ARCHÉ IC — vitrine pública ------------------------ */
/**
 * Acesso LIVRE, sem login (decisão do dono, pensando no arquivo para o MEC):
 * os editais com seus documentos e a lista simplificada dos projetos —
 * título, orientador(a), bolsista(s) e modalidade. Nada além disso sai por
 * aqui: sem e-mail, sem CPF, sem nota, sem situação interna. Enquanto o
 * processo não termina, os campos ficam em branco e a página se atualiza
 * sozinha conforme a seleção e as indicações acontecem.
 */
app.get("/api/publico/ic", async (req, res) => {
  try {
    const projetos = await lerProjetos();
    res.json({
      instituicao: "Centro Universitário Evangélico de Goianésia — UNIEGO",
      editais: editaisConhecidos(projetos, await resultadosPublicados()),
      projetos: projetos
        .filter((p) => p.status !== "rascunho")
        .map((p) => ({
          edital: String(p.edital || EDITAL.numero),
          titulo: p.titulo || "",
          curso: (CURSOS.find((c) => c.slug === p.curso) || {}).nome || p.curso || "",
          orientador: p.orientador?.nome || "",
          bolsistas: (p.alunos || []).filter((a) => a.bolsista).map((a) => a.nome).filter(Boolean),
          modalidade: p.modalidadeHistorica
            || (p.fomento
              ? (modalidadeEfetivaIC(p)?.nome || (p.fomento.tipo === "voluntario" ? "Voluntário" : ""))
              : (p.status === "reprovado" ? "Não aprovado" : "")),
        }))
        .sort((a, b) => a.orientador.localeCompare(b.orientador, "pt-BR") || a.titulo.localeCompare(b.titulo, "pt-BR")),
    });
  } catch (e) {
    console.error("Erro na vitrine pública da IC:", e);
    res.status(500).json({ error: "Erro ao montar a lista pública" });
  }
});

// O resultado oficial também é público: é o documento que se publica.
app.get("/api/publico/ic/resultado.pdf", async (req, res) => {
  try {
    const numero = String(req.query.edital || EDITAL.numero).trim();
    if (RESULTADOS_EDITAIS[numero]) return res.redirect(RESULTADOS_EDITAIS[numero]);
    const pub = (await resultadosPublicados())[numero];
    if (!pub)
      return res.status(404).send("O resultado deste edital ainda não foi publicado.");
    const todos = await lerProjetos();
    const neutro = { email: "", cpf: "", gestao: true };
    const projetos = todos
      .filter((p) => String(p.edital || EDITAL.numero) === numero && p.status !== "rascunho")
      .map((p) => resumirProjeto(p, neutro));
    const { gerarResultadoEditalPdf } = await import("./lib/pdf.js");
    // o público baixa a fase que a PROPPEX publicou: preliminar ou final
    const buffer = await gerarResultadoEditalPdf({
      edital: numero === EDITAL.numero ? EDITAL : { numero }, projetos, emitidoPor: "",
      fase: pub.fase || "final",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resultado-edital-${slug(numero)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF público do resultado:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

/**
 * Publicar (ou recolher) o resultado do processo — só a coordenação. A
 * publicação tem duas fases: "preliminar" (só os aprovados, antes da
 * distribuição das bolsas — é a lista que vai à presidência para definir as
 * cotas) e "final" (com a bolsa concedida a cada projeto). fase: null
 * recolhe a publicação; até publicar, todos veem "em breve".
 */
app.post("/api/ic/resultado/publicar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Só a coordenação publica o resultado" });
  const numero = String(req.body?.edital || EDITAL.numero).trim();
  const fase = req.body?.fase ?? null;
  if (fase !== null && !["preliminar", "final"].includes(fase))
    return res.status(400).json({ error: "Fase inválida: preliminar, final ou null para recolher" });
  const pub = await resultadosPublicados();
  if (fase) pub[numero] = { fase, em: new Date().toISOString(), por: u.email };
  else delete pub[numero];
  await storage.set(RESULTADO_PUB_KEY, JSON.stringify(pub));
  await storage.flush?.();
  console.log(`[ic] resultado ${numero} ${fase ? `publicado (${fase})` : "recolhido"} por ${u.email}`);
  res.json({ ok: true, edital: numero, fase });
});

/**
 * Convite por e-mail aos PROFESSORES dos projetos importados que ainda não
 * criaram usuário. O projeto os espera pelo CPF (vincularPorCpf); o e-mail
 * veio do formulário do edital e ficou em origem.emailFormulario. Um convite
 * por pessoa, com todos os seus projetos. `simular: true` devolve a lista
 * sem enviar; quem já recebeu só recebe de novo com `reenviar: true` (o
 * registro do envio fica em chave sys-*, fora do /api/estado).
 */
const CONVITES_PROF_KEY = "sys-ic-convites-professores-v1";
app.post("/api/ic/convidar-professores", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Só a coordenação convida os professores" });
  const simular = req.body?.simular === true;
  const reenviar = req.body?.reenviar === true;
  const { enviarEmail, RE_EMAIL } = await import("./lib/mailer.js");

  const projetos = await lerProjetos();
  const doCiclo = projetos.filter((p) =>
    String(p.edital || EDITAL.numero) === EDITAL.numero && p.status !== "rascunho");
  const porCpf = new Map();
  for (const p of doCiclo) {
    const cpf = p.orientador?.cpf || "";
    if (!cpf || p.orientador?.email) continue;     // sem CPF não há vínculo; com e-mail já entrou
    const email = String(p.origem?.emailFormulario || "").trim().toLowerCase();
    if (!porCpf.has(cpf)) porCpf.set(cpf, { cpf, nome: p.orientador?.nome || "", email, titulos: [] });
    const g = porCpf.get(cpf);
    if (!g.email && email) g.email = email;
    g.titulos.push(p.titulo || p.numero || "(sem título)");
  }

  const registro = JSON.parse((await storage.get(CONVITES_PROF_KEY)) || "{}");
  const resumo = (x) => ({ nome: x.nome, email: x.email, projetos: x.titulos.length });
  const todos = [...porCpf.values()];
  const semEmail = todos.filter((x) => !RE_EMAIL.test(x.email));
  const jaConvidados = todos.filter((x) => RE_EMAIL.test(x.email) && registro[x.cpf]);
  const novos = todos.filter((x) => RE_EMAIL.test(x.email) && !registro[x.cpf]);
  if (simular) {
    return res.json({
      simulado: true,
      novos: novos.map(resumo), jaConvidados: jaConvidados.map(resumo),
      semEmail: semEmail.map((x) => ({ nome: x.nome, projetos: x.titulos.length })),
    });
  }

  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  // depois de entrar, a pessoa cai direto no perfil — onde o CPF se informa
  const link = `${base}/entrar?next=${encodeURIComponent("/perfil/")}`;
  const alvo = reenviar ? [...novos, ...jaConvidados] : novos;
  const enviados = [], falhas = [];
  for (const d of alvo) {
    try {
      await enviarEmail({
        para: d.email,
        assunto: "[ARCHÉ] Edital 01/2026 — crie o seu acesso para acompanhar seus projetos",
        corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px">
          <p>Olá, <b>${d.nome || "professor(a)"}</b>!</p>
          <p>Sua(s) proposta(s) submetida(s) ao <b>Edital 01/2026</b> de Iniciação Científica,
            Inovação Tecnológica e Iniciação à Extensão já está(ão) registrada(s) no <b>ARCHÉ</b>,
            o portal de gestão da PROPPEX — UNIEGO:</p>
          <p style="background:#eef3f5;border-radius:10px;padding:12px 16px">
            ${d.titulos.map((t) => `• ${t}`).join("<br>")}</p>
          <p><b>Próximos passos:</b></p>
          <ol style="padding-left:20px">
            <li><b>Crie o seu usuário</b> — entre com a sua conta Google ou receba um código
              de acesso por e-mail.</li>
            <li><b>Informe o seu CPF no Perfil</b> — é o CPF que vincula automaticamente os
              seus projetos à sua conta. Sem ele, os projetos não aparecem. Você pode criar a
              conta com qualquer e-mail: o vínculo é pelo CPF.</li>
            <li>Acompanhe tudo no setor <b>Pesquisa · IC</b>: a situação da seleção, o
              cronograma e, com o projeto aprovado, a indicação dos alunos e os relatórios.</li>
          </ol>
          <p><a href="${link}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
            padding:12px 22px;border-radius:10px;font-weight:600">Entrar no ARCHÉ</a></p>
          <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${link}<br>
            PROPPEX — Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária · UNIEGO</p></div>`,
      });
      registro[d.cpf] = { email: d.email, em: new Date().toISOString(), por: u.email };
      enviados.push(resumo(d));
      console.log(`[ic] convite de cadastro enviado a ${d.email}`);
    } catch (e) {
      falhas.push({ ...resumo(d), erro: e.message });
      console.error(`[ic] convite de cadastro a ${d.email} falhou:`, e.message);
    }
  }
  if (enviados.length) {
    await storage.set(CONVITES_PROF_KEY, JSON.stringify(registro));
    await storage.flush?.();
  }
  res.json({ enviados, falhas, semEmail: semEmail.map((x) => ({ nome: x.nome, projetos: x.titulos.length })) });
});

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

/**
 * Senha provisória colocada pelo gestor — para quem perdeu o acesso ao
 * e-mail e não consegue receber o código. Rota separada da de papéis de
 * propósito: aquela reconstrói as listas de papel, e um "resetar senha"
 * não pode ter o efeito colateral de rebaixar ninguém. A senha vale 7 dias
 * e obriga a troca no primeiro login. Conta de gestor fica de fora: gestor
 * troca a própria senha no perfil — um não redefine a do outro.
 */
/**
 * PAINEL DE USUÁRIOS (só gestor geral): quem está cadastrado, o que cada um
 * faz na instituição, o papel no sistema e — o que a gestão mais pergunta —
 * QUE SETORES a pessoa realmente usa. "Cadastrado" aqui é a união de tudo o
 * que identifica alguém: perfil preenchido, lista de papéis, cadastro novo
 * e quem aparece nos projetos de IC (o convidado que ainda não entrou).
 */
app.get("/api/usuarios/painel", async (req, res) => {
  try {
    const g = await exigirGestor(req, res); if (!g) return;
    const [usuarios, perfis, projetos, atas] = await Promise.all([
      carregarUsuarios(storage), carregarPerfis(), lerProjetos(), lerAtas(),
    ]);
    const acoes = await lerAcoes();
    const novos = JSON.parse((await storage.get(CADASTROS_KEY)) || "[]");

    const conta = new Map();
    const de = (email) => {
      const e = String(email || "").trim().toLowerCase();
      if (!e || !e.includes("@")) return null;
      if (!conta.has(e)) conta.set(e, { email: e, uso: { pesquisa: 0, extensao: 0, atas: 0 } });
      return conta.get(e);
    };
    // 1. quem tem perfil, papel ou cadastro registrado
    for (const e of Object.keys(perfis)) de(e);
    for (const e of [...usuarios.gestores, ...usuarios.aprovados, ...Object.keys(usuarios.coordenadores)]) de(e);
    for (const p of usuarios.pendentes) de(p.email);
    for (const c of novos) de(c.email);
    // 2. uso real de cada setor
    for (const p of projetos) {
      for (const e of [p.orientador?.email, p.criadoPor, ...(p.alunos || []).map((a) => a.email),
        ...(p.avaliacoes || []).map((a) => a.email)]) {
        const c = de(e); if (c) c.uso.pesquisa += 1;
      }
    }
    for (const a of acoes) { const c = de(a?.proposta?.respEmail); if (c) c.uso.extensao += 1; }
    for (const a of atas) { const c = de(a?.criadoPor); if (c) c.uso.atas += 1; }

    const quandoNovo = Object.fromEntries(novos.map((c) => [c.email, c.quando]));
    const pendente = Object.fromEntries(usuarios.pendentes.map((p) => [p.email, p.quando]));
    const lista = [...conta.values()].map((c) => {
      const perfil = perfis[c.email] || {};
      return {
        email: c.email,
        nome: perfil.nome || "",
        funcao: normalizarFuncao(perfil.funcao),
        funcaoOutro: perfil.funcaoOutro || (normalizarFuncao(perfil.funcao) === "outro" ? perfil.funcao || "" : ""),
        curso: perfil.curso || "", telefone: perfil.telefone || "", lattes: perfil.lattes || "",
        titulacao: perfil.titulacao || "", matricula: perfil.matricula || "",
        temCpf: !!perfil.cpf, temPerfil: !!perfil.nome,
        preCadastro: !!perfil.preCadastro,
        papel: papelDe(c.email, usuarios),
        modulos: modulosDe(c.email, usuarios),
        uso: c.uso,
        setores: ["pesquisa", "extensao", "atas"].filter((k) => c.uso[k] > 0),
        desde: perfil.criadoEm || quandoNovo[c.email] || pendente[c.email] || "",
        atualizadoEm: perfil.atualizadoEm || "",
      };
    }).sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));

    res.json({ usuarios: lista, funcoes: FUNCOES, cursos: CURSOS, modulos: MODULOS });
  } catch (e) {
    console.error("Erro no painel de usuários:", e);
    res.status(500).json({ error: "Falha ao montar o painel" });
  }
});

/**
 * A gestão edita o cadastro de outra pessoa (nome, função, curso, contato)
 * — o mesmo perfil que ela veria em /perfil/. Serve também para INCLUIR
 * alguém à mão: e-mail novo entra com o perfil preenchido e já aprovado
 * como submissor, sem precisar esperar o primeiro login.
 * Senha e papéis não passam por aqui: cada um tem a sua rota, de propósito.
 */
app.post("/api/usuarios/perfil", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const b = req.body || {};
  const e = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: "E-mail inválido" });
  const nome = String(b.nome || "").trim().slice(0, 120);
  if (!nome) return res.status(400).json({ error: "Informe o nome da pessoa" });

  const perfis = await carregarPerfis();
  const antes = perfis[e] || {};
  const novo = !antes.nome;

  // CPF continua único por conta: dois cadastros com o mesmo CPF fariam o
  // segundo herdar os projetos do primeiro (vincularPorCpf)
  let cpf = antes.cpf || "";
  if (b.cpf !== undefined && soDigitos(b.cpf) !== soDigitos(antes.cpf)) {
    const c = normalizarCpf(b.cpf);
    if (soDigitos(b.cpf) && !c) return res.status(400).json({ error: "CPF inválido" });
    const dono = Object.entries(perfis).find(([mail, p]) => mail !== e && p?.cpf && p.cpf === c);
    if (c && dono) return res.status(409).json({ error: `Este CPF já está cadastrado em ${dono[0]}` });
    cpf = c;
  }

  const funcao = normalizarFuncao(b.funcao);
  perfis[e] = {
    ...antes, nome, cpf, funcao,
    funcaoOutro: funcao === "outro" ? String(b.funcaoOutro || "").trim().slice(0, 120) : "",
    curso: String(b.curso ?? antes.curso ?? "").trim().slice(0, 80),
    titulacao: String(b.titulacao ?? antes.titulacao ?? "").trim().slice(0, 20),
    matricula: String(b.matricula ?? antes.matricula ?? "").trim().slice(0, 40),
    telefone: String(b.telefone ?? antes.telefone ?? "").trim().slice(0, 40),
    lattes: String(b.lattes ?? antes.lattes ?? "").trim().slice(0, 200),
    criadoEm: antes.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: g.email,
  };
  await storage.set(PERFIS_KEY, JSON.stringify(perfis));

  // inclusão manual: a conta já nasce podendo submeter
  const usuarios = await carregarUsuarios(storage);
  if (papelDe(e, usuarios) === "pendente") {
    usuarios.aprovados = [...new Set([...usuarios.aprovados, e])];
    usuarios.pendentes = usuarios.pendentes.filter((p) => p.email !== e);
    await salvarUsuarios(storage, usuarios);
  }
  // com CPF no perfil, os projetos importados que esperavam por ele acham o dono
  const vinculo = cpf ? await vincularPerfisIC() : { pessoas: 0, projetos: 0 };
  await storage.flush?.();
  console.log(`[usuarios] perfil de ${e} ${novo ? "criado" : "editado"} por ${g.email}`);
  res.json({ ok: true, email: e, criado: novo, vinculo });
});

app.post("/api/usuarios/senha", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const e = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: "E-mail inválido" });
  const u = await carregarUsuarios(storage);
  if (papelDe(e, u) === "gestor")
    return res.status(400).json({ error: "Conta de gestor não recebe senha provisória — o gestor troca a própria senha no perfil." });
  const fraca = senhaFraca(senha);
  if (fraca) return res.status(400).json({ error: fraca });
  await definirSenha(storage, e, senha, { provisoria: true, por: g.email });
  console.log(`[auth] senha provisória definida para ${e} por ${g.email}`);
  res.json({ ok: true, email: e, validaDias: 7 });
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
const CHAVES_INTERNAS = /^(auth-|sys-|atas-|ic-|ex-)/;

app.get("/api/estado", async (req, res) => {
  try {
    const chave = stateKey(req);
    if (CHAVES_INTERNAS.test(chave)) return res.status(404).json({ error: "nf" });
    // as chaves abertas são as da Avaliação: a porta é a mesma da portaria,
    // senão bastaria pular a tela e ler tudo pela API
    if (!liberadoNaAv(req)) return res.status(403).json({ error: "Acesso restrito" });
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
  if (!liberadoNaAv(req)) return false;          // portaria da Avaliação
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
    if (!liberadoNaAv(req)) return res.status(403).json({ error: "Acesso restrito" });
    const keys = (await storage.list(String(req.query.prefixo || "")))
      .filter((k) => !CHAVES_INTERNAS.test(k));
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ------------------------------- UPLOADS -------------------------------- */
// Os três uploads abaixo são da Avaliação e do dossiê: valem a mesma portaria
// das páginas, senão a barreira só existiria na tela.
app.use(["/api/drive/upload", "/api/drive/upload-avaliacao", "/api/drive/upload-doc-institucional"],
  (req, res, next) => (liberadoNaAv(req) ? next() : res.status(403).json({ error: "Acesso restrito" })));

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
/* ======================= ARCHÉ EX — ações de extensão ====================
   As ações saíram do /api/estado (chave `ex-acoes-v1`, interna): elas
   guardam CPF, telefone e e-mail de participantes, e ali qualquer conta
   aprovada baixava a base inteira. Agora toda leitura e gravação passa por
   estas rotas, com o mesmo recorte que atas e IC já usavam: o professor vê
   e edita as SUAS ações; a gestão do módulo vê e edita todas.
   ======================================================================== */
const EX_KEY = "ex-acoes-v1";
const EX_KEY_ANTIGA = "extensao-acoes-v1";

async function lerAcoes() {
  const raw = await storage.get(EX_KEY);
  return raw ? JSON.parse(raw) : [];
}
// fila serializada: duas gravações simultâneas se perderiam uma à outra
let filaEx = Promise.resolve();
function comAcoes(fn) {
  const proxima = filaEx.then(async () => {
    const acoes = await lerAcoes();
    const r = await fn(acoes);
    if (r?.gravar !== false) {
      await storage.set(EX_KEY, JSON.stringify(acoes));
      await storage.flush?.();
    }
    return r;
  });
  filaEx = proxima.catch(() => {});
  return proxima;
}
const gereEx = (u) => !!u?.modulos?.includes("extensao");
// a ação é de quem a submeteu — pelo e-mail do responsável ou de quem criou
const minhaAcao = (u, a) => {
  const e = String(u?.email || "").toLowerCase();
  return !!e && (String(a?.criadoPor || "").toLowerCase() === e
    || String(a?.proposta?.respEmail || "").toLowerCase() === e);
};
const podeVerAcao = (u, a) => gereEx(u) || minhaAcao(u, a);

async function sessaoEx(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(403).json({ error: "Faça login para acessar a Extensão" }); return null; }
  if (u.papel === "pendente") {
    res.status(403).json({ error: "Seu acesso ainda está pendente de aprovação da PROPPEX" });
    return null;
  }
  return u;
}

/** A lista que a pessoa pode ver — nunca a base inteira. */
app.get("/api/extensao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const acoes = (await lerAcoes()).filter((a) => podeVerAcao(u, a));
    res.json({ acoes, gestao: gereEx(u), eu: u.email });
  } catch (e) {
    console.error("Erro ao listar ações de extensão:", e);
    res.status(500).json({ error: "Falha ao carregar as ações" });
  }
});

/**
 * Grava as ações que a pessoa mandou — uma a uma, e só as que ela pode
 * editar. Nunca apaga o que não veio no corpo: a lista do cliente já é um
 * recorte, e um "salvar" do professor não pode sumir com as ações alheias.
 */
app.post("/api/extensao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const entrada = Array.isArray(req.body?.acoes) ? req.body.acoes : [];
    if (!entrada.length) return res.status(400).json({ error: "Nada a gravar" });
    const r = await comAcoes((acoes) => {
      let gravadas = 0, recusadas = 0;
      for (const nova of entrada) {
        if (!nova?.id) { recusadas++; continue; }
        const i = acoes.findIndex((x) => x.id === nova.id);
        const base = i >= 0 ? acoes[i] : null;
        // ação nova: quem submete é o dono. Ação existente: só o dono ou a gestão
        if (base ? !podeVerAcao(u, base) : !minhaAcao(u, nova)) { recusadas++; continue; }
        // o número da ação e a situação são decisão da gestão, não do formulário
        const controlado = base && !gereEx(u)
          ? { numeroAcao: base.numeroAcao, status: base.status, apreciacao: base.apreciacao,
              criadoPor: base.criadoPor, criadoEm: base.criadoEm }
          : {};
        const final = { ...nova, ...controlado, atualizadoEm: new Date().toISOString() };
        if (i >= 0) acoes[i] = final; else acoes.push(final);
        gravadas++;
      }
      return { gravadas, recusadas, gravar: gravadas > 0 };
    });
    if (r.recusadas) console.warn(`[extensao] ${r.recusadas} ação(ões) recusada(s) de ${u.email}`);
    const acoes = (await lerAcoes()).filter((a) => podeVerAcao(u, a));
    res.json({ ok: true, ...r, acoes });
  } catch (e) {
    console.error("Erro ao gravar ação de extensão:", e);
    res.status(500).json({ error: "Falha ao gravar" });
  }
});

app.post("/api/extensao/notificar", async (req, res) => {
  try {
    const { id } = req.body || {};
    const raw = await storage.get(EX_KEY);
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
    const raw = await storage.get(EX_KEY);
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
    await storage.set(EX_KEY, JSON.stringify(acoes));
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
    const raw = await storage.get(EX_KEY);
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

/**
 * Os presentes da ÚLTIMA sessão do mesmo órgão — para não redigitar a mesma
 * lista toda reunião. Não é cadastro fixo de composição (decisão do dono:
 * lista fixa emperra o processo): é uma cópia editável, e a presença de
 * cada um volta a "presente" para ser conferida na hora.
 * Precisa vir antes de /api/atas/:id, senão viraria um id.
 */
app.get("/api/atas/ultimos-participantes", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const orgao = String(req.query.orgao || "").trim();
  const curso = String(req.query.curso || "").trim();
  if (!orgao) return res.status(400).json({ error: "Informe o órgão" });
  const atas = (await lerAtas())
    .filter((a) => a.orgao === orgao && String(a.curso || "") === curso
      && (a.participantes || []).length && podeVer(u, a))
    .sort((a, b) => String(b.sessao?.data || "").localeCompare(String(a.sessao?.data || "")));
  if (!atas.length) return res.json({ participantes: [], de: null });
  const ref = atas[0];
  res.json({
    // só quem estava na mesa: nome, cargo, e-mail e condição. A presença é
    // desta sessão, não da anterior — quem lavra confere um a um
    participantes: (ref.participantes || []).map((p) => ({
      nome: p.nome || "", cargo: p.cargo || "", email: p.email || "",
      condicao: p.condicao || "membro", presenca: "presente",
    })),
    de: { numero: ref.numero || "", data: ref.sessao?.data || "" },
  });
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
  if (meu.perfilGenerico) return meu.perfilGenerico;   // visão genérica do "ver como"
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
const PERFIS_GENERICOS = ["orientador", "aluno", "avaliador"];

async function visaoComo(req, u) {
  const alvo = String(req.query?.como || "").trim().toLowerCase();
  if (!alvo || !gereIC(u)) return null;
  // "perfil:orientador" / "perfil:aluno" / "perfil:avaliador" — a visão
  // GENÉRICA do perfil, sem pessoa: um professor (ou aluno, ou avaliador ad
  // hoc) recém-chegado, ainda sem projeto nenhum. É como a coordenação confere
  // a cara de cada um dos três acessos sem escolher alguém real.
  if (PERFIS_GENERICOS.includes(alvo.replace(/^perfil:/, "")) && alvo.startsWith("perfil:")) {
    return { email: "", cpf: "", gestao: false, simulado: true, perfilGenerico: alvo.slice(7) };
  }
  // "cpf:00000000000" — quem ainda não tem conta, mas já está em projeto
  // importado: mostra o que a pessoa vai encontrar quando se cadastrar
  if (alvo.startsWith("cpf:")) {
    return { email: "", cpf: normalizarCpf(alvo.slice(4)), gestao: false, simulado: true };
  }
  const perfis = await carregarPerfis();
  // o nome vai junto: nos ciclos antigos as pessoas só são identificadas por
  // ele, e sem isso a simulação mostraria menos do que a pessoa realmente vê
  return {
    email: alvo, cpf: perfis[alvo]?.cpf || "", nome: perfis[alvo]?.nome || "",
    gestao: false, simulado: true,
  };
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
/**
 * O resultado do edital VIGENTE só se divulga quando a coordenação publicar
 * — antes disso, quem não é gestão (e a vitrine pública) vê "em breve". Os
 * editais encerrados têm o PDF publicado da época e estão sempre abertos.
 */
const RESULTADO_PUB_KEY = "ic-resultado-publicado-v1";
async function resultadosPublicados() {
  const raw = await storage.get(RESULTADO_PUB_KEY);
  return raw ? JSON.parse(raw) : {};
}

function editaisConhecidos(projetos, publicados = {}) {
  // as contagens são agregadas de TODOS os projetos (quem chama é o servidor,
  // não a visão de cada um) — é o que permite mostrar a guia Editais e
  // Resultados para qualquer usuário sem vazar projeto alheio
  const mapa = new Map([[EDITAL.numero, { projetos: 0, bolsas: 0 }]]);
  for (const p of projetos || []) {
    const n = String(p.edital || EDITAL.numero);
    if (p.status === "rascunho") continue;
    if (!mapa.has(n)) mapa.set(n, { projetos: 0, bolsas: 0 });
    mapa.get(n).projetos += 1;
    if (p.fomento && p.fomento.tipo !== "voluntario") mapa.get(n).bolsas += 1;
  }
  return [...mapa].map(([numero, c]) => ({
    numero, projetos: c.projetos, bolsas: c.bolsas, vigente: numero === EDITAL.numero,
    documento: DOCUMENTOS_EDITAIS[numero] || null,
    resultadoDocumento: RESULTADOS_EDITAIS[numero] || null,
    // os PDFs catalogados são os resultados finais da época; o do ciclo
    // vigente passa pelas fases preliminar → final, publicadas pela gestão
    resultadoFase: RESULTADOS_EDITAIS[numero] ? "final" : (publicados[numero]?.fase || null),
    resultadoPublicado: !!RESULTADOS_EDITAIS[numero] || !!publicados[numero],
  })).sort((a, b) => b.numero.localeCompare(a.numero, "pt-BR"));
}

/** Catálogo do edital mais o que já foi informado à mão, num array só. */
function todosOsGrupos(projetos) {
  const { certificados, informados } = gruposConhecidos(projetos);
  return [...certificados, ...informados];
}

function producaoMaisRecente(projetos, u) {
  // casa por e-mail OU CPF (lib/ic.js): a planilha das submissões importadas
  // — que chegaram pelo CPF — já abre na próxima submissão do professor
  const p = producaoDoOrientador(projetos, quemIC(u));
  return p ? p.producao : null;
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
    // os editais (números, contagens e documentos) são de todos; a lista de
    // pessoas para o "ver como" segue só com a coordenação
    editais: editaisConhecidos(projetos, await resultadosPublicados()),
    ...(gereIC(u) ? { pessoas: pessoasDoSetor(projetos) } : {}),
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
    // O resultado é o documento PUBLICADO do processo: qualquer pessoa do
    // setor baixa o mesmo PDF. Por isso o resumo sai por um leitor neutro de
    // gestão — sem identidade, para o papel de ninguém recortar as notas.
    const numero = String(req.query.edital || EDITAL.numero).trim();
    // edital encerrado com resultado publicado: o documento original vale
    if (RESULTADOS_EDITAIS[numero]) return res.redirect(RESULTADOS_EDITAIS[numero]);
    // antes da publicação, o gerador é prévia de trabalho: só a gestão baixa
    const pub = (await resultadosPublicados())[numero];
    if (!gereIC(u) && !pub)
      return res.status(403).send("O resultado deste edital ainda não foi publicado pela PROPPEX.");
    // a gestão escolhe a fase da prévia (?fase=preliminar|final); os demais
    // baixam exatamente a fase publicada
    const fase = gereIC(u)
      ? (["preliminar", "final"].includes(req.query.fase) ? req.query.fase : (pub?.fase || "final"))
      : (pub.fase || "final");
    const todos = await lerProjetos();
    const neutro = { email: "", cpf: "", gestao: true };
    const projetos = todos
      .filter((p) => String(p.edital || EDITAL.numero) === numero && p.status !== "rascunho")
      .map((p) => resumirProjeto(p, neutro));
    const { gerarResultadoEditalPdf } = await import("./lib/pdf.js");
    const buffer = await gerarResultadoEditalPdf({
      edital: numero === EDITAL.numero ? EDITAL : { numero },
      projetos, emitidoPor: u.email, fase,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resultado-edital-${slug(numero)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF do resultado:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

/**
 * A produção acadêmica mais recente de UM professor, identificado por
 * e-mail ou CPF — é o que deixa a inclusão manual abrir com a planilha de
 * quem orienta (nunca a de quem digita). Só a gestão consulta; a resposta
 * traz só a planilha e de onde ela veio, nada além.
 * Precisa vir antes de /api/ic/:id, senão "producao-anterior" viraria um id.
 */
/**
 * CERTIFICADOS da IC (com login, sempre): os do aluno e os de orientação,
 * reunidos pelo CPF — é o que junta numa conta só quem participou de mais
 * de uma edição — com o e-mail como segunda chave. Só ciclo concluído.
 * Precisa vir antes de /api/ic/:id, senão viraria um id.
 */
app.get("/api/ic/certificados", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    const projetos = await lerProjetos();
    // "ver como": a lista tem de ser a DA PESSOA simulada — sem isto a
    // coordenação via os próprios certificados achando que eram dela
    const como = await visaoComo(req, u);
    const perfil = (await carregarPerfis())[u.email] || {};
    // o nome entra porque os ciclos antigos identificam as pessoas só por ele
    const eu = como
      ? { cpf: como.cpf || "", email: como.email || "", nome: como.nome || "" }
      : { cpf: u.cpf || "", email: u.email, nome: perfil.nome || u.nome || "" };
    const meus = certificadosDe(projetos, eu);
    const resp = {
      certificados: meus, temCpf: !!eu.cpf, temNome: !!eu.nome,
      ...(como ? { simulando: como.email } : {}),
    };
    if (gereIC(u) && !como) {
      // à gestão interessa o tamanho de cada ciclo e quem dá para avisar
      const porNome = await emailsPorNome();
      const ciclos = [...new Set(projetos.filter(certificavel).map((p) => String(p.edital || "")))]
        .filter(Boolean).sort((a, b) => b.localeCompare(a, "pt-BR"))
        .map((edital) => {
          const { destinatarios, semEmail } = destinatariosDoCiclo(projetos, edital, porNome);
          const total = destinatarios.reduce((n, d) => n + d.certificados, 0) + semEmail;
          return { edital, total, avisaveis: destinatarios.length, semEmail };
        });
      resp.ciclos = ciclos;
      const ass = await lerAssinaturas();
      resp.assinaturas = Object.fromEntries(Object.keys(QUEM_ASSINA)
        .map((k) => [k, ass[k] ? { em: ass[k].em, arquivo: ass[k].arquivo } : null]));
    }
    res.json(resp);
  } catch (e) {
    console.error("Erro ao listar certificados:", e);
    res.status(500).json({ error: "Falha ao carregar os certificados" });
  }
});

/**
 * EXPORTAÇÃO da lista de projetos (só gestão): planilha e fichas em PDF.
 * Aceita os mesmos filtros da tela — exporta-se o que se está vendo, não a
 * base inteira. Precisa vir antes de /api/ic/:id, senão viraria um id.
 */
function projetosFiltrados(projetos, q) {
  const txt = (v) => String(v ?? "").toLowerCase();
  const edital = String(q.edital || "").trim();
  const busca = txt(q.q).trim();
  return projetos.filter((p) => {
    if (p.status === "rascunho") return false;
    if (edital && edital !== "__todos" && String(p.edital || EDITAL.numero) !== edital) return false;
    if (q.status && p.status !== q.status) return false;
    if (q.curso && p.curso !== q.curso) return false;
    if (q.linha && p.linha !== q.linha) return false;
    if (q.titulacao && normalizarTitulacao(p.orientador?.titulacao) !== q.titulacao) return false;
    if (q.grupo === "__com" && !p.grupoPesquisa) return false;
    if (q.grupo === "__sem" && p.grupoPesquisa) return false;
    if (q.grupo && !["__com", "__sem"].includes(q.grupo) && p.grupoPesquisa !== q.grupo) return false;
    if (q.bolsa === "sem" && !(["aprovado", "concluido"].includes(p.status)
      && (!p.fomento || p.fomento.tipo === "voluntario"))) return false;
    if (q.bolsa && q.bolsa !== "sem" && p.fomento?.tipo !== q.bolsa) return false;
    if (busca && !txt(`${p.numero} ${p.titulo} ${p.orientador?.nome} ${(p.alunos || []).map((a) => a.nome).join(" ")}`)
      .includes(busca)) return false;
    return true;
  });
}
const resumoDosFiltros = (q) => [
  q.edital && q.edital !== "__todos" ? `edital ${q.edital}` : "",
  q.status ? `situação ${q.status}` : "", q.curso ? `curso ${q.curso}` : "",
  q.linha ? `linha ${q.linha}` : "", q.titulacao ? `titulação ${q.titulacao}` : "",
  q.bolsa ? `bolsa ${q.bolsa}` : "", q.grupo ? "com filtro de grupo" : "",
  q.q ? `busca “${q.q}”` : "",
].filter(Boolean).join(" · ");

app.get("/api/ic/projetos.xlsx", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Exportação restrita à coordenação");
    const neutro = { email: "", cpf: "", gestao: true };
    const lista = projetosFiltrados(await lerProjetos(), req.query)
      .map((p) => ({ ...p, resumo: resumirProjeto(p, neutro) }));
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "ARCHÉ · PROPPEX";
    const ws = wb.addWorksheet("Projetos");
    ws.columns = [
      { header: "Protocolo", key: "numero", width: 15 },
      { header: "Edital", key: "edital", width: 10 },
      { header: "Situação", key: "status", width: 14 },
      { header: "Título", key: "titulo", width: 58 },
      { header: "Curso", key: "curso", width: 22 },
      { header: "Linha", key: "linha", width: 10 },
      { header: "Modalidade", key: "modalidade", width: 18 },
      { header: "Orientador(a)", key: "orientador", width: 32 },
      { header: "Titulação", key: "titulacao", width: 13 },
      { header: "E-mail da orientação", key: "email", width: 32 },
      { header: "Grupo de pesquisa", key: "grupo", width: 34 },
      { header: "Alunos", key: "alunos", width: 38 },
      { header: "Bolsa", key: "fomento", width: 14 },
      { header: "NP", key: "np", width: 8 },
      { header: "CL", key: "cl", width: 8 },
      { header: "Nota final", key: "total", width: 11 },
      { header: "Início", key: "inicio", width: 12 },
      { header: "Término", key: "fim", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };
    for (const p of lista) {
      const c = p.resumo.classificacao || {};
      ws.addRow({
        // o campo em branco significa "ciclo vigente" em todo o resto do
        // sistema (String(p.edital || EDITAL.numero)); a planilha dizia o
        // contrário — saía com a coluna vazia para os projetos do ciclo
        numero: p.numero || "", edital: String(p.edital || EDITAL.numero),
        status: IC_ROTULO_STATUS[p.status] || p.status,
        titulo: p.titulo || "", curso: (CURSOS.find((x) => x.slug === p.curso) || {}).nome || p.curso || "",
        linha: (p.linha || "").toUpperCase(),
        modalidade: p.modalidadeHistorica || modalidadeEfetivaIC(p)?.nome || "",
        orientador: p.orientador?.nome || "", titulacao: normalizarTitulacao(p.orientador?.titulacao) || "",
        email: p.orientador?.email || "", grupo: p.grupoPesquisa || "",
        alunos: (p.alunos || []).map((a) => a.nome).filter(Boolean).join(", "),
        fomento: p.fomento ? (fomentoDe(p.fomento.tipo)?.nome || p.fomento.tipo) : "",
        np: c.np ?? "", cl: c.cl ?? "", total: c.total ?? "",
        inicio: p.inicio || "", fim: p.fim || "",
      });
    }
    ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="projetos-ic-${slug(req.query.edital || "todos")}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("Erro ao exportar projetos (xlsx):", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
  }
});

app.get("/api/ic/projetos.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Exportação restrita à coordenação");
    const neutro = { email: "", cpf: "", gestao: true };
    const lista = projetosFiltrados(await lerProjetos(), req.query).map((p) => {
      const r = resumirProjeto(p, neutro);
      return { ...p, classificacao: r.classificacao, producao: r.producao };
    });
    if (!lista.length) return res.status(404).send("Nenhum projeto com esses filtros.");
    const { gerarProjetosPdf } = await import("./lib/pdf.js");
    const buffer = await gerarProjetosPdf({
      projetos: lista, emitidoPor: u.email, filtros: resumoDosFiltros(req.query),
      titulo: req.query.edital && req.query.edital !== "__todos" ? `Edital ${req.query.edital}` : "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="fichas-projetos-${slug(req.query.edital || "todos")}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro ao exportar projetos (pdf):", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

/** Nome (normalizado) → e-mail dos perfis: é assim que se descobre para
    quem avisar nos ciclos antigos, onde o registro só tem o nome. */
async function emailsPorNome() {
  const perfis = await carregarPerfis();
  const mapa = {};
  for (const [email, p] of Object.entries(perfis)) {
    const k = String(p?.nome || "").trim().toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    if (k && !mapa[k]) mapa[k] = email;
  }
  return mapa;
}

/* ---------------------- assinaturas dos certificados ---------------------
   A assinatura digitalizada é ENVIADA PELO PRÓPRIO SISTEMA, não colocada no
   repositório: em produção o disco é efêmero (cada deploy recria o
   contêiner), e trocar de reitor não pode exigir um deploy. Fica no estado
   interno, em base64, e só o gestor geral grava.
   ========================================================================= */
const ASSINATURAS_KEY = "sys-assinaturas-v1";
const QUEM_ASSINA = { proreitor: "Pró-Reitor", reitor: "Reitor" };

async function lerAssinaturas() {
  const raw = await storage.get(ASSINATURAS_KEY);
  return raw ? JSON.parse(raw) : {};
}
/** As imagens como Buffer, do jeito que o gerador de PDF precisa. */
async function assinaturasParaPdf() {
  const guardadas = await lerAssinaturas();
  const out = {};
  for (const [quem, a] of Object.entries(guardadas)) {
    if (a?.base64) { try { out[quem] = Buffer.from(a.base64, "base64"); } catch { /* ignora */ } }
  }
  return out;
}

app.post("/api/ic/assinatura", upload.single("file"), async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const quem = String(req.body?.quem || "").trim();
  if (!QUEM_ASSINA[quem]) return res.status(400).json({ error: "Informe de quem é a assinatura" });
  if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
  // PNG com fundo transparente é o que fica bom sobre a linha; JPG passa,
  // mas o retângulo branco aparece — por isso o aviso na tela
  if (!/^image\/(png|jpeg)$/.test(req.file.mimetype || ""))
    return res.status(400).json({ error: "Envie uma imagem PNG (de preferência com fundo transparente)" });
  if (req.file.size > 2 * 1024 * 1024)
    return res.status(400).json({ error: "Imagem muito grande — até 2 MB" });
  const todas = await lerAssinaturas();
  todas[quem] = {
    base64: req.file.buffer.toString("base64"), tipo: req.file.mimetype,
    arquivo: req.file.originalname || "", em: new Date().toISOString(), por: g.email,
  };
  await storage.set(ASSINATURAS_KEY, JSON.stringify(todas));
  await storage.flush?.();
  console.log(`[ic] assinatura de ${quem} enviada por ${g.email}`);
  res.json({ ok: true, quem, tamanho: req.file.size });
});

app.delete("/api/ic/assinatura/:quem", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const todas = await lerAssinaturas();
  delete todas[req.params.quem];
  await storage.set(ASSINATURAS_KEY, JSON.stringify(todas));
  await storage.flush?.();
  res.json({ ok: true });
});

/** A imagem guardada, para a gestão conferir o que vai sair no documento. */
app.get("/api/ic/assinatura/:quem", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const a = (await lerAssinaturas())[req.params.quem];
  if (!a?.base64) return res.status(404).send("Sem assinatura enviada");
  res.setHeader("Content-Type", a.tipo || "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(a.base64, "base64"));
});

/** O documento em si — só sai para quem tem direito a ele. */
app.get("/api/ic/certificado.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    const como = await visaoComo(req, u);
    const perfil = (await carregarPerfis())[u.email] || {};
    const quem = como
      ? { cpf: como.cpf || "", email: como.email || "", nome: como.nome || "" }
      : { cpf: u.cpf || "", email: u.email, nome: perfil.nome || u.nome || "" };
    const meus = certificadosDe(await lerProjetos(), quem);
    const cert = meus.find((c) => c.codigo === String(req.query.codigo || ""));
    if (!cert) return res.status(404).send("Certificado não encontrado para a sua conta.");
    const { gerarCertificadoPdf } = await import("./lib/pdf.js");
    const buffer = await gerarCertificadoPdf({ ...cert, assinaturas: await assinaturasParaPdf() });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="certificado-${cert.tipo}-${slug(cert.numero || cert.edital)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no certificado:", e);
    res.status(500).send("Erro ao gerar o certificado: " + e.message);
  }
});

/**
 * Aviso por e-mail, por ciclo: um e-mail por pessoa dizendo quantos
 * certificados a esperam e onde baixar. Só a gestão. `simular: true`
 * devolve a lista sem enviar — é o que alimenta a confirmação da tela.
 */
app.post("/api/ic/certificados/avisar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Só a coordenação avisa sobre os certificados" });
  const edital = String(req.body?.edital || "").trim();
  if (!edital) return res.status(400).json({ error: "Informe o ciclo" });
  const { destinatarios, semEmail } = destinatariosDoCiclo(await lerProjetos(), edital, await emailsPorNome());
  if (req.body?.simular === true) return res.json({ simulado: true, destinatarios, semEmail });

  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  const link = `${base}/entrar?next=${encodeURIComponent("/pesquisa/ic/")}`;
  const { enviarEmail } = await import("./lib/mailer.js");
  const enviados = [], falhas = [];
  for (const d of destinatarios) {
    try {
      await enviarEmail({
        para: d.email,
        assunto: `[ARCHÉ] Seu certificado de Iniciação Científica (${edital}) está disponível`,
        corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px">
          <p>Olá${d.nome ? `, <b>${d.nome}</b>` : ""}!</p>
          <p>O(s) seu(s) <b>certificado(s) do Edital ${edital}</b> de Iniciação Científica
            já pode(m) ser baixado(s) no ARCHÉ — são <b>${d.certificados}</b> documento(s).</p>
          <p>Entre no sistema e abra a guia <b>Certificados</b>, no setor Pesquisa · IC.
            Se for o seu primeiro acesso, crie o usuário com este e-mail e
            <b>informe o seu CPF no perfil</b>: é ele que reúne, numa conta só, os
            certificados de todas as edições em que você participou.</p>
          <p><a href="${link}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
            padding:12px 22px;border-radius:10px;font-weight:600">Baixar meu certificado</a></p>
          <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${link}<br>
            PROPPEX — Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária · UNIEGO</p></div>`,
      });
      enviados.push(d);
    } catch (e) {
      falhas.push({ ...d, erro: e.message });
      console.error(`[ic] aviso de certificado a ${d.email} falhou:`, e.message);
    }
  }
  console.log(`[ic] aviso de certificados do ${edital}: ${enviados.length} enviado(s) por ${u.email}`);
  res.json({ enviados, falhas, semEmail });
});

app.get("/api/ic/producao-anterior", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Só a coordenação consulta a produção de outra pessoa" });
  const email = String(req.query.email || "").trim().toLowerCase();
  const cpf = normalizarCpf(req.query.cpf);
  if (!email && !cpf) return res.json({ producao: null });
  const p = producaoDoOrientador(await lerProjetos(), { email, cpf });
  res.json(p
    ? { producao: p.producao, de: { nome: p.orientador?.nome || "", numero: p.numero || "", edital: p.edital || "" } }
    : { producao: null });
});

/**
 * Planilha dos bolsistas de um edital (.xlsx), para a PROPPEX montar os
 * contratos — as mesmas colunas do formulário que o setor já usava fora do
 * sistema. Uma linha por bolsista de projeto aprovado com bolsa. Dados
 * bancários de aluno: só a gestão baixa.
 */
app.get("/api/ic/bolsistas.xlsx", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Somente a coordenação de pesquisa exporta os bolsistas.");
    const numero = String(req.query.edital || EDITAL.numero).trim();
    const projetos = (await lerProjetos()).filter((p) =>
      String(p.edital || EDITAL.numero) === numero &&
      ["aprovado", "concluido"].includes(p.status) &&
      p.fomento && p.fomento.tipo !== "voluntario");

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bolsistas");
    ws.columns = [
      { header: "Categoria de Bolsa", key: "categoria", width: 18 },
      { header: "Curso", key: "curso", width: 22 },
      { header: "Protocolo", key: "protocolo", width: 14 },
      { header: "Projeto", key: "projeto", width: 50 },
      { header: "Nome Completo do Orientador", key: "orientador", width: 32 },
      { header: "CPF do Professor", key: "cpfProfessor", width: 16 },
      { header: "Telefone (WhatsApp)", key: "telefoneProfessor", width: 18 },
      { header: "E-mail do Orientador", key: "emailProfessor", width: 30 },
      { header: "Nome Completo do Aluno", key: "aluno", width: 32 },
      { header: "CPF do Aluno", key: "cpfAluno", width: 16 },
      { header: "Telefone do Aluno", key: "telefoneAluno", width: 18 },
      { header: "E-mail do Aluno", key: "emailAluno", width: 30 },
      { header: "Banco do Aluno", key: "banco", width: 16 },
      { header: "Agência", key: "agencia", width: 10 },
      { header: "Conta Corrente", key: "conta", width: 16 },
      { header: "Pix (vinculado à conta)", key: "pix", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of projetos) {
      const mod = modalidadeEfetivaIC(p);
      for (const a of (p.alunos || []).filter((x) => x.bolsista)) {
        ws.addRow({
          categoria: mod?.nome || (p.fomento.tipo === "cnpq" ? "Bolsa CNPq" : "Bolsa UNIEGO"),
          curso: (CURSOS.find((c) => c.slug === p.curso) || {}).nome || p.curso || "",
          protocolo: p.numero || "",
          projeto: p.titulo || "",
          orientador: p.orientador?.nome || "",
          cpfProfessor: formatarCpf(p.orientador?.cpf) || "",
          telefoneProfessor: p.orientador?.telefone || "",
          emailProfessor: p.orientador?.email || "",
          aluno: a.nome || "",
          cpfAluno: formatarCpf(a.cpf) || "",
          telefoneAluno: a.telefone || "",
          emailAluno: a.email || "",
          banco: a.banco || "", agencia: a.agencia || "", conta: a.conta || "", pix: a.pix || "",
        });
      }
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bolsistas-edital-${slug(numero)}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("Erro na planilha de bolsistas:", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
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
    // NP/CL/total da ficha: derivado que só resumir() calcula — sem ele a
    // gestão veria a nota na lista e no PDF, mas não na tela do projeto
    ...(meu.gestao ? { classificacao: resumirProjeto(p, meu).classificacao ?? null } : {}),
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

    // A submissão não pede os dados da orientação: o projeto nasce na CONTA
    // de quem submete, e nome, titulação, telefone, Lattes e CPF saem do
    // PERFIL (/perfil/), que o próprio professor mantém. Vale só para o
    // projeto novo do professor — na inclusão manual a coordenação informa
    // quem orienta, e a edição preserva o que o projeto já tem.
    if (!b.id && !manual) {
      const perfil = (await carregarPerfis())[u.email] || {};
      b.orientador = {
        ...(b.orientador || {}),
        nome: String(b.orientador?.nome || perfil.nome || u.nome || "").trim(),
        email: u.email,
        titulacao: b.orientador?.titulacao || perfil.titulacao || "",
        telefone: b.orientador?.telefone || perfil.telefone || perfil.whatsapp || "",
        lattes: b.orientador?.lattes || perfil.lattes || "",
        cpf: b.orientador?.cpf || perfil.cpf || "",
      };
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
        // Documentos e conta bancária são DO ALUNO: ele mesmo informa, pela
        // rota própria. O formulário da orientação nunca os altera — nem os
        // apaga sem querer ao salvar a indicação (ela não recebe os valores).
        const doBase = (email) => (base.alunos || []).find((a) => a.email && a.email === email);
        p.alunos = p.alunos.map((a) => {
          const antes = doBase(a.email);
          return antes ? { ...a, cpf: antes.cpf, banco: antes.banco, agencia: antes.agencia,
            conta: antes.conta, pix: antes.pix } : a;
        });
        // aluno recém-indicado num projeto aprovado: recebe o convite por
        // e-mail para entrar no sistema e completar os próprios dados
        const novos = ["aprovado", "concluido"].includes(base.status)
          ? p.alunos.filter((a) => a.email && !doBase(a.email)) : [];
        projetos[i] = anotarProjeto(p, { quem: u.email, oQue: "atualizou cronograma, alunos, produção ou grupo" });
        return { projeto: projetos[i], convidar: novos };
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
    if (r.convidar?.length) convidarAlunosIC(r.projeto, r.convidar);   // sem await: e-mail não trava a gravação
    res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
  } catch (e) {
    console.error("Erro ao gravar projeto de IC:", e);
    res.status(500).json({ error: e.message || "Erro ao gravar o projeto" });
  }
});

/**
 * O e-mail que abre o sistema para o aluno indicado: convite com o link de
 * entrada. Ele entra com este e-mail (código ou Google), cria o usuário e
 * completa os próprios dados — documentos, banco e Pix — dentro do projeto.
 * Falha de e-mail não pode derrubar a indicação: melhor logar e seguir.
 */
async function convidarAlunosIC(projeto, alunos) {
  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  const link = `${base}/entrar?next=${encodeURIComponent("/pesquisa/ic/")}`;
  for (const a of alunos) {
    try {
      const { enviarEmail } = await import("./lib/mailer.js");
      await enviarEmail({
        para: a.email,
        assunto: `[ARCHÉ] Você foi indicado(a) para a Iniciação Científica — ${projeto.numero || "UNIEGO"}`,
        corpoHtml: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px">
          <p>Olá${a.nome ? `, <b>${a.nome}</b>` : ""}!</p>
          <p>Você foi indicado(a) por <b>${projeto.orientador?.nome || "sua orientação"}</b> como
            ${a.bolsista ? "<b>bolsista</b>" : "aluno(a) voluntário(a)"} no projeto:</p>
          <p style="background:#eef3f5;border-radius:10px;padding:12px 16px"><b>${projeto.titulo || ""}</b><br>
            ${projeto.numero || ""} · Centro Universitário Evangélico de Goianésia — UNIEGO</p>
          <p><b>Próximo passo:</b> entre no ARCHÉ com este e-mail (${a.email}) para criar o seu
            usuário e completar o seu cadastro${a.bolsista ? " — documentos pessoais, dados bancários e chave Pix, necessários para o contrato da bolsa" : ""}.
            É lá também que ficam o seu cronograma e a entrega dos relatórios parcial e final.</p>
          <p><a href="${link}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
            padding:12px 22px;border-radius:10px;font-weight:600">Entrar no ARCHÉ</a></p>
          <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${link}</p></div>`,
      });
      console.log(`[ic] convite enviado a ${a.email} (${projeto.numero || projeto.id})`);
    } catch (e) {
      console.error(`[ic] convite a ${a.email} falhou:`, e.message);
    }
  }
}

/**
 * Os dados que o PRÓPRIO aluno informa depois de indicado — documentos,
 * conta bancária e Pix, os campos da planilha do contrato. Só o aluno do
 * registro grava aqui; a orientação nem os enxerga (alunosVisiveis).
 */
app.post("/api/ic/:id/meus-dados", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const b = req.body || {};
  const cpf = normalizarCpf(b.cpf);
  if (String(b.cpf || "").trim() && !cpf)
    return res.status(400).json({ error: "CPF inválido — confira os 11 dígitos." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    const p = projetos[i];
    const idx = (p.alunos || []).findIndex((a) => a.email && a.email === meu.email);
    if (idx < 0) return { erro: [403, "Só o próprio aluno indicado preenche os seus dados"], gravar: false };
    const alunos = p.alunos.slice();
    alunos[idx] = {
      ...alunos[idx],
      cpf: cpf || alunos[idx].cpf,
      telefone: String(b.telefone ?? alunos[idx].telefone ?? "").trim().slice(0, 30),
      banco: String(b.banco ?? alunos[idx].banco ?? "").trim().slice(0, 60),
      agencia: String(b.agencia ?? alunos[idx].agencia ?? "").trim().slice(0, 20),
      conta: String(b.conta ?? alunos[idx].conta ?? "").trim().slice(0, 30),
      pix: String(b.pix ?? alunos[idx].pix ?? "").trim().slice(0, 120),
    };
    projetos[i] = anotarProjeto(normalizarProjeto({ ...p, alunos }, { base: p }),
      { quem: u.email, oQue: "completou os próprios dados para o contrato" });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/**
 * Substituição de bolsista: a orientação SOLICITA a troca — diz quem sai,
 * apresenta o novo aluno (nome, curso, período, e-mail, telefone) e o
 * motivo — e a decisão é da coordenação. Aprovada, o sistema faz a troca:
 * o aluno que sai perde o vínculo, o novo entra como bolsista e recebe o
 * convite por e-mail para completar os próprios dados. O pedido inteiro
 * fica registrado no projeto.
 */
app.post("/api/ic/:id/substituicao", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const b = req.body || {};
  const novo = b.novo || {};
  if (!String(novo.nome || "").trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(novo.email || "").trim()))
    return res.status(400).json({ error: "Informe o nome e um e-mail válido do novo bolsista — é pelo e-mail que ele entra no sistema." });
  if (String(b.motivo || "").trim().length < 10)
    return res.status(400).json({ error: "Escreva o motivo da substituição — ele fica registrado no projeto." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    const p = projetos[i];
    const papel = papelNoProjeto(meu, p);
    if (papel !== "orientador" && papel !== "gestao")
      return { erro: [403, "A substituição é pedida pela orientação (ou registrada pela coordenação)"], gravar: false };
    if (!["aprovado", "concluido"].includes(p.status) || !p.fomento || p.fomento.tipo === "voluntario")
      return { erro: [400, "Substituição de bolsista vale para projeto aprovado com bolsa"], gravar: false };
    const sai = (p.alunos || []).find((a) => a.bolsista && (a.email === String(b.saiEmail || "").toLowerCase() || a.nome === b.saiNome));
    if (!sai) return { erro: [400, "Diga qual bolsista sai — não encontrei o aluno indicado"], gravar: false };

    const pedido = {
      id: `sub-${Math.random().toString(36).slice(2, 10)}`,
      sai: { nome: sai.nome, email: sai.email },
      novo: {
        nome: String(novo.nome).trim().slice(0, 120),
        email: String(novo.email).trim().toLowerCase().slice(0, 160),
        telefone: String(novo.telefone || "").trim().slice(0, 30),
        curso: String(novo.curso || "").trim().slice(0, 60),
        periodo: String(novo.periodo || "").trim().slice(0, 30),
      },
      motivo: String(b.motivo).trim().slice(0, 2000),
      por: u.email, em: new Date().toISOString(), situacao: "solicitada",
    };
    projetos[i] = anotarProjeto({
      ...p, substituicoes: [...(p.substituicoes || []), pedido], atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `solicitou a substituição do bolsista ${sai.nome || sai.email} por ${pedido.novo.nome}` });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

// A decisão da coordenação sobre o pedido. Aprovada, a troca acontece aqui.
app.post("/api/ic/:id/substituicao/:sid", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const decisao = String(req.body?.decisao || "");
  if (!["aprovada", "recusada"].includes(decisao))
    return res.status(400).json({ error: "Decisão inválida" });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (papelNoProjeto(meu, projetos[i]) !== "gestao")
      return { erro: [403, "A decisão da substituição é da coordenação"], gravar: false };
    const p = projetos[i];
    const idx = (p.substituicoes || []).findIndex((x) => x.id === req.params.sid && x.situacao === "solicitada");
    if (idx < 0) return { erro: [404, "Pedido não encontrado ou já decidido"], gravar: false };
    const pedido = { ...p.substituicoes[idx], situacao: decisao, decididoPor: u.email, decididoEm: new Date().toISOString() };
    const substituicoes = p.substituicoes.slice(); substituicoes[idx] = pedido;

    let alunos = p.alunos || [];
    if (decisao === "aprovada") {
      alunos = alunos.filter((a) => !(a.bolsista && (a.email === pedido.sai.email && a.nome === pedido.sai.nome)));
      alunos = [...alunos, { ...pedido.novo, bolsista: true }];
    }
    projetos[i] = anotarProjeto(normalizarProjeto({ ...p, alunos }, { base: { ...p, substituicoes } }), {
      quem: u.email,
      oQue: decisao === "aprovada"
        ? `aprovou a substituição: sai ${pedido.sai.nome || pedido.sai.email}, entra ${pedido.novo.nome} como bolsista`
        : `recusou a substituição de ${pedido.sai.nome || pedido.sai.email}`,
    });
    return { projeto: projetos[i], convidar: decisao === "aprovada" ? [{ ...pedido.novo, bolsista: true }] : [] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  if (r.convidar?.length) convidarAlunosIC(r.projeto, r.convidar);
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
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
      return { erro: [403, "Só a coordenação avalia — projetos submetidos ou em execução (o concluído é definitivo)"], gravar: false };
    projetos[i] = anotarProjeto({
      ...projetos[i], status: decisao,
      // reprovado ou devolvido, a concessão de bolsa morre junto com a decisão
      fomento: decisao === "aprovado" ? projetos[i].fomento : null,
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
/**
 * Mudança de fluxo (ago/2026, decisão do dono): a proposta não carrega mais
 * aluno — a indicação acontece depois da aprovação, e os dados pessoais e
 * bancários quem informa é o próprio aluno. Os alunos que vieram gravados
 * nas propostas (lote do edital, importados sem e-mail) são apagados UMA
 * vez; a marca impede o deploy seguinte de apagar indicações novas.
 */
/**
 * Enquadra os cronogramas na vigência do edital (decisão do dono): execução
 * de setembro/2026 a agosto/2027. Etapa que começava antes passa a começar
 * em 01/09/2026; a que terminava depois, a terminar em 31/08/2027 — o
 * miolo de cada plano fica como o professor desenhou. Também fixa o início
 * e o fim de cada projeto do edital. Roda UMA vez (marca em sys-*).
 */
async function enquadrarCronogramasIniciais() {
  const marca = "sys-ic-cronograma-vigencia-v1";
  if (await storage.get(marca)) return;
  const INI = EDITAL.vigencia.inicio, FIM = EDITAL.vigencia.fim;
  await comProjetos((projetos) => {
    let n = 0;
    for (let i = 0; i < projetos.length; i++) {
      const p = projetos[i];
      if (String(p.edital || EDITAL.numero) !== EDITAL.numero) continue;
      const cronograma = (p.cronograma || []).map((e) => ({
        ...e,
        inicio: e.inicio ? (e.inicio < INI ? INI : e.inicio > FIM ? FIM : e.inicio) : e.inicio,
        fim: e.fim ? (e.fim > FIM ? FIM : e.fim < INI ? INI : e.fim) : e.fim,
      }));
      const mudou = JSON.stringify(cronograma) !== JSON.stringify(p.cronograma)
        || p.inicio !== INI || p.fim !== FIM;
      if (mudou) { n += 1; projetos[i] = { ...p, cronograma, inicio: INI, fim: FIM }; }
    }
    console.log(`[ic] cronogramas enquadrados na vigência ${INI} → ${FIM}: ${n} projeto(s)`);
    return {};
  });
  await storage.set(marca, new Date().toISOString());
  await storage.flush?.();
}

/**
 * O ARQUIVO dos ciclos anteriores (2022→2025): editais e resultados que já
 * foram publicados em PDF, transcritos para o sistema como projetos
 * CONCLUÍDOS — título, curso, orientação, bolsistas do ciclo e a modalidade
 * histórica (PIBIC/FACEG etc.). Sem proposta, sem CPF, sem nota: registro,
 * não fluxo. Cada lote sobe UMA vez (marca sys-ic-lote-<nome>) — apagar um
 * projeto do arquivo não o ressuscita no deploy seguinte.
 */
const LOTES_HISTORICOS = ["edital-01-2022", "edital-01-2023", "edital-01-2024", "edital-01-2025"];

async function subirArquivoHistorico() {
  for (const nome of LOTES_HISTORICOS) {
    const marca = `sys-ic-lote-${nome}`;
    if (await storage.get(marca)) continue;
    const lote = await lerLoteDoDisco(nome).catch(() => null);
    if (!lote?.historico) continue;
    await comProjetos((projetos) => {
      let n = 0;
      lote.projetos.forEach((bruto, linha) => {
        const chave = String(bruto.origemId || `${nome}:${linha + 1}`);
        if (projetos.some((p) => p.origem?.lote === nome && p.origem?.id === chave)) return;
        const ano = Number(String(lote.edital).split("/").pop());
        let p = normalizarProjeto({ ...bruto }, { autor: "" });
        p = numerarProjeto(projetos, {
          ...p, ano, status: "concluido", edital: lote.edital,
          inicio: bruto.inicio || lote.vigencia?.inicio || "",
          fim: bruto.fim || lote.vigencia?.fim || "",
          fomento: bruto.fomento ? { tipo: bruto.fomento, modalidade: "", observacao: "", por: "", em: "" } : null,
          modalidadeHistorica: String(bruto.modalidadeHistorica || "").slice(0, 40),
          origem: { lote: nome, id: chave, importadoEm: new Date().toISOString(), por: "arquivo-historico" },
          criadoPor: "",
          historico: [{ quando: new Date().toISOString(), quem: "sistema",
            oQue: `entrou no arquivo histórico (${lote.edital}, resultado publicado)` }],
        });
        projetos.push(p);
        n += 1;
      });
      console.log(`[ic] arquivo histórico ${nome}: ${n} projeto(s)`);
      return {};
    });
    await storage.set(marca, new Date().toISOString());
    await storage.flush?.();
  }
}

async function zerarAlunosIniciais() {
  const marca = "sys-ic-alunos-zerados-v1";
  if (await storage.get(marca)) return;
  await comProjetos((projetos) => {
    let n = 0;
    for (let i = 0; i < projetos.length; i++) {
      if ((projetos[i].alunos || []).length) { n += 1; projetos[i] = { ...projetos[i], alunos: [] }; }
    }
    console.log(`[ic] fluxo novo de indicação: alunos zerados em ${n} projeto(s)`);
    return {};
  });
  await storage.set(marca, new Date().toISOString());
  await storage.flush?.();
}

/**
 * As ações de extensão saem da chave pública para a interna, uma vez só
 * (marca sys-*). A chave antiga é ESVAZIADA depois da cópia: deixá-la com
 * o conteúdo manteria a base aberta pelo /api/estado, que é justamente o
 * que esta mudança fecha.
 */
async function migrarAcoesExtensao() {
  const marca = "sys-ex-acoes-migradas-v1";
  try {
    if (await storage.get(marca)) return;
    const antigo = await storage.get(EX_KEY_ANTIGA);
    const jaTem = await storage.get(EX_KEY);
    const acoes = antigo ? JSON.parse(antigo) : [];
    if (acoes.length && !jaTem) await storage.set(EX_KEY, JSON.stringify(acoes));
    if (antigo) await storage.set(EX_KEY_ANTIGA, "[]");
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), acoes: acoes.length }));
    await storage.flush?.();
    console.log(`ARCHÉ EX · ${acoes.length} ação(ões) movida(s) para a chave interna`);
  } catch (e) {
    console.error("Falha ao migrar as ações de extensão:", e.message);
  }
}

/**
 * Bolsistas nomeados dos ciclos anteriores, com CPF — vindos dos termos de
 * compromisso assinados, que são a única fonte oficial daquele dado. Entram
 * uma vez (marca sys-*) e só onde o projeto ainda não tem aluno: o CPF é o
 * que faz o certificado achar o dono, e nada aqui pode sobrescrever o que a
 * gestão tenha ajustado depois.
 */
const LOTES_ALUNOS = ["edital-01-2024", "edital-01-2025"];
async function subirAlunosHistoricos() {
  for (const nome of LOTES_ALUNOS) {
    const marca = `sys-ic-alunos-${nome}`;
    try {
      if (await storage.get(marca)) continue;
      const arq = JSON.parse(
        await readFile(path.join(__dirname, "dados", `ic-${nome}-alunos.json`), "utf8"));
      // COMPLETA o que já existe em vez de substituir: os ciclos antigos
      // trazem o aluno só pelo nome (veio do resultado publicado), e o termo
      // acrescenta CPF e e-mail. Campo já preenchido nunca é sobrescrito —
      // o que a gestão ajustou vale mais que o documento de origem.
      const chaveNome = (v) => String(v || "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
      const r = await comProjetos((projetos) => {
        let tocados = 0, completados = 0, novos = 0;
        for (const [origemId, alunos] of Object.entries(arq.alunos || {})) {
          const i = projetos.findIndex((p) => p.origem?.lote === nome && p.origem?.id === String(origemId));
          if (i < 0) continue;
          const base = projetos[i];
          const lista = (base.alunos || []).slice();
          let mexeu = false;
          for (const novo of alunos) {
            const j = lista.findIndex((a) => chaveNome(a.nome) === chaveNome(novo.nome));
            if (j >= 0) {
              const antes = lista[j];
              const junto = { ...antes, cpf: antes.cpf || novo.cpf, email: antes.email || novo.email,
                curso: antes.curso || novo.curso, bolsista: antes.bolsista || novo.bolsista };
              if (JSON.stringify(junto) !== JSON.stringify(antes)) { lista[j] = junto; mexeu = true; completados++; }
            } else { lista.push(novo); mexeu = true; novos++; }
          }
          if (!mexeu) continue;
          projetos[i] = normalizarProjeto({ ...base, alunos: lista }, { base, autor: base.criadoPor || "" });
          tocados++;
        }
        return { tocados, completados, novos, gravar: tocados > 0 };
      });
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
      console.log(`ARCHÉ IC · ${r.tocados} projeto(s) de ${nome} com bolsista nomeado`);
    } catch (e) {
      console.error(`Falha ao subir os alunos de ${nome}:`, e.message);
    }
  }
}

/**
 * O CPF do professor se espalha pelos ciclos antigos. Os históricos foram
 * transcritos dos resultados publicados, onde a pessoa aparece só pelo
 * nome; o ciclo corrente veio do formulário, com CPF. Como é a mesma
 * pessoa, o CPF conhecido preenche os registros antigos e o vínculo deixa
 * de depender de grafia de nome — passa a ser pela chave forte.
 * Nunca sobrescreve CPF já gravado.
 */
async function propagarCpfOrientadores() {
  const marca = "sys-ic-cpf-orientadores-v1";
  try {
    if (await storage.get(marca)) return;
    const chaveNome = (v) => String(v || "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    const r = await comProjetos((projetos) => {
      const cpfPorNome = new Map();
      for (const p of projetos) {
        const o = p.orientador || {};
        if (o.cpf && o.nome) cpfPorNome.set(chaveNome(o.nome), o.cpf);
      }
      let tocados = 0;
      for (let i = 0; i < projetos.length; i++) {
        const o = projetos[i].orientador || {};
        if (o.cpf || !o.nome) continue;
        const cpf = cpfPorNome.get(chaveNome(o.nome));
        if (!cpf) continue;
        projetos[i] = { ...projetos[i], orientador: { ...o, cpf } };
        tocados++;
      }
      return { tocados, professores: cpfPorNome.size, gravar: tocados > 0 };
    });
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
    console.log(`ARCHÉ IC · CPF do orientador propagado a ${r.tocados} projeto(s) de ciclos anteriores`);
  } catch (e) {
    console.error("Falha ao propagar CPF dos orientadores:", e.message);
  }
}

/**
 * PRÉ-CADASTRO: a PROPPEX já sabe quem são estas pessoas — nome, CPF e
 * e-mail vieram dos documentos oficiais (formulário do edital e termos de
 * compromisso). Em vez de esperar cada um digitar tudo de novo, o perfil
 * nasce pronto e marcado como `preCadastro`. Quando a pessoa entra com
 * aquele e-mail, está tudo lá; se entrar com outro e informar o CPF, o
 * pré-cadastro é TRANSFERIDO para a conta dela (ver /api/perfil).
 * A marca some na primeira vez que a própria pessoa salva o perfil.
 */
async function criarPreCadastros() {
  const marca = "sys-ic-precadastros-v1";
  try {
    if (await storage.get(marca)) return;
    const projetos = await lerProjetos();
    const perfis = await carregarPerfis();
    const usuarios = await carregarUsuarios(storage);
    const conhecidos = new Map();       // e-mail → { nome, cpf, curso, papel }
    const juntar = (email, dados) => {
      const e = String(email || "").trim().toLowerCase();
      if (!e.includes("@") || perfis[e]) return;      // quem já tem perfil não é tocado
      const antes = conhecidos.get(e) || {};
      conhecidos.set(e, {
        nome: antes.nome || dados.nome || "",
        cpf: antes.cpf || dados.cpf || "",
        curso: antes.curso || dados.curso || "",
        papel: antes.papel || dados.papel,
      });
    };
    for (const p of projetos) {
      const o = p.orientador || {};
      juntar(o.email || p.origem?.emailFormulario, {
        nome: o.nome, cpf: o.cpf, curso: cursoNomeDe(p.curso), papel: "professor",
      });
      for (const a of p.alunos || []) {
        juntar(a.email, { nome: a.nome, cpf: a.cpf, curso: a.curso || cursoNomeDe(p.curso), papel: "aluno" });
      }
    }
    // CPF é único por conta: se dois registros trouxerem o mesmo, nenhum leva
    const porCpf = new Map();
    for (const [email, d] of conhecidos) {
      if (!d.cpf) continue;
      porCpf.set(d.cpf, (porCpf.get(d.cpf) || 0) + 1);
      if (Object.values(perfis).some((p) => p?.cpf === d.cpf)) d.cpf = "";   // já é de alguém
    }
    let criados = 0;
    for (const [email, d] of conhecidos) {
      if (!d.nome) continue;
      perfis[email] = {
        nome: d.nome, cpf: porCpf.get(d.cpf) === 1 ? d.cpf : "", curso: d.curso || "",
        funcao: d.papel === "aluno" ? "" : "professor",
        preCadastro: true, criadoEm: new Date().toISOString(),
        criadoPor: "sistema (pré-cadastro a partir dos documentos do edital)",
      };
      // já aprovado: o convite é o próprio e-mail, e ninguém precisa esperar
      if (papelDe(email, usuarios) === "pendente") usuarios.aprovados.push(email);
      criados++;
    }
    if (criados) {
      await storage.set(PERFIS_KEY, JSON.stringify(perfis));
      usuarios.aprovados = [...new Set(usuarios.aprovados)];
      await salvarUsuarios(storage, usuarios);
    }
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), criados }));
    await storage.flush?.();
    console.log(`ARCHÉ IC · ${criados} pré-cadastro(s) criado(s) a partir dos documentos do edital`);
  } catch (e) {
    console.error("Falha ao criar os pré-cadastros:", e.message);
  }
}
const cursoNomeDe = (slug) => (CURSOS.find((c) => c.slug === slug) || {}).nome || "";

/**
 * A identidade acadêmica do pró-reitor vive na conta INSTITUCIONAL
 * (decisão do dono, ago/2026): a conta pessoal é só de gestão. Os projetos
 * em que ele consta como orientador — transcritos dos resultados antigos,
 * só com o nome — passam a apontar para o e-mail do UNIEGO. Isso também
 * encerra o casamento por nome na conta pessoal: com e-mail gravado, o
 * nome deixa de ser chave (ver lib/certificados.js).
 */
const PROREITOR = {
  nome: "Jadson Belem de Moura",
  institucional: "jadson.moura@uniego.edu.br",
};
async function identidadeInstitucionalDoProReitor() {
  const marca = "sys-ic-proreitor-institucional-v1";
  try {
    if (await storage.get(marca)) return;
    const chave = (v) => String(v || "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    const alvo = chave(PROREITOR.nome);
    const r = await comProjetos((projetos) => {
      let tocados = 0;
      for (let i = 0; i < projetos.length; i++) {
        const o = projetos[i].orientador || {};
        if (chave(o.nome) !== alvo || o.email) continue;
        projetos[i] = { ...projetos[i], orientador: { ...o, email: PROREITOR.institucional } };
        tocados++;
      }
      return { tocados, gravar: tocados > 0 };
    });
    // e o perfil institucional passa a ter o nome, que é o que liga tudo
    const perfis = await carregarPerfis();
    const antes = perfis[PROREITOR.institucional] || {};
    if (!antes.nome) {
      perfis[PROREITOR.institucional] = {
        ...antes, nome: PROREITOR.nome, funcao: antes.funcao || "coord-pesquisa",
        criadoEm: antes.criadoEm || new Date().toISOString(),
      };
      await storage.set(PERFIS_KEY, JSON.stringify(perfis));
    }
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
    await storage.flush?.();
    console.log(`ARCHÉ IC · ${r.tocados} projeto(s) do pró-reitor ligados à conta institucional`);
  } catch (e) {
    console.error("Falha ao ligar a conta institucional do pró-reitor:", e.message);
  }
}

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

/**
 * Pareceres do edital 01/2026, transcritos. A seleção correu FORA do sistema:
 * os avaliadores pontuaram os mesmos sete critérios numa planilha e
 * escreveram o parecer de cada projeto. Isso entra em `notaDireta` — o campo
 * da nota atribuída pela coordenação —, agora com o detalhe junto: critérios,
 * recomendação e o texto do parecer.
 *
 * O casamento é pelo PROTOCOLO, que é único e não se repete. Três cuidados:
 *   - nota já atribuída no sistema NÃO é sobrescrita: se a coordenação
 *     regravou, quem manda é ela, não um arquivo de deploy;
 *   - projeto com parecer entregue pelo sistema também fica de fora — ali o
 *     caminho normal funcionou e a média dos pareceres é a nota;
 *   - a marca `sys-*` faz isto rodar UMA vez; apagá-la reimporta.
 * A nota NÃO decide nada: aprovar ou reprovar continua sendo ato da gestão,
 * projeto a projeto, na guia Avaliação.
 */
const AVALIACOES_TRANSCRITAS = ["01-2026"];

async function aplicarAvaliacoesTranscritas() {
  for (const ciclo of AVALIACOES_TRANSCRITAS) {
    const marca = `sys-ic-avaliacoes-${ciclo}`;
    try {
      if (await storage.get(marca)) continue;
      let doc;
      try {
        doc = JSON.parse(await readFile(path.join(__dirname, "dados", `ic-avaliacoes-${ciclo}.json`), "utf8"));
      } catch { continue; }                       // ciclo sem arquivo de pareceres
      const porProtocolo = new Map();
      for (const a of doc.avaliacoes || []) porProtocolo.set(String(a.protocolo || "").trim(), a);

      const r = await comProjetos((projetos) => {
        const usados = new Set();
        let postas = 0, mantidas = 0;
        for (let i = 0; i < projetos.length; i++) {
          const p = projetos[i];
          const reg = porProtocolo.get(String(p.numero || "").trim());
          if (!reg) continue;
          usados.add(p.numero);
          const temParecer = (p.avaliacoes || []).some((a) => a.situacao === "entregue");
          if (p.notaDireta || temParecer) { mantidas++; continue; }
          const nt = notaTranscrita(reg, { por: "avaliação do edital (parecer transcrito)" });
          if (!nt) continue;
          projetos[i] = anotarProjeto({ ...p, notaDireta: nt, atualizadoEm: new Date().toISOString() }, {
            quem: "sistema (pareceres do edital)",
            oQue: `registrou a nota do projeto vinda da avaliação do edital: ${nt.valor}`,
            sigilo: true,          // nota e parecer não aparecem para a orientação
          });
          postas++;
        }
        const semProjeto = [...porProtocolo.keys()].filter((n) => !usados.has(n));
        return { postas, mantidas, semProjeto, gravar: postas > 0 };
      });
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
      console.log(`ARCHÉ IC · pareceres ${ciclo}: ${r.postas} nota(s) registrada(s)` +
        `${r.mantidas ? `, ${r.mantidas} projeto(s) já tinham nota e ficaram como estavam` : ""}` +
        `${r.semProjeto.length ? `, sem projeto correspondente: ${r.semProjeto.join(", ")}` : ""}`);
    } catch (e) {
      console.error(`ARCHÉ IC · falha ao aplicar os pareceres do ciclo ${ciclo}:`, e.message);
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
      const cru = b.notas?.[c.codigo];
      // campo em branco NÃO é zero: Number("") === 0 passaria calado, e na
      // régua da soma cada branco custaria até o teto do critério
      if (cru === undefined || cru === null || String(cru).trim() === "")
        return res.status(400).json({ error: `Falta a nota de "${c.nome}" — todo critério precisa ser pontuado (zero incluído).` });
      const n = Number(cru);
      if (!Number.isFinite(n) || n < 0 || n > c.peso)
        return res.status(400).json({ error: `Dê de 0 a ${c.peso} pontos em "${c.nome}".` });
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
  // tipo vazio DESFAZ a concessão — a distribuição das bolsas é um jogo de
  // remanejamento, e tirar de um para dar a outro precisa ser possível
  if (tipo && !FOMENTOS.some((f) => f.codigo === tipo))
    return res.status(400).json({ error: "Fomento inválido" });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (papelNoProjeto(meu, projetos[i]) !== "gestao")
      return { erro: [403, "A concessão de bolsa é decidida pela coordenação"], gravar: false };
    const p = projetos[i];
    const mod = tipo ? modalidadePor(p.linha, tipo) : null;
    projetos[i] = anotarProjeto({
      ...p,
      fomento: tipo
        ? { tipo, modalidade: mod?.codigo || "", observacao: obs, por: u.email, em: new Date().toISOString() }
        : null,
      // bolsa é do aluno: marca quem recebe (voluntário e "sem decisão" desmarcam)
      alunos: (p.alunos || []).map((a) => ({ ...a, bolsista: !!tipo && tipo !== "voluntario" })),
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: tipo ? `fomento: ${mod?.nome || tipo}` : "concessão de bolsa desfeita" });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/**
 * Nota do projeto atribuída direto pela coordenação, sem formulário — para a
 * seleção que correu fora do sistema (é o caso do edital 01/2026). A nota é
 * do PROJETO, de 0 a 100; o currículo continua saindo da planilha, e a nota
 * final é a soma. Enviar { nota: null } desfaz. Nos próximos editais o
 * caminho é o parecer pelo sistema — esta rota fica para a exceção.
 */
app.post("/api/ic/:id/nota", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const bruto = req.body?.nota;
  const remover = bruto === null || bruto === "";
  const valor = Number(bruto);
  if (!remover && (!Number.isFinite(valor) || valor < 0 || valor > 100))
    return res.status(400).json({ error: "A nota do projeto vai de 0 a 100" });
  const obs = String(req.body?.observacao || "").trim().slice(0, 2000);

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (papelNoProjeto(meu, projetos[i]) !== "gestao")
      return { erro: [403, "Só a coordenação atribui a nota do projeto"], gravar: false };
    if (projetos[i].status === "rascunho")
      return { erro: [400, "Rascunho ainda não está na seleção — não há o que pontuar"], gravar: false };
    const p = projetos[i];
    const { notaDireta, ...semNota } = p;
    projetos[i] = anotarProjeto({
      ...(remover ? semNota : {
        ...p,
        notaDireta: { valor: Math.round(valor * 10) / 10, por: u.email, em: new Date().toISOString(), observacao: obs },
      }),
      atualizadoEm: new Date().toISOString(),
    }, {
      quem: u.email,
      oQue: remover ? "desfez a nota atribuída ao projeto"
        : `atribuiu a nota do projeto: ${Math.round(valor * 10) / 10} (seleção conduzida fora do sistema)`,
      sigilo: true,
    });
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
// Rede de segurança: no Express 4, uma promessa rejeitada dentro de um handler
// async NÃO vira erro de requisição — sobe como unhandledRejection e o Node
// encerra o processo. Num portal institucional, derrubar o serviço é pior do
// que falhar uma requisição: registra e segue de pé. Não substitui tratar o
// erro na origem; é o que evita que um descuido futuro tire o site do ar.
process.on("unhandledRejection", (e) => {
  console.error("ARCHÉ · promessa rejeitada sem tratamento:", e?.stack || e);
});
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
  migrarAcoesExtensao();
  subirLotesIniciais().then(aplicarAnexosIniciais).then(zerarAlunosIniciais).then(enquadrarCronogramasIniciais).then(subirArquivoHistorico).then(subirAlunosHistoricos)
    .then(propagarCpfOrientadores).then(identidadeInstitucionalDoProReitor).then(criarPreCadastros)
    .then(aplicarAvaliacoesTranscritas);
  // Cobrança do relatório final: varre ao acordar e de hora em hora enquanto
  // o processo estiver vivo. O tráfego do portal também dispara (com throttle),
  // o que cobre as hibernações do plano free.
  setTimeout(() => varrerSeVencido(storage, "boot"), 20_000).unref();
  setInterval(() => varrerSeVencido(storage, "intervalo"), 60 * 60 * 1000).unref();
});
