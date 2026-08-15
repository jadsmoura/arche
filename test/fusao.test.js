/* Fusão de cadastros duplicados: a mesma pessoa em duas contas. O que se cobra
   aqui é o que a fusão não pode errar — mover tudo o que era da conta removida,
   nunca sobrescrever o que a pessoa preencheu, e nunca fundir gente diferente. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  chaveNome, duplicidadesPorNome, peso, fundirPerfil, fundirProjeto,
  fundirAcao, fundirAta, fundirPapeis, podeFundir,
} from "../lib/fusao.js";

const PESSOAL = "wagner@gmail.com";
const INSTIT = "wagner.junior@uniego.edu.br";

test("o nome comparável ignora acento, caixa e espaço repetido", () => {
  assert.equal(chaveNome("  Wagner  Gonçalves   Vieira Júnior "), "wagner goncalves vieira junior");
  assert.equal(chaveNome("WAGNER GONCALVES VIEIRA JUNIOR"), chaveNome("Wagner Gonçalves Vieira Júnior"));
});

test("duplicidade se aponta por nome completo, nunca por primeiro nome", () => {
  const dups = duplicidadesPorNome([
    { email: PESSOAL, nome: "Wagner Gonçalves Vieira Junior", uso: {}, temCpf: false },
    { email: INSTIT, nome: "WAGNER GONCALVES VIEIRA JUNIOR", uso: { pesquisa: 3 }, temCpf: true },
    { email: "maria@x.com", nome: "Maria", uso: {} },
    { email: "maria2@x.com", nome: "Maria", uso: {} },
    { email: "sozinho@x.com", nome: "Ana Paula Ribeiro", uso: {} },
  ]);
  assert.equal(dups.length, 1, "só o nome com duas palavras ou mais vira duplicidade");
  assert.equal(dups[0].contas.length, 2);
  assert.equal(dups[0].contas[0].email, INSTIT, "a conta mais cheia vem primeiro, como sugestão");
  assert.ok(peso(dups[0].contas[0]) > peso(dups[0].contas[1]));
});

test("fundir perfis completa o que falta e não sobrescreve o que a pessoa digitou", () => {
  const principal = { nome: "Wagner G. V. Junior", curso: "Agronomia", telefone: "(62) 1", criadoEm: "2026-02-01" };
  const secundario = { nome: "Wagner Gonçalves Vieira Junior", cpf: "11144477735", curso: "Direito",
    titulacao: "doutor", preCadastro: true, criadoEm: "2025-01-01" };
  const r = fundirPerfil(principal, secundario);
  assert.equal(r.nome, "Wagner G. V. Junior", "o nome preenchido fica");
  assert.equal(r.curso, "Agronomia", "curso preenchido não é trocado");
  assert.equal(r.cpf, "11144477735", "o que faltava vem da outra conta");
  assert.equal(r.titulacao, "doutor");
  assert.equal(r.criadoEm, "2025-01-01", "vale a data mais antiga");
  assert.equal(r.preCadastro, undefined, "a marca de pré-cadastro não sobrevive");
});

test("o projeto muda de dono sem perder parecer entregue", () => {
  const p = {
    id: "p1", numero: "IC-2026-034", criadoPor: PESSOAL,
    orientador: { nome: "Wagner", email: PESSOAL },
    alunos: [{ nome: "Ana", email: "ana@x.com" }],
    avaliacoes: [
      { email: PESSOAL, situacao: "designado" },
      { email: INSTIT, situacao: "entregue", parecer: "texto" },
      { email: "outro@x.com", situacao: "entregue" },
    ],
  };
  const r = fundirProjeto(p, PESSOAL, INSTIT);
  assert.equal(r.projeto.criadoPor, INSTIT);
  assert.equal(r.projeto.orientador.email, INSTIT);
  assert.ok(r.mudou > 0);
  // as duas contas eram avaliador do mesmo projeto: fica o parecer entregue
  const doWagner = r.projeto.avaliacoes.filter((a) => a.email === INSTIT);
  assert.equal(doWagner.length, 1, "não fica avaliador em duplicidade");
  assert.equal(doWagner[0].situacao, "entregue", "o parecer entregue é prova da seleção");
  assert.equal(r.projeto.avaliacoes.length, 2);
  assert.ok(r.avisos.some((x) => /avaliador/.test(x)), "a gestão fica sabendo do que se juntou");
  // e avisa quando a fusão deixou a orientação como avaliadora do próprio projeto
  assert.ok(r.avisos.some((x) => /orientação e como avaliador/.test(x)));
});

test("ações de extensão e atas seguem a conta que fica", () => {
  const acao = fundirAcao({ id: "a1", criadoPor: PESSOAL, proposta: { respEmail: PESSOAL } }, PESSOAL, INSTIT);
  assert.equal(acao.acao.criadoPor, INSTIT);
  assert.equal(acao.acao.proposta.respEmail, INSTIT);
  assert.equal(acao.mudou, 2);

  const ata = fundirAta({
    id: "at1", criadoPor: PESSOAL, secretaria: { nome: "W", email: PESSOAL },
    participantes: [{ nome: "W", email: PESSOAL }, { nome: "Outro", email: "z@x.com" }],
  }, PESSOAL, INSTIT);
  assert.equal(ata.ata.criadoPor, INSTIT);
  assert.equal(ata.ata.secretaria.email, INSTIT);
  assert.equal(ata.ata.participantes[0].email, INSTIT);
  assert.equal(ata.ata.participantes[1].email, "z@x.com", "quem não é a pessoa não se toca");
});

test("a conta que fica herda o alcance da outra, nunca o contrário", () => {
  const antes = {
    gestores: [], aprovados: [PESSOAL, "alguem@x.com"],
    coordenadores: { [PESSOAL]: ["pesquisa"] }, pendentes: [{ email: PESSOAL, quando: "x" }],
  };
  const u = fundirPapeis(antes, PESSOAL, INSTIT);
  assert.ok(!u.aprovados.includes(PESSOAL), "a conta removida sai das listas");
  assert.ok(u.aprovados.includes(INSTIT), "e a que fica entra");
  assert.deepEqual(u.coordenadores[INSTIT], ["pesquisa"], "a coordenação de módulo vai junto");
  assert.equal(u.coordenadores[PESSOAL], undefined);
  assert.equal(u.pendentes.length, 0);
  assert.ok(u.aprovados.includes("alguem@x.com"), "ninguém mais é afetado");
});

test("só se funde o que é a mesma pessoa", () => {
  const a = { email: PESSOAL, nome: "Wagner Gonçalves Vieira Junior", cpf: "11144477735" };
  assert.equal(podeFundir(a, { email: INSTIT, nome: "WAGNER GONCALVES VIEIRA JUNIOR" }), "");
  assert.match(podeFundir(a, { email: INSTIT, nome: "Outro Professor" }), /não conferem/);
  assert.match(podeFundir(a, { email: PESSOAL, nome: a.nome }), /são a mesma/);
  assert.match(podeFundir(a, { email: INSTIT, nome: "" }), /nome preenchido/);
  // CPFs diferentes: são pessoas diferentes, por mais que o nome coincida
  assert.match(podeFundir(a, { email: INSTIT, nome: a.nome, cpf: "52998224725" }), /CPFs diferentes/);
});
