/* Sessão e senha — hash, renovação deslizante e limite de tentativas. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSenha, conferirSenha, senhaFraca, emitirCookie, lerSessao, limparCookie,
  renovarSessao, registrarFalha, bloqueado, limparFalhas, iniciarAuth,
  definirSenha, temSenha, validarSenhaDe, MODULOS, papelDe, modulosDe, carregarUsuarios,
} from "../lib/auth.js";
import { podeVerAta } from "../lib/atas.js";

function resFalso() {
  const headers = {};
  return { headers, headersSent: false, setHeader(k, v) { headers[k.toLowerCase()] = v; } };
}
const reqCom = (res) => ({ headers: { cookie: String(res.headers["set-cookie"]).split(";")[0] } });

function storageFalso(inicial = {}) {
  const d = { ...inicial };
  return { dados: d,
    async get(k) { return k in d ? d[k] : null; }, async set(k, v) { d[k] = String(v); },
    async del(k) { delete d[k]; }, async list() { return Object.keys(d); }, async flush() {} };
}

test("senha é guardada como hash scrypt com salt — nunca em claro", async () => {
  const reg = await hashSenha("minhasenha123");
  assert.match(reg, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
  assert.ok(!reg.includes("minhasenha123"));
  assert.equal(await conferirSenha("minhasenha123", reg), true);
  assert.equal(await conferirSenha("minhasenha124", reg), false);
  assert.equal(await conferirSenha("", reg), false);
  // salt aleatório: a mesma senha gera registros diferentes
  assert.notEqual(reg, await hashSenha("minhasenha123"));
});

test("conferirSenha não quebra com registro corrompido", async () => {
  for (const lixo of ["", null, "abc", "scrypt$x", "bcrypt$1$2$3$4$5"])
    assert.equal(await conferirSenha("qualquer", lixo), false);
});

test("regra mínima de senha", () => {
  assert.ok(senhaFraca("1234"));
  assert.ok(senhaFraca("11111111"));
  assert.ok(senhaFraca("12345678"));
  assert.equal(senhaFraca("uniego2026extensao"), null);
  assert.equal(senhaFraca("Semana!Enfermagem"), null);
});

test("definir e validar senha pelo storage", async () => {
  const st = storageFalso();
  assert.equal(await temSenha(st, "a@uniego.edu.br"), false);
  await definirSenha(st, "A@Uniego.edu.br", "minhasenha123");
  assert.equal(await temSenha(st, "a@uniego.edu.br"), true, "e-mail é normalizado");
  assert.equal(await validarSenhaDe(st, "a@uniego.edu.br", "minhasenha123"), true);
  assert.equal(await validarSenhaDe(st, "a@uniego.edu.br", "errada"), false);
  assert.equal(await validarSenhaDe(st, "naoexiste@uniego.edu.br", "qualquer"), false);
  assert.ok(!JSON.stringify(st.dados).includes("minhasenha123"));
});

test("o segredo da sessão nunca é o valor de desenvolvimento do repositório", async () => {
  const st = storageFalso();
  delete process.env.SESSION_SECRET;
  const origem = await iniciarAuth(st);
  assert.equal(origem, "gerado");
  const cfg = JSON.parse(st.dados["auth-config-v1"]);
  assert.ok(cfg.sessionSecret && cfg.sessionSecret.length >= 40);
  assert.notEqual(cfg.sessionSecret, "arche-dev-secret-trocar-em-producao");
  // segundo boot reaproveita o mesmo segredo (não desloga todo mundo)
  assert.equal(await iniciarAuth(st), "persistido");
});

test("cookie assinado: sessão válida ida e volta; adulteração é rejeitada", () => {
  const res = resFalso();
  emitirCookie(res, { email: "Prof@Uniego.edu.br", nome: "Prof" });
  const s = lerSessao(reqCom(res));
  assert.equal(s.email, "prof@uniego.edu.br");
  assert.ok(s.exp > Math.floor(Date.now() / 1000));
  assert.ok(s.iat);
  // um byte trocado invalida
  const raw = String(res.headers["set-cookie"]).split(";")[0];
  const adulterado = raw.slice(0, -3) + "aaa";
  assert.equal(lerSessao({ headers: { cookie: adulterado } }), null);
  assert.equal(lerSessao({ headers: {} }), null);
});

test("cookie de saída espelha os atributos do cookie de entrada", () => {
  const emitido = resFalso(); emitirCookie(emitido, { email: "a@b.com" });
  const limpo = resFalso(); limparCookie(limpo);
  for (const attr of ["Path=/", "HttpOnly", "SameSite=Lax"])
    assert.ok(String(limpo.headers["set-cookie"]).includes(attr), attr);
  assert.ok(String(limpo.headers["set-cookie"]).includes("Max-Age=0"));
});

test("sessão deslizante: renova perto do fim, não renova cedo, respeita o teto", () => {
  const agora = Math.floor(Date.now() / 1000), DIA = 86400;
  // recém-criada: não renova
  const r1 = resFalso();
  assert.equal(renovarSessao(r1, { email: "a@b.com", iat: agora, exp: agora + 30 * DIA }), false);
  // faltando 5 dias: renova
  const r2 = resFalso();
  assert.equal(renovarSessao(r2, { email: "a@b.com", iat: agora - 25 * DIA, exp: agora + 5 * DIA }), true);
  const nova = lerSessao(reqCom(r2));
  assert.ok(nova.exp - agora > 29 * DIA, "janela cheia de novo");
  assert.equal(nova.iat, agora - 25 * DIA, "o instante do login original é preservado");
  // login com mais de 180 dias: não renova mais
  const r3 = resFalso();
  assert.equal(renovarSessao(r3, { email: "a@b.com", iat: agora - 200 * DIA, exp: agora + 5 * DIA }), false);
});

test("limite de tentativas de senha", () => {
  const chave = "teste:" + Math.random();
  for (let i = 0; i < 7; i++) { registrarFalha(chave); assert.equal(bloqueado(chave), false); }
  registrarFalha(chave);
  assert.equal(bloqueado(chave), true);
  limparFalhas(chave);
  assert.equal(bloqueado(chave), false, "acerto libera a conta");
});

/* ------------------------- coordenação por setor ------------------------- */
test("os quatro setores podem ter coordenação designada", () => {
  assert.deepEqual(MODULOS, ["extensao", "pesquisa", "inovacao", "atas"],
    "atas entra na lista como qualquer outro setor");
});

