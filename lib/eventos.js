/* ========================================================================
   ARCHÉ Eventos — eventos GRATUITOS dentro da Extensão.

   O evento NÃO é entidade nova: é uma ação de extensão (ex-acoes-v1) que
   ganha a configuração `evento` — página pública, inscrição online e
   credenciamento por QR na entrada. A certificação continua no sistema da
   AEE (decisão do dono): o ARCHÉ exporta a planilha no formato de lá.

   Aqui vivem só os helpers PUROS (sem storage, sem rede), para o servidor
   usar e os testes cobrirem:

     evento = { ativo, slug, descricao, vagas (0 = ilimitado), inscricoesAte,
                local (endereço, para o mapa da página pública),
                programacao: [ATIVIDADES — ver normalizarProgramacao: itens
                  ricos com id ESTÁVEL, tipo, horários, vagas próprias e
                  inscricao "geral" | "propria"],
                formulario: [CAMPOS EXTRAS — ver normalizarFormulario],
                lgpdTexto (vazio = LGPD_TEXTO_PADRAO),
                capa (data URL — pesada: NUNCA sai em payload; a página usa
                  a rota /capa e os demais veem só `temCapa`),
                transmissao: { tipo: ""|"youtube"|"zoom", youtubeId, zoomUrl,
                  chatYoutube, presencaMinutos, publicada },
                mural: [{ id, nome, texto, em, oculto }],
                chaveQr (segredo HMAC por evento), codigoMonitor }

     inscrito online = { nome, cpf, email, telefone, curso, ch,
                         origem: "online", inscritoEm, token,
                         atividades: [id],            // as "propria" marcadas
                         respostas: { idCampo: valor },
                         consentimento: { em, versao }, comunicacoes,
                         presente, presenteEm, presentePor,
                         presencas: [{ atividade, em, por }],  // "" = geral
                         online: { segundos, segundosVisiveis, ultimaEm } }

   O TOKEN é a credencial da inscrição: um id aleatório assinado com HMAC
   da chaveQr do evento. Quem apresenta o token (QR ou link) prova que a
   inscrição é dele — sem conta, sem senha. A chave é POR EVENTO de
   propósito: vazar a chave de um não abre os demais, e trocar o slug não
   quebra nada (o token não carrega slug nem id da ação).
   ======================================================================== */
import crypto from "node:crypto";
import { soDigitos } from "./cpf.js";

/* ------------------------------- slug ----------------------------------- */
/** Minúsculo, sem acento, hífens no lugar do resto. "" se não sobrar nada. */
export function slugDeNome(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,59}$/;

// endereços que a rota estática usa para as páginas fixas de /eventos/ — um
// evento com esse slug esconderia a própria página atrás da tela do monitor
// ou da vitrine (achado de ago/2026)
export const SLUGS_RESERVADOS = new Set(["credenciar", "index", "inscricao", "evento", "assistir", "gestao"]);
export const slugReservado = (s) => SLUGS_RESERVADOS.has(String(s || "").trim().toLowerCase());

/**
 * Slug único entre os eventos existentes: se "semana-de-enfermagem" já é de
 * outro evento, sai "semana-de-enfermagem-2", "-3"… Nunca devolve vazio —
 * um nome só de símbolos vira "evento".
 */
export function slugUnico(nome, emUso = []) {
  const base = slugDeNome(nome) || "evento";
  const usados = new Set(emUso.map((s) => String(s || "").toLowerCase()));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const tent = `${base}-${n}`;
    if (!usados.has(tent)) return tent;
  }
}

/* --------------------------- segredos do evento -------------------------- */
/** A chave HMAC do evento — gerada ao ativar, nunca sai em rota pública. */
export const gerarChaveQr = () => crypto.randomBytes(24).toString("base64url");

/** Código curto que a gestão passa aos monitores da entrada. Sem 0/O/1/I,
 *  que é o que se soletra por telefone no dia do evento sem confusão. */
export function gerarCodigoMonitor() {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (const b of crypto.randomBytes(6)) s += alfabeto[b % alfabeto.length];
  return s;
}

/* -------------------------------- token ---------------------------------
   id aleatório (10 hex) + HMAC-SHA256 da chaveQr truncado (12 hex) = 22
   caracteres — curto o bastante para um QR pequeno e para digitar à mão em
   último caso. Os 6 primeiros são o "código" de conferência manual. */
const assinar = (chaveQr, id) =>
  crypto.createHmac("sha256", String(chaveQr)).update(String(id)).digest("hex").slice(0, 12);

export function gerarToken(chaveQr) {
  const id = crypto.randomBytes(5).toString("hex");
  return id + assinar(chaveQr, id);
}

/** Confere a assinatura em tempo constante. Formato errado recusa antes. */
export function tokenValido(chaveQr, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!chaveQr || !/^[0-9a-f]{22}$/.test(t)) return false;
  const esperado = Buffer.from(assinar(chaveQr, t.slice(0, 10)));
  const dado = Buffer.from(t.slice(10));
  try {
    return esperado.length === dado.length && crypto.timingSafeEqual(esperado, dado);
  } catch { return false; }
}

/** O código manual de conferência: os 6 primeiros caracteres do token. */
export const codigoDe = (token) => String(token || "").slice(0, 6).toLowerCase();

/**
 * Encontra a inscrição pelo token completo (assinatura conferida) ou pelo
 * código de 6 caracteres (fallback manual da entrada — sem assinatura, mas
 * a rota de check-in exige o código do monitor antes de chegar aqui).
 * Prefixo ambíguo (duas inscrições com o mesmo início) devolve null: na
 * dúvida, o monitor pede o token completo em vez de credenciar o errado.
 */
