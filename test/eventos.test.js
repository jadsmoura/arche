/* ARCHÉ Eventos: os helpers puros do evento gratuito — slug, token assinado,
   atividades da programação, campos extras, LGPD, transmissão, vagas, prazo
   e dedupe da inscrição (lib/eventos.js). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  slugDeNome, slugUnico, SLUG_VALIDO, gerarChaveQr, gerarCodigoMonitor,
  gerarToken, tokenValido, codigoDe, inscritoPorToken, normalizarProgramacao,
  vagasRestantes, prazoInscricao, podeInscrever, jaInscrito,
  TIPOS_ATIVIDADE, atividadesInscriviveis, vagasAtividade, conflitoHorario,
  podeEscolherAtividade, normalizarFormulario, validarRespostas,
  LGPD_TEXTO_PADRAO, textoLgpd, versaoLgpd, videoIdDe, numerosDoEvento,
} from "../lib/eventos.js";

/* --------------------------------- slug --------------------------------- */
test("slug: minúsculo, sem acento, hífens no lugar do resto", () => {
  assert.equal(slugDeNome("XII Semana de Enfermagem & I Simpósio"), "xii-semana-de-enfermagem-i-simposio");
  assert.equal(slugDeNome("  Ação  Comunitária!!  "), "acao-comunitaria");
  assert.equal(slugDeNome("çãéîõü"), "caeiou");
  assert.equal(slugDeNome("***"), "", "só símbolo não vira endereço");
  assert.ok(SLUG_VALIDO.test(slugDeNome("Semana 2026")));
});

test("slug único: colisão ganha sufixo numérico, e vazio vira 'evento'", () => {
  assert.equal(slugUnico("Semana de Enfermagem", []), "semana-de-enfermagem");
  assert.equal(slugUnico("Semana de Enfermagem", ["semana-de-enfermagem"]), "semana-de-enfermagem-2");
  assert.equal(
    slugUnico("Semana de Enfermagem", ["semana-de-enfermagem", "semana-de-enfermagem-2"]),
    "semana-de-enfermagem-3",
  );
  assert.equal(slugUnico("!!!", []), "evento");
  assert.ok(SLUG_VALIDO.test(slugUnico("!!!", ["evento"])));
});

/* -------------------------------- token --------------------------------- */
test("token: assinado com a chave do evento, curto e conferível", () => {
  const chave = gerarChaveQr();
  const t = gerarToken(chave);
  assert.match(t, /^[0-9a-f]{22}$/, "22 hex — cabe num QR pequeno");
  assert.equal(tokenValido(chave, t), true);
  assert.equal(tokenValido(chave, t.toUpperCase()), true, "caixa alta não invalida");
  assert.equal(codigoDe(t), t.slice(0, 6), "o código manual são os 6 primeiros");
});

test("token adulterado, de outro evento ou fora do formato não passa", () => {
  const chave = gerarChaveQr();
  const t = gerarToken(chave);
  const trocado = (t[21] === "0" ? "1" : "0");
  assert.equal(tokenValido(chave, t.slice(0, 21) + trocado), false, "um caractere trocado derruba");
  assert.equal(tokenValido(gerarChaveQr(), t), false, "a chave é POR evento");
  assert.equal(tokenValido(chave, ""), false);
  assert.equal(tokenValido(chave, t + "00"), false, "comprimento errado");
  assert.equal(tokenValido("", t), false, "sem chave nada valida");
  assert.equal(tokenValido(chave, null), false);
});

test("código do monitor: curto e sem os caracteres que se confundem", () => {
  const c = gerarCodigoMonitor();
  assert.match(c, /^[2-9A-HJ-NP-Z]{6}$/, "sem 0/O/1/I — soletra-se por telefone");
  assert.notEqual(gerarCodigoMonitor(), c, "aleatório");
});

/* --------------------- busca da inscrição no check-in -------------------- */
test("check-in encontra pelo token assinado e pelo código de 6", () => {
  const chave = gerarChaveQr();
  const ev = { chaveQr: chave };
  const t1 = gerarToken(chave), t2 = gerarToken(chave);
  const inscritos = [{ nome: "Ana", token: t1 }, { nome: "Bia", token: t2 }];
  assert.equal(inscritoPorToken(ev, inscritos, { token: t1 })?.nome, "Ana");
  assert.equal(inscritoPorToken(ev, inscritos, { codigo: codigoDe(t2) })?.nome, "Bia");
  assert.equal(inscritoPorToken(ev, inscritos, { codigo: codigoDe(t2).toUpperCase() })?.nome, "Bia");
});

