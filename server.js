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
  matrizConformidade, placarPorCurso, ciclosDoSemestre, proximosPrazos, dossieConformidade,
} from "./lib/pautas.js";
import {
  IC_KEY, MODALIDADES as IC_MODALIDADES, STATUS as IC_STATUS, ROTULO_STATUS as IC_ROTULO_STATUS,
  SITUACOES_ETAPA, TIPOS_RELATORIO, CRITERIOS, RECOMENDACOES, normalizarProjeto, validarProjeto,
  numerar as numerarProjeto, anotar as anotarProjeto, resumir as resumirProjeto,
  papelNoProjeto, podeVerProjeto, podeEditarProjeto, podeGerirExecucao, podeAvaliar,
  podeEnviarRelatorio, podeValidarRelatorio, cronogramaDe, relatoriosDe, relatoriosPendentes,
  podeDesignarAvaliador, podeDarParecer, ehAvaliadorDe, parecerDe, visaoDoProjeto, notaFinal,
  participaDeAlgum, vincularPorCpf, modalidadeEfetiva as modalidadeEfetivaIC,
  producaoDoOrientador, prazosRelatorios, fomentoDe, notaTranscrita, decidindoOProprio,
  janelaContestacao, editalDe, podeContestar, atoDeGestao,
  idadeEm, faltaNoCadastroDoBolsista, cadastroDoBolsistaCompleto,
  CAMPOS_RELATORIO_PARCIAL, CAMPOS_PARCIAL_OBRIGATORIOS, FORMATACAO_RELATORIO,
  PERGUNTAS_AVALIACAO_PROJETO, RESPOSTAS_AVALIACAO_PROJETO, ESCALA_0_5,
  CRITERIOS_AVALIACAO_ORIENTADOR, CRITERIOS_AVALIACAO_ALUNO, PARECERES_CONCLUSIVOS,
  janelaRelatorio, regularizacaoDe,
} from "./lib/ic.js";
import { normalizarCpf, soDigitos, formatarCpf } from "./lib/cpf.js";
import {
  slugUnico, SLUG_VALIDO, slugReservado, SLUGS_RESERVADOS, gerarChaveQr, gerarCodigoMonitor, gerarToken, tokenValido,
  codigoDe, inscritoPorToken, normalizarProgramacao, vagasRestantes, prazoInscricao,
  podeInscrever as podeInscreverEvento, jaInscrito,
  TIPOS_ATIVIDADE, gerarIdCurto, vagasAtividade, podeEscolherAtividade,
  normalizarFormulario, validarRespostas, LGPD_TEXTO_PADRAO, textoLgpd, versaoLgpd,
  videoIdDe, numerosDoEvento,
} from "./lib/eventos.js";
import {
  TURMAS_EM, BOLSAS_EM, bolsaEmDe, turmaDe as turmaEmDe, turmaVigente as turmaEmVigente,
  ESCALA_AVALIACAO_EM, CRITERIOS_AVALIACAO_EM, RECOMENDACAO_EM, avaliacaoEMCompleta,
  normalizarBolsistaEM, trocarProjeto, anotarEM, cotasDaTurma, projetoAtual as projetoAtualEM,
  RELATORIOS_EM, CAMPOS_RELATORIO_EM, relatoriosExigidos,
} from "./lib/em.js";
import {
  duplicidadesPorNome, podeFundir, fundirPerfil, fundirProjeto, fundirAcao, fundirAta, fundirPapeis,
} from "./lib/fusao.js";
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
  registrarFalha, bloqueado, limparFalhas, FUNCOES, normalizarFuncao, faltaNoPerfil,
  perfilCompleto, removerSenha, ehGestorFixo,
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
// /eventos/* segue PÚBLICO (hotsite, inscrição, credenciamento, assistir) —
// só a sala de gestão do ARCHÉ EV, em /eventos/gestao, pede sessão.
const AREAS_PROTEGIDAS = /^\/(extensao|pesquisa|inovacao|atas|usuarios)(\/|$)|^\/eventos\/gestao(\/|$)/;
app.use(async (req, res, next) => {
  // HEAD também (achado de ago/2026): o express.static responde HEAD, e a
  // guarda só de GET deixava um HEAD sem sessão confirmar a existência
  if (!["GET", "HEAD"].includes(req.method) || !AREAS_PROTEGIDAS.test(req.caminho)) return next();
  const u = await usuarioDe(req, res);   // renova a sessão de quem está usando
  if (!u) return res.redirect("/entrar?next=" + encodeURIComponent(req.originalUrl));
  if (u.papel === "pendente") {
    // exceção da IC: aluno indicado, avaliador ad hoc designado e bolsista
    // do ICEM entram pelo convite, que já é nominal (ver sessaoIC).
    const convidado = req.caminho.startsWith("/pesquisa")
      && (participaDeAlgum(u.email, await lerProjetos(), (await carregarPerfis())[u.email]?.cpf || "")
        || await souBolsistaEM(u.email));
    if (!convidado) return res.redirect("/entrar?pendente=1");
  }
  if (req.caminho.startsWith("/usuarios") && u.papel !== "gestor") return res.redirect("/");
  // Perfil incompleto: uma etapa antes de entrar no setor (decisão do dono,
  // ago/2026). Cada campo cobrado é usado em algum lugar — sem CPF a pessoa
  // não encontra os próprios projetos, sem titulação a proposta não se
  // enquadra na modalidade. Só barra quem realmente tem algo faltando, e a
  // própria tela de perfil fica de fora (senão o caminho não teria saída).
  const falta = faltaNoPerfil((await carregarPerfis())[u.email], { gestorGeral: u.papel === "gestor" });
  if (falta.length) {
    return res.redirect("/perfil/?completar=1&next=" + encodeURIComponent(req.originalUrl));
  }
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
  res.json({
    ...u, perfil: perfis[u.email] || null, temSenha: await temSenha(storage, u.email),
    // o que falta para o perfil ficar completo — é o que a tela usa para
    // pedir só o que falta, em vez de mandar a pessoa reler o formulário
    perfilFalta: faltaNoPerfil(perfis[u.email], { gestorGeral: u.papel === "gestor" }),
  });
});

// Ficha do usuário vinculada à conta (a chave é o e-mail da sessão).
// Campos livres são limitados no tamanho para não inflar o estado, que é
// regravado por inteiro a cada gravação.
const txt = (v, max = 120) => String(v ?? "").trim().slice(0, max);

