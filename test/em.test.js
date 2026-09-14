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
  faltaDadosBancariosEM, faltaDoResponsavelEM, faltaDosSeusDadosEM, faltaDoEstudanteEM, desligarEM,
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
  // o Anexo 01 imprime NOME e CPF do responsável: os dois são régua (set/2026)
  assert.ok(falta.includes("CPF do responsável"));
  assert.ok(falta.includes("projeto acompanhado"), "ativo sem projeto é pendência");
  const ok = trocarProjeto(normalizarBolsistaEM({
    nome: "Theo", turma: "2026/2027", cpf: "52998224725", escola: "Couto Magalhães",
    telefone: "62 9", email: "t@x.com", bolsa: "cnpq",
    responsavel: { nome: "Maria", cpf: "11144477735" },
  }), { projetoId: "p1", titulo: "X" });
  assert.deepEqual(faltaNoBolsistaEM(ok), []);
});

test("o responsável é exigido do VOLUNTÁRIO igual — a autorização é da idade, não da bolsa", () => {
  const vol = normalizarBolsistaEM({
    nome: "Ana", turma: "2026/2027", bolsa: "voluntario",
    cpf: "11144477735", telefone: "(62) 90000-0000", escola: "Couto Magalhães",
  });
  // o voluntário não tem conta a informar…
  assert.deepEqual(faltaDadosBancariosEM(vol), []);
  // …mas tem a mesma autorização, e por isso ENTRA na cobrança do estudante
  assert.deepEqual(faltaDoResponsavelEM(vol), ["nome do responsável", "CPF do responsável"]);
  assert.deepEqual(faltaDoEstudanteEM(vol), ["nome do responsável", "CPF do responsável"]);
  const cheio = normalizarBolsistaEM({ ...vol, responsavel: { nome: "Maria", cpf: "11144477735" } });
  assert.deepEqual(faltaDoEstudanteEM(cheio), []);
});

test("o CPF do responsável que não valida NÃO passa por preenchido", () => {
  const b = normalizarBolsistaEM({ nome: "Theo", responsavel: { nome: "Maria", cpf: "11111111111" } });
  assert.equal(b.responsavel.cpf, "", "CPF inválido não entra no registro");
  assert.ok(faltaDoResponsavelEM(b).includes("CPF do responsável"),
    "e por isso continua sendo cobrado — senão o estudante salvaria achando que preencheu");
});