test("check-in recusa token inválido e prefixo ambíguo", () => {
  const chave = gerarChaveQr();
  const ev = { chaveQr: chave };
  const t = gerarToken(chave);
  const outro = gerarToken(gerarChaveQr());
  assert.equal(inscritoPorToken(ev, [{ nome: "Ana", token: t }], { token: outro }), null,
    "token de outro evento não abre este");
  // duas inscrições com o mesmo início de token: na dúvida, ninguém — o
  // monitor pede o token completo em vez de credenciar o errado
  const gemeo = t.slice(0, 6) + "abcdefabcdefabcd";
  const ambiguos = [{ nome: "Ana", token: t }, { nome: "Bia", token: gemeo }];
  assert.equal(inscritoPorToken(ev, ambiguos, { codigo: codigoDe(t) }), null);
  assert.equal(inscritoPorToken(ev, ambiguos, { codigo: "zz" }), null, "código curto demais");
});

/* ----------------------------- programação ------------------------------- */
test("programação: apara, descarta linha sem título e ordena por dia/hora", () => {
  const prog = normalizarProgramacao([
    { dia: "2026-05-14", hora: "19:00", titulo: " Minicurso B ", responsavel: " Profa. X ", local: " Sala 2 " },
    { dia: "2026-05-13", hora: "19:00", titulo: "Abertura" },
    { dia: "2026-05-13", hora: "08:00", titulo: "Credenciamento" },
    { dia: "2026-05-15", hora: "", titulo: "" },              // sem título: fora
    { dia: "13/05/2026", hora: "20:00", titulo: "Data torta" }, // dia inválido vira ""
  ]);
  assert.deepEqual(prog.map((p) => p.titulo), ["Data torta", "Credenciamento", "Abertura", "Minicurso B"]);
  assert.equal(prog[3].responsavel, "Profa. X");
  assert.equal(prog[3].local, "Sala 2");
  assert.equal(prog[0].dia, "", "dia fora do formato não passa adiante");
  assert.deepEqual(normalizarProgramacao("nada"), [], "entrada torta vira lista vazia");
});

test("atividades: id estável preservado, gerado quando falta e regenerado no duplicado", () => {
  const prog = normalizarProgramacao([
    { id: "aabbccdd", titulo: "Abertura", tipo: "palestra" },
    { id: "aabbccdd", titulo: "Oficina X", tipo: "oficina" },   // id repetido: ganha outro
    { titulo: "Minicurso Y", tipo: "minicurso" },               // sem id: ganha um
    { id: "NÃO-VALE", titulo: "Mesa Z", tipo: "mesa" },         // id torto: ganha um
  ]);
  assert.equal(prog.length, 4);
  assert.ok(prog.some((p) => p.id === "aabbccdd"), "id válido recebido sobrevive");
  const ids = prog.map((p) => p.id);
  assert.equal(new Set(ids).size, 4, "ids nunca se repetem");
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}$/);
  // reeditar preserva: normalizar de novo mantém os mesmos ids
  const prog2 = normalizarProgramacao(prog);
  assert.deepEqual(prog2.map((p) => p.id).sort(), ids.slice().sort(), "reeditar não troca id");
});

test("atividades: compat hora→horaInicio, tipo fora do catálogo vira 'outro', campos novos saneados", () => {
  const [a] = normalizarProgramacao([{
    titulo: "Palestra magna", hora: "19:00", horaFim: "21:00", tipo: "banquete",
    vagas: "40", ch: "4h", inscricao: "propria", modalidade: "online",
    descricao: " Sobre ciência. ", dia: "2026-05-13",
  }]);
  assert.equal(a.horaInicio, "19:00", "o campo antigo `hora` vira horaInicio");
  assert.equal(a.horaFim, "21:00");
  assert.equal(a.tipo, "outro", "tipo desconhecido não passa");
  assert.equal(a.vagas, 40);
  assert.equal(a.ch, "4h");
  assert.equal(a.inscricao, "propria");
  assert.equal(a.modalidade, "online");
  assert.equal(a.descricao, "Sobre ciência.");
  const [b] = normalizarProgramacao([{ titulo: "Sem nada" }]);
  assert.equal(b.inscricao, "geral", "sem marcação, a atividade é de todos");
  assert.equal(b.modalidade, "presencial");
  assert.equal(b.vagas, 0, "0 = sem limite próprio");
  assert.equal(b.horaInicio, "", "hora fora do formato HH:MM não passa");
  assert.ok(TIPOS_ATIVIDADE.some((t) => t.codigo === b.tipo), "todo item sai com tipo do catálogo");
});