app.post("/api/perfil", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const b = req.body || {};
  // A mesma régua que barra a entrada nos setores vale para gravar: se o
  // formulário aceitasse um perfil incompleto, a pessoa salvaria, seria
  // mandada de volta para cá e não sairia mais do lugar.
  const falta = faltaNoPerfil(
    { ...b, funcao: normalizarFuncao(b.funcao), cpf: soDigitos(b.cpf) },
    { gestorGeral: u.papel === "gestor" },
  );
  if (falta.length) {
    return res.status(400).json({
      error: `Falta preencher: ${falta.map((f) => f.rotulo).join(", ")}.`,
      falta: falta.map((f) => f.campo),
    });
  }

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
      // contestação da nota tem prazo curto e precisa de resposta ANTES do
      // resultado final: uma que ninguém veja é pior do que nenhuma
      const contest = projetos.reduce((s, p) =>
        s + (p.contestacoes || []).filter((c) => !c.resposta).length, 0);
      if (contest) alertas.push({ setor: "Pesquisa · IC", n: contest, link: "/pesquisa/ic/",
        texto: `${contest} contestação(ões) de nota aguardando resposta` });
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
    const publicados = await resultadosPublicados();
    // o EMBARGO da publicação vale também na lista (achado da revisão
    // adversarial de ago/2026): a coluna de modalidade contava o desfecho
    // projeto a projeto — "Não aprovado" no instante da reprovação, bolsa no
    // instante da concessão — enquanto o PDF dizia "em breve". Resultado se
    // divulga uma vez, para todos: antes do PRELIMINAR nada de desfecho;
    // entre o preliminar e o FINAL, a aprovação é pública mas a bolsa não.
    const faseDe = (numero) => RESULTADOS_EDITAIS[numero]
      ? "final" : (publicados[numero]?.fase || null);
    res.json({
      instituicao: "Centro Universitário Evangélico de Goianésia — UNIEGO",
      editais: editaisConhecidos(projetos, publicados, await termosPublicados()),
      editaisEM: editaisEMParaLista(await resultadosPublicadosEM()),
      projetos: projetos
        .filter((p) => p.status !== "rascunho")
        .map((p) => {
          const fase = faseDe(String(p.edital || EDITAL.numero));
          return {
            edital: String(p.edital || EDITAL.numero),
            titulo: p.titulo || "",
            curso: (CURSOS.find((c) => c.slug === p.curso) || {}).nome || p.curso || "",
            orientador: p.orientador?.nome || "",
            // os nomes dos bolsistas saem com o resultado FINAL — antes
            // disso a própria concessão da bolsa ainda é interna
            bolsistas: fase === "final"
              ? (p.alunos || []).filter((a) => a.bolsista).map((a) => a.nome).filter(Boolean) : [],
            modalidade: p.modalidadeHistorica
              || (!fase ? ""                                    // sem publicação: "em seleção"
                : fase === "preliminar"
                  ? (["aprovado", "concluido"].includes(p.status) ? "Aprovado"
                    : p.status === "reprovado" ? "Não aprovado" : "")
                  : (p.fomento
                    ? (modalidadeEfetivaIC(p)?.nome || (p.fomento.tipo === "voluntario" ? "Voluntário" : ""))
                    : (p.status === "reprovado" ? "Não aprovado" : ""))),
          };
        })
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

// O resultado do ICEM também: público quando (e só quando) a gestão publica.
app.get("/api/publico/ic/em/resultado.pdf", async (req, res) => {
  try {
    const numeroPedido = String(req.query.edital || "").trim();
    const turma = numeroPedido ? TURMAS_EM.find((t) => t.edital === numeroPedido) : turmaEmVigente();
    if (!turma) return res.status(404).send(`Edital ${numeroPedido} não encontrado no ICEM.`);
    if (turma.resultado) return res.redirect(turma.resultado);
    const pub = (await resultadosPublicadosEM())[turma.edital];
    if (!pub)
      return res.status(404).send("O resultado deste edital ainda não foi publicado.");
    const bolsistas = (await lerBolsistasEM()).filter((b) => b.turma === turma.ciclo);
    const { gerarResultadoEMPdf } = await import("./lib/pdf.js");
    const buffer = await gerarResultadoEMPdf({ turma, bolsistas, emitidoPor: "", fase: pub.fase || "final" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resultado-edital-${slug(turma.edital)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF público do resultado do ICEM:", e);
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
  if (fase) {
    const agora = new Date().toISOString();
    const antes = pub[numero] || {};
    // a data de CADA fase se guarda: o prazo de contestação conta da
    // publicação do preliminar, e republicar não pode reiniciar o relógio
    pub[numero] = {
      fase, em: agora, por: u.email,
      desde: { ...(antes.desde || {}), [fase]: antes.desde?.[fase] || agora },
    };
  } else delete pub[numero];
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
  const mensagem = String(req.body?.mensagem || "").trim().slice(0, 2000);
  const { enviarEmail, RE_EMAIL, blocoMensagem, escapeHtml } = await import("./lib/mailer.js");

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

  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  // depois de entrar, a pessoa cai direto no perfil — onde o CPF se informa
  const link = `${base}/entrar?next=${encodeURIComponent("/perfil/")}`;
  const corpoConvite = (d) => `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px">
          <p>Olá, <b>${escapeHtml(d.nome || "professor(a)")}</b>!</p>
          ${blocoMensagem(mensagem)}
          <p>Sua(s) proposta(s) submetida(s) ao <b>Edital 01/2026</b> de Iniciação Científica,
            Inovação Tecnológica e Iniciação à Extensão já está(ão) registrada(s) no <b>ARCHÉ</b>,
            o portal de gestão da PROPPEX — UNIEGO:</p>
          <p style="background:#eef3f5;border-radius:10px;padding:12px 16px">
            ${d.titulos.map((t) => `• ${escapeHtml(t)}`).join("<br>")}</p>
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
            PROPPEX — Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária · UNIEGO</p></div>`;

  if (simular) {
    const amostra = novos[0] || jaConvidados[0];
    return res.json({
      simulado: true,
      novos: novos.map(resumo), jaConvidados: jaConvidados.map(resumo),
      semEmail: semEmail.map((x) => ({ nome: x.nome, projetos: x.titulos.length })),
      previewHtml: amostra ? corpoConvite(amostra) : "",
    });
  }

  const alvo = reenviar ? [...novos, ...jaConvidados] : novos;
  const enviados = [], falhas = [];
  for (const d of alvo) {
    try {
      await enviarEmail({
        para: d.email,
        assunto: "[ARCHÉ] Edital 01/2026 — crie o seu acesso para acompanhar seus projetos",
        corpoHtml: corpoConvite(d),
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
/**
 * A união de tudo o que identifica alguém no portal: perfil preenchido,
 * lista de papéis, cadastro novo e presença nos registros dos setores (o
 * convidado que ainda não entrou também é gente). É a MESMA conta usada
 * pelo painel de usuários e pelo quadro do dashboard — duas contagens
 * diferentes de "quantos usuários temos" seria pior que nenhuma.
 */
async function contasDoPortal() {
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

  return { conta, usuarios, perfis, novos };
}

/**
 * Só as CONTAGENS de usuários — nenhum nome, nenhum e-mail. É o que o
 * dashboard mostra: quantas contas o portal conhece, quantas já podem
 * entrar e quantas completaram o próprio cadastro. Fica separada do painel
 * porque a lista nominal é outro assunto (e outro tamanho de resposta).
 */
app.get("/api/usuarios/resumo", async (req, res) => {
  try {
    const g = await exigirGestor(req, res); if (!g) return;
    const { conta, usuarios, perfis } = await contasDoPortal();
    const emails = [...conta.keys()];
    const completo = (e) => perfilCompleto(perfis[e], { gestorGeral: ehGestorFixo(e) });
    const iniciado = (e) => !!String(perfis[e]?.nome || "").trim();
    const comAcesso = emails.filter((e) => papelDe(e, usuarios) !== "pendente");
    res.json({
      total: emails.length,
      comAcesso: comAcesso.length,
      pendentes: emails.length - comAcesso.length,
      perfilCompleto: emails.filter(completo).length,
      perfilIniciado: emails.filter(iniciado).length,
      // quem pode entrar E tem o cadastro completo: é o número que diz
      // quantas pessoas o portal atende de fato, sem etapa pendente
      prontos: comAcesso.filter(completo).length,
    });
  } catch (e) {
    console.error("Erro no resumo de usuários:", e);
    res.status(500).json({ error: "Falha ao contar os usuários" });
  }
});

app.get("/api/usuarios/painel", async (req, res) => {
  try {
    const g = await exigirGestor(req, res); if (!g) return;
    const { conta, usuarios, perfis, novos } = await contasDoPortal();

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

    res.json({
      usuarios: lista, funcoes: FUNCOES, cursos: CURSOS, modulos: MODULOS,
      // Cadastros repetidos: o sistema APONTA pelo nome; quem funde é a gestão.
      // As duas contas da pró-reitoria ficam de fora: elas são duas DE
      // PROPÓSITO (a pessoal é só de gestão, a institucional carrega a
      // identidade acadêmica), e sugerir fundi-las seria sugerir desfazer
      // uma decisão registrada do dono.
      duplicidades: duplicidadesPorNome(lista)
        .filter((d) => !d.contas.every((c) => ehGestorFixo(c.email))),
    });
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
/**
 * FUSÃO DE CADASTROS — duas contas, a mesma pessoa.
 *
 * Acontece o tempo todo: a pessoa cria a conta com o e-mail pessoal e depois
 * ganha o institucional; ou o pré-cadastro nasceu do formulário do edital
 * (com CPF) num endereço que ela não usa mais. O caminho natural está fechado
 * de propósito — a segunda conta com o mesmo CPF é recusada —, e o resultado
 * é o professor aparecendo duas vezes, com projetos, ações e atas repartidos.
 *
 * O sistema aponta a duplicidade pelo NOME; quem funde é a gestão, dizendo
 * qual conta fica. Fusão por nome sem confirmação seria perigosa: dois
 * professores podem se chamar igual. `simular: true` mostra ANTES o que sai
 * de um lado para o outro, e a fusão guarda o registro do que moveu — com o
 * perfil removido inteiro — em `sys-fusoes-v1`, para nada se perder.
 */
const FUSOES_KEY = "sys-fusoes-v1";
app.post("/api/usuarios/fundir", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const manter = String(req.body?.manter || "").trim().toLowerCase();
  const remover = String(req.body?.remover || "").trim().toLowerCase();
  const simular = req.body?.simular === true;

  const [perfis, usuarios] = await Promise.all([carregarPerfis(), carregarUsuarios(storage)]);
  const impedimento = podeFundir(
    { email: manter, nome: perfis[manter]?.nome, cpf: perfis[manter]?.cpf },
    { email: remover, nome: perfis[remover]?.nome, cpf: perfis[remover]?.cpf },
  );
  if (impedimento) return res.status(400).json({ error: impedimento });
  if (ehGestorFixo(remover))
    return res.status(400).json({ error: "Conta de gestor geral fixo não se funde — ela é a identidade da pró-reitoria." });

  // a PRÉVIA lê fora da fila (é só contagem); a fusão de verdade transforma
  // dentro dela, para não gravar em cima de escrita simultânea
  const [projetos, atas, acoes] = await Promise.all([lerProjetos(), lerAtas(), lerAcoes()]);
  const avisos = [];
  let nProjetos = 0, nAtas = 0, nAcoes = 0;
  for (const p of projetos) {
    const r = fundirProjeto(p, remover, manter);
    if (r.mudou) nProjetos += 1;
    avisos.push(...r.avisos);
  }
  for (const a of atas) if (fundirAta(a, remover, manter).mudou) nAtas += 1;
  for (const a of acoes) if (fundirAcao(a, remover, manter).mudou) nAcoes += 1;
  const perfilFinal = fundirPerfil(perfis[manter] || {}, perfis[remover] || {});
  const resumo = {
    manter, remover,
    projetos: nProjetos, atas: nAtas, acoes: nAcoes,
    // o que o perfil que fica GANHA da conta removida
    campos: Object.keys(perfilFinal).filter((k) =>
      String(perfilFinal[k] ?? "") !== String((perfis[manter] || {})[k] ?? "")
      && !["atualizadoEm", "criadoEm", "preCadastro"].includes(k)),
    papel: papelDe(remover, usuarios), modulos: modulosDe(remover, usuarios),
    avisos: [...new Set(avisos)],
  };
  if (simular) return res.json({ simulado: true, ...resumo });

  // grava: projetos, atas e ações primeiro; o cadastro por último, para que
  // uma falha no meio não deixe a pessoa sem conta E sem os registros
  await comProjetos((lista) => {
    let n = 0;
    for (let i = 0; i < lista.length; i++) {
      const r = fundirProjeto(lista[i], remover, manter);
      if (r.mudou) { lista[i] = r.projeto; n += 1; }
    }
    return { gravar: n > 0 };
  });
  await comAtas((lista) => {
    let n = 0;
    for (let i = 0; i < lista.length; i++) {
      const r = fundirAta(lista[i], remover, manter);
      if (r.mudou) { lista[i] = r.ata; n += 1; }
    }
    return { gravar: n > 0 };
  });
  await comAcoes((lista) => {
    let n = 0;
    for (let i = 0; i < lista.length; i++) {
      const r = fundirAcao(lista[i], remover, manter);
      if (r.mudou) { lista[i] = r.acao; n += 1; }
    }
    return { gravar: n > 0 };
  });

  perfis[manter] = { ...perfilFinal, email: manter, atualizadoEm: new Date().toISOString() };
  const removido = perfis[remover] || null;
  delete perfis[remover];
  await storage.set(PERFIS_KEY, JSON.stringify(perfis));
  await salvarUsuarios(storage, fundirPapeis(usuarios, remover, manter));
  // a senha da conta removida não viaja: senha é da conta, não da pessoa
  await removerSenha(storage, remover);
  // o registro do que foi feito, com o perfil removido inteiro: fusão não se
  // desfaz sozinha, e sem isto não haveria como reconstruir à mão
  const log = JSON.parse((await storage.get(FUSOES_KEY)) || "[]");
  log.push({ em: new Date().toISOString(), por: g.email, ...resumo, perfilRemovido: removido });
  await storage.set(FUSOES_KEY, JSON.stringify(log.slice(-200)));
  await storage.flush?.();
  console.log(`[usuarios] ${remover} fundido em ${manter} por ${g.email}: `
    + `${nProjetos} projeto(s), ${nAcoes} ação(ões), ${nAtas} ata(s)`);
  res.json({ ok: true, ...resumo });
});

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
// a coordenação do ARCHÉ EV: opera todos os EVENTOS (página, inscrições,
// credenciamento, transmissão), sem alcançar a gestão da Extensão em si
const gereEv = (u) => !!u?.modulos?.includes("eventos");

/**
 * Ao salvar a ação pelo formulário, o EVENTO e as INSCRIÇÕES ONLINE/PRESENÇAS
 * têm escrita própria e escritores concorrentes (rota /:id/evento e o
 * credenciamento público) — o snapshot do formulário não pode sobrescrevê-los
 * (achado de ago/2026). Devolve o recorte a preservar por cima de `nova`:
 *  - `evento` sempre da base (a config só se muda pela rota dedicada);
 *  - as inscrições ONLINE e as com presença marcada vêm da base; do que o
 *    formulário mandou, só entram as manuais que não colidem com elas.
 */
function mesclarEventoEInscritos(base, nova) {
  const out = { evento: base.evento };
  const baseIns = base.participantes?.inscritos || [];
  const doServidor = baseIns.filter((x) => x?.origem === "online" || x?.presente || x?.token);
  if (!doServidor.length) return out;   // ação sem inscrição online: nada a mesclar
  const chave = (x) => soDigitos(x?.cpf) || String(x?.email || "").trim().toLowerCase()
    || String(x?.nome || "").trim().toLowerCase();
  const donas = new Set(doServidor.map(chave));
  const manuais = (nova.participantes?.inscritos || []).filter((x) => !donas.has(chave(x)));
  out.participantes = { ...(nova.participantes || {}), inscritos: [...manuais, ...doServidor] };
  return out;
}

// a ação é de quem a submeteu — pelo e-mail do responsável ou de quem criou
const minhaAcao = (u, a) => {
  const e = String(u?.email || "").toLowerCase();
  return !!e && (String(a?.criadoPor || "").toLowerCase() === e
    || String(a?.proposta?.respEmail || "").toLowerCase() === e);
};
const podeVerAcao = (u, a) => gereEx(u) || minhaAcao(u, a);
// operação do EVENTO de uma ação: o dono da ação (quem registrou organiza o
// próprio evento), a gestão da Extensão e a coordenação do módulo eventos.
// Vale só para as rotas do evento — proposta, aprovação e relatório seguem
// sendo da Extensão.
const podeOperarEvento = (u, a) => podeVerAcao(u, a) || gereEv(u);

async function sessaoEx(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(403).json({ error: "Faça login para acessar a Extensão" }); return null; }
  if (u.papel === "pendente") {
    res.status(403).json({ error: "Seu acesso ainda está pendente de aprovação da PROPPEX" });
    return null;
  }
  return u;
}

// A CHAVE do QR assina todos os tokens do evento e a CAPA pesa centenas de
// KB: nenhuma das duas viaja em payload — a chave por segurança (fica só no
// servidor; achado de ago/2026) e a capa por peso (a tela busca a imagem
// pela rota pública e aqui só sabe que existe, via `temCapa`).
function eventoSemSegredos(ev) {
  if (!ev) return ev;
  const { chaveQr, capa, ...resto } = ev;
  return { ...resto, temCapa: !!capa };
}

/** A lista que a pessoa pode ver — nunca a base inteira. */
app.get("/api/extensao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    // recorte: as próprias ações e, para a gestão da Extensão, todas; a
    // coordenação do ARCHÉ EV vê também toda ação COM evento (é o setor
    // dela), sem enxergar o restante da Extensão alheia
    const acoes = (await lerAcoes())
      .filter((a) => podeVerAcao(u, a) || (gereEv(u) && a.evento))
      .map((a) => a.evento ? { ...a, evento: eventoSemSegredos(a.evento) } : a);
    // os catálogos que o editor do evento usa (tipos de atividade e o texto
    // padrão da LGPD) seguem junto: a SPA não os duplica
    res.json({
      acoes, gestao: gereEx(u), gestaoEventos: gereEv(u), eu: u.email,
      tiposAtividade: TIPOS_ATIVIDADE, lgpdPadrao: LGPD_TEXTO_PADRAO,
    });
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
        // A CONFIG do evento e as INSCRIÇÕES ONLINE/PRESENÇAS têm escrita
        // própria (rota /:id/evento e o credenciamento público) e escritores
        // CONCORRENTES: o salvar comum do formulário carrega um snapshot que
        // pode estar velho, e substituir a ação inteira apagaria em silêncio
        // inscrição e presença já gravadas (achado da revisão de ago/2026).
        // Por isso o evento vem sempre da base, e as inscrições online + as
        // presenças são MESCLADAS por cima do que o formulário mandou.
        const preservado = base ? mesclarEventoEInscritos(base, nova) : {};
        const final = { ...nova, ...controlado, ...preservado, atualizadoEm: new Date().toISOString() };
        // Números do evento no relatório: na ENTREGA (entregueEm aparecendo
        // agora) de uma ação com evento, o SERVIDOR fotografa os números do
        // sistema de inscrições — snapshot datado, calculado da ação já
        // mesclada (a verdade da base), nunca do que a tela digitou. Fora da
        // entrega, o snapshot é o que já estava gravado: o cliente não o
        // fabrica nem o reescreve.
        if (final.relatorio) {
          const entregouAgora = final.relatorio.entregueEm && !base?.relatorio?.entregueEm;
          const snapshot = entregouAgora && final.evento?.chaveQr
            ? numerosDoEvento(final)
            : base?.relatorio?.numerosEvento;
          if (snapshot) final.relatorio = { ...final.relatorio, numerosEvento: snapshot };
          else if (final.relatorio.numerosEvento) delete final.relatorio.numerosEvento;
        }
        if (i >= 0) acoes[i] = final; else acoes.push(final);
        gravadas++;
      }
      return { gravadas, recusadas, gravar: gravadas > 0 };
    });
    if (r.recusadas) console.warn(`[extensao] ${r.recusadas} ação(ões) recusada(s) de ${u.email}`);
    const acoes = (await lerAcoes()).filter((a) => podeVerAcao(u, a)).map((a) =>
      a.evento ? { ...a, evento: eventoSemSegredos(a.evento) } : a);
    res.json({ ok: true, ...r, acoes });
  } catch (e) {
    console.error("Erro ao gravar ação de extensão:", e);
    res.status(500).json({ error: "Falha ao gravar" });
  }
});

/* ---------------------- devolução para ajustes ---------------------------
   A devolução era meio caminho: a PROPPEX escrevia o motivo, e ele ficava
   esperando o professor entrar no portal por acaso — e, quando entrava, não
   tinha como corrigir a proposta, só submeter outra do zero (o que quebrava
   o histórico e duplicava a ação). Agora a devolução é um CICLO fechado:
   devolver avisa por e-mail com o motivo, a proposta volta a ser editável
   pelo dono, e o reenvio devolve a ação à fila da PROPPEX.

   As duas pontas são rotas do SERVIDOR, e não do formulário, porque quem
   muda situação é a gestão (devolver) e o dono (reenviar) — cada um só na
   sua ponta. */
app.post("/api/extensao/devolver", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (!gereEx(u)) return res.status(403).json({ error: "Somente a gestão da Extensão devolve propostas." });
    const motivo = String(req.body?.motivo || "").trim();
    if (motivo.length < 5) return res.status(400).json({ error: "Escreva o motivo da devolução — é ele que o professor recebe." });

    const r = await comAcoes((acoes) => {
      const i = acoes.findIndex((a) => a.id === req.body?.id);
      if (i < 0) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!["submetida", "devolvida"].includes(acoes[i].status))
        return { erro: [400, "Só se devolve proposta que está em análise."], gravar: false };
      acoes[i] = {
        ...acoes[i], status: "devolvida", motivoDevolucao: motivo.slice(0, 2000),
        devolvidaEm: new Date().toISOString(), devolvidaPor: u.email,
        atualizadoEm: new Date().toISOString(),
      };
      return { acao: acoes[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });

    // o e-mail não trava a devolução: se falhar, o motivo já está gravado
    let avisado = null;
    try {
      const { enviarEmail, emailPropostaDevolvida } = await import("./lib/mailer.js");
      const msg = emailPropostaDevolvida(r.acao, { baseUrl: `${req.protocol}://${req.get("host")}` });
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.para)) avisado = await enviarEmail(msg);
    } catch (e) {
      console.error("[extensao] aviso de devolução falhou:", e.message);
    }
    res.json({ ok: true, avisado, acao: r.acao });
  } catch (e) {
    console.error("Erro ao devolver proposta:", e);
    res.status(500).json({ error: "Falha ao devolver" });
  }
});

/* O reenvio da proposta corrigida: é a MESMA ação, com o histórico inteiro —
   nada de abrir uma nova e deixar duas na base. */
app.post("/api/extensao/reenviar", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const r = await comAcoes((acoes) => {
      const i = acoes.findIndex((a) => a.id === req.body?.id);
      if (i < 0 || !podeVerAcao(u, acoes[i])) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!minhaAcao(u, acoes[i]))
        return { erro: [403, "Quem reenvia a proposta é quem a submeteu."], gravar: false };
      if (acoes[i].status !== "devolvida")
        return { erro: [400, "Esta proposta não está devolvida."], gravar: false };
      const historico = [...(acoes[i].devolucoes || []), {
        motivo: acoes[i].motivoDevolucao || "", em: acoes[i].devolvidaEm || "",
        por: acoes[i].devolvidaPor || "", reenviadaEm: new Date().toISOString(),
      }].slice(-20);
      acoes[i] = {
        ...acoes[i], status: "submetida", motivoDevolucao: "", devolucoes: historico,
        reenviadaEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
      };
      return { acao: acoes[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, acao: r.acao });
  } catch (e) {
    console.error("Erro ao reenviar proposta:", e);
    res.status(500).json({ error: "Falha ao reenviar" });
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
    // o upload sobe ao Drive ANTES da fila (é lento e não altera o estado);
    // a gravação da ação, essa sim, entra na fila comAcoes — senão um upload
    // concorrente com uma inscrição/check-in do evento reescreveria a chave
    // inteira e engoliria o que o outro acabou de gravar (achado de ago/2026)
    const pre = (await lerAcoes()).find((a) => a.id === id);
    if (!pre) return res.status(404).json({ error: "Ação não encontrada" });
    if (pre.status === "registrada")
      return res.status(400).json({ error: "Ação registrada — anexos travados" });
    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `extensao/${slug(pre.curso || "geral")}/${slug(pre.numeroAcao || pre.id)}/portfolio`,
    });
    const anexo = { ...data, enviadoEm: new Date().toISOString(), enviadoPor: u.email };
    const r = await comAcoes((acoes) => {
      const acao = acoes.find((a) => a.id === id);
      if (!acao) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (acao.status === "registrada") return { erro: [400, "Ação registrada — anexos travados"], gravar: false };
      acao.portfolio = acao.portfolio || {};
      acao.portfolio.anexos = [...(acao.portfolio.anexos || []), anexo];
      acao.atualizadoEm = new Date().toISOString();
      return { anexos: acao.portfolio.anexos };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, anexo, anexos: r.anexos });
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

/* ========================= ARCHÉ EVENTOS ================================
   Evento GRATUITO = ação de extensão que ganhou a configuração `evento`
   (lib/eventos.js) — página pública, inscrição online e credenciamento por
   QR na entrada. A certificação continua no sistema da AEE: daqui sai a
   planilha no template de lá.

   As rotas públicas ficam SEM login de propósito (quem se inscreve vem de
   fora) e NUNCA devolvem a lista de inscritos nem CPF/e-mail de ninguém —
   cada um só enxerga a própria inscrição, e a credencial é o token
   assinado. Toda escrita passa pela fila comAcoes: duas inscrições no
   mesmo instante não podem se perder uma à outra.
   ======================================================================== */

// A ação que tem evento configurado, pelo endereço público.
const eventoPorSlug = (acoes, slugEv) =>
  acoes.find((a) => a?.evento?.chaveQr && a.evento.slug === String(slugEv || "").trim().toLowerCase());

// O retrato PÚBLICO do evento — números e textos institucionais, nunca
// pessoas: as vagas restantes saem como contagem, não como lista. A capa
// sai como `temCapa` (a imagem tem rota própria) e a transmissão como
// `transmissaoPublicada` — o link/id do vídeo só aparece contra o token.
function eventoPublico(a, { detalhe = false } = {}) {
  const p = a.proposta || {}, ev = a.evento || {};
  const inscritos = a.participantes?.inscritos;
  const base = {
    slug: ev.slug, nome: p.nomeAtividade || "", curso: a.curso || "",
    periodoInicio: p.periodoInicio || "", periodoFim: p.periodoFim || "",
    local: p.local || "", municipio: p.municipio || "", cargaHoraria: p.cargaHoraria || "",
    resumo: String(ev.descricao || p.temaCentral || "").slice(0, 240),
    vagasRestantes: vagasRestantes(ev, inscritos),
    inscricoesAte: prazoInscricao(ev, a),
    inscricoesAbertas: podeInscreverEvento(a, hojeLocalISO()).ok,
    temCapa: !!ev.capa,
  };
  if (!detalhe) return base;
  // as atividades passam pela normalização na saída: o dado antigo (sem id,
  // com `hora`) ganha o shape novo sem migração — e como o item antigo é
  // sempre "geral", o id efêmero que ele ganha aqui não vincula nada
  const programacao = normalizarProgramacao(ev.programacao).map((atv) => ({
    ...atv,
    vagasRestantes: atv.inscricao === "propria" ? vagasAtividade(atv, inscritos) : null,
  }));
  // modalidade derivada, para o selo do topo: das atividades e da transmissão
  const temOnline = programacao.some((x) => x.modalidade === "online") || !!ev.transmissao?.tipo;
  const temPresencial = !programacao.length || programacao.some((x) => x.modalidade !== "online");
  return {
    ...base, descricao: String(ev.descricao || ""), temaCentral: p.temaCentral || "",
    publicoAlvo: p.publicoAlvo || "", programacao,
    formulario: ev.formulario || [],
    lgpdTexto: textoLgpd(ev),
    endereco: String(ev.local || ""),
    transmissaoPublicada: ev.transmissao?.publicada === true,
    modalidade: temOnline && temPresencial ? "hibrido" : temOnline ? "online" : "presencial",
  };
}

// Rate limit em memória, por IP, nas rotas públicas que gravam ou procuram
// inscrição. O teto é ALTO de propósito (achado de ago/2026): atrás do NAT
// do campus a turma inteira sai pelo MESMO IP público, e um limite baixo
// barraria o 11º aluno a se inscrever na aula — o cenário que o freio
// deveria proteger, não impedir. Quem garante que a vaga não estoura é a
// checagem dentro da fila, não isto; aqui é só um freio contra flood de
// script. Reinicia com o processo — é freio, não fortaleza.
const inscUso = new Map();
function inscricaoExcedeu(ip) {
  const agora = Date.now();
  const recentes = (inscUso.get(ip) || []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 60) { inscUso.set(ip, recentes); return true; }
  recentes.push(agora);
  inscUso.set(ip, recentes);
  if (inscUso.size > 2000) for (const [k, v] of inscUso) if (!v.some((t) => agora - t < 60_000)) inscUso.delete(k);
  return false;
}

// Freio das tentativas FALHAS do check-in (achado de ago/2026): o credencia-
// mento legítimo dos monitores SUCEDE em massa (fila do evento, todos na
// mesma rede/IP) — limitar sucesso quebraria o dia. Então contamos só as
// FALHAS por IP (código do monitor errado ou inscrição não achada): assim
// o brute-force do código e a varredura de nomes pelo código de 6 travam,
// e o monitor de verdade, que acerta, nunca esbarra no limite.
// A revisão da 2ª geração (ago/2026) separou os CONTADORES: as rotas da
// transmissão (assistir, heartbeat, mural, troca de atividades) têm o seu,
// senão 20 links vencidos abertos no Wi-Fi do campus travavam o
// credenciamento físico da porta — e vice-versa. E nessas rotas o freio só
// alcança quem FALHOU: valida-se o token primeiro, e o válido passa SEMPRE
// (atrás do NAT o campus inteiro é um IP; um portão por IP antes da
// validação suprimia a presença de todos por causa de meia dúzia de links
// velhos batendo em vazio).
function criarFreioDeFalhas() {
  const falhas = new Map();
  return {
    excedeu(ip) {
      const agora = Date.now();
      const recentes = (falhas.get(ip) || []).filter((t) => agora - t < 300_000);
      falhas.set(ip, recentes);
      if (falhas.size > 2000) for (const [k, v] of falhas) if (!v.length) falhas.delete(k);
      return recentes.length >= 20;   // 20 falhas em 5 min — inalcançável usando de verdade
    },
    falhou(ip) {
      const arr = falhas.get(ip) || [];
      arr.push(Date.now());
      falhas.set(ip, arr);
    },
  };
}
const freioCheckin = criarFreioDeFalhas();   // a porta física (código do monitor)
const freioOnline = criarFreioDeFalhas();    // transmissão, heartbeat, mural e atividades
// falha nas rotas online: conta e, estourado o freio, o ruído vira 429 —
// só para quem segue errando; token válido nunca passa por aqui
function falhaOnline(req, res, status, msg) {
  freioOnline.falhou(req.ip);
  if (freioOnline.excedeu(req.ip))
    return res.status(429).json({ error: "Muitas tentativas sem sucesso. Aguarde alguns minutos." });
  return res.status(status).json({ error: msg });
}

// O código do monitor confere? Em tempo constante, como toda credencial.
function codigoMonitorConfere(ev, dado) {
  try {
    const a = Buffer.from(String(ev?.codigoMonitor || "").toUpperCase());
    const b = Buffer.from(String(dado || "").trim().toUpperCase());
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/** Vitrine: os eventos com página ativa. */
app.get("/api/publico/eventos", async (_req, res) => {
  try {
    const acoes = await lerAcoes();
    res.json({ eventos: acoes.filter((a) => a?.evento?.ativo).map((a) => eventoPublico(a)) });
  } catch (e) {
    console.error("Erro na lista pública de eventos:", e);
    res.status(500).json({ error: "Não foi possível carregar os eventos agora." });
  }
});

/** A página de um evento: descrição, programação e a situação das vagas. */
app.get("/api/publico/eventos/:slug", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    if (!a || !a.evento.ativo)
      return res.status(404).json({ error: "Evento não encontrado — a página pode ter sido encerrada." });
    res.json({ evento: eventoPublico(a, { detalhe: true }) });
  } catch (e) {
    console.error("Erro na página pública do evento:", e);
    res.status(500).json({ error: "Não foi possível carregar o evento agora." });
  }
});

const RE_EMAIL_INSCRICAO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Inscrição online — grava na MESMA lista de participantes da ação. */
app.post("/api/publico/eventos/:slug/inscrever", async (req, res) => {
  try {
    if (inscricaoExcedeu(req.ip))
      return res.status(429).json({ error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo." });
    const b = req.body || {};
    const nome = String(b.nome || "").trim().slice(0, 120);
    const cpf = normalizarCpf(b.cpf);
    const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
    const telefone = String(b.telefone || "").trim().slice(0, 40);
    const curso = String(b.curso || "").trim().slice(0, 120);
    if (nome.length < 3) return res.status(400).json({ error: "Escreva o seu nome completo." });
    if (!cpf) return res.status(400).json({ error: "O CPF informado não é válido — confira os números digitados." });
    if (!RE_EMAIL_INSCRICAO.test(email))
      return res.status(400).json({ error: "Informe um e-mail válido — é nele que chega a confirmação da inscrição." });
    // LGPD: sem a ciência e a concordância EXPRESSAS não há inscrição — o
    // registro do aceite (data + versão do texto) é a prova, e ela é do
    // servidor, não da tela. A caixa de comunicações futuras é opcional.
    if (b.consentimento !== true)
      return res.status(400).json({ error: "Para se inscrever é preciso ler e concordar com o tratamento dos dados pessoais descrito na página." });
    const atividadesPedidas = [...new Set((Array.isArray(b.atividades) ? b.atividades : [])
      .map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 100);

    // dedupe, vagas e prazo se conferem DENTRO da fila: entre a leitura e a
    // gravação não pode entrar outra inscrição que fure a checagem
    const r = await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, req.params.slug);
      if (!a) return { erro: [404, "Evento não encontrado — a página pode ter sido encerrada."], gravar: false };
      const aberta = podeInscreverEvento(a, hojeLocalISO());
      if (!aberta.ok) return { erro: [409, aberta.motivo], gravar: false };
      const parts = a.participantes || (a.participantes = { inscritos: [], palestrantes: [], comissao: [] });
      parts.inscritos = parts.inscritos || [];
      if (jaInscrito(parts.inscritos, { cpf, email }))
        return { erro: [409, "Este CPF ou e-mail já está inscrito neste evento. Use a opção “já me inscrevi” para reaver o seu link."], gravar: false };
      // campos extras validados contra o catálogo DA BASE (o cliente pode
      // estar com um formulário desatualizado — o catálogo gravado decide)
      const respostas = validarRespostas(a.evento.formulario || [], b.respostas);
      if (!respostas.ok) return { erro: [400, respostas.erros.join(" ")], gravar: false };
      // as atividades marcadas, uma a uma — a vaga por atividade também só
      // vale conferida aqui dentro
      for (const idAtv of atividadesPedidas) {
        const pode = podeEscolherAtividade(a.evento, idAtv, parts.inscritos, []);
        if (!pode.ok) return { erro: [pode.semVaga ? 409 : 400, pode.motivo], gravar: false };
      }
      const inscrito = {
        nome, cpf, email, telefone, curso,
        ch: a.proposta?.cargaHoraria || "",
        origem: "online", inscritoEm: new Date().toISOString(),
        token: gerarToken(a.evento.chaveQr), presente: false,
        atividades: atividadesPedidas,
        respostas: respostas.respostas,
        consentimento: { em: new Date().toISOString(), versao: versaoLgpd(textoLgpd(a.evento)) },
        comunicacoes: b.comunicacoes === true,
      };
      parts.inscritos.push(inscrito);
      a.atualizadoEm = new Date().toISOString();
      return { acao: a, inscrito };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });

    // o e-mail é cortesia: a inscrição já está gravada, e falha de envio
    // (ou endereço que o Gmail recuse) não pode desfazê-la
    try {
      const { enviarEmail, emailInscricaoEvento } = await import("./lib/mailer.js");
      await enviarEmail(emailInscricaoEvento(r.acao, r.inscrito,
        { baseUrl: `${req.protocol}://${req.get("host")}` }));
    } catch (e) {
      console.error("[eventos] confirmação de inscrição não enviada:", e.message);
    }
    res.json({ ok: true, token: r.inscrito.token, codigo: codigoDe(r.inscrito.token) });
  } catch (e) {
    console.error("Erro na inscrição do evento:", e);
    res.status(500).json({ error: "Não foi possível concluir a inscrição agora. Tente de novo em instantes." });
  }
});

/**
 * "Já me inscrevi": reapresenta o link de quem perdeu o e-mail. Só devolve
 * o token se CPF E e-mail baterem NA MESMA inscrição — um dado sozinho não
 * abre a credencial de ninguém. Mesmo freio de tentativas da inscrição.
 */
app.post("/api/publico/eventos/:slug/recuperar", async (req, res) => {
  try {
    if (inscricaoExcedeu(req.ip))
      return res.status(429).json({ error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo." });
    const cpf = normalizarCpf(req.body?.cpf);
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!cpf || !RE_EMAIL_INSCRICAO.test(email))
      return res.status(400).json({ error: "Informe o CPF e o e-mail usados na inscrição." });
    // passa pela fila porque pode precisar GRAVAR: inscrição lançada à mão
    // pela gestão (planilha) ainda não tem token, e ele nasce aqui
    const r = await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, req.params.slug);
      if (!a) return { erro: [404, "Evento não encontrado."], gravar: false };
      const i = (a.participantes?.inscritos || []).find((x) =>
        soDigitos(x?.cpf) === cpf && String(x?.email || "").trim().toLowerCase() === email);
      if (!i) return { erro: [404, "Não encontramos inscrição com este CPF e este e-mail juntos. Confira os dados ou inscreva-se."], gravar: false };
      if (!i.token) { i.token = gerarToken(a.evento.chaveQr); return { inscrito: i, slug: a.evento.slug }; }
      return { inscrito: i, slug: a.evento.slug, gravar: false };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, token: r.inscrito.token, codigo: codigoDe(r.inscrito.token) });
  } catch (e) {
    console.error("Erro ao recuperar inscrição:", e);
    res.status(500).json({ error: "Não foi possível localizar agora. Tente de novo em instantes." });
  }
});

/* A inscrição pelo token — o token assinado É a credencial: quem o tem vê a
   PRÓPRIA inscrição, e nada além dela. A busca não depende do slug da URL
   (o endereço do evento pode mudar; o token, não): confere a assinatura
   evento a evento e acha o dono. */
async function acharInscricao(slugEv, token) {
  const acoes = await lerAcoes();
  const t = String(token || "").trim().toLowerCase();
  const porSlug = eventoPorSlug(acoes, slugEv);
  const candidatas = [porSlug, ...acoes.filter((a) => a !== porSlug && a?.evento?.chaveQr)].filter(Boolean);
  for (const a of candidatas) {
    if (!tokenValido(a.evento.chaveQr, t)) continue;
    const inscrito = (a.participantes?.inscritos || [])
      .find((x) => String(x?.token || "").toLowerCase() === t);
    if (inscrito) return { acao: a, inscrito };
  }
  return null;
}

app.get("/api/publico/eventos/:slug/inscricao/:token", async (req, res) => {
  try {
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r) return res.status(404).json({ error: "Inscrição não encontrada — confira o link recebido por e-mail." });
    const p = r.acao.proposta || {};
    const ev = r.acao.evento || {};
    // as atividades marcadas saem com título e horário (dados do evento,
    // que já são públicos) — é a lista da credencial do próprio dono
    const prog = ev.programacao || [];
    const atividades = (r.inscrito.atividades || [])
      .map((id) => prog.find((x) => x?.id === id)).filter(Boolean)
      .map(({ id, titulo, dia, horaInicio, horaFim, local }) =>
        ({ id, titulo, dia: dia || "", horaInicio: horaInicio || "", horaFim: horaFim || "", local: local || "" }));
    res.json({
      evento: {
        slug: ev.slug, nome: p.nomeAtividade || "", curso: r.acao.curso || "",
        periodoInicio: p.periodoInicio || "", periodoFim: p.periodoFim || "",
        local: p.local || "", municipio: p.municipio || "",
        transmissaoPublicada: ev.transmissao?.publicada === true,
      },
      inscricao: {
        nome: r.inscrito.nome || "", inscritoEm: r.inscrito.inscritoEm || "",
        codigo: codigoDe(r.inscrito.token),
        presente: r.inscrito.presente === true, presenteEm: r.inscrito.presenteEm || "",
        atividades,
      },
    });
  } catch (e) {
    console.error("Erro ao abrir a inscrição:", e);
    res.status(500).json({ error: "Não foi possível abrir a inscrição agora." });
  }
});

/**
 * Troca das atividades DEPOIS da inscrição — o token assinado é a
 * autenticação, e o corpo substitui o conjunto inteiro (marcar e desmarcar
 * são a mesma operação). Vale enquanto as inscrições estão abertas (página
 * ativa e prazo), mas a vaga GERAL não conta: o participante já tem a dele.
 * A vaga POR ATIVIDADE conta excluindo o que já é dele (manter não disputa).
 */
app.post("/api/publico/eventos/:slug/inscricao/:token/atividades", async (req, res) => {
  try {
    const pedidas = [...new Set((Array.isArray(req.body?.atividades) ? req.body.atividades : [])
      .map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 100);
    const r = await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, req.params.slug);
      if (!a) return { erro: [404, "Evento não encontrado."], falha: true, gravar: false };
      const t = String(req.params.token || "").trim().toLowerCase();
      if (!tokenValido(a.evento.chaveQr, t))
        return { erro: [404, "Inscrição não encontrada — confira o link recebido por e-mail."], falha: true, gravar: false };
      const inscrito = (a.participantes?.inscritos || [])
        .find((x) => String(x?.token || "").toLowerCase() === t);
      if (!inscrito)
        return { erro: [404, "Inscrição não encontrada — confira o link recebido por e-mail."], falha: true, gravar: false };
      if (!a.evento.ativo)
        return { erro: [409, "As inscrições deste evento não estão abertas."], gravar: false };
      const ate = prazoInscricao(a.evento, a);
      if (ate && hojeLocalISO() > ate)
        return { erro: [409, "O prazo de inscrição deste evento já se encerrou."], gravar: false };
      const atuais = Array.isArray(inscrito.atividades) ? inscrito.atividades : [];
      for (const idAtv of pedidas) {
        const pode = podeEscolherAtividade(a.evento, idAtv, a.participantes?.inscritos, atuais);
        if (!pode.ok) return { erro: [pode.semVaga ? 409 : 400, pode.motivo], gravar: false };
      }
      inscrito.atividades = pedidas;
      a.atualizadoEm = new Date().toISOString();
      return { atividades: pedidas };
    });
    if (r.erro) {
      if (r.falha) return falhaOnline(req, res, r.erro[0], r.erro[1]);   // token inválido alimenta o freio
      return res.status(r.erro[0]).json({ error: r.erro[1] });
    }
    res.json({ ok: true, atividades: r.atividades });
  } catch (e) {
    console.error("Erro na troca de atividades:", e);
    res.status(500).json({ error: "Não foi possível gravar agora. Tente de novo em instantes." });
  }
});

/** O QR da inscrição: carrega só o token — quem o lê é o credenciamento. */
app.get("/api/publico/eventos/:slug/inscricao/:token/qr.svg", async (req, res) => {
  try {
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r) return res.status(404).send("Inscrição não encontrada");
    const { default: QRCode } = await import("qrcode");
    const svg = await QRCode.toString(String(r.inscrito.token), {
      type: "svg", errorCorrectionLevel: "M", margin: 1,
    });
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(svg);
  } catch (e) {
    console.error("Erro no QR da inscrição:", e);
    res.status(500).send("Erro ao gerar o QR");
  }
});

