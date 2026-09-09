import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import {
  idDoObjeto, idDaClasse, objetoDoPasse, jwtDeSalvar, assertionOAuth, explicarErro,
  tokenDeAcesso, garantirClasse, gravarObjeto, testar, esquecerToken, ultimoErro, ESCOPO,
} from "../lib/wallet.js";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const CRED = { email: "arche@proj.iam.gserviceaccount.com", chave: privateKey };
const EMISSOR = "3388000000012345678";
const decodifica = (jwt) => {
  const [h, c, s] = jwt.split(".");
  const ok = crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, s, "base64url");
  return { ok, corpo: JSON.parse(Buffer.from(c, "base64url").toString()) };
};

test("os ids do passe só levam o que o Google aceita", () => {
  assert.equal(idDoObjeto(EMISSOR, "a0ac0e38833b7a41351cbb"), `${EMISSOR}.a0ac0e38833b7a41351cbb`);
  assert.equal(idDoObjeto(EMISSOR, "x/y z@w"), `${EMISSOR}.x-y-z-w`);
  assert.equal(idDaClasse(EMISSOR), `${EMISSOR}.arche-evento`);
});

test("o objeto do passe é o crachá do inscrito", () => {
  const o = objetoDoPasse({ emissor: EMISSOR, classe: idDaClasse(EMISSOR), base: "https://arche.app.br",
    inscrito: { token: "a0ac0e38833b7a41351cbb", nome: "Ana Souza" },
    proposta: { nomeAtividade: "Semana de Enfermagem", periodoInicio: "2026-10-19", periodoFim: "2026-10-23", local: "Auditório", municipio: "Goianésia" },
    evento: { slug: "semana-enf", capa: { fileId: "x" } }, codigo: "a0ac0e" });
  assert.equal(o.id, `${EMISSOR}.a0ac0e38833b7a41351cbb`);
  assert.equal(o.barcode.value, "a0ac0e38833b7a41351cbb");
  assert.equal(o.barcode.alternateText, "A0AC0E");
  assert.equal(o.textModulesData[0].body, "19/10/2026 a 23/10/2026");
  assert.equal(o.textModulesData[1].body, "Auditório — Goianésia");
  assert.ok(o.heroImage.sourceUri.uri.endsWith("/api/publico/eventos/semana-enf/capa"));
  const sem = objetoDoPasse({ emissor: EMISSOR, classe: "c", base: "https://x", inscrito: { token: "t" }, evento: {} });
  assert.equal(sem.heroImage, undefined, "sem capa não há heroImage");
  assert.equal(sem.subheader.defaultValue.value, "Participante");
});

test("o JWT do link é curto por padrão e completo só na saída de emergência", () => {
  const objeto = objetoDoPasse({ emissor: EMISSOR, classe: "c", base: "https://arche.app.br", inscrito: { token: "abc" }, evento: {} });
  const curto = jwtDeSalvar({ ...CRED, origins: ["https://arche.app.br"], objeto });
  const { ok, corpo } = decodifica(curto);
  assert.ok(ok, "assinatura confere com a chave pública");
  assert.equal(corpo.typ, "savetowallet");
  assert.equal(corpo.aud, "google");
  assert.equal(corpo.iss, CRED.email);
  assert.deepEqual(corpo.payload, { genericObjects: [{ id: objeto.id }] });
  assert.ok(curto.length < 900, `o link curto cabe com folga (${curto.length})`);
  const completo = jwtDeSalvar({ ...CRED, origins: [], objeto, classe: { id: "c" }, completo: true });
  const c2 = decodifica(completo).corpo;
  assert.equal(c2.payload.genericObjects[0].barcode.value, "abc");
  assert.deepEqual(c2.payload.genericClasses, [{ id: "c" }]);
});

test("a asserção OAuth pede o escopo do emissor de passes", () => {
  const { ok, corpo } = decodifica(assertionOAuth({ ...CRED, agora: 1000 }));
  assert.ok(ok);
  assert.equal(corpo.scope, ESCOPO);
  assert.equal(corpo.exp - corpo.iat, 3600);
  assert.equal(corpo.aud, "https://oauth2.googleapis.com/token");
});

test("a frase do Google vira o que a gestão pode fazer", () => {
  assert.match(explicarErro("classe", 403, { error: { message: "The caller does not have permission" } }), /conta de serviço não tem permissão.*Usuários/);
  assert.match(explicarErro("token", 400, { error: "invalid_grant", error_description: "Invalid JWT Signature." }), /chave.*não batem/);
  assert.match(explicarErro("objeto", 400, { error: { message: "Invalid image" } }), /Invalid image/);
  assert.match(explicarErro("objeto", 0, { texto: "fetch failed" }), /não respondeu/);
});