export function inscritoPorToken(evento, inscritos, { token, codigo } = {}) {
  const lista = (inscritos || []).filter((i) => i && i.token);
  if (token) {
    if (!tokenValido(evento?.chaveQr, token)) return null;
    const t = String(token).trim().toLowerCase();
    return lista.find((i) => String(i.token).toLowerCase() === t) || null;
  }
  const c = String(codigo || "").trim().toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(c)) return null;
  const achados = lista.filter((i) => String(i.token).toLowerCase().startsWith(c));
  return achados.length === 1 ? achados[0] : null;
}

/* ------------------ programação = ATIVIDADES do evento ------------------- */
// Catálogo dos tipos de atividade (mesma filosofia dos catálogos de
// lib/edital.js): os `codigo` são a chave do que já está gravado — ao
// evoluir a lista, preserve-os.
export const TIPOS_ATIVIDADE = [
  { codigo: "palestra", rotulo: "Palestra" },
  { codigo: "minicurso", rotulo: "Minicurso" },
  { codigo: "oficina", rotulo: "Oficina" },
  { codigo: "curso", rotulo: "Curso" },
  { codigo: "mesa", rotulo: "Mesa-redonda" },
  { codigo: "roda", rotulo: "Roda de conversa" },
  { codigo: "mostra", rotulo: "Mostra" },
  { codigo: "apresentacao", rotulo: "Apresentação" },
  { codigo: "outro", rotulo: "Outro" },
];
const TIPOS_VALIDOS = new Set(TIPOS_ATIVIDADE.map((t) => t.codigo));

