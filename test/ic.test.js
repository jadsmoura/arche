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
  notaFinal, placarPareceres, participaDeAlgum, prazosRelatorios, pendenciasDoProjeto,
  producaoDoOrientador, notaTranscrita, decidindoOProprio, avaliacaoRecebida,
  janelaContestacao, podeContestar, PRAZO_CONTESTACAO_DIAS, atoDeGestao,
  idadeEm, faltaNoCadastroDoBolsista, cadastroDoBolsistaCompleto,
} from "../lib/ic.js";

/* -------------------------------- fixtura ------------------------------- */
const PROF = { email: "renata@uniego.edu.br", gestao: false };
const ALUNO = { email: "marcos@uniego.edu.br", gestao: false };
const ALUNO2 = { email: "beatriz@uniego.edu.br", gestao: false };
const ALHEIO = { email: "alheio@uniego.edu.br", gestao: false };
const PROPPEX = { email: "proppex@uniego.edu.br", gestao: true };
/* A devolutiva da seleção só existe depois do resultado publicado: quem olha
   carrega o registro de publicação junto (é o que o servidor injeta). */
const publicadoEm = (quando, fase = "preliminar") => ({
  "PIBIC 01/2026": { fase, em: quando, desde: { preliminar: quando, ...(fase === "final" ? { final: quando } : {}) } },
});
const agoraISO = () => new Date().toISOString();
const comResultado = (quem, pub = publicadoEm(agoraISO())) => ({ ...quem, publicados: pub });

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
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "aprovado" }), true,
    "a decisão de um aprovado pode ser revista enquanto o ciclo corre");
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "reprovado" }), true,
    "e a reprovação por engano também tem volta");
  assert.equal(podeAvaliar(PROPPEX, { ...p, status: "concluido" }), false, "concluído é definitivo");
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
  const pub = publicadoEm(agoraISO());
  const simulando = (quem) => ({ email: quem.email, cpf: quem.cpf || "", gestao: false, publicados: pub });

  const comoOrientador = visaoDoProjeto(p, simulando(PROF));
  assert.deepEqual(comoOrientador, visaoDoProjeto(p, comResultado(PROF, pub)), "idêntica à visão real da orientação");
  assert.equal(comoOrientador.avaliacoes, undefined, "a coordenação, simulando, também deixa de ver quem avaliou");
  // o QUE o parecer disse volta para quem submeteu (decisão do dono, ago/2026);
  // QUEM o escreveu, nunca — a avaliação é cega
  assert.match(JSON.stringify(comoOrientador.avaliacaoRecebida), /sigiloso/, "a devolutiva chega à orientação");
  assert.ok(!JSON.stringify(comoOrientador).includes(AD2.email), "sem o e-mail de quem avaliou");

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

test("os prazos do edital: parcial abre no 4º mês e vence no 6º; final abre no 10º e vence no fim", () => {
  const p = { ...emExecucao(), inicio: "2026-09-01", fim: "2027-08-31" };
  const r = prazosRelatorios(p, "2026-10-01");
  assert.equal(r.prazos[0].vence, "2027-03-01", "parcial: 6 meses depois do início");
  assert.equal(r.prazos[0].abre, "2026-12-01", "abre no 4º mês da vigência (dono, ago/2026)");
  assert.equal(r.prazos[1].vence, "2027-08-31", "final: no fim da vigência");
  assert.equal(r.prazos[1].abre, "2027-06-01", "abre no 10º mês");
  assert.equal(r.atrasado, false, "em outubro nada venceu ainda");

  assert.equal(prazosRelatorios(p, "2027-03-02").atrasado, true, "passou o prazo do parcial sem entrega");
  const comParcial = { ...p, relatorios: [{ id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "validado" }] };
  assert.equal(prazosRelatorios(comParcial, "2027-03-02").atrasado, false, "parcial entregue: em dia");
  assert.equal(prazosRelatorios(comParcial, "2027-09-05").atrasado, true, "mas o final venceu sem entrega");
  const devolvido = { ...p, relatorios: [{ id: "r1", tipo: "parcial", aluno: ALUNO.email, situacao: "devolvido" }] };
  assert.equal(prazosRelatorios(devolvido, "2027-03-02").atrasado, true, "devolvido não conta como entregue");

  assert.equal(prazosRelatorios({ ...novo(), status: "submetido" }), null, "sem execução não há prazo");
  // sem datas próprias, valem as da vigência do edital
  const semDatas = { ...emExecucao(), inicio: "", fim: "" };
  assert.equal(prazosRelatorios(semDatas, "2026-10-01").prazos[0].vence, "2027-03-01");
});

