/* ========================================================================
   O MEDIDOR — a parte que roda e conta.

   lib/banda.js tem as contas (puras, testáveis); aqui fica o que tem
   efeito colateral: o acumulador em memória, o despejo no disco local e a
   função `medir()` que o resto do sistema chama.

   Três cuidados, e os três existem porque o medidor não pode virar parte
   do problema que mede:

   1. **Nunca grava no estado.** O arquivo vai para o disco local
      (data/banda.json). Em produção o estado vive num arquivo único no
      Drive e cada gravação o reescreve inteiro — medir ali somaria uma
      reescrita a cada despejo.
   2. **Nunca falha para quem chamou.** Contar bytes não pode derrubar um
      pedido: tudo aqui é try/catch silencioso.
   3. **Escreve pouco.** O despejo é debounced em 30 s e só acontece se
      algo mudou.

   O disco do Render é efêmero — a medição recomeça a cada deploy. Para um
   diagnóstico de dias é o suficiente, e é o preço de não poluir a conta.
   ======================================================================== */
import fs from "node:fs/promises";
import path from "node:path";
import { novoRegistro, podar, recomendacoes, resumir, somar } from "./banda.js";

const DIR = process.env.DATA_DIR || "data";
const ARQ = path.join(DIR, "banda.json");

let REG = novoRegistro();
let carregado = false;
let sujo = false;
let timer = null;

async function carregar() {
  if (carregado) return;
  carregado = true;
  try {
    const bruto = JSON.parse(await fs.readFile(ARQ, "utf8"));
    if (bruto && typeof bruto === "object" && bruto.dias) REG = podar(bruto);
  } catch { /* primeira vez, ou disco novo depois do deploy */ }
}

async function despejar() {
  if (!sujo) return;
  sujo = false;
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(ARQ, JSON.stringify(podar(REG)), "utf8");
  } catch (e) {
    console.error("[banda] não foi possível gravar a medição:", e.message);
  }
}

function agendar() {
  sujo = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; despejar(); }, 30_000);
  timer.unref?.();
}

/** Conta bytes num grupo. Chamada de todo lugar; nunca lança. */
export function medir(grupo, bytes, { n = 1 } = {}) {
  try {
    if (!carregado) carregar();               // sem await: a contagem não espera disco
    somar(REG, grupo, bytes, { n });
    agendar();
  } catch { /* medir jamais atrapalha quem estava trabalhando */ }
}

/** O diagnóstico pronto para a tela. */
export async function diagnostico({ franquiaGB = Number(process.env.BANDA_FRANQUIA_GB || 5) } = {}) {
  await carregar();
  const resumo = resumir(REG);
  return {
    ...resumo,
    franquiaGB,
    usoDaFranquia: franquiaGB ? Math.round((resumo.totalMB / (franquiaGB * 1024)) * 1000) / 10 : 0,
    recomendacoes: recomendacoes(resumo, { franquiaGB }),
    arquivo: ARQ,
  };
}

/** Zera a medição — para recomeçar a contagem num período limpo. */
export async function zerar() {
  REG = novoRegistro();
  sujo = true;
  await despejar();
  return true;
}

/** Grava o que estiver pendente (usado no encerramento do processo). */
export async function fecharMedicao() {
  if (timer) { clearTimeout(timer); timer = null; }
  await despejar();
}