const ID_CURTO = /^[0-9a-f]{8}$/;
/** Id curto (8 hex) para itens de lista — atividade, campo, mensagem. */
export function gerarIdCurto(evitar) {
  let id;
  do { id = crypto.randomBytes(4).toString("hex"); } while (evitar?.has?.(id));
  return id;
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* O controle de frequência da atividade. "entrada" é o padrão porque é o que
   o evento comum faz; os outros dois são escolha do organizador. */
export const FREQUENCIAS = [
  { codigo: "nenhum", rotulo: "Sem controle nesta atividade",
    ajuda: "Ninguém credencia aqui: quem está inscrito no evento recebe as horas desta atividade." },
  { codigo: "entrada", rotulo: "Frequência única",
    ajuda: "Uma leitura do QR, na chegada — o padrão." },
  { codigo: "entrada_saida", rotulo: "Início e fim",
    ajuda: "Duas leituras, na chegada e na saída: conta o tempo de permanência e não certifica quem sai antes do fim." },
];

/* O EVENTO decide antes de cada atividade (decisão do dono, ago/2026): há
   evento em que parar todo mundo na porta é inviável — feira aberta, culto,
   ato público —, e ali a inscrição JÁ É a frequência. Com o controle
   desligado, ninguém credencia e todo inscrito conta como presente (100%);
   com ele ligado, cada atividade escolhe o seu modo. */
export const eventoControlaFrequencia = (evento) => evento?.controleFrequencia !== false;

/* NEM TODO EVENTO QUER UM SITE (pedido do dono, ago/2026): o professor que
   dá uma palestra e quer só a lista de presença por QR não tem por que
   montar hotsite — capa, programação, blocos, mapa. Com `hotsite: false` a
   página do evento vira só a FOLHA DE INSCRIÇÃO: o QR projetado no fim da
   palestra leva a um formulário curto, a pessoa se inscreve ali e recebe a
   credencial. O evento também sai da vitrine — quem não montou página não
   está divulgando nada. Tudo o mais (credenciamento, presenças, exports,
   certificados) é idêntico: o que muda é só o que o público vê. */
export const temHotsiteEvento = (evento) => evento?.hotsite !== false;

/** Presente para efeito de contagem: com o controle desligado, todo inscrito. */
export const contaPresente = (evento, inscrito) =>
  eventoControlaFrequencia(evento) ? inscrito?.presente === true : true;
const FREQUENCIAS_VALIDAS = new Set(FREQUENCIAS.map((f) => f.codigo));

/** Minutos entre duas marcas ISO — a permanência do participante. */
export function minutosEntre(inicio, fim) {
  const a = Date.parse(inicio || ""), b = Date.parse(fim || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}
/** "2h15" / "45min" — como a tela do monitor mostra a permanência. */
export function duracaoBR(minutos) {
  const m = Math.max(0, Math.trunc(Number(minutos) || 0));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/**
 * Normaliza as atividades da programação: apara os campos, descarta a linha
 * sem título e ordena por dia e hora de início — é a ordem em que a página
 * pública as apresenta, agrupadas por dia.
 *
 * Cada item tem um ID ESTÁVEL: é ele que o inscrito marca e que o check-in
 * registra — se o id mudasse a cada edição, todos os vínculos se perderiam.
 * Por isso um id válido recebido é preservado (duplicado ganha outro, senão
 * duas atividades seriam indistinguíveis) e só o item novo ganha id novo.
 * COMPAT: o item antigo tinha só `hora` — vira `horaInicio`.
 */
export function normalizarProgramacao(lista) {
  const txt = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const hora = (v) => { const s = txt(v, 5); return HORA_RE.test(s) ? s : ""; };
  const usados = new Set();
  return (Array.isArray(lista) ? lista : [])
    .map((p) => {
      const item = {
        id: ID_CURTO.test(String(p?.id || "")) && !usados.has(p.id) ? p.id : gerarIdCurto(usados),
        tipo: TIPOS_VALIDOS.has(p?.tipo) ? p.tipo : "outro",
        titulo: txt(p?.titulo),
        descricao: txt(p?.descricao, 1000),
        dia: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.dia || "")) ? p.dia : "",
        horaInicio: hora(p?.horaInicio ?? p?.hora),
        horaFim: hora(p?.horaFim),
        local: txt(p?.local, 120),
        responsavel: txt(p?.responsavel, 120),
        vagas: Math.max(0, Math.trunc(Number(p?.vagas)) || 0),   // 0 = sem limite próprio
        ch: txt(p?.ch, 20),
        // geral = quem está inscrito no evento participa (abertura, palestra
        // magna); propria = o participante MARCA a atividade e ela conta vaga
        inscricao: p?.inscricao === "propria" ? "propria" : "geral",
        modalidade: p?.modalidade === "online" ? "online" : "presencial",
        // Como se controla a frequência DESTA atividade (decisão do dono,
        // ago/2026) — evento grande às vezes não comporta credenciamento, e
        // atividade longa quer saber quem ficou até o fim:
        //   nenhum        = não se credencia; quem está inscrito recebe as horas
        //   entrada       = uma leitura, na chegada (o padrão)
        //   entrada_saida = duas leituras, chegada e saída, para contar o tempo
        frequencia: FREQUENCIAS_VALIDAS.has(p?.frequencia) ? p.frequencia : "entrada",
        // a foto de quem ministra, para a vitrine de palestrantes da página
        // (pedido do dono, ago/2026). Fica na configuração como a capa —
        // pequena, cortada em quadrado pelo navegador antes de subir — e é
        // servida por rota própria: nunca viaja nos payloads.
        foto: imagemPequena(p?.foto, FOTO_MAX),
        instituicao: txt(p?.instituicao, 120),
        miniBio: txt(p?.miniBio, 400),
      };
      usados.add(item.id);
      return item;
    })
    .filter((p) => p.titulo)
    .sort((a, b) => (a.dia + " " + a.horaInicio).localeCompare(b.dia + " " + b.horaInicio))
    .slice(0, 200);
}

/* ------------------ equipe do evento e o certificado ---------------------
   Palestrantes e comissão organizadora recebem certificado À PARTE do
   participante, e quem emite é o sistema da AEE, a partir da planilha que o
   ARCHÉ exporta. A planilha tem colunas fixas — CPF/matrícula, nome, e-mail,
   telefone (e a palestra, no caso do palestrante) —, e linha incompleta lá
   é certificado que não sai. Por isso a régua é a MESMA aqui e na tela: o
   que falta se vê antes, no cadastro, e não na véspera da entrega.
   (decisão do dono, ago/2026) */
export const PAPEIS_COMISSAO = [
  { codigo: "coordenacao", rotulo: "Coordenação do evento" },
  { codigo: "professor", rotulo: "Professor(a)" },
  { codigo: "monitor", rotulo: "Monitor(a)" },
  { codigo: "aluno", rotulo: "Aluno(a) organizador(a)" },
  { codigo: "colaborador", rotulo: "Colaborador(a)" },
  { codigo: "apoio", rotulo: "Apoio técnico" },
];
const PAPEIS_VALIDOS = new Set(PAPEIS_COMISSAO.map((p) => p.codigo));

/** O que falta na pessoa para o certificado sair pela planilha da AEE. */
export function faltaParaCertificado(pessoa, { palestrante = false } = {}) {
  const falta = [];
  const tem = (v) => String(v ?? "").trim().length > 0;
  if (!tem(pessoa?.nome)) falta.push("nome");
  if (!tem(pessoa?.cpf) && !tem(pessoa?.matricula)) falta.push("CPF ou matrícula");
  if (!tem(pessoa?.email)) falta.push("e-mail");
  if (!tem(pessoa?.telefone)) falta.push("telefone");
  if (palestrante && !tem(pessoa?.palestra)) falta.push("título da palestra");
  return falta;
}

/** Quantas linhas de cada lista sairiam incompletas na planilha da AEE. */
export function pendenciasCertificado(acao) {
  const parts = acao?.participantes || {};
  const conta = (lista, opts) => (lista || []).filter((x) => faltaParaCertificado(x, opts).length).length;
  return {
    inscritos: conta(parts.inscritos),
    palestrantes: conta(parts.palestrantes, { palestrante: true }),
    comissao: conta(parts.comissao),
  };
}

/** Normaliza uma pessoa da equipe (palestrante ou comissão). */
export function normalizarPessoaEvento(x, { palestrante = false } = {}) {
  const txt = (v, max = 160) => String(v ?? "").trim().slice(0, max);
  const base = {
    nome: txt(x?.nome),
    cpf: soDigitos(x?.cpf).slice(0, 11),
    matricula: txt(x?.matricula, 40),
    email: txt(x?.email, 160).toLowerCase(),
    telefone: txt(x?.telefone, 40),
    ch: txt(x?.ch, 20),
  };
  return palestrante
    ? { ...base, palestra: txt(x?.palestra, 200), instituicao: txt(x?.instituicao, 160) }
    : { ...base, papel: PAPEIS_VALIDOS.has(x?.papel) ? x.papel : "colaborador", funcao: txt(x?.funcao, 120) };
}

/* ---------------------- imagens da página do evento ----------------------
   Foto de palestrante e logotipo de apoiador moram na configuração do evento,
   que é regravada inteira a cada gravação — por isso entram com teto e já
   reduzidas pelo navegador. Imagem fora do formato (ou grande demais) é
   DESCARTADA em silêncio em vez de derrubar a gravação inteira: o organizador
   perde a foto, não a programação. */
const FOTO_MAX = 90 * 1024;          // ~320 px em JPEG
const LOGO_MAX = 70 * 1024;          // logotipo de apoiador
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
/**
 * A imagem que pode ficar guardada: pequena o bastante, e no formato certo.
 * Aceita as DUAS formas (ago/2026): a data URL, que é conferida pelo teto, e
 * a REFERÊNCIA ao arquivo no Drive (`{ fileId, tipo }`), que passa direto —
 * quem confere o tamanho dela é quem a subiu, antes de a guardar. Sem isso,
 * a normalização apagaria toda arte já migrada na primeira gravação.
 */
export function imagemPequena(v, teto) {
  if (v && typeof v === "object" && typeof v.fileId === "string" && v.fileId) return v;
  const s = String(v || "");
  const m = s.match(IMG_RE);
  if (!m) return "";
  return m[2].length * 3 / 4 <= teto ? s : "";
}

/* ------------------------- blocos da página ------------------------------
   Além da programação e da inscrição, a página do evento aceita BLOCOS que o
   organizador monta (pedido do dono, ago/2026). São quatro tipos, e cada um
   existe por uma razão de evento acadêmico:

   · texto      — o que o hotsite não previu (chamada, hospedagem, contato);
   · submissao  — a submissão de trabalhos, que acontece FORA daqui: o sistema
                  oficial é o OJS da revista. O bloco leva o participante para
                  lá, com prazos e normas à vista — integrar por link é o certo:
                  duplicar a submissão criaria duas filas para o mesmo resumo;
   · anais      — os anais do evento (o CONINT e as semanas de curso têm os
                  seus), inclusive os das edições anteriores;
   · apoiadores — patrocínio, apoio e realização, com logotipo. */
export const TIPOS_BLOCO = [
  { codigo: "texto", rotulo: "Texto livre", ajuda: "Um assunto à parte: chamada, hospedagem, contato, o que o evento pedir." },
  { codigo: "submissao", rotulo: "Submissão de trabalhos", ajuda: "Leva ao sistema oficial de submissão (o OJS da revista), com prazos e normas." },
  { codigo: "anais", rotulo: "Anais do evento", ajuda: "Os anais desta edição e das anteriores, com link e ISSN." },
  { codigo: "apoiadores", rotulo: "Apoio e patrocínio", ajuda: "Logotipos de quem realiza, patrocina e apoia o evento." },
  { codigo: "video", rotulo: "Vídeo (YouTube)", ajuda: "Chamada, teaser ou a gravação de uma edição anterior, tocando na própria página." },
  { codigo: "redes", rotulo: "Mídias sociais", ajuda: "Os perfis do evento ou do curso — o que leva o público a acompanhar a divulgação." },
];

/* As redes que a divulgação de evento usa de fato. Catálogo fechado porque
   cada uma tem ícone e endereço próprios; `site` cobre o resto (blog, página
   do curso). Os `codigo` são a chave do que já está gravado. */
export const REDES_SOCIAIS = [
  { codigo: "instagram", rotulo: "Instagram" },
  { codigo: "facebook", rotulo: "Facebook" },
  { codigo: "youtube", rotulo: "YouTube" },
  { codigo: "linkedin", rotulo: "LinkedIn" },
  { codigo: "tiktok", rotulo: "TikTok" },
  { codigo: "x", rotulo: "X (Twitter)" },
  { codigo: "whatsapp", rotulo: "WhatsApp" },
  { codigo: "telegram", rotulo: "Telegram" },
  { codigo: "site", rotulo: "Site" },
];
const REDES_VALIDAS = new Set(REDES_SOCIAIS.map((r) => r.codigo));
const TIPOS_BLOCO_VALIDOS = new Set(TIPOS_BLOCO.map((t) => t.codigo));
export const CATEGORIAS_APOIO = [
  { codigo: "realizacao", rotulo: "Realização" },
  { codigo: "patrocinio", rotulo: "Patrocínio" },
  { codigo: "apoio", rotulo: "Apoio" },
];
const CATEGORIAS_VALIDAS = new Set(CATEGORIAS_APOIO.map((c) => c.codigo));

/** Só http(s): um "javascript:" num link do hotsite é XSS na página pública. */
export function urlSegura(v) {
  const s = String(v || "").trim().slice(0, 500);
  if (!s) return "";
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
  } catch { return ""; }
}

