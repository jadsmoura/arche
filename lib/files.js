/* ========================================================================
   Camada de armazenamento de arquivos (uploads).
   Três backends, escolhidos por ambiente:
     - Google Drive : GDRIVE_FOLDER_ID + credencial de conta de serviço.
     - S3           : S3_BUCKET + credenciais (AWS, MinIO, Wasabi...).
     - Local (disco): padrão de desenvolvimento (data/uploads/).
   API comum: save({buffer, originalName, contentType, prefix}) -> {fileId, link, name, size}
              serve(fileId, res)  — entrega o arquivo (stream ou redirect).
   ======================================================================== */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { nanoid } from "nanoid";

const DATA_DIR = process.env.DATA_DIR || "data";
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export function slug(value) {
  return (
    String(value || "arquivo")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "arquivo"
  );
}

const CT = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip", xml: "application/xml",
};
export function contentType(name) {
  const ext = String(name).split(".").pop()?.toLowerCase();
  return CT[ext] || "application/octet-stream";
}

/* O QUE PODE ABRIR NUMA GUIA, EM VEZ DE BAIXAR (pergunta do dono, ago/2026,
   conferindo os Documentos Institucionais: "cliquei pra ver um e ele me dá
   opção de baixar; é possível ele abrir em uma nova guia direto? Acho mais
   fluido"). É, e para quem CONFERE documento — a pró-reitoria passando por
   trinta, o avaliador do MEC clicando no comprovante — baixar cada um para
   abrir na pasta de downloads é o caminho mais longo possível.

   A lista é FECHADA e curta de propósito, e é por segurança, não por
   preguiça: o arquivo é enviado por usuário e servido no MESMO endereço do
   portal, então tudo o que o navegador ABRE ali roda como se fosse página
   do ARCHÉ. Um .html ou um .svg enviado como "comprovante" leria o cookie
   de sessão de quem clicasse. PDF e imagem RASTER não executam nada: o
   navegador os desenha no visualizador próprio, fora do documento. Todo o
   resto continua baixando, que é o comportamento seguro.

   Não relaxe isto para "todo tipo conhecido": `xml` está no catálogo e não
   entra aqui de propósito. */
const ABRE_NA_GUIA = new Set(["application/pdf", "image/png", "image/jpeg"]);
export const abreNoNavegador = (name) => ABRE_NA_GUIA.has(contentType(name));

/* A rota já mandou `attachment` antes de chamar o backend: aqui só se
   AFROUXA, e só para a lista fechada acima. Backend que esqueça de chamar
   isto continua baixando — o padrão seguro é o que fica de pé sozinho. */
