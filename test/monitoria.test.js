/* Testes do ARCHÉ MO — Monitoria Acadêmica.
   O que se protege aqui é o que o edital exige e o que o fluxo promete:
   quem pode o quê, o que falta em cada passo, quanto vale a carga horária
   e quem tem direito a certificado. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CH_SEMANAL, COBRANCA, CRITERIOS_MONITOR, CRONOGRAMA, EDITAL, EDITAIS_MONITORIA,
  PRAZOS, STATUS, cargaHorariaTotal, cobrancaAberta, diasParaRelatorio, certificadosDe, editaisMonitoriaParaLista, faltaNaAvaliacao,
  faltaNoCadastroDoMonitor, faltaNoPlano, faltaNoProjeto, faltaNoRelatorio, monitorCadastrado,
  normalizarProjeto, papelNoProjeto, pendenciasDoCiclo, pendenciasDoProjeto,
  podeDecidir, podeEditar, podeSubmeter, proximoCiclo, resumir, panorama,
  semanasDe, submissaoAberta, todosCadastrados, visaoDoProjeto,
  MIN_FOTOS_MONITORIA, fotosDoRelatorio, faltamFotosMon,
} from "../lib/monitoria.js";

const CPF_A = "52998224725";   // válidos
const CPF_B = "11144477735";

/* Um plano de trabalho completo — o que o edital passou a exigir de CADA
   monitor (item 2.4/2.5): é contra ele que a atuação é avaliada. */
const PLANO = {
  atividades: "Auxiliar nas aulas práticas de laboratório, preparar o material das bancadas e "
    + "conduzir o plantão semanal de dúvidas da turma do 5º período.",
  horarios: "Terças e quintas, das 14h às 16h",
  local: "Laboratório de Semiologia (Bloco C)",
  competencias: "Domínio dos procedimentos de aferição e experiência de condução de grupo de estudo.",
  acompanhamento: "Reunião semanal de 30 minutos e registro das atividades em planilha compartilhada.",
};

function projetoBase(extra = {}) {
  return normalizarProjeto({
    curso: "enfermagem", disciplina: "Semiologia e Semiotécnica",
    orientador: { nome: "Profa. Talita Ribeiro", email: "talita@uniego.edu.br", cpf: CPF_B },
    chSemanal: 4, inicio: "2026-09-16", fim: "2026-12-12",
    atividades: "Auxiliar o professor nas aulas práticas de laboratório, acompanhar os "
      + "acadêmicos em plantões de estudo e organizar o material didático da disciplina.",
    monitores: [{ id: "m1", nome: "Marina Duarte", email: "marina@aluno.uniego.edu.br", plano: PLANO }],
    ...extra,
  });
}

/* ------------------------------- catálogo -------------------------------- */

test("o edital vigente é o da PROPPEX e os antigos ficam com o órgão da época", () => {
  assert.equal(EDITAL.numero, "03/2026");
  assert.match(EDITAL.orgao, /PROPPEX/);
  const antigo = EDITAIS_MONITORIA.find((e) => e.numero === "02/2025");
  assert.equal(antigo.orgao, "Diretoria Acadêmica (DIAC)");
  assert.match(antigo.instituicao, /Faculdade Evangélica/);
  assert.equal(antigo.encerrado, true);
});

test("a vitrine lista do mais novo para o mais antigo e dá endereço a todos", () => {
  const lista = editaisMonitoriaParaLista();
  assert.equal(lista[0].numero, "03/2026");
  assert.equal(lista.at(-1).numero, "01/2025");
  assert.ok(lista.every((e) => !!e.documento), "todo edital precisa ter onde ser lido");
});

test("o próximo ciclo vira o ano quando o semestre é o segundo", () => {
  assert.equal(proximoCiclo("2026/2"), "2027/1");
  assert.equal(proximoCiclo("2026/1"), "2026/2");
  assert.equal(proximoCiclo(""), "");
});

/* ------------------------------ normalização ----------------------------- */

test("o formulário não decide status, protocolo nem apreciação", () => {
  const p = normalizarProjeto({
    ...projetoBase(), status: "aprovado", protocolo: "MON-2026-999",
    apreciacao: { parecer: "eu mesmo aprovei" },
  });
  assert.equal(p.status, "rascunho");
  assert.equal(p.protocolo, "");
  assert.equal(p.apreciacao, null);
});