export function normalizarBlocos(lista) {
  const txt = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const usados = new Set();
  const adotar = (id) => { usados.add(id); return id; };
  return (Array.isArray(lista) ? lista : [])
    .map((b) => {
      const tipo = TIPOS_BLOCO_VALIDOS.has(b?.tipo) ? b.tipo : "texto";
      const bloco = {
        id: ID_CURTO.test(String(b?.id || "")) && !usados.has(b.id) ? b.id : gerarIdCurto(usados),
        tipo,
        titulo: txt(b?.titulo, 120),
        texto: txt(b?.texto, 4000),
        // o botão principal do bloco (o OJS, na submissão)
        url: urlSegura(b?.url),
        rotuloBotao: txt(b?.rotuloBotao, 60),
        visivel: b?.visivel !== false,
        itens: [],
      };
      if (tipo === "submissao") {
        bloco.prazos = (Array.isArray(b?.prazos) ? b.prazos : []).slice(0, 12).map((p) => ({
          rotulo: txt(p?.rotulo, 80),
          data: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.data || "")) ? p.data : "",
        })).filter((p) => p.rotulo);
        bloco.normasUrl = urlSegura(b?.normasUrl);
      }
      if (tipo === "anais") {
        bloco.itens = (Array.isArray(b?.itens) ? b.itens : []).slice(0, 30).map((i) => ({
          titulo: txt(i?.titulo, 160),
          ano: /^\d{4}$/.test(String(i?.ano || "")) ? String(i.ano) : "",
          url: urlSegura(i?.url),
          issn: txt(i?.issn, 20),
        })).filter((i) => i.titulo);
      }
      if (tipo === "video") {
        // guarda só o ID: o player é montado pela página (youtube-nocookie),
        // e o organizador cola o link inteiro do YouTube sem pensar nisso
        bloco.youtubeId = videoIdDe(b?.youtubeId || b?.url || "");
        bloco.url = "";
      }
      if (tipo === "redes") {
        bloco.itens = (Array.isArray(b?.itens) ? b.itens : []).slice(0, 12).map((i) => ({
          rede: REDES_VALIDAS.has(i?.rede) ? i.rede : "site",
          rotulo: txt(i?.rotulo, 60),
          url: urlSegura(i?.url),
        })).filter((i) => i.url);
      }
      if (tipo === "apoiadores") {
        // o id do apoiador é a chave da rota que serve o logotipo: precisa
        // sobreviver a cada gravação, senão a imagem "some" ao salvar
        bloco.itens = (Array.isArray(b?.itens) ? b.itens : []).slice(0, 40).map((i) => ({
          id: ID_CURTO.test(String(i?.id || "")) && !usados.has(i.id) ? adotar(i.id) : gerarIdCurto(usados),
          nome: txt(i?.nome, 120),
          categoria: CATEGORIAS_VALIDAS.has(i?.categoria) ? i.categoria : "apoio",
          url: urlSegura(i?.url),
          logo: imagemPequena(i?.logo, LOGO_MAX),
        })).filter((i) => i.nome);
      }
      usados.add(bloco.id);
      return bloco;
    })
    .filter((b) => b.titulo || b.texto || b.itens.length)
    .slice(0, 12);
}

