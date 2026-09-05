/* ARCHÉ AP — Aulas Práticas (lib/praticas.js).

   O que estes testes protegem, na ordem em que a coisa pode dar errado:
   a régua da entrega (é ela que faz o registro fotográfico existir), as
   quatro figuras do módulo — porque a coordenação POR CURSO não existia no
   ARCHÉ e foi inventada aqui —, o carimbo do semestre pela DATA DA AULA, e
   o denominador do painel, que é o que transforma "12 relatórios" em
   "12 de 40". */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_RELATORIO, MIN_FOTOS, MAX_FOTOS, STATUS, ENTREGUE,
  normalizarRelatorio, normalizarFoto, normalizarCadastro, normalizarEquipe,
  faltaNoRelatorio, podeEnviar, papelNoRelatorio, podeVer, podeEditar, podeValidar,
  visaoDoRelatorio, quemNoModulo, coordenaCurso, cursosQueCoordena,
  professoresDoSemestre, disciplinasDoSemestre, minhasDisciplinas, cursoDoProfessor,
  filtrar, panorama, ehSegunda, semanaAnterior, pendenciasCobranca,
  professoresSemEmail, pendenciasCobrancaExtensao, ehPrimeiroDoMes,
  PAPEIS_COORDENACAO, coordenacaoDoCurso,
  TIPOS, tipoDe, ehExtensao, camposDo, CAMPOS_EXTENSAO, DECISOES, ENCERRADO,
  podeReabrir, decisaoNoLugarDaCoordenacao, ODS, rotuloOds,
} from "../lib/praticas.js";

const CADASTRO = {
  "2026/2": {
    enfermagem: {
      professores: [
        { email: "ana@uniego.edu.br", nome: "Ana Prática", disciplinas: ["Anatomia Humana", "Fisiologia"] },
        { email: "bruno@uniego.edu.br", nome: "Bruno Ausente", disciplinas: ["Semiologia"] },
      ],
    },
  },
};
const EQUIPE = {
  pedagogico: ["ped@uniego.edu.br"],
  cursos: { enfermagem: { coordenadores: ["carla@uniego.edu.br"] } },
};
const completo = (x = {}) => normalizarRelatorio({
  disciplina: "Anatomia Humana", data: "2026-08-18", local: "Laboratório de Morfologia",
  objetivo: "Reconhecer as estruturas ósseas do membro superior em peças anatômicas.",
  atividades: "Em grupos de quatro, identificaram as peças e preencheram o roteiro guiado.",
  curso: "enfermagem", ...x,
}, { base: { id: "r1", professor: { email: "ana@uniego.edu.br", nome: "Ana Prática" },
  fotos: [{}, {}, {}].map(normalizarFoto), ...(x.base || {}) } });

/* ------------------------------ a régua -------------------------------- */
test("a entrega exige os cinco campos e as três fotos", () => {
  assert.equal(MIN_FOTOS, 3);
  assert.deepEqual(CAMPOS_RELATORIO.map((c) => c.campo),
    ["disciplina", "data", "local", "objetivo", "atividades"]);
  assert.deepEqual(faltaNoRelatorio(completo(), { hoje: "2026-08-20" }), []);

  // vazio: diz TUDO o que falta de uma vez — avisar um por vez faz a pessoa
  // clicar, corrigir e descobrir o seguinte
  const nada = normalizarRelatorio({}, { base: { id: "x" } });
  const falta = faltaNoRelatorio(nada, { hoje: "2026-08-20" });
  assert.ok(falta.length >= 6, `esperava tudo de uma vez, veio ${falta.length}`);
  assert.ok(falta.some((f) => /Fotos da prática — 0 de 3/.test(f)));
  assert.ok(falta.some((f) => /Curso/.test(f)));
});

test("texto curto demais não é relato, e aula futura não é aula", () => {
  const curto = completo({ objetivo: "ok" });
  assert.ok(faltaNoRelatorio(curto, { hoje: "2026-08-20" })
    .some((f) => /Objetivo.*ao menos 30/.test(f)));
  const amanha = completo({ data: "2026-08-25" });
  assert.ok(faltaNoRelatorio(amanha, { hoje: "2026-08-20" })
    .some((f) => /ainda não aconteceu/.test(f)));
  assert.equal(podeEnviar(completo(), { hoje: "2026-08-20" }), true);
});

