/* ICEM — Iniciação Científica no Ensino Médio: o programa em que o bolsista
   ACOMPANHA projetos (e troca ao longo do ano), não pertence a eles. O que
   estes testes protegem: a trajetória que nunca se apaga, a cota 12+12 e o
   termo com a autorização do responsável — são menores de idade. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TURMAS_EM, BOLSAS_EM, turmaDe, turmaVigente, bolsaEmDe, normalizarBolsistaEM,
  projetoAtual, trocarProjeto, cotasDaTurma, faltaNoBolsistaEM,
} from "../lib/em.js";
import { termoDoAlunoEM, autorizacaoResponsavelEM } from "../lib/termos.js";
import { MARCAS } from "../lib/marca.js";

const INST = { ...MARCAS.uniego, cidade: "Goianésia" };

test("o catálogo do programa: turmas por edital 02/AAAA e cota 12+12", () => {
  assert.equal(turmaDe("2026/2027")?.edital, "02/2026");
  assert.equal(turmaVigente().ciclo, "2026/2027", "a turma aberta é a vigente");
  assert.ok(turmaDe("2025/2026")?.encerrada);
  assert.deepEqual(BOLSAS_EM.map((b) => [b.codigo, b.cota]),
    [["cnpq", 12], ["uniego", 12], ["voluntario", null]],
    "as pagas têm cota; o voluntário participa sem limite");
  assert.equal(bolsaEmDe("CNPQ")?.valor, 300);
  assert.equal(bolsaEmDe("uniego")?.valor, 150);
});

test("trocar de projeto fecha o trecho aberto e NUNCA apaga a trajetória", () => {
  let b = normalizarBolsistaEM({ nome: "Cristal Camargo", turma: "2026/2027" });
  assert.equal(projetoAtual(b), null);
  b = trocarProjeto(b, { projetoId: "p1", numero: "IC-2026-001", titulo: "Solos", orientador: "Rodrigo" }, { hoje: "2026-09-01" });
  assert.equal(projetoAtual(b).projetoId, "p1");
  // o aluno quis conhecer outro curso: troca em novembro
  b = trocarProjeto(b, { projetoId: "p2", numero: "IC-2026-009", titulo: "Direito civil", orientador: "Kenia" }, { hoje: "2026-11-10" });
  assert.equal(projetoAtual(b).projetoId, "p2");
  assert.equal(b.trajetoria.length, 2, "o trecho anterior fica na trajetória");
  assert.equal(b.trajetoria[0].ate, "2026-11-10", "fechado na data da troca");
  // encerrar sem novo projeto: fica sem acompanhamento, trajetória intacta
  b = trocarProjeto(b, null, { hoje: "2027-02-01" });
  assert.equal(projetoAtual(b), null);
  assert.equal(b.trajetoria.length, 2);
  // a normalização preserva a trajetória
  const renorm = normalizarBolsistaEM(b, { base: b });
  assert.equal(renorm.trajetoria.length, 2);
});

test("a cota conta por turma e ignora desligados", () => {
  const faz = (n, bolsa, extra = {}) => normalizarBolsistaEM({ nome: "A" + n, turma: "2026/2027", bolsa, ...extra });
  const lista = [
    ...Array.from({ length: 12 }, (_, i) => faz(i, "cnpq")),
    faz(90, "cnpq", { situacao: "desligado" }),           // não ocupa cota
    faz(91, "uniego"),
    normalizarBolsistaEM({ nome: "OutraTurma", turma: "2025/2026", bolsa: "cnpq" }),
  ];
  const cotas = cotasDaTurma(lista, "2026/2027");
  assert.equal(cotas.find((c) => c.codigo === "cnpq").usadas, 12);
  assert.equal(cotas.find((c) => c.codigo === "uniego").usadas, 1);
});

test("o relatório entregue pelo bolsista guarda o texto e a autoria", () => {
  const b = normalizarBolsistaEM({ nome: "Lara", turma: "2026/2027", relatorio: {
    situacao: "entregue", em: "2027-08-01", texto: "Acompanhei o projeto e aprendi.", porAluno: true,
  } });
  assert.equal(b.relatorio.situacao, "entregue");
  assert.equal(b.relatorio.texto, "Acompanhei o projeto e aprendi.");
  assert.equal(b.relatorio.porAluno, true);
  // registro da gestão (papel): sem texto, sem autoria do aluno
  const g = normalizarBolsistaEM({ nome: "Theo", turma: "2026/2027", relatorio: { situacao: "entregue" } });
  assert.equal(g.relatorio.texto, "");
  assert.equal(g.relatorio.porAluno, false);
});

test("a régua do cadastro cobra responsável e projeto — o bolsista é menor", () => {
  const falta = faltaNoBolsistaEM(normalizarBolsistaEM({ nome: "Theo", turma: "2026/2027" }));
  assert.ok(falta.includes("nome do responsável"));
  assert.ok(falta.includes("projeto acompanhado"), "ativo sem projeto é pendência");
  const ok = trocarProjeto(normalizarBolsistaEM({
    nome: "Theo", turma: "2026/2027", cpf: "52998224725", escola: "Couto Magalhães",
    telefone: "62 9", email: "t@x.com", bolsa: "cnpq", responsavel: { nome: "Maria" },
  }), { projetoId: "p1", titulo: "X" });
  assert.deepEqual(faltaNoBolsistaEM(ok), []);
});

test("o termo ICEM leva 2h semanais, os dois valores de bolsa e o anexo do responsável", () => {
  const t = termoDoAlunoEM({ inst: INST, vigencia: { inicio: "2026-09-01", fim: "2027-08-31" } });
  const s = JSON.stringify(t);
  assert.match(t.subtitulo, /ICEM/);
  assert.match(t.subtitulo, /2026\/2027/);
  assert.match(s, /2 horas semanais/);
  assert.match(s, /R\$ 300,00/); assert.match(s, /R\$ 150,00/);
  assert.match(s, /anexo 01/i, "o termo aponta a autorização");
  assert.match(s, /troca de projeto/, "a mobilidade entre projetos está no texto");
  assert.match(s, /relatório simplificado/i);
  assert.match(s, /CONINT/);
  assert.ok(!/20 horas/.test(s), "não herda a carga da graduação");

  const aut = autorizacaoResponsavelEM({ inst: INST, bolsista: {
    nome: "Cristal Camargo", escola: "Colégio Couto Magalhães",
    responsavel: { nome: "Maria Camargo", cpf: "000.000.000-00" },
    projetoTitulo: "Solos do Cerrado", orientador: "Rodrigo Souza",
  } });
  assert.match(aut.titulo, /Autorização de Pais ou Responsáveis/);
  assert.match(aut.texto, /Maria Camargo/);
  assert.match(aut.texto, /Cristal Camargo/);
  assert.match(aut.texto, /Solos do Cerrado/);
  // campo em branco vira linha para preencher à caneta — nunca 'undefined'
  const vazia = autorizacaoResponsavelEM({ inst: INST, bolsista: {} });
  assert.ok(!/undefined/.test(vazia.texto));
  assert.match(vazia.texto, /_{8,}/);
});
