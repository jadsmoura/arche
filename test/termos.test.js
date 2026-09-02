/* Termos de Compromisso da IC: o texto é o modelo institucional, e o que o
   ARCHÉ faz é preencher. O que estes testes protegem é justamente o que se
   perde primeiro numa edição distraída — a carga horária de cada tipo, quem
   paga, para quem se devolve e o que NÃO pode aparecer num termo de
   voluntário (conta bancária, valor de bolsa). */
import test from "node:test";
import assert from "node:assert/strict";
import { termoDoAluno, termoDoOrientador, HORAS_SEMANAIS, VALOR_CNPQ, mesAno, edicao,
  alunosDoLote, fomentoDoProjeto } from "../lib/termos.js";
import { MARCAS } from "../lib/marca.js";

const INST = { ...MARCAS.uniego, cidade: "Goianésia" };
const VIG = { inicio: "2026-09-01", fim: "2027-08-31" };
const texto = (t) => JSON.stringify(t);

test("cada tipo de termo cobra a sua carga horária", () => {
  assert.equal(HORAS_SEMANAIS.cnpq, 20);
  assert.equal(HORAS_SEMANAIS.uniego, 12);
  assert.equal(HORAS_SEMANAIS.voluntario, 8);
  for (const [tipo, horas] of Object.entries(HORAS_SEMANAIS)) {
    const t = termoDoAluno({ tipo, inst: INST, programa: "PIBIC/UNIEGO", valor: 350, vigencia: VIG });
    assert.match(texto(t), new RegExp(`Dedicar ${String(horas).padStart(2, "0")} horas semanais`),
      `o termo ${tipo} cobra ${horas}h`);
  }
});

test("no termo do CNPq quem paga e quem recebe de volta é o CNPq", () => {
  const t = termoDoAluno({ tipo: "cnpq", inst: INST, programa: "PIBIC/CNPq", vigencia: VIG });
  const s = texto(t);
  assert.match(s, new RegExp(`R\\$ ${VALOR_CNPQ}`), "o valor da tabela do CNPq");
  assert.match(s, /§ 3º. Do Bolsista/, "com o CNPq, o bolsista é o § 3º");
  assert.match(s, /Devolver ao CNPq/);
  assert.match(s, /Não possuir vínculo empregatício/, "o CNPq veda o vínculo");
  assert.match(s, /PIBITI/, "o modelo do CNPq descreve PIBIC e PIBITI");
});

test("no termo do UNIEGO quem paga é a instituição, e o valor é o da modalidade", () => {
  const t = termoDoAluno({ tipo: "uniego", inst: INST, programa: "PIBIC/UNIEGO", valor: 350, vigencia: VIG });
  const s = texto(t);
  assert.match(s, /R\\?\$ 350,00 mensais/, "o valor vem do catálogo do edital");
  assert.match(s, /§ 2º. Do Bolsista/, "sem o CNPq, o bolsista é o § 2º");
  assert.match(s, /Devolver ao UNIEGO/);
  assert.ok(!/CNPq/.test(s), "a bolsa institucional não cita o CNPq");
});

test("o termo do voluntário não fala em dinheiro nem em conta", () => {
  const t = termoDoAluno({ tipo: "voluntario", inst: INST, programa: "Voluntário", vigencia: VIG });
  const s = texto(t);
  assert.match(t.titulo, /VOLUNTÁRIO/);
  assert.ok(!/R\$/.test(s), "voluntário não tem valor de bolsa");
  assert.ok(!/Devolver/.test(s), "não há mensalidade a devolver");
  assert.match(s, /§ 2º. Do Voluntário/);
  assert.match(s, /condição de voluntário/);
});

test("o termo do orientador tira os prazos do edital, não de uma data fixa", () => {
  const t = termoDoOrientador({ inst: INST, vigencia: VIG });
  const s = texto(t);
  assert.match(s, /Relatório Parcial\) em março\/2027/, "parcial aos 6 meses de execução");
  assert.match(s, /Relatório Final em agosto\/2027/, "final no fim da vigência");
  assert.match(s, /Seminário de Iniciação Científica do UNIEGO, que ocorrerá em outubro\/2027/);
  assert.match(t.subtitulo, /Edição 2026\/2027/);
  // e o compromisso que mais interessa à coordenação continua lá
  assert.match(s, /É vedado ao orientador repassar a outro a orientação/);
});

test("a instituição do termo é a da época, com o artigo certo", () => {
  const faceg = { ...MARCAS.faceg, cidade: "Goianésia" };
  const t = termoDoAluno({ tipo: "uniego", inst: faceg, programa: "PBIC/FACEG", valor: 350, vigencia: { inicio: "2024-09-01", fim: "2025-08-31" } });
  assert.match(t.abertura, /^A FACEG e o BOLSISTA/, '"a" FACEG, não "o"');
  assert.match(texto(t), /Devolver à FACEG/);
  const u = termoDoAluno({ tipo: "uniego", inst: INST, programa: "PIBIC/UNIEGO", valor: 350, vigencia: VIG });
  assert.match(u.abertura, /^O UNIEGO e o BOLSISTA/);
});

test("mesAno e edicao formatam como o documento escreve", () => {
  assert.equal(mesAno("2026-09-01"), "setembro/2026");
  assert.equal(mesAno(""), "—");
  assert.equal(edicao(VIG), "2026/2027");
});

/* O lote de termos: bolsistas e voluntários são pilhas DIFERENTES, porque
   assinam documentos diferentes. O que este teste protege é o voluntário não
   ficar de fora do lote (o botão só emitia "bolsistas") e não voltar a
   entrar na pilha errada. */
test("o lote separa bolsistas de voluntários, e a via individual traz os dois", () => {
  const comBolsa = { fomento: { tipo: "uniego" }, alunos: [{ nome: "Bolsista" }] };
  const cnpq = { fomento: { tipo: "cnpq" }, alunos: [{ nome: "Do CNPq" }] };
  const semBolsa = { fomento: null, alunos: [{ nome: "Voluntária" }, { nome: "" }] };
  const projetos = [comBolsa, cnpq, semBolsa];

  assert.equal(fomentoDoProjeto(semBolsa), "voluntario", "sem bolsa concedida é voluntário");
  assert.deepEqual(alunosDoLote(projetos, "bolsista").map((x) => x.a.nome), ["Bolsista", "Do CNPq"]);
  assert.deepEqual(alunosDoLote(projetos, "voluntario").map((x) => x.a.nome), ["Voluntária"],
    "aluno sem nome e sem e-mail não vira folha");
  // é o tipo da via individual: o voluntário precisa baixar a DELE
  assert.equal(alunosDoLote(projetos, "aluno").length, 3);
  assert.equal(alunosDoLote(projetos, "orientador").length, 0, "o lote de orientadores não traz aluno");
});