test("com duas fotos ainda falta uma — e o aviso diz quantas", () => {
  const duas = completo({ base: { fotos: [{}, {}].map(normalizarFoto) } });
  assert.ok(faltaNoRelatorio(duas, { hoje: "2026-08-20" })
    .some((f) => /2 de 3/.test(f)));
});

/* --------------------- o que o formulário NÃO decide -------------------- */
test("situação, protocolo e fotos nunca vêm do formulário", () => {
  const forjado = normalizarRelatorio(
    { status: "validado", protocolo: "AP-2026-999", fotos: [{ nome: "x" }, { nome: "y" }, { nome: "z" }],
      disciplina: "Anatomia" },
    { base: { id: "r1" } });
  assert.equal(forjado.status, "rascunho", "a situação é do fluxo");
  assert.equal(forjado.protocolo, "", "o protocolo é emitido pelo servidor");
  assert.deepEqual(forjado.fotos, [], "imagem entra pela rota de anexo, nunca no payload");
  assert.ok(STATUS.includes(forjado.status));
  assert.equal(MAX_FOTOS, 12);
});

test("o semestre sai da DATA DA AULA, não do dia em que se registra", () => {
  // registrar em julho a aula de 28 de junho é relatar o semestre que acabou
  assert.equal(completo({ data: "2026-06-28" }).semestre, "2026/1");
  assert.equal(completo({ data: "2026-07-01" }).semestre, "2026/2");
  assert.equal(completo({ data: "2027-01-02" }).semestre, "2027/1");
});

test("ENTREGUE não é “tudo menos rascunho” — devolvido voltou para o professor", () => {
  assert.equal(ENTREGUE({ status: "enviado" }), true);
  assert.equal(ENTREGUE({ status: "validado" }), true);
  assert.equal(ENTREGUE({ status: "devolvido" }), false);
  assert.equal(ENTREGUE({ status: "rascunho" }), false);
});

/* ---------------------------- as quatro figuras ------------------------- */
const quem = (email, gestao = false) => quemNoModulo({ email, gestao }, EQUIPE);

test("a coordenação POR CURSO sai do cadastro do módulo, não de modulosDe", () => {
  assert.deepEqual(cursosQueCoordena(EQUIPE, "carla@uniego.edu.br"), ["enfermagem"]);
  assert.deepEqual(cursosQueCoordena(EQUIPE, "ana@uniego.edu.br"), []);
  // a pedagógica não coordena UM curso: ela vê todos
  const ped = quem("ped@uniego.edu.br");
  assert.equal(ped.gestao, true);
  assert.equal(ped.pedagogico, true);
  assert.equal(coordenaCurso(ped, "direito"), true, "a pedagógica alcança qualquer curso");
  assert.equal(coordenaCurso(quem("carla@uniego.edu.br"), "direito"), false);
  assert.equal(coordenaCurso(quem("carla@uniego.edu.br"), "enfermagem"), true);
});

test("cada figura enxerga o que lhe cabe", () => {
  const r = completo();
  assert.equal(papelNoRelatorio(r, quem("ana@uniego.edu.br")), "professor");
  assert.equal(papelNoRelatorio(r, quem("carla@uniego.edu.br")), "coordenador");
  assert.equal(papelNoRelatorio(r, quem("ped@uniego.edu.br")), "gestao");
  assert.equal(papelNoRelatorio(r, quem("jadson@uniego.edu.br", true)), "gestao");
  // coordenador de OUTRO curso não é nada aqui
  const outro = quemNoModulo({ email: "d@uniego.edu.br" },
    { cursos: { direito: { coordenadores: ["d@uniego.edu.br"] } } });
  assert.equal(papelNoRelatorio(r, outro), null);
  assert.equal(podeVer(r, outro), false);
  assert.equal(visaoDoRelatorio(r, outro), null);
  assert.equal(visaoDoRelatorio(r, quem("carla@uniego.edu.br")).meuPapel, "coordenador");
});