test("a indicação do bolsista guarda contato e conta; colega de projeto não vê", () => {
  const p = normalizarProjeto({ ...bruto(), alunos: [{
    nome: "Marcos", email: ALUNO.email, matricula: "2024001", bolsista: true,
    cpf: "044.244.431-16", telefone: "(62) 90000-0000",
    rg: "5.123.456 SSP/GO", nascimento: "2004-03-18", endereco: "Rua 3, 120 — Centro, Goianésia/GO",
    vinculo: "nao",
    banco: "Caixa", agencia: "0655", conta: "20674195-2", pix: "04424443116",
  }, { nome: "Beatriz", email: ALUNO2.email, matricula: "2024002" }] }, { autor: PROF.email });
  const a = p.alunos[0];
  assert.equal(a.banco, "Caixa");
  assert.equal(a.pix, "04424443116");
  assert.equal(a.cpf, "04424443116", "CPF entra só em dígitos");

  // a colega de projeto vê que o bolsista existe — nunca a conta dele
  const vista = visaoDoProjeto({ ...p, status: "aprovado", numero: "IC-2026-001" }, ALUNO2);
  const doColega = vista.alunos.find((x) => x.nome === "Marcos");
  for (const campo of ["banco", "agencia", "conta", "pix", "telefone", "cpf"])
    assert.ok(!doColega?.[campo], `${campo} do bolsista não vaza para o colega`);

  // nem para a orientação: documento e conta são do aluno; ela vê o andamento
  const daProf = visaoDoProjeto({ ...p, status: "aprovado", numero: "IC-2026-001" }, PROF);
  const meuAluno = daProf.alunos.find((x) => x.nome === "Marcos");
  for (const campo of ["banco", "conta", "pix", "cpf", "rg", "nascimento", "endereco"])
    assert.ok(!meuAluno?.[campo], `${campo} não aparece para a orientação`);
  assert.equal(meuAluno.dadosCompletos, true, "a orientação sabe que o aluno completou");
  assert.equal(meuAluno.telefone, "(62) 90000-0000", "o contato que ela mesma indicou, sim");

  // bolsa concedida sem os dados completos vira pendência
  const semDados = { ...p, status: "aprovado", fomento: { tipo: "uniego", modalidade: "pbic-uniego" },
    alunos: [{ ...p.alunos[0], banco: "", pix: "" }] };
  assert.ok(pendenciasDoProjeto(semDados).some((x) => x.tipo === "bolsista-incompleto"));
  assert.ok(!pendenciasDoProjeto({ ...semDados, fomento: { tipo: "voluntario" } })
    .some((x) => x.tipo === "bolsista-incompleto"), "voluntário não tem contrato de bolsa");
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
    ["pibic-cnpq", "pibiti-cnpq", "pbic-uniego", "pbiti-uniego", "pbie-uniego", "voluntario"],
    "as seis modalidades do edital 01/2026 — cinco com bolsa e uma voluntária");
});

/* A planilha de produção é da PESSOA, não do projeto: a próxima submissão
   abre com a da última vez, casada por e-mail OU CPF — é o que serve tanto
   ao professor quanto à inclusão manual em nome dele. */
test("a produção mais recente do orientador sai por e-mail ou por CPF", () => {
  const projetos = [
    { orientador: { email: "prof@uniego.edu.br", cpf: "52998224725" },
      producao: { "artigo-a1": 2 }, atualizadoEm: "2026-03-01T10:00:00Z" },
    { orientador: { email: "prof@uniego.edu.br", cpf: "52998224725" },
      producao: { "artigo-a1": 3, "livro": 1 }, atualizadoEm: "2026-07-15T10:00:00Z" },
    { orientador: { email: "outra@uniego.edu.br", cpf: "11144477735" },
      producao: { "artigo-a1": 9 }, atualizadoEm: "2026-08-01T10:00:00Z" },
  ];
  // por e-mail: vem a mais recente do professor, não a mais antiga nem a alheia
  const porEmail = producaoDoOrientador(projetos, { email: "prof@uniego.edu.br", cpf: "" });
  assert.deepEqual(porEmail.producao, { "artigo-a1": 3, "livro": 1 });
  // por CPF sozinho (projeto importado que espera o cadastro): mesma resposta
  const porCpf = producaoDoOrientador(projetos, { email: "", cpf: "52998224725" });
  assert.deepEqual(porCpf.producao, { "artigo-a1": 3, "livro": 1 });
  // quem nunca preencheu não herda nada
  assert.equal(producaoDoOrientador(projetos, { email: "nova@uniego.edu.br", cpf: "" }), null);
});

test("planilha vazia não conta como produção anterior", () => {
  const projetos = [
    { orientador: { email: "prof@uniego.edu.br" }, producao: {}, atualizadoEm: "2026-08-01T10:00:00Z" },
    { orientador: { email: "prof@uniego.edu.br" }, producao: { "livro": 1 }, atualizadoEm: "2026-01-01T10:00:00Z" },
  ];
  // o projeto mais novo tem a planilha em branco: vale a preenchida, mesmo mais antiga
  assert.deepEqual(producaoDoOrientador(projetos, { email: "prof@uniego.edu.br", cpf: "" }).producao,
    { "livro": 1 });
});

/* Certificados: quem tem direito ao quê sai dos próprios projetos. O CPF é
   a chave que reúne numa conta só quem participou de mais de uma edição. */
