/* ========================================================================
   ARCHÉ AP — Aulas Práticas.

   Pedido de coordenadores de curso (ago/2026). O professor dá a aula
   prática e, depois dela, registra o que aconteceu: disciplina, objetivo,
   local, data, atividades desenvolvidas e as FOTOS. A coordenação do curso
   — ou a coordenação pedagógica — valida, e o processo termina aí.

   Três decisões governam o desenho, e as três vêm do que o dono descreveu:

   1. **O fluxo encerra no COORDENADOR.** A PROPPEX é suporte: tem alcance
      total para destravar o que emperrar, mas não é um degrau do processo.
      Em todos os outros setores a pró-reitoria é quem homologa; aqui não,
      e é de propósito — o módulo é da PROAC, e quem acompanha a aula
      prática é a coordenação do curso.

   2. **A coordenação é POR CURSO.** Isto não existia no ARCHÉ: `modulosDe`
      dá coordenação por MÓDULO, e o coordenador de Enfermagem não pode ver
      as aulas de Direito. Por isso o módulo tem cadastro próprio de quem
      coordena o quê (`ap-equipe-v1`), e a coordenação do módulo inteiro —
      a pedagógica, que vê todos os cursos — continua vindo de `/usuarios/`.

   3. **Professores e disciplinas mudam a cada semestre; a coordenação,
      não.** São dois registros distintos: o cadastro de professores e
      disciplinas é POR SEMESTRE (`ap-cadastro-v1`), porque a cada semestre
      entra gente nova e a lista é refeita à mão; quem coordena é o quadro
      de AGORA (`ap-equipe-v1`), senão o coordenador recém-empossado não
      conseguiria validar o relatório atrasado do semestre passado.

   O semestre é o CIVIL e vira sozinho (lib/datas.js): em 01/01 passa a ser
   AAAA/1, em 01/07 a AAAA/2. Um relatório nasce carimbado com o semestre da
   DATA DA AULA, não com o de hoje — quem registra em 02/07 a aula do dia 28
   de junho está relatando o semestre anterior, e é nele que a aula conta.
   ======================================================================== */
import { CURSOS, cursoDe, siglaCurso } from "./atas.js";
import { diaSerial, hojeLocalISO, semestreDe, somaDias } from "./datas.js";

export { CURSOS, cursoDe, siglaCurso };

/* Chaves internas — fora do `/api/estado`, como todo registro que guarda
   nome, e-mail e a produção de uma pessoa identificável. */
export const AP_KEY = "ap-relatorios-v1";      // os relatórios de aula prática
export const AP_CADASTRO_KEY = "ap-cadastro-v1"; // professores e disciplinas, por semestre
export const AP_EQUIPE_KEY = "ap-equipe-v1";     // quem coordena o quê, hoje

const txt = (v, max = 4000) => String(v ?? "").trim().slice(0, max);
const email = (v) => txt(v, 160).toLowerCase();
const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(v)) ? txt(v) : "");
const mesmoEmail = (a, b) => !!email(a) && email(a) === email(b);
const listaUnica = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => txt(x, 160)).filter(Boolean))];

/* ======================================================================
   1. O RELATÓRIO DE UMA AULA PRÁTICA

   Os campos são os que o dono enumerou, e o catálogo é UM só: a tela o usa
   para desenhar o formulário e o servidor para conferir o que falta. Dois
   catálogos iguais em dois lugares acabam diferentes, e aí uma ponta aceita
   o que a outra recusa (foi o que aconteceu na entrega do relatório da
   Extensão, ago/2026).
   ====================================================================== */
