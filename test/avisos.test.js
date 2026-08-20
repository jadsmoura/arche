/* O interruptor dos avisos automáticos.
   O que se protege aqui: aviso que ninguém configurou continua LIGADO (o
   contrário seria um e-mail que nunca sai e ninguém percebe), silêncio com
   prazo volta sozinho, e o catálogo diz o que se perde ao calar cada um. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AVISOS, SETORES_AVISO, aplicarMudanca, avisoDe, avisoLigado, avisosDoSetor,
  normalizarConfig, quantosSilenciados, situacaoDosAvisos,
} from "../lib/avisos.js";

test("o padrão é LIGADO — aviso fora da configuração continua saindo", () => {
  assert.equal(avisoLigado({}, "ic-movimentacao", "2026-08-20"), true);
  assert.equal(avisoLigado(null, "qualquer-coisa", "2026-08-20"), true);
  // é o que faz um aviso NOVO no catálogo nascer funcionando
  assert.equal(avisoLigado({ "ex-nova-proposta": { estado: "desligado" } },
    "ic-movimentacao", "2026-08-20"), true);
});

test("silenciar tem prazo, e o prazo se cumpre sozinho", () => {
  const cfg = { "ic-movimentacao": { estado: "silenciado", ate: "2026-09-30" } };
  assert.equal(avisoLigado(cfg, "ic-movimentacao", "2026-08-20"), false, "dentro do silêncio");
  assert.equal(avisoLigado(cfg, "ic-movimentacao", "2026-09-30"), false, "no último dia ainda cala");
  assert.equal(avisoLigado(cfg, "ic-movimentacao", "2026-10-01"), true, "vencido, volta sozinho");
  // desligado não volta sozinho — é essa a diferença entre os dois estados
  const off = { "ic-movimentacao": { estado: "desligado" } };
  assert.equal(avisoLigado(off, "ic-movimentacao", "2030-01-01"), false);
});

test("silenciado sem data seria um desligado disfarçado — a normalização o rejeita", () => {
  const cfg = normalizarConfig({ "ic-movimentacao": { estado: "silenciado", ate: "" } });
  assert.deepEqual(cfg, {}, "sem data de retorno não vira silêncio");
  const ok = normalizarConfig({ "ic-movimentacao": { estado: "silenciado", ate: "2026-09-30" } });
  assert.equal(ok["ic-movimentacao"].ate, "2026-09-30");
  // ligado não ocupa espaço na configuração: guarda-se só o que foge do padrão
  assert.deepEqual(normalizarConfig({ "ic-movimentacao": { estado: "ligado" } }), {});
  // código que não existe no catálogo não entra
  assert.deepEqual(normalizarConfig({ "nao-existe": { estado: "desligado" } }), {});
  // data torta é descartada
  assert.deepEqual(normalizarConfig({ "ic-movimentacao": { estado: "silenciado", ate: "30/09" } }), {});
});

test("aplicar a mudança valida o que vem da tela", () => {
  const hoje = "2026-08-20";
  assert.match(aplicarMudanca({}, { codigo: "nao-existe", estado: "desligado" }, hoje).erro, /desconhecido/i);
  assert.match(aplicarMudanca({}, { codigo: "ic-movimentacao", estado: "talvez" }, hoje).erro, /inválido/i);
  assert.match(aplicarMudanca({}, { codigo: "ic-movimentacao", estado: "silenciado" }, hoje).erro, /até que dia/i);
  assert.match(aplicarMudanca({}, { codigo: "ic-movimentacao", estado: "silenciado", ate: "2026-01-01" }, hoje).erro,
    /já passou/i, "silenciar até ontem não silencia nada");

  const r = aplicarMudanca({}, { codigo: "ic-movimentacao", estado: "silenciado", ate: "2026-09-30", por: "eu@x" }, hoje);
  assert.equal(r.config["ic-movimentacao"].estado, "silenciado");
  assert.equal(r.config["ic-movimentacao"].por, "eu@x");
  // religar apaga o registro em vez de guardar "ligado"
  const r2 = aplicarMudanca(r.config, { codigo: "ic-movimentacao", estado: "ligado" }, hoje);
  assert.deepEqual(r2.config, {});
});

test("a situação da tela resolve o silêncio vencido", () => {
  const cfg = { "ic-movimentacao": { estado: "silenciado", ate: "2026-08-10" } };
  const linha = situacaoDosAvisos(cfg, "2026-08-20").find((a) => a.codigo === "ic-movimentacao");
  assert.equal(linha.ligado, true);
  assert.equal(linha.vencido, true, "a tela precisa dizer que o silêncio acabou");
  assert.equal(quantosSilenciados(cfg, "2026-08-20"), 0);
  assert.equal(quantosSilenciados({ "ic-movimentacao": { estado: "desligado" } }, "2026-08-20"), 1);
});

test("o catálogo é completo e cada aviso pertence a um setor que existe", () => {
  const setores = new Set(SETORES_AVISO.map((s) => s.chave));
  for (const a of AVISOS) {
    assert.ok(a.codigo && a.rotulo && a.texto && a.seDesligar, `aviso incompleto: ${a.codigo}`);
    assert.ok(setores.has(a.setor), `setor desconhecido em ${a.codigo}: ${a.setor}`);
    assert.ok(["gestao", "pessoa"].includes(a.destino), `destino inválido em ${a.codigo}`);
  }
  // códigos únicos: dois iguais fariam um interruptor mexer no outro
  assert.equal(new Set(AVISOS.map((a) => a.codigo)).size, AVISOS.length);
  // todo setor do catálogo tem pelo menos um aviso — senão sobraria bloco vazio
  for (const s of SETORES_AVISO) assert.ok(avisosDoSetor(s.chave).length, `setor sem avisos: ${s.chave}`);
  assert.equal(avisoDe("ic-movimentacao").destino, "gestao");
  assert.equal(avisoDe("ic-convite-aluno").critico, true, "convite é mensagem a uma pessoa");
});
