/* ========================================================================
   ARCHÉ — Relatório Semestral de Atividades.

   Toda a prestação de contas da pró-reitoria cabe numa pergunta: *o que a
   instituição fez neste semestre, e onde está a prova?* O avaliador do MEC
   faz exatamente essa pergunta, órgão por órgão, e até aqui respondê-la
   significava abrir seis telas, exportar seis planilhas e montar o
   documento à mão — trabalho de dias, refeito a cada visita.

   Este arquivo transforma os registros que o ARCHÉ já tem no PANORAMA de um
   semestre, setor a setor. Três decisões o governam:

   1. **O semestre é civil** (janeiro–junho, julho–dezembro). Os calendários
      letivos mudam de ano para ano e de curso para curso; o semestre civil
      não muda, é o que o instrumento do INEP usa e é o que se explica numa
      linha ao avaliador.
   2. **Entra o que ACONTECEU no semestre**, não o que foi cadastrado nele:
      a ação de extensão que começou em maio e terminou em agosto conta nos
      dois — porque nos dois ela existiu. Quem responde por isso é
      `dentroDoSemestre`, com sobreposição de períodos.
   3. **Nada aqui inventa número.** Cada linha do relatório aponta para um
      registro que alguém preencheu no sistema, e é por isso que o documento
      serve como comprovação: o que ele afirma pode ser conferido.

   O documento em si (com os gráficos) é desenhado em lib/pdf.js; aqui ficam
   só as contas, que é onde os erros doem e onde os testes alcançam.
   ======================================================================== */
import { diaSerial, hojeLocalISO } from "./datas.js";

const txt = (v) => String(v ?? "").trim();
const dia = (v) => txt(v).slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ======================================================================
   1. O SEMESTRE
   ====================================================================== */

/** "2026/2" → { ano, semestre, inicio, fim, rotulo }. */
export function periodoDe(chave) {
  const m = /^(\d{4})\/([12])$/.exec(txt(chave));
  if (!m) return null;
  const ano = Number(m[1]), semestre = Number(m[2]);
  return {
    chave: `${ano}/${semestre}`, ano, semestre,
    inicio: semestre === 1 ? `${ano}-01-01` : `${ano}-07-01`,
    fim: semestre === 1 ? `${ano}-06-30` : `${ano}-12-31`,
    rotulo: `${semestre}º semestre de ${ano}`,
  };
}

/** O semestre em que uma data cai. */
export const semestreDe = (data) => {
  const d = dia(data);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const mes = Number(d.slice(5, 7));
  return `${d.slice(0, 4)}/${mes <= 6 ? 1 : 2}`;
};

/** Os semestres oferecidos na tela: do mais recente para trás. */
export function semestresDisponiveis(hoje = hojeLocalISO(), quantos = 8) {
  const atual = semestreDe(hoje);
  const [a0, s0] = atual.split("/").map(Number);
  const lista = [];
  let ano = a0, sem = s0;
  for (let i = 0; i < quantos; i++) {
    lista.push(`${ano}/${sem}`);
    if (sem === 1) { ano -= 1; sem = 2; } else { sem = 1; }
  }
  return lista;
}

/**
 * O registro pertence ao semestre? Com DUAS datas é sobreposição de
 * períodos (a ação que atravessa o semestre conta nele); com uma só, é a
 * data estar dentro da janela.
 */
export function dentroDoSemestre(p, inicio, fim) {
  const a = dia(inicio), b = dia(fim);
  if (!a) return false;
  const ini = diaSerial(p.inicio), fimP = diaSerial(p.fim);
  if (!Number.isFinite(ini) && !Number.isFinite(fimP)) return false;
  const de = Number.isFinite(ini) ? ini : fimP;
  const ate = Number.isFinite(fimP) ? fimP : ini;
  return de <= diaSerial(b) && ate >= diaSerial(a);
}

