/* Reorganização única: move o conteúdo existente (migração Manus = Psicologia)
   para subpastas por curso:
     avaliacao/indicador-*  ->  avaliacao/psicologia/indicador-*
     dossie/<professor>     ->  dossie/psicologia/<professor>
   Mover no Drive NÃO muda IDs => nenhum link do estado quebra. */
import "dotenv/config";
import { google } from "googleapis";
import { driveAuth } from "../lib/files.js";

const drive = google.drive({ version: "v3", auth: driveAuth(google) });
const ROOT = process.env.GDRIVE_FOLDER_ID;

async function childFolder(parent, name) {
  const { data } = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: "files(id)", pageSize: 1,
  });
  return data.files?.[0]?.id || null;
}
async function ensureChild(parent, name) {
  let id = await childFolder(parent, name);
  if (!id) {
    const c = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parent] },
      fields: "id",
    });
    id = c.data.id;
  }
  return id;
}
async function listChildren(parent) {
  const out = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${parent}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType)", pageSize: 1000, pageToken,
    });
    out.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

for (const secao of ["avaliacao", "dossie"]) {
  const secId = await childFolder(ROOT, secao);
  if (!secId) { console.log(`(${secao} não existe — pulando)`); continue; }
  const psic = await ensureChild(secId, "psicologia");
  const kids = await listChildren(secId);
  let moved = 0;
  for (const k of kids) {
    if (k.id === psic || k.name === "psicologia") continue;
    await drive.files.update({ fileId: k.id, addParents: psic, removeParents: secId, fields: "id" });
    moved++;
  }
  console.log(`✓ ${secao}: ${moved} itens movidos para ${secao}/psicologia/`);
}
console.log("✓ Reorganização concluída (docs-institucionais mantidos como institucionais).");
