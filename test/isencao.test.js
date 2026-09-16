import test from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import {
  faixaDoTexto, CRITERIOS, criterioDe, normalizarIsencao, isencaoAberta,
  lerComprovante, avaliarComprovante, resumoDaLeitura, nomesBatem, cotaComporta, deferidas,
} from "../lib/isencao.js";

/* ------------------------------------------------------------------------
   ISENÇÃO DA TAXA PELO CADÚNICO — a régua e a leitura do comprovante.

   O que estes testes travam, e por quê: o comprovante é um FORMULÁRIO em que
   todos os rótulos vêm primeiro e todos os valores depois, então quem casa
   rótulo com valor é a COORDENADA, não a proximidade no texto. É exatamente o
   tipo de coisa que quebra em silêncio — o leitor devolve a data de cadastro
   onde se esperava a última atualização, e o pedido é decidido pelo campo
   errado sem ninguém perceber. Por isso o teste MONTA um PDF com o mesmo
   desenho do documento real e confere campo a campo.
------------------------------------------------------------------------- */

/** Desenha um PDF com o layout do Comprovante de Cadastro Único. */
function comprovanteFalso({
  faixaPerCapita = "Acima de meio salário mínimo",
  atualizado = "SIM", ultima = "22/01/2024", limite = "22/01/2026",
  emitido = "31/07/2024", chave = "Kiz4.DV3m.Rpu2.eAIu",
  integrantes = [["VICENCIA MARIA DE MORAES FERREIRA", "14/10/1955", "16540210893"],
                 ["GUILHERME DINIZ FERREIRA", "07/08/2002", "16267281400"]],
  cabecalho = true,
} = {}) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const pedacos = [];
    doc.on("data", (c) => pedacos.push(c));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    const põe = (t, x, y, tam = 9) => doc.fontSize(tam).text(String(t), x, y, { lineBreak: false });
    if (cabecalho) {
      põe("Ministério do Desenvolvimento e Assistência Social", 40, 30, 10);
      põe("Comprovante de cadastro", 40, 46, 14);
      põe("Sua família está cadastrada no Cadastro Único para Programas Sociais", 40, 66);
    }
    // rótulo em cima, valor logo ABAIXO, na mesma coluna — como no documento
    const par = (rotulo, valor, x, y) => { põe(rotulo, x, y); põe(valor, x, y + 18); };
    par("Data de cadastro", "05/06/2020", 40, 110);
    par("Município de cadastramento", "BETIM/MG", 180, 110);
    par("Cadastro atualizado", atualizado, 360, 110);
    par("Última atualização", ultima, 460, 110);
    par("Faixa de renda familiar total", "Entre dois e três salários mínimos", 40, 170);
    par("Faixa de renda familiar por pessoa (per capita)", faixaPerCapita, 280, 170);
    par("Código familiar", "6239189510", 40, 230);
    par("Limite para atualização", limite, 200, 230);
    põe("Integrantes da família", 40, 290, 11);
    integrantes.forEach(([nome, nasc, nis], k) => põe(`${nome} ${nasc} ${nis} Cadastrado`, 40, 312 + k * 16));
    par("Chave de segurança", chave, 40, 700);
    // "Consulta realizada em" é rótulo de LINHA: o valor fica à DIREITA
    põe("Consulta realizada em", 40, 760);
    põe(emitido, 160, 760);
    põe("às", 230, 760);
    põe("23:12:15", 250, 760);
    doc.end();
  });
}

test("a leitura casa rótulo com valor pela COORDENADA, não pela ordem do texto", async () => {
  const l = await lerComprovante(await comprovanteFalso());
  assert.equal(l.ok, true);
  // o par que o casamento por proximidade erra: no texto corrido, a primeira
  // data depois de "Última atualização" é a data de CADASTRO
  assert.equal(l.ultimaAtualizacao, "22/01/2024");
  assert.equal(l.limiteAtualizacao, "22/01/2026");
  assert.equal(l.atualizado, "SIM");
  assert.equal(l.codigoFamiliar, "6239189510");
  assert.equal(l.municipio, "BETIM/MG");
  assert.equal(l.chave, "Kiz4.DV3m.Rpu2.eAIu");
  assert.equal(l.emitidoEm, "31/07/2024");          // rótulo de linha, valor à direita
  assert.equal(l.faixaTexto, "Acima de meio salário mínimo");
  assert.equal(l.faixaPerCapita, "acima-meio");
  // a faixa PER CAPITA, nunca a TOTAL — as duas estão na mesma altura
  assert.notEqual(l.faixaTexto, "Entre dois e três salários mínimos");
  assert.equal(l.integrantes.length, 2);
});