const noSemestre = (periodo) => (inicio, fim) =>
  dentroDoSemestre({ inicio: dia(inicio), fim: dia(fim || inicio) }, periodo.inicio, periodo.fim);

/* ======================================================================
   2. AS CONTAS DE CADA SETOR

   Cada função recebe a base bruta do setor e devolve a MESMA forma:

     { setor, sigla, titulo, total, numeros[], quadros[], itens[] }

   `numeros` são os destaques (os cartões grandes do topo), `quadros` são as
   distribuições que viram gráfico de barras, e `itens` é a lista nominal —
   o anexo que prova o resto. Uma forma só porque o documento é um só: seis
   formatos diferentes seriam seis geradores de PDF.
   ====================================================================== */

const quadro = (titulo, mapa, { nota = "" } = {}) => ({
  titulo, nota,
  linhas: Object.entries(mapa)
    .filter(([, v]) => num(v) > 0)
    .map(([rot, v]) => ({ rotulo: rot, valor: num(v) }))
    .sort((a, b) => b.valor - a.valor),
});

const contarPor = (lista, f) => {
  const m = {};
  for (const x of lista) {
    const k = txt(f(x)) || "Não informado";
    m[k] = (m[k] || 0) + 1;
  }
  return m;
};

/* ------------------------------- EXTENSÃO ------------------------------ */
export function panoramaExtensao(acoes = [], periodo, { cursos = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  const doSem = (acoes || []).filter((a) =>
    dentro(a.proposta?.periodoInicio, a.proposta?.periodoFim));
  const comRelatorio = doSem.filter((a) => a.relatorio?.entregueEm);
  const participantes = doSem.reduce((s, a) =>
    s + (a.participantes?.inscritos?.length || 0), 0);
  const chCurricular = doSem.reduce((s, a) =>
    s + (a.proposta?.curricularizacao?.componentes || [])
      .reduce((t, c) => t + num(c.ch), 0), 0);
  return {
    setor: "extensao", sigla: "EX", titulo: "Extensão",
    total: doSem.length,
    numeros: [
      { rotulo: "Ações no semestre", valor: doSem.length },
      { rotulo: "Relatórios entregues", valor: comRelatorio.length },
      { rotulo: "Participantes alcançados", valor: participantes },
      { rotulo: "Horas curricularizadas", valor: chCurricular },
    ],
    quadros: [
      quadro("Ações por curso", contarPor(doSem, (a) => nome(a.proposta?.curso))),
      quadro("Ações por classificação", contarPor(doSem, (a) => a.proposta?.classificacao)),
      quadro("Situação das ações", contarPor(doSem, (a) => a.status)),
    ],
    itens: doSem.map((a) => ({
      titulo: a.proposta?.titulo || "(sem título)",
      numero: a.numeroAcao || "", curso: nome(a.proposta?.curso),
      responsavel: a.proposta?.responsavel || "",
      periodo: `${dia(a.proposta?.periodoInicio)} a ${dia(a.proposta?.periodoFim)}`,
      situacao: a.status || "",
    })),
  };
}

/* -------------------------------- EVENTOS ------------------------------ */
export function panoramaEventos(acoes = [], periodo, { cursos = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  const doSem = (acoes || []).filter((a) => a.evento
    && dentro(a.proposta?.periodoInicio, a.proposta?.periodoFim));
  const inscritos = doSem.reduce((s, a) => s + (a.participantes?.inscritos?.length || 0), 0);
  const presentes = doSem.reduce((s, a) =>
    s + (a.participantes?.inscritos || []).filter((i) => i.presente).length, 0);
  const publicados = doSem.filter((a) => a.evento?.ativo).length;
  return {
    setor: "eventos", sigla: "EV", titulo: "Eventos",
    total: doSem.length,
    numeros: [
      { rotulo: "Eventos no semestre", valor: doSem.length },
      { rotulo: "Páginas publicadas", valor: publicados },
      { rotulo: "Inscritos", valor: inscritos },
      { rotulo: "Presenças confirmadas", valor: presentes },
    ],
    quadros: [
      quadro("Eventos por curso", contarPor(doSem, (a) => nome(a.proposta?.curso))),
      quadro("Inscritos por evento", Object.fromEntries(doSem.map((a) =>
        [a.proposta?.titulo || "(sem título)", (a.participantes?.inscritos || []).length]))),
    ],
    itens: doSem.map((a) => ({
      titulo: a.proposta?.titulo || "(sem título)",
      numero: a.numeroAcao || "", curso: nome(a.proposta?.curso),
      responsavel: a.proposta?.responsavel || "",
      periodo: `${dia(a.proposta?.periodoInicio)} a ${dia(a.proposta?.periodoFim)}`,
      situacao: `${(a.participantes?.inscritos || []).length} inscrito(s)`,
    })),
  };
}

/* ---------------------------- INICIAÇÃO CIENTÍFICA --------------------- */
export function panoramaIC(projetos = [], periodo, { cursos = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  const doSem = (projetos || [])
    .filter((p) => p.status !== "rascunho" && dentro(p.inicio, p.fim));
  const alunos = doSem.flatMap((p) => p.alunos || []);
  const bolsistas = alunos.filter((a) => a.bolsista).length;
  const relatorios = doSem.reduce((s, p) =>
    s + (p.relatorios || []).filter((r) => r.status === "validado").length, 0);
  return {
    setor: "ic", sigla: "IC", titulo: "Iniciação Científica",
    total: doSem.length,
    numeros: [
      { rotulo: "Projetos vigentes", valor: doSem.length },
      { rotulo: "Acadêmicos envolvidos", valor: alunos.length },
      { rotulo: "Bolsistas", valor: bolsistas },
      { rotulo: "Relatórios validados", valor: relatorios },
    ],
    quadros: [
      quadro("Projetos por curso", contarPor(doSem, (p) => nome(p.curso))),
      quadro("Projetos por linha", contarPor(doSem, (p) => p.linha)),
      quadro("Situação dos projetos", contarPor(doSem, (p) => p.status)),
    ],
    itens: doSem.map((p) => ({
      titulo: p.titulo || "(sem título)", numero: p.numero || "",
      curso: nome(p.curso), responsavel: p.orientador?.nome || "",
      periodo: `${dia(p.inicio)} a ${dia(p.fim)}`,
      situacao: (p.alunos || []).map((a) => a.nome).filter(Boolean).join(", ") || "sem aluno indicado",
    })),
  };
}

/* ------------------------------- MONITORIA ----------------------------- */
/**
 * O ARQUIVO entra aqui (pedido do dono, ago/2026). O programa só chegou ao
 * ARCHÉ em 2026/2, e os semestres anteriores vieram das planilhas que as
 * coordenações guardaram (lib/monitoriaHistorico.js). Era essa a razão de
 * migrá-los: certificado é o que a pessoa leva; o RELATÓRIO é o que a
 * instituição apresenta — e um semestre inteiro de monitoria que não aparece
 * nele some da prestação de contas ao MEC.
 *
 * As duas origens contam juntas, porque o que se conta é o mesmo fato:
 * projeto, monitor e hora. O que não se inventa é o que o arquivo não tem —
 * relatório e homologação NO SISTEMA. Por isso "Relatórios homologados" conta
 * só o que correu aqui, e cada linha do arquivo se identifica como tal: um
 * número que ninguém sabe explicar é pior que um número menor.
 */
export function panoramaMonitoria(projetos = [], periodo, { cursos = [], arquivo = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  // a monitoria é semestral e o ciclo do edital tem a MESMA forma do
  // semestre ("2026/2"): quando ele está gravado, é ele que manda — um
  // projeto submetido e ainda não aprovado pertence ao ciclo em que foi
  // submetido, mesmo que as datas ainda sejam as sugeridas pelo edital
  const doCiclo = (p) => (txt(p.ciclo) ? txt(p.ciclo) === periodo.chave : dentro(p.inicio, p.fim));
  const doSem = (projetos || []).filter((p) => p.status !== "rascunho" && doCiclo(p));
  const doArquivo = (arquivo || []).filter(doCiclo);
  const todos = [...doSem, ...doArquivo];

  const monitores = todos.flatMap((p) => p.monitores || []);
  // no arquivo as horas vêm DECLARADAS na planilha (é o que a coordenação
  // certificou); no que correu aqui, elas se calculam da vigência e da CH
  const horas = todos.reduce((s, p) => {
    if (p.arquivo) return s + num(p.horas);
    const semanas = Math.max(0, Math.ceil((diaSerial(p.fim) - diaSerial(p.inicio) + 1) / 7));
    return s + (p.monitores || []).length * semanas * num(p.chSemanal);
  }, 0);
  const homologados = doSem.flatMap((p) => p.monitores || [])
    .filter((m) => m.relatorio?.status === "homologado").length;
  return {
    setor: "monitoria", sigla: "MO", titulo: "Monitoria Acadêmica",
    total: todos.length,
    numeros: [
      { rotulo: "Projetos de monitoria", valor: todos.length },
      { rotulo: "Monitores", valor: monitores.length },
      { rotulo: "Horas de monitoria", valor: horas },
      { rotulo: "Relatórios homologados", valor: homologados },
    ],
    quadros: [
      quadro("Projetos por curso", contarPor(todos, (p) => nome(p.curso))),
      quadro("Situação dos projetos", contarPor(todos, (p) => p.status)),
      quadro("Monitores por disciplina", Object.fromEntries(todos.map((p) =>
        [p.disciplina || "(sem disciplina)", (p.monitores || []).length]))),
    ],
    itens: todos.map((p) => ({
      titulo: p.disciplina || "(sem disciplina)",
      numero: p.protocolo || (p.arquivo ? "arquivo" : ""),
      curso: nome(p.curso), responsavel: p.orientador?.nome || "",
      periodo: `${dia(p.inicio)} a ${dia(p.fim)}`,
      situacao: (p.monitores || []).map((m) => m.nome).filter(Boolean).join(", ") || "sem monitor",
    })),
    // o documento precisa poder DIZER de onde vieram as linhas do arquivo:
    // um relatório que some com a origem não se confere depois
    nota: doArquivo.length
      ? `Inclui ${doArquivo.length} projeto(s) do ARQUIVO — ciclos conduzidos antes de o `
        + "programa entrar no ARCHÉ, transcritos das planilhas entregues pelas coordenações "
        + "de curso. Eles aparecem com \u201carquivo\u201d no lugar do protocolo, e não têm "
        + "relatório nem homologação no sistema."
      : "",
  };
}

/* --------------------------------- ATAS -------------------------------- */
export function panoramaAtas(atas = [], periodo, { cursos = [], orgaos = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nomeCurso = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Institucional";
  const nomeOrgao = (cod, ata) => ata?.orgaoNome
    || orgaos.find((o) => o.codigo === cod)?.nome || cod || "Não informado";
  const doSem = (atas || []).filter((a) => dentro(a.sessao?.data, a.sessao?.data));
  const registradas = doSem.filter((a) => a.status === "registrada");
  const participacoes = registradas.reduce((s, a) => s + (a.participantes?.length || 0), 0);
  const deliberacoes = registradas.reduce((s, a) =>
    s + (a.pauta || []).filter((p) => txt(p.deliberacao)).length, 0);
  return {
    setor: "atas", sigla: "AT", titulo: "Atas e Colegiados",
    total: doSem.length,
    numeros: [
      { rotulo: "Sessões no semestre", valor: doSem.length },
      { rotulo: "Atas registradas", valor: registradas.length },
      { rotulo: "Deliberações", valor: deliberacoes },
      { rotulo: "Participações", valor: participacoes },
    ],
    quadros: [
      quadro("Sessões por órgão", contarPor(doSem, (a) => nomeOrgao(a.orgao, a))),
      quadro("Sessões por curso", contarPor(doSem, (a) => nomeCurso(a.curso))),
      quadro("Situação das atas", contarPor(doSem, (a) => a.status)),
    ],
    itens: doSem.map((a) => ({
      titulo: a.orgaoNome || nomeOrgao(a.orgao, a), numero: a.numero || "",
      curso: nomeCurso(a.curso), responsavel: a.secretaria || "",
      periodo: dia(a.sessao?.data), situacao: a.status || "",
    })),
  };
}

/* -------------------------------- ESPAÇOS ------------------------------ */
export function panoramaEspacos(reservas = [], periodo, { espacos = [] } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (id) => espacos.find((e) => e.id === id)?.nome || id || "Não informado";
  const doSem = (reservas || []).filter((r) =>
    r.status === "confirmada" && dentro(r.dataInicio, r.dataFim || r.dataInicio));
  const dias = doSem.reduce((s, r) =>
    s + Math.max(1, diaSerial(dia(r.dataFim || r.dataInicio)) - diaSerial(dia(r.dataInicio)) + 1), 0);
  const usados = new Set(doSem.flatMap((r) => (r.espacos || []).map((e) => e.espaco || e.id)));
  return {
    setor: "espacos", sigla: "ES", titulo: "Espaços Acadêmicos",
    total: doSem.length,
    numeros: [
      { rotulo: "Reservas confirmadas", valor: doSem.length },
      { rotulo: "Dias de ocupação", valor: dias },
      { rotulo: "Espaços utilizados", valor: usados.size },
      { rotulo: "Órgãos atendidos", valor: new Set(doSem.map((r) => txt(r.orgao))).size },
    ],
    quadros: [
      quadro("Reservas por espaço", contarPor(
        doSem.flatMap((r) => (r.espacos || []).map((e) => ({ e }))), (x) => nome(x.e.espaco || x.e.id))),
      quadro("Reservas por órgão", contarPor(doSem, (r) => r.orgaoNome || r.orgao)),
    ],
    itens: doSem.map((r) => ({
      titulo: r.atividade || "(sem atividade)", numero: r.protocolo || "",
      curso: r.orgaoNome || r.orgao || "", responsavel: r.solicitante?.nome || "",
      periodo: r.dataFim && r.dataFim !== r.dataInicio
        ? `${dia(r.dataInicio)} a ${dia(r.dataFim)}` : dia(r.dataInicio),
      situacao: r.status || "",
    })),
  };
}

/* ======================================================================
   3. O CATÁLOGO DOS SETORES

   A ordem aqui é a ordem do documento. `chave` é o que a tela manda; a
   função recebe (base, periodo, catalogos) e devolve o panorama.
   ====================================================================== */
export const SETORES_RELATORIO = [
  { chave: "extensao", sigla: "EX", nome: "Extensão", modulo: "extensao" },
  { chave: "eventos", sigla: "EV", nome: "Eventos", modulo: "eventos" },
  { chave: "ic", sigla: "IC", nome: "Iniciação Científica", modulo: "pesquisa" },
  { chave: "monitoria", sigla: "MO", nome: "Monitoria Acadêmica", modulo: "monitoria" },
  { chave: "atas", sigla: "AT", nome: "Atas e Colegiados", modulo: "atas" },
  { chave: "espacos", sigla: "ES", nome: "Espaços Acadêmicos", modulo: "espacos" },
];

export const setorRelatorioDe = (chave) =>
  SETORES_RELATORIO.find((s) => s.chave === txt(chave)) || null;

/** Os setores que uma pessoa pode relatar — o gestor geral, todos. */
export const setoresDe = (u) => (u?.papel === "gestor"
  ? SETORES_RELATORIO
  : SETORES_RELATORIO.filter((s) => (u?.modulos || []).includes(s.modulo)));
