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
  if (fileId) {
    try {
      const resp = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      cache = resp.data ? JSON.parse(resp.data) : {};
    } catch { cache = {}; }
  }

  let timer = null;
  let flushing = Promise.resolve();
  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const body = JSON.stringify(cache);
      flushing = flushing
        .then(async () => {
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
        })
        .catch((e) => console.error("Erro ao gravar estado no Drive:", e.message));
    }, 1200);
  }

  return {
    mode: "gdrive",
    async get(chave) { return chave in cache ? cache[chave] : null; },
    async set(chave, valor) { cache[chave] = String(valor ?? ""); scheduleFlush(); },
    async del(chave) { delete cache[chave]; scheduleFlush(); },
    async list(prefixo) {
      const keys = Object.keys(cache);
      return prefixo ? keys.filter((k) => k.startsWith(prefixo)) : keys;
    },
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
