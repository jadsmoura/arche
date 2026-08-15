/* Edital 01/2026: modalidades, pontuação da produção acadêmica e a
   classificação das propostas. Confere também o lote de submissões que
   acompanha o sistema (dados/ic-edital-01-2026.json). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDITAL, LINHAS, MODALIDADES, GRUPOS_PESQUISA, FOMENTOS, BLOCOS_PRODUCAO, ITENS_PRODUCAO,
  modalidadeDe, modalidadePor, modalidadeVigente, modalidadesDaLinha,
  normalizarTitulacao, titulacaoAtende, pontuarProducao, normalizarProducao, notaClassificacao,
  gruposConhecidos, normalizarGrupo, CRITERIOS_AVALIACAO, NOTA_MAXIMA_PROJETO, classificarProjetos,
} from "../lib/edital.js";
import { cpfValido } from "../lib/cpf.js";
import { normalizarProjeto, validarProjeto, modalidadeEfetiva } from "../lib/ic.js";

/* ----------------------------- modalidades ------------------------------ */
test("as oito modalidades do edital, três linhas e o cruzamento entre elas", () => {
  assert.equal(MODALIDADES.length, 8);
  assert.deepEqual(LINHAS.map((l) => l.codigo), ["ic", "it", "ie"]);
  for (const l of LINHAS) {
    const daLinha = modalidadesDaLinha(l.codigo);
    assert.ok(daLinha.length >= 2, `${l.codigo} precisa de ao menos bolsa e voluntária`);
    assert.ok(daLinha.some((m) => !m.bolsa), `${l.codigo} sem modalidade voluntária`);
  }
  assert.equal(modalidadePor("ic", "cnpq").codigo, "pibic-cnpq");
  assert.equal(modalidadePor("ic", "uniego").codigo, "pbic-uniego");
  assert.equal(modalidadePor("ic", "voluntario").codigo, "pvic-uniego");
  assert.equal(modalidadePor("ie", "voluntario").codigo, "pvie-uniego");
  assert.equal(modalidadePor("it", "cnpq").codigo, "pibiti-cnpq");
  assert.equal(modalidadePor("ie", "cnpq"), null, "o CNPq não financia iniciação à extensão neste edital");
});

test("a bolsa do UNIEGO vale R$ 350 e a do CNPq segue a tabela do órgão", () => {
  assert.equal(modalidadeDe("pbic-uniego").valor, 350);
  assert.equal(modalidadeDe("pibic-cnpq").valor, null, "o valor do CNPq não é fixado por nós");
  assert.equal(modalidadeDe("pvic-uniego").valor, 0);
});

test("os códigos curtos antigos continuam resolvendo", () => {
  assert.equal(modalidadeVigente("pibic"), "pibic-cnpq");
  assert.equal(modalidadeVigente("voluntaria"), "pvic-uniego");
  assert.equal(modalidadeDe(modalidadeVigente("pibiti")).nome, "PIBITI/CNPq");
});

test("a titulação vem como texto livre e precisa ser entendida assim", () => {
  for (const [escrito, esperado] of [
    ["Doutor", "doutor"], ["Doutora", "doutor"], ["DOUTORA", "doutor"], ["Dr.", "doutor"],
    ["Mestre", "mestre"], ["mestra", "mestre"], ["Especialista", "especialista"], ["", ""], ["Graduado", ""],
  ]) assert.equal(normalizarTitulacao(escrito), esperado, `"${escrito}"`);
});

test("cada modalidade cobra a titulação mínima do item 4.4", () => {
  assert.equal(titulacaoAtende("Doutora", "pibic-cnpq"), true);
  assert.equal(titulacaoAtende("Mestre", "pibic-cnpq"), false, "PIBIC/CNPq é para doutor");
  assert.equal(titulacaoAtende("Mestre", "pbic-uniego"), true);
  assert.equal(titulacaoAtende("Especialista", "pbic-uniego"), false);
  assert.equal(titulacaoAtende("Especialista", "pvic-uniego"), true, "a voluntária aceita especialista");
});

