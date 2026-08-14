/* Testes do núcleo da Iniciação Científica: numeração, normalização,
   validação, quem vê o quê e os recortes do cronograma e dos relatórios.
   Nada aqui toca em rede ou armazenamento. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MODALIDADES, STATUS, CRITERIOS, numeroProjeto, proximoSequencial, numerar,
  normalizarProjeto, validarProjeto, papelNoProjeto, podeVerProjeto, podeEditarProjeto,
  podeGerirExecucao, podeAvaliar, podeEnviarRelatorio, podeValidarRelatorio,
  cronogramaDe, etapaAtrasada, relatoriosDe, relatoriosPendentes, resumir, anotar,
  podeDesignarAvaliador, podeDarParecer, ehAvaliadorDe, parecerDe, visaoDoProjeto,
  notaFinal, placarPareceres, participaDeAlgum,
} from "../lib/ic.js";

/* -------------------------------- fixtura ------------------------------- */
const PROF = { email: "renata@uniego.edu.br", gestao: false };
const ALUNO = { email: "marcos@uniego.edu.br", gestao: false };
const ALUNO2 = { email: "beatriz@uniego.edu.br", gestao: false };
const ALHEIO = { email: "alheio@uniego.edu.br", gestao: false };
const PROPPEX = { email: "proppex@uniego.edu.br", gestao: true };

function bruto(extra = {}) {
  return {
    titulo: "Micorrizas e produtividade do milho no Cerrado",
    resumo: "Investiga a relação entre colonização micorrízica e produtividade do milho em solos do Cerrado goiano. ".repeat(2),
    curso: "agronomia", modalidade: "pibic", edital: "PIBIC 01/2026",
    objetivos: "Quantificar a colonização.", justificativa: "O tema é central para a produção regional.",
    metodologia: "Blocos casualizados.", resultadosEsperados: "Índices de colonização por tratamento.",
    referencias: "MOURA, J. B. Solos do Cerrado. Goianésia, 2024.",
    orientador: { nome: "Profa. Renata", email: PROF.email, titulacao: "Doutora" },
    alunos: [{ nome: "Marcos", email: ALUNO.email, matricula: "2024001", bolsista: true }],
    cronograma: [
      { atividade: "Revisão bibliográfica", responsavel: ALUNO.email, inicio: "2026-08-01", fim: "2026-09-30" },
      { atividade: "Análise dos dados", responsavel: "", inicio: "2027-01-05", fim: "2027-03-31" },
    ],
    ...extra,
  };
}
const novo = (extra) => normalizarProjeto(bruto(extra), { autor: PROF.email });
const emExecucao = (extra) => ({ ...novo(extra), status: "aprovado", numero: "IC-2026-001" });

/* ------------------------------- numeração ------------------------------ */
test("o protocolo segue IC-ANO-SEQ e não se repete", () => {
  assert.equal(numeroProjeto({ ano: 2026, sequencial: 7 }), "IC-2026-007");
  const lista = [{ numero: "IC-2026-001", ano: 2026 }, { numero: "IC-2026-002", ano: 2026 }, { numero: "IC-2025-009", ano: 2025 }];
  assert.equal(proximoSequencial(lista, 2026), 3, "a série é por ano");
  assert.equal(proximoSequencial(lista, 2027), 1);
});

test("numerar só emite uma vez; rascunho não consome a sequência", () => {
  const p = numerar([], { ...novo(), ano: 2026 });
  assert.equal(p.numero, "IC-2026-001");
  assert.equal(numerar([p], p).numero, "IC-2026-001", "não renumera quem já tem número");
  // um rascunho sem número no meio não altera a contagem
  assert.equal(numerar([p, { ...novo(), ano: 2026 }], { ...novo(), ano: 2026 }).numero, "IC-2026-002");
});