export const CAMPOS_RELATORIO = [
  { campo: "disciplina", rotulo: "Disciplina", tipo: "disciplina", obrigatorio: true,
    ajuda: "A disciplina em que a aula prática aconteceu — escolhida entre as suas." },
  { campo: "data", rotulo: "Data da aula", tipo: "data", obrigatorio: true,
    ajuda: "O dia da aula prática. É ele que decide o semestre do relatório." },
  { campo: "local", rotulo: "Local", tipo: "texto", obrigatorio: true, max: 200,
    ajuda: "Onde a aula aconteceu: laboratório, campo, clínica, hospital, empresa…" },
  { campo: "objetivo", rotulo: "Objetivo da aula prática", tipo: "longo", obrigatorio: true,
    minimo: 30, ajuda: "O que a aula se propôs a desenvolver nos acadêmicos." },
  { campo: "atividades", rotulo: "Atividades desenvolvidas", tipo: "longo", obrigatorio: true,
    minimo: 30, ajuda: "O que foi feito na aula, na ordem em que aconteceu." },
];

/** O registro fotográfico é o que comprova a realização — a mesma razão do
    mínimo da Extensão, em escala menor: uma aula, três fotos. */
export const MIN_FOTOS = 3;
export const MAX_FOTOS = 12;

export const STATUS = ["rascunho", "enviado", "validado", "devolvido"];
export const ROTULO_STATUS = {
  rascunho: "Rascunho", enviado: "Aguardando validação",
  validado: "Validado", devolvido: "Devolvido para ajustes",
};
/** Relatório que conta para os números: o que foi entregue, seja qual for
    o desfecho. Rascunho não é entrega, e devolvido voltou para o professor. */
export const ENTREGUE = (r) => ["enviado", "validado"].includes(r?.status);

export function normalizarFoto(bruto = {}) {
  return {
    nome: txt(bruto.nome || bruto.name, 200) || "foto",
    link: txt(bruto.link, 600),
    fileId: txt(bruto.fileId, 120),
    tipo: txt(bruto.tipo, 120),
    tamanho: Number.isFinite(Number(bruto.tamanho)) ? Number(bruto.tamanho) : 0,
    enviadoEm: txt(bruto.enviadoEm, 40) || new Date().toISOString(),
  };
}