/** As atividades que o participante marca uma a uma (e que contam vaga). */
export const atividadesInscriviveis = (evento) =>
  (evento?.programacao || []).filter((p) => p?.inscricao === "propria" && p.id);

/**
 * Vagas restantes de UMA atividade: null = sem limite próprio (vagas 0 ou
 * ausente); senão a diferença para os inscritos que a marcaram. Nunca
 * negativa — a cota pode ter sido reduzida depois das marcações.
 */
export function vagasAtividade(atividade, inscritos) {
  const vagas = Math.max(0, Math.trunc(Number(atividade?.vagas)) || 0);
  if (vagas <= 0) return null;
  const id = atividade?.id;
  const usadas = (inscritos || [])
    .filter((i) => Array.isArray(i?.atividades) && i.atividades.includes(id)).length;
  return Math.max(0, vagas - usadas);
}

// soma um minuto só para a comparação ("23:59" vira "24:00", que não existe
// no relógio mas ordena certo lexicograficamente — nunca é gravado)
const maisUmMinuto = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  const t = h * 60 + m + 1;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
};

/**
 * Duas atividades disputam o mesmo horário? Mesmo dia e intervalos
 * [horaInicio, horaFim) sobrepostos. Sem horaFim, o intervalo vale um
 * minuto — o bastante para "mesma hora" colidir. Sem dia ou sem início não
 * há o que comparar (false). O conflito NÃO barra a escolha: a página só
 * avisa — quem decide se dá tempo é o participante.
 */
export function conflitoHorario(a, b) {
  if (!a?.dia || !b?.dia || a.dia !== b.dia) return false;
  if (!a.horaInicio || !b.horaInicio) return false;
  const fim = (x) => (x.horaFim && x.horaFim > x.horaInicio ? x.horaFim : maisUmMinuto(x.horaInicio));
  return a.horaInicio < fim(b) && b.horaInicio < fim(a);
}

/**
 * O participante pode marcar esta atividade? Devolve { ok } ou
 * { ok: false, motivo } com a frase de tela (e `semVaga: true` quando o
 * motivo é lotação, para a rota responder 409). `jaEscolhidas` são os ids
 * que o participante JÁ tem: manter o que é seu não disputa vaga de novo.
 */
export function podeEscolherAtividade(evento, atividade, inscritos, jaEscolhidas = []) {
  const id = typeof atividade === "string" ? atividade : atividade?.id;
  const atv = (evento?.programacao || []).find((p) => p?.id && p.id === id);
  if (!atv) return { ok: false, motivo: "Esta atividade não está na programação do evento." };
  if (atv.inscricao !== "propria")
    return { ok: false, motivo: `“${atv.titulo}” não pede inscrição própria — quem está inscrito no evento já participa.` };
  if ((jaEscolhidas || []).includes(atv.id)) return { ok: true, atividade: atv };
  const restam = vagasAtividade(atv, inscritos);
  if (restam !== null && restam <= 0)
    return { ok: false, semVaga: true, motivo: `As vagas de “${atv.titulo}” já foram todas preenchidas.` };
  return { ok: true, atividade: atv };
}

/* ------------------- campos extras do formulário ------------------------- */
export const TIPOS_CAMPO_FORMULARIO = ["texto", "paragrafo", "selecao", "multipla", "caixa"];

