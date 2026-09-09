/**
 * Google Wallet — o passe do inscrito no evento.
 *
 * Até set/2026 o passe era SÓ um link: o servidor assinava um JWT com a classe
 * e o objeto inteiros dentro e mandava a pessoa a pay.google.com. Funciona no
 * papel e falha em silêncio na prática — o Google mostra "algo deu errado" e
 * não diz o quê; e o JWT com classe, objeto, imagens e links passa fácil dos
 * 1.800 caracteres que a própria documentação dá como limite prático do link.
 *
 * Agora o caminho é o da API (o mesmo que o Sympla e a Even3 usam): a conta de
 * serviço pede um token OAuth, o servidor GRAVA a classe e o objeto no Google
 * (`walletobjects.googleapis.com`) e o link leva um JWT curto, só com o id.
 * Duas consequências que importam: o link fica pequeno, e o ERRO — conta de
 * serviço sem permissão no emissor, id de emissor errado, chave que não
 * assina — volta em JSON, com a frase do Google, em vez de morrer numa página
 * genérica. `ultimoErro` guarda essa frase para o diagnóstico.
 *
 * O link antigo (JWT completo) fica como SAÍDA de emergência: se a API não
 * responder, o passe ainda sai por ele — pior que um passe que talvez não salve
 * é um botão que não faz nada.
 *
 * Nada aqui lê o estado do portal: a rota do server monta `inscrito`, `proposta`
 * e `evento` e entrega. As chamadas ao Google podem ser apontadas a um servidor
 * falso pelas variáveis GOOGLE_WALLET_API_BASE e GOOGLE_OAUTH_TOKEN_URL — só
 * para o teste local.
 */
import crypto from "node:crypto";

export const ESCOPO = "https://www.googleapis.com/auth/wallet_object.issuer";
export const apiBase = () => String(process.env.GOOGLE_WALLET_API_BASE || "https://walletobjects.googleapis.com/walletobjects/v1").replace(/\/$/, "");
export const tokenUrl = () => String(process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token");

/* O id de classe e de objeto é `<emissor>.<identificador>`, e o identificador
   só aceita letras, dígitos, ponto, hífen e sublinhado. O token da inscrição é
   hexadecimal (22 caracteres), então passa inteiro; o que vier de fora disso
   vira hífen, para o id nunca ser recusado por um caractere. */
const limpo = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 200);
export const idDoObjeto = (emissor, token) => `${emissor}.${limpo(token)}`;
export const idDaClasse = (emissor, nome = "arche-evento") => `${emissor}.${limpo(nome)}`;

/** A classe genérica: o molde do cartão. Só o id é obrigatório. */
export function classeDoPasse(id) {
  return { id };
}

const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? iso.split("-").reverse().join("/") : "");
export const periodoBR = (ini, fim) => {
  const a = dataBR(ini), b = dataBR(fim);
  return !a ? "—" : (!b || b === a ? a : `${a} a ${b}`);
};

/**
 * O objeto do passe: o crachá deste inscrito neste evento. `base` é o endereço
 * público do portal (as imagens têm de abrir de fora, em HTTPS).
 */
