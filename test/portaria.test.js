import test from "node:test";
import assert from "node:assert/strict";
import {
  AREA_AV, chaveAcesso, destinoSeguro, emitirSelo, lerSelo, linkAcesso,
} from "../lib/portaria.js";

/* Resposta de mentirinha: só guarda o cabeçalho que a portaria escreve. */
const resFake = () => {
  const h = {};
  return { setHeader: (k, v) => { h[k] = v; }, headers: h };
};
const reqCom = (cookie) => ({ headers: cookie ? { cookie } : {} });

test("a senha compartilhada deixou de existir (set/2026): a portaria não a exporta mais", async () => {
  const mod = await import("../lib/portaria.js");
  assert.equal(mod.senhaAv, undefined);
  assert.equal(mod.senhaConfere, undefined);
  assert.equal(mod.paginaPortaria, undefined, "sem tela de senha: quem não tem sessão vai ao /entrar");
});

test("o selo emitido é lido de volta; cookie ausente ou adulterado não vale", () => {
  const res = resFake();
  emitirSelo(res, "link");
  const cookie = String(res.headers["Set-Cookie"]).split(";")[0];
  assert.ok(cookie.startsWith("arche_av="));
  assert.equal(lerSelo(reqCom(cookie))?.av, true);
  assert.equal(lerSelo(reqCom("")), null);
  assert.equal(lerSelo(reqCom("arche_av=abc.def")), null);
  // trocar um caractere do corpo quebra a assinatura
  const [nome, valor] = cookie.split("=");
  const roto = `${nome}=${valor.slice(0, -2)}xy`;
  assert.equal(lerSelo(reqCom(roto)), null);
});

test("o selo diz por onde a pessoa entrou, e nunca quem ela é", () => {
  const res = resFake();
  emitirSelo(res, "avaliador");
  const selo = lerSelo(reqCom(String(res.headers["Set-Cookie"]).split(";")[0]));
  assert.equal(selo.via, "avaliador");
  assert.equal(selo.email, undefined);   // portaria não é sessão de pessoa
  const res2 = resFake();
  emitirSelo(res2);
  assert.equal(lerSelo(reqCom(String(res2.headers["Set-Cookie"]).split(";")[0])).via, "link",
    "sem dizer por onde, é o link de acesso");
});

test("a chave do link é estável e muda quando a versão muda", () => {
  const antes = chaveAcesso();
  assert.equal(chaveAcesso(), antes);
  process.env.AV_LINK_VERSAO = "2";
  assert.notEqual(chaveAcesso(), antes);
  delete process.env.AV_LINK_VERSAO;
  assert.equal(chaveAcesso(), antes);
});

test("o link de acesso aponta para o módulo e carrega a chave", () => {
  assert.equal(linkAcesso("https://arche.app.br/"),
    `https://arche.app.br/arche/?acesso=${chaveAcesso()}`);
});

test("o destino de volta só aceita endereços da própria Avaliação", () => {
  assert.equal(destinoSeguro("/arche/dossie/enfermagem/"), "/arche/dossie/enfermagem/");
  assert.equal(destinoSeguro("/arche/?x=1"), "/arche/?x=1");
  assert.equal(destinoSeguro("//evil.example/x"), "/arche/");
  assert.equal(destinoSeguro("https://evil.example"), "/arche/");
  assert.equal(destinoSeguro("/usuarios/"), "/arche/");
  assert.equal(destinoSeguro(""), "/arche/");
});

test("a área protegida é a da Avaliação, e só ela", () => {
  assert.equal(AREA_AV.test("/arche/"), true);
  assert.equal(AREA_AV.test("/arche"), true);
  assert.equal(AREA_AV.test("/arche/dossie/direito/index.html"), true);
  assert.equal(AREA_AV.test("/atas/"), false);
  assert.equal(AREA_AV.test("/pesquisa/ic/"), false);
  assert.equal(AREA_AV.test("/"), false);
});

/* ------- o que a revisão adversarial de ago/2026 encontrou (e ficou) ------ */
test("o favicon do portal não fica atrás da portaria", () => {
  // é o ícone de TODAS as páginas (index, /entrar, a própria portaria):
  // trancá-lo deixava o portal inteiro sem ícone para quem não passou
  assert.equal(AREA_AV.test("/arche/favicon.svg"), false);
  assert.equal(AREA_AV.test("/arche/favicon.svg.map"), true, "só o arquivo exato sai");
  assert.equal(AREA_AV.test("/arche/dossie/favicon.svg"), true);
});

test("cookie ilegível é cookie inválido — nunca uma exceção", async () => {
  const { lerSessao, conferirSelo, decodificarCookie } = await import("../lib/auth.js");
  // "%" solto derrubava o processo inteiro: decodeURIComponent lança, e quem
  // chamava era um middleware async (promessa rejeitada = Node encerra)
  assert.equal(decodificarCookie("%"), "%");
  assert.equal(lerSessao({ headers: { cookie: "arche_sessao=%" } }), null);
  assert.equal(lerSelo({ headers: { cookie: "arche_av=%E0%A4%A" } }), null);
  // assinatura com caractere multibyte: mesmo comprimento em caracteres,
  // outro em bytes — estourava dentro do timingSafeEqual
  const res = { setHeader: () => {} };
  emitirSelo(res, "link");
  assert.equal(conferirSelo("corpo.ç".padEnd(20, "x")), null);
  assert.equal(lerSessao({ headers: { cookie: "arche_sessao=a.çççççççççççççççççççççççççççççççççççççççççç" } }), null);
});
