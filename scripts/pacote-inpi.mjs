/**
 * Monta o pacote de código-fonte do ARCHÉ para o Registro de Programa de
 * Computador no INPI (Lei 9.609/98) e calcula o resumo digital (hash).
 *
 * Por que assim: o INPI não recebe o código-fonte — recebe o **hash** dele,
 * o que preserva o sigilo do programa. Mas o hash só vale como prova se o
 * arquivo que o originou puder ser reproduzido igual, byte a byte, anos
 * depois. Por isso este script gera um ÚNICO arquivo de texto, com os fontes
 * em ordem alfabética e cabeçalho por arquivo: qualquer pessoa que rode o
 * script no mesmo commit obtém o mesmo arquivo e o mesmo hash.
 *
 * O que fica DE FORA, e por quê:
 *  · `public/arche/`  — app COMPILADO de terceiro (Manus), usado no módulo de
 *    Avaliação. Não é obra do titular e não pode entrar num registro que
 *    declara autoria própria; entra como dependência declarada.
 *  · `dados/`         — lotes institucionais com nome, CPF e e-mail de pessoas
 *    reais. Não é código, e dado pessoal não vai a processo público.
 *  · `templates/`, PDFs, imagens — documentos e arte, não código-fonte.
 *  · `node_modules/`  — bibliotecas de terceiros, cada uma com a sua licença.
 *
 * Uso:  node scripts/pacote-inpi.mjs
 * Saída: docs/inpi/arche-codigo-fonte-<commit>.txt   (guardar; NÃO versionar)
 *        docs/inpi/resumo-digital.md                 (o que se informa ao INPI)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(RAIZ, "docs", "inpi");

// só o que é CÓDIGO-FONTE de autoria própria
const EXTENSOES = [".js", ".mjs", ".html", ".css", ".json"];
const FORA = [
  /^public\/arche\//,        // app compilado de terceiro (Manus)
  /^dados\//,                // dados institucionais com dado pessoal
  /^templates\//,            // modelos .xlsx e logotipos
  /^node_modules\//,
  /^package-lock\.json$/,    // trava de dependências, não é obra
  /^docs\/inpi\//,           // o próprio pacote
];

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();

const commit = git("rev-parse", "HEAD");
const commitCurto = commit.slice(0, 8);
const dataCommit = git("log", "-1", "--format=%ad", "--date=short");
const sujo = git("status", "--porcelain");

const arquivos = git("ls-files")
  .split("\n")
  .filter((f) => f && EXTENSOES.includes(path.extname(f)) && !FORA.some((re) => re.test(f)))
  .sort();

const linhas = [];
const inventario = [];
let totalLinhas = 0, totalBytes = 0;

for (const f of arquivos) {
  const conteudo = readFileSync(path.join(RAIZ, f), "utf8");
  const n = conteudo.split("\n").length;
  const bytes = Buffer.byteLength(conteudo, "utf8");
  totalLinhas += n;
  totalBytes += bytes;
  inventario.push({ f, n, bytes, hash: createHash("sha512").update(conteudo).digest("hex") });
  linhas.push(
    "=".repeat(78),
    `ARQUIVO: ${f}`,
    `LINHAS: ${n}   BYTES: ${bytes}`,
    "=".repeat(78),
    conteudo,
  );
}

const corpo = linhas.join("\n");
const hash = createHash("sha512").update(corpo, "utf8").digest("hex");

mkdirSync(SAIDA, { recursive: true });
const nomeFonte = `arche-codigo-fonte-${commitCurto}.txt`;
writeFileSync(path.join(SAIDA, nomeFonte), corpo, "utf8");

const emGrupos = (h) => h.match(/.{1,64}/g).join("\n");
const resumo = `# Resumo digital (hash) do código-fonte — ARCHÉ

Gerado por \`scripts/pacote-inpi.mjs\`, que reproduz o mesmo arquivo e o mesmo
hash a partir do commit indicado. **Não edite este arquivo à mão.**

| | |
|---|---|
| Programa | ARCHÉ — Portal de gestão da PROPPEX / UNIEGO |
| Commit | \`${commit}\` |
| Data do commit | ${dataCommit} |
| Árvore de trabalho | ${sujo ? "**com alterações não commitadas** — gere de novo a partir de um commit limpo" : "limpa (idêntica ao commit)"} |
| Arquivos de código-fonte | ${arquivos.length} |
| Linhas | ${totalLinhas.toLocaleString("pt-BR")} |
| Bytes | ${totalBytes.toLocaleString("pt-BR")} |
| Algoritmo | SHA-512 |
| Arquivo que originou o hash | \`docs/inpi/${nomeFonte}\` |

## Resumo digital SHA-512

\`\`\`
${emGrupos(hash)}
\`\`\`

## O que o pacote NÃO inclui

- \`public/arche/\` — módulo de Avaliação Institucional: aplicação **compilada
  por terceiro** (Manus), integrada ao portal. Não é obra do titular e por isso
  não entra no registro; consta como componente de terceiro.
- \`dados/\` — lotes institucionais com nome, CPF e e-mail de pessoas reais.
- \`templates/\`, PDFs e imagens — documentos e arte, não código-fonte.
- \`node_modules/\` — bibliotecas de terceiros, cada uma sob a própria licença.

## Inventário dos arquivos

| Arquivo | Linhas | SHA-512 (12 primeiros) |
|---|---:|---|
${inventario.map((i) => `| \`${i.f}\` | ${i.n} | \`${i.hash.slice(0, 12)}\` |`).join("\n")}
`;

writeFileSync(path.join(SAIDA, "resumo-digital.md"), resumo, "utf8");

console.log(`Pacote gerado: docs/inpi/${nomeFonte}`);
console.log(`Arquivos: ${arquivos.length} · linhas: ${totalLinhas} · bytes: ${totalBytes}`);
console.log(`SHA-512: ${hash}`);
if (sujo) console.warn("\n⚠ Há alterações não commitadas — o hash não é reproduzível a partir do commit.");