test("NINGUÉM valida o próprio relatório — nem o gestor geral", () => {
  const enviado = { ...completo(), status: "enviado" };
  assert.equal(podeValidar(enviado, quem("carla@uniego.edu.br")), true);
  assert.equal(podeValidar(enviado, quem("ped@uniego.edu.br")), true);
  assert.equal(podeValidar(enviado, quem("ana@uniego.edu.br")), false, "é o relatório dela");

  // e o caso que a ordem de papelNoRelatorio existe para impedir: a
  // coordenadora registrando a PRÓPRIA aula. Ela coordena o curso e, ainda
  // assim, não valida o que é dela — quem valida é outra pessoa.
  const dela = { ...completo(), status: "enviado",
    professor: { email: "carla@uniego.edu.br", nome: "Carla" } };
  assert.equal(podeValidar(dela, quem("carla@uniego.edu.br")), false);
  assert.equal(podeValidar(dela, quem("ped@uniego.edu.br")), true, "outra pessoa, sim");
  assert.equal(podeValidar(dela, quem("jadson@uniego.edu.br", true)), true,
    "a PROPPEX é suporte: destrava o que a coordenação não pode decidir sozinha");

  // o gestor geral que dá aula também não valida a aula DELE
  const doGestor = { ...completo(), status: "enviado",
    professor: { email: "jadson@uniego.edu.br", nome: "Jadson" } };
  assert.equal(podeValidar(doGestor, quem("jadson@uniego.edu.br", true)), false,
    "ninguém valida a si mesmo, seja qual for o papel");
});

test("validado não se edita; devolvido volta a ser editável", () => {
  const ana = quem("ana@uniego.edu.br");
  assert.equal(podeEditar({ ...completo(), status: "rascunho" }, ana), true);
  assert.equal(podeEditar({ ...completo(), status: "devolvido" }, ana), true);
  assert.equal(podeEditar({ ...completo(), status: "enviado" }, ana), false);
  assert.equal(podeEditar({ ...completo(), status: "validado" }, ana), false);
  // a gestão é o SUPORTE: destrava o que emperrou
  assert.equal(podeEditar({ ...completo(), status: "validado" }, quem("ped@uniego.edu.br")), true);
  // só se valida o que foi enviado
  assert.equal(podeValidar({ ...completo(), status: "rascunho" }, quem("carla@uniego.edu.br")), false);
});

/* ------------------------ cadastro por semestre ------------------------- */
test("o cadastro é por semestre, e recusa o que não se pode cobrar", () => {
  const sujo = normalizarCadastro({
    "2026/2": { enfermagem: { professores: [
      { email: "a@x.br", nome: "A", disciplinas: ["X", "X", " Y "] },   // duplicata some
      { email: "a@x.br", nome: "Repetida", disciplinas: ["Z"] },        // a pessoa não entra duas vezes
      { email: "b@x.br", nome: "", disciplinas: ["K"] },                // sem nome não sai no documento
      { email: "", nome: "Ana", disciplinas: ["W"] },                   // nome de uma palavra não é chave
    ] }, inexistente: { professores: [{ email: "c@x.br", nome: "C", disciplinas: ["Q"] }] } },
    "2026": { enfermagem: { professores: [{ email: "d@x.br", nome: "D", disciplinas: ["R"] }] } },
  });
  assert.deepEqual(Object.keys(sujo), ["2026/2"], "semestre malformado não entra");
  assert.deepEqual(Object.keys(sujo["2026/2"]), ["enfermagem"], "curso fora do catálogo não entra");
  const profs = sujo["2026/2"].enfermagem.professores;
  assert.equal(profs.length, 1);
  // a duplicata se FUNDE, não se descarta (revisão de set/2026): a segunda
  // linha da mesma pessoa somava as disciplinas dela ao sumir em silêncio
  assert.deepEqual(profs[0].disciplinas, ["X", "Y", "Z"]);
});

test("homônimos com matrículas diferentes são duas pessoas; a mesma pessoa sem e-mail se funde", () => {
  const c = normalizarCadastro({ "2026/2": { enfermagem: { professores: [
    { nome: "Maria Silva Santos", matricula: "111", disciplinas: ["A"] },
    { nome: "Maria Silva Santos", matricula: "222", disciplinas: ["B"] },   // outra pessoa
    { nome: "Bruna Povoa Ribeiro", email: "bruna@x.br", disciplinas: ["C"] },
    { nome: "Bruna Povoa Ribeiro", disciplinasExtensao: ["D"] },           // a mesma, sem e-mail
  ] } } });
  const profs = c["2026/2"].enfermagem.professores;
  assert.equal(profs.filter((p) => p.nome === "Maria Silva Santos").length, 2, "matrículas diferentes");
  const bruna = profs.filter((p) => p.nome === "Bruna Povoa Ribeiro");
  assert.equal(bruna.length, 1, "a Bruna é uma só");
  assert.deepEqual([bruna[0].disciplinas, bruna[0].disciplinasExtensao], [["C"], ["D"]], "as listas se somam");
  assert.equal(bruna[0].email, "bruna@x.br", "o e-mail que uma linha tinha fica");
});