test("coordenador de um setor gere aquele setor, e só aquele", async () => {
  const base = { gestores: [], coordenadores: { "coord@uniego.edu.br": ["atas"] }, aprovados: [], pendentes: [] };
  const u = await carregarUsuarios(storageFalso({ "auth-usuarios-v1": JSON.stringify(base) }));

  assert.equal(papelDe("coord@uniego.edu.br", u), "coordenador");
  assert.deepEqual(modulosDe("coord@uniego.edu.br", u), ["atas"]);

  // é a lista de módulos que o setor consulta para dizer quem é gestão ali
  const gereAtas = (email) => modulosDe(email, u).includes("atas");
  assert.equal(gereAtas("coord@uniego.edu.br"), true);
  assert.equal(gereAtas("professor@uniego.edu.br"), false);

  // e é isso que abre o acervo inteiro das atas para essa pessoa
  const ata = { criadoPor: "outra.pessoa@uniego.edu.br" };
  assert.equal(podeVerAta({ email: "coord@uniego.edu.br", gestao: gereAtas("coord@uniego.edu.br") }, ata), true);
  assert.equal(podeVerAta({ email: "professor@uniego.edu.br", gestao: false }, ata), false);
});

test("a coordenação de um setor não vaza para os outros", async () => {
  const u = await carregarUsuarios(storageFalso({ "auth-usuarios-v1": JSON.stringify({
    gestores: [], coordenadores: { "so.atas@uniego.edu.br": ["atas"] }, aprovados: [], pendentes: [] }) }));
  const mods = modulosDe("so.atas@uniego.edu.br", u);
  assert.ok(mods.includes("atas"));
  for (const outro of ["extensao", "pesquisa", "inovacao"]) {
    assert.ok(!mods.includes(outro), `coordenar atas não pode dar gestão em ${outro}`);
  }
});

test("gestor geral tem todos os setores; os fixos da PROPPEX não se perdem", async () => {
  const u = await carregarUsuarios(storageFalso({}));
  assert.ok(u.gestores.includes("jadsonbelem@gmail.com"));
  assert.deepEqual(modulosDe("jadsonbelem@gmail.com", u), MODULOS, "gestor geral gere tudo");
  assert.equal(papelDe("qualquer@uniego.edu.br", u), "aprovado", "conta institucional entra como submissora");
  assert.equal(papelDe("externo@gmail.com", u), "pendente");
});
