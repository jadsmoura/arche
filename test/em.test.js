/* ICEM — Iniciação Científica no Ensino Médio: o programa em que o bolsista
   ACOMPANHA projetos (e troca ao longo do ano), não pertence a eles. O que
   estes testes protegem: a trajetória que nunca se apaga, a cota 12+12 e o
   termo com a autorização do responsável — são menores de idade. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TURMAS_EM, BOLSAS_EM, turmaDe, turmaVigente, bolsaEmDe, normalizarBolsistaEM,
  projetoAtual, trocarProjeto, cotasDaTurma, faltaNoBolsistaEM, relatoriosExigidos,
  CRITERIOS_AVALIACAO_EM, ESCALA_AVALIACAO_EM, RECOMENDACAO_EM, avaliacaoEMCompleta,
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

test("os relatórios do EM: parcial e final com os 3 campos, e o legado migra para o final", () => {
  const b = normalizarBolsistaEM({ nome: "Lara", turma: "2026/2027", relatorios: { parcial: {
    situacao: "entregue", em: "2027-02-01", atividades: "Acompanhei o laboratório toda semana.",
    motivacao: "Quero ser cientista.", cursoPretendido: "Agronomia", porAluno: true,
  } } });
  assert.equal(b.relatorios.parcial.situacao, "entregue");
  assert.equal(b.relatorios.parcial.cursoPretendido, "Agronomia");
  assert.equal(b.relatorios.parcial.porAluno, true);
  assert.equal(b.relatorios.final.situacao, "pendente", "o final nasce pendente");
  // o registro antigo (um `relatorio` só, com `texto`) vira o FINAL
  const legado = normalizarBolsistaEM({ nome: "Arthur", turma: "2025/2026", relatorio: {
    situacao: "entregue", em: "2026-08-01", texto: "Acompanhei o projeto e aprendi.", porAluno: true,
  } });
  assert.equal(legado.relatorios.final.situacao, "entregue");
  assert.equal(legado.relatorios.final.atividades, "Acompanhei o projeto e aprendi.");
  assert.equal(legado.relatorios.parcial.situacao, "pendente");
  // a validação é da PROPPEX: o carimbo mora no próprio relatório
  const validado = normalizarBolsistaEM({ nome: "Theo", turma: "2025/2026", relatorios: { final: {
    situacao: "validado", atividades: "x", validadoPor: "gestor@uniego.edu.br", validadoEm: "2026-08-20",
  } } });
  assert.equal(validado.relatorios.final.situacao, "validado");
  assert.equal(validado.relatorios.final.validadoPor, "gestor@uniego.edu.br");
  // turma vigente entrega os dois; encerrada, só o final
  assert.deepEqual(relatoriosExigidos(turmaDe("2026/2027")), ["parcial", "final"]);
  assert.deepEqual(relatoriosExigidos(turmaDe("2025/2026")), ["final"]);
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

test("a avaliação do programa acompanha o relatório: 7 perguntas 0–5 + recomendação", () => {
  assert.equal(CRITERIOS_AVALIACAO_EM.length, 7);
  assert.equal(ESCALA_AVALIACAO_EM.length, 6, "0 a 5 — o zero é 'não se aplica'");
  assert.deepEqual(RECOMENDACAO_EM.map((x) => x.codigo), ["sim", "nao", "em-partes"]);

  const todas = Object.fromEntries(CRITERIOS_AVALIACAO_EM.map((c) => [c.codigo, 4]));
  const b = normalizarBolsistaEM({ nome: "Theo", turma: "2026/2027", relatorios: { final: {
    situacao: "entregue", atividades: "x", porAluno: true,
    avaliacao: { criterios: { ...todas, metodo: 0 }, recomendaria: "em-partes",
      aprendizado: "As coletas de campo", sugestoes: "Mais visitas aos laboratórios" },
  } } });
  const a = b.relatorios.final.avaliacao;
  assert.equal(a.criterios.metodo, 0, "o zero é resposta, não ausência");
  assert.equal(a.recomendaria, "em-partes");
  assert.equal(a.aprendizado, "As coletas de campo");
  assert.ok(avaliacaoEMCompleta(a));

  // faltando uma pergunta ou a recomendação, o questionário não fecha
  const { metodo, ...seisRespostas } = todas;
  assert.ok(!avaliacaoEMCompleta({ criterios: seisRespostas, recomendaria: "sim" }));
  assert.ok(!avaliacaoEMCompleta({ criterios: todas, recomendaria: "" }));
  // valor fora da escala é descartado na normalização
  const ruim = normalizarBolsistaEM({ nome: "T", turma: "2026/2027", relatorios: { final: {
    avaliacao: { criterios: { metodo: 9, escola: 3 }, recomendaria: "talvez" },
  } } }).relatorios.final.avaliacao;
  assert.equal(ruim.criterios.metodo, undefined);
  assert.equal(ruim.criterios.escola, 3);
  assert.equal(ruim.recomendaria, "", "recomendação fora da lista não entra");
});

/* ---------- PEDIDO DE ALTERAÇÃO DE PROJETO (ago/2026) --------------------
   A primeira escolha é do estudante; a TROCA passa pela PROPPEX. O registro
   guarda os pedidos — inclusive os recusados, que são o que explica depois
   por que a trajetória não mudou. */
test("o registro guarda os pedidos de alteração, com a decisão", () => {
  const b = normalizarBolsistaEM({
    nome: "Lara", turma: "2026/2027", email: "lara@escola.com",
    pedidosProjeto: [
      { projetoId: "p1", numero: "IC-2026-004", titulo: "Clínica-escola",
        motivo: "Quero conhecer a odontologia.", situacao: "pendente" },
      { projetoId: "p2", numero: "IC-2026-009", titulo: "Outro",
        situacao: "recusado", decisao: { por: "coord@uniego.edu.br", parecer: "Fora do perfil." } },
    ],
  });
  assert.equal(b.pedidosProjeto.length, 2);
  assert.equal(b.pedidosProjeto[0].situacao, "pendente");
  assert.equal(b.pedidosProjeto[1].decisao.parecer, "Fora do perfil.");
  assert.ok(b.pedidosProjeto[0].id, "o pedido nasce com id");
});

test("pedido sem projeto não entra, e situação desconhecida vira pendente", () => {
  const b = normalizarBolsistaEM({
    nome: "Lara", turma: "2026/2027",
    pedidosProjeto: [{ motivo: "sem projeto" }, { projetoId: "p3", situacao: "inventada" }],
  });
  assert.equal(b.pedidosProjeto.length, 1);
  assert.equal(b.pedidosProjeto[0].situacao, "pendente");
});

test("aprovar a troca fecha o acompanhamento anterior e abre o novo", () => {
  const hoje = "2026-09-10";
  const antes = normalizarBolsistaEM({
    nome: "Lara", turma: "2026/2027",
    trajetoria: [{ projetoId: "p1", numero: "IC-2026-001", titulo: "Primeiro", de: "2026-09-01", ate: "" }],
  });
  const depois = trocarProjeto(antes, { projetoId: "p9", numero: "IC-2026-004", titulo: "Novo" }, { hoje });
  assert.equal(depois.trajetoria.length, 2);
  assert.equal(depois.trajetoria[0].ate, hoje, "o anterior fecha na data da decisão");
  assert.equal(depois.trajetoria[1].ate, "", "o novo fica em curso");
  assert.equal(depois.trajetoria[1].numero, "IC-2026-004");
});