/* Um Google de mentira: token, classe (404 na primeira leitura, criada no
   POST) e objeto (409 no segundo POST, PUT atualiza). Com FALSO_403 o emissor
   recusa a conta de serviço — o caso real de set/2026. */
function googleFalso() {
  const classes = new Set(), objetos = new Set();
  const log = [];
  const srv = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (d) => { corpo += d; });
    req.on("end", () => {
      log.push(`${req.method} ${req.url}`);
      const json = (st, o) => { res.writeHead(st, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url === "/token") {
        const p = new URLSearchParams(corpo);
        if (p.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || !p.get("assertion"))
          return json(400, { error: "invalid_request" });
        if (process.env.FALSO_TOKEN_RUIM) return json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
        return json(200, { access_token: "tok-1", expires_in: 3600, token_type: "Bearer" });
      }
      if (req.headers.authorization !== "Bearer tok-1") return json(401, { error: { message: "sem token" } });
      if (process.env.FALSO_403) return json(403, { error: { message: "The caller does not have permission", status: "PERMISSION_DENIED" } });
      let m;
      if ((m = req.url.match(/^\/v1\/genericClass\/(.+)$/)) && req.method === "GET")
        return classes.has(decodeURIComponent(m[1])) ? json(200, { id: m[1] }) : json(404, { error: { message: "not found" } });
      if (req.url === "/v1/genericClass" && req.method === "POST") {
        const c = JSON.parse(corpo); if (classes.has(c.id)) return json(409, {}); classes.add(c.id); return json(200, c);
      }
      if (req.url === "/v1/genericObject" && req.method === "POST") {
        const o = JSON.parse(corpo); if (objetos.has(o.id)) return json(409, { error: { message: "exists" } }); objetos.add(o.id); return json(200, o);
      }
      if ((m = req.url.match(/^\/v1\/genericObject\/(.+)$/)) && req.method === "PUT")
        return objetos.has(decodeURIComponent(m[1])) ? json(200, JSON.parse(corpo)) : json(404, {});
      json(404, { error: { message: `rota desconhecida ${req.url}` } });
    });
  });
  return { srv, log, classes, objetos };
}

test("a API do Google: token, classe e objeto de ponta a ponta, com o falso", async () => {
  const g = googleFalso();
  await new Promise((r) => g.srv.listen(0, r));
  const porta = g.srv.address().port;
  process.env.GOOGLE_OAUTH_TOKEN_URL = `http://127.0.0.1:${porta}/token`;
  process.env.GOOGLE_WALLET_API_BASE = `http://127.0.0.1:${porta}/v1`;
  delete process.env.FALSO_403; delete process.env.FALSO_TOKEN_RUIM;
  esquecerToken();
  try {
    assert.equal(await tokenDeAcesso(CRED), "tok-1");
    assert.equal(await tokenDeAcesso(CRED), "tok-1", "o token vem da memória na segunda vez");
    assert.equal(g.log.filter((l) => l.endsWith("/token")).length, 1);
    const classe = { id: idDaClasse(EMISSOR) };
    assert.equal(await garantirClasse(CRED, classe), "criada");
    assert.equal(await garantirClasse(CRED, classe), "existia");
    const objeto = objetoDoPasse({ emissor: EMISSOR, classe: classe.id, base: "https://x", inscrito: { token: "abc" }, evento: {} });
    assert.equal(await gravarObjeto(CRED, objeto), "criado");
    assert.equal(await gravarObjeto(CRED, objeto), "atualizado", "o segundo pedido do mesmo passe atualiza, não falha");
    const t = await testar(CRED, classe);
    assert.equal(t.ok, true);
    assert.equal(t.etapas.length, 2);
    // o emissor recusa a conta de serviço: o erro diz o que fazer e fica guardado
    process.env.FALSO_403 = "1";
    await assert.rejects(() => gravarObjeto(CRED, objeto), /conta de serviço não tem permissão/);
    assert.equal(ultimoErro().status, 403);
    const t2 = await testar(CRED, classe);
    assert.equal(t2.ok, false);
    assert.equal(t2.etapas[1].etapa, "classe");
    assert.match(t2.etapas[1].detalhe, /Usuários/);
    // chave que não bate
    delete process.env.FALSO_403; process.env.FALSO_TOKEN_RUIM = "1"; esquecerToken();
    const t3 = await testar(CRED, classe);
    assert.equal(t3.ok, false);
    assert.equal(t3.etapas[0].etapa, "token");
    assert.match(t3.etapas[0].detalhe, /não batem/);
  } finally {
    delete process.env.FALSO_403; delete process.env.FALSO_TOKEN_RUIM;
    delete process.env.GOOGLE_OAUTH_TOKEN_URL; delete process.env.GOOGLE_WALLET_API_BASE;
    esquecerToken();
    g.srv.close();
  }
});
