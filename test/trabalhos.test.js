import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarConfig, configPublica, podeSubmeter, validarSubmissao, novoTrabalho, proximoNumero,
  designar, registrarParecer, decidir, reenviar, retirar, paraRevisor, paraAutor, paraGestao,
  resumo, normalizarRevisores, CRITERIOS, todosPareceresEntregues, notaMedia, contarPalavras,
  autoriaCompleta, SECOES, normasPadrao,
} from "../lib/trabalhos.js";

const CFG = { ativo: true, modalidades: ["resumo", "completo"], areas: ["Saúde", "Educação"], prazoSubmissao: "2026-10-01" };
const CURSOS = ["Enfermagem", "Psicologia", "Mestrado em Sociedade, Tecnologia e Meio Ambiente"];
const palavras = (n) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");
const PESSOA = { nome: "Ana Souza", email: "ana@x.com", instituicao: "UNIEGO", titulacao: "graduando" };
const ORI = { nome: "Carlos Lima", email: "carlos@x.com", instituicao: "UNIEGO", titulacao: "doutor" };
const DADOS = {
  titulo: "Prevalência de anemia em gestantes atendidas na atenção básica", tituloEn: "Anemia prevalence in pregnant women",
  modalidade: "resumo", area: "Saúde", curso: "Enfermagem",
  resumo: palavras(210), abstract: palavras(200), palavrasChave: "anemia, gestação, atenção básica", keywords: "anemia; pregnancy; primary care",
  autores: [PESSOA, { nome: "Bia Lima", email: "", instituicao: "UNIEGO", titulacao: "graduando" }],
  orientador: ORI, revisor: { nome: "Rita Prado", email: "rita@x.com", instituicao: "UFG" }, consentimento: true,
};
const secoes = () => Object.fromEntries(SECOES.map((s) => [s.codigo, `Texto da seção ${s.nome} com mais de cinquenta caracteres para passar.`]));
const parecerBom = (rec = "aceitar") => ({
  notas: Object.fromEntries(CRITERIOS.map((c) => [c.codigo, 4])), recomendacao: rec,
  comentariosAutor: "Trabalho bem delimitado; sugiro detalhar a amostra na versão final.",
  comentariosComissao: "Sem conflito.",
});

test("a configuração tem padrões e recorta o que não existe", () => {
  const c = normalizarConfig({ ativo: true, modalidades: ["completo", "expandido"], revisoresPorTrabalho: 9, prazoSubmissao: "hoje" });
  assert.deepEqual(c.modalidades, ["completo"], "só as duas modalidades existem");
  assert.equal(c.revisoresPorTrabalho, 5);
  assert.equal(c.prazoSubmissao, "");
  assert.equal(c.exigeParecer, false, "a PROPPEX decide direto por padrão");
  assert.equal(c.normasPadrao, true, "sem texto do organizador valem as normas padrão");
  assert.equal(c.pedeRevisor, true, "o autor indica um revisor ao submeter");
  assert.equal(c.exigeInscricao, true, "só o inscrito submete, por padrão (área do inscrito)");
  assert.equal(normalizarConfig({ exigeInscricao: false }).exigeInscricao, false);
  assert.equal(configPublica(CFG, "2026-09-01", { cursos: CURSOS }).exigeInscricao, true);
  assert.equal(configPublica({ ativo: false }, "2026-09-01"), null);
  const pub = configPublica(CFG, "2026-09-01", { cursos: CURSOS });
  assert.equal(pub.aberta, true);
  assert.deepEqual(pub.cursos, CURSOS);
  assert.equal(pub.minPalavrasResumo, 200);
  // as normas padrão saem da própria configuração: limites, prazo e modalidades
  assert.match(pub.normas, /no mínimo 200 e no máximo 500 palavras/);
  assert.match(pub.normas, /Submissões até 01\/10\/2026/);
  assert.match(pub.normas, /7\. TRABALHO COMPLETO/);
  assert.match(pub.normas, /REVISOR INDICADO/);
  assert.doesNotMatch(configPublica({ ...CFG, modalidades: ["resumo"], pedeRevisor: false }, "2026-09-01").normas, /TRABALHO COMPLETO|REVISOR INDICADO/);
  assert.equal(configPublica({ ...CFG, normasPadrao: false, normas: "As minhas normas." }, "2026-09-01").normas, "As minhas normas.");
  assert.match(normasPadrao(CFG), /Times New Roman 12/);
  assert.match(podeSubmeter(CFG, "2026-10-02").motivo, /encerrou em 01\/10\/2026/);
});

