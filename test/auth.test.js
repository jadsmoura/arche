/* Sessão e senha — hash, renovação deslizante e limite de tentativas. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSenha, conferirSenha, senhaFraca, emitirCookie, lerSessao, limparCookie,
  renovarSessao, registrarFalha, bloqueado, limparFalhas, iniciarAuth,
  definirSenha, temSenha, validarSenhaDe, senhaInfo, MODULOS, papelDe, modulosDe, carregarUsuarios,
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
test("os seis setores podem ter coordenação designada", () => {
  assert.deepEqual(MODULOS, ["extensao", "pesquisa", "inovacao", "atas", "eventos", "espacos"],
    "eventos (ARCHÉ EV) e espaços (ARCHÉ ES) entram na lista como qualquer outro setor");
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

test("senha provisória: marcada, com autor, e a marca some quando a pessoa troca", async () => {
  const st = storageFalso();
  await definirSenha(st, "prof@uniego.edu.br", "temporaria1", { provisoria: true, por: "jadsonbelem@gmail.com" });
  assert.equal(await validarSenhaDe(st, "prof@uniego.edu.br", "temporaria1"), true,
    "a senha provisória entra como qualquer outra — quem força a troca é o fluxo de login");
  let info = await senhaInfo(st, "prof@uniego.edu.br");
  assert.equal(info.provisoria, true);
  assert.equal(info.por, "jadsonbelem@gmail.com", "fica dito quem colocou");
  assert.ok(info.atualizadoEm, "a data é o que faz a validade de 7 dias");

  // a pessoa define a própria senha: a marca desaparece sozinha
  await definirSenha(st, "prof@uniego.edu.br", "minhasenhadefinitiva");
  info = await senhaInfo(st, "prof@uniego.edu.br");
  assert.equal(info.provisoria, false, "senha definida pelo dono não é provisória");
  assert.equal(await validarSenhaDe(st, "prof@uniego.edu.br", "temporaria1"), false, "a provisória morre na troca");
  assert.equal(await validarSenhaDe(st, "prof@uniego.edu.br", "minhasenhadefinitiva"), true);
});

test("senhaInfo nunca expõe o hash", async () => {
  const st = storageFalso();
  assert.deepEqual(await senhaInfo(st, "ninguem@x.br"), { tem: false });
  await definirSenha(st, "a@uniego.edu.br", "minhasenha123");
  const info = await senhaInfo(st, "a@uniego.edu.br");
  assert.equal(info.tem, true);
  assert.ok(!JSON.stringify(info).includes("scrypt"), "o hash não sai daqui");
});

/* Função na instituição: o que a pessoa FAZ (diferente do papel no sistema,
   que diz o que ela pode). Lista fechada com "outro" — é o que permite à
   gestão agrupar em vez de ler cargo escrito de dez jeitos diferentes. */
test("a função aceita o código, o nome por extenso e o cargo escrito à mão", async () => {
  const { FUNCOES, normalizarFuncao, funcaoNome } = await import("../lib/auth.js");
  assert.equal(normalizarFuncao("secretaria"), "secretaria", "pelo código");
  assert.equal(normalizarFuncao("Coordenador(a) de Curso"), "coord-curso", "pelo nome do catálogo");
  // os perfis antigos traziam texto livre: o que der para reconhecer, entra
  assert.equal(normalizarFuncao("Docente do curso de Direito"), "professor");
  assert.equal(normalizarFuncao("Professora Pesquisadora"), "professor-pesquisador");
  assert.equal(normalizarFuncao("coordenadora pedagógica"), "coord-pedagogico");
  assert.equal(normalizarFuncao("Coordenação de Ação Comunitária"), "coord-acao-comunitaria");
  assert.equal(normalizarFuncao("Coordenador de Políticas Institucionais"), "coord-politicas");
  // o que não se reconhece não se perde: vira "outro" e o texto fica à parte
  assert.equal(normalizarFuncao("Assessoria de Comunicação"), "outro");
  assert.equal(normalizarFuncao(""), "", "em branco continua em branco");
  assert.equal(funcaoNome("outro", "Assessoria de Comunicação"), "Assessoria de Comunicação");
  assert.equal(funcaoNome("coord-ensino"), "Coordenação de Ensino");
  assert.equal(new Set(FUNCOES.map((f) => f.codigo)).size, FUNCOES.length, "códigos não se repetem");
});

/* --------- perfil completo: a etapa antes de entrar no setor ------------- */
test("falta no perfil aponta campo a campo, e some quando tudo está lá", async () => {
  const { faltaNoPerfil, perfilCompleto } = await import("../lib/auth.js");
  const codigos = (p, o) => faltaNoPerfil(p, o).map((f) => f.campo).sort();

  assert.deepEqual(codigos({}), ["cpf", "curso", "funcao", "nome", "telefone"]);
  const professor = {
    nome: "Marlana Carla", funcao: "professor", curso: "Direito",
    cpf: "12345678909", telefone: "(62) 99999-0000",
  };
  // docente sem titulação não fecha: o edital cobra titulação mínima
  assert.deepEqual(codigos(professor), ["titulacao"]);
  assert.equal(perfilCompleto({ ...professor, titulacao: "mestre" }), true);
  // secretaria não precisa de titulação
  assert.equal(perfilCompleto({ ...professor, funcao: "secretaria", titulacao: "" }), true);
  assert.equal(perfilCompleto({ ...professor, funcao: "outro", titulacao: "" }), true);
});

test("o CPF não se cobra do gestor geral — seria exigência impossível", async () => {
  const { faltaNoPerfil } = await import("../lib/auth.js");
  const base = { nome: "Jadson Belem de Moura", funcao: "professor", curso: "Agronomia",
    telefone: "(62) 98888-0000", titulacao: "doutor" };
  // a conta pessoal é só de gestão; o CPF vive na institucional, e um CPF não
  // pode estar em duas contas — cobrar aqui deixaria a conta sem saída
  assert.deepEqual(faltaNoPerfil(base, { gestorGeral: true }), []);
  assert.deepEqual(faltaNoPerfil(base).map((f) => f.campo), ["cpf"]);
});

test("campo em branco ou só espaços conta como faltando", async () => {
  const { faltaNoPerfil } = await import("../lib/auth.js");
  const p = { nome: "  ", funcao: "professor", curso: "Direito", cpf: " ", telefone: "x", titulacao: "mestre" };
  assert.deepEqual(faltaNoPerfil(p).map((f) => f.campo).sort(), ["cpf", "nome"]);
});