/**
 * Normaliza o catálogo de campos extras da inscrição: descarta campo sem
 * rótulo, preserva ids válidos (são a chave das respostas já gravadas) e
 * gera os que faltam. Opções só existem em seleção/múltipla.
 */
export function normalizarFormulario(lista) {
  const txt = (v, max) => String(v ?? "").trim().slice(0, max);
  const usados = new Set();
  return (Array.isArray(lista) ? lista : [])
    .map((c) => {
      const tipo = TIPOS_CAMPO_FORMULARIO.includes(c?.tipo) ? c.tipo : "texto";
      const campo = {
        id: ID_CURTO.test(String(c?.id || "")) && !usados.has(c.id) ? c.id : gerarIdCurto(usados),
        rotulo: txt(c?.rotulo, 120),
        tipo,
        opcoes: ["selecao", "multipla"].includes(tipo)
          ? (Array.isArray(c?.opcoes) ? c.opcoes : []).map((o) => txt(o, 60)).filter(Boolean).slice(0, 20)
          : [],
        obrigatorio: !!c?.obrigatorio,
        instrucoes: txt(c?.instrucoes, 200),
      };
      usados.add(campo.id);
      return campo;
    })
    .filter((c) => c.rotulo)
    .slice(0, 20);
}

/**
 * Valida e SANEIA as respostas do inscrito contra o catálogo do evento —
 * o catálogo da base decide, nunca o que o cliente diz que o formulário
 * era. Devolve { ok, erros, respostas }: as respostas saem aparadas
 * (texto ≤300, parágrafo ≤2000), a seleção só aceita opção oferecida, a
 * múltipla vira array ⊆ opções e a caixa vira boolean. Obrigatório vazio
 * entra em `erros` com o rótulo — é a frase que a página mostra.
 */
export function validarRespostas(formulario, respostas) {
  const erros = [];
  const out = {};
  const r = respostas && typeof respostas === "object" && !Array.isArray(respostas) ? respostas : {};
  for (const c of Array.isArray(formulario) ? formulario : []) {
    const v = r[c.id];
    if (c.tipo === "caixa") {
      out[c.id] = v === true || v === "true" || v === "sim";
      if (c.obrigatorio && !out[c.id]) erros.push(`Marque “${c.rotulo}”.`);
    } else if (c.tipo === "multipla") {
      const escolhas = (Array.isArray(v) ? v : v == null || v === "" ? [] : [v])
        .map((x) => String(x)).filter((x) => c.opcoes.includes(x));
      out[c.id] = [...new Set(escolhas)];
      if (c.obrigatorio && !out[c.id].length) erros.push(`Escolha ao menos uma opção em “${c.rotulo}”.`);
    } else if (c.tipo === "selecao") {
      const s = String(v ?? "").trim();
      const valida = c.opcoes.includes(s);
      out[c.id] = valida ? s : "";
      if (s && !valida) erros.push(`A resposta de “${c.rotulo}” não está entre as opções oferecidas.`);
      else if (c.obrigatorio && !s) erros.push(`Preencha “${c.rotulo}”.`);
    } else {
      const max = c.tipo === "paragrafo" ? 2000 : 300;
      // caracteres de controle fora — a quebra de linha fica (o parágrafo é dele)
      out[c.id] = String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
      if (c.obrigatorio && !out[c.id]) erros.push(`Preencha “${c.rotulo}”.`);
    }
  }
  return { ok: !erros.length, erros, respostas: out };
}

/* ----------------------------- LGPD -------------------------------------- */
/* O texto institucional que a página de inscrição mostra e com o qual o
   participante concorda. O evento pode trocá-lo (evento.lgpdTexto); o que
   fica gravado no inscrito é a VERSÃO (hash) do texto usado naquele momento
   — é o que prova, depois, com qual redação a pessoa concordou. */
export const LGPD_TEXTO_PADRAO =
  "Os dados pessoais desta inscrição (nome, CPF, e-mail, telefone, curso/instituição de " +
  "origem e as respostas do formulário) são tratados pelo Centro Universitário Evangélico " +
  "de Goianésia — UNIEGO, por meio da Pró-Reitoria de Pesquisa, Pós-Graduação e Extensão " +
  "(PROPPEX), controladora dos dados, com as finalidades de: gestão do evento, " +
  "credenciamento na entrada, emissão de certificados e comunicações sobre este evento. " +
  "Os registros ficam guardados com a documentação institucional da ação de extensão e " +
  "não são usados nem compartilhados fora dessas finalidades. Você pode exercer os " +
  "direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018) — " +
  "confirmação, acesso, correção e eliminação, entre outros — pelo e-mail " +
  "eventos@uniego.edu.br.";

/** O texto de tratamento em vigor no evento: o configurado ou o padrão. */
export const textoLgpd = (evento) => String(evento?.lgpdTexto || "").trim() || LGPD_TEXTO_PADRAO;

/* --------------------- projeto do evento (publicação) ---------------------
   A página pública só entra no ar com o PROJETO do evento completo (decisão
   do dono, ago/2026): a mesma régua de campos obrigatórios do formulário de
   proposta da Extensão. O assistente do ARCHÉ EV cria a ação só com o
   essencial — esta lista é o que diz o que ainda falta, e a guia "Dados do
   evento" é onde se completa. */