test("o certificado acha o dono pelo CPF, pelo e-mail e — nos históricos — pelo nome", async () => {
  const { certificadosDe } = await import("../lib/certificados.js");
  const base = { status: "concluido", inicio: "2024-09-01", fim: "2025-08-31", edital: "01/2024" };
  const projetos = [
    { ...base, id: "p1", numero: "IC-2024-001", titulo: "Micorrizas",
      orientador: { nome: "Rodrigo Fernandes de Souza" },            // histórico: só o nome
      alunos: [{ nome: "Natiele Alves Luz", cpf: "52998224725" }, { nome: "João Augusto" }] },
    { ...base, id: "p2", numero: "IC-2024-002", titulo: "Outro projeto",
      orientador: { nome: "Outra Pessoa", email: "outra@uniego.edu.br" }, alunos: [{ nome: "Zé" }] },
    { ...base, id: "p3", status: "aprovado", numero: "IC-2026-001", titulo: "Em execução",
      orientador: { nome: "Rodrigo Fernandes de Souza" }, alunos: [{ nome: "Ainda Cursando" }] },
  ];
  // aluna pelo CPF: um certificado de participação, e só do ciclo concluído
  const daAluna = certificadosDe(projetos, { cpf: "529.982.247-25", email: "", nome: "" });
  assert.equal(daAluna.length, 1);
  assert.equal(daAluna[0].tipo, "participacao");
  assert.equal(daAluna[0].numero, "IC-2024-001");

  // orientador pelo nome (o histórico não tem e-mail nem CPF): UM POR ALUNO
  const doProf = certificadosDe(projetos, { cpf: "", email: "r@x.com", nome: "Rodrigo Fernandes de Souza" });
  assert.equal(doProf.length, 2, "um certificado por aluno orientado");
  assert.ok(doProf.every((c) => c.tipo === "orientacao" && c.projetoId === "p1"),
    "projeto em execução não gera certificado");

  // quem tem chave forte não é casado por nome — o homônimo não leva o alheio
  const homonimo = certificadosDe(projetos, { cpf: "", email: "impostor@x.com", nome: "Outra Pessoa" });
  assert.equal(homonimo.length, 0, "o registro com e-mail só casa por e-mail ou CPF");

  // sem nenhuma chave, nada sai
  assert.deepEqual(certificadosDe(projetos, {}), []);
});

test("o código de validação é estável e distingue os documentos", async () => {
  const { codigo } = await import("../lib/certificados.js");
  const a = codigo({ tipo: "participacao", projetoId: "p1", pessoa: "Natiele" });
  assert.equal(a, codigo({ tipo: "participacao", projetoId: "p1", pessoa: "natiele" }), "estável");
  assert.notEqual(a, codigo({ tipo: "orientacao", projetoId: "p1", pessoa: "Natiele" }));
  assert.notEqual(a, codigo({ tipo: "participacao", projetoId: "p2", pessoa: "Natiele" }));
  assert.match(a, /^[0-9A-F]{10}$/);
});

test("o certificado de orientação é de quem orientou, não de quem está olhando", async () => {
  const { certificadosDe } = await import("../lib/certificados.js");
  const base = { status: "concluido", inicio: "2024-09-01", fim: "2025-08-31", edital: "01/2024" };
  const projetos = [
    { ...base, id: "p1", numero: "IC-2024-001", titulo: "Micorrizas",
      orientador: { nome: "Jadson Belem de Moura" }, alunos: [{ nome: "Amanda" }] },
    { ...base, id: "p2", numero: "IC-2024-002", titulo: "Trabalho escravo",
      orientador: { nome: "Marlana Carla Peixoto Ribeiro" }, alunos: [{ nome: "Glenda" }] },
  ];
  // a coordenação vendo "como" a professora tem de receber os alunos DELA
  const daMarlana = certificadosDe(projetos, { cpf: "", email: "marlana@x.com", nome: "Marlana Carla Peixoto Ribeiro" });
  assert.equal(daMarlana.length, 1);
  assert.equal(daMarlana[0].aluno, "Glenda");
  const doJadson = certificadosDe(projetos, { cpf: "", email: "jadson@x.com", nome: "Jadson Belem de Moura" });
  assert.equal(doJadson[0].aluno, "Amanda");
});

/* -------- pareceres do edital transcritos (a seleção correu em planilha) --- */
const PARECER_PLANILHA = {
  protocolo: "IC-2026-001",
  notas: { merito: 16, objetivos: 8, fundamentacao: 7, metodologia: 15, viabilidade: 12, formacao: 10, redacao: 8 },
  recomendacao: "recomendado",
  parecer: "O projeto aborda tema social e juridicamente relevante…",
};

test("a nota transcrita é a SOMA dos critérios, não o total da planilha", () => {
  const nt = notaTranscrita({ ...PARECER_PLANILHA, valor: 999 }, { por: "avaliação do edital" });
  assert.equal(nt.valor, 76);            // 16+8+7+15+12+10+8
  assert.equal(nt.valor, notaFinal(nt)); // mesma conta do parecer feito no sistema
  assert.equal(nt.transcrita, true);
  assert.equal(nt.recomendacao, "recomendado");
  assert.match(nt.parecer, /tema social/);
  assert.ok(nt.em);
});

test("critério faltando não vira avaliação pela metade", () => {
  const { merito, ...semMerito } = PARECER_PLANILHA.notas;
  assert.equal(notaTranscrita({ ...PARECER_PLANILHA, notas: semMerito }), null);
  assert.equal(notaTranscrita({}), null);
  assert.equal(notaTranscrita(null), null);
});

test("critério acima do teto é aparado, e negativo vira zero", () => {
  const nt = notaTranscrita({
    ...PARECER_PLANILHA,
    notas: { ...PARECER_PLANILHA.notas, merito: 50, redacao: -3 },
  });
  assert.equal(nt.notas.merito, 20);     // teto do critério
  assert.equal(nt.notas.redacao, 0);
  assert.ok(nt.valor <= 100);
});

