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
import { diaSerial, hojeLocalISO, periodoDoSemestre, semestreDe as semestreCivil } from "./datas.js";

const txt = (v) => String(v ?? "").trim();
const dia = (v) => txt(v).slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ======================================================================
   1. O SEMESTRE
   ====================================================================== */

/* A conta do semestre civil é UMA só, em lib/datas.js — aqui ficam os nomes
   que este módulo já usava. O campo `semestre` do período se mantém pelo
   nome antigo: a tela e o PDF o leem. */
/** "2026/2" → { ano, semestre, inicio, fim, rotulo }. */
export function periodoDe(chave) {
  const p = periodoDoSemestre(txt(chave));
  if (!p) return null;
  const { numero, ...resto } = p;          // aqui o campo se chama `semestre`
  return { ...resto, semestre: numero };
}

/** O semestre em que uma data cai. */
export const semestreDe = (data) => semestreCivil(dia(data));

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

/* ------------------- CURRICULARIZAÇÃO DA EXTENSÃO ---------------------- */
/* Guia própria (pedido do dono, ago/2026): a Resolução CNE/CES nº 7/2018 pede
   10% da carga horária de cada curso em extensão, e o avaliador não pergunta
   quantas ações houve — pergunta QUAL disciplina do PPC cada uma atendeu e
   quantas horas foram curricularizadas. Isso é uma pergunta de ENSINO, feita a
   quem cuida do PPC, e ficava diluída numa linha do relatório da Extensão.

   Conta o que COMPROVA — a mesma régua do quadro anual (`panoramaCurricularizacao`
   em lib/curricularizacao.js): ação aprovada, com relatório entregue ou já
   registrada. Proposta em análise não comprova carga horária nenhuma, e por isso
   ela não some em silêncio: a nota diz quantas estão nesse caso, que é
   justamente o que a coordenação precisa perseguir antes do fim do semestre. */
const COMPROVAM_CURRICULAR = new Set(["aprovada", "relatorio-entregue", "registrada"]);