export function disposicao(res, nome) {
  if (!abreNoNavegador(nome)) return;
  const limpo = String(nome).split("/").pop().replace(/["\\\r\n]/g, "");
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(limpo)}`,
  );
}

let backend = null;

/* ----------------------------- LOCAL (disco) ---------------------------- */
function initLocal() {
  return {
    mode: "local",
    async save({ buffer, originalName, prefix }) {
      const key = `${prefix}/${nanoid()}-${slug(originalName)}`;
      const dest = path.join(UPLOAD_DIR, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buffer);
      return {
        fileId: key,
        link: `/api/files/${encodeURIComponent(key)}`,
        name: originalName,
        size: buffer.length,
      };
    },
    /* Ler o arquivo de volta, como Buffer. Existe para o PDF do relatório
       final embutir as fotos do portfólio: é o documento que a PROPPEX leva
       ao avaliador do MEC, e uma lista de nomes de arquivo não comprova a
       realização — a foto, sim. Devolve null quando não dá: um anexo que
       falha não pode derrubar a geração do relatório inteiro. */
    async read(fileId) {
      try {
        const baseAbs = path.resolve(UPLOAD_DIR);
        const dest = path.resolve(UPLOAD_DIR, fileId);
        if (dest !== baseAbs && !dest.startsWith(baseAbs + path.sep)) return null;
        return await fsp.readFile(dest);
      } catch { return null; }
    },
    async serve(fileId, res) {
      const baseAbs = path.resolve(UPLOAD_DIR);
      const dest = path.resolve(UPLOAD_DIR, fileId);
      if (dest !== baseAbs && !dest.startsWith(baseAbs + path.sep)) return res.status(400).end();
      if (!fs.existsSync(dest)) return res.status(404).send("Arquivo não encontrado");
      res.setHeader("Content-Type", contentType(fileId));
      disposicao(res, fileId);
      fs.createReadStream(dest).pipe(res);
    },
  };
}

/* -------------------------------- S3 ------------------------------------ */
async function initS3() {
  const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return {
    mode: "s3",
    async save({ buffer, originalName, prefix }) {
      const key = `${prefix}/${nanoid()}-${slug(originalName)}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET, Key: key, Body: buffer,
        ContentType: contentType(originalName),
      }));
      return {
        fileId: key,
        link: `/api/files/${encodeURIComponent(key)}`,
        name: originalName, size: buffer.length,
      };
    },
    async read(fileId) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: fileId }));
        return Buffer.from(await out.Body.transformToByteArray());
      } catch { return null; }
    },
    async serve(fileId, res) {
      // no S3 o navegador vai direto ao objeto: quem manda no cabeçalho é a
      // própria URL assinada, não a resposta desta rota
      const url = await getSignedUrl(
        s3, new GetObjectCommand({
          Bucket: process.env.S3_BUCKET, Key: fileId,
          ResponseContentType: contentType(fileId),
          ResponseContentDisposition: abreNoNavegador(fileId) ? "inline" : "attachment",
        }),
        { expiresIn: 900 },
      );
      res.redirect(302, url);
    },
  };
}