test("atividades: teto de 200 itens e inscriviveis são só as 'propria'", () => {
  const muitas = Array.from({ length: 250 }, (_, i) => ({ titulo: `Item ${i}` }));
  assert.equal(normalizarProgramacao(muitas).length, 200);
  const ev = { programacao: normalizarProgramacao([
    { titulo: "Abertura" },
    { titulo: "Oficina", inscricao: "propria" },
  ]) };
  assert.deepEqual(atividadesInscriviveis(ev).map((x) => x.titulo), ["Oficina"]);
});

test("vagasAtividade: null sem limite, conta só quem marcou, nunca negativa", () => {
  const atv = { id: "aabbccdd", vagas: 2 };
  assert.equal(vagasAtividade({ id: "aabbccdd", vagas: 0 }, [{ atividades: ["aabbccdd"] }]), null);
  assert.equal(vagasAtividade(atv, []), 2);
  assert.equal(vagasAtividade(atv, [
    { atividades: ["aabbccdd"] },
    { atividades: ["outra111"] },
    { nome: "sem atividades" },
  ]), 1);
  assert.equal(vagasAtividade(atv, [
    { atividades: ["aabbccdd"] }, { atividades: ["aabbccdd"] }, { atividades: ["aabbccdd"] },
  ]), 0, "cota reduzida depois das marcações não vira -1");
});

test("conflitoHorario: mesmo dia com intervalos sobrepostos; sem dia/hora não compara", () => {
  const d = (horaInicio, horaFim = "", dia = "2026-05-13") => ({ dia, horaInicio, horaFim });
  assert.equal(conflitoHorario(d("19:00", "21:00"), d("20:00", "22:00")), true);
  assert.equal(conflitoHorario(d("19:00", "20:00"), d("20:00", "21:00")), false, "encostado não conflita");
  assert.equal(conflitoHorario(d("19:00", "21:00"), d("19:30", "20:00", "2026-05-14")), false, "dias diferentes");
  assert.equal(conflitoHorario(d("19:00"), d("19:00")), true, "sem fim, mesma hora colide");
  assert.equal(conflitoHorario(d("19:00"), d("19:01")), false, "sem fim vale um minuto");
  assert.equal(conflitoHorario(d("23:59"), d("23:59")), true, "o fim do dia não estoura a comparação");
  assert.equal(conflitoHorario({ dia: "", horaInicio: "19:00" }, d("19:00")), false, "sem dia não compara");
  assert.equal(conflitoHorario(d(""), d("19:00")), false, "sem hora não compara");
});

test("podeEscolherAtividade: inexistente, geral, lotada — e manter a sua não disputa vaga", () => {
  const ev = { programacao: [
    { id: "aaaa1111", titulo: "Abertura", inscricao: "geral", vagas: 0 },
    { id: "bbbb2222", titulo: "Oficina", inscricao: "propria", vagas: 1 },
  ] };
  const cheia = [{ atividades: ["bbbb2222"] }];
  assert.equal(podeEscolherAtividade(ev, "zzzz9999", [], []).ok, false, "fora da programação");
  const geral = podeEscolherAtividade(ev, "aaaa1111", [], []);
  assert.equal(geral.ok, false);
  assert.match(geral.motivo, /já participa/);
  const lotada = podeEscolherAtividade(ev, "bbbb2222", cheia, []);
  assert.equal(lotada.ok, false);
  assert.equal(lotada.semVaga, true, "lotação é 409, os demais são 400");
  assert.match(lotada.motivo, /Oficina/, "o erro diz QUAL atividade lotou");
  assert.equal(podeEscolherAtividade(ev, "bbbb2222", cheia, ["bbbb2222"]).ok, true,
    "quem já a tem pode mantê-la — a vaga é dela");
  assert.equal(podeEscolherAtividade(ev, "bbbb2222", [], []).ok, true);
});

