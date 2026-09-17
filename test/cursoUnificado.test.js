/* O CURSO DIGITADO VIRA O DO CATÁLOGO (achado do dono, set/2026, no filtro
   "Curso" da lista de inscritos do CONINT: um curso partido em quatro linhas
   porque o campo é escrito à mão).

   As entradas abaixo são as do print, letra por letra — é contra elas que a
   régua vale. E o que ela protege nos dois sentidos: unificar de MENOS deixa
   "Enfermagem uniego" numa linha própria, que era o defeito; unificar DEMAIS
   é pior, porque transforma o participante de OUTRA instituição em aluno da
   casa — e é o certificado e o relatório ao MEC que passam a mentir. */
import test from "node:test";
import assert from "node:assert/strict";
import { cursoDoCatalogo, unificarCurso, chaveDeCurso } from "../lib/instituicao.js";

test("as grafias do print viram UM curso do catálogo", () => {
  const mesmo = (grafias, nome) => {
    for (const g of grafias) assert.equal(unificarCurso(g), nome, `"${g}" deveria virar "${nome}"`);
  };
  mesmo(["Agronomia-uniego", "Agronomia-UNIEGO", "Agronômia/Uniego", "agronomia"], "Agronomia");
  mesmo(["Ciências contábeis", "Ciências Contábeis", "Ciências Contábeis - UNIEGO",
    "Ciências Contábeis- UNIEGO", "ciencias contabeis"], "Ciências Contábeis");
  mesmo(["Enfermagem", "Enfermagem uniego", "Enfermagem Uniego", "Enfermagem UNIEGO"], "Enfermagem");
  mesmo(["Engenharia Mecânica", "Engenharia Mecânica — UNIEGO", "Engenharia Mecânica- Uniego"],
    "Engenharia Mecânica");
  mesmo(["Medicina veterinária", "Medicina Veterinária", "MEDICINA VETERINARIA"], "Medicina Veterinária");
  mesmo(["Direito", "direito ", "UNIEGO Direito"], "Direito");
});

test("os conectivos não partem o curso em dois", () => {
  assert.equal(unificarCurso("Engenharia de Software"), "Engenharia de Software");
  assert.equal(unificarCurso("engenharia software"), "Engenharia de Software");
  assert.equal(unificarCurso("Engenharia de Software — UNIEGO"), "Engenharia de Software");
});

test("a sigla vale, mas só sozinha", () => {
  assert.equal(unificarCurso("ADM"), "Administração");
  assert.equal(unificarCurso("adm"), "Administração");
  // "adm de empresas" é outro curso, de outra instituição: fica como veio
  assert.equal(unificarCurso("ADM de Empresas"), "ADM de Empresas");
});

test("o participante de FORA continua de fora — é o falso positivo que custa caro", () => {
  for (const externo of ["Enfermagem — UFG", "Medicina Veterinária/UFU", "Direito - PUC",
    "Agronomia (IF Goiano)", "Enfermagem UniEVANGÉLICA"]) {
    assert.equal(cursoDoCatalogo(externo), null, `"${externo}" não é curso da casa`);
    assert.equal(unificarCurso(externo), externo, "o texto de quem é de fora fica como ele escreveu");
  }
});

test("o que não é curso nenhum não se inventa", () => {
  for (const v of ["", "   ", null, undefined, "Docente administração e Contábeis",
    "Institucional / PROPPEX", "Institucional / PROAC", "Secretaria"]) {
    assert.equal(cursoDoCatalogo(v), null);
  }
  assert.equal(unificarCurso(null), "");
  assert.equal(unificarCurso("  Institucional / PROAC "), "Institucional / PROAC");
});

test("unificar é idempotente: o nome do catálogo passa por ele sem mudar", () => {
  for (const g of ["Agronomia", "Ciências Contábeis", "Engenharia de Software", "Psicologia"]) {
    assert.equal(unificarCurso(unificarCurso(g)), g);
  }
});

test("a chave ignora acento, caixa e pontuação — e só isso", () => {
  assert.equal(chaveDeCurso("Ciências Contábeis - UNIEGO"), "ciencias contabeis uniego");
  assert.equal(chaveDeCurso("Agronômia/Uniego"), "agronomia uniego");
  assert.equal(chaveDeCurso("   "), "");
});