test("salvar o cadastro pela coordenação NÃO apaga o responsável que o estudante informou", () => {
  const base = normalizarBolsistaEM({
    id: "em_1", nome: "Theo", turma: "2026/2027",
    responsavel: { nome: "Maria Souza", cpf: "11144477735" },
  });
  // o formulário da coordenação não manda `responsavel` — e não pode zerá-lo
  const depois = normalizarBolsistaEM({ id: "em_1", nome: "Theo", escola: "Couto" }, { base });
  assert.equal(depois.responsavel.nome, "Maria Souza");
  assert.equal(depois.responsavel.cpf, "11144477735");
  // corrigir continua possível: campo preenchido vence o da base
  const corrigido = normalizarBolsistaEM({ id: "em_1", responsavel: { nome: "Maria S. Lima" } }, { base });
  assert.equal(corrigido.responsavel.nome, "Maria S. Lima");
  assert.equal(corrigido.responsavel.cpf, "11144477735", "o que não veio fica");
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

/* ---------------- A SUBSTITUIÇÃO DO BOLSISTA (set/2026) ----------------
   "Houve uma desistência e precisamos fazer a troca antes da assinatura."
   Quem sai tem de sair da pilha de termos sem apagar o registro, e a vaga
   dele — com a bolsa — tem de caber ao substituto numa cota fechada. */

test("desligar fecha o acompanhamento aberto e guarda o motivo", () => {
  const b = normalizarBolsistaEM({
    nome: "Desistente Um", turma: "2026/2027", bolsa: "cnpq",
    trajetoria: [
      { projetoId: "p1", numero: "IC-2026-001", titulo: "Antigo", de: "2026-09-01", ate: "2026-10-01" },
      { projetoId: "p2", numero: "IC-2026-002", titulo: "Vigente", de: "2026-10-02", ate: "" },
    ],
  });
  assert.equal(projetoAtual(b)?.projetoId, "p2", "antes há um acompanhamento aberto");

  const fora = desligarEM(b, { motivo: "desistiu antes da assinatura", por: "coord@uniego.edu.br",
    hoje: "2026-11-20" });
  assert.equal(fora.situacao, "desligado");
  assert.equal(fora.desligamento.motivo, "desistiu antes da assinatura");
  assert.equal(fora.desligamento.por, "coord@uniego.edu.br");
  assert.equal(projetoAtual(fora), null, "o professor deixa de estar recebendo o estudante");
  assert.equal(fora.trajetoria[1].ate, "2026-11-20", "a data de hoje diz até quando aquilo valeu");
  assert.equal(fora.trajetoria[0].ate, "2026-10-01", "o que já se encerrou não se toca");
  assert.equal(fora.trajetoria.length, 2, "a trajetória nunca se apaga");
  assert.equal(fora.bolsa, "cnpq", "a bolsa fica: ela diz qual cota a pessoa ocupava");
  assert.match(fora.historico.at(-1).oQue, /desligou da turma/);
});

test("o desligado sai das cotas — é o que faz a troca caber em 12 + 12", () => {
  const turma = "2026/2027";
  const lista = Array.from({ length: 12 }, (_, i) =>
    normalizarBolsistaEM({ nome: `Bolsista ${i + 1}`, turma, bolsa: "cnpq" }));
  assert.equal(cotasDaTurma(lista, turma).find((c) => c.codigo === "cnpq").usadas, 12,
    "a cota do CNPq está cheia");

  lista[3] = desligarEM(lista[3], { motivo: "desistiu", por: "coord@uniego.edu.br" });
  assert.equal(cotasDaTurma(lista, turma).find((c) => c.codigo === "cnpq").usadas, 11,
    "desligar devolve a vaga");

  lista.push(normalizarBolsistaEM({ nome: "Substituta Nova", turma, bolsa: "cnpq" }));
  assert.equal(cotasDaTurma(lista, turma).find((c) => c.codigo === "cnpq").usadas, 12,
    "o substituto ocupa a vaga que vagou, e não uma 13ª");
});

test("editar o cadastro não apaga o desligamento, a substituição nem os e-mails adotados", () => {
  /* Estes campos são escritos por ROTA PRÓPRIA, e o formulário do cadastro
     não os manda — sem o `base`, salvar um telefone desfazia a troca e
     devolvia o estudante ao painel vazio (a conta reconhecida pelo CPF). */
  const base = normalizarBolsistaEM({
    nome: "Quem Saiu", turma: "2026/2027", email: "escolar@escola.com",
    emails: ["pessoal@gmail.com"], emailAnterior: "antigo@escola.com",
    desligamento: { em: "2026-11-20T12:00:00.000Z", por: "coord@uniego.edu.br", motivo: "desistiu" },
    substituicao: { papel: "saiu", id: "em_x", nome: "Quem Entrou",
      em: "2026-11-20T12:00:00.000Z", por: "coord@uniego.edu.br", motivo: "desistiu" },
    situacao: "desligado",
  });
  // o formulário da coordenação manda só o que ele tem na tela
  const depois = normalizarBolsistaEM({
    id: base.id, nome: "Quem Saiu", turma: "2026/2027", telefone: "(62) 90000-0000",
  }, { base });

  assert.deepEqual(depois.emails, ["pessoal@gmail.com"], "o e-mail adotado pelo CPF fica");
  assert.equal(depois.emailAnterior, "antigo@escola.com");
  assert.equal(depois.desligamento.motivo, "desistiu");
  assert.equal(depois.substituicao.nome, "Quem Entrou");
  assert.equal(depois.telefone, "(62) 90000-0000", "o que a tela mandou entra");
});

test("quem entra aponta para quem saiu, e o e-mail do registro reconhece as duas contas", () => {
  const entrou = normalizarBolsistaEM({
    nome: "Quem Entrou", turma: "2026/2027", bolsa: "cnpq",
    substituicao: { papel: "entrou", id: "em_y", nome: "Quem Saiu",
      em: "2026-11-20T12:00:00.000Z", por: "coord@uniego.edu.br", motivo: "desistiu" },
  });
  assert.equal(entrou.substituicao.papel, "entrou");
  assert.equal(entrou.substituicao.nome, "Quem Saiu");
  assert.equal(entrou.situacao, "ativo");
  // papel desconhecido não passa: os dois lados só existem nestes dois nomes
  const estranho = normalizarBolsistaEM({ nome: "X Y", turma: "2026/2027",
    substituicao: { papel: "sei-la", id: "z", nome: "W" } });
  assert.equal(estranho.substituicao.papel, "saiu");
});

/* O FORMULÁRIO ÚNICO DO ESTUDANTE (set/2026): a régua que a tela, o e-mail e
   o selo da coordenação passaram a compartilhar. O defeito que estes testes
   guardam é o de origem — a gestão cobrar um campo que o estudante não tinha
   onde informar. */
test("o que o estudante preenche é UMA lista — e o selo da gestão conta a mesma", () => {
  // o retrato real da turma 2026/2027: veio do resultado da seleção, sem CPF
  const b = normalizarBolsistaEM({
    nome: "Lara Luísa Avelino Silva", turma: "2026/2027", bolsa: "cnpq",
    email: "lara@exemplo.com", telefone: "(62) 98476-7686", escola: "Couto Magalhães",
    serie: "3° ano",
  });
  assert.deepEqual(faltaDosSeusDadosEM(b), ["CPF"],
    "o CPF é o que falta — e era o que não tinha campo nenhum na tela dele");
  assert.deepEqual(faltaDoEstudanteEM(b), [
    "CPF", "nome do responsável", "CPF do responsável", "banco", "agência", "conta", "Pix",
  ]);
  // a lista da GESTÃO contém a do estudante: cobrar o que ele não pode
  // preencher foi exatamente o defeito que isto impede de voltar
  const daGestao = faltaNoBolsistaEM(b, { incluirProjeto: false });
  for (const x of faltaDoEstudanteEM(b).filter((y) => !y.startsWith("banco") && y !== "agência" && y !== "conta" && y !== "Pix")) {
    assert.ok(daGestao.includes(x), `a gestão cobra "${x}", e o formulário do estudante o oferece`);
  }
});

test("a série não é cobrada — nenhum documento a imprime", () => {
  const b = normalizarBolsistaEM({
    nome: "Theo Lima", turma: "2026/2027", cpf: "11144477735",
    telefone: "(62) 90000-0000", escola: "Couto Magalhães", serie: "",
    responsavel: { nome: "Maria Souza", cpf: "11144477735" },
  });
  assert.deepEqual(faltaDosSeusDadosEM(b), []);
  assert.deepEqual(faltaDoEstudanteEM(b), []);
});