/* ----------------------------- normalização ----------------------------- */
test("os campos de controle vêm do que está gravado, não do navegador", () => {
  const base = { ...novo(), id: "ic-1", numero: "IC-2026-001", status: "aprovado", criadoPor: PROF.email, criadoEm: "2026-01-01T00:00:00.000Z" };
  const p = normalizarProjeto(
    { ...bruto(), id: "outro", numero: "IC-2026-999", status: "concluido", criadoPor: ALHEIO.email, relatorios: [{ tipo: "final" }] },
    { base, autor: ALHEIO.email },
  );
  assert.equal(p.id, "ic-1");
  assert.equal(p.numero, "IC-2026-001", "o número não vem do formulário");
  assert.equal(p.status, "aprovado", "a situação não vem do formulário");
  assert.equal(p.criadoPor, PROF.email, "a autoria não muda");
  assert.deepEqual(p.relatorios, [], "relatório não entra pela proposta");
});

test("normalização limpa listas e aceita só valores conhecidos", () => {
  const p = normalizarProjeto(bruto({
    modalidade: "inventada",
    alunos: [{ nome: "", email: "" }, { nome: "Marcos", email: "MARCOS@Uniego.edu.BR" }],
    cronograma: [{ atividade: "", inicio: "2026-01-01" }, { atividade: "Coleta", inicio: "hoje", fim: "2026-03-01", situacao: "voando" }],
  }), { autor: PROF.email });
  assert.equal(p.modalidade, "", "modalidade desconhecida não entra");
  assert.equal(p.alunos.length, 1, "aluno vazio sai da lista");
  assert.equal(p.alunos[0].email, "marcos@uniego.edu.br", "e-mail vai para minúsculas");
  assert.equal(p.cronograma.length, 1, "atividade sem nome sai da lista");
  assert.equal(p.cronograma[0].inicio, "", "data inválida vira vazio");
  assert.equal(p.cronograma[0].situacao, "prevista");
  assert.ok(p.cronograma[0].id, "toda atividade ganha id");
});

/* ------------------------------- validação ------------------------------ */
test("projeto completo passa; rascunho incompleto é barrado na submissão", () => {
  assert.deepEqual(validarProjeto(novo()), []);
  const erros = validarProjeto(normalizarProjeto({}, { autor: PROF.email })).join(" ").toLowerCase();
  for (const t of ["título", "resumo", "curso", "orienta", "objetivos", "metodologia", "cronograma"]) {
    assert.ok(erros.includes(t), `faltou cobrar "${t}" em: ${erros}`);
  }
});

test("a validação cobra prazos coerentes e e-mail de cada aluno indicado", () => {
  const semData = novo({ cronograma: [{ atividade: "Coleta", inicio: "", fim: "" }] });
  assert.ok(validarProjeto(semData).some((e) => /início e fim/.test(e)));

  const invertido = novo({ cronograma: [{ atividade: "Coleta", inicio: "2026-10-01", fim: "2026-08-01" }] });
  assert.ok(validarProjeto(invertido).some((e) => /antes de começar/.test(e)));

  const semEmail = novo({ alunos: [{ nome: "Marcos", email: "" }] });
  assert.ok(validarProjeto(semEmail).some((e) => /e-mail/.test(e)),
    "sem e-mail o aluno nunca acessaria o próprio plano de trabalho");
});

/* ------------------------------ permissões ------------------------------ */
test("cada um tem o seu papel no projeto, e quem é de fora não vê nada", () => {
  const p = novo();
  assert.equal(papelNoProjeto(PROF, p), "orientador");
  assert.equal(papelNoProjeto(ALUNO, p), "aluno");
  assert.equal(papelNoProjeto(PROPPEX, p), "gestao");
  assert.equal(papelNoProjeto(ALHEIO, p), null);
  assert.equal(podeVerProjeto(ALHEIO, p), false);
  for (const u of [PROF, ALUNO, PROPPEX]) assert.equal(podeVerProjeto(u, p), true);
});

test("quem coordena e também orienta age como orientador no próprio projeto", () => {
  const p = novo({ orientador: { nome: "Pró-reitor", email: PROPPEX.email } });
  assert.equal(papelNoProjeto(PROPPEX, p), "orientador");
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "submetido" }), false,
    "ninguém avalia o próprio projeto");
});

