/* =======================================================================
   ARCHÉ — o REGISTRO de transportes de e-mail (set/2026)

   Todo e-mail do portal saía por UMA conta do Gmail, a MESMA autorização
   OAuth do Drive. Isso trazia três problemas de uma vez: o teto de ~500
   mensagens/dia de um Gmail comum (batido, o que morre junto é o CÓDIGO
   DE ACESSO do login — a porta de entrada de quem ainda não tem conta);
   o remetente ser um endereço pessoal, que as caixas institucionais
   tratam como suspeito; e trocar a conta do e-mail significar mover o
   Drive onde o estado vive, porque a credencial é uma só.

   O servidor fala com "o transporte"; QUAL é, decide o ambiente:
     MAIL_PROVEDOR = gmail | smtp
   Sem a variável vale o que estiver configurado — SMTP primeiro, senão o
   Gmail. Trocar é trocar a variável: os ~70 modelos de mensagem, a régua
   de ritmo, o diagnóstico e as rotas não sabem quem está por baixo.

   O QUE VIAJA É O MIME PRONTO, não os campos. lib/mailer.js já monta a
   mensagem inteira (`bruto`) — cabeçalhos, multipart/related, o QR
   embutido por `cid:`, o JSON-LD da carteira digital, o assunto em UTF-8
   — e cada transporte só a ENTREGA: o Gmail em `messages.send({raw})`, o
   SMTP em `sendMail({raw})`. Remontar a mensagem campo a campo numa API
   HTTP de terceiro seria arriscar justamente o que é caro e invisível: o
   QR da credencial que não aparece, o passe que deixa de nascer. Por isso
   o segundo transporte é SMTP e não a API de um provedor específico — e é
   também o que faz ele servir a QUALQUER serviço (Resend, Brevo, Amazon
   SES, o Workspace da instituição, o servidor próprio) sem código novo.
   ======================================================================= */

/* ---------------------------- Gmail (API) ------------------------------ */

/* A credencial do e-mail pode ser PRÓPRIA (`GMAIL_OAUTH_*`) ou a MESMA do
   Drive, que é como sempre foi. A separação existe para o envio poder
   mudar de conta — para um `nao-responda@uniego.edu.br` do Workspace, com
   teto maior e o domínio da instituição no remetente — sem arrastar junto
   o Drive onde o `_estado.json` mora. Sem as variáveis próprias, nada
   muda: cai no `driveAuth` de sempre. */
function autorizacaoDoGmail(google) {
  if (process.env.GMAIL_OAUTH_REFRESH_TOKEN) {
    const oauth = new google.auth.OAuth2(
      process.env.GMAIL_OAUTH_CLIENT_ID || process.env.GDRIVE_OAUTH_CLIENT_ID,
      process.env.GMAIL_OAUTH_CLIENT_SECRET || process.env.GDRIVE_OAUTH_CLIENT_SECRET,
    );
    oauth.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN });
    return oauth;
  }
  return null;
}

export const gmail = {
  nome: "gmail",
  rotulo: "Gmail (API do Google)",
  // o teto é da CONTA: Gmail comum ~500/dia, Workspace ~2.000/dia
  tetoDiario: (conta) => (conta && !/@(gmail|googlemail)\.com$/i.test(conta) ? 2000 : 500),
  // o envio é o verbo mais caro da API e a cota é por SEGUNDO: 500 ms
  // entre mensagens mantém a conta abaixo do limite por construção
  intervaloPadraoMs: 500,
  credencialPropria: () => !!process.env.GMAIL_OAUTH_REFRESH_TOKEN,
  configurado: () => !!(process.env.GMAIL_OAUTH_REFRESH_TOKEN || process.env.GDRIVE_OAUTH_REFRESH_TOKEN
    || process.env.GDRIVE_KEY_JSON || process.env.GDRIVE_KEY_FILE),

  async cliente() {
    const { google } = await import("googleapis");
    const { driveAuth } = await import("../files.js");
    return google.gmail({ version: "v1", auth: autorizacaoDoGmail(google) || driveAuth(google) });
  },

  async enviarBruto(bruto) {
    const api = await this.cliente();
    const raw = Buffer.from(bruto, "utf8").toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await api.users.messages.send({ userId: "me", requestBody: { raw } });
  },

  /** Quem é a conta autenticada de verdade — é ela que define o teto. */
  async contaAutenticada() {
    const api = await this.cliente();
    const { data } = await api.users.getProfile({ userId: "me" });
    return String(data?.emailAddress || "");
  },
};

