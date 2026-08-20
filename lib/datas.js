/* ========================================================================
   Aritmética de datas no fuso institucional (America/Sao_Paulo).
   O Render roda em UTC: entre 21h e 23h59 de Brasília o "hoje" do servidor
   já é o dia seguinte. Toda decisão de data do sistema (cobrança do
   relatório, status "pendente") passa por aqui — nunca por toISOString().
   ======================================================================== */

export const TZ = "America/Sao_Paulo";
const MS_DIA = 86400000;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

let fmt = null;
try {
  fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
} catch { fmt = null; }

function porIntl(d) {
  const o = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") o[p.type] = p.value;
  return { data: `${o.year}-${o.month}-${o.day}`, hora: Number(o.hour), minuto: Number(o.minute) };
}
// Fallback para builds sem base de fusos (small-icu): Brasil não tem
// horário de verão desde 2019, então UTC-3 é fixo.
function porOffset(d) {
  const t = new Date(d.getTime() - 3 * 3600 * 1000);
  return { data: t.toISOString().slice(0, 10), hora: t.getUTCHours(), minuto: t.getUTCMinutes() };
}

// Confere se o ambiente realmente conhece o fuso (12:00Z = 09:00 em Brasília).
export const TEM_TZ = (() => {
  if (!fmt) return false;
  try { return porIntl(new Date("2026-01-01T12:00:00Z")).hora === 9; } catch { return false; }
})();
if (!TEM_TZ) console.warn("[datas] fuso America/Sao_Paulo indisponível — usando UTC-3 fixo");

/** Data e hora locais (Brasília) de um instante. */
export function agoraLocal(agora = new Date()) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return null;
  return TEM_TZ ? porIntl(agora) : porOffset(agora);
}

/** "YYYY-MM-DD" de hoje em Brasília. */
export function hojeLocalISO(agora = new Date()) {
  return agoraLocal(agora)?.data ?? null;
}

/** "HH:MM" da hora corrente em Brasília (o relógio que fecha a inscrição). */
export function horaLocalHHMM(agora = new Date()) {
  const t = agoraLocal(agora);
  if (!t) return "";
  return `${String(t.hora).padStart(2, "0")}:${String(t.minuto).padStart(2, "0")}`;
}

/**
 * Nº de dias desde a época para uma data civil "YYYY-MM-DD".
 * Valida por ida e volta: "2026-02-30" e "13/08/2026" retornam null.
 */
export function diaSerial(iso) {
  if (typeof iso !== "string" || !RE_DATA.test(iso)) return null;
  const [a, m, d] = iso.split("-").map(Number);
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(a, m - 1, d);
  const t = new Date(ms);
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return Math.round(ms / MS_DIA);
}

/** Soma (ou subtrai) dias a uma data civil, devolvendo "YYYY-MM-DD". */
export function somaDias(iso, n) {
  const s = diaSerial(iso);
  if (s === null || !Number.isFinite(n)) return null;
  return new Date((s + Math.trunc(n)) * MS_DIA).toISOString().slice(0, 10);
}

/**
 * Converte para data civil de Brasília. Aceita Date, ISO completo
 * ("2026-08-14T01:00:00Z" → "2026-08-13") e "YYYY-MM-DD" (devolvido como está).
 */
export function dataCivil(valor) {
  if (valor instanceof Date) return hojeLocalISO(valor);
  if (typeof valor !== "string" || !valor) return null;
  if (RE_DATA.test(valor)) return diaSerial(valor) === null ? null : valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : hojeLocalISO(d);
}

/** Está dentro do horário comercial de Brasília? (envio de cobrança) */
export function dentroDaJanela(agora = new Date(), ini = 8, fim = 20) {
  const l = agoraLocal(agora);
  return !!l && l.hora >= ini && l.hora < fim;
}

/** Guarda contra relógio absurdo (container com data errada não dispara e-mail). */
export function relogioPlausivel(agora = new Date()) {
  const iso = hojeLocalISO(agora);
  if (!iso) return false;
  const ano = Number(iso.slice(0, 4));
  return ano >= 2025 && ano <= 2100;
}