test("a proposta fecha ao ser submetida; cronograma e alunos seguem com a orientação", () => {
  const rascunho = novo();
  assert.equal(podeEditarProjeto(PROF, rascunho), true);
  assert.equal(podeEditarProjeto(ALUNO, rascunho), false, "aluno não edita a proposta");

  const submetido = { ...rascunho, status: "submetido" };
  assert.equal(podeEditarProjeto(PROF, submetido), false);
  assert.equal(podeGerirExecucao(PROF, submetido), true);
  assert.equal(podeGerirExecucao(ALUNO, submetido), false);

  const devolvido = { ...rascunho, status: "devolvido" };
  assert.equal(podeEditarProjeto(PROF, devolvido), true, "devolvido volta a ser editável");
});

test("só a gestão avalia, e só projeto submetido", () => {
  const p = novo();
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "submetido" }), true);
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "aprovado" }), false, "não se reavalia o aprovado");
  assert.equal(podeAvaliar(PROF, { ...p, status: "submetido" }), false);
});

test("relatório: o aluno indicado envia, a orientação valida", () => {
  const p = emExecucao();
  assert.equal(podeEnviarRelatorio(ALUNO, p), true);
  assert.equal(podeEnviarRelatorio(PROF, p), false, "a orientação não escreve pelo aluno");
  assert.equal(podeEnviarRelatorio(ALUNO, { ...p, status: "submetido" }), false,
    "sem aprovação não há relatório");
  assert.equal(podeValidarRelatorio(PROF, p), true);
  assert.equal(podeValidarRelatorio(PROPPEX, p), true);
  assert.equal(podeValidarRelatorio(ALUNO, p), false, "ninguém valida o próprio relatório");
});

/* --------------------------- avaliação ad hoc --------------------------- */
const AD1 = { email: "ana@ufg.br", gestao: false };
const AD2 = { email: "bruno@ufg.br", gestao: false };

function emSelecao(pareceres = []) {
  return {
    ...novo(), id: "p1", numero: "IC-2026-001", status: "submetido",
    avaliacoes: [
      { email: AD1.email, nome: "Ana", situacao: "designado", notas: {}, recomendacao: "", parecer: "" },
      ...pareceres,
    ],
    historico: [
      { quando: "2026-01-01T00:00:00.000Z", quem: PROF.email, oQue: "submeteu à avaliação" },
      { quando: "2026-01-02T00:00:00.000Z", quem: PROPPEX.email, oQue: `designou ${AD1.email} como avaliador`, sigilo: true },
    ],
  };
}

test("o avaliador designado entra no projeto; quem não foi, não", () => {
  const p = emSelecao();
  assert.equal(papelNoProjeto(AD1, p), "avaliador");
  assert.equal(podeVerProjeto(AD1, p), true);
  assert.equal(papelNoProjeto(AD2, p), null);
  assert.equal(podeVerProjeto(AD2, p), false);
  assert.equal(ehAvaliadorDe(AD1, p), true);
  assert.equal(participaDeAlgum(AD1.email, [p]), true, "a designação é o que dá acesso ao setor");
  assert.equal(participaDeAlgum(AD2.email, [p]), false);
});

test("designar é da gestão; dar parecer é de quem foi designado, e só na seleção", () => {
  const p = emSelecao();
  assert.equal(podeDesignarAvaliador(PROPPEX, p), true);
  assert.equal(podeDesignarAvaliador(PROF, p), false, "a orientação não escolhe quem a avalia");

  assert.equal(podeDarParecer(AD1, p), true);
  assert.equal(podeDarParecer(AD2, p), false);
  assert.equal(podeDarParecer(PROF, p), false, "ninguém dá parecer no próprio projeto");
  assert.equal(podeDarParecer(ALUNO, p), false);
  assert.equal(podeDarParecer(AD1, { ...p, status: "aprovado" }), false, "decidido o mérito, a janela fecha");
  assert.equal(podeDarParecer(AD1, { ...p, avaliacoes: [{ email: AD1.email, situacao: "recusado" }] }), false,
    "quem recusou não volta a avaliar");
});

