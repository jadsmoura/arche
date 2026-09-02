/* ========================================================================
   ARCHÉ — servidor unificado (portal + setores)
   - Serve o super-portal e todos os setores em public/.
   - API de persistência (/api/estado*) e uploads (/api/drive/*).
   - Modo LOCAL por padrão (arquivo + disco); MySQL/S3/Google Drive quando
     as variáveis de ambiente correspondentes estiverem definidas.
   ======================================================================== */
import "dotenv/config";
import express from "express";
import compression from "compression";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getStorage } from "./lib/storage.js";
import { getFiles, slug } from "./lib/files.js";
import { varrer, varrerSeVencido, dispensar, situacao } from "./lib/cobranca.js";
import {
  ATAS_KEY, ORGAOS, CURSOS, cursoDe, STATUS as ATA_STATUS, normalizarAta, validarAta,
  numerar, tituloDe, anotar, encaminhamentos, orgaoDe, podeVerAta, podeEditarAta, statusVigente,
  buscarAtas, renumerar, numeroIncoerente, renumerarAcervo, assinantesDaAta,
  chaveDoNome, nomeServeDeChave, refDoAssinante, propagarEmailPorNome, paresDeIdentidade,
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
  janelaRelatorio, regularizacaoDe, pedidoEncerramentoPendente, encerramentoAceito,
} from "./lib/ic.js";
import { normalizarCpf, soDigitos, formatarCpf, cpfValido } from "./lib/cpf.js";
import {
  MON_KEY, editalVigente as monEditalVigente, cicloCorrente as monCicloCorrente,
  cicloSemEdital as monCicloSemEdital, CRONOGRAMA as MON_CRONOGRAMA, VIGENCIA as MON_VIGENCIA,
  PRAZOS as MON_PRAZOS, CH_SEMANAL as MON_CH_SEMANAL, ROTULO_STATUS as MON_ROTULO_STATUS,
  CRITERIOS_MONITOR, RESPOSTAS_CRITERIO, PARECERES as PARECERES_MON,
  CAMPOS_PLANO as CAMPOS_PLANO_MON, faltaNoPlano as monFaltaPlano,
  MIN_FOTOS_MONITORIA, fotosDoRelatorio as fotosRelatorioMon,
  TEXTO_EDITAL as TEXTO_EDITAL_MON, ACESSOS as ACESSOS_MON, editaisMonitoriaParaLista,
  editalMonitoriaDe,
  normalizarProjeto as normalizarProjetoMon, normalizarRelatorio as normalizarRelatorioMon,
  papelNoProjeto as monPapel, podeVer as monPodeVer, podeEditar as monPodeEditar,
  podeSubmeter as monPodeSubmeter, podeDecidir as monPodeDecidir,
  decisaoSobreProjetoProprio as monDecisaoPropria, souOrientadorDo as monSouOrientador,
  podeValidarRelatorio as monPodeValidar, podeHomologar as monPodeHomologar,
  monitorDe as monMonitorDe, visaoDoProjeto as monVisao, resumir as monResumir,
  panorama as monPanorama, pendenciasDoCiclo as monPendencias,
  pendenciasDoProjeto as monPendenciasProjeto, faltaNoProjeto as monFaltaProjeto,
  faltaNoCadastroDoMonitor as monFaltaCadastro, faltaNoRelatorio as monFaltaRelatorio,
  faltaNaAvaliacao as monFaltaAvaliacao, todosCadastrados as monTodosCadastrados,
  cargaHorariaTotal as monCargaTotal, anotar as monAnotar,
  submissaoAberta as monSubmissaoAberta, certificadosDe as certificadosMonitoria,
  COBRANCA as MON_COBRANCA, cobrancaAberta as cobrancaAbertaMon,
  diasParaRelatorio as diasParaRelatorioMon,
} from "./lib/monitoria.js";
import {
  normalizarLote as normalizarLoteMon, certificadosHistoricos as certificadosHistoricosMon,
  certificadoHistorico as certificadoHistoricoMon, panoramaDoLote as panoramaLoteMon,
  projetosDoArquivo as projetosDoArquivoMon,
  certificadosDoArquivo as certificadosDoArquivoMon,
  certificadoDoArquivo as certificadoDoArquivoMon,
  ehEsteMonitor as ehEsteMonitorMon, ehEsteOrientador as ehEsteOrientadorMon,
} from "./lib/monitoriaHistorico.js";
import {
  slugDeNome, slugUnico, SLUG_VALIDO, slugReservado, SLUGS_RESERVADOS, gerarChaveQr, gerarCodigoMonitor, gerarToken, tokenValido,
  codigoDe, inscritoPorToken, normalizarProgramacao, vagasRestantes, prazoInscricao,
  podeInscrever as podeInscreverEvento, jaInscrito, emailMascarado,
  horaLimiteInscricao, prazoInscricaoVencido, RE_HORA_LIMITE,
  TIPOS_ATIVIDADE, gerarIdCurto, vagasAtividade, podeEscolherAtividade,
  normalizarFormulario, validarRespostas, LGPD_TEXTO_PADRAO, textoLgpd, versaoLgpd,
  normalizarBlocos, TIPOS_BLOCO, CATEGORIAS_APOIO, REDES_SOCIAIS, FREQUENCIAS,
  minutosEntre, duracaoBR, eventoControlaFrequencia, temHotsiteEvento,
} from "./lib/eventos.js";
import {
  PAPEIS_COMISSAO, faltaParaCertificado, pendenciasCertificado, normalizarPessoaEvento,
  videoIdDe, numerosDoEvento, faltaNoProjetoDoEvento, contaPresente, houveCredenciamento,
  normalizarCursosExtras, cursosDaAcao,
} from "./lib/eventos.js";
import {
  AVISOS, AVISOS_KEY, SETORES_AVISO, aplicarMudanca as aplicarMudancaAviso,
  avisoLigado, normalizarConfig as normalizarAvisos, situacaoDosAvisos,
} from "./lib/avisos.js";
import {
  ASSINANTES_DO_EVENTO, assinanteDoEventoValido, assinaturasDoCertificado,
  caixaCertificado, certificadoDe, certificadosDePessoa, certificadosDaAcao, acaoCertificavel,
  eventoEncerrado, podeEncerrar, programacaoDoCertificado, situacaoEncerramento,
} from "./lib/certificadosEx.js";
import { situacaoDaAcao } from "./lib/situacao.js";
import { limparColagem, limparProfundo, temColagemSuja } from "./lib/texto.js";
import {
  TURMAS_EM, BOLSAS_EM, bolsaEmDe, turmaDe as turmaEmDe, turmaVigente as turmaEmVigente,
  ESCALA_AVALIACAO_EM, CRITERIOS_AVALIACAO_EM, RECOMENDACAO_EM, avaliacaoEMCompleta,
  normalizarBolsistaEM, trocarProjeto, anotarEM, cotasDaTurma, projetoAtual as projetoAtualEM,
  RELATORIOS_EM, CAMPOS_RELATORIO_EM, relatoriosExigidos,
} from "./lib/em.js";
import {
  duplicidadesPorNome, podeFundir, fundirPerfil, fundirProjeto, fundirAcao, fundirAta, fundirPapeis,
  chaveNome, nomesCompativeis,
} from "./lib/fusao.js";
import {
  INSTITUICAO_KEY, normalizarInstituicao, normalizarComposicao, aplicarNoCatalogo,
  cursosAtivos, cursosDaPessoa, equipeApDaComposicao, slugDeCursoNovo, siglaDeCursoNovo,
  CARGOS_REITORIA, normalizarReitoria,
} from "./lib/instituicao.js";
import { certificadosDe, destinatariosDoCiclo, certificavel, codigo as codigoCert } from "./lib/certificados.js";
import {
  EDITAL, LINHAS, GRUPOS_PESQUISA, FOMENTOS, TITULACOES, BLOCOS_PRODUCAO, normalizarTitulacao,
  pontuarProducao, normalizarProducao, notaClassificacao, modalidadePor, gruposConhecidos,
  DOCUMENTOS_EDITAIS, RESULTADOS_EDITAIS,
} from "./lib/edital.js";
import { gerarAlertas, resumoAlertas, porResponsavel } from "./lib/alertas.js";
import { dataCivil, diaSerial, hojeLocalISO, horaLocalHHMM, semestreAnterior,
  semestreCorrente, semestreDe } from "./lib/datas.js";
import { classificar as classificarBanda } from "./lib/banda.js";
import { medir as medirBanda, diagnostico as diagnosticoBanda, zerar as zerarBanda,
  fecharMedicao } from "./lib/medidor.js";
import {
  periodoDe, semestresDisponiveis, setorRelatorioDe, SETORES_RELATORIO,
  alcanceDeRelatorios, normalizarAcessoRelatorios, filtrarPorCurso,
  panoramaAtas, panoramaEspacos, panoramaEventos, panoramaExtensao, panoramaIC,
  panoramaMonitoria, panoramaPraticas, panoramaCurricularizacaoSemestre,
} from "./lib/relatorios.js";
import { MIN_FOTOS_RELATORIO, faltamFotos, avisoFotos, fotosDoPortfolio } from "./lib/portfolio.js";
import { seguro as seguroXlsx } from "./lib/exports.js";
import {
  artesEmbutidas, aplicarReferencia, bytesDataUrl, ehDataUrl, ehReferencia,
  extensaoDe, partesDataUrl, temArte,
} from "./lib/artes.js";
import {
  CAMPOS_RELATORIO_FINAL, normalizarRelatorioFinal, faltaParaEntregar, aplicarSugestao,
} from "./lib/relatorioEx.js";
import {
  PERIODOS as PERIODOS_MATRIZ, normalizarCurricularizacao, panoramaCurricularizacao,
} from "./lib/curricularizacao.js";
import {
  ESPACOS_PADRAO, BLOCOS as BLOCOS_ESP, INTERESSADOS, ROTULO_STATUS as ROTULO_STATUS_ESP,
  OCUPA, VIVA, normalizarEspacos, normalizarReserva, normalizarBloqueio, validarReserva,
  conflitos, impedimentos, agenda, reservaPublica, ocupacaoPorEspaco, minhaReserva,
  gruposDeOrgao, rotuloOrgao, ORGAOS_EXTERNOS,
} from "./lib/espacos.js";
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

/* ARCHÉ AP — Aulas Práticas (da PROAC). Os nomes chegam com o prefixo `ap`
   porque quase todos têm homônimo noutro setor (falta, visao, panorama). */
import {
  AP_KEY, AP_CADASTRO_KEY, AP_EQUIPE_KEY,
  CAMPOS_RELATORIO as AP_CAMPOS, MIN_FOTOS as AP_MIN_FOTOS, MAX_FOTOS as AP_MAX_FOTOS,
  MAX_EVIDENCIAS as AP_MAX_EVID, TIPOS as AP_TIPOS, tipoDe as apTipoDe, camposDo as apCamposDo,
  ROTULO_STATUS as AP_ROTULO_STATUS,
  DECISOES as AP_DECISOES, podeReabrir as apPodeReabrir,
  decisaoNoLugarDaCoordenacao as apDecisaoNoLugar, ehExtensao as apEhExtensao,
  ENTREGUE as AP_ENTREGUE,
  normalizarRelatorio as normalizarRelatorioAP, normalizarFoto as normalizarFotoAP,
  normalizarCadastro as normalizarCadastroAP, normalizarEquipe as normalizarEquipeAP,
  faltaNoRelatorio as apFalta, podeVer as apPodeVer, podeEditar as apPodeEditar,
  podeValidar as apPodeValidar, visaoDoRelatorio as apVisao, anotar as apAnotar,
  quemNoModulo as quemNoModuloAP, coordenaCurso as apCoordenaCurso,
  professoresDoSemestre as apProfessoresDoSemestre, minhasDisciplinas as apMinhasDisciplinas,
  cursoDoProfessor as apCursoDoProfessor, filtrar as apFiltrar, panorama as apPanorama,
  pendenciasCobranca as apPendenciasCobranca, ehSegunda as apEhSegunda,
  PAPEIS_COORDENACAO as AP_PAPEIS_COORD, cursosQueCoordena as apCursosQueCoordena,
} from "./lib/praticas.js";

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

/* COMPRESSÃO — a economia mais barata do sistema (varredura de ago/2026).
   O Express não comprime nada por padrão, e o Render tem franquia de banda:
   as páginas dos setores saem 3,3× a 3,7× menores e a resposta do
   `GET /api/extensao` cerca de 11× (743 KB → ~67 KB). Vale mesmo com CDN na
   frente, porque resposta de API é por usuário e nenhum CDN a guarda.
   Fica ANTES de tudo: só assim ela alcança o `express.static` e as rotas.
   O que já vem comprimido (PDF, xlsx, docx, PNG, JPEG) o próprio módulo
   pula pelo filtro padrão — recomprimir gastaria CPU sem ganhar byte. */
app.use(compression());

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

/* ======================================================================
   DIAGNÓSTICO DE BANDA — a contagem das respostas.

   O Render cobra tráfego de SAÍDA e a franquia acabou sem que ninguém
   soubesse o que a consumiu. Este middleware conta os bytes que cada
   resposta escreve, agrupados por origem (o app da Avaliação, os
   estáticos, os PDFs, as APIs…), e lib/medidor.js soma o que o servidor
   MANDA para fora — o estado indo ao Drive, os anexos, os e-mails.

   Fica no TOPO da pilha, antes de qualquer rota, porque precisa embrulhar
   a resposta antes que alguém escreva nela. É barato: dois wrappers de
   função por requisição e uma soma inteira.
   ====================================================================== */
app.use((req, res, next) => {
  let bytes = 0;
  const conta = (chunk) => {
    if (!chunk) return;
    try { bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk); }
    catch { /* chunk exótico: não conta, mas não quebra */ }
  };
  const write0 = res.write.bind(res), end0 = res.end.bind(res);
  res.write = (chunk, ...resto) => { conta(chunk); return write0(chunk, ...resto); };
  res.end = (chunk, ...resto) => {
    if (typeof chunk !== "function") conta(chunk);
    return end0(chunk, ...resto);
  };
  res.on("finish", () => {
    if (!bytes) return;
    const tipo = String(res.getHeader("content-type") || "");
    medirBanda(classificarBanda(req.path || "", tipo), bytes);
  });
  next();
});

/** GET /api/banda — o diagnóstico. Só gestor geral: é dado de operação. */
app.get("/api/banda", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (u.papel !== "gestor") return res.status(403).json({ error: "Diagnóstico restrito à gestão." });
    res.json(await diagnosticoBanda());
  } catch (e) {
    console.error("Erro no diagnóstico de banda:", e);
    res.status(500).json({ error: "Não foi possível montar o diagnóstico." });
  }
});

/** POST /api/banda/zerar — recomeça a medição num período limpo. */
app.post("/api/banda/zerar", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (u.papel !== "gestor") return res.status(403).json({ error: "Restrito à gestão." });
    await zerarBanda();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao zerar a medição:", e);
    res.status(500).json({ error: "Não foi possível zerar." });
  }
});

/**
 * A régua do perfil completo, com as duas exceções que só o servidor conhece:
 * o gestor geral não informa CPF (a conta pessoal da pró-reitoria é só de
 * gestão) e o bolsista do ICEM não informa matrícula — ele é estudante do
 * ensino médio e não tem matrícula no UNIEGO.
 *
 * A consulta ao ICEM é preguiçosa de propósito: ela lê o estado, e esta
 * função roda em TODA página de setor. Só quando a matrícula é o que falta é
 * que vale a pena perguntar se a exceção se aplica.
 */
async function faltaNoPerfilDe(u, perfil) {
  const opcoes = { gestorGeral: u?.papel === "gestor" };
  const falta = faltaNoPerfil(perfil, opcoes);
  if (!falta.some((f) => f.campo === "matricula")) return falta;
  if (!(await souBolsistaEM(u?.email))) return falta;
  return faltaNoPerfil(perfil, { ...opcoes, semMatricula: true });
}

// Setores de gestão exigem login (Avaliação Institucional continua aberta).
// /eventos/* segue PÚBLICO (hotsite, inscrição, credenciamento, assistir) —
// só a sala de gestão do ARCHÉ EV, em /eventos/gestao, pede sessão.
const AREAS_PROTEGIDAS = /^\/(extensao|pesquisa|inovacao|atas|usuarios|espacos|monitoria|praticas|relatorios|diagnostico|prototipos|assinaturas|curso)(\/|$)|^\/eventos\/gestao(\/|$)/;
app.use(async (req, res, next) => {
  // HEAD também (achado de ago/2026): o express.static responde HEAD, e a
  // guarda só de GET deixava um HEAD sem sessão confirmar a existência
  if (!["GET", "HEAD"].includes(req.method) || !AREAS_PROTEGIDAS.test(req.caminho)) return next();
  const u = await usuarioDe(req, res);   // renova a sessão de quem está usando
  if (!u) return res.redirect("/entrar?next=" + encodeURIComponent(req.originalUrl));
  if (u.papel === "pendente") {
    /* A REMOÇÃO vence até as exceções nominais. O aluno indicado na IC e o
       monitor convidado entram com conta pendente porque o convite é nominal
       — mas remover alguém que é aluno de IC não pode ser um ato sem efeito.
       Quem a gestão tirou, saiu; volta só se um gestor geral o reaprovar. */
    if (await contaRemovida(u.email)) return res.redirect("/entrar?removido=1");
    // exceção da IC: aluno indicado, avaliador ad hoc designado e bolsista
    // do ICEM entram pelo convite, que já é nominal (ver sessaoIC).
    const cpfDele = (await carregarPerfis())[u.email]?.cpf || "";
    // exceção da MONITORIA, pelo mesmo motivo: o monitor é indicado pelo
    // professor e recebe um convite por e-mail. Se a conta dele — recém-criada,
    // ainda pendente — batesse na porta, o convite levaria a uma parede, e a
    // ficha de inscrição (que é o que destrava o projeto) nunca seria
    // preenchida. Vale só para quem ESTÁ num projeto, que é convite nominal.
    const convidadoMon = req.caminho.startsWith("/monitoria")
      && (await lerMonitorias()).some((p) => monPapel(p, { email: u.email, cpf: cpfDele }) === "monitor");
    const convidado = convidadoMon || (req.caminho.startsWith("/pesquisa")
      && (participaDeAlgum(u.email, await lerProjetos(), cpfDele)
        || await souBolsistaEM(u.email)));
    if (!convidado) return res.redirect("/entrar?pendente=1");
  }
  // gestão de acessos e diagnóstico de operação são do gestor geral: deixar
  // a página abrir para depois a API recusar é mostrar porta que não abre
  if (/^\/(usuarios|diagnostico)/.test(req.caminho) && u.papel !== "gestor") return res.redirect("/");
  // Perfil incompleto: uma etapa antes de entrar no setor (decisão do dono,
  // ago/2026). Cada campo cobrado é usado em algum lugar — sem CPF a pessoa
  // não encontra os próprios projetos, sem titulação a proposta não se
  // enquadra na modalidade. Só barra quem realmente tem algo faltando, e a
  // própria tela de perfil fica de fora (senão o caminho não teria saída).
  const falta = await faltaNoPerfilDe(u, (await carregarPerfis())[u.email]);
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
// O selo do atalho /avaliador é de VISUALIZAÇÃO (decisão do dono, ago/2026):
// abre as páginas e lê as chaves da Avaliação, mas NENHUMA escrita passa —
// avaliador externo olha, não muda. Quem também tem sessão no ARCHÉ (um
// professor que por acaso abriu o atalho) mantém os próprios direitos.
const somenteLeituraNaAv = (req) => lerSelo(req)?.via === "avaliador" && !lerSessao(req);

/* Atalho público do avaliador — arche.app.br/avaliador (decisão do dono,
   ago/2026): entra SEM senha numa página EXCLUSIVA com os dois painéis do
   avaliador (Indicadores e Produção) — o avaliador fica restrito ao que vai
   avaliar; o /arche/ completo (com os acessos de submissão) continua atrás
   da portaria para quem alimenta o dossiê. O selo emitido é o de
   visualização acima: as telas abrem, nada se grava. */
app.get(["/avaliador", "/avaliador/", "/avaliador/index.html"], (_req, res) => {
  emitirSelo(res, "avaliador");
  res.sendFile(path.join(PUBLIC, "avaliador", "index.html"));
});

/* arche.app.br/editais — o MESMO documento de /ic/ (achado do dono, ago/2026).
   A vitrine nasceu como a da Iniciação Científica e hoje reúne os três
   processos: graduação, Ensino Médio e Monitoria. O endereço /ic/ FICA — ele
   já circula em grupos de professores e em ofícios, e link divulgado não se
   troca —, mas quem divulgar de agora em diante tem um que diz o que a página
   é. Serve o arquivo, não redireciona: os dois endereços são o documento. */
app.get(["/editais", "/editais/", "/editais/index.html"], (_req, res) => {
  res.sendFile(path.join(PUBLIC, "ic", "index.html"));
});

/* Como o visitante entrou na Avaliação — para a barra do topo saber que o
   selo é o de VISUALIZAÇÃO e se reduzir à navegação do avaliador (sem os
   atalhos dos setores, que só o levariam a telas de login). Devolve apenas
   o modo do próprio cookie de quem pergunta — nenhum dado de ninguém. */
app.get("/api/av/quem", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ via: lerSelo(req)?.via || null, logado: !!lerSessao(req) });
});

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
  const coordenaCursos = await cursosQueCoordenaDe(u.email);
  res.json({
    ...u, perfil: perfis[u.email] || null, temSenha: await temSenha(storage, u.email),
    // os cursos que a pessoa coordena (composição institucional + cadastro do
    // AP): é o que abre o cartão "Seu Curso" no portal e a página /curso/
    coordenaCursos,
    /* O cartão de Relatórios não é mais só de quem coordena MÓDULO: a
       coordenação de CURSO abre todas as guias recortadas ao curso dela, e o
       painel de acessos concede guias a quem não coordena nada (é o caso da
       pró-reitoria acadêmica). Sem esta bandeira o cartão ficava escondido de
       quem passou a ter o que emitir. */
    veRelatorios: alcanceDeRelatorios(u, {
      acessos: await lerAcessosRelatorios(), cursosCoordenados: coordenaCursos,
    }).length > 0,
    // o que falta para o perfil ficar completo — é o que a tela usa para
    // pedir só o que falta, em vez de mandar a pessoa reler o formulário
    perfilFalta: await faltaNoPerfilDe(u, perfis[u.email]),
  });
});

/* ---------------- FAVORITOS DA PÁGINA INICIAL ----------------
   (decisão do dono, ago/2026, junto com o layout "painéis com linhas"): a
   faixa "Os seus favoritos" fixa setores no alto do portal. A escolha é da
   CONTA — gravada aqui, vale em qualquer computador — e mora numa chave
   interna (auth-*), fora do /api/estado. Só entram endereços do catálogo:
   favorito é ATALHO, não porta — quem barra continua sendo o servidor de
   cada setor, e a tela ainda esconde o que o papel da pessoa não vê. */
const FAVORITOS_KEY = "auth-favoritos-v1";
const SETORES_FAVORITAVEIS = new Set([
  "/praticas/", "/monitoria/", "/curso/", "/pesquisa/ic/", "/extensao/",
  "/eventos/gestao/", "/atas/", "/espacos/", "/relatorios/", "/certificados/", "/arche/",
]);
app.get("/api/favoritos", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const tudo = JSON.parse((await storage.get(FAVORITOS_KEY)) || "{}");
  res.json({ favoritos: Array.isArray(tudo[u.email]) ? tudo[u.email] : [] });
});
app.post("/api/favoritos", async (req, res) => {
  const u = await usuarioDe(req);
  if (!u) return res.status(401).json({ error: "não autenticado" });
  const lista = [...new Set((Array.isArray(req.body?.favoritos) ? req.body.favoritos : [])
    .filter((h) => SETORES_FAVORITAVEIS.has(h)))].slice(0, 12);
  const tudo = JSON.parse((await storage.get(FAVORITOS_KEY)) || "{}");
  if (lista.length) tudo[u.email] = lista;
  else delete tudo[u.email];
  await storage.set(FAVORITOS_KEY, JSON.stringify(tudo));
  res.json({ ok: true, favoritos: lista });
});

/* ===================== A CÓPIA DIÁRIA DO SISTEMA ========================
   (pedido do dono, ago/2026): até aqui o ARCHÉ não tinha backup nenhum. O
   que parecia backup — o `_estado.json` no Drive — é um arquivo ÚNICO,
   reescrito centenas de vezes por dia: na hora do aperto ninguém acha "como
   estava na terça", e restaurar não é uma operação que exista.

   Agora, uma vez por dia, o estado inteiro é copiado para um arquivo COM A
   DATA NO NOME, na pasta `_backups`. Trinta dias de histórico: restaurar
   vira escolher o dia. É UMA escrita por dia (o estado tem ~1 MB), contra as
   centenas que a gravação normal já faz — não é ela que pesa na franquia.

   Três cuidados: roda de hora em hora mas só AGE se o dia ainda não tem
   cópia (deploy no meio da tarde não gera uma segunda); é
   fire-and-forget, porque backup que derruba o sistema é pior que backup
   nenhum; e guarda TUDO — inclusive as chaves internas (auth-*, sys-*, ic-*),
   que são justamente as que não saem pelo /api/estado e que ninguém
   conseguiria recuperar de outro jeito. */
/* ===================== O REPOSITÓRIO DOCUMENTAL =========================
   (decisão do dono, ago/2026: "crie um diretório 'Repositório Documental' e
   ali dentro salve os arquivos; manter ali somente a versão atual — inclua
   certificados, projetos, atas, relatórios, todo doc criado, gerado ou
   submetido no sistema").

   TUDO o que é documento passa a viver sob esta pasta, com a divisão por
   setor que a pró-reitoria já usa. O que NÃO entra aqui é a cópia diária do
   sistema (`_backups`), que não é documento — é o retrato da caderneta.

   Documento GERADO (ata, relatório, certificado, resultado) entra com
   `nomeFixo`: a versão nova SUBSTITUI a anterior, e a pasta mostra sempre a
   que vale. Documento SUBMETIDO por gente (foto, comprovante, ofício) entra
   com nome único: cada um é um documento distinto, não versão do outro. */
const REPO = "Repositório Documental";
/** O ano que organiza a pasta (pedido do dono, ago/2026: "inclua a pasta ano
    e semestre, onde for o caso"): sai do PRÓPRIO protocolo — EXT-2026-001,
    IC-2026-004 já carregam o ano —, com a data do registro como alternativa
    e o ano corrente como último recurso: pasta sem ano seria pior que ano
    aproximado. Onde o setor trabalha por SEMESTRE (aulas práticas,
    monitoria, relatórios), o que entra é o ciclo (2026-1), não o ano. */
const anoDaPasta = (codigo, data) => {
  const m = String(codigo || "").match(/(20\d{2})/);
  if (m) return m[1];
  const d = String(data || "").match(/(20\d{2})/);
  return d ? d[1] : String(new Date().getFullYear());
};
const BACKUP_PREFIXO = "_backups";

/* ============ MIGRAÇÃO DO ACERVO PARA O REPOSITÓRIO DOCUMENTAL ==========
   (pedido do dono, ago/2026): a mudança de estrutura vale para o que se
   grava DAQUI EM DIANTE — o acervo que já existe continua nas pastas antigas,
   e apagá-las quebraria o link de todo comprovante, ata e foto já enviados.
   A saída é MOVER, não apagar.

   Move-se a PASTA inteira, não arquivo por arquivo: no Drive o id de tudo o
   que está dentro NÃO muda, então nenhum link se perde — e é uma chamada de
   API por pasta em vez de milhares, que teriam milhares de chances de falhar
   pela metade.

   Duas passadas: a primeira leva as pastas de topo para dentro do
   repositório com o nome novo; a segunda desce a pasta de cada ação e de
   cada projeto para dentro do ANO, que é a organização que o dono pediu.
   Tudo roda em SIMULAÇÃO por padrão: nada se move sem alguém ter visto a
   lista antes.

   A primeira passada FUNDE em vez de renomear, e a razão é de produção: o
   Repositório Documental já vem recebendo os documentos novos desde que a
   estrutura entrou no ar, então a pasta de destino EXISTE. Renomear a antiga
   para o mesmo nome deixaria duas pastas irmãs chamadas "Atas" — o Drive
   permite, e a busca por nome passaria a achar uma delas só, com metade do
   acervo invisível. Existindo o destino, mescla-se nível a nível; arquivo de
   mesmo nome NÃO se sobrepõe (o de lá é o atual, que é o que o dono pediu
   guardar) e fica para trás, na lista do que se pode apagar. */
const MIGRACAO_REPO = [
  { de: "atas", para: "Atas" },
  { de: "extensao", para: "Extensão", porAno: "curso" },
  { de: "ic", para: "Iniciação Científica", porAno: "curso" },
  { de: "praticas", para: "Aulas Práticas" },
  { de: "monitoria", para: "Monitoria" },
  { de: "espacos", para: "Espaços" },
  { de: "perfis", para: "Assinaturas" },
  { de: "dossie", para: "Avaliação Institucional/Dossiê Docente" },
  { de: "avaliacao", para: "Avaliação Institucional/Indicadores" },
  { de: "docs-institucionais", para: "Avaliação Institucional/Documentos Institucionais" },
];

/* Funde o conteúdo de uma pasta na outra, nível a nível. Só se chama quando o
   destino JÁ EXISTE — se não existisse, mover a pasta inteira seria uma
   chamada de API em vez de milhares. Devolve quantos itens moveu e quantos
   ficaram para trás por já haver arquivo de mesmo nome no destino. */
async function fundirPasta(origem, destino, passos, simular) {
  let movidos = 0, mantidos = 0;
  const jaLa = new Map((await files.arquivos(destino)).map((f) => [f.nome, f]));
  for (const f of await files.arquivos(origem)) {
    if (jaLa.has(f.nome)) {                  // o de lá é a versão atual
      mantidos++;
      passos.push({ tipo: "duplicado", de: `${origem.join("/")}/${f.nome}` });
      continue;
    }
    if (!simular) await files.moverPasta(f.id, destino, f.nome);
    movidos++;
  }
  const subsDestino = new Set((await files.subpastas(destino)).map((s) => s.nome));
  for (const sub of await files.subpastas(origem)) {
    if (subsDestino.has(sub.nome)) {         // existe dos dois lados: desce mais um nível
      const r = await fundirPasta([...origem, sub.nome], [...destino, sub.nome], passos, simular);
      movidos += r.movidos; mantidos += r.mantidos;
    } else {
      if (!simular) await files.moverPasta(sub.id, destino, sub.nome);
      movidos++;
    }
  }
  return { movidos, mantidos };
}

async function migrarParaRepositorio({ simular = true } = {}) {
  if (!files.acharPasta || !files.moverPasta || !files.arquivos) {
    return { erro: "Este backend de arquivos não sabe mover pastas." };
  }
  const passos = [];
  for (const item of MIGRACAO_REPO) {
    const id = await files.acharPasta([item.de]);
    if (!id) continue;                       // pasta que nunca existiu
    const partes = item.para.split("/");
    const destino = [REPO, ...partes];
    const jaExiste = await files.acharPasta(destino);
    if (jaExiste) {
      const r = await fundirPasta([item.de], destino, passos, simular);
      passos.push({ tipo: "fusão", de: item.de, para: destino.join("/"),
        movidos: r.movidos, mantidos: r.mantidos });
    } else {
      passos.push({ tipo: "pasta", de: item.de, para: destino.join("/"),
        arquivosNaRaiz: await files.contarArquivos([item.de]),
        subpastas: (await files.subpastas([item.de])).length });
      /* moverPasta recebe a pasta PAI do destino e o nome que a pasta passa
         a ter — não o caminho completo, que a poria dentro de si mesma. */
      if (!simular) await files.moverPasta(id, [REPO, ...partes.slice(0, -1)], partes.at(-1));
    }
  }

  /* Segunda passada: dentro de Extensão/<curso> e Iniciação Científica/<curso>
     as pastas de ação/projeto descem para o ANO (EXT-2026-001 → 2026/EXT-2026-001).
     Só depois da primeira passada — é lá que elas estão agora. */
  for (const item of MIGRACAO_REPO.filter((x) => x.porAno === "curso")) {
    /* SIMULANDO, a pasta ainda está no lugar antigo — é de lá que se lê para
       a lista mostrar o quadro completo; EXECUTANDO, ela já foi movida. */
    const base = simular ? [item.de] : [REPO, ...item.para.split("/")];
    for (const curso of await files.subpastas(base)) {
      for (const pasta of await files.subpastas([...base, curso.nome])) {
        /* Pasta de ANO já está no lugar; `propostas` fica onde está — ela
           junta anos diferentes, e enfiá-la num ano só seria escrever no
           caminho uma data que metade do que está lá dentro desmente. */
        if (/^\d{4}$/.test(pasta.nome) || pasta.nome === "propostas") continue;
        const ano = anoDaPasta(pasta.nome);
        const alvo = [...base, curso.nome, ano];
        /* O ano já tem uma pasta com este nome (a ação recebeu documento novo
           depois que a estrutura entrou no ar): funde, em vez de criar uma
           irmã de mesmo nome — ou de deixar a antiga encalhada FORA do ano,
           que é onde ninguém iria procurá-la. */
        if ((await files.subpastas(alvo)).some((s) => s.nome === pasta.nome)) {
          const r = await fundirPasta([...base, curso.nome, pasta.nome],
            [...alvo, pasta.nome], passos, simular);
          passos.push({ tipo: "fusão", de: `${item.para}/${curso.nome}/${pasta.nome}`,
            para: `${item.para}/${curso.nome}/${ano}/${pasta.nome}`,
            movidos: r.movidos, mantidos: r.mantidos });
          continue;
        }
        passos.push({ tipo: "ano", de: `${item.para}/${curso.nome}/${pasta.nome}`,
          para: `${item.para}/${curso.nome}/${ano}/${pasta.nome}` });
        if (!simular) await files.moverPasta(pasta.id, alvo, pasta.nome);
      }
    }
  }

  /* O que sobrou para o dono apagar — foi ele quem pediu a lista ("depois me
     liste o que preciso apagar"). São as pastas antigas: quase todas ficam
     VAZIAS (a mudança foi de endereço, não de conteúdo), e as que ainda
     têm arquivo têm exatamente o que a fusão deixou para trás por já existir
     versão atual no destino. O sistema não as apaga sozinho: apagar em nome
     de alguém o acervo inteiro é o tipo de ato que se confere antes. */
  const sobras = [];
  for (const item of MIGRACAO_REPO) {
    if (!(await files.acharPasta([item.de]))) continue;
    sobras.push({ pasta: item.de, arquivos: await contarFundo([item.de]) });
  }
  return { simulado: simular, passos, total: passos.length, sobras };
}

/** Quantos arquivos há na pasta e em tudo abaixo dela (a rasa não bastaria:
    a pasta antiga só é segura de apagar se estiver vazia até o fim). */
async function contarFundo(partes, nivel = 0) {
  if (nivel > 8) return 0;                   // acervo é raso; laço não fica de pé
  let n = (await files.arquivos(partes)).length;
  for (const sub of await files.subpastas(partes)) {
    n += await contarFundo([...partes, sub.nome], nivel + 1);
  }
  return n;
}

/** A migração do acervo — só gestor geral, e SIMULADA por padrão. */
app.post("/api/repositorio/migrar", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  try {
    const simular = req.body?.executar !== true;
    const r = await migrarParaRepositorio({ simular });
    if (!simular) console.log(`[repositório] migração executada por ${g.email}: ${r.total} passos`);
    res.json(r);
  } catch (e) {
    console.error("Erro na migração do repositório:", e);
    res.status(500).json({ error: "Não foi possível migrar agora: " + e.message });
  }
});

/**
 * Arquiva no Repositório Documental um documento GERADO pelo sistema —
 * certificado, relatório, resultado, anexo de edital. É fire-and-forget: o
 * documento já foi entregue a quem pediu, e uma falha ao arquivar não pode
 * derrubar o download. `nomeFixo` faz a versão nova substituir a anterior,
 * que é o que o dono pediu: na pasta dele vale a versão atual.
 */
function arquivarDocumento({ buffer, nome, pasta }) {
  if (!buffer?.length || !nome || !pasta) return;
  files.save({ buffer, originalName: nome, prefix: `${REPO}/${pasta}`, nomeFixo: true })
    .catch((e) => console.error(`[repositório] ${pasta}/${nome}:`, e.message));
}
const BACKUP_KEY = "sys-backups-v1";     // o registro das cópias (chave interna)
const BACKUP_DIAS = 30;
async function backupDoDia() {
  const hoje = new Date().toISOString().slice(0, 10);       // AAAA-MM-DD
  const registro = JSON.parse((await storage.get(BACKUP_KEY)) || "[]");
  // o dia já tem cópia? (a varredura é horária; a cópia é uma por dia)
  if (registro.some((b) => b?.dia === hoje)) return null;

  const chaves = await storage.list();
  const dump = {};
  for (const c of chaves) dump[c] = await storage.get(c);
  const buffer = Buffer.from(JSON.stringify({
    gerado: new Date().toISOString(), chaves: chaves.length, estado: dump,
  }), "utf8");
  const salvo = await files.save({
    buffer, originalName: `arche-sistema-${hoje}.json`,
    contentType: "application/json", prefix: BACKUP_PREFIXO,
  });
  registro.push({ dia: hoje, fileId: salvo.fileId, nome: salvo.name,
    bytes: buffer.length, chaves: chaves.length, em: new Date().toISOString() });
  console.log(`[backup] cópia de ${hoje}: ${chaves.length} chaves, ${Math.round(buffer.length / 1024)} KB`);

  /* Passados os 30 dias, a mais velha sai — senão o histórico cresce para
     sempre num Drive que é do dono, não do sistema. A que não puder ser
     apagada continua no registro, para não virar arquivo órfão esquecido. */
  const sobra = registro.length - BACKUP_DIAS;
  const mantidas = [];
  for (const [i, b] of registro.entries()) {
    if (i < sobra && await files.remove?.(b.fileId).catch(() => false)) continue;
    mantidas.push(b);
  }
  await storage.set(BACKUP_KEY, JSON.stringify(mantidas));
  return salvo;
}

/* O gestor geral baixa a cópia do dia sem esperar a varredura — é o botão
   que transforma "existe backup" em "eu tenho o backup na mão". */
app.get("/api/backup/agora", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  try {
    const chaves = await storage.list();
    const dump = {};
    for (const c of chaves) dump[c] = await storage.get(c);
    const corpo = JSON.stringify({
      gerado: new Date().toISOString(), chaves: chaves.length, estado: dump,
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition",
      `attachment; filename="arche-sistema-${new Date().toISOString().slice(0, 10)}.json"`);
    res.end(corpo);
  } catch (e) {
    console.error("Erro no backup sob demanda:", e);
    res.status(500).send("Não foi possível gerar a cópia agora.");
  }
});

/* -------------------- FEEDBACK (a joaninha do canto) --------------------
   (pedido do dono, ago/2026: "um ícone de reportar bug ou sugestão, algo
   discreto que fique fixo na página"): o botão flutuante manda o relato
   para cá — problema ou sugestão, com a página em que a pessoa estava. O
   relato vai por E-MAIL à PROPPEX (fire-and-forget) e fica GUARDADO em
   sys-feedback-v1 (chave interna, teto 300): e-mail que falha não perde o
   relato, e o gestor geral relê tudo em GET /api/feedback. Só usuário
   LOGADO relata — o formulário diz quem mandou, e relato anônimo numa rota
   pública viraria caixa de spam. */
const FEEDBACK_KEY = "sys-feedback-v1";
const feedbackRecentes = new Map();   // e-mail → timestamp do último envio
app.post("/api/feedback", async (req, res) => {
  try {
    const u = await usuarioDe(req);
    if (!u) return res.status(401).json({ error: "Faça login para enviar." });
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const texto = String(req.body?.texto || "").trim().slice(0, 2000);
    if (texto.length < 5) return res.status(400).json({ error: "Escreva o que aconteceu (ou a sua ideia)." });
    const tipo = req.body?.tipo === "sugestao" ? "sugestao" : "bug";
    const pagina = String(req.body?.pagina || "").slice(0, 300);
    // um relato a cada 30 s por conta: o duplo clique não vira dois e-mails
    const antes = feedbackRecentes.get(u.email) || 0;
    if (Date.now() - antes < 30000) return res.status(429).json({ error: "Calma — o relato anterior acabou de sair. Espere meio minuto." });
    feedbackRecentes.set(u.email, Date.now());
    const perfil = (await carregarPerfis())[u.email] || {};
    const registro = {
      tipo, texto, pagina, email: u.email, nome: perfil.nome || u.nome || "",
      em: new Date().toISOString(),
    };
    const lista = JSON.parse((await storage.get(FEEDBACK_KEY)) || "[]");
    lista.unshift(registro);
    await storage.set(FEEDBACK_KEY, JSON.stringify(lista.slice(0, 300)));
    // o e-mail avisa; a gravação acima é o que garante que nada se perde
    import("./lib/mailer.js")
      .then(({ enviarEmail, emailFeedback }) => enviarEmail(emailFeedback(registro)))
      .catch((e) => console.error("[feedback] e-mail não enviado:", e.message));
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro no feedback:", e);
    res.status(500).json({ error: "Não foi possível enviar agora." });
  }
});
app.get("/api/feedback", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  res.json({ relatos: JSON.parse((await storage.get(FEEDBACK_KEY)) || "[]") });
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
  const falta = await faltaNoPerfilDe(u,
    { ...b, funcao: normalizarFuncao(b.funcao), cpf: soDigitos(b.cpf) });
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
    if (antes.cpf && novo !== antes.cpf && u.papel !== "gestor") {
      // A confusão mais comum (relatada por um professor em ago/2026): a
      // pessoa recebe o convite de OUTRA — o aluno indicado, o monitor — e
      // tenta cadastrá-la no próprio perfil. A mensagem tem de dizer de quem
      // é a tela e por onde a outra pessoa entra, senão vira ligação para a
      // coordenação.
      return res.status(400).json({
        error: `Esta tela é o perfil da SUA conta (${u.email}), e o CPF já gravado nela só a PROPPEX `
          + "altera. Se você quer cadastrar OUTRA pessoa, é ela quem entra no portal com o e-mail dela "
          + "e preenche o próprio perfil — o convite que você recebeu por e-mail deve ser encaminhado a "
          + "ela. Se o CPF gravado aqui está errado, peça a correção à PROPPEX.",
      });
    }
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
      return res.status(409).json({
        error: `Este CPF já está cadastrado na conta ${mascararEmail(dono[0])}. Se ela é sua, entre por `
          + "ela — os seus projetos estão lá. Se você tem duas contas no portal, a PROPPEX junta as duas "
          + "sem perder nada (gestão de acessos → juntar cadastros). E se você está tentando cadastrar "
          + "outra pessoa, é ela quem entra com o e-mail dela e preenche o próprio perfil.",
      });
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
      prefix: `${REPO}/Assinaturas/${slug(u.email)}`,
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
    res.json({ ok: true, papel, removido: papel === "pendente" && await contaRemovida(email) });
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
    // exato: o código da conta X chega na caixa de X — a tradução da conta
    // pessoal para a institucional trancaria a conta pessoal do lado de fora
    exato: true,
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
  res.json({ ok: true, papel, temSenha: await temSenha(storage, email),
    removido: papel === "pendente" && await contaRemovida(email) });
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
  await enviarAviso("auth-cadastro-novo", {
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
/** A gestão tirou esta conta do portal? É a única razão de um acesso não
    voltar sozinho — e por isso a tela de entrada precisa poder dizê-lo, em
    vez de prometer uma "liberação em breve" que não virá. */
async function contaRemovida(email) {
  const usuarios = await carregarUsuarios(storage);
  return (usuarios.removidos || []).includes(String(email || "").toLowerCase());
}

async function aprovarCadastroNovo(email, nome) {
  const e = String(email || "").toLowerCase();
  const usuarios = await carregarUsuarios(storage);
  if (papelDe(e, usuarios) !== "pendente") return papelDe(e, usuarios);
  /* Quem a gestão removeu não volta por entrar de novo — era o que
     esvaziava o botão "remover acesso" (achado de ago/2026). Só um gestor
     geral o traz de volta, em /usuarios/. */
  if ((usuarios.removidos || []).includes(e)) return "pendente";
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
    /* O coordenador DE CURSO das aulas práticas não tem módulo nenhum em
       `modulosDe` — a coordenação dele vive no cadastro do ARCHÉ AP —, e o
       corte por `modulos` o deixava sem sino: a fila de validação dele não
       chegava a ser montada. Por isso a saída rápida consulta os dois. */
    const quemAP1 = quemNoModuloAP({ email: u.email, gestao: gerePraticas(u) }, await lerEquipeAP());
    if (!u.modulos.length && !quemAP1.cursos.length) return res.json({ alertas: [], total: 0 });
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
        /* INFORMATIVO, não decisão (pedido do dono, ago/2026): a aprovação já
           aconteceu — isto é aviso do que o portal fez, não fila de trabalho.
           Por isso ele fica fora do painel "O que espera você", que passou a
           mostrar só o que aguarda uma decisão dela. */
        alertas.push({ setor: "Acessos", n: novos.length, link: "/usuarios/", info: true,
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
      // pedido de ENCERRAMENTO: o projeto ficou parado no meio da vigência e
      // só a PROPPEX o encerra — pedido que ninguém vê deixa o aluno preso
      const encerr = projetos.filter((p) => pedidoEncerramentoPendente(p)).length;
      if (encerr) alertas.push({ setor: "Pesquisa · IC", n: encerr, link: "/pesquisa/ic/",
        texto: `${encerr} pedido(s) de encerramento de projeto aguardando validação` });
    }

    if (u.modulos.includes("extensao")) {
      const acoes = await lerAcoes();
      /* O que espera DECISÃO, no vocabulário único (lib/situacao.js): projeto
         em preenchimento não é fila da PROPPEX — o evento cadastrado pelo
         assistente nasce `submetida` com o projeto pela metade, e contá-lo
         aqui punha na caixa da pró-reitoria um rascunho que ninguém submeteu
         de verdade. */
      const porEtapa = (e) => acoes.filter((a) => situacaoDaAcao(a).etapa === e).length;
      const submetidas = porEtapa("aguardando-validacao");
      if (submetidas) alertas.push({ setor: "Extensão", n: submetidas, link: "/extensao/",
        texto: `${submetidas} projeto(s) aguardando validação` });
      // o relatório do EVENTO não entra aqui: quem o valida é o mesmo ato que
      // valida o encerramento, e esse já tem o seu alerta — duas linhas para
      // a mesma decisão fariam a pró-reitoria procurar uma pendência a mais
      const relatorios = acoes.filter((a) => !a.evento
        && situacaoDaAcao(a).etapa === "encerramento-em-validacao").length;
      if (relatorios) alertas.push({ setor: "Extensão", n: relatorios, link: "/extensao/",
        texto: `${relatorios} relatório(s) final(is) aguardando validação` });
    }

    if (u.modulos.includes("atas")) {
      const atas = await lerAtas();
      const deAtas = gerarAlertas(atas);
      /* Também informativo: quem regulariza o registro é o ÓRGÃO, não a
         pró-reitoria — ela cobra, e a cobrança não é um clique nesta tela.
         É estado crônico do acervo, e no painel de decisões ele empurrava
         para fora o que de fato espera por ela. */
      if (deAtas.length) alertas.push({ setor: "Atas", n: deAtas.length, link: "/atas/", info: true,
        texto: `${deAtas.length} órgão(s) fora de dia com o registro de atas` });
      // decisão tomada em ata com prazo vencido é o que mais se perde de vista
      const vencidos = encaminhamentos(atas).filter((e) => e.atrasado);
      if (vencidos.length) alertas.push({ setor: "Atas", n: vencidos.length, link: "/atas/",
        texto: `${vencidos.length} encaminhamento(s) com prazo vencido`,
        detalhe: vencidos.slice(0, 3).map((e) => `${e.orgao}: ${e.acao}`.slice(0, 70)).join(" · ") });
    }

    if (u.modulos.includes("eventos")) {
      // o EV é setor de OPERAÇÃO: o que trava aqui é evento cadastrado que
      // não foi aprovado (sem número não há página no ar) e evento aprovado
      // com a página ainda fechada — os dois deixam gente sem se inscrever
      const acoes = await lerAcoes();
      const doEv = acoes.filter((a) => a.evento && !a.origemPapel);
      // reprovada não espera aprovação de ninguém — sem este recorte ela
      // ficaria PRESA no sino para sempre (revisão adversarial, ago/2026)
      const semAprovacao = doEv.filter((a) => !a.numeroAcao && a.status !== "reprovada").length;
      if (semAprovacao) alertas.push({ setor: "Eventos", n: semAprovacao, link: "/eventos/gestao/",
        texto: `${semAprovacao} evento(s) cadastrado(s) aguardando aprovação da ação` });
      const naoPublicados = doEv.filter((a) => a.numeroAcao && !a.evento?.ativo).length;
      if (naoPublicados) alertas.push({ setor: "Eventos", n: naoPublicados, link: "/eventos/gestao/",
        texto: `${naoPublicados} evento(s) aprovado(s) com a página ainda não publicada` });
      // encerramento pedido pela coordenação: enquanto a PROPPEX não valida,
      // NINGUÉM recebe certificado — é a fila mais sensível do setor
      const aEncerrar = doEv.filter((a) => situacaoEncerramento(a) === "solicitado");
      if (aEncerrar.length) alertas.push({ setor: "Eventos", n: aEncerrar.length, link: "/eventos/gestao/",
        texto: `${aEncerrar.length} encerramento(s) de evento aguardando validação — os certificados dependem disso`,
        detalhe: aEncerrar.slice(0, 3).map((a) => (a.proposta?.nomeAtividade || a.numeroAcao || "").slice(0, 70)).join(" · ") });
    }

    /* AULAS PRÁTICAS: o que espera validação. O alcance aqui é por CURSO,
       não por módulo — o coordenador de Enfermagem não vê a fila de Direito
       —, e por isso a lista se monta do cadastro do próprio módulo. */
    {
      const quemAP2 = quemAP1;
      if (quemAP2.gestao || quemAP2.cursos.length) {
        const esperando = (await lerPraticas()).filter((r) =>
          r.status === "enviado" && apPodeVer(r, quemAP2));
        if (esperando.length) {
          const ce = esperando.filter((r) => apEhExtensao(r)).length;
          alertas.push({ setor: "Atividades Curriculares", n: esperando.length, link: "/praticas/",
            texto: `${esperando.length} relatório(s) aguardando validação`
              + (ce ? ` (${ce} de extensão curricular)` : ""),
            detalhe: esperando.slice(0, 6)
              .map((r) => `${r.disciplina} · ${r.professor?.nome || r.professor?.email}`)
              .join(" · ").slice(0, 96),
            acao: "Validar ou devolver, na guia Relatórios." });
        }
      }
    }
    if (u.modulos.includes("monitoria")) {
      /* O calendário passou o edital publicado (decisão do dono, ago/2026):
         o ciclo vira sozinho em 01/01 e 01/07, o edital não. Sem este aviso,
         a PROPPEX só descobriria pelo professor que tentou submeter. */
      const semEdital = monCicloSemEdital();
      if (semEdital) {
        alertas.push({ setor: "Monitoria", n: 1, link: "/monitoria/",
          texto: `O ciclo ${semEdital} começou e ainda não tem edital publicado`,
          detalhe: `O edital vigente é o ${monEditalVigente().numero} (ciclo `
            + `${monEditalVigente().ciclo}). Enquanto o novo não sair, os projetos deste `
            + "semestre não podem ser submetidos.",
          acao: "Publicar o edital do ciclo corrente." });
      }
      // a monitoria tem prazo curto e três filas diferentes; o sino separa a
      // que é da PROPPEX (analisar e homologar) do que ela precisa COBRAR
      const projs = await lerMonitorias();
      const emAnalise = projs.filter((p) => p.status === "submetido").length;
      if (emAnalise) alertas.push({ setor: "Monitoria", n: emAnalise, link: "/monitoria/",
        texto: `${emAnalise} projeto(s) de monitoria aguardando análise` });
      const aHomologar = projs.reduce((n, p) => n
        + (p.monitores || []).filter((m) => m.relatorio?.status === "validado").length, 0);
      if (aHomologar) alertas.push({ setor: "Monitoria", n: aHomologar, link: "/monitoria/",
        texto: `${aHomologar} relatório(s) validado(s) aguardando homologação` });
      const atrasadas = monPendencias(projs).filter((x) => x.atraso > 0);
      if (atrasadas.length) alertas.push({ setor: "Monitoria", n: atrasadas.length, link: "/monitoria/",
        texto: `${atrasadas.length} pendência(s) de monitoria em atraso`,
        detalhe: atrasadas.slice(0, 3).map((x) => `${x.quem || ""}: ${x.disciplina || ""}`).join(" · ") });
    }

    if (u.modulos.includes("espacos")) {
      // pedido de espaço tem prazo curto por natureza: quem pede o auditório
      // para semana que vem precisa da resposta esta semana
      const reservas = await lerReservas();
      const aguardando = reservas.filter((r) => r.status === "solicitada").length;
      if (aguardando) alertas.push({ setor: "Espaços", n: aguardando, link: "/espacos/",
        texto: `${aguardando} pedido(s) de reserva aguardando confirmação` });
      // encaminhada é o degrau da PROPPEX: só o gestor geral a resolve
      const naProppex = reservas.filter((r) => r.status === "encaminhada").length;
      if (naProppex && geral) alertas.push({ setor: "Espaços", n: naProppex, link: "/espacos/",
        texto: `${naProppex} reserva(s) encaminhada(s) para decisão da PROPPEX` });
    }

    /* MARCAR COMO VISTO (pedido do dono, ago/2026: "tem coisa ali que está só
       ocupando espaço"). A marca é do FATO, não do alerta: guarda-se a
       assinatura (setor + texto COM os números), e por isso o alerta volta
       sozinho quando o número muda — marcar "58 cadastros novos" como visto
       não esconde os 60 de amanhã, que são outro fato. A `chave` é o texto
       com os números apagados: é ela que identifica o TIPO de alerta, para
       "mostrar de novo" saber o que reabrir. */
    const vistos = (await lerAlertasVistos())[u.email] || {};
    for (const a of alertas) {
      a.chave = chaveDeAlerta(a);
      a.assinatura = assinaturaDeAlerta(a);
      a.visto = vistos[a.chave]?.assinatura === a.assinatura;
    }
    const abertos = alertas.filter((a) => !a.visto);
    res.json({
      alertas: abertos,
      total: abertos.reduce((s, a) => s + (a.n || 1), 0),
      // os que a pessoa marcou como vistos: a tela oferece revê-los
      vistos: alertas.filter((a) => a.visto).length,
    });
  } catch (e) {
    console.error("Erro nos alertas:", e);
    res.status(500).json({ error: "Falha ao montar os alertas" });
  }
});

/* A identidade de um alerta, derivada do próprio texto: a `chave` é o TIPO
   (números apagados) e a `assinatura` é o FATO (números incluídos). Derivar,
   em vez de carimbar em cada um dos vinte pontos que empilham alerta, é o que
   mantém a marca funcionando para o alerta que alguém acrescentar amanhã. */
const chaveDeAlerta = (a) => `${a.setor}|${String(a.texto || "").replace(/\d+/g, "#")}`.slice(0, 200);
const assinaturaDeAlerta = (a) => `${a.setor}|${String(a.texto || "")}`.slice(0, 300);

const ALERTAS_VISTOS_KEY = "sys-alertas-vistos-v1";
async function lerAlertasVistos() {
  try { return JSON.parse((await storage.get(ALERTAS_VISTOS_KEY)) || "{}") || {}; } catch { return {}; }
}

/** POST /api/alertas/visto — marca (ou desmarca) o que já foi visto. */
app.post("/api/alertas/visto", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "não autenticado" });
    const mapa = await lerAlertasVistos();
    const meu = mapa[u.email] || {};
    if (req.body?.limpar) {
      // "mostrar de novo": some com todas as marcas desta pessoa
      delete mapa[u.email];
    } else {
      const chave = String(req.body?.chave || "").slice(0, 200);
      const assinatura = String(req.body?.assinatura || "").slice(0, 300);
      if (!chave || !assinatura) return res.status(400).json({ error: "Alerta não identificado." });
      meu[chave] = { assinatura, em: new Date().toISOString() };
      // teto: o registro é conveniência, não histórico
      const chaves = Object.keys(meu);
      if (chaves.length > 60) for (const k of chaves.slice(0, chaves.length - 60)) delete meu[k];
      mapa[u.email] = meu;
    }
    await storage.set(ALERTAS_VISTOS_KEY, JSON.stringify(mapa));
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao marcar o alerta como visto:", e);
    res.status(500).json({ error: "Não foi possível marcar." });
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
      // arquivo dos editais de MONITORIA (o programa passou à PROPPEX em
      // 2026; os anteriores são da DIAC/FACEG e ficam como foram publicados)
      editaisMonitoria: editaisMonitoriaParaLista({
        publicados: await resultadosMonitoriaPublicados(), ciclosDoArquivo: ciclosDoArquivoMon() }),
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
      fase: pub.fase || "final", assinaturas: await assinaturasParaPdf(),
    });
    arquivarDocumento({ buffer, pasta: `Iniciação Científica/Resultados/${anoDaPasta(numero)}`,
      nome: `resultado-${slug(numero)}-${slug(pub.fase || "final")}.pdf` });
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
    const buffer = await gerarResultadoEMPdf({ turma, bolsistas, emitidoPor: "",
      fase: pub.fase || "final", assinaturas: await assinaturasParaPdf() });
    arquivarDocumento({ buffer, pasta: `Iniciação Científica/Resultados/${anoDaPasta(turma.edital, turma.ciclo)}`,
      nome: `resultado-icem-${slug(turma.edital)}-${slug(pub.fase || "final")}.pdf` });
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
      await enviarAviso("ic-convite-professores", {
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
  /* Remover é uma DECISÃO, e decisão dura (ago/2026): quem sai fica na lista
     de removidos e não volta sozinho no login seguinte. Reaprovar, promover
     ou designar coordenação desfaz a remoção — são justamente os atos de
     quem quer a pessoa de volta. Gestor fixo não se remove. */
  if (acao === "remover" && ehGestorFixo(e))
    return res.status(400).json({ error: "As contas da pró-reitoria não se removem." });
  u.removidos = (u.removidos || []).filter((x) => x !== e);
  if (acao === "remover") u.removidos.push(e);
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

/** As funções que fazem o portal tratar alguém como docente ou coordenação —
    é o que a etiqueta de conta externa aponta para conferência. */
const DECLARAM_DOCENCIA = ["professor", "professor-pesquisador", "coord-curso", "coord-pedagogico",
  "coord-pesquisa", "coord-extensao", "coord-acao-comunitaria", "coord-ensino", "coord-politicas"];

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
        /* CONTA EXTERNA (pedido do dono, ago/2026): quem entrou por um e-mail
           que não é o institucional e se DECLAROU docente ou coordenação. A
           declaração não concede nada — o papel no sistema vem das listas
           daqui, e coordenação de módulo só o gestor geral designa —, mas é
           por ela que os setores tratam a pessoa como professora. Como o
           cadastro é aberto a qualquer e-mail (é o que permite ao professor
           sem @uniego trabalhar), a conferência da PROPPEX é DEPOIS: esta
           etiqueta é o que a torna possível sem ler e-mail por e-mail. */
        externa: !String(c.email || "").endsWith("@uniego.edu.br"),
        declarouDocencia: DECLARAM_DOCENCIA.includes(normalizarFuncao(perfil.funcao)),
        removido: (usuarios.removidos || []).includes(c.email),
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
/**
 * O motor da fusão — compartilhado entre a rota da gestão e a fusão de
 * arranque (pedido do dono, ago/2026). `simular: true` devolve só o resumo.
 * Mesma sequência de sempre: projetos, atas e ações primeiro; o cadastro por
 * último, para uma falha no meio não deixar a pessoa sem conta E sem registros.
 */
async function executarFusao({ manter, remover, por, simular = false, destinoSemPerfil = false }) {
  const [perfis, usuarios] = await Promise.all([carregarPerfis(), carregarUsuarios(storage)]);
  let impedimento = podeFundir(
    { email: manter, nome: perfis[manter]?.nome, cpf: perfis[manter]?.cpf },
    { email: remover, nome: perfis[remover]?.nome, cpf: perfis[remover]?.cpf },
  );
  /* Fusão de arranque com o destino ainda SEM perfil (o caso Claudia,
     ago/2026): a pessoa não CONSEGUE preencher o perfil da conta nova — o
     CPF barra por já estar na conta antiga — e o freio dos nomes exigiria
     um nome que não tem como existir. Quem identificou o destino foi o
     pedido explícito do dono; o freio só se dispensa quando o destino
     realmente não tem nome nenhum gravado. */
  if (impedimento && destinoSemPerfil && !perfis[manter]?.nome
    && /nome preenchido/.test(impedimento)) impedimento = "";
  if (impedimento) return { error: impedimento };
  if (ehGestorFixo(remover))
    return { error: "Conta de gestor geral fixo não se funde — ela é a identidade da pró-reitoria." };

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
  if (simular) return { resumo };

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
  log.push({ em: new Date().toISOString(), por, ...resumo, perfilRemovido: removido });
  await storage.set(FUSOES_KEY, JSON.stringify(log.slice(-200)));
  await storage.flush?.();
  console.log(`[usuarios] ${remover} fundido em ${manter} por ${por}: `
    + `${nProjetos} projeto(s), ${nAcoes} ação(ões), ${nAtas} ata(s)`);
  return { resumo };
}

app.post("/api/usuarios/fundir", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const manter = String(req.body?.manter || "").trim().toLowerCase();
  const remover = String(req.body?.remover || "").trim().toLowerCase();
  const simular = req.body?.simular === true;
  const r = await executarFusao({ manter, remover, por: g.email, simular });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(simular ? { simulado: true, ...r.resumo } : { ok: true, ...r.resumo });
});

/* Fusões pedidas pelo dono, executadas no ARRANQUE (ago/2026): "a professora
   Claudia Santos está com duas contas — unifique em uma; ela quer o e-mail
   docente.evangelicagoianesia.edu.br". A conta que SAI é conhecida (o
   pré-cadastro do edital 01/2026, claudiadtds@gmail.com — e-mail, nome e CPF
   vieram do formulário); a que FICA se encontra pelo domínio docente + nome
   ou CPF, porque endereço de e-mail não se adivinha. Se houver zero ou mais
   de uma candidata, NADA acontece e o pedido fica de pé para o próximo
   arranque — fundir a conta errada seria pior que esperar. A marca só grava
   com a fusão feita (ou com a origem já inexistente, que encerra o pedido). */
async function fundirContasSolicitadas() {
  const PEDIDOS = [{
    marca: "sys-fusao-claudia-v1",
    remover: "claudiadtds@gmail.com",
    dominioDestino: "@docente.evangelicagoianesia.edu.br",
    nome: ["claudia", "santos"],
    cpf: "62927485100",
  }];
  for (const f of PEDIDOS) {
    try {
      if (await storage.get(f.marca)) continue;
      const perfis = await carregarPerfis();
      if (!perfis[f.remover]) {
        // a origem já não existe (o pré-cadastro pode ter sido transferido
        // pela própria pessoa ao informar o CPF) — não há o que fundir
        console.log(`[fusao] ${f.marca}: ${f.remover} não existe — pedido encerrado`);
        await storage.set(f.marca, JSON.stringify({ em: new Date().toISOString(), resultado: "origem-inexistente" }));
        continue;
      }
      const cpfLimpo = String(f.cpf || "").replace(/\D/g, "");
      /* A conta de destino pode existir SEM perfil (a pessoa não consegue
         salvá-lo: o CPF barra por estar na conta antiga — foi o que o print
         do dono mostrou). Por isso a varredura cobre todas as contas que o
         portal conhece — perfis, listas de acesso e cadastros novos — e casa
         pelo nome do perfil, pelo CPF ou pelo PRÓPRIO ENDEREÇO (o primeiro
         nome na parte local do e-mail do domínio institucional). */
      const usuarios = await carregarUsuarios(storage);
      let novos = [];
      try { novos = JSON.parse((await storage.get(CADASTROS_KEY)) || "[]"); } catch { novos = []; }
      const conhecidas = new Set([
        ...Object.keys(perfis),
        ...(usuarios.aprovados || []), ...(usuarios.pendentes || []),
        ...Object.keys(usuarios.coordenadores || {}),
        ...novos.map((c) => String(c?.email || "")),
      ].map((e) => String(e || "").trim().toLowerCase()).filter(Boolean));
      const primeiroNome = (f.nome || [])[0] || "";
      const candidatas = [...conhecidas].filter((e) => e.endsWith(f.dominioDestino) && (
        f.nome.every((t) => chaveNome(perfis[e]?.nome).includes(t))
        || (cpfLimpo && String(perfis[e]?.cpf || "").replace(/\D/g, "") === cpfLimpo)
        || (primeiroNome && e.split("@")[0].includes(primeiroNome))));
      if (candidatas.length !== 1) {
        console.log(`[fusao] ${f.marca}: ${candidatas.length} conta(s) candidata(s) no domínio`
          + ` (${candidatas.join(", ") || "nenhuma"}) — aguardando o próximo arranque`);
        continue;
      }
      const r = await executarFusao({ manter: candidatas[0], remover: f.remover,
        por: "arranque (pedido do dono)", destinoSemPerfil: !perfis[candidatas[0]]?.nome });
      if (r.error) { console.error(`[fusao] ${f.marca}: ${r.error}`); continue; }
      await storage.set(f.marca, JSON.stringify({ em: new Date().toISOString(), ...r.resumo }));
      await storage.flush?.();
    } catch (e) {
      console.error(`[fusao] ${f.marca}:`, e.message);
    }
  }
}

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
// `extensao-config-` guarda a SEQUÊNCIA OFICIAL do Número da Ação: ela só é
// lida e gravada pelo servidor (a emissão saiu do formulário em ago/2026), e
// o prefixo `extensao-` a deixava gravável por qualquer conta aprovada —
// zerar a sequência faria a próxima aprovação emitir um número já em uso, e
// número emitido não se desfaz (achado da varredura de ago/2026).
const CHAVES_INTERNAS = /^(auth-|sys-|atas-|ic-|ex-|esp-|mon-|ap-|extensao-config-)/;

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
  if (somenteLeituraNaAv(req)) return false;     // o atalho /avaliador só olha
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

/* O RELATÓRIO DE PRODUÇÃO DOCENTE em PDF (pedido do dono, ago/2026: "tem
   como ele vir com os elementos gráficos, como fotos, o quadro de produções,
   o regime de trabalho, etc? pra ficar bonito"). O botão do dossiê gerava o
   documento no NAVEGADOR, com bibliotecas de CDN e sem o timbre — agora ele
   sai daqui, do mesmo gerador dos demais documentos oficiais, lendo o dossiê
   gravado. A portaria é a MESMA das páginas e das chaves `dossie-*` no
   /api/estado (leitura: sessão OU selo da Avaliação) — o relatório não conta
   nada que essas rotas já não entreguem. */
const CURSOS_AV = {
  administracao: "Administração", agronomia: "Agronomia", contabeis: "Ciências Contábeis",
  direito: "Direito", "educacao-fisica": "Educação Física", enfermagem: "Enfermagem",
  "engenharia-civil": "Engenharia Civil", "engenharia-mecanica": "Engenharia Mecânica",
  "engenharia-software": "Engenharia de Software", "medicina-veterinaria": "Medicina Veterinária",
  odontologia: "Odontologia", psicologia: "Psicologia",
};
app.get("/api/avaliacao/producao.pdf", async (req, res) => {
  try {
    if (!liberadoNaAv(req))
      return res.status(403).send("Acesso restrito — entre no portal ou use o link de acesso da Avaliação.");
    const curso = String(req.query.curso || "").trim().toLowerCase();
    const cursoNome = CURSOS_AV[curso];
    if (!cursoNome) return res.status(400).send("Curso desconhecido.");
    const bruto = await storage.get(`dossie-${curso}-v1`);
    if (!bruto) return res.status(404).send("O dossiê deste curso ainda não tem dados gravados no servidor.");
    let dossie;
    try { dossie = JSON.parse(bruto); } catch { return res.status(500).send("O dossiê gravado não pôde ser lido."); }
    const { gerarProducaoDocentePdf } = await import("./lib/pdf.js");
    const buffer = await gerarProducaoDocentePdf({ curso, cursoNome, dossie,
      assinaturas: await assinaturasParaPdf() });
    arquivarDocumento({ buffer, pasta: `Avaliação Institucional/Produção Docente`,
      nome: `producao-docente-${slug(curso)}.pdf` });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `inline; filename="producao-docente-${curso}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no relatório de produção docente:", e);
    res.status(500).send("Erro ao gerar o relatório: " + e.message);
  }
});

/* ------------------------------- UPLOADS -------------------------------- */
// Os três uploads abaixo são da Avaliação e do dossiê: valem a mesma portaria
// das páginas, senão a barreira só existiria na tela.
app.use(["/api/drive/upload", "/api/drive/upload-avaliacao", "/api/drive/upload-doc-institucional"],
  (req, res, next) => {
    if (!liberadoNaAv(req)) return res.status(403).json({ error: "Acesso restrito" });
    if (somenteLeituraNaAv(req))
      return res.status(403).json({ error: "O acesso de avaliador é somente de visualização." });
    next();
  });

app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const professor = slug(req.body.professor || "desconhecido");
    const categoria = slug(req.body.categoria || "geral");
    const codigo = String(req.body.codigo || "");
    const originalName = codigo ? `${codigo}_${req.file.originalname}` : req.file.originalname;
    res.json(await files.save({
      buffer: req.file.buffer, originalName,
      prefix: `${REPO}/Avaliação Institucional/Dossiê Docente/${cursoFrom(req)}/${professor}/${categoria}`,
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
      prefix: `${REPO}/Avaliação Institucional/Indicadores/${cursoFrom(req)}/indicador-${slug(indicador)}`,
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
      prefix: `${REPO}/Avaliação Institucional/Documentos Institucionais/${cursoFrom(req)}/${section}`,
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
/* ======================================================================
   "VER COMO…" — comum a todos os setores (decisão do dono, ago/2026)

   Nasceu no ARCHÉ IC e provou o seu valor: a coordenação abre o setor
   pelos olhos de outra pessoa e vê o que ela vê. A pergunta que chega ao
   suporte é sempre a mesma — "o professor diz que não enxerga a ação dele"
   —, e respondê-la sem isto obriga a gestão a pedir a senha de alguém.

   Duas garantias, e elas são o que tornam o recurso defensável:

   1. **O recorte é do SERVIDOR.** A simulação troca o USUÁRIO por um
      sósia sem gestão (`papel: aprovado`, `modulos: []`) e deixa as mesmas
      funções de permissão rodarem. Se fosse a tela escondendo menu, a
      simulação mentiria justamente onde importa.
   2. **É somente leitura.** Escrever com `?como=` gravaria em nome da
      GESTÃO — a sessão real é dela — enquanto a tela finge ser outra
      pessoa, e o histórico diria que foi a pessoa quem mexeu.

   O ARCHÉ IC mantém a sua própria versão (`visaoComo`), escrita antes e
   entrelaçada com o `quem` daquele setor; esta aqui serve aos demais.
   ====================================================================== */

/** O sósia: quem o setor deve tratar como se fosse o usuário da vez. */
async function verComoUsuario(req, u, podeSimular) {
  const alvo = String(req.query?.como || "").trim().toLowerCase();
  if (!alvo || !podeSimular) return null;
  // o usuário REAL fica guardado no pedido: o sósia não tem gestão (é o
  // ponto), mas a lista de pessoas do seletor e o próprio botão continuam
  // sendo da gestão — sem isto a tela perderia o "ver como" ao usá-lo
  req.euReal = u;
  const base = { papel: "aprovado", modulos: [], simulado: true, nome: "" };
  // "perfil:algo" — a visão GENÉRICA daquele acesso, sem pessoa nenhuma:
  // um professor recém-chegado, ainda sem nada seu no setor. É como se
  // confere a CARA de um acesso sem escolher alguém real.
  if (alvo.startsWith("perfil:")) return { ...base, email: "", cpf: "", perfilGenerico: alvo.slice(7) };
  // "cpf:000…" — quem ainda não tem conta, mas já aparece nos registros:
  // mostra o que a pessoa vai encontrar quando se cadastrar.
  if (alvo.startsWith("cpf:")) return { ...base, email: "", cpf: normalizarCpf(alvo.slice(4)) };
  const perfis = await carregarPerfis();
  return { ...base, email: alvo, cpf: perfis[alvo]?.cpf || "", nome: perfis[alvo]?.nome || "" };
}

/* Endereço reconhecível sem ser legível por inteiro: diz de QUEM é a conta a
   quem já sabe, e não entrega uma lista de e-mails a quem só tem um CPF. */
function mascararEmail(e) {
  const [u = "", d = ""] = String(e || "").split("@");
  const visivel = u.slice(0, Math.min(3, Math.max(1, u.length - 2)));
  return `${visivel}${"•".repeat(Math.max(2, u.length - visivel.length))}@${d}`;
}

/** Quem está de fato logado, mesmo durante uma simulação. */
const euReal = (req, u) => req.euReal || u;

/** Nada se grava enquanto se olha pelos olhos de outro. */
function travarEscritaVerComo(prefixo) {
  app.use(prefixo, (req, res, next) => {
    if (req.method !== "GET" && req.query?.como) {
      return res.status(403).json({
        error: "Você está vendo o setor como outra pessoa — esta visualização é somente leitura.",
      });
    }
    next();
  });
}
["/api/extensao", "/api/atas", "/api/espacos", "/api/monitoria", "/api/praticas"]
  .forEach(travarEscritaVerComo);

/**
 * Quem é quem no setor, para a gestão escolher por quais olhos olhar. Sai
 * dos PRÓPRIOS registros — não há cadastro de papel à parte, em setor
 * nenhum. Recebe `{ papel: [ {email, cpf, nome} ] }` e devolve a mesma
 * forma, com as pessoas agrupadas e contadas.
 */
function pessoasDeGrupos(grupos, perfis = null) {
  const saida = {};
  for (const [papel, lista] of Object.entries(grupos || {})) {
    const m = new Map();
    for (const p of lista || []) {
      const email = String(p?.email || "").trim().toLowerCase();
      const cpf = soDigitos(p?.cpf);
      const id = email || (cpf ? `cpf:${cpf}` : "");
      if (!id) continue;
      const atual = m.get(id) || { id, email, semConta: !email, nome: "", quantos: 0 };
      // o registro do setor nem sempre traz o nome (a ata guarda o e-mail de
      // quem lavrou, a reserva o de quem pediu) — e uma lista de e-mails soltos
      // não se escolhe. Quando há perfil, é dele que o nome vem.
      const nome = String(p?.nome || "").trim() || String(perfis?.[email]?.nome || "").trim();
      m.set(id, { ...atual, nome: atual.nome || nome, quantos: atual.quantos + 1 });
    }
    saida[papel] = [...m.values()]
      .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
  }
  return saida;
}

/* Quem, no portal, é do corpo docente ou da coordenação — o "professor" que
   a pró-reitoria quer simular, em qualquer setor. */
const FUNCOES_DOCENTES = new Set(["professor", "professor-pesquisador", "coord-curso",
  "coord-pedagogico", "coord-pesquisa", "coord-extensao", "coord-acao-comunitaria",
  "coord-ensino", "coord-politicas"]);

/**
 * As CONTAS DO PORTAL como opção do "ver como" (pedido do dono, ago/2026).
 *
 * Até aqui cada setor oferecia só quem já aparece nos PRÓPRIOS registros —
 * quem submeteu ação, lavrou ata, pediu espaço. É o recorte certo para a
 * pergunta "o professor diz que não vê a ação dele", e é curto demais para a
 * outra pergunta, que é a mais comum: *como um professor vê este setor?* O
 * professor que ainda não submeteu nada não estava na lista, e ele é
 * justamente quem se quer orientar. A visão genérica mostra a CARA do acesso,
 * mas não o que uma pessoa de verdade encontra lá dentro.
 *
 * Só para o **gestor geral**: a lista é o catálogo de contas do portal, e a
 * gestão de acessos sempre foi exclusiva dele (`/usuarios/`). Coordenador de
 * módulo continua com as pessoas do setor dele — ampliar o "ver como" não
 * pode ampliar quem vê a lista de quem tem conta.
 *
 * Agrupadas pela FUNÇÃO declarada no perfil, porque é assim que a pergunta se
 * faz: "ver como algum professor", "ver como um aluno".
 */
/** Os grupos do setor mais as contas do portal, com os nomes já preenchidos. */
async function pessoasParaVerComo(grupos, u) {
  const perfis = await carregarPerfis();
  return pessoasDeGrupos({ ...grupos, ...gruposDoPortal(perfis, u) }, perfis);
}

function gruposDoPortal(perfis, u) {
  if (u?.papel !== "gestor") return {};
  const g = { portalDocente: [], portalAluno: [], portalOutro: [] };
  for (const [email, p] of Object.entries(perfis || {})) {
    if (!email) continue;
    const f = normalizarFuncao(p?.funcao || "");
    const alvo = f === "aluno" ? g.portalAluno
      : FUNCOES_DOCENTES.has(f) ? g.portalDocente : g.portalOutro;
    alvo.push({ email, nome: p?.nome || "" });
  }
  return g;
}

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
/**
 * A fila de escrita das ações. `flushJa: false` grava na memória e deixa o
 * arquivo subir na próxima janela do storage (1,2 s, agrupando o que chegar
 * junto) em vez de esperar a subida DENTRO da fila.
 *
 * Por que isso existe (incidente do credenciamento, ago/2026): em produção
 * o estado é UM arquivo no Drive, e cada `flush` reescreve o arquivo
 * INTEIRO. Com o flush dentro da fila, cada leitura de QR subia todo o
 * estado antes de a próxima começar — dez pessoas na porta viravam dez
 * uploads em série, e a fila parecia um sistema travado. O dado já está na
 * memória quando a resposta sai (é dela que a próxima leitura parte); o que
 * se adia é só a ida ao Drive, que o `set` já agenda sozinho.
 *
 * Continua `true` por padrão: para o que é raro e caro de perder — aprovar,
 * registrar, encerrar —, a certeza de que subiu vale a espera.
 */
function comAcoes(fn, { flushJa = true } = {}) {
  const proxima = filaEx.then(async () => {
    const acoes = await lerAcoes();
    const r = await fn(acoes);
    if (r?.gravar !== false) {
      await storage.set(EX_KEY, JSON.stringify(acoes));
      if (flushJa) await storage.flush?.();
    }
    return r;
  });
  filaEx = proxima.catch(() => {});
  return proxima;
}
/* Os cursos que uma ação de extensão pode ter. São os 12 do catálogo mais o
   guarda-chuva institucional — a ação da PROPPEX não é de curso nenhum, e a
   tela do ARCHÉ EV já oferece essa opção desde sempre. */
const CURSOS_ACAO = [...CURSOS.map((c) => c.nome), "Institucional / PROPPEX"];

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
  // A ASSINATURA digitalizada é imagem com escrita própria (POST/DELETE
  // /:id/assinatura) e o cliente só conhece o RESUMO dela (sem o base64,
  // que nunca viaja em payload). Na ação COM evento ela estava protegida de
  // carona, porque mora no `evento`; na ação SEM evento mora na raiz, e o
  // primeiro salvar do formulário gravava o resumo por cima — a imagem
  // sumia e o certificado passava a sair sem a assinatura da coordenação,
  // em silêncio (achado da varredura de ago/2026). Vem sempre da base.
  const out = { evento: base.evento };
  if (base.assinaturas) out.assinaturas = base.assinaturas;
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
// certificados: no evento, quem opera o evento; na ação SEM evento (a que
// correu por fora e teve a lista digitada na Extensão), o dono e a gestão da
// Extensão — coordenar `eventos` não dá alcance sobre o que não é evento.
const podeCertificarAcao = (u, a) => (a?.evento ? podeOperarEvento(u, a) : podeVerAcao(u, a));
/* As assinaturas que a TELA vê: nome, cargo e a data — nunca a imagem, que
   pesa e tem rota própria (a mesma regra da capa e das fotos). */
/* Toda célula de TEXTO das planilhas passa por aqui: o que a pessoa digitou
   (nome, endereço, título, Pix) começando com =, + ou @ é FÓRMULA para o
   Excel, e a planilha de bolsistas carrega CPF, RG, endereço e conta de
   todos eles. A blindagem existia só em lib/exports.js (eventos); as três
   planilhas da IC, que vivem aqui, ficaram de fora (achado da varredura
   ago/2026). Envolve a LINHA inteira para não depender de lembrar campo a
   campo — número e data não são string e passam intactos. */
const linhaSegura = (obj) => Object.fromEntries(Object.entries(obj)
  .map(([k, v]) => [k, typeof v === "string" ? seguroXlsx(v) : v]));

/* Campos do INSCRITO que nenhuma tela lê (varredura de ago/2026): as
   respostas dos campos extras, o registro de consentimento LGPD e a opção de
   comunicações existem para os EXPORTS, que os leem no servidor, direto do
   estado. No payload eles eram só peso — cerca de um quinto da lista de
   inscritos de um evento grande —, e o `GET /api/extensao` é o que a tela
   recarrega a cada 30 s no dia do evento.

   Trocados por um SINAL (`temRespostas`), como já se faz com a capa e as
   fotos. Gravar de volta não os perde: o `mesclarEventoEInscritos` traz da
   BASE todo inscrito online, com o registro completo. */
const inscritoLeve = (i) => {
  if (!i || typeof i !== "object") return i;
  const { respostas, consentimento, comunicacoes, ...resto } = i;
  return respostas && Object.keys(respostas).length ? { ...resto, temRespostas: true } : resto;
};

const acaoSemSegredos = (a) => {
  if (!a) return a;
  // a assinatura da ação SEM evento mora na raiz (caixaCertificado): a
  // imagem segue a regra de sempre — fica guardada, sai por rota própria
  const { assinaturas, ...resto } = a;
  const out = a.evento ? { ...resto, evento: eventoSemSegredos(a.evento) } : { ...resto };
  if (assinaturas) out.assinaturas = assinaturasVisiveis({ assinaturas });
  if (Array.isArray(out.participantes?.inscritos))
    out.participantes = { ...out.participantes, inscritos: out.participantes.inscritos.map(inscritoLeve) };
  // A SITUAÇÃO VIAJA PRONTA (decisão do dono, ago/2026): é a mesma ação nas
  // duas telas, e cada uma tinha o seu vocabulário. A conta é do servidor —
  // se o ARCHÉ EX e o ARCHÉ EV a refizessem cada um do seu jeito, voltariam
  // a discordar sobre o mesmo evento.
  out.situacao = situacaoDaAcao(a);
  return out;
};
const assinaturasVisiveis = (acao) => resumoAssinaturas(caixaCertificado(acao).assinaturas);
const resumoAssinaturas = (ass) => Object.fromEntries(
  Object.entries(ass || {}).filter(([, v]) => v)
    .map(([k, v]) => [k, { nome: v.nome || "", cargo: v.cargo || "", temImagem: !!v.base64 }]));

async function sessaoEx(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(403).json({ error: "Faça login para acessar a Extensão" }); return null; }
  if (u.papel === "pendente") {
    res.status(403).json({ error: "Seu acesso ainda está pendente de aprovação da PROPPEX" });
    return null;
  }
  // "ver como": daqui para baixo o setor trata o SÓSIA como se fosse o
  // usuário — as mesmas funções de permissão, sem exceção nenhuma
  return (await verComoUsuario(req, u, gereEx(u) || gereEv(u))) || u;
}

// A CHAVE do QR assina todos os tokens do evento e a CAPA pesa centenas de
// KB: nenhuma das duas viaja em payload — a chave por segurança (fica só no
// servidor; achado de ago/2026) e a capa por peso (a tela busca a imagem
// pela rota pública e aqui só sabe que existe, via `temCapa`).
function eventoSemSegredos(ev) {
  if (!ev) return ev;
  const { chaveQr, capa, ...resto } = ev;
  // fotos de palestrante e logotipos de apoiador seguem a regra da capa:
  // pesam centenas de KB e têm rota própria — na lista viaja só o sinal de
  // que existem (a tela busca a imagem pela rota, com o id do item)
  if (Array.isArray(resto.programacao))
    resto.programacao = resto.programacao.map(({ foto, ...atv }) => ({ ...atv, temFoto: temArte(foto) }));
  if (Array.isArray(resto.blocos))
    resto.blocos = resto.blocos.map((b) => Array.isArray(b.itens)
      ? { ...b, itens: b.itens.map(({ logo, ...i }) => ({ ...i, temLogo: temArte(logo) })) }
      : b);
  // a assinatura digitalizada é imagem como as demais: fica guardada, sai
  // por rota própria e nos payloads vai só o sinal de que existe
  if (resto.assinaturas && typeof resto.assinaturas === "object")
    resto.assinaturas = resumoAssinaturas(resto.assinaturas);
  return { ...resto, temCapa: temArte(capa) };
}

/**
 * Devolve a lista normalizada com as imagens que já estavam gravadas — a
 * menos que quem enviou tenha mandado a imagem nova (fica a nova) ou uma
 * string vazia (é remoção). Vale para a foto do palestrante na programação e
 * para o logotipo do apoiador dentro dos blocos.
 */
function preservarImagens(nova, enviada, base, campo) {
  const guardadas = new Map();
  const guardar = (lista) => {
    for (const item of lista || []) {
      if (item?.id && item[campo]) guardadas.set(item.id, item[campo]);
      for (const sub of item?.itens || []) if (sub?.id && sub[campo]) guardadas.set(sub.id, sub[campo]);
    }
  };
  guardar(base);
  const mandouVazio = new Set();
  const marcar = (lista) => {
    for (const item of lista || []) {
      if (item?.id && item[campo] === "") mandouVazio.add(item.id);
      for (const sub of item?.itens || []) if (sub?.id && sub[campo] === "") mandouVazio.add(sub.id);
    }
  };
  marcar(enviada);
  const aplicar = (item) => {
    const resolvido = item[campo] || (mandouVazio.has(item.id) ? "" : guardadas.get(item.id) || "");
    const saida = { ...item, [campo]: resolvido };
    if (Array.isArray(item.itens)) saida.itens = item.itens.map(aplicar);
    return saida;
  };
  return nova.map(aplicar);
}

/** A lista que a pessoa pode ver — nunca a base inteira. */
app.get("/api/extensao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    // recorte: as próprias ações e, para a gestão da Extensão, todas; a
    // coordenação do ARCHÉ EV vê também toda ação COM evento (é o setor
    // dela), sem enxergar o restante da Extensão alheia
    // UMA leitura só: o estado é uma string grande e cada `lerAcoes()` a
    // reparseia inteira — a rota fazia isso duas vezes por chamada, e a
    // segunda servia só para montar a lista de nomes do "ver como"
    // (varredura de ago/2026).
    const base = await lerAcoes();
    const acoes = base
      .filter((a) => podeVerAcao(u, a) || (gereEv(u) && a.evento))
      .map(acaoSemSegredos);
    // os catálogos que o editor do evento usa (tipos de atividade e o texto
    // padrão da LGPD) seguem junto: a SPA não os duplica
    // as pessoas do setor para o "ver como" — quem submeteu ação (e, no EV,
    // quem organiza evento). Sai das próprias ações, com a base INTEIRA:
    // a lista acima já veio recortada pelo papel de quem olha.
    const real = euReal(req, u);
    const todas = gereEx(real) || gereEv(real) ? base : [];
    const pessoas = gereEx(real) || gereEv(real) ? await pessoasParaVerComo({
      responsavel: todas.map((a) => ({
        email: a.proposta?.respEmail || a.criadoPor, nome: a.proposta?.responsavel || "" })),
      evento: todas.filter((a) => a.evento).map((a) => ({
        email: a.proposta?.respEmail || a.criadoPor, nome: a.proposta?.responsavel || "" })),
    }, real) : null;
    res.json({
      acoes, gestao: gereEx(u), gestaoEventos: gereEv(u), eu: u.email,
      ...(pessoas ? { pessoas, verComo: String(req.query?.como || "") } : {}),
      tiposAtividade: TIPOS_ATIVIDADE, lgpdPadrao: LGPD_TEXTO_PADRAO,
      tiposBloco: TIPOS_BLOCO, categoriasApoio: CATEGORIAS_APOIO,
      redesSociais: REDES_SOCIAIS, frequencias: FREQUENCIAS, minFotosRelatorio: MIN_FOTOS_RELATORIO,
      papeisComissao: PAPEIS_COMISSAO, periodosMatriz: PERIODOS_MATRIZ,
      camposRelatorio: CAMPOS_RELATORIO_FINAL,
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
const base_ok_id = (v) => /^[a-zA-Z0-9_-]{1,60}$/.test(String(v || ""));
app.post("/api/extensao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const entrada = Array.isArray(req.body?.acoes) ? req.body.acoes : [];
    if (!entrada.length) return res.status(400).json({ error: "Nada a gravar" });
    const r = await comAcoes((acoes) => {
      let gravadas = 0, recusadas = 0;
      const registradas = [];
      for (const nova of entrada) {
        if (!nova?.id) { recusadas++; continue; }
        /* O id vira atributo onclick em DEZENAS de templates das duas SPAs:
           um id com aspas quebraria o HTML de todo mundo que abrisse a
           lista (achado da revisão adversarial, ago/2026). Ação NOVA só
           entra com id no formato que o próprio cliente gera. */
        if (!base_ok_id(nova.id)) { recusadas++; continue; }
        const i = acoes.findIndex((x) => x.id === nova.id);
        const base = i >= 0 ? acoes[i] : null;
        // ação nova: quem submete é o dono. Ação existente: só o dono ou a gestão
        if (base ? !podeVerAcao(u, base) : !minhaAcao(u, nova)) { recusadas++; continue; }
        // O número da ação e a situação são decisão da GESTÃO, nunca do
        // formulário — e isso vale também na CRIAÇÃO (achado da varredura de
        // ago/2026): o recorte só existia quando havia `base`, então uma ação
        // NOVA entrava com o que o cliente mandasse. Dava para nascer já
        // `registrada`, com um número forjado da sequência oficial, e —
        // porque a ação registrada SEM evento é o que libera os certificados
        // — baixar um documento no timbre do UNIEGO com as assinaturas
        // digitalizadas do pró-reitor e do reitor. Sem `base`, os valores são
        // os do começo do fluxo.
        const controlado = gereEx(u) ? {} : (base
          ? { numeroAcao: base.numeroAcao, status: base.status, apreciacao: base.apreciacao,
              criadoPor: base.criadoPor, criadoEm: base.criadoEm }
          : { numeroAcao: null, status: "submetida", apreciacao: "",
              criadoPor: u.email, criadoEm: new Date().toISOString() });
        /* A REPROVAÇÃO é decisão final e "prova da decisão" — o POST em
           bloco não pode desfazê-la nem apagar o motivo: nem o salvar do
           dono (que não manda `motivoReprovacao` de volta), nem o da
           GESTÃO numa aba aberta antes da decisão, que devolveria o status
           antigo em silêncio (achado da revisão adversarial, ago/2026 — a
           mesma razão da guarda que preserva `registrada`). Sair de
           reprovada não tem rota de propósito. */
        if (base?.status === "reprovada") {
          controlado.status = "reprovada";
          controlado.motivoReprovacao = base.motivoReprovacao;
          controlado.reprovadaEm = base.reprovadaEm;
          controlado.reprovadaPor = base.reprovadaPor;
        }
        // A CONFIG do evento e as INSCRIÇÕES ONLINE/PRESENÇAS têm escrita
        // própria (rota /:id/evento e o credenciamento público) e escritores
        // CONCORRENTES: o salvar comum do formulário carrega um snapshot que
        // pode estar velho, e substituir a ação inteira apagaria em silêncio
        // inscrição e presença já gravadas (achado da revisão de ago/2026).
        // Por isso o evento vem sempre da base, e as inscrições online + as
        // presenças são MESCLADAS por cima do que o formulário mandou.
        const preservado = base ? mesclarEventoEInscritos(base, nova) : {};
        const final = { ...nova, ...controlado, ...preservado, atualizadoEm: new Date().toISOString() };
        /* LIMPEZA DA COLAGEM (achado do dono, ago/2026): a proposta da
           Campanha Agosto Dourado aparecia certa na tela e saía embaralhada
           no PDF timbrado. O texto vinha colado do Word/PDF com caracteres
           que o navegador desenha e o documento oficial não — as "letras que
           não são letras" do negrito copiado e os marcadores de lista do
           Word. A régua é do SERVIDOR porque o defeito não é de uma tela: é
           de todo texto que entra, por qualquer porta. Imagem não é texto e
           fica de fora (a lista de chaves puladas em lib/texto.js). */
        Object.assign(final, limparProfundo(final));
        /* Palestrantes e comissão passam pela MESMA normalização da rota de
           equipe do EV (revisão adversarial, ago/2026): a proposta agora os
           grava por aqui, e estas listas alimentam os certificados — campo
           fora do shape ou sem teto não pode entrar por uma porta e ser
           recusado na outra. Inscritos ficam como estão: têm escrita própria
           e a mescla acima já cuida deles. */
        if (final.participantes) {
          /* CPF QUE NÃO VALIDA NÃO ENTRA (revisão adversarial, ago/2026): a
             emissão só exige o nome, então um dígito trocado aqui sairia
             IMPRESSO no certificado — e "certificado emitido com CPF errado
             não se corrige depois". O campo esvazia (o resto da linha fica):
             sem CPF o documento espera, com CPF errado ele sai errado — e o
             histórico /certificados/, que casa por CPF, nunca o entregaria
             ao dono verdadeiro. */
          const semCpfTorto = (x) => (x.cpf && !cpfValido(x.cpf)) ? { ...x, cpf: "" } : x;
          if (Array.isArray(final.participantes.palestrantes))
            final.participantes.palestrantes = final.participantes.palestrantes
              .map((x) => semCpfTorto(normalizarPessoaEvento(x, { palestrante: true })))
              .filter((x) => x.nome || x.cpf || x.matricula || x.email).slice(0, 200);
          if (Array.isArray(final.participantes.comissao))
            final.participantes.comissao = final.participantes.comissao
              .map((x) => semCpfTorto(normalizarPessoaEvento(x, {})))
              .filter((x) => x.nome || x.cpf || x.matricula || x.email).slice(0, 300);
        }
        // `situacao` é CALCULADA a cada leitura (lib/situacao.js) e viaja no
        // payload só para a tela desenhar o selo. Gravá-la de volta guardaria
        // no estado uma leitura velha do próprio estado — e ela envelhece
        // sozinha, porque depende da data de hoje.
        delete final.situacao;
        // Curricularização: o vínculo com o componente curricular é o que
        // comprova os 10% da matriz ao avaliador do MEC, e por isso passa
        // pela régua do catálogo aqui — desmarcado, nenhuma disciplina fica
        // para trás somando hora que ninguém cumpriu.
        if (final.proposta)
          final.proposta = { ...final.proposta,
            curricularizacao: normalizarCurricularizacao(final.proposta.curricularizacao) };
        /* A PROPOSTA JÁ ENCAMINHADA PODE SER EDITADA (pedido do dono,
           ago/2026) — e a edição fica MARCADA: mudar o texto de uma proposta
           submetida ou já aprovada é legítimo, mas quem analisa (ou já
           aprovou) precisa poder ver que o documento mudou depois do envio.
           A comparação roda AQUI, depois da limpeza da colagem e da régua da
           curricularização — antes delas, "igual" nunca era igual e todo
           salvar (inclusive o do relatório) viraria edição de proposta. Só
           marca quem NÃO gere o setor e só quando a proposta de fato mudou. */
        final.edicoesProposta = base?.edicoesProposta || [];
        if (base && !gereEx(u) && ["submetida", "aprovada"].includes(String(base.status || ""))
          && JSON.stringify(final.proposta || {}) !== JSON.stringify(base.proposta || {})) {
          final.edicoesProposta = [...final.edicoesProposta,
            { em: new Date().toISOString(), por: u.email, situacao: base.status }].slice(-20);
        }
        /* Cursos CO-REALIZADORES (pedido de um professor, ago/2026): a
           jornada é de dois cursos, e abrir duas ações para o mesmo evento
           partiria a proposta, o número da ação e a contagem de
           participantes ao meio. O principal segue sendo um — é ele que
           nomeia a pasta no Drive —, e a régua é do SERVIDOR: curso fora do
           catálogo, repetido ou igual ao principal não entra. */
        final.cursosExtras = normalizarCursosExtras(
          final.cursosExtras, final.curso, CURSOS_ACAO);
        // Números do evento no relatório: na ENTREGA (entregueEm aparecendo
        // agora) de uma ação com evento, o SERVIDOR fotografa os números do
        // sistema de inscrições — snapshot datado, calculado da ação já
        // mesclada (a verdade da base), nunca do que a tela digitou. Fora da
        // entrega, o snapshot é o que já estava gravado: o cliente não o
        // fabrica nem o reescreve.
        if (final.relatorio) {
          const entregouAgora = final.relatorio.entregueEm && !base?.relatorio?.entregueEm;
          // A RÉGUA DA ENTREGA É UMA SÓ (achado da varredura de ago/2026):
          // este caminho conferia apenas as fotos, enquanto o encerramento
          // pelo ARCHÉ EV cobra também a avaliação/resultados — o único campo
          // obrigatório, e o que a PROPPEX lê. Uma aba velha, ou uma gravação
          // que não passe pelo formulário, entregava o relatório sem ele e a
          // ação seguia para registro, liberando certificados. `faltaParaEntregar`
          // é a MESMA função que o encerramento usa, e já inclui as fotos.
          if (entregouAgora) {
            const faltas = faltaParaEntregar(final, final.relatorio);
            if (faltas.length)
              return { erro: [400, "Para entregar o relatório falta " + faltas.join("; ") + "."], gravar: false };
            // e os campos passam pelo catálogo: fora dele nada entra, e a
            // DATA da entrega é do servidor — o teste do lib afirma isso, e
            // por este caminho ela vinha do cliente
            final.relatorio = {
              ...final.relatorio, ...normalizarRelatorioFinal(final.relatorio),
              entregueEm: new Date().toISOString(),
            };
          }
          const snapshot = entregouAgora && final.evento?.chaveQr
            ? numerosDoEvento(final)
            : base?.relatorio?.numerosEvento;
          if (snapshot) final.relatorio = { ...final.relatorio, numerosEvento: snapshot };
          else if (final.relatorio.numerosEvento) delete final.relatorio.numerosEvento;
        }
        // Registrada NÃO se desfaz por um salvar comum — nem por uma aba
        // velha que carregou a ação antes do registro: registrar trava os
        // campos e libera os certificados. A ÚNICA saída é a REABERTURA da
        // que foi finalizada SEM relatório, que é o buraco que o botão
        // "Finalizar" deixou; fora dela, a situação é preservada em
        // silêncio (recusar travaria a gravação inteira por um dado velho).
        if (base?.status === "registrada" && final.status !== "registrada"
            && base.relatorio?.entregueEm) final.status = "registrada";
        // REGISTRAR pressupõe o relatório entregue (achado do dono,
        // ago/2026): sem esta régua dava para finalizar uma ação que nunca
        // teve relatório — ela sumia da guia Relatórios sem nunca ter
        // aparecido lá —, e o registro é justamente o que libera os
        // certificados nas ações sem evento. Vale só na TRANSIÇÃO: ação já
        // registrada (as migradas do papel, por exemplo) continua gravável.
        const registrouAgora = final.status === "registrada" && base?.status !== "registrada";
        if (registrouAgora && !final.relatorio?.entregueEm)
          return { erro: [400, "Esta ação ainda não tem relatório final entregue — registrar encerra o "
            + "ciclo e libera os certificados. Entregue o relatório antes de finalizar."], gravar: false };
        /* AÇÃO COM EVENTO tem UMA porta só (pedido do dono, ago/2026): quem
           encerra o ciclo é a validação do encerramento, no ARCHÉ EV — é ela
           que libera os certificados e, no mesmo ato, valida o relatório
           final. Registrar por aqui deixaria a ação "registrada" com o
           encerramento ainda em aberto: os certificados continuariam
           bloqueados e ninguém entenderia por quê. */
        if (registrouAgora && final.evento && situacaoEncerramento(final) !== "validado")
          return { erro: [400, "Este é um evento: o ciclo se encerra validando o ENCERRAMENTO no ARCHÉ EV "
            + "— é o mesmo ato que valida o relatório final e libera os certificados."], gravar: false };
        // Ação SEM evento: quem libera o certificado é o REGISTRO da ação
        // (é o ato em que a PROPPEX confere relatório e listas). Quem tem
        // direito é avisado agora, do mesmo jeito que no evento — sem isso,
        // o documento existiria e ninguém saberia.
        if (!final.evento && registrouAgora) registradas.push(final);
        if (i >= 0) acoes[i] = final; else acoes.push(final);
        gravadas++;
      }
      return { gravadas, recusadas, registradas, gravar: gravadas > 0 };
    });
    // recusa com MOTIVO (hoje só a falta das fotos na entrega do relatório):
    // nada é gravado e a tela diz exatamente o que falta
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (r.recusadas) console.warn(`[extensao] ${r.recusadas} ação(ões) recusada(s) de ${u.email}`);
    for (const acao of r.registradas || []) {
      avisarCertificadosDisponiveis(acao)
        .catch((e) => console.error("[extensao] avisos de certificado:", e.message));
    }
    const acoes = (await lerAcoes()).filter((a) => podeVerAcao(u, a)).map(acaoSemSegredos);
    res.json({ ok: true, ...r, acoes });
  } catch (e) {
    console.error("Erro ao gravar ação de extensão:", e);
    res.status(500).json({ error: "Falha ao gravar" });
  }
});

/**
 * POST /api/extensao/:id/excluir — apaga um evento cadastrado por engano
 * (pedido do dono, ago/2026). Duas coisas diferentes podem ser apagadas, e o
 * servidor escolhe pelo que a ação JÁ VIVEU:
 *
 *  · ação sem Número da Ação e sem relatório entregue é cadastro do
 *    assistente do ARCHÉ EV que não virou nada — some inteira;
 *  · ação já APROVADA (com número) é processo do setor, e o número é da
 *    sequência oficial: apagá-la abriria buraco na numeração e sumiria com a
 *    proposta do professor. Nesse caso some só o EVENTO — a página, a
 *    programação, os inscritos —, e a ação continua no ARCHÉ EX.
 *
 * Quem pode: a gestão da Extensão sempre; o dono da ação enquanto ela não
 * tiver número. A coordenação só de `eventos` não exclui — ela opera o
 * evento, não desfaz o processo.
 *
 * Exclusão com inscritos exige confirmar o NOME do evento no corpo: o clique
 * errado apaga o cadastro de gente que se inscreveu, e a segunda digitação é
 * o que separa o engano da decisão. O que sumiu fica resumido em
 * `sys-ex-exclusoes-v1` — sem dado pessoal, só o rastro de quem apagou o quê.
 */
app.post("/api/extensao/:id/excluir", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const confirmacao = String(req.body?.confirmacao || "").trim();
    const r = await comAcoes((acoes) => {
      const i = acoes.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ação não encontrada"], gravar: false };
      const a = acoes[i];
      const dono = minhaAcao(u, a);
      if (!gereEx(u) && !(dono && !a.numeroAcao))
        return { erro: [403, "Só a gestão da Extensão exclui uma ação já aprovada."], gravar: false };
      /* A reprovada é a prova da decisão da PROPPEX — o DONO não a apaga
         (revisão adversarial, ago/2026: o e-mail promete "o registro fica
         arquivado", e a exclusão pelo dono o desmentiria). A gestão pode:
         é dela a decisão, e o resumo fica em sys-ex-exclusoes-v1. */
      if (a.status === "reprovada" && !gereEx(u))
        return { erro: [403, "Proposta reprovada fica arquivada — só a gestão da Extensão pode excluí-la."], gravar: false };
      if (a.status === "registrada")
        return { erro: [400, "Ação registrada — o ciclo está encerrado e o registro não se apaga."], gravar: false };
      const inscritos = (a.participantes?.inscritos || []).length;
      const nome = String(a.proposta?.nomeAtividade || "").trim();
      if (inscritos && confirmacao !== nome)
        return { erro: [400, `Este evento tem ${inscritos} inscrito(s). Para excluir, confirme digitando o nome exato: ${nome}`], gravar: false };
      // ação sem número e sem relatório nunca foi processo: some inteira
      const soOEvento = !!a.numeroAcao || !!a.relatorio?.entregueEm;
      const resumo = { em: new Date().toISOString(), por: u.email, id: a.id, nome,
        curso: a.curso || "", numeroAcao: a.numeroAcao || null, status: a.status || "",
        inscritos, presentes: (a.participantes?.inscritos || []).filter((x) => x.presente).length,
        alcance: soOEvento ? "evento" : "acao" };
      if (soOEvento) {
        delete acoes[i].evento;
        acoes[i].participantes = { ...(a.participantes || {}), inscritos: [] };
        acoes[i].atualizadoEm = new Date().toISOString();
      } else {
        acoes.splice(i, 1);
      }
      return { resumo };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // rastro da exclusão, fora do /api/estado: sem ele ninguém explica depois
    // por que a ação sumiu — e com os dados dentro seria guardar o que se
    // acabou de apagar
    try {
      const chave = "sys-ex-exclusoes-v1";
      const lista = JSON.parse((await storage.get(chave)) || "[]");
      lista.push(r.resumo);
      await storage.set(chave, JSON.stringify(lista.slice(-500)));
    } catch (e) { console.error("[extensao] registro da exclusão falhou:", e.message); }
    console.warn(`[extensao] ${u.email} excluiu ${r.resumo.alcance} "${r.resumo.nome}" (${r.resumo.id})`);
    res.json({ ok: true, ...r.resumo });
  } catch (e) {
    console.error("Erro ao excluir a ação/evento:", e);
    res.status(500).json({ error: "Não foi possível excluir agora." });
  }
});

/**
 * Quadro da curricularização, por curso — é a resposta à pergunta que o
 * avaliador do MEC faz: quais disciplinas do PPC esta instituição atende com
 * extensão, e quantas horas. Conta só o que comprova (ação aprovada, com
 * relatório entregue ou registrada); proposta em análise não é comprovação.
 * Só a gestão da Extensão: é quadro institucional, não recorte de ninguém.
 */
app.get("/api/extensao/curricularizacao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (!gereEx(u)) return res.status(403).json({ error: "Restrito à gestão da Extensão" });
    const ano = /^\d{4}$/.test(String(req.query.ano || "")) ? Number(req.query.ano) : null;
    res.json({ ano, cursos: panoramaCurricularizacao(await lerAcoes(), { ano }) });
  } catch (e) {
    console.error("Erro no quadro de curricularização:", e);
    res.status(500).json({ error: "Falha ao montar o quadro" });
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
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.para)) avisado = await enviarAviso("ex-proposta-devolvida", msg);
    } catch (e) {
      console.error("[extensao] aviso de devolução falhou:", e.message);
    }
    res.json({ ok: true, avisado, acao: acaoSemSegredos(r.acao) });
  } catch (e) {
    console.error("Erro ao devolver proposta:", e);
    res.status(500).json({ error: "Falha ao devolver" });
  }
});

/* REPROVAR é a terceira saída da análise (pedido do dono, ago/2026: a
   PROPPEX decide entre aprovar, devolver para alterações e reprovar, as duas
   últimas com comentário). Difere da devolução no destino: a devolvida volta
   editável e reentra pela rota de reenvio; a REPROVADA é decisão final — o
   reenvio a recusa (ele só aceita `devolvida`), e o registro fica com o
   motivo, como prova da decisão. O professor é avisado por e-mail. */
app.post("/api/extensao/reprovar", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (!gereEx(u)) return res.status(403).json({ error: "Somente a gestão da Extensão reprova propostas." });
    const motivo = String(req.body?.motivo || "").trim();
    if (motivo.length < 5) return res.status(400).json({ error: "Escreva o motivo da reprovação — é ele que o professor recebe." });

    const r = await comAcoes((acoes) => {
      const i = acoes.findIndex((a) => a.id === req.body?.id);
      if (i < 0) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!["submetida", "devolvida"].includes(acoes[i].status))
        return { erro: [400, "Só se reprova proposta que está em análise."], gravar: false };
      acoes[i] = {
        ...acoes[i], status: "reprovada", motivoReprovacao: motivo.slice(0, 2000),
        reprovadaEm: new Date().toISOString(), reprovadaPor: u.email,
        atualizadoEm: new Date().toISOString(),
      };
      return { acao: acoes[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });

    // o e-mail não trava a decisão: se falhar, o motivo já está gravado
    let avisado = null;
    try {
      const { emailPropostaReprovada } = await import("./lib/mailer.js");
      const msg = emailPropostaReprovada(r.acao, { baseUrl: `${req.protocol}://${req.get("host")}` });
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.para)) avisado = await enviarAviso("ex-proposta-reprovada", msg);
    } catch (e) {
      console.error("[extensao] aviso de reprovação falhou:", e.message);
    }
    res.json({ ok: true, avisado, acao: acaoSemSegredos(r.acao) });
  } catch (e) {
    console.error("Erro ao reprovar proposta:", e);
    res.status(500).json({ error: "Falha ao reprovar" });
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

/* ------------------------- aprovação da ação -----------------------------
   Aprovar emite o Número da Ação (EXT-AAAA-NNN), e o número é a peça mais
   séria da Extensão: ele numera o processo institucional e não pode repetir.
   Até ago/2026 quem emitia era o FORMULÁRIO (lê `extensao-config-v1` pelo
   /api/estado, soma 1 e grava): duas coordenações aprovando ao mesmo tempo
   liam a mesma sequência e emitiam o MESMO número. Aqui a emissão é do
   servidor, dentro da fila de escrita das ações — a sequência é lida e
   gravada num ato só, em ordem de chegada.

   A sequência é POR ANO e corre na ordem em que as ações são aprovadas, que
   é a ordem em que a PROPPEX as recebe (decisão do dono, ago/2026). */
app.post("/api/extensao/:id/aprovar", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (!gereEx(u)) return res.status(403).json({ error: "Somente a gestão da Extensão aprova ações." });
    const r = await comAcoes(async (acoes) => {
      const i = acoes.findIndex((a) => a.id === req.params.id);
      if (i < 0) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (acoes[i].numeroAcao)
        return { erro: [400, `Esta ação já está aprovada, com o número ${acoes[i].numeroAcao}.`], gravar: false };
      if (!["submetida", "devolvida"].includes(acoes[i].status))
        return { erro: [400, "Só se aprova proposta que está em análise."], gravar: false };
      /* Aprovar o evento É VALIDAR O PROJETO (pedido do dono, ago/2026): são
         o mesmo registro, e por isso a aprovação não pode acontecer com o
         projeto pela metade — a ação ganharia o número da sequência oficial
         sem justificativa, objetivos nem metodologia, e o PDF do projeto
         sairia com lacunas no timbre do UNIEGO. A régua é a mesma que a guia
         "Dados do evento" mostra e a que a publicação já exigia. */
      if (acoes[i].evento) {
        const falta = faltaNoProjetoDoEvento(acoes[i]);
        if (falta.length)
          return { erro: [400, "O projeto do evento ainda está incompleto — aprovar é validá-lo. "
            + "Falta: " + falta.join(", ") + "."], gravar: false };
      }
      // ano pelo calendário de Brasília: aprovar em 31/12 à noite não pode
      // emitir número do ano seguinte (nem zerar a sequência antes da hora)
      const ano = Number(hojeLocalISO().slice(0, 4));
      const raw = await storage.get("extensao-config-v1");
      let cfg = raw ? JSON.parse(raw) : { ano, seq: 0 };
      if (cfg.ano !== ano) cfg = { ano, seq: 0 };
      cfg.seq++;
      const agora = new Date().toISOString();
      acoes[i] = {
        ...acoes[i], status: "aprovada", motivoDevolucao: "",
        numeroAcao: `EXT-${ano}-${String(cfg.seq).padStart(3, "0")}`,
        aprovadoEm: agora, aprovadoPor: u.email, atualizadoEm: agora,
      };
      await storage.set("extensao-config-v1", JSON.stringify(cfg));
      return { acao: acoes[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, numeroAcao: r.acao.numeroAcao, acao: acaoSemSegredos(r.acao) });
  } catch (e) {
    console.error("Erro ao aprovar ação de extensão:", e);
    res.status(500).json({ error: "Falha ao aprovar" });
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
        prefix: `${REPO}/Extensão/${slug(acao.curso || "geral")}/${anoDaPasta(acao.numeroAcao, acao.proposta?.periodoFim || acao.criadoEm)}/propostas`,
      }).catch((e) => console.error("Falha ao arquivar PDF da proposta no Drive:", e.message));
    } catch (e) {
      console.error("Falha ao gerar PDF da proposta:", e.message);
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const destino = await enviarAviso("ex-nova-proposta", { ...emailNovaProposta(acao, baseUrl), anexos });

    // confirmação ao responsável, com a mesma cópia em PDF
    let paraResponsavel = null;
    const confirmacao = emailConfirmacaoProposta(acao);
    // e-mail inválido cairia no destinatário padrão e a PROPPEX receberia uma
    // mensagem escrita para o professor
    const paraValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(confirmacao.para || "").trim());
    if (paraValido && confirmacao.para.toLowerCase() !== destino.toLowerCase()) {
      try {
        paraResponsavel = await enviarAviso("ex-confirmacao-proposta", { ...confirmacao, anexos });
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

/* AS FOTOS DENTRO DO PDF (pedido do dono, ago/2026): o relatório final é o
   documento que a PROPPEX apresenta ao avaliador do MEC, e uma lista de nomes
   de arquivo não comprova a realização — a foto, sim. Aqui o servidor LÊ os
   anexos de imagem do portfólio (do Drive, do S3 ou do disco local) e os
   entrega ao gerador do PDF já como bytes.

   Três freios, porque isto sai da franquia de banda e entra num documento
   que alguém vai abrir no celular: só imagem, teto de fotos e teto por
   arquivo. Anexo que não abre é PULADO — um arquivo corrompido não pode
   derrubar a geração do relatório inteiro. */
const MAX_FOTOS_PDF = 24;
const MAX_BYTES_FOTO_PDF = 8 * 1024 * 1024;

async function fotosDoRelatorio(acao) {
  const candidatas = fotosDoPortfolio(acao)
    .filter((f) => f?.fileId && (!f.size || f.size <= MAX_BYTES_FOTO_PDF))
    .slice(0, MAX_FOTOS_PDF);
  const out = [];
  for (const f of candidatas) {
    try {
      const buffer = await files.read?.(f.fileId);
      if (buffer?.length) out.push({ nome: f.name || "foto", buffer });
    } catch (e) {
      console.warn(`[extensao] foto não lida para o PDF (${f.name || f.fileId}):`, e.message);
    }
  }
  const total = fotosDoPortfolio(acao).length;
  if (total > out.length)
    console.log(`[extensao] PDF de ${acao.numeroAcao || acao.id}: ${out.length} de ${total} foto(s) embutidas`);
  return out;
}

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
    /* A ação é de QUEM A SUBMETEU (achado de ago/2026): a guarda só conferia
       login, e qualquer conta aprovada podia anexar arquivo ao portfólio de
       qualquer ação — inclusive às fotos que vão ao PDF que a PROPPEX
       apresenta ao avaliador do MEC. Quem opera o evento também anexa: é ele
       quem encerra e entrega o relatório pelo ARCHÉ EV. */
    if (!podeOperarEvento(u, pre))
      return res.status(403).json({ error: "Esta ação não é sua." });
    if (pre.status === "registrada")
      return res.status(400).json({ error: "Ação registrada — anexos travados" });
    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `${REPO}/Extensão/${slug(pre.curso || "geral")}/${anoDaPasta(pre.numeroAcao, pre.proposta?.periodoFim || pre.criadoEm)}/${slug(pre.numeroAcao || pre.id)}/portfólio`,
    });
    const anexo = { ...data, tipo: req.file.mimetype || "",
      enviadoEm: new Date().toISOString(), enviadoPor: u.email };
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

    /* O PDF TIMBRADO SÓ SAI DEPOIS DE VALIDADO (pedido do dono, ago/2026,
       revendo a decisão anterior de deixar o relatório sair como rascunho):
       o documento no timbre do UNIEGO, com as assinaturas da pró-reitoria e
       da reitoria no pé, AFIRMA um ato institucional. Enquanto o projeto não
       foi validado e o relatório não foi encerrado, esse ato não aconteceu —
       e um PDF assim circulando vira documento por engano. Para conferir o
       que está escrito, a ficha na tela mostra os mesmos campos. */
    const st = situacaoDaAcao(acao);
    if (tipo === "proposta" && !String(acao.numeroAcao || "").trim())
      return res.status(400).send("O projeto ainda não foi validado pela PROPPEX — "
        + "o PDF timbrado sai depois da validação.");
    if (tipo === "pdf" && st.etapa !== "encerrado")
      return res.status(400).send("O relatório final ainda não foi validado e encerrado — "
        + "o PDF timbrado sai depois disso.");

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
      /* O RELATÓRIO VALIDADO sai com as assinaturas do banco (achado do dono,
         ago/2026, num relatório da Veterinária com as linhas em branco): as
         mesmas três institucionais da proposta aprovada, mais a do
         RESPONSÁVEL — pela identidade (o e-mail dele) ou pelo nome declarado.
         O rascunho conferido antes da entrega sai igual: as linhas dizem quem
         assina, e imagem só afirma o que o encerramento já registrou. */
      buffer = await gerarRelatorioPdf(acao, {
        fotos: await fotosDoRelatorio(acao),
        assinaturas: await assinaturasDaAcaoExtensao(acao),
      });
      nome = `Relatorio-Final-${num}.pdf`;
      mime = "application/pdf";
    } else if (tipo === "proposta") {
      // a PROPOSTA em PDF, no formulário institucional — sem lista de
      // participantes: quem carrega nomes é o Registro de Atividade (o
      // relatório), como nos modelos em papel (decisão do dono, ago/2026)
      const { gerarPropostaPdf } = await import("./lib/pdf.js");
      /* A proposta APROVADA sai com as assinaturas digitalizadas do banco
         (pedido do dono, ago/2026): o PDF só existe depois da validação, e o
         ato que ele afirma já aconteceu. Sem imagem, sai a linha em branco. */
      buffer = await gerarPropostaPdf(acao, { assinaturas: await assinaturasDaAcaoExtensao(acao) });
      nome = `Proposta-${num}.pdf`;
      mime = "application/pdf";
    } else {
      return res.status(400).send("Tipo inválido");
    }

    /* Arquiva uma cópia versionada no Drive (extensao/<curso>/<nº da ação>/).
       Só do que É documento: o relatório em PDF pode ser gerado muitas vezes
       ANTES da entrega — o fluxo prevê justamente conferi-lo antes de
       assinar embaixo —, e cada conferência arquivava outra versão de um
       arquivo pesado (varredura de ago/2026). Rascunho não se arquiva; o
       relatório entregue, sim, e a proposta e o registro também. */
    const ehRascunho = tipo === "pdf" && !acao.relatorio?.entregueEm;
    if (!ehRascunho) try {
      /* NOME FIXO (decisão do dono, ago/2026: "no meu Drive vale só a versão
         mais atual"): o nome não leva mais data e hora, e a geração seguinte
         SUBSTITUI a anterior. Antes, cada clique em "gerar PDF" de um
         relatório já entregue deixava mais uma cópia datada na pasta — dez
         conferências viravam dez arquivos do mesmo documento. O histórico não
         se perde: o Drive guarda as versões do arquivo por 30 dias, e o que
         mudou está registrado na própria ação. */
      await files.save({
        buffer, originalName: nome, nomeFixo: true,
        prefix: `${REPO}/Extensão/${slug(acao.curso || "geral")}/${anoDaPasta(acao.numeroAcao, acao.proposta?.periodoFim || acao.criadoEm)}/${slug(acao.numeroAcao || acao.id)}`,
      });
    } catch (e) {
      console.error("Falha ao arquivar export no Drive:", e.message);
    }

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    // documento NÃO se guarda em cache: o navegador reservava o PDF baixado
    // antes e devolvia o velho no clique seguinte — quem acabou de corrigir
    // o texto reabria o documento e via o erro de novo
    res.setHeader("Cache-Control", "no-store, must-revalidate");
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
    inscricoesAteHora: horaLimiteInscricao(ev),
    inscricoesAbertas: podeInscreverEvento(a, hojeLocalISO(), horaLocalHHMM()).ok,
    temCapa: temArte(ev.capa),
    controleFrequencia: eventoControlaFrequencia(ev),
    hotsite: temHotsiteEvento(ev),
  };
  if (!detalhe) return base;
  // as atividades passam pela normalização na saída: o dado antigo (sem id,
  // com `hora`) ganha o shape novo sem migração — e como o item antigo é
  // sempre "geral", o id efêmero que ele ganha aqui não vincula nada
  const programacao = normalizarProgramacao(ev.programacao).map(({ foto, ...atv }) => ({
    ...atv,
    temFoto: !!foto,
    vagasRestantes: atv.inscricao === "propria" ? vagasAtividade(atv, inscritos) : null,
  }));
  // os blocos que o organizador montou (submissão, anais, apoiadores, texto);
  // os invisíveis não saem, e o logotipo vira `temLogo` — a imagem tem rota
  const blocos = normalizarBlocos(ev.blocos).filter((b) => b.visivel !== false)
    .map((b) => Array.isArray(b.itens)
      ? { ...b, itens: b.itens.map(({ logo, ...i }) => ({ ...i, temLogo: temArte(logo) })) }
      : b);
  // modalidade derivada, para o selo do topo: das atividades e da transmissão
  const temOnline = programacao.some((x) => x.modalidade === "online") || !!ev.transmissao?.tipo;
  const temPresencial = !programacao.length || programacao.some((x) => x.modalidade !== "online");
  return {
    ...base, descricao: String(ev.descricao || ""), temaCentral: p.temaCentral || "",
    publicoAlvo: p.publicoAlvo || "", programacao, blocos,
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
    // evento sem hotsite fica FORA da vitrine: quem não montou página não
    // está divulgando — a inscrição dele chega pelo QR que a coordenação
    // projeta, não por quem passeia pela lista
    res.json({ eventos: acoes.filter((a) => a?.evento?.ativo && temHotsiteEvento(a.evento))
      .map((a) => eventoPublico(a)) });
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
    // walletGoogle diz ao hotsite se o botão da carteira tem para onde levar
    res.json({ evento: eventoPublico(a, { detalhe: true }), walletGoogle: walletConfigurada() });
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
    // o telefone entra na planilha de certificados da AEE, que é quem emite:
    // linha sem telefone lá é certificado que não sai (decisão do dono,
    // ago/2026) — por isso ele deixou de ser opcional
    if (telefone.replace(/\D/g, "").length < 10)
      return res.status(400).json({ error: "Informe o telefone com DDD — ele vai na planilha de emissão do certificado." });
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
      const aberta = podeInscreverEvento(a, hojeLocalISO(), horaLocalHHMM());
      if (!aberta.ok) return { erro: [409, aberta.motivo], gravar: false };
      const parts = a.participantes || (a.participantes = { inscritos: [], palestrantes: [], comissao: [] });
      parts.inscritos = parts.inscritos || [];
      {
        const ja = jaInscrito(parts.inscritos, { cpf, email });
        if (ja) {
          // O erro precisa ser uma SAÍDA, não uma parede (pergunta do dono,
          // ago/2026): quem não recebeu o e-mail tenta de novo, bate aqui e
          // fica sem caminho. A resposta diz que a inscrição existe, com que
          // e-mail (mascarado — é como a pessoa reconhece o próprio engano de
          // digitação) e a tela abre a recuperação já preenchida.
          // A PISTA do e-mail só sai quando a pessoa JÁ PROVOU conhecer o
          // endereço (decisão do dono, ago/2026, revendo a anterior): casando
          // só pelo CPF, dizer "j••••@gmail.com" transformaria a rota pública
          // num oráculo — com uma lista de CPFs dá para descobrir quem
          // participou de um evento e qual o provedor de e-mail da pessoa.
          // Quem digitou o próprio endereço errado continua tendo saída: a
          // recuperação pede CPF e e-mail juntos, e a coordenação vê a lista.
          const mesmoEmail = String(ja.email || "").trim().toLowerCase() === email;
          return { erro: [409, mesmoEmail
            ? "Você já está inscrito neste evento — o link da sua credencial continua valendo."
            : "Já existe inscrição com este CPF neste evento, feita com outro e-mail. "
              + "Use “Já me inscrevi e perdi o link” com o CPF e o e-mail usados na inscrição — "
              + "ou fale com a coordenação do evento."],
            jaInscrito: { emailPista: mesmoEmail ? emailMascarado(ja.email) : "", mesmoEmail },
            gravar: false };
        }
      }
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
    // a subida do estado NÃO trava a fila (o QR projetado no telão faz
    // cinquenta pessoas se inscreverem ao mesmo tempo, e cada `flush`
    // reescreve o arquivo inteiro no Drive). O que garante a inscrição é o
    // que vem depois da resposta — ver abaixo.
    }, { flushJa: false });
    if (r.erro) return res.status(r.erro[0])
      .json({ error: r.erro[1], ...(r.jaInscrito ? { jaInscrito: r.jaInscrito } : {}) });

    // A pessoa não espera o Drive: a resposta sai agora, com o token que já
    // vale na tela.
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({ ok: true, token: r.inscrito.token, codigo: codigoDe(r.inscrito.token) });

    /* O E-MAIL É O RECIBO, e por isso ele sai DEPOIS de a inscrição estar
       gravada de verdade (raciocínio do dono, ago/2026): se algo falhar no
       meio, a pessoa não recebe nada e simplesmente se inscreve de novo —
       falha que se corrige sozinha. O que NÃO pode acontecer é o contrário:
       e-mail entregue, com QR, de uma inscrição que se perdeu — aí ela chega
       na porta com um crachá que o sistema não reconhece e jura que se
       inscreveu. Daí a ordem: responder, garantir a gravação, só então
       avisar. A espera do flush corre FORA da fila, então não segura a
       inscrição de quem vem atrás. */
    try {
      await storage.flush?.();
    } catch (e) {
      console.error("[eventos] inscrição não gravou no Drive — e-mail NÃO enviado:", e.message);
      return;                       // sem recibo: a pessoa refaz e nada fica pela metade
    }
    try {
      const { enviarEmail, emailInscricaoEvento } = await import("./lib/mailer.js");
      // o QR vai EMBUTIDO no e-mail (decisão do dono, ago/2026): é onde a
      // pessoa vai procurar a credencial no dia. Falhar em desenhá-lo não
      // cancela o aviso — o e-mail sai com o link e o código manual.
      let qrPng = null;
      try {
        const { default: QRCode } = await import("qrcode");
        qrPng = await QRCode.toBuffer(String(r.inscrito.token), {
          type: "png", errorCorrectionLevel: "M", margin: 1, width: 440,
        });
      } catch (e) { console.error("[eventos] QR do e-mail não gerado:", e.message); }
      await enviarAviso("ev-inscricao", emailInscricaoEvento(r.acao, r.inscrito,
        { baseUrl: base, qrPng, wallet: walletConfigurada() }));
    } catch (e) {
      console.error("[eventos] confirmação de inscrição não enviada:", e.message);
    }
    return;
  } catch (e) {
    console.error("Erro na inscrição do evento:", e);
    // a resposta pode já ter saído (o e-mail corre depois dela): responder de
    // novo derrubaria a requisição com "headers already sent"
    if (!res.headersSent)
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
      if (!i.token) { i.token = gerarToken(a.evento.chaveQr); return { inscrito: i, slug: a.evento.slug, acao: a }; }
      return { inscrito: i, slug: a.evento.slug, acao: a, gravar: false };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // REENVIAR a confirmação: o caso comum não é o e-mail errado, é o e-mail
    // que caiu no spam ou demorou. Sai o mesmo documento da inscrição, com o
    // QR embutido — e sempre para o endereço JÁ GRAVADO, nunca para um que
    // venha no pedido: senão a recuperação viraria um jeito de mandar a
    // credencial de alguém para outro lugar.
    let reenviado = false;
    if (req.body?.reenviar === true) {
      try {
        const { enviarEmail, emailInscricaoEvento } = await import("./lib/mailer.js");
        let qrPng = null;
        try {
          const { default: QRCode } = await import("qrcode");
          qrPng = await QRCode.toBuffer(String(r.inscrito.token), {
            type: "png", errorCorrectionLevel: "M", margin: 1, width: 440,
          });
        } catch (e) { console.error("[eventos] QR do reenvio não gerado:", e.message); }
        await enviarAviso("ev-inscricao", emailInscricaoEvento(r.acao, r.inscrito,
          { baseUrl: `${req.protocol}://${req.get("host")}`, qrPng, wallet: walletConfigurada() }));
        reenviado = true;
      } catch (e) { console.error("[eventos] reenvio da confirmação falhou:", e.message); }
    }
    res.json({ ok: true, token: r.inscrito.token, codigo: codigoDe(r.inscrito.token), reenviado });
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
    // o certificado é a razão de a pessoa voltar a esta página depois do
    // evento: ou o botão existe, ou a linha diz o que ainda falta
    const podeCert = acaoCertificavel(r.acao, hojeLocalISO());
    const meuCert = podeCert.ok
      ? certificadoDe(r.acao, { cpf: r.inscrito.cpf, email: r.inscrito.email, nome: r.inscrito.nome },
        { hoje: hojeLocalISO() })
      : null;
    res.json({
      evento: {
        // o curso que sai na página pública diz os DOIS, quando a ação é de
        // mais de um: quem vê o cartaz precisa saber que o evento é dele
        slug: ev.slug, nome: p.nomeAtividade || "", curso: cursosDaAcao(r.acao).join(" e "),
        periodoInicio: p.periodoInicio || "", periodoFim: p.periodoFim || "",
        local: p.local || "", municipio: p.municipio || "",
        transmissaoPublicada: ev.transmissao?.publicada === true,
      },
      certificado: podeCert.ok
        ? (meuCert
          ? { pode: true, ch: meuCert.ch }
          : { pode: false, motivo: eventoControlaFrequencia(ev)
            ? "sai para quem teve presença registrada no evento — fale com a coordenação."
            : "não foi possível apurar o seu certificado neste evento." })
        : { pode: false, motivo: podeCert.motivo },
      inscricao: {
        nome: r.inscrito.nome || "", inscritoEm: r.inscrito.inscritoEm || "",
        codigo: codigoDe(r.inscrito.token),
        presente: r.inscrito.presente === true, presenteEm: r.inscrito.presenteEm || "",
        atividades,
      },
      // o botão da carteira digital só aparece onde ela está configurada
      walletGoogle: walletConfigurada(),
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
      if (prazoInscricaoVencido(a, hojeLocalISO(), horaLocalHHMM()))
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

/* As imagens da página do evento — foto de quem ministra a atividade e
   logotipo de apoiador. Mesma regra da capa: os bytes moram na configuração
   e saem por rota própria, porque base64 dentro do payload deixaria a lista
   de eventos pesada. Só com a página ATIVA (é conteúdo público dela). */
/* Serve a arte nas DUAS formas: a antiga (embutida no registro) e a nova
   (arquivo no Drive, só a referência na ação). Enquanto houver evento que a
   migração não alcançou, as duas convivem — e a rota é a mesma. */
async function lerArte(v) {
  const dataUrl = partesDataUrl(v);
  if (dataUrl) return dataUrl;
  if (!ehReferencia(v)) return null;
  try {
    const buffer = await files.read?.(v.fileId);
    return buffer?.length ? { tipo: v.tipo || "image/jpeg", buffer } : null;
  } catch (e) {
    console.error("[artes] não foi possível ler a imagem:", e.message);
    return null;
  }
}
/* Sobe UMA arte ao Drive e devolve a referência. Vive fora da fila de
   escrita, de propósito: subir arquivo é lento, e fazê-lo dentro da fila
   seguraria a inscrição e o check-in de quem estivesse atrás (é a mesma
   razão pela qual o anexo do portfólio sobe antes do `comAcoes`). */
async function guardarArte(valor, { acao, nome }) {
  const arte = partesDataUrl(valor);
  if (!arte) return null;
  const data = await files.save({
    buffer: arte.buffer,
    originalName: `${nome}.${extensaoDe(arte.tipo)}`,
    prefix: `${REPO}/Extensão/${slug(acao.curso || "geral")}/${anoDaPasta(acao.numeroAcao, acao.proposta?.periodoFim || acao.criadoEm)}/${slug(acao.numeroAcao || acao.id)}/evento`,
  });
  return { fileId: data.fileId, tipo: arte.tipo, bytes: arte.buffer.length,
    em: new Date().toISOString() };
}

async function serviuImagem(res, valor) {
  const arte = await lerArte(valor);
  if (!arte) return false;
  res.setHeader("Content-Type", arte.tipo);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(arte.buffer);
  return true;
}
app.get("/api/publico/eventos/:slug/atividade/:aid/foto", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    if (!a?.evento?.ativo) return res.status(404).send("Evento não encontrado");
    const atv = (a.evento.programacao || []).find((x) => x?.id === req.params.aid);
    if (!(await serviuImagem(res, atv?.foto))) res.status(404).send("Sem foto");
  } catch (e) {
    console.error("Erro na foto da atividade:", e);
    res.status(500).send("Erro ao carregar a imagem");
  }
});
app.get("/api/publico/eventos/:slug/apoiador/:iid/logo", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    if (!a?.evento?.ativo) return res.status(404).send("Evento não encontrado");
    const item = (a.evento.blocos || [])
      .flatMap((b) => b?.itens || []).find((i) => i?.id === req.params.iid);
    if (!(await serviuImagem(res, item?.logo))) res.status(404).send("Sem logotipo");
  } catch (e) {
    console.error("Erro no logotipo do apoiador:", e);
    res.status(500).send("Erro ao carregar a imagem");
  }
});

/* O QR da PÁGINA do evento (pedido do dono, ago/2026): nem toda reunião dá
   para inscrever antes — projeta-se este QR no encerramento e quem estava ali
   se inscreve na hora, pelo celular. Leva ao endereço público do evento, que
   já é público: não há segredo nenhum neste QR. */
app.get("/api/publico/eventos/:slug/qr-inscricao.png", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    if (!a?.evento?.ativo) return res.status(404).send("Evento não encontrado");
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/eventos/${encodeURIComponent(a.evento.slug)}`;
    const { default: QRCode } = await import("qrcode");
    const png = await QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 900 });
    res.setHeader("Content-Type", "image/png");
    if (req.query.baixar !== undefined)
      res.setHeader("Content-Disposition", `attachment; filename="qr-inscricao-${a.evento.slug}.png"`);
    res.setHeader("Cache-Control", "public, max-age=600");
    res.send(png);
  } catch (e) {
    console.error("Erro no QR de inscrição:", e);
    res.status(500).send("Erro ao gerar o QR");
  }
});

/** O mesmo QR em PNG, para BAIXAR e guardar na galeria do celular — é o que
 *  a maioria faz na prática, e funciona sem rede na porta do evento. */
app.get("/api/publico/eventos/:slug/inscricao/:token/qr.png", async (req, res) => {
  try {
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r) return res.status(404).send("Inscrição não encontrada");
    const { default: QRCode } = await import("qrcode");
    const png = await QRCode.toBuffer(String(r.inscrito.token), {
      type: "png", errorCorrectionLevel: "M", margin: 2, width: 720,
    });
    const nome = `credencial-${(r.acao.evento?.slug || "evento")}.png`;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(png);
  } catch (e) {
    console.error("Erro no QR em PNG:", e);
    res.status(500).send("Erro ao gerar o QR");
  }
});

/* O evento no CALENDÁRIO do participante (.ics). É o que Apple e Google
   aceitam sem cadastro nenhum, e resolve o problema de verdade: lembrar a
   pessoa no dia, com o local e o link da credencial junto. As carteiras
   digitais (rota abaixo) exigem credenciais institucionais; o calendário,
   não. */
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/[;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
const icsData = (iso) => String(iso || "").replace(/-/g, "");
function icsMaisUmDia(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return icsData(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
app.get("/api/publico/eventos/:slug/inscricao/:token/evento.ics", async (req, res) => {
  try {
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r) return res.status(404).send("Inscrição não encontrada");
    const p = r.acao.proposta || {};
    const ev = r.acao.evento || {};
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/eventos/${encodeURIComponent(ev.slug || "")}/inscricao/${encodeURIComponent(r.inscrito.token)}`;
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(p.periodoInicio || "") ? p.periodoInicio : "";
    const fim = /^\d{4}-\d{2}-\d{2}$/.test(p.periodoFim || "") ? p.periodoFim : inicio;
    if (!inicio) return res.status(400).send("Evento sem data definida");
    const linhas = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCHE//UNIEGO//PT-BR", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${r.inscrito.token}@arche.app.br`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${icsData(inicio)}`,
      `DTEND;VALUE=DATE:${icsMaisUmDia(fim)}`,     // DTEND de evento de dia inteiro é exclusivo
      `SUMMARY:${icsEsc(p.nomeAtividade || "Evento UNIEGO")}`,
      `LOCATION:${icsEsc([p.local, p.municipio].filter(Boolean).join(" — "))}`,
      `DESCRIPTION:${icsEsc(`Sua credencial: ${url}\nCódigo manual: ${codigoDe(r.inscrito.token).toUpperCase()}\nApresente o QR na entrada.`)}`,
      `URL:${icsEsc(url)}`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY",
      `DESCRIPTION:${icsEsc(`${p.nomeAtividade || "Evento"} é amanhã`)}`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ];
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ev.slug || "evento"}.ics"`);
    res.send(linhas.join("\r\n"));
  } catch (e) {
    console.error("Erro no .ics da inscrição:", e);
    res.status(500).send("Erro ao gerar o calendário");
  }
});

/* --------------------------- carteiras digitais --------------------------
   Google Wallet e Apple Wallet NÃO se resolvem só em código: cada uma exige
   credencial institucional emitida pela plataforma.

   · Google Wallet — conta de EMISSOR aprovada no Google Pay & Wallet Console
     e uma conta de serviço com o escopo wallet_object.issuer. Com isso nas
     env vars (GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL,
     GOOGLE_WALLET_SA_KEY e a classe já criada no console), o botão abaixo
     passa a funcionar: o passe é um JWT assinado aqui e aberto no
     pay.google.com. SEM as variáveis, a rota responde 501 e a página nem
     mostra o botão — nada quebra.
   · Apple Wallet — exige Apple Developer Program (US$ 99/ano), um Pass Type
     ID e o certificado de assinatura; um .pkpass sem assinatura o iPhone
     recusa. Enquanto a instituição não tiver o certificado, não há como
     gerar o passe, e prometer o botão seria pior que não tê-lo.

   Até lá, o que resolve na prática está acima: o QR em PNG para guardar na
   galeria e o evento no calendário do celular. */
/* A credencial da conta de serviço chega por env var, e o caminho que ela faz
   até lá é irregular: o JSON do Google traz "\n" escrito, a colagem no painel
   do Render às vezes leva as aspas junto, e o campo de uma linha corta o bloco
   no meio. Nenhum desses casos é erro de quem configurou — todos descrevem a
   mesma chave.

   Por isso o caminho RECOMENDADO é colar o ARQUIVO JSON INTEIRO, como ele foi
   baixado, em GOOGLE_WALLET_SA_KEY: dele saem a chave e o endereço da conta,
   e não sobra recorte para errar. GOOGLE_WALLET_SA_EMAIL só é preciso quando
   se cola a private_key sozinha. O que ainda assim não virar chave se explica
   na tela, em vez de morrer num 500 mudo. */
function credenciaisWallet() {
  const bruto = String(process.env.GOOGLE_WALLET_SA_KEY || "").trim();
  if (!bruto) return { chave: null, email: "" };
  let s = bruto, email = String(process.env.GOOGLE_WALLET_SA_EMAIL || "").trim();
  if (s.startsWith("{")) {                       // o arquivo da conta, inteiro
    try {
      const j = JSON.parse(s);
      s = String(j.private_key || "");
      if (!email) email = String(j.client_email || "").trim();
    } catch { /* não era JSON válido: segue como texto */ }
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    s = s.slice(1, -1);                          // veio com as aspas do JSON
  s = s.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  let chave = null;
  try { chave = crypto.createPrivateKey(s); } catch { /* fica null: quem chamou avisa */ }
  return { chave, email };
}

const walletConfigurada = () => {
  if (!process.env.GOOGLE_WALLET_ISSUER_ID || !process.env.GOOGLE_WALLET_SA_KEY) return false;
  const { chave, email } = credenciaisWallet();
  return !!(chave && email);
};

const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? iso.split("-").reverse().join("/") : "");
const periodoBR = (ini, fim) => {
  const a = dataBR(ini), b = dataBR(fim);
  return !a ? "—" : (!b || b === a ? a : `${a} a ${b}`);
};

/* Conferência da configuração da carteira, só para o gestor geral: diz o que
   está preenchido e se a chave assina, SEM devolver a chave nem o e-mail da
   conta de serviço inteiros. Existe porque o erro de configuração acontece
   longe daqui — no painel do Render — e adivinhar qual das três variáveis
   está torta custa uma tarde. */
app.get("/api/eventos/wallet/diagnostico", async (req, res) => {
  if (!(await exigirGestor(req, res))) return;
  const emissor = String(process.env.GOOGLE_WALLET_ISSUER_ID || "");
  const bruto = String(process.env.GOOGLE_WALLET_SA_KEY || "");
  const { chave, email } = credenciaisWallet();
  let assina = false, erro = "";
  if (chave) {
    try { crypto.createSign("RSA-SHA256").update("arche").sign(chave, "base64url"); assina = true; }
    catch (e) { erro = e.message; }
  }
  res.json({
    emissor: { preenchido: !!emissor, sóDígitos: /^\d+$/.test(emissor), valor: emissor },
    contaDeServico: {
      preenchido: !!email,
      pareceContaDeServico: /@[\w-]+\.iam\.gserviceaccount\.com$/.test(email.trim()),
      dominio: email.includes("@") ? email.split("@").pop() : "",
      origem: process.env.GOOGLE_WALLET_SA_EMAIL ? "variável própria" : "lido do JSON",
    },
    chave: {
      preenchida: !!bruto, caracteres: bruto.length,
      colaramOJsonInteiro: bruto.trim().startsWith("{"),
      trazMarcadorPEM: bruto.includes("BEGIN") && bruto.includes("PRIVATE KEY"),
      // "chegou inteiro" se o JSON fecha em } ou se a PEM termina no END —
      // são as duas formas válidas de colar, e cada uma acaba num lugar
      chegouInteiro: bruto.trim().startsWith("{")
        ? bruto.trim().endsWith("}")
        : /-----END [A-Z ]*PRIVATE KEY-----\\?n?\s*$/.test(bruto.trim()),
      quebrasDeLinhaEscritas: bruto.includes("\\n"), quebrasDeLinhaReais: bruto.includes("\n"),
      lidaComoChave: !!chave, tipo: chave ? chave.asymmetricKeyType : "", assina, erro,
    },
    classe: process.env.GOOGLE_WALLET_CLASS_ID || "(definida no próprio passe)",
    pronto: !!(emissor && email && chave && assina),
  });
});

/* Com `?ir=1` a rota REDIRECIONA em vez de devolver JSON: é o que permite que
   o botão seja um link simples — no e-mail de confirmação, onde não há
   JavaScript, e em qualquer lugar que só saiba abrir um endereço. O passe é
   montado na hora, então o link do e-mail não envelhece. */
app.get("/api/publico/eventos/:slug/inscricao/:token/wallet", async (req, res) => {
  const ir = req.query.ir === "1";
  const falhar = (cod, msg) => ir
    ? res.status(cod).type("text/plain; charset=utf-8").send(msg)
    : res.status(cod).json({ error: msg });
  try {
    if (!walletConfigurada())
      return falhar(501, "A carteira digital ainda não está configurada nesta instituição.");
    const r = await acharInscricao(req.params.slug, req.params.token);
    if (!r) return falhar(404, "Inscrição não encontrada");
    const p = r.acao.proposta || {};
    const ev = r.acao.evento || {};
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const emissor = process.env.GOOGLE_WALLET_ISSUER_ID;
    /* Sem GOOGLE_WALLET_CLASS_ID, a CLASSE do passe vai definida no próprio
       JWT: assim a configuração se resume ao emissor e à conta de serviço —
       ninguém precisa criar a classe à mão no console antes do primeiro
       passe. Se a env var vier preenchida, respeitamos a classe já criada
       lá (é o caso de quem quiser personalizar a arte do cartão). */
    const classe = process.env.GOOGLE_WALLET_CLASS_ID || `${emissor}.arche-evento`;
    const classeNoJwt = process.env.GOOGLE_WALLET_CLASS_ID ? [] : [{ id: classe }];
    const objeto = {
      id: `${emissor}.${r.inscrito.token}`,
      classId: classe,
      state: "ACTIVE",
      hexBackgroundColor: "#1c3742",
      cardTitle: { defaultValue: { language: "pt-BR", value: "UNIEGO · Evento" } },
      header: { defaultValue: { language: "pt-BR", value: String(p.nomeAtividade || "Evento").slice(0, 60) } },
      subheader: { defaultValue: { language: "pt-BR", value: String(r.inscrito.nome || "").slice(0, 60) } },
      barcode: { type: "QR_CODE", value: String(r.inscrito.token),
        alternateText: codigoDe(r.inscrito.token).toUpperCase() },
      textModulesData: [
        { id: "quando", header: "Quando", body: periodoBR(p.periodoInicio, p.periodoFim) },
        { id: "onde", header: "Onde", body: [p.local, p.municipio].filter(Boolean).join(" — ") || "—" },
      ],
      // a marca da instituição e, quando houver, a arte do evento: é o que
      // faz o cartão na carteira parecer o crachá do evento, e não um genérico
      logo: { sourceUri: { uri: `${base}/assets/logo-uniego.png` },
        contentDescription: { defaultValue: { language: "pt-BR", value: "UNIEGO" } } },
      ...(ev.capa ? { heroImage: { sourceUri: { uri: `${base}/api/publico/eventos/${encodeURIComponent(ev.slug || "")}/capa` } } } : {}),
      linksModuleData: { uris: [{ uri: `${base}/eventos/${encodeURIComponent(ev.slug || "")}`, description: "Página do evento" }] },
    };
    const { chave, email } = credenciaisWallet();
    if (!chave || !email) {
      console.error("[wallet] credencial da conta de serviço não reconhecida");
      return falhar(500, "A credencial da conta de serviço não foi reconhecida. Em GOOGLE_WALLET_SA_KEY, cole o arquivo JSON da conta de serviço INTEIRO, como foi baixado — não é preciso recortar a chave.");
    }
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = { alg: "RS256", typ: "JWT" };
    const corpo = {
      iss: email,
      aud: "google", typ: "savetowallet", iat: agora,
      origins: [base],
      payload: { ...(classeNoJwt.length ? { genericClasses: classeNoJwt } : {}), genericObjects: [objeto] },
    };
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const assinar = `${b64(cabecalho)}.${b64(corpo)}`;
    const assinatura = crypto.createSign("RSA-SHA256").update(assinar).sign(chave, "base64url");
    const url = `https://pay.google.com/gp/v/save/${assinar}.${assinatura}`;
    if (ir) return res.redirect(302, url);
    res.json({ url });
  } catch (e) {
    console.error("Erro no passe da carteira digital:", e);
    falhar(500, "Não foi possível gerar o passe agora.");
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
    const t0 = Date.now();
    // a porta é o caminho de MAIOR frequência do sistema: a subida do estado
    // fica para a janela do storage, senão cada leitura espera a anterior
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
      // Crachá de outro evento, print da inscrição de um colega, QR sujo — é
      // ruído de porta, não ataque: quem chegou aqui já provou o código do
      // monitor, e o campus inteiro é UM IP atrás do NAT, então punir a
      // leitura ruim derrubaria o credenciamento de todos os plantões.
      // MAS o caminho MANUAL é outra coisa: `codigo` são 6 caracteres SEM
      // assinatura, e varrer de 000000 a ffffff devolveria a lista nominal
      // do evento (e marcaria presença em quem não veio). Digitar seis
      // caracteres errados vinte vezes num plantão não é rotina — por
      // token não conta, por código conta (achado da varredura ago/2026).
      if (!inscrito)
        return { erro: [404, "Inscrição não encontrada."], falha: !b.token, gravar: false };
      const idAtv = atv ? atv.id : "";
      // Evento SEM controle de frequência não tem porta: a inscrição já é a
      // presença, e todo inscrito conta 100% (decisão do dono, ago/2026)
      if (!eventoControlaFrequencia(a.evento))
        return { erro: [400, "Este evento não faz controle de frequência — quem está inscrito já conta como presente."], gravar: false };
      // Atividade SEM controle de frequência não se credencia (decisão do
      // dono, ago/2026): quem está inscrito já recebe as horas, e deixar o
      // monitor ler QR à toa daria a impressão de que a presença importa.
      if (atv && atv.frequencia === "nenhum")
        return { erro: [400, `“${atv.titulo}” não faz controle de frequência — quem está inscrito já recebe as horas.`], gravar: false };
      /* Quem chega sem ter marcado a atividade É INSCRITO NA HORA (decisão do
         dono, ago/2026): em evento de programação múltipla muita gente se
         inscreve só no geral e aparece na oficina — registrar a presença sem
         a inscrição deixaria a atividade fora da lista da pessoa e, depois,
         fora do certificado. Só entra havendo VAGA; lotada, a presença vale
         igual (a pessoa está ali) e o monitor vê o aviso na tela para decidir. */
      let inscritoAgora = false;
      if (atv && atv.inscricao === "propria" && !(inscrito.atividades || []).includes(atv.id)) {
        const pode = podeEscolherAtividade(a.evento, atv.id,
          a.participantes?.inscritos || [], inscrito.atividades || []);
        if (pode.ok) {
          inscrito.atividades = [...(inscrito.atividades || []), atv.id];
          inscritoAgora = true;
        }
      }
      const extras = atv ? {
        atividade: atv.titulo,
        ...(inscritoAgora ? { inscritoAgora: true } : {}),
        // presença vale mesmo sem a marcação (a pessoa chegou e participou —
        // remanejamento de última hora é rotina de evento), mas a tela avisa
        ...(atv.inscricao === "propria" && !(inscrito.atividades || []).includes(atv.id)
          ? { naoInscritoNaAtividade: true } : {}),
      } : {};
      const presencas = inscrito.presencas || (inscrito.presencas = []);
      const anterior = presencas.find((x) => String(x?.atividade || "") === idAtv);
      const agora = new Date().toISOString();
      /* ENTRADA E SAÍDA (decisão do dono, ago/2026): em atividade marcada
         assim o monitor DIZ o que está registrando — o plantão de saída é
         outro momento, com o link aberto de novo e a fase escolhida na tela.
         Deduzir "segunda leitura = saída" transformaria em saída o crachá
         relido por engano; e o monitor da porta, no fim da oficina, não tem
         como saber quem já passou por ali. */
      const fase = String(b.fase || "") === "saida" ? "saida" : "entrada";
      if (atv && atv.frequencia === "entrada_saida" && fase === "saida") {
        if (!anterior) {
          // ninguém registrou a chegada desta pessoa (chegou antes do monitor,
          // fila grande): a presença vale — registra a ENTRADA e avisa
          presencas.push({ atividade: idAtv, em: agora, por: "monitor" });
          if (inscrito.presente !== true) {
            inscrito.presente = true; inscrito.presenteEm = agora; inscrito.presentePor = "monitor";
          }
          a.atualizadoEm = agora;
          return { nome: inscrito.nome || "", presenteEm: agora, entradaSemRegistro: true, ...extras };
        }
        if (anterior.saidaEm)
          return { ja: true, completa: true, nome: inscrito.nome || "", presenteEm: anterior.em || "",
            saidaEm: anterior.saidaEm, permanencia: minutosEntre(anterior.em, anterior.saidaEm),
            ...extras, gravar: false };
        if (Date.parse(agora) - Date.parse(anterior.em || 0) < 60000)
          return { ja: true, nome: inscrito.nome || "", presenteEm: anterior.em || "", ...extras, gravar: false };
        anterior.saidaEm = agora;
        anterior.saidaPor = "monitor";
        a.atualizadoEm = agora;
        return { saida: true, nome: inscrito.nome || "", presenteEm: anterior.em || "",
          saidaEm: agora, permanencia: minutosEntre(anterior.em, agora), ...extras };
      }
      // idempotente POR NÍVEL: repetir a mesma atividade (ou a entrada geral)
      // devolve a primeira hora; registro antigo sem `presencas` conta como
      // a entrada geral já feita. MAS presença DESFEITA pela gestão volta a
      // valer aqui (achado da revisão de ago/2026): responder "já
      // credenciado" com presente=false deixaria a pessoa fora do export de
      // presentes sem ninguém perceber — quem se apresenta de novo, conta.
      if (anterior || (!atv && !presencas.length && inscrito.presente === true)) {
        if (inscrito.presente === true)
          return { ja: true, nome: inscrito.nome || "",
            presenteEm: anterior?.em || inscrito.presenteEm || "", ...extras,
            // a presença já estava lá, mas a inscrição na atividade pode ter
            // acabado de nascer — aí há o que gravar
            ...(inscritoAgora ? {} : { gravar: false }) };
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
    }, { flushJa: false });
    if (r.erro) {
      if (r.falha) freioCheckin.falhou(req.ip);   // só o CÓDIGO DO MONITOR errado conta ao freio
      return res.status(r.erro[0]).json({ error: r.erro[1] });
    }
    // evidência para a próxima porta: se uma leitura demorar, fica dito no log
    const ms = Date.now() - t0;
    if (ms > 1500) console.warn(`[eventos] check-in lento: ${ms} ms (${req.params.slug})`);
    // só o nome de QUEM apresentou o token — nada da lista sai por aqui
    res.json({ ok: true, ja: r.ja === true, nome: r.nome, presenteEm: r.presenteEm,
      ...(r.saida ? { saida: true } : {}),
      ...(r.completa ? { completa: true } : {}),
      ...(r.entradaSemRegistro ? { entradaSemRegistro: true } : {}),
      ...(r.saidaEm ? { saidaEm: r.saidaEm } : {}),
      ...(r.permanencia !== undefined ? { permanencia: r.permanencia, permanenciaTxt: duracaoBR(r.permanencia) } : {}),
      ...(r.atividade ? { atividade: r.atividade } : {}),
      ...(r.inscritoAgora ? { inscritoAgora: true } : {}),
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
    if (!a?.evento?.ativo) return res.status(404).send("Evento sem capa");
    if (!(await serviuImagem(res, a.evento.capa))) res.status(404).send("Evento sem capa");
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
    // quem CRIA o evento é a coordenação dele, e entra na comissão
    // organizadora nesse papel (pedido do dono, ago/2026): era a linha que
    // todo mundo esquecia de preencher — e sem ela o próprio coordenador
    // ficava fora do certificado do evento que organizou. Os dados vêm do
    // perfil, que já exige nome, CPF, telefone e e-mail.
    const meuPerfil = (await carregarPerfis())[u.email] || {};
    /* As ARTES (capa, foto de palestrante, logotipo) sobem ao Drive AQUI,
       antes da fila, e o que entra no registro da ação é só a referência.
       Antes elas ficavam embutidas, e como o estado é um arquivo reescrito
       inteiro a cada gravação, cada presença marcada subia megabytes de
       imagem que não mudaram (varredura de ago/2026: ~92% do arquivo).
       O que já está gravado na forma antiga continua sendo servido — quem o
       converte é a migração de arranque. */
    {
      const pre = (await lerAcoes()).find((x) => x.id === req.params.id);
      if (pre) {
        try {
          if (ehDataUrl(b.capa)) {
            if (bytesDataUrl(b.capa) > 1024 * 1024)
              return res.status(400).json({ error: "A capa passa de 1 MB depois do ajuste — envie uma arte mais leve." });
            b.capa = await guardarArte(b.capa, { acao: pre, nome: "capa" });
          }
          for (const atv of Array.isArray(b.programacao) ? b.programacao : []) {
            if (ehDataUrl(atv?.foto)) atv.foto = await guardarArte(atv.foto, { acao: pre, nome: `foto-${slug(atv.titulo || atv.id || "atividade")}` });
          }
          for (const bloco of Array.isArray(b.blocos) ? b.blocos : []) {
            for (const item of bloco?.itens || []) {
              if (ehDataUrl(item?.logo)) item.logo = await guardarArte(item.logo, { acao: pre, nome: `logo-${slug(item.nome || item.id || "apoiador")}` });
            }
          }
        } catch (e) {
          console.error("[artes] falha ao guardar a imagem:", e.message);
          return res.status(502).json({ error: "Não foi possível guardar a imagem agora. Tente de novo em instantes." });
        }
      }
    }
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a || !podeOperarEvento(u, a)) return { erro: [404, "Ação não encontrada"], gravar: false };
      const primeiraVez = !a.evento;
      const estavaAtivo = a.evento?.ativo === true;
      const ev = { ...(a.evento || {}) };
      if (b.ativo !== undefined) ev.ativo = !!b.ativo;
      // página pública só de ação APROVADA: o número é o que diz que a
      // PROPPEX conhece e acolheu a atividade que se está divulgando
      if (ev.ativo && !a.numeroAcao)
        return { erro: [400, "Só ação aprovada (com Número da Ação) publica página de evento."], gravar: false };
      // e só com o PROJETO completo (decisão do dono, ago/2026): a régua é a
      // dos campos obrigatórios da proposta da Extensão — a trava vale só na
      // ATIVAÇÃO, para não prender ajustes de um evento que já está no ar
      if (ev.ativo && !estavaAtivo) {
        const faltas = faltaNoProjetoDoEvento(a);
        if (faltas.length)
          return { erro: [400, "O projeto do evento ainda não está completo para publicação — falta: "
            + faltas.join(", ") + ". Complete na guia Dados do evento."], gravar: false };
      }
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
      if (b.inscricoesAteHora !== undefined) {
        const h = String(b.inscricoesAteHora || "").trim();
        if (h && !RE_HORA_LIMITE.test(h))
          return { erro: [400, "Hora-limite de inscrição inválida — use o formato 21:00."], gravar: false };
        ev.inscricoesAteHora = h;
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
      if (b.blocos !== undefined && !Array.isArray(b.blocos))
        return { erro: [400, "Blocos inválidos — envie a lista de blocos."], gravar: false };
      // as IMAGENS (foto de palestrante, logotipo de apoiador) não viajam nos
      // payloads: a tela recebe só `temFoto`/`temLogo`. Salvar a programação
      // ou os blocos, então, apagaria todas elas — a menos que o que está
      // gravado seja preservado item a item, como já se faz com a capa. Campo
      // enviado VAZIO é remoção explícita; campo ausente é "não mexi nele".
      if (b.blocos !== undefined) ev.blocos = preservarImagens(
        normalizarBlocos(b.blocos), b.blocos, ev.blocos, "logo");
      if (b.programacao !== undefined) ev.programacao = preservarImagens(
        normalizarProgramacao(b.programacao), b.programacao, ev.programacao, "foto");
      if (b.formulario !== undefined) ev.formulario = normalizarFormulario(b.formulario);
      if (b.local !== undefined) ev.local = String(b.local || "").trim().slice(0, 200);
      // o interruptor do EVENTO: sem controle de frequência, ninguém
      // credencia e todo inscrito conta como presente
      if (b.controleFrequencia !== undefined) ev.controleFrequencia = b.controleFrequencia !== false;
      // hotsite completo × só a folha de inscrição (pedido do dono, ago/2026)
      if (b.hotsite !== undefined) ev.hotsite = b.hotsite !== false;
      // vazio volta ao texto institucional padrão (LGPD_TEXTO_PADRAO)
      if (b.lgpdTexto !== undefined) ev.lgpdTexto = String(b.lgpdTexto || "").trim().slice(0, 2000);
      if (b.capa !== undefined) {
        // aqui a capa já chega como REFERÊNCIA (a subida ao Drive aconteceu
        // antes da fila); "" continua removendo, e o formato foi conferido lá
        if (!b.capa) delete ev.capa;
        else if (ehReferencia(b.capa)) ev.capa = b.capa;
        else return { erro: [400, "A capa deve ser uma imagem JPEG, PNG ou WebP."], gravar: false };
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
      if (primeiraVez) {
        a.participantes = a.participantes || { inscritos: [], palestrantes: [], comissao: [] };
        a.participantes.comissao = a.participantes.comissao || [];
        const jaEsta = a.participantes.comissao.some((x) =>
          String(x?.email || "").toLowerCase() === u.email.toLowerCase());
        if (!jaEsta) {
          a.participantes.comissao.unshift(normalizarPessoaEvento({
            nome: meuPerfil.nome || u.nome || u.email,
            cpf: meuPerfil.cpf || "", email: u.email,
            telefone: meuPerfil.telefone || "",
            papel: "coordenacao", funcao: "Coordenação do evento",
          }));
        }
      }
      return { evento: ev, ativou: ev.ativo === true && !estavaAtivo, acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // página entrou no ar → aviso ao setor de eventos (eventos@uniego.edu.br),
    // fire-and-forget: e-mail que falha não desfaz a ativação
    if (r.ativou) {
      try {
        const { enviarEmail, emailEventoAtivado } = await import("./lib/mailer.js");
        enviarAviso("ev-pagina-ativada", emailEventoAtivado(r.acao))
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
    // a gestão marca presença em SÉRIE — a lista de papel de um evento de 300
    // pessoas são 300 cliques —, e com o flush dentro da fila cada um
    // reescrevia o `_estado.json` INTEIRO no Drive. Mesma correção do
    // credenciamento: o dado entra na memória e a subida vai para a janela de
    // 1,2 s do storage, que agrupa a rajada num upload só.
    }, { flushJa: false });
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

/* ================== ARCHÉ ES — RESERVA DE ESPAÇOS =======================
   Auditório, quadra, mini auditórios, salas de aula e laboratórios: poucos,
   disputados, e até ago/2026 reservados por WhatsApp. Três chaves internas
   (fora do /api/estado, porque guardam contato de quem pediu):
   `esp-espacos-v1` (catálogo), `esp-reservas-v1` e `esp-bloqueios-v1`.

   O fluxo é o que o dono descreveu: o pedido cai para a RESPONSÁVEL pela
   reserva (coordenação do módulo `espacos`), que confirma o que está
   pré-autorizada a decidir ou encaminha à PROPPEX. Espaço já confirmado ou
   bloqueado TRAVA o pedido — e quem barra é este servidor, dentro da fila de
   escrita, porque dois pedidos simultâneos são exatamente o caso em que a
   conferência da tela não vale nada.
   ======================================================================== */
const ESP_ESPACOS = "esp-espacos-v1";
const ESP_RESERVAS = "esp-reservas-v1";
const ESP_BLOQUEIOS = "esp-bloqueios-v1";
const ESP_SEQ = "esp-config-v1";

const gereEsp = (u) => !!u?.modulos?.includes("espacos");

async function lerEspacos() {
  const raw = await storage.get(ESP_ESPACOS);
  const lista = raw ? normalizarEspacos(JSON.parse(raw)) : [];
  return lista.length ? lista : normalizarEspacos(ESPACOS_PADRAO);
}
async function lerReservas() {
  const raw = await storage.get(ESP_RESERVAS);
  return raw ? JSON.parse(raw) : [];
}
async function lerBloqueios() {
  const raw = await storage.get(ESP_BLOQUEIOS);
  return raw ? JSON.parse(raw) : [];
}

/* Fila serializada: é ela que faz a trava de conflito valer. Duas pessoas
   pedindo o mesmo auditório no mesmo segundo leem a mesma agenda; só dentro
   da fila a segunda enxerga a primeira. */
let filaEsp = Promise.resolve();
function comReservas(fn) {
  const proxima = filaEsp.then(async () => {
    const reservas = await lerReservas();
    const r = await fn(reservas);
    if (r?.gravar !== false) {
      await storage.set(ESP_RESERVAS, JSON.stringify(reservas));
      await storage.flush?.();
    }
    return r;
  });
  filaEsp = proxima.catch(() => {});
  return proxima;
}

/** Protocolo RES-AAAA-NNN, na ordem em que as reservas são pedidas. Emitido
    aqui dentro, como o número da ação de extensão: sequência no cliente é
    número repetido esperando acontecer. */
async function novoProtocoloReserva() {
  const ano = Number(hojeLocalISO().slice(0, 4));
  const raw = await storage.get(ESP_SEQ);
  let cfg = raw ? JSON.parse(raw) : { ano, seq: 0 };
  if (cfg.ano !== ano) cfg = { ano, seq: 0 };
  cfg.seq++;
  await storage.set(ESP_SEQ, JSON.stringify(cfg));
  return `RES-${ano}-${String(cfg.seq).padStart(3, "0")}`;
}

/** Semente do catálogo, uma única vez (a marca impede que um deploy ressuscite
    espaço que a gestão apagou de propósito). */
async function subirEspacosIniciais() {
  try {
    if (await storage.get("sys-esp-catalogo-v1")) return;
    if (!(await storage.get(ESP_ESPACOS)))
      await storage.set(ESP_ESPACOS, JSON.stringify(normalizarEspacos(ESPACOS_PADRAO)));
    await storage.set("sys-esp-catalogo-v1", new Date().toISOString());
    console.log("[espacos] catálogo inicial gravado");
  } catch (e) { console.error("[espacos] falha ao semear o catálogo:", e.message); }
}

/**
 * As ETIQUETAS DE COR chegaram depois do catálogo (ago/2026): quem já tinha o
 * catálogo gravado ficou com todos os espaços na cor de reserva — e um
 * calendário monocromático não responde "o auditório está livre?" numa
 * olhada, que é para o que a cor serve.
 *
 * Esta passada aplica a cor do catálogo semente aos espaços que ainda estão
 * na cor padrão, uma única vez. Só toca no que está no padrão: cor escolhida
 * pela gestão é decisão dela, e migração não desfaz decisão.
 */
async function aplicarCoresDosEspacos() {
  try {
    if (await storage.get("sys-esp-cores-v1")) return;
    const gravados = await lerEspacos();
    let mudou = 0;
    const novos = gravados.map((e) => {
      const padrao = ESPACOS_PADRAO.find((x) => x.id === e.id);
      if (!padrao?.cor || e.cor !== "#40717e") return e;
      mudou++;
      return { ...e, cor: padrao.cor };
    });
    if (mudou) {
      await storage.set(ESP_ESPACOS, JSON.stringify(normalizarEspacos(novos)));
      await storage.flush?.();
    }
    await storage.set("sys-esp-cores-v1", new Date().toISOString());
    console.log(`[espacos] cores aplicadas a ${mudou} espaço(s)`);
  } catch (e) {
    console.error("[espacos] falha ao aplicar as cores:", e.message);
  }
}

/**
 * As reservas que a recepção anotava À MÃO (planilha do auditório, 2026):
 * sobem uma única vez, marcadas por `sys-esp-lote-<nome>`. A marca é o que
 * impede um deploy de ressuscitar reserva que a gestão apagou de propósito.
 *
 * Entram como **confirmadas do DIA INTEIRO** (00:00–23:59): a planilha não
 * tinha horário — o que se sabe é que o auditório estava tomado naquele dia,
 * e é exatamente isso que precisa travar o pedido novo. Dias consecutivos com
 * a mesma atividade viraram uma reserva só, que é como a agenda os desenha.
 *
 * A migração NÃO passa pela trava de conflito, de propósito: a planilha tem
 * dias com duas atividades (auditório em turnos diferentes), e recusar a
 * segunda apagaria um registro que existiu. Elas convivem na base; a trava
 * segue valendo para todo pedido novo.
 */
const LOTES_ESPACOS = ["esp-auditorio-2026.json"];

async function subirReservasMigradas() {
  for (const arquivo of LOTES_ESPACOS) {
    const nome = arquivo.replace(/^esp-|\.json$/g, "");
    const marca = `sys-esp-lote-${nome}`;
    try {
      if (await storage.get(marca)) continue;
      const caminho = path.join(__dirname, "dados", arquivo);
      const lote = JSON.parse(await readFile(caminho, "utf8"));
      const espacos = await lerEspacos();

      /* UMA passada pela fila, e UMA emissão de protocolos. A primeira versão
         gravava reserva por reserva: em produção o estado vive no Drive, e
         cada gravação reescreve o arquivo inteiro — 61 reservas viravam 122
         idas ao Drive (a reserva e o contador), o arranque se arrastava e a
         migração podia nem terminar. O lote é conhecido de antemão; não há
         concorrência a arbitrar dentro dele. */
      const ano = Number(hojeLocalISO().slice(0, 4));
      const cfgBruta = await storage.get(ESP_SEQ);
      const cfg = cfgBruta ? JSON.parse(cfgBruta) : { ano, seq: 0 };
      if (cfg.ano !== ano) { cfg.ano = ano; cfg.seq = 0; }

      const r = await comReservas((reservas) => {
        const vistos = new Set(reservas.map((x) => x.id));
        let gravadas = 0;
        for (const linha of lote.reservas || []) {
          const id = `res-${lote.lote}-${linha.dataInicio}-${(linha.linhas || [])[0] || 0}`;
          if (vistos.has(id)) continue;
          cfg.seq++;
          const reserva = normalizarReserva({
            itens: [{ espaco: lote.espaco }],
            dataInicio: linha.dataInicio, dataFim: linha.dataFim,
            horaInicio: "00:00", horaFim: "23:59",     // dia inteiro: não havia horário
            atividade: linha.atividade, orgao: linha.orgao, orgaoOutro: linha.orgaoOutro || "",
            interessado: "setor",
            justificativa: `Reserva registrada na planilha do auditório de 2026${linha.responsavel ? `, por ${linha.responsavel}` : ""}.`,
          }, { espacos, base: { id, status: "confirmada",
            solicitante: { email: "", nome: linha.responsavel || "(planilha da recepção)", telefone: "" },
            criadoEm: linha.solicitadoEm ? `${linha.solicitadoEm}T12:00:00.000Z` : new Date().toISOString() } });
          reserva.protocolo = `RES-${cfg.ano}-${String(cfg.seq).padStart(3, "0")}`;
          reserva.origem = { lote: lote.lote, linhas: linha.linhas || [], corrigido: !!linha.corrigido };
          reserva.historico = [{ em: reserva.criadoEm, por: "migração",
            acao: "confirmada", motivo: "Transcrita da planilha de reservas do auditório (2026)" }];
          reservas.push(reserva);
          vistos.add(id);
          gravadas++;
        }
        return { gravadas, gravar: gravadas > 0 };
      });
      if (r.gravadas) await storage.set(ESP_SEQ, JSON.stringify(cfg));
      await storage.set(marca, new Date().toISOString());
      await storage.flush?.();
      console.log(`[espacos] lote ${nome}: ${r.gravadas} reserva(s) migrada(s)`);
    } catch (e) {
      console.error(`[espacos] falha ao migrar o lote ${nome}:`, e.message);
    }
  }
}

/** A sessão do setor: exige login (a guarda de AREAS_PROTEGIDAS já barrou a
    página; aqui é a API). Qualquer conta aprovada pede reserva — professor,
    coordenação, setor e aluno; a comunidade externa entra pelo pedido que
    alguém da casa registra em nome dela. */
async function sessaoEsp(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(401).json({ error: "Faça login para usar a reserva de espaços." }); return null; }
  if (u.papel === "pendente") { res.status(403).json({ error: "Seu acesso ainda não foi liberado." }); return null; }
  return (await verComoUsuario(req, u, gereEsp(u))) || u;
}

const podeVerReserva = (u, r) => gereEsp(u) || minhaReserva(u.email, r);

/** Quem coordena o módulo `espacos` — a responsável pela reserva, no
    vocabulário do setor. Devolve nome e e-mail, nada além: é uma lista de
    quem decide, não uma porta para o cadastro de ninguém. */
async function responsaveisDosEspacos() {
  const usuarios = await carregarUsuarios(storage);
  const perfis = await carregarPerfis();
  return Object.entries(usuarios.coordenadores || {})
    .filter(([, mods]) => (mods || []).includes("espacos"))
    .map(([email]) => ({ email, nome: perfis[email]?.nome || "" }))
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
}

/** GET /api/espacos — o que a tela precisa para abrir: catálogo, catálogos
    de apoio e as reservas que a pessoa pode ver. */
app.get("/api/espacos", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    const [espacos, reservas, bloqueios] = await Promise.all([lerEspacos(), lerReservas(), lerBloqueios()]);
    const perfil = (await carregarPerfis())[u.email] || {};
    res.json({
      eu: u.email, nome: perfil.nome || u.nome, telefone: perfil.telefone || "",
      gestao: gereEsp(u), gestorGeral: u.papel === "gestor",
      espacos, blocos: BLOCOS_ESP, interessados: INTERESSADOS,
      cursos: CURSOS.map((c) => c.nome), orgaos: gruposDeOrgao(CURSOS),
      // quem vem de fora precisa de ofício: a lista é do catálogo, não uma
      // cópia na tela (o Colégio Couto entrou nela em ago/2026)
      orgaosExternos: ORGAOS_EXTERNOS,
      // os meses que TÊM reserva alimentam o filtro da agenda: com o registro
      // do auditório migrado, há ocupação em todo o semestre, e um seletor só
      // com os meses à frente esconderia metade do ano
      mesesComReserva: [...new Set(reservas.filter(VIVA)
        .flatMap((r) => [String(r.dataInicio).slice(0, 7), String(r.dataFim || r.dataInicio).slice(0, 7)])
        .filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort(),
      bloqueios,
      reservas: reservas.filter((r) => podeVerReserva(u, r)),
      /* Quem é a RESPONSÁVEL pela reserva, para o gestor geral. Não é
         curiosidade: o fluxo do setor pressupõe alguém confirmando o dia a
         dia e encaminhando à PROPPEX só o que foge da autonomia dela — e sem
         ninguém designado no módulo `espacos`, TODO pedido cai na PROPPEX e a
         recepção não consegue confirmar nada. O sistema tem de dizer isso, em
         vez de deixar a pró-reitoria descobrir pelo silêncio. */
      ...(u.papel === "gestor" ? { responsaveis: await responsaveisDosEspacos() } : {}),
      // quem já pediu espaço alguma vez — é por esses olhos que a
      // responsável confere o que o solicitante enxerga da agenda
      ...(gereEsp(euReal(req, u))
        ? { pessoas: await pessoasParaVerComo({
            solicitante: reservas.map((r) => ({
              email: r.solicitante?.email, nome: r.solicitante?.nome })),
          }, euReal(req, u)),
          verComo: String(req.query?.como || "") }
        : {}),
    });
  } catch (e) {
    console.error("Erro ao abrir a reserva de espaços:", e);
    res.status(500).json({ error: "Não foi possível carregar os espaços agora." });
  }
});

/** GET /api/espacos/agenda — o calendário que TODO usuário logado vê, no
    setor e na página inicial. Diz onde, quando e para quê; nunca quem pediu,
    nem a justificativa. É o que evita o pedido em cima do que já está
    ocupado — e ninguém precisa de contato alheio para isso. */
app.get("/api/espacos/agenda", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u || u.papel === "pendente") return res.status(401).json({ error: "Faça login para ver a agenda." });
    const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || "")) ? String(req.query.de) : hojeLocalISO();
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || "")) ? String(req.query.ate) : somaDias(de, 30);
    const espaco = String(req.query.espaco || "");
    const [espacos, reservas, bloqueios] = await Promise.all([lerEspacos(), lerReservas(), lerBloqueios()]);
    res.json({
      de, ate, espacos,
      reservas: agenda(reservas, { de, ate, espaco }).map((r) => reservaPublica(espacos, r)),
      bloqueios: bloqueios.filter((b) => b.dataFim >= de && b.dataInicio <= ate
        && (!espaco || b.espacos.includes(espaco))),
    });
  } catch (e) {
    console.error("Erro na agenda de espaços:", e);
    res.status(500).json({ error: "Não foi possível carregar a agenda agora." });
  }
});

/**
 * POST /api/espacos/reservas — pede o espaço. `simular: true` devolve os
 * impedimentos sem gravar nada: é o que a tela usa para avisar ANTES de
 * enviar. A trava real é aqui dentro, na fila.
 */
app.post("/api/espacos/reservas", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    const espacos = await lerEspacos();
    const perfil = (await carregarPerfis())[u.email] || {};
    const simular = req.body?.simular === true;
    const bruto = req.body?.reserva || req.body || {};
    const nova = normalizarReserva(bruto, { espacos, base: {
      id: "res-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      status: "solicitada",
      solicitante: { email: u.email, nome: perfil.nome || u.nome || u.email, telefone: perfil.telefone || "" },
    } });
    nova.solicitante.telefone = String(bruto?.solicitante?.telefone || perfil.telefone || "").trim().slice(0, 40);
    const erros = validarReserva(nova, { espacos, cursos: CURSOS });
    if (erros.length) return res.status(400).json({ error: erros.join(" "), erros });

    const bloqueios = await lerBloqueios();
    if (simular) {
      const reservas = await lerReservas();
      const imp = impedimentos(nova, { reservas, bloqueios, espacos });
      return res.json({ simulacao: true, ...imp,
        concorrentes: conflitos(reservas, nova, { espacos, apenasConfirmadas: false })
          .filter((c) => !OCUPA(c)).map((c) => reservaPublica(espacos, c)) });
    }

    const r = await comReservas(async (reservas) => {
      const imp = impedimentos(nova, { reservas, bloqueios, espacos });
      if (!imp.livre) return { erro: [409, imp.motivos.join(" ")], gravar: false };
      nova.protocolo = await novoProtocoloReserva();
      nova.historico = [{ em: new Date().toISOString(), por: u.email, acao: "solicitada" }];
      reservas.push(nova);
      return { reserva: nova };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });

    // aviso à responsável pela reserva, com cópia ao setor de eventos —
    // fire-and-forget: e-mail que falha não desfaz a solicitação
    avisarReserva(r.reserva, espacos, "nova").catch(() => {});
    res.json({ ok: true, reserva: r.reserva });
  } catch (e) {
    console.error("Erro ao solicitar espaço:", e);
    res.status(500).json({ error: "Não foi possível registrar a solicitação agora." });
  }
});

/**
 * POST /api/espacos/reservas/:id/decidir — o degrau da responsável pela
 * reserva e o da PROPPEX, na mesma rota porque o ato é o mesmo:
 *   confirmar  (gestão do módulo ou gestor geral)
 *   encaminhar (a responsável manda o caso à PROPPEX)
 *   recusar    (com motivo — recusa sem motivo não se explica depois)
 * Confirmar reconfere o conflito: entre o pedido e a decisão, outra reserva
 * pode ter sido confirmada para o mesmo espaço.
 */
app.post("/api/espacos/reservas/:id/decidir", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    const acao = String(req.body?.acao || "");
    if (!["confirmar", "recusar", "encaminhar"].includes(acao))
      return res.status(400).json({ error: "Ação inválida." });
    if (!gereEsp(u) && u.papel !== "gestor")
      return res.status(403).json({ error: "Só a responsável pela reserva e a PROPPEX decidem." });
    /* Os DOIS degraus, e o que separa um do outro (pedido do dono, ago/2026).
       Confirmar e recusar são das duas gestões — a responsável resolve o que
       está na autonomia dela, e a PROPPEX também decide. O que não se mistura:
       ENCAMINHAR é dela PARA a PROPPEX, e o gestor geral É a PROPPEX —
       encaminhar para si mesmo não é passo nenhum. A guarda antiga só pegava
       o gestor que NÃO gerisse o módulo, e como gestor geral recebe todos os
       módulos (modulosDe), ela nunca chegava a valer. */
    if (acao === "encaminhar" && u.papel === "gestor")
      return res.status(400).json({ error: "A PROPPEX é o destino do encaminhamento, não a origem." });
    const motivo = String(req.body?.motivo || "").trim().slice(0, 500);
    if (acao === "recusar" && !motivo)
      return res.status(400).json({ error: "Escreva o motivo da recusa." });

    const [espacos, bloqueios] = await Promise.all([lerEspacos(), lerBloqueios()]);
    const r = await comReservas((reservas) => {
      const i = reservas.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Reserva não encontrada."], gravar: false };
      const atual = reservas[i];
      if (!VIVA(atual)) return { erro: [400, `Esta reserva está ${ROTULO_STATUS[atual.status].toLowerCase()}.`], gravar: false };
      /* Pedido já encaminhado é da PROPPEX. Se a responsável pudesse decidi-lo,
         ela confirmaria o que acabou de escalar — e a escalada, que existe
         para o caso que foge da autonomia dela, não valeria nada. */
      if (atual.status === "encaminhada" && u.papel !== "gestor") {
        return { erro: [403, "Este pedido está com a PROPPEX — a decisão é dela."], gravar: false };
      }
      if (acao === "confirmar") {
        const imp = impedimentos(atual, { reservas, bloqueios, espacos });
        if (!imp.livre) return { erro: [409, `Não dá para confirmar: ${imp.motivos.join(" ")}`], gravar: false };
      }
      const novo = acao === "confirmar" ? "confirmada" : acao === "recusar" ? "recusada" : "encaminhada";
      reservas[i] = { ...atual, status: novo, atualizadoEm: new Date().toISOString(),
        decisao: { por: u.email, em: new Date().toISOString(), acao, motivo },
        historico: [...(atual.historico || []),
          { em: new Date().toISOString(), por: u.email, acao: novo, motivo }] };
      return { reserva: reservas[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    avisarReserva(r.reserva, espacos, acao).catch(() => {});
    res.json({ ok: true, reserva: r.reserva });
  } catch (e) {
    console.error("Erro ao decidir a reserva:", e);
    res.status(500).json({ error: "Não foi possível registrar a decisão agora." });
  }
});

/** POST /api/espacos/reservas/:id/cancelar — de quem pediu (desistiu) e da
    gestão (o espaço foi requisitado). O espaço volta a ficar livre na hora. */
app.post("/api/espacos/reservas/:id/cancelar", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    const motivo = String(req.body?.motivo || "").trim().slice(0, 500);
    const r = await comReservas((reservas) => {
      const i = reservas.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Reserva não encontrada."], gravar: false };
      if (!podeVerReserva(u, reservas[i])) return { erro: [403, "Esta reserva não é sua."], gravar: false };
      if (!VIVA(reservas[i])) return { erro: [400, "Esta reserva já foi encerrada."], gravar: false };
      reservas[i] = { ...reservas[i], status: "cancelada", atualizadoEm: new Date().toISOString(),
        historico: [...(reservas[i].historico || []),
          { em: new Date().toISOString(), por: u.email, acao: "cancelada", motivo }] };
      return { reserva: reservas[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    const espacos = await lerEspacos();
    avisarReserva(r.reserva, espacos, "cancelar").catch(() => {});
    res.json({ ok: true, reserva: r.reserva });
  } catch (e) {
    console.error("Erro ao cancelar a reserva:", e);
    res.status(500).json({ error: "Não foi possível cancelar agora." });
  }
});

/**
 * POST /api/espacos/oficio — sobe o documento que instrui o pedido (ofício
 * do órgão, da empresa ou da entidade da comunidade). Sobe ANTES da reserva
 * existir, como no portfólio da Extensão: o arquivo vai ao Drive e o link
 * volta para acompanhar o formulário. Quem não é da casa não grava reserva
 * sem ele — a régua está em `exigeOficio`, aplicada na criação.
 */
app.post("/api/espacos/oficio", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    const ok = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/
      .test(req.file.mimetype || "");
    if (!ok) return res.status(400).json({ error: "Envie o ofício em PDF, Word ou imagem." });
    if (req.file.size > 10 * 1024 * 1024)
      return res.status(400).json({ error: "O arquivo passa de 10 MB." });
    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `${REPO}/Espaços/Ofícios/${hojeLocalISO().slice(0, 4)}`,
    });
    res.json({ ok: true, oficio: { ...data, nome: req.file.originalname,
      tipo: req.file.mimetype, tamanho: req.file.size,
      enviadoEm: new Date().toISOString(), enviadoPor: u.email } });
  } catch (e) {
    console.error("Erro no ofício da reserva:", e);
    res.status(500).json({ error: e.message || "Não foi possível anexar o ofício." });
  }
});

/** POST /api/espacos/catalogo — a gestão mantém os espaços. Grava o catálogo
    inteiro (é uma lista curta), com a régua do lib. */
app.post("/api/espacos/catalogo", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    if (!gereEsp(u)) return res.status(403).json({ error: "Restrito à gestão dos espaços." });
    const espacos = normalizarEspacos(req.body?.espacos);
    if (!espacos.length) return res.status(400).json({ error: "O catálogo não pode ficar vazio." });
    await storage.set(ESP_ESPACOS, JSON.stringify(espacos));
    await storage.flush?.();
    res.json({ ok: true, espacos });
  } catch (e) {
    console.error("Erro ao gravar o catálogo de espaços:", e);
    res.status(500).json({ error: "Não foi possível gravar o catálogo." });
  }
});

/** POST /api/espacos/bloqueios — reforma, recesso, manutenção. Da gestão, e
    trava o pedido como uma reserva confirmada. `remover: id` apaga. */
app.post("/api/espacos/bloqueios", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    if (!gereEsp(u)) return res.status(403).json({ error: "Restrito à gestão dos espaços." });
    const lista = await lerBloqueios();
    if (req.body?.remover) {
      const fora = lista.filter((b) => b.id !== String(req.body.remover));
      await storage.set(ESP_BLOQUEIOS, JSON.stringify(fora));
      await storage.flush?.();
      return res.json({ ok: true, bloqueios: fora });
    }
    const novo = normalizarBloqueio(req.body?.bloqueio || {}, { base: {
      id: "blq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      criadoPor: u.email,
    } });
    if (!novo.espacos.length) return res.status(400).json({ error: "Escolha ao menos um espaço." });
    if (!novo.dataInicio) return res.status(400).json({ error: "Informe a data do bloqueio." });
    if (!novo.motivo) return res.status(400).json({ error: "Escreva o motivo do bloqueio." });
    lista.push(novo);
    await storage.set(ESP_BLOQUEIOS, JSON.stringify(lista));
    await storage.flush?.();
    res.json({ ok: true, bloqueios: lista });
  } catch (e) {
    console.error("Erro ao gravar bloqueio:", e);
    res.status(500).json({ error: "Não foi possível gravar o bloqueio." });
  }
});

/** GET /api/espacos/ocupacao — quantas horas cada espaço foi usado. É o
    número que a gestão leva ao conselho quando se discute construir mais uma
    sala; conta só o confirmado. */
app.get("/api/espacos/ocupacao", async (req, res) => {
  try {
    const u = await sessaoEsp(req, res);
    if (!u) return;
    if (!gereEsp(u)) return res.status(403).json({ error: "Restrito à gestão dos espaços." });
    const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || "")) ? String(req.query.de) : "";
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || "")) ? String(req.query.ate) : "";
    const [espacos, reservas] = await Promise.all([lerEspacos(), lerReservas()]);
    res.json({ de, ate, espacos: ocupacaoPorEspaco(reservas, espacos, { de, ate }) });
  } catch (e) {
    console.error("Erro na ocupação dos espaços:", e);
    res.status(500).json({ error: "Não foi possível calcular a ocupação." });
  }
});

/* O aviso por e-mail. A responsável pela reserva recebe TODA solicitação
   (env ESPACOS_NOTIFY_EMAIL), com cópia ao setor de eventos; o solicitante
   recebe a decisão. Fire-and-forget, como os demais avisos do ARCHÉ: e-mail
   que falha não desfaz o que já está gravado. */
async function avisarReserva(reserva, espacos, momento) {
  try {
    const { enviarEmail, emailReservaEspaco } = await import("./lib/mailer.js");
    // o e-mail lê gente, não código: o órgão vai pelo nome
    const legivel = { ...reserva, orgao: rotuloOrgao(reserva.orgao, CURSOS, reserva.orgaoOutro) };
    for (const msg of emailReservaEspaco(legivel, espacos, momento)) {
      if (msg?.para) await enviarAviso("esp-reserva", msg);
    }
  } catch (e) {
    console.error("[espacos] aviso por e-mail não enviado:", e.message);
  }
}

/* ========================================================================
   ARCHÉ MO — MONITORIA ACADÊMICA

   A reitoria trouxe o programa para a PROPPEX (ago/2026). O fluxo é o que o
   dono descreveu, e cada passo é uma ROTA com dono definido:

     professor submete (`/submeter`)  →  o monitor preenche a ficha
     (`/inscricao`)  →  a PROPPEX decide (`/decidir`)  →  o monitor entrega o
     relatório (`/relatorio`)  →  o orientador avalia e valida
     (`/relatorio/validar`)  →  a PROPPEX homologa (`/homologar`)  →
     certificados.

   Duas coisas ficam com o SERVIDOR, e por bons motivos: o **protocolo**
   (sequência no cliente é número repetido esperando acontecer, como já
   aconteceu na Extensão) e a **transição de status** — o formulário grava
   conteúdo, nunca situação.

   As regras vivem em lib/monitoria.js, onde são testáveis; aqui ficam o
   transporte, a gravação em série e os avisos.
   ======================================================================== */
const SITE_BASE = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
const gereMon = (u) => !!u && (u.papel === "gestor" || u.modulos?.includes("monitoria"));
/* Quem é a pessoa na monitoria. `cursos` são os que ela COORDENA — vem do
   cadastro de coordenação do portal (`ap-equipe-v1`, o mesmo do ARCHÉ AP):
   coordenador de curso é a mesma pessoa nos dois módulos, e manter duas
   listas faria uma delas envelhecer. Dentro do curso dela o alcance é o da
   gestão; fora, ela não é nada ali. */
const quemMonCom = (u, cursos = []) => ({ email: u?.email, cpf: u?.cpf || "",
  gestao: gereMon(u), cursos });
const quemMon = (u) => quemMonCom(u);
async function quemMonAsync(u) {
  return quemMonCom(u, apCursosQueCoordena(await lerEquipeAP(), u?.email));
}
/** Gere a monitoria de ALGUM curso — o que abre as telas de acompanhamento. */
async function gereMonAlgum(u) {
  return gereMon(u) || (await apCursosQueCoordena(await lerEquipeAP(), u?.email)).length > 0;
}

async function lerMonitorias() {
  const raw = await storage.get(MON_KEY);
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/* ---------------- O ARQUIVO: os ciclos que correram FORA do ARCHÉ ---------
   A monitoria chegou ao sistema em 2026/2. Dos semestres anteriores existe a
   planilha que a coordenação do curso guardou — monitor, disciplina,
   orientação e horas, sem CPF e sem e-mail. É pouco para abrir um projeto no
   módulo (projeto tem prazo, relatório e cobrança, que não existem para um
   semestre encerrado) e é o bastante para emitir o certificado devido.

   Por isso ele NÃO entra no estado: sobe do disco na partida e fica em
   memória. O estado é um arquivo único reescrito inteiro a cada gravação, e
   um histórico que nunca muda seria peso morto em todas elas — a mesma razão
   que tirou de lá as artes dos eventos.
   ------------------------------------------------------------------------- */
/* O ARQUIVO da monitoria, curso a curso — os lotes chegam aos poucos, como
   as coordenações os encontram. Odontologia entregou seis semestres
   (2023/2 a 2026/1, ago/2026); Enfermagem, o 2026/1. */
const LOTES_HISTORICO_MON = [
  "mon-historico-2026-1-enfermagem.json",
  "mon-historico-2023-2-odontologia.json",
  "mon-historico-2024-1-odontologia.json",
  "mon-historico-2024-2-odontologia.json",
  "mon-historico-2025-1-odontologia.json",
  "mon-historico-2025-2-odontologia.json",
  "mon-historico-2026-1-odontologia.json",
];
let historicoMon = [];

async function subirHistoricoMonitoria() {
  const lidos = [];
  for (const arquivo of LOTES_HISTORICO_MON) {
    try {
      const bruto = JSON.parse(await readFile(path.join(__dirname, "dados", arquivo), "utf8"));
      const lote = normalizarLoteMon(bruto);
      if (lote?.registros?.length) lidos.push(lote);
    } catch (e) {
      console.error(`[monitoria] arquivo histórico ${arquivo} não carregado:`, e.message);
    }
  }
  historicoMon = lidos;
  const total = lidos.reduce((s, l) => s + l.registros.length, 0);
  if (total) console.log(`[monitoria] arquivo histórico: ${total} registros em ${lidos.length} lote(s).`);
}

/* ------------------- RESULTADO DO CICLO DE MONITORIA ----------------------
   O certificado é o que a PESSOA leva; o resultado é o que a INSTITUIÇÃO
   publica. Sem ele, um semestre inteiro de monitoria fica provado só nos
   certificados de quem os baixou, e quem pergunta "quais foram os monitores
   de 2026/1?" — a coordenação, o avaliador do MEC — não tem onde ler.

   Duas origens, um documento: os projetos concluídos no ARCHÉ e os do
   ARQUIVO (planilhas dos ciclos anteriores ao módulo).

   Quando o resultado é público? Ciclo do ARQUIVO é público na hora: é
   semestre encerrado, transcrito do que a coordenação do curso já
   certificou, e pedir um ato de publicação a cada planilha nova só
   atrasaria o que já é fato consumado. Ciclo que corre AQUI precisa do ato
   da gestão, como na IC — enquanto a homologação não terminou, publicar
   seria divulgar meio processo. */
const MON_RESULTADO_KEY = "mon-resultado-publicado-v1";

async function resultadosMonitoriaPublicados() {
  try { return JSON.parse((await storage.get(MON_RESULTADO_KEY)) || "{}"); }
  catch { return {}; }
}

/** Os ciclos que o arquivo cobre — os que dispensam o ato de publicar. */
const ciclosDoArquivoMon = () => [...new Set(historicoMon.map((l) => l.ciclo).filter(Boolean))];

/** Os projetos de um edital, das duas origens, prontos para o documento. */
async function projetosDoResultadoMon(numero) {
  const ed = editalMonitoriaDe(numero);
  const ciclo = ed?.ciclo || "";
  const doArche = (await lerMonitorias()).filter((p) =>
    String(p.edital || "") === String(numero) && p.status === "concluido");
  const doArquivo = projetosDoArquivoMon(historicoMon)
    .filter((p) => String(p.edital || "") === String(numero) || (ciclo && p.ciclo === ciclo));
  return [...doArche, ...doArquivo];
}

/** Este edital já pode ser lido pelo público? */
async function resultadoMonPublico(numero) {
  const ed = editalMonitoriaDe(numero);
  if (ed && ciclosDoArquivoMon().includes(ed.ciclo)) return true;
  return !!(await resultadosMonitoriaPublicados())[String(numero)];
}

/** Quem é a pessoa para o arquivo: matrícula primeiro, nome como segunda chave. */
const quemHistorico = (u, perfil) => ({
  cpf: perfil?.cpf || u?.cpf || "", email: u?.email || "",
  nome: perfil?.nome || u?.nome || "", matricula: perfil?.matricula || "",
});

/* Fila serializada, como em toda base do ARCHÉ: dois salvamentos no mesmo
   segundo (o professor no projeto e o monitor na ficha) só se enxergam
   dentro dela. */
let filaMon = Promise.resolve();
function comMonitorias(fn) {
  const proxima = filaMon.then(async () => {
    const lista = await lerMonitorias();
    const r = await fn(lista);
    if (r?.gravar !== false) {
      await storage.set(MON_KEY, JSON.stringify(lista));
      await storage.flush?.();
    }
    return r;
  });
  filaMon = proxima.catch(() => {});
  return proxima;
}

/** Protocolo MON-AAAA-NNN, emitido na submissão e nunca repetido. */
async function novoProtocoloMon() {
  const ano = Number(hojeLocalISO().slice(0, 4));
  const raw = await storage.get("mon-config-v1");
  let cfg = raw ? JSON.parse(raw) : { ano, seq: 0 };
  if (cfg.ano !== ano) cfg = { ano, seq: 0 };
  cfg.seq++;
  await storage.set("mon-config-v1", JSON.stringify(cfg));
  return `MON-${ano}-${String(cfg.seq).padStart(3, "0")}`;
}

/** A sessão do setor. Conta PENDENTE entra se for monitor indicado — é o
    mesmo convite da IC: indicar alguém dá acesso ao setor, e só aos projetos
    em que a pessoa está. Quem submete projeto precisa de conta aprovada. */
async function sessaoMon(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(401).json({ error: "Faça login para acessar a monitoria." }); return null; }
  if (u.papel === "pendente") {
    const lista = await lerMonitorias();
    const convidado = lista.some((p) => monPapel(p, quemMon(u)) === "monitor");
    if (!convidado) {
      res.status(403).json({ error: "Seu acesso ainda não foi liberado." });
      return null;
    }
  }
  return (await verComoUsuario(req, u, gereMon(u))) || u;
}

/** O e-mail do setor recebe as movimentações; a PROPPEX acompanha por lá. */
async function avisarMonitoria(msg, codigo = "mon-movimentacao") {
  try {
    const { enviarEmail } = await import("./lib/mailer.js");
    if (msg?.para) await enviarAviso(codigo, msg);
  } catch (e) {
    console.error("[monitoria] aviso por e-mail não enviado:", e.message);
  }
}

/** O convite ao monitor indicado — é o que abre o processo para ele. */
async function convidarMonitores(projeto, monitores) {
  const { emailConviteMonitor } = await import("./lib/mailer.js");
  for (const m of monitores) {
    if (!m?.email) continue;
    await avisarMonitoria(emailConviteMonitor(projeto, m, { baseUrl: SITE_BASE }), "mon-convite-monitor");
  }
}

const monMeta = async () => ({
  edital: monEditalVigente(), cronograma: MON_CRONOGRAMA,
  editais: editaisMonitoriaParaLista({
    publicados: await resultadosMonitoriaPublicados(), ciclosDoArquivo: ciclosDoArquivoMon() }),
  vigencia: MON_VIGENCIA, prazos: MON_PRAZOS, chSemanal: MON_CH_SEMANAL,
  cursos: CURSOS, criterios: CRITERIOS_MONITOR, respostas: RESPOSTAS_CRITERIO,
  camposPlano: CAMPOS_PLANO_MON, minFotos: MIN_FOTOS_MONITORIA,
  pareceres: PARECERES_MON, rotuloStatus: MON_ROTULO_STATUS,
  submissaoAberta: monSubmissaoAberta(), cobranca: MON_COBRANCA,
  cobrancaAberta: cobrancaAbertaMon(), diasParaRelatorio: diasParaRelatorioMon(),
});

/** GET /api/monitoria — a lista com o recorte de quem olha, e o que a tela
    precisa para abrir. O professor vê os seus; o monitor, aqueles em que
    foi indicado; a gestão, todos. */
app.get("/api/monitoria", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const lista = await lerMonitorias();
    const meus = lista.filter((p) => monPodeVer(p, quem));
    const perfil = (await carregarPerfis())[u.email] || {};
    res.json({
      /* `gestao` abre as telas de acompanhamento — e a coordenação de curso
         também as abre, com a lista já recortada ao curso dela. Os atos
         INSTITUCIONAIS (publicar o resultado do ciclo, o arquivo, a chamada
         geral) continuam olhando `gestaoPlena`: mostrar botão que a rota
         recusaria é porta que não abre. */
      eu: u.email, gestao: quem.gestao || quem.cursos.length > 0,
      gestaoPlena: quem.gestao, cursosCoordenados: quem.cursos,
      gestorGeral: u.papel === "gestor",
      perfil: {
        nome: perfil.nome || u.nome || "", cpf: perfil.cpf || "",
        titulacao: perfil.titulacao || "", telefone: perfil.telefone || "",
        curso: perfil.curso || "", funcao: perfil.funcao || "",
      },
      projetos: meus.map((p) => monResumir(p, quem)),
      // orientadores e monitores saem dos próprios projetos — no ARCHÉ MO
      // não há cadastro de papel à parte, como no resto do portal
      ...(gereMon(euReal(req, u)) ? {
        pessoas: await pessoasParaVerComo({
          orientador: lista.map((p) => ({
            email: p.orientador?.email || p.criadoPor, cpf: p.orientador?.cpf, nome: p.orientador?.nome })),
          monitor: lista.flatMap((p) => (p.monitores || []).map(
            (m) => ({ email: m.email, cpf: m.cpf, nome: m.nome }))),
        }, euReal(req, u)),
        verComo: String(req.query?.como || ""),
      } : {}),
      ...(quem.gestao
        ? { panorama: monPanorama(lista), pendencias: monPendencias(lista) }
        : {}),
      meta: await monMeta(),
    });
  } catch (e) {
    console.error("Erro ao listar a monitoria:", e);
    res.status(500).json({ error: "Não foi possível carregar a monitoria." });
  }
});

/**
 * GET /api/monitoria/pessoa?cpf= — a tela do professor confere, ao digitar o
 * CPF, se aquela pessoa já tem conta. Devolve o NOME e o e-mail MASCARADO:
 * é o bastante para o professor reconhecer quem é e entender para onde vai o
 * convite, sem transformar a rota numa consulta de endereços por CPF.
 */
app.get("/api/monitoria/pessoa", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const cpf = soDigitos(req.query?.cpf);
    if (!cpfValido(cpf)) return res.json({ achou: false, invalido: true });
    const perfis = await carregarPerfis();
    const achado = Object.entries(perfis).find(([, p]) => soDigitos(p?.cpf) === cpf);
    if (!achado) return res.json({ achou: false });
    res.json({ achou: true, nome: achado[1].nome || "", email: mascararEmail(achado[0]),
      curso: achado[1].curso || "", funcao: achado[1].funcao || "" });
  } catch (e) {
    console.error("Erro ao consultar pessoa por CPF:", e);
    res.status(500).json({ error: "Não foi possível consultar." });
  }
});

/** GET /api/monitoria/certificados — os meus, calculados dos projetos. */
app.get("/api/monitoria/certificados", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const perfil = (await carregarPerfis())[u.email] || {};
    const lista = await lerMonitorias();
    const eu = quemHistorico(u, perfil);
    // os dois arquivos na mesma lista: o que o ARCHÉ conduziu e o que a
    // coordenação do curso guardou dos semestres anteriores. O link difere
    // porque a origem difere — o histórico não tem projeto no módulo.
    const doArquivo = certificadosHistoricosMon(historicoMon, eu)
      .map((c) => ({ ...c, link: `/api/meus-certificados/monitoria-historico.pdf?id=${encodeURIComponent(c.id)}` }));
    res.json({
      certificados: [...certificadosMonitoria(lista, eu), ...doArquivo],
      // sem matrícula no perfil, o arquivo só encontra quem tem o nome
      // escrito exatamente como a coordenação digitou na planilha
      avisoMatricula: !perfil.matricula && normalizarFuncao(perfil.funcao) === "aluno",
    });
  } catch (e) {
    console.error("Erro nos certificados da monitoria:", e);
    res.status(500).json({ error: "Não foi possível listar os certificados." });
  }
});

/* GET /api/monitoria/historico — o ARQUIVO, para a gestão.
   Não é a lista de quem tem certificado: é a lista de quem ainda NÃO foi
   encontrado no portal. Sem matrícula no perfil, o certificado existe e o
   aluno não sabe — e ninguém sabe que ele não sabe. É essa a pergunta que a
   coordenação precisa poder fazer. */
app.get("/api/monitoria/historico", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    if (!quem.gestao && !quem.cursos.length)
      return res.status(403).json({ error: "Só a gestão da monitoria." });
    const perfis = await carregarPerfis();
    // a coordenação de curso vê o arquivo DO CURSO dela; a PROPPEX, todos
    const lotes = quem.gestao ? historicoMon
      : historicoMon.filter((l) => quem.cursos.includes(String(l.curso || "")));
    res.json({ lotes: lotes.map((l) => panoramaLoteMon(l, perfis)) });
  } catch (e) {
    console.error("Erro no arquivo histórico da monitoria:", e);
    res.status(500).json({ error: "Não foi possível carregar o arquivo." });
  }
});

/* GET /api/monitoria/historico/certificados — os documentos do arquivo, na
   guia Certificados (pedido do dono, ago/2026).

   A guia Arquivo responde "quem ainda não foi encontrado no portal?"; esta
   responde outra pergunta, que é de quem CERTIFICOU o semestre: *como ficou o
   documento?* Quem homologou a planilha precisa poder abrir o PDF antes de
   avisar o aluno de que ele existe — ainda mais enquanto as incoerências das
   planilhas (nome, matrícula, carga horária) estão em conferência.

   O recorte é o mesmo do arquivo: a PROPPEX vê tudo, a coordenação de curso vê
   o do curso dela. E a lista é a MESMA que o titular vê — montada pelo mesmo
   montador —, senão a gestão emitiria documento que o dono não encontra. */
app.get("/api/monitoria/historico/certificados", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    if (!quem.gestao && !quem.cursos.length)
      return res.status(403).json({ error: "Só a gestão da monitoria." });
    const cursos = quem.gestao ? null : quem.cursos;
    const lista = certificadosDoArquivoMon(historicoMon, { cursos });
    res.json({
      certificados: lista.map((c) => ({
        id: c.id, tipo: c.tipo, pessoa: c.pessoa, matricula: c.matricula || "",
        disciplina: c.disciplina, orientador: c.orientador, curso: c.curso,
        ciclo: c.ciclo, edital: c.edital, horas: c.horas,
        monitores: c.monitores || [],
        link: `/api/monitoria/historico/certificado.pdf?id=${encodeURIComponent(c.id)}`,
      })),
      ciclos: [...new Set(lista.map((c) => c.ciclo))],
    });
  } catch (e) {
    console.error("Erro nos certificados do arquivo da monitoria:", e);
    res.status(500).json({ error: "Não foi possível listar os certificados do arquivo." });
  }
});

/* GET /api/monitoria/historico/certificado.pdf?id= — o documento em si, pelos
   olhos da gestão. O id sozinho não abre nada: ele é conferido contra a lista
   que a pessoa alcança, recalculada a cada pedido — é a mesma régua da rota
   do titular (/api/meus-certificados/monitoria-historico.pdf), com o alcance
   no lugar da identidade. */
/* O CPF de quem vai receber o documento (achado da varredura, ago/2026). A
   planilha do arquivo não traz CPF: quem o tem é o PERFIL da pessoa, e é ele
   que o certificado do titular imprime ("inscrito(a) no CPF nº …"). Sem isto,
   o mesmo certificado sairia COM CPF pelo titular e SEM CPF pela gestão — e
   a guia existe justamente para a coordenação conferir como o documento
   ficou. Casa pela mesma régua do resto do arquivo (matrícula > nome, com a
   matrícula podendo vetar); sem conta casada, sai sem CPF, como antes. */
async function cpfDoTitularDoArquivo(cert) {
  const perfis = await carregarPerfis();
  const alvo = cert.tipo === "orientacao-monitoria"
    ? { nome: cert.orientador || cert.pessoa, matricula: "" }
    : { nome: cert.pessoa, matricula: cert.matricula || "" };
  for (const [email, p] of Object.entries(perfis)) {
    if (!p?.cpf) continue;
    const conta = { email, nome: p.nome || "", matricula: p.matricula || "" };
    const bate = cert.tipo === "orientacao-monitoria"
      ? ehEsteOrientadorMon(alvo.nome, conta)
      : ehEsteMonitorMon({ aluno: alvo.nome, matricula: alvo.matricula }, conta);
    if (bate) return soDigitos(p.cpf);
  }
  return "";
}

app.get("/api/monitoria/historico/certificado.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    if (!quem.gestao && !quem.cursos.length) return res.status(403).send("Só a gestão da monitoria.");
    const cert = certificadoDoArquivoMon(historicoMon, String(req.query?.id || ""),
      { cursos: quem.gestao ? null : quem.cursos });
    if (!cert) return res.status(404).send("Certificado não encontrado no arquivo.");
    const { gerarCertificadoPdf } = await import("./lib/pdf.js");
    const buf = await gerarCertificadoPdf({
      ...cert, cpf: await cpfDoTitularDoArquivo(cert),
      codigo: codigoCert({ tipo: cert.tipo, projetoId: cert.id, pessoa: cert.pessoa }),
      assinaturas: await assinaturasParaPdf(),
    });
    arquivarDocumento({ buffer: buf, pasta: `Certificados/Monitoria/${cert.ciclo.replace("/", "-")}`,
      nome: `${slug(cert.pessoa || "monitor")}-${slug(cert.tipo || "certificado")}.pdf` });
    enviarPdfMon(res, buf, `certificado-monitoria-${cert.ciclo.replace("/", "-")}.pdf`);
  } catch (e) {
    console.error("Erro no certificado do arquivo da monitoria:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});

/** GET /api/monitoria/certificado.pdf — o documento em si. Quem baixa é quem
    tem direito: a lista acima é a régua, e ela vem dos projetos. */
app.get("/api/monitoria/certificado.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const perfil = (await carregarPerfis())[u.email] || {};
    const lista = await lerMonitorias();
    const quer = { projetoId: String(req.query.projeto || ""), tipo: String(req.query.tipo || "monitoria") };
    // a gestão emite o de qualquer um (é ela quem certifica); os demais, o seu
    const dono = gereMon(u) && req.query.de
      ? { email: String(req.query.de), cpf: "", nome: "" }
      : { email: u.email, cpf: perfil.cpf || "", nome: perfil.nome || u.nome || "" };
    const cert = certificadosMonitoria(lista, dono)
      .find((c) => c.projetoId === quer.projetoId && c.tipo === quer.tipo);
    if (!cert) return res.status(404).send("Certificado não disponível.");
    const { gerarCertificadoPdf } = await import("./lib/pdf.js");
    const buf = await gerarCertificadoPdf({
      ...cert, codigo: codigoCert({ tipo: cert.tipo, projetoId: cert.projetoId, pessoa: cert.pessoa }),
      assinaturas: await assinaturasParaPdf(),
    });
    arquivarDocumento({ buffer: buf, pasta: `Certificados/Monitoria/${slug(cert.ciclo || "sem-ciclo")}`,
      nome: `${slug(cert.pessoa || "monitor")}-${slug(cert.tipo || "certificado")}.pdf` });
    enviarPdfMon(res, buf, `certificado-monitoria-${cert.numero || cert.projetoId}.pdf`);
  } catch (e) {
    console.error("Erro no certificado de monitoria:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});

/* O RESULTADO DO CICLO — prévia da gestão, publicação e documento público.
   A prévia existe pelo mesmo motivo da IC: documento que se assina não pode
   ser surpresa. */
app.get("/api/monitoria/resultado.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    if (!gereMon(u)) return res.status(403).send("Restrito à gestão da monitoria.");
    const numero = String(req.query?.edital || monEditalVigente().numero).trim();
    const ed = editalMonitoriaDe(numero);
    if (!ed) return res.status(404).send("Edital não encontrado.");
    const { gerarResultadoMonitoriaPdf } = await import("./lib/pdf.js");
    const buf = await gerarResultadoMonitoriaPdf({
      edital: ed, projetos: await projetosDoResultadoMon(numero), emitidoPor: u.email,
      assinaturas: await assinaturasParaPdf() });
    enviarPdfMon(res, buf, `resultado-monitoria-${slug(numero)}.pdf`);
  } catch (e) {
    console.error("Erro no resultado da monitoria:", e);
    res.status(500).send("Não foi possível gerar o resultado.");
  }
});

app.post("/api/monitoria/resultado/publicar", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    if (!gereMon(u)) return res.status(403).json({ error: "Restrito à gestão da monitoria." });
    const numero = String(req.body?.edital || "").trim();
    const ed = editalMonitoriaDe(numero);
    if (!ed) return res.status(400).json({ error: "Edital não encontrado." });
    const publicar = req.body?.publicar !== false;
    const reg = await resultadosMonitoriaPublicados();
    if (publicar) {
      const projetos = await projetosDoResultadoMon(numero);
      // publicar ciclo vazio poria no ar um documento que diz "nenhum
      // projeto" — não é resultado, é ruído
      if (!projetos.length)
        return res.status(400).json({ error: "Este ciclo ainda não tem projeto concluído para publicar." });
      reg[numero] = { em: new Date().toISOString(), por: u.email, projetos: projetos.length };
    } else { delete reg[numero]; }
    await storage.set(MON_RESULTADO_KEY, JSON.stringify(reg));
    await storage.flush?.();
    res.json({ ok: true, publicado: !!reg[numero] });
  } catch (e) {
    console.error("Erro ao publicar o resultado da monitoria:", e);
    res.status(500).json({ error: "Não foi possível publicar agora." });
  }
});

/* O público baixa o mesmo documento — sem login, como os demais resultados.
   Turma com PDF arquivado da época não se republica: redireciona ao original. */
app.get("/api/publico/monitoria/resultado.pdf", async (req, res) => {
  try {
    const numero = String(req.query?.edital || monEditalVigente().numero).trim();
    const ed = editalMonitoriaDe(numero);
    if (!ed) return res.status(404).send("Edital não encontrado.");
    if (!(await resultadoMonPublico(numero)))
      return res.status(404).send("O resultado deste ciclo ainda não foi publicado.");
    const { gerarResultadoMonitoriaPdf } = await import("./lib/pdf.js");
    const buf = await gerarResultadoMonitoriaPdf({
      edital: ed, projetos: await projetosDoResultadoMon(numero), emitidoPor: "",
      assinaturas: await assinaturasParaPdf() });
    arquivarDocumento({ buffer: buf, pasta: `Monitoria/Resultados/${anoDaPasta(numero)}`,
      nome: `resultado-${slug(numero)}.pdf` });
    enviarPdfMon(res, buf, `resultado-monitoria-${slug(numero)}.pdf`);
  } catch (e) {
    console.error("Erro no resultado público da monitoria:", e);
    res.status(500).send("Não foi possível gerar o resultado.");
  }
});

/** GET /api/monitoria/:id — o projeto, com o recorte de sigilo aplicado. */
app.get("/api/monitoria/:id", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const p = (await lerMonitorias()).find((x) => x.id === req.params.id);
    if (!p || !monPodeVer(p, quem)) return res.status(404).json({ error: "Projeto não encontrado." });
    const v = monVisao(p, quem);
    res.json({
      projeto: { ...v, cargaTotal: monCargaTotal(p) },
      podeEditar: monPodeEditar(p, quem), podeSubmeter: monPodeSubmeter(p, quem),
      podeDecidir: monPodeDecidir(p, quem), podeHomologar: monPodeHomologar(p, quem),
      falta: monFaltaProjeto(p), pendencias: quem.gestao ? monPendenciasProjeto(p) : [],
      meta: await monMeta(),
    });
  } catch (e) {
    console.error("Erro ao abrir o projeto de monitoria:", e);
    res.status(500).json({ error: "Não foi possível abrir o projeto." });
  }
});

/** POST /api/monitoria — cria ou salva o projeto. Quem salva é o orientador
    (rascunho e devolvido) ou a gestão; o conteúdo do MONITOR nunca vem por
    aqui — ele grava a própria ficha em /inscricao, e a normalização preserva
    o que ele já tinha gravado. */
app.post("/api/monitoria", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    if (u.papel === "pendente")
      return res.status(403).json({ error: "Submeter projeto exige conta aprovada." });
    const body = req.body?.projeto || req.body || {};
    const quem = await quemMonAsync(u);
    const perfil = (await carregarPerfis())[u.email] || {};

    const r = await comMonitorias((lista) => {
      const i = lista.findIndex((x) => x.id === String(body.id || ""));
      if (i < 0) {
        // projeto novo: a orientação sai do PERFIL de quem submete — pedir de
        // novo o que já está cadastrado é convite a divergência
        const novo = normalizarProjetoMon({
          ...body,
          orientador: {
            nome: perfil.nome || u.nome || "", email: u.email,
            cpf: perfil.cpf || "", titulacao: perfil.titulacao || "",
            telefone: perfil.telefone || "",
            ...(quem.gestao ? body.orientador || {} : {}),
          },
        });
        novo.id = `mon${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        novo.criadoPor = quem.gestao ? String(body.orientador?.email || u.email).toLowerCase() : u.email;
        novo.criadoEm = new Date().toISOString();
        monAnotar(novo, { acao: "Projeto criado", por: u.email });
        lista.push(novo);
        return { ok: true, projeto: novo, casar: true };
      }
      if (!monPodeEditar(lista[i], quem))
        return { erro: [403, "Este projeto não está mais aberto para edição."], gravar: false };
      const atualizado = normalizarProjetoMon(body, { anterior: lista[i] });
      lista[i] = atualizado;
      return { ok: true, projeto: atualizado, casar: true };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // o CPF informado na indicação encontra a conta que a pessoa já tem —
    // feito depois da gravação, numa segunda passada pela fila, para não
    // segurar a escrita esperando a leitura dos perfis
    let achados = [];
    if (r.casar) {
      const r2 = await comMonitorias(async (lista) => {
        const p = lista.find((x) => x.id === r.projeto.id);
        if (!p) return { gravar: false };
        achados = await casarMonitoresPorCpf(p);
        return { ok: true, projeto: p };
      });
      if (r2?.projeto) r.projeto = r2.projeto;
    }
    res.json({ ok: true, projeto: monVisao(r.projeto, quem), falta: monFaltaProjeto(r.projeto),
      contasEncontradas: achados });
  } catch (e) {
    console.error("Erro ao gravar o projeto de monitoria:", e);
    res.status(500).json({ error: "Não foi possível gravar o projeto." });
  }
});

/**
 * O CPF do indicado, quando o professor o informa, encontra a conta que a
 * pessoa JÁ TEM no portal (pedido do dono, ago/2026). Vale a pena porque o
 * aluno costuma ter dois endereços — o institucional e o pessoal —, e o
 * professor indica pelo que ele conhece: sem isto nasceria uma segunda conta
 * para a mesma pessoa, com os projetos dela espalhados entre as duas.
 *
 * Quem manda é a CONTA existente: o convite passa a ir para o e-mail dela, e
 * o que o cadastro já sabe (nome, curso, telefone, matrícula) entra no que
 * estiver em branco — nunca por cima do que a pessoa gravou.
 */
async function casarMonitoresPorCpf(projeto) {
  const perfis = await carregarPerfis();
  const porCpf = new Map();
  for (const [mail, perfil] of Object.entries(perfis)) {
    if (perfil?.cpf) porCpf.set(soDigitos(perfil.cpf), { email: mail, perfil });
  }
  const achados = [];
  for (const m of projeto.monitores || []) {
    const cpf = soDigitos(m.cpf);
    if (!cpf || !cpfValido(cpf)) continue;
    const conta = porCpf.get(cpf);
    if (!conta) continue;
    if (String(m.email || "").toLowerCase() !== conta.email) achados.push({ nome: m.nome, email: conta.email });
    m.email = conta.email;                       // o convite vai para a conta que existe
    m.nome = m.nome || conta.perfil.nome || "";
    m.curso = m.curso || conta.perfil.curso || "";
    m.telefone = m.telefone || conta.perfil.telefone || "";
    m.matricula = m.matricula || conta.perfil.matricula || "";
  }
  return achados;
}

/** POST /api/monitoria/:id/submeter — emite o protocolo, fecha a proposta e
    convida os monitores indicados. É aqui que o processo começa a existir. */
app.post("/api/monitoria/:id/submeter", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    let convites = [];
    const r = await comMonitorias(async (lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      if (!monPodeSubmeter(p, quem))
        return { erro: [403, "Só o professor orientador submete, e só enquanto o projeto está aberto."], gravar: false };
      const falta = monFaltaProjeto(p);
      if (falta.length)
        return { erro: [400, `Faltam dados no projeto: ${falta.join("; ")}.`], gravar: false };
      /* O ciclo vira com o calendário, mas o EDITAL é um ato institucional —
         semestre novo não publica edital sozinho. Sem o do ciclo corrente não
         há a que submeter: o cronograma, os prazos e a vigência sairiam do
         edital do semestre passado, e o professor receberia datas que já
         venceram. Recusa-se dizendo o que falta, e a gestão vê o mesmo aviso
         no sino. */
      const semEdital = monCicloSemEdital();
      if (semEdital && p.ciclo === semEdital) {
        return { erro: [409, `O Edital de Monitoria do ciclo ${semEdital} ainda não foi publicado. `
          + "A PROPPEX precisa publicá-lo antes que os projetos deste semestre sejam submetidos — "
          + "o seu projeto fica salvo até lá."], gravar: false };
      }
      if (!p.protocolo) p.protocolo = await novoProtocoloMon();
      // rascunho aberto antes de o edital do ciclo sair fica sem número; é na
      // submissão que ele ganha o do edital que passou a existir
      if (!p.edital) p.edital = monEditalVigente().numero;
      p.status = "aguardando-aluno";
      p.submetidoEm = new Date().toISOString();
      const agora = new Date().toISOString();
      convites = (p.monitores || []).filter((m) => !m.convidadoEm && m.email);
      for (const m of convites) m.convidadoEm = agora;
      monAnotar(p, { acao: "Projeto submetido", por: u.email,
        detalhe: `Protocolo ${p.protocolo} · ${(p.monitores || []).length} monitor(es) indicado(s)` });
      return { ok: true, projeto: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (convites.length) convidarMonitores(r.projeto, convites).catch(() => {});
    const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
    avisarMonitoria(emailMovimentacaoMonitoria({
      assunto: `Projeto de monitoria submetido — ${r.projeto.disciplina}`,
      titulo: "Novo projeto de monitoria",
      linhas: [["Protocolo", r.projeto.protocolo], ["Disciplina", r.projeto.disciplina],
        ["Curso", cursoDe(r.projeto.curso)?.nome || r.projeto.curso],
        ["Orientador", r.projeto.orientador?.nome],
        ["Monitores indicados", (r.projeto.monitores || []).map((m) => m.nome).join(", ")]],
    })).catch(() => {});
    res.json({ ok: true, projeto: monVisao(r.projeto, quem), convidados: convites.length });
  } catch (e) {
    console.error("Erro ao submeter o projeto de monitoria:", e);
    res.status(500).json({ error: "Não foi possível submeter o projeto." });
  }
});

/** POST /api/monitoria/:id/convidar — reenvia o convite a um monitor. */
app.post("/api/monitoria/:id/convidar", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const lista = await lerMonitorias();
    const p = lista.find((x) => x.id === req.params.id);
    if (!p || !monPodeVer(p, quem)) return res.status(404).json({ error: "Projeto não encontrado." });
    if (!["orientador", "gestao"].includes(monPapel(p, quem)))
      return res.status(403).json({ error: "Só a orientação ou a PROPPEX reenvia o convite." });
    const alvos = (p.monitores || []).filter(
      (m) => m.email && (!req.body?.monitor || m.id === req.body.monitor));
    if (!alvos.length) return res.status(400).json({ error: "Nenhum monitor com e-mail para convidar." });
    await convidarMonitores(p, alvos);
    res.json({ ok: true, enviados: alvos.length });
  } catch (e) {
    console.error("Erro ao convidar o monitor:", e);
    res.status(500).json({ error: "Não foi possível enviar o convite." });
  }
});

/** POST /api/monitoria/:id/inscricao — o MONITOR grava a própria ficha
    (Anexo II). Ninguém preenche por ele: nem o orientador, nem a gestão —
    é declaração de disponibilidade, e declaração tem dono. Completa a
    ficha de todos os indicados, o projeto vai sozinho à fila da PROPPEX. */
app.post("/api/monitoria/:id/inscricao", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    let entrou = false;
    const r = await comMonitorias((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      const eu = monMonitorDe(p, quem);
      if (!eu) return { erro: [403, "Esta ficha é do acadêmico indicado."], gravar: false };
      if (["reprovado", "cancelado"].includes(p.status))
        return { erro: [400, "Este projeto foi encerrado."], gravar: false };
      const d = req.body || {};
      Object.assign(eu, {
        nome: String(d.nome || eu.nome || "").trim().slice(0, 160) || eu.nome,
        matricula: String(d.matricula ?? eu.matricula ?? "").trim().slice(0, 40),
        cpf: soDigitos(d.cpf ?? eu.cpf).slice(0, 11),
        telefone: String(d.telefone ?? eu.telefone ?? "").trim().slice(0, 40),
        curso: String(d.curso ?? eu.curso ?? "").trim(),
        periodo: String(d.periodo ?? eu.periodo ?? "").trim().slice(0, 20),
        chSemanal: Number(d.chSemanal) || eu.chSemanal || 0,
        // um anexo só: o histórico escolar. Campo ausente é "não mexi" —
        // salvar de novo não pode apagar o que o aluno já anexou
        documentos: { historico: d.documentos?.historico ?? eu.documentos?.historico ?? null },
      });
      if (d.declaracao) eu.declaracao = { aceita: true, em: new Date().toISOString() };
      if (d.cpf && !cpfValido(d.cpf))
        return { erro: [400, "CPF inválido — confira os dígitos."], gravar: false };
      const falta = monFaltaCadastro(eu);
      if (!falta.length && !eu.cadastradoEm) {
        eu.cadastradoEm = new Date().toISOString();
        monAnotar(p, { acao: "Ficha de inscrição preenchida", por: u.email, detalhe: eu.nome });
      }
      // completa a ficha de TODOS os indicados, o projeto entra na fila
      if (p.status === "aguardando-aluno" && monTodosCadastrados(p)) {
        p.status = "submetido";
        entrou = true;
        monAnotar(p, { acao: "Projeto encaminhado à PROPPEX", por: u.email,
          detalhe: "Todos os monitores indicados completaram a inscrição" });
      }
      return { ok: true, projeto: p, falta };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (entrou) {
      const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
      avisarMonitoria(emailMovimentacaoMonitoria({
        assunto: `Projeto pronto para análise — ${r.projeto.disciplina}`,
        titulo: "Projeto de monitoria com inscrição completa",
        linhas: [["Protocolo", r.projeto.protocolo], ["Disciplina", r.projeto.disciplina],
          ["Orientador", r.projeto.orientador?.nome],
          ["Monitores", (r.projeto.monitores || []).map((m) => m.nome).join(", ")]],
      })).catch(() => {});
    }
    res.json({ ok: true, falta: r.falta, projeto: monVisao(r.projeto, quem) });
  } catch (e) {
    console.error("Erro ao gravar a inscrição do monitor:", e);
    res.status(500).json({ error: "Não foi possível gravar a sua inscrição." });
  }
});

/** POST /api/monitoria/:id/decidir — a PROPPEX aprova, devolve ou reprova. */
app.post("/api/monitoria/:id/decidir", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const decisao = String(req.body?.decisao || "");
    const parecer = String(req.body?.parecer || "").trim().slice(0, 4000);
    if (!["aprovar", "devolver", "reprovar"].includes(decisao))
      return res.status(400).json({ error: "Decisão inválida." });
    if (decisao !== "aprovar" && !parecer)
      return res.status(400).json({ error: "Devolver e reprovar exigem o motivo — é o que o professor lê." });

    const r = await comMonitorias((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      if (!monPodeDecidir(p, quem))
        return { erro: [403, "A decisão é da PROPPEX, e só sobre projeto que está na fila."], gravar: false };
      p.status = { aprovar: "aprovado", devolver: "devolvido", reprovar: "reprovado" }[decisao];
      /* Coordenador de curso também leciona, e decide sobre o próprio projeto
         (decisão do dono, ago/2026). O ato não se esconde: fica marcado aqui e
         no histórico, que é o que o torna defensável depois — a mesma regra
         do `atoDeGestao` no ARCHÉ IC. */
      const proprio = monDecisaoPropria(p, quem);
      p.apreciacao = { em: new Date().toISOString(), por: u.email, decisao, parecer,
        ...(proprio ? { sobreProjetoProprio: true } : {}) };
      monAnotar(p, { acao: `Projeto ${MON_ROTULO_STATUS[p.status].toLowerCase()}`
        + (proprio ? " — sobre projeto próprio" : ""), por: u.email, detalhe: parecer });
      return { ok: true, projeto: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
    const destino = r.projeto.orientador?.email || r.projeto.criadoPor;
    if (destino) {
      avisarMonitoria(emailMovimentacaoMonitoria({
        para: destino,
        assunto: `Seu projeto de monitoria foi ${MON_ROTULO_STATUS[r.projeto.status].toLowerCase()}`,
        titulo: `Projeto ${r.projeto.protocolo} — ${MON_ROTULO_STATUS[r.projeto.status]}`,
        linhas: [["Disciplina", r.projeto.disciplina], ["Situação", MON_ROTULO_STATUS[r.projeto.status]],
          ...(parecer ? [["Parecer da PROPPEX", parecer]] : [])],
      })).catch(() => {});
    }
    res.json({ ok: true, projeto: monVisao(r.projeto, quem) });
  } catch (e) {
    console.error("Erro ao decidir o projeto de monitoria:", e);
    res.status(500).json({ error: "Não foi possível registrar a decisão." });
  }
});

/** POST /api/monitoria/:id/relatorio — o MONITOR salva ou envia o relatório. */
app.post("/api/monitoria/:id/relatorio", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const enviar = !!req.body?.enviar;
    const r = await comMonitorias((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      const eu = monMonitorDe(p, quem);
      if (!eu) return { erro: [403, "O relatório é de quem atuou como monitor."], gravar: false };
      if (p.status !== "aprovado")
        return { erro: [400, "O relatório é entregue durante a execução do projeto."], gravar: false };
      const atual = eu.relatorio || {};
      if (["validado", "homologado"].includes(atual.status))
        return { erro: [400, "Este relatório já foi validado."], gravar: false };
      const novo = normalizarRelatorioMon({
        ...atual, ...(req.body?.relatorio || {}),
        // a avaliação é do orientador: nada que venha do aluno a toca
        avaliacao: atual.avaliacao, status: atual.status,
      });
      if (enviar) {
        const falta = monFaltaRelatorio(novo);
        if (falta.length) return { erro: [400, `Falta preencher: ${falta.join("; ")}.`], gravar: false };
        novo.status = "enviado";
        novo.enviadoEm = new Date().toISOString();
        monAnotar(p, { acao: "Relatório entregue", por: u.email, detalhe: eu.nome });
      }
      eu.relatorio = novo;
      return { ok: true, projeto: p, monitor: eu, enviado: enviar };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (r.enviado) {
      const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
      const destino = r.projeto.orientador?.email || r.projeto.criadoPor;
      if (destino) {
        avisarMonitoria(emailMovimentacaoMonitoria({
          para: destino,
          assunto: `Relatório de monitoria entregue — ${r.monitor.nome}`,
          titulo: "Relatório aguardando a sua validação",
          linhas: [["Protocolo", r.projeto.protocolo], ["Disciplina", r.projeto.disciplina],
            ["Monitor", r.monitor.nome],
            ["O que fazer", "Abrir o projeto no ARCHÉ MO, avaliar a atuação do monitor e validar (ou devolver) o relatório"]],
        })).catch(() => {});
      }
    }
    res.json({ ok: true, projeto: monVisao(r.projeto, quem) });
  } catch (e) {
    console.error("Erro ao gravar o relatório de monitoria:", e);
    res.status(500).json({ error: "Não foi possível gravar o relatório." });
  }
});

/** POST /api/monitoria/:id/relatorio/validar — o ORIENTADOR avalia a atuação
    do monitor e valida, ou devolve com o motivo. Validado, segue à PROPPEX. */
app.post("/api/monitoria/:id/relatorio/validar", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const acao = String(req.body?.acao || "validar");
    const monitorId = String(req.body?.monitor || "");
    const r = await comMonitorias((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      if (!monPodeValidar(p, quem))
        return { erro: [403, "A avaliação do monitor é da orientação."], gravar: false };
      const m = (p.monitores || []).find((x) => x.id === monitorId);
      if (!m || !m.relatorio) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (m.relatorio.status !== "enviado")
        return { erro: [400, "Só se valida relatório entregue."], gravar: false };

      if (acao === "devolver") {
        const motivo = String(req.body?.comentario || "").trim().slice(0, 4000);
        if (!motivo) return { erro: [400, "Devolver exige o motivo — é o que o monitor lê."], gravar: false };
        m.relatorio.status = "devolvido";
        m.relatorio.devolvidoEm = new Date().toISOString();
        m.relatorio.comentario = motivo;
        monAnotar(p, { acao: "Relatório devolvido ao monitor", por: u.email, detalhe: m.nome });
        return { ok: true, projeto: p, monitor: m, devolvido: true };
      }

      const av = { ...(req.body?.avaliacao || {}), em: new Date().toISOString(), por: u.email };
      const falta = monFaltaAvaliacao(av);
      if (falta.length) return { erro: [400, `Falta na avaliação: ${falta.join("; ")}.`], gravar: false };
      m.relatorio = normalizarRelatorioMon({ ...m.relatorio, avaliacao: av, status: "validado" });
      m.relatorio.validadoEm = new Date().toISOString();
      m.relatorio.validadoPor = u.email;
      monAnotar(p, { acao: "Relatório validado pela orientação", por: u.email,
        detalhe: `${m.nome} — parecer ${av.parecer}`, sigilo: true });
      return { ok: true, projeto: p, monitor: m };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
    if (r.devolvido) {
      if (r.monitor.email) {
        avisarMonitoria(emailMovimentacaoMonitoria({
          para: r.monitor.email,
          assunto: "Seu relatório de monitoria voltou para ajuste",
          titulo: "Relatório devolvido pela orientação",
          linhas: [["Disciplina", r.projeto.disciplina], ["Motivo", r.monitor.relatorio.comentario]],
        })).catch(() => {});
      }
    } else {
      avisarMonitoria(emailMovimentacaoMonitoria({
        assunto: `Relatório validado, aguardando homologação — ${r.monitor.nome}`,
        titulo: "Relatório de monitoria para homologar",
        linhas: [["Protocolo", r.projeto.protocolo], ["Disciplina", r.projeto.disciplina],
          ["Monitor", r.monitor.nome], ["Orientador", r.projeto.orientador?.nome]],
      })).catch(() => {});
    }
    res.json({ ok: true, projeto: monVisao(r.projeto, quem) });
  } catch (e) {
    console.error("Erro ao validar o relatório de monitoria:", e);
    res.status(500).json({ error: "Não foi possível validar o relatório." });
  }
});

/** POST /api/monitoria/:id/homologar — a PROPPEX fecha o processo. Homologados
    todos os relatórios, o projeto passa a CONCLUÍDO e os certificados existem
    (eles se calculam do projeto — não há emissão a fazer). */
app.post("/api/monitoria/:id/homologar", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const r = await comMonitorias((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !monPodeVer(p, quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      if (!monPodeHomologar(p, quem))
        return { erro: [403, "A homologação é da PROPPEX."], gravar: false };
      const alvo = String(req.body?.monitor || "");
      const alvos = (p.monitores || []).filter(
        (m) => m.relatorio?.status === "validado" && (!alvo || m.id === alvo));
      if (!alvos.length) return { erro: [400, "Nenhum relatório validado para homologar."], gravar: false };
      const agora = new Date().toISOString();
      for (const m of alvos) {
        m.relatorio.status = "homologado";
        m.relatorio.homologadoEm = agora;
        m.relatorio.homologadoPor = u.email;
        monAnotar(p, { acao: "Relatório homologado pela PROPPEX", por: u.email, detalhe: m.nome });
      }
      const todos = (p.monitores || []).every((m) => m.relatorio?.status === "homologado");
      if (todos) {
        p.status = "concluido";
        p.concluidoEm = agora;
        monAnotar(p, { acao: "Projeto concluído — certificados liberados", por: u.email });
      }
      return { ok: true, projeto: p, homologados: alvos.map((m) => m.nome), concluido: todos };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    if (r.concluido) {
      const { emailMovimentacaoMonitoria } = await import("./lib/mailer.js");
      for (const dest of [r.projeto.orientador?.email || r.projeto.criadoPor,
        ...(r.projeto.monitores || []).map((m) => m.email)]) {
        if (!dest) continue;
        avisarMonitoria(emailMovimentacaoMonitoria({
          para: dest,
          assunto: "Monitoria concluída — certificado disponível",
          titulo: "Seu certificado de monitoria já pode ser baixado",
          linhas: [["Disciplina", r.projeto.disciplina], ["Protocolo", r.projeto.protocolo],
            ["Onde", "Guia Certificados do ARCHÉ MO"]],
        })).catch(() => {});
      }
    }
    res.json({ ok: true, projeto: monVisao(r.projeto, quem), concluido: r.concluido });
  } catch (e) {
    console.error("Erro ao homologar a monitoria:", e);
    res.status(500).json({ error: "Não foi possível homologar." });
  }
});

/** DELETE /api/monitoria/:id — só rascunho. Projeto com protocolo emitido
    não some do arquivo: o número saiu da sequência oficial. */
app.delete("/api/monitoria/:id", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const r = await comMonitorias((lista) => {
      const i = lista.findIndex((x) => x.id === req.params.id);
      if (i < 0 || !monPodeVer(lista[i], quem)) return { erro: [404, "Projeto não encontrado."], gravar: false };
      if (!monPodeEditar(lista[i], quem)) return { erro: [403, "Sem permissão."], gravar: false };
      if (lista[i].protocolo)
        return { erro: [400, "Projeto com protocolo emitido não é excluído — peça o cancelamento à PROPPEX."], gravar: false };
      lista.splice(i, 1);
      return { ok: true };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir o projeto de monitoria:", e);
    res.status(500).json({ error: "Não foi possível excluir." });
  }
});

/** POST /api/monitoria/anexo — as FOTOS de evidência do relatório (e o
    documento que o monitor queira juntar). Sobe ANTES de o relatório ser
    gravado, como o portfólio da Extensão: o arquivo vai ao Drive e o link
    volta para acompanhar o formulário. */
app.post("/api/monitoria/anexo", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    const ok = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/.test(req.file.mimetype || "");
    if (!ok) return res.status(400).json({ error: "Envie uma foto (JPG, PNG) ou um PDF." });
    if (req.file.size > 8 * 1024 * 1024)
      return res.status(400).json({ error: "O arquivo passa de 8 MB." });
    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `${REPO}/Monitoria/${hojeLocalISO().slice(0, 4)}`,
    });
    res.json({ ok: true, anexo: { ...data, nome: req.file.originalname,
      tipo: req.file.mimetype, tamanho: req.file.size, enviadoEm: new Date().toISOString() } });
  } catch (e) {
    console.error("Erro no anexo da monitoria:", e);
    res.status(500).json({ error: e.message || "Não foi possível anexar o documento." });
  }
});


/* ------------------------ cobrança do relatório -------------------------
   Decisão do dono (ago/2026): o sistema começa a cobrar o relatório do
   monitor **30 dias antes** do prazo e repete a cada 7 dias até o envio. O
   motivo é prosaico — o monitor descobre o relatório no dia 13 de dezembro,
   e relatório escrito de véspera não registra nada; trinta dias antes ele
   ainda lembra do que fez em setembro.

   A mesma varredura cobra a ORIENTAÇÃO quando o relatório chega e fica
   esperando validação: aí a pendência mudou de dono. E cobra a ficha de
   inscrição do indicado, que é o que trava o projeto na porta de entrada.  */
const COBRANCA_MON_KEY = "sys-mon-cobranca-v1";

function pendenciasCobrancaMon(projetos, hoje = hojeLocalISO()) {
  const porPessoa = new Map();
  const junta = (alvoBruto, nome, papel, item) => {
    const alvo = String(alvoBruto || "").trim().toLowerCase();
    if (!alvo) return;
    if (!porPessoa.has(alvo)) porPessoa.set(alvo, { nome, papel, itens: [] });
    porPessoa.get(alvo).itens.push(item);
  };
  for (const p of projetos) {
    // 1. ficha de inscrição pendente — o projeto não anda sem ela
    if (p.status === "aguardando-aluno") {
      for (const m of p.monitores || []) {
        if (monFaltaCadastro(m).length) {
          junta(m.email, m.nome, "aluno", {
            disciplina: p.disciplina, protocolo: p.protocolo,
            texto: "preencher a ficha de inscrição para o projeto seguir à PROPPEX",
            atraso: Math.max(0, diaSerial(hoje) - diaSerial(MON_PRAZOS.cadastroMonitor)),
          });
        }
      }
    }
    if (p.status !== "aprovado") continue;
    for (const m of p.monitores || []) {
      const st = m.relatorio?.status || "rascunho";
      if (["rascunho", "devolvido"].includes(st)) {
        // fora da janela dos 30 dias, ninguém é incomodado
        if (!cobrancaAbertaMon(hoje)) continue;
        const faltam = diasParaRelatorioMon(hoje);
        junta(m.email, m.nome, "monitor", {
          disciplina: p.disciplina, protocolo: p.protocolo,
          texto: st === "devolvido"
            ? `corrigir e reenviar o relatório (a orientação devolveu)`
            : `enviar o relatório de atividades — ${faltam >= 0
              ? `faltam ${faltam} dia(s) para o prazo (${MON_PRAZOS.relatorio.split("-").reverse().join("/")})`
              : "o prazo já venceu"}`,
          atraso: Math.max(0, -faltam),
        });
      } else if (st === "enviado") {
        junta(p.orientador?.email || p.criadoPor, p.orientador?.nome, "orientador", {
          disciplina: p.disciplina, protocolo: p.protocolo,
          texto: `avaliar a atuação de ${m.nome || "seu monitor"} e validar o relatório`,
          atraso: Math.max(0, diaSerial(hoje) - diaSerial(MON_PRAZOS.validacao)),
        });
      }
    }
  }
  return porPessoa;
}

async function varrerCobrancaMon() {
  const porPessoa = pendenciasCobrancaMon(await lerMonitorias());
  if (!porPessoa.size) return { enviadas: 0 };
  const registro = JSON.parse((await storage.get(COBRANCA_MON_KEY)) || "{}");
  const INTERVALO = 7 * 24 * 3600 * 1000;
  const { enviarEmail, emailCobrancaMonitoria } = await import("./lib/mailer.js");
  let enviadas = 0;
  for (const [alvo, dados] of porPessoa) {
    const ultima = Date.parse(registro[alvo] || "") || 0;
    if (Date.now() - ultima < INTERVALO) continue;
    try {
      await enviarAviso("mon-cobranca", emailCobrancaMonitoria({ para: alvo, ...dados }));
      registro[alvo] = new Date().toISOString();
      enviadas++;
    } catch (e) { console.error(`Cobrança MO não enviada a ${alvo}:`, e.message); }
  }
  if (enviadas) await storage.set(COBRANCA_MON_KEY, JSON.stringify(registro));
  return { enviadas };
}

/** A CHAMADA manual (gestão): o mesmo e-mail, enviado agora. `simular`
    devolve quem seria chamado — é o que alimenta a confirmação da tela. */
app.post("/api/monitoria/chamada-relatorio", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quemC = await quemMonAsync(u);
    if (!quemC.gestao && !quemC.cursos.length)
      return res.status(403).json({ error: "A chamada é da coordenação." });
    // a coordenação de curso chama quem é do curso dela — a PROPPEX, todos
    const base = (await lerMonitorias()).filter((p) => monPodeVer(p, quemC));
    const porPessoa = pendenciasCobrancaMon(base);
    const lista = [...porPessoa.entries()].map(([email, d]) => ({
      email, nome: d.nome, papel: d.papel, itens: d.itens.length }));
    if (req.body?.simular) return res.json({ ok: true, simulado: true, destinatarios: lista });
    const mensagem = String(req.body?.mensagem || "").slice(0, 4000);
    const registro = JSON.parse((await storage.get(COBRANCA_MON_KEY)) || "{}");
    const { enviarEmail, emailCobrancaMonitoria } = await import("./lib/mailer.js");
    let enviadas = 0;
    for (const [alvo, dados] of porPessoa) {
      try {
        await enviarAviso("mon-cobranca", emailCobrancaMonitoria({ para: alvo, ...dados, mensagem }));
        registro[alvo] = new Date().toISOString();
        enviadas++;
      } catch (e) { console.error(`Chamada MO não enviada a ${alvo}:`, e.message); }
    }
    if (enviadas) await storage.set(COBRANCA_MON_KEY, JSON.stringify(registro));
    res.json({ ok: true, enviadas, destinatarios: lista });
  } catch (e) {
    console.error("Erro na chamada dos relatórios de monitoria:", e);
    res.status(500).json({ error: "Não foi possível enviar a chamada." });
  }
});

/* ------------------------------ documentos ------------------------------ */

const enviarPdfMon = (res, buf, nome) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nome}"`);
  res.send(buf);
};

/** O edital vigente é PÚBLICO: é ele que convoca. */
app.get("/api/publico/monitoria/edital.pdf", async (req, res) => {
  try {
    const { gerarEditalMonitoriaPdf } = await import("./lib/pdf.js");
    const buf = await gerarEditalMonitoriaPdf({
      edital: monEditalVigente(), texto: TEXTO_EDITAL_MON, cronograma: MON_CRONOGRAMA,
      acessos: ACESSOS_MON, assinaturas: await assinaturasParaPdf() });
    arquivarDocumento({ buffer: buf, pasta: `Monitoria/Editais/${anoDaPasta(monEditalVigente().numero)}`,
      nome: `edital-${monEditalVigente().numero.replace("/", "-")}.pdf` });
    enviarPdfMon(res, buf, `edital-monitoria-${monEditalVigente().numero.replace("/", "-")}.pdf`);
  } catch (e) {
    console.error("Erro no edital da monitoria:", e);
    res.status(500).send("Não foi possível gerar o edital.");
  }
});

app.get("/api/monitoria/:id/projeto.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const p = (await lerMonitorias()).find((x) => x.id === req.params.id);
    if (!p || !monPodeVer(p, quem)) return res.status(404).send("Projeto não encontrado.");
    const { gerarProjetoMonitoriaPdf } = await import("./lib/pdf.js");
    const buf = await gerarProjetoMonitoriaPdf(
      { ...monVisao(p, quem), cargaTotal: monCargaTotal(p) }, { campos: CAMPOS_PLANO_MON,
        assinaturas: {
          ...(await assinaturasParaPdf()),
          orientador: await assinaturaDePessoa(p.orientador?.email, p.orientador?.nome),
        } });
    arquivarDocumento({ buffer: buf, pasta: `Monitoria/${slug(p.ciclo || "sem-ciclo")}/${slug(p.protocolo || p.id)}`,
      nome: `anexo-I-projeto.pdf` });
    enviarPdfMon(res, buf, `projeto-monitoria-${p.protocolo || p.id}.pdf`);
  } catch (e) {
    console.error("Erro no PDF do projeto de monitoria:", e);
    res.status(500).send("Não foi possível gerar o documento.");
  }
});

app.get("/api/monitoria/:id/ficha.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const p = (await lerMonitorias()).find((x) => x.id === req.params.id);
    if (!p || !monPodeVer(p, quem)) return res.status(404).send("Projeto não encontrado.");
    const papel = monPapel(p, quem);
    const m = papel === "monitor"
      ? monMonitorDe(p, quem)                       // o monitor só baixa a própria ficha
      : (p.monitores || []).find((x) => x.id === String(req.query.monitor || "")) || p.monitores?.[0];
    if (!m) return res.status(404).send("Monitor não encontrado.");
    const { gerarFichaMonitoriaPdf } = await import("./lib/pdf.js");
    const bufFicha = await gerarFichaMonitoriaPdf(p, m, { campos: CAMPOS_PLANO_MON,
      // a imagem só entra com a declaração FIRMADA no sistema — é o ato
      // registrado que ela afirma; ficha sem declaração sai para assinar à mão
      assinaturas: m?.declaracao?.aceita
        ? { monitor: await assinaturaDePessoa(m.email, m.nome) } : {} });
    arquivarDocumento({ buffer: bufFicha, pasta: `Monitoria/${slug(p.ciclo || "sem-ciclo")}/${slug(p.protocolo || p.id)}`,
      nome: `anexo-II-ficha-${slug(m.nome || m.id)}.pdf` });
    enviarPdfMon(res, bufFicha, `ficha-monitoria-${p.protocolo || p.id}.pdf`);
  } catch (e) {
    console.error("Erro no PDF da ficha de monitoria:", e);
    res.status(500).send("Não foi possível gerar o documento.");
  }
});

app.get("/api/monitoria/:id/relatorio.pdf", async (req, res) => {
  try {
    const u = await sessaoMon(req, res);
    if (!u) return;
    const quem = await quemMonAsync(u);
    const p = (await lerMonitorias()).find((x) => x.id === req.params.id);
    if (!p || !monPodeVer(p, quem)) return res.status(404).send("Projeto não encontrado.");
    const papel = monPapel(p, quem);
    const m = papel === "monitor"
      ? monMonitorDe(p, quem)
      : (p.monitores || []).find((x) => x.id === String(req.query.monitor || "")) || p.monitores?.[0];
    if (!m?.relatorio) return res.status(404).send("Relatório não encontrado.");
    const { gerarRelatorioMonitoriaPdf } = await import("./lib/pdf.js");
    // o monitor não lê a avaliação que levou — o documento dele sai sem ela
    const visto = papel === "monitor"
      ? { ...m, relatorio: { ...m.relatorio, avaliacao: null } } : m;
    const bufRel = await gerarRelatorioMonitoriaPdf(
      { ...p, cargaTotal: monCargaTotal(p, m) }, visto, { criterios: papel === "monitor" ? [] : CRITERIOS_MONITOR,
        // cada imagem afirma um ato registrado: o monitor assina o relatório
        // que ENVIOU; a orientação, o que VALIDOU
        assinaturas: {
          ...(m.relatorio?.enviadoEm ? { monitor: await assinaturaDePessoa(m.email, m.nome) } : {}),
          ...(m.relatorio?.validadoEm
            ? { orientador: await assinaturaDePessoa(p.orientador?.email, p.orientador?.nome) } : {}),
        } });
    /* Arquiva só a versão COMPLETA: a que o monitor baixa sai sem a avaliação
       que ele não pode ler, e é o documento inteiro que vale como registro. */
    if (papel !== "monitor") {
      arquivarDocumento({ buffer: bufRel, pasta: `Monitoria/${slug(p.ciclo || "sem-ciclo")}/${slug(p.protocolo || p.id)}`,
        nome: `anexo-III-relatorio-${slug(m.nome || m.id)}.pdf` });
    }
    enviarPdfMon(res, bufRel, `relatorio-monitoria-${p.protocolo || p.id}.pdf`);
  } catch (e) {
    console.error("Erro no PDF do relatório de monitoria:", e);
    res.status(500).send("Não foi possível gerar o documento.");
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
  return `${REPO}/Atas/${raiz}/${orgao}/${ata.ano || "sem-ano"}`;
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
  return (await verComoUsuario(req, u, gereAtas(u))) || u;
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
  const todas = await lerAtas();
  const atas = todas.filter((a) => podeVer(u, a));
  // o acervo é POR AUTOR: quem lavrou a ata é quem a enxerga. A lista do
  // "ver como" sai daí — são os secretários e responsáveis de cada órgão.
  const real = euReal(req, u);
  const pessoas = gereAtas(real)
    ? await pessoasParaVerComo(
      { autor: todas.map((a) => ({ email: a.criadoPor, nome: a.secretaria || "" })) }, real)
    : null;
  res.json({
    gestao: gereAtas(u),
    ...(pessoas ? { pessoas, verComo: String(req.query?.como || "") } : {}),
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

/* A BUSCA no acervo (pedido do dono, ago/2026): "isso já foi discutido em
   alguma reunião?" é pergunta que ninguém responde abrindo ata por ata. A
   varredura é feita no servidor sobre as atas que a PESSOA pode ver — o
   recorte por autor vale igual aqui: buscar não pode virar uma porta para o
   acervo alheio. Filtros opcionais de órgão, curso, período e situação
   estreitam o resultado; a expressão é obrigatória. */
app.get("/api/atas/busca", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    const q = String(req.query.q || "").slice(0, 200);
    const orgao = String(req.query.orgao || "");
    const curso = String(req.query.curso || "");
    const de = String(req.query.de || "");
    const ate = String(req.query.ate || "");
    const status = String(req.query.status || "");
    let atas = (await lerAtas()).filter((a) => podeVer(u, a));
    if (orgao) atas = atas.filter((a) => a.orgao === orgao);
    if (curso) atas = atas.filter((a) => a.curso === curso);
    if (status) atas = atas.filter((a) => statusVigente(a.status) === status);
    if (de) atas = atas.filter((a) => String(a.sessao?.data || "") >= de);
    if (ate) atas = atas.filter((a) => String(a.sessao?.data || "") <= ate);
    const r = buscarAtas(atas, q);
    res.json({ ...r, acervo: atas.length, gestao: gereAtas(u) });
  } catch (e) {
    console.error("Erro na busca das atas:", e);
    res.status(500).json({ error: "Não foi possível buscar agora." });
  }
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
    const buffer = await gerarDossieConformidadePdf({ dossie, emitidoPor: u.nome || u.email,
      assinaturas: await assinaturasParaPdf() });
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
  res.json({
    ata: a, podeEditar: podeEditar(u, a), gestao: gereAtas(u),
    // quem já tem assinatura guardada e de onde ela veio — nunca a imagem,
    // que tem rota própria. É o que a folha de assinaturas vai imprimir.
    assinaturas: await assinaturasDosParticipantes(a),
  });
});

/* As IMAGENS que a folha de assinaturas vai desenhar: `{ email: Buffer }`,
   só de quem assina esta ata. Uma leitura do registro por PDF — não uma por
   assinante. */
async function imagensDaFolhaDaAta(ata) {
  const todas = await lerAssinaturasDeUsuarios();
  const idx = indicePorNome(todas);
  const saida = {};
  for (const x of assinantesDaAta(ata)) {
    const { registro } = acharAssinatura(todas, idx, x);
    if (!registro?.base64 || !x.ref) continue;
    try { saida[x.ref] = Buffer.from(registro.base64, "base64"); } catch { /* ilegível: fica a linha */ }
  }
  return saida;
}

/** `{ ref: {tem, origem, via, em, porQuem} }` — um por assinante da folha. */
async function assinaturasDosParticipantes(ata) {
  const todas = await lerAssinaturasDeUsuarios();
  const idx = indicePorNome(todas);
  const saida = {};
  for (const x of assinantesDaAta(ata)) {
    if (!x.ref) continue;
    const { registro, via } = acharAssinatura(todas, idx, x);
    // `via` é o que permite à tela dizer que a assinatura veio do NOME, e não
    // do e-mail: casamento por nome é mais frouxo, e quem confere merece saber
    saida[x.ref] = { ...resumoAssinatura(registro), via };
  }
  return saida;
}

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
      /* O NOME é a regra principal, e o e-mail informado aqui vale para o
         acervo (decisão do dono, ago/2026): toda ata em que o mesmo nome
         aparece SEM e-mail passa a ter o vínculo forte. Só na gravação
         DELIBERADA — a automática roda a cada poucos segundos e espalharia
         um endereço ainda pela metade, que ninguém sobrescreve depois. */
      let preenchidos = 0;
      if (!automatica) {
        for (const pessoa of paresDeIdentidade(ata)) {
          preenchidos += propagarEmailPorNome(atas, pessoa, { exceto: ata.id }).atas.length;
        }
      }
      return { ata, preenchidos };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // a folha de assinaturas acompanha a gravação: mudou quem está presente,
    // mudou quem assina — e a tela precisa saber disso sem outra chamada
    res.json({
      ok: true, ata: r.ata, assinaturas: await assinaturasDosParticipantes(r.ata),
      // quantas atas do acervo ganharam o e-mail que esta acabou de informar
      emailsPreenchidos: r.preenchidos || 0,
    });
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
    const buffer = await gerarAtaPdf(ata, { assinaturas: await imagensDaFolhaDaAta(ata) });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${slug(ata.numero || ata.id)}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error("Erro no PDF da ata:", e);
    res.status(500).send("Erro ao gerar o PDF: " + e.message);
  }
});

/* ------------------ REEMITIR O NÚMERO NA SÉRIE CERTA ---------------------
   Para as atas que saíram com o ano errado antes da correção de ago/2026 —
   sessão de 21/02/2025 numerada ATA-NDE-PSI-2026-017. É ato da GESTÃO
   (número de ata é a chave do que está arquivado, e não se troca por engano
   de clique) e só roda sobre a incoerência: renumerar ata coerente não teria
   razão nenhuma.

   O número antigo fica registrado na própria ata e no histórico — ele pode
   ter sido citado noutra ata ou num ofício já entregue, e quem for conferir
   precisa achar o rastro. Registrada, a ata ganha o PDF retificado na pasta
   do ANO CERTO (a pasta sai de `ata.ano`); o documento antigo continua onde
   está, porque a cópia arquivada é prova do que existiu.                    */
app.post("/api/atas/:id/renumerar", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    if (!gereAtas(u))
      return res.status(403).json({ error: "Reemitir o número de uma ata é ato da gestão." });

    const r = await comAtas((atas) => {
      const i = atas.findIndex((x) => x.id === req.params.id);
      if (i < 0) return { erro: [404, "Ata não encontrada"], gravar: false };
      const saida = renumerar(atas, atas[i]);
      if (saida.erro) return { erro: [400, saida.erro], gravar: false };
      atas[i] = anotar({
        ...saida.ata,
        atualizadoEm: new Date().toISOString(), atualizadoPor: u.email,
      }, { quem: u.email,
        oQue: `reemitiu o número: ${saida.anterior} → ${saida.ata.numero} (ano da sessão)` });
      return { ata: atas[i], anterior: saida.anterior };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });

    // ata já registrada: o PDF vale o número novo, e vai para a pasta do ano
    // certo. Falha de Drive não desfaz a reemissão — o número já está gravado.
    let arquivada = false, pasta = "";
    if (r.ata.status === "registrada" && r.ata.texto) {
      try {
        const { gerarAtaPdf } = await import("./lib/pdf.js");
        pasta = pastaDaAta(r.ata);
        await files.save({ buffer: await gerarAtaPdf(r.ata, { assinaturas: await imagensDaFolhaDaAta(r.ata) }),
          originalName: `${slug(r.ata.numero)}.pdf`, prefix: pasta });
        arquivada = true;
      } catch (e) {
        console.error("Falha ao arquivar a ata renumerada:", e.message);
      }
    }
    res.json({ ok: true, ata: r.ata, anterior: r.anterior, arquivada, pasta });
  } catch (e) {
    console.error("Erro ao reemitir o número da ata:", e);
    res.status(500).json({ error: e.message || "Erro ao reemitir o número" });
  }
});

/* ------------- reorganizar a numeração do acervo de atas -----------------
   Autorização do dono (ago/2026): "pode reenumerar todas — minha equipe está
   avisada para reimprimir". Não era só o ano errado: dentro da própria série
   a ordem estava embaralhada (a sessão de 21/02 com o número 017, a de 18/09
   com o 010). Num arquivo que se apresenta ao MEC, o número precisa
   acompanhar o tempo, senão a série não se lê.

   Cada série (órgão + curso + ano da SESSÃO) passa a ser 001, 002, 003… na
   ordem em que as reuniões aconteceram. Todo número trocado fica registrado
   na ata e no histórico: ele pode ter sido citado noutra ata ou num ofício já
   entregue, e quem for conferir precisa achar o rastro.

   Roda UMA vez no arranque (a marca). Deliberadamente NÃO a cada partida: uma
   ata retroativa registrada depois deslocaria em silêncio o número de todas
   as seguintes daquele ano, inclusive as já impressas e assinadas. Quando a
   PROPPEX quiser reorganizar de novo — depois de um lote de atas antigas, por
   exemplo —, o botão da guia Acompanhamento faz a mesma passada, com a
   diferença que importa: alguém decidiu.

   O PDF já arquivado no Drive fica onde está: a cópia arquivada é prova do
   que existiu, e apagá-la seria pior que o número velho. */
async function reorganizarNumeracaoDasAtas({ marca = "sys-atas-renumeracao-v1", quem = "sistema" } = {}) {
  if (marca && await storage.get(marca)) return { trocas: [] };
  const r = await comAtas((atas) => {
    const { atas: novas, trocas } = renumerarAcervo(atas);
    if (!trocas.length) return { trocas: [], gravar: false };
    const mudou = new Map(trocas.map((t) => [t.id, t]));
    for (let i = 0; i < atas.length; i++) {
      const t = mudou.get(atas[i]?.id);
      if (!t) continue;
      atas[i] = anotar({ ...novas[i], atualizadoEm: new Date().toISOString() },
        { quem, oQue: `reemitiu o número: ${t.de} → ${t.para} (ordem das sessões)` });
    }
    return { trocas, gravar: true };
  });
  if (marca) await storage.set(marca, new Date().toISOString());
  if (r.trocas?.length) {
    console.log(`[atas] numeração reorganizada: ${r.trocas.length} ata(s) — `
      + r.trocas.map((t) => `${t.de} → ${t.para}`).join(", "));
  } else console.log("[atas] numeração já estava em ordem.");
  return r;
}

/** A mesma passada, quando a PROPPEX decidir repeti-la. */
app.post("/api/atas/renumerar-acervo", async (req, res) => {
  try {
    const u = await sessaoAtas(req, res);
    if (!u) return;
    if (!gereAtas(u))
      return res.status(403).json({ error: "Reorganizar a numeração do acervo é ato da gestão." });
    const r = await reorganizarNumeracaoDasAtas({ marca: "", quem: u.email });
    res.json({ ok: true, trocas: r.trocas || [] });
  } catch (e) {
    console.error("Erro ao reorganizar a numeração das atas:", e);
    res.status(500).json({ error: e.message || "Erro ao reorganizar a numeração" });
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
    const pdfBuffer = await gerarAtaPdf(ata, { assinaturas: await imagensDaFolhaDaAta(ata) });
    /* A ata corrigida SUBSTITUI a anterior na pasta (decisão do dono,
       ago/2026): o nome é o do número da ata, sem sufixo de retificação —
       para quem abre a pasta, vale a versão vigente. As versões anteriores
       ficam no histórico do Drive (30 dias) e o ato da retificação continua
       registrado no histórico da própria ata, que é onde ele prova. */
    const nomePdf = `${slug(ata.numero || ata.id)}.pdf`;
    const pasta = pastaDaAta(ata);

    let arquivo = null;
    try {
      arquivo = await files.save({ buffer: pdfBuffer, originalName: nomePdf, prefix: pasta, nomeFixo: true });
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
/* ======================= ASSINATURAS DA FOLHA DA ATA ====================
   Pedido dos órgãos (ago/2026): a folha de assinaturas da ata sai com a
   assinatura digitalizada de quem esteve presente, sem que ninguém reenvie
   a imagem a cada reunião. O vínculo é o **e-mail** do participante — é o
   que o formulário já pede —, e o registro é o mesmo do resto do portal
   (`sys-assinaturas-usuario-v1`): enviada uma vez, vale em toda ata em que
   a pessoa constar, e também nos outros módulos.

   Estas rotas são a SEGUNDA porta, a da secretaria do órgão (decisão do
   dono, ago/2026), e existem porque metade dos membros de um colegiado não
   abre o portal. O contexto é sempre UMA ATA: só se sobe pela assinatura de
   quem é participante dela, e só quem pode editá-la. Sem esse laço, a rota
   viraria "suba a assinatura de qualquer e-mail do UNIEGO".
   ======================================================================= */

/** A ata, o assinante e o direito de mexer — os três de uma vez.
    O `ref` é o endereço da assinatura: e-mail quando a lista de presença o
    traz, `nome:<nome completo>` quando não. Ele tem de pertencer a alguém
    que ASSINA ESTA ATA — é esse laço que impede a rota de virar "suba a
    assinatura de qualquer e-mail (ou nome) do UNIEGO". */
async function contextoAssinaturaAta(req, res) {
  const u = await sessaoAtas(req, res);
  if (!u) return null;
  const ata = (await lerAtas()).find((x) => x.id === req.params.id);
  if (!ata || !podeVer(u, ata)) { res.status(404).json({ error: "Ata não encontrada" }); return null; }
  const pedido = String(req.body?.ref || req.query?.ref
    || req.body?.email || req.query?.email || "").trim().toLowerCase();
  if (!pedido) { res.status(400).json({ error: "Informe de quem é a assinatura." }); return null; }
  const assinante = assinantesDaAta(ata).find((x) => x.ref && x.ref === pedido);
  if (!assinante) {
    res.status(400).json({
      error: "Essa pessoa não assina esta ata — confira se ela está na lista como presente.",
    });
    return null;
  }
  return { u, ata, ref: assinante.ref, assinante };
}

app.post("/api/atas/:id/assinatura", upload.single("file"), async (req, res) => {
  try {
    const cx = await contextoAssinaturaAta(req, res);
    if (!cx) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    if (!podeEditar(cx.u, cx.ata))
      return res.status(403).json({ error: "Só quem lavra esta ata envia a assinatura de um membro." });
    const ruim = imagemDeAssinaturaInvalida(req.file);
    if (ruim) return res.status(400).json({ error: ruim });
    const todas = await lerAssinaturasDeUsuarios();
    // a do TITULAR vence sempre: quem enviou a própria assinatura não a perde
    // porque uma secretaria digitalizou outra folha
    const jaTem = acharAssinatura(todas, indicePorNome(todas), cx.assinante).registro;
    if (jaTem && origemDaAssinatura(jaTem) === "titular") {
      return res.status(409).json({
        error: `${cx.assinante.nome || cx.ref} já enviou a própria assinatura pelo perfil — `
          + "essa é a que vale, e só a própria pessoa a substitui.",
      });
    }
    todas[cx.ref] = {
      base64: req.file.buffer.toString("base64"), tipo: req.file.mimetype,
      arquivo: String(req.file.originalname || "").slice(0, 120),
      bytes: req.file.size, em: new Date().toISOString(),
      origem: "terceiro", porQuem: cx.u.email,
      // o NOME viaja junto: é ele que faz esta assinatura sair nas OUTRAS
      // atas da mesma pessoa, inclusive nas que não têm o e-mail dela
      nome: cx.assinante.nome || "",
    };
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    console.log(`[atas] assinatura de ${cx.ref} enviada por ${cx.u.email}`);
    // e o e-mail informado aqui vale para o acervo: toda ata em que este NOME
    // aparece sem e-mail passa a ter o vínculo forte (decisão do dono,
    // ago/2026). Nunca sobrescreve endereço já preenchido.
    const espalhou = await espalharEmailPeloAcervo(cx.assinante, cx.ata.id);
    res.json({
      ok: true, ref: cx.ref, ...resumoAssinatura(todas[cx.ref]), via: cx.assinante.email ? "email" : "nome",
      // quantas OUTRAS atas do acervo desta pessoa passam a sair assinadas —
      // é o ganho que o recurso promete, e ele merece ser dito em número
      atas: await quantasAtasAssina(cx.assinante, cx.ata.id),
      emailsPreenchidos: espalhou.atas.length,
      // atas em que o mesmo nome traz OUTRO endereço: não se sobrescreve
      // ninguém em silêncio, mas quem acabou de informar precisa saber
      emailsDivergentes: (espalhou.divergentes || []).length,
    });
  } catch (e) {
    console.error("Erro ao guardar a assinatura de um membro:", e);
    res.status(500).json({ error: "Não foi possível guardar a assinatura." });
  }
});

/* Desfazer o próprio engano: a de TERCEIRO se remove por aqui; a do titular,
   nunca — quem a enviou é quem a tira, no /perfil/. */
app.delete("/api/atas/:id/assinatura", async (req, res) => {
  try {
    const cx = await contextoAssinaturaAta(req, res);
    if (!cx) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    if (!podeEditar(cx.u, cx.ata))
      return res.status(403).json({ error: "Só quem lavra esta ata mexe na assinatura de um membro." });
    const todas = await lerAssinaturasDeUsuarios();
    const achada = acharAssinatura(todas, indicePorNome(todas), cx.assinante);
    if (!achada.registro) return res.json({ ok: true, tem: false });
    if (origemDaAssinatura(achada.registro) === "titular") {
      return res.status(403).json({
        error: "Esta assinatura foi enviada pela própria pessoa — só ela pode removê-la, no perfil.",
      });
    }
    // remove o registro que estava valendo, seja ele o do e-mail ou o do nome
    for (const [k, v] of Object.entries(todas)) if (v === achada.registro) delete todas[k];
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    res.json({ ok: true, tem: false });
  } catch (e) {
    console.error("Erro ao remover a assinatura de um membro:", e);
    res.status(500).json({ error: "Não foi possível remover." });
  }
});

/* O NOME é a regra principal (decisão do dono, ago/2026): informado o e-mail
   de alguém numa ata, ele passa a valer em toda ata em que o mesmo nome
   aparece SEM e-mail. Roda dentro da fila de escrita, porque altera o
   acervo; nunca sobrescreve endereço já preenchido. */
async function espalharEmailPeloAcervo(pessoa, exceto = "") {
  if (!pessoa?.email || !nomeServeDeChave(pessoa?.nome)) return { atas: [], pessoas: 0 };
  const r = await comAtas((atas) => {
    const feito = propagarEmailPorNome(atas, pessoa, { exceto });
    return { ...feito, gravar: feito.atas.length > 0 };
  });
  if (r.divergentes?.length) {
    console.log(`[atas] ${pessoa.nome} aparece com outro e-mail em `
      + `${r.divergentes.length} ata(s) — não sobrescrito`);
  }
  if (r.atas.length) {
    console.log(`[atas] e-mail de ${pessoa.nome} preenchido em ${r.atas.length} ata(s) do acervo`);
  }
  return r;
}

/* Em quantas OUTRAS atas do acervo esta pessoa assina — o ganho que o
   casamento por nome promete, dito em número na hora do envio. Conta só as
   atas que o acervo já tem; a próxima em que o nome aparecer também sairá
   assinada. */
async function quantasAtasAssina(assinante, exceto) {
  const atas = await lerAtas();
  let n = 0;
  for (const a of atas) {
    if (a.id === exceto) continue;
    if (assinantesDaAta(a).some((x) => (assinante.email && x.email === assinante.email)
      || (x.chaveNome && x.chaveNome === assinante.chaveNome))) n++;
  }
  return n;
}

/* A imagem que VAI SAIR na folha desta ata. Quem lavra precisa conferir
   antes de registrar — a assinatura errada num documento do órgão não se
   recolhe depois. Só participante desta ata, e só para quem a enxerga. */
app.get("/api/atas/:id/assinatura.png", async (req, res) => {
  const cx = await contextoAssinaturaAta(req, res);
  if (!cx) return;
  const todas = await lerAssinaturasDeUsuarios();
  const a = acharAssinatura(todas, indicePorNome(todas), cx.assinante).registro;
  if (!a?.base64) return res.status(404).send("Sem assinatura guardada.");
  res.setHeader("Content-Type", a.tipo || "image/png");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(a.base64, "base64"));
});

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
function pessoasDoSetor(projetos, perfis = null, u = null) {
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
  // as CONTAS DO PORTAL (pedido do dono, ago/2026): quem ainda não tem projeto
  // não aparecia em lista nenhuma — e é justamente o professor que se quer
  // orientar. Só para o gestor geral, como nos demais setores.
  const docentes = new Map(), estudantes = new Map(), outros = new Map();
  if (u?.papel === "gestor") {
    for (const [email, p] of Object.entries(perfis || {})) {
      if (!email) continue;
      const f = normalizarFuncao(p?.funcao || "");
      põe(f === "aluno" ? estudantes : FUNCOES_DOCENTES.has(f) ? docentes : outros,
        { email, cpf: "", nome: p?.nome || "" });
    }
  }
  const lista = (m) => [...m.values()].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
  return {
    orientadores: lista(orientadores), alunos: lista(alunos), avaliadores: lista(avaliadores),
    docentes: lista(docentes), estudantes: lista(estudantes), outros: lista(outros),
  };
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
    editaisMonitoria: editaisMonitoriaParaLista({
      publicados: await resultadosMonitoriaPublicados(), ciclosDoArquivo: ciclosDoArquivoMon() }),
    ...(gereIC(u) ? { pessoas: pessoasDoSetor(projetos, await carregarPerfis(), u) } : {}),
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
    /* Quem do ICEM acompanha cada projeto. É o trecho VIGENTE da trajetória
       de cada bolsista — por isso o pedido de alteração deferido pela PROPPEX
       (que fecha o acompanhamento antigo e abre o novo) já se reflete aqui,
       sem nada a atualizar à parte. Só para a gestão: é ela que precisa saber
       quais projetos estão recebendo estudante do Ensino Médio. */
    ...(meu.gestao ? { emPorProjeto: await acompanhamentosEMPorProjeto() } : {}),
  });
});

/* projetoId → [{nome, turma, bolsa}] dos bolsistas de EM em acompanhamento. */
async function acompanhamentosEMPorProjeto() {
  const mapa = {};
  for (const b of await lerBolsistasEM()) {
    if (b.situacao !== "ativo") continue;
    const vigente = (b.trajetoria || []).filter((t) => !t.ate).at(-1);
    if (!vigente?.projetoId) continue;
    (mapa[vigente.projetoId] ||= []).push({
      nome: b.nome || b.email || "—", turma: b.turma || "",
      bolsa: bolsaEmDe(b.bolsa)?.nome || "",
    });
  }
  return mapa;
}

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
      projetos, emitidoPor: u.email, fase, assinaturas: await assinaturasParaPdf(),
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
      /* O card do banco se desenha DESTA lista — cargo, nome e onde a
         assinatura entra —, em vez de repetir os nomes à mão na tela. */
      const { ASSINA } = await import("./lib/pdf.js");
      resp.quemAssina = Object.entries(QUEM_ASSINA).map(([chave, rotulo]) => ({
        chave, rotulo, onde: ONDE_ASSINA[chave] || "",
        nome: ASSINA[CARGO_NO_PDF[chave]]?.nome || "",
      }));
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
      ws.addRow(linhaSegura({
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
      }));
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
/* Quem assina os certificados. A PRÓ-REITORA ACADÊMICA entrou em ago/2026
   (pedido do dono): o Programa de Monitoria é ação de ENSINO, concebida e
   expedida pela PROAC — a PROPPEX opera o processo. Por isso o certificado
   de monitoria sai no timbre da PROAC e é ela quem assina, ao lado do
   reitor; os da IC seguem com o pró-reitor da PROPPEX. As três imagens
   vivem no MESMO registro (`sys-assinaturas-v1`) e no mesmo card da tela:
   um lugar só para trocar quando a reitoria trocar. */
/* ONDE cada assinatura entra — a frase que o card do banco mostra ao lado do
   nome. Fica aqui, junto do catálogo, porque a TELA passou a ser desenhada a
   partir dele: o card era uma lista escrita à mão e ficou para trás quando a
   coordenação de Pesquisa entrou no catálogo (achado do dono, ago/2026:
   "aqui falta o campo da assinatura do Wagner"). Ele assinava o resultado da
   IC e do ICEM, e não havia como enviar a imagem — o documento saía com a
   linha dele em branco, sem ninguém saber por quê. Catálogo e tela agora são
   a mesma lista: quem entrar aqui aparece lá. */
/* A chave da imagem × a chave do catálogo de NOMES em lib/pdf.js (`ASSINA`),
   que é de onde os documentos imprimem quem assina. A tela lê o MESMO
   catálogo: trocar de reitor ou de coordenador é mexer num lugar só, e o card
   acompanha. O módulo do PDF é pesado e só se carrega sob demanda — por isso
   o nome se busca DENTRO da rota, não no arranque. */
const CARGO_NO_PDF = {
  proreitor: "proReitor", reitor: "reitor", proacademica: "proReitoraAcademica",
  coordextensao: "coordExtensao", coordacao: "coordAcaoComunitaria",
  coordpesquisa: "coordPesquisa", coordgestao: "coordGestaoAcademica",
};

const ONDE_ASSINA = {
  proreitor: "certificados da IC e proposta aprovada da Extensão",
  reitor: "todos os certificados",
  proacademica: "certificados de monitoria",
  coordextensao: "proposta aprovada de curso livre (Extensão)",
  coordacao: "proposta aprovada das demais ações de extensão",
  coordpesquisa: "resultado dos editais de IC e do ICEM",
  coordgestao: "relatório de curricularização da extensão",
};

const QUEM_ASSINA = {
  proreitor: "Pró-Reitor", reitor: "Reitor", proacademica: "Pró-Reitora Acadêmica",
  /* As duas coordenações da Extensão entraram em ago/2026 (pedido do dono:
     "fazer o banco de assinaturas para que no momento de aprovar a proposta,
     as assinaturas sejam inseridas"): a proposta APROVADA sai com a
     assinatura da coordenação da ação — curso livre é da Extensão, o resto
     é da Ação Comunitária — ao lado do pró-reitor e do reitor. */
  coordextensao: "Coordenador de Extensão", coordacao: "Coordenação de Ação Comunitária",
  /* A coordenação de Pesquisa e Inovação entrou em ago/2026, quando TODOS os
     documentos passaram a sair com as assinaturas do banco: ela assina o
     resultado dos editais de IC e do ICEM. */
  coordpesquisa: "Coordenador de Pesquisa e Inovação",
  /* A Coordenação de Gestão Acadêmica entrou em ago/2026 com o relatório de
     curricularização da extensão: é ela que assina o modelo da PROAC, ao
     lado da pró-reitora acadêmica. */
  coordgestao: "Coordenadora de Gestão Acadêmica",
};

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

/* ======================================================================
   A ASSINATURA DO USUÁRIO (pedido do dono, ago/2026).

   Até aqui havia assinaturas digitalizadas em dois lugares, e nenhum deles
   era da PESSOA: `sys-assinaturas-v1` guarda as três institucionais (o
   pró-reitor, o reitor e a pró-reitora acadêmica), que só o gestor geral
   troca; e cada EVENTO guarda a do responsável e a da coordenação daquele
   evento. O resultado é que a mesma pessoa reenviava o mesmo PNG a cada
   evento novo — e num módulo novo teria de enviá-lo outra vez.

   Agora a assinatura é do USUÁRIO: envia-se uma vez e ela serve onde a
   pessoa assinar. O registro é por e-mail, fora do /api/estado (é imagem
   de assinatura: não pode sair numa chave que qualquer conta aprovada lê).

   QUEM ENVIA (revisão do dono, ago/2026, ao levar a assinatura para as
   ATAS). A regra era absoluta: ninguém envia nem apaga a de outro, nem o
   gestor geral. Ela protege o que importa e não resolvia o colegiado —
   metade dos membros de um NDE não abre o portal, e a folha de assinaturas
   da ata continuaria em branco esperando gente que não vem. Agora são as
   duas portas, com a **origem marcada**:

     - `titular`  — a pessoa enviou a sua, no /perfil/. Vence sempre.
     - `terceiro` — a secretaria do órgão digitalizou e subiu pela pessoa,
                    de dentro de uma ata em que ela é participante.

   E as três regras que a marca sustenta: a de terceiro **nunca sobrescreve
   a do titular** (o servidor recusa); o titular **substitui ou apaga a
   qualquer momento**, seja qual for a origem; e quem subiu uma de terceiro
   pode desfazer o próprio engano, nunca mexer na do titular. A tela diz de
   onde veio cada uma — assinatura carregada por outra pessoa não pode
   parecer o mesmo que assinatura enviada pelo dono.
   ====================================================================== */
const ASSINATURA_USUARIO_KEY = "sys-assinaturas-usuario-v1";

async function lerAssinaturasDeUsuarios() {
  const raw = await storage.get(ASSINATURA_USUARIO_KEY);
  return raw ? JSON.parse(raw) : {};
}

/* Registro anterior à marca veio do /perfil/, que era a única porta: é do
   titular. Ler isso num lugar só evita que cada leitor decida diferente. */
const origemDaAssinatura = (a) => (a?.origem === "terceiro" ? "terceiro" : "titular");

/** O que a TELA pode saber de uma assinatura guardada — nunca a imagem. */
const resumoAssinatura = (a) => (a?.base64
  ? { tem: true, origem: origemDaAssinatura(a), em: a.em || "", porQuem: a.porQuem || "" }
  : { tem: false, origem: "", em: "", porQuem: "" });

/* ===================== ACHAR A ASSINATURA DE UM ASSINANTE ================
   Duas chaves, e a ordem entre elas é a regra (pedido do dono, ago/2026:
   "rastreie pelo nome, para ganharmos tempo"):

     1. o E-MAIL, quando a lista de presença o traz. É a chave forte, e é o
        que separa dois homônimos;
     2. o NOME COMPLETO, que é o que faz a assinatura enviada numa ata sair
        em todas as outras onde aquele nome consta — inclusive nas antigas,
        cujas listas de presença não têm e-mail nenhum.

   Entre dois registros do mesmo nome, vence o do TITULAR (a pessoa enviou a
   sua) e, empatados, o mais recente. O índice se monta uma vez por leitura:
   com centenas de atas, procurar registro a registro por assinante seria
   varrer o mesmo objeto dezenas de vezes.
   ======================================================================== */
function indicePorNome(todas) {
  const idx = new Map();
  for (const [chave, a] of Object.entries(todas || {})) {
    if (!a?.base64) continue;
    // o nome vem gravado no registro; nos guardados por nome, da própria chave
    const nome = a.nome || (chave.startsWith("nome:") ? chave.slice(5) : "");
    if (!nomeServeDeChave(nome)) continue;
    const k = chaveDoNome(nome);
    const atual = idx.get(k);
    if (!atual || melhorAssinatura(a, atual)) idx.set(k, a);
  }
  return idx;
}

/** A de titular vence a de terceiro; entre iguais, a mais recente. */
const melhorAssinatura = (nova, atual) => {
  const peso = (x) => (origemDaAssinatura(x) === "titular" ? 1 : 0);
  if (peso(nova) !== peso(atual)) return peso(nova) > peso(atual);
  return String(nova?.em || "") > String(atual?.em || "");
};

/** O registro de um assinante e COMO ele foi encontrado (e-mail ou nome). */
function acharAssinatura(todas, idx, assinante) {
  const porEmail = assinante?.email ? todas[assinante.email] : null;
  if (porEmail?.base64) return { registro: porEmail, via: "email" };
  const porNome = idx.get(assinante?.chaveNome || "");
  if (porNome?.base64) return { registro: porNome, via: "nome" };
  return { registro: null, via: "" };
}

/* Recusa a imagem que não serve: só PNG ou JPEG, até 2 MB. O PNG com fundo
   transparente é o que fica bom sobre a linha — o JPEG passa, mas leva o
   retângulo branco junto, e é por isso que a tela pede PNG. */
function imagemDeAssinaturaInvalida(file) {
  if (!file) return "Nenhuma imagem enviada.";
  if (!/^image\/(png|jpeg)$/.test(file.mimetype || ""))
    return "Envie a assinatura em PNG (de preferência com fundo transparente) ou JPG.";
  if (file.size > 2 * 1024 * 1024) return "Imagem muito grande — até 2 MB.";
  return "";
}

/**
 * A assinatura de uma pessoa como Buffer, para o gerador de PDF — **só a que
 * ela mesma enviou** (achado da varredura de ago/2026).
 *
 * A porta de TERCEIRO foi aberta para a folha de assinaturas da ATA, e só
 * para ela: metade dos membros de um colegiado não abre o portal, e a folha
 * ficaria em branco. Mas o registro é UM só, e estes leitores — o relatório
 * de aula prática, o semestral e os certificados de evento — passariam a
 * assinar EM NOME da pessoa com uma imagem que outra subiu. Esses documentos
 * afirmam um ato de quem os assina; a regra deles continua sendo a antiga:
 * assinatura que um terceiro carrega não vale como assinatura.
 *
 * Quem lê a folha da ata é `imagensDaFolhaDaAta`, que aceita as duas origens
 * de propósito.
 */
async function assinaturaDoUsuario(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const a = (await lerAssinaturasDeUsuarios())[e];
  if (!a?.base64 || origemDaAssinatura(a) !== "titular") return null;
  try { return Buffer.from(a.base64, "base64"); } catch { return null; }
}

/** A PRÓPRIA assinatura — a do titular, que vence qualquer outra. */
app.post("/api/perfil/assinatura", upload.single("file"), async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const ruim = imagemDeAssinaturaInvalida(req.file);
    if (ruim) return res.status(400).json({ error: ruim });
    const todas = await lerAssinaturasDeUsuarios();
    const perfil = (await carregarPerfis())[u.email] || {};
    todas[u.email] = {
      base64: req.file.buffer.toString("base64"), tipo: req.file.mimetype,
      arquivo: String(req.file.originalname || "").slice(0, 120),
      bytes: req.file.size, em: new Date().toISOString(),
      // sobrescrever a de terceiro é justamente o que se espera aqui: a
      // pessoa viu a que a secretaria subiu e mandou a sua
      origem: "titular", porQuem: u.email,
      // o NOME do perfil viaja junto: é ele que leva esta assinatura às atas
      // antigas, cujas listas de presença trazem o nome e nenhum e-mail
      nome: perfil.nome || u.nome || "",
    };
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    res.json({ ok: true, tem: true, bytes: req.file.size, em: todas[u.email].em });
  } catch (e) {
    console.error("Erro ao guardar a assinatura do usuário:", e);
    res.status(500).json({ error: "Não foi possível guardar a assinatura." });
  }
});

app.delete("/api/perfil/assinatura", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const todas = await lerAssinaturasDeUsuarios();
    delete todas[u.email];
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    res.json({ ok: true, tem: false });
  } catch (e) {
    console.error("Erro ao remover a assinatura do usuário:", e);
    res.status(500).json({ error: "Não foi possível remover." });
  }
});

/** A própria assinatura, para a tela mostrar o que está guardado. */
app.get("/api/perfil/assinatura.png", async (req, res) => {
  const u = await usuarioDe(req, res);
  if (!u) return res.status(401).send("Faça login.");
  const a = (await lerAssinaturasDeUsuarios())[u.email];
  if (!a?.base64) return res.status(404).send("Sem assinatura enviada.");
  res.setHeader("Content-Type", a.tipo || "image/png");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(a.base64, "base64"));
});

/* ============ SEU CURSO — informações institucionais (ago/2026) ==========
   Pedido do dono: "um local onde eu possa editar informações institucionais
   — incluir e excluir cursos, editar coordenadores de curso e pedagógicos,
   salvar e alterar membros de NDE e Colegiado; para cada coordenador, um
   módulo Seu Curso, cada um só no painel do próprio curso; eu edito todos;
   tudo interligado — os acessos acompanham a edição."
   As regras estão em lib/instituicao.js. A interligação: gravar a dupla
   coordenador/pedagógico REESCREVE o cadastro do ARCHÉ AP (`ap-equipe-v1`),
   de onde saem a validação das aulas práticas, o alcance da monitoria e o
   sino da coordenação de curso. */
async function lerInstituicao() {
  try { return normalizarInstituicao(JSON.parse((await storage.get(INSTITUICAO_KEY)) || "{}")); }
  catch { return normalizarInstituicao({}); }
}
async function salvarInstituicao(inst) {
  const limpo = normalizarInstituicao(inst);
  await storage.set(INSTITUICAO_KEY, JSON.stringify(limpo));
  aplicarNoCatalogo(limpo);
  return limpo;
}
/** Os cursos que a pessoa coordena: composição institucional OU cadastro do AP. */
async function cursosQueCoordenaDe(email) {
  try {
    const [inst, equipe] = await Promise.all([lerInstituicao(), lerEquipeAP()]);
    return [...new Set([...cursosDaPessoa(inst, email), ...apCursosQueCoordena(equipe, email)])];
  } catch { return []; }
}
// aplica o catálogo no ARRANQUE, antes das demais migrações: curso incluído
// pelo gestor precisa existir para tudo o que roda depois
async function aplicarInstituicaoNoArranque() {
  aplicarNoCatalogo(await lerInstituicao());
}

/* MIGRAÇÃO DE ARRANQUE (pedido do dono, ago/2026: "migre os coordenadores
   que estão indicados no módulo de relatórios de aulas práticas e vincule
   eles como coordenadores e gestores de seus cursos"): a dupla de cada
   curso no cadastro do AP (`ap-equipe-v1`, semeada da planilha do dono)
   vira a COMPOSIÇÃO institucional do curso — e com ela o painel Seu Curso,
   o cartão no portal e o alcance de gestão do próprio curso, que já saem
   dessas duas fontes. NUNCA sobrescreve o que o painel já tem: a
   composição editada pela tela é mais nova que a planilha. Nome que faltar
   no cadastro do AP vem do perfil. Marca única; rodar de novo não muda nada. */
async function migrarCoordenadoresApParaInstituicao() {
  const MARCA = "sys-instituicao-coordap-v1";
  if (await storage.get(MARCA)) return;
  const [equipe, inst, perfis] = await Promise.all([lerEquipeAP(), lerInstituicao(), carregarPerfis()]);
  let cursosTocados = 0, pessoas = 0;
  for (const [slug, v] of Object.entries(equipe.cursos || {})) {
    if (!CURSOS.some((c) => c.slug === slug)) continue;
    const comp = normalizarComposicao(inst.cursos[slug] || {});
    let mudou = false;
    for (const papel of ["coordenador", "pedagogico"]) {
      if (comp[papel]?.nome || comp[papel]?.email) continue;      // o painel manda
      const p = (v.coordenadores || []).find((x) => x?.papel === papel && x?.email);
      if (!p) continue;
      comp[papel] = { nome: p.nome || perfis[p.email]?.nome || "", email: p.email };
      mudou = true; pessoas += 1;
    }
    if (mudou) {
      comp.atualizadoEm = new Date().toISOString();
      comp.por = "migração do cadastro do AP";
      inst.cursos[slug] = comp;
      cursosTocados += 1;
    }
  }
  if (cursosTocados) await salvarInstituicao(inst);
  await storage.set(MARCA, JSON.stringify({ em: new Date().toISOString(), cursos: cursosTocados, pessoas }));
  await storage.flush?.();
  console.log(`[curso] coordenadores do AP migrados à composição: ${pessoas} pessoa(s) em ${cursosTocados} curso(s)`);
}

/** O catálogo público de cursos ATIVOS — é dele que as telas montam as
    listas (as três que tinham cópia embutida passaram a buscar aqui). */
app.get("/api/cursos", (req, res) => {
  res.json({ cursos: cursosAtivos().map((c) => ({ slug: c.slug, nome: c.nome, sigla: c.sigla })) });
});

/** A página /curso/: o gestor geral vê todos; o coordenador, só o(s) dele. */
app.get("/api/curso", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    const gestorGeral = u.papel === "gestor";
    const meus = gestorGeral ? null : await cursosQueCoordenaDe(u.email);
    if (!gestorGeral && !meus.length) {
      return res.status(403).json({ error: "O painel Seu Curso é da coordenação de curso — "
        + "o gestor geral designa quem coordena cada curso." });
    }
    const inst = await lerInstituicao();
    const CATALOGO = CURSOS.map((c) => ({ slug: c.slug, nome: c.nome, sigla: c.sigla,
      ativo: c.ativo !== false, extra: !!c.extra }));
    const visiveis = gestorGeral ? CATALOGO.map((c) => c.slug) : meus;
    const cursos = {};
    for (const slug of visiveis) cursos[slug] = normalizarComposicao(inst.cursos[slug] || {});
    res.json({ ok: true, gestorGeral, meus: visiveis, catalogo: CATALOGO, cursos,
      ...(gestorGeral ? {
        reitoria: inst.reitoria, cargosReitoria: CARGOS_REITORIA, modulos: MODULOS,
      } : {}) });
  } catch (e) {
    console.error("Erro no painel do curso:", e);
    res.status(500).json({ error: "Não foi possível carregar agora." });
  }
});

/** A gravação da composição + a sincronia com o AP, num lugar só: é usada
    pela rota do painel e pela INCLUSÃO de curso (que já nomeia a dupla). */
async function gravarComposicaoDoCurso(slug, corpo, porEmail, { manterCoordenador = null } = {}) {
  const inst = await lerInstituicao();
  const nova = normalizarComposicao({ ...corpo, atualizadoEm: new Date().toISOString(), por: porEmail });
  if (manterCoordenador) nova.coordenador = manterCoordenador;
  inst.cursos[slug] = nova;
  await salvarInstituicao(inst);
  const equipe = await lerEquipeAP();
  const equipeNova = normalizarEquipeAP(equipeApDaComposicao(equipe, slug, nova));
  await storage.set(AP_EQUIPE_KEY, JSON.stringify(equipeNova));
  await storage.flush?.();
  return nova;
}

/** Grava a composição de UM curso — e os acessos acompanham (ap-equipe). */
app.post("/api/curso/:slug", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    const slug = String(req.params.slug || "").trim();
    if (!CURSOS.some((c) => c.slug === slug)) return res.status(404).json({ error: "Curso desconhecido." });
    const gestorGeral = u.papel === "gestor";
    const meus = gestorGeral ? null : await cursosQueCoordenaDe(u.email);
    if (!gestorGeral && !meus.includes(slug)) {
      return res.status(403).json({ error: "Cada coordenação edita só o painel do próprio curso." });
    }
    /* Quem NOMEIA o coordenador do curso é o gestor geral: sem isso, a
       coordenação poderia passar o curso adiante sozinha. O pedagógico, o
       NDE e o Colegiado são manutenção do próprio curso. */
    const antes = normalizarComposicao((await lerInstituicao()).cursos[slug] || {});
    const nova = await gravarComposicaoDoCurso(slug, req.body, u.email,
      { manterCoordenador: gestorGeral ? null : antes.coordenador });
    console.log(`[curso] composição de ${slug} gravada por ${u.email}`);
    res.json({ ok: true, curso: slug, composicao: nova });
  } catch (e) {
    console.error("Erro ao gravar a composição do curso:", e);
    res.status(500).json({ error: "Não foi possível gravar agora." });
  }
});

/** O registro da REITORIA (só gestor geral): quem ocupa os cargos. É o
    retrato institucional — o acesso continua nas listas de auth-usuarios,
    geridas na mesma tela, e as assinaturas dos documentos no banco. */
app.post("/api/instituicao/reitoria", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const inst = await lerInstituicao();
  inst.reitoria = normalizarReitoria({ ...req.body, atualizadoEm: new Date().toISOString(), por: g.email });
  await salvarInstituicao(inst);
  await storage.flush?.();
  res.json({ ok: true, reitoria: inst.reitoria });
});

/** Incluir curso no catálogo (só gestor geral). Slug e sigla saem do nome. */
app.post("/api/cursos", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const nome = String(req.body?.nome || "").trim().slice(0, 80);
  if (nome.length < 3) return res.status(400).json({ error: "Informe o nome do curso." });
  const slug = slugDeCursoNovo(nome);
  if (!slug) return res.status(400).json({ error: "Nome inválido." });
  if (CURSOS.some((c) => c.slug === slug))
    return res.status(400).json({ error: "Já existe um curso com esse nome no catálogo." });
  const sigla = String(req.body?.sigla || "").trim().toUpperCase().slice(0, 4) || siglaDeCursoNovo(nome);
  const inst = await lerInstituicao();
  inst.extras.push({ slug, nome, sigla });
  await salvarInstituicao(inst);
  /* O curso já nasce com a dupla nomeada (pedido do dono, ago/2026: "incluir
     curso, indicando coordenador e coordenador pedagógico — a partir daí
     esse usuário passa a ter acesso ao painel do seu curso"): a mesma
     gravação do painel, com a sincronia do AP inclusa. */
  if (req.body?.coordenador?.nome || req.body?.pedagogico?.nome) {
    await gravarComposicaoDoCurso(slug,
      { coordenador: req.body.coordenador, pedagogico: req.body.pedagogico }, g.email);
  }
  await storage.flush?.();
  console.log(`[curso] curso incluído no catálogo: ${nome} (${slug}) por ${g.email}`);
  res.json({ ok: true, slug, nome, sigla });
});

/** Desativar/reativar curso (só gestor geral). NUNCA se apaga: há atas,
    ações e projetos gravados com o curso — o desativado sai dos formulários
    novos e o histórico continua legível. */
app.post("/api/cursos/:slug/ativo", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const slug = String(req.params.slug || "").trim();
  if (!CURSOS.some((c) => c.slug === slug)) return res.status(404).json({ error: "Curso desconhecido." });
  const ativo = req.body?.ativo !== false;
  const inst = await lerInstituicao();
  inst.desativados = inst.desativados.filter((x) => x !== slug);
  if (!ativo) inst.desativados.push(slug);
  await salvarInstituicao(inst);
  await storage.flush?.();
  console.log(`[curso] ${slug} ${ativo ? "reativado" : "desativado"} por ${g.email}`);
  res.json({ ok: true, slug, ativo });
});

/* ================= BANCO DE ASSINATURAS (pedido do dono, ago/2026) =======
   "Centralise esse banco de assinaturas. Inclua ele em todos os módulos.
   O acesso deve ser apenas para quem tiver acesso de gestão naquele módulo."

   A página é UMA (`/assinaturas/`, atalho na barra de todos os módulos para
   quem gere algum), e o acesso é da GESTÃO: gestor geral e os coordenadores
   de módulo designados em /usuarios/ (`modulosDe`). O vínculo é com a
   PESSOA — e-mail, nome completo ou CPF, as chaves do perfil — e o banco é
   o MESMO de sempre (`sys-assinaturas-usuario-v1`): a página não cria um
   segundo registro, ela dá à gestão a visão e a porta de envio POR alguém
   (origem `terceiro`, as três regras das atas valem: nunca sobrescreve a do
   titular, o titular substitui/apaga a qualquer momento, e quem subiu por
   outro desfaz o próprio engano). A DUPLICIDADE — o mesmo nome completo ou
   o mesmo CPF em duas contas — sai apontada, com a fusão de cadastros a um
   clique para o GESTOR GERAL (fusão é gestão de acessos, e continua sendo
   ato exclusivo dele; o coordenador vê o aviso e chama a PROPPEX). */
async function gestorDeModulo(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(401).json({ error: "Faça login." }); return null; }
  if (u.papel !== "gestor" && !(u.modulos || []).length) {
    res.status(403).json({ error: "O banco de assinaturas é da gestão dos módulos." });
    return null;
  }
  return { ...u, gestorGeral: u.papel === "gestor" };
}
const mascararCpf = (cpf) => {
  const d = String(cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.•••.•••-${d.slice(9)}` : "";
};

app.get("/api/assinaturas/banco", async (req, res) => {
  try {
    const g = await gestorDeModulo(req, res); if (!g) return;
    const [perfis, todas] = await Promise.all([carregarPerfis(), lerAssinaturasDeUsuarios()]);
    const emails = new Set([
      ...Object.keys(perfis),
      ...Object.keys(todas).filter((k) => k.includes("@")),
    ].map((e) => e.trim().toLowerCase()).filter(Boolean));
    const pessoas = [];
    for (const e of [...emails].sort()) {
      const p = perfis[e] || {};
      const a = todas[e];
      pessoas.push({
        email: e, nome: p.nome || a?.nome || "", funcao: p.funcao || "", curso: p.curso || "",
        cpf: mascararCpf(p.cpf),
        tem: !!a?.base64,
        origem: a?.base64 ? origemDaAssinatura(a) : "",
        em: a?.em || "", porQuem: a?.porQuem || "",
      });
    }
    // as guardadas só por NOME (folhas de ata sem e-mail) também são o banco
    for (const [k, a] of Object.entries(todas)) {
      if (k.startsWith("nome:") && a?.base64) {
        pessoas.push({ email: "", nome: a.nome || k.slice(5), funcao: "", curso: "", cpf: "",
          tem: true, origem: origemDaAssinatura(a), em: a.em || "", porQuem: a.porQuem || "" });
      }
    }
    // duplicidade: o mesmo NOME COMPLETO (duas palavras ou mais) ou o mesmo
    // CPF em contas diferentes — é o que a fusão de cadastros resolve
    const porNome = new Map(), porCpf = new Map();
    for (const e of emails) {
      if (ehGestorFixo(e)) continue;   // as duas contas da pró-reitoria são duas de propósito
      const p = perfis[e] || {};
      const kn = chaveNome(p.nome || "");
      if (kn && kn.split(" ").length >= 2) porNome.set(kn, [...(porNome.get(kn) || []), e]);
      const d = String(p.cpf || "").replace(/\D/g, "");
      if (d.length === 11) porCpf.set(d, [...(porCpf.get(d) || []), e]);
    }
    const duplicidades = [];
    for (const [kn, es] of porNome) {
      if (es.length > 1) duplicidades.push({ motivo: "nome", rotulo: perfis[es[0]]?.nome || kn, contas: es });
    }
    for (const [d, es] of porCpf) {
      if (es.length > 1 && !duplicidades.some((x) => x.contas.join("|") === es.join("|"))) {
        duplicidades.push({ motivo: "cpf", rotulo: perfis[es[0]]?.nome || mascararCpf(d), contas: es });
      }
    }
    /* CONFERÊNCIA DAS COORDENAÇÕES (pedido do dono, ago/2026: "verifique se
       para os outros coordenadores estão ok"): para cada curso, a dupla que
       valida as aulas práticas e COMO o relatório validado sairia assinado —
       calculado pela MESMA resolução do PDF (registroDeAssinaturaParaAto),
       senão o quadro diria uma coisa e o documento faria outra. */
    const equipeAP = await lerEquipeAP();
    const coordenacoesAP = [];
    for (const [slug, cfg] of Object.entries(equipeAP.cursos || {})) {
      for (const c of (cfg?.coordenadores || [])) {
        if (!c?.email) continue;
        const reg = await registroDeAssinaturaParaAto(c.email);
        coordenacoesAP.push({
          curso: cursoDe(slug)?.nome || slug, slug,
          nome: c.nome || perfis[c.email]?.nome || "", email: c.email,
          papel: c.papel === "pedagogico" ? "Coordenação Pedagógica" : "Coordenação do curso",
          assinatura: reg ? origemDaAssinatura(reg) : "",
        });
      }
    }
    coordenacoesAP.sort((a, b) => a.curso.localeCompare(b.curso, "pt-BR") || a.papel.localeCompare(b.papel));
    res.json({
      ok: true, gestorGeral: g.gestorGeral, modulos: g.modulos || [],
      pessoas, duplicidades, coordenacoesAP,
      // as institucionais (pró-reitor, reitor…) aparecem para o gestor geral,
      // que é quem as troca — o envio usa a rota que já existe (/api/ic/assinatura)
      ...(g.gestorGeral ? {
        institucionais: await (async () => {
          const guardadas = await lerAssinaturas();
          return Object.entries(QUEM_ASSINA).map(([chave, rotulo]) => ({
            chave, rotulo, tem: !!guardadas[chave]?.base64, em: guardadas[chave]?.em || "",
          }));
        })(),
      } : {}),
    });
  } catch (e) {
    console.error("Erro no banco de assinaturas:", e);
    res.status(500).json({ error: "Não foi possível carregar o banco agora." });
  }
});

/** A imagem de uma pessoa, para a gestão CONFERIR o que está no banco. */
app.get("/api/assinaturas/banco/imagem", async (req, res) => {
  const g = await gestorDeModulo(req, res); if (!g) return;
  const e = String(req.query?.email || "").trim().toLowerCase();
  const a = (await lerAssinaturasDeUsuarios())[e];
  if (!a?.base64) return res.status(404).send("Sem assinatura no banco.");
  res.setHeader("Content-Type", a.tipo || "image/png");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(a.base64, "base64"));
});

/** O envio POR uma pessoa (origem `terceiro`) — as regras das atas valem. */
app.post("/api/assinaturas/banco", upload.single("file"), async (req, res) => {
  try {
    const g = await gestorDeModulo(req, res); if (!g) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const e = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: "E-mail inválido." });
    const perfis = await carregarPerfis();
    // o NOME é obrigatório porque é ele que sai impresso no documento — e é
    // a segunda chave do vínculo; conta sem cadastro se inclui em /usuarios/
    if (!String(perfis[e]?.nome || "").trim()) {
      return res.status(400).json({ error: "Esta conta não tem cadastro com nome no portal — "
        + "inclua a pessoa no painel de usuários antes de enviar a assinatura dela." });
    }
    const ruim = imagemDeAssinaturaInvalida(req.file);
    if (ruim) return res.status(400).json({ error: ruim });
    const todas = await lerAssinaturasDeUsuarios();
    if (todas[e]?.base64 && origemDaAssinatura(todas[e]) === "titular") {
      return res.status(409).json({ error: `${perfis[e].nome} já enviou a própria assinatura pelo perfil — `
        + "essa é a que vale, e só a própria pessoa a substitui." });
    }
    todas[e] = {
      base64: req.file.buffer.toString("base64"), tipo: req.file.mimetype,
      arquivo: String(req.file.originalname || "").slice(0, 120),
      bytes: req.file.size, em: new Date().toISOString(),
      origem: "terceiro", porQuem: g.email, nome: perfis[e].nome,
    };
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    console.log(`[assinaturas] banco: assinatura de ${e} enviada por ${g.email}`);
    res.json({ ok: true, email: e, origem: "terceiro" });
  } catch (e) {
    console.error("Erro no envio ao banco de assinaturas:", e);
    res.status(500).json({ error: "Não foi possível guardar a assinatura." });
  }
});

/** Remover do banco: só a de TERCEIRO — a do titular é da pessoa, no perfil. */
app.delete("/api/assinaturas/banco", async (req, res) => {
  try {
    const g = await gestorDeModulo(req, res); if (!g) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const e = String(req.query?.email || "").trim().toLowerCase();
    const todas = await lerAssinaturasDeUsuarios();
    const a = todas[e];
    if (!a?.base64) return res.json({ ok: true, tem: false });
    if (origemDaAssinatura(a) === "titular") {
      return res.status(403).json({ error: "Esta assinatura foi enviada pela própria pessoa — "
        + "só ela pode removê-la, no perfil." });
    }
    // desfaz-se o próprio engano; o gestor geral desfaz qualquer envio de terceiro
    if (!g.gestorGeral && String(a.porQuem || "").toLowerCase() !== g.email) {
      return res.status(403).json({ error: "Esta imagem foi enviada por outra pessoa da gestão — "
        + "quem a enviou (ou o gestor geral) é quem a remove." });
    }
    delete todas[e];
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    await storage.flush?.();
    res.json({ ok: true, tem: false });
  } catch (e) {
    console.error("Erro ao remover do banco de assinaturas:", e);
    res.status(500).json({ error: "Não foi possível remover." });
  }
});

/* A ASSINATURA PELA IDENTIDADE (e-mail → CPF → nome completo): o documento
   referencia a pessoa pelo e-mail de UMA conta, e a assinatura pode viver na
   OUTRA conta da mesma pessoa (a duplicidade que o banco aponta). A busca
   segue as chaves do vínculo, sempre pela assinatura de TITULAR; nome só
   serve de chave com duas palavras ou mais, e só com UMA conta casando. */
async function assinaturaPorIdentidade(email) {
  const direta = await assinaturaDoUsuario(email);
  if (direta) return direta;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const perfis = await carregarPerfis();
  const p = perfis[e];
  if (!p) return null;
  const cpf = String(p.cpf || "").replace(/\D/g, "");
  const kn = chaveNome(p.nome || "");
  const nomeVale = kn && kn.split(" ").length >= 2;
  const candidatas = Object.entries(perfis).filter(([outro, q]) => outro !== e && (
    (cpf && String(q?.cpf || "").replace(/\D/g, "") === cpf)
    || (nomeVale && chaveNome(q?.nome || "") === kn)));
  if (candidatas.length !== 1) return null;      // duas contas casando: não se decide
  return assinaturaDoUsuario(candidatas[0][0]);
}

/* A ASSINATURA DE UM ATO REGISTRADO (achado do dono, ago/2026: enviou a
   assinatura da coordenadora ao banco e o relatório de aula prática validado
   por ela continuou saindo sem a imagem): a regra "só titular fora da folha
   da ata" existe para a assinatura digitalizada pela gestão (`terceiro`)
   nunca afirmar um ato que não houve. Quando o documento afirma um ato que a
   PRÓPRIA CONTA da pessoa praticou e o sistema registrou — o professor que
   submeteu o relatório, a coordenação que o validou com data e hora — a
   imagem do banco não inventa nada: o ato é dela, registrado. Nesses lugares
   vale também a de `terceiro`; em linha genérica, a regra do titular segue. */
async function registroDeAssinaturaParaAto(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const [todas, perfis] = await Promise.all([lerAssinaturasDeUsuarios(), carregarPerfis()]);
  const minha = todas[e]?.base64 ? todas[e] : null;
  // 1. a titular da própria conta vence tudo
  if (minha && origemDaAssinatura(minha) === "titular") return minha;
  // a OUTRA conta da mesma pessoa (CPF ou nome completo, UMA candidata só —
  // a mesma régua de assinaturaPorIdentidade): coordenador valida com um
  // e-mail e a assinatura pode viver no outro
  const p = perfis[e];
  const cpf = String(p?.cpf || "").replace(/\D/g, "");
  const kn = chaveNome(p?.nome || "");
  const nomeVale = kn && kn.split(" ").length >= 2;
  const candidatas = p ? Object.entries(perfis).filter(([outro, q]) => outro !== e && (
    (cpf && String(q?.cpf || "").replace(/\D/g, "") === cpf)
    || (nomeVale && chaveNome(q?.nome || "") === kn))) : [];
  const daOutra = candidatas.length === 1 && todas[candidatas[0][0]]?.base64
    ? todas[candidatas[0][0]] : null;
  // 2. titular da outra conta
  if (daOutra && origemDaAssinatura(daOutra) === "titular") return daOutra;
  // 3. como o ato é registrado, a digitalizada pela gestão também vale —
  //    própria conta, outra conta, ou guardada pelo NOME (antes de a conta casar)
  if (minha) return minha;
  if (daOutra) return daOutra;
  if (nomeServeDeChave(p?.nome || "")) {
    const r = todas["nome:" + chaveDoNome(p.nome)];
    if (r?.base64) return r;
  }
  return null;
}
async function assinaturaDeAtoRegistrado(email) {
  const reg = await registroDeAssinaturaParaAto(email);
  try { return reg?.base64 ? Buffer.from(reg.base64, "base64") : null; } catch { return null; }
}

/* O ENVIO NOS FLUXOS ALIMENTA O BANCO (pedido do dono, ago/2026: "um
   professor ou coordenador, ao submeter ou gerenciar uma proposta, pode
   subir sua assinatura e essa passa a compor o banco, e não mais precisa
   ser pedida nos próximos documentos — em todos os módulos"). A PRÓPRIA
   assinatura (o nome confere com o perfil de quem envia) entra como
   TITULAR — a mais nova substitui a anterior, como no perfil; a de OUTRA
   pessoa entra como digitalizada pela gestão (`terceiro`), achando a conta
   pelo nome (única) ou guardada pelo próprio nome, e NUNCA por cima de um
   titular. Nome de uma palavra só não é chave — não alimenta nada. */
async function alimentarBancoDeAssinatura({ nome, buffer, tipo, arquivo, bytes, porEmail }) {
  try {
    if (!nomeServeDeChave(nome)) return;
    const [todas, perfis] = await Promise.all([lerAssinaturasDeUsuarios(), carregarPerfis()]);
    const registro = {
      base64: buffer.toString("base64"), tipo: tipo || "image/png",
      arquivo: String(arquivo || "").slice(0, 120), bytes: bytes || buffer.length,
      em: new Date().toISOString(), nome: String(nome || "").trim().slice(0, 120),
    };
    const meu = chaveNome(perfis[porEmail]?.nome || "");
    if (meu && nomesCompativeis(meu, chaveNome(nome))) {
      todas[porEmail] = { ...registro, origem: "titular" };
    } else {
      const kn = chaveDoNome(nome);
      const donos = Object.entries(perfis)
        .filter(([, p]) => chaveDoNome(p?.nome || "") === kn).map(([e]) => e);
      const chave = donos.length === 1 ? donos[0] : "nome:" + kn;
      if (todas[chave]?.base64 && origemDaAssinatura(todas[chave]) === "titular") return;
      todas[chave] = { ...registro, origem: "terceiro", porQuem: porEmail };
    }
    await storage.set(ASSINATURA_USUARIO_KEY, JSON.stringify(todas));
    console.log(`[assinaturas] banco alimentado pelo envio de ${porEmail} (${nome})`);
  } catch (e) {
    console.error("[assinaturas] banco não alimentado:", e.message);
  }
}

/* As assinaturas dos DOCUMENTOS da ação de extensão (proposta aprovada e
   relatório validado — ago/2026): as três institucionais — coordenação da
   ação pela classificação (curso livre → Extensão; demais → Ação
   Comunitária), pró-reitor e reitor — mais a do RESPONSÁVEL, buscada pela
   identidade (respEmail/criadoPor: os atos de submeter e entregar são dele,
   registrados) e, sem conta casando, pelo nome declarado na proposta. */
async function assinaturasDaAcaoExtensao(acao) {
  const banco = await assinaturasParaPdf();
  const respEmail = String(acao.proposta?.respEmail || acao.criadoPor || "").trim().toLowerCase();
  const respNome = acao.proposta?.respNome || "";
  const responsavel = (respEmail ? await assinaturaDeAtoRegistrado(respEmail) : null)
    || (respNome ? await assinaturaDoBancoPorNome(respNome) : null);
  return {
    responsavel,
    proreitor: banco.proreitor, reitor: banco.reitor,
    coordenacao: /curso/i.test(String(acao.proposta?.classificacao || ""))
      ? banco.coordextensao : banco.coordacao,
  };
}

/** A assinatura de UMA pessoa para documento de ato registrado: pela
    identidade (e-mail) e, sem conta casando, pelo nome declarado. */
async function assinaturaDePessoa(email, nome) {
  return (email ? await assinaturaDeAtoRegistrado(email) : null)
    || (nome ? await assinaturaDoBancoPorNome(nome) : null);
}

/** A assinatura do banco pelo NOME (a melhor: titular vence terceiro). */
async function assinaturaDoBancoPorNome(nome) {
  if (!nomeServeDeChave(nome)) return null;
  const todas = await lerAssinaturasDeUsuarios();
  const reg = indicePorNome(todas).get(chaveDoNome(nome));
  try { return reg?.base64 ? Buffer.from(reg.base64, "base64") : null; } catch { return null; }
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
    arquivarDocumento({ buffer, pasta: `Certificados/Iniciação Científica/${slug(cert.edital || cert.ciclo || "sem-edital")}`,
      nome: `${slug(cert.pessoa || "participante")}-${slug(cert.tipo || "certificado")}.pdf` });
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
      await enviarAviso("ic-aviso-certificados", {
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
/* ======================= A FOLHA DE PAGAMENTO ===========================
   Pedido do dono (ago/2026): "preciso de um botão de emissão de lista de
   bolsistas UNIEGO, com dados bancários e pessoais, de graduação e de EM,
   para eu enviar para pgto todo mês".

   É UMA planilha com os dois programas juntos, porque é UM pagamento por
   mês — separá-los faria a pró-reitoria montar a soma à mão. Só as bolsas
   do UNIEGO: as do CNPq são pagas pela agência, e o voluntário não recebe.

   Duas decisões que a folha carrega:

   1. Só quem está EM EXECUÇÃO. Na graduação, projeto `aprovado` — o
      `concluido` encerrou o ciclo e não se paga mais. Sem esta régua a lista
      traria os 62 bolsistas UNIEGO de 2022 a 2026 de uma vez, e alguém
      pagaria bolsa de um ciclo encerrado há três anos. No ICEM, bolsista
      `ativo` da turma escolhida.

   2. Duas ABAS: "Para pagamento", com quem tem tudo o que o setor financeiro
      precisa (nome, CPF, banco, agência, conta e Pix), e "Pendentes", com
      quem falta dado e O QUE falta. Uma lista só, misturando os dois, ou
      seria enviada com linhas impagáveis, ou faria a coordenação conferir
      setenta linhas à mão. Ninguém some da planilha: quem não pode ser pago
      aparece na segunda aba, nomeado, para ser cobrado. */
const VALOR_BOLSA_UNIEGO = 350;      // item 4.4 do edital da graduação
const FALTA_PARA_PAGAR = (a) => [
  !String(a.nome || "").trim() && "nome",
  !soDigitos(a.cpf) && "CPF",
  !String(a.banco || "").trim() && "banco",
  !String(a.agencia || "").trim() && "agência",
  !String(a.conta || "").trim() && "conta",
  !String(a.pix || "").trim() && "Pix",
].filter(Boolean);

app.get("/api/ic/pagamento.xlsx", async (req, res) => {
  try {
    const u = await sessaoIC(req, res);
    if (!u) return;
    if (!gereIC(u)) return res.status(403).send("Somente a coordenação de pesquisa emite a folha de pagamento.");
    const numero = String(req.query.edital || EDITAL.numero).trim();
    const turmaEM = String(req.query.turma || turmaEmVigente()?.ciclo || "").trim();
    // mês de referência: o de hoje, salvo se a coordenação pedir outro
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || ""))
      ? String(req.query.mes) : hojeLocalISO().slice(0, 7);
    const [ano, m] = mes.split("-");
    const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const mesExtenso = `${MESES[Number(m) - 1] || m}/${ano}`;

    const linhas = [];
    // --- graduação: projetos EM EXECUÇÃO com bolsa do UNIEGO ---
    for (const p of await lerProjetos()) {
      if (String(p.edital || EDITAL.numero) !== numero) continue;
      if (p.status !== "aprovado") continue;
      if (p.fomento?.tipo !== "uniego") continue;
      for (const a of p.alunos || []) {
        if (!a.bolsista) continue;
        linhas.push({
          programa: "Graduação (IC/IT/IE)",
          nome: a.nome || "", cpf: formatarCpf(a.cpf) || "",
          banco: a.banco || "", agencia: a.agencia || "", conta: a.conta || "", pix: a.pix || "",
          valor: VALOR_BOLSA_UNIEGO,
          vinculo: a.curso || cursoDe(p.curso)?.nome || p.curso || "",
          referencia: `${p.numero || ""} — ${p.titulo || ""}`.trim(),
          orientacao: p.orientador?.nome || p.orientador?.email || "",
          contato: [a.email || "", a.telefone || ""].filter(Boolean).join(" · "),
          falta: FALTA_PARA_PAGAR(a),
        });
      }
    }
    // --- ICEM: bolsistas ATIVOS da turma, com bolsa do UNIEGO ---
    const bolsaEM = bolsaEmDe("uniego");
    for (const b of await lerBolsistasEM()) {
      if (turmaEM && b.turma !== turmaEM) continue;
      if (b.situacao !== "ativo" || b.bolsa !== "uniego") continue;
      const proj = projetoAtualEM(b);
      linhas.push({
        programa: "Ensino Médio (ICEM)",
        nome: b.nome || "", cpf: formatarCpf(b.cpf) || "",
        banco: b.banco || "", agencia: b.agencia || "", conta: b.conta || "", pix: b.pix || "",
        valor: bolsaEM?.valor ?? 150,
        vinculo: b.escola || "",
        referencia: proj ? `${proj.numero || ""} — ${proj.titulo || ""}`.trim() : "(sem projeto definido)",
        orientacao: proj?.orientador || "",
        contato: [b.email || "", b.telefone || ""].filter(Boolean).join(" · "),
        falta: FALTA_PARA_PAGAR(b),
      });
    }

    const prontos = linhas.filter((x) => !x.falta.length);
    const pendentes = linhas.filter((x) => x.falta.length);
    const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const COLS = [
      { header: "Programa", key: "programa", width: 22 },
      { header: "Nome completo", key: "nome", width: 34 },
      { header: "CPF", key: "cpf", width: 16 },
      { header: "Banco", key: "banco", width: 20 },
      { header: "Agência", key: "agencia", width: 12 },
      { header: "Conta", key: "conta", width: 18 },
      { header: "Pix", key: "pix", width: 26 },
      { header: "Valor da bolsa", key: "valorTxt", width: 14 },
      { header: "Curso / Escola", key: "vinculo", width: 24 },
      { header: "Projeto", key: "referencia", width: 46 },
      { header: "Orientação", key: "orientacao", width: 30 },
      { header: "Contato", key: "contato", width: 34 },
    ];
    const montar = (ws, itens, extras = []) => {
      ws.columns = [...COLS, ...extras];
      ws.getRow(1).font = { bold: true };
      for (const x of itens) ws.addRow({ ...x, valorTxt: brl(x.valor), pendencia: x.falta.join("; ") });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    const ws1 = wb.addWorksheet("Para pagamento");
    montar(ws1, prontos);
    // o total fecha a lista: é o número que a pró-reitoria confere antes de enviar
    const total = prontos.reduce((s, x) => s + Number(x.valor || 0), 0);
    ws1.addRow({});
    const linhaTotal = ws1.addRow({ nome: `TOTAL — ${prontos.length} bolsista(s)`, valorTxt: brl(total) });
    linhaTotal.font = { bold: true };

    const ws2 = wb.addWorksheet("Pendentes");
    montar(ws2, pendentes, [{ header: "O que falta no cadastro", key: "pendencia", width: 40 }]);
    if (!pendentes.length) ws2.addRow({ nome: "Nenhuma pendência — todos os bolsistas estão prontos para pagamento." });

    const buffer = await wb.xlsx.writeBuffer();
    const nome = `bolsas-uniego-${mes}.xlsx`;
    arquivarDocumento({ buffer: Buffer.from(buffer), nome,
      pasta: `Iniciação Científica/Folha de pagamento/${ano}` });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.setHeader("Cache-Control", "no-store");
    console.log(`[ic] folha de pagamento ${mesExtenso}: ${prontos.length} pronto(s), ${pendentes.length} pendente(s)`);
    res.end(Buffer.from(buffer));
  } catch (e) {
    console.error("Erro na folha de pagamento:", e);
    res.status(500).send("Não foi possível gerar a folha de pagamento.");
  }
});

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
        ws.addRow(linhaSegura({
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
        }));
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

/* "bolsista" e "voluntario" são conjuntos DIFERENTES do mesmo lote — eles
   assinam modelos diferentes (o PVIC não tem bolsa nem conta bancária), e a
   coordenação leva cada pilha à cerimônia. "aluno" traz os dois. */
const TIPOS_TERMO = ["bolsista", "voluntario", "aluno", "orientador", "todos"];

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

    // o aluno leva só o registro dele — bolsista ou voluntário, o modelo é
    // escolhido pelo fomento do projeto ("aluno" não filtra por fomento
    // justamente para o voluntário não ficar sem a própria via)
    const tipo = papel === "aluno" ? "aluno" : "orientador";
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
    await enviarAviso("ic-movimentacao", emailMovimentacaoIC({ assunto, titulo, linhas }));
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
      await enviarAviso("ic-cobranca-relatorio", emailCobrancaRelatorioIC({ para: emailAlvo, ...dados }));
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
      await enviarAviso("ic-cobranca-relatorio", emailCobrancaRelatorioIC({ para: emailAlvo, ...dados, mensagem }));
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
/* AS DUAS RÉGUAS DO ICEM, lado a lado (decisão do dono, ago/2026).

   O bolsista acompanha PESQUISA: na PRIMEIRA escolha, Iniciação Científica e
   Inovação Tecnológica — a bancada e o laboratório, que é o que o programa
   existe para lhe mostrar. No PEDIDO de alteração, as três linhas do edital,
   Iniciação à Extensão inclusive: aí ele já viveu um projeto e sabe o que
   quer conhecer.

   Ficam juntas de propósito: são a mesma pergunta feita em dois momentos, e
   separá-las pelo arquivo faria alguém mudar uma e esquecer a outra. Cada
   uma vale nos DOIS lados — monta o cardápio da tela e confere na gravação —,
   senão o estudante poderia escolher o que a tela não ofereceu. */
const LINHAS_ACOMPANHAVEIS_EM = ["ic", "it"];
/* O PEDIDO de alteração oferece as TRÊS linhas do edital: quem pede a troca
   já viveu um projeto e sabe o que quer conhecer (decisão do dono, ago/2026:
   "uma lista dos projetos vigentes de IC/IT/Ex do ano"). */
const LINHAS_PEDIDO_EM = ["ic", "it", "ie"];

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
        // os pedidos de alteração DELE — o pendente e os já decididos
        pedidosProjeto: b.pedidosProjeto || [],
        relatorios: b.relatorios, conint: b.conint,
        // a turma vigente entrega parcial e final; as antigas, só o final
        exigidos: relatoriosExigidos(minha),
      };
    }),
    camposRelatorio: CAMPOS_RELATORIO_EM,
    // o questionário de avaliação do programa, que vai junto do relatório
    avaliacaoModelo: { escala: ESCALA_AVALIACAO_EM, criterios: CRITERIOS_AVALIACAO_EM, recomendacoes: RECOMENDACAO_EM },
    cursosUniego: CURSOS.map((c) => c.nome),
    /* O cardápio da escolha: os projetos EM EXECUÇÃO da graduação — título,
       curso e orientação, nada além (o registro completo é do projeto).
       Só as linhas IC e IT (decisão do dono, ago/2026: "os projetos devem
       ser aqueles do ciclo do IC e IT, que eles irão acompanhar"): a
       Iniciação à Extensão é ação de extensão, não a bancada de pesquisa que
       o ICEM existe para o estudante conhecer.
       Quando o ciclo da graduação ainda está em avaliação, esta lista vem
       VAZIA — e a tela precisa dizer por quê, em vez de mostrar um seletor
       sem opções (é o caso do 01/2026 em set/2026). */
    escolha: podeEscolher ? {
      projetos: projetos.filter((p) => p.status === "aprovado"
        && LINHAS_ACOMPANHAVEIS_EM.includes(String(p.linha || "").toLowerCase()))
        .map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo, linha: p.linha,
          curso: nomeCurso(p.curso), orientador: p.orientador?.nome || "" }))
        .sort((a, b) => a.curso.localeCompare(b.curso, "pt-BR") || a.titulo.localeCompare(b.titulo, "pt-BR")),
      // por que a lista pode estar vazia — a tela mostra isto ao estudante
      emAvaliacao: projetos.filter((p) => p.status === "submetido"
        && LINHAS_ACOMPANHAVEIS_EM.includes(String(p.linha || "").toLowerCase())).length,
      /* O cardápio do PEDIDO de alteração é mais largo: as TRÊS linhas do
         edital (IC, IT e Iniciação à Extensão). Quem pede a troca já viveu
         um projeto e sabe o que quer conhecer. */
      paraTrocar: projetos.filter((p) => p.status === "aprovado"
        && LINHAS_PEDIDO_EM.includes(String(p.linha || "").toLowerCase()))
        .map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo, linha: p.linha,
          curso: nomeCurso(p.curso), orientador: p.orientador?.nome || "" }))
        .sort((a, b) => a.curso.localeCompare(b.curso, "pt-BR") || a.titulo.localeCompare(b.titulo, "pt-BR")),
    } : null,
  });
});

/* ------------- PEDIDO DE ALTERAÇÃO DE PROJETO (ICEM) --------------------
   Pedido do dono (ago/2026): "no painel do bolsista de ensino médio, inclua
   uma sessão de Solicitar alteração de Projeto, onde aparece uma lista dos
   projetos vigentes de IC/IT/Ex do ano, para ele escolher; essa solicitação
   vai ao proppex para aprovação".

   A PRIMEIRA escolha continua sendo do estudante — é o que o e-mail do
   resultado pede que ele faça. A MUDANÇA vira pedido, porque quem o
   apresenta ao orientador é a coordenação.

   Uma diferença deliberada entre as duas listas: a escolha inicial oferece
   IC e IT (a bancada de pesquisa, que é o que o programa existe para
   mostrar); o pedido de alteração oferece as TRÊS linhas do edital —
   incluindo a Iniciação à Extensão —, porque aí o estudante já viveu um
   projeto e sabe o que quer conhecer. As duas réguas ficam lado a lado,
   nomeadas, para ninguém precisar adivinhar por que diferem (as duas vivem
   juntas, mais acima: LINHAS_ACOMPANHAVEIS_EM e LINHAS_PEDIDO_EM). */

/** POST /api/ic/em/meu/pedido-projeto — o estudante pede a alteração. */
app.post("/api/ic/em/meu/pedido-projeto", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const alvoId = String(req.body?.projetoId || "").trim();
  const motivo = String(req.body?.motivo || "").trim().slice(0, 2000);
  if (!alvoId) return res.status(400).json({ error: "Escolha o projeto que você quer passar a acompanhar." });
  if (motivo.length < 15)
    return res.status(400).json({ error: "Escreva o motivo do pedido — é o que a coordenação lê para decidir." });
  const alvo = (await lerProjetos()).find((p) => p.id === alvoId);
  if (!alvo) return res.status(404).json({ error: "Projeto não encontrado" });
  if (alvo.status !== "aprovado") return res.status(400).json({ error: "Este projeto não está em execução." });
  if (!LINHAS_PEDIDO_EM.includes(String(alvo.linha || "").toLowerCase()))
    return res.status(400).json({ error: "Escolha um projeto de Iniciação Científica, Inovação Tecnológica ou Iniciação à Extensão." });

  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === String(req.body?.id || "")
      && x.email === String(u.email).toLowerCase());
    if (i < 0) return { erro: [404, "Registro do ICEM não encontrado para a sua conta"], gravar: false };
    const b = lista[i];
    if (turmaEmDe(b.turma)?.encerrada) return { erro: [400, "A sua turma já encerrou — a trajetória fica como está."], gravar: false };
    if (b.situacao !== "ativo") return { erro: [400, "O seu registro não está ativo — fale com a coordenação de pesquisa."], gravar: false };
    const atual = projetoAtualEM(b);
    if (!atual) return { erro: [400, "Você ainda não acompanha nenhum projeto: escolha o primeiro ali em cima."], gravar: false };
    if (atual.projetoId === alvo.id) return { erro: [400, "Este já é o projeto que você acompanha."], gravar: false };
    // um pedido por vez: dois pendentes fariam a coordenação decidir duas
    // vezes a mesma coisa, e o segundo desmentiria o primeiro
    if ((b.pedidosProjeto || []).some((x) => x.situacao === "pendente"))
      return { erro: [400, "Você já tem um pedido aguardando a coordenação de pesquisa."], gravar: false };
    const pedido = {
      id: `ped-${Math.random().toString(36).slice(2, 10)}`,
      projetoId: alvo.id, numero: alvo.numero || "", titulo: alvo.titulo || "",
      orientador: alvo.orientador?.nome || "", curso: alvo.curso || "", linha: alvo.linha || "",
      motivo, em: new Date().toISOString(), por: u.email, situacao: "pendente", decisao: null,
    };
    let novo = { ...b, pedidosProjeto: [...(b.pedidosProjeto || []), pedido] };
    novo = anotarEM(novo, { quem: u.email,
      oQue: `pediu para trocar para ${alvo.numero || alvo.titulo}` });
    lista[i] = novo;
    return { bolsista: novo, pedido };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  avisarPesquisa(`ICEM: ${r.bolsista.nome} pediu alteração de projeto`, [
    ["Bolsista", `${r.bolsista.nome} (turma ${r.bolsista.turma})`],
    ["Projeto pedido", `${r.pedido.numero || ""} ${r.pedido.titulo}`.trim()],
    ["Orientação", r.pedido.orientador || "—"],
    ["Motivo", r.pedido.motivo],
  ], "Pedido de alteração de projeto no ICEM");
  res.json({ ok: true, bolsista: r.bolsista });
});

/** POST /api/ic/em/:id/pedido-projeto/:pid — a PROPPEX decide. */
app.post("/api/ic/em/:id/pedido-projeto/:pid", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  if (!gereIC(u)) return res.status(403).json({ error: "A decisão é da coordenação de pesquisa" });
  const decisao = String(req.body?.decisao || "");
  const parecer = String(req.body?.parecer || "").trim().slice(0, 2000);
  if (!["aprovado", "recusado"].includes(decisao))
    return res.status(400).json({ error: "Decisão inválida: aprovado ou recusado" });
  if (decisao === "recusado" && !parecer)
    return res.status(400).json({ error: "Recusar exige o motivo — é o que o estudante lê." });

  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === req.params.id);
    if (i < 0) return { erro: [404, "Bolsista não encontrado"], gravar: false };
    const b = lista[i];
    const p = (b.pedidosProjeto || []).find((x) => x.id === req.params.pid);
    if (!p) return { erro: [404, "Pedido não encontrado"], gravar: false };
    if (p.situacao !== "pendente") return { erro: [400, "Este pedido já foi decidido."], gravar: false };
    const agora = new Date().toISOString();
    const pedidos = (b.pedidosProjeto || []).map((x) => (x.id === p.id
      ? { ...x, situacao: decisao, decisao: { em: agora, por: u.email, parecer } } : x));
    let novo = { ...b, pedidosProjeto: pedidos };
    // aprovado, a trajetória muda AQUI: é a decisão que a move, e é ela que
    // fecha o acompanhamento anterior com a data de hoje
    if (decisao === "aprovado") {
      novo = trocarProjeto(novo, { projetoId: p.projetoId, numero: p.numero,
        titulo: p.titulo, orientador: p.orientador });
    }
    novo = anotarEM(novo, { quem: u.email,
      oQue: `${decisao === "aprovado" ? "aprovou" : "recusou"} a alteração para ${p.numero || p.titulo}`
        + (parecer ? ` — ${parecer}` : "") });
    lista[i] = novo;
    return { bolsista: novo, pedido: p };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, bolsista: r.bolsista });
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
  if (!LINHAS_ACOMPANHAVEIS_EM.includes(String(alvo.linha || "").toLowerCase()))
    return res.status(400).json({ error: "O ICEM acompanha projetos de Iniciação Científica e de Inovação Tecnológica." });
  const r = await comBolsistasEM((lista) => {
    const i = lista.findIndex((x) => x.id === String(req.body?.id || "")
      && x.email === String(u.email).toLowerCase());
    if (i < 0) return { erro: [404, "Registro do ICEM não encontrado para a sua conta"], gravar: false };
    const b = lista[i];
    if (turmaEmDe(b.turma)?.encerrada) return { erro: [400, "A sua turma já encerrou — a trajetória fica como está."], gravar: false };
    if (b.situacao !== "ativo") return { erro: [400, "O seu registro não está ativo — fale com a coordenação de pesquisa."], gravar: false };
    if (projetoAtualEM(b)?.projetoId === alvo.id) return { erro: [400, "Você já acompanha este projeto."], gravar: false };
    /* A PRIMEIRA escolha é do estudante; TROCAR passa pela PROPPEX (decisão
       do dono, ago/2026, revendo o "troca quando quiser"). Quem apresenta o
       estudante ao orientador é a coordenação — uma troca silenciosa
       deixaria o professor antigo esperando alguém que não vem. */
    if (projetoAtualEM(b))
      return { erro: [400, "Você já acompanha um projeto: para mudar, use "
        + "\"Solicitar alteração de projeto\" — a coordenação de pesquisa aprova."], gravar: false };
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
    try { await enviarAviso("em-chamada-relatorio", emailChamadaRelatorioEM(b, turma, { baseUrl, tipos: meusTipos, mensagem })); }
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
    const buffer = await gerarResultadoEMPdf({ turma, bolsistas, emitidoPor: u.email, fase,
      assinaturas: await assinaturasParaPdf() });
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
/* O RESULTADO FINAL do ICEM avisa quem foi selecionado (pedido do dono,
   ago/2026): "após o proppex definir qual tipo de bolsa e publicar o
   resultado final, faça o aluno receber um e-mail com a comunicação e um
   botão para escolher qual projeto".

   Três cuidados, os mesmos do aviso de certificados: o envio é SEQUENCIAL e
   fire-and-forget (e-mail que falha não desfaz a publicação); a marca por
   turma impede que republicar reenvie tudo — quem for incluído depois recebe
   só o dele; e a resposta devolve quantos foram avisados e quantos ficaram
   SEM e-mail no cadastro, que é o tamanho do buraco que a coordenação
   precisa conhecer. Desligado é quem saiu do programa: não se avisa. */
const AVISOS_RESULTADO_EM_KEY = "sys-ic-em-avisos-resultado-v1";

async function avisarResultadoEM(turma) {
  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  const lista = (await lerBolsistasEM()).filter(
    (b) => b.turma === turma.ciclo && b.situacao !== "desligado");
  let ja = new Set();
  try {
    const reg = JSON.parse((await storage.get(AVISOS_RESULTADO_EM_KEY)) || "{}");
    ja = new Set(reg[turma.edital]?.emails || []);
  } catch { /* sem registro legível, avisa a turma toda */ }

  const semEmail = lista.filter((b) => !String(b.email || "").trim()).length;
  const fila = lista.filter((b) => {
    const e = String(b.email || "").trim().toLowerCase();
    return e && !ja.has(e);
  });
  if (!fila.length) return { enviados: 0, semEmail, jaAvisados: ja.size };

  const { emailResultadoEM } = await import("./lib/mailer.js");
  const enviados = [];
  for (const b of fila) {
    try {
      await enviarAviso("em-resultado",
        emailResultadoEM(b, turma, { baseUrl: base, bolsa: bolsaEmDe(b.bolsa) }));
      enviados.push(String(b.email).trim().toLowerCase());
    } catch (e) {
      console.error(`[ic-em] aviso de resultado não enviado a ${b.email}:`, e.message);
    }
  }
  try {
    const reg = JSON.parse((await storage.get(AVISOS_RESULTADO_EM_KEY)) || "{}");
    reg[turma.edital] = { em: new Date().toISOString(),
      emails: [...new Set([...(reg[turma.edital]?.emails || []), ...enviados])] };
    await storage.set(AVISOS_RESULTADO_EM_KEY, JSON.stringify(reg));
    await storage.flush?.();
  } catch (e) { console.error("[ic-em] marca do aviso de resultado:", e.message); }
  return { enviados: enviados.length, semEmail, jaAvisados: ja.size };
}

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
  // publicado o FINAL, cada selecionado recebe a comunicação com a bolsa e o
  // botão para escolher o projeto (pedido do dono, ago/2026)
  const aviso = fase === "final" ? await avisarResultadoEM(turma) : null;
  res.json({ ok: true, edital: turma.edital, fase, ...(aviso ? { aviso } : {}) });
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
      await enviarAviso("em-convite", emailConviteEM(b, turma, { baseUrl, mensagem }));
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
      ws.addRow(linhaSegura({
        turma: b.turma, bolsa: bolsaEmDe(b.bolsa)?.nome || (b.bolsa || "—"),
        nome: b.nome, cpf: formatarCpf(b.cpf) || "", rg: b.rg || "",
        escola: b.escola || "", serie: b.serie || "", telefone: b.telefone || "",
        email: b.email || "", curso: b.cursoInteresse || "",
        respNome: b.responsavel?.nome || "", respCpf: formatarCpf(b.responsavel?.cpf) || "",
        banco: b.banco || "", agencia: b.agencia || "", conta: b.conta || "", pix: b.pix || "",
      }));
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

/* Bolsista ou voluntário NÃO é escolha de formulário (dúvida de um professor,
   ago/2026, diante da caixa "Bolsista" na indicação): acompanha a bolsa
   concedida ao PROJETO, e quem concede é a PROPPEX, na guia Bolsas — projeto
   com bolsa indica bolsista, projeto sem bolsa indica voluntário. A conta está
   aqui, nos dois ramos do POST (orientação e gestão), e a rota do fomento a
   refaz em TODOS os alunos ao conceder ou desfazer. */
const bolsistaPelaConcessao = (p) => {
  const t = String(p?.fomento?.tipo || "");
  return !!t && t !== "voluntario";
};

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
            return { ...a, bolsista: bolsistaPelaConcessao(base) };
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
          // aluno NOVO: bolsista ou voluntário sai da bolsa concedida ao
          // projeto, aqui como no ramo da orientação — a marca acompanha a
          // concessão (que a guia Bolsas refaz em todos), não a tela
          if (!antes) return { ...a, bolsista: bolsistaPelaConcessao(base) };
          const dele = { bolsista: !!antes.bolsista };
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
      await enviarAviso("ic-convite-aluno", {
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
 * CORRIGIR O E-MAIL DO ALUNO INDICADO (pedido do dono, ago/2026).
 *
 * O e-mail é a chave da conta do aluno, e por isso trocá-lo pelo formulário
 * é vedado à orientação: seria trocar de pessoa sem passar pela Substituição
 * de bolsista. Só que o professor DIGITA esse e-mail, e digitar errado é
 * banal — a profa. Kênia errou o do Tiago e a indicação simplesmente não
 * chegava a ninguém. Mandar todo erro de digitação à PROPPEX é transformar
 * um engano de um caractere em pedido protocolado.
 *
 * A saída é separar CORRIGIR de TROCAR pelo único sinal que distingue os
 * dois: se o aluno já entrou. Enquanto ele não preencheu nada de seu (CPF,
 * RG, endereço, conta — os CAMPOS_DO_ALUNO_PROTEGIDOS), o endereço não
 * abriu conta nenhuma e corrigi-lo não tira nada de ninguém: a orientação
 * corrige e o convite sai de novo, agora para o endereço certo. Depois que
 * ele entrou, o e-mail passa a ser a identidade de alguém que já está no
 * projeto — aí só a PROPPEX, e trocar de bolsista continua sendo a
 * Substituição. Em qualquer caso a correção fica no histórico: o que mudou
 * a chave de uma conta precisa ser explicável depois.
 */
app.post("/api/ic/:id/aluno-email", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const b = req.body || {};
  const de = String(b.de || "").trim().toLowerCase();
  const para = String(b.para || "").trim().toLowerCase().slice(0, 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para))
    return res.status(400).json({ error: "Informe um e-mail válido." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    const p = projetos[i];
    const papel = papelNoProjeto(meu, p);
    if (papel !== "orientador" && papel !== "gestao")
      return { erro: [403, "A correção é da orientação ou da coordenação"], gravar: false };

    const alunos = p.alunos || [];
    const j = alunos.findIndex((a) => String(a.email || "").toLowerCase() === de
      || (!de && !a.email && String(a.nome || "").trim().toLowerCase() === String(b.nome || "").trim().toLowerCase()));
    if (j < 0) return { erro: [400, "Não encontrei esse aluno na indicação."], gravar: false };
    if (String(alunos[j].email || "").toLowerCase() === para)
      return { erro: [400, "Este já é o e-mail do aluno."], gravar: false };
    if (alunos.some((a, k) => k !== j && String(a.email || "").toLowerCase() === para))
      return { erro: [400, "Outro aluno deste projeto já está com esse e-mail."], gravar: false };

    // já entrou? então o endereço é a identidade de uma conta em uso
    const entrou = CAMPOS_DO_ALUNO_PROTEGIDOS.some((c) => String(alunos[j][c] || "").trim());
    if (entrou && papel !== "gestao") {
      return { erro: [403, `${alunos[j].nome || "O aluno"} já preencheu o próprio cadastro — o e-mail virou a conta dele. `
        + "Para corrigir mesmo assim, fale com a PROPPEX; para trocar de bolsista, use a Substituição de bolsista."], gravar: false };
    }

    const antigo = alunos[j].email || "(sem e-mail)";
    alunos[j] = { ...alunos[j], email: para };
    projetos[i] = anotarProjeto({ ...p, alunos }, {
      quem: u.email,
      oQue: `corrigiu o e-mail de ${alunos[j].nome || "um aluno indicado"}: ${antigo} → ${para}`,
    });
    // o convite nunca chegou ao endereço errado; sai agora para o certo
    return { projeto: projetos[i], convidar: ["aprovado", "concluido"].includes(p.status) ? [alunos[j]] : [] };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  if (r.convidar?.length) convidarAlunosIC(r.projeto, r.convidar);
  avisarPesquisa(`E-mail de aluno corrigido — ${r.projeto.numero || ""}`, [
    ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
    ["Novo e-mail", para],
  ], "Correção de e-mail na indicação de aluno");
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
 * Correções pontuais de e-mail na indicação de aluno.
 *
 * Enquanto a orientação não tinha como corrigir sozinha (ver
 * POST /api/ic/:id/aluno-email), o endereço digitado errado só se
 * consertava pela PROPPEX — e o convite ficava sem chegar a ninguém. As
 * correções já pedidas entram aqui, uma vez cada (marca sys-*).
 *
 * O aluno é encontrado pelo TELEFONE, não pelo e-mail errado: é o dado que
 * a orientação digitou certo e o único que não está em disputa. A correção
 * não cria aluno nem mexe em nada além do endereço, e passa pela mesma fila
 * de escrita dos projetos.
 */
const EMAILS_A_CORRIGIR = [
  // profa. Kênia Rodrigues (Direito) — o endereço saiu com um caractere
  // trocado e a indicação não chegava ao aluno (WhatsApp de 19/08/2026)
  { telefone: "62986447489", email: "tiagoribeito54@gmail.com" },
];

async function corrigirEmailsIndicacao() {
  const marca = "sys-ic-correcao-email-v1";
  if (await storage.get(marca)) return;
  const so = (v) => String(v || "").replace(/\D+/g, "");
  await comProjetos((projetos) => {
    let n = 0;
    for (let i = 0; i < projetos.length; i++) {
      const alunos = projetos[i].alunos || [];
      let mexeu = false;
      const novos = alunos.map((a) => {
        const alvo = EMAILS_A_CORRIGIR.find((c) => so(c.telefone) && so(a.telefone) === so(c.telefone));
        if (!alvo || String(a.email || "").toLowerCase() === alvo.email) return a;
        mexeu = true;
        console.log(`[ic] e-mail corrigido: ${a.email || "(vazio)"} → ${alvo.email}`);
        return { ...a, email: alvo.email };
      });
      if (mexeu) {
        n += 1;
        projetos[i] = anotarProjeto({ ...projetos[i], alunos: novos }, {
          quem: "sistema", oQue: "corrigiu o e-mail digitado errado na indicação do aluno",
        });
      }
    }
    console.log(`[ic] correção de e-mail na indicação: ${n} projeto(s)`);
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
/* Lotes de ações transcritas do processo em PAPEL — cada um sobe uma vez só
   (a marca `sys-ex-lote-*` é o que impede um deploy de ressuscitar ação que a
   PROPPEX apagou de propósito). Estas ações NÃO ganham `evento`: o ARCHÉ EV é
   dos eventos geridos DENTRO do sistema (página, inscrição online,
   credenciamento); o que correu por fora entra pelo ARCHÉ EX, com proposta,
   relatório e listas — decisão do dono, ago/2026. */
const LOTES_EXTENSAO = [
  { arquivo: "ex-semana-enf-2026.json", marca: "sys-ex-lote-semana-enf-2026", rotulo: "Semana de Enfermagem 2026" },
  { arquivo: "ex-lote-eventos-2026.json", marca: "sys-ex-lote-eventos-2026", rotulo: "Ações de 2026 (Abril Laranja, Encontro Família, Ciências Agrárias)" },
];

/* AS ARTES SAEM DO ARQUIVO DE ESTADO (decisão do dono, ago/2026).
   Capa, foto de palestrante e logotipo de apoiador nasceram embutidas no
   registro da ação. Como o estado é UM arquivo reescrito INTEIRO a cada
   gravação, a varredura mediu que elas eram ~92% dele: cada presença
   marcada, cada inscrição, cada aprovação subia megabytes de imagem que não
   mudaram. Aqui elas viram arquivo no Drive e o registro fica com a
   referência — o mesmo que o portfólio sempre fez.

   Cuidados: sobe FORA da fila (é lento) e grava DEPOIS, num ato só; falha
   de uma arte não impede as outras nem apaga o que estava lá — o que não
   converter continua sendo servido na forma antiga, porque `lerArte` aceita
   as duas. E a marca é gravada mesmo com pendências, para o arranque não
   tentar de novo a cada deploy; o que falhar converte quando alguém salvar
   o evento. */
async function migrarArtesParaODrive() {
  const marca = "sys-ex-artes-drive-v1";
  try {
    if (await storage.get(marca)) return;
    const acoes = await lerAcoes();
    const pendentes = acoes
      .map((a) => ({ acao: a, artes: artesEmbutidas(a.evento) }))
      .filter((x) => x.artes.length);
    if (!pendentes.length) {
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), convertidas: 0 }));
      return;
    }
    let convertidas = 0, falhas = 0, bytes = 0;
    const refs = [];   // { acaoId, onde, id, ref }
    for (const { acao, artes } of pendentes) {
      for (const arte of artes) {
        try {
          const nome = arte.onde === "capa" ? "capa" : `${arte.onde}-${arte.id}`;
          const ref = await guardarArte(arte.valor, { acao, nome });
          if (ref) { refs.push({ acaoId: acao.id, onde: arte.onde, id: arte.id, ref });
            convertidas += 1; bytes += ref.bytes || 0; }
        } catch (e) {
          falhas += 1;
          console.error(`[artes] ${acao.id}/${arte.onde}: ${e.message}`);
        }
      }
    }
    if (refs.length) {
      await comAcoes((lista) => {
        for (const { acaoId, onde, id, ref } of refs) {
          const a = lista.find((x) => x.id === acaoId);
          if (a?.evento) aplicarReferencia(a.evento, { onde, id }, ref);
        }
        return {};
      });
    }
    await storage.set(marca, JSON.stringify({
      em: new Date().toISOString(), convertidas, falhas, bytesTirados: bytes }));
    console.log(`[artes] ${convertidas} imagem(ns) movida(s) para o Drive`
      + ` (${Math.round(bytes / 1024)} KB fora do estado)${falhas ? `, ${falhas} falha(s)` : ""}`);
  } catch (e) {
    console.error("[artes] migração não concluída:", e.message);
  }
}

/* Ação que veio do papel não é candidata a evento (decisão do dono, ago/2026):
   marca as que já estavam gravadas antes de o campo existir — a da Semana de
   Enfermagem, entre elas —, para o ARCHÉ EV deixar de oferecê-las. */
async function marcarAcoesDePapel() {
  const marca = "sys-ex-origem-papel-v1";
  try {
    if (await storage.get(marca)) return;
    const ids = new Set();
    for (const { arquivo } of LOTES_EXTENSAO) {
      try {
        const j = JSON.parse(await readFile(path.join(__dirname, "dados", arquivo), "utf8"));
        for (const a of j.acoes || []) if (a?.id) ids.add(a.id);
      } catch { /* sem o arquivo, segue */ }
    }
    if (!ids.size) return;
    const r = await comAcoes((acoes) => {
      let n = 0;
      for (const a of acoes) {
        if (ids.has(a.id) && a.origemPapel !== true) { a.origemPapel = true; n++; }
      }
      return { n, gravar: n > 0 };
    });
    await storage.set(marca, JSON.stringify({ em: new Date().toISOString(), acoes: r.n }));
    if (r.n) console.log(`ARCHÉ EX · ${r.n} ação(ões) marcada(s) como vindas do processo em papel`);
  } catch (e) {
    console.error("Falha ao marcar as ações de papel:", e.message);
  }
}

async function subirAcoesMigradasExtensao() {
  for (const { arquivo, marca, rotulo } of LOTES_EXTENSAO) {
    try {
      if (await storage.get(marca)) continue;
      let lote = [];
      try {
        lote = JSON.parse(await readFile(path.join(__dirname, "dados", arquivo), "utf8")).acoes || [];
      } catch { continue; }   // sem o arquivo, nada a subir
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
      console.log(`ARCHÉ EX · ${rotulo}: ${entraram} ação(ões) migrada(s) do processo em papel`);
    } catch (e) {
      console.error(`Falha ao subir o lote ${arquivo} da extensão:`, e.message);
    }
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
        await enviarAviso("ic-cobranca-relatorio", emailCobrancaRelatorioIC({ para: emailAlvo, ...dados }));
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
        await enviarAviso("em-convite", emailConviteEM(b, turma, {}));
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

  /* PEDIDO DE ENCERRAMENTO (decisão do dono, ago/2026): o aluno pode
     relatar, no parcial OU no final, que o projeto foi interrompido — o caso
     que motivou isto foi o desligamento do orientador no meio da vigência.
     Aí o relatório muda de natureza: não se cobram as seções do roteiro, o
     artigo da revista nem as avaliações (não há o que avaliar num projeto que
     não correu) — cobra-se a JUSTIFICATIVA, que é o que a PROPPEX vai ler
     para encerrar. */
  const pedeEncerramento = b.encerramento?.pedido === true;
  const motivoEncerramento = String(b.encerramento?.motivo || "").trim().slice(0, 4000);
  if (pedeEncerramento && motivoEncerramento.length < 30) {
    return res.status(400).json({ error: "Explique por que o projeto foi interrompido — a justificativa vai à PROPPEX, que decide o encerramento (mínimo de 30 caracteres)." });
  }
  // a validação é a do modelo institucional de cada tipo (decisão do dono,
  // ago/2026): o parcial cobra as seções do roteiro; o final, os dados da
  // revista do artigo — o arquivo do artigo entra em seguida, como anexo
  if (pedeEncerramento) {
    /* sem mais exigências: o relatório é o registro da interrupção */
  } else if (tipo === "parcial") {
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
  if (!pedeEncerramento && (semResposta.length || semNota.length)) {
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
      // o pedido de encerramento viaja no próprio relatório; a decisão da
      // PROPPEX, quando houver, é preservada num reenvio
      encerramento: pedeEncerramento
        ? { ...(j >= 0 ? lista[j].encerramento || {} : {}), pedido: true, motivo: motivoEncerramento,
            em: new Date().toISOString(), por: u.email }
        : (j >= 0 ? lista[j].encerramento || {} : {}),
    };
    if (j >= 0) lista[j] = novo; else lista.push(novo);
    projetos[i] = anotarProjeto({ ...projetos[i], relatorios: lista, atualizadoEm: new Date().toISOString() },
      { quem: u.email, oQue: `enviou o relatório ${tipo}` });
    return { projeto: projetos[i], relatorio: novo };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  if (pedeEncerramento) {
    avisarPesquisa(`PEDIDO DE ENCERRAMENTO — ${r.projeto.numero || ""}`, [
      ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
      ["Aluno", u.nome || u.email],
      ["Relatado no", tipo === "final" ? "Relatório final" : "Relatório parcial"],
      ["Justificativa", motivoEncerramento.slice(0, 600)],
      ["Decisão", "A PROPPEX valida o encerramento pelo projeto (a orientação não decide)"],
    ], "Pedido de encerramento de projeto de IC");
  } else {
    avisarPesquisa(`Relatório ${tipo} entregue — ${r.projeto.numero || ""}`, [
      ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
      ["Aluno", u.nome || u.email],
      ["Tipo", tipo === "final" ? "Relatório final" : "Relatório parcial"],
      ["Validação", "A orientação valida (ou devolve) pelo projeto"],
    ], "Relatório de IC entregue pelo aluno");
  }
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
      prefix: `${REPO}/Iniciação Científica/${slug(p.curso || "geral")}/${anoDaPasta(p.numero, p.ciclo || p.criadoEm)}/${slug(p.numero || p.id)}`,
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

/* A EQUIPE do evento — palestrantes e comissão organizadora — é quem recebe
   certificado À PARTE do participante, e sai na mesma planilha da AEE. Rota
   DEDICADA (o ARCHÉ EV nunca usa o POST em bloco da Extensão) e com a régua
   do certificado aplicada na gravação: sem CPF/matrícula, e-mail e telefone,
   a linha não emitiria certificado nenhum — melhor saber agora do que na
   véspera. */
app.post("/api/extensao/:id/equipe", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const b = req.body || {};
    if ((b.palestrantes !== undefined && !Array.isArray(b.palestrantes))
      || (b.comissao !== undefined && !Array.isArray(b.comissao)))
      return res.status(400).json({ error: "Envie as listas de palestrantes e da comissão." });

    const prepara = (lista, opts) => (lista || [])
      .map((x) => normalizarPessoaEvento(x, opts))
      .filter((x) => x.nome || x.cpf || x.email);
    const palestrantes = b.palestrantes === undefined ? null : prepara(b.palestrantes, { palestrante: true }).slice(0, 200);
    const comissao = b.comissao === undefined ? null : prepara(b.comissao, {}).slice(0, 300);

    // o que falta para o certificado sair — nome a nome, para a tela apontar
    const problemas = [];
    for (const [lista, opts, rot] of [[palestrantes, { palestrante: true }, "palestrante"], [comissao, {}, "comissão"]]) {
      for (const pessoa of lista || []) {
        const falta = faltaParaCertificado(pessoa, opts);
        if (falta.length) problemas.push(`${pessoa.nome || "(sem nome)"} (${rot}): falta ${falta.join(", ")}`);
      }
    }
    if (problemas.length)
      return res.status(400).json({ error: `Estes dados vão para a planilha de certificados e são obrigatórios — ${problemas.slice(0, 6).join("; ")}${problemas.length > 6 ? "…" : ""}.` });
    // CPF informado tem de ser CPF de verdade: certificado emitido com CPF
    // inválido não se corrige depois de entregue
    const cpfTorto = [...(palestrantes || []), ...(comissao || [])]
      .filter((x) => x.cpf && !cpfValido(x.cpf)).map((x) => x.nome);
    if (cpfTorto.length)
      return res.status(400).json({ error: `CPF inválido em: ${cpfTorto.slice(0, 5).join(", ")}. Confira os números (ou use a matrícula).` });

    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!podeOperarEvento(u, a)) return { erro: [403, "Sem permissão para operar este evento"], gravar: false };
      a.participantes = a.participantes || { inscritos: [], palestrantes: [], comissao: [] };
      if (palestrantes) a.participantes.palestrantes = palestrantes;
      if (comissao) a.participantes.comissao = comissao;
      a.atualizadoEm = new Date().toISOString();
      return { acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true,
      palestrantes: r.acao.participantes.palestrantes || [],
      comissao: r.acao.participantes.comissao || [],
      pendencias: pendenciasCertificado(r.acao) });
  } catch (e) {
    console.error("Erro ao gravar a equipe do evento:", e);
    res.status(500).json({ error: "Falha ao gravar" });
  }
});

/* A DECISÃO do encerramento é da PROPPEX (decisão do dono, ago/2026), e não
   da orientação: no caso que motivou isto — professor desligado no meio da
   vigência — a orientação é justamente quem não está mais lá para decidir.
   Aceito, o projeto passa a "encerrado" (nem concluído, nem reprovado: o
   ciclo não se completou) e o relatório que trouxe o pedido fica validado,
   como o registro do que aconteceu. Recusado, o motivo fica no histórico e o
   relatório volta ao caminho normal — a orientação valida ou devolve. */
app.post("/api/ic/:id/relatorio/:rid/encerramento", async (req, res) => {
  const u = await sessaoIC(req, res);
  if (!u) return;
  const meu = quemIC(u);
  const decisao = String(req.body?.decisao || "");
  const parecer = String(req.body?.parecer || "").trim().slice(0, 4000);
  if (!["aceito", "recusado"].includes(decisao))
    return res.status(400).json({ error: "Decisão inválida — aceitar ou recusar o encerramento." });
  if (parecer.length < 10)
    return res.status(400).json({ error: "Escreva o parecer da coordenação — é ele que fica no histórico do projeto." });

  const r = await comProjetos((projetos) => {
    const i = projetos.findIndex((x) => x.id === req.params.id);
    if (i < 0 || !podeVerProjeto(meu, projetos[i])) return { erro: [404, "Projeto não encontrado"], gravar: false };
    if (!meu.gestao) return { erro: [403, "Quem decide o encerramento do projeto é a PROPPEX."], gravar: false };
    const lista = [...(projetos[i].relatorios || [])];
    const j = lista.findIndex((x) => x.id === req.params.rid);
    if (j < 0) return { erro: [404, "Relatório não encontrado"], gravar: false };
    if (!lista[j].encerramento?.pedido)
      return { erro: [400, "Este relatório não traz pedido de encerramento."], gravar: false };
    if (lista[j].encerramento?.decisao)
      return { erro: [400, "Este pedido já foi decidido."], gravar: false };
    const agora = new Date().toISOString();
    lista[j] = {
      ...lista[j],
      // aceito, o relatório do encerramento fica validado: é a peça que
      // documenta a interrupção. Recusado, segue como estava (enviado) e a
      // orientação valida ou devolve normalmente
      situacao: decisao === "aceito" ? "validado" : lista[j].situacao,
      ...(decisao === "aceito" ? { avaliadoPor: u.email, avaliadoEm: agora, validadoPelaGestao: true } : {}),
      encerramento: { ...lista[j].encerramento, decisao, parecer, decididoPor: u.email, decididoEm: agora },
    };
    projetos[i] = anotarProjeto({
      ...projetos[i], relatorios: lista,
      status: decisao === "aceito" ? "encerrado" : projetos[i].status,
      atualizadoEm: agora,
    }, { quem: u.email,
      oQue: decisao === "aceito"
        ? "encerrou o projeto a pedido do aluno, com parecer da PROPPEX"
        : "recusou o pedido de encerramento do projeto" });
    return { projeto: projetos[i], tipoRel: lista[j].tipo, aluno: lista[j].aluno };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  avisarPesquisa(
    decisao === "aceito"
      ? `Projeto ENCERRADO — ${r.projeto.numero || ""}`
      : `Encerramento recusado — ${r.projeto.numero || ""}`,
    [
      ["Projeto", `${r.projeto.numero || ""} ${r.projeto.titulo || ""}`.trim()],
      ["Aluno", r.aluno || "—"],
      ["Relatado no", r.tipoRel === "final" ? "Relatório final" : "Relatório parcial"],
      ["Parecer", parecer.slice(0, 600)],
    ], decisao === "aceito" ? "Encerramento de projeto validado pela PROPPEX" : "Pedido de encerramento recusado");
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



/* ========================================================================
   ARCHÉ AP — AULAS PRÁTICAS (da PROAC)

   Pedido de coordenadores de curso, ago/2026. O professor registra a aula
   prática que deu; a coordenação do curso — ou a pedagógica — valida; e o
   processo TERMINA AÍ. A PROPPEX é suporte: tem alcance total para
   destravar o que emperrar, mas não é um degrau do fluxo. Em todos os
   outros setores a pró-reitoria homologa; aqui não, e é de propósito.

   Quem é quem (ver lib/praticas.js): gestor geral e coordenação do módulo
   `praticas` (a pedagógica) veem tudo; o coordenador DE CURSO vê o seu
   curso — e essa figura não existia no ARCHÉ, porque `modulosDe` é por
   módulo, não por curso: ela vive no cadastro do próprio módulo.
   ======================================================================== */
const gerePraticas = (u) => !!u && (u.papel === "gestor" || u.modulos?.includes("praticas"));

async function lerPraticas() {
  const raw = await storage.get(AP_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function lerCadastroAP() {
  const raw = await storage.get(AP_CADASTRO_KEY);
  return normalizarCadastroAP(raw ? JSON.parse(raw) : {});
}
async function lerEquipeAP() {
  const raw = await storage.get(AP_EQUIPE_KEY);
  return normalizarEquipeAP(raw ? JSON.parse(raw) : {});
}

/* Fila serializada, como em toda base do ARCHÉ: dois professores gravando
   no mesmo segundo só se enxergam dentro dela. */
let filaAP = Promise.resolve();
function comPraticas(fn) {
  const proxima = filaAP.then(async () => {
    const lista = await lerPraticas();
    const r = await fn(lista);
    if (r?.gravar !== false) {
      await storage.set(AP_KEY, JSON.stringify(lista));
      await storage.flush?.();
    }
    return r;
  });
  filaAP = proxima.catch(() => {});
  return proxima;
}

/** Protocolo AP-AAAA-NNN (aula prática) ou EC-AAAA-NNN (extensão curricular),
    emitido no envio e nunca repetido. São DUAS séries: os dois documentos vão
    a lugares diferentes e se contam à parte, e um protocolo que não diz de
    qual deles se trata obriga a abrir o registro para saber. */
async function novoProtocoloAP(tipo = "pratica") {
  const ext = apTipoDe(tipo).codigo === "extensao";
  const ano = Number(hojeLocalISO().slice(0, 4));
  const raw = await storage.get("ap-config-v1");
  let cfg = raw ? JSON.parse(raw) : { ano, seq: 0 };
  if (cfg.ano !== ano) cfg = { ano, seq: 0, seqEc: 0 };
  const chave = ext ? "seqEc" : "seq";
  cfg[chave] = (Number(cfg[chave]) || 0) + 1;
  await storage.set("ap-config-v1", JSON.stringify(cfg));
  return `${ext ? "EC" : "AP"}-${ano}-${String(cfg[chave]).padStart(3, "0")}`;
}

/** Quem é a pessoa DENTRO do módulo: junta a sessão com o cadastro dele. */
async function quemAP(u) {
  return quemNoModuloAP({ email: u.email, gestao: gerePraticas(u) }, await lerEquipeAP());
}

/** A sessão do setor. Conta pendente não entra: aqui não há convite nominal
    (o professor é cadastrado pela coordenação, com conta já aprovada). */
async function sessaoAP(req, res) {
  const u = await usuarioDe(req, res);
  if (!u) { res.status(401).json({ error: "Faça login para acessar as aulas práticas." }); return null; }
  if (u.papel === "pendente") { res.status(403).json({ error: "Seu acesso ainda não foi liberado." }); return null; }
  return (await verComoUsuario(req, u, gerePraticas(u))) || u;
}

/* A COORDENAÇÃO DO AP sobe do disco no arranque (a planilha entregue pelo
   dono, ago/2026). A marca `sys-ap-equipe-lote-*` faz a semeadura acontecer
   UMA vez: sem ela, todo deploy desfaria o que a gestão tivesse mudado na
   guia Coordenação — o arquivo é o ponto de partida, não a verdade
   permanente.

   A planilha traz DUAS pessoas por curso, o coordenador e o coordenador
   pedagógico, e as duas validam: foi assim que o fluxo foi descrito. Por
   isso ambas entram em `coordenadores` daquele curso, e a lista
   `pedagogico` — que é a coordenação INSTITUCIONAL, com alcance sobre todos
   os cursos — fica vazia. Aqui o pedagógico é por curso.

   Os nomes vão junto para os PERFIS que ainda não existem: sem nome, o
   documento sairia com o e-mail no lugar de quem assina. Perfil já
   preenchido nunca se sobrescreve. */
const AP_EQUIPE_LOTE = "sys-ap-equipe-lote-v1";

async function subirEquipeAP() {
  try {
    if (await storage.get(AP_EQUIPE_LOTE)) return;
    const caminho = path.join(__dirname, "dados", "ap-coordenadores.json");
    if (!existsSync(caminho)) return;
    const lote = JSON.parse(readFileSync(caminho, "utf8"));
    const cursos = {};
    const pessoas = [];
    for (const [slug, dados] of Object.entries(lote.cursos || {})) {
      const lista = [];
      for (const p of dados.coordenadores || []) {
        const e = String(p.email || "").trim().toLowerCase();
        if (!e) continue;
        const nome = String(p.nome || "").trim();
        lista.push({ email: e, nome, papel: p.papel === "pedagogico" ? "pedagogico" : "coordenador" });
        pessoas.push({ email: e, nome, curso: slug });
      }
      if (lista.length) cursos[slug] = { coordenadores: lista };
    }
    const equipe = normalizarEquipeAP({ pedagogico: [], cursos });
    await storage.set(AP_EQUIPE_KEY, JSON.stringify(equipe));

    // o perfil de quem ainda não tem: nome e curso, sem tocar no que existe
    const perfis = await carregarPerfis();
    let novos = 0;
    for (const p of pessoas) {
      const atual = perfis[p.email] || {};
      if (String(atual.nome || "").trim()) continue;
      perfis[p.email] = { ...atual, nome: p.nome,
        curso: atual.curso || cursoDe(p.curso)?.nome || "",
        funcao: atual.funcao || "coord-curso",
        preCadastro: true, criadoEm: atual.criadoEm || new Date().toISOString() };
      novos++;
    }
    if (novos) await storage.set(PERFIS_KEY, JSON.stringify(perfis));

    // conta nova entra aprovada no primeiro login, mas a coordenação não pode
    // depender disso: quem valida relatório precisa entrar sem esperar nada
    const usuarios = await carregarUsuarios(storage);
    const remover = new Set(usuarios.removidos || []);
    usuarios.aprovados = [...new Set([...usuarios.aprovados,
      ...pessoas.map((p) => p.email).filter((e) => !remover.has(e))])];
    await salvarUsuarios(storage, usuarios);

    await storage.set(AP_EQUIPE_LOTE, JSON.stringify({ em: new Date().toISOString(), lote: lote.lote }));
    await storage.flush?.();
    console.log(`[praticas] coordenação semeada: ${Object.keys(cursos).length} curso(s), `
      + `${new Set(pessoas.map((p) => p.email)).size} pessoa(s), ${novos} perfil(is) criado(s).`);
  } catch (e) {
    console.error("[praticas] não foi possível semear a coordenação:", e.message);
  }
}

/* PROFESSORES E DISCIPLINAS do arquivo — as listas que as coordenações
   enviam, uma por curso. A marca é POR CURSO (`sys-ap-prof-<sem>-<curso>`) e
   não por lote: é assim que elas podem chegar aos poucos, conforme cada
   coordenação manda. Acrescentar um curso ao arquivo o semeia no próximo
   deploy, sem tocar nos que já entraram — e sem NUNCA sobrescrever o que a
   coordenação já cadastrou pela tela: o arquivo é o ponto de partida, e quem
   manda depois é a guia Professores e Disciplinas.

   Titulação, telefone e matrícula vão para o PERFIL de quem ainda não tem: a
   planilha os traz, e sem eles a pessoa é barrada na etapa de completar o
   cadastro justamente no dia em que vai registrar a primeira aula. O CPF não
   vem na planilha e continua sendo pedido a cada um — é único por conta, e
   ninguém o informa por outro. */
async function subirProfessoresAP() {
  try {
    const caminho = path.join(__dirname, "dados", "ap-professores.json");
    if (!existsSync(caminho)) return;
    const lote = JSON.parse(readFileSync(caminho, "utf8"));
    const semestre = String(lote.semestre || "");
    if (!/^\d{4}\/[12]$/.test(semestre)) return;

    const cadastro = await lerCadastroAP();
    const perfis = await carregarPerfis();
    const usuarios = await carregarUsuarios(storage);
    const removidos = new Set(usuarios.removidos || []);
    let mexeuCadastro = false, novosPerfis = 0;
    const aprovar = [];

    for (const [curso, dados] of Object.entries(lote.cursos || {})) {
      const marca = `sys-ap-prof-${semestre.replace("/", "-")}-${curso}`;
      if (await storage.get(marca)) continue;
      if (!cursoDe(curso)) { console.warn(`[praticas] curso desconhecido no lote: ${curso}`); continue; }
      const lista = (dados.professores || []).filter((p) => p?.email && p?.nome);
      if (!lista.length) continue;

      cadastro[semestre] = cadastro[semestre] || {};
      const jaTem = new Set((cadastro[semestre][curso]?.professores || [])
        .map((p) => String(p.email || "").toLowerCase()));
      cadastro[semestre][curso] = { professores: [
        ...(cadastro[semestre][curso]?.professores || []),
        ...lista.filter((p) => !jaTem.has(String(p.email).toLowerCase()))
          .map((p) => ({ email: String(p.email).toLowerCase(), nome: p.nome,
            disciplinas: p.disciplinas || [] })),
      ] };
      mexeuCadastro = true;

      for (const p of lista) {
        const e = String(p.email).toLowerCase();
        if (!removidos.has(e)) aprovar.push(e);
        const atual = perfis[e] || {};
        // completa o que falta, e só isso: o que a pessoa preencheu manda
        const antes = JSON.stringify(atual);
        perfis[e] = {
          ...atual,
          nome: atual.nome || p.nome,
          funcao: atual.funcao || "professor",
          curso: atual.curso || cursoDe(curso)?.nome || "",
          titulacao: atual.titulacao || p.titulacao || "",
          telefone: atual.telefone || p.telefone || "",
          matricula: atual.matricula || p.matricula || "",
          preCadastro: atual.nome ? atual.preCadastro : true,
          criadoEm: atual.criadoEm || new Date().toISOString(),
        };
        if (JSON.stringify(perfis[e]) !== antes) novosPerfis++;
      }
      await storage.set(marca, JSON.stringify({ em: new Date().toISOString(),
        lote: lote.lote, quantos: lista.length }));
      console.log(`[praticas] ${lista.length} professor(es) de ${curso} em ${semestre}.`);
    }

    if (!mexeuCadastro) return;
    await storage.set(AP_CADASTRO_KEY, JSON.stringify(normalizarCadastroAP(cadastro)));
    if (novosPerfis) await storage.set(PERFIS_KEY, JSON.stringify(perfis));
    if (aprovar.length) {
      usuarios.aprovados = [...new Set([...usuarios.aprovados, ...aprovar])];
      await salvarUsuarios(storage, usuarios);
    }
    await storage.flush?.();
  } catch (e) {
    console.error("[praticas] não foi possível semear os professores:", e.message);
  }
}

/** GET /api/praticas — tudo o que a tela precisa para abrir. */
app.get("/api/praticas", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    const quem = await quemAP(u);
    const [todos, cadastro, equipe] = await Promise.all([lerPraticas(), lerCadastroAP(), lerEquipeAP()]);
    const perfil = (await carregarPerfis())[u.email] || {};
    const semestre = String(req.query?.semestre || "") || semestreCorrente();
    const meus = todos.filter((r) => apPodeVer(r, quem)).map((r) => apVisao(r, quem));
    // os semestres que EXISTEM: os do cadastro, os dos relatórios e o corrente
    const semestres = [...new Set([
      semestreCorrente(), ...Object.keys(cadastro), ...todos.map((r) => r.semestre),
    ].filter(Boolean))].sort().reverse();
    res.json({
      eu: u.email, nome: perfil.nome || u.nome || "",
      papel: quem.gestao ? "gestao" : (quem.cursos.length ? "coordenador" : "professor"),
      gestao: quem.gestao, pedagogico: quem.pedagogico, cursos: quem.cursos,
      semestre, semestres, semestreCorrente: semestreCorrente(),
      catalogoCursos: CURSOS.map((c) => ({ slug: c.slug, nome: c.nome })),
      campos: AP_CAMPOS, minFotos: AP_MIN_FOTOS, papeisCoordenacao: AP_PAPEIS_COORD,
      // os dois tipos de relatório e os campos de cada um: a tela desenha o
      // formulário DAQUI, e é o mesmo catálogo que o servidor confere
      tipos: AP_TIPOS, camposPorTipo: Object.fromEntries(AP_TIPOS.map((t) => [t.codigo, apCamposDo(t.codigo)])),
      maxEvidencias: AP_MAX_EVID,
      relatorios: meus,
      // o professor recebe as SUAS disciplinas do semestre — é a lista que o
      // formulário oferece; a coordenação recebe o cadastro do que gere
      minhasDisciplinas: apMinhasDisciplinas(cadastro, semestre, u.email),
      meuCurso: apCursoDoProfessor(cadastro, semestre, u.email),
      ...(quem.gestao || quem.cursos.length
        ? {
          cadastro: recorteDoCadastroAP(cadastro, quem),
          equipe: quem.gestao ? equipe : { cursos: {}, pedagogico: [] },
          panorama: apPanorama(meus, cadastro, { semestre, curso: quem.gestao ? "" : quem.cursos[0] || "" }),
        }
        : {}),
      ...(gerePraticas(euReal(req, u))
        ? { pessoas: await pessoasDoAP(cadastro, equipe, euReal(req, u)), verComo: String(req.query?.como || "") }
        : {}),
    });
  } catch (e) {
    console.error("Erro ao abrir as aulas práticas:", e);
    res.status(500).json({ error: "Não foi possível carregar o setor agora." });
  }
});

/** O cadastro que ESTA pessoa pode ver: a gestão vê tudo, o coordenador o
    curso dele. Não é sigilo de dado sensível — é recorte de trabalho. */
function recorteDoCadastroAP(cadastro, quem) {
  if (quem.gestao) return cadastro;
  const out = {};
  for (const [sem, cursos] of Object.entries(cadastro)) {
    for (const slug of quem.cursos) {
      if (cursos[slug]) { out[sem] = out[sem] || {}; out[sem][slug] = cursos[slug]; }
    }
  }
  return out;
}

/** As pessoas do setor, para o "Ver como" da gestão. */
async function pessoasDoAP(cadastro, equipe, u) {
  const prof = [], coord = [];
  for (const sem of Object.keys(cadastro)) {
    for (const p of apProfessoresDoSemestre(cadastro, sem)) prof.push({ email: p.email, nome: p.nome });
  }
  for (const [slug, v] of Object.entries(equipe.cursos || {})) {
    for (const e of v.coordenadores) coord.push({ email: e, nome: "", detalhe: slug });
  }
  for (const e of equipe.pedagogico || []) coord.push({ email: e, nome: "", detalhe: "pedagógico" });
  return pessoasParaVerComo({ professor: prof, coordenador: coord }, u);
}

/** POST /api/praticas — cria ou atualiza o relatório (rascunho/devolvido). */
app.post("/api/praticas", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const cadastro = await lerCadastroAP();
    const perfil = (await carregarPerfis())[u.email] || {};
    const b = req.body || {};
    const id = String(b.id || "");
    const r = await comPraticas((lista) => {
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) {
        /* Relatório NOVO. Só quem está no cadastro do semestre registra: sem
           isso, o "disciplinas sem relatório" do painel não teria denominador
           — e um relatório de alguém que não leciona não tem coordenação a
           quem ir. A gestão inclui em nome de quem for preciso.

           A EXCEÇÃO é o SEMESTRE ANTERIOR (pedido do dono, ago/2026: "alguns
           professores vão lançar relatórios de semestres anteriores, mas
           esses não estão cadastrados no sistema"): cadastro de semestre
           passado não existe e não vai existir — recusar deixaria a aula
           dada fora da prestação de contas. Para aula cuja DATA cai em
           semestre já encerrado, a disciplina entra digitada à mão e o CURSO
           vem do formulário, conferido no catálogo (é ele que decide a qual
           coordenação o relatório vai — sem curso válido não há quem
           valide). O relatório sai marcado `foraDoCadastro`, para a
           coordenação saber que a disciplina não veio do cadastro. */
        const semestre = semestreDe(String(b.data || "")) || semestreCorrente();
        const minhas = apMinhasDisciplinas(cadastro, semestre, u.email);
        const curso = apCursoDoProfessor(cadastro, semestre, u.email);
        const retroativo = /^\d{4}\/[12]$/.test(semestre) && semestre < semestreCorrente();
        /* A EXTENSÃO CURRICULAR não depende do cadastro (pedido do dono,
           ago/2026): o cadastro do semestre foi feito para as AULAS PRÁTICAS,
           e a disciplina que curriculariza extensão pode não estar nele —
           inclusive porque a lista de quem deve relatório de CE ainda está
           sendo levantada por curso. Nela a inclusão é sempre MANUAL: o
           professor digita a disciplina e ESCOLHE O CURSO, e é esse curso que
           decide a coordenação que valida. Na aula prática a régua não muda:
           quem manda é o cadastro, e o registro retroativo é a exceção. */
        const ehCE = apTipoDe(b.tipo).codigo === "extensao";
        if (!minhas.length && !quem.gestao && !retroativo && !ehCE) {
          return { erro: [403, `Você ainda não está no cadastro de ${semestre}. `
            + "A coordenação do curso inclui professores e disciplinas na guia "
            + "“Professores e Disciplinas”. Para registrar aula de SEMESTRE "
            + "ANTERIOR, informe no formulário a data da aula daquele semestre "
            + "— o registro retroativo aceita a disciplina digitada à mão."], gravar: false };
        }
        // na CE o curso vem SEMPRE do formulário: o do cadastro (das aulas
        // práticas) pode não ser o da disciplina que curriculariza
        let cursoNovo = (ehCE ? String(b.curso || "").trim() : "") || curso || String(b.curso || "").trim();
        if (!CURSOS.some((c) => c.slug === cursoNovo)) {
          return { erro: [400, "Escolha o curso da disciplina: é ele que define a "
            + "coordenação que valida este relatório."], gravar: false };
        }
        const novo = normalizarRelatorioAP(b, { base: {
          id: `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          curso: cursoNovo,
          // o TIPO se fixa aqui e não muda depois: é ele que escolhe os
          // campos cobrados e a coluna em que a atividade conta
          tipo: apTipoDe(b.tipo).codigo,
          // a marca é do servidor: disciplina que não está no cadastro do
          // semestre entrou à mão, e a coordenação precisa ver isso
          foraDoCadastro: !minhas.some((d) => d.disciplina === String(b.disciplina || "").trim()),
          professor: { email: u.email, nome: perfil.nome || u.nome || "" },
          criadoPor: u.email,
        } });
        lista.push(novo);
        apAnotar(novo, { acao: "Relatório criado", por: u.email });
        return { relatorio: novo };
      }
      const atual = lista[i];
      if (!apPodeEditar(atual, quem)) {
        return { erro: [403, atual.status === "validado"
          ? "Relatório validado — não se edita o que a coordenação já validou."
          : "Só o professor que registrou edita este relatório."], gravar: false };
      }
      /* O CURSO é de quem grava, não do formulário: é ele que decide a qual
         coordenação o relatório vai. Deixá-lo vir no payload permitiria ao
         professor mudar de fila — mandar o relatório a um coordenador que
         não o conhece, ou tirá-lo do que deveria validá-lo. Mesma doutrina
         do número da ação e da situação na Extensão: campo de fluxo vem do
         que está gravado. A gestão, que é o suporte, muda. */
      const corpo = quem.gestao ? b : { ...b, curso: atual.curso };
      lista[i] = normalizarRelatorioAP(corpo, { base: atual });
      return { relatorio: lista[i] };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, relatorio: apVisao(r.relatorio, quem),
      falta: apFalta(r.relatorio, { hoje: hojeLocalISO() }) });
  } catch (e) {
    console.error("Erro ao gravar o relatório de aula prática:", e);
    res.status(500).json({ error: "Não foi possível gravar agora." });
  }
});

/** POST /api/praticas/:id/enviar — emite o protocolo e manda à coordenação. */
app.post("/api/praticas/:id/enviar", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const r = await comPraticas(async (lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !apPodeVer(p, quem)) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (!apPodeEditar(p, quem))
        return { erro: [403, "Este relatório não está aberto para envio."], gravar: false };
      // a régua é UMA só, e é a mesma da tela: diz TUDO o que falta de uma vez
      const falta = apFalta(p, { hoje: hojeLocalISO() });
      if (falta.length) return { erro: [400, falta.join(" · ")], gravar: false, falta };
      if (!p.protocolo) p.protocolo = await novoProtocoloAP(p.tipo);
      p.status = "enviado";
      p.enviadoEm = new Date().toISOString();
      p.parecer = null;                       // reenvio limpa o parecer anterior
      apAnotar(p, { acao: "Relatório enviado à coordenação", por: u.email,
        detalhe: `${p.protocolo} · ${p.disciplina} · aula de ${p.data}` });
      return { relatorio: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1], falta: r.falta || [] });
    avisarPraticas(r.relatorio, "enviado").catch(() => {});
    res.json({ ok: true, relatorio: apVisao(r.relatorio, quem) });
  } catch (e) {
    console.error("Erro ao enviar o relatório de aula prática:", e);
    res.status(500).json({ error: "Não foi possível enviar agora." });
  }
});

/** POST /api/praticas/:id/validar — o ato da coordenação, e o fim do fluxo. */
app.post("/api/praticas/:id/validar", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const decisao = String(req.body?.decisao || "");
    if (!AP_DECISOES.includes(decisao))
      return res.status(400).json({ error: "Decisão inválida." });
    const comentario = String(req.body?.comentario || "").trim().slice(0, 2000);
    // devolver sem dizer o que corrigir devolve o problema, não a solução —
    // e reprovar sem motivo encerra o processo sem nada que o explique
    if (decisao === "devolvido" && !comentario)
      return res.status(400).json({ error: "Escreva o que precisa ser corrigido — é o que o professor vai ler." });
    if (decisao === "reprovado" && !comentario)
      return res.status(400).json({ error: "Escreva o motivo da reprovação — é o registro da decisão e o que o professor vai ler." });
    const perfil = (await carregarPerfis())[u.email] || {};
    const r = await comPraticas((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !apPodeVer(p, quem)) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (!apPodeValidar(p, quem)) {
        return { erro: [403, p.status !== "enviado"
          ? "Só se valida relatório enviado."
          : "A validação é da coordenação do curso — e ninguém valida o próprio relatório."], gravar: false };
      }
      /* A PROAC e a PROPPEX decidem NO LUGAR da coordenação do curso (pedido
         da PROAC, ago/2026) — e o ato fica marcado, no parecer e no
         histórico: quem lê o documento meses depois precisa saber que ali
         não foi a coordenação do curso que assinou. O processo continua
         terminando no coordenador: não há degrau depois deste. */
      const noLugar = apDecisaoNoLugar(p, quem);
      p.status = decisao;
      p.parecer = { decisao, comentario, por: u.email,
        nome: perfil.nome || u.nome || "", em: new Date().toISOString(),
        ...(noLugar ? { noLugarDaCoordenacao: true } : {}) };
      apAnotar(p, {
        acao: { validado: "Relatório validado", devolvido: "Relatório devolvido",
          reprovado: "Relatório reprovado" }[decisao]
          + (noLugar ? " — pela PROAC/PROPPEX, no lugar da coordenação do curso" : ""),
        por: u.email, detalhe: comentario.slice(0, 200) });
      return { relatorio: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    avisarPraticas(r.relatorio, decisao).catch(() => {});
    res.json({ ok: true, relatorio: apVisao(r.relatorio, quem) });
  } catch (e) {
    console.error("Erro ao validar o relatório de aula prática:", e);
    res.status(500).json({ error: "Não foi possível registrar a decisão." });
  }
});

/** POST /api/praticas/:id/reabrir — a PROAC e a PROPPEX desfazem a decisão.

    Pedido da PROAC (ago/2026): "ambos podem reabrir processos caso notem
    irregularidades". Reabrir NÃO decide — devolve o relatório ao ponto do
    fluxo em que a decisão ainda pode ser tomada, e o processo continua
    terminando na COORDENAÇÃO do curso. Para onde ele volta é escolha de quem
    reabre, porque são dois problemas diferentes: `enviado` recoloca o
    relatório na fila da coordenação (a irregularidade está na DECISÃO),
    `devolvido` o devolve ao professor (a irregularidade está no RELATÓRIO).
    O motivo é obrigatório: desfazer um ato registrado sem dizer por quê
    deixaria o histórico sem o que explica a reabertura. */
app.post("/api/praticas/:id/reabrir", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const para = String(req.body?.para || "enviado");
    if (!["enviado", "devolvido"].includes(para))
      return res.status(400).json({ error: "Escolha para onde o relatório volta: coordenação ou professor." });
    const motivo = String(req.body?.motivo || "").trim().slice(0, 2000);
    if (!motivo)
      return res.status(400).json({ error: "Escreva o motivo da reabertura — é o que fica no histórico do processo." });
    const perfil = (await carregarPerfis())[u.email] || {};
    const r = await comPraticas((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !apPodeVer(p, quem)) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (!apPodeReabrir(p, quem)) {
        return { erro: [403, ["validado", "reprovado"].includes(p.status)
          ? "Reabrir é da PROAC e da PROPPEX."
          : "Este processo não está encerrado — não há o que reabrir."], gravar: false };
      }
      const anterior = p.status;
      p.status = para;
      // o parecer anterior fica no histórico do relatório, não no campo
      // vigente: ele não vale mais, e mantê-lo faria a tela mostrar uma
      // decisão que foi desfeita
      p.parecer = { decisao: "reaberto", comentario: motivo, por: u.email,
        nome: perfil.nome || u.nome || "", em: new Date().toISOString(),
        reabertoDe: anterior, para };
      apAnotar(p, {
        acao: `Processo reaberto (estava ${AP_ROTULO_STATUS[anterior] || anterior}) — volta para `
          + (para === "enviado" ? "a coordenação do curso" : "o professor"),
        por: u.email, detalhe: motivo.slice(0, 200),
      });
      return { relatorio: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    avisarPraticas(r.relatorio, "reaberto").catch(() => {});
    res.json({ ok: true, relatorio: apVisao(r.relatorio, quem) });
  } catch (e) {
    console.error("Erro ao reabrir o relatório:", e);
    res.status(500).json({ error: "Não foi possível reabrir." });
  }
});

/** POST /api/praticas/:id/foto — o registro fotográfico, pela rota própria.
    A imagem NUNCA viaja no corpo do formulário: vai ao Drive e no registro
    fica só a referência (a mesma regra do portfólio e das artes do evento). */
app.post("/api/praticas/:id/foto", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    /* Duas listas na MESMA rota: a FOTO, que comprova a realização e tem
       mínimo, e a EVIDÊNCIA, que é o documento anexo do modelo da PROAC
       (lista de presença, folder, cartilha, avaliação da comunidade) e nunca
       é obrigatória. A foto continua tendo de ser imagem; a evidência aceita
       também PDF e documento — é o que o modelo chama de anexo. */
    const evidencia = String(req.body?.campo || "") === "evidencia";
    if (!evidencia && !/^image\//.test(req.file.mimetype || ""))
      return res.status(400).json({ error: "O registro é fotográfico — envie uma imagem." });
    if (req.file.size > 8 * 1024 * 1024)
      return res.status(400).json({ error: "Arquivo muito grande — até 8 MB." });
    const quem = await quemAP(u);
    const pre = (await lerPraticas()).find((x) => x.id === req.params.id);
    if (!pre || !apPodeVer(pre, quem)) return res.status(404).json({ error: "Relatório não encontrado." });
    if (!apPodeEditar(pre, quem)) return res.status(403).json({ error: "Este relatório não está aberto." });
    const cheia = evidencia
      ? (pre.evidencias || []).length >= AP_MAX_EVID
      : (pre.fotos || []).length >= AP_MAX_FOTOS;
    if (cheia) {
      return res.status(400).json({ error: evidencia
        ? `Até ${AP_MAX_EVID} evidências por relatório.` : `Até ${AP_MAX_FOTOS} fotos por relatório.` });
    }
    // sobe ao Drive FORA da fila (é lento e não altera o estado)
    const data = await files.save({
      buffer: req.file.buffer, originalName: req.file.originalname,
      prefix: `${REPO}/${apEhExtensao(pre) ? "Extensão Curricular" : "Aulas Práticas"}/${slug(pre.curso || "geral")}/${pre.semestre.replace("/", "-")}/${slug(pre.protocolo || pre.id)}`,
    });
    const anexo = normalizarFotoAP({ ...data, tipo: req.file.mimetype, tamanho: req.file.size });
    const r = await comPraticas((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (!apPodeEditar(p, quem)) return { erro: [403, "Este relatório não está aberto."], gravar: false };
      if (evidencia) p.evidencias = [...(p.evidencias || []), anexo].slice(0, AP_MAX_EVID);
      else p.fotos = [...(p.fotos || []), anexo].slice(0, AP_MAX_FOTOS);
      p.atualizadoEm = new Date().toISOString();
      return { fotos: p.fotos, evidencias: p.evidencias, relatorio: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, fotos: r.fotos, evidencias: r.evidencias,
      falta: apFalta(r.relatorio, { hoje: hojeLocalISO() }) });
  } catch (e) {
    console.error("Erro ao anexar a foto da aula prática:", e);
    res.status(500).json({ error: "Não foi possível anexar a foto." });
  }
});

/** DELETE /api/praticas/:id/foto/:fileId — tirar a que entrou errada. */
app.delete("/api/praticas/:id/foto/:fileId", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const r = await comPraticas((lista) => {
      const p = lista.find((x) => x.id === req.params.id);
      if (!p || !apPodeVer(p, quem)) return { erro: [404, "Relatório não encontrado."], gravar: false };
      if (!apPodeEditar(p, quem)) return { erro: [403, "Este relatório não está aberto."], gravar: false };
      // a mesma rota tira das duas listas: o id do arquivo é único, e
      // procurar nas duas evita uma segunda rota que faria a mesma coisa
      p.fotos = (p.fotos || []).filter((f) => f.fileId !== req.params.fileId);
      p.evidencias = (p.evidencias || []).filter((f) => f.fileId !== req.params.fileId);
      p.atualizadoEm = new Date().toISOString();
      return { fotos: p.fotos, evidencias: p.evidencias, relatorio: p };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, fotos: r.fotos, evidencias: r.evidencias,
      falta: apFalta(r.relatorio, { hoje: hojeLocalISO() }) });
  } catch (e) {
    console.error("Erro ao remover a foto:", e);
    res.status(500).json({ error: "Não foi possível remover." });
  }
});

/** DELETE /api/praticas/:id — apagar o rascunho que nasceu errado. */
app.delete("/api/praticas/:id", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const r = await comPraticas((lista) => {
      const i = lista.findIndex((x) => x.id === req.params.id);
      if (i < 0 || !apPodeVer(lista[i], quem)) return { erro: [404, "Relatório não encontrado."], gravar: false };
      // só rascunho se apaga: o que foi enviado tem protocolo, e protocolo
      // emitido não se apaga — devolve-se
      if (lista[i].status !== "rascunho" && !quem.gestao)
        return { erro: [400, "Só rascunho se apaga. O que já foi enviado, a coordenação devolve."], gravar: false };
      lista.splice(i, 1);
      return { ok: true };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao apagar o relatório:", e);
    res.status(500).json({ error: "Não foi possível apagar." });
  }
});

/* --------------------- o cadastro de professores e disciplinas ----------
   Refeito a cada semestre, à mão, pela coordenação. É ele que dá o
   DENOMINADOR do painel: sem a lista, "disciplina sem relatório" não
   existe, e o dashboard vira uma contagem sem régua.
   ---------------------------------------------------------------------- */
app.post("/api/praticas/cadastro", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const semestre = String(req.body?.semestre || "");
    const curso = String(req.body?.curso || "");
    if (!/^\d{4}\/[12]$/.test(semestre)) return res.status(400).json({ error: "Informe o semestre." });
    if (!apCoordenaCurso(quem, curso))
      return res.status(403).json({ error: "Você não coordena este curso." });
    const cadastro = await lerCadastroAP();
    cadastro[semestre] = cadastro[semestre] || {};
    cadastro[semestre][curso] = { professores: Array.isArray(req.body?.professores) ? req.body.professores : [] };
    const limpo = normalizarCadastroAP(cadastro);
    await storage.set(AP_CADASTRO_KEY, JSON.stringify(limpo));
    await storage.flush?.();
    res.json({ ok: true, cadastro: recorteDoCadastroAP(limpo, quem) });
  } catch (e) {
    console.error("Erro ao gravar o cadastro de aulas práticas:", e);
    res.status(500).json({ error: "Não foi possível gravar o cadastro." });
  }
});

/** Copiar o cadastro do semestre anterior — o semestre novo raramente
    recomeça do zero, e redigitar quarenta professores é o que faz a
    coordenação desistir de manter a lista em dia. */
app.post("/api/praticas/cadastro/copiar", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    const destino = String(req.body?.semestre || "");
    const curso = String(req.body?.curso || "");
    if (!/^\d{4}\/[12]$/.test(destino)) return res.status(400).json({ error: "Informe o semestre." });
    if (!apCoordenaCurso(quem, curso)) return res.status(403).json({ error: "Você não coordena este curso." });
    const origem = String(req.body?.de || "") || semestreAnterior(destino);
    const cadastro = await lerCadastroAP();
    const antes = cadastro[origem]?.[curso]?.professores || [];
    if (!antes.length)
      return res.status(404).json({ error: `Não há cadastro de ${origem} neste curso para copiar.` });
    cadastro[destino] = cadastro[destino] || {};
    // não sobrescreve quem já foi incluído no semestre novo
    const jaTem = new Set((cadastro[destino][curso]?.professores || []).map((p) => String(p.email || "").toLowerCase()));
    cadastro[destino][curso] = { professores: [
      ...(cadastro[destino][curso]?.professores || []),
      ...antes.filter((p) => !jaTem.has(String(p.email || "").toLowerCase())),
    ] };
    const limpo = normalizarCadastroAP(cadastro);
    await storage.set(AP_CADASTRO_KEY, JSON.stringify(limpo));
    await storage.flush?.();
    res.json({ ok: true, copiados: antes.length, de: origem,
      cadastro: recorteDoCadastroAP(limpo, quem) });
  } catch (e) {
    console.error("Erro ao copiar o cadastro:", e);
    res.status(500).json({ error: "Não foi possível copiar." });
  }
});

/** Quem coordena o quê — só o gestor geral e a coordenação do módulo. */
app.post("/api/praticas/equipe", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    if (!gerePraticas(u))
      return res.status(403).json({ error: "Designar coordenação é da PROAC e da PROPPEX." });
    const equipe = normalizarEquipeAP(req.body?.equipe || {});
    await storage.set(AP_EQUIPE_KEY, JSON.stringify(equipe));
    await storage.flush?.();
    res.json({ ok: true, equipe });
  } catch (e) {
    console.error("Erro ao gravar a equipe das aulas práticas:", e);
    res.status(500).json({ error: "Não foi possível gravar." });
  }
});

/** GET /api/praticas/panorama — o dashboard do semestre. */
app.get("/api/praticas/panorama", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    const quem = await quemAP(u);
    if (!quem.gestao && !quem.cursos.length)
      return res.status(403).json({ error: "O painel é da coordenação." });
    const [todos, cadastro] = await Promise.all([lerPraticas(), lerCadastroAP()]);
    const semestre = String(req.query?.semestre || "") || semestreCorrente();
    const curso = String(req.query?.curso || "") || (quem.gestao ? "" : quem.cursos[0] || "");
    if (curso && !apCoordenaCurso(quem, curso))
      return res.status(403).json({ error: "Você não coordena este curso." });
    const meus = todos.filter((r) => apPodeVer(r, quem));
    res.json({ ok: true, panorama: apPanorama(meus, cadastro, { semestre, curso }) });
  } catch (e) {
    console.error("Erro no painel das aulas práticas:", e);
    res.status(500).json({ error: "Não foi possível carregar o painel." });
  }
});

/** GET /api/praticas/semestral.pdf — o documento do semestre, da coordenação. */
app.get("/api/praticas/semestral.pdf", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    const quem = await quemAP(u);
    if (!quem.gestao && !quem.cursos.length)
      return res.status(403).send("O relatório semestral é da coordenação.");
    const [todos, cadastro] = await Promise.all([lerPraticas(), lerCadastroAP()]);
    const semestre = String(req.query?.semestre || "") || semestreCorrente();
    const curso = String(req.query?.curso || "") || (quem.gestao ? "" : quem.cursos[0] || "");
    if (curso && !apCoordenaCurso(quem, curso)) return res.status(403).send("Você não coordena este curso.");
    const meus = todos.filter((r) => apPodeVer(r, quem));
    const perfil = (await carregarPerfis())[u.email] || {};
    const institucionais = await assinaturasParaPdf();
    const { gerarRelatorioSemestralPraticasPdf } = await import("./lib/pdf.js");
    const buf = await gerarRelatorioSemestralPraticasPdf({
      semestre, curso: cursoDe(curso)?.nome || "",
      panorama: apPanorama(meus, cadastro, { semestre, curso }),
      relatorios: apFiltrar(meus, { semestre, curso }).filter(AP_ENTREGUE),
      coordenador: { nome: perfil.nome || u.nome || "",
        cargo: quem.pedagogico ? "Coordenação Pedagógica" : `Coordenação do curso${curso ? ` de ${cursoDe(curso)?.nome}` : ""}` },
      assinaturas: {
        // quem EMITE é quem assina — ato da própria sessão, então a
        // digitalizada pela gestão no banco também vale
        coordenador: await assinaturaDeAtoRegistrado(u.email),
        proacademica: institucionais.proacademica, reitor: institucionais.reitor,
      },
      emitidoPor: u.email,
    });
    res.setHeader("Content-Type", "application/pdf");
    arquivarDocumento({ buffer: buf, pasta: `Relatórios/Aulas Práticas/${semestre.replace("/", "-")}`,
      nome: `relatorio-semestral${curso ? `-${slug(curso)}` : "-todos-os-cursos"}.pdf` });
    res.setHeader("Content-Disposition",
      `inline; filename="aulas-praticas-${semestre.replace("/", "-")}${curso ? `-${slug(curso)}` : ""}.pdf"`);
    res.end(buf);
  } catch (e) {
    console.error("Erro no relatório semestral de aulas práticas:", e);
    res.status(500).send("Não foi possível gerar o documento.");
  }
});

/** GET /api/praticas/:id/pdf — o relatório de UMA aula, com as fotos. */
app.get("/api/praticas/:id/pdf", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    const quem = await quemAP(u);
    const p = (await lerPraticas()).find((x) => x.id === req.params.id);
    if (!p || !apPodeVer(p, quem)) return res.status(404).send("Relatório não encontrado.");
    const perfis = await carregarPerfis();
    // as fotos são LIDAS pelo servidor e entregues ao gerador já como bytes
    const fotos = [];
    for (const f of (p.fotos || []).slice(0, AP_MAX_FOTOS)) {
      try {
        const buffer = await files.read?.(f.fileId);
        if (buffer) fotos.push({ nome: f.nome, buffer });
      } catch { /* foto que não abre não derruba o documento */ }
    }
    const coordEmail = p.parecer?.por || "";
    let coordenador = coordEmail
      ? { nome: p.parecer?.nome || perfis[coordEmail]?.nome || "", cargo: "Coordenação do curso" }
      : null;
    /* SEM validação ainda, o NOME de quem valida já se conhece do cadastro
       do curso (achado do dono, ago/2026: o relatório saía com a linha da
       coordenação anônima). O nome identifica quem vai assinar; a
       ASSINATURA continua entrando só depois de validar — assinar o que não
       se validou seria o documento afirmar um ato que não houve. Validando
       outra pessoa (a pedagógica, por exemplo), o documento final sai com o
       nome de quem de fato validou. */
    if (!coordenador) {
      const equipe = await lerEquipeAP();
      const lista = equipe.cursos?.[p.curso]?.coordenadores || [];
      const c = lista.find((x) => x?.papel === "coordenador" && x?.nome) || lista.find((x) => x?.nome);
      if (c) coordenador = { nome: c.nome, cargo: "Coordenação do curso" };
    }
    const { gerarRelatorioAulaPraticaPdf } = await import("./lib/pdf.js");
    const buf = await gerarRelatorioAulaPraticaPdf({
      relatorio: p, curso: cursoDe(p.curso)?.nome || p.curso,
      professor: { nome: p.professor?.nome || perfis[p.professor?.email]?.nome || "" },
      coordenador,
      fotos,
      assinaturas: {
        // atos REGISTRADOS pela própria conta (submeter, validar): vale
        // também a assinatura digitalizada pela gestão no banco
        professor: await assinaturaDeAtoRegistrado(p.professor?.email),
        // a assinatura do coordenador só entra se ele VALIDOU: assinar o que
        // ainda não se validou seria o documento afirmar um ato que não houve
        ...(p.status === "validado" && coordEmail
          ? { coordenador: await assinaturaDeAtoRegistrado(coordEmail) } : {}),
        // as duas institucionais do modelo da PROAC, do banco de assinaturas
        ...(apEhExtensao(p) ? await assinaturasParaPdf() : {}),
      },
    });
    res.setHeader("Content-Type", "application/pdf");
    const pasta = apEhExtensao(p) ? "Extensão Curricular" : "Aulas Práticas";
    arquivarDocumento({ buffer: buf,
      pasta: `${pasta}/${slug(p.curso || "geral")}/${String(p.semestre || "").replace("/", "-")}/${slug(p.protocolo || p.id)}`,
      nome: `relatorio-${slug(p.protocolo || p.id)}.pdf` });
    res.setHeader("Content-Disposition",
      `inline; filename="${apEhExtensao(p) ? "extensao-curricular" : "aula-pratica"}-${slug(p.protocolo || p.id)}.pdf"`);
    res.end(buf);
  } catch (e) {
    console.error("Erro no PDF da aula prática:", e);
    res.status(500).send("Não foi possível gerar o documento.");
  }
});

/* ------------------------------- avisos --------------------------------
   O relatório que chega vai à COORDENAÇÃO DO CURSO (é ela quem valida — o
   fluxo encerra nela, e não numa caixa institucional); o desfecho vai ao
   PROFESSOR. Sem coordenador designado para o curso, o aviso sobe à
   coordenação pedagógica, que é quem cobre a ausência.
   ---------------------------------------------------------------------- */
/* O coordenador do curso E o pedagógico do curso recebem o aviso do relatório
   enviado (pedido do dono, ago/2026 — e o CONSERTO do aviso que existia e não
   chegava: quando a guia Coordenação passou a guardar {email, nome, papel},
   esta lista seguiu devolvendo os OBJETOS, e o mailer recebia um objeto como
   endereço — o envio falhava em silêncio, no catch do avisarPraticas). O
   e-mail se extrai aqui; a forma antiga, só o endereço em texto, segue aceita. */
async function destinatariosDaCoordenacaoAP(curso) {
  const equipe = await lerEquipeAP();
  const emails = (lista) => (lista || [])
    .map((c) => (typeof c === "string" ? c : c?.email || ""))
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const doCurso = emails(equipe.cursos?.[curso]?.coordenadores);
  return doCurso.length ? doCurso : emails(equipe.pedagogico);
}

async function avisarPraticas(r, evento) {
  try {
    const { emailMovimentacaoPratica } = await import("./lib/mailer.js");
    const linhas = [
      ["Professor(a)", r.professor?.nome || r.professor?.email],
      ["Curso", cursoDe(r.curso)?.nome || r.curso],
      ["Disciplina", r.disciplina],
      [apEhExtensao(r) ? "Data da atividade" : "Data da aula", r.data],
      ["Local", r.local],
      ["Protocolo", r.protocolo],
    ];
    if (apEhExtensao(r)) linhas.unshift(["Tipo", "Atividade de extensão curricular"]);
    if (evento === "enviado") {
      const destinos = await destinatariosDaCoordenacaoAP(r.curso);
      if (!destinos.length) {
        console.log(`[praticas] ${r.protocolo || r.id}: sem coordenação cadastrada em ${r.curso} — aviso sem destinatário`);
        return false;
      }
      for (const para of destinos) {
        await enviarAviso("ap-relatorio-enviado", emailMovimentacaoPratica({
          para, assunto: `${apEhExtensao(r) ? "Relatório de extensão curricular" : "Relatório de aula prática"} para validar — ${r.disciplina}`,
          titulo: "Um relatório aguarda a sua validação", linhas }));
      }
      console.log(`[praticas] ${r.protocolo || r.id}: aviso de envio a ${destinos.join(", ")}`);
      /* A marca do aviso que SAIU: é ela que a varredura de reenvio confere.
         Só se grava depois de os envios passarem — falha no meio deixa o
         relatório sem marca, e a varredura da próxima hora tenta de novo. */
      const marcas = JSON.parse((await storage.get(AP_AVISOS_KEY)) || "{}");
      marcas[r.id] = new Date().toISOString();
      await storage.set(AP_AVISOS_KEY, JSON.stringify(marcas));
      return true;
    }
    const para = r.professor?.email;
    if (!para) return;
    /* Quatro desfechos, e cada um diz uma coisa diferente a quem registrou.
       O reaberto é o mais importante de nomear: o professor viu o relatório
       validado e vai reencontrá-lo em aberto — sem o e-mail, ele descobre
       por acaso, se descobrir. */
    const texto = {
      validado: ["Relatório validado", "A coordenação validou o seu relatório", "Observação"],
      devolvido: ["Relatório devolvido", "A coordenação devolveu o seu relatório", "O que corrigir"],
      reprovado: ["Relatório reprovado", "A coordenação reprovou o seu relatório", "Motivo"],
      reaberto: ["Processo reaberto", "A PROAC/PROPPEX reabriu este processo", "Motivo da reabertura"],
    }[evento] || ["Relatório atualizado", "Houve uma decisão sobre o seu relatório", "Observação"];
    await enviarAviso("ap-relatorio-decidido", emailMovimentacaoPratica({
      para,
      assunto: `${texto[0]} — ${r.disciplina}`,
      titulo: texto[1],
      linhas: [...linhas, ["Coordenação", r.parecer?.nome || r.parecer?.por || ""],
        [texto[2], r.parecer?.comentario || ""]],
    }));
  } catch (e) {
    console.error("[praticas] aviso por e-mail não enviado:", e.message);
  }
}

const AP_AVISOS_KEY = "sys-ap-avisos-enviado-v1";

/* O AVISO QUE SE PERDEU SE REENVIA (achado do dono, ago/2026: "a coordenadora
   relatou não ter recebido a notificação assim que o Manoel mandou o
   relatório"): o aviso do envio falhava em silêncio desde que a lista de
   coordenadores passou a guardar {email, nome, papel} — o mailer recebia um
   objeto como endereço —, e aviso perdido não voltava nunca. A varredura
   olha os relatórios parados em "enviado" SEM marca de aviso e reenvia, uma
   vez por relatório: cobre o retroativo (os avisos engolidos pelo defeito) e
   qualquer falha futura de envio — rede, cota, deploy no meio. Relatório já
   validado ou devolvido fica fora: o fluxo dele já andou sem o aviso. */
async function varrerAvisosAP() {
  const lista = await lerPraticas();
  const marcas = JSON.parse((await storage.get(AP_AVISOS_KEY)) || "{}");
  for (const r of lista) {
    if (r.status !== "enviado" || marcas[r.id]) continue;
    try { await avisarPraticas(r, "enviado"); }
    catch (e) { console.error(`[praticas] reenvio do aviso de ${r.protocolo || r.id}:`, e.message); }
  }
}

const COBRANCA_AP_KEY = "sys-ap-cobranca-v1";

/** Um lembrete por professor. Devolve true quando o e-mail saiu. */
async function enviarCobrancaAP(p, mensagem = "") {
  try {
    const { emailLembretePratica } = await import("./lib/mailer.js");
    await enviarAviso("ap-lembrete-semanal", emailLembretePratica({ para: p.email, ...p, mensagem }));
    return true;
  } catch (e) {
    console.error("[praticas] lembrete não enviado a", p.email, e.message);
    return false;
  }
}

/* A COBRANÇA DE SEGUNDA-FEIRA (pedido do dono, ago/2026). A varredura roda
   de hora em hora como as outras, mas o lembrete só sai NA SEGUNDA — e uma
   vez por semana por pessoa, pelo registro. O relógio é o de Brasília, e a
   janela cobre o dia inteiro: numa instância que dorme (plano free), o
   primeiro acesso da segunda é que dispara. */
async function varrerCobrancaAP() {
  const hoje = hojeLocalISO();
  if (!apEhSegunda(hoje)) return { enviadas: 0 };
  const [todos, cadastro] = await Promise.all([lerPraticas(), lerCadastroAP()]);
  const pendentes = apPendenciasCobranca(todos, cadastro, { hoje });
  if (!pendentes.length) return { enviadas: 0 };
  const registro = JSON.parse((await storage.get(COBRANCA_AP_KEY)) || "{}");
  let enviadas = 0;
  for (const p of pendentes) {
    // uma vez por semana por pessoa: reiniciar a instância não reenvia
    if (registro[p.email] === hoje) continue;
    if (await enviarCobrancaAP(p)) { registro[p.email] = hoje; enviadas++; }
  }
  await storage.set(COBRANCA_AP_KEY, JSON.stringify(registro));
  await storage.flush?.();
  if (enviadas) console.log(`[praticas] lembrete de segunda enviado a ${enviadas} professor(es).`);
  return { enviadas };
}

/** GET /api/praticas/:id — a ficha completa. Vem DEPOIS de /panorama e de
    /semestral.pdf: registrada antes, `:id` engoliria as duas. */
app.get("/api/praticas/:id", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    const quem = await quemAP(u);
    const p = (await lerPraticas()).find((x) => x.id === req.params.id);
    if (!p || !apPodeVer(p, quem)) return res.status(404).json({ error: "Relatório não encontrado." });
    res.json({
      relatorio: apVisao(p, quem),
      podeEditar: apPodeEditar(p, quem), podeValidar: apPodeValidar(p, quem),
      falta: apFalta(p, { hoje: hojeLocalISO() }),
    });
  } catch (e) {
    console.error("Erro ao abrir o relatório de aula prática:", e);
    res.status(500).json({ error: "Não foi possível carregar." });
  }
});

/** POST /api/praticas/chamada — a cobrança AGORA, além da de segunda-feira. */
app.post("/api/praticas/chamada", async (req, res) => {
  try {
    const u = await sessaoAP(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const quem = await quemAP(u);
    if (!quem.gestao && !quem.cursos.length)
      return res.status(403).json({ error: "A chamada é da coordenação." });
    const [todos, cadastro] = await Promise.all([lerPraticas(), lerCadastroAP()]);
    const pendentes = apPendenciasCobranca(todos, cadastro, { hoje: hojeLocalISO() })
      .filter((p) => quem.gestao || quem.cursos.includes(p.curso));
    if (req.body?.simular) return res.json({ ok: true, simulacao: true, destinatarios: pendentes });
    let enviados = 0;
    for (const p of pendentes) {
      const ok = await enviarCobrancaAP(p, String(req.body?.mensagem || ""));
      if (ok) enviados++;
    }
    res.json({ ok: true, enviados, total: pendentes.length });
  } catch (e) {
    console.error("Erro na chamada das aulas práticas:", e);
    res.status(500).json({ error: "Não foi possível enviar." });
  }
});

/* ========================================================================
   RELATÓRIO SEMESTRAL DE ATIVIDADES

   Um relatório POR SETOR, por semestre (decisão do dono, ago/2026): o que a
   coordenação leva ao conselho e o que o avaliador do MEC pede é o
   panorama daquele setor naquele período — "as submissões e os projetos de
   monitoria de 2026/2" —, não um documento único que mistura tudo.

   Quem pode emitir é quem gere o setor: o gestor geral, todos; o
   coordenador, o seu. As contas vivem em lib/relatorios.js, testáveis; aqui
   ficam a leitura das bases e o transporte.
   ======================================================================== */
/* `recorte` são os slugs de curso a que o relatório se limita (null = todos):
   é o alcance da coordenação de curso, que vê todas as guias mas só o que é
   do curso dela. O corte é na BASE, antes das contas — assim número, gráfico
   e relação nominal falam do mesmo conjunto, e não há como um deles escapar. */
async function montarPanorama(chave, periodo, recorte = null) {
  const cursos = CURSOS;
  const so = (lista) => filtrarPorCurso(chave, lista, recorte, cursos);
  if (chave === "extensao") return panoramaExtensao(so(await lerAcoes()), periodo, { cursos });
  if (chave === "curricularizacao") {
    // o recorte vai também PARA DENTRO: as horas contadas são as do PPC de
    // quem está olhando, não as de um curso vizinho na mesma ação
    return panoramaCurricularizacaoSemestre(so(await lerAcoes()), periodo, { cursos, recorte });
  }
  if (chave === "eventos") return panoramaEventos(so(await lerAcoes()), periodo, { cursos });
  if (chave === "ic") return panoramaIC(so(await lerProjetos()), periodo, { cursos });
  // o ARQUIVO entra junto: os semestres anteriores a 2026/2 correram fora do
  // ARCHÉ, e é no relatório que a instituição presta contas deles
  if (chave === "monitoria") {
    return panoramaMonitoria(so(await lerMonitorias()), periodo,
      { cursos, arquivo: so(projetosDoArquivoMon(historicoMon)) });
  }
  if (chave === "atas") return panoramaAtas(so(await lerAtas()), periodo, { cursos, orgaos: ORGAOS });
  if (chave === "espacos") return panoramaEspacos(so(await lerReservas()), periodo, { espacos: await lerEspacos() });
  // o cadastro do semestre vai junto: é ele que dá o denominador ("12 de 40
  // disciplinas"), e sem ele o número não se interpreta
  if (chave === "praticas") {
    return panoramaPraticas(so(await lerPraticas()), periodo, { cursos, cadastro: await lerCadastroAP() });
  }
  return null;
}

/* ---------------------- quem abre qual guia ----------------------------
   O alcance vem de TRÊS lugares que se somam (lib/relatorios.js): o gestor
   geral, a coordenação de MÓDULO (a guia do setor dela), a coordenação de
   CURSO (todas as guias, recortadas ao curso) e o que o painel de acessos
   concedeu à mão. O painel é do gestor geral. */
const ACESSOS_REL_KEY = "sys-relatorios-acessos-v1";
async function lerAcessosRelatorios() {
  try { return JSON.parse((await storage.get(ACESSOS_REL_KEY)) || "{}") || {}; } catch { return {}; }
}
async function alcanceDeRelatoriosDe(u) {
  const [acessos, cursosCoordenados] = await Promise.all([
    lerAcessosRelatorios(), cursosQueCoordenaDe(u.email),
  ]);
  return alcanceDeRelatorios(u, { acessos, cursosCoordenados });
}
/* A frase que o documento carrega quando ele NÃO é da instituição inteira:
   um relatório recortado a um curso, sem dizê-lo, seria lido como se fosse o
   panorama de todos — e é ele que vai ao conselho e ao avaliador. */
const notaDoRecorte = (recorte) => (recorte?.length
  ? `Este relatório está recortado ao(s) curso(s): ${recorte.map((c) => nomeDoCurso(c)).join(", ")}. `
    + "Ele não representa o total da instituição no semestre."
  : "");
const nomeDoCurso = (slug) => CURSOS.find((c) => c.slug === slug)?.nome || slug;

/** GET /api/relatorios — o que a tela precisa: setores que a pessoa pode
    relatar e os semestres oferecidos. */
app.get("/api/relatorios", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    const setores = (await alcanceDeRelatoriosDe(u)).map((s) => ({
      ...s, cursosNomes: s.cursos ? s.cursos.map(nomeDoCurso) : null,
    }));
    if (!setores.length) return res.status(403).json({ error: "A emissão é da gestão dos setores." });
    res.json({
      eu: u.email, setores, semestres: semestresDisponiveis(hojeLocalISO(), 10),
      gestorGeral: u.papel === "gestor",
    });
  } catch (e) {
    console.error("Erro ao abrir os relatórios:", e);
    res.status(500).json({ error: "Não foi possível carregar." });
  }
});

/** GET /api/relatorios/panorama?setor=&periodo= — os números, para a tela
    mostrar ANTES de emitir: o documento não é uma surpresa. */
app.get("/api/relatorios/panorama", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    const setor = setorRelatorioDe(req.query?.setor);
    const periodo = periodoDe(req.query?.periodo);
    if (!setor || !periodo) return res.status(400).json({ error: "Informe o setor e o semestre." });
    const meu = (await alcanceDeRelatoriosDe(u)).find((s) => s.chave === setor.chave);
    if (!meu) return res.status(403).json({ error: "Você não tem acesso a esta guia de relatórios." });
    const panorama = await montarPanorama(setor.chave, periodo, meu.cursos);
    if (meu.cursos) panorama.nota = [notaDoRecorte(meu.cursos), panorama.nota].filter(Boolean).join(" ");
    res.json({ setor, periodo, cursos: meu.cursos, panorama });
  } catch (e) {
    console.error("Erro no panorama semestral:", e);
    res.status(500).json({ error: "Não foi possível montar o panorama." });
  }
});

/** GET /api/relatorios/semestral.pdf?setor=&periodo= — o documento. */
app.get("/api/relatorios/semestral.pdf", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).send("Faça login.");
    const setor = setorRelatorioDe(req.query?.setor);
    const periodo = periodoDe(req.query?.periodo);
    if (!setor || !periodo) return res.status(400).send("Informe o setor e o semestre.");
    const meu = (await alcanceDeRelatoriosDe(u)).find((s) => s.chave === setor.chave);
    if (!meu) return res.status(403).send("Você não tem acesso a esta guia de relatórios.");
    const panorama = await montarPanorama(setor.chave, periodo, meu.cursos);
    // o recorte vai DENTRO do documento: um relatório de um curso só, sem
    // dizê-lo, seria lido como o panorama da instituição inteira
    if (meu.cursos) panorama.nota = [notaDoRecorte(meu.cursos), panorama.nota].filter(Boolean).join(" ");
    const { gerarRelatorioSemestralPdf } = await import("./lib/pdf.js");
    const { marcaEm } = await import("./lib/marca.js");
    const buf = await gerarRelatorioSemestralPdf({
      setor, periodo, panorama, emitidoPor: u.email, marca: marcaEm(periodo.fim),
      assinaturas: await assinaturasParaPdf() });
    // relatório recortado a um curso NÃO se arquiva no lugar do institucional:
    // ele responde por menos, e o repositório guarda a versão vigente de cada
    // documento — sobrepor um pelo outro apagaria o panorama da instituição
    arquivarDocumento({ buffer: buf,
      pasta: `Relatórios/${slug(setor.chave)}${meu.cursos ? `/${slug(meu.cursos.join("-"))}` : ""}/${String(periodo.chave).replace("/", "-")}`,
      nome: "relatorio-semestral.pdf" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="relatorio-${setor.chave}-${periodo.chave.replace("/", "-")}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error("Erro no relatório semestral:", e);
    res.status(500).send("Não foi possível gerar o relatório.");
  }
});

/* ------------------------ painel de acessos ----------------------------
   Só o gestor geral. Ele vê, ao lado do que concedeu à mão, o que cada
   pessoa JÁ alcança pelas regras automáticas (coordenação de módulo e de
   curso) — sem isso ele concederia de novo o que a pessoa já tem, ou tiraria
   um acesso que não vem daqui e continuaria valendo. */
app.get("/api/relatorios/acessos", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (u.papel !== "gestor") return res.status(403).json({ error: "A gestão de acessos é do gestor geral." });
    const [acessos, base, equipe, inst] = await Promise.all([
      lerAcessosRelatorios(), contasDoPortal(), lerEquipeAP(), lerInstituicao(),
    ]);
    const { conta, usuarios, perfis } = base;
    const cursosDe = (email) => [...new Set([
      ...cursosDaPessoa(inst, email), ...apCursosQueCoordena(equipe, email),
    ])];
    const pessoas = [...conta.keys()]
      .map((email) => {
        const coord = cursosDe(email);
        const papel = papelDe(email, usuarios);
        const modulos = modulosDe(email, usuarios);
        const alvo = { email, papel, modulos };
        return {
          email, nome: perfis[email]?.nome || "", papel, modulos,
          cursosCoordenados: coord.map((s) => ({ slug: s, nome: nomeDoCurso(s) })),
          concedido: acessos[email] || null,
          // o alcance final, já com tudo somado: é o que a pessoa vê ao entrar
          alcance: alcanceDeRelatorios(alvo, { acessos, cursosCoordenados: coord })
            .map((s) => ({ chave: s.chave, nome: s.nome, cursos: s.cursos })),
        };
      })
      .filter((p) => p.email)
      .sort((a, b) => (b.alcance.length - a.alcance.length)
        || String(a.nome || a.email).localeCompare(String(b.nome || b.email), "pt-BR"));
    res.json({
      ok: true, setores: SETORES_RELATORIO,
      cursos: CURSOS.map((c) => ({ slug: c.slug, nome: c.nome })), pessoas,
    });
  } catch (e) {
    console.error("Erro nos acessos dos relatórios:", e);
    res.status(500).json({ error: "Não foi possível carregar os acessos." });
  }
});

/* POST { email, setores: [], cursos: [] } — lista de setores vazia REMOVE a
   concessão (em vez de gravar um registro que não concede nada). */
app.post("/api/relatorios/acessos", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    if (u.papel !== "gestor") return res.status(403).json({ error: "A gestão de acessos é do gestor geral." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ error: "Informe o e-mail da pessoa." });
    const limpo = normalizarAcessoRelatorios(req.body, { cursosValidos: CURSOS.map((c) => c.slug) });
    const acessos = await lerAcessosRelatorios();
    if (!limpo.setores.length) delete acessos[email];
    else acessos[email] = { ...limpo, em: new Date().toISOString(), por: u.email };
    await storage.set(ACESSOS_REL_KEY, JSON.stringify(acessos));
    res.json({ ok: true, email, concedido: acessos[email] || null });
  } catch (e) {
    console.error("Erro ao gravar o acesso aos relatórios:", e);
    res.status(500).json({ error: "Não foi possível gravar." });
  }
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

/* Os anexos do sistema — histórico escolar do monitor, ofício da reserva,
   comprovante do dossiê, fotos do portfólio. Duas defesas acrescentadas na
   varredura de ago/2026, sem mexer nos links, que continuam os mesmos:

   1. O backend do Drive confere que o arquivo está DENTRO da pasta ARCHÉ
      (lib/files.js, `dentroDaPasta`) — antes, o id ia direto ao Google com
      a conta do dono, e qualquer arquivo que ela lesse sairia por aqui.
   2. O que sai é ANEXO, não página: `attachment` + `nosniff`. Nenhum desses
      arquivos precisa renderizar no domínio da instituição, e o tipo era
      escolhido pela extensão que quem subiu escolheu (um .xml ou .svg
      abriria como documento ativo no nosso próprio endereço).

   A rota segue sem login, de propósito: a credencial do evento, o ofício
   que a coordenação encaminha e o comprovante do dossiê circulam por
   e-mail, para gente que não tem conta. Trocar isso é decisão do dono. */
app.get("/api/files/*", async (req, res) => {
  try {
    const fileId = decodeURIComponent(req.params[0]);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "attachment");
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
/* O app compilado da Avaliação carrega `../firebase-config.js` em TODA página
   — é ele que define `window.storage`, quem grava o dossiê. Nas páginas POR
   CURSO (/arche/avaliacao/<curso>/ e /arche/dossie/<curso>/) esse caminho
   relativo cai num diretório onde o arquivo não existe: o script vinha 404 e a
   página abria SEM `window.storage`. Tudo parecia funcionar — a tela montava, o
   comprovante subia para o Drive —, mas nada era salvo: ao recarregar, o
   dossiê voltava vazio. Só Psicologia escapava, por morar um nível acima
   (achado de ago/2026, com os professores já enviando currículo).
   O arquivo é UM só, servido também nesses dois caminhos — copiá-lo seria
   manter três versões da mesma coisa. A portaria da Avaliação vale igual:
   este trecho roda depois dela. */
app.get(["/arche/avaliacao/firebase-config.js", "/arche/dossie/firebase-config.js"], (_req, res) =>
  res.sendFile(path.join(PUBLIC, "arche", "firebase-config.js")));

/* ---------------- CACHE DO ESTÁTICO NA BORDA (Cloudflare) ----------------
   (pedido do dono, ago/2026, na otimização da franquia do Render): o site já
   está atrás da Cloudflare, mas o express.static mandava `max-age=0` — e a
   Cloudflare obedece ao cabeçalho da origem: TODO logo, CSS e JS aparecia
   como cf-cache-status DYNAMIC e saía da franquia a cada visita. A régua,
   por tipo de arquivo:
   - imagem, fonte e ícone: 1 dia — logotipos e timbres quase nunca mudam;
   - PDF publicado (editais e resultados em public/): 7 dias — documento
     arquivado não muda (o gerado sob demanda continua em rota /api, que a
     Cloudflare não cacheia, e os exports já saem com no-store);
   - JS e CSS: 5 minutos — não são fingerprinted, e um deploy precisa chegar
     rápido; 5 min bastam para a borda absorver a rajada (o QR no telão, o
     laboratório inteiro abrindo junto), que é quando a franquia sangra;
   - HTML: continua max-age=0 — o portal muda a cada deploy, e a Cloudflare
     não cacheia HTML por padrão de todo jeito.
   O ETag continua: expirado o prazo, o navegador revalida e recebe 304. */
const CACHE_ESTATICO = [
  [/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i, "public, max-age=86400"],
  [/\.pdf$/i, "public, max-age=604800"],
  [/\.(js|css)$/i, "public, max-age=300"],
];
app.use(express.static(PUBLIC, {
  setHeaders(res, arquivo) {
    for (const [re, valor] of CACHE_ESTATICO) {
      if (re.test(arquivo)) { res.setHeader("Cache-Control", valor); return; }
    }
  },
}));

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
      // a medição de banda também desce ao disco: o que ela mediu nas
      // últimas dezenas de segundos é justamente o que interessa guardar
      await fecharMedicao().catch(() => {});
      console.log("ARCHÉ · estado gravado antes de encerrar");
    } catch (e) {
      console.error("Falha ao gravar o estado no encerramento:", e.message);
    } finally {
      process.exit(0);
    }
  });
}


/* ========================================================================
   AVISOS AUTOMÁTICOS — o interruptor (pedido do dono, ago/2026).

   Todo e-mail que o ARCHÉ manda SOZINHO passa por aqui com o seu código. O
   catálogo (lib/avisos.js) diz o que cada um é e o que se perde ao calá-lo;
   a configuração guarda só o que foge do padrão, e aviso ausente é aviso
   LIGADO — assim um aviso novo já nasce funcionando, em vez de ficar mudo
   porque ninguém o pôs numa lista.

   O código de acesso do login NÃO entra aqui de propósito: desligá-lo
   trancaria todo mundo do lado de fora.
   ======================================================================== */
async function lerAvisos() {
  try { return normalizarAvisos(JSON.parse((await storage.get(AVISOS_KEY)) || "{}")); }
  catch { return {}; }
}

/** Manda o e-mail SE o aviso estiver ligado. Devolve `{silenciado:true}` quando não. */
async function enviarAviso(codigo, mensagem) {
  const cfg = await lerAvisos();
  if (!avisoLigado(cfg, codigo, hojeLocalISO())) {
    console.log(`[avisos] ${codigo} está silenciado — e-mail não enviado`);
    return { silenciado: true };
  }
  const { enviarEmail } = await import("./lib/mailer.js");
  return enviarEmail(mensagem);
}

/** GET /api/avisos — o painel. Só gestor geral: é configuração do portal. */
app.get("/api/avisos", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const cfg = await lerAvisos();
  res.json({ ok: true, setores: SETORES_AVISO,
    avisos: situacaoDosAvisos(cfg, hojeLocalISO()) });
});

/** POST /api/avisos — liga, desliga ou silencia até uma data. */
app.post("/api/avisos", async (req, res) => {
  const g = await exigirGestor(req, res); if (!g) return;
  const b = req.body || {};
  const r = aplicarMudancaAviso(await lerAvisos(),
    { codigo: b.codigo, estado: b.estado, ate: b.ate, por: g.email }, hojeLocalISO());
  if (r.erro) return res.status(400).json({ error: r.erro });
  await storage.set(AVISOS_KEY, JSON.stringify(r.config));
  res.json({ ok: true, avisos: situacaoDosAvisos(r.config, hojeLocalISO()) });
});

/* ========================================================================
   CERTIFICADOS DO EVENTO — emitidos pelo próprio ARCHÉ (decisão do dono,
   ago/2026).

   O que muda em relação ao caminho antigo (a planilha para o sistema da
   AEE): com credenciamento, presenças e comissão organizadora já dentro do
   ARCHÉ, quem tem direito ao quê já está aqui — exportar para emitir fora
   era o passo mais longo entre o dado e o documento. A planilha da AEE
   continua existindo para quem precisar dela.

   As ASSINATURAS institucionais são as MESMAS do ARCHÉ IC
   (`sys-assinaturas-v1`): um lugar só para trocar quando trocar o
   pró-reitor ou o reitor. As do evento — responsável e coordenação —
   ficam na própria ação, e quem não enviar a sua simplesmente não aparece
   no documento.
   ======================================================================== */

/** As duas institucionais, no formato que o gerador espera. */
async function assinaturasInstitucionais() {
  const guardadas = await lerAssinaturas();
  const out = {};
  const { ASSINA } = await import("./lib/pdf.js");
  if (guardadas.proreitor?.base64) {
    out.proreitor = { ...ASSINA.proReitor, img: Buffer.from(guardadas.proreitor.base64, "base64") };
  }
  if (guardadas.reitor?.base64) {
    out.reitor = { ...ASSINA.reitor, img: Buffer.from(guardadas.reitor.base64, "base64") };
  }
  return out;
}

/** Monta o PDF de um certificado já apurado. */
async function pdfDoCertificadoEvento(acao, cert) {
  const { gerarCertificadoEventoPdf } = await import("./lib/pdf.js");
  const institucionais = await assinaturasInstitucionais();
  const lista = assinaturasDoCertificado(acao, institucionais).map((a) => ({
    chave: a.chave, nome: a.nome, cargo: a.cargo,
    img: a.img || (a.base64 ? Buffer.from(a.base64, "base64") : null),
  }));
  /* O BANCO COMPLETA O QUE O EVENTO NÃO TEM (pedido do dono, ago/2026): quem
     já subiu a assinatura uma vez — em qualquer módulo — não a reenvia a
     cada evento. Faltando a do responsável ou a da coordenação, busca-se no
     banco pela identidade (e-mail do responsável) ou pelo nome declarado na
     caixa da ação; sem imagem em lugar nenhum, a regra de sempre: a linha
     não aparece. A ordem dos assinantes é a do catálogo. */
  const temChave = new Set(lista.map((a) => a.chave));
  const cx = caixaCertificado(acao);
  const doBanco = [];
  if (!temChave.has("organizador")) {
    const nome = String(cx.assinaturas?.organizador?.nome || acao.proposta?.respNome || "").trim();
    const email = String(acao.proposta?.respEmail || acao.criadoPor || "").trim().toLowerCase();
    const img = (email ? await assinaturaPorIdentidade(email) : null)
      || (nome ? await assinaturaDoBancoPorNome(nome) : null);
    if (img && nome) doBanco.push({ chave: "organizador", nome,
      cargo: String(cx.assinaturas?.organizador?.cargo || "").trim() || "Responsável pela ação", img });
  }
  if (!temChave.has("coordenacao")) {
    const nome = String(cx.assinaturas?.coordenacao?.nome || "").trim();
    const img = nome ? await assinaturaDoBancoPorNome(nome) : null;
    if (img) doBanco.push({ chave: "coordenacao", nome,
      cargo: String(cx.assinaturas?.coordenacao?.cargo || "").trim() || "Coordenação do evento", img });
  }
  const ordem = ["organizador", "coordenacao", "proreitor", "reitor"];
  const assinaturas = [...lista, ...doBanco]
    .sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave))
    .map(({ nome, cargo, img }) => ({ nome, cargo, img }));
  return gerarCertificadoEventoPdf({
    cert, programacao: programacaoDoCertificado(acao), assinaturas,
  });
}

const nomeArquivoCert = (cert) =>
  `certificado-${slugDeNome(cert.evento || "evento")}-${slugDeNome(cert.pessoa || "participante")}.pdf`;

/* ---------------- assinatura do responsável e da coordenação ------------- */

/* "Usar a minha assinatura" (pedido do dono, ago/2026): quem já enviou o
   PNG uma vez, no perfil ou noutro módulo, não o reenvia a cada evento. A
   cópia é EXPLÍCITA e só da PRÓPRIA assinatura — o coordenador pode enviar
   a imagem de outra pessoa pela rota normal (é ele quem responde por isso),
   mas ninguém "aproveita" a assinatura alheia num clique. */
/* APAGAR UM ANEXO DO PORTFÓLIO (pedido do dono, ago/2026): quem organiza o
   evento sobe a foto errada — a do outro dia, a repetida, a que saiu tremida
   — e precisava conviver com ela no relatório que vai ao MEC. A remoção é do
   REGISTRO: o arquivo continua arquivado no Drive da PROPPEX, como já
   acontecia na tela da Extensão. O que muda é que agora há uma rota própria,
   em vez de o cliente reescrever a ação inteira: no encerramento pelo EV não
   há o formulário completo em mãos, e uma aba velha apagaria o que outra
   pessoa acabou de anexar.

   O anexo se identifica pelo `fileId`; os registros antigos, que podem não
   tê-lo, aceitam o índice (`i:3`) — e o índice é conferido contra o nome,
   senão uma lista que mudou entre a tela e o clique apagaria outro arquivo. */
app.delete("/api/extensao/:id/anexo/:ref", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (req.query?.como) return res.status(403).json({ error: "Em modo de visualização não se grava." });
    const ref = decodeURIComponent(String(req.params.ref || ""));
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!podeOperarEvento(u, a)) return { erro: [403, "Esta ação não é sua."], gravar: false };
      if (a.status === "registrada")
        return { erro: [400, "Ação registrada — anexos travados."], gravar: false };
      const lista = a.portfolio?.anexos || [];
      let i = lista.findIndex((x) => x.fileId && x.fileId === ref);
      if (i < 0 && /^i:\d+$/.test(ref)) {
        const n = Number(ref.slice(2));
        const nome = String(req.query?.nome || "");
        // o índice só vale se o arquivo naquela posição for o que a tela viu
        if (lista[n] && (!nome || String(lista[n].name || lista[n].nome || "") === nome)) i = n;
      }
      if (i < 0) return { erro: [404, "Anexo não encontrado — recarregue a página."], gravar: false };
      const fora = lista[i];
      a.portfolio = a.portfolio || {};
      a.portfolio.anexos = lista.filter((_, k) => k !== i);
      a.atualizadoEm = new Date().toISOString();
      return { anexos: a.portfolio.anexos, fora };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    console.log(`[extensao] anexo removido do portfólio por ${u.email}: ${r.fora?.name || ref}`);
    res.json({ ok: true, anexos: r.anexos });
  } catch (e) {
    console.error("Erro ao remover o anexo do portfólio:", e);
    res.status(500).json({ error: "Não foi possível remover o anexo." });
  }
});

app.post("/api/extensao/:id/assinatura/minha", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const quem = String(req.body?.quem || "").trim();
    if (!assinanteDoEventoValido(quem))
      return res.status(400).json({ error: "Informe de quem é a assinatura (responsável ou coordenação)." });
    const minha = (await lerAssinaturasDeUsuarios())[u.email];
    if (!minha?.base64)
      return res.status(404).json({ error: "Você ainda não enviou a sua assinatura. Envie-a no perfil ou aqui, pelo arquivo." });
    const perfil = (await carregarPerfis())[u.email] || {};
    const nome = String(req.body?.nome || perfil.nome || u.nome || "").trim().slice(0, 120);
    if (!nome) return res.status(400).json({ error: "Informe o nome de quem assina — é ele que sai impresso." });
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!podeCertificarAcao(u, a)) return { erro: [403, "Sem permissão para esta ação"], gravar: false };
      const cx = caixaCertificado(a);
      cx.assinaturas = cx.assinaturas || {};
      cx.assinaturas[quem] = {
        nome, cargo: String(req.body?.cargo || "").trim().slice(0, 140),
        base64: minha.base64, em: new Date().toISOString(), por: u.email,
      };
      a.atualizadoEm = new Date().toISOString();
      return { acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json({ ok: true, assinaturas: assinaturasVisiveis(r.acao) });
  } catch (e) {
    console.error("Erro ao aproveitar a assinatura do usuário:", e);
    res.status(500).json({ error: "Não foi possível usar a sua assinatura." });
  }
});

app.post("/api/extensao/:id/assinatura", upload.single("file"), async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const quem = String(req.body?.quem || "").trim();
    if (!assinanteDoEventoValido(quem))
      return res.status(400).json({ error: "Informe de quem é a assinatura (responsável ou coordenação)." });
    const nome = String(req.body?.nome || "").trim().slice(0, 120);
    if (!nome) return res.status(400).json({ error: "Informe o nome de quem assina — é ele que sai impresso." });
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });
    if (!/^image\/(png|jpeg)$/.test(req.file.mimetype || ""))
      return res.status(400).json({ error: "Envie a assinatura em PNG (de preferência com fundo transparente)." });
    if (req.file.size > 2 * 1024 * 1024)
      return res.status(400).json({ error: "Imagem muito grande — até 2 MB." });

    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a) return { erro: [404, "Ação não encontrada"], gravar: false };
      if (!podeCertificarAcao(u, a)) return { erro: [403, "Sem permissão para esta ação"], gravar: false };
      const cx = caixaCertificado(a);
      cx.assinaturas = cx.assinaturas || {};
      cx.assinaturas[quem] = {
        nome, cargo: String(req.body?.cargo || "").trim().slice(0, 140),
        base64: req.file.buffer.toString("base64"),
        em: new Date().toISOString(), por: u.email,
      };
      a.atualizadoEm = new Date().toISOString();
      return { acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    // e o envio COMPÕE O BANCO central: nos próximos documentos, de qualquer
    // módulo, esta assinatura não precisa ser pedida de novo
    alimentarBancoDeAssinatura({ nome, buffer: req.file.buffer, tipo: req.file.mimetype,
      arquivo: req.file.originalname, bytes: req.file.size, porEmail: u.email }).catch(() => {});
    res.json({ ok: true, assinaturas: assinaturasVisiveis(r.acao) });
  } catch (e) {
    console.error("Erro ao gravar a assinatura do evento:", e);
    res.status(500).json({ error: "Falha ao gravar a assinatura." });
  }
});

app.delete("/api/extensao/:id/assinatura", async (req, res) => {
  const u = await sessaoEx(req, res);
  if (!u) return;
  const quem = String(req.query?.quem || "").trim();
  if (!assinanteDoEventoValido(quem)) return res.status(400).json({ error: "Assinatura inválida." });
  const r = await comAcoes((acoes) => {
    const a = acoes.find((x) => x.id === req.params.id);
    if (!a) return { erro: [404, "Ação não encontrada"], gravar: false };
    if (!podeCertificarAcao(u, a)) return { erro: [403, "Sem permissão para esta ação"], gravar: false };
    const cx = caixaCertificado(a);
    if (cx.assinaturas) delete cx.assinaturas[quem];
    return { acao: a };
  });
  if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
  res.json({ ok: true, assinaturas: assinaturasVisiveis(r.acao) });
});

/** A imagem da assinatura, para a própria gestão conferir o que subiu. */
app.get("/api/extensao/:id/assinatura/:quem", async (req, res) => {
  const u = await sessaoEx(req, res);
  if (!u) return;
  const a = (await lerAcoes()).find((x) => x.id === req.params.id);
  if (!a || !podeCertificarAcao(u, a)) return res.status(404).end();
  const x = caixaCertificado(a).assinaturas?.[req.params.quem];
  if (!x?.base64) return res.status(404).end();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=60");
  res.end(Buffer.from(x.base64, "base64"));
});

/* --------------------------- a lista e a emissão ------------------------- */

/* O RASCUNHO do relatório a partir do que a ação já guarda (pedido do dono,
   ago/2026): programação, palestrantes, comissão e contagens já estão no
   sistema — redigitá-los à mão não é prestação de contas. A régua é do
   servidor porque as duas telas (ARCHÉ EX e o encerramento no EV) precisam
   sugerir a MESMA coisa. Nunca sobrescreve o que a pessoa escreveu, e nunca
   sugere a avaliação/resultados: essa é o juízo de quem conduziu a ação. */
app.get("/api/extensao/:id/relatorio-sugestao", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const a = (await lerAcoes()).find((x) => x.id === req.params.id);
    if (!a || !podeVerAcao(u, a)) return res.status(404).json({ error: "Ação não encontrada" });
    res.json({ ok: true, ...aplicarSugestao(a) });
  } catch (e) {
    console.error("Erro ao sugerir o relatório:", e);
    res.status(500).json({ error: "Não foi possível montar o rascunho." });
  }
});

/** Quem tem direito a certificado neste evento — a tela da gestão. */
app.get("/api/extensao/:id/certificados", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const a = (await lerAcoes()).find((x) => x.id === req.params.id);
    if (!a || !podeCertificarAcao(u, a)) return res.status(404).json({ error: "Ação não encontrada" });
    const pode = acaoCertificavel(a);
    const lista = certificadosDaAcao(a).map(({ email, cpf, ...c }) => ({
      ...c, temEmail: !!email, temCpf: !!cpf,
      // a chave de emissão não expõe o CPF de ninguém na tela
      ref: cpf || email || c.pessoa,
    }));
    const institucionais = await lerAssinaturas();
    res.json({
      ok: true, pode: pode.ok, motivo: pode.motivo,
      certificados: lista,
      // a coordenação precisa saber POR QUE todos os inscritos apareceram:
      // ninguém foi credenciado, e aí a inscrição vale como presença
      semCredenciamento: !!a.evento
        && !houveCredenciamento(a.evento, a.participantes?.inscritos),
      assinaturas: assinaturasVisiveis(a),
      institucionais: {
        proreitor: !!institucionais.proreitor?.base64,
        reitor: !!institucionais.reitor?.base64,
      },
    });
  } catch (e) {
    console.error("Erro ao listar certificados do evento:", e);
    res.status(500).json({ error: "Não foi possível carregar." });
  }
});

/** A gestão emite o de uma pessoa (CPF, e-mail ou nome como referência). */
app.get("/api/extensao/:id/certificado.pdf", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const a = (await lerAcoes()).find((x) => x.id === req.params.id);
    if (!a || !podeCertificarAcao(u, a)) return res.status(404).send("Ação não encontrada");
    const ref = String(req.query?.ref || "").trim();
    // o TIPO vem junto porque a mesma pessoa acumula papéis: quem organiza o
    // evento entra na comissão e costuma estar inscrito também. Sem ele,
    // `certificadoDe` devolvia o primeiro da ordem (participante) e os dois
    // botões da guia emitiam o mesmo documento — o palestrante perdia o
    // certificado com o título da apresentação (achado da varredura ago/2026)
    const cert = certificadoDe(a, {
      cpf: ref, email: ref, nome: ref, tipo: String(req.query?.tipo || "").trim(),
    }, {});
    if (!cert) return res.status(404).send("Esta pessoa não tem certificado nesta ação.");
    const buf = await pdfDoCertificadoEvento(a, cert);
    arquivarDocumento({ buffer: buf,
      pasta: `Certificados/Extensão/${anoDaPasta(a.numeroAcao, a.proposta?.periodoFim)}/${slug(a.numeroAcao || a.id)}`,
      nome: nomeArquivoCert(cert) });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nomeArquivoCert(cert)}"`);
    res.end(buf);
  } catch (e) {
    console.error("Erro ao emitir certificado do evento:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});

/** O PARTICIPANTE baixa o seu pela credencial — sem conta, como se inscreveu. */
app.get("/api/publico/eventos/:slug/inscricao/:token/certificado.pdf", async (req, res) => {
  try {
    const a = eventoPorSlug(await lerAcoes(), req.params.slug);
    if (!a?.evento) return res.status(404).send("Evento não encontrado");
    const t = String(req.params.token || "").toLowerCase();
    if (!tokenValido(a.evento.chaveQr, t)) return res.status(404).send("Inscrição não encontrada");
    const inscrito = (a.participantes?.inscritos || [])
      .find((x) => String(x?.token || "").toLowerCase() === t);
    if (!inscrito) return res.status(404).send("Inscrição não encontrada");
    const pode = acaoCertificavel(a);
    if (!pode.ok) return res.status(409).send(pode.motivo);
    // pela credencial sai SEMPRE o de participante: é o documento daquela
    // inscrição. Sem fixar o tipo, quem também está na comissão receberia o
    // dela, que não é o que o link do QR promete
    const cert = certificadoDe(a, { cpf: inscrito.cpf, email: inscrito.email, nome: inscrito.nome,
      tipo: "participante" }, { hoje: hojeLocalISO() });
    if (!cert) {
      return res.status(409).send(eventoControlaFrequencia(a.evento)
        ? "O certificado sai para quem teve presença registrada no evento. Fale com a coordenação."
        : "Não foi possível emitir o certificado desta inscrição.");
    }
    const buf = await pdfDoCertificadoEvento(a, cert);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nomeArquivoCert(cert)}"`);
    res.end(buf);
  } catch (e) {
    console.error("Erro no certificado do participante:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});

/* ---------------------- o histórico, ligado ao USUÁRIO --------------------
   O que faz o histórico ser da PESSOA e não de um evento: a mesma pessoa é
   participante de um, comissão de outro e palestrante de um terceiro, e é
   assim que ela quer ver. O vínculo é o CPF do perfil, com o e-mail da conta
   como segunda chave — as mesmas de sempre.
   ------------------------------------------------------------------------- */
app.get("/api/meus-certificados", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).json({ error: "Faça login." });
    const perfil = (await carregarPerfis())[u.email] || {};
    const eu = { cpf: perfil.cpf || u.cpf || "", email: u.email, nome: perfil.nome || u.nome || "" };
    const out = [];

    // EXTENSÃO — participante, palestrante e comissão organizadora, dos
    // eventos geridos no ARCHÉ e das ações que correram por fora (a lista
    // digitada na Extensão): é o mesmo certificado, pelo mesmo motor
    for (const c of certificadosDePessoa(await lerAcoes(), eu)) {
      out.push({
        origem: "evento", setor: c.slug ? "Eventos" : "Extensão",
        titulo: c.evento,
        papel: c.tipo === "participante" ? "Participante"
          : c.tipo === "palestrante" ? "Palestrante" : (c.papel || "Comissão organizadora"),
        detalhe: c.palestra || c.curso || "",
        quando: c.fim || c.inicio || "", ch: c.ch || 0, codigo: c.codigo,
        link: `/api/meus-certificados/evento.pdf?acao=${encodeURIComponent(c.acaoId)}`
          + `&tipo=${encodeURIComponent(c.tipo)}`,
      });
    }

    // INICIAÇÃO CIENTÍFICA — participação do aluno e orientação
    for (const c of certificadosDe(await lerProjetos(), eu)) {
      out.push({
        origem: "ic", setor: "Iniciação Científica",
        titulo: c.titulo,
        papel: c.tipo === "orientacao" ? `Orientação de ${c.aluno || "acadêmico(a)"}` : "Bolsista/voluntário(a)",
        detalhe: [c.numero, c.edital ? `edital ${c.edital}` : ""].filter(Boolean).join(" · "),
        quando: c.vigencia?.fim || "", ch: 0, codigo: c.codigo,
        link: `/api/ic/certificado.pdf?codigo=${encodeURIComponent(c.codigo)}`,
      });
    }

    // MONITORIA — monitor e docente orientador
    for (const c of certificadosMonitoria(await lerMonitorias(), eu)) {
      out.push({
        origem: "monitoria", setor: "Monitoria",
        titulo: c.disciplina ? `Monitoria de ${c.disciplina}` : "Monitoria Acadêmica",
        papel: c.tipo === "orientacao-monitoria" ? "Orientação" : "Monitor(a)",
        detalhe: [c.numero, c.ciclo].filter(Boolean).join(" · "),
        quando: c.vigencia?.fim || "", ch: Number(c.horas) || 0,
        codigo: "", link: `/api/monitoria/certificado.pdf?projeto=${encodeURIComponent(c.projetoId)}&tipo=${encodeURIComponent(c.tipo)}`,
      });
    }

    // MONITORIA, O ARQUIVO — os semestres que correram fora do ARCHÉ, casados
    // pela MATRÍCULA do perfil (a âncora que a planilha do curso tem) e pelo
    // nome completo. Entram na mesma lista: para quem recebe, o certificado é
    // o mesmo documento — o que muda é onde o semestre foi conduzido.
    for (const c of certificadosHistoricosMon(historicoMon, { ...eu, matricula: perfil.matricula || "" })) {
      out.push({
        origem: "monitoria", setor: "Monitoria",
        titulo: c.disciplina ? `Monitoria de ${c.disciplina}` : "Monitoria Acadêmica",
        papel: c.tipo === "orientacao-monitoria" ? "Orientação" : "Monitor(a)",
        detalhe: [c.ciclo, c.edital ? `edital ${c.edital}` : ""].filter(Boolean).join(" · "),
        quando: c.vigencia?.fim || "", ch: Number(c.horas) || 0,
        codigo: "", link: `/api/meus-certificados/monitoria-historico.pdf?id=${encodeURIComponent(c.id)}`,
      });
    }

    out.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    res.json({ ok: true,
      eu: { nome: eu.nome, email: eu.email, temCpf: !!eu.cpf },
      certificados: out,
      // o CPF é o que reúne o que a pessoa fez com e-mails diferentes ao
      // longo dos anos — sem ele, o histórico sai menor do que a verdade
      aviso: eu.cpf ? "" : "Informe o seu CPF no perfil: é por ele que o ARCHÉ reúne certificados "
        + "de edições antigas, quando o e-mail cadastrado era outro.",
      // a monitoria dos semestres anteriores foi entregue em planilha, sem
      // CPF: lá a chave é a MATRÍCULA, e sem ela o histórico do estudante
      // depende do nome estar escrito exatamente como a coordenação digitou
      avisoMatricula: (!perfil.matricula && normalizarFuncao(perfil.funcao) === "aluno")
        ? "Informe a sua matrícula no perfil: é por ela que o ARCHÉ encontra os certificados de "
          + "monitoria dos semestres anteriores, entregues pelas coordenações em planilha."
        : "",
    });
  } catch (e) {
    console.error("Erro no histórico de certificados:", e);
    res.status(500).json({ error: "Não foi possível carregar." });
  }
});

app.get("/api/meus-certificados/evento.pdf", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).send("Faça login.");
    const perfil = (await carregarPerfis())[u.email] || null;
    const a = (await lerAcoes()).find((x) => x.id === String(req.query?.acao || ""));
    // a guarda pedia EVENTO, mas o motor passou a ser da AÇÃO: quem
    // participou de uma ação sem evento (as migradas do papel) via a linha no
    // próprio histórico e recebia "Evento não encontrado" ao clicar
    if (!a) return res.status(404).send("Ação não encontrada");
    // o `tipo` vem do link porque a mesma pessoa pode ser participante E
    // comissão da mesma ação: sem ele, as duas linhas baixavam o primeiro
    // documento, e o código impresso não batia com o da tela
    const cert = certificadoDe(a,
      { cpf: perfil?.cpf || "", email: u.email, nome: perfil?.nome || "",
        tipo: String(req.query?.tipo || "") },
      { hoje: hojeLocalISO() });
    if (!cert) return res.status(404).send("Você não tem certificado nesta ação.");
    const buf = await pdfDoCertificadoEvento(a, cert);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nomeArquivoCert(cert)}"`);
    res.end(buf);
  } catch (e) {
    console.error("Erro ao emitir certificado do usuário:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});

/* O certificado do ARQUIVO da monitoria. Rota à parte da do módulo por um
   motivo prático: quem foi monitor em 2026/1 não tem projeto no ARCHÉ, e a
   sessão do setor exige participação. Aqui basta estar logado — e a régua
   continua sendo a mesma lista que a pessoa vê, recalculada a cada pedido:
   o id sozinho não abre nada. */
app.get("/api/meus-certificados/monitoria-historico.pdf", async (req, res) => {
  try {
    const u = await usuarioDe(req, res);
    if (!u) return res.status(401).send("Faça login.");
    const perfil = (await carregarPerfis())[u.email] || {};
    const cert = certificadoHistoricoMon(historicoMon, quemHistorico(u, perfil),
      String(req.query?.id || ""));
    if (!cert) return res.status(404).send("Você não tem este certificado.");
    const { gerarCertificadoPdf } = await import("./lib/pdf.js");
    const buf = await gerarCertificadoPdf({
      ...cert, codigo: codigoCert({ tipo: cert.tipo, projetoId: cert.id, pessoa: cert.pessoa }),
      assinaturas: await assinaturasParaPdf(),
    });
    enviarPdfMon(res, buf, `certificado-monitoria-${cert.ciclo.replace("/", "-")}.pdf`);
  } catch (e) {
    console.error("Erro no certificado histórico da monitoria:", e);
    res.status(500).send("Não foi possível gerar o certificado.");
  }
});


/* AVISAR QUEM TEM CERTIFICADO (pedido do dono, ago/2026).
   Validado o encerramento, o documento existe — e quem participou não volta
   ao portal para conferir se saiu. Sai um e-mail por pessoa, com o link que
   serve a ELA: o inscrito baixa pela própria CREDENCIAL (o mesmo endereço do
   QR, que ele já tem na caixa de entrada e que dispensa conta); palestrante e
   comissão vão à guia Certificados, onde encontram também os da IC e da
   monitoria. Sem e-mail no registro não há aviso possível — e é isso que a
   resposta devolve à tela, para a coordenação saber o tamanho do buraco.
   O envio é sequencial e fire-and-forget: e-mail que falha não desfaz a
   validação. A marca por evento impede que revalidar reenvie tudo. */
const AVISOS_CERT_KEY = "sys-ev-avisos-certificado-v1";

async function avisarCertificadosDisponiveis(acao) {
  const base = (process.env.PUBLIC_BASE_URL || "https://arche.app.br").replace(/\/$/, "");
  const certs = certificadosDaAcao(acao);
  // quem JÁ foi avisado desta ação não é avisado de novo: a marca deixou de
  // ser só registro e passou a valer como guarda (ago/2026), porque a ação
  // sem evento é liberada pelo REGISTRO — e a gestão pode gravar a ação
  // outras vezes depois dele. Participante incluído mais tarde recebe o
  // dele, e só ele.
  let jaAvisados = new Set();
  try {
    const reg = JSON.parse((await storage.get(AVISOS_CERT_KEY)) || "{}");
    jaAvisados = new Set(reg[acao.id]?.emails || []);
  } catch { /* sem registro legível, avisa todo mundo — é o comportamento antigo */ }
  const porToken = new Map((acao.participantes?.inscritos || [])
    .filter((i) => i?.email && i?.token).map((i) => [String(i.email).toLowerCase(), i.token]));
  const vistos = new Set();
  const fila = [];
  for (const c of certs) {
    const email = String(c.email || "").trim().toLowerCase();
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    if (jaAvisados.has(email)) continue;
    const token = c.tipo === "participante" ? porToken.get(email) : null;
    fila.push({ cert: { ...c, email },
      link: token
        ? `${base}/eventos/${encodeURIComponent(acao.evento?.slug || "")}/inscricao/${encodeURIComponent(token)}`
        : `${base}/certificados/` });
  }
  const semEmail = certs.length - vistos.size;

  let enviados = 0;
  try {
    const { enviarEmail, emailCertificadoDisponivel } = await import("./lib/mailer.js");
    for (const item of fila) {
      try {
        await enviarAviso("ev-certificado", emailCertificadoDisponivel({ acao, cert: item.cert, base, link: item.link }));
        enviados += 1;
      } catch (e) {
        console.error(`[eventos] aviso de certificado não enviado a ${item.cert.email}:`, e.message);
      }
    }
  } catch (e) { console.error("[eventos] avisos de certificado:", e.message); }

  try {
    const reg = JSON.parse((await storage.get(AVISOS_CERT_KEY)) || "{}");
    reg[acao.id] = { em: new Date().toISOString(), enviados, previstos: fila.length, semEmail,
      emails: [...new Set([...jaAvisados, ...vistos])] };
    await storage.set(AVISOS_CERT_KEY, JSON.stringify(reg));
  } catch { /* o registro é conveniência: falhar aqui não desfaz os envios */ }
  console.log(`[eventos] certificados de "${acao.proposta?.nomeAtividade || acao.id}": `
    + `${enviados}/${fila.length} avisados${semEmail ? `, ${semEmail} sem e-mail` : ""}`);
  return { enviados, previstos: fila.length, semEmail };
}

/* ------------------------- encerrar o evento -----------------------------
   O coordenador clica em "Encerrar evento" quando terminou de lançar tudo —
   presenças, comissão, palestrantes — e o pedido vai à PROPPEX. Validado o
   encerramento, os certificados existem; devolvido, volta a ser editável
   com o que a pró-reitoria apontou. É o mesmo desenho do relatório da ação,
   e existe pela mesma razão: certificado emitido não se recolhe.
   ------------------------------------------------------------------------- */
app.post("/api/extensao/:id/evento/encerrar", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    const obs = String(req.body?.observacao || "").trim().slice(0, 2000);
    // Encerrar o evento É entregar o relatório final da ação (pedido do
    // dono, ago/2026): o coordenador termina o trabalho no ARCHÉ EV e a ação
    // ficava sem relatório num setor que ele não voltava a abrir. Os campos
    // vêm no mesmo pedido e passam pela MESMA régua do formulário do EX.
    // mesma limpeza da gravação pelo formulário do EX: o encerramento pelo
    // ARCHÉ EV é a outra porta do MESMO relatório final
    const campos = limparProfundo(normalizarRelatorioFinal(req.body?.relatorio));
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a?.evento) return { erro: [404, "Evento não encontrado"], gravar: false };
      if (!podeOperarEvento(u, a)) return { erro: [403, "Sem permissão para operar este evento"], gravar: false };
      const pode = podeEncerrar(a, hojeLocalISO());
      if (!pode.ok) return { erro: [400, pode.motivo], gravar: false };
      const faltas = faltaParaEntregar(a, campos);
      if (faltas.length)
        return { erro: [400, "Para encerrar o evento falta " + faltas.join("; ") + "."], gravar: false };
      const n = numerosDoEvento(a);
      a.evento.encerramento = {
        status: "solicitado", pedidoEm: new Date().toISOString(), pedidoPor: u.email,
        observacao: obs,
        // o retrato do que se está encerrando: depois ninguém reconstrói
        numeros: { inscritos: n.inscritos, presentes: n.presentes },
        decididoEm: "", decididoPor: "", parecer: "",
      };
      // o relatório entra ENTREGUE, com o snapshot dos números do sistema —
      // o mesmo que a entrega pelo formulário do EX grava (o cliente não o
      // fabrica). Reenviar o encerramento devolvido preserva a data original.
      a.relatorio = {
        ...(a.relatorio || {}), ...campos,
        entregueEm: a.relatorio?.entregueEm || new Date().toISOString(),
        numerosEvento: n,
      };
      if (a.status !== "registrada") a.status = "relatorio-entregue";
      a.atualizadoEm = new Date().toISOString();
      return { acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    try {
      const { enviarEmail, emailEncerramentoEvento } = await import("./lib/mailer.js");
      enviarAviso("ev-encerramento", emailEncerramentoEvento(r.acao))
        .catch((e) => console.error("[eventos] aviso de encerramento não enviado:", e.message));
    } catch (e) { console.error("[eventos] aviso de encerramento:", e.message); }
    res.json({ ok: true, evento: eventoSemSegredos(r.acao.evento) });
  } catch (e) {
    console.error("Erro ao encerrar o evento:", e);
    res.status(500).json({ error: "Não foi possível encerrar o evento." });
  }
});

/** A decisão é da gestão da Extensão: validar libera os certificados. */
app.post("/api/extensao/:id/evento/encerramento", async (req, res) => {
  try {
    const u = await sessaoEx(req, res);
    if (!u) return;
    if (!gereEx(u)) return res.status(403).json({ error: "A validação do encerramento é da gestão da Extensão." });
    const decisao = String(req.body?.decisao || "").trim();
    if (!["validado", "devolvido"].includes(decisao))
      return res.status(400).json({ error: "Diga se o encerramento foi validado ou devolvido." });
    const parecer = String(req.body?.parecer || "").trim().slice(0, 3000);
    if (decisao === "devolvido" && parecer.length < 10)
      return res.status(400).json({ error: "Escreva o que precisa ser corrigido — é o que a coordenação vai ler." });
    const r = await comAcoes((acoes) => {
      const a = acoes.find((x) => x.id === req.params.id);
      if (!a?.evento) return { erro: [404, "Evento não encontrado"], gravar: false };
      if (situacaoEncerramento(a) !== "solicitado")
        return { erro: [400, "Não há pedido de encerramento aguardando decisão neste evento."], gravar: false };
      const agora = new Date().toISOString();
      a.evento.encerramento = {
        ...a.evento.encerramento, status: decisao,
        decididoEm: agora, decididoPor: u.email, parecer,
      };
      /* UM ATO SÓ (pedido do dono, ago/2026): validar o encerramento libera
         os certificados E encerra o relatório final da ação. Eram dois — a
         pró-reitoria validava o encerramento no ARCHÉ EV e a ação continuava
         eternamente em "relatório entregue" no ARCHÉ EX, esperando um
         "Finalizar" que ninguém sabia que faltava. O evento ficava pendente
         numa guia depois de concluído na outra, que é a confusão de status
         que o dono apontou. Devolvido, o registro se desfaz junto: o
         relatório volta a ser editável, e ação registrada com encerramento
         em aberto afirmaria um ciclo que não fechou. */
      if (decisao === "validado" && a.relatorio?.entregueEm) {
        a.status = "registrada";
        a.relatorio = { ...a.relatorio, validadoEm: agora, validadoPor: u.email,
          validadoPeloEncerramento: true };
      } else if (decisao === "devolvido" && a.relatorio?.validadoPeloEncerramento) {
        a.status = "relatorio-entregue";
        const { validadoEm, validadoPor, validadoPeloEncerramento, ...resto } = a.relatorio;
        a.relatorio = resto;
      }
      a.atualizadoEm = agora;
      return { acao: a };
    });
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    try {
      const { enviarEmail, emailDecisaoEncerramento } = await import("./lib/mailer.js");
      enviarAviso("ev-decisao-encerramento", emailDecisaoEncerramento(r.acao, decisao, parecer))
        .catch((e) => console.error("[eventos] decisão do encerramento não avisada:", e.message));
    } catch (e) { console.error("[eventos] decisão do encerramento:", e.message); }
    // validado = o certificado passa a existir: quem tem direito é avisado
    // agora, sem depender de voltar ao portal para conferir
    let avisos = null;
    if (decisao === "validado") avisos = await avisarCertificadosDisponiveis(r.acao);
    res.json({ ok: true, evento: eventoSemSegredos(r.acao.evento), avisos });
  } catch (e) {
    console.error("Erro na decisão do encerramento:", e);
    res.status(500).json({ error: "Não foi possível registrar a decisão." });
  }
});

app.listen(port, () => {
  console.log(`ARCHÉ disponível em http://localhost:${port}/`);
  // Lotes que acompanham o sistema (as submissões do edital) sobem sozinhos
  // no primeiro arranque que os encontrar — ver subirLotesIniciais. Depois
  // deles (e só depois: num arranque limpo os projetos precisam existir
  // primeiro), os anexos dos formulários — cronogramas e planilhas de
  // produção — são ligados a cada projeto.
  migrarAcoesExtensao()
    .then(() => subirAcoesMigradasExtensao())
    .then(() => marcarAcoesDePapel())
    // depois das ações existirem: as artes saem do arquivo de estado
    .then(() => migrarArtesParaODrive());
  // A ORDEM importa (num arranque limpo os projetos precisam existir antes de
  // qualquer coisa que os altere), mas uma etapa que falhe não pode levar as
  // seguintes junto: encadeadas por .then, um erro no meio fazia as de baixo
  // sumirem em silêncio — e ninguém percebe uma migração que não rodou. Cada
  // uma corre na sua vez, e o que quebrar fica dito no log.
  (async () => {
    for (const etapa of [
      aplicarInstituicaoNoArranque, // o catálogo de cursos editado pelo gestor
      subirHistoricoMonitoria,   // o arquivo da monitoria: só leitura de disco
      subirLotesIniciais, aplicarAnexosIniciais, zerarAlunosIniciais,
      enquadrarCronogramasIniciais, subirArquivoHistorico, subirAlunosHistoricos,
      removerAlunosEnsinoMedio, subirTurmasEM,
      completarTurmaEM2025, criarPreCadastrosEM, convidarTurmaEM2025,
      chamadaRegularizacao012025,
      propagarCpfOrientadores, identidadeInstitucionalDoProReitor, criarPreCadastros,
      aplicarAvaliacoesTranscritas,
      subirEspacosIniciais,      // catálogo do ARCHÉ ES, uma única vez
      aplicarCoresDosEspacos,    // as etiquetas de cor, no catálogo já gravado
      subirReservasMigradas,     // e as reservas que a recepção anotava à mão
      corrigirEmailsIndicacao,   // e-mail de aluno digitado errado na indicação
      reorganizarNumeracaoDasAtas, // acervo de atas: número na ordem das sessões
      subirEquipeAP,             // a coordenação do ARCHÉ AP, do arquivo em dados/
      subirProfessoresAP,        // e as listas de professores, curso a curso
      migrarCoordenadoresApParaInstituicao, // a dupla do AP vira a composição do curso
      // SEMPRE por último, e a cada arranque (achado de ago/2026 — o caso
      // Marlana): as migrações acima podem carimbar CPF em projeto que ainda
      // não tem e-mail, e uma vinculação que rodasse só uma vez, antes delas,
      // deixaria a pessoa "duplicada" no painel (a conta de um lado, os
      // projetos pelo CPF do outro) até alguém regravar o perfil. A passada é
      // idempotente e nunca sobrescreve e-mail existente.
      fundirContasSolicitadas,     // as fusões de conta pedidas pelo dono
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
  // a monitoria entra na mesma varredura: cobrança do relatório a partir
  // de 30 dias antes do prazo, semanal, até o envio
  setTimeout(() => varrerCobrancaMon().catch((e) => console.error("[cobranca-mon]", e.message)), 45_000).unref();
  setInterval(() => varrerCobrancaMon().catch((e) => console.error("[cobranca-mon]", e.message)), 60 * 60 * 1000).unref();
  // as aulas práticas entram na mesma varredura, mas o lembrete só sai na
  // SEGUNDA-FEIRA — é a própria função que confere o dia
  setTimeout(() => varrerCobrancaAP().catch((e) => console.error("[cobranca-ap]", e.message)), 60_000).unref();
  setInterval(() => varrerCobrancaAP().catch((e) => console.error("[cobranca-ap]", e.message)), 60 * 60 * 1000).unref();
  // o aviso de relatório enviado que se perdeu (falha de envio, deploy no
  // meio) volta pela mesma varredura horária — uma vez por relatório
  setTimeout(() => varrerAvisosAP().catch((e) => console.error("[avisos-ap]", e.message)), 75_000).unref();
  setInterval(() => varrerAvisosAP().catch((e) => console.error("[avisos-ap]", e.message)), 60 * 60 * 1000).unref();

  // a cópia DATADA do sistema, uma por dia (ver backupDoDia)
  setTimeout(() => backupDoDia().catch((e) => console.error("[backup]", e.message)), 90_000).unref();
  setInterval(() => backupDoDia().catch((e) => console.error("[backup]", e.message)), 60 * 60 * 1000).unref();
});