test("a chave da disciplina ignora acento, caixa e espaços — a cobrança cessa quando o relatório entra", () => {
  const c = normalizarCadastro({ "2026/2": { enfermagem: { professores: [
    { email: "geo@x.br", nome: "Geo Teixeira", disciplinasExtensao: ["Enfermagem em Saúde da Mulher"] },
  ] } } });
  const entregue = { semestre: "2026/2", tipo: "extensao", status: "enviado", curso: "enfermagem",
    disciplina: "enfermagem em  saude da mulher", professor: { email: "geo@x.br" } };
  assert.deepEqual(pendenciasCobrancaExtensao([entregue], c, { hoje: "2026-09-01" }), [],
    "grafia diferente da cadastrada não é outra disciplina");
});

test("o professor de dois cursos recebe UM lembrete, com as disciplinas dos dois", () => {
  const c = normalizarCadastro({ "2026/2": {
    enfermagem: { professores: [{ email: "x@x.br", nome: "X Y", disciplinasExtensao: ["A"] }] },
    odontologia: { professores: [{ email: "x@x.br", nome: "X Y", disciplinasExtensao: ["B"] }] },
  } });
  const p = pendenciasCobrancaExtensao([], c, { hoje: "2026-09-01" });
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].faltam, ["A", "B"]);
});

/* A LINHA SEM E-MAIL ENTRA (ago/2026): a relação que a coordenação recebe do
   sistema acadêmico traz matrícula, nome e disciplinas — recusá-la fazia a
   lista inteira não entrar, e o denominador dos painéis é a razão de o
   cadastro existir. O que ela NÃO faz é receber lembrete. */
test("o professor sem e-mail entra no cadastro, e o nome sozinho não basta", () => {
  const c = normalizarCadastro({ "2026/2": { enfermagem: { professores: [
    { nome: "Bruna Povoa Ribeiro", matricula: "11961", disciplinas: ["Enfermagem Cirúrgica"] },
    { nome: "Ana", disciplinas: ["X"] },                     // uma palavra: não identifica ninguém
    { nome: "Bruna Povoa Ribeiro", disciplinas: ["Outra"] }, // a mesma pessoa, de novo
  ] } } });
  const profs = c["2026/2"].enfermagem.professores;
  assert.equal(profs.length, 1, "só a que o nome completo identifica, e uma vez só");
  assert.equal(profs[0].matricula, "11961", "a matrícula fica: é por ela que se acha a conta");
  assert.deepEqual(professoresSemEmail(c, "2026/2").map((p) => p.nome), ["Bruna Povoa Ribeiro"]);
  // e ela NÃO é cobrada: não há endereço para onde mandar
  assert.deepEqual(pendenciasCobrancaExtensao([], c, { hoje: "2026-09-01" }), []);
});

/* As duas listas são de dois processos, e cada uma é o denominador do SEU
   painel: contá-las juntas faria "disciplinas sem relatório" mudar de sentido. */
test("aula prática e extensão curricular são listas separadas", () => {
  const c = normalizarCadastro({ "2026/2": { enfermagem: { professores: [
    { email: "sue@x.br", nome: "Sue Christine Siqueira Peclat",
      disciplinas: ["Manejo clínico"],
      disciplinasExtensao: ["Manejo clínico", "Educação em Saúde"] },
    { email: "tam@x.br", nome: "Tamires Mariana Rocha", disciplinas: ["Agressão e defesa"] },
  ] } } });
  assert.deepEqual(disciplinasDoSemestre(c, "2026/2", "", "pratica").map((d) => d.disciplina),
    ["Agressão e defesa", "Manejo clínico"]);
  assert.deepEqual(disciplinasDoSemestre(c, "2026/2", "", "extensao").map((d) => d.disciplina),
    ["Educação em Saúde", "Manejo clínico"]);
  // o padrão continua sendo a aula prática: nenhum chamador antigo muda de resposta
  assert.deepEqual(disciplinasDoSemestre(c, "2026/2"), disciplinasDoSemestre(c, "2026/2", "", "pratica"));
  assert.deepEqual(minhasDisciplinas(c, "2026/2", "sue@x.br", "extensao").map((d) => d.disciplina),
    ["Manejo clínico", "Educação em Saúde"]);
  // quem não curriculariza extensão não entra no lembrete mensal
  assert.deepEqual(pendenciasCobrancaExtensao([], c, { hoje: "2026-09-01" }).map((p) => p.email),
    ["sue@x.br"]);
});

