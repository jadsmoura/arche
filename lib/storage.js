/* ========================================================================
   Camada de persistência do "estado" (key-value).
   - Produção: MySQL/MariaDB (quando DATABASE_URL está definido).
   - Desenvolvimento: arquivo JSON local (data/estado.json) — zero config.
   A API pública é a mesma nos dois modos: get / set / del / list.
   ======================================================================== */
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const DATA_DIR = process.env.DATA_DIR || "data";
const STATE_FILE = path.join(DATA_DIR, "estado.json");

let backend = null;

async function initLocal() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let cache = {};
  try {
    cache = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  let writing = Promise.resolve();
  const flush = () => {
    writing = writing.then(() =>
      fs.writeFile(STATE_FILE, JSON.stringify(cache, null, 0), "utf8"),
    );
    return writing;
  };
  return {
    mode: "local",
    async get(chave) {
      if (!(chave in cache)) return null;
      return cache[chave];
    },
    async set(chave, valor) {
      cache[chave] = String(valor ?? "");
      await flush();
    },
    async del(chave) {
      delete cache[chave];
      await flush();
    },
    async list(prefixo) {
      const keys = Object.keys(cache);
      return prefixo ? keys.filter((k) => k.startsWith(prefixo)) : keys;
    },
    // grava tudo o que estiver pendente (usado antes de operações críticas);
    // o modo local grava a cada set, então `agora` não muda nada aqui
    async flush() { await writing; },
  };
}

async function initMysql() {
  const mysql = (await import("mysql2/promise")).default;
  const db = mysql.createPool(process.env.DATABASE_URL);
  return {
    mode: "mysql",
    async get(chave) {
      const [rows] = await db.execute(
        "SELECT valor FROM estado WHERE chave = ? LIMIT 1",
        [chave],
      );
      return rows.length ? rows[0].valor : null;
    },
    async set(chave, valor) {
      await db.execute(
        "INSERT INTO estado (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), updatedAt = CURRENT_TIMESTAMP",
        [chave, String(valor ?? "")],
      );
    },
    async del(chave) {
      await db.execute("DELETE FROM estado WHERE chave = ?", [chave]);
    },
    async list(prefixo) {
      const [rows] = prefixo
        ? await db.execute("SELECT chave FROM estado WHERE chave LIKE ?", [
            `${prefixo}%`,
          ])
        : await db.execute("SELECT chave FROM estado");
      return rows.map((r) => r.chave);
    },
    // o UPSERT já é síncrono por chave — nada pendente para gravar
    async flush() {},
  };
}