/* -------------------------- pontuação da produção ------------------------ */
test("a planilha replica os pesos da oficial e cobre a escala Qualis inteira", () => {
  assert.equal(ITENS_PRODUCAO.length, 30);
  assert.equal(new Set(ITENS_PRODUCAO.map((i) => i.codigo)).size, 30, "códigos não se repetem");
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "art-a1").peso, 4);
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "or-dout-conc").peso, 2.5);
  assert.equal(ITENS_PRODUCAO.find((i) => i.codigo === "banca-grad").peso, 0.2);
  // A3 e A4 entraram depois, ENTRE os vizinhos já publicados: os pesos de
  // A2 e B1 não podem ter mudado, senão o CL já apurado mudaria junto
  const peso = (c) => ITENS_PRODUCAO.find((i) => i.codigo === c).peso;
  assert.ok(peso("art-a2") > peso("art-a3") && peso("art-a3") > peso("art-a4") && peso("art-a4") > peso("art-b1"),
    "a ordem do Qualis vale: A2 > A3 > A4 > B1");
  assert.equal(peso("art-a2"), 3.7); assert.equal(peso("art-b1"), 3.4);
});

test("a planilha não tem teto: quem produz mais pontua mais", () => {
  // sem teto por bloco nem teto geral — o limite empilhava professores no
  // mesmo número e o empate saía no critério de desempate, não na produção
  assert.equal(BLOCOS_PRODUCAO.every((b) => b.teto === undefined), true);
  const r = pontuarProducao({ "art-a1": 50 });          // 200 pontos
  const b = r.blocos.find((x) => x.codigo === "bibliografica");
  assert.equal(b.bruto, 200);
  assert.equal(b.pontos, 200, "nada é cortado");
  assert.equal(r.total, 200);
  assert.ok(pontuarProducao({ "art-a1": 60 }).total > r.total, "produzir mais continua somando");
});

test("pontua por quantidade × peso, bloco a bloco", () => {
  const r = pontuarProducao({ "art-a1": 2, "art-b1": 3, livro: 1, "or-ic-conc": 4, "banca-grad": 10, evento: 5 });
  const bloco = (c) => r.blocos.find((b) => b.codigo === c);
  assert.equal(bloco("bibliografica").pontos, 20.7, "2×4 + 3×3,4 + 1×2,5");
  assert.equal(bloco("orientacoes").pontos, 6, "4×1,5");
  assert.equal(bloco("bancas").pontos, 7, "10×0,2 + 5×1");
  assert.equal(r.total, 33.7);
});

test("quantidade inválida não pontua", () => {
  assert.equal(pontuarProducao({ "art-a1": -3 }).total, 0);
  assert.equal(pontuarProducao({ "art-a1": "abc" }).total, 0);
  assert.equal(pontuarProducao({ "item-que-nao-existe": 10 }).total, 0);
  assert.equal(pontuarProducao({ "art-a1": 2.7 }).total, 8, "conta itens inteiros");
  assert.deepEqual(normalizarProducao({ "art-a1": 0, "art-b1": 2, xxx: 5 }), { "art-b1": 2 },
    "só o que foi preenchido e existe");
});

/* ---------------------------- classificação ------------------------------ */
test("o formulário de avaliação vale 100, repartidos em sete critérios", () => {
  assert.equal(CRITERIOS_AVALIACAO.length, 7);
  assert.equal(NOTA_MAXIMA_PROJETO, 100, "os pesos dos critérios somam 100");
  for (const c of CRITERIOS_AVALIACAO) assert.ok(c.peso >= 10 && c.peso <= 20, `${c.codigo}: peso ${c.peso}`);
  // os quatro códigos do formulário anterior seguem existindo: código é chave
  for (const cod of ["merito", "metodologia", "viabilidade", "formacao"])
    assert.ok(CRITERIOS_AVALIACAO.some((c) => c.codigo === cod), cod);
});

test("nota final = projeto + currículo, com o currículo ABSOLUTO da planilha", () => {
  const r = notaClassificacao({ notaProjeto: 80, pontuacaoProducao: 50 });
  assert.equal(r.np, 80);
  assert.equal(r.cl, 50, "a pontuação da planilha entra como está, sem conversão");
  assert.equal(r.total, 130, "a classificação é a SOMA das duas");

  assert.equal(notaClassificacao({ notaProjeto: 100, pontuacaoProducao: 100 }).total, 200, "o teto é 200");
  assert.equal(notaClassificacao({}), null, "sem nota nenhuma não se inventa classificação");
  assert.equal(notaClassificacao({ pontuacaoProducao: 100 }).total, null,
    "currículo sozinho não classifica: sem nota de projeto não há nota final");
  assert.equal(notaClassificacao({ notaProjeto: 70 }).total, 70, "planilha em branco pontua zero no currículo");

  // Proposta ainda sem parecer chega com média null; se isso virasse zero, o
  // resultado impresso diria "nota 0" onde o certo é "ainda não avaliada".
  assert.equal(notaClassificacao({ notaProjeto: null }), null);
  assert.equal(notaClassificacao({ notaProjeto: null, pontuacaoProducao: undefined }), null);
  assert.equal(notaClassificacao({ notaProjeto: null, pontuacaoProducao: 50 }).np, null,
    "com planilha e sem parecer, a nota do projeto fica em aberto");
});

