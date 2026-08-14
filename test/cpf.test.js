/* CPF: validação, normalização e o vínculo que ele faz entre o projeto
   importado da submissão anterior e a conta de quem o submeteu. */
import test from "node:test";
import assert from "node:assert/strict";
import { cpfValido, normalizarCpf, formatarCpf, mascararCpf, mesmoCpf, soDigitos } from "../lib/cpf.js";
import {
  vincularPorCpf, papelNoProjeto, participaDeAlgum, normalizarProjeto, validarProjeto, visaoDoProjeto,
} from "../lib/ic.js";

const CPF = "39053344705", CPF2 = "11144477735";

test("os dígitos verificadores são conferidos", () => {
  assert.equal(cpfValido("390.533.447-05"), true, "formatado vale");
  assert.equal(cpfValido(CPF), true);
  assert.equal(cpfValido("39053344704"), false, "dígito trocado não passa");
  assert.equal(cpfValido("3905334470"), false, "faltando dígito");
  assert.equal(cpfValido("111.111.111-11"), false, "sequência repetida passa na conta, mas não existe");
  assert.equal(cpfValido(""), false);
  assert.equal(cpfValido(null), false);
});

test("guarda-se só os dígitos; a máscara é enfeite de tela", () => {
  assert.equal(normalizarCpf("390.533.447-05"), CPF);
  assert.equal(normalizarCpf(" 390 533 447 05 "), CPF);
  assert.equal(normalizarCpf("39053344704"), "", "inválido não vira vínculo");
  assert.equal(formatarCpf(CPF), "390.533.447-05");
  assert.equal(mascararCpf(CPF), "***.533.447-**", "para conferir sem expor");
  assert.equal(soDigitos("390.533.447-05"), CPF);
});

test("a comparação ignora a formatação, e vazio nunca é igual a vazio", () => {
  assert.equal(mesmoCpf("390.533.447-05", CPF), true);
  assert.equal(mesmoCpf(CPF, CPF2), false);
  assert.equal(mesmoCpf("", ""), false, "sem CPF ninguém é dono de nada");
  assert.equal(mesmoCpf(null, undefined), false);
});

/* ------------------------- vínculo com os projetos ---------------------- */
const importado = () => normalizarProjeto({
  titulo: "Sistemas agroflorestais na recuperação de nascentes",
  resumo: "Avalia arranjos agroflorestais na recuperação de nascentes degradadas na bacia do rio dos Bois. ".repeat(2),
  curso: "agronomia", modalidade: "pibic",
  objetivos: "Comparar três arranjos.", metodologia: "Parcelas permanentes.",
  orientador: { nome: "Profa. Marina", cpf: "390.533.447-05" },     // sem e-mail: veio da planilha
  alunos: [{ nome: "João Pedro", cpf: CPF2 }],
  cronograma: [{ atividade: "Implantação", inicio: "2025-09-01", fim: "2025-12-15" }],
}, { autor: "" });

test("projeto vindo de fora é válido só com o CPF, sem e-mail nenhum", () => {
  const p = importado();
  assert.equal(p.orientador.email, "", "a planilha não traz e-mail");
  assert.equal(p.orientador.cpf, CPF);
  assert.equal(p.alunos[0].cpf, CPF2);
  assert.deepEqual(validarProjeto(p), [], "o CPF identifica no lugar do e-mail");
});

test("o CPF do perfil vale tanto quanto o e-mail para dizer quem é quem", () => {
  const p = importado();
  assert.equal(papelNoProjeto({ email: "marina@uniego.edu.br", cpf: CPF }, p), "orientador");
  assert.equal(papelNoProjeto({ email: "joao@uniego.edu.br", cpf: CPF2 }, p), "aluno");
  assert.equal(papelNoProjeto({ email: "marina@uniego.edu.br" }, p), null, "só o e-mail não basta aqui");
  assert.equal(papelNoProjeto({ email: "outro@uniego.edu.br", cpf: "52998224725" }, p), null);
  assert.equal(participaDeAlgum("marina@uniego.edu.br", [p], CPF), true, "e já dá acesso ao setor");
});