test("o segundo salvamento preserva o que o monitor já gravou", () => {
  const antes = projetoBase();
  antes.monitores[0] = {
    ...antes.monitores[0], matricula: "20231234", cpf: CPF_A, telefone: "62999990000",
    curso: "enfermagem", periodo: "6º", declaracao: { aceita: true, em: "2026-09-05" },
  };
  // o professor salva o projeto de novo, mandando só o que o formulário DELE tem
  const depois = normalizarProjeto(
    { ...antes, monitores: [{ id: "m1", nome: "Marina Duarte", email: "marina@aluno.uniego.edu.br" }] },
    { anterior: antes });
  assert.equal(depois.monitores[0].matricula, "20231234");
  assert.equal(depois.monitores[0].cpf, CPF_A);
  assert.equal(depois.monitores[0].declaracao.aceita, true);
  assert.equal(depois.monitores[0].periodo, "6º");
});

test("CPF inválido não entra no cadastro do monitor", () => {
  const p = projetoBase();
  p.monitores[0].cpf = "11111111111";
  assert.ok(faltaNoCadastroDoMonitor(p.monitores[0]).includes("CPF"));
});

/* --------------------------------- réguas -------------------------------- */

test("projeto completo não acusa falta; faltando o essencial, acusa", () => {
  assert.deepEqual(faltaNoProjeto(projetoBase()), []);
  const vazio = normalizarProjeto({});
  const f = faltaNoProjeto(vazio);
  assert.ok(f.includes("curso"));
  assert.ok(f.includes("disciplina"));
  assert.ok(f.includes("pelo menos um monitor indicado"));
});

test("carga horária semanal fora da faixa é falta", () => {
  assert.ok(faltaNoProjeto(projetoBase({ chSemanal: 40 })).some((x) => /carga horária semanal/.test(x)));
  const zero = projetoBase({ chSemanal: 0 });
  // 0 cai no padrão (4h) — quem manda vazio recebe o padrão, não um erro
  assert.equal(zero.chSemanal, CH_SEMANAL.padrao);
});

test("conclusão anterior ao início é falta", () => {
  const f = faltaNoProjeto(projetoBase({ inicio: "2026-12-12", fim: "2026-09-16" }));
  assert.ok(f.some((x) => /posterior/.test(x)));
});

test("item 2.4: CADA monitor precisa do próprio plano de trabalho, inclusive o único", () => {
  const p = projetoBase({ monitores: [
    { id: "m1", nome: "Marina Duarte", email: "marina@aluno.uniego.edu.br", plano: PLANO },
    { id: "m2", nome: "Pedro Lima", email: "pedro@aluno.uniego.edu.br" },
  ] });
  const f = faltaNoProjeto(p);
  assert.ok(!f.some((x) => /plano de trabalho de Marina/.test(x)), "o de Marina está completo");
  assert.ok(f.some((x) => /plano de trabalho de Pedro/.test(x)));
  // e com um monitor só a exigência é a mesma — o plano é dele, não do projeto
  const sozinho = projetoBase({ monitores: [{ id: "m1", nome: "Ana", email: "ana@x.com" }] });
  assert.ok(faltaNoProjeto(sozinho).some((x) => /plano de trabalho de Ana/.test(x)));
  assert.deepEqual(faltaNoProjeto(projetoBase()), []);
});

test("o plano cobra o que se avalia depois, e texto antigo vira a primeira seção", () => {
  assert.deepEqual(faltaNoPlano({ plano: PLANO }), []);
  const vazio = faltaNoPlano({ plano: {} });
  assert.ok(vazio.includes("atividades sob responsabilidade do monitor"));
  assert.ok(vazio.includes("dias e horários de atuação"));
  assert.ok(vazio.includes("competências que se espera desenvolver"));
  assert.ok(vazio.includes("como o professor acompanhará o monitor"));
  // local e forma de avaliação são opcionais — não travam a submissão
  assert.ok(!vazio.some((x) => /local de atuação/.test(x)));
  // o que já estava escrito em texto solto não se perde na mudança de formato
  const m = normalizarProjeto({ ...projetoBase(), monitores: [
    { id: "m1", nome: "Ana", email: "a@x.com", planoTrabalho: "Texto antigo do plano." }] });
  assert.equal(m.monitores[0].plano.atividades, "Texto antigo do plano.");
});