test("PDF que não é comprovante, e arquivo sem camada de texto, não viram recusa do critério", async () => {
  const outro = await comprovanteFalso({ cabecalho: false });
  const l = await lerComprovante(outro);
  assert.equal(l.ok, false);
  assert.match(l.motivo, /não é um Comprovante/i);
  // e o veredito manda CONFERIR à mão, nunca "não atende": o limite é nosso
  const v = avaliarComprovante(l, { criterio: "meio-salario", hoje: "2026-09-16" });
  assert.equal(v.veredito, "conferir");
  assert.equal(v.impedem.length, 0);

  const lixo = await lerComprovante(Buffer.from("isto não é um PDF"));
  assert.equal(lixo.ok, false);
  assert.equal(avaliarComprovante(lixo, { criterio: "meio-salario" }).veredito, "conferir");
});

test("as três faixas se reconhecem pela FORMA da frase, não pelo valor em reais", () => {
  // o valor da linha de pobreza muda por decreto: um catálogo com "218"
  // cravado pararia de funcionar no dia do reajuste, em silêncio
  assert.equal(faixaDoTexto("Acima de meio salário mínimo"), "acima-meio");
  assert.equal(faixaDoTexto("Acima de 1/2 salário mínimo"), "acima-meio");
  assert.equal(faixaDoTexto("De R$ 218,01 a meio salário mínimo"), "218-meio");
  assert.equal(faixaDoTexto("Entre R$ 300,00 e meio salário mínimo"), "218-meio");
  assert.equal(faixaDoTexto("Até meio salário mínimo"), "218-meio");
  assert.equal(faixaDoTexto("Até R$ 218,00"), "ate-218");
  assert.equal(faixaDoTexto("Até R$ 260,00"), "ate-218");
  assert.equal(faixaDoTexto("Extrema pobreza"), "ate-218");
  assert.equal(faixaDoTexto(""), "");
  assert.equal(faixaDoTexto("qualquer outra coisa"), "");
});

test("o critério do dono (até meio salário) aceita as DUAS primeiras faixas", async () => {
  const hoje = "2026-09-16";
  const aceita = async (faixa, criterio) => {
    const l = await lerComprovante(await comprovanteFalso({ faixaPerCapita: faixa, limite: "01/01/2027" }));
    return avaliarComprovante(l, { criterio, nome: "GUILHERME DINIZ FERREIRA", hoje }).veredito;
  };
  assert.equal(await aceita("Até R$ 218,00", "meio-salario"), "conforme");
  assert.equal(await aceita("De R$ 218,01 a meio salário mínimo", "meio-salario"), "conforme");
  assert.equal(await aceita("Acima de meio salário mínimo", "meio-salario"), "naoAtende");
  // e o recorte estreito (o do Bolsa Família) só aceita a primeira
  assert.equal(await aceita("Até R$ 218,00", "ate-218"), "conforme");
  assert.equal(await aceita("De R$ 218,01 a meio salário mínimo", "ate-218"), "naoAtende");
  // critério desconhecido cai no padrão, nunca em "aceita tudo"
  assert.equal(criterioDe("inventado").codigo, "meio-salario");
  assert.deepEqual(criterioDe("").aceita, ["ate-218", "218-meio"]);
});

test("cadastro desatualizado e prazo vencido IMPEDEM; nome que não bate só AVISA", async () => {
  const hoje = "2026-09-16";
  const base = { faixaPerCapita: "Até R$ 218,00", limite: "01/01/2027" };

  const bom = await lerComprovante(await comprovanteFalso(base));
  assert.equal(avaliarComprovante(bom, { criterio: "meio-salario", nome: "GUILHERME DINIZ FERREIRA", hoje }).veredito, "conforme");

  const desatualizado = await lerComprovante(await comprovanteFalso({ ...base, atualizado: "NÃO" }));
  const v1 = avaliarComprovante(desatualizado, { criterio: "meio-salario", nome: "GUILHERME DINIZ FERREIRA", hoje });
  assert.equal(v1.veredito, "naoAtende");
  assert.match(v1.impedem.join(" "), /não está atualizado/i);

  const vencido = await lerComprovante(await comprovanteFalso({ ...base, limite: "01/01/2026" }));
  const v2 = avaliarComprovante(vencido, { criterio: "meio-salario", nome: "GUILHERME DINIZ FERREIRA", hoje });
  assert.equal(v2.veredito, "naoAtende");
  assert.match(v2.impedem.join(" "), /prazo de atualização/i);

  /* O NOME não bate: nome de casada, abreviação e o filho que pede com o
     comprovante da família são casos legítimos — vai para conferência, nunca
     para recusa automática. */
  const v3 = avaliarComprovante(bom, { criterio: "meio-salario", nome: "Maria Aparecida Souza", hoje });
  assert.equal(v3.veredito, "conferir");
  assert.equal(v3.impedem.length, 0);
  assert.equal(v3.nomeConfere, false);
  assert.match(v3.avisos.join(" "), /não foi encontrado entre os integrantes/i);
});