test("o avaliador julga a proposta, não as pessoas, e não vê o parecer do colega", () => {
  const p = emSelecao([
    { email: AD2.email, nome: "Bruno", situacao: "entregue", parecer: "Parecer do colega", recomendacao: "recomendado", notas: { merito: 9 } },
  ]);
  const vista = visaoDoProjeto(p, AD1);

  assert.equal(vista.orientador, null, "sem o nome de quem orienta");
  assert.ok(vista.alunos.every((a) => !a.email && /^Aluno \d+$/.test(a.nome)), "alunos anonimizados");
  assert.ok(vista.cronograma.every((e) => !e.responsavel), "o plano fica, o e-mail do responsável sai");
  assert.deepEqual(vista.relatorios, []);
  assert.deepEqual(vista.historico, []);
  assert.equal(vista.avaliacoes.length, 1);
  assert.equal(vista.avaliacoes[0].email, AD1.email, "só o próprio registro");
  assert.ok(!JSON.stringify(vista).includes("Parecer do colega"), "parecer alheio ancoraria o julgamento");
});

test("a orientação não sabe quem avaliou — nem pela lista, nem pelo histórico", () => {
  const p = emSelecao([{ email: AD2.email, situacao: "entregue", parecer: "x", recomendacao: "recomendado", notas: {} }]);
  for (const u of [PROF, ALUNO]) {
    const vista = visaoDoProjeto(p, u);
    assert.equal(vista.avaliacoes, undefined, "a lista de avaliadores some");
    assert.equal(vista.avaliadoresDesignados, 2, "fica só a contagem");
    assert.equal(vista.pareceresEntregues, 1);
    assert.ok(!JSON.stringify(vista).includes(AD1.email), "nenhum vestígio no histórico");
    assert.equal(vista.historico.length, 1, "a linha da designação é sigilosa");
  }
  assert.equal(visaoDoProjeto(p, PROPPEX).avaliacoes.length, 2, "a gestão vê tudo, porque decide");
});

test("a nota do projeto é a SOMA dos critérios (0 a 100); o placar faz a média", () => {
  assert.equal(notaFinal({ notas: { merito: 18, objetivos: 8, fundamentacao: 7, metodologia: 16, viabilidade: 12, formacao: 13, redacao: 9 } }), 83);
  assert.equal(notaFinal({ notas: {} }), null, "sem nota não se inventa soma");
  assert.equal(notaFinal({ notas: { merito: 20 } }), 20, "conta só o que foi preenchido");
  const cheio = Object.fromEntries(CRITERIOS.map((c) => [c.codigo, c.peso]));
  assert.equal(notaFinal({ notas: cheio }), 100, "tudo no teto fecha em 100");

  const p = emSelecao([
    { email: AD2.email, situacao: "entregue", recomendacao: "recomendado", notas: cheio },
    { email: "carla@ufg.br", situacao: "entregue", recomendacao: "nao_recomendado",
      notas: Object.fromEntries(CRITERIOS.map((c) => [c.codigo, c.peso / 2])) },
    { email: "davi@ufg.br", situacao: "recusado", notas: {} },
  ]);
  const placar = placarPareceres(p);
  assert.equal(placar.designados, 4);
  assert.equal(placar.entregues, 2);
  assert.equal(placar.recusados, 1);
  assert.equal(placar.media, 75, "média entre 100 e 50");
  assert.equal(placar.recomendam, 1);
  assert.equal(placar.contra, 1);
});

test("cada critério é limitado ao próprio teto ao normalizar o parecer", () => {
  const p = normalizarProjeto({}, { base: {
    ...emSelecao([{ email: AD2.email, situacao: "entregue", recomendacao: "recomendado",
      notas: { merito: 999, redacao: -5, objetivos: 7 } }]),
  } });
  const a = p.avaliacoes.find((x) => x.email === AD2.email);
  assert.equal(a.notas.merito, 20, "acima do teto, vale o teto do critério");
  assert.equal(a.notas.redacao, 0, "nota não fica negativa");
  assert.equal(a.notas.objetivos, 7);
});