/* ------------------------ campos extras e respostas ----------------------- */
test("formulário: descarta sem rótulo, preserva ids, opções só em seleção/múltipla", () => {
  const f = normalizarFormulario([
    { id: "aaaa1111", rotulo: "Como soube do evento?", tipo: "selecao", opcoes: ["Redes", "Cartaz", ""] },
    { rotulo: "  ", tipo: "texto" },                       // sem rótulo: fora
    { rotulo: "Restrições alimentares", tipo: "paragrafo", opcoes: ["não vale"] },
    { rotulo: "Aceito fotos", tipo: "caixa", obrigatorio: true },
    { rotulo: "Tipo torto", tipo: "banana" },
  ]);
  assert.equal(f.length, 4);
  assert.equal(f[0].id, "aaaa1111", "id válido preservado — é a chave das respostas");
  assert.deepEqual(f[0].opcoes, ["Redes", "Cartaz"], "opção vazia some");
  assert.deepEqual(f[1].opcoes, [], "parágrafo não tem opções");
  assert.equal(f[3].tipo, "texto", "tipo desconhecido vira texto");
  for (const c of f) assert.match(c.id, /^[0-9a-f]{8}$/);
  assert.equal(normalizarFormulario(Array.from({ length: 30 }, (_, i) => ({ rotulo: `C${i}` }))).length, 20,
    "teto de 20 campos");
});

