import test from "node:test";
import assert from "node:assert/strict";
import {
  AREA_AV, chaveAcesso, destinoSeguro, emitirSelo, lerSelo, linkAcesso,
  paginaPortaria, senhaAv, senhaConfere,
} from "../lib/portaria.js";

/* Resposta de mentirinha: só guarda o cabeçalho que a portaria escreve. */
const resFake = () => {
  const h = {};
  return { setHeader: (k, v) => { h[k] = v; }, headers: h };
};
const reqCom = (cookie) => ({ headers: cookie ? { cookie } : {} });

test("a senha padrão é a institucional e a env var manda", () => {
  assert.equal(senhaAv(), "uniego");
  process.env.AV_SENHA = "outra-senha";
  assert.equal(senhaAv(), "outra-senha");
  assert.equal(senhaConfere("outra-senha"), true);
  assert.equal(senhaConfere("uniego"), false);
  delete process.env.AV_SENHA;
});

test("a senha ignora caixa e espaço às bordas, mas não erro de digitação", () => {
  assert.equal(senhaConfere(" UNIEGO "), true);
  assert.equal(senhaConfere("uniego "), true);
  assert.equal(senhaConfere("uniegoo"), false);
  assert.equal(senhaConfere(""), false);
  assert.equal(senhaConfere(undefined), false);
});

test("o selo emitido é lido de volta; cookie ausente ou adulterado não vale", () => {
  const res = resFake();
  emitirSelo(res, "senha");
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
  emitirSelo(res, "link");
  const selo = lerSelo(reqCom(String(res.headers["Set-Cookie"]).split(";")[0]));
  assert.equal(selo.via, "link");
  assert.equal(selo.email, undefined);   // portaria não é sessão de pessoa
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

test("a tela da portaria não vaza a senha nem o link de acesso", () => {
  const html = paginaPortaria("/arche/dossie/");
  assert.ok(html.includes("Avaliação Institucional"));
  assert.ok(html.includes("/arche/dossie/"));
  assert.ok(!html.includes(senhaAv()));
  assert.ok(!html.includes(chaveAcesso()));
});
