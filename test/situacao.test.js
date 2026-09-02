import { test } from "node:test";
import assert from "node:assert/strict";
import { situacaoDaAcao, temRelatorioNoCiclo, relatorioPendente, ETAPAS } from "../lib/situacao.js";

const HOJE = "2026-08-21";

// uma ação de evento no shape do ARCHÉ EX, com o projeto completo
const evento = (extra = {}, prop = {}) => ({
  id: "a1", curso: "Enfermagem", status: "aprovada", numeroAcao: "EXT-2026-010",
  proposta: {
    nomeAtividade: "Semana de Enfermagem", periodoInicio: "2026-08-01", periodoFim: "2026-08-10",
    cargaHoraria: "20", publicoAlvo: "Acadêmicos", local: "Auditório", municipio: "Goianésia",
    justificativa: "x", objetivoGeral: "x", objetivosEspecificos: "x", metodologia: "x",
    respNome: "Ana", respCargo: "Professora", respTelefone: "62999", respEmail: "ana@uniego.edu.br",
    ...prop,
  },
  evento: { ativo: true, slug: "semana", encerramento: { status: "aberto" } },
  ...extra,
});

test("projeto incompleto do assistente fica EM PREENCHIMENTO, e diz o que falta", () => {
  const a = evento({ numeroAcao: "" }, { metodologia: "", local: "" });
  const s = situacaoDaAcao(a, HOJE);
  assert.equal(s.etapa, "preenchimento");
  assert.equal(s.rotulo, "Em preenchimento");
  assert.deepEqual(s.falta.sort(), ["local", "metodologia"]);
  assert.equal(s.relatorioNoCiclo, false);
});

test("projeto completo e sem número: aguardando validação — e a publicação é OUTRO eixo", () => {
  const a = evento({ numeroAcao: "" });
  a.evento.ativo = false;
  const s = situacaoDaAcao(a, HOJE);
  assert.equal(s.etapa, "aguardando-validacao");
  assert.equal(s.rotuloCompleto, "Aguardando validação e não publicado");
  assert.equal(s.publicacao, "nao-publicado");
});

test("validado e publicado são leituras que convivem", () => {
  const a = evento({}, { periodoInicio: "2026-09-01", periodoFim: "2026-09-05" });
  assert.equal(situacaoDaAcao(a, HOJE).rotuloCompleto, "Validado e publicado");
  a.evento.ativo = false;
  assert.equal(situacaoDaAcao(a, HOJE).rotuloCompleto, "Validado e não publicado");
});

test("devolvida volta ao preenchimento, com o motivo a corrigir", () => {
  const s = situacaoDaAcao(evento({ numeroAcao: "", status: "devolvida" }), HOJE);
  assert.equal(s.etapa, "preenchimento");
  assert.equal(s.rotulo, "Devolvida para ajustes");
});

test("dentro do período o evento está EM ANDAMENTO; antes dele, a realizar", () => {
  const dentro = evento({}, { periodoInicio: "2026-08-15", periodoFim: "2026-08-30" });
  assert.equal(situacaoDaAcao(dentro, HOJE).rotulo, "Evento em andamento");
  const antes = evento({}, { periodoInicio: "2026-09-01", periodoFim: "2026-09-05" });
  assert.equal(situacaoDaAcao(antes, HOJE).rotulo, "Validado");
  assert.match(situacaoDaAcao(antes, HOJE).detalhe, /01\/09\/2026/);
});

test("período vencido sem encerrar: AGUARDANDO ENCERRAMENTO", () => {
  const s = situacaoDaAcao(evento(), HOJE);
  assert.equal(s.etapa, "aguardando-encerramento");
  assert.equal(s.rotulo, "Evento aguardando encerramento");
  assert.equal(s.relatorioPendente, true);
  assert.equal(s.certificados, false);
});

test("encerramento solicitado: aguardando validação — e o relatório JÁ está na guia", () => {
  const a = evento({ status: "relatorio-entregue", relatorio: { entregueEm: "2026-08-11T12:00:00Z" } });
  a.evento.encerramento = { status: "solicitado" };
  const s = situacaoDaAcao(a, HOJE);
  assert.equal(s.etapa, "encerramento-em-validacao");
  // diz O QUE espera validação: "Aguardando validação" sozinho é o rótulo da
  // PROPOSTA, na outra ponta do processo (ver o teste da ambiguidade abaixo)
  assert.equal(s.rotulo, "Encerramento aguardando validação");
  assert.equal(s.relatorioNoCiclo, true);
  assert.equal(s.relatorioPendente, false);
});

test("encerramento devolvido volta a pedir o encerramento", () => {
  const a = evento({ status: "relatorio-entregue", relatorio: { entregueEm: "2026-08-11T12:00:00Z" } });
  a.evento.encerramento = { status: "devolvido" };
  assert.equal(situacaoDaAcao(a, HOJE).etapa, "aguardando-encerramento");
});

test("validado o encerramento, o evento está ENCERRADO com certificados emitidos", () => {
  const a = evento({ status: "registrada", relatorio: { entregueEm: "2026-08-11T12:00:00Z" } });
  a.evento.encerramento = { status: "validado" };
  const s = situacaoDaAcao(a, HOJE);
  assert.equal(s.etapa, "encerrado");
  assert.equal(s.rotulo, "Evento validado e certificados emitidos");
  assert.equal(s.certificados, true);
  // o rótulo da etapa já tem um "e": o separador do outro eixo vira ponto
  assert.equal(s.rotuloCompleto, "Evento validado e certificados emitidos · publicado");
  // o achado do dono: encerrado, ele CONTINUA na guia Relatórios — é lá que
  // o documento mora, e sumir dela justamente quando ele passa a existir é
  // o que fazia o evento encerrado parecer perdido
  assert.equal(temRelatorioNoCiclo(a, HOJE), true);
  assert.equal(relatorioPendente(a, HOJE), false);
});

