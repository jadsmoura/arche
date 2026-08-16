/* ========================================================================
   ARCHÉ Eventos — eventos GRATUITOS dentro da Extensão.

   O evento NÃO é entidade nova: é uma ação de extensão (ex-acoes-v1) que
   ganha a configuração `evento` — página pública, inscrição online e
   credenciamento por QR na entrada. A certificação continua no sistema da
   AEE (decisão do dono): o ARCHÉ exporta a planilha no formato de lá.

   Aqui vivem só os helpers PUROS (sem storage, sem rede), para o servidor
   usar e os testes cobrirem:

     evento = { ativo, slug, descricao, vagas (0 = ilimitado), inscricoesAte,
                programacao: [{dia, hora, titulo, responsavel, local}],
                chaveQr (segredo HMAC por evento), codigoMonitor }

     inscrito online = { nome, cpf, email, telefone, curso, ch,
                         origem: "online", inscritoEm, token,
                         presente, presenteEm, presentePor }

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

/* ----------------------------- programação ------------------------------ */
/**
 * Normaliza a programação estruturada: apara os campos, descarta a linha
 * sem título e ordena por dia e hora — é a ordem em que a página pública
 * a apresenta, agrupada por dia.
 */
export function normalizarProgramacao(lista) {
  const txt = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  return (Array.isArray(lista) ? lista : [])
    .map((p) => ({
      dia: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.dia || "")) ? p.dia : "",
      hora: txt(p?.hora, 20),
      titulo: txt(p?.titulo),
      responsavel: txt(p?.responsavel, 120),
      local: txt(p?.local, 120),
    }))
    .filter((p) => p.titulo)
    .sort((a, b) => (a.dia + " " + a.hora).localeCompare(b.dia + " " + b.hora))
    .slice(0, 200);
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

/**
 * A inscrição está aberta? Devolve { ok } ou { ok: false, motivo } — o
 * motivo já é a frase que a página pública mostra.
 */
export function podeInscrever(acao, hoje) {
  const ev = acao?.evento;
  if (!ev?.ativo) return { ok: false, motivo: "As inscrições deste evento não estão abertas." };
  const ate = prazoInscricao(ev, acao);
  if (ate && hoje && hoje > ate)
    return { ok: false, motivo: "O prazo de inscrição deste evento já se encerrou." };
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
export function jaInscrito(inscritos, { cpf, email } = {}) {
  const c = soDigitos(cpf);
  const e = String(email || "").trim().toLowerCase();
  return (inscritos || []).find((i) => {
    const ic = soDigitos(i?.cpf);
    const ie = String(i?.email || "").trim().toLowerCase();
    return (c && ic && ic === c) || (e && ie && ie === e);
  }) || null;
}
