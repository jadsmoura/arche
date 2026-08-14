/* ========================================================================
   CPF — normalização, validação e exibição.

   O CPF é o que costura o que veio de fora ao que existe aqui: a planilha
   da submissão anterior traz o CPF do professor, e é por ele que o projeto
   encontra o dono quando ele se cadastra. Por isso guarda-se sempre só os
   onze dígitos: máscara é enfeite de tela, e comparar texto formatado com
   texto formatado é receita para o vínculo não fechar.
   ======================================================================== */

/** Só os dígitos, sem ponto, traço ou espaço. */
export const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Validação pelos dois dígitos verificadores. Recusa também as sequências
 * repetidas (000…, 111…), que passam na conta mas não existem na Receita.
 */
export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const [ate, pos] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (pos - i);
    const resto = (soma * 10) % 11 % 10;
    if (resto !== Number(d[ate])) return false;
  }
  return true;
}

/** Devolve os onze dígitos, ou "" se não for CPF válido. */
export const normalizarCpf = (v) => (cpfValido(v) ? soDigitos(v) : "");

/** 123.456.789-09 — para telas e documentos. */
export function formatarCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : String(v ?? "");
}

/**
 * ***.456.789-** — quando o CPF precisa aparecer para conferência mas não
 * para quem não é dono dele (listas da gestão, por exemplo).
 */
export function mascararCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "";
}

/** Comparação segura: dois CPFs são o mesmo se os dígitos batem. */
export const mesmoCpf = (a, b) => {
  const x = soDigitos(a), y = soDigitos(b);
  return x.length === 11 && x === y;
};
