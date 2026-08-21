/* O ARQUIVO da monitoria — os semestres que correram FORA do ARCHÉ.

   O que se protege aqui é o casamento. A planilha da coordenação não tem CPF
   nem e-mail: a âncora é a MATRÍCULA e a segunda chave é o nome completo. Um
   casamento frouxo demais entrega o certificado de um aluno a um homônimo;
   apertado demais deixa sem certificado quem ainda não informou a matrícula.
   Os dois erros custam caro e nenhum deles aparece sozinho. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  certificadoHistorico, certificadosHistoricos, chaveNome, ehEsteMonitor,
  certificadoDoArquivo, certificadosDoArquivo,
  normalizarLote, normalizarMatricula, panoramaDoLote,
} from "../lib/monitoriaHistorico.js";

const BRUTO = {
  lote: "mon-teste", curso: "enfermagem", ciclo: "2026/1", edital: "01/2026",
  fonte: "planilha da coordenação",
  vigencia: { inicio: "2026-03-18", fim: "2026-06-12" },
  registros: [
    { aluno: "Isadora Rezende Lacerda Farias", matricula: "G2410026",
      orientador: "Bruna Póvoa Ribeiro", disciplina: "SAE: Fundamentação do Cuidar", horas: 20 },
    { aluno: "Higor Gustavo Vieira Sampaio", matricula: "G2410218",
      orientador: "Bruna Póvoa Ribeiro", disciplina: "SAE: Fundamentação do Cuidar", horas: 20 },
    { aluno: "Isadora Rezende Lacerda Farias", matricula: "G2410026",
      orientador: "Isabela Cristina Evangelista Vaz", disciplina: "SAE: Exame Físico", horas: 20 },
    { aluno: "Tamires Rocha" },                      // linha da planilha sem disciplina
    { aluno: "", matricula: "G0000000", disciplina: "Nada" },
  ],
};
const LOTE = normalizarLote(BRUTO);

test("o lote descarta a linha que não é um certificado", () => {
  assert.equal(LOTE.registros.length, 3, "sem aluno ou sem disciplina não é certificado");
  assert.equal(LOTE.cursoNome, "Enfermagem", "o slug do curso vira o nome que sai no documento");
  assert.deepEqual(LOTE.vigencia, { inicio: "2026-03-18", fim: "2026-06-12" });
  assert.equal(normalizarLote({ registros: [] }), null, "lote sem nome não entra");
});

test("os ids saem do CONTEÚDO — reordenar a planilha não muda endereço", () => {
  const outraOrdem = normalizarLote({ ...BRUTO, registros: [...BRUTO.registros].reverse() });
  assert.deepEqual(
    outraOrdem.registros.map((r) => r.id).sort(),
    LOTE.registros.map((r) => r.id).sort(),
    "o certificado já baixado continua no mesmo endereço",
  );
  // a mesma linha duas vezes na planilha é UMA linha
  const dobrado = normalizarLote({ ...BRUTO, registros: [...BRUTO.registros, BRUTO.registros[0]] });
  assert.equal(dobrado.registros.length, 3);
  // o PROJETO é a dupla orientação + disciplina: dois monitores, um projeto
  assert.equal(LOTE.registros[0].projetoId, LOTE.registros[1].projetoId);
  assert.notEqual(LOTE.registros[0].projetoId, LOTE.registros[2].projetoId);
});

test("a matrícula acha, e acha escrita de qualquer jeito", () => {
  assert.equal(normalizarMatricula(" g24-10026 "), "G2410026");
  for (const m of ["G2410026", "g2410026", "G 2410026"]) {
    const c = certificadosHistoricos([LOTE], { matricula: m });
    assert.equal(c.length, 2, `${m} devia achar os dois certificados dela`);
    assert.deepEqual(c.map((x) => x.tipo), ["monitoria", "monitoria"]);
  }
});

test("o nome completo é a segunda chave — sem ela, quem não informou matrícula fica sem nada", () => {
  const c = certificadosHistoricos([LOTE], { nome: "isadora rezende lacerda FARIAS" });
  assert.equal(c.length, 2, "acento e caixa não decidem quem recebe certificado");
  assert.equal(chaveNome("Póvoa"), "povoa");
  // nome de uma palavra só não identifica ninguém
  assert.equal(certificadosHistoricos([LOTE], { nome: "Isadora" }).length, 0);
  // e sem nada não se casa nada — o arquivo não tem CPF nem e-mail
  assert.equal(certificadosHistoricos([LOTE], { cpf: "11144477735", email: "a@b.c" }).length, 0);
});

test("matrícula que BRIGA derruba o casamento por nome — dois homônimos não são um", () => {
  const outra = { nome: "Isadora Rezende Lacerda Farias", matricula: "G9999999" };
  assert.equal(certificadosHistoricos([LOTE], outra).length, 0);
  assert.equal(ehEsteMonitor(LOTE.registros[0], outra), false);
  // quem ainda não informou a matrícula continua achando pelo nome
  assert.equal(ehEsteMonitor(LOTE.registros[0], { nome: "Isadora Rezende Lacerda Farias" }), true);
});

test("a orientação recebe UM por projeto, com os monitores nomeados", () => {
  const c = certificadosHistoricos([LOTE], { nome: "Bruna Póvoa Ribeiro" });
  assert.equal(c.length, 1, "dois monitores na mesma disciplina são um projeto só (item 6.1)");
  assert.equal(c[0].tipo, "orientacao-monitoria");
  assert.deepEqual(c[0].monitores,
    ["Isadora Rezende Lacerda Farias", "Higor Gustavo Vieira Sampaio"]);
  assert.equal(c[0].curso, "Enfermagem");
  assert.equal(c[0].vigencia.fim, "2026-06-12", "é o fim da vigência que escolhe o timbre da época");
});

test("o id sozinho não abre nada: o certificado se confere contra quem pede", () => {
  const dela = certificadosHistoricos([LOTE], { matricula: "G2410026" })[0];
  assert.ok(certificadoHistorico([LOTE], { matricula: "G2410026" }, dela.id));
  assert.equal(certificadoHistorico([LOTE], { matricula: "G2410218" }, dela.id), null,
    "o colega com o link dela não baixa o certificado dela");
  assert.equal(certificadoHistorico([LOTE], { nome: "" }, dela.id), null);
});

test("o panorama diz de quem cobrar a matrícula", () => {
  const p = panoramaDoLote(LOTE, {
    "isadora@uniego.edu.br": { nome: "Isadora Rezende Lacerda Farias", matricula: "G2410026" },
    "outro@uniego.edu.br": { nome: "Higor Gustavo Vieira Sampaio", matricula: "G9999999" },
  });
  assert.equal(p.registros, 3);
  assert.equal(p.alunos.length, 2, "a mesma pessoa com dois certificados é uma pessoa");
  assert.equal(p.comConta, 1, "o Higor tem conta, mas com OUTRA matrícula: não é ele");
  const isadora = p.alunos.find((a) => a.matricula === "G2410026");
  assert.equal(isadora.certificados, 2);
  assert.equal(isadora.conta, "isadora@uniego.edu.br");
});

/* A VISÃO DA GESTÃO (pedido do dono, ago/2026): a guia Certificados passou a
   listar também os do arquivo, para quem certificou o semestre poder abrir o
   documento e conferir como ficou. Duas coisas se protegem aqui: a lista é a
   MESMA que o titular vê (uma segunda régua emitiria documento que o dono não
   encontra) e o alcance recorta por curso — a coordenação de Odontologia não
   abre o certificado de Enfermagem. */