test("a nota atribuída pela coordenação vale como nota do projeto na classificação", () => {
  const comNota = { ...emSelecao(), producao: { "art-a1": 5 },
    notaDireta: { valor: 82, por: PROPPEX.email, em: "2026-08-14T12:00:00Z", observacao: "" } };
  const r = resumir(comNota, PROPPEX);
  assert.equal(r.classificacao.np, 82, "a nota direta substitui a média dos pareceres");
  assert.equal(r.classificacao.cl, 20, "5 artigos A1 = 20 pontos absolutos");
  assert.equal(r.classificacao.total, 102);
  assert.deepEqual(r.notaDireta.valor, 82, "a gestão vê quem atribuiu e quando");

  assert.equal(resumir(comNota, PROF).notaDireta, undefined, "a orientação não recebe a nota crua");
  assert.equal(visaoDoProjeto(comNota, PROF).notaDireta, undefined);
  const av = { email: AD1.email, gestao: false };
  assert.equal(visaoDoProjeto({ ...comNota, avaliacoes: [{ email: AD1.email, situacao: "designado", notas: {} }] }, av).notaDireta,
    undefined, "o avaliador não vê a nota da coordenação — ancoraria o parecer");

  // sem nota direta e sem parecer, segue sem classificação
  assert.equal(resumir({ ...emSelecao(), producao: { "art-a1": 5 } }, PROPPEX).classificacao.total, null,
    "currículo sozinho não fecha nota final");
  // a nota direta não entra pelo formulário
  const editado = normalizarProjeto({ notaDireta: { valor: 100, por: "invasor@x.br" } }, { base: emSelecao() });
  assert.equal(editado.notaDireta, undefined);
});

test("o parecer ad hoc não vem do formulário do projeto", () => {
  const base = emSelecao();
  const p = normalizarProjeto({ ...bruto(), avaliacoes: [{ email: "invasor@x.br", situacao: "entregue" }] },
    { base, autor: PROF.email });
  assert.equal(p.avaliacoes.length, 1);
  assert.equal(p.avaliacoes[0].email, AD1.email, "a lista de avaliadores só muda pelas rotas próprias");
});

test("quem coordena e foi designado avaliador continua coordenando", () => {
  const p = { ...emSelecao(), avaliacoes: [{ email: PROPPEX.email, situacao: "designado", notas: {} }] };
  assert.equal(papelNoProjeto(PROPPEX, p), "gestao");
  assert.equal(podeDarParecer(PROPPEX, p), true, "mas o parecer que der é dele, como qualquer outro");
  assert.ok(parecerDe(p, PROPPEX.email));
});

test("a coordenação avalia a proposta sem precisar se designar", () => {
  // O edital prevê a análise da coordenação; ela usa os mesmos quatro
  // critérios do ad hoc, e o parecer entra no placar como qualquer outro.
  const p = { ...emSelecao(), avaliacoes: [] };
  assert.equal(podeDarParecer(PROPPEX, p), true);
  assert.equal(podeDarParecer(PROF, p), false, "a orientação continua fora");
  assert.equal(podeDarParecer(ALUNO, p), false);
  assert.equal(podeDarParecer(PROPPEX, { ...p, status: "aprovado" }), false,
    "decidido o mérito, a janela fecha também para a coordenação");
  assert.equal(podeDarParecer(PROPPEX, { ...p, avaliacoes: [{ email: PROPPEX.email, situacao: "recusado" }] }), false,
    "quem recusou por impedimento não volta atrás");
});

test("a inclusão manual fica gravada e some para o avaliador", () => {
  const marca = { por: PROPPEX.email, em: "2026-06-12T12:00:00.000Z", motivo: "pedido fora do prazo deferido" };
  const base = { ...novo(), inclusaoManual: marca };
  const p = normalizarProjeto({ ...bruto(), inclusaoManual: { por: "invasor@x.br", motivo: "eu que sei" } },
    { base, autor: PROF.email });
  assert.deepEqual(p.inclusaoManual, marca, "a marca é do servidor, não do formulário");
  assert.deepEqual(resumir({ ...emSelecao(), inclusaoManual: marca }, PROPPEX).inclusaoManual, marca);
  assert.deepEqual(resumir({ ...emSelecao(), inclusaoManual: marca }, PROF).inclusaoManual, marca,
    "quem orienta sabe como o projeto entrou");
  assert.equal(resumir({ ...emSelecao(), inclusaoManual: marca }, AD1).inclusaoManual, undefined,
    "o avaliador julga a proposta, não como ela entrou");
});