test("recomendação fora do catálogo não entra", () => {
  assert.equal(notaTranscrita({ ...PARECER_PLANILHA, recomendacao: "talvez" }).recomendacao, "");
  assert.equal(notaTranscrita({ ...PARECER_PLANILHA, recomendacao: "ressalvas" }).recomendacao, "ressalvas");
});

test("a nota transcrita atravessa a normalização do projeto sem perder o parecer", () => {
  const nt = notaTranscrita(PARECER_PLANILHA, { por: "avaliação do edital" });
  const p = normalizarProjeto(bruto(), { base: { ...novo(), notaDireta: nt } });
  assert.equal(p.notaDireta.valor, 76);
  assert.equal(p.notaDireta.notas.metodologia, 15);
  assert.match(p.notaDireta.parecer, /tema social/);
  assert.equal(p.notaDireta.transcrita, true);
});

test("o parecer transcrito não escapa para a orientação nem para o aluno", () => {
  const nt = notaTranscrita(PARECER_PLANILHA, { por: "avaliação do edital" });
  const p = { ...novo(), status: "submetido", notaDireta: nt };
  assert.equal(visaoDoProjeto(p, PROF).notaDireta, undefined);
  assert.equal(visaoDoProjeto(p, ALUNO).notaDireta, undefined);
  assert.equal(visaoDoProjeto(p, PROPPEX).notaDireta.valor, 76);
});

/* ---- conflito de interesse: o gestor que também submete (ago/2026) ------- */
test("o coordenador de módulo não decide a proposta em que ele é parte", () => {
  const meu = { ...novo(), status: "submetido", numero: "IC-2026-036" };
  const coord = { email: PROF.email, gestao: true };        // coordena E orienta
  assert.equal(papelNoProjeto(coord, meu), "orientador");
  assert.equal(podeAvaliar(coord, meu), false);
  // a tela precisa saber disso ANTES de oferecer o botão
  const r = resumir(meu, coord);
  assert.equal(r.podeDecidir, false);
  assert.equal(r.souParte, "orientador");
  // outro gestor do setor decide normalmente
  const outro = { email: "coordenacao.pesquisa@uniego.edu.br", gestao: true };
  assert.equal(podeAvaliar(outro, meu), true);
  assert.equal(resumir(meu, outro).podeDecidir, true);
});

/* Decisão do dono (ago/2026): o gestor geral decide a própria proposta — o
   mérito veio de parecer ad hoc, fora do sistema, e o que ele pratica é o ato
   administrativo. Sem isso, as propostas do pró-reitor ficavam sem ninguém
   que pudesse concluí-las e o edital não fechava. */
test("o gestor geral decide a própria proposta, e isso fica marcado", () => {
  const meu = { ...novo(), status: "submetido", numero: "IC-2026-036" };
  const proReitor = { email: PROF.email, gestao: true, gestorGeral: true };
  assert.equal(papelNoProjeto(proReitor, meu), "orientador");
  assert.equal(podeAvaliar(proReitor, meu), true);
  assert.equal(decidindoOProprio(proReitor, meu), true);
  const r = resumir(meu, proReitor);
  assert.equal(r.podeDecidir, true);
  assert.equal(r.souParte, "orientador", "a tela ainda precisa dizer que a proposta é dele");
  // no projeto alheio ele decide como gestão, sem a marca
  const alheio = { ...novo(), status: "submetido", orientador: { email: "outro@uniego.edu.br" }, criadoPor: "outro@uniego.edu.br" };
  assert.equal(decidindoOProprio(proReitor, alheio), false);
});

test("burocracia sim, juízo não: o parecer sobre a própria proposta segue barrado", () => {
  const meu = { ...novo(), status: "submetido" };
  const proReitor = { email: PROF.email, gestao: true, gestorGeral: true };
  // atos do processo — o gestor geral pratica todos na própria proposta,
  // senão a proposta dele trava e o edital não fecha
  assert.equal(atoDeGestao(proReitor, meu), true);
  assert.equal(podeAvaliar(proReitor, meu), true, "decidir");
  assert.equal(podeDesignarAvaliador(proReitor, meu), true, "designar quem avalia");
  // o juízo de mérito, esse ninguém faz sobre si — nem ele
  assert.equal(podeDarParecer(proReitor, meu), false, "ninguém dá parecer sobre o próprio projeto");
  // e o coordenador de módulo não tem a prerrogativa em nada disso
  const coord = { email: PROF.email, gestao: true };
  assert.equal(atoDeGestao(coord, meu), false);
  assert.equal(podeDesignarAvaliador(coord, meu), false);
});

test("o CPF liga as contas: a pessoal também é 'proposta própria'", () => {
  const p = { ...novo(), status: "submetido",
    orientador: { nome: "Pró-reitor", email: "institucional@uniego.edu.br", cpf: "11144477735" } };
  const pessoal = { email: "pessoal@gmail.com", cpf: "11144477735", gestao: true, gestorGeral: true };
  assert.equal(decidindoOProprio(pessoal, p), true, "o CPF liga as duas contas");
  assert.equal(podeAvaliar(pessoal, p), true);
  // sem CPF gravado, a conta pessoal é gestão pura
  const semCpf = { email: "pessoal@gmail.com", cpf: "", gestao: true, gestorGeral: true };
  assert.equal(decidindoOProprio(semCpf, p), false);
});