test("a gestão vê TODOS os certificados do arquivo, sem casar com ninguém", () => {
  const todos = certificadosDoArquivo([LOTE]);
  assert.equal(todos.length, 5, "3 do monitor + 2 projetos de orientação");
  assert.deepEqual(
    todos.filter((c) => c.tipo === "orientacao-monitoria").map((c) => c.pessoa).sort(),
    ["Bruna Póvoa Ribeiro", "Isabela Cristina Evangelista Vaz"],
  );
  // é a mesma lista do titular: o que a gestão abre, a pessoa encontra
  const dela = certificadosHistoricos([LOTE], { matricula: "G2410026" });
  for (const c of dela) assert.ok(todos.some((t) => t.id === c.id));
});

test("o alcance por curso recorta o arquivo da gestão", () => {
  assert.equal(certificadosDoArquivo([LOTE], { cursos: ["enfermagem"] }).length, 5);
  assert.equal(certificadosDoArquivo([LOTE], { cursos: ["odontologia"] }).length, 0,
    "a coordenação de outro curso não alcança este lote");
  const um = certificadosDoArquivo([LOTE])[0];
  assert.ok(certificadoDoArquivo([LOTE], um.id));
  assert.equal(certificadoDoArquivo([LOTE], um.id, { cursos: ["odontologia"] }), null,
    "o id sozinho não abre nada: ele se confere contra o alcance");
  assert.equal(certificadoDoArquivo([LOTE], "mh-inexistente"), null);
});
