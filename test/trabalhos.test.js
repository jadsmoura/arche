import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarConfig, configPublica, podeSubmeter, validarSubmissao, novoTrabalho, proximoNumero,
  designar, registrarParecer, decidir, reenviar, retirar, paraRevisor, paraAutor, paraGestao,
  resumo, normalizarRevisores, CRITERIOS, todosPareceresEntregues, notaMedia,
} from "../lib/trabalhos.js";

const CFG = { ativo: true, modalidades: ["resumo", "completo"], areas: ["Saúde", "Educação"], prazoSubmissao: "2026-10-01" };
const DADOS = {
  titulo: "Prevalência de anemia em gestantes atendidas na atenção básica",
  modalidade: "resumo", area: "Saúde",
  resumo: "x".repeat(400), palavrasChave: "anemia, gestação, atenção básica",
  autores: [{ nome: "Ana Souza", email: "ana@x.com", instituicao: "UNIEGO" }, { nome: "Bia Lima", email: "" }],
  consentimento: true,
};
const parecerBom = (rec = "aceitar") => ({
  notas: Object.fromEntries(CRITERIOS.map((c) => [c.codigo, 4])), recomendacao: rec,
  comentariosAutor: "Trabalho bem delimitado; sugiro detalhar a amostra na versão final.",
  comentariosComissao: "Sem conflito.",
});

test("a configuração tem padrões e recorta o que não existe", () => {
  const c = normalizarConfig({ ativo: true, modalidades: ["completo", "xis"], revisoresPorTrabalho: 9, prazoSubmissao: "hoje" });
  assert.deepEqual(c.modalidades, ["completo"]);
  assert.equal(c.revisoresPorTrabalho, 5, "teto de 5 revisores");
  assert.equal(c.prazoSubmissao, "", "data inválida não entra");
  assert.equal(normalizarConfig({}).modalidades[0], "resumo");
  assert.equal(configPublica({ ativo: false }, "2026-09-01"), null, "módulo desligado não sai na página");
  assert.equal(configPublica(CFG, "2026-09-01").aberta, true);
  assert.match(podeSubmeter(CFG, "2026-10-02").motivo, /encerrou em 01\/10\/2026/);
});

test("a submissão só entra completa", () => {
  assert.deepEqual(validarSubmissao(CFG, DADOS), []);
  const f = validarSubmissao(CFG, { ...DADOS, titulo: "curto", area: "Outra", palavrasChave: "uma", consentimento: false });
  assert.ok(f.some((x) => /título/.test(x)));
  assert.ok(f.some((x) => /área/.test(x)));
  assert.ok(f.some((x) => /palavras-chave/.test(x)));
  assert.ok(f.some((x) => /concordância/.test(x)));
  assert.ok(validarSubmissao(CFG, { ...DADOS, modalidade: "completo" }).some((x) => /arquivo/.test(x)), "trabalho completo exige arquivo");
  assert.deepEqual(validarSubmissao(CFG, { ...DADOS, modalidade: "completo" }, { temArquivo: true }), []);
  assert.ok(validarSubmissao(CFG, { ...DADOS, autores: [{ nome: "Ana", email: "sem-arroba" }] }).some((x) => /e-mail do autor/.test(x)));
});