export const CAMPOS_PROJETO_EVENTO = [
  ["curso", "curso"],
  ["nomeAtividade", "nome do evento"],
  ["periodoInicio", "data de início"],
  ["periodoFim", "data de encerramento"],
  ["cargaHoraria", "carga horária"],
  ["publicoAlvo", "público-alvo"],
  ["local", "local"],
  ["municipio", "município"],
  ["justificativa", "justificativa"],
  ["objetivoGeral", "objetivo geral"],
  ["objetivosEspecificos", "objetivos específicos"],
  ["metodologia", "metodologia"],
  ["respNome", "nome do responsável"],
  ["respCargo", "cargo do responsável"],
  ["respTelefone", "telefone do responsável"],
  ["respEmail", "e-mail do responsável"],
];

/** Os rótulos do que falta no projeto para a página poder ser publicada. */
export function faltaNoProjetoDoEvento(acao) {
  const p = acao?.proposta || {};
  return CAMPOS_PROJETO_EVENTO
    .filter(([campo]) => !String((campo === "curso" ? acao?.curso : p[campo]) || "").trim())
    .map(([, rotulo]) => rotulo);
}

/* ------------------------- ação de MAIS DE UM CURSO ------------------------
   Pedido de um professor, ago/2026: a Jornada é de Engenharia Mecânica E de
   Engenharia Civil, e o formulário só aceitava um curso. Abrir duas ações
   para o mesmo evento seria pior de todos os lados — duas propostas para a
   PROPPEX aprovar, dois números na sequência oficial, duas páginas públicas
   com o mesmo QR e a contagem de participantes partida ao meio.

   Por isso o curso PRINCIPAL continua sendo UM (`acao.curso`): é ele que
   nomeia a pasta no Drive (`extensao/<curso>/…`) e responde pela ação. Os
   demais entram em `cursosExtras` — os cursos CO-REALIZADORES. Assim nada do
   que já existe muda de forma, e o evento aparece para as duas coordenações.

   O limite de quatro não é capricho: uma ação de cinco cursos é
   institucional, e para isso a lista já tem "Institucional / PROPPEX". */
export const MAX_CURSOS_EXTRAS = 4;

const chaveCurso = (v) => String(v ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Os cursos co-realizadores, limpos: só nomes do catálogo, sem repetição,
 * sem o principal (que já está em `acao.curso` — repeti-lo faria a ficha
 * dizer "Enfermagem e Enfermagem") e no máximo MAX_CURSOS_EXTRAS.
 *
 * `catalogo` vazio aceita qualquer nome não vazio: é o que permite chamar a
 * função sem carregar a lista, e o servidor sempre a passa.
 */
export function normalizarCursosExtras(valor, principal = "", catalogo = []) {
  const permitido = new Map((catalogo || [])
    .map((c) => String(c ?? "").trim()).filter(Boolean)
    .map((c) => [chaveCurso(c), c]));
  const vistos = new Set([chaveCurso(principal)]);
  const out = [];
  for (const bruto of Array.isArray(valor) ? valor : []) {
    const nome = String(bruto ?? "").trim();
    if (!nome) continue;
    const k = chaveCurso(nome);
    if (!k || vistos.has(k)) continue;
    if (permitido.size && !permitido.has(k)) continue;   // fora do catálogo não entra
    vistos.add(k);
    out.push(permitido.size ? permitido.get(k) : nome);  // grava a grafia do catálogo
    if (out.length >= MAX_CURSOS_EXTRAS) break;
  }
  return out;
}

/** Todos os cursos da ação, o principal à frente. Vazio nunca entra. */
export const cursosDaAcao = (acao) =>
  [String(acao?.curso ?? "").trim(), ...(Array.isArray(acao?.cursosExtras) ? acao.cursosExtras : [])]
    .map((c) => String(c ?? "").trim()).filter(Boolean);

/** Como o curso da ação se escreve numa linha: "A, B e C". */
export function cursosEmTexto(acao) {
  const cs = cursosDaAcao(acao);
  if (cs.length <= 1) return cs[0] || "";
  return cs.slice(0, -1).join(", ") + " e " + cs[cs.length - 1];
}

/** A ação é deste curso? Vale para o principal E para os co-realizadores —
    senão o filtro do outro curso não encontraria o evento dele. */
export const acaoDoCurso = (acao, curso) => {
  const k = chaveCurso(curso);
  return !!k && cursosDaAcao(acao).some((c) => chaveCurso(c) === k);
};

/** A versão curta (hash) de um texto LGPD — o que se grava no consentimento. */
export const versaoLgpd = (texto) =>
  crypto.createHash("sha256").update(String(texto ?? "")).digest("hex").slice(0, 8);

/* --------------------------- transmissão online --------------------------- */
/**
 * Extrai o id de vídeo do YouTube do que a gestão colar — o id puro ou as
 * URLs usuais (watch?v=, youtu.be/, /live/, /embed/). Inválido → "".
 */
export function videoIdDe(entrada) {
  const s = String(entrada || "").trim();
  if (!s) return "";
  if (/^[A-Za-z0-9_-]{6,20}$/.test(s)) return s;
  const m = s.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|live\/|embed\/|shorts\/))([A-Za-z0-9_-]{6,20})/i,
  );
  return m ? m[1] : "";
}

/* ----------------------- números do evento (snapshot) -------------------- */
/**
 * O quadro de números que entra no relatório final quando a ação tem
 * evento: inscritos, presenças (física e online), recorte por atividade e
 * mural. Calculado sempre da BASE do servidor — é a verdade do sistema de
 * inscrições, não o que a tela digitou — e gravado como snapshot datado:
 * relatório é documento, e documento não muda sozinho depois.
 */