/* O lembrete mensal NOMEIA o que falta, e cala quando não falta nada. */
test("o lembrete mensal da extensão nomeia as disciplinas sem relatório", () => {
  const c = normalizarCadastro({ "2026/2": { enfermagem: { professores: [
    { email: "sue@x.br", nome: "Sue Peclat",
      disciplinasExtensao: ["Manejo clínico", "Educação em Saúde"] },
  ] } } });
  const entregue = { semestre: "2026/2", tipo: "extensao", status: "enviado",
    curso: "enfermagem", disciplina: "Manejo clínico", professor: { email: "sue@x.br" } };
  const [p] = pendenciasCobrancaExtensao([entregue], c, { hoje: "2026-09-01" });
  assert.deepEqual(p.faltam, ["Educação em Saúde"], "a entregue sai da lista");
  assert.equal(p.entregues, 1);

  // entregues as duas, ninguém é cobrado
  const outra = { ...entregue, disciplina: "Educação em Saúde" };
  assert.deepEqual(pendenciasCobrancaExtensao([entregue, outra], c, { hoje: "2026-09-01" }), []);

  // mas o rascunho aberto volta a cobrar: preencheu e não enviou
  const rasc = { ...entregue, disciplina: "Educação em Saúde", status: "rascunho" };
  const [q] = pendenciasCobrancaExtensao([entregue, outra, rasc], c, { hoje: "2026-09-01" });
  assert.equal(q.rascunhos, 1);

  // e o relatório de OUTRO semestre não conta
  const velho = { ...entregue, semestre: "2026/1" };
  assert.deepEqual(pendenciasCobrancaExtensao([velho], c, { hoje: "2026-09-01" })[0].faltam,
    ["Manejo clínico", "Educação em Saúde"]);
});

test("o lembrete da extensão só sai no dia 1º", () => {
  assert.equal(ehPrimeiroDoMes("2026-09-01"), true);
  assert.equal(ehPrimeiroDoMes("2026-09-02"), false);
  assert.equal(ehPrimeiroDoMes("2026-12-01"), true);
  assert.equal(ehPrimeiroDoMes(""), false);
});

test("o professor vê só as disciplinas DELE, e o curso vem do cadastro", () => {
  assert.equal(professoresDoSemestre(CADASTRO, "2026/2").length, 2);
  assert.deepEqual(disciplinasDoSemestre(CADASTRO, "2026/2").map((d) => d.disciplina),
    ["Anatomia Humana", "Fisiologia", "Semiologia"]);
  assert.deepEqual(minhasDisciplinas(CADASTRO, "2026/2", "ana@uniego.edu.br").map((d) => d.disciplina),
    ["Anatomia Humana", "Fisiologia"]);
  assert.deepEqual(minhasDisciplinas(CADASTRO, "2026/2", "ninguem@uniego.edu.br"), []);
  assert.equal(cursoDoProfessor(CADASTRO, "2026/2", "ana@uniego.edu.br"), "enfermagem");
  // semestre novo começa vazio — é o que o alerta e o "copiar" existem para resolver
  assert.deepEqual(professoresDoSemestre(CADASTRO, "2027/1"), []);
});