test("a visão do avaliador não desanonimiza a proposta por campo nenhum", () => {
  // criadoPor e origem trazem o e-mail de quem orienta; a inclusão manual
  // conta como o projeto entrou. Nada disso é assunto do parecer.
  const p = {
    ...emSelecao(), criadoPor: PROF.email,
    origem: { lote: "edital-01-2026", id: "form-9", emailFormulario: PROF.email },
    inclusaoManual: { por: PROPPEX.email, motivo: "deferido fora do prazo" },
    notaDireta: { valor: 90, por: PROPPEX.email, em: "2026-08-14T12:00:00Z" },
  };
  const vista = visaoDoProjeto(p, AD1);
  for (const campo of ["criadoPor", "origem", "inclusaoManual", "notaDireta", "orientador"])
    assert.ok(vista[campo] == null, `${campo} não pode chegar ao avaliador`);
  assert.ok(!JSON.stringify(vista).includes(PROF.email), "nenhum campo carrega o e-mail da orientação");
});

test("a classificação sai pela bandeira de gestão, mesmo no projeto que o gestor orienta", () => {
  // O pró-reitor pode ter projeto próprio no edital: nele o papel é
  // "orientador", mas a nota agregada precisa aparecer no resultado.
  const meuProprio = {
    ...emSelecao(), orientador: { nome: "Pró-Reitor", email: PROPPEX.email, titulacao: "Doutor" },
    producao: { "art-a1": 5 }, notaDireta: { valor: 80, por: "colega@uniego.edu.br", em: "2026-08-14T12:00:00Z" },
  };
  const r = resumir(meuProprio, PROPPEX);
  assert.equal(r.papel, "orientador");
  assert.equal(r.classificacao.total, 100, "80 + 20 do currículo, apesar do papel");
  assert.equal(r.notaDireta, undefined, "o cru da nota continua fora do papel de orientador");
  assert.equal(resumir(meuProprio, PROF).classificacao, undefined, "professor comum segue sem o campo");
});

test("o avaliador não acompanha a execução de projeto alheio", () => {
  const p = { ...emSelecao(), status: "aprovado", relatorios: [{ id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "enviado" }] };
  assert.deepEqual(cronogramaDe([p], AD1), [], "cronograma é da execução, não da seleção");
  assert.deepEqual(relatoriosDe([p], AD1), []);
});

test("ver como outra pessoa é a visão dela, não uma versão enfeitada dela", () => {
  // A coordenação simula trocando apenas a identidade da leitura; tudo o mais
  // — papel, visibilidade e sigilo — sai das mesmas funções. É o que garante
  // que a simulação não minta sobre o que a pessoa enxerga.
  const p = emSelecao([{ email: AD2.email, situacao: "entregue", parecer: "sigiloso", recomendacao: "recomendado", notas: {} }]);
  const simulando = (quem) => ({ email: quem.email, cpf: quem.cpf || "", gestao: false });

  const comoOrientador = visaoDoProjeto(p, simulando(PROF));
  assert.deepEqual(comoOrientador, visaoDoProjeto(p, PROF), "idêntica à visão real da orientação");
  assert.equal(comoOrientador.avaliacoes, undefined, "a coordenação, simulando, também deixa de ver quem avaliou");
  assert.ok(!JSON.stringify(comoOrientador).includes("sigiloso"));

  const comoAvaliador = visaoDoProjeto(p, simulando(AD1));
  assert.deepEqual(comoAvaliador, visaoDoProjeto(p, AD1));
  assert.equal(comoAvaliador.orientador, null, "e vê a proposta sem os nomes, como o avaliador vê");

  assert.equal(papelNoProjeto(simulando(ALUNO), p), "aluno");
  assert.equal(podeDesignarAvaliador(simulando(PROPPEX), p), false,
    "simulando alguém sem gestão, os poderes de gestão não vão junto");
});