/**
 * Check-in na entrada, pelos MONITORES (sem conta — o código do monitor,
 * que a gestão distribui, é a credencial da porta). Aceita o token lido do
 * QR ou, no fallback manual, os 6 primeiros caracteres dele. Idempotente:
 * repetir devolve { ja: true } com a hora da primeira vez, sem regravar.
 * Vale mesmo com a página desativada: o credenciamento é do dia do evento,
 * não do período de inscrições.
 */
app.post("/api/publico/eventos/:slug/checkin", async (req, res) => {
  try {
    if (freioCheckin.excedeu(req.ip))
      return res.status(429).json({ error: "Muitas tentativas sem sucesso. Aguarde alguns minutos e confira o código com a coordenação." });
    const b = req.body || {};
    const r = await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, req.params.slug);
      if (!a) return { erro: [404, "Evento não encontrado."], gravar: false };
      if (!codigoMonitorConfere(a.evento, b.codigoMonitor))
        return { erro: [403, "Código do monitor incorreto — confira com a coordenação do evento."], falha: true, gravar: false };
      // a atividade do credenciamento ("" = entrada geral): erro de escolha
      // do monitor não é ataque — recusa sem contar no freio
      let atv = null;
      if (String(b.atividade || "").trim()) {
        atv = (a.evento.programacao || []).find((x) => x?.id === String(b.atividade).trim()) || null;
        if (!atv) return { erro: [400, "Atividade não encontrada na programação — atualize a tela do credenciamento."], gravar: false };
      }
      const inscrito = inscritoPorToken(a.evento, a.participantes?.inscritos,
        { token: b.token, codigo: b.codigo });
      if (!inscrito) return { erro: [404, "Inscrição não encontrada."], falha: true, gravar: false };
      const idAtv = atv ? atv.id : "";
      const extras = atv ? {
        atividade: atv.titulo,
        // presença vale mesmo sem a marcação (a pessoa chegou e participou —
        // remanejamento de última hora é rotina de evento), mas a tela avisa
        ...(atv.inscricao === "propria" && !(inscrito.atividades || []).includes(atv.id)
          ? { naoInscritoNaAtividade: true } : {}),
      } : {};
      const presencas = inscrito.presencas || (inscrito.presencas = []);
      const anterior = presencas.find((x) => String(x?.atividade || "") === idAtv);
      const agora = new Date().toISOString();
      // idempotente POR NÍVEL: repetir a mesma atividade (ou a entrada geral)
      // devolve a primeira hora; registro antigo sem `presencas` conta como
      // a entrada geral já feita. MAS presença DESFEITA pela gestão volta a
      // valer aqui (achado da revisão de ago/2026): responder "já
      // credenciado" com presente=false deixaria a pessoa fora do export de
      // presentes sem ninguém perceber — quem se apresenta de novo, conta.
      if (anterior || (!atv && !presencas.length && inscrito.presente === true)) {
        if (inscrito.presente === true)
          return { ja: true, nome: inscrito.nome || "",
            presenteEm: anterior?.em || inscrito.presenteEm || "", ...extras, gravar: false };
        if (anterior) { anterior.em = agora; anterior.por = "monitor"; }
        inscrito.presente = true;
        inscrito.presenteEm = agora;
        inscrito.presentePor = "monitor";
        a.atualizadoEm = agora;
        return { nome: inscrito.nome || "", presenteEm: agora, ...extras };
      }
      presencas.push({ atividade: idAtv, em: agora, por: "monitor" });
      // o agregado continua: a PRIMEIRA presença de qualquer nível marca o
      // participante como presente no evento (é o que o export AEE e a régua
      // 3/3 leem)
      if (inscrito.presente !== true) {
        inscrito.presente = true;
        inscrito.presenteEm = agora;
        inscrito.presentePor = "monitor";
      }
      a.atualizadoEm = agora;
      return { nome: inscrito.nome || "", presenteEm: agora, ...extras };
    });
    if (r.erro) {
      if (r.falha) freioCheckin.falhou(req.ip);   // código errado / inscrição não achada contam ao freio
      return res.status(r.erro[0]).json({ error: r.erro[1] });
    }
    // só o nome de QUEM apresentou o token — nada da lista sai por aqui
    res.json({ ok: true, ja: r.ja === true, nome: r.nome, presenteEm: r.presenteEm,
      ...(r.atividade ? { atividade: r.atividade } : {}),
      ...(r.naoInscritoNaAtividade ? { naoInscritoNaAtividade: true } : {}) });
  } catch (e) {
    console.error("Erro no check-in do evento:", e);
    res.status(500).json({ error: "Não foi possível registrar agora. Tente de novo." });
  }
});

/** A capa do evento: os bytes da imagem, servidos da configuração. A rota
 *  existe porque o base64 é pesado demais para viajar nos payloads — quem
 *  precisa da imagem (página pública, vitrine, miniatura da gestão) busca
 *  aqui. Sem capa ou com o evento desativado, 404. */
app.get("/api/publico/eventos/:slug/capa", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    const capa = a?.evento?.ativo ? String(a.evento.capa || "") : "";
    const m = capa.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (!m) return res.status(404).send("Evento sem capa");
    res.setHeader("Content-Type", `image/${m[1]}`);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(Buffer.from(m[2], "base64"));
  } catch (e) {
    console.error("Erro na capa do evento:", e);
    res.status(500).send("Erro ao carregar a capa");
  }
});

/**
 * A transmissão, contra o token da inscrição: só com a transmissão
 * PUBLICADA pela gestão, e cada tipo entrega o seu mínimo — YouTube manda o
 * id do vídeo (o player é da página); Zoom NÃO manda o link aqui (o link só
 * sai no POST que registra a presença — é o registro que abre a porta).
 * O horário de referência é o da primeira atividade online da programação.
 */
app.get("/api/publico/eventos/:slug/transmissao/:token", async (req, res) => {
  try {
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r)
      return falhaOnline(req, res, 404, "Inscrição não encontrada — confira o link recebido por e-mail.");
    const ev = r.acao.evento || {};
    const t = ev.transmissao || {};
    if (t.publicada !== true || !t.tipo)
      return res.status(404).json({ error: "A transmissão deste evento não está publicada." });
    const atvOnline = (ev.programacao || []).find((x) => x?.modalidade === "online" && (x.dia || x.horaInicio));
    const base = {
      tipo: t.tipo, titulo: r.acao.proposta?.nomeAtividade || "",
      nome: r.inscrito.nome || "",
      presencaMinutos: Math.max(0, Number(t.presencaMinutos) || 0),
      dia: atvOnline?.dia || "", horaInicio: atvOnline?.horaInicio || "", horaFim: atvOnline?.horaFim || "",
    };
    if (t.tipo === "youtube")
      return res.json({ ...base, youtubeId: t.youtubeId || "", chatYoutube: t.chatYoutube === true });
    res.json(base);
  } catch (e) {
    console.error("Erro na transmissão do evento:", e);
    res.status(500).json({ error: "Não foi possível abrir a transmissão agora." });
  }
});

/* --------------- presença na transmissão (heartbeat online) ---------------
   O player manda uma batida por minuto enquanto toca. Gravar o estado a
   cada batida seria uma escrita por espectador por minuto — o acumulador
   fica em MEMÓRIA (slug → token → segundos) e o flush grava tudo de um
   evento numa única passada pela fila, a cada 2 minutos. Batida com token
   VÁLIDO não conta em freio nenhum (atrás do NAT do campus a turma inteira
   é o mesmo IP); token inválido conta como falha, como no check-in. */
const FLUSH_PRESENCA_MS = Number(process.env.EVENTOS_FLUSH_MS) || 120_000;   // env só para testes locais
const presencaAcum = new Map();   // slug → Map(token → { seg, vis, ultimaEm })

async function flushPresencaOnline(soSlug) {
  const slugs = soSlug ? [soSlug] : [...presencaAcum.keys()];
  for (const s of slugs) {
    const porToken = presencaAcum.get(s);
    if (!porToken?.size) { presencaAcum.delete(s); continue; }
    // sem batida nova não há o que gravar — só a faxina das batidas velhas
    // (`pend` marca até a PRIMEIRA batida, que credita 0 s mas precisa ir à
    // base: com presencaMinutos 0 é ela que já vale presença)
    if (![...porToken.values()].some((x) => x.pend)) {
      for (const [t, x] of porToken) if (Date.now() - x.ultimaEm > 10 * 60_000) porToken.delete(t);
      if (!porToken.size) presencaAcum.delete(s);
      continue;
    }
    await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, s);
      if (!a) { presencaAcum.delete(s); return { gravar: false }; }
      const minutos = Math.max(0, Math.trunc(Number(a.evento?.transmissao?.presencaMinutos)) || 0);
      let mudou = false;
      for (const i of a.participantes?.inscritos || []) {
        const ac = i?.token && porToken.get(String(i.token).toLowerCase());
        if (!ac || !ac.pend) continue;
        const online = i.online || (i.online = { segundos: 0, segundosVisiveis: 0, ultimaEm: "" });
        online.segundos = Math.round((online.segundos || 0) + ac.seg);
        online.segundosVisiveis = Math.round((online.segundosVisiveis || 0) + ac.vis);
        online.ultimaEm = new Date(ac.ultimaEm).toISOString();
        // a régua da presença: 0 minutos = presente na primeira batida;
        // senão, presente ao somar o tempo exigido. Presença física já
        // marcada não se sobrescreve — só o acumulado se atualiza.
        if (i.presente !== true && (minutos === 0 || online.segundos >= minutos * 60)) {
          i.presente = true;
          i.presenteEm = new Date().toISOString();
          i.presentePor = "online";
        }
        ac.seg = 0; ac.vis = 0; ac.pend = false;   // creditado — o relógio (ultimaEm) continua
        mudou = true;
      }
      for (const [t, x] of porToken) if (Date.now() - x.ultimaEm > 10 * 60_000) porToken.delete(t);
      if (!porToken.size) presencaAcum.delete(s);
      if (mudou) a.atualizadoEm = new Date().toISOString();
      return { gravar: mudou };
    }).catch((e) => console.error("[eventos] flush da presença online:", e.message));
  }
}
setInterval(() => flushPresencaOnline(), FLUSH_PRESENCA_MS).unref();

app.post("/api/publico/eventos/:slug/presenca-online", async (req, res) => {
  try {
    // o sendBeacon do pagehide chega como text/plain — o JSON vem em string
    const b = typeof req.body === "string"
      ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
      : req.body || {};
    const token = String(b.token || "").trim().toLowerCase();
    const acoes = await lerAcoes();
    const a = eventoPorSlug(acoes, req.params.slug);
    const okToken = a && tokenValido(a.evento.chaveQr, token)
      && (a.participantes?.inscritos || []).some((x) => String(x?.token || "").toLowerCase() === token);
    if (!okToken)
      return falhaOnline(req, res, 403, "Sessão de transmissão inválida — abra de novo o link da sua inscrição.");
    const t = a.evento.transmissao || {};
    if (t.publicada !== true)
      return res.status(404).json({ error: "A transmissão deste evento não está publicada." });

    // Zoom: sem embed — o clique registra a presença e SÓ ENTÃO entrega o
    // link da reunião (o registro é a porta). Direto na fila, sem acumulador.
    if (b.zoom === true) {
      if (t.tipo !== "zoom" || !t.zoomUrl)
        return res.status(404).json({ error: "Este evento não tem reunião do Zoom publicada." });
      await comAcoes((acs) => {
        const a2 = eventoPorSlug(acs, req.params.slug);
        const i = a2 && (a2.participantes?.inscritos || [])
          .find((x) => String(x?.token || "").toLowerCase() === token);
        if (!i || i.presente === true) return { gravar: false };
        i.presente = true;
        i.presenteEm = new Date().toISOString();
        i.presentePor = "online (zoom)";
        a2.atualizadoEm = i.presenteEm;
        return {};
      });
      return res.json({ ok: true, zoomUrl: t.zoomUrl });
    }

    if (t.tipo !== "youtube")
      return res.status(400).json({ error: "Este evento não tem transmissão por vídeo." });
    const porToken = presencaAcum.get(a.evento.slug)
      || presencaAcum.set(a.evento.slug, new Map()).get(a.evento.slug);
    const ac = porToken.get(token) || { seg: 0, vis: 0, ultimaEm: 0, pend: false };
    const agora = Date.now();
    // a primeira batida só acerta o relógio; as seguintes creditam o tempo
    // desde a anterior, com teto de 90 s — pausa longa não vira presença
    if (ac.ultimaEm) {
      const cred = Math.min(90, (agora - ac.ultimaEm) / 1000);
      ac.seg += cred;
      if (b.visivel === true) ac.vis += cred;
    }
    ac.ultimaEm = agora;
    ac.pend = true;
    porToken.set(token, ac);
    // acumulador muito cheio não espera o relógio do flush
    if (porToken.size > 200) flushPresencaOnline(a.evento.slug);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro na presença online:", e);
    res.status(500).json({ error: "Não foi possível registrar agora." });
  }
});

/* ------------------------- mural de comentários ---------------------------
   Interação de quem está inscrito — o token é o portão (o mural NÃO é
   público): quem lê e escreve é quem tem credencial do evento. A moderação
   (ocultar/reexibir) é do dono da ação e da gestão, na rota com login. */
const muralCooldown = new Map();   // token → último envio (ms)

app.post("/api/publico/eventos/:slug/mural", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim().toLowerCase();
    const texto = String(req.body?.texto || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 500);
    if (!texto) return res.status(400).json({ error: "Escreva a mensagem antes de enviar." });
    // 20 s entre mensagens do mesmo token: conversa, não flood
    if (Date.now() - (muralCooldown.get(token) || 0) < 20_000)
      return res.status(429).json({ error: "Aguarde alguns segundos entre uma mensagem e outra." });
    const r = await comAcoes((acoes) => {
      const a = eventoPorSlug(acoes, req.params.slug);
      if (!a) return { erro: [404, "Evento não encontrado."], falha: true, gravar: false };
      if (!tokenValido(a.evento.chaveQr, token))
        return { erro: [403, "Só quem está inscrito escreve no mural — abra o link da sua inscrição."], falha: true, gravar: false };
      const i = (a.participantes?.inscritos || [])
        .find((x) => String(x?.token || "").toLowerCase() === token);
      if (!i)
        return { erro: [403, "Só quem está inscrito escreve no mural — abra o link da sua inscrição."], falha: true, gravar: false };
      const mural = a.evento.mural || (a.evento.mural = []);
      if (mural.length >= 800) {
        // abre espaço descartando o mais antigo já OCULTO; conversa visível
        // não se apaga em silêncio — sem oculto, o mural recusa
        const oculto = mural.findIndex((m) => m?.oculto);
        if (oculto < 0) return { erro: [409, "O mural deste evento está cheio."], gravar: false };
        mural.splice(oculto, 1);
      }
      mural.push({
        id: gerarIdCurto(new Set(mural.map((m) => m?.id))),
        nome: i.nome || "", texto, em: new Date().toISOString(), oculto: false,
      });
      a.atualizadoEm = new Date().toISOString();
      return {};
    });
    if (r.erro) {
      if (r.falha) return falhaOnline(req, res, r.erro[0], r.erro[1]);
      return res.status(r.erro[0]).json({ error: r.erro[1] });
    }
    muralCooldown.set(token, Date.now());
    if (muralCooldown.size > 5000)
      for (const [k, v] of muralCooldown) if (Date.now() - v > 60_000) muralCooldown.delete(k);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao escrever no mural:", e);
    res.status(500).json({ error: "Não foi possível enviar agora. Tente de novo." });
  }
});

app.get("/api/publico/eventos/:slug/mural/:token", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    const t = String(req.params.token || "").trim().toLowerCase();
    const ok = a && tokenValido(a.evento.chaveQr, t)
      && (a.participantes?.inscritos || []).some((x) => String(x?.token || "").toLowerCase() === t);
    if (!ok)
      return falhaOnline(req, res, 404, "Inscrição não encontrada — confira o link recebido por e-mail.");
    // as últimas 200 visíveis, em ordem cronológica — id, nome e texto são o
    // que o próprio mural mostra a todos os inscritos
    const mensagens = (a.evento.mural || []).filter((m) => m && !m.oculto).slice(-200)
      .map(({ id, nome, texto, em }) => ({ id, nome, texto, em }));
    res.json({ mensagens });
  } catch (e) {
    console.error("Erro ao ler o mural:", e);
    res.status(500).json({ error: "Não foi possível carregar o mural agora." });
  }
});

/* ------------------- eventos: configuração (com login) ------------------- */
/**
 * Cria/atualiza a configuração do evento de uma ação — da gestão do módulo
 * OU do responsável pela ação (a mesma regra de visibilidade da ação).
 * Ativar gera o que faltar: slug, chave do QR e código do monitor. Mudar o
 * slug NÃO quebra inscrição feita: o token não referencia o endereço.
 */
app.post("/api/extensao/:id/evento", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const b = req.body || {};
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a || !podeOperarEvento(u, a)) return { erro: [404, "Ação não encontrada"], gravar: false };
      const estavaAtivo = a.evento?.ativo === true;
      const ev = { ...(a.evento || {}) };
      if (b.ativo !== undefined) ev.ativo = !!b.ativo;
      // página pública só de ação APROVADA: o número é o que diz que a
      // PROPPEX conhece e acolheu a atividade que se está divulgando
      if (ev.ativo && !a.numeroAcao)
        return { erro: [400, "Só ação aprovada (com Número da Ação) publica página de evento."], gravar: false };
      if (b.descricao !== undefined) ev.descricao = String(b.descricao || "").trim().slice(0, 4000);
      if (b.vagas !== undefined) {
        const v = Math.trunc(Number(b.vagas));
        if (!Number.isFinite(v) || v < 0)
          return { erro: [400, "Número de vagas inválido — use 0 para ilimitado ou um número positivo."], gravar: false };
        ev.vagas = v;   // 0 = ilimitado
      }
      if (b.inscricoesAte !== undefined) {
        const d = String(b.inscricoesAte || "").trim();
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d))
          return { erro: [400, "Prazo de inscrição inválido."], gravar: false };
        ev.inscricoesAte = d;
      }
      // tipo errado é 400, nunca 200: normalizar uma string devolveria []
      // e ZERARIA atividades/campos com resposta de sucesso (achado da
      // revisão de ago/2026 — mesmo tratamento que vagas e capa já tinham)
      if (b.programacao !== undefined && !Array.isArray(b.programacao))
        return { erro: [400, "Programação inválida — envie a lista de atividades."], gravar: false };
      if (b.formulario !== undefined && !Array.isArray(b.formulario))
        return { erro: [400, "Formulário inválido — envie a lista de campos."], gravar: false };
      if (b.transmissao !== undefined && (typeof b.transmissao !== "object" || b.transmissao === null || Array.isArray(b.transmissao)))
        return { erro: [400, "Configuração de transmissão inválida."], gravar: false };
      if (b.programacao !== undefined) ev.programacao = normalizarProgramacao(b.programacao);
      if (b.formulario !== undefined) ev.formulario = normalizarFormulario(b.formulario);
      if (b.local !== undefined) ev.local = String(b.local || "").trim().slice(0, 200);
      // vazio volta ao texto institucional padrão (LGPD_TEXTO_PADRAO)
      if (b.lgpdTexto !== undefined) ev.lgpdTexto = String(b.lgpdTexto || "").trim().slice(0, 2000);
      if (b.capa !== undefined) {
        const c = String(b.capa || "");
        if (!c) delete ev.capa;   // "" remove a capa
        else {
          const m = c.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
          if (!m) return { erro: [400, "A capa deve ser uma imagem JPEG, PNG ou WebP."], gravar: false };
          // tamanho DECODIFICADO (3/4 do base64): o teto protege o estado,
          // que viaja inteiro a cada gravação
          if (m[2].length * 3 / 4 > 500 * 1024)
            return { erro: [400, "A capa passa de 500 KB — reduza a imagem antes de enviar."], gravar: false };
          ev.capa = c;
        }
      }
      if (b.transmissao !== undefined) {
        const t = b.transmissao || {};
        if (t.presencaMinutos !== undefined && t.presencaMinutos !== "" && !Number.isFinite(Number(t.presencaMinutos)))
          return { erro: [400, "Minutos de presença inválidos — use 0 para contar o primeiro acesso."], gravar: false };
        const tipo = ["youtube", "zoom"].includes(t.tipo) ? t.tipo : "";
        const entradaYt = String(t.youtubeId || t.url || "").trim();
        const youtubeId = tipo === "youtube" ? videoIdDe(entradaYt) : "";
        if (tipo === "youtube" && entradaYt && !youtubeId)
          return { erro: [400, "Não reconheci o vídeo do YouTube — cole o link da transmissão ou só o ID."], gravar: false };
        const zoomUrl = tipo === "zoom" ? String(t.zoomUrl || t.url || "").trim().slice(0, 300) : "";
        if (zoomUrl && !/^https:\/\//i.test(zoomUrl))
          return { erro: [400, "O link do Zoom precisa começar com https://"], gravar: false };
        // publicar é o interruptor explícito — e não se publica o que não
        // tem para onde apontar
        const publicada = t.publicada === true && !!tipo;
        if (publicada && tipo === "youtube" && !youtubeId)
          return { erro: [400, "Informe o vídeo do YouTube antes de publicar a transmissão."], gravar: false };
        if (publicada && tipo === "zoom" && !zoomUrl)
          return { erro: [400, "Informe o link da reunião do Zoom antes de publicar a transmissão."], gravar: false };
        ev.transmissao = {
          tipo, youtubeId, zoomUrl,
          chatYoutube: t.chatYoutube === true,
          presencaMinutos: Math.max(0, Math.trunc(Number(t.presencaMinutos)) || 0),
          publicada,
        };
      }
      const emUso = acoes.filter((x) => x !== a && x?.evento?.slug).map((x) => x.evento.slug);
      if (b.slug !== undefined && String(b.slug).trim()) {
        const s = String(b.slug).trim().toLowerCase();
        if (!SLUG_VALIDO.test(s))
          return { erro: [400, "Endereço inválido: use só letras minúsculas, números e hífens."], gravar: false };
        if (slugReservado(s))
          return { erro: [400, "Este endereço é reservado pelo sistema — escolha outro."], gravar: false };
        if (emUso.includes(s))
          return { erro: [409, "Este endereço já é de outro evento — escolha outro."], gravar: false };
        ev.slug = s;
      }
      if (ev.ativo) {
        if (!ev.slug) ev.slug = slugUnico(a.proposta?.nomeAtividade || a.numeroAcao || a.id, [...emUso, ...SLUGS_RESERVADOS]);
        if (!ev.chaveQr) ev.chaveQr = gerarChaveQr();
        if (!ev.codigoMonitor) ev.codigoMonitor = gerarCodigoMonitor();
      }
      // trocar o código do monitor invalida o antigo na hora — é o caminho
      // quando ele vazou ou quando a equipe da porta muda
      if (b.regenerarCodigoMonitor && ev.chaveQr) ev.codigoMonitor = gerarCodigoMonitor();
      a.evento = ev;
      a.atualizadoEm = new Date().toISOString();
      return { evento: ev, ativou: ev.ativo === true && !estavaAtivo, acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // página entrou no ar → aviso ao setor de eventos (eventos@uniego.edu.br),
    // fire-and-forget: e-mail que falha não desfaz a ativação
    if (r.ativou) {
      try {
        const { enviarEmail, emailEventoAtivado } = await import("./lib/mailer.js");
        enviarEmail(emailEventoAtivado(r.acao))
          .catch((e) => console.error("[eventos] aviso de ativação não enviado:", e.message));
      } catch (e) { console.error("[eventos] aviso de ativação:", e.message); }
    }
    // a resposta passa pelo MESMO strip do GET: a chaveQr recém-gerada e a
    // capa não viajam nem ao dono (correção de ago/2026 — a resposta antiga
    // devolvia o evento completo, chave dentro)
    res.json({ ok: true, evento: eventoSemSegredos(r.evento) });
  } catch (e) {
    console.error("Erro na configuração do evento:", e);
    res.status(500).json({ error: "Falha ao gravar a configuração do evento" });
  }
});