test("cadastrar o CPF escreve o e-mail no projeto que o esperava", () => {
  const lista = [importado()];
  const r = vincularPorCpf(lista, { email: "marina@uniego.edu.br", cpf: "390.533.447-05" });
  assert.equal(r.vinculados, 1);
  assert.equal(lista[0].orientador.email, "marina@uniego.edu.br");
  assert.equal(lista[0].criadoPor, "marina@uniego.edu.br", "passa a ter dono");
  assert.match(lista[0].historico.at(-1).oQue, /vinculou-se ao projeto pelo CPF/);
  assert.equal(papelNoProjeto({ email: "marina@uniego.edu.br" }, lista[0]), "orientador",
    "daí em diante o acesso funciona pelo e-mail, como em qualquer projeto");

  const denovo = vincularPorCpf(lista, { email: "marina@uniego.edu.br", cpf: CPF });
  assert.equal(denovo.vinculados, 0, "rodar de novo não faz nada");
});

test("o aluno se vincula pelo CPF sem mexer no resto do projeto", () => {
  const lista = [importado()];
  const r = vincularPorCpf(lista, { email: "joao@uniego.edu.br", cpf: CPF2 });
  assert.equal(r.vinculados, 1);
  assert.equal(lista[0].alunos[0].email, "joao@uniego.edu.br");
  assert.equal(lista[0].orientador.email, "", "a orientação continua esperando o dono dela");
});

test("o CPF de um aluno não fica à mostra para o colega de projeto", () => {
  const p = normalizarProjeto({
    ...importado(),
    alunos: [{ nome: "João Pedro", cpf: CPF2, email: "joao@uniego.edu.br", matricula: "2024001" },
      { nome: "Ana Lúcia", cpf: "52998224725", email: "ana@uniego.edu.br", matricula: "2024002" }],
  }, { autor: "" });

  const doJoao = visaoDoProjeto(p, { email: "joao@uniego.edu.br" });
  assert.equal(doJoao.alunos[0].cpf, CPF2, "o próprio, ele vê");
  assert.equal(doJoao.alunos[1].nome, "Ana Lúcia", "sabe que a colega existe");
  assert.equal(doJoao.alunos[1].cpf, "", "mas não o CPF dela");
  assert.equal(doJoao.alunos[1].email, "");
  assert.equal(doJoao.alunos[1].matricula, "");

  const daOrientacao = visaoDoProjeto(p, { email: "marina@uniego.edu.br", cpf: CPF });
  assert.equal(daOrientacao.alunos[1].cpf, "52998224725", "quem indicou vê os dados de quem indicou");
  assert.equal(visaoDoProjeto(p, { email: "x@y.br", gestao: true }).alunos[1].cpf, "52998224725");
});

test("o vínculo não sobrescreve e-mail já existente nem CPF alheio", () => {
  const lista = [normalizarProjeto({ ...importado(), orientador: { nome: "Profa. Marina", cpf: CPF, email: "marina@uniego.edu.br" } }, { autor: "" })];
  assert.equal(vincularPorCpf(lista, { email: "impostor@uniego.edu.br", cpf: CPF }).vinculados, 0,
    "projeto que já tem dono não troca de mãos por CPF");
  assert.equal(lista[0].orientador.email, "marina@uniego.edu.br");

  const outra = [importado()];
  assert.equal(vincularPorCpf(outra, { email: "alguem@uniego.edu.br", cpf: "52998224725" }).vinculados, 0);
  assert.equal(vincularPorCpf(outra, { email: "alguem@uniego.edu.br", cpf: "111" }).vinculados, 0,
    "CPF incompleto não vincula nada");
  assert.equal(vincularPorCpf(outra, { email: "", cpf: CPF }).vinculados, 0, "sem conta não há vínculo");
});
