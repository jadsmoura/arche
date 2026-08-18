/* Curricularização da Extensão: o vínculo da ação com o componente curricular
   (lib/curricularizacao.js) — o que o avaliador do MEC pede para comprovar os
   10% de extensão na matriz. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PERIODOS, rotuloPeriodo, normalizarCurricularizacao, faltaNaCurricularizacao,
  chCurricularizada, academicosCurricularizados, ehCurricularizada, panoramaCurricularizacao,
} from "../lib/curricularizacao.js";

const comp = (x) => ({ disciplina: "Saúde Coletiva", periodo: "5", cargaHoraria: 20, academicos: 40, ...x });

test("sem vínculo, o bloco não guarda disciplina nenhuma", () => {
  const c = normalizarCurricularizacao({ vinculada: false, componentes: [comp()], integracao: "texto" });
  assert.deepEqual(c, { vinculada: false, componentes: [], integracao: "" });
  // desmarcar deixaria horas fantasmas no relatório do curso
  assert.equal(chCurricularizada(c), 0);
});

test("linha sem disciplina não é vínculo, e o período tem de ser do catálogo", () => {
  const c = normalizarCurricularizacao({
    vinculada: true,
    componentes: [comp(), { disciplina: "", cargaHoraria: 30 }, comp({ periodo: "13º" })],
  });
  assert.equal(c.componentes.length, 2);
  assert.equal(c.componentes[1].periodo, "", "período fora do catálogo não entra");
  assert.equal(rotuloPeriodo("5"), "5º período");
  assert.equal(rotuloPeriodo("varios"), "Vários períodos");
  assert.ok(PERIODOS.every((p) => p.codigo && p.rotulo));
});

test("carga horária e acadêmicos são inteiros positivos, e somam", () => {
  const c = normalizarCurricularizacao({
    vinculada: true,
    componentes: [comp({ cargaHoraria: "20", academicos: "40" }),
      comp({ disciplina: "Estágio", cargaHoraria: -5, academicos: "12,4" })],
  });
  assert.equal(c.componentes[1].cargaHoraria, 0, "hora negativa não é hora");
  assert.equal(chCurricularizada(c), 20);
  assert.equal(academicosCurricularizados(c), 52);
});

test("o que falta é aviso, disciplina a disciplina — e ação não vinculada nada deve", () => {
  assert.deepEqual(faltaNaCurricularizacao({ vinculada: false }), []);
  assert.match(faltaNaCurricularizacao({ vinculada: true, componentes: [] })[0], /disciplina/);
  const falta = faltaNaCurricularizacao({
    vinculada: true,
    componentes: [comp(), comp({ disciplina: "Estágio", periodo: "", cargaHoraria: 0 })],
  });
  assert.equal(falta.length, 2);
  assert.ok(falta.every((f) => f.includes("2ª disciplina")), "o aviso diz QUAL linha está pela metade");
});

test("o panorama só conta o que comprova: aprovada, relatório entregue ou registrada", () => {
  const acao = (id, status, extra = {}) => ({
    id, status, curso: "Enfermagem",
    proposta: { periodoFim: "2026-06-30", curricularizacao: { vinculada: true, componentes: [comp()] }, ...extra },
  });
  const quadro = panoramaCurricularizacao([
    acao("a", "aprovada"), acao("b", "registrada"), acao("c", "submetida"), acao("d", "devolvida"),
    { id: "e", status: "aprovada", curso: "Enfermagem", proposta: { periodoFim: "2026-06-30" } },
  ]);
  assert.equal(quadro.length, 1);
  assert.equal(quadro[0].curso, "Enfermagem");
  assert.equal(quadro[0].acoes, 2, "só as duas que comprovam");
  assert.equal(quadro[0].horas, 40);
  assert.equal(quadro[0].disciplinas[0].disciplina, "Saúde Coletiva");
  assert.equal(ehCurricularizada(acao("a", "aprovada")), true);
});

test("o curso da disciplina pode ser outro; sem ele, vale o da ação", () => {
  const acoes = [{
    id: "x", status: "aprovada", curso: "Enfermagem",
    proposta: { periodoFim: "2026-06-30", curricularizacao: { vinculada: true,
      componentes: [comp(), comp({ disciplina: "Nutrição Aplicada", curso: "Psicologia", cargaHoraria: 10 })] } },
  }];
  const quadro = panoramaCurricularizacao(acoes);
  assert.deepEqual(quadro.map((q) => q.curso).sort(), ["Enfermagem", "Psicologia"]);
});

test("o filtro por ano olha o encerramento da ação — é o ciclo que a PROPPEX fecha", () => {
  const acoes = [
    { id: "1", status: "aprovada", curso: "Direito", proposta: { periodoFim: "2025-11-30", curricularizacao: { vinculada: true, componentes: [comp()] } } },
    { id: "2", status: "aprovada", curso: "Direito", proposta: { periodoFim: "2026-05-30", curricularizacao: { vinculada: true, componentes: [comp()] } } },
  ];
  assert.equal(panoramaCurricularizacao(acoes, { ano: 2026 })[0].acoes, 1);
  assert.equal(panoramaCurricularizacao(acoes).length, 1);
  assert.equal(panoramaCurricularizacao(acoes)[0].horas, 40);
});