/* ------- devolutiva da seleção para quem submeteu (ago/2026) -------------- */
test("a orientação recebe as notas e o texto do parecer — sem saber de quem", () => {
  const p = emSelecao([
    { email: AD1.email, nome: "Parecerista Um", situacao: "entregue", recomendacao: "recomendado",
      parecer: "Proposta bem delimitada.", notas: { merito: 18, objetivos: 9, fundamentacao: 8, metodologia: 17, viabilidade: 13, formacao: 12, redacao: 9 } },
    { email: AD2.email, nome: "Parecerista Dois", situacao: "designado", parecer: "", notas: {} },
  ]);
  const visao = visaoDoProjeto(p, comResultado(PROF));
  const av = visao.avaliacaoRecebida;
  assert.ok(av, "há devolutiva quando existe parecer entregue");
  assert.equal(av.pareceres.length, 1, "parecer ainda não entregue não vaza");
  assert.equal(av.pareceres[0].notas.merito, 18);
  assert.match(av.pareceres[0].parecer, /bem delimitada/);
  assert.equal(av.nota, 86);                       // 18+9+8+17+13+12+9
  // nada que identifique quem avaliou
  const cru = JSON.stringify(av);
  for (const pista of [AD1.email, AD2.email, "Parecerista"]) {
    assert.ok(!cru.includes(pista), `a devolutiva não pode conter "${pista}"`);
  }
});

test("a nota transcrita também volta como devolutiva, e o aluno não a vê", () => {
  const nt = notaTranscrita({
    notas: { merito: 16, objetivos: 8, fundamentacao: 7, metodologia: 15, viabilidade: 12, formacao: 10, redacao: 8 },
    recomendacao: "recomendado", parecer: "Tema relevante, recorte a aprimorar.",
  }, { por: "avaliação do edital" });
  const p = { ...emSelecao(), notaDireta: nt };
  const daOrientacao = visaoDoProjeto(p, comResultado(PROF)).avaliacaoRecebida;
  assert.equal(daOrientacao.nota, 76);
  assert.match(daOrientacao.pareceres[0].parecer, /recorte a aprimorar/);
  // o aluno entrou depois da seleção: a proposta é autoria da orientação
  assert.equal(visaoDoProjeto(p, comResultado(ALUNO)).avaliacaoRecebida, undefined);
  // e sem avaliação nenhuma não há quadro para abrir
  assert.equal(avaliacaoRecebida(emSelecao()), null);
});

/* ---- publicação e contestação da nota (decisão do dono, ago/2026) -------- */
test("antes da publicação o professor não vê nota nem parecer", () => {
  const p = emSelecao([{ email: AD1.email, situacao: "entregue", parecer: "texto do parecer",
    recomendacao: "recomendado", notas: { merito: 18 } }]);
  // sem registro de publicação: a devolutiva não existe para ele
  assert.equal(visaoDoProjeto(p, PROF).avaliacaoRecebida, undefined);
  assert.equal(resumir(p, PROF).avaliacaoRecebida, undefined);
  assert.ok(!JSON.stringify(visaoDoProjeto(p, PROF)).includes("texto do parecer"));
  // publicado o preliminar, aparece
  const depois = visaoDoProjeto(p, comResultado(PROF));
  assert.match(JSON.stringify(depois.avaliacaoRecebida), /texto do parecer/);
  // a gestão continua vendo tudo, publicado ou não — é ela quem publica
  assert.ok(JSON.stringify(visaoDoProjeto(p, PROPPEX)).includes("texto do parecer"));
});

test("a janela de contestação abre no preliminar e fecha em três dias", () => {
  const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
  assert.equal(janelaContestacao(undefined).aberta, false, "sem preliminar não há o que contestar");
  assert.equal(janelaContestacao({ desde: { preliminar: dias(0) } }).aberta, true);
  assert.equal(janelaContestacao({ desde: { preliminar: dias(PRAZO_CONTESTACAO_DIAS - 1) } }).aberta, true);
  const vencida = janelaContestacao({ desde: { preliminar: dias(PRAZO_CONTESTACAO_DIAS + 1) } });
  assert.equal(vencida.aberta, false);
  assert.equal(vencida.motivo, "prazo-encerrado");
  // o resultado final fecha a janela antes do prazo: a contestação é entre um e outro
  const comFinal = janelaContestacao({ desde: { preliminar: dias(0), final: dias(0) } });
  assert.equal(comFinal.aberta, false);
  assert.equal(comFinal.motivo, "resultado-final");
});

/* O registro de publicação nasceu sem `desde` — quem publicou antes desta
   funcionalidade tem só `fase` e `em`. Sem a leitura de reserva, a janela
   nunca abria para o edital que JÁ estava publicado, que é exatamente o
   caso do 01/2026. */