/* ------------------------------- SMTP ---------------------------------- */

/* Um transporte, todos os serviços. As variáveis dizem para onde:
     SMTP_HOST, SMTP_PORTA (465 com TLS, 587 com STARTTLS),
     SMTP_USUARIO, SMTP_SENHA
   e o remetente continua em MAIL_FROM_ADDR / MAIL_FROM_NAME. O serviço
   escolhido é decisão de quem paga a conta; o código não o nomeia. */
let _transporte = null;

export const smtp = {
  nome: "smtp",
  rotulo: () => `SMTP (${process.env.SMTP_HOST || "não configurado"})`,
  // o teto do dia é do SERVIÇO contratado, e não há como perguntá-lo por
  // aqui: quem o conhece é quem assinou o plano. `null` = não afirmamos
  tetoDiario: () => null,
  // ESPs aceitam bem mais que o Gmail; 200 ms é folgado para todos eles
  intervaloPadraoMs: 200,
  configurado: () => !!(process.env.SMTP_HOST && process.env.SMTP_USUARIO && process.env.SMTP_SENHA),

  async cliente() {
    if (_transporte) return _transporte;
    const { default: nodemailer } = await import("nodemailer");
    const porta = Number(process.env.SMTP_PORTA || 465);
    _transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465,          // 465 é TLS direto; 587 sobe por STARTTLS
      auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA },
      // a fila do ARCHÉ já é sequencial e passeada; uma conexão basta e
      // reaproveitá-la evita um handshake TLS por mensagem num lote
      pool: true, maxConnections: 1, maxMessages: 100,
      connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 30_000,
    });
    return _transporte;
  },

  /* `raw` entrega os MESMOS bytes que o Gmail receberia — é o que faz o QR
     embutido, o multipart/related e o JSON-LD do passe atravessarem a
     troca de transporte sem ninguém reescrever um modelo de mensagem.
     `envelope` é preciso porque com `raw` o nodemailer não lê os
     cabeçalhos para descobrir de quem para quem a mensagem vai. */
  async enviarBruto(bruto, { de, para }) {
    const t = await this.cliente();
    await t.sendMail({ raw: bruto, envelope: { from: de, to: para } });
  },

  async contaAutenticada() {
    return String(process.env.SMTP_USUARIO || "");
  },
};

/* ------------------------------ registro -------------------------------- */

export const TODOS = { gmail, smtp };

export function ativo() {
  const forcado = (process.env.MAIL_PROVEDOR || "").trim().toLowerCase();
  if (forcado && TODOS[forcado]) return TODOS[forcado];
  if (smtp.configurado()) return smtp;
  return gmail;
}

export const nome = () => ativo().nome;
export const rotulo = () => {
  const r = ativo().rotulo;
  return typeof r === "function" ? r() : r;
};
export const configurado = () => ativo().configurado();
export const intervaloPadraoMs = () => ativo().intervaloPadraoMs;
export const tetoDiario = (conta) => ativo().tetoDiario(conta);
export const enviarBruto = (bruto, env) => ativo().enviarBruto(bruto, env);
export const contaAutenticada = () => ativo().contaAutenticada();

/** Esquece o cliente guardado — o teste troca de servidor entre casos. */
export function esquecerCliente() { _transporte = null; }
