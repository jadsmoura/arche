/* ========================================================================
   Autorização OAuth do Google Drive (uma única vez).
   Pré-requisito no .env:
     GDRIVE_OAUTH_CLIENT_ID=...
     GDRIVE_OAUTH_CLIENT_SECRET=...
   Uso:  node scripts/gdrive-auth.mjs
   Abre um link, você autoriza com seu Gmail, e o refresh token é gravado
   automaticamente no .env (GDRIVE_OAUTH_REFRESH_TOKEN).
   ======================================================================== */
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import { google } from "googleapis";

const PORT = 5599;
const REDIRECT = `http://localhost:${PORT}`;
const CLIENT_ID = process.env.GDRIVE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GDRIVE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("✗ Defina GDRIVE_OAUTH_CLIENT_ID e GDRIVE_OAUTH_CLIENT_SECRET no .env primeiro.");
  process.exit(1);
}

const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const authUrl = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

function saveRefreshToken(token) {
  const path = ".env";
  let content = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
  const line = `GDRIVE_OAUTH_REFRESH_TOKEN=${token}`;
  if (/^GDRIVE_OAUTH_REFRESH_TOKEN=.*$/m.test(content)) {
    content = content.replace(/^GDRIVE_OAUTH_REFRESH_TOKEN=.*$/m, line);
  } else {
    content += (content.endsWith("\n") || content === "" ? "" : "\n") + line + "\n";
  }
  fs.writeFileSync(path, content, "utf8");
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get("code");
  if (!code) { res.end("Aguardando autorização..."); return; }
  try {
    const { tokens } = await oauth.getToken(code);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (tokens.refresh_token) {
      saveRefreshToken(tokens.refresh_token);
      res.end("<h2 style='font-family:sans-serif'>✓ Autorizado! Token gravado no .env. Pode fechar esta aba.</h2>");
      console.log("\n✓ Refresh token obtido e gravado em .env (GDRIVE_OAUTH_REFRESH_TOKEN).");
      console.log("  Agora reinicie o servidor: node server.js\n");
    } else {
      res.end("<h2 style='font-family:sans-serif'>Autorizado, mas sem refresh token. Rode de novo.</h2>");
      console.log("\n✗ Não veio refresh_token. Revogue o acesso e rode novamente (prompt=consent).\n");
    }
    server.close(() => process.exit(0));
  } catch (e) {
    res.end("Erro: " + e.message);
    console.error(e);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => {
  console.log("\n1) Abra este link no navegador (logado no Gmail que vai guardar os arquivos):\n");
  console.log("   " + authUrl + "\n");
  console.log("2) Autorize. Se aparecer 'app não verificado': Avançado → Acessar (não seguro).");
  console.log("   Aguardando retorno em " + REDIRECT + " ...\n");
});