export function normalizarRelatorio(bruto = {}, { base = null } = {}) {
  const b = base || {};
  const data = dataISO(bruto.data ?? b.data);
  return {
    id: txt(bruto.id || b.id, 40),
    // emitido pelo SERVIDOR no envio, nunca pelo formulário
    protocolo: txt(b.protocolo, 30),
    /* O semestre sai da DATA DA AULA. Quem registra em 02/07 a aula do dia
       28/06 está relatando o semestre que acabou — carimbá-lo com o de hoje
       tiraria a aula do relatório semestral em que ela deve constar. */
    semestre: data ? semestreDe(data) : txt(b.semestre, 10),
    curso: txt(bruto.curso ?? b.curso, 60),
    professor: {
      email: email(b.professor?.email ?? bruto.professor?.email),
      nome: txt(b.professor?.nome ?? bruto.professor?.nome, 160),
    },
    disciplina: txt(bruto.disciplina ?? b.disciplina, 200),
    data,
    local: txt(bruto.local ?? b.local, 200),
    objetivo: txt(bruto.objetivo ?? b.objetivo, 4000),
    atividades: txt(bruto.atividades ?? b.atividades, 8000),
    // as fotos entram pela rota de anexo, nunca pelo corpo do formulário:
    // imagem não viaja em payload (mesma regra das artes do evento)
    fotos: (Array.isArray(b.fotos) ? b.fotos : []).map(normalizarFoto).slice(0, MAX_FOTOS),
    // a situação é do FLUXO: o formulário do professor nunca a escolhe
    status: STATUS.includes(b.status) ? b.status : "rascunho",
    enviadoEm: txt(b.enviadoEm, 40),
    parecer: b.parecer || null,
    observacao: txt(bruto.observacao ?? b.observacao, 2000),
    historico: Array.isArray(b.historico) ? b.historico : [],
    criadoPor: email(b.criadoPor ?? bruto.criadoPor),
    criadoEm: txt(b.criadoEm, 40) || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * O que falta para ENVIAR — a régua é UMA só, e vale nos dois lados: a tela
 * conta e avisa antes, o servidor recusa o envio. Diz TUDO o que falta de
 * uma vez: avisar um problema por vez faz a pessoa clicar, corrigir e
 * descobrir o seguinte (achado do dono na entrega do relatório da Extensão).
 */
export function faltaNoRelatorio(r, { hoje = hojeLocalISO() } = {}) {
  const falta = [];
  for (const c of CAMPOS_RELATORIO) {
    const v = txt(r?.[c.campo]);
    if (!v) { falta.push(`${c.rotulo} — não preenchido`); continue; }
    if (c.minimo && v.length < c.minimo) {
      falta.push(`${c.rotulo} — escreva ao menos ${c.minimo} caracteres (há ${v.length})`);
    }
  }
  if (r?.data && r.data > hoje) falta.push("Data da aula — a aula ainda não aconteceu");
  if (!txt(r?.curso)) falta.push("Curso — não identificado");
  const fotos = (r?.fotos || []).length;
  if (fotos < MIN_FOTOS) {
    falta.push(`Fotos da prática — ${fotos} de ${MIN_FOTOS} (o registro fotográfico é o que comprova a aula)`);
  }
  return falta;
}

export const podeEnviar = (r, { hoje } = {}) => faltaNoRelatorio(r, { hoje }).length === 0;

/* ======================================================================
   2. QUEM É QUEM

   Quatro figuras, e três delas nascem do CADASTRO do módulo — não há
   atribuição de papel à parte:

   1. **gestão**  — gestor geral (PROPPEX, suporte) e a coordenação do
      módulo `praticas`, que é a pedagógica: veem e validam tudo;
   2. **coordenador de curso** — listado em `equipe.cursos[curso]`: vê e
      valida os relatórios do SEU curso;
   3. **professor** — o autor do relatório: submete os seus e vê só eles;
   4. quem não é nada disso não enxerga o setor.
   ====================================================================== */
export function normalizarEquipe(bruto = {}) {
  const cursos = {};
  for (const c of CURSOS) {
    const dele = bruto?.cursos?.[c.slug] || {};
    const coord = listaUnica(dele.coordenadores).map(email).filter(Boolean);
    if (coord.length) cursos[c.slug] = { coordenadores: coord };
  }
  return {
    // a coordenação pedagógica vê TODOS os cursos: é institucional
    pedagogico: listaUnica(bruto?.pedagogico).map(email).filter(Boolean),
    cursos,
  };
}

/** Os cursos que esta pessoa coordena no módulo. */
export function cursosQueCoordena(equipe, quemEmail) {
  const e = email(quemEmail);
  if (!e) return [];
  return Object.entries(normalizarEquipe(equipe).cursos)
    .filter(([, v]) => v.coordenadores.includes(e))
    .map(([slug]) => slug);
}

/**
 * O objeto que todo recorte usa. `gestao` já vem decidido pelo servidor
 * (gestor geral ou coordenador do módulo); aqui se acrescenta o que o
 * cadastro do módulo diz.
 */
export function quemNoModulo({ email: mail = "", gestao = false } = {}, equipe = {}) {
  const eq = normalizarEquipe(equipe);
  const e = email(mail);
  const pedagogico = eq.pedagogico.includes(e);
  return {
    email: e,
    // pedagógica e gestão geral enxergam o módulo inteiro
    gestao: !!gestao || pedagogico,
    pedagogico,
    cursos: cursosQueCoordena(eq, e),
  };
}

export const coordenaCurso = (quem, curso) =>
  !!quem?.gestao || (quem?.cursos || []).includes(txt(curso, 60));

export function papelNoRelatorio(r, quem) {
  if (!r || !quem) return null;
  if (mesmoEmail(r.professor?.email, quem.email) || mesmoEmail(r.criadoPor, quem.email)) return "professor";
  if (quem.gestao) return "gestao";
  if ((quem.cursos || []).includes(txt(r.curso, 60))) return "coordenador";
  return null;
}

export const podeVer = (r, quem) => papelNoRelatorio(r, quem) !== null;

/** Editar é do autor, e só enquanto o relatório não foi validado. A gestão
    edita para destravar (é o suporte que o dono descreveu). */
export function podeEditar(r, quem) {
  const p = papelNoRelatorio(r, quem);
  if (p === "gestao") return true;
  if (p !== "professor") return false;
  return ["rascunho", "devolvido"].includes(r.status);
}

/**
 * Validar é da COORDENAÇÃO — nunca do próprio professor, mesmo que ele
 * coordene o curso: ninguém valida o próprio relatório. É a mesma regra que
 * na IC impede alguém de dar parecer sobre a própria proposta.
 */
export function podeValidar(r, quem) {
  if (r?.status !== "enviado") return false;
  if (mesmoEmail(r.professor?.email, quem?.email)) return false;
  const p = papelNoRelatorio(r, quem);
  return p === "coordenador" || p === "gestao";
}

/**
 * O recorte aplicado ANTES de devolver ao cliente. O professor não vê quem
 * validou o relatório de outro nem o histórico alheio — mas a devolutiva
 * SOBRE O SEU relatório ele vê inteira: é dela que ele precisa para
 * corrigir. Não há sigilo de parecer aqui (diferente da IC, onde o parecer
 * ad hoc é cego): a validação é um ato de coordenação, assinado.
 */
export function visaoDoRelatorio(r, quem) {
  const papel = papelNoRelatorio(r, quem);
  if (papel === null) return null;
  return { ...r, meuPapel: papel };
}

export function anotar(r, { acao, por, detalhe = "" }) {
  if (!Array.isArray(r.historico)) r.historico = [];
  r.historico.push({ em: new Date().toISOString(), por: email(por), acao, detalhe });
  if (r.historico.length > 200) r.historico = r.historico.slice(-200);
  return r;
}

/* ======================================================================
   3. O CADASTRO DE PROFESSORES E DISCIPLINAS, POR SEMESTRE

   Refeito a cada semestre, à mão, pela coordenação — foi como o dono
   descreveu. Guardar por semestre é o que permite responder "quais
   disciplinas ESTE semestre tinha?", que é a pergunta do dashboard: sem a
   lista, "disciplina sem relatório" não existe, porque não há de onde tirar
   o denominador.
   ====================================================================== */
export function normalizarProfessor(bruto = {}) {
  return {
    email: email(bruto.email),
    nome: txt(bruto.nome, 160),
    // as disciplinas que ELE dá naquele semestre — é a lista que o
    // formulário oferece e o denominador da cobrança
    disciplinas: listaUnica(bruto.disciplinas).map((d) => txt(d, 200)).slice(0, 40),
  };
}

export function normalizarCadastroDoCurso(bruto = {}) {
  const vistos = new Set();
  const professores = (Array.isArray(bruto.professores) ? bruto.professores : [])
    .map(normalizarProfessor)
    .filter((p) => {
      if (!p.email || !p.nome) return false;      // sem e-mail não há a quem cobrar
      if (vistos.has(p.email)) return false;      // a mesma pessoa não entra duas vezes
      vistos.add(p.email);
      return true;
    })
    .slice(0, 300);
  return { professores };
}

/** O cadastro inteiro: { "2026/2": { enfermagem: { professores: [...] } } } */
export function normalizarCadastro(bruto = {}) {
  const out = {};
  for (const [semestre, cursos] of Object.entries(bruto || {})) {
    if (!/^\d{4}\/[12]$/.test(String(semestre))) continue;
    const dele = {};
    for (const [slug, dados] of Object.entries(cursos || {})) {
      if (!cursoDe(slug)) continue;               // curso fora do catálogo não entra
      const c = normalizarCadastroDoCurso(dados);
      if (c.professores.length) dele[slug] = c;
    }
    if (Object.keys(dele).length) out[semestre] = dele;
  }
  return out;
}

export const professoresDoSemestre = (cadastro, semestre, curso = "") => {
  const doSem = normalizarCadastro(cadastro)[txt(semestre, 10)] || {};
  const cursos = curso ? [txt(curso, 60)] : Object.keys(doSem);
  return cursos.flatMap((slug) => (doSem[slug]?.professores || []).map((p) => ({ ...p, curso: slug })));
};

/** Todas as disciplinas cadastradas no semestre, com quem as leciona. */
export function disciplinasDoSemestre(cadastro, semestre, curso = "") {
  const mapa = new Map();
  for (const p of professoresDoSemestre(cadastro, semestre, curso)) {
    for (const d of p.disciplinas) {
      const chave = `${p.curso}::${d.toLowerCase()}`;
      if (!mapa.has(chave)) mapa.set(chave, { curso: p.curso, disciplina: d, professores: [] });
      mapa.get(chave).professores.push({ email: p.email, nome: p.nome });
    }
  }
  return [...mapa.values()].sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR"));
}

/** As disciplinas que ESTA pessoa leciona no semestre — o que o formulário oferece. */
export const minhasDisciplinas = (cadastro, semestre, quemEmail) =>
  professoresDoSemestre(cadastro, semestre)
    .filter((p) => mesmoEmail(p.email, quemEmail))
    .flatMap((p) => p.disciplinas.map((d) => ({ curso: p.curso, disciplina: d })));

/** O curso em que a pessoa leciona no semestre (o primeiro, quando há mais de um). */
export const cursoDoProfessor = (cadastro, semestre, quemEmail) =>
  professoresDoSemestre(cadastro, semestre).find((p) => mesmoEmail(p.email, quemEmail))?.curso || "";

/* ======================================================================
   4. FILTROS E PANORAMA
   ====================================================================== */

/** O recorte que a lista respeita — o servidor o aplica ANTES de devolver. */
export const meusRelatorios = (relatorios, quem) =>
  (relatorios || []).filter((r) => podeVer(r, quem));

export function filtrar(relatorios, { semestre = "", curso = "", disciplina = "", professor = "", status = "" } = {}) {
  const d = txt(disciplina, 200).toLowerCase();
  return (relatorios || []).filter((r) =>
    (!semestre || r.semestre === semestre)
    && (!curso || r.curso === curso)
    && (!d || String(r.disciplina || "").toLowerCase() === d)
    && (!professor || mesmoEmail(r.professor?.email, professor))
    && (!status || r.status === status))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))
      || String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

/**
 * O DASHBOARD do semestre — o que a coordenação abre para saber de quem
 * cobrar. Três perguntas, e cada uma precisa do cadastro para existir:
 * quantos relatórios vieram, QUE DISCIPLINAS não têm nenhum e QUE
 * PROFESSORES não registraram nada. Sem a lista de professores e
 * disciplinas do semestre não há denominador — é por isso que o cadastro
 * não é burocracia: é ele que transforma "12 relatórios" em "12 de 40".
 */
export function panorama(relatorios, cadastro, { semestre = "", curso = "" } = {}) {
  const doSem = filtrar(relatorios, { semestre, curso });
  const entregues = doSem.filter(ENTREGUE);
  const professores = professoresDoSemestre(cadastro, semestre, curso);
  const disciplinas = disciplinasDoSemestre(cadastro, semestre, curso);

  const chaveDisc = (c, d) => `${c}::${String(d || "").toLowerCase()}`;
  const comRelatorio = new Set(entregues.map((r) => chaveDisc(r.curso, r.disciplina)));
  const registrou = new Set(entregues.map((r) => email(r.professor?.email)).filter(Boolean));

  const porProfessor = professores.map((p) => {
    const dele = entregues.filter((r) => mesmoEmail(r.professor?.email, p.email));
    return {
      email: p.email, nome: p.nome, curso: p.curso,
      disciplinas: p.disciplinas.length,
      relatorios: dele.length,
      validados: dele.filter((r) => r.status === "validado").length,
      ultimo: dele.map((r) => r.data).sort().pop() || "",
    };
  }).sort((a, b) => a.relatorios - b.relatorios || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    semestre, curso,
    total: doSem.length,
    enviados: doSem.filter((r) => r.status === "enviado").length,
    validados: doSem.filter((r) => r.status === "validado").length,
    devolvidos: doSem.filter((r) => r.status === "devolvido").length,
    rascunhos: doSem.filter((r) => r.status === "rascunho").length,
    entregues: entregues.length,
    professores: professores.length,
    professoresQueRegistraram: registrou.size,
    // é esta a lista que serve à cobrança: quem NÃO registrou nada
    professoresSemRegistro: porProfessor.filter((p) => !p.relatorios),
    disciplinas: disciplinas.length,
    disciplinasSemRelatorio: disciplinas
      .filter((d) => !comRelatorio.has(chaveDisc(d.curso, d.disciplina)))
      .map((d) => ({ ...d, professores: d.professores.map((p) => p.nome).filter(Boolean) })),
    porProfessor,
    porCurso: CURSOS
      .map((c) => ({
        curso: c.nome, slug: c.slug,
        relatorios: entregues.filter((r) => r.curso === c.slug).length,
        professores: professores.filter((p) => p.curso === c.slug).length,
      }))
      .filter((x) => x.relatorios || x.professores),
    porMes: (() => {
      const mapa = new Map();
      for (const r of entregues) {
        const m = String(r.data || "").slice(0, 7);
        if (m) mapa.set(m, (mapa.get(m) || 0) + 1);
      }
      return [...mapa.entries()].sort().map(([mes, quantos]) => ({ mes, quantos }));
    })(),
  };
}

/* ======================================================================
   5. A COBRANÇA DE SEGUNDA-FEIRA

   Toda segunda o professor recebe o lembrete dos relatórios da semana que
   passou. O sistema NÃO conhece o horário das aulas — ele conhece as
   disciplinas de cada um —, então o lembrete não afirma que houve aula:
   pergunta pelos relatórios da semana e diz quantos vieram dela. Quem já
   registrou tudo o que tinha não recebe nada; e quem não tem disciplina
   cadastrada no semestre não é cobrado, porque não há do que cobrá-lo.
   ====================================================================== */

/** É segunda-feira? (0 = domingo, 1 = segunda, no fuso do portal) */
export const ehSegunda = (iso) => {
  if (diaSerial(iso) === null) return false;
  return new Date(`${iso}T12:00:00Z`).getUTCDay() === 1;
};

/** A semana anterior a uma segunda: da segunda passada ao domingo. */
export function semanaAnterior(iso) {
  if (diaSerial(iso) === null) return null;
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  // recua até a segunda desta semana e volta sete dias
  const segundaDesta = somaDias(iso, -((dow + 6) % 7));
  return { de: somaDias(segundaDesta, -7), ate: somaDias(segundaDesta, -1) };
}

/**
 * Quem receberá o lembrete e o que ele diz. Uma entrada por PESSOA — um
 * e-mail por professor, com as disciplinas dele e o que veio da semana.
 */
export function pendenciasCobranca(relatorios, cadastro, { hoje = hojeLocalISO() } = {}) {
  const semana = semanaAnterior(hoje);
  if (!semana) return [];
  const semestre = semestreDe(hoje);
  const professores = professoresDoSemestre(cadastro, semestre);
  const daSemana = (relatorios || []).filter((r) =>
    ENTREGUE(r) && r.data >= semana.de && r.data <= semana.ate);
  return professores
    .filter((p) => p.email && p.disciplinas.length)
    .map((p) => ({
      email: p.email, nome: p.nome, curso: p.curso, semestre,
      disciplinas: p.disciplinas,
      periodo: semana,
      enviados: daSemana.filter((r) => mesmoEmail(r.professor?.email, p.email)).length,
      // o rascunho aberto é o caso mais comum de esquecimento: preencheu e
      // não enviou. Vale citá-lo pelo nome, senão o lembrete parece injusto
      rascunhos: (relatorios || []).filter((r) =>
        r.status === "rascunho" && mesmoEmail(r.professor?.email, p.email)).length,
    }))
    .filter((p) => p.enviados === 0 || p.rascunhos > 0);
}

export const _paraTeste = { txt, email, dataISO, mesmoEmail, listaUnica };