async function initDriveStore() {
  const { driveContext } = await import("./files.js");
  const { drive, rootId } = await driveContext();
  const FILE = "_estado.json";
  let fileId = null;
  let cache = {};

  const found = await drive.files.list({
    q: `'${rootId}' in parents and name = '${FILE}' and trashed = false`,
    fields: "files(id)", pageSize: 1,
  });
  fileId = found.data.files?.[0]?.id || null;
  // Se o arquivo EXISTE mas não pôde ser lido, o cache vazio não representa o
  // estado real: gravar a partir dele apagaria tudo. Nesse caso o backend
  // entra em modo somente-leitura até o próximo boot.
  let degradado = false;
  if (fileId) {
    try {
      const resp = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      cache = resp.data ? JSON.parse(resp.data) : {};
    } catch (e) {
      degradado = true;
      console.error("[storage] NÃO foi possível ler o estado no Drive — gravação bloqueada nesta instância:", e.message);
    }
  }

  let timer = null;
  let sujo = false;                 // evita reescrever o arquivo à toa
  let flushing = Promise.resolve();
  /* A JANELA DE UPLOAD: o estado é UM arquivo, e cada upload sobe o arquivo
     INTEIRO. Ela existe para as RAJADAS — dez crachás na porta em dez
     segundos viravam dez uploads completos, e a fila parecia um sistema
     travado —, e o que muda dentro dela sobe de uma vez.

     São 1,2 s, e VOLTARAM a ser (set/2026). Eu a havia esticado para 60 s
     para cortar banda, e foi um erro de julgamento: o que a janela guarda
     ainda não existe fora desta instância, então esticá-la é esticar o
     tempo em que uma gravação pode se perder — e um deploy no meio dela
     leva junto o que estava só na memória. Perder a presença de quem foi
     credenciado é pior do que qualquer economia: o certificado dessa pessoa
     não sai, e ninguém descobre a tempo. Com 1,2 s a rajada continua sendo
     agrupada (é para isso que a janela serve) e a exposição volta a ser de
     um segundo — que é como o sistema rodou por meses sem perder nada.
     A economia de banda vive nos outros quatro cortes, que não arriscam
     dado nenhum: a compressão HTTP, o poll leve da gestão, as artes fora do
     arquivo de estado e a foto do portfólio reduzida antes de subir. */
  const JANELA_MS = Math.max(200, Number(process.env.ESTADO_JANELA_MS) || 1200);

  async function gravar() {
    if (degradado) throw new Error("estado não pôde ser lido no boot — gravação bloqueada");
    if (!sujo) return;              // nada mudou: não reescreve o arquivo
    sujo = false;
    const body = JSON.stringify(cache);
    // DIAGNÓSTICO DE BANDA: é aqui que o arquivo INTEIRO sobe, e é por isso
    // que o gasto cresce com o tamanho do estado, não com o da alteração
    try {
      const { medir } = await import("./medidor.js");
      medir("drive-estado", Buffer.byteLength(body));
    } catch { /* medir nunca atrapalha a gravação */ }
    if (!fileId) {
      const c = await drive.files.create({
        requestBody: { name: FILE, parents: [rootId] },
        media: { mimeType: "application/json", body: Readable.from(body) },
        fields: "id",
      });
      fileId = c.data.id;
    } else {
      await drive.files.update({
        fileId,
        media: { mimeType: "application/json", body: Readable.from(body) },
      });
    }
  }

  function scheduleFlush() {
    sujo = true;
    if (timer) return;
    // o relógio começa na PRIMEIRA gravação suja e não se estende com as
    // seguintes: o pior caso é sempre uma janela, nunca mais
    timer = setTimeout(() => {
      timer = null;
      flushing = flushing.then(gravar)
        .catch((e) => console.error("Erro ao gravar estado no Drive:", e.message));
    }, JANELA_MS);
  }

  /* `flush()` sem argumento só GARANTE que o que está sujo sobe na próxima
     janela — não espera o upload e não força um. `flush({ agora: true })`
     sobe agora e PROPAGA o erro: é para quem depende do dado estar salvo
     antes de seguir (o e-mail com o QR, o encerramento do processo). */
  async function flush({ agora = false } = {}) {
    if (!agora) { if (sujo && !timer) scheduleFlush(); return; }
    if (timer) { clearTimeout(timer); timer = null; }
    const p = flushing.then(gravar);
    flushing = p.catch(() => {});   // mantém a corrente viva após falha
    await p;
  }

  return {
    mode: degradado ? "gdrive (somente leitura)" : "gdrive",
    async get(chave) { return chave in cache ? cache[chave] : null; },
    async set(chave, valor) {
      if (degradado) throw new Error("estado indisponível — gravação bloqueada");
      cache[chave] = String(valor ?? ""); scheduleFlush();
    },
    async del(chave) {
      if (degradado) throw new Error("estado indisponível — gravação bloqueada");
      delete cache[chave]; scheduleFlush();
    },
    async list(prefixo) {
      const keys = Object.keys(cache);
      return prefixo ? keys.filter((k) => k.startsWith(prefixo)) : keys;
    },
    flush,
  };
}

export async function getStorage() {
  if (backend) return backend;
  const name =
    process.env.STATE_BACKEND || (process.env.DATABASE_URL ? "mysql" : "local");
  if (name === "mysql") backend = await initMysql();
  else if (name === "drive") backend = await initDriveStore();
  else backend = await initLocal();
  return backend;
}