test("a ficha do monitor é o FORMULÁRIO: cobra dados, não documento anexado", () => {
  const p = projetoBase();
  const m = p.monitores[0];
  const f = faltaNoCadastroDoMonitor(m);
  for (const campo of ["número de matrícula", "CPF", "telefone", "curso", "período",
    "declaração de disponibilidade de carga horária"]) {
    assert.ok(f.includes(campo), `deveria cobrar: ${campo}`);
  }
  // a inscrição corre toda pelo formulário (decisão do dono, ago/2026):
  // matrícula e histórico se conferem nos sistemas acadêmicos, que já os têm
  assert.ok(!f.some((x) => /comprovante|histórico|anexo/i.test(x)));
  Object.assign(m, {
    matricula: "20231234", cpf: CPF_A, telefone: "62999990000", curso: "enfermagem",
    periodo: "6º", declaracao: { aceita: true, em: "2026-09-05" },
  });
  assert.deepEqual(faltaNoCadastroDoMonitor(m), []);
  assert.ok(monitorCadastrado(m));
  assert.ok(todosCadastrados(p));
  assert.deepEqual(pendenciasDoProjeto(p), []);
});

test("não há limite de vagas: dez indicações no mesmo projeto passam", () => {
  const dez = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`, nome: `Monitor ${i + 1}`, email: `m${i}@aluno.uniego.edu.br`, plano: PLANO }));
  assert.deepEqual(faltaNoProjeto(projetoBase({ monitores: dez })), []);
  assert.equal(normalizarProjeto(projetoBase({ monitores: dez })).monitores.length, 10);
});

const FOTOS = [
  { url: "https://drive/1", nome: "plantao.jpg", tipo: "image/jpeg" },
  { url: "https://drive/2", nome: "aula.jpg", tipo: "image/jpeg" },
  { url: "https://drive/3", nome: "mural.png", tipo: "image/png" },
];

test("o relatório exige fotos de evidência — e documento não conta como foto", () => {
  const base = { atividades: "x".repeat(200), aprendizado: "y".repeat(60) };
  assert.ok(faltaNoRelatorio(base).some((x) => /fotos de evidência/.test(x)));
  // PDF anexado é anexo, não é evidência fotográfica
  assert.ok(faltaNoRelatorio({ ...base, anexos: [
    { url: "u", nome: "lista.pdf", tipo: "application/pdf" }] }).some((x) => /fotos/.test(x)));
  assert.deepEqual(faltaNoRelatorio({ ...base, anexos: FOTOS }), []);
  assert.equal(fotosDoRelatorio({ anexos: [...FOTOS, { url: "u", nome: "x.pdf", tipo: "application/pdf" }] }).length, 3);
  assert.equal(faltamFotosMon({ anexos: FOTOS.slice(0, 1) }), 2);
  assert.equal(MIN_FOTOS_MONITORIA, 3);
});

test("relatório curto demais não sai, e a avaliação exige os quatro critérios e o parecer", () => {
  assert.ok(faltaNoRelatorio({ atividades: "fiz coisas" }).length);
  assert.deepEqual(faltaNoRelatorio({
    atividades: "x".repeat(200), aprendizado: "y".repeat(60), anexos: FOTOS,
  }), []);
  const f = faltaNaAvaliacao({ criterios: { assiduidade: "sim" } });
  assert.equal(f.length, CRITERIOS_MONITOR.length - 1 + 1); // 3 critérios + parecer
  assert.deepEqual(faltaNaAvaliacao({
    criterios: { assiduidade: "sim", cumprimento: "sim", envolvimento: "parcialmente", iniciativa: "nao" },
    parecer: "aprovado",
  }), []);
});

test("resposta fora do catálogo não é aceita como resposta", () => {
  const p = normalizarProjeto({ ...projetoBase(), monitores: [{
    id: "m1", nome: "Marina", email: "m@x.com",
    relatorio: { atividades: "a", avaliacao: { criterios: { assiduidade: "talvez" }, parecer: "adiado" } },
  }] });
  const av = p.monitores[0].relatorio.avaliacao;
  assert.equal(av.criterios.assiduidade, undefined);
  assert.equal(av.parecer, "");
});

/* ------------------------------ carga horária ---------------------------- */

test("semana iniciada conta, e a carga total sai do projeto", () => {
  assert.equal(semanasDe("2026-09-16", "2026-09-22"), 1);
  assert.equal(semanasDe("2026-09-16", "2026-09-23"), 2);
  assert.equal(semanasDe("2026-12-12", "2026-09-16"), 0);
  const p = projetoBase();                        // 88 dias → 13 semanas × 4h
  assert.equal(semanasDe(p.inicio, p.fim), 13);
  assert.equal(cargaHorariaTotal(p), 52);
  // a CH do monitor, quando declarada, tem precedência sobre a do projeto
  assert.equal(cargaHorariaTotal(p, { chSemanal: 6 }), 78);
});

/* -------------------------------- permissões ----------------------------- */

test("cada um tem o seu papel, e o papel nasce do projeto", () => {
  const p = projetoBase();
  p.criadoPor = "talita@uniego.edu.br";
  p.monitores[0].cpf = CPF_A;
  assert.equal(papelNoProjeto(p, { email: "talita@uniego.edu.br" }), "orientador");
  assert.equal(papelNoProjeto(p, { email: "marina@aluno.uniego.edu.br" }), "monitor");
  assert.equal(papelNoProjeto(p, { cpf: CPF_A }), "monitor");
  assert.equal(papelNoProjeto(p, { email: "outra@uniego.edu.br" }), null);
  assert.equal(papelNoProjeto(p, { email: "outra@uniego.edu.br", gestao: true }), "gestao");
});

test("submetido, a proposta fecha para o orientador — e reabre se devolvida", () => {
  const p = projetoBase();
  p.criadoPor = "talita@uniego.edu.br";
  const prof = { email: "talita@uniego.edu.br" };
  assert.ok(podeEditar(p, prof) && podeSubmeter(p, prof));
  p.status = "submetido";
  assert.ok(!podeEditar(p, prof) && !podeSubmeter(p, prof));
  assert.ok(podeEditar(p, { email: "x", gestao: true }));
  p.status = "devolvido";
  assert.ok(podeEditar(p, prof) && podeSubmeter(p, prof));
});

test("só a gestão decide, e só o que está na fila dela", () => {
  const p = projetoBase();
  p.criadoPor = "talita@uniego.edu.br";
  const gestao = { email: "proppex@uniego.edu.br", gestao: true };
  p.status = "aguardando-aluno";
  assert.ok(!podeDecidir(p, gestao));
  p.status = "submetido";
  assert.ok(podeDecidir(p, gestao));
  assert.ok(!podeDecidir(p, { email: "talita@uniego.edu.br" }));
});

test("o monitor não vê o CPF nem o relatório do colega de projeto", () => {
  const p = projetoBase({ monitores: [
    { id: "m1", nome: "Marina", email: "marina@x.com", cpf: CPF_A, telefone: "62..." },
    { id: "m2", nome: "Pedro", email: "pedro@x.com", cpf: CPF_B, telefone: "62...",
      relatorio: { atividades: "texto do Pedro", status: "enviado" } },
  ] });
  const v = visaoDoProjeto(p, { email: "marina@x.com" });
  assert.equal(v.papel, "monitor");
  assert.equal(v.monitores[0].cpf, CPF_A, "o próprio cadastro continua visível");
  assert.equal(v.monitores[1].cpf, undefined);
  assert.equal(v.monitores[1].telefone, undefined);
  assert.equal(v.monitores[1].relatorio.atividades, undefined);
  assert.equal(v.monitores[1].relatorio.status, "enviado");
  // o orientador vê os dois — ele indicou e é quem avalia
  const vo = visaoDoProjeto(p, { email: "talita@uniego.edu.br" });
  assert.equal(vo.papel, "orientador");
  assert.equal(vo.monitores[1].cpf, CPF_B);
  assert.equal(vo.monitores[1].relatorio.atividades, "texto do Pedro");
});

test("quem não é do projeto não recebe projeto nenhum", () => {
  assert.equal(visaoDoProjeto(projetoBase(), { email: "estranho@x.com" }), null);
});

/* -------------------------------- pendências ----------------------------- */

test("a fila da gestão diz o que espera cada um, com o atraso na frente", () => {
  const emAnalise = { ...projetoBase(), id: "a", protocolo: "MON-2026-001", status: "submetido" };
  const emExecucao = {
    ...projetoBase(), id: "b", protocolo: "MON-2026-002", status: "aprovado",
    monitores: [
      { id: "m1", nome: "Marina", email: "m@x.com", relatorio: null },
      { id: "m2", nome: "Pedro", email: "p@x.com", relatorio: { status: "enviado" } },
      { id: "m3", nome: "Caio", email: "c@x.com", relatorio: { status: "validado" } },
    ],
  };
  const itens = pendenciasDoCiclo([emAnalise, emExecucao], "2026-12-20");
  const tipos = itens.map((i) => i.tipo);
  assert.ok(tipos.includes("analise"));
  assert.ok(tipos.includes("relatorio"));
  assert.ok(tipos.includes("validacao"));
  assert.ok(tipos.includes("homologacao"));
  assert.equal(itens[0].tipo, "relatorio", "o mais atrasado vem primeiro");
  assert.equal(itens[0].atraso, 6);            // 14/12 → 20/12
});

test("a cobrança do relatório abre 30 dias antes do prazo e não antes", () => {
  // prazo 14/12 → a cobrança começa em 14/11
  assert.ok(!cobrancaAberta("2026-11-13"));
  assert.ok(cobrancaAberta("2026-11-14"));
  assert.ok(cobrancaAberta("2026-12-20"), "depois do prazo continua cobrando");
  assert.equal(COBRANCA.diasAntes, 30);
  assert.equal(COBRANCA.intervaloDias, 7);
  assert.equal(diasParaRelatorio("2026-12-14"), 0);
  assert.equal(diasParaRelatorio("2026-11-14"), 30);
  assert.equal(diasParaRelatorio("2026-12-20"), -6);
});

test("o cronograma do edital bate com os prazos que o sistema cobra", () => {
  const ate = (re) => CRONOGRAMA.find((c) => re.test(c.etapa))?.ate;
  assert.equal(ate(/Submissão/), PRAZOS.submissao);
  assert.equal(ate(/Análise/), PRAZOS.analise);
  assert.equal(ate(/Publicação/), PRAZOS.resultado);
  assert.equal(ate(/Relatório Final/), PRAZOS.relatorio);
  assert.equal(PRAZOS.relatorio, "2026-12-14");
  assert.equal(PRAZOS.resultado, "2026-09-10");
});

test("a submissão fecha na data do edital", () => {
  assert.ok(submissaoAberta("2026-09-04"));
  assert.ok(!submissaoAberta("2026-09-05"));
  assert.equal(PRAZOS.submissao, "2026-09-04");
});

/* ------------------------------- certificados ---------------------------- */

function projetoConcluido() {
  const p = projetoBase({ monitores: [
    { id: "m1", nome: "Marina Duarte", email: "marina@x.com", cpf: CPF_A,
      relatorio: { status: "homologado", avaliacao: { parecer: "aprovado" } } },
    { id: "m2", nome: "Pedro Lima", email: "pedro@x.com",
      relatorio: { status: "homologado", avaliacao: { parecer: "reprovado" } } },
  ] });
  p.id = "p1"; p.protocolo = "MON-2026-001"; p.status = "concluido";
  p.criadoPor = "talita@uniego.edu.br";
  return p;
}

test("o monitor aprovado certifica; o reprovado, não", () => {
  const p = projetoConcluido();
  const c1 = certificadosDe([p], { email: "marina@x.com" });
  assert.equal(c1.length, 1);
  assert.equal(c1[0].tipo, "monitoria");
  assert.equal(c1[0].horas, 52);
  assert.equal(c1[0].disciplina, "Semiologia e Semiotécnica");
  assert.deepEqual(certificadosDe([p], { email: "pedro@x.com" }), []);
});

test("o docente recebe UM certificado por projeto, com os monitores nomeados", () => {
  const c = certificadosDe([projetoConcluido()], { email: "talita@uniego.edu.br" });
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, "orientacao-monitoria");
  assert.deepEqual(c[0].monitores, ["Marina Duarte"]);
});

test("projeto que não concluiu não gera certificado nenhum", () => {
  const p = projetoConcluido();
  p.status = "aprovado";
  assert.deepEqual(certificadosDe([p], { email: "marina@x.com" }), []);
  assert.deepEqual(certificadosDe([p], { email: "talita@uniego.edu.br" }), []);
});

test("sem chave nenhuma, ninguém recebe a lista de certificados", () => {
  assert.deepEqual(certificadosDe([projetoConcluido()], {}), []);
});

/* ------------------------------ lista e painel --------------------------- */

test("o resumo diz de relance o que a lista precisa", () => {
  const p = projetoConcluido();
  const r = resumir(p, { email: "talita@uniego.edu.br" });
  assert.equal(r.protocolo, "MON-2026-001");
  assert.equal(r.papel, "orientador");
  assert.equal(r.cargaTotal, 52);
  assert.equal(r.monitores.length, 2);
  assert.equal(r.relatoriosPendentes, 0);
});

test("o panorama conta o ciclo, não a base inteira", () => {
  const doCiclo = projetoConcluido();
  const outro = { ...projetoBase(), id: "x", edital: "01/2025", status: "concluido" };
  const pan = panorama([doCiclo, outro], "03/2026");
  assert.equal(pan.total, 1);
  assert.equal(pan.porStatus.concluido, 1);
  assert.equal(pan.monitores, 2);
  assert.equal(pan.relatoriosHomologados, 2);
  assert.ok(STATUS.every((s) => s in pan.porStatus));
});