test("o fluxo inteiro: submissão → designação → pareceres → decisão → correção → nova versão", () => {
  const t = novoTrabalho(CFG, DADOS, { numero: proximoNumero([]), agora: "2026-09-10T10:00:00.000Z" });
  assert.equal(t.numero, "TR-001");
  assert.equal(proximoNumero([t, { numero: "TR-007" }]), "TR-008");
  assert.equal(t.estado, "submetido");
  assert.equal(t.emailContato, "ana@x.com");
  assert.equal(t.autores.length, 2);
  assert.match(t.token, /^[0-9a-f]{24}$/);

  // designar: o autor não revisa o próprio trabalho; repetido não entra
  const novos = designar(t, [{ email: "rev1@x.com", nome: "R1" }, { email: "ana@x.com" }, { email: "rev2@x.com" }, { email: "rev1@x.com" }], { por: "gestao" });
  assert.equal(novos.length, 2);
  assert.equal(t.estado, "em-avaliacao");
  assert.notEqual(novos[0].token, novos[1].token);

  // o revisor vê o trabalho SEM autores
  const vr = paraRevisor(t, novos[0].token);
  assert.equal(vr.titulo, t.titulo);
  assert.equal(vr.autores, undefined);
  assert.equal(JSON.stringify(vr).includes("ana@x.com"), false, "nenhum e-mail de autor vaza ao revisor");
  assert.equal(paraRevisor(t, "token-errado"), null);

  // parecer incompleto não entra; completo muda o estado quando é o último
  assert.match(registrarParecer(t, novos[0].token, { notas: {}, recomendacao: "aceitar", comentariosAutor: "ok" }).erro, /Falta/);
  assert.equal(registrarParecer(t, novos[0].token, parecerBom()).ok, true);
  assert.equal(t.estado, "em-avaliacao", "ainda falta um parecer");
  assert.equal(todosPareceresEntregues(t), false);
  assert.equal(registrarParecer(t, novos[1].token, parecerBom("aceitar-com-correcoes")).ok, true);
  assert.equal(t.estado, "avaliado");
  assert.equal(notaMedia(t), 4);

  // antes da decisão o autor não vê parecer nenhum
  assert.equal(paraAutor(t).pareceres.length, 0);
  assert.equal(paraAutor(t).podeReenviar, false);

  // devolver para correção exige a mensagem; depois o autor vê os pareceres anônimos
  assert.match(decidir(t, CFG, { codigo: "correcao", mensagem: "", por: "gestao" }).erro, /o que corrigir/);
  assert.equal(decidir(t, CFG, { codigo: "correcao", mensagem: "Ajuste a metodologia conforme os pareceres.", por: "gestao" }).ok, true);
  assert.equal(t.estado, "correcao");
  const va = paraAutor(t);
  assert.equal(va.pareceres.length, 2);
  assert.deepEqual(va.pareceres.map((p) => p.revisor), ["Revisor A", "Revisor B"]);
  assert.equal(JSON.stringify(va).includes("rev1@x.com"), false, "o autor não sabe quem avaliou");
  assert.equal(JSON.stringify(va).includes("Sem conflito"), false, "os comentários à comissão não saem ao autor");
  assert.equal(va.podeReenviar, true);

  // a versão corrigida
  assert.match(reenviar(t, { resumo: "curto" }).erro, /200/);
  const r = reenviar(t, { resumo: "y".repeat(300), nota: "Ajustei a amostra.", agora: "2026-09-12T10:00:00.000Z" });
  assert.equal(r.versao, 2);
  assert.equal(t.estado, "reenviado");
  assert.equal(t.versoes.length, 2);
  assert.match(reenviar(t, { resumo: "y".repeat(300) }).erro, /não está aguardando correção/);

  // a decisão final; a gestão vê tudo, sem tokens
  assert.equal(decidir(t, CFG, { codigo: "aceito", por: "gestao" }).ok, true);
  assert.equal(t.estado, "aceito");
  const vg = paraGestao(t);
  assert.equal(vg.token, undefined);
  assert.equal(vg.revisores[0].token, undefined);
  assert.equal(vg.revisores[0].email, "rev1@x.com");
  assert.equal(vg.pareceresEntregues, 2);
  // trabalho encerrado não aceita parecer nem retirada
  assert.match(registrarParecer(t, novos[0].token, parecerBom()).erro, /já foi decidido/);
  assert.match(retirar(t).erro, /encerrado/);
});

test("a decisão pode exigir parecer, e o resumo conta o que espera cada um", () => {
  const t = novoTrabalho(CFG, DADOS, { numero: "TR-001" });
  assert.match(decidir(t, { ...CFG, exigeParecer: true }, { codigo: "aceito" }).erro, /exige ao menos um parecer/);
  assert.equal(decidir(t, CFG, { codigo: "rejeitado", mensagem: "Fora do escopo." }).ok, true, "sem a chave, a coordenação decide direto");
  const t2 = novoTrabalho(CFG, DADOS, { numero: "TR-002" });
  designar(t2, [{ email: "r@x.com" }]);
  const t3 = novoTrabalho(CFG, DADOS, { numero: "TR-003" });
  assert.equal(retirar(t3).ok, true);
  const r = resumo([t, t2, t3]);
  assert.equal(r.total, 3);
  assert.equal(r.aguardandoRevisores, 1);
  assert.equal(r.porEstado.rejeitado, 1);
  assert.equal(r.porEstado.retirado, 1);
});

test("o cadastro de revisores deduplica e exige e-mail", () => {
  const l = normalizarRevisores([{ nome: "R1", email: "R1@X.com", areas: "Saúde; Educação" }, { nome: "R1b", email: "r1@x.com" }, { nome: "", email: "r2@x.com" }, { nome: "R3", email: "sem" }]);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].areas, ["Saúde", "Educação"]);
});