test("simular por CPF mostra o que a pessoa verá antes mesmo de ter conta", () => {
  const p = normalizarProjeto(bruto({
    orientador: { nome: "Prof. Sem Conta", email: "", cpf: "390.533.447-05" },
  }), { autor: "" });
  const porCpf = { email: "", cpf: "39053344705", gestao: false };
  assert.equal(papelNoProjeto(porCpf, p), "orientador");
  assert.equal(podeVerProjeto(porCpf, p), true);
  assert.equal(podeVerProjeto({ email: "", cpf: "11144477735", gestao: false }, p), false, "CPF de outro não abre nada");
});

test("projeto importado que ainda espera o dono aparece como pendência, não como erro", async () => {
  const { pendenciasDoProjeto } = await import("../lib/ic.js");
  const importado = normalizarProjeto(bruto({
    orientador: { nome: "Prof. Sem Conta", email: "", cpf: "390.533.447-05" },
  }), { autor: "" });
  assert.deepEqual(validarProjeto(importado), [], "sem e-mail o projeto continua válido");
  const p = pendenciasDoProjeto({ ...importado, status: "submetido" });
  assert.ok(p.some((x) => x.tipo === "orientacao-sem-conta"), "mas a coordenação é avisada");
  assert.ok(p.find((x) => x.tipo === "orientacao-sem-conta").texto.includes("CPF"),
    "e o aviso diz o que resolve");

  const comDono = pendenciasDoProjeto({ ...importado, orientador: { ...importado.orientador, email: "prof@uniego.edu.br" }, status: "submetido" });
  assert.ok(!comDono.some((x) => x.tipo === "orientacao-sem-conta"), "vinculado, a pendência some");
});

/* ------------------------------ cronograma ------------------------------ */
test("o cronograma junta os projetos, mas o aluno só vê o plano dele", () => {
  const a = { ...emExecucao(), id: "p1" };
  // projeto de outra orientação, com outro aluno: é o que separa os recortes
  const b = {
    ...emExecucao({
      orientador: { nome: "Prof. Caio", email: "caio@uniego.edu.br" },
      alunos: [{ nome: "Beatriz", email: ALUNO2.email }],
      cronograma: [{ atividade: "Montagem das leiras", responsavel: ALUNO2.email, inicio: "2026-09-01", fim: "2026-10-31" }],
    }), id: "p2", numero: "IC-2026-002", criadoPor: "caio@uniego.edu.br",
  };

  assert.equal(cronogramaDe([a, b], PROF).length, 2, "quem orienta vê o seu projeto inteiro, não o do colega");
  const doAluno = cronogramaDe([a, b], ALUNO);
  assert.equal(doAluno.length, 1, "o aluno vê só a atividade sob a responsabilidade dele");
  assert.equal(doAluno[0].atividade, "Revisão bibliográfica");
  assert.equal(doAluno[0].meu, true);
  assert.equal(cronogramaDe([a, b], ALUNO2).length, 1);
  assert.equal(cronogramaDe([a, b], ALHEIO).length, 0);
  assert.equal(cronogramaDe([a, b], PROPPEX).length, 3, "a gestão vê tudo");

  const ordenado = cronogramaDe([a, b], PROPPEX).map((e) => e.inicio);
  assert.deepEqual(ordenado, [...ordenado].sort(), "as atividades saem em ordem de início");
});

test("atraso é fato da data, não campo preenchido à mão", () => {
  assert.equal(etapaAtrasada({ fim: "2026-01-01", situacao: "prevista" }, "2026-06-01"), true);
  assert.equal(etapaAtrasada({ fim: "2026-01-01", situacao: "concluida" }, "2026-06-01"), false);
  assert.equal(etapaAtrasada({ fim: "", situacao: "prevista" }, "2026-06-01"), false);
});