test("a equipe guarda NOME e PAPEL — é o nome que sai no documento", () => {
  const eq = normalizarEquipe({
    pedagogico: [{ email: "PED@Uniego.edu.br", nome: "Paula Pedagógica" }, { email: "" }],
    cursos: {
      enfermagem: { coordenadores: [
        { email: "Carla@UNIEGO.edu.br", nome: "Carla Coordenadora", papel: "coordenador" },
        { email: "geo@uniego.edu.br", nome: "Geoselita", papel: "pedagogico" },
        { email: "CARLA@uniego.edu.br", nome: "Repetida" },      // a mesma pessoa não entra duas vezes
        { email: "sem@x.br", papel: "inventado" },               // papel fora do catálogo vira coordenador
      ] },
      xxx: { coordenadores: [{ email: "z@x.br", nome: "Fora do catálogo" }] },
    },
  });
  assert.deepEqual(eq.pedagogico, [{ email: "ped@uniego.edu.br", nome: "Paula Pedagógica", papel: "coordenador" }]);
  assert.deepEqual(Object.keys(eq.cursos), ["enfermagem"], "curso fora do catálogo não entra");
  const enf = eq.cursos.enfermagem.coordenadores;
  assert.equal(enf.length, 3);
  assert.deepEqual(enf.map((p) => p.email), ["carla@uniego.edu.br", "geo@uniego.edu.br", "sem@x.br"]);
  assert.equal(enf[1].papel, "pedagogico");
  assert.equal(enf[2].papel, "coordenador");
  assert.deepEqual(PAPEIS_COORDENACAO.map((p) => p.codigo), ["coordenador", "pedagogico"]);
  assert.deepEqual(coordenacaoDoCurso(eq, "enfermagem").map((p) => p.nome),
    ["Carla Coordenadora", "Geoselita", ""]);
});

test("a forma ANTIGA (só o e-mail em texto) continua sendo lida", () => {
  // o que já estiver gravado como lista de strings não pode virar lixo
  const eq = normalizarEquipe({ cursos: { enfermagem: { coordenadores: ["Carla@UNIEGO.edu.br"] } } });
  assert.deepEqual(eq.cursos.enfermagem.coordenadores,
    [{ email: "carla@uniego.edu.br", nome: "", papel: "coordenador" }]);
  assert.deepEqual(cursosQueCoordena(eq, "carla@uniego.edu.br"), ["enfermagem"]);
});

/* ------------------------------ o painel -------------------------------- */
test("o painel só existe porque o cadastro dá o DENOMINADOR", () => {
  const enviado = { ...completo(), status: "enviado" };
  const p = panorama([enviado], CADASTRO, { semestre: "2026/2" });
  assert.equal(p.entregues, 1);
  assert.equal(p.professores, 2, "os cadastrados no semestre");
  assert.equal(p.professoresQueRegistraram, 1);
  assert.deepEqual(p.professoresSemRegistro.map((x) => x.nome), ["Bruno Ausente"]);
  assert.equal(p.disciplinas, 3);
  assert.deepEqual(p.disciplinasSemRelatorio.map((d) => d.disciplina), ["Fisiologia", "Semiologia"]);
  // a disciplina sem relatório nomeia quem a leciona: é de quem se cobra
  assert.deepEqual(p.disciplinasSemRelatorio.find((d) => d.disciplina === "Semiologia").professores,
    ["Bruno Ausente"]);
  // rascunho não conta como aula relatada
  const comRascunho = panorama([enviado, { ...completo(), id: "r9", status: "rascunho" }],
    CADASTRO, { semestre: "2026/2" });
  assert.equal(comRascunho.entregues, 1);
  assert.equal(comRascunho.rascunhos, 1);
});