test("o resumo conta PALAVRAS, e a autoria completa exige nome, e-mail, filiação e titulação", () => {
  assert.equal(contarPalavras("  a  b\nc "), 3);
  assert.deepEqual(validarSubmissao(CFG, DADOS, { cursos: CURSOS }), []);
  const f = validarSubmissao(CFG, { ...DADOS, resumo: palavras(150), curso: "Outro", orientador: { nome: "Só" }, autores: [{ nome: "Ana Souza", email: "x", instituicao: "", titulacao: "" }] }, { cursos: CURSOS });
  assert.ok(f.some((x) => /200 palavras \(tem 150\)/.test(x)));
  assert.ok(f.some((x) => /curso/.test(x)));
  assert.ok(f.some((x) => /nome completo \(orientador\)/.test(x)));
  assert.ok(f.some((x) => /e-mail válido \(autor correspondente\)/.test(x)));
  assert.ok(f.some((x) => /filiação institucional \(autor correspondente\)/.test(x)));
  assert.ok(f.some((x) => /titulação \(autor correspondente\)/.test(x)));
  // o segundo autor pode vir sem e-mail; o correspondente, não
  assert.deepEqual(validarSubmissao(CFG, { ...DADOS, autores: [PESSOA, { ...PESSOA, nome: "Bia Lima", email: "" }] }, { cursos: CURSOS }), []);
  // o revisor indicado: nome completo e e-mail, e nunca quem assina o trabalho
  assert.ok(validarSubmissao(CFG, { ...DADOS, revisor: { nome: "Rita", email: "x" } }, { cursos: CURSOS }).some((x) => /nome completo do revisor/.test(x)));
  assert.ok(validarSubmissao(CFG, { ...DADOS, revisor: { nome: "Carlos Lima", email: "carlos@x.com" } }, { cursos: CURSOS }).some((x) => /não seja autor nem orientador/.test(x)));
  assert.deepEqual(validarSubmissao({ ...CFG, pedeRevisor: false }, { ...DADOS, revisor: {} }, { cursos: CURSOS }), [], "sem a chave, o revisor não se cobra");
  // o trabalho completo exige as seis seções
  const fc = validarSubmissao(CFG, { ...DADOS, modalidade: "completo" }, { cursos: CURSOS });
  assert.equal(fc.filter((x) => /a seção/.test(x)).length, 6);
  assert.deepEqual(validarSubmissao(CFG, { ...DADOS, modalidade: "completo", idioma: "en", secoes: secoes() }, { cursos: CURSOS }), []);
});