export function objetoDoPasse({ emissor, classe, inscrito = {}, proposta = {}, evento = {}, base, codigo = "" }) {
  const slug = encodeURIComponent(evento.slug || "");
  return {
    id: idDoObjeto(emissor, inscrito.token),
    classId: classe,
    state: "ACTIVE",
    hexBackgroundColor: "#1c3742",
    cardTitle: { defaultValue: { language: "pt-BR", value: "UNIEGO · Evento" } },
    header: { defaultValue: { language: "pt-BR", value: String(proposta.nomeAtividade || "Evento").slice(0, 60) } },
    subheader: { defaultValue: { language: "pt-BR", value: String(inscrito.nome || "").slice(0, 60) || "Participante" } },
    barcode: { type: "QR_CODE", value: String(inscrito.token || ""), alternateText: String(codigo || "").toUpperCase() },
    textModulesData: [
      { id: "quando", header: "Quando", body: periodoBR(proposta.periodoInicio, proposta.periodoFim) },
      { id: "onde", header: "Onde", body: [proposta.local, proposta.municipio].filter(Boolean).join(" — ") || "—" },
    ],
    // a marca da instituição e, quando houver, a arte do evento: é o que faz
    // o cartão na carteira parecer o crachá do evento, e não um genérico
    logo: { sourceUri: { uri: `${base}/assets/logo-uniego.png` },
      contentDescription: { defaultValue: { language: "pt-BR", value: "UNIEGO" } } },
    ...(evento.capa ? { heroImage: { sourceUri: { uri: `${base}/api/publico/eventos/${slug}/capa` } } } : {}),
    linksModuleData: { uris: [{ uri: `${base}/eventos/${slug}`, description: "Página do evento" }] },
  };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function assinarJwt(corpo, chave) {
  const assinar = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(corpo)}`;
  return `${assinar}.${crypto.createSign("RSA-SHA256").update(assinar).sign(chave, "base64url")}`;
}

/**
 * O JWT do link "salvar na carteira". `completo: true` leva classe e objeto
 * inteiros (a saída de emergência); sem ele, só o id do objeto — o passe já
 * está gravado no Google pela API.
 */
export function jwtDeSalvar({ email, chave, origins = [], objeto, classe = null, completo = false, agora = Math.floor(Date.now() / 1000) }) {
  const payload = completo
    ? { ...(classe ? { genericClasses: [classe] } : {}), genericObjects: [objeto] }
    : { genericObjects: [{ id: objeto.id }] };
  return assinarJwt({ iss: email, aud: "google", typ: "savetowallet", iat: agora, origins, payload }, chave);
}
export const linkDeSalvar = (jwt) => `https://pay.google.com/gp/v/save/${jwt}`;

/** A asserção com que a conta de serviço pede o token OAuth (RFC 7523). */
export function assertionOAuth({ email, chave, agora = Math.floor(Date.now() / 1000) }) {
  return assinarJwt({ iss: email, scope: ESCOPO, aud: tokenUrl(), iat: agora, exp: agora + 3600 }, chave);
}

export class ErroGoogle extends Error {
  constructor(etapa, status, corpo) {
    super(explicarErro(etapa, status, corpo));
    this.etapa = etapa; this.status = status; this.corpo = corpo;
  }
}

/* A frase do Google traduzida para o que a gestão pode FAZER. As mensagens da
   API chegam em `error.message` (e às vezes só em `error_description`, no
   token); a causa mais comum de todas é a conta de serviço não ter sido
   adicionada ao emissor no console — e o 403 dela não diz isso com essas
   palavras. */
export function explicarErro(etapa, status, corpo) {
  const msg = String(corpo?.error?.message || corpo?.error_description || corpo?.error?.status || corpo?.error || corpo?.texto || "").trim();
  const base = `Google (${etapa}, HTTP ${status})${msg ? `: ${msg}` : ""}`;
  if (etapa === "token") {
    if (/invalid_grant|invalid_client|JWT signature|Invalid JWT/i.test(msg))
      return `${base} — a chave em GOOGLE_WALLET_SA_KEY e o e-mail da conta de serviço não batem, ou a chave foi revogada no Google Cloud. Baixe um JSON novo da conta de serviço e cole-o inteiro.`;
    return `${base} — não foi possível obter o token da conta de serviço.`;
  }
  if (status === 403)
    return `${base} — a conta de serviço não tem permissão neste emissor. No Google Pay & Wallet Console, em Usuários, adicione o e-mail da conta de serviço com o papel de desenvolvedor; e confira se GOOGLE_WALLET_ISSUER_ID é o "ID do emissor" que aparece lá.`;
  if (status === 404 && etapa !== "classe")
    return `${base} — o emissor ou a classe não existe: confira GOOGLE_WALLET_ISSUER_ID.`;
  if (status === 400)
    return `${base} — o Google recusou o conteúdo do passe (id, imagem ou campo). O detalhe acima diz qual.`;
  if (status === 0) return `${base} — o Google não respondeu (rede ou tempo esgotado).`;
  return base;
}

/* ----------------------------- o cliente --------------------------------- */
let TOKEN = { valor: "", ate: 0 };
let ULTIMO_ERRO = null;
export const ultimoErro = () => ULTIMO_ERRO;
export const esquecerToken = () => { TOKEN = { valor: "", ate: 0 }; };
const registrarErro = (e) => { ULTIMO_ERRO = { em: new Date().toISOString(), etapa: e.etapa || "", status: e.status || 0, mensagem: e.message }; return e; };

async function pedir(url, opcoes = {}, etapa = "api") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let r;
  try { r = await fetch(url, { ...opcoes, signal: ctrl.signal }); }
  catch (e) { clearTimeout(t); throw registrarErro(new ErroGoogle(etapa, 0, { texto: e.message })); }
  clearTimeout(t);
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = { texto: texto.slice(0, 300) }; }
  return { status: r.status, json };
}

