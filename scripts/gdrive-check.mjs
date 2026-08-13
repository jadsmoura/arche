import "dotenv/config";
import { google } from "googleapis";
import { driveAuth } from "../lib/files.js";

const drive = google.drive({ version: "v3", auth: driveAuth(google) });

// Localiza a pasta raiz: por ID fixo (funciona em qualquer lugar do Drive)
// ou, na ausência do ID, por nome na raiz do Drive.
let rootId = process.env.GDRIVE_FOLDER_ID;
const name = process.env.GDRIVE_FOLDER_NAME || "ARCHÉ";
if (!rootId) {
  const root = await drive.files.list({
    q: `'root' in parents and mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: "files(id,name)", pageSize: 1,
  });
  rootId = root.data.files?.[0]?.id;
}
console.log(`Pasta raiz "${name}": ${rootId ? "encontrada (id " + rootId + ")" : "NÃO encontrada"}`);

// Lista recursiva simples
async function walk(id, prefix) {
  const { data } = await drive.files.list({
    q: `'${id}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)", pageSize: 100,
  });
  for (const f of data.files) {
    const folder = f.mimeType === "application/vnd.google-apps.folder";
    console.log(`${prefix}${folder ? "📁 " : "📄 "}${f.name}`);
    if (folder) await walk(f.id, prefix + "   ");
  }
}
if (rootId) await walk(rootId, "  ");

// Apaga arquivo de teste, se passado por argumento
const del = process.argv[2];
if (del) {
  await drive.files.delete({ fileId: del });
  console.log(`\n🧹 arquivo de teste ${del} removido do Drive.`);
}