test("dois quadros: doutores primeiro, e o geral inclui os doutores", () => {
  const p = (numero, titulacao, total, np = total) => ({
    numero, orientador: { titulacao }, classificacao: total == null ? null : { np, cl: total - np, total },
  });
  const { doutores, geral } = classificarProjetos([
    p("IC-2026-001", "mestre", 150),
    p("IC-2026-002", "doutor", 120, 80),
    p("IC-2026-003", "doutor", 170),
    p("IC-2026-004", "especialista", null),
    p("IC-2026-005", "Doutora", 120, 90),   // titulação como texto livre
  ]);
  assert.deepEqual(doutores.map((x) => x.numero), ["IC-2026-003", "IC-2026-005", "IC-2026-002"],
    "só doutores, pela nota final; empate resolve pela nota do projeto");
  assert.deepEqual(geral.map((x) => x.numero),
    ["IC-2026-003", "IC-2026-001", "IC-2026-005", "IC-2026-002", "IC-2026-004"],
    "o geral tem todo mundo — doutores inclusive — e quem não tem nota vai ao fim");
});

test("a modalidade efetiva sai da linha com o fomento decidido na seleção", () => {
  const p = { linha: "ic", modalidade: "pibic-cnpq" };
  assert.equal(modalidadeEfetiva(p).codigo, "pibic-cnpq", "antes da decisão vale a pretendida");
  assert.equal(modalidadeEfetiva({ ...p, fomento: { tipo: "uniego" } }).codigo, "pbic-uniego");
  assert.equal(modalidadeEfetiva({ ...p, fomento: { tipo: "voluntario" } }).codigo, "pvic-uniego");
  assert.equal(modalidadeEfetiva({ linha: "ie", fomento: { tipo: "uniego" } }).codigo, "pbie-uniego");
});

/* ------------------------- grupos de pesquisa ---------------------------- */
test("os grupos do DGP/CNPq entram só pelo nome, sem repetição", () => {
  assert.ok(GRUPOS_PESQUISA.length >= 15);
  assert.equal(new Set(GRUPOS_PESQUISA).size, GRUPOS_PESQUISA.length, "sem duplicatas");
  assert.ok(GRUPOS_PESQUISA.every((g) => typeof g === "string" && g.trim().length > 5));
  assert.ok(GRUPOS_PESQUISA.includes("Solos, Ecologia e Dinâmica da Matéria Orgânica"));
});

test("a lista de grupos cresce com o uso, sem duplicar", () => {
  const projetos = [
    { grupoPesquisa: "Núcleo de Estudos em Direito Digital", status: "submetido" },
    { grupoPesquisa: "nucleo de   estudos em DIREITO digital", status: "aprovado" },
    { grupoPesquisa: "Solos, Ecologia e Dinâmica da Matéria Orgânica", status: "aprovado" },
    { grupoPesquisa: "Grupo que ainda é rascunho", status: "rascunho" },
    { grupoPesquisa: "", status: "submetido" },
  ];
  const { certificados, informados } = gruposConhecidos(projetos);
  assert.equal(certificados.length, GRUPOS_PESQUISA.length, "os certificados são sempre os mesmos");
  assert.deepEqual(informados, ["Núcleo de Estudos em Direito Digital"],
    "o mesmo grupo escrito de outro jeito não vira uma segunda entrada");
  assert.ok(!informados.includes("Grupo que ainda é rascunho"), "rascunho é do autor, não entra na lista comum");
  assert.ok(!certificados.some((g) => informados.includes(g)), "certificado não se repete entre os informados");
});

test("o nome digitado volta à grafia já conhecida; grupo novo é aceito como veio", () => {
  assert.equal(normalizarGrupo("  solos,   ECOLOGIA e dinamica da materia organica "),
    "Solos, Ecologia e Dinâmica da Matéria Orgânica", "acento e caixa não criam grupo novo");
  assert.equal(normalizarGrupo("Núcleo de   Pesquisa em  Bioética"), "Núcleo de Pesquisa em Bioética",
    "espaços sobrando somem, mas o nome novo permanece");
  assert.equal(normalizarGrupo(""), "");
  assert.equal(normalizarGrupo("   "), "", "espaço em branco não é grupo");

  // com a lista ampliada, casa também com o que outra pessoa já informou
  const conhecidos = [...GRUPOS_PESQUISA, "Núcleo de Estudos em Direito Digital"];
  assert.equal(normalizarGrupo("NUCLEO DE ESTUDOS EM DIREITO DIGITAL", conhecidos),
    "Núcleo de Estudos em Direito Digital");
  assert.equal(normalizarGrupo("Grupo inédito", conhecidos), "Grupo inédito");
});

