/* ========================================================================
   PRODUTO × INSTÂNCIA — o nome do sistema e o nome da instalação.

   São duas coisas diferentes, e confundi-las é o que trava a venda a outra
   instituição. O PRODUTO é o que se licencia: aparece no contrato, no site
   comercial e no "feito com". A INSTÂNCIA é o que os usuários veem todo dia,
   e cada instituição a batiza no próprio contexto — no UNIEGO ela se chama
   ARCHÉ, em referência a Archibald, o fundador da AEE; noutra IES o nome
   será outro, e não há por que ele viajar junto.

   O produto se chama **Cátedra** (decisão do dono, set/2026). O nome não vem
   por variável de ambiente porque não é configuração: é a marca de quem
   vende. A INSTÂNCIA, sim — `APP_MARCA` no ambiente, e o padrão é ARCHÉ,
   que é como esta instalação se chama.

   Como a troca acontece: NÃO reescrevendo as ~720 ocorrências espalhadas
   pelas telas, pelos e-mails e pelos documentos. Ela acontece na SAÍDA, em
   três pontos por onde tudo passa — `blindarTexto` (todo PDF do sistema),
   `enviarEmail` (todo assunto e todo corpo) e o filtro do estático (toda
   página e todo script de public/assets) —, e `vestir()` é a função que os
   três chamam. Com a variável no padrão ela é um NO-OP: não toca em byte
   nenhum, e esta instalação segue exatamente como sempre esteve.

   O que NÃO se veste, de propósito: cookie (`arche_sessao`, `arche_av`),
   nome de arquivo (`public/assets/arche-*.js`), classe de CSS (`.arche-*`),
   chave de estado (`sys-*`, `ic-*`, `ex-*`…) e prefixo de protocolo (`EXT-`,
   `IC-`, `MON-`, `AP-`…). Nada disso é visto por ninguém, e renomear
   encanamento invisível é risco gratuito — um cookie renomeado desloga o
   campus inteiro, uma chave renomeada some com o dado. Todos eles são
   minúsculos e sem acento; o que se veste é `ARCHÉ`/`Arché`, que só existe
   como texto de tela, de documento e de e-mail.
   ======================================================================== */

/** O produto — o que se licencia. Não é configuração: é a marca. */
export const PRODUTO = {
  nome: "Cátedra",
  genero: "a",
  descricao: "Plataforma de gestão acadêmica e institucional para instituições de ensino superior",
};

/** Como esta instalação se chama quando ninguém disse o contrário. */
export const MARCA_PADRAO = "ARCHÉ";

/** A instância — o nome que os usuários desta instalação veem. */
export const APP = {
  nome: String(process.env.APP_MARCA || "").trim() || MARCA_PADRAO,
  // "o ARCHÉ" (masculino) × "a Cátedra" (feminino) — é o que faz a
  // preposição concordar quando o nome muda: sem isto sairia "no Cátedra".
  genero: String(process.env.APP_MARCA_GENERO || "o").trim().toLowerCase() === "a" ? "a" : "o",
};
APP.ehPadrao = APP.nome === MARCA_PADRAO;

/** A marca desta instalação, para interpolar em texto novo. */
export const MARCA = APP.nome;

const CONTRACAO = {
  o: { de: "do", em: "no", por: "pelo", a: "ao", art: "o" },
  a: { de: "da", em: "na", por: "pela", a: "à", art: "a" },
};

/** "no ARCHÉ", "do ARCHÉ", "pelo ARCHÉ", "ao ARCHÉ", "o ARCHÉ". */
export const comMarca = (prep = "em") => `${CONTRACAO[APP.genero][prep] || ""} ${APP.nome}`.trim();

/** O nome de um módulo: `modulo("IC")` → "ARCHÉ IC". Só o prefixo é da
 *  instituição — as siglas (IC, AT, EV, MO, AC, ES, RE, TR, SC, AV, EX) são
 *  do produto e viajam iguais para qualquer cliente. */
export const modulo = (sigla) => `${APP.nome} ${String(sigla || "").trim()}`.trim();

// "no ARCHÉ" → "na Cátedra". A preposição vem colada ao artigo masculino, e
// trocar só o nome deixaria a frase errada em toda página. Preserva a caixa
// da primeira letra: "No ARCHÉ" no começo da frase continua começando maiúsculo.
const FEMININO = { o: "a", no: "na", do: "da", pelo: "pela", ao: "à" };
// Sem `\b` DEPOIS da marca: o "É" não é caractere de palavra para o motor de
// regex do JavaScript, então `ARCHÉ\b` só casaria se viesse letra logo em
// seguida — e a marca quase sempre fecha a frase.
const RE_ARTIGO = /\b(o|no|do|pelo|ao)(\s+)(ARCHÉ|Arché)/gi;
const RE_MARCA = /ARCHÉ|Arché/g;

/**
 * Troca a marca padrão pela marca desta instalação. NO-OP quando as duas
 * coincidem — que é o caso do UNIEGO, e é o que garante que ligar este
 * mecanismo não mexeu em nada aqui.
 */
export function vestir(texto) {
  if (APP.ehPadrao || typeof texto !== "string") return texto;
  if (!texto.includes("ARCHÉ") && !texto.includes("Arché")) return texto;
  let t = texto;
  if (APP.genero === "a") {
    t = t.replace(RE_ARTIGO, (_m, art, espaco) => {
      const f = FEMININO[art.toLowerCase()];
      const casada = art[0] === art[0].toUpperCase() ? f[0].toUpperCase() + f.slice(1) : f;
      return casada + espaco + APP.nome;
    });
  }
  return t.replace(RE_MARCA, APP.nome);
}