test("a validade do comprovante só se cobra quando o edital a pede", async () => {
  const l = await lerComprovante(await comprovanteFalso({ faixaPerCapita: "Até R$ 218,00", limite: "01/01/2027", emitido: "01/01/2026" }));
  const nome = "GUILHERME DINIZ FERREIRA", hoje = "2026-09-16";
  assert.equal(avaliarComprovante(l, { criterio: "meio-salario", nome, hoje, validadeDias: 0 }).veredito, "conforme");
  const v = avaliarComprovante(l, { criterio: "meio-salario", nome, hoje, validadeDias: 90 });
  assert.equal(v.veredito, "naoAtende");
  assert.match(v.impedem.join(" "), /emitido em 01\/01\/2026/);
});

test("o que se GRAVA não inclui a lista de integrantes — só a contagem e a resposta", async () => {
  const l = await lerComprovante(await comprovanteFalso());
  const r = resumoDaLeitura(l, true);
  assert.equal(r.integrantes, 2);          // quantos, não quem
  assert.equal(r.nomeConfere, true);
  const texto = JSON.stringify(r);
  // nome, data de nascimento e NIS de TERCEIROS não entram no registro
  assert.ok(!texto.includes("VICENCIA"), "o nome de um integrante entrou no registro");
  assert.ok(!texto.includes("16540210893"), "o NIS de um integrante entrou no registro");
  assert.ok(!texto.includes("14/10/1955"), "a data de nascimento de um integrante entrou no registro");
  assert.ok(!("texto" in r), "o texto inteiro do PDF entrou no registro");
});

test("nomesBatem: nome curto contido no longo, sem acento e sem caixa", () => {
  assert.equal(nomesBatem("GUILHERME DINIZ FERREIRA", "Guilherme Diniz Ferreira"), true);
  assert.equal(nomesBatem("VICENCIA MARIA DE MORAES FERREIRA", "Vicência Ferreira"), true);
  assert.equal(nomesBatem("Ana Paula Souza", "Ana Souza Paula"), false);   // ordem importa
  assert.equal(nomesBatem("Ana", "Ana Paula Souza"), false);               // uma palavra não é chave
  assert.equal(nomesBatem("", "Ana Paula"), false);
});

test("a configuração nasce DESLIGADA e a régua do prazo é do dia", () => {
  const vazia = normalizarIsencao(undefined);
  assert.equal(vazia.ativa, false, "a isenção não pode nascer ligada");
  assert.equal(vazia.criterio, "meio-salario");
  assert.equal(vazia.cota, 0);
  assert.equal(vazia.validadeDias, 0);
  assert.equal(isencaoAberta(vazia, "2026-09-16").ok, false);

  const c = normalizarIsencao({ ativa: true, criterio: "ate-218", prazoAte: "2026-10-01", cota: "12", validadeDias: "90" });
  assert.equal(c.ativa, true);
  assert.equal(c.cota, 12);
  assert.equal(c.validadeDias, 90);
  assert.equal(isencaoAberta(c, "2026-09-30").ok, true);
  assert.equal(isencaoAberta(c, "2026-10-01").ok, true);      // o último dia vale
  assert.equal(isencaoAberta(c, "2026-10-02").ok, false);
  // data malformada não vira prazo (seria fechar a isenção por um campo torto)
  assert.equal(normalizarIsencao({ ativa: true, prazoAte: "01/10/2026" }).prazoAte, "");
  assert.equal(isencaoAberta({ ativa: true }, "2030-01-01").ok, true);
  // tetos
  assert.equal(normalizarIsencao({ cota: 999999 }).cota, 5000);
  assert.equal(normalizarIsencao({ validadeDias: -5 }).validadeDias, 0);
});

test("a cota conta as isenções DEFERIDAS, não os pedidos", () => {
  const inscritos = [
    { isencao: { estado: "deferido" } }, { isencao: { estado: "deferido" } },
    { isencao: { estado: "analise" } }, { isencao: { estado: "indeferido" } }, {},
  ];
  assert.equal(deferidas(inscritos), 2);
  assert.equal(cotaComporta({ ativa: true, cota: 0 }, inscritos).ok, true);     // 0 = sem cota
  assert.equal(cotaComporta({ ativa: true, cota: 3 }, inscritos).ok, true);
  assert.equal(cotaComporta({ ativa: true, cota: 3 }, inscritos).restam, 1);
  assert.equal(cotaComporta({ ativa: true, cota: 2 }, inscritos).ok, false);
  assert.equal(cotaComporta({ ativa: true, cota: 2 }, []).ok, true);
});

test("o catálogo de critérios não perde os códigos já gravados", () => {
  // trocar um código quebraria a leitura do que está gravado nos eventos
  assert.deepEqual(CRITERIOS.map((c) => c.codigo), ["meio-salario", "ate-218"]);
  for (const c of CRITERIOS) assert.ok(c.rotulo.length > 10, `critério ${c.codigo} sem rótulo legível`);
});