/* ------------------------------ relatórios ------------------------------ */
test("faltam um parcial e um final por aluno; devolvido volta a faltar", () => {
  const p = emExecucao({ alunos: [{ nome: "Marcos", email: ALUNO.email }, { nome: "Beatriz", email: ALUNO2.email }] });
  assert.equal(relatoriosPendentes(p).length, 4, "dois alunos × parcial e final");

  const comParcial = { ...p, relatorios: [{ tipo: "parcial", aluno: ALUNO.email, situacao: "validado" }] };
  assert.equal(relatoriosPendentes(comParcial).length, 3);

  const devolvido = { ...p, relatorios: [{ tipo: "parcial", aluno: ALUNO.email, situacao: "devolvido" }] };
  assert.equal(relatoriosPendentes(devolvido).length, 4, "devolvido continua pendente");
  assert.ok(relatoriosPendentes(devolvido).some((x) => x.devolvido));

  assert.deepEqual(relatoriosPendentes({ ...p, status: "submetido" }), [],
    "projeto sem aprovação não cobra relatório");
});

test("o aluno só enxerga os próprios relatórios; a orientação vê os do projeto", () => {
  const p = {
    ...emExecucao({ alunos: [{ nome: "Marcos", email: ALUNO.email }, { nome: "Beatriz", email: ALUNO2.email }] }),
    relatorios: [
      { id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "enviado", enviadoEm: "2026-11-01T10:00:00.000Z" },
      { id: "r2", tipo: "parcial", aluno: ALUNO2.email, situacao: "validado", enviadoEm: "2026-12-01T10:00:00.000Z" },
    ],
  };
  assert.deepEqual(relatoriosDe([p], ALUNO).map((r) => r.id), ["r1"]);
  assert.deepEqual(relatoriosDe([p], ALUNO2).map((r) => r.id), ["r2"]);
  assert.equal(relatoriosDe([p], PROF).length, 2);
  assert.equal(relatoriosDe([p], ALHEIO).length, 0);
  assert.deepEqual(relatoriosDe([p], PROF).map((r) => r.id), ["r2", "r1"], "mais recente primeiro");
  assert.equal(relatoriosDe([p], PROF)[1].podeValidar, true, "o enviado espera validação");
  assert.equal(relatoriosDe([p], ALUNO)[0].podeValidar, false);
});

/* -------------------------------- resumo -------------------------------- */
test("o resumo da lista conta etapas, atrasos e relatórios a validar", () => {
  const p = {
    ...emExecucao(),
    cronograma: [
      { atividade: "A", inicio: "2020-01-01", fim: "2020-02-01", situacao: "concluida" },
      { atividade: "B", inicio: "2020-01-01", fim: "2020-02-01", situacao: "prevista" },
    ],
    relatorios: [{ id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "enviado" }],
  };
  const r = resumir(p, PROF);
  assert.equal(r.etapas, 2);
  assert.equal(r.etapasConcluidas, 1);
  assert.equal(r.atrasadas, 1, "a prevista com fim em 2020 está atrasada");
  assert.equal(r.aValidar, 1);
  assert.equal(r.papel, "orientador");
  assert.equal(r.resumo, undefined, "o resumo da lista não carrega os campos longos");
});

test("o histórico guarda quem fez o quê, com teto", () => {
  let p = novo();
  for (let i = 0; i < 70; i++) p = anotar(p, { quem: PROF.email, oQue: "editou " + i });
  assert.equal(p.historico.length, 60, "o histórico não cresce sem limite");
  assert.equal(p.historico.at(-1).oQue, "editou 69");
});

test("as situações do projeto e as modalidades são as previstas", () => {
  assert.deepEqual(STATUS, ["rascunho", "submetido", "devolvido", "aprovado", "concluido", "reprovado"]);
  assert.deepEqual(MODALIDADES.map((m) => m.codigo),
    ["pibic-cnpq", "pibiti-cnpq", "pbic-uniego", "pbiti-uniego", "pbie-uniego",
     "pvic-uniego", "pviti-uniego", "pvie-uniego"], "as oito modalidades do edital 01/2026");
});