test("os filtros são os quatro da tela e não se atropelam", () => {
  const a = { ...completo(), id: "a", status: "validado" };
  const b = { ...completo(), id: "b", disciplina: "Fisiologia", data: "2026-08-19", status: "enviado" };
  const c = { ...completo(), id: "c", semestre: "2026/1", data: "2026-03-10", status: "validado" };
  const todos = [a, b, c];
  assert.deepEqual(filtrar(todos, { semestre: "2026/2" }).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(filtrar(todos, { disciplina: "fisiologia" }).map((x) => x.id), ["b"],
    "a disciplina casa sem depender de caixa");
  assert.deepEqual(filtrar(todos, { status: "validado" }).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(filtrar(todos, { professor: "ANA@uniego.edu.br" }).length, 3);
  assert.deepEqual(filtrar(todos, { semestre: "2026/2", status: "enviado" }).map((x) => x.id), ["b"]);
});

/* -------------------- a cobrança de segunda-feira ----------------------- */
test("a semana anterior de uma segunda vai da segunda ao domingo", () => {
  assert.equal(ehSegunda("2026-08-24"), true);
  assert.equal(ehSegunda("2026-08-25"), false);
  assert.deepEqual(semanaAnterior("2026-08-24"), { de: "2026-08-17", ate: "2026-08-23" });
  // e a conta atravessa o ano sem tropeçar
  assert.deepEqual(semanaAnterior("2027-01-04"), { de: "2026-12-28", ate: "2027-01-03" });
  assert.equal(semanaAnterior("nem data"), null);
});

test("cobra-se quem não registrou a semana — e quem deixou rascunho aberto", () => {
  const daSemana = { ...completo(), data: "2026-08-19", status: "enviado" };
  const pend = pendenciasCobranca([daSemana], CADASTRO, { hoje: "2026-08-24" });
  assert.deepEqual(pend.map((p) => p.nome), ["Bruno Ausente"], "Ana já registrou a semana");
  assert.deepEqual(pend[0].periodo, { de: "2026-08-17", ate: "2026-08-23" });
  assert.deepEqual(pend[0].disciplinas, ["Semiologia"]);

  // o esquecimento mais comum: preencheu e não enviou
  const comRascunho = pendenciasCobranca(
    [daSemana, { ...completo(), id: "z", status: "rascunho" }], CADASTRO, { hoje: "2026-08-24" });
  assert.deepEqual(comRascunho.map((p) => p.nome).sort(), ["Ana Prática", "Bruno Ausente"]);
  assert.equal(comRascunho.find((p) => p.nome === "Ana Prática").rascunhos, 1);

  // quem não tem disciplina cadastrada não é cobrado: não há do que cobrá-lo
  assert.deepEqual(pendenciasCobranca([], {}, { hoje: "2026-08-24" }), []);
});

/* ==================== EXTENSÃO CURRICULAR (ago/2026) ====================
   Pedido da PROAC: a ação curricularizada é componente curricular da
   disciplina — não certifica à parte —, mas o professor precisa registrar o
   que fez e alguém precisa validar. O fluxo é o deste módulo, e por isso ela
   entrou como um TIPO de relatório. */

const EXT = (over = {}) => normalizarRelatorio({
  tipo: "extensao", disciplina: "Saúde Coletiva", data: "2026-08-20", local: "Escola",
  objetivo: "o".repeat(40), atividades: "a".repeat(40),
  chDisciplina: 80, cargaHoraria: 20, academicos: 30,
  resumo: "r".repeat(200),
  participacaoDiscente: "p".repeat(60), publico: "Alunos do 5º ano",
  pessoasAtendidas: 180, impacto: "i".repeat(60),
  ods: ["3", "4", "99"],
  ...over,
}, { base: { curso: "enfermagem", fotos: [{ nome: "1" }, { nome: "2" }, { nome: "3" }],
  professor: { email: "prof@uniego.edu.br" }, ...(over.base || {}) } });

test("o tipo se fixa e escolhe o catálogo de campos", () => {
  assert.deepEqual(TIPOS.map((t) => t.codigo), ["pratica", "extensao"]);
  assert.equal(tipoDe("lixo").codigo, "pratica", "tipo desconhecido é aula prática");
  // relatório antigo não tem `tipo`: é aula prática, que é o que o módulo era
  assert.equal(tipoDe(undefined).codigo, "pratica");
  assert.equal(camposDo("pratica").length, CAMPOS_RELATORIO.length);
  assert.equal(camposDo("extensao").length, CAMPOS_RELATORIO.length + CAMPOS_EXTENSAO.length);
  // o tipo não muda depois: quem manda é a base
  const r = normalizarRelatorio({ tipo: "pratica" }, { base: { tipo: "extensao" } });
  assert.equal(r.tipo, "extensao");
  assert.ok(ehExtensao(r));
});

test("as três seções que o dono cortou não voltam pelo catálogo", () => {
  const campos = camposDo("extensao").map((c) => c.campo).join(" ");
  for (const fora of ["formacao", "reflexao", "competencia", "ppcQuadro"]) {
    assert.equal(campos.includes(fora), false, `${fora} saiu do modelo (seções 7, 11 e 12)`);
  }
  // e os rótulos dos campos comuns mudam de nome na extensão
  const objetivo = camposDo("extensao").find((c) => c.campo === "objetivo");
  assert.match(objetivo.rotulo, /Objetivos previstos/);
});

test("a régua do envio cobra o que a extensão curricular precisa comprovar", () => {
  assert.deepEqual(faltaNoRelatorio(EXT()), [], "completa, não falta nada");
  // número zerado é falta: sem carga horária não há hora curricularizada
  assert.match(faltaNoRelatorio(EXT({ cargaHoraria: 0 }))[0], /Carga horária extensionista/);
  assert.match(faltaNoRelatorio(EXT({ pessoasAtendidas: 0 }))[0], /Pessoas atendidas/);
  // os opcionais não travam
  assert.deepEqual(faltaNoRelatorio(EXT({ valorSocial: "", avaliacaoComunidade: "", ods: [] })), []);
  // e a mesma régua não cobra os campos da extensão numa aula prática
  const pratica = normalizarRelatorio({ disciplina: "Semiologia", data: "2026-08-20",
    local: "Lab", objetivo: "o".repeat(40), atividades: "a".repeat(40) },
  { base: { curso: "enfermagem", fotos: [{}, {}, {}] } });
  assert.deepEqual(faltaNoRelatorio(pratica), []);
});

test("os ODS são os 17 da Agenda 2030, e grava-se o número", () => {
  assert.equal(ODS.length, 17);
  assert.equal(ODS[2].nome, "Saúde e bem-estar");
  assert.deepEqual(EXT().ods, ["3", "4"], "número fora do catálogo não entra");
  assert.equal(rotuloOds("4"), "ODS 4 — Educação de qualidade");
  assert.equal(rotuloOds("99"), "");
  // marcar ODS é opcional: a atividade pode não mapear nenhum
  assert.deepEqual(faltaNoRelatorio(EXT({ ods: [] })), []);
});

test("reprovar é fim de linha; reabrir é da PROAC e da PROPPEX", () => {
  assert.deepEqual(DECISOES, ["validado", "devolvido", "reprovado"]);
  assert.ok(STATUS.includes("reprovado"));
  const gestao = { email: "proac@uniego.edu.br", gestao: true, cursos: [] };
  const coord = { email: "coord@uniego.edu.br", gestao: false, cursos: ["enfermagem"] };
  const prof = { email: "prof@uniego.edu.br", gestao: false, cursos: [] };

  const reprovado = EXT({ base: { status: "reprovado" } });
  reprovado.status = "reprovado";
  assert.ok(ENCERRADO(reprovado));
  assert.ok(podeReabrir(reprovado, gestao), "a PROAC/PROPPEX reabre");
  assert.equal(podeReabrir(reprovado, coord), false, "a coordenação do curso não reabre");
  assert.equal(podeReabrir(reprovado, prof), false, "o professor não reabre o próprio");
  // e não se reabre o que não terminou
  const enviado = EXT(); enviado.status = "enviado";
  assert.equal(podeReabrir(enviado, gestao), false);

  // decidir NO LUGAR da coordenação fica marcado; a coordenação do curso não
  assert.ok(decisaoNoLugarDaCoordenacao(enviado, gestao));
  assert.equal(decisaoNoLugarDaCoordenacao(enviado, { ...gestao, cursos: ["enfermagem"] }), false);
});

test("o panorama separa as aulas práticas da extensão curricular", () => {
  const val = EXT(); val.status = "validado"; val.semestre = "2026/2";
  const env = EXT({ cargaHoraria: 5 }); env.status = "enviado"; env.semestre = "2026/2";
  const aula = normalizarRelatorio({ disciplina: "Semiologia", data: "2026-08-20", local: "Lab",
    objetivo: "o".repeat(40), atividades: "a".repeat(40) }, { base: { curso: "enfermagem" } });
  aula.status = "validado";
  const p = panorama([val, env, aula], CADASTRO, { semestre: "2026/2" });
  assert.equal(p.entregues, 1, "só a aula prática conta nos números das aulas");
  assert.equal(p.extensaoCurricular.total, 2);
  assert.equal(p.extensaoCurricular.validados, 1);
  // a hora só conta depois de validada: atividade não validada não comprova
  assert.equal(p.extensaoCurricular.horas, 20);
});
