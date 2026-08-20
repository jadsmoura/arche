/* O rascunho do relatório a partir do que a ação já guarda.
   O que se protege aqui: a sugestão NÃO sobrescreve o que a pessoa
   escreveu, NUNCA preenche a avaliação/resultados (é juízo de quem
   conduziu a ação) e diz de onde veio cada número — número sugerido que
   ninguém sabe explicar é pior que campo vazio. */
import test from "node:test";
import assert from "node:assert/strict";
import { sugestaoDoEvento, aplicarSugestao } from "../lib/relatorioEx.js";

const acao = (extra = {}) => ({
  id: "ext-1", numeroAcao: "EXT-2026-006", curso: "Engenharia de Software",
  proposta: { nomeAtividade: "Aula Inaugural", programacao: "Fala de abertura e mesa-redonda." },
  participantes: {
    inscritos: Array.from({ length: 57 }, (_, i) => ({ nome: `Aluno ${i}` })),
    palestrantes: [{ nome: "Dra. Clara" }],
    comissao: [
      { nome: "Prof. Davi", papel: "coordenacao" },
      { nome: "Prof.ª Eva", papel: "professor" },
      { nome: "Téc. Iara", papel: "apoio" },
      { nome: "Aluno João", papel: "aluno" },
    ],
  },
  evento: {
    programacao: [
      { id: "aaaa0002", titulo: "Mesa-redonda", dia: "2026-08-19", horaInicio: "20:00", horaFim: "21:30", ch: "1.5", local: "Auditório" },
      { id: "aaaa0001", titulo: "Abertura", dia: "2026-08-19", horaInicio: "19:00", horaFim: "20:00", ch: "1", responsavel: "Dra. Clara", local: "Auditório" },
    ],
  },
  ...extra,
});

test("o conteúdo programático sai da programação, em ordem de horário", () => {
  const { campos, de } = sugestaoDoEvento(acao());
  const linhas = campos.conteudoProgramatico.split("\n");
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /^19\/08\/2026, 19:00–20:00 — Abertura \(Dra\. Clara · Auditório · 1h\)$/,
    "a primeira é a das 19h, não a que veio primeiro na lista");
  assert.match(linhas[1], /Mesa-redonda/);
  assert.equal(de.conteudoProgramatico, "programação do evento");
});

test("sem programação lançada, vale a que a proposta declarou", () => {
  const a = acao({ evento: {} });
  const { campos, de } = sugestaoDoEvento(a);
  assert.equal(campos.conteudoProgramatico, "Fala de abertura e mesa-redonda.");
  assert.equal(de.conteudoProgramatico, "programação declarada na proposta");
  // sem nenhuma das duas, o campo não é sugerido — melhor vazio que inventado
  const nada = sugestaoDoEvento({ ...a, proposta: { nomeAtividade: "X" } });
  assert.equal(nada.campos.conteudoProgramatico, undefined);
});

test("docentes: palestrantes e a comissão DOCENTE — aluno e apoio ficam fora", () => {
  const { campos } = sugestaoDoEvento(acao());
  assert.deepEqual(campos.docentesEnvolvidos.split("\n"), ["Dra. Clara", "Prof. Davi", "Prof.ª Eva"]);
  assert.equal(campos.qtdDocentes, "3");
  assert.equal(campos.qtdTecnicos, "1", "só o apoio técnico");
});

test("a contagem de discentes diz QUAL número é, e não devolve zero à toa", () => {
  // 57 inscritos e nenhum crachá lido: dizer "0 discentes" seria trocar um
  // campo vazio por um número errado
  const semCheckin = sugestaoDoEvento(acao());
  assert.equal(semCheckin.campos.qtdDiscentes, "57");
  assert.match(semCheckin.de.qtdDiscentes, /não houve credenciamento/);

  const a = acao();
  a.participantes.inscritos[0].presente = true;
  a.participantes.inscritos[1].presencas = [{ atividade: "aaaa0001" }];
  const comCheckin = sugestaoDoEvento(a);
  assert.equal(comCheckin.campos.qtdDiscentes, "2", "havendo presença, é ela que vale");
  assert.equal(comCheckin.de.qtdDiscentes, "presentes credenciados");
});

test("a avaliação/resultados NUNCA vem pronta", () => {
  const { campos } = sugestaoDoEvento(acao());
  assert.equal(campos.avaliacaoResultados, undefined);
  assert.equal(aplicarSugestao(acao(), {}).campos.avaliacaoResultados, undefined);
});

test("aplicar não sobrescreve o que a pessoa escreveu", () => {
  const meu = { conteudoProgramatico: "escrevi à mão", qtdDiscentes: "40" };
  const { campos, de } = aplicarSugestao(acao(), meu);
  assert.equal(campos.conteudoProgramatico, undefined, "campo preenchido não é tocado");
  assert.equal(campos.qtdDiscentes, undefined);
  assert.equal(campos.docentesEnvolvidos, "Dra. Clara\nProf. Davi\nProf.ª Eva", "o vazio, sim");
  assert.ok(de.docentesEnvolvidos, "a origem acompanha só o que foi sugerido");
  // nada a sugerir devolve vazio: a tela não promete o que não vai fazer
  const tudoCheio = aplicarSugestao(acao(), {
    conteudoProgramatico: "x", docentesEnvolvidos: "y", qtdDiscentes: "1",
    qtdDocentes: "1", qtdTecnicos: "1" });
  assert.deepEqual(tudoCheio.campos, {});
});

test("ação sem evento e sem participantes não sugere nada", () => {
  assert.deepEqual(sugestaoDoEvento({ id: "x", proposta: {} }).campos, {});
  assert.deepEqual(sugestaoDoEvento(null).campos, {});
});
