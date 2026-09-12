/* O server.js chama uma função das bibliotecas e esquece de IMPORTÁ-LA: o
   arquivo carrega, os testes passam, e a rota morre com ReferenceError na
   primeira vez que alguém a usa. Foi o que aconteceu com `somaDias` na agenda
   dos Espaços (set/2026): a rota respondia 500 sempre que `ate` não vinha no
   endereço — e como a tela sempre manda os dois, ninguém via.
   Este teste é a rede: conferir que tudo o que o server.js chama e que é NOME
   EXPORTADO por uma lib do projeto está de fato importado. Restringir os
   candidatos aos nomes exportados é o que torna a conferência utilizável — sem
   isso, a prosa dos comentários entra como "identificador não declarado". */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.join(import.meta.dirname, "..");

/** Tira comentários e literais, preservando as quebras de linha. */
function semComentarios(s) {
  let out = "", i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { if (s[i] === "\n") out += "\n"; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; if (s[i] === "\n") out += "\n"; i++; }
      i++; out += "''"; continue;
    }
    out += c; i++;
  }
  return out;
}

const nomesExportados = (src) => {
  const fora = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) fora.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) fora.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(",")) {
      const n = p.split(" as ").pop().trim();
      if (/^\w+$/.test(n)) fora.add(n);
    }
  }
  return fora;
};

test("server.js importa tudo o que chama das bibliotecas do projeto", () => {
  const bruto = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");
  const src = semComentarios(bruto);

  /* o que o server.js traz de fora */
  const importado = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const p of m[1].split(",")) {
      const n = p.split(" as ").pop().trim();
      if (n) importado.add(n);
    }
  }
  for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) importado.add(m[1]);
  for (const m of src.matchAll(/import\s*\*\s*as\s*(\w+)/g)) importado.add(m[1]);

  /* o que ele mesmo declara */
  const declarado = new Set();
  for (const m of src.matchAll(/(?:async\s+)?function\s+(\w+)/g)) declarado.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)/g)) declarado.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(",")) {
      const n = p.split(":").pop().split("=")[0].trim();
      if (/^\w+$/.test(n)) declarado.add(n);
    }
  }
  /* e o que chega DESESTRUTURADO no parâmetro de uma função — é assim que o
     server.js recebe o mailer num `import()` dinâmico
     (`.then(({ enviarEmail, emailFeedback }) => …)`) */
  for (const m of src.matchAll(/\{([^{}]*)\}\s*\)?\s*=>/g)) {
    for (const p of m[1].split(",")) {
      const n = p.split(":").pop().split("=")[0].trim();
      if (/^\w+$/.test(n)) declarado.add(n);
    }
  }

  /* tudo o que as libs do projeto exportam, com o arquivo de origem */
  const deQuem = new Map();
  for (const f of fs.readdirSync(path.join(RAIZ, "lib"))) {
    if (!f.endsWith(".js")) continue;
    const s = fs.readFileSync(path.join(RAIZ, "lib", f), "utf8");
    for (const n of nomesExportados(s)) if (!deQuem.has(n)) deQuem.set(n, `lib/${f}`);
  }
  for (const f of fs.readdirSync(path.join(RAIZ, "lib", "pagamentos"))) {
    if (!f.endsWith(".js")) continue;
    const s = fs.readFileSync(path.join(RAIZ, "lib", "pagamentos", f), "utf8");
    for (const n of nomesExportados(s)) if (!deQuem.has(n)) deQuem.set(n, `lib/pagamentos/${f}`);
  }

  /* quem é CHAMADO no server.js, é nome exportado por uma lib, e não veio */
  const faltando = [];
  for (const m of src.matchAll(/(?<![\w.$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const n = m[1];
    if (importado.has(n) || declarado.has(n) || !deQuem.has(n)) continue;
    const linha = src.slice(0, m.index).split("\n").length;
    if (!faltando.some((x) => x.n === n)) faltando.push({ n, linha, onde: deQuem.get(n) });
  }

  assert.deepEqual(faltando, [], "chamadas a funções de lib que o server.js não importou: "
    + faltando.map((x) => `${x.n} (de ${x.onde}, usada em server.js:${x.linha})`).join("; "));
});

/* O MESMO DEFEITO DO LADO DA TELA: a página usa um componente compartilhado e
   carrega a tag dele DEPOIS do script que o chama. Como o uso costuma estar
   dentro de um `fetch().then()`, é uma CORRIDA — passa no computador do
   desenvolvedor e falha na primeira visita de quem tem rede lenta, com a lista
   em branco e "ArchePag is not defined" no console. Aconteceu em /usuarios/ e
   /curso/ (set/2026). Tag clássica (sem defer/async) ANTES do uso resolve por
   construção: o navegador segura o inline até o componente chegar. */
const COMPONENTES = [
  ["ArchePag", "/assets/arche-paginacao.js"],
  ["ArcheFiltros", "/assets/arche-filtros.js"],
  ["ArcheEditais", "/assets/arche-editais.js"],
];

const paginas = (dir, achadas = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== "arche") paginas(p, achadas); }   // o app compilado não é nosso
    else if (f.name.endsWith(".html")) achadas.push(p);
  }
  return achadas;
};

test("o componente compartilhado é carregado ANTES do script que o usa", () => {
  const erradas = [];
  for (const arq of paginas(path.join(RAIZ, "public"))) {
    const html = fs.readFileSync(arq, "utf8");
    for (const [nome, src] of COMPONENTES) {
      const uso = html.indexOf(`${nome}.`);
      if (uso < 0) continue;
      const tag = html.indexOf(`src="${src}"`);
      const rel = path.relative(RAIZ, arq);
      if (tag < 0) erradas.push(`${rel}: usa ${nome} e NÃO carrega ${src}`);
      else if (tag > uso) erradas.push(`${rel}: carrega ${src} depois do primeiro uso de ${nome}`);
    }
  }
  assert.deepEqual(erradas, [], erradas.join("; "));
});
