/* Ação de MAIS DE UM CURSO (pedido de um professor, ago/2026).
   O que se protege aqui: o curso principal continua sendo UM — é ele que
   nomeia a pasta no Drive e responde pela ação —, e o co-realizador não
   pode entrar repetido, fora do catálogo nem em quantidade ilimitada. E o
   filtro por curso tem de encontrar a ação pelos DOIS lados: se só o
   principal contasse, a coordenação do segundo curso não veria o próprio
   evento, que é justamente o que o pedido queria resolver. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CURSOS_EXTRAS, normalizarCursosExtras, cursosDaAcao, cursosEmTexto, acaoDoCurso,
} from "../lib/eventos.js";

const CAT = ["Engenharia Mecânica", "Engenharia Civil", "Enfermagem", "Agronomia",
  "Direito", "Psicologia", "Odontologia"];

test("o co-realizador entra limpo, e o principal nunca se repete", () => {
  assert.deepEqual(
    normalizarCursosExtras(["Engenharia Civil"], "Engenharia Mecânica", CAT),
    ["Engenharia Civil"]);
  // o principal de volta na lista seria "Enfermagem e Enfermagem" na ficha
  assert.deepEqual(normalizarCursosExtras(["Enfermagem"], "Enfermagem", CAT), []);
  // acento e caixa não fazem dois cursos do mesmo
  assert.deepEqual(normalizarCursosExtras(["engenharia civil", "ENGENHARIA CIVIL"],
    "Enfermagem", CAT), ["Engenharia Civil"], "grava a grafia do catálogo, uma vez só");
  assert.deepEqual(normalizarCursosExtras(["  ", null, undefined], "Enfermagem", CAT), []);
  assert.deepEqual(normalizarCursosExtras("Direito", "Enfermagem", CAT), [],
    "texto solto não é lista");
});

test("fora do catálogo não entra, e há teto", () => {
  assert.deepEqual(normalizarCursosExtras(["Curso Inventado"], "Enfermagem", CAT), []);
  // sem catálogo, aceita — é o que permite chamar sem carregar a lista
  assert.deepEqual(normalizarCursosExtras(["Curso Inventado"], "Enfermagem", []),
    ["Curso Inventado"]);
  const muitos = CAT.filter((c) => c !== "Enfermagem");
  assert.equal(normalizarCursosExtras(muitos, "Enfermagem", CAT).length, MAX_CURSOS_EXTRAS);
});

test("a leitura junta os dois, com o principal à frente", () => {
  const a = { curso: "Engenharia Mecânica", cursosExtras: ["Engenharia Civil"] };
  assert.deepEqual(cursosDaAcao(a), ["Engenharia Mecânica", "Engenharia Civil"]);
  assert.equal(cursosEmTexto(a), "Engenharia Mecânica e Engenharia Civil");
  assert.equal(cursosEmTexto({ curso: "Enfermagem" }), "Enfermagem");
  assert.equal(cursosEmTexto({}), "");
  assert.equal(cursosEmTexto({ curso: "A", cursosExtras: ["B", "C"] }), "A, B e C");
  // ação antiga, sem o campo, continua legível
  assert.deepEqual(cursosDaAcao({ curso: "Direito" }), ["Direito"]);
});

test("o filtro por curso acha a ação pelos DOIS lados", () => {
  const a = { curso: "Engenharia Mecânica", cursosExtras: ["Engenharia Civil"] };
  assert.equal(acaoDoCurso(a, "Engenharia Mecânica"), true);
  assert.equal(acaoDoCurso(a, "Engenharia Civil"), true, "sem isto o 2º curso não vê o evento dele");
  assert.equal(acaoDoCurso(a, "engenharia civil"), true);
  assert.equal(acaoDoCurso(a, "Enfermagem"), false);
  assert.equal(acaoDoCurso(a, ""), false, "curso vazio não casa com tudo");
});