/**
 * Presença MANUAL pela gestão (achado de ago/2026): o credenciamento por QR
 * é dos inscritos ONLINE; quem veio da lista da coordenação (planilha, sem
 * token) assina o papel e precisa entrar como presente para sair no export
 * "só presentes". A gestão/o responsável marca por aqui, achando o inscrito
 * pela chave que tiver (token, CPF, e-mail ou nome). Alterna presente.
 * Com `atividade` (id da programação), o registro é NAQUELA atividade —
 * assinado como ato da gestão, não do monitor (achado da revisão de
 * ago/2026); desmarcar a atividade não desfaz a presença geral, que tem o
 * seu próprio botão.
 */
app.post("/api/extensao/:id/presenca", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const b = req.body || {};
    const alvoCpf = soDigitos(b.cpf), alvoEmail = String(b.email || "").trim().toLowerCase();
    const alvoTok = String(b.token || "").trim().toLowerCase(), alvoNome = String(b.nome || "").trim().toLowerCase();
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a || !podeOperarEvento(u, a)) return { erro: [404, "Ação não encontrada"], gravar: false };
      const ins = a.participantes?.inscritos || [];
      // casa pela chave mais forte que vier: token → CPF → e-mail → nome
      const i = ins.find((x) => alvoTok && String(x.token || "").toLowerCase() === alvoTok)
        || ins.find((x) => alvoCpf && soDigitos(x.cpf) === alvoCpf)
        || ins.find((x) => alvoEmail && String(x.email || "").toLowerCase() === alvoEmail)
        || ins.find((x) => alvoNome && String(x.nome || "").trim().toLowerCase() === alvoNome);
      if (!i) return { erro: [404, "Inscrito não encontrado."], gravar: false };
      const agora = new Date().toISOString();
      if (String(b.atividade || "").trim()) {
        const atv = (a.evento?.programacao || []).find((x) => x?.id === String(b.atividade).trim());
        if (!atv) return { erro: [400, "Atividade não encontrada na programação."], gravar: false };
        const presencas = i.presencas || (i.presencas = []);
        const anterior = presencas.find((p) => String(p?.atividade || "") === atv.id);
        const marcar = b.presente === undefined ? !anterior : !!b.presente;
        if (marcar && !anterior) presencas.push({ atividade: atv.id, em: agora, por: `gestão (${u.email})` });
        if (!marcar && anterior) i.presencas = presencas.filter((p) => p !== anterior);
        if (marcar && i.presente !== true) {
          i.presente = true;
          i.presenteEm = agora;
          i.presentePor = `gestão (${u.email})`;
        }
        a.atualizadoEm = agora;
        return { nome: i.nome || "", presente: i.presente === true,
          presenteEm: i.presenteEm || "", atividade: atv.titulo, naAtividade: marcar };
      }
      const presente = b.presente === undefined ? !(i.presente === true) : !!b.presente;
      i.presente = presente;
      if (presente) { i.presenteEm = agora; i.presentePor = `gestão (${u.email})`; }
      else {
        i.presenteEm = ""; i.presentePor = "";
        // desfazer tira também o registro GERAL de presencas — deixá-lo
        // faria os números divergirem do agregado; as presenças POR
        // ATIVIDADE ficam (são registros de participação nas atividades)
        if (Array.isArray(i.presencas))
          i.presencas = i.presencas.filter((p) => String(p?.atividade || "") !== "");
      }
      a.atualizadoEm = agora;
      return { nome: i.nome || "", presente: i.presente, presenteEm: i.presenteEm };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error("Erro ao marcar presença:", e);
    res.status(500).json({ error: "Não foi possível marcar a presença agora." });
  }
});

/**
 * Moderação do mural — do dono da ação e da gestão: ocultar tira a mensagem
 * da leitura pública (e é o que abre espaço quando o mural enche); reexibir
 * desfaz. Nada se apaga — o registro fica, só muda a visibilidade.
 */
app.post("/api/extensao/:id/mural/:mid", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a || !podeOperarEvento(u, a)) return { erro: [404, "Ação não encontrada"], gravar: false };
      const m = (a.evento?.mural || []).find((x) => x?.id === req.params.mid);
      if (!m) return { erro: [404, "Mensagem não encontrada no mural."], gravar: false };
      m.oculto = req.body?.oculto === true;
      a.atualizadoEm = new Date().toISOString();
      return { oculto: m.oculto };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, oculto: r.oculto });
  } catch (e) {
    console.error("Erro na moderação do mural:", e);
    res.status(500).json({ error: "Não foi possível moderar agora." });
  }
});

/** A planilha para a certificação na AEE — todos os inscritos ou, com
 *  ?presentes=1, só quem foi credenciado na entrada. Com ?atividade=<id>,
 *  o recorte é dos que MARCARAM aquela atividade (e presentes=1 passa a
 *  olhar a presença NAQUELA atividade), com a CH dela quando declarada —
 *  é o que certifica minicurso e oficina separadamente do evento. */