/** O token OAuth da conta de serviço, guardado em memória até vencer. */
export async function tokenDeAcesso({ email, chave }, { forcar = false } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  if (!forcar && TOKEN.valor && TOKEN.ate - 60 > agora) return TOKEN.valor;
  const corpo = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: assertionOAuth({ email, chave, agora }),
  });
  const { status, json } = await pedir(tokenUrl(), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo.toString(),
  }, "token");
  if (status !== 200 || !json?.access_token) throw registrarErro(new ErroGoogle("token", status, json));
  TOKEN = { valor: json.access_token, ate: agora + Number(json.expires_in || 3600) };
  return TOKEN.valor;
}

async function api(cred, metodo, caminho, corpo, etapa) {
  const token = await tokenDeAcesso(cred);
  return pedir(`${apiBase()}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }, etapa);
}

/** A classe existe no Google? Se não, cria. Devolve "existia" | "criada". */
export async function garantirClasse(cred, classe) {
  const r = await api(cred, "GET", `/genericClass/${encodeURIComponent(classe.id)}`, null, "classe");
  if (r.status === 200) return "existia";
  if (r.status !== 404) throw registrarErro(new ErroGoogle("classe", r.status, r.json));
  const c = await api(cred, "POST", "/genericClass", classe, "classe");
  if (c.status === 200 || c.status === 409) return "criada";
  throw registrarErro(new ErroGoogle("classe", c.status, c.json));
}

/** Grava (ou atualiza) o objeto do passe. Devolve "criado" | "atualizado". */
export async function gravarObjeto(cred, objeto) {
  const r = await api(cred, "POST", "/genericObject", objeto, "objeto");
  if (r.status === 200) return "criado";
  if (r.status === 409) {
    const u = await api(cred, "PUT", `/genericObject/${encodeURIComponent(objeto.id)}`, objeto, "objeto");
    if (u.status === 200) return "atualizado";
    throw registrarErro(new ErroGoogle("objeto", u.status, u.json));
  }
  throw registrarErro(new ErroGoogle("objeto", r.status, r.json));
}

/**
 * O teste da configuração, para o diagnóstico: pede um token NOVO e garante a
 * classe. Cada etapa diz se passou e, se não, a frase do Google traduzida.
 */
export async function testar(cred, classe) {
  const etapas = [];
  try {
    await tokenDeAcesso(cred, { forcar: true });
    etapas.push({ etapa: "token", ok: true, detalhe: "a conta de serviço autenticou no Google" });
  } catch (e) {
    etapas.push({ etapa: "token", ok: false, detalhe: e.message });
    return { ok: false, etapas };
  }
  try {
    const r = await garantirClasse(cred, classe);
    etapas.push({ etapa: "classe", ok: true, detalhe: r === "criada" ? `a classe ${classe.id} foi criada no emissor` : `a classe ${classe.id} já existia no emissor` });
  } catch (e) {
    etapas.push({ etapa: "classe", ok: false, detalhe: e.message });
    return { ok: false, etapas };
  }
  return { ok: true, etapas };
}