test("ação SEM evento sobe o mesmo degrau, com os atos dela", () => {
  const base = { numeroAcao: "EXT-2026-001", status: "aprovada", curso: "Direito",
    proposta: { periodoInicio: "2026-08-01", periodoFim: "2026-08-10" } };
  assert.equal(situacaoDaAcao(base, HOJE).rotulo, "Aguardando relatório final");
  assert.equal(situacaoDaAcao(base, HOJE).publicacao, null);
  assert.equal(situacaoDaAcao(base, HOJE).rotuloCompleto, "Aguardando relatório final");

  const entregue = { ...base, status: "relatorio-entregue", relatorio: { entregueEm: "2026-08-12T00:00:00Z" } };
  assert.equal(situacaoDaAcao(entregue, HOJE).etapa, "encerramento-em-validacao");

  const registrada = { ...entregue, status: "registrada" };
  const s = situacaoDaAcao(registrada, HOJE);
  assert.equal(s.etapa, "encerrado");
  assert.equal(s.rotulo, "Registrada e certificados emitidos");
  assert.equal(s.certificados, true);
});

test("o correlato em Relatórios abre na VALIDAÇÃO, mesmo antes do período (decisão do dono, ago/2026)", () => {
  const a = evento({}, { periodoInicio: "2026-09-01", periodoFim: "2026-09-05" });
  assert.equal(temRelatorioNoCiclo(a, HOJE), true);
  const começou = evento({}, { periodoInicio: "2026-08-15", periodoFim: "2026-08-30" });
  assert.equal(temRelatorioNoCiclo(começou, HOJE), true);
  // o que ainda ESPERA validação continua fora
  const semNumero = evento({ numeroAcao: "" });
  assert.equal(temRelatorioNoCiclo(semNumero, HOJE), false);
});

test("reprovada é fim de linha: etapa própria, fora da guia Relatórios e de toda fila", () => {
  const a = evento({ numeroAcao: "", status: "reprovada" });
  const s = situacaoDaAcao(a, HOJE);
  assert.equal(s.etapa, "reprovada");
  assert.equal(s.rotulo, "Reprovada");
  assert.equal(s.relatorioNoCiclo, false);
  assert.equal(s.relatorioPendente, false);
  assert.equal(s.certificados, false);
});

test("toda etapa devolvida está no catálogo", () => {
  const casos = [
    evento({ numeroAcao: "" }, { metodologia: "" }), evento({ numeroAcao: "" }), evento(),
    evento({}, { periodoInicio: "2026-09-01", periodoFim: "2026-09-05" }),
    evento({ numeroAcao: "", status: "reprovada" }),
  ];
  for (const a of casos) assert.ok(ETAPAS.includes(situacaoDaAcao(a, HOJE).etapa));
});

/* ------------- DOIS MOMENTOS NÃO PODEM TER O MESMO NOME ------------------
   Achado do dono (ago/2026): "tantos ícones e etapas que estavam em versões
   anteriores e que ficaram que deixa tudo tão confuso". O caso mais caro era
   o selo "Aguardando validação", que saía IGUAL para a proposta esperando
   aprovação e para o relatório esperando encerramento — dois atos de pontas
   opostas do processo, lidos pela PROPPEX para decidir o que fazer. */
test("a proposta e o relatório NÃO compartilham o rótulo de espera", () => {
  const proposta = situacaoDaAcao({ proposta: {} }, HOJE);
  const semEvento = situacaoDaAcao({
    numeroAcao: "EXT-2026-001", status: "relatorio-entregue",
    proposta: { periodoInicio: "2026-01-01", periodoFim: "2026-02-01" },
    relatorio: { entregueEm: "2026-02-05T12:00:00Z" },
  }, HOJE);
  assert.equal(proposta.etapa, "aguardando-validacao");
  assert.equal(proposta.rotulo, "Aguardando validação");
  assert.equal(semEvento.etapa, "encerramento-em-validacao");
  assert.notEqual(semEvento.rotulo, proposta.rotulo);
  assert.equal(semEvento.rotulo, "Relatório aguardando validação");
});

test("nenhum rótulo se repete entre etapas diferentes", () => {
  const casos = [
    ["preenchimento", { proposta: {} , evento: { slug: "x" } }],
    ["aguardando-validacao", { proposta: {} }],
    ["validado", { numeroAcao: "X", proposta: { periodoInicio: "2026-01-01", periodoFim: "2027-01-01" } }],
    ["aguardando-encerramento", { numeroAcao: "X", proposta: { periodoInicio: "2026-01-01", periodoFim: "2026-02-01" } }],
    ["encerramento-em-validacao", { numeroAcao: "X", status: "relatorio-entregue",
      proposta: { periodoInicio: "2026-01-01", periodoFim: "2026-02-01" },
      relatorio: { entregueEm: "2026-02-05T12:00:00Z" } }],
    ["encerrado", { numeroAcao: "X", status: "registrada",
      proposta: { periodoInicio: "2026-01-01", periodoFim: "2026-02-01" } }],
  ];
  const porRotulo = new Map();
  for (const [esperada, acao] of casos) {
    const s = situacaoDaAcao(acao, HOJE);
    assert.equal(s.etapa, esperada, `${esperada}: a montagem do caso mudou`);
    const antes = porRotulo.get(s.rotulo);
    assert.equal(antes, undefined,
      `"${s.rotulo}" serve a duas etapas: ${antes} e ${s.etapa}`);
    porRotulo.set(s.rotulo, s.etapa);
  }
});