test("o fluxo inteiro: submissão → decisão direta da PROPPEX, e o caminho pelos revisores", () => {
  const t = novoTrabalho(CFG, { ...DADOS, modalidade: "completo", idioma: "en", secoes: secoes() }, { numero: proximoNumero([]), agora: "2026-09-10T10:00:00.000Z" });
  assert.equal(t.numero, "TR-001");
  assert.equal(t.estado, "submetido");
  assert.equal(t.emailContato, "ana@x.com");
  assert.deepEqual(t.revisorIndicado, { nome: "Rita Prado", email: "rita@x.com", instituicao: "UFG" });
  assert.equal(paraAutor(t).revisorIndicado.nome, "Rita Prado");
  assert.equal(JSON.stringify(paraRevisor(t, "x")), "null");
  assert.equal(t.orientador.nome, "Carlos Lima");
  assert.equal(autoriaCompleta(t).at(-1).orientador, true, "o orientador é o último autor");
  assert.equal(t.versoes[0].idioma, "en");
  assert.equal(Object.keys(t.versoes[0].secoes).length, 6);
  assert.equal(t.tituloEn, "Anemia prevalence in pregnant women");

  // a PROPPEX pode decidir DIRETO, sem parecer — mas a recusa exige o motivo
  const t0 = novoTrabalho(CFG, DADOS, { numero: "TR-000" });
  assert.match(decidir(t0, CFG, { codigo: "rejeitado", mensagem: "" }).erro, /motivo da recusa/);
  assert.equal(decidir(t0, CFG, { codigo: "aceito", por: "proppex" }).ok, true);
  assert.equal(t0.estado, "aceito");

  // ou mandar a revisores: o autor e o orientador não revisam o próprio trabalho
  const novos = designar(t, [{ email: "rev1@x.com", nome: "R1" }, { email: "ana@x.com" }, { email: "carlos@x.com" }, { email: "rev2@x.com" }, { email: "rev1@x.com" }], { por: "gestao" });
  assert.equal(novos.length, 2);
  assert.equal(t.estado, "em-avaliacao");

  const vr = paraRevisor(t, novos[0].token);
  assert.equal(vr.titulo, t.titulo);
  assert.equal(vr.autores, undefined);
  assert.equal(vr.orientador, undefined);
  assert.equal(JSON.stringify(vr).includes("ana@x.com"), false, "nenhum e-mail de autor vaza ao revisor");
  assert.equal(JSON.stringify(vr).includes("Carlos"), false, "nem o orientador");
  assert.equal(vr.versao.secoes.introducao.length > 0, true, "o revisor lê as seções");

  assert.equal(registrarParecer(t, novos[0].token, parecerBom()).ok, true);
  assert.equal(t.estado, "em-avaliacao");
  assert.equal(registrarParecer(t, novos[1].token, parecerBom("aceitar-com-correcoes")).ok, true);
  assert.equal(t.estado, "avaliado");
  assert.equal(notaMedia(t), 4);
  assert.equal(paraAutor(t).pareceres.length, 0, "antes da decisão o autor não vê parecer");

  assert.match(decidir(t, CFG, { codigo: "correcao", mensagem: "", por: "gestao" }).erro, /o que corrigir/);
  assert.equal(decidir(t, CFG, { codigo: "correcao", mensagem: "Ajuste a metodologia conforme os pareceres.", por: "gestao" }).ok, true);
  const va = paraAutor(t);
  assert.deepEqual(va.pareceres.map((p) => p.revisor), ["Revisor A", "Revisor B"]);
  assert.equal(JSON.stringify(va).includes("rev1@x.com"), false);
  assert.equal(JSON.stringify(va).includes("Sem conflito"), false);
  assert.equal(va.podeReenviar, true);

  // a versão corrigida é o formulário inteiro de novo, com a mesma régua
  assert.match(reenviar(t, CFG, { resumo: "curto", secoes: secoes(), palavrasChave: "a,b,c" }).erro, /200 palavras/);
  const r = reenviar(t, CFG, { titulo: "Prevalência de anemia em gestantes — versão revista", resumo: palavras(220), palavrasChave: "a, b, c", idioma: "pt", secoes: secoes(), nota: "Ajustei." }, { agora: "2026-09-12T10:00:00.000Z" });
  assert.equal(r.versao, 2);
  assert.equal(t.estado, "reenviado");
  assert.equal(t.titulo, "Prevalência de anemia em gestantes — versão revista");
  assert.equal(t.versoes[1].idioma, "pt");
  assert.match(reenviar(t, CFG, {}).erro, /não está aguardando correção/);

  assert.equal(decidir(t, CFG, { codigo: "aceito", por: "gestao" }).ok, true);
  const vg = paraGestao(t);
  assert.equal(vg.token, undefined);
  assert.equal(vg.revisores[0].token, undefined);
  assert.equal(vg.pareceresEntregues, 2);
  assert.match(registrarParecer(t, novos[0].token, parecerBom()).erro, /já foi decidido/);
  assert.match(retirar(t).erro, /encerrado/);
});

test("a chave exigeParecer segura a decisão sem parecer; o resumo conta o que espera cada um", () => {
  const t = novoTrabalho(CFG, DADOS, { numero: "TR-001" });
  assert.match(decidir(t, { ...CFG, exigeParecer: true }, { codigo: "aceito" }).erro, /exige ao menos um parecer/);
  const t2 = novoTrabalho(CFG, DADOS, { numero: "TR-002" });
  designar(t2, [{ email: "r@x.com" }]);
  const t3 = novoTrabalho(CFG, DADOS, { numero: "TR-003" });
  assert.equal(retirar(t3).ok, true);
  const r = resumo([t, t2, t3]);
  assert.equal(r.total, 3);
  assert.equal(r.aguardandoCoordenacao, 1);
  assert.equal(r.aguardandoRevisores, 1);
  assert.equal(r.porEstado.retirado, 1);
  assert.equal(todosPareceresEntregues(t2), false);
});

test("o cadastro de revisores deduplica e exige e-mail", () => {
  const l = normalizarRevisores([{ nome: "R1", email: "R1@X.com", areas: "Saúde; Educação" }, { nome: "R1b", email: "r1@x.com" }, { nome: "", email: "r2@x.com" }, { nome: "R3", email: "sem" }]);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].areas, ["Saúde", "Educação"]);
});