export function numerosDoEvento(acao) {
  const ev = acao?.evento || {};
  const inscritos = acao?.participantes?.inscritos || [];
  const online = inscritos.filter((i) => i?.origem === "online").length;
  const presencasDe = (id) =>
    inscritos.filter((i) => (i?.presencas || []).some((p) => String(p?.atividade || "") === id)).length;
  const marcaramA = (id) =>
    inscritos.filter((i) => Array.isArray(i?.atividades) && i.atividades.includes(id)).length;
  const porAtividade = (ev.programacao || [])
    .filter((p) => p?.id && (p.inscricao === "propria" || presencasDe(p.id) > 0))
    .map((p) => ({
      id: p.id, titulo: p.titulo || "", inscritos: marcaramA(p.id),
      // atividade sem controle (ou evento sem controle) conta quem a marcou
      presentes: (!eventoControlaFrequencia(ev) || p.frequencia === "nenhum")
        ? marcaramA(p.id) : presencasDe(p.id),
    }));
  // sem controle de frequência, a inscrição é a presença: 100% dos inscritos
  const controla = eventoControlaFrequencia(ev);
  return {
    inscritos: inscritos.length,
    controleFrequencia: controla,
    presentes: controla ? inscritos.filter((i) => i?.presente === true).length : inscritos.length,
    online,
    manuais: inscritos.length - online,
    presentesOnline: inscritos.filter((i) => /^online/.test(String(i?.presentePor || ""))).length,
    porAtividade,
    comentariosMural: (ev.mural || []).filter((m) => m && !m.oculto).length,
    geradoEm: new Date().toISOString(),
  };
}

/* ------------------------------ inscrição -------------------------------- */
/** Vagas restantes: null = ilimitado (vagas 0 ou ausente). Nunca negativo. */
export function vagasRestantes(evento, inscritos) {
  const vagas = Number(evento?.vagas) || 0;
  if (vagas <= 0) return null;
  return Math.max(0, vagas - (inscritos || []).length);
}

/** O prazo de inscrição: o configurado ou, por padrão, o fim do evento. */
export const prazoInscricao = (evento, acao) =>
  evento?.inscricoesAte || acao?.proposta?.periodoFim || "";

export const RE_HORA_LIMITE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A hora em que a inscrição fecha NO ÚLTIMO DIA ("HH:MM"; vazio = o dia
 * inteiro). Pedido dos coordenadores (ago/2026): o QR da palestra fica no
 * telão, alguém o fotografa, e quem não foi se inscreve à noite — a
 * presença sai certa e a inscrição, não. A hora vale para o dia do prazo,
 * seja ele o configurado ou o fim do evento: quem só quer fechar às 21h da
 * palestra de hoje não precisa repetir a data.
 */
export const horaLimiteInscricao = (evento) =>
  RE_HORA_LIMITE.test(String(evento?.inscricoesAteHora || "")) ? evento.inscricoesAteHora : "";

/** O prazo (data + hora) já venceu? `agora` é "HH:MM" local. */
export function prazoInscricaoVencido(acao, hoje, agora = "") {
  const ate = prazoInscricao(acao?.evento, acao);
  if (!ate || !hoje) return false;
  if (hoje > ate) return true;
  const hora = horaLimiteInscricao(acao?.evento);
  return !!(hora && agora && hoje === ate && agora > hora);
}

/**
 * A inscrição está aberta? Devolve { ok } ou { ok: false, motivo } — o
 * motivo já é a frase que a página pública mostra.
 */
export function podeInscrever(acao, hoje, agora = "") {
  const ev = acao?.evento;
  if (!ev?.ativo) return { ok: false, motivo: "As inscrições deste evento não estão abertas." };
  if (prazoInscricaoVencido(acao, hoje, agora)) {
    const hora = horaLimiteInscricao(ev);
    return { ok: false, motivo: hora && hoje === prazoInscricao(ev, acao)
      ? `O prazo de inscrição deste evento se encerrou às ${hora}.`
      : "O prazo de inscrição deste evento já se encerrou." };
  }
  const restam = vagasRestantes(ev, acao?.participantes?.inscritos);
  if (restam !== null && restam <= 0)
    return { ok: false, motivo: "As vagas deste evento já foram todas preenchidas." };
  return { ok: true };
}

/**
 * A mesma pessoa não se inscreve duas vezes: CPF OU e-mail já na lista
 * barram a nova inscrição (a lista inclui os lançados à mão pela gestão —
 * quem já está na planilha da coordenação não precisa da inscrição online).
 */
/**
 * O e-mail de uma inscrição, MASCARADO: primeira letra, o domínio e nada
 * mais. Existe para quem digitou o endereço errado na inscrição: sem uma
 * pista, a pessoa não recebe o e-mail, não consegue reaver o link (a
 * recuperação exige o MESMO endereço) e não tem como descobrir o engano —
 * fica presa entre um e-mail que não chega e um erro que não explica.
 * Mostrar `j••••@gmail.com` faz ela reconhecer o próprio erro sem entregar
 * o endereço de ninguém.
 */
export function emailMascarado(email) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "";
  return `${e[0]}${"•".repeat(Math.max(3, Math.min(6, at - 1)))}${e.slice(at)}`;
}

export function jaInscrito(inscritos, { cpf, email } = {}) {
  const c = soDigitos(cpf);
  const e = String(email || "").trim().toLowerCase();
  return (inscritos || []).find((i) => {
    const ic = soDigitos(i?.cpf);
    const ie = String(i?.email || "").trim().toLowerCase();
    return (c && ic && ic === c) || (e && ie && ie === e);
  }) || null;
}