app.get("/api/extensao/:id/inscritos.xlsx", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const acao = (await lerAcoes()).find((a) => a.id === req.params.id);
    if (!acao || !podeOperarEvento(u, acao)) return res.status(404).send("Ação não encontrada");
    let atividade = null;
    if (String(req.query.atividade || "").trim()) {
      atividade = (acao.evento?.programacao || []).find((x) => x?.id === String(req.query.atividade).trim());
      if (!atividade) return res.status(404).send("Atividade não encontrada na programação");
    }
    const { gerarInscritosAeeXlsx } = await import("./lib/exports.js");
    const buffer = await gerarInscritosAeeXlsx(acao,
      { somentePresentes: req.query.presentes === "1", atividade });
    const num = (acao.numeroAcao || acao.id).replace(/[^A-Za-z0-9-]/g, "-");
    const sufixo = `${atividade ? `-${atividade.id}` : ""}${req.query.presentes === "1" ? "-presentes" : ""}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Inscritos-AEE-${num}${sufixo}.xlsx"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no export AEE:", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
  }
});

/** A lista COMPLETA do ARCHÉ (dono/gestão): tudo o que a inscrição online
 *  coletou — contato, atividades, presenças, consentimento e campos extras.
 *  É o export interno da coordenação; a planilha da AEE continua sendo a
 *  da certificação. */
app.get("/api/extensao/:id/inscritos-completo.xlsx", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const acao = (await lerAcoes()).find((a) => a.id === req.params.id);
    if (!acao || !podeOperarEvento(u, acao)) return res.status(404).send("Ação não encontrada");
    const { gerarInscritosCompletoXlsx } = await import("./lib/exports.js");
    const buffer = await gerarInscritosCompletoXlsx(acao);
    const num = (acao.numeroAcao || acao.id).replace(/[^A-Za-z0-9-]/g, "-");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Inscritos-${num}-completo.xlsx"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no export completo:", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
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
  const redator = await import("./lib/redator.js");
  res.json({
    ...ATAS_META, pautas: PAUTAS, momentos: MOMENTOS, cadencias: CADENCIAS, ritual: RITUAL,
    gestao: gereAtas(u), eu: u.email, ia: redator.provedorAtivo(),
    // extensão da redação: o catálogo e o padrão da instituição
    estilos: redator.ESTILOS, estiloPadrao: redator.estiloPadrao(),
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

/* O dossiê de conformidade em PDF: a resposta à pergunta que o avaliador do
   INEP faz — onde está a ata que comprova este indicador. Um por curso
   (NDE e Colegiado) e um institucional (conselhos, CPA, pró-reitorias). */
app.get("/api/atas/dossie.pdf", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    if (!gereAtas(u)) return res.status(403).send("O dossiê de conformidade é da gestão.");
    const curso = String(req.query.curso || "").trim();
    if (curso && !CURSOS.some((c) => c.slug === curso)) return res.status(400).send("Curso desconhecido.");
    const atas = await lerAtas();
    const dossie = dossieConformidade(atas, { curso });

    const { gerarDossieConformidadePdf } = await import("./lib/pdf.js");
    const buffer = await gerarDossieConformidadePdf({ dossie, emitidoPor: u.nome || u.email });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="dossie-conformidade-${slug(curso || "institucional")}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no dossiê de conformidade:", e);
    res.status(500).send("Erro ao gerar o dossiê: " + e.message);
  }
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

/**
 * O que a sessão anterior deixou combinado — para virar pauta desta.
 *
 * Encaminhamento sem retomada é a queixa mais comum de quem lê uma série de
 * atas (o avaliador do INEP inclusive): a reunião decide "fulano providencia
 * até tal dia" e ninguém mais volta ao assunto. Quem lavra a próxima ata
 * redigitava isso de memória, quando lembrava.
 *
 * O ARCHÉ não julga se o encaminhamento foi cumprido — quem diz isso é a
 * reunião. Ele mostra o que foi combinado nas sessões anteriores do MESMO
 * órgão, do mais recente para o mais antigo, e quem lavra escolhe o que
 * retomar. O recorte do acervo vale igual: só as atas que a pessoa já podia
 * ver (`podeVer`).
 */
app.get("/api/atas/encaminhamentos-anteriores", async (req, res) => {
  const u = await sessaoAtas(req, res);
  if (!u) return;
  const orgao = String(req.query.orgao || "").trim();
  const curso = String(req.query.curso || "").trim();
  const excluir = String(req.query.excluir || "").trim();      // a ata sendo lavrada
  if (!orgao) return res.status(400).json({ error: "Informe o órgão" });
  const atas = (await lerAtas())
    .filter((a) => a.orgao === orgao && String(a.curso || "") === curso
      && a.id !== excluir && a.status === "registrada" && podeVer(u, a));
  const porId = new Map(atas.map((a) => [a.id, a]));
  const lista = encaminhamentos(atas)
    .map((e) => ({ ...e, data: porId.get(e.ataId)?.sessao?.data || "" }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))
      || String(b.prazo || "").localeCompare(String(a.prazo || "")))
    .slice(0, 30);
  res.json({ encaminhamentos: lista });
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
      // A gravação AUTOMÁTICA do rascunho não é ato editorial: ela acontece
      // a cada poucos segundos enquanto a pessoa digita, e uma linha de
      // histórico por vez encheria o registro e apagaria o que interessa
      // (quem redigiu, quem aprovou, quem registrou). A abertura da reunião
      // continua marcada — é o começo do documento.
      const automatica = b.auto === true && base && ata.status === "rascunho";
      if (!automatica) {
        ata = anotar(ata, { quem: u.email, oQue: base ? `editou (${ata.status})` : "abriu a reunião" });
      } else {
        ata = { ...ata, atualizadoEm: new Date().toISOString() };
      }

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
    // a extensão do texto é escolha de quem redige, sessão a sessão: uma ata
    // de NDE que vai ao INEP pede desenvolvimento; a de uma comissão, não
    const r = await redigir(ata, { estilo: req.body?.estilo });

    const out = await comAtas((lista) => {
      const i = lista.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ata não encontrada"], gravar: false };
      const nova = anotar({
        ...lista[i], texto: r.texto,
        redacao: { provedor: r.provedor, modelo: r.modelo, em: r.em, estilo: r.estilo },
        status: lista[i].status === "rascunho" ? "minuta" : lista[i].status,
        atualizadoEm: new Date().toISOString(), atualizadoPor: u.email,
      }, { quem: u.email, oQue: `redigiu a minuta (${r.provedor})` });
      lista[i] = numerar(lista, nova);
      return { ata: lista[i] };
    });
    if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
    res.json({ ok: true, ata: out.ata, aviso: r.aviso, provedor: r.provedor, estilo: r.estilo });
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
// `gestorGeral` é o que autoriza decidir a própria proposta (ver podeAvaliar
// em lib/ic.js): é a autoridade final do processo, e o mérito quem julgou foi
// o parecerista ad hoc. Coordenador de módulo não tem essa prerrogativa.
const quemIC = (u) => ({
  email: u?.email, cpf: u?.cpf || "", gestao: gereIC(u), gestorGeral: u?.papel === "gestor",
});

/**
 * Quem está olhando, com o registro de publicação junto. A devolutiva da
 * seleção (notas e parecer) só sai para o professor DEPOIS que o resultado
 * daquele edital foi publicado — a devolutiva é parte do resultado, e
 * resultado se divulga uma vez, para todos ao mesmo tempo.
 */
const quemOlha = async (req, u) => ({
  ...((await visaoComo(req, u)) || quemIC(u)),
  publicados: await resultadosPublicados(),
});

async function sessaoIC(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) {
    res.status(403).json({ error: "Faça login para acessar a Iniciação Científica" });
    return null;
  }
  // Conta pendente entra na IC se — e só se — já estiver em algum projeto:
  // aluno indicado pela orientação ou avaliador designado pela coordenação.
  // O convite é por e-mail exato e a visibilidade continua sendo a do papel.
  const meuPerfil = (await carregarPerfis())[u.email] || {};
  const cpf = meuPerfil.cpf || "";
  // o cadastro do bolsista repete o que a pessoa já digitou no perfil: o
  // formulário abre com isso preenchido em vez de pedir CPF duas vezes
  const eu = { ...u, cpf, telefone: meuPerfil.telefone || meuPerfil.whatsapp || "" };
  if (u.papel === "pendente" && !participaDeAlgum(u.email, await lerProjetos(), cpf)
    && !(await souBolsistaEM(u.email))) {
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
function perfilIC(u, projetos, quem = null, { bolsistaEM = false } = {}) {
  const meu = quem || quemIC(u);
  if (meu.perfilGenerico) return meu.perfilGenerico;   // visão genérica do "ver como"
  if (meu.gestao) return "gestao";
  const papeis = projetos.map((p) => papelNoProjeto(meu, p)).filter(Boolean);
  if (papeis.includes("orientador")) return "orientador";
  // o bolsista do ICEM sem projeto de graduação é ESTUDANTE do programa, não
  // docente: a cara do setor para ele é a guia do Ensino Médio (dono, ago/2026)
  if (!papeis.length && bolsistaEM) return "em";
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

function editaisConhecidos(projetos, publicados = {}, termos = {}) {
  // as contagens são agregadas de TODOS os projetos (quem chama é o servidor,
  // não a visão de cada um) — é o que permite mostrar a guia Editais e
  // Resultados para qualquer usuário sem vazar projeto alheio
  const mapa = new Map([[EDITAL.numero, { projetos: 0, bolsas: 0 }]]);
  for (const p of projetos || []) {
    const n = String(p.edital || EDITAL.numero);
    if (p.status === "rascunho") continue;
    if (!mapa.has(n)) mapa.set(n, { projetos: 0, bolsas: 0 });
    mapa.get(n).projetos += 1;
    // o contador de bolsas segue o embargo (achado de ago/2026): antes do
    // resultado FINAL publicado, a concessão ainda é interna — o número no
    // cartão contava as bolsas conforme a gestão as marcava
    const aberto = !!RESULTADOS_EDITAIS[n] || publicados[n]?.fase === "final";
    if (aberto && p.fomento && p.fomento.tipo !== "voluntario") mapa.get(n).bolsas += 1;
  }
  return [...mapa].map(([numero, c]) => ({
    numero, projetos: c.projetos, bolsas: c.bolsas, vigente: numero === EDITAL.numero,
    documento: DOCUMENTOS_EDITAIS[numero] || null,
    resultadoDocumento: RESULTADOS_EDITAIS[numero] || null,
    // os PDFs catalogados são os resultados finais da época; o do ciclo
    // vigente passa pelas fases preliminar → final, publicadas pela gestão
    resultadoFase: RESULTADOS_EDITAIS[numero] ? "final" : (publicados[numero]?.fase || null),
    resultadoPublicado: !!RESULTADOS_EDITAIS[numero] || !!publicados[numero],
    // os termos de compromisso só aparecem para aluno e orientação depois da
    // publicação — a cerimônia de assinaturas é que abre o documento
    termosPublicados: !!termos[numero],
  })).sort((a, b) => b.numero.localeCompare(a.numero, "pt-BR"));
}

/**
 * Os editais do ICEM (Ensino Médio) na página de Editais e Resultados: outro
 * programa, com série própria (02/AAAA) e documentos já publicados — por isso
 * a lista sai do catálogo de turmas (lib/em.js), não dos projetos. O ciclo
 * vigente ainda não tem resultado: aparece "em breve" até o PDF ser arquivado.
 */
const editaisEMParaLista = (publicados = {}) => TURMAS_EM.map((t) => ({
  numero: t.edital, ciclo: t.ciclo, vigente: !t.encerrada,
  documento: t.documento || null, resultadoDocumento: t.resultado || null,
  // as turmas com PDF arquivado são resultado final da época, sempre aberto;
  // o da turma vigente passa pelas fases preliminar → final, como na graduação
  resultadoFase: t.resultado ? "final" : (publicados[t.edital]?.fase || null),
  resultadoPublicado: !!t.resultado || !!publicados[t.edital],
})).sort((a, b) => b.ciclo.localeCompare(a.ciclo, "pt-BR"));

/** A publicação do resultado do ICEM — a mesma lógica em duas fases da
 *  graduação, em chave própria (o programa é outro, o edital é 02/AAAA). */
const RESULTADO_EM_PUB_KEY = "ic-em-resultado-publicado-v1";
async function resultadosPublicadosEM() {
  const raw = await storage.get(RESULTADO_EM_PUB_KEY);
  return raw ? JSON.parse(raw) : {};
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
// a visão leva junto a janela dos relatórios: é ela que diz à tela quando o
// formulário abre — sem isso o front mostraria o formulário fechado como
// aberto (o servidor recusaria, mas o aluno digitaria à toa)
const verProjeto = (u, p) => {
  const quem = quemIC(u);
  const visao = visaoDoProjeto(p, quem);
  return papelNoProjeto(quem, p) === "avaliador" ? visao
    : { ...visao, prazoRelatorios: prazosRelatorios(p) };
};

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
    // o modelo institucional dos relatórios e das avaliações que os acompanham
    relatorioModelo: {
      camposParcial: CAMPOS_RELATORIO_PARCIAL, obrigatorios: CAMPOS_PARCIAL_OBRIGATORIOS,
      formatacao: FORMATACAO_RELATORIO,
      perguntasProjeto: PERGUNTAS_AVALIACAO_PROJETO, respostasProjeto: RESPOSTAS_AVALIACAO_PROJETO,
      escala: ESCALA_0_5, criteriosOrientador: CRITERIOS_AVALIACAO_ORIENTADOR,
      criteriosAluno: CRITERIOS_AVALIACAO_ALUNO, pareceresConclusivos: PARECERES_CONCLUSIVOS,
    },
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
    // o que o perfil já sabe da pessoa, para o cadastro do bolsista abrir
    // preenchido (simulando outra pessoa, não vai — seriam dados dela)
    contato: como ? null : { nome: u.nome || "", cpf: u.cpf || "", telefone: u.telefone || "" },
    perfil: perfilIC(u, projetos, meu, { bolsistaEM: como ? false : await souBolsistaEM(u.email) }),
    // quem a coordenação pode simular, e por quais olhos está olhando agora
    // os editais (números, contagens e documentos) são de todos; a lista de
    // pessoas para o "ver como" segue só com a coordenação
    editais: editaisConhecidos(projetos, await resultadosPublicados(), await termosPublicados()),
    editaisEM: editaisEMParaLista(await resultadosPublicadosEM()),
    ...(gereIC(u) ? { pessoas: pessoasDoSetor(projetos) } : {}),
    ...(como ? { simulando: como.email } : {}),
  });
});

// Lista enxuta: o resumo é o bastante para o painel e para as listas.
app.get("/api/ic", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = await quemOlha(req, u);
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
  const meu = await quemOlha(req, u);
  res.json({ etapas: cronogramaDe(await lerProjetos(), meu), eu: meu.email, hoje: hojeLocalISO() });
});

app.get("/api/ic/relatorios", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const projetos = await lerProjetos();
  const meu = await quemOlha(req, u);
  res.json({
    relatorios: relatoriosDe(projetos, meu),
    // o AVALIADOR fica de fora (achado de ago/2026): relatórios não são
    // assunto dele, e a lista de pendências trazia nome e e-mail dos alunos
    // que a visão anônima mascara
    pendentes: projetos.filter((p) => {
      const papel = papelNoProjeto(meu, p);
      return papel && papel !== "avaliador";
    }).flatMap((p) =>
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
  const mensagem = String(req.body?.mensagem || "").trim().slice(0, 2000);
  const { destinatarios, semEmail } = destinatariosDoCiclo(await lerProjetos(), edital, await emailsPorNome());

  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  const link = `${base}/entrar?next=${encodeURIComponent("/pesquisa/ic/")}`;
  const { enviarEmail, blocoMensagem, escapeHtml } = await import("./lib/mailer.js");
  const corpoAviso = (d) => `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px">
          <p>Olá${d.nome ? `, <b>${escapeHtml(d.nome)}</b>` : ""}!</p>
          ${blocoMensagem(mensagem)}
          <p>O(s) seu(s) <b>certificado(s) do Edital ${edital}</b> de Iniciação Científica
            já pode(m) ser baixado(s) no ARCHÉ — são <b>${d.certificados}</b> documento(s).</p>
          <p>Entre no sistema e abra a guia <b>Certificados</b>, no setor Pesquisa · IC.
            Se for o seu primeiro acesso, crie o usuário com este e-mail e
            <b>informe o seu CPF no perfil</b>: é ele que reúne, numa conta só, os
            certificados de todas as edições em que você participou.</p>
          <p><a href="${link}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
            padding:12px 22px;border-radius:10px;font-weight:600">Baixar meu certificado</a></p>
          <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${link}<br>
            PROPPEX — Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária · UNIEGO</p></div>`;
  if (req.body?.simular === true) {
    return res.json({ simulado: true, destinatarios, semEmail,
      previewHtml: destinatarios.length ? corpoAviso(destinatarios[0]) : "" });
  }
  const enviados = [], falhas = [];
  for (const d of destinatarios) {
    try {
      await enviarEmail({
        para: d.email,
        assunto: `[ARCHÉ] Seu certificado de Iniciação Científica (${edital}) está disponível`,
        corpoHtml: corpoAviso(d),
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
    // ?aluno= (e-mail ou CPF) recorta a planilha a UMA pessoa — é o que a
    // gestão anexa ao pedido de pagamento de um bolsista específico
    const alvo = String(req.query.aluno || "").trim().toLowerCase();
    const alvoCpf = soDigitos(alvo);
    const ehAlvo = (a) => !alvo
      || (a.email && a.email.toLowerCase() === alvo)
      || (alvoCpf.length === 11 && soDigitos(a.cpf) === alvoCpf);
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
      { header: "RG do Aluno", key: "rgAluno", width: 16 },
      { header: "Data de Nascimento", key: "nascimento", width: 16 },
      { header: "Idade", key: "idade", width: 8 },
      { header: "Telefone do Aluno (WhatsApp)", key: "telefoneAluno", width: 22 },
      { header: "E-mail do Aluno", key: "emailAluno", width: 30 },
      { header: "Endereço", key: "endereco", width: 40 },
      { header: "Vínculo empregatício", key: "vinculo", width: 20 },
      { header: "Banco do Aluno", key: "banco", width: 16 },
      { header: "Agência", key: "agencia", width: 10 },
      { header: "Conta Corrente", key: "conta", width: 16 },
      { header: "Pix (vinculado à conta)", key: "pix", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of projetos) {
      const mod = modalidadeEfetivaIC(p);
      for (const a of (p.alunos || []).filter((x) => x.bolsista && ehAlvo(x))) {
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
          rgAluno: a.rg || "",
          nascimento: a.nascimento ? String(a.nascimento).split("-").reverse().join("/") : "",
          idade: idadeEm(a.nascimento) ?? "",
          telefoneAluno: a.telefone || "",
          emailAluno: a.email || "",
          endereco: a.endereco || "",
          vinculo: a.vinculo === "sim" ? `sim${a.vinculoOnde ? ` — ${a.vinculoOnde}` : ""}`
            : a.vinculo === "nao" ? "não" : "",
          banco: a.banco || "", agencia: a.agencia || "", conta: a.conta || "", pix: a.pix || "",
        });
      }
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bolsista${alvo ? "-" + slug(alvo.split("@")[0]) : "s"}-edital-${slug(numero)}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("Erro na planilha de bolsistas:", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
  }
});

/* ------------------------ termos de compromisso -------------------------
   O documento institucional que se assina na cerimônia. A gestão emite o
   lote (para imprimir) a qualquer momento; o aluno e a orientação só veem a
   própria cópia DEPOIS que a coordenação publicar os termos — a solenidade
   ainda vai ser marcada, e um termo circulando antes dela viraria documento
   assinado fora do ato. Publicar é um clique, e recolher também. */
const TERMOS_PUB_KEY = "ic-termos-publicados-v1";
async function termosPublicados() {
  const raw = await storage.get(TERMOS_PUB_KEY);
  return raw ? JSON.parse(raw) : {};
}

app.post("/api/ic/termos/publicar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Somente a coordenação publica os termos." });
  const numero = String(req.body?.edital || EDITAL.numero).trim();
  const publicar = req.body?.publicar !== false;
  const atual = await termosPublicados();
  if (publicar) {
    atual[numero] = {
      em: new Date().toISOString(), por: u.email,
      // `desde` é a primeira publicação: republicar não reinicia nada
      desde: atual[numero]?.desde || new Date().toISOString(),
    };
  } else {
    delete atual[numero];
  }
  await storage.set(TERMOS_PUB_KEY, JSON.stringify(atual));
  res.json({ ok: true, publicado: !!atual[numero], edital: numero });
});

/** Projetos de um ciclo que geram termo: aprovados, com aluno indicado. */
async function projetosComTermo(numero, so = "") {
  return (await lerProjetos()).filter((p) =>
    String(p.edital || EDITAL.numero) === numero
    && ["aprovado", "concluido"].includes(p.status)
    && (!so || p.id === so));
}

const TIPOS_TERMO = ["bolsista", "orientador", "todos"];

/* O lote da coordenação: uma folha por pessoa, para levar à cerimônia. */
app.get("/api/ic/termos.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Somente a coordenação de pesquisa emite os termos de compromisso.");
    const numero = String(req.query.edital || EDITAL.numero).trim();
    const so = String(req.query.projeto || "").trim();
    const tipo = TIPOS_TERMO.includes(String(req.query.tipo)) ? String(req.query.tipo) : "todos";
    const projetos = await projetosComTermo(numero, so);

    const { gerarTermoCompromissoPdf } = await import("./lib/pdf.js");
    const buffer = await gerarTermoCompromissoPdf({
      edital: { ...EDITAL, numero }, projetos, tipo,
      assinaturas: await assinaturasParaPdf(),
      perfis: await carregarPerfis(),
      emitidoPor: u.nome || u.email,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="termos-${tipo}-${slug(so ? (projetos[0]?.numero || so) : numero)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no termo de compromisso:", e);
    res.status(500).send("Erro ao gerar o termo: " + e.message);
  }
});

/* A cópia digital de cada um: o aluno baixa o seu, quem orienta baixa o
   dele. Só depois da publicação — antes disso o documento nem existe para
   quem não é gestão. O recorte é o mesmo do projeto: ninguém baixa o termo
   alheio, porque o PDF é montado a partir do próprio registro da pessoa. */
app.get("/api/ic/termo.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    const meu = quemIC(u);
    const p = (await lerProjetos()).find((x) => x.id === String(req.query.projeto || ""));
    if (!p || !podeVerProjeto(meu, p)) return res.status(404).send("Projeto não encontrado");
    const numero = String(p.edital || EDITAL.numero);
    const papel = papelNoProjeto(meu, p);
    if (!["aluno", "orientador", "gestao"].includes(papel))
      return res.status(403).send("Este termo não é seu.");
    if (!["aprovado", "concluido"].includes(p.status))
      return res.status(404).send("O termo sai depois da aprovação do projeto.");
    if (papel !== "gestao" && !(await termosPublicados())[numero])
      return res.status(403).send("Os termos deste ciclo ainda não foram publicados pela coordenação.");

    // o aluno leva só o registro dele; a orientação, o termo de orientação
    const tipo = papel === "aluno" ? "bolsista" : "orientador";
    const recortado = papel === "aluno"
      ? { ...p, alunos: (p.alunos || []).filter((a) => String(a.email || "").toLowerCase() === String(meu.email || "").toLowerCase()) }
      : p;

    const { gerarTermoCompromissoPdf } = await import("./lib/pdf.js");
    const buffer = await gerarTermoCompromissoPdf({
      edital: { ...EDITAL, numero }, projetos: [recortado], tipo,
      assinaturas: await assinaturasParaPdf(),
      perfis: await carregarPerfis(),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="termo-${tipo}-${slug(p.numero || numero)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no termo:", e);
    res.status(500).send("Erro ao gerar o termo: " + e.message);
  }
});


/* ---------------------- ICEM — Iniciação Científica EM -------------------
   OUTRO programa de bolsas, com outra lógica: o bolsista do Ensino Médio
   ACOMPANHA projetos de pesquisa (e pode trocar ao longo do ano), não
   pertence a eles. Quem conduz é a coordenação de pesquisa — a indicação é
   da PROPPEX, o aluno escolhe o projeto e o curso. Tudo aqui é da GESTÃO:
   bolsista de EM é menor de idade e não tem conta no portal.
   Chave interna própria (ic-em-v1): fora do /api/estado, como o resto. */
const EM_KEY = "ic-em-v1";
async function lerBolsistasEM() {
  const raw = await storage.get(EM_KEY);
  return raw ? JSON.parse(raw) : [];
}
/** O e-mail é a chave da conta do bolsista EM (decisão do dono, ago/2026):
 *  quem consta em algum registro do ICEM entra no setor e vê a guia dele. */
async function souBolsistaEM(email) {
  const alvo = String(email || "").trim().toLowerCase();
  if (!alvo) return false;
  return (await lerBolsistasEM()).some((b) => b.email === alvo);
}
const registrosEMDe = (lista, email) => {
  const alvo = String(email || "").trim().toLowerCase();
  return alvo ? (lista || []).filter((b) => b.email === alvo) : [];
};

/**
 * Aviso de movimentação à coordenação de pesquisa (pesquisa@uniego.edu.br,
 * env IC_NOTIFY_EMAIL) — fire-and-forget: e-mail que falha não trava
 * gravação nenhuma, e ato da própria gestão não gera aviso (quem fez já sabe).
 */
function avisarPesquisa(assunto, linhas, titulo) {
  (async () => {
    const { enviarEmail, emailMovimentacaoIC } = await import("./lib/mailer.js");
    await enviarEmail(emailMovimentacaoIC({ assunto, titulo, linhas }));
  })().catch((e) => console.error("Aviso IC não enviado:", e.message));
}

/**
 * Cobrança SEMANAL dos relatórios de IC (decisão do dono, ago/2026): da
 * abertura da janela (parcial: 4º mês; final: 10º) até o relatório ser
 * enviado E validado, o aluno é lembrado de enviar/corrigir e a orientação,
 * de validar. Uma mensagem por pessoa, com todos os itens dela; o registro
 * do último envio (sys-ic-cobranca-relatorios-v1) espaça por 7 dias, e a
 * varredura roda de hora em hora junto com a da Extensão — quem decide se
 * há o que mandar é o estado, não o relógio.
 */
const COBRANCA_IC_KEY = "sys-ic-cobranca-relatorios-v1";
/* Quem deve o quê nos relatórios da IC — a mesma conta serve à cobrança
   semanal automática e à CHAMADA manual da gestão (botão na guia
   Relatórios). Devolve um mapa e-mail → { nome, papel, itens }. */
function pendenciasCobrancaIC(projetos, { edital = null } = {}) {
  const porPessoa = new Map();
  const junta = (emailAlvo, nome, papel, item) => {
    const alvo = String(emailAlvo || "").trim().toLowerCase();
    if (!alvo) return;
    const atual = porPessoa.get(alvo) || { nome, papel, itens: [] };
    atual.itens.push(item);
    porPessoa.set(alvo, atual);
  };
  for (const p of projetos) {
    if (edital && (p.edital || EDITAL.numero) !== edital) continue;
    // projetos em execução — e os do ciclo em REGULARIZAÇÃO (concluídos com
    // a janela do final reaberta), que são exatamente os que precisam de
    // lembrete até entregarem
    if (p.status !== "aprovado" && !regularizacaoDe(p)) continue;
    for (const tipo of TIPOS_RELATORIO) {
      const jan = janelaRelatorio(p, tipo);
      if (!jan?.aberta) continue;
      for (const a of p.alunos || []) {
        const rel = (p.relatorios || []).find((x) => x.tipo === tipo && x.aluno && a.email
          && x.aluno.toLowerCase() === a.email.toLowerCase());
        if (rel?.situacao === "validado") continue;
        const base = { numero: p.numero, titulo: p.titulo, tipo, vence: jan.vence, atrasado: jan.vencida };
        if (!rel || rel.situacao === "devolvido") {
          junta(a.email, a.nome, "aluno", { ...base,
            situacao: rel ? "devolvido — corrija e reenvie" : "não enviado" });
          junta(p.orientador?.email, p.orientador?.nome, "orientador", { ...base,
            situacao: rel ? `devolvido a ${a.nome || "aluno"} para correção` : `${a.nome || "aluno"} ainda não enviou` });
        } else {
          junta(p.orientador?.email, p.orientador?.nome, "orientador", { ...base,
            situacao: `enviado por ${a.nome || rel.aluno} — aguarda a sua validação` });
        }
      }
    }
  }
  return porPessoa;
}

async function varrerCobrancaIC() {
  const porPessoa = pendenciasCobrancaIC(await lerProjetos());
  if (!porPessoa.size) return { enviadas: 0 };
  const registro = JSON.parse((await storage.get(COBRANCA_IC_KEY)) || "{}");
  const SETE_DIAS = 7 * 24 * 3600 * 1000;
  const { enviarEmail, emailCobrancaRelatorioIC } = await import("./lib/mailer.js");
  let enviadas = 0;
  for (const [emailAlvo, dados] of porPessoa) {
    const ultima = Date.parse(registro[emailAlvo] || "") || 0;
    if (Date.now() - ultima < SETE_DIAS) continue;
    try {
      await enviarEmail(emailCobrancaRelatorioIC({ para: emailAlvo, ...dados }));
      registro[emailAlvo] = new Date().toISOString();
      enviadas++;
    } catch (e) { console.error(`Cobrança IC não enviada a ${emailAlvo}:`, e.message); }
  }
  if (enviadas) await storage.set(COBRANCA_IC_KEY, JSON.stringify(registro));
  return { enviadas };
}

/* A CHAMADA manual dos relatórios da IC (gestão, botão na guia Relatórios):
   o mesmo e-mail da cobrança semanal, só que enviado AGORA e ciclo a ciclo
   — serve à regularização do 01/2025, em que esperar a próxima varredura é
   esperar à toa. `simular` devolve quem seria chamado; o envio carimba o
   registro da cobrança, para a varredura da hora seguinte não repetir. */
app.post("/api/ic/chamada-relatorio", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A chamada dos relatórios é da coordenação de pesquisa." });
  const edital = String(req.body?.edital || EDITAL.numero).trim();
  // a mensagem que a coordenação escreveu na janela de envio (opcional):
  // entra destacada no topo de cada e-mail, antes do texto padrão
  const mensagem = String(req.body?.mensagem || "").trim().slice(0, 2000);
  const porPessoa = pendenciasCobrancaIC(await lerProjetos(), { edital });
  const { enviarEmail, emailCobrancaRelatorioIC } = await import("./lib/mailer.js");
  if (req.body?.simular === true) {
    const primeiro = [...porPessoa.entries()][0];
    return res.json({ edital,
      chamar: [...porPessoa.entries()].map(([email, d]) =>
        ({ email, nome: d.nome || "", papel: d.papel, itens: d.itens.length })),
      // a prévia é o e-mail do primeiro da fila, como ele sairá — é o que a
      // janela de envio mostra antes da confirmação
      previewHtml: primeiro
        ? emailCobrancaRelatorioIC({ para: primeiro[0], ...primeiro[1], mensagem }).corpoHtml : "" });
  }
  const registro = JSON.parse((await storage.get(COBRANCA_IC_KEY)) || "{}");
  const falhas = [];
  let enviados = 0;
  for (const [emailAlvo, dados] of porPessoa) {
    try {
      await enviarEmail(emailCobrancaRelatorioIC({ para: emailAlvo, ...dados, mensagem }));
      registro[emailAlvo] = new Date().toISOString();
      enviados++;
    } catch (e) { falhas.push(`${dados.nome || emailAlvo}: ${e.message}`); }
  }
  if (enviados) await storage.set(COBRANCA_IC_KEY, JSON.stringify(registro));
  res.json({ ok: true, edital, enviados, falhas });
});

let filaEM = Promise.resolve();
function comBolsistasEM(fn) {
  const proxima = filaEM.then(async () => {
    const lista = await lerBolsistasEM();
    const r = await fn(lista);
    if (r?.gravar !== false) {
      await storage.set(EM_KEY, JSON.stringify(lista));
      await storage.flush?.();
    }
    return r;
  });
  filaEM = proxima.catch(() => {});
  return proxima;
}

app.get("/api/ic/em", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "O ICEM é conduzido pela coordenação de pesquisa." });
  const bolsistas = await lerBolsistasEM();
  res.json({
    bolsistas, turmas: TURMAS_EM, bolsas: BOLSAS_EM,
    cotas: Object.fromEntries(TURMAS_EM.map((t) => [t.ciclo, cotasDaTurma(bolsistas, t.ciclo)])),
    // o modelo do relatório do estudante — para a gestão ler as respostas e
    // pré-visualizar o formulário como o aluno o vê
    modeloRelatorio: {
      campos: CAMPOS_RELATORIO_EM,
      avaliacao: { escala: ESCALA_AVALIACAO_EM, criterios: CRITERIOS_AVALIACAO_EM, recomendacoes: RECOMENDACAO_EM },
    },
  });
});

/* ------------------- o setor pelos olhos do bolsista EM ------------------
   Decisão do dono (ago/2026): o bolsista do Ensino Médio passa a ter conta
   no portal — a chave é o E-MAIL do registro. Ele escolhe o curso e o
   projeto que vai acompanhar (e troca quando quiser) e entrega o relatório
   final por aqui; nas turmas encerradas, a entrega FORMALIZA a conclusão.
   A coordenação continua conduzindo: cada movimento avisa pesquisa@. */
app.get("/api/ic/em/meu", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const lista = await lerBolsistasEM();
  const meus = registrosEMDe(lista, u.email);
  if (!meus.length) return res.status(403).json({ error: "Nenhum registro do ICEM está ligado a este e-mail." });
  const projetos = await lerProjetos();
  const nomeCurso = (slug) => (CURSOS.find((c) => c.slug === slug) || {}).nome || slug || "";
  const podeEscolher = meus.some((b) => b.situacao === "ativo" && !turmaEmDe(b.turma)?.encerrada);
  res.json({
    registros: meus.map((b) => {
      const minha = turmaEmDe(b.turma) || { ciclo: b.turma };
      return {
        id: b.id, nome: b.nome, escola: b.escola, serie: b.serie,
        cursoInteresse: b.cursoInteresse, situacao: b.situacao,
        turma: minha,
        bolsa: bolsaEmDe(b.bolsa) || null,
        projetoAtual: projetoAtualEM(b), trajetoria: b.trajetoria,
        relatorios: b.relatorios, conint: b.conint,
        // a turma vigente entrega parcial e final; as antigas, só o final
        exigidos: relatoriosExigidos(minha),
      };
    }),
    camposRelatorio: CAMPOS_RELATORIO_EM,
    // o questionário de avaliação do programa, que vai junto do relatório
    avaliacaoModelo: { escala: ESCALA_AVALIACAO_EM, criterios: CRITERIOS_AVALIACAO_EM, recomendacoes: RECOMENDACAO_EM },
    cursosUniego: CURSOS.map((c) => c.nome),
    // o cardápio da escolha: os projetos EM EXECUÇÃO da graduação — título,
    // curso e orientação, nada além (o registro completo é do projeto)
    escolha: podeEscolher ? {
      projetos: projetos.filter((p) => p.status === "aprovado")
        .map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo,
          curso: nomeCurso(p.curso), orientador: p.orientador?.nome || "" }))
        .sort((a, b) => a.curso.localeCompare(b.curso, "pt-BR") || a.titulo.localeCompare(b.titulo, "pt-BR")),
    } : null,
  });
});

/* O bolsista escolhe (ou troca) o projeto que acompanha — só na turma
   vigente e com a situação ativa. A trajetória nunca se apaga. */
app.post("/api/ic/em/meu/projeto", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const alvoId = String(req.body?.projetoId || "").trim();
  if (!alvoId) return res.status(400).json({ error: "Escolha o projeto que você quer acompanhar." });
  const alvo = (await lerProjetos()).find((p) => p.id === alvoId);
  if (!alvo) return res.status(404).json({ error: "Projeto não encontrado" });
  if (alvo.status !== "aprovado") return res.status(400).json({ error: "Este projeto não está em execução." });
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === String(req.body?.id || "")
      && x.email === String(u.email).toLowerCase());
    if (i < 0) return { erro: [404, "Registro do ICEM não encontrado para a sua conta"], gravar: false };
    const b = lista[i];
    if (turmaEmDe(b.turma)?.encerrada) return { erro: [400, "A sua turma já encerrou — a trajetória fica como está."], gravar: false };
    if (b.situacao !== "ativo") return { erro: [400, "O seu registro não está ativo — fale com a coordenação de pesquisa."], gravar: false };
    if (projetoAtualEM(b)?.projetoId === alvo.id) return { erro: [400, "Você já acompanha este projeto."], gravar: false };
    let novo = trocarProjeto(b, { projetoId: alvo.id, numero: alvo.numero,
      titulo: alvo.titulo, orientador: alvo.orientador?.nome || "" });
    novo = anotarEM(novo, { quem: u.email, oQue: `escolheu acompanhar ${alvo.numero || alvo.titulo}` });
    lista[i] = novo;
    return { bolsista: novo };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  avisarPesquisa(`ICEM: ${r.bolsista.nome} escolheu um projeto`, [
    ["Bolsista", `${r.bolsista.nome} (turma ${r.bolsista.turma})`],
    ["Projeto", `${alvo.numero || ""} ${alvo.titulo}`.trim()],
    ["Orientação", alvo.orientador?.nome || "—"],
  ], "Bolsista do Ensino Médio escolheu o projeto que vai acompanhar");
  res.json({ ok: true, bolsista: r.bolsista });
});

/* O relatório do bolsista EM (parcial e final na turma vigente; só o FINAL
   nas antigas, onde a entrega formaliza a conclusão). Três campos: as
   atividades da vigência, a motivação para a carreira acadêmica e o curso
   do UNIEGO pretendido. Quem valida é a PROPPEX — não a orientação. */
app.post("/api/ic/em/meu/relatorio", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const b = req.body || {};
  const tipo = String(b.tipo || "final");
  if (!RELATORIOS_EM.includes(tipo)) return res.status(400).json({ error: "Tipo de relatório inválido" });
  const atividades = String(b.atividades || "").trim();
  const motivacao = String(b.motivacao || "").trim();
  const cursoPretendido = String(b.cursoPretendido || "").trim();
  const cursoOutro = String(b.cursoOutro || "").trim();
  if (atividades.length < 50)
    return res.status(400).json({ error: "Descreva as atividades realizadas na vigência da sua bolsa (pelo menos 50 caracteres)." });
  if (motivacao.length < 20)
    return res.status(400).json({ error: "Conte se a participação te motivou a seguir carreira acadêmica, cursar uma faculdade, ser um cientista." });
  if (!cursoPretendido && !cursoOutro)
    return res.status(400).json({ error: "Diga em qual curso do UNIEGO você pretende ingressar — ou escreva o curso, se o UNIEGO ainda não o tiver." });
  // o questionário de avaliação do programa vai junto do relatório e é
  // obrigatório: as 7 perguntas (o zero é "não se aplica") + a recomendação
  const avaliacao = {
    criterios: Object.fromEntries(CRITERIOS_AVALIACAO_EM
      .map((c) => [c.codigo, Number(b.avaliacao?.criterios?.[c.codigo])])
      .filter(([, v]) => Number.isInteger(v) && v >= 0 && v <= 5)),
    aprendizado: String(b.avaliacao?.aprendizado || "").trim().slice(0, 2000),
    recomendaria: String(b.avaliacao?.recomendaria || "").trim(),
    sugestoes: String(b.avaliacao?.sugestoes || "").trim().slice(0, 2000),
  };
  if (!avaliacaoEMCompleta(avaliacao))
    return res.status(400).json({ error: "Responda o questionário de avaliação do programa: as 7 perguntas (0 a 5 — o 0 é \"não se aplica\") e se você recomendaria a Iniciação Científica Júnior." });

  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === String(b.id || "")
      && x.email === String(u.email).toLowerCase());
    if (i < 0) return { erro: [404, "Registro do ICEM não encontrado para a sua conta"], gravar: false };
    const reg = lista[i];
    if (reg.situacao === "desligado") return { erro: [400, "Registro desligado — fale com a coordenação de pesquisa."], gravar: false };
    if (!relatoriosExigidos(turmaEmDe(reg.turma)).includes(tipo))
      return { erro: [400, "A sua turma entrega apenas o relatório final."], gravar: false };
    const atual = reg.relatorios?.[tipo] || {};
    if (atual.situacao === "validado")
      return { erro: [400, "Este relatório já foi validado pela PROPPEX — não precisa reenviar."], gravar: false };
    lista[i] = anotarEM({ ...reg, relatorios: { ...reg.relatorios, [tipo]: {
      ...atual, situacao: "entregue", em: new Date().toISOString(),
      atividades: atividades.slice(0, 8000), motivacao: motivacao.slice(0, 4000),
      cursoPretendido: cursoPretendido.slice(0, 80), cursoOutro: cursoOutro.slice(0, 120),
      avaliacao, porAluno: true,
    } } }, { quem: u.email, oQue: `entregou o relatório ${tipo} pelo portal` });
    return { bolsista: lista[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  avisarPesquisa(`ICEM: relatório ${tipo} de ${r.bolsista.nome}`, [
    ["Bolsista", `${r.bolsista.nome} (turma ${r.bolsista.turma})`],
    ["Situação", `Relatório ${tipo} entregue pelo portal — aguarda a validação da PROPPEX`],
    ["Curso pretendido", cursoOutro ? `${cursoOutro} (o UNIEGO ainda não tem)` : cursoPretendido],
  ], "Relatório do ICEM entregue");
  res.json({ ok: true, bolsista: r.bolsista });
});

/* A validação do relatório do EM é da PROPPEX (decisão do dono, ago/2026):
   o bolsista acompanha projetos — não há orientador responsável por ele. */
app.post("/api/ic/em/:id/relatorio/validar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A validação do relatório do ICEM é da coordenação de pesquisa." });
  const tipo = String(req.body?.tipo || "final");
  const decisao = String(req.body?.decisao || "");
  const comentario = String(req.body?.comentario || "").trim().slice(0, 1000);
  if (!RELATORIOS_EM.includes(tipo)) return res.status(400).json({ error: "Tipo de relatório inválido" });
  if (!["validado", "devolvido"].includes(decisao)) return res.status(400).json({ error: "Decisão inválida" });
  if (decisao === "devolvido" && comentario.length < 10)
    return res.status(400).json({ error: "Diga o que o bolsista precisa corrigir." });
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    const reg = lista[i];
    const atual = reg.relatorios?.[tipo] || {};
    if (atual.situacao !== "entregue" && decisao === "validado")
      return { erro: [400, "Só se valida relatório entregue."], gravar: false };
    lista[i] = anotarEM({ ...reg, relatorios: { ...reg.relatorios, [tipo]: {
      ...atual, situacao: decisao, comentario,
      validadoPor: u.email, validadoEm: new Date().toISOString(),
    } } }, { quem: u.email, oQue: `${decisao === "validado" ? "validou" : "devolveu"} o relatório ${tipo}` });
    return { bolsista: lista[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* A CHAMADA de preenchimento dos relatórios (gestão, botão na guia): vai a
   TODO bolsista da turma com relatório exigido ainda não validado — sem o
   filtro de "já convidado" do convite. `simular` devolve a lista. */
app.post("/api/ic/em/chamada-relatorio", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A chamada dos relatórios é da coordenação de pesquisa." });
  const turma = turmaEmDe(String(req.body?.turma || "")) || turmaEmVigente();
  const tipos = relatoriosExigidos(turma);
  const mensagem = String(req.body?.mensagem || "").trim().slice(0, 2000);
  const alvos = (await lerBolsistasEM()).filter((b) => b.turma === turma.ciclo
    && b.situacao !== "desligado" && b.compareceu !== false
    && tipos.some((t) => b.relatorios?.[t]?.situacao !== "validado"));
  const semEmail = alvos.filter((b) => !b.email).map((b) => b.nome);
  const comEmail = alvos.filter((b) => b.email);
  const { enviarEmail, emailChamadaRelatorioEM } = await import("./lib/mailer.js");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  if (req.body?.simular === true) {
    return res.json({ turma: turma.ciclo, tipos,
      chamar: comEmail.map((b) => ({ nome: b.nome, email: b.email })), semEmail,
      previewHtml: comEmail.length
        ? emailChamadaRelatorioEM(comEmail[0], turma, { baseUrl,
            tipos: tipos.filter((t) => comEmail[0].relatorios?.[t]?.situacao !== "validado"), mensagem }).corpoHtml
        : "" });
  }
  const falhas = [];
  for (const b of comEmail) {
    const meusTipos = tipos.filter((t) => b.relatorios?.[t]?.situacao !== "validado");
    try { await enviarEmail(emailChamadaRelatorioEM(b, turma, { baseUrl, tipos: meusTipos, mensagem })); }
    catch (e) { falhas.push(`${b.nome}: ${e.message}`); }
  }
  res.json({ ok: true, turma: turma.ciclo, enviados: comEmail.length - falhas.length, falhas, semEmail });
});

/* O RESULTADO do processo seletivo do ICEM, nas mesmas duas fases da
   graduação (decisão do dono, ago/2026): até a publicação, o gerador é
   prévia de trabalho — só a gestão baixa, escolhendo a fase; publicado,
   qualquer pessoa do setor baixa exatamente a fase publicada. Turma com o
   PDF arquivado redireciona para o documento da época, sempre aberto. */
app.get("/api/ic/em/resultado.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    // edital informado e desconhecido é ERRO, não a turma vigente (achado de
    // ago/2026: um typo servia o resultado de outra turma em silêncio)
    const numeroPedido = String(req.query.edital || "").trim();
    const turma = numeroPedido
      ? TURMAS_EM.find((t) => t.edital === numeroPedido)
      : (turmaEmDe(String(req.query.turma || "")) || turmaEmVigente());
    if (!turma) return res.status(404).send(`Edital ${numeroPedido} não encontrado no ICEM.`);
    if (turma.resultado) return res.redirect(turma.resultado);
    const pub = (await resultadosPublicadosEM())[turma.edital];
    if (!gereIC(u) && !pub)
      return res.status(403).send("O resultado deste edital ainda não foi publicado pela PROPPEX.");
    const fase = gereIC(u)
      ? (["preliminar", "final"].includes(req.query.fase) ? req.query.fase : (pub?.fase || "final"))
      : (pub.fase || "final");
    const bolsistas = (await lerBolsistasEM()).filter((b) => b.turma === turma.ciclo);
    const { gerarResultadoEMPdf } = await import("./lib/pdf.js");
    const buffer = await gerarResultadoEMPdf({ turma, bolsistas, emitidoPor: u.email, fase });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resultado-edital-${slug(turma.edital)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF do resultado do ICEM:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

/* Publicar (ou recolher) o resultado do ICEM — só a gestão, com as mesmas
   duas fases da graduação. fase: null recolhe; a data de cada fase fica em
   `desde`, para republicar não reiniciar relógio nenhum. */
app.post("/api/ic/em/resultado/publicar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Só a coordenação publica o resultado" });
  // num ato de PUBLICAÇÃO, edital desconhecido jamais cai na turma vigente
  const numeroPedido = String(req.body?.edital || "").trim();
  const turma = numeroPedido ? TURMAS_EM.find((t) => t.edital === numeroPedido) : turmaEmVigente();
  if (!turma) return res.status(400).json({ error: `Edital ${numeroPedido} não encontrado no ICEM.` });
  if (turma.resultado)
    return res.status(400).json({ error: "Esta turma tem o PDF do resultado arquivado — ele já está sempre publicado." });
  const fase = req.body?.fase ?? null;
  if (fase !== null && !["preliminar", "final"].includes(fase))
    return res.status(400).json({ error: "Fase inválida: preliminar, final ou null para recolher" });
  const pub = await resultadosPublicadosEM();
  if (fase) {
    const agora = new Date().toISOString();
    const antes = pub[turma.edital] || {};
    pub[turma.edital] = {
      fase, em: agora, por: u.email,
      desde: { ...(antes.desde || {}), [fase]: antes.desde?.[fase] || agora },
    };
  } else delete pub[turma.edital];
  await storage.set(RESULTADO_EM_PUB_KEY, JSON.stringify(pub));
  await storage.flush?.();
  console.log(`[ic-em] resultado ${turma.edital} ${fase ? `publicado (${fase})` : "recolhido"} por ${u.email}`);
  res.json({ ok: true, edital: turma.edital, fase });
});

/* O convite por e-mail, turma a turma (gestão): criar o usuário e — turma
   vigente — escolher o projeto; encerrada — entregar o relatório final.
   `simular` devolve a lista sem enviar; reenvio só com `reenviar: true`. */
app.post("/api/ic/em/convidar", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "O convite é da coordenação de pesquisa." });
  const turma = turmaEmDe(String(req.body?.turma || "")) || turmaEmVigente();
  const CONVITES_EM = "sys-ic-em-convites-v1";
  const mensagem = String(req.body?.mensagem || "").trim().slice(0, 2000);
  const enviados = JSON.parse((await storage.get(CONVITES_EM)) || "{}");
  const todos = (await lerBolsistasEM()).filter((b) => b.turma === turma.ciclo
    && b.situacao !== "desligado" && b.compareceu !== false);
  const semEmail = todos.filter((b) => !b.email).map((b) => b.nome);
  // o registro do convite é POR TURMA (achado de ago/2026): o veterano que
  // entra numa turma nova recebe o convite dela — o registro antigo é de
  // OUTRO convite, com outro conteúdo
  const jaDesta = (b) => enviados[b.email] && enviados[b.email].turma === turma.ciclo;
  const alvos = todos.filter((b) => b.email && (req.body?.reenviar === true || !jaDesta(b)));
  const { enviarEmail, emailConviteEM } = await import("./lib/mailer.js");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  if (req.body?.simular === true) {
    const amostra = alvos[0] || todos.find((b) => b.email);
    return res.json({ turma: turma.ciclo, convidar: alvos.map((b) => ({ nome: b.nome, email: b.email })),
      jaConvidados: todos.filter((b) => b.email && jaDesta(b)).length, semEmail,
      previewHtml: amostra ? emailConviteEM(amostra, turma, { baseUrl, mensagem }).corpoHtml : "" });
  }
  const falhas = [];
  for (const b of alvos) {
    try {
      await enviarEmail(emailConviteEM(b, turma, { baseUrl, mensagem }));
      enviados[b.email] = { em: new Date().toISOString(), turma: turma.ciclo };
    } catch (e) { falhas.push(`${b.nome}: ${e.message}`); }
  }
  await storage.set(CONVITES_EM, JSON.stringify(enviados));
  res.json({ ok: true, turma: turma.ciclo, enviados: alvos.length - falhas.length, falhas, semEmail });
});

/* Cria ou edita um bolsista — o cadastro é digitado pela gestão (o termo e
   o formulário são a fonte; menor de idade não preenche o próprio portal). */
app.post("/api/ic/em", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "O ICEM é conduzido pela coordenação de pesquisa." });
  const b = req.body || {};
  const r = await comBolsistasEM((lista) => {
    const i = b.id ? lista.findIndex((x) => x.id === b.id) : -1;
    if (b.id && i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    const base = i >= 0 ? lista[i] : null;
    let novo = normalizarBolsistaEM(b, { base });
    if (!novo.id) novo.id = "em_" + crypto.randomUUID().slice(0, 12);
    if (!novo.nome) return { erro: [400, "Informe o nome do bolsista"], gravar: false };
    // trajetória, histórico, RELATÓRIOS e CONINT não passam pelo formulário:
    // têm rotas próprias (achado de ago/2026: uma edição de cadastro sem o
    // round-trip completo apagava o relatório entregue pelo aluno — com o
    // questionário — em silêncio)
    if (base) {
      novo.trajetoria = base.trajetoria; novo.historico = base.historico;
      novo.relatorios = base.relatorios; novo.conint = base.conint;
    }
    novo = anotarEM(novo, { quem: u.email, oQue: base ? "editou o cadastro" : "incluiu o bolsista" });
    if (i >= 0) lista[i] = novo; else lista.push(novo);
    return { bolsista: novo };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* A troca de projeto: fecha o trecho aberto e abre o novo. `projetoId`
   vazio só encerra (o aluno saiu de um projeto e ainda não escolheu outro). */
app.post("/api/ic/em/:id/projeto", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A troca de projeto é feita pela coordenação." });
  const alvoId = String(req.body?.projetoId || "").trim();
  let alvo = null;
  if (alvoId) {
    alvo = (await lerProjetos()).find((p) => p.id === alvoId);
    if (!alvo) return res.status(404).json({ error: "Projeto não encontrado" });
  }
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    let b = trocarProjeto(lista[i], alvo ? {
      projetoId: alvo.id, numero: alvo.numero, titulo: alvo.titulo,
      orientador: alvo.orientador?.nome || "",
    } : null);
    b = anotarEM(b, { quem: u.email, oQue: alvo
      ? `passou a acompanhar ${alvo.numero || alvo.titulo}`
      : "encerrou o acompanhamento atual" });
    lista[i] = b;
    return { bolsista: b };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* A bolsa (12 CNPq + 12 UNIEGO por turma): a cota trava a atribuição além
   do teto — remanejar é tirar de um para dar a outro, como na graduação. */
app.post("/api/ic/em/:id/bolsa", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A bolsa é atribuída pela coordenação." });
  const bolsa = String(req.body?.bolsa || "").trim();
  if (bolsa && !bolsaEmDe(bolsa)) return res.status(400).json({ error: "Tipo de bolsa desconhecido" });
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    if (bolsa) {
      const tipo = bolsaEmDe(bolsa);
      const usadas = lista.filter((x) => x.turma === lista[i].turma && x.id !== lista[i].id
        && x.situacao !== "desligado" && x.bolsa === bolsa).length;
      if (tipo.cota != null && usadas >= tipo.cota) {
        return { erro: [400, `A cota de ${tipo.nome} (${tipo.cota}) está completa — desfaça uma atribuição para remanejar.`], gravar: false };
      }
    }
    lista[i] = anotarEM({ ...lista[i], bolsa }, { quem: u.email,
      oQue: bolsa ? `atribuiu ${bolsaEmDe(bolsa).nome}` : "desfez a bolsa" });
    return { bolsista: lista[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* Entrega registrada À MÃO pela gestão (relatório que chegou em papel) e a
   reabertura — o CONINT segue na rota própria. */
app.post("/api/ic/em/:id/relatorio", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Registro da coordenação." });
  const tipo = RELATORIOS_EM.includes(String(req.body?.tipo || "")) ? String(req.body.tipo) : "final";
  const situacao = req.body?.situacao === "entregue" ? "entregue" : "pendente";
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    const atual = lista[i].relatorios?.[tipo] || {};
    lista[i] = anotarEM({ ...lista[i], relatorios: { ...lista[i].relatorios, [tipo]: {
      ...atual, situacao, em: situacao === "entregue" ? new Date().toISOString() : "",
      porAluno: situacao === "entregue" ? atual.porAluno === true : false,
      obs: String(req.body?.obs || "").trim().slice(0, 500),
    } } }, { quem: u.email, oQue: situacao === "entregue"
      ? `registrou a entrega do relatório ${tipo}` : `reabriu o relatório ${tipo}` });
    return { bolsista: lista[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* A planilha dos bolsistas do EM — a turma inteira ou UM bolsista
   (?bolsista=), para o pedido de pagamento; só a coordenação. */
app.get("/api/ic/em/bolsistas.xlsx", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Somente a coordenação de pesquisa exporta os bolsistas do EM.");
    const turma = turmaEmDe(String(req.query.turma || "")) || turmaEmVigente();
    const alvo = String(req.query.bolsista || "").trim().toLowerCase();
    const lista = (await lerBolsistasEM()).filter((b) => b.turma === turma.ciclo
      && (!alvo || b.id === alvo || b.email === alvo || soDigitos(b.cpf) === soDigitos(alvo)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bolsistas EM");
    ws.columns = [
      { header: "Turma", key: "turma", width: 12 },
      { header: "Bolsa", key: "bolsa", width: 22 },
      { header: "Nome Completo", key: "nome", width: 34 },
      { header: "CPF", key: "cpf", width: 16 },
      { header: "RG", key: "rg", width: 14 },
      { header: "Escola", key: "escola", width: 26 },
      { header: "Série", key: "serie", width: 10 },
      { header: "Telefone", key: "telefone", width: 16 },
      { header: "E-mail", key: "email", width: 30 },
      { header: "Curso de interesse", key: "curso", width: 20 },
      { header: "Responsável", key: "respNome", width: 30 },
      { header: "CPF do Responsável", key: "respCpf", width: 16 },
      { header: "Banco", key: "banco", width: 18 },
      { header: "Agência", key: "agencia", width: 10 },
      { header: "Conta", key: "conta", width: 16 },
      { header: "Pix", key: "pix", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const b of lista) {
      ws.addRow({
        turma: b.turma, bolsa: bolsaEmDe(b.bolsa)?.nome || (b.bolsa || "—"),
        nome: b.nome, cpf: formatarCpf(b.cpf) || "", rg: b.rg || "",
        escola: b.escola || "", serie: b.serie || "", telefone: b.telefone || "",
        email: b.email || "", curso: b.cursoInteresse || "",
        respNome: b.responsavel?.nome || "", respCpf: formatarCpf(b.responsavel?.cpf) || "",
        banco: b.banco || "", agencia: b.agencia || "", conta: b.conta || "", pix: b.pix || "",
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bolsistas-em-${slug(turma.ciclo)}${alvo ? "-" + slug(alvo.split("@")[0]) : ""}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("Erro na planilha dos bolsistas EM:", e);
    res.status(500).send("Erro ao gerar a planilha: " + e.message);
  }
});

app.post("/api/ic/em/:id/conint", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "Registro da coordenação." });
  const participou = req.body?.participou === true;
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    lista[i] = anotarEM({ ...lista[i], conint: { participou, ano: String(req.body?.ano || "").trim().slice(0, 10) } },
      { quem: u.email, oQue: participou ? "registrou a participação no CONINT" : "desfez o registro do CONINT" });
    return { bolsista: lista[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
});

/* Os termos de compromisso da turma, com o Anexo 01 (autorização do
   responsável) na página seguinte de cada um. */
app.get("/api/ic/em/termos.pdf", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Os termos do ICEM são emitidos pela coordenação.");
    const turma = turmaEmDe(String(req.query.turma || "")) || turmaEmVigente();
    const bolsistas = (await lerBolsistasEM())
      .filter((b) => b.turma === turma.ciclo && b.situacao !== "desligado")
      .sort((a, b) => (a.colocacao ?? 999) - (b.colocacao ?? 999) || a.nome.localeCompare(b.nome, "pt-BR"));
    const { gerarTermosEMPdf } = await import("./lib/pdf.js");
    const buffer = await gerarTermosEMPdf({
      turma, bolsistas, assinaturas: await assinaturasParaPdf(), emitidoPor: u.nome || u.email,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="termos-icem-${slug(turma.ciclo)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro nos termos do ICEM:", e);
    res.status(500).send("Erro ao gerar os termos: " + e.message);
  }
});

app.get("/api/ic/:id", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = await quemOlha(req, u);
  const p = (await lerProjetos()).find((x) => x.id === req.params.id);
  if (!p || !podeVerProjeto(meu, p)) return res.status(404).json({ error: "Projeto não encontrado" });
  res.json({
    // a janela dos relatórios vai junto: é ela que diz à tela quando cada
    // formulário abre (o servidor recusa fora dela de todo jeito)
    projeto: papelNoProjeto(meu, p) === "avaliador"
      ? visaoDoProjeto(p, meu)
      : { ...visaoDoProjeto(p, meu), prazoRelatorios: prazosRelatorios(p) },
    papel: papelNoProjeto(meu, p),
    podeEditar: podeEditarProjeto(meu, p), podeGerir: podeGerirExecucao(meu, p),
    podeAvaliar: podeAvaliar(meu, p), podeEnviar: podeEnviarRelatorio(meu, p),
    podeValidar: podeValidarRelatorio(meu, p),
    podeDesignar: podeDesignarAvaliador(meu, p), podeDarParecer: podeDarParecer(meu, p),
    // ato de gestão sobre proposta em que ele mesmo é parte: a tela diz isso
    // em vez de esconder os botões (a trava anterior travava o edital)
    proprioProjeto: decidindoOProprio(meu, p),
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
          // corpo sem a lista NÃO apaga a lista (achado de ago/2026: um POST
          // sem `alunos` zerava os alunos — e com eles o cadastro que o
          // próprio aluno digitou); a mesma regra do `producao` abaixo
          alunos: b.alunos ?? base.alunos, cronograma: b.cronograma ?? base.cronograma,
          producao: b.producao ?? base.producao,
          grupoPesquisa: b.grupoPesquisa ?? base.grupoPesquisa,
        }, { base, autor: u.email, grupos: conhecidos });
        // Depois da aprovação, o quadro de alunos só CRESCE pela tela da
        // orientação (decisão do dono, ago/2026): remover aluno — ou trocar
        // o e-mail de quem já foi indicado, que é a mesma coisa — é ato da
        // Substituição de bolsista, que a coordenação aprova; e a marca de
        // bolsista acompanha a concessão do fomento, não a caixa do
        // formulário. Este ramo só roda para a orientação (a gestão edita
        // pelo ramo de baixo, com a mão livre de sempre).
        const chaveAluno = (a) => (a.email
          ? "e:" + String(a.email).toLowerCase()
          : "n:" + String(a.nome || "").trim().toLowerCase());
        const antigos = new Map((base.alunos || []).map((a) => [chaveAluno(a), a]));
        for (const a of base.alunos || []) {
          if (!p.alunos.some((x) => chaveAluno(x) === chaveAluno(a)))
            return { erro: [400, `${a.nome || a.email || "Aluno indicado"} não pode ser removido (nem ter o e-mail trocado) por aqui: para trocar o bolsista, use a Substituição de bolsista; para corrigir um e-mail, fale com a PROPPEX.`], gravar: false };
        }
        // Documentos e conta bancária são DO ALUNO: ele mesmo informa, pela
        // rota própria. O formulário da orientação nunca os altera — nem os
        // apaga sem querer ao salvar a indicação (ela não recebe os valores).
        const doBase = (email) => (base.alunos || []).find((a) => a.email && a.email === email);
        p.alunos = p.alunos.map((a) => {
          const antes = antigos.get(chaveAluno(a));
          if (!antes) {
            // aluno novo: a marca de bolsista sai da concessão, não da tela
            return { ...a, bolsista: !!(base.fomento && base.fomento.tipo !== "voluntario") };
          }
          const dele = { bolsista: !!antes.bolsista };
          for (const c of CAMPOS_DO_ALUNO_PROTEGIDOS) dele[c] = antes[c];
          return { ...a, ...dele };
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
      // o mesmo cuidado da execução: o formulário da orientação (ou da
      // coordenação, na inclusão manual) não escreve nem apaga o que é do
      // aluno — RG, endereço, vínculo e conta são dele
      if (base) {
        const doBase = (email) => (base.alunos || []).find((a) => a.email && a.email === email);
        projeto.alunos = (projeto.alunos || []).map((a) => {
          const antes = doBase(a.email);
          if (!antes) return a;
          const dele = {};
          for (const c of CAMPOS_DO_ALUNO_PROTEGIDOS) dele[c] = antes[c];
          return { ...a, ...dele };
        });
      }
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
      // aluno recém-indicado: o convite por e-mail é o que abre o sistema
      // para ele — sem isso ele não sabe que precisa se cadastrar
      const jaEstava = (email) => (base?.alunos || []).some((a) => a.email && a.email === email);
      const novos = ["aprovado", "concluido"].includes(projeto.status)
        ? (projeto.alunos || []).filter((a) => a.email && !jaEstava(a.email)) : [];
      return { projeto, convidar: novos };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (r.convidar?.length) {
      convidarAlunosIC(r.projeto, r.convidar);   // sem await: e-mail não trava a gravação
      if (!quemIC(u).gestao) avisarPesquisa(`Aluno indicado — ${r.projeto.numero || ""}`, [
        ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
        ["Orientação", r.projeto.orientador?.nome || u.email],
        ["Indicado(s)", r.convidar.map((a) => a.nome).filter(Boolean).join(", ")],
      ], "Aluno indicado num projeto em execução");
    }
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
          <p><b>Próximo passo:</b> entre no ARCHÉ com este e-mail (${a.email}) e crie o seu usuário.
            Na guia <b>Projetos</b> você acompanha os projetos em que está vinculado(a); na guia
            <b>Bolsa</b> preenche o cadastro que a PROPPEX usa para efetivar o pagamento.</p>
          ${a.bolsista ? `<p style="background:#fff7e6;border-radius:10px;padding:12px 16px">
            <b>Tenha à mão para o cadastro:</b> CPF, RG, data de nascimento, endereço completo,
            telefone (WhatsApp), se você tem vínculo empregatício e os dados da <b>sua</b> conta
            bancária — banco, agência, conta corrente e a chave Pix vinculada a ela.</p>` : ""}
          <p>É no ARCHÉ também que ficam o seu cronograma e a entrega dos relatórios parcial e final.</p>
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
 * O cadastro que o PRÓPRIO aluno informa depois de indicado — documentos,
 * endereço, vínculo empregatício, conta bancária e Pix, que é o que a PROPPEX
 * precisa para efetivar a bolsa. Só o aluno do registro grava; a orientação
 * nem os enxerga (alunosVisiveis).
 *
 * O cadastro é DA PESSOA, não do projeto: quem participa de mais de um
 * projeto preenche uma vez só, e a gravação alcança todos os registros dele.
 * Pedir o mesmo RG duas vezes só criaria divergência entre as fichas.
 */
const CAMPOS_DO_ALUNO = {
  telefone: 30, rg: 30, endereco: 200, vinculoOnde: 120,
  banco: 60, agencia: 20, conta: 30, pix: 120,
};
/* O que só o aluno escreve. O formulário da orientação não os recebe (ver
   alunosVisiveis) — se o salvamento dela os copiasse do que veio da tela,
   apagaria o RG e a conta de quem já preencheu. O telefone fica de fora de
   propósito: é o contato que a própria orientação indicou. */
const CAMPOS_DO_ALUNO_PROTEGIDOS = ["cpf", "rg", "nascimento", "endereco",
  "vinculo", "vinculoOnde", "banco", "agencia", "conta", "pix"];
function aplicarCadastroDoAluno(aluno, b, cpf) {
  const saida = { ...aluno };
  if (cpf) saida.cpf = cpf;
  // o nome quem corrige é o dono dele — a indicação é digitada pelo professor
  // e sai errada com frequência —, mas nome em branco não apaga o que existe:
  // é a chave que reúne os certificados dos ciclos antigos
  if (String(b.nome || "").trim()) saida.nome = String(b.nome).trim().slice(0, 120);
  for (const [campo, max] of Object.entries(CAMPOS_DO_ALUNO)) {
    if (b[campo] === undefined) continue;
    saida[campo] = String(b[campo] ?? "").trim().slice(0, max);
  }
  if (b.nascimento !== undefined) saida.nascimento = String(b.nascimento || "").slice(0, 10);
  if (b.vinculo !== undefined) saida.vinculo = ["sim", "nao"].includes(String(b.vinculo)) ? String(b.vinculo) : "";
  // "não tenho vínculo" não guarda empregador — o campo some junto
  if (saida.vinculo !== "sim") saida.vinculoOnde = "";
  return saida;
}

async function gravarCadastroDoAluno(u, b, res) {
  const cpf = normalizarCpf(b.cpf);
  if (String(b.cpf || "").trim() && !cpf) {
    res.status(400).json({ error: "CPF inválido — confira os 11 dígitos." });
    return null;
  }
  const eu = String(u.email || "").toLowerCase();
  const r = await comProjetos((projetos) => {
    let tocados = 0;
    for (let i = 0; i < projetos.length; i++) {
      const p = projetos[i];
      const idx = (p.alunos || []).findIndex((a) => a.email && String(a.email).toLowerCase() === eu);
      if (idx < 0) continue;
      const alunos = p.alunos.slice();
      alunos[idx] = aplicarCadastroDoAluno(alunos[idx], b, cpf);
      projetos[i] = anotarProjeto(normalizarProjeto({ ...p, alunos }, { base: p }),
        { quem: u.email, oQue: "completou o próprio cadastro para o contrato da bolsa" });
      tocados += 1;
    }
    if (!tocados) return { erro: [403, "Só o próprio aluno indicado preenche os seus dados"], gravar: false };
    return { tocados };
  });
  if (r.erro) { res.status(r.erro[0]).json({ error: r.erro[1] }); return null; }
  return r;
}

/** O cadastro pela guia Bolsa: uma vez, valendo para todos os projetos. */
app.post("/api/ic/meus-dados", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const r = await gravarCadastroDoAluno(u, req.body || {}, res);
  if (!r) return;
  const projetos = (await lerProjetos()).filter((p) => podeVerProjeto(quemIC(u), p));
  res.json({ ok: true, projetos: r.tocados, lista: projetos.map((p) => verProjeto(u, p)) });
});

/** O mesmo cadastro, pela ficha do projeto (a tela de sempre). */
app.post("/api/ic/:id/meus-dados", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const r = await gravarCadastroDoAluno(u, req.body || {}, res);
  if (!r) return;
  const p = (await lerProjetos()).find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Projeto não encontrado" });
  res.json({ ok: true, projeto: verProjeto(u, p) });
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
  if (!meu.gestao) avisarPesquisa(`Substituição de bolsista pedida — ${r.projeto.numero || ""}`, [
    ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
    ["Orientação", r.projeto.orientador?.nome || u.email],
    ["Pedido", `sai ${String(b.saiNome || b.saiEmail || "")}, entra ${String(novo.nome || "")}`],
  ], "Pedido de substituição de bolsista aguarda decisão");
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
      // o casamento espelha o do PEDIDO (e-mail OU nome — achado de ago/2026:
      // exigir os dois deixava o substituído no projeto se ele corrigisse o
      // próprio nome entre o pedido e a decisão); e-mail, quando há, decide
      alunos = alunos.filter((a) => !(a.bolsista && (pedido.sai.email
        ? a.email === pedido.sai.email
        : a.nome === pedido.sai.nome)));
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
  if (!meu.gestao) avisarPesquisa(`Projeto submetido: ${r.projeto.numero || "(sem nº)"}`, [
    ["Protocolo", r.projeto.numero || "—"],
    ["Título", r.projeto.titulo || ""],
    ["Orientação", r.projeto.orientador?.nome || u.email],
    ["Edital", r.projeto.edital || ""],
    ["Curso", r.projeto.curso || ""],
  ], "Novo projeto submetido à avaliação da PROPPEX");
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
    // o gestor geral decide a própria proposta (o mérito é do parecer ad hoc),
    // e isso fica dito no registro e no histórico — é o que sustenta o ato
    const proprio = decidindoOProprio(meu, projetos[i]);
    projetos[i] = anotarProjeto({
      ...projetos[i], status: decisao,
      // reprovado ou devolvido, a concessão de bolsa morre junto com a decisão
      fomento: decisao === "aprovado" ? projetos[i].fomento : null,
      avaliacao: {
        decisao, parecer, por: u.email, em: new Date().toISOString(),
        ...(proprio ? { proprioProjeto: true } : {}),
      },
      atualizadoEm: new Date().toISOString(),
    }, {
      quem: u.email,
      oQue: `avaliou: ${decisao}${proprio ? " (decisão do gestor geral sobre proposta própria; mérito julgado por parecer ad hoc)" : ""}`,
    });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/**
 * Contestação da nota (item do edital): quem submeteu discorda do resultado e
 * pede revisão formal. Vale entre o resultado PRELIMINAR e o FINAL — é para
 * isso que os dois existem —, com prazo de três dias contados da publicação
 * do preliminar. Uma por projeto: contestação é peça, não conversa.
 *
 * Quem decide é a coordenação, respondendo no mesmo registro. Nada aqui muda
 * nota sozinho: a revisão, se proceder, é feita pela rota da nota, e fica no
 * histórico como qualquer outra.
 */
app.post("/api/ic/:id/contestacao", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const texto = String(req.body?.texto || "").trim().slice(0, 4000);
  if (texto.length < 30)
    return res.status(400).json({ error: "Descreva a razão da contestação (mínimo de 30 caracteres)." });
  const publicados = await resultadosPublicados();

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    const p = projetos[i];
    if (papelNoProjeto(meu, p) !== "orientador")
      return { erro: [403, "A contestação é de quem submeteu a proposta"], gravar: false };
    const janela = janelaContestacao(publicados[editalDe(p)]);
    if (!janela.aberta) {
      return {
        erro: [403, janela.motivo === "sem-preliminar"
          ? "O resultado preliminar ainda não foi publicado."
          : janela.motivo === "resultado-final"
            ? "O resultado final já foi publicado — o prazo de contestação era antes dele."
            : "O prazo de contestação encerrou."],
        gravar: false,
      };
    }
    if ((p.contestacoes || []).some((c) => String(c.por || "").toLowerCase() === u.email))
      return { erro: [409, "Você já enviou uma contestação para este projeto."], gravar: false };
    const agora = new Date().toISOString();
    projetos[i] = anotarProjeto({
      ...p,
      contestacoes: [...(p.contestacoes || []), { por: u.email, em: agora, texto }],
      atualizadoEm: agora,
    }, { quem: u.email, oQue: "contestou a nota do projeto" });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  avisarPesquisa(`Contestação de nota — ${r.projeto.numero || ""}`, [
    ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
    ["Orientação", r.projeto.orientador?.nome || u.email],
    ["Prazo", "3 dias a partir do resultado preliminar — o pedido também está no sino de alertas"],
  ], "Contestação de nota registrada");
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/** A resposta da coordenação à contestação — fecha o pedido, no registro. */
app.post("/api/ic/:id/contestacao/responder", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  if (!meu.gestao) return res.status(403).json({ error: "Só a coordenação responde à contestação" });
  const resposta = String(req.body?.resposta || "").trim().slice(0, 4000);
  const cid = String(req.body?.id || "").trim();
  if (resposta.length < 10) return res.status(400).json({ error: "Escreva a resposta à contestação." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Projeto não encontrado"], gravar: false };
    const p = projetos[i];
    const alvo = (p.contestacoes || []).find((c) => c.id === cid) || (p.contestacoes || [])[0];
    if (!alvo) return { erro: [404, "Contestação não encontrada"], gravar: false };
    const agora = new Date().toISOString();
    projetos[i] = anotarProjeto({
      ...p,
      contestacoes: (p.contestacoes || []).map((c) => (c === alvo
        ? { ...c, resposta, respondidoPor: u.email, respondidoEm: agora } : c)),
      atualizadoEm: agora,
    }, { quem: u.email, oQue: "respondeu à contestação da nota" });
    return { projeto: projetos[i] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, projeto: verProjeto(u, r.projeto) });
});

/**
 * A mesma decisão, para VÁRIAS propostas de uma vez (só a coordenação).
 *
 * O edital 01/2026 tem 40 propostas com parecer: decidir uma a uma é abrir
 * quarenta telas para repetir o mesmo clique, e é o que separa a coordenação
 * de publicar o resultado. As regras não afrouxam por ser em lote — cada
 * projeto passa por `podeAvaliar` e ganha a sua linha de histórico —, e o que
 * não puder ser decidido volta dito na resposta, com o motivo, em vez de
 * falhar em silêncio.
 *
 * A BOLSA continua de fora: quem aprova não concede: a distribuição é feita
 * depois, na guia Bolsas, conforme a cota que a presidência liberar.
 */
app.post("/api/ic/decidir-lote", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  if (!meu.gestao) return res.status(403).json({ error: "Só a coordenação decide a seleção" });
  const decisao = String(req.body?.decisao || "");
  const parecer = String(req.body?.parecer || "").trim().slice(0, 8000);
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => String(x)))];
  if (!["aprovado", "reprovado"].includes(decisao))
    return res.status(400).json({ error: "Em lote só cabe aprovar ou reprovar — devolver é caso a caso" });
  if (!ids.length) return res.status(400).json({ error: "Nenhuma proposta marcada" });
  if (ids.length > 300) return res.status(400).json({ error: "Marque no máximo 300 propostas por vez" });
  if (decisao === "reprovado" && parecer.length < 10)
    return res.status(400).json({ error: "Escreva o motivo: quem recebe precisa saber por quê." });

  const r = await comProjetos((projetos) => {
    const alvo = new Set(ids);
    const aplicados = [], ignorados = [];
    const agora = new Date().toISOString();
    for (let i = 0; i < projetos.length; i++) {
      if (!alvo.has(projetos[i].id)) continue;
      alvo.delete(projetos[i].id);
      const p = projetos[i];
      if (!podeAvaliar(meu, p)) {
        // o motivo verdadeiro importa: quase sempre é conflito de interesse
        // (o gestor que também submete), não a situação do projeto
        const papel = papelNoProjeto(meu, p);
        ignorados.push({
          numero: p.numero || p.id,
          motivo: papel && papel !== "gestao"
            ? "você participa deste projeto — quem decide é outro gestor do setor"
            : `situação "${IC_ROTULO_STATUS[p.status] || p.status}" não aceita decisão`,
        });
        continue;
      }
      const proprio = decidindoOProprio(meu, p);
      projetos[i] = anotarProjeto({
        ...p, status: decisao,
        fomento: decisao === "aprovado" ? p.fomento : null,   // reprovar mata a bolsa
        avaliacao: { decisao, parecer, por: u.email, em: agora, ...(proprio ? { proprioProjeto: true } : {}) },
        atualizadoEm: agora,
      }, {
        quem: u.email,
        oQue: `avaliou em lote: ${decisao}${proprio ? " (decisão do gestor geral sobre proposta própria; mérito julgado por parecer ad hoc)" : ""}`,
      });
      aplicados.push(projetos[i].numero || projetos[i].id);
    }
    for (const perdido of alvo) ignorados.push({ numero: perdido, motivo: "projeto não encontrado" });
    return { aplicados, ignorados, gravar: aplicados.length > 0 };
  });
  res.json({ ok: true, aplicados: r.aplicados.length, ignorados: r.ignorados });
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
/**
 * Ações de extensão migradas do processo em papel (pedido do dono,
 * ago/2026): a Semana de Enfermagem 2026 chegou em .doc/.docx — proposta,
 * relatório e a lista de participantes com CPF — e entra aqui UMA vez,
 * transcrita em dados/ex-semana-enf-2026.json. A migração emite o número
 * EXT-AAAA-NNN pela MESMA sequência oficial da aprovação (extensao-config-v1)
 * — número não se inventa — e nunca sobrescreve ação que já exista.
 */
async function subirAcoesMigradasExtensao() {
  const marca = "sys-ex-lote-semana-enf-2026";
  try {
    if (await storage.get(marca)) return;
    let lote = [];
    try {
      lote = JSON.parse(await readFile(path.join(__dirname, "dados", "ex-semana-enf-2026.json"), "utf8")).acoes || [];
    } catch { return; }   // sem o arquivo, nada a subir
    const acoes = JSON.parse((await storage.get(EX_KEY)) || "[]");
    let entraram = 0;
    for (const a of lote || []) {
      if (acoes.some((x) => x.id === a.id)) continue;
      if (!a.numeroAcao) {
        const ano = Number(String(a.aprovadoEm || a.proposta?.periodoFim || "").slice(0, 4))
          || Number(hojeLocalISO().slice(0, 4));
        const raw = await storage.get("extensao-config-v1");
        let cfg = raw ? JSON.parse(raw) : { ano, seq: 0 };
        if (cfg.ano !== ano) cfg = { ano, seq: 0 };
        cfg.seq++;
        a.numeroAcao = `EXT-${ano}-${String(cfg.seq).padStart(3, "0")}`;
        await storage.set("extensao-config-v1", JSON.stringify(cfg));
      }
      acoes.push(a);
      entraram++;
    }
    if (entraram) await storage.set(EX_KEY, JSON.stringify(acoes));
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), acoes: entraram }));
    await storage.flush?.();
    console.log(`ARCHÉ EX · Semana de Enfermagem 2026: ${entraram} ação(ões) migrada(s) do processo em papel`);
  } catch (e) {
    console.error("Falha ao subir as ações migradas da extensão:", e.message);
  }
}

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
/* Cada entrada é um ARQUIVO, com marca própria — o lote (origem.lote dos
   projetos) vem de dentro do JSON, porque um mesmo ciclo pode receber mais
   de uma rodada: a r2 de 2025 traz os bolsistas do Ensino Médio (que não
   têm termo em PDF — vieram do formulário de indicação) e completa os da
   graduação com telefone e conta. */
const LOTES_ALUNOS = ["edital-01-2024", "edital-01-2025", "edital-01-2023", "edital-01-2025-r2",
  // as planilhas de indicação de bolsista do Drive (ago/2026): 2022 inteiro —
  // o resultado publicado não nomeava bolsistas — e as rodadas que completam
  // 2023, 2024 e 2025 com quem não assinou termo (voluntários inclusive)
  "edital-01-2022", "edital-01-2023-r2", "edital-01-2024-r2", "edital-01-2025-r3"];
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
      const lote = arq.lote || nome;
      const r = await comProjetos((projetos) => {
        let tocados = 0, completados = 0, novos = 0;
        for (const [origemId, alunos] of Object.entries(arq.alunos || {})) {
          const i = projetos.findIndex((p) => p.origem?.lote === lote && p.origem?.id === String(origemId));
          if (i < 0) continue;
          const base = projetos[i];
          const lista = (base.alunos || []).slice();
          let mexeu = false;
          for (const novo of alunos) {
            const j = lista.findIndex((a) => chaveNome(a.nome) === chaveNome(novo.nome)
              || (a.cpf && novo.cpf && soDigitos(a.cpf) === soDigitos(novo.cpf)));
            if (j >= 0) {
              const antes = lista[j];
              // completa TODOS os campos que o documento traz e o registro não
              // tem — inclusive os do cadastro do bolsista (telefone, RG e
              // conta), que o certificado e o termo usam. Nada é sobrescrito.
              const junto = { ...antes };
              for (const c of ["cpf", "email", "curso", "telefone", "rg", "banco", "agencia", "conta", "pix"]) {
                if (!junto[c] && novo[c]) junto[c] = novo[c];
              }
              junto.bolsista = antes.bolsista || !!novo.bolsista;
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
 * Os bolsistas do ENSINO MÉDIO saem dos projetos de graduação (decisão do
 * dono, ago/2026): eles são de OUTRO programa de bolsas, ainda não modelado
 * no ARCHÉ IC, e apareciam misturados aos alunos da graduação porque o
 * resultado publicado os listava nos mesmos projetos. Os dados completos
 * deles ficam estacionados em dados/ic-em-2025-alunos.json, prontos para o
 * dia em que o programa entrar no sistema. Remove por CPF ou por nome
 * exato, e registra na marca quem saiu de onde.
 */
async function removerAlunosEnsinoMedio() {
  const marca = "sys-ic-em-removidos-v1";
  try {
    if (await storage.get(marca)) return;
    const arq = JSON.parse(
      await readFile(path.join(__dirname, "dados", "ic-em-2025-alunos.json"), "utf8"));
    const chaveNome = (v) => String(v || "").trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
    const cpfs = new Set((arq.alunos || []).map((a) => soDigitos(a.cpf)).filter(Boolean));
    const nomes = new Set((arq.alunos || []).map((a) => chaveNome(a.nome)).filter(Boolean));

    const r = await comProjetos((projetos) => {
      let tocados = 0;
      const removidos = [];
      for (let i = 0; i < projetos.length; i++) {
        const p = projetos[i];
        if (p.edital !== "01/2025") continue;
        const antes = p.alunos || [];
        const ficam = antes.filter((a) =>
          !(cpfs.has(soDigitos(a.cpf)) || nomes.has(chaveNome(a.nome))));
        if (ficam.length === antes.length) continue;
        for (const a of antes) if (!ficam.includes(a)) removidos.push({ nome: a.nome, projeto: p.numero });
        projetos[i] = normalizarProjeto({ ...p, alunos: ficam }, { base: p, autor: p.criadoPor || "" });
        tocados++;
      }
      return { tocados, removidos, gravar: tocados > 0 };
    });
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
    await storage.flush?.();
    console.log(`ARCHÉ IC · Ensino Médio: ${r.removidos.length} bolsista(s) separado(s) de ${r.tocados} projeto(s)`);
  } catch (e) {
    console.error("Falha ao separar os bolsistas do Ensino Médio:", e.message);
  }
}

/**
 * As turmas do ICEM sobem no arranque, uma vez cada (marca sys-* por
 * arquivo). A trajetória dos bolsistas vem apontando origem.lote/origem.id
 * do projeto acompanhado — o id real é de cada ambiente e resolve-se aqui.
 * Reimportar não duplica: o bolsista casa por origem.id do próprio lote.
 */
const TURMAS_EM_LOTES = ["em-2025-turma", "em-2026-turma"];
async function subirTurmasEM() {
  for (const nome of TURMAS_EM_LOTES) {
    const marca = `sys-ic-${nome}`;
    try {
      if (await storage.get(marca)) continue;
      const arq = JSON.parse(
        await readFile(path.join(__dirname, "dados", `ic-${nome}.json`), "utf8"));
      const projetos = await lerProjetos();
      const r = await comBolsistasEM((lista) => {
        let novos = 0;
        for (const b of arq.bolsistas || []) {
          if (b.origem?.id && lista.some((x) => x.origem?.lote === b.origem.lote && x.origem?.id === b.origem.id)) continue;
          const trajetoria = (b.trajetoria || []).map((e) => {
            const p = e.projetoId ? { id: e.projetoId }
              : projetos.find((x) => x.origem?.lote === e.origemLote && String(x.origem?.id) === String(e.origemId));
            return p ? { projetoId: p.id, numero: e.numero, titulo: e.titulo,
              orientador: e.orientador, de: e.de, ate: e.ate } : null;
          }).filter(Boolean);
          const novo = normalizarBolsistaEM({ ...b, trajetoria });
          novo.id = "em_" + crypto.randomUUID().slice(0, 12);
          lista.push(novo);
          novos++;
        }
        return { novos, gravar: novos > 0 };
      });
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
      console.log(`ARCHÉ IC · ICEM: ${r.novos} bolsista(s) da turma ${arq.turma} importado(s)`);
    } catch (e) {
      console.error(`Falha ao subir a turma ${nome} do ICEM:`, e.message);
    }
  }
}

/**
 * Os 24 TERMOS ASSINADOS da turma 2025/2026 (conferidos página a página,
 * ago/2026) alinham o registro: completam CPF, e-mail, conta e curso de
 * interesse SEM sobrescrever nada, incluem os 2 bolsistas que faltavam
 * (Ellisa Vitórya e Letícia Lopes, de termo manuscrito) e corrigem a bolsa
 * de quem o resultado publicado trazia como voluntária mas TEM contrato de
 * bolsa (Rebeca → UNIEGO, Anna Júlia → CNPq) — fechando 12 + 12. CPF que
 * não valida fica de fora (o aluno corrige no portal).
 */
async function completarTurmaEM2025() {
  const marca = "sys-ic-em-2025-termos";
  try {
    if (await storage.get(marca)) return;
    const arq = JSON.parse(
      await readFile(path.join(__dirname, "dados", "ic-em-2025-termos.json"), "utf8"));
    const chaveNome = (v) => String(v || "").trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
    const projetos = await lerProjetos();
    // a trajetória do lote aponta origem.lote/id do projeto de graduação
    // (o id real é de cada ambiente) — resolve-se aqui, como na importação
    const resolverTrajetoria = (entradas) => (entradas || []).map((e) => {
      const p = projetos.find((x) => x.origem?.lote === e.origemLote && String(x.origem?.id) === String(e.origemId));
      return p ? { projetoId: p.id, numero: p.numero, titulo: p.titulo,
        orientador: p.orientador?.nome || "", de: e.de, ate: e.ate } : null;
    }).filter(Boolean);
    const r = await comBolsistasEM((lista) => {
      let completados = 0, novos = 0, bolsas = 0;
      for (const t of arq.bolsistas || []) {
        const cpfT = normalizarCpf(t.cpf);
        const i = lista.findIndex((x) => x.turma === arq.turma
          && ((cpfT && soDigitos(x.cpf) === cpfT) || chaveNome(x.nome) === chaveNome(t.nome)));
        if (i < 0) {
          const novo = normalizarBolsistaEM({ ...t, cpf: cpfT, turma: arq.turma,
            situacao: "concluido", trajetoria: resolverTrajetoria(t.trajetoria) });
          novo.id = "em_" + crypto.randomUUID().slice(0, 12);
          lista.push(novo);
          novos++;
          continue;
        }
        const base = lista[i];
        const junto = { ...base };
        let mexeu = false;
        for (const c of ["cpf", "email", "telefone", "cursoInteresse", "banco", "agencia", "conta", "pix"]) {
          const v = c === "cpf" ? cpfT : t[c];
          if (!junto[c] && v) { junto[c] = v; mexeu = true; }
        }
        if (!junto.bolsa && t.bolsa) { junto.bolsa = t.bolsa; mexeu = true; }
        // o acompanhamento do termo entra só em quem não tem trajetória
        // nenhuma — trajetória existente nunca se apaga nem se duplica
        if (!(base.trajetoria || []).length && (t.trajetoria || []).length) {
          const tr = resolverTrajetoria(t.trajetoria);
          if (tr.length) { junto.trajetoria = tr; mexeu = true; }
        }
        if (mexeu) { lista[i] = normalizarBolsistaEM(junto, { base }); completados++; }
      }
      // a correção explícita: contrato de bolsa vale mais que o resultado
      for (const [nome, bolsa] of Object.entries(arq.corrigirBolsa || {})) {
        const i = lista.findIndex((x) => x.turma === arq.turma && chaveNome(x.nome) === chaveNome(nome));
        if (i >= 0 && lista[i].bolsa !== bolsa) {
          lista[i] = anotarEM({ ...lista[i], bolsa }, { quem: "sistema (termos assinados)",
            oQue: `bolsa corrigida pelo contrato assinado: ${bolsaEmDe(bolsa)?.nome || bolsa}` });
          bolsas++;
        }
      }
      return { completados, novos, bolsas, gravar: completados + novos + bolsas > 0 };
    });
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), ...r }));
    console.log(`ARCHÉ IC · ICEM 2025/2026: ${r.novos} incluído(s), ${r.completados} completado(s), ${r.bolsas} bolsa(s) corrigida(s) pelos termos`);
  } catch (e) {
    console.error("Falha ao completar a turma 2025/2026 pelos termos:", e.message);
  }
}

/**
 * Pré-cadastro dos bolsistas EM da turma 2025/2026 (decisão do dono,
 * ago/2026): o perfil nasce pronto — nome, CPF válido, telefone, função
 * "aluno" — e a conta já aprovada; entrando com o e-mail do termo, está
 * tudo lá. Mesma mecânica do pré-cadastro do edital (quem já tem perfil
 * não é tocado; CPF que já é de alguém não entra).
 */
async function criarPreCadastrosEM() {
  const marca = "sys-ic-em-precadastros-v1";
  try {
    if (await storage.get(marca)) return;
    const alvo = "2025/2026";
    const bolsistas = (await lerBolsistasEM()).filter((b) => b.turma === alvo && b.email);
    if (!bolsistas.length) return;
    const perfis = await carregarPerfis();
    const usuarios = await carregarUsuarios(storage);
    let criados = 0;
    for (const b of bolsistas) {
      const email = b.email.toLowerCase();
      if (perfis[email]) continue;
      const cpf = normalizarCpf(b.cpf);
      perfis[email] = {
        nome: b.nome,
        cpf: cpf && !Object.values(perfis).some((p) => p?.cpf === cpf) ? cpf : "",
        telefone: b.telefone || "",
        curso: b.cursoInteresse || "",
        funcao: "aluno",
        preCadastro: true, criadoEm: new Date().toISOString(),
        criadoPor: "sistema (pré-cadastro do ICEM, a partir dos termos assinados)",
      };
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
    console.log(`ARCHÉ IC · ICEM: ${criados} pré-cadastro(s) da turma ${alvo}`);
  } catch (e) {
    console.error("Falha nos pré-cadastros do ICEM:", e.message);
  }
}

/**
 * O convite da turma 2025/2026 sai UMA vez, no arranque (pedido do dono,
 * ago/2026): cada bolsista com e-mail recebe o passo a passo para entrar
 * com o próprio e-mail e ENTREGAR O RELATÓRIO FINAL, que formaliza a
 * conclusão. O registro alimenta o mesmo sys-ic-em-convites-v1 do botão
 * da tela — reenviar depois é por lá.
 */
/**
 * CHAMADA da regularização do 01/2025, UMA vez no arranque (pedido do dono,
 * ago/2026): a PROPPEX avisou por e-mail próprio, mas alguns endereços
 * voltaram — o sistema reforça mandando a todos do ciclo com pendência o
 * mesmo e-mail da cobrança semanal (aluno: enviar; orientação: validar),
 * SEM esperar o espaçamento de 7 dias. O envio carimba o registro da
 * cobrança, para a varredura da hora seguinte não duplicar; a marca só
 * grava com algum envio bem-sucedido (sem credencial, tenta no próximo
 * deploy).
 */
async function chamadaRegularizacao012025() {
  const marca = "sys-ic-chamada-regularizacao-01-2025-v1";
  try {
    if (await storage.get(marca)) return;
    const porPessoa = pendenciasCobrancaIC(await lerProjetos(), { edital: "01/2025" });
    if (!porPessoa.size) { await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), enviados: 0 })); return; }
    const registro = JSON.parse((await storage.get(COBRANCA_IC_KEY)) || "{}");
    const { enviarEmail, emailCobrancaRelatorioIC } = await import("./lib/mailer.js");
    let ok = 0;
    const falhas = [];
    for (const [emailAlvo, dados] of porPessoa) {
      try {
        await enviarEmail(emailCobrancaRelatorioIC({ para: emailAlvo, ...dados }));
        registro[emailAlvo] = new Date().toISOString();
        ok++;
      } catch (e) { falhas.push(`${dados.nome || emailAlvo}: ${e.message}`); }
    }
    if (ok) {
      await storage.set(COBRANCA_IC_KEY, JSON.stringify(registro));
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), enviados: ok, falhas }));
    }
    console.log(`ARCHÉ IC: chamada da regularização 01/2025 enviada a ${ok} pessoa(s)${falhas.length ? ` (${falhas.length} falha(s))` : ""}`);
  } catch (e) {
    console.error("Falha na chamada da regularização 01/2025:", e.message);
  }
}

async function convidarTurmaEM2025() {
  const marca = "sys-ic-em-convite-2025-v1";
  try {
    if (await storage.get(marca)) return;
    const turma = turmaEmDe("2025/2026");
    const bolsistas = (await lerBolsistasEM())
      .filter((b) => b.turma === turma.ciclo && b.email && b.situacao !== "desligado"
        && b.relatorios?.final?.situacao !== "validado");
    if (!bolsistas.length) { await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), enviados: 0 })); return; }
    const CONVITES_EM = "sys-ic-em-convites-v1";
    const enviados = JSON.parse((await storage.get(CONVITES_EM)) || "{}");
    const { enviarEmail, emailConviteEM } = await import("./lib/mailer.js");
    let ok = 0;
    const falhas = [];
    for (const b of bolsistas) {
      try {
        await enviarEmail(emailConviteEM(b, turma, {}));
        enviados[b.email] = { em: new Date().toISOString(), turma: turma.ciclo };
        ok++;
      } catch (e) { falhas.push(`${b.nome}: ${e.message}`); }
    }
    await storage.set(CONVITES_EM, JSON.stringify(enviados));
    // e-mail é rede: só marca como feito se ALGUM saiu — senão tenta de novo
    // no próximo arranque (e as falhas ficam ditas no log)
    if (ok) await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), enviados: ok, falhas }));
    console.log(`ARCHÉ IC · ICEM: convite do relatório final enviado a ${ok} bolsista(s) da turma 2025/2026${falhas.length ? ` (${falhas.length} falha(s))` : ""}`);
  } catch (e) {
    console.error("Falha no convite da turma 2025/2026:", e.message);
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
    if (!atoDeGestao(meu, projetos[i]))
      return { erro: [403, "A concessão de bolsa é decidida pela coordenação"], gravar: false };
    const p = projetos[i];
    const proprio = decidindoOProprio(meu, p);
    const mod = tipo ? modalidadePor(p.linha, tipo) : null;
    projetos[i] = anotarProjeto({
      ...p,
      fomento: tipo
        ? { tipo, modalidade: mod?.codigo || "", observacao: obs, por: u.email, em: new Date().toISOString() }
        : null,
      // bolsa é do aluno: marca quem recebe (voluntário e "sem decisão" desmarcam)
      alunos: (p.alunos || []).map((a) => ({ ...a, bolsista: !!tipo && tipo !== "voluntario" })),
      atualizadoEm: new Date().toISOString(),
    }, {
      quem: u.email,
      oQue: (tipo ? `fomento: ${mod?.nome || tipo}` : "concessão de bolsa desfeita")
        + (proprio ? " (ato do gestor geral sobre proposta própria; mérito julgado por parecer ad hoc)" : ""),
    });
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
    if (!atoDeGestao(meu, projetos[i]))
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
      oQue: (remover ? "desfez a nota atribuída ao projeto"
        : `atribuiu a nota do projeto: ${Math.round(valor * 10) / 10} (seleção conduzida fora do sistema)`)
        + (decidindoOProprio(meu, p) ? " — ato do gestor geral sobre proposta própria" : ""),
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

  // a validação é a do modelo institucional de cada tipo (decisão do dono,
  // ago/2026): o parcial cobra as seções do roteiro; o final, os dados da
  // revista do artigo — o arquivo do artigo entra em seguida, como anexo
  if (tipo === "parcial") {
    const faltam = CAMPOS_PARCIAL_OBRIGATORIOS
      .filter((c) => String(b.campos?.[c] || "").trim().length < 30)
      .map((c) => CAMPOS_RELATORIO_PARCIAL.find((x) => x.campo === c)?.rot || c);
    if (faltam.length) {
      return res.status(400).json({ error: `Preencha as seções do relatório (mínimo de 30 caracteres cada): ${faltam.join("; ")}.` });
    }
  } else {
    const a = b.artigo || {};
    if (!String(a.revista || "").trim() || !String(a.issn || "").trim() || !String(a.link || "").trim()) {
      return res.status(400).json({ error: "O relatório final é o artigo científico: informe a revista escolhida, o ISSN e o link da revista (Qualis e fator de impacto, se houver)." });
    }
    // o link vira um href clicável para a orientação e a gestão: só
    // http(s) — "javascript:" e afins não entram (achado de ago/2026)
    if (!/^https?:\/\//i.test(String(a.link).trim())) {
      return res.status(400).json({ error: "O link da revista precisa ser o endereço completo, começando com http:// ou https://." });
    }
  }
  // as avaliações acompanham OS DOIS relatórios (decisão do dono, ago/2026:
  // obrigatórias também no parcial): a do projeto e a da atuação da orientação
  const semResposta = PERGUNTAS_AVALIACAO_PROJETO
    .filter((q) => !String(b.avaliacaoProjeto?.[q.codigo] || "").trim());
  // a escala é 0–5 e o servidor cobra a FAIXA (achado de ago/2026: "é
  // inteiro" deixava passar 99, que a normalização depois anulava em silêncio)
  const fora05 = (v) => v === "" || v == null
    || !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 5;
  const semNota = CRITERIOS_AVALIACAO_ORIENTADOR
    .filter((c) => fora05(b.avaliacaoOrientador?.[c.codigo]));
  if (semResposta.length || semNota.length) {
    return res.status(400).json({ error: "Responda a avaliação do projeto e a avaliação da atuação da orientação — todos os itens, na escala de 0 a 5." });
  }

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeEnviarRelatorio(meu, projetos[i]))
      return { erro: [403, "O relatório é enviado pelo aluno indicado, com o projeto em execução"], gravar: false };
    // ciclo em regularização: o projeto está concluído e só o relatório
    // reaberto (o final de 01/2025) aceita envio
    if (projetos[i].status === "concluido") {
      const reg = regularizacaoDe(projetos[i]);
      if (!reg?.[tipo]) return { erro: [400, `Este projeto está concluído — a regularização${reg ? ` reabriu apenas: ${Object.keys(reg).join(" e ")}` : " deste ciclo já se encerrou"}.`], gravar: false };
    }
    // a janela: o parcial abre no 4º mês da vigência, o final no 10º.
    // Depois do vencimento o envio segue aceito (e marcado atrasado) —
    // fechar de vez impediria a regularização.
    const janela = janelaRelatorio(projetos[i], tipo);
    if (janela && !janela.aberta) {
      return { erro: [400, `O relatório ${tipo} abre em ${janela.abre.split("-").reverse().join("/")} — ${tipo === "parcial" ? "no 4º mês da vigência" : "no 10º mês da vigência"} — com prazo até ${janela.vence.split("-").reverse().join("/")}.`], gravar: false };
    }
    const lista = [...(projetos[i].relatorios || [])];
    // reenvio depois de devolvido substitui o anterior, guardando o parecer.
    // Relatório VALIDADO não se reenvia (achado de ago/2026): o reenvio
    // desfazia em silêncio o ato de validação da orientação/PROPPEX
    const j = lista.findIndex((x) => x.tipo === tipo && x.aluno === u.email);
    if (j >= 0 && lista[j].situacao === "validado")
      return { erro: [400, `O relatório ${tipo} já foi validado — não precisa reenviar. Se algo precisa mudar, peça à orientação (ou à PROPPEX) para devolvê-lo.`], gravar: false };
    const novo = {
      id: j >= 0 ? lista[j].id : "rel_" + crypto.randomUUID().slice(0, 10),
      tipo, aluno: u.email, periodo: String(b.periodo || "").slice(0, 60),
      resumo: String(b.resumo || "").slice(0, 20000),
      campos: b.campos || {}, artigo: b.artigo || {},
      avaliacaoProjeto: b.avaliacaoProjeto || {},
      avaliacaoOrientador: b.avaliacaoOrientador || {},
      // as avaliações da orientação são da validação — reenvio não as apaga
      avaliacaoAluno: j >= 0 ? lista[j].avaliacaoAluno || {} : {},
      parecerConclusivo: j >= 0 ? lista[j].parecerConclusivo || "" : "",
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
  avisarPesquisa(`Relatório ${tipo} entregue — ${r.projeto.numero || ""}`, [
    ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
    ["Aluno", u.nome || u.email],
    ["Tipo", tipo === "final" ? "Relatório final" : "Relatório parcial"],
    ["Validação", "A orientação valida (ou devolve) pelo projeto"],
  ], "Relatório de IC entregue pelo aluno");
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
    // relatório validado é peça fechada (achado de ago/2026): anexar depois
    // do ato mudaria o conteúdo do que a orientação validou
    if (rel.situacao === "validado")
      return res.status(400).json({ error: "Este relatório já foi validado — para anexar algo, peça a devolução à orientação (ou à PROPPEX)." });

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
  const avaliacaoAluno = req.body?.avaliacaoAluno || {};
  const parecerConclusivo = String(req.body?.parecerConclusivo || "");
  if (parecerConclusivo && !PARECERES_CONCLUSIVOS.some((x) => x.codigo === parecerConclusivo))
    return res.status(400).json({ error: "Parecer conclusivo inválido" });
  // toda nota informada tem de estar na escala 0–5 (achado de ago/2026)
  for (const c of CRITERIOS_AVALIACAO_ALUNO) {
    const v = avaliacaoAluno[c.codigo];
    if (v !== "" && v != null && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 5))
      return res.status(400).json({ error: `Nota fora da escala 0–5 em "${c.rot}".` });
  }

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!podeValidarRelatorio(meu, projetos[i]))
      return { erro: [403, "Quem valida o relatório é a orientação"], gravar: false };
    const lista = projetos[i].relatorios || [];
    const j = lista.findIndex((x) => x.id === req.params.rid);
    if (j < 0) return { erro: [404, "Relatório não encontrado"], gravar: false };
    // a PROPPEX pode validar EM NOME da orientação (decisão do dono,
    // ago/2026): orientadores desligados da instituição não voltam para
    // validar, e o relatório do aluno não pode ficar refém disso
    const emNome = papelNoProjeto(meu, projetos[i]) === "gestao";
    // validar o FINAL fecha o ciclo do aluno: a avaliação do desempenho e o
    // parecer conclusivo são obrigatórios quando quem valida é a PRÓPRIA
    // orientação — a gestão, validando em nome dela, não avalia desempenho
    // que não acompanhou (preenche se quiser, nunca é obrigada)
    if (decisao === "validado" && lista[j].tipo === "final" && !emNome) {
      const semNota = CRITERIOS_AVALIACAO_ALUNO.filter((c) => {
        const v = avaliacaoAluno[c.codigo];
        return v === "" || v == null || !Number.isInteger(Number(v));
      });
      if (semNota.length || !parecerConclusivo) {
        return { erro: [400, "Para validar o relatório final, preencha a avaliação do desempenho do aluno (os 7 critérios) e o parecer conclusivo."], gravar: false };
      }
    }
    lista[j] = { ...lista[j], situacao: decisao, parecer,
      avaliacaoAluno: Object.keys(avaliacaoAluno).length ? avaliacaoAluno : lista[j].avaliacaoAluno || {},
      parecerConclusivo: parecerConclusivo || lista[j].parecerConclusivo || "",
      avaliadoPor: u.email, avaliadoEm: new Date().toISOString(),
      ...(emNome ? { validadoPelaGestao: true } : {}) };

    // final validado de todos os alunos encerra o projeto
    const finaisOk = (projetos[i].alunos || []).length > 0 && (projetos[i].alunos || []).every((a) =>
      lista.some((x) => x.tipo === "final" && x.aluno === a.email && x.situacao === "validado"));
    projetos[i] = anotarProjeto({
      ...projetos[i], relatorios: [...lista],
      status: finaisOk && projetos[i].status === "aprovado" ? "concluido" : projetos[i].status,
      atualizadoEm: new Date().toISOString(),
    }, { quem: u.email, oQue: `${decisao === "validado" ? "validou" : "devolveu"} o relatório ${lista[j].tipo}${emNome ? " — pela PROPPEX, em nome da orientação" : ""}` });
    return { projeto: projetos[i], tipoRel: lista[j].tipo };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  // validado, o relatório segue à PROPPEX — é o aviso que encaminha
  if (decisao === "validado" && !meu.gestao) {
    avisarPesquisa(`Relatório ${r.tipoRel} validado — ${r.projeto.numero || ""}`, [
      ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
      ["Orientação", r.projeto.orientador?.nome || u.email],
      ["Situação", r.projeto.status === "concluido"
        ? "Todos os finais validados — o projeto passou a CONCLUÍDO"
        : `Relatório ${r.tipoRel} validado pela orientação`],
    ], "Relatório validado pela orientação — encaminhado à PROPPEX");
  }
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
/* Endereços amigáveis dos eventos (públicos de propósito: /eventos NÃO está
   em AREAS_PROTEGIDAS — a inscrição é de quem vem de fora). A página lê o
   caminho e busca a API; o que tem ponto (credenciar.html, qr.svg…) segue
   direto para o estático, porque o padrão de slug não aceita ponto. */
app.get(["/eventos/credenciar", "/eventos/credenciar/"], (_req, res) =>
  res.sendFile(path.join(PUBLIC, "eventos", "credenciar.html")));
app.get(/^\/eventos\/[a-z0-9-]+\/inscricao\/[a-zA-Z0-9]+\/?$/, (_req, res) =>
  res.sendFile(path.join(PUBLIC, "eventos", "inscricao.html")));
app.get(/^\/eventos\/[a-z0-9-]+\/assistir\/[a-zA-Z0-9]+\/?$/, (_req, res) =>
  res.sendFile(path.join(PUBLIC, "eventos", "assistir.html")));
// a sala de gestão do ARCHÉ EV (com login — a guarda é a do topo): entra
// ANTES do padrão de slug, senão "gestao" viraria página de evento
app.get(["/eventos/gestao", "/eventos/gestao/"], (_req, res) =>
  res.sendFile(path.join(PUBLIC, "eventos", "gestao", "index.html")));
app.get(/^\/eventos\/[a-z0-9-]+\/?$/, (_req, res) =>
  res.sendFile(path.join(PUBLIC, "eventos", "evento.html")));
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
      // a presença online acumulada em memória desce à base antes do flush
      // do estado — melhor esforço: minutos de transmissão não valem perder
      // o desligamento por eles
      await flushPresencaOnline().catch(() => {});
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
  migrarAcoesExtensao().then(() => subirAcoesMigradasExtensao());
  // A ORDEM importa (num arranque limpo os projetos precisam existir antes de
  // qualquer coisa que os altere), mas uma etapa que falhe não pode levar as
  // seguintes junto: encadeadas por .then, um erro no meio fazia as de baixo
  // sumirem em silêncio — e ninguém percebe uma migração que não rodou. Cada
  // uma corre na sua vez, e o que quebrar fica dito no log.
  (async () => {
    for (const etapa of [
      subirLotesIniciais, aplicarAnexosIniciais, zerarAlunosIniciais,
      enquadrarCronogramasIniciais, subirArquivoHistorico, subirAlunosHistoricos,
      removerAlunosEnsinoMedio, subirTurmasEM,
      completarTurmaEM2025, criarPreCadastrosEM, convidarTurmaEM2025,
      chamadaRegularizacao012025,
      propagarCpfOrientadores, identidadeInstitucionalDoProReitor, criarPreCadastros,
      aplicarAvaliacoesTranscritas,
      // SEMPRE por último, e a cada arranque (achado de ago/2026 — o caso
      // Marlana): as migrações acima podem carimbar CPF em projeto que ainda
      // não tem e-mail, e uma vinculação que rodasse só uma vez, antes delas,
      // deixaria a pessoa "duplicada" no painel (a conta de um lado, os
      // projetos pelo CPF do outro) até alguém regravar o perfil. A passada é
      // idempotente e nunca sobrescreve e-mail existente.
      vincularPerfisIC,
    ]) {
      try { await etapa(); }
      catch (e) { console.error(`ARCHÉ · falha na migração ${etapa.name}:`, e?.stack || e); }
    }
  })();
  // Cobrança do relatório final: varre ao acordar e de hora em hora enquanto
  // o processo estiver vivo. O tráfego do portal também dispara (com throttle),
  // o que cobre as hibernações do plano free.
  setTimeout(() => varrerSeVencido(storage, "boot"), 20_000).unref();
  setInterval(() => varrerSeVencido(storage, "intervalo"), 60 * 60 * 1000).unref();
  // a cobrança semanal dos relatórios de IC segue o mesmo relógio: a varredura
  // é de hora em hora, e o espaçamento de 7 dias por pessoa é do registro
  setTimeout(() => varrerCobrancaIC().catch((e) => console.error("[cobranca-ic]", e.message)), 30_000).unref();
  setInterval(() => varrerCobrancaIC().catch((e) => console.error("[cobranca-ic]", e.message)), 60 * 60 * 1000).unref();
});