test("edital publicado antes de existir o prazo também abre a janela", () => {
  const hoje = new Date().toISOString();
  const antigo = { fase: "preliminar", em: hoje, por: "proppex@uniego.edu.br" };
  const j = janelaContestacao(antigo);
  assert.equal(j.aberta, true, "a data da publicação vale como início do prazo");
  assert.ok(j.ate > hoje);
  // e o registro antigo já em fase final continua fechando a janela
  assert.equal(janelaContestacao({ fase: "final", em: hoje }).motivo, "resultado-final");
  // o prazo conta da publicação, não de agora
  const velho = { fase: "preliminar", em: new Date(Date.now() - 5 * 86400000).toISOString() };
  assert.equal(janelaContestacao(velho).aberta, false);
  assert.equal(janelaContestacao(velho).motivo, "prazo-encerrado");
});

test("contestar é da orientação, uma vez por projeto, e dentro do prazo", () => {
  const p = { ...emSelecao(), status: "aprovado" };
  const pub = publicadoEm(new Date().toISOString());
  assert.equal(podeContestar(PROF, p, pub), true);
  assert.equal(podeContestar(ALUNO, p, pub), false, "o aluno não contesta a nota da proposta");
  assert.equal(podeContestar(PROPPEX, p, pub), false, "nem a coordenação, que é quem decide");
  // já contestou: não repete
  const jaFeita = { ...p, contestacoes: [{ id: "c1", por: PROF.email, em: new Date().toISOString(), texto: "…" }] };
  assert.equal(podeContestar(PROF, jaFeita, pub), false);
  // fora do prazo
  const velho = publicadoEm(new Date(Date.now() - 10 * 86400000).toISOString());
  assert.equal(podeContestar(PROF, p, velho), false);
});

test("a contestação é assunto da orientação e da coordenação — o aluno não a vê", () => {
  const c = { id: "c1", por: PROF.email, em: new Date().toISOString(), texto: "Discordo da nota de metodologia.",
    resposta: "Mantida.", respondidoPor: PROPPEX.email, respondidoEm: new Date().toISOString() };
  const p = { ...emSelecao(), status: "aprovado", contestacoes: [c] };
  assert.equal(visaoDoProjeto(p, comResultado(PROF)).contestacoes.length, 1);
  assert.equal(visaoDoProjeto(p, comResultado(ALUNO)).contestacoes, undefined);
  assert.ok(!JSON.stringify(visaoDoProjeto(p, comResultado(ALUNO))).includes("Discordo"));
  assert.equal(visaoDoProjeto(p, PROPPEX).contestacoes.length, 1, "a coordenação vê para responder");
  // e a normalização do formulário não apaga a peça
  assert.equal(normalizarProjeto(bruto(), { base: p }).contestacoes.length, 1);
});

test("na própria proposta o gestor geral vê a nota que ele mesmo lançou", () => {
  const nt = notaTranscrita({
    notas: { merito: 16, objetivos: 8, fundamentacao: 7, metodologia: 15, viabilidade: 12, formacao: 10, redacao: 8 },
    recomendacao: "recomendado", parecer: "…",
  }, { por: "avaliação do edital" });
  const p = { ...emSelecao(), status: "aprovado", notaDireta: nt };
  const proReitor = { email: PROF.email, gestao: true, gestorGeral: true };
  assert.equal(visaoDoProjeto(p, proReitor).notaDireta.valor, 76, "o campo abre com o valor lançado");
  // para o professor comum e para o coordenador que é parte, segue fora
  assert.equal(visaoDoProjeto(p, PROF).notaDireta, undefined);
  assert.equal(visaoDoProjeto(p, { email: PROF.email, gestao: true }).notaDireta, undefined);
});

/* ---------------- cadastro do bolsista (guia Bolsa) --------------------- */

test("o cadastro do bolsista só fecha com documento, endereço, vínculo e conta", () => {
  const completo = {
    nome: "Marcos", cpf: "04424443116", rg: "5.123.456 SSP/GO", nascimento: "2004-03-18",
    telefone: "(62) 90000-0000", endereco: "Rua 3, 120 — Goianésia/GO", vinculo: "nao",
    banco: "Caixa", agencia: "0655", conta: "20674195-2", pix: "04424443116",
  };
  assert.deepEqual(faltaNoCadastroDoBolsista(completo), []);
  assert.equal(cadastroDoBolsistaCompleto(completo), true);

  // o que faltava antes de existirem os campos novos aparece por nome
  const antigo = { ...completo, rg: "", nascimento: "", endereco: "", vinculo: "" };
  const falta = faltaNoCadastroDoBolsista(antigo);
  assert.ok(falta.includes("RG") && falta.includes("endereço"));
  assert.ok(falta.some((x) => x.includes("nascimento")));
  assert.ok(falta.some((x) => x.includes("vínculo")), "vínculo em branco é pendência");
  assert.equal(cadastroDoBolsistaCompleto(antigo), false);

  // responder "não tenho vínculo" fecha o campo — o que trava é o branco
  assert.equal(cadastroDoBolsistaCompleto({ ...completo, vinculo: "sim", vinculoOnde: "Prefeitura" }), true);
});

