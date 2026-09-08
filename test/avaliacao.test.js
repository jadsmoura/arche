/* ARCHÉ AV — a régua de acesso pela conta do portal (set/2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLUGS_AV, cursoDaChave, montarAcesso, podeLer, podeGravar, identificarDocente,
  docenteNosDossies, docenteNovo, fundirFichaDoDocente, buscarUsuarios, lattesIdDe, chaveDeNome,
} from "../lib/avaliacao.js";

const gestao = montarAcesso({ logado: true, gestao: true, eu: { email: "g@uniego.edu.br", nome: "Gestora" } });
const coordEnf = montarAcesso({ logado: true, cursosCoordenados: ["enfermagem"], eu: { email: "c@uniego.edu.br" } });
const docEnf = montarAcesso({ logado: true, docenteEm: { enfermagem: { idx: 2, nome: "Ana Prática" } },
  eu: { email: "ana@uniego.edu.br", nome: "Ana Prática" } });
const ninguem = montarAcesso({ logado: true, eu: { email: "x@uniego.edu.br" } });
const avaliador = montarAcesso({ logado: false, avaliador: true });
const anonimo = montarAcesso({ logado: false });

test("as chaves do módulo têm dono: curso, raiz da Psicologia, compartilhadas e o que não é da Avaliação", () => {
  assert.deepEqual(cursoDaChave("dossie-enfermagem-v1"), { familia: "dossie", curso: "enfermagem" });
  assert.deepEqual(cursoDaChave("avaliacao-mec-odontologia-uniego-v1"), { familia: "indicadores", curso: "odontologia" });
  assert.deepEqual(cursoDaChave("docs-institucionais-v1"), { familia: "raiz", curso: "psicologia" });
  assert.deepEqual(cursoDaChave("avaliacao-mec-psicologia-uniego-v1"), { familia: "indicadores", curso: "psicologia" });
  assert.deepEqual(cursoDaChave("indicador-modeA-docs-v1"), { familia: "compartilhada", curso: "*" });
  assert.deepEqual(cursoDaChave("justificativas-conceito-direito-v1"), { familia: "justificativa", curso: "direito" });
  // curso fora do catálogo: é da Avaliação, mas ninguém além da gestão o toca
  assert.deepEqual(cursoDaChave("dossie-nutricao-v1"), { familia: "dossie", curso: null });
  assert.equal(cursoDaChave("extensao-config-v1"), null);
  assert.equal(cursoDaChave("auth-perfis-v1"), null);
  assert.equal(SLUGS_AV.length, 12);
});

test("o papel sai da conta: gestão > coordenação > docente > nenhum; sem sessão, só o selo do avaliador", () => {
  assert.equal(gestao.papel, "gestao");
  assert.equal(gestao.cursos.length, 12, "a gestão alcança os doze cursos");
  assert.equal(coordEnf.papel, "coordenacao");
  assert.deepEqual(coordEnf.cursos, ["enfermagem"]);
  assert.equal(docEnf.papel, "docente");
  assert.equal(ninguem.papel, "nenhum");
  assert.equal(avaliador.papel, "avaliador");
  assert.equal(avaliador.visualizacao, true);
  assert.equal(anonimo.papel, null);
  // coordenação que também é docente: o papel maior manda, mas o vínculo fica
  const ambos = montarAcesso({ logado: true, cursosCoordenados: ["direito"], docenteEm: { direito: { idx: 0, nome: "X Y" } } });
  assert.equal(ambos.papel, "coordenacao");
  assert.ok(ambos.docenteEm.direito);
  // slug desconhecido não entra
  assert.deepEqual(montarAcesso({ logado: true, cursosCoordenados: ["nutricao"] }).cursos, []);
});

test("LER: avaliador e gestão leem tudo; coordenação, os seus cursos; docente, só o dossiê do seu curso", () => {
  for (const k of ["dossie-direito-v1", "avaliacao-mec-direito-uniego-v1", "indicador-modeA-docs-v1"]) {
    assert.equal(podeLer(avaliador, k), true, k);
    assert.equal(podeLer(gestao, k), true, k);
  }
  assert.equal(podeLer(coordEnf, "dossie-enfermagem-v1"), true);
  assert.equal(podeLer(coordEnf, "avaliacao-mec-enfermagem-uniego-v1"), true);
  assert.equal(podeLer(coordEnf, "dossie-direito-v1"), false, "outro curso não se lê");
  assert.equal(podeLer(coordEnf, "indicador-modeA-docs-v1"), true, "chave de todas as páginas");
  assert.equal(podeLer(docEnf, "dossie-enfermagem-v1"), true);
  assert.equal(podeLer(docEnf, "avaliacao-mec-enfermagem-uniego-v1"), false, "o docente não vê os indicadores");
  assert.equal(podeLer(docEnf, "dossie-direito-v1"), false);
  assert.equal(podeLer(ninguem, "dossie-enfermagem-v1"), false);
  assert.equal(podeLer(anonimo, "dossie-enfermagem-v1"), false);
  assert.equal(podeLer(gestao, "extensao-config-v1"), null, "fora da Avaliação a régua não opina");
  assert.equal(podeLer(coordEnf, "dossie-nutricao-v1"), false);
  assert.equal(podeLer(gestao, "dossie-nutricao-v1"), true);
});

test("GRAVAR: avaliador nunca; gestão e coordenação o documento inteiro; docente só a própria ficha", () => {
  assert.equal(podeGravar(avaliador, "dossie-enfermagem-v1"), "");
  assert.equal(podeGravar(anonimo, "dossie-enfermagem-v1"), "");
  assert.equal(podeGravar(gestao, "dossie-enfermagem-v1"), "total");
  assert.equal(podeGravar(coordEnf, "dossie-enfermagem-v1"), "total");
  assert.equal(podeGravar(coordEnf, "avaliacao-mec-enfermagem-uniego-v1"), "total");
  assert.equal(podeGravar(coordEnf, "dossie-direito-v1"), "");
  assert.equal(podeGravar(coordEnf, "indicador-modeA-docs-v1"), "total");
  assert.equal(podeGravar(docEnf, "dossie-enfermagem-v1"), "ficha");
  assert.equal(podeGravar(docEnf, "avaliacao-mec-enfermagem-uniego-v1"), "");
  assert.equal(podeGravar(docEnf, "indicador-modeA-docs-v1"), "");
  assert.equal(podeGravar(ninguem, "dossie-enfermagem-v1"), "");
  assert.equal(podeGravar(gestao, "pesquisa-x"), null);
});

const PROFS = [
  { idx: 0, nome: "João Souza", lattesId: "1111111111111111" },
  { idx: 1, nome: "Ana Prática", lattesId: "" },
  { idx: 2, nome: "Ana Prática", lattesId: "2222222222222222", email: "outra.ana@uniego.edu.br" },
  { idx: 3, nome: "Carlos", lattesId: "" },
];

test("identidade do docente: e-mail, depois Lattes, depois nome completo com UMA candidata — registro de outra pessoa não casa", () => {
  assert.equal(identificarDocente(PROFS, { email: "outra.ana@uniego.edu.br" }), 2);
  assert.equal(identificarDocente(PROFS, { email: "joao@x.br", lattes: "http://lattes.cnpq.br/1111111111111111" }), 0);
  // duas "Ana Prática", mas uma já tem e-mail de OUTRA pessoa: sobra uma candidata
  assert.equal(identificarDocente(PROFS, { email: "ana@uniego.edu.br", nome: "Ana  Prática" }), 1);
  // o Lattes de um registro já reivindicado por outro e-mail não casa
  assert.equal(identificarDocente(PROFS, { email: "z@x.br", lattes: "2222222222222222" }), -1);
  assert.equal(identificarDocente(PROFS, { email: "c@x.br", nome: "Carlos" }), -1, "nome de uma palavra não é chave");
  assert.equal(identificarDocente([], { email: "a@b.c" }), -1);
  assert.equal(lattesIdDe("http://lattes.cnpq.br/1234567890123456"), "1234567890123456");
  assert.equal(lattesIdDe("123"), "");
  assert.equal(chaveDeNome("  Maria  DA Silva "), "maria da silva");
});

test("onde a pessoa está: um mapa por curso, ignorando dossiê sem registros", () => {
  const onde = docenteNosDossies({
    enfermagem: { version: 3, profs: PROFS }, direito: { version: 3, profs: [] }, odontologia: null,
  }, { email: "ana@uniego.edu.br", nome: "Ana Prática" });
  assert.deepEqual(onde, { enfermagem: { idx: 1, nome: "Ana Prática" } });
});

test("o registro novo sai no formato do app, com o e-mail como vínculo forte", () => {
  const d = docenteNovo({ email: "Novo@UNIEGO.edu.br", nome: "Novo Docente", titulo: "Dra.",
    lattesId: "http://lattes.cnpq.br/9999999999999999", funcao: "Coordenação Pedagógica" });
  assert.equal(d.email, "novo@uniego.edu.br");
  assert.equal(d.titulo, "Dra.");
  assert.equal(d.lattesId, "9999999999999999");
  assert.equal(d.coord, true);
  assert.equal(d.data, null);
  assert.deepEqual(d.itemStates, []);
  assert.equal(docenteNovo({ nome: "X Y", titulo: "PhD" }).titulo, "Esp.", "título fora da lista cai no padrão");
  assert.equal(docenteNovo({ nome: "X Y" }).funcao, "Docente do Curso");
});

test("a gravação do docente só troca a PRÓPRIA ficha: os demais ficam como estão no servidor", () => {
  const guardado = {
    version: 3,
    profs: [
      { idx: 0, nome: "João Souza", lattesId: "1111111111111111", regime: "Integral", data: { total: 5 } },
      { idx: 1, nome: "Ana Prática", lattesId: "", regime: null, data: null },
    ],
    ajustesProducao: { versao: 1, profs: [{ chave: "lattes:1111111111111111", excluidas: ["x"], manuais: [] }] },
  };
  // a tela da Ana chegou com o João ALTERADO (aba velha) e a ficha dela preenchida
  const recebido = {
    version: 3,
    profs: [
      { idx: 0, nome: "João Souza", lattesId: "1111111111111111", regime: "Horista", data: null },
      { idx: 1, nome: "Ana Prática", lattesId: "3333333333333333", regime: "Parcial", data: { total: 2 } },
    ],
    ajustesProducao: { versao: 1, profs: [
      { chave: "lattes:1111111111111111", excluidas: [], manuais: [] },
      { chave: "lattes:3333333333333333", excluidas: ["y"], manuais: [] },
    ] },
  };
  const id = { email: "ana@uniego.edu.br", nome: "Ana Prática" };
  const saida = fundirFichaDoDocente(guardado, recebido, id);
  assert.equal(saida.profs[0].regime, "Integral", "o João continua como estava no servidor");
  assert.deepEqual(saida.profs[0].data, { total: 5 });
  assert.equal(saida.profs[1].lattesId, "3333333333333333");
  assert.equal(saida.profs[1].email, "ana@uniego.edu.br", "o vínculo forte fica gravado");
  assert.equal(saida.profs[1].idx, 1);
  const chaves = saida.ajustesProducao.profs.map((x) => x.chave).sort();
  assert.deepEqual(chaves, ["lattes:1111111111111111", "lattes:3333333333333333"]);
  assert.deepEqual(saida.ajustesProducao.profs.find((x) => x.chave === "lattes:1111111111111111").excluidas, ["x"],
    "os ajustes do João são os do servidor, não os da aba da Ana");
  // sem documento gravado não há o que fundir — a coordenação inclui o docente primeiro
  assert.equal(fundirFichaDoDocente(null, recebido, id), null);
  // quem não está no documento recebido também não grava nada
  assert.equal(fundirFichaDoDocente(guardado, { version: 3, profs: [recebido.profs[0]] }, id), null);
});

test("a busca da coordenação acha por nome ou e-mail, ignora quem não leciona e devolve o essencial", () => {
  const contas = [
    { email: "ana@uniego.edu.br", nome: "Ana Prática", funcao: "professor", titulacao: "Dra.", curso: "Enfermagem", lattes: "http://lattes.cnpq.br/1234567890123456" },
    { email: "aluno@x.br", nome: "Ana Aluna", funcao: "aluno" },
    { email: "sec@uniego.edu.br", nome: "Ana Secretária", funcao: "secretaria" },
    { email: "rem@uniego.edu.br", nome: "Ana Removida", funcao: "professor", removido: true },
    { email: "sem-nome@uniego.edu.br", nome: "", funcao: "professor" },
    { email: "beto@uniego.edu.br", nome: "Beto Silva", funcao: "coord-curso" },
  ];
  const r = buscarUsuarios(contas, "ana");
  assert.deepEqual(r.map((x) => x.email), ["ana@uniego.edu.br"]);
  assert.equal(r[0].lattesId, "1234567890123456");
  assert.equal(r[0].titulacao, "Dra.");
  assert.deepEqual(buscarUsuarios(contas, "beto@").map((x) => x.nome), ["Beto Silva"]);
  assert.deepEqual(buscarUsuarios(contas, "a"), [], "termo curto demais não lista o portal inteiro");
  assert.equal(buscarUsuarios(contas, "ana prática").length, 1, "acento e caixa não contam");
});