export function panoramaCurricularizacaoSemestre(acoes = [], periodo, { cursos = [], recorte = null } = {}) {
  const dentro = noSemestre(periodo);
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  const rotPeriodo = (c) => (txt(c) === "varios" ? "Vários períodos" : txt(c) ? `${txt(c)}º período` : "Sem período");
  const marcadas = (acoes || []).filter((a) => a?.proposta?.curricularizacao?.vinculada === true
    && dentro(a.proposta?.periodoInicio, a.proposta?.periodoFim));
  const doSem = marcadas.filter((a) => COMPROVAM_CURRICULAR.has(txt(a.status)));
  const emAnalise = marcadas.length - doSem.length;

  // o componente pode apontar OUTRO curso (a disciplina de Enfermagem numa
  // ação de Odontologia); vazio quer dizer "o curso da própria ação"
  /* Recortado a um curso, o COMPONENTE também se recorta: as horas da
     disciplina de Odontologia numa ação de Enfermagem são do PPC de
     Odontologia, e somá-las ao quadro de Enfermagem faria a coordenação levar
     ao MEC uma carga horária que não é dela. */
  const doRecorte = recorte?.length
    ? (() => {
      const alvo = new Set();
      for (const sl of recorte.map(txt)) {
        alvo.add(chaveCurso(sl));
        const c = (cursos || []).find((x) => txt(x.slug) === sl);
        if (c?.nome) alvo.add(chaveCurso(c.nome));
      }
      return (cn) => alvo.has(chaveCurso(cn));
    })()
    : () => true;
  const compsDe = (a) => (a.proposta.curricularizacao.componentes || [])
    .map((c) => ({ ...c, acao: a, cursoNome: txt(c.curso) || nome(a.proposta?.curso || a.curso) }))
    .filter((c) => doRecorte(c.cursoNome));
  // ação que só curriculariza disciplina de OUTRO curso sai da lista de quem
  // está recortado: para ele, ela não comprova hora nenhuma
  const daVez = recorte?.length ? doSem.filter((a) => compsDe(a).length) : doSem;
  const comps = daVez.flatMap(compsDe);
  const horas = comps.reduce((s, c) => s + num(c.cargaHoraria), 0);
  const academicos = comps.reduce((s, c) => s + num(c.academicos), 0);
  const disciplinas = new Set(comps.map((c) => `${c.cursoNome}::${txt(c.disciplina).toLowerCase()}`));

  const somarPor = (f) => {
    const m = {};
    for (const c of comps) {
      const k = f(c) || "Não informado";
      m[k] = (m[k] || 0) + num(c.cargaHoraria);
    }
    return m;
  };
  return {
    setor: "curricularizacao", sigla: "CE", titulo: "Curricularização da Extensão",
    total: daVez.length,
    numeros: [
      { rotulo: "Ações curricularizadas", valor: daVez.length },
      { rotulo: "Horas curricularizadas", valor: horas },
      { rotulo: "Acadêmicos alcançados", valor: academicos },
      { rotulo: "Disciplinas atendidas", valor: disciplinas.size },
    ],
    ...(emAnalise ? { nota: `${emAnalise} ação(ões) marcadas como curricularizadas ainda estão `
      + "em análise ou foram devolvidas e por isso não entram nos números: enquanto a proposta não "
      + "é aprovada, ela não comprova carga horária. Elas continuam no ARCHÉ EX, aguardando decisão." } : {}),
    quadros: [
      quadro("Horas curricularizadas por curso", somarPor((c) => c.cursoNome)),
      quadro("Horas por disciplina do PPC", somarPor((c) => txt(c.disciplina))),
      quadro("Horas por período da matriz", somarPor((c) => rotPeriodo(c.periodo))),
      quadro("Ações por curso", contarPor(daVez, (a) => nome(a.proposta?.curso || a.curso))),
    ],
    itens: daVez.map((a) => {
      const cs = compsDe(a);
      return {
        titulo: a.proposta?.titulo || "(sem título)",
        numero: a.numeroAcao || "",
        curso: nome(a.proposta?.curso || a.curso),
        responsavel: a.proposta?.responsavel || "",
        periodo: `${dia(a.proposta?.periodoInicio)} a ${dia(a.proposta?.periodoFim)}`,
        // é a linha que comprova: qual disciplina, de que período, quantas horas
        situacao: cs.map((c) => `${txt(c.disciplina) || "(sem disciplina)"}`
          + `${c.periodo ? ` · ${rotPeriodo(c.periodo)}` : ""}`
          + `${num(c.cargaHoraria) ? ` · ${num(c.cargaHoraria)}h` : ""}`
          + `${num(c.academicos) ? ` · ${num(c.academicos)} acadêmicos` : ""}`
          + `${txt(c.curso) ? ` · ${txt(c.curso)}` : ""}`).join(" | ") || "sem disciplina informada",
      };
    }),
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

/* ----------------------------- AULAS PRÁTICAS ---------------------------
   O setor entra no Relatório Semestral pela mesma razão que a monitoria: a
   aula prática é atividade de ENSINO, e um semestre inteiro delas que não
   apareça no documento some da prestação de contas ao MEC — que é
   justamente quem pergunta quantas aulas práticas o curso realizou, onde e
   com que registro.

   O recorte é pela DATA DA AULA, e conta só o que foi ENTREGUE: rascunho
   não é atividade relatada. O número que a coordenação mais usa — quantas
   disciplinas ficaram sem nenhum registro — depende do cadastro do
   semestre, e por isso ele chega junto.
   ---------------------------------------------------------------------- */
export function panoramaPraticas(relatorios = [], periodo, { cursos = [], cadastro = {} } = {}) {
  const nome = (slug) => cursos.find((c) => c.slug === slug)?.nome || slug || "Não informado";
  /* Desde ago/2026 o módulo guarda DOIS documentos: a aula prática e a
     atividade de EXTENSÃO CURRICULAR. Este panorama é o das aulas — os
     números dele respondem "quantas disciplinas ficaram sem registro", que só
     faz sentido contra o cadastro. A extensão curricular entra numa linha
     própria, com os números que são dela: sem separá-las, "aulas práticas
     relatadas" passaria a contar outra coisa. Relatório antigo não tem `tipo`:
     é aula prática, que é o que o módulo era inteiro. */
  const noPeriodo = (r) => (txt(r.semestre) ? txt(r.semestre) === periodo.chave
    : noSemestre(periodo)(r.data, r.data));
  const entregue = (r) => ["enviado", "validado"].includes(r.status);
  const daExtensao = (relatorios || []).filter((r) => noPeriodo(r) && entregue(r)
    && txt(r.tipo) === "extensao");
  const doSem = (relatorios || []).filter((r) => noPeriodo(r) && entregue(r)
    && txt(r.tipo) !== "extensao");
  const validados = doSem.filter((r) => r.status === "validado");
  const extValidados = daExtensao.filter((r) => r.status === "validado");
  const horasExt = extValidados.reduce((n, r) => n + (Number(r.cargaHoraria) || 0), 0);
  const professores = new Set(doSem.map((r) => txt(r.professor?.email).toLowerCase()).filter(Boolean));
  const disciplinas = new Set(doSem.map((r) => `${r.curso}::${txt(r.disciplina).toLowerCase()}`).filter(Boolean));
  // o cadastro dá o DENOMINADOR: sem ele, "12 relatórios" não diz se são
  // muitos ou poucos, e "disciplina sem registro" não existe
  const doCadastro = cadastro?.[periodo.chave] || {};
  const professoresCadastrados = Object.values(doCadastro)
    .flatMap((c) => (c.professores || []).map((x) => txt(x.email).toLowerCase())).filter(Boolean);
  const disciplinasCadastradas = Object.entries(doCadastro)
    .flatMap(([slug, c]) => (c.professores || [])
      .flatMap((x) => (x.disciplinas || []).map((d) => `${slug}::${txt(d).toLowerCase()}`)));
  const semRegistro = [...new Set(disciplinasCadastradas)].filter((d) => !disciplinas.has(d));
  return {
    setor: "praticas", sigla: "AP", titulo: "Aulas Práticas",
    total: doSem.length,
    numeros: [
      { rotulo: "Aulas práticas relatadas", valor: doSem.length },
      { rotulo: "Relatórios validados pela coordenação", valor: validados.length },
      { rotulo: "Professores que registraram", valor: professores.size },
      { rotulo: "Disciplinas com registro", valor: disciplinas.size },
    ],
    /* Os números da extensão curricular vão à parte, não somados: a carga
       horária só conta quando a coordenação VALIDA — a mesma régua da guia de
       curricularização do relatório semestral. */
    extensaoCurricular: {
      total: daExtensao.length, validados: extValidados.length,
      horas: horasExt,
      academicos: extValidados.reduce((n, r) => n + (Number(r.academicos) || 0), 0),
      pessoas: extValidados.reduce((n, r) => n + (Number(r.pessoasAtendidas) || 0), 0),
    },
    quadros: [
      quadro("Aulas por curso", contarPor(doSem, (r) => nome(r.curso))),
      quadro("Aulas por disciplina", contarPor(doSem, (r) => txt(r.disciplina) || "(sem disciplina)")),
      quadro("Situação dos relatórios", contarPor(doSem, (r) =>
        r.status === "validado" ? "Validado" : "Aguardando validação")),
    ],
    itens: doSem
      .slice()
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .map((r) => ({
        titulo: txt(r.disciplina) || "(sem disciplina)",
        numero: r.protocolo || "",
        curso: nome(r.curso), responsavel: r.professor?.nome || r.professor?.email || "",
        periodo: dia(r.data),
        situacao: [txt(r.local), r.status === "validado" ? "validado" : "em validação"]
          .filter(Boolean).join(" · "),
      })),
    nota: [
      professoresCadastrados.length
        ? `${professores.size} de ${new Set(professoresCadastrados).size} professor(es) cadastrado(s) `
          + "no semestre registraram ao menos uma aula prática."
        : "",
      semRegistro.length
        ? `${semRegistro.length} disciplina(s) cadastrada(s) ficaram sem nenhum relatório no período.`
        : "",
      daExtensao.length
        ? `No mesmo período houve ${daExtensao.length} relatório(s) de EXTENSÃO CURRICULAR, `
          + `${extValidados.length} já validado(s), somando ${horasExt} hora(s) curricularizadas — `
          + "eles não entram nos números acima, que são das aulas práticas."
        : "",
    ].filter(Boolean).join(" "),
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
  // a curricularização é da Extensão pelo módulo (quem coordena o setor a vê
  // sozinho), mas a pergunta é de ENSINO — por isso ela também se concede à
  // parte, no painel de acessos, a quem cuida do PPC
  { chave: "curricularizacao", sigla: "CE", nome: "Curricularização da Extensão", modulo: "extensao" },
  { chave: "eventos", sigla: "EV", nome: "Eventos", modulo: "eventos" },
  { chave: "ic", sigla: "IC", nome: "Iniciação Científica", modulo: "pesquisa" },
  { chave: "monitoria", sigla: "MO", nome: "Monitoria Acadêmica", modulo: "monitoria" },
  { chave: "atas", sigla: "AT", nome: "Atas e Colegiados", modulo: "atas" },
  { chave: "espacos", sigla: "ES", nome: "Espaços Acadêmicos", modulo: "espacos" },
  { chave: "praticas", sigla: "AP", nome: "Aulas Práticas", modulo: "praticas" },
];

export const setorRelatorioDe = (chave) =>
  SETORES_RELATORIO.find((s) => s.chave === txt(chave)) || null;

/** Os setores que uma pessoa pode relatar — o gestor geral, todos. */
export const setoresDe = (u) => (u?.papel === "gestor"
  ? SETORES_RELATORIO
  : SETORES_RELATORIO.filter((s) => (u?.modulos || []).includes(s.modulo)));

/* ======================================================================
   4. QUEM VÊ QUAL GUIA, E DE QUE CURSOS

   Pedido do dono (ago/2026): "me dê gestão de acessos a esses módulos de
   relatórios — coordenadores devem ter acesso a todos os relatórios de seus
   cursos; a Matildes da PROAC, aos relatórios de ensino e ao de
   curricularização".

   São duas perguntas diferentes, e por isso duas dimensões: QUAIS GUIAS e
   DE QUE CURSOS. Quem coordena um MÓDULO vê a guia dele inteira (é o setor
   dela); quem coordena um CURSO vê todas as guias, mas só o que é do curso
   dele — recortar por curso é o que torna seguro dar-lhe tudo. O painel de
   acessos concede as duas coisas à mão, para o caso que nenhuma regra
   automática cobre (a pró-reitora acadêmica não coordena curso nenhum e não
   é coordenadora de módulo, e precisa das guias de ensino).

   As regras se SOMAM, e o alcance mais largo vence: quem tem uma guia sem
   recorte de curso por um caminho não a perde por outro que recorta.
   ====================================================================== */

/* O curso vem escrito de DUAS formas conforme o setor: a IC, a monitoria, as
   aulas práticas, as atas e os espaços gravam o SLUG ("medicina-veterinaria");
   a Extensão grava o NOME do catálogo ("Medicina Veterinária"). Comparar as
   duas exige o catálogo, porque nem todo slug é o nome slugificado
   ("contabeis" para "Ciências Contábeis"). Daí a chave normalizada e o mapa. */
const chaveCurso = (v) => txt(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Um registro daquele setor pertence a que curso(s)? (slug ou nome, cru) */
export function cursosDoRegistro(chave, r) {
  if (!r) return [];
  switch (chave) {
    case "extensao": case "eventos":
      return [txt(r.curso), txt(r.proposta?.curso), ...(Array.isArray(r.cursosExtras) ? r.cursosExtras.map(txt) : [])]
        .filter(Boolean);
    // na curricularização o componente pode apontar OUTRO curso — a disciplina
    // de Odontologia numa ação de Enfermagem —, e quem coordena Odontologia
    // precisa vê-la: são as horas do PPC DELE que estão sendo cumpridas ali
    case "curricularizacao":
      return [txt(r.curso), txt(r.proposta?.curso),
        ...(Array.isArray(r.cursosExtras) ? r.cursosExtras.map(txt) : []),
        ...((r.proposta?.curricularizacao?.componentes || []).map((c) => txt(c.curso))),
      ].filter(Boolean);
    case "ic": case "monitoria": case "praticas": case "atas":
      return [txt(r.curso)].filter(Boolean);
    // a reserva não tem curso: tem ÓRGÃO, e o do curso vem como "curso-<slug>"
    case "espacos": return txt(r.orgao).startsWith("curso-") ? [txt(r.orgao).slice(6)] : [];
    default: return [];
  }
}

/** Recorta a base de um setor aos cursos dados (slugs). Vazio ou null = tudo. */
export function filtrarPorCurso(chave, lista, cursos, catalogo = []) {
  if (!cursos || !cursos.length) return lista || [];
  const porSlug = new Map((catalogo || []).map((c) => [txt(c.slug), c]));
  const alvo = new Set();
  for (const s of cursos.map(txt)) {
    alvo.add(chaveCurso(s));
    const c = porSlug.get(s);
    if (c?.nome) alvo.add(chaveCurso(c.nome));
  }
  return (lista || []).filter((r) => cursosDoRegistro(chave, r).some((c) => alvo.has(chaveCurso(c))));
}

/**
 * O alcance de uma pessoa nos relatórios.
 *   u                  — { email, papel, modulos }
 *   acessos            — o que o painel concedeu: { email: { setores, cursos } }
 *   cursosCoordenados  — os cursos de que a pessoa é coordenação
 * Devolve os setores que ela abre, cada um com `cursos` (null = todos).
 */
export function alcanceDeRelatorios(u, { acessos = {}, cursosCoordenados = [] } = {}) {
  const regras = [];
  const todas = SETORES_RELATORIO.map((s) => s.chave);
  if (u?.papel === "gestor") regras.push({ setores: todas, cursos: null });
  for (const s of SETORES_RELATORIO) {
    if ((u?.modulos || []).includes(s.modulo)) regras.push({ setores: [s.chave], cursos: null });
  }
  // coordenação de curso: TODAS as guias, recortadas ao que é do curso dela
  if (cursosCoordenados.length) regras.push({ setores: todas, cursos: cursosCoordenados.map(txt) });
  const g = acessos?.[txt(u?.email).toLowerCase()];
  if (g) {
    const setores = (Array.isArray(g.setores) ? g.setores : []).map(txt)
      .filter((c) => todas.includes(c));
    if (setores.length) {
      const cursos = (Array.isArray(g.cursos) ? g.cursos : []).map(txt).filter(Boolean);
      regras.push({ setores, cursos: cursos.length ? cursos : null });
    }
  }

  const porSetor = new Map();
  for (const r of regras) {
    for (const chave of r.setores) {
      if (!porSetor.has(chave)) porSetor.set(chave, { cursos: r.cursos ? [...r.cursos] : null });
      const atual = porSetor.get(chave);
      if (atual.cursos === null || r.cursos === null) { atual.cursos = null; continue; }
      atual.cursos = [...new Set([...atual.cursos, ...r.cursos])];
    }
  }
  return SETORES_RELATORIO
    .filter((s) => porSetor.has(s.chave))
    .map((s) => ({ ...s, cursos: porSetor.get(s.chave).cursos }));
}

/** O que o painel de acessos aceita gravar. Setor fora do catálogo não entra. */
export function normalizarAcessoRelatorios(bruto = {}, { cursosValidos = null } = {}) {
  const todas = SETORES_RELATORIO.map((s) => s.chave);
  const setores = [...new Set((Array.isArray(bruto.setores) ? bruto.setores : []).map(txt))]
    .filter((c) => todas.includes(c));
  let cursos = [...new Set((Array.isArray(bruto.cursos) ? bruto.cursos : []).map(txt).filter(Boolean))];
  if (cursosValidos) cursos = cursos.filter((c) => cursosValidos.includes(c));
  return { setores, cursos };
}