test("o cadastro do aluno guarda os campos novos e a orientação não os vê", () => {
  const p = normalizarProjeto({ ...bruto(), alunos: [{
    nome: "Marcos", email: ALUNO.email, bolsista: true, cpf: "044.244.431-16",
    rg: "5.123.456 SSP/GO", nascimento: "2004-03-18", endereco: "Rua 3, 120",
    vinculo: "sim", vinculoOnde: "Prefeitura de Goianésia", telefone: "(62) 90000-0000",
    banco: "Caixa", agencia: "0655", conta: "20674195-2", pix: "04424443116",
  }] }, { autor: PROF.email });
  const a = p.alunos[0];
  assert.equal(a.rg, "5.123.456 SSP/GO");
  assert.equal(a.nascimento, "2004-03-18");
  assert.equal(a.vinculo, "sim");
  assert.equal(a.vinculoOnde, "Prefeitura de Goianésia");
  // valor fora da lista não entra: "talvez" não é resposta sobre vínculo
  assert.equal(normalizarProjeto({ ...bruto(), alunos: [{ nome: "X", vinculo: "talvez" }] },
    { autor: PROF.email }).alunos[0].vinculo, "");

  const daProf = visaoDoProjeto({ ...p, status: "aprovado" }, PROF).alunos[0];
  for (const campo of ["rg", "nascimento", "endereco", "vinculo", "vinculoOnde", "cpf", "conta"])
    assert.ok(!daProf[campo], `${campo} é do aluno, não da orientação`);
  assert.equal(daProf.dadosCompletos, true);

  // o próprio aluno vê tudo o que informou
  const dele = visaoDoProjeto({ ...p, status: "aprovado" }, ALUNO).alunos[0];
  assert.equal(dele.rg, "5.123.456 SSP/GO");
  assert.equal(dele.endereco, "Rua 3, 120");
});

test("a idade sai da data de nascimento, em anos completos", () => {
  assert.equal(idadeEm("2004-03-18", "2026-08-15"), 22);
  assert.equal(idadeEm("2004-09-18", "2026-08-15"), 21, "aniversário ainda não chegou");
  assert.equal(idadeEm("2004-08-15", "2026-08-15"), 22, "no dia do aniversário já conta");
  assert.equal(idadeEm(""), null);
  assert.equal(idadeEm("18/03/2004"), null, "só data ISO");
});

/* -------- relatórios estruturados e avaliações (dono, ago/2026) --------- */
test("o modelo institucional dos relatórios: roteiro do parcial, artigo no final e as três avaliações", async () => {
  const {
    CAMPOS_RELATORIO_PARCIAL, CAMPOS_PARCIAL_OBRIGATORIOS,
    PERGUNTAS_AVALIACAO_PROJETO, CRITERIOS_AVALIACAO_ORIENTADOR,
    CRITERIOS_AVALIACAO_ALUNO, PARECERES_CONCLUSIVOS, ESCALA_0_5,
    janelaRelatorio, normalizarProjeto, visaoDoProjeto,
  } = await import("../lib/ic.js");
  assert.equal(CAMPOS_RELATORIO_PARCIAL.length, 7, "as 7 seções do roteiro");
  assert.ok(CAMPOS_PARCIAL_OBRIGATORIOS.includes("introducao"));
  assert.equal(PERGUNTAS_AVALIACAO_PROJETO.length, 5);
  assert.equal(CRITERIOS_AVALIACAO_ORIENTADOR.length, 7);
  assert.equal(CRITERIOS_AVALIACAO_ALUNO.length, 7);
  assert.equal(PARECERES_CONCLUSIVOS.length, 3);
  assert.equal(ESCALA_0_5.length, 6, "0 a 5");

  // a janela: parcial abre no 4º mês da vigência e vence no 6º; o final
  // abre no 10º e vence no fim — antes de abrir, o envio é recusado
  const p = {
    ...normalizarProjeto({
      titulo: "T", curso: "agronomia",
      inicio: "2026-09-01", fim: "2027-08-31",
      orientador: { nome: "Prof", email: "prof@x.com" },
      alunos: [{ nome: "Aluna", email: "aluna@x.com" }],
    }, { autor: "prof@x.com" }),
    status: "aprovado", inicio: "2026-09-01", fim: "2027-08-31",
  };
  const parcial = janelaRelatorio(p, "parcial", "2026-11-30");
  assert.equal(parcial.aberta, false, "antes do 4º mês, fechado");
  assert.equal(janelaRelatorio(p, "parcial", "2027-01-10").aberta, true, "no 4º mês, aberto");
  assert.equal(janelaRelatorio(p, "parcial", "2027-04-01").vencida, true, "depois do 6º, vencido (mas aceito)");
  const fin = janelaRelatorio(p, "final", "2027-06-15");
  assert.equal(fin.aberta, true, "final abre no 10º mês");
  assert.equal(janelaRelatorio(p, "final", "2027-05-30").aberta, false);

  // sigilo cruzado: o orientador não vê a avaliação que o aluno fez dele;
  // o aluno não vê as notas nem o parecer conclusivo do orientador
  const comRel = {
    ...p,
    relatorios: [{
      id: "r1", tipo: "final", aluno: "aluna@x.com", situacao: "validado",
      avaliacaoOrientador: { disponibilidade: 5 },
      avaliacaoAluno: { assiduidade: 4 }, parecerConclusivo: "sem-restricoes",
      avaliacaoProjeto: { formacao: "sim" },
    }],
  };
  const doProf = visaoDoProjeto(comRel, { email: "prof@x.com", gestao: false });
  assert.equal(doProf.relatorios[0].avaliacaoOrientador, undefined, "prof não vê a nota que levou");
  assert.equal(doProf.relatorios[0].avaliacaoAluno.assiduidade, 4, "prof vê a que deu");
  const daAluna = visaoDoProjeto(comRel, { email: "aluna@x.com", gestao: false });
  assert.equal(daAluna.relatorios[0].avaliacaoAluno, undefined, "aluna não vê as notas sobre ela");
  assert.equal(daAluna.relatorios[0].parecerConclusivo, undefined);
  assert.equal(daAluna.relatorios[0].avaliacaoOrientador.disponibilidade, 5, "aluna vê a própria avaliação");
  const daGestao = visaoDoProjeto(comRel, { email: "g@x.com", gestao: true });
  assert.equal(daGestao.relatorios[0].avaliacaoOrientador.disponibilidade, 5, "gestão lê os dois lados");
});