test("o projeto guarda o grupo já casado com os conhecidos", () => {
  const conhecidos = [...GRUPOS_PESQUISA, "Núcleo de Estudos em Direito Digital"];
  const p = normalizarProjeto({ grupoPesquisa: "nucleo de estudos em direito digital" }, { grupos: conhecidos });
  assert.equal(p.grupoPesquisa, "Núcleo de Estudos em Direito Digital");
  const q = normalizarProjeto({ grupoPesquisa: "Observatório de Políticas Públicas" });
  assert.equal(q.grupoPesquisa, "Observatório de Políticas Públicas", "sem lista, o texto limpo vale");
});

test("grupo de pesquisa não pontua: o edital só quer saber o vínculo", () => {
  // O item 9.3 daria 5 pontos ao membro e 10 ao líder, mas isso exigiria
  // perguntar o papel de quem submete no grupo — e a decisão foi não
  // perguntar. Então nada disso entra na conta em lugar nenhum.
  assert.ok(!ITENS_PRODUCAO.some((i) => /grupo/i.test(i.nome)),
    "a planilha de produção não tem item de grupo de pesquisa");
  assert.ok(GRUPOS_PESQUISA.every((g) => typeof g === "string"),
    "grupo é só um nome — sem peso, sem papel, sem pontuação");
  const comGrupo = normalizarProjeto({ grupoPesquisa: "Solos, Ecologia e Dinâmica da Matéria Orgânica" });
  const semGrupo = normalizarProjeto({});
  assert.equal(
    notaClassificacao({ notaProjeto: 80, pontuacaoProducao: pontuarProducao(comGrupo.producao).total }).total,
    notaClassificacao({ notaProjeto: 80, pontuacaoProducao: pontuarProducao(semGrupo.producao).total }).total,
    "estar num grupo não muda a classificação",
  );
});

test("o fomento tem exatamente as três saídas da seleção", () => {
  assert.deepEqual(FOMENTOS.map((f) => f.codigo), ["cnpq", "uniego", "voluntario"]);
});

/* ------------------ lote de submissões que acompanha o sistema ----------- */
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("o banco do edital 01/2026 importa inteiro, sem linha órfã", async () => {
  const lote = JSON.parse(await readFile(path.join(RAIZ, "dados", "ic-edital-01-2026.json"), "utf8"));
  assert.equal(lote.lote, "edital-01-2026");
  assert.equal(lote.status, "submetido");
  assert.ok(lote.projetos.length >= 30, `são ${lote.projetos.length} submissões`);

  const chaves = new Set();
  for (const bruto of lote.projetos) {
    const rot = `${bruto.origemId} — ${String(bruto.titulo).slice(0, 40)}`;
    assert.ok(!chaves.has(bruto.origemId), `origemId repetido em ${rot}`);
    chaves.add(bruto.origemId);

    // o CPF é a chave do vínculo: sem ele o projeto nunca acharia o dono
    assert.ok(cpfValido(bruto.orientador.cpf), `CPF inválido em ${rot}: ${bruto.orientador.cpf}`);

    const p = normalizarProjeto(bruto, { autor: "" });
    assert.deepEqual(validarProjeto(p), [], `${rot} não passaria na validação`);
    assert.equal(p.orientador.email, "", `${rot} não deve trazer e-mail: o vínculo é por CPF`);
    assert.ok(p.cronograma.length >= 1, `${rot} sem cronograma`);
    assert.ok(["ic", "it", "ie"].includes(p.linha), `${rot} com linha inválida`);
    assert.ok(p.curso, `${rot} sem curso mapeado`);
  }
});

test("as submissões cobrem o período de execução do edital", async () => {
  const lote = JSON.parse(await readFile(path.join(RAIZ, "dados", "ic-edital-01-2026.json"), "utf8"));
  for (const p of lote.projetos) {
    assert.equal(p.inicio, EDITAL.vigencia.inicio);
    assert.equal(p.fim, EDITAL.vigencia.fim);
    assert.match(p.submetidoEm, /^2026-(0[1-9])/, "submissões são de 2026");
  }
});