/* --------------------------- GOOGLE DRIVE ------------------------------- */
export function driveAuth(google) {
  // OAuth (Gmail pessoal): arquivos ficam no Drive do usuário.
  if (process.env.GDRIVE_OAUTH_REFRESH_TOKEN) {
    const oauth = new google.auth.OAuth2(
      process.env.GDRIVE_OAUTH_CLIENT_ID,
      process.env.GDRIVE_OAUTH_CLIENT_SECRET,
    );
    oauth.setCredentials({ refresh_token: process.env.GDRIVE_OAUTH_REFRESH_TOKEN });
    return oauth;
  }
  // Conta de serviço (Workspace / Drive Compartilhado).
  const credentials = process.env.GDRIVE_KEY_JSON
    ? JSON.parse(process.env.GDRIVE_KEY_JSON)
    : undefined;
  return new google.auth.GoogleAuth({
    credentials,
    keyFile: credentials ? undefined : process.env.GDRIVE_KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

// Contexto do Drive (auth + pasta raiz), memoizado e reutilizável por
// files.js (uploads) e storage.js (estado).
let _ctx = null;
export async function driveContext() {
  if (_ctx) return _ctx;
  const { google } = await import("googleapis");
  const drive = google.drive({ version: "v3", auth: driveAuth(google) });
  let rootId = process.env.GDRIVE_FOLDER_ID;
  if (!rootId) {
    const name = process.env.GDRIVE_FOLDER_NAME || "ARCHÉ";
    // Procura a pasta em QUALQUER lugar do Drive (não só na raiz): o escopo
    // drive.file só enxerga o que o app criou, então isto encontra a pasta
    // verdadeira mesmo que o usuário a tenha movido. A mais antiga vence.
    const { data } = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id,createdTime)", orderBy: "createdTime", pageSize: 5,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    rootId = data.files?.[0]?.id;
    if (!rootId) {
      const created = await drive.files.create({
        requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: ["root"] },
        fields: "id", supportsAllDrives: true,
      });
      rootId = created.data.id;
    }
  }
  _ctx = { google, drive, rootId };
  return _ctx;
}

async function initDrive() {
  const { drive, rootId: ROOT } = await driveContext();
  const folderCache = new Map(); // caminho -> folderId

  async function ensureFolder(parts) {
    let parentId = ROOT;
    let acc = "";
    for (const raw of parts) {
      const name = slug(raw);
      acc += "/" + name;
      if (folderCache.has(acc)) { parentId = folderCache.get(acc); continue; }
      const q = [
        `'${parentId}' in parents`,
        "mimeType = 'application/vnd.google-apps.folder'",
        `name = '${name.replace(/'/g, "\\'")}'`,
        "trashed = false",
      ].join(" and ");
      const { data } = await drive.files.list({
        q, fields: "files(id)", pageSize: 1,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      let id = data.files?.[0]?.id;
      if (!id) {
        const created = await drive.files.create({
          requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
          fields: "id", supportsAllDrives: true,
        });
        id = created.data.id;
      }
      folderCache.set(acc, id);
      parentId = id;
    }
    return parentId;
  }

  return {
    mode: "gdrive",
    async save({ buffer, originalName, prefix }) {
      const parts = String(prefix).split("/").filter(Boolean);
      const folderId = await ensureFolder(parts);
      const created = await drive.files.create({
        requestBody: { name: originalName, parents: [folderId] },
        media: { mimeType: contentType(originalName), body: Readable.from(buffer) },
        fields: "id, size", supportsAllDrives: true,
      });
      const fileId = created.data.id;
      // DIAGNÓSTICO DE BANDA: o anexo sai uma vez por arquivo — diferente do
      // estado, que sai inteiro a cada gravação
      try {
        const { medir } = await import("./medidor.js");
        medir("drive-upload", buffer.length);
      } catch { /* medir nunca atrapalha o upload */ }
      return {
        fileId,
        link: `/api/files/${encodeURIComponent(fileId)}`,
        name: originalName, size: buffer.length,
      };
    },
    async read(fileId) {
      try {
        if (!(await this.dentroDaPasta(fileId))) return null;
        const { data } = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );
        const buf = Buffer.from(data);
        // DIAGNÓSTICO DE BANDA: a leitura do anexo é entrada, não saída, mas
        // conta como tráfego do Drive — quem paga a franquia é a mesma conta
        try {
          const { medir } = await import("./medidor.js");
          medir("drive-download", buf.length);
        } catch { /* medir nunca atrapalha a leitura */ }
        return buf;
      } catch { return null; }
    },
    /* O arquivo pedido está DENTRO da pasta ARCHÉ? (achado da varredura de
       ago/2026.) Em produção o Drive é acessado com a conta do dono, e a
       rota recebia o id direto do endereço: qualquer arquivo que aquela
       conta consiga ler — inclusive documento pessoal dela ou algo que um
       terceiro compartilhou — sairia pelo domínio da instituição. O backend
       LOCAL sempre confinou o caminho; este não confinava nada.
       A subida é feita sempre por `ensureFolder`, então todo anexo legítimo
       tem um ancestral na árvore da pasta ARCHÉ. */
    async dentroDaPasta(fileId) {
      let atual = fileId;
      // a árvore é rasa (extensao/<curso>/<nº>/portfolio = 4 níveis); o teto
      // existe só para um `parents` circular não virar laço infinito
      for (let salto = 0; salto < 8; salto++) {
        const { data } = await drive.files.get({
          fileId: atual, fields: "id, parents", supportsAllDrives: true,
        });
        if (atual === ROOT) return true;
        const pai = data.parents?.[0];
        if (!pai) return false;
        if (pai === ROOT) return true;
        atual = pai;
      }
      return false;
    },
    async serve(fileId, res) {
      try {
        if (!(await this.dentroDaPasta(fileId))) return res.status(404).send("Arquivo não encontrado");
        const meta = await drive.files.get({
          fileId, fields: "name", supportsAllDrives: true,
        });
        res.setHeader("Content-Type", contentType(meta.data.name));
        disposicao(res, meta.data.name);
        const stream = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "stream" },
        );
        stream.data.pipe(res);
      } catch {
        res.status(404).send("Arquivo não encontrado");
      }
    },
  };
}

export async function getFiles() {
  if (backend) return backend;
  const driveOn =
    process.env.GDRIVE_OAUTH_REFRESH_TOKEN ||
    process.env.GDRIVE_KEY_FILE ||
    process.env.GDRIVE_KEY_JSON ||
    process.env.GDRIVE_FOLDER_ID;
  if (driveOn) backend = await initDrive();
  else if (process.env.S3_BUCKET) backend = await initS3();
  else backend = initLocal();
  return backend;
}