test("regularização do ciclo 2025/2026: parcial e final reabrem no projeto concluído, até outubro", async () => {
  const { prazosRelatorios, podeEnviarRelatorio, regularizacaoDe, janelaRelatorio, relatoriosPendentes }
    = await import("../lib/ic.js");
  const p = {
    id: "x", status: "concluido", edital: "01/2025",
    inicio: "2025-09-01", fim: "2026-08-31",
    orientador: { nome: "Prof", email: "prof@x.com" },
    alunos: [{ nome: "Aluna", email: "aluna@x.com" }],
    relatorios: [],
  };
  assert.ok(regularizacaoDe(p), "01/2025 concluído está em regularização");
  const r = prazosRelatorios(p, "2026-08-20");
  assert.equal(r.regularizacao, true);
  // a PROPPEX reabriu os DOIS (decisão do dono, ago/2026): o processo
  // inteiro — parcial, final e validações — se regulariza pelo sistema
  assert.deepEqual(r.prazos.map((x) => x.tipo).sort(), ["final", "parcial"], "parcial e final reabrem");
  for (const x of r.prazos) assert.equal(x.vence, "2026-10-31", "até outubro (decisão do dono)");
  assert.equal(janelaRelatorio(p, "final", "2026-09-10").aberta, true);
  assert.equal(janelaRelatorio(p, "parcial", "2026-09-10").aberta, true, "o parcial também aceita envio");
  assert.equal(podeEnviarRelatorio({ email: "aluna@x.com", gestao: false }, p), true, "aluno envia mesmo concluído");
  assert.equal(relatoriosPendentes(p).length, 2, "parcial e final pendentes contam");
  // os dois validados quitam; outros ciclos concluídos seguem fechados
  const quitado = { ...p, relatorios: [
    { id: "r1", tipo: "parcial", aluno: "aluna@x.com", situacao: "validado" },
    { id: "r2", tipo: "final", aluno: "aluna@x.com", situacao: "validado" },
  ] };
  assert.equal(relatoriosPendentes(quitado).length, 0);
  assert.equal(prazosRelatorios({ ...p, edital: "01/2024" }, "2026-08-20"), null, "2024 está finalizado");
});

test("sigilo cruzado vale também na lista achatada de relatórios (achado ago/2026)", async () => {
  const { relatoriosDe, visaoDoProjeto } = await import("../lib/ic.js");
  const p = {
    id: "p1", status: "aprovado", edital: "01/2025", numero: "IC-2025-099",
    orientador: { nome: "Prof", email: "prof@x.com" },
    alunos: [{ nome: "Aluna", email: "aluna@x.com" }],
    relatorios: [{
      id: "r1", tipo: "final", aluno: "aluna@x.com", situacao: "validado",
      avaliacaoOrientador: { disponibilidade: 5 },
      avaliacaoAluno: { assiduidade: 2 }, parecerConclusivo: "com-ressalvas",
    }],
    contestacoes: [{ por: "prof@x.com", texto: "revisão" }],
    fomento: { tipo: "cnpq" },
  };
  // orientador: não vê a avaliação que levou
  const doProf = relatoriosDe([p], { email: "prof@x.com", gestao: false });
  assert.equal(doProf.length, 1);
  assert.equal(doProf[0].avaliacaoOrientador, undefined, "a avaliação sobre ele não sai");
  assert.equal(doProf[0].parecerConclusivo, "com-ressalvas", "o parecer que ELE deu, sim");
  // aluno: não vê as notas nem o parecer sobre ele
  const daAluna = relatoriosDe([p], { email: "aluna@x.com", gestao: false });
  assert.equal(daAluna[0].avaliacaoAluno, undefined);
  assert.equal(daAluna[0].parecerConclusivo, undefined);
  // gestão lê os dois lados
  const daGestao = relatoriosDe([p], { email: "g@x.com", gestao: true });
  assert.deepEqual(daGestao[0].avaliacaoAluno, { assiduidade: 2 });
  // e a visão do AVALIADOR não carrega contestações nem fomento
  const doAvaliador = visaoDoProjeto({ ...p, avaliacoes: [{ email: "ad@x.com", situacao: "pendente" }] },
    { email: "ad@x.com", gestao: false });
  assert.equal(doAvaliador.contestacoes, undefined, "contestação desanonimizaria a proposta");
  assert.equal(doAvaliador.fomento, undefined, "a bolsa concedida não é assunto do parecerista");
});