test("respostas: obrigatório, opção inválida, múltipla ⊆ opções, caixa e limites", () => {
  const form = normalizarFormulario([
    { id: "aaaa1111", rotulo: "Origem", tipo: "selecao", opcoes: ["Redes", "Cartaz"], obrigatorio: true },
    { id: "bbbb2222", rotulo: "Interesses", tipo: "multipla", opcoes: ["IA", "Saúde"] },
    { id: "cccc3333", rotulo: "Observações", tipo: "paragrafo" },
    { id: "dddd4444", rotulo: "Precisa de intérprete", tipo: "caixa" },
  ]);
  const ok = validarRespostas(form, {
    aaaa1111: "Redes", bbbb2222: ["IA", "IA", "Culinária"], cccc3333: "x".repeat(3000),
    dddd4444: "true", zzzz9999: "campo que não existe",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.respostas.bbbb2222, ["IA"], "só opções oferecidas, sem repetição");
  assert.equal(ok.respostas.cccc3333.length, 2000, "parágrafo apara em 2000");
  assert.equal(ok.respostas.dddd4444, true, "caixa vira boolean");
  assert.equal(ok.respostas.zzzz9999, undefined, "resposta fora do catálogo não entra");

  const faltando = validarRespostas(form, {});
  assert.equal(faltando.ok, false);
  assert.match(faltando.erros.join(" "), /Origem/, "o erro aponta o rótulo do campo");

  const invalida = validarRespostas(form, { aaaa1111: "Panfleto" });
  assert.equal(invalida.ok, false);
  assert.match(invalida.erros.join(" "), /não está entre as opções/);
});

/* ------------------------------- LGPD ------------------------------------ */
test("LGPD: o texto do evento substitui o padrão, e a versão acompanha o texto", () => {
  assert.equal(textoLgpd({}), LGPD_TEXTO_PADRAO);
  assert.equal(textoLgpd({ lgpdTexto: "  " }), LGPD_TEXTO_PADRAO, "vazio volta ao padrão");
  assert.equal(textoLgpd({ lgpdTexto: "Texto próprio." }), "Texto próprio.");
  assert.match(versaoLgpd(LGPD_TEXTO_PADRAO), /^[0-9a-f]{8}$/);
  assert.equal(versaoLgpd("a"), versaoLgpd("a"), "mesma redação, mesma versão");
  assert.notEqual(versaoLgpd("a"), versaoLgpd("b"), "trocar a redação troca a versão gravada");
  assert.match(LGPD_TEXTO_PADRAO, /13\.709\/2018/, "o padrão cita a lei");
  assert.match(LGPD_TEXTO_PADRAO, /extensao@uniego\.edu\.br/, "e o canal de contato");
});

/* ---------------------------- transmissão -------------------------------- */
test("videoIdDe: id puro e as URLs usuais do YouTube; lixo vira vazio", () => {
  assert.equal(videoIdDe("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdDe("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdDe("https://www.youtube.com/watch?ab_channel=X&v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdDe("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ");
  assert.equal(videoIdDe("https://www.youtube.com/live/jfKfPfyJRdk"), "jfKfPfyJRdk");
  assert.equal(videoIdDe("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdDe("https://vimeo.com/12345678"), "", "outro serviço não passa");
  assert.equal(videoIdDe("isto não é um id!"), "");
  assert.equal(videoIdDe(""), "");
});

/* ----------------------- números do evento (snapshot) --------------------- */
test("numerosDoEvento: totais, recorte online e por atividade, mural visível", () => {
  const acao = {
    evento: {
      programacao: [
        { id: "aaaa1111", titulo: "Oficina", inscricao: "propria" },
        { id: "bbbb2222", titulo: "Abertura", inscricao: "geral" },
      ],
      mural: [{ texto: "oi" }, { texto: "spam", oculto: true }],
    },
    participantes: { inscritos: [
      { nome: "Ana", origem: "online", presente: true, presentePor: "monitor",
        atividades: ["aaaa1111"], presencas: [{ atividade: "aaaa1111" }] },
      { nome: "Bia", origem: "online", presente: true, presentePor: "online",
        atividades: ["aaaa1111"] },
      { nome: "Caio" },   // da planilha da coordenação
    ] },
  };
  const ne = numerosDoEvento(acao);
  assert.equal(ne.inscritos, 3);
  assert.equal(ne.online, 2);
  assert.equal(ne.manuais, 1);
  assert.equal(ne.presentes, 2);
  assert.equal(ne.presentesOnline, 1);
  assert.equal(ne.comentariosMural, 1, "oculto não conta");
  assert.deepEqual(ne.porAtividade, [
    { id: "aaaa1111", titulo: "Oficina", inscritos: 2, presentes: 1 },
  ], "a atividade geral sem presença registrada fica fora do quadro");
  assert.ok(ne.geradoEm, "snapshot datado");
});

/* --------------------------- vagas e inscrição --------------------------- */
const acaoEv = (evento, inscritos = []) => ({
  proposta: { periodoInicio: "2026-05-13", periodoFim: "2026-05-15" },
  evento, participantes: { inscritos },
});

test("vagas: 0 é ilimitado (null) e a contagem nunca fica negativa", () => {
  assert.equal(vagasRestantes({ vagas: 0 }, [{}, {}]), null);
  assert.equal(vagasRestantes({}, []), null);
  assert.equal(vagasRestantes({ vagas: 3 }, [{}]), 2);
  assert.equal(vagasRestantes({ vagas: 2 }, [{}, {}, {}]), 0, "lista maior que a cota não vira -1");
});

test("prazo: o configurado, ou o fim do evento por padrão", () => {
  const a = acaoEv({ ativo: true });
  assert.equal(prazoInscricao(a.evento, a), "2026-05-15");
  assert.equal(prazoInscricao({ inscricoesAte: "2026-05-10" }, a), "2026-05-10");
});

test("podeInscrever: ativo, dentro do prazo e com vaga", () => {
  assert.equal(podeInscrever(acaoEv({ ativo: true }), "2026-05-10").ok, true);
  assert.equal(podeInscrever(acaoEv({ ativo: false }), "2026-05-10").ok, false, "página desativada fecha");
  assert.equal(podeInscrever(acaoEv(null), "2026-05-10").ok, false, "sem configuração não há evento");
  assert.equal(podeInscrever(acaoEv({ ativo: true }), "2026-05-15").ok, true, "no último dia ainda vale");
  const vencido = podeInscrever(acaoEv({ ativo: true }), "2026-05-16");
  assert.equal(vencido.ok, false);
  assert.match(vencido.motivo, /prazo/i);
  const cedo = podeInscrever(acaoEv({ ativo: true, inscricoesAte: "2026-05-01" }), "2026-05-10");
  assert.equal(cedo.ok, false, "o prazo configurado vence antes do fim do evento");
  const lotado = podeInscrever(acaoEv({ ativo: true, vagas: 1 }, [{ nome: "Ana" }]), "2026-05-10");
  assert.equal(lotado.ok, false);
  assert.match(lotado.motivo, /vagas/i);
  assert.equal(podeInscrever(acaoEv({ ativo: true, vagas: 0 }, [{}, {}, {}]), "2026-05-10").ok, true,
    "vagas 0 = ilimitado");
});

test("dedupe: CPF OU e-mail já inscrito barra a segunda inscrição", () => {
  const lista = [
    { nome: "Ana", cpf: "390.533.447-05", email: "ana@exemplo.com" },
    { nome: "Bia", matricula: "G123" },   // lançada à mão, sem CPF nem e-mail
  ];
  assert.ok(jaInscrito(lista, { cpf: "39053344705", email: "outra@exemplo.com" }), "mesmo CPF, formatação diferente");
  assert.ok(jaInscrito(lista, { cpf: "11144477735", email: "ANA@exemplo.com" }), "mesmo e-mail, outra caixa");
  assert.equal(jaInscrito(lista, { cpf: "11144477735", email: "novo@exemplo.com" }), null);
  assert.equal(jaInscrito(lista, { cpf: "", email: "" }), null, "vazio não casa com o registro sem CPF");
});

test("slug reservado das páginas fixas não vira endereço de evento", async () => {
  const { slugReservado } = await import("../lib/eventos.js");
  assert.ok(slugReservado("credenciar"));
  assert.ok(slugReservado("INDEX"));
  assert.ok(!slugReservado("semana-enfermagem"));
});

test("export AEE: limpa as linhas do template, preenche e preserva as abas e o CONFIG", async () => {
  const { gerarInscritosAeeXlsx } = await import("../lib/exports.js");
  const ExcelJS = (await import("exceljs")).default;
  const acao = { proposta: { cargaHoraria: "20" }, participantes: {
    inscritos: [
      { nome: "Ana Teste", cpf: "390.533.447-05", email: "ana@x.com", telefone: "62 9", presente: true },
      { nome: "=CMD()", matricula: "G999", email: "", presente: false },   // injeção de fórmula
    ], palestrantes: [], comissao: [],
  } };
  const buf = await gerarInscritosAeeXlsx(acao);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name),
    ["Inscrições", "Palestrantes", "Comissão Organizadora", "CONFIG"], "as 4 abas sobrevivem");
  const ws = wb.getWorksheet("Inscrições");
  assert.deepEqual(ws.getRow(1).values.slice(1), ["CPF/Matrícula*", "Nome*", "Email", "Telefone", "Carga Horária"]);
  assert.equal(ws.getRow(2).getCell(1).value, "39053344705", "CPF sai só com dígitos");
  assert.equal(ws.getRow(3).getCell(1).value, "G999", "sem CPF, sai a matrícula");
  assert.equal(ws.getRow(3).getCell(2).value, "'=CMD()", "fórmula neutralizada com apóstrofo");
  assert.ok(wb.getWorksheet("CONFIG").getRow(2).getCell(1).value, "CONFIG (ID/VERSAO) preservado");
  // ?presentes=1 exporta só quem está presente
  const soPres = await gerarInscritosAeeXlsx(acao, { somentePresentes: true });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(soPres);
  const ws2 = wb2.getWorksheet("Inscrições");
  assert.equal(ws2.actualRowCount - 1, 1, "só o presente entra");
  assert.equal(ws2.getRow(2).getCell(2).value, "Ana Teste");
});

/* A ação de exemplo dos exports por atividade: uma oficina "propria" com CH
   própria, marcações e presenças por atividade e um campo extra. */
const acaoRica = () => ({
  proposta: { cargaHoraria: "20" },
  evento: {
    programacao: [
      { id: "aaaa1111", titulo: "Oficina de IA", inscricao: "propria", ch: "4h" },
      { id: "bbbb2222", titulo: "Abertura", inscricao: "geral" },
    ],
    formulario: [
      { id: "ffff1111", rotulo: "Como soube?", tipo: "selecao", opcoes: ["Redes", "Cartaz"] },
      { id: "ffff2222", rotulo: "Interesses", tipo: "multipla", opcoes: ["IA", "Saúde"] },
    ],
    mural: [{ id: "m1", nome: "Ana", texto: "oi", em: "2026-05-13T10:00:00Z" }],
  },
  participantes: {
    inscritos: [
      { nome: "Ana Teste", cpf: "390.533.447-05", email: "ana@x.com", telefone: "62 9",
        origem: "online", inscritoEm: "2026-05-10T12:00:00Z", presente: true, presentePor: "monitor",
        atividades: ["aaaa1111"], presencas: [{ atividade: "", em: "2026-05-13T08:00:00Z" }],
        consentimento: { em: "2026-05-10T12:00:00Z", versao: "abcd1234" }, comunicacoes: true,
        respostas: { ffff1111: "Redes", ffff2222: ["IA", "Saúde"] },
        online: { segundos: 3720, segundosVisiveis: 3600 } },
      { nome: "=CMD()", cpf: "111.444.777-35", email: "bia@x.com",
        origem: "online", presente: true,
        atividades: ["aaaa1111"], presencas: [{ atividade: "aaaa1111", em: "2026-05-13T09:00:00Z" }],
        respostas: { ffff1111: "=SOMA(A1)" } },
      { nome: "Caio Manual", matricula: "G123" },   // planilha da coordenação, sem consentimento
    ], palestrantes: [], comissao: [],
  },
});

test("export AEE por atividade: só quem a marcou, presença DAQUELA atividade e a CH dela", async () => {
  const { gerarInscritosAeeXlsx } = await import("../lib/exports.js");
  const ExcelJS = (await import("exceljs")).default;
  const acao = acaoRica();
  const atividade = acao.evento.programacao[0];

  const buf = await gerarInscritosAeeXlsx(acao, { atividade });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Inscrições");
  assert.equal(ws.actualRowCount - 1, 2, "só quem marcou a oficina (Caio fica fora)");
  assert.equal(ws.getRow(2).getCell(5).value, "4h", "a CH é a da atividade, não a da proposta");

  // presentes=1 no recorte da atividade: olha presencas[] DAQUELA atividade —
  // Ana tem presença geral, mas não na oficina; Bia tem na oficina
  const pres = await gerarInscritosAeeXlsx(acao, { atividade, somentePresentes: true });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(pres);
  const ws2 = wb2.getWorksheet("Inscrições");
  assert.equal(ws2.actualRowCount - 1, 1);
  assert.equal(ws2.getRow(2).getCell(2).value, "'=CMD()", "a presente na oficina, neutralizada");

  // sem atividade, o comportamento de sempre segue intacto
  const todos = await gerarInscritosAeeXlsx(acao);
  const wb3 = new ExcelJS.Workbook(); await wb3.xlsx.load(todos);
  assert.equal(wb3.getWorksheet("Inscrições").actualRowCount - 1, 3);
  assert.equal(wb3.getWorksheet("Inscrições").getRow(2).getCell(5).value, "20", "CH da proposta");
});

test("export completo: colunas fixas + uma por campo extra, tudo por seguro()", async () => {
  const { gerarInscritosCompletoXlsx } = await import("../lib/exports.js");
  const ExcelJS = (await import("exceljs")).default;
  const buf = await gerarInscritosCompletoXlsx(acaoRica());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Inscritos");
  const cab = ws.getRow(1).values.slice(1);
  assert.deepEqual(cab, [
    "Nome", "CPF", "E-mail", "Telefone", "Curso / instituição", "Origem",
    "Inscrito em", "Presente", "Presenças", "Atividades escolhidas",
    "Consentimento LGPD", "Comunicações", "Online (min)",
    "Como soube?", "Interesses",
  ], "os campos extras viram colunas, com o rótulo no cabeçalho");
  const ana = ws.getRow(2).values.slice(1);
  assert.equal(ana[0], "Ana Teste");
  assert.equal(ana[1], "39053344705", "CPF só em dígitos");
  assert.equal(ana[8], "credenciamento geral", "presença sem atividade é a entrada geral");
  assert.equal(ana[9], "Oficina de IA", "atividade sai pelo título, não pelo id");
  assert.ok(String(ana[10]).length, "consentimento com data");
  assert.equal(ana[11], "sim");
  assert.equal(ana[12], 62, "acumulado online em minutos");
  assert.equal(ana[13], "Redes");
  assert.equal(ana[14], "IA, Saúde", "múltipla vira lista legível");
  const bia = ws.getRow(3).values.slice(1);
  assert.equal(bia[0], "'=CMD()", "nome com fórmula neutralizado");
  assert.equal(bia[8], "Oficina de IA");
  assert.equal(bia[13], "'=SOMA(A1)", "resposta digitada também passa por seguro()");
  const caio = ws.getRow(4).values.slice(1);
  assert.equal(caio[5], "lista da coordenação");
  assert.equal(caio[10] ?? "", "", "sem consentimento a célula fica em branco — a ausência é informação");
  assert.equal(caio[11] ?? "", "", "comunicações só de quem consentiu online");
});
