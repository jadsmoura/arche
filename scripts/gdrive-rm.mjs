import "dotenv/config";
import { google } from "googleapis";
import { driveAuth } from "../lib/files.js";

const drive = google.drive({ version: "v3", auth: driveAuth(google) });
const rootName = process.env.GDRIVE_FOLDER_NAME || "ARCHÉ";
const target = process.argv[2]; // nome de subpasta a remover sob a raiz

let rootId = process.env.GDRIVE_FOLDER_ID;
if (!rootId) {
  const root = await drive.files.list({
    q: `'root' in parents and mimeType='application/vnd.google-apps.folder' and name='${rootName}' and trashed=false`,
    fields: "files(id)", pageSize: 1,
  });
  rootId = root.data.files?.[0]?.id;
}
if (!rootId) { console.log("raiz não encontrada"); process.exit(0); }

const sub = await drive.files.list({
  q: `'${rootId}' in parents and name='${target}' and trashed=false`,
  fields: "files(id,name)", pageSize: 1,
});
const id = sub.data.files?.[0]?.id;
if (!id) { console.log(`"${target}" não existe sob ${rootName} (nada a remover)`); process.exit(0); }
await drive.files.delete({ fileId: id });
console.log(`🧹 removido: ${rootName}/${target}`);
