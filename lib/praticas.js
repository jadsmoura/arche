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
/* ----------------------------- OS DOIS TIPOS ---------------------------
   Pedido da PROAC (ago/2026): a ação de extensão **curricularizada** é
   componente curricular de uma disciplina — ela NÃO certifica à parte (quem
   participa cumpre carga horária do próprio curso, não recebe certificado de
   evento) —, mas o professor precisa registrar o que fez, com fotos e
   evidências, e alguém precisa validar.

   O fluxo pedido é o que este módulo já faz: professor registra → coordenação
   do curso decide → termina nela. Por isso a extensão curricular entra aqui
   como um TIPO de relatório, e não como módulo novo: um módulo à parte
   duplicaria o cadastro de professores e disciplinas, a equipe de coordenação,
   o fluxo, o PDF e a cobrança semanal — cinco coisas que já existem e que
   acabariam divergindo.

   O que muda entre os dois é o que o documento AFIRMA, e por isso os campos
   extras: a extensão curricular precisa da carga horária curricularizada, de
   quantos acadêmicos a cumpriram e de QUEM foi a comunidade alcançada — sem
   isso ela não comprova extensão, comprova aula. */
export const TIPOS = [
  { codigo: "pratica", nome: "Aula prática", sigla: "AP",
    descricao: "A aula prática de uma disciplina: laboratório, campo, clínica, estágio." },
  { codigo: "extensao", nome: "Extensão curricular", sigla: "EC",
    descricao: "A atividade de extensão que é componente curricular da disciplina "
      + "(Resolução CNE/CES nº 7/2018). Não emite certificado: a carga horária é do próprio curso." },
];
export const tipoDe = (c) => TIPOS.find((t) => t.codigo === txt(c, 20)) || TIPOS[0];
export const ehExtensao = (r) => txt(r?.tipo, 20) === "extensao";

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

/* ------- OS CAMPOS DA EXTENSÃO CURRICULAR, do modelo da PROAC ----------
   O modelo institucional ("Relatório Final de Curricularização da Extensão")
   tem 14 seções, várias em tabela. O dono o leu e pediu o corte (ago/2026):
   "está muito poluído e com perguntas demais, isso dificulta a experiência do
   usuário — removeria os campos 7, 11 e 12 e simplificaria do 3 ao 10".

   SAÍRAM inteiras: **7 — Impacto na formação acadêmica**, **11 — Reflexão
   crítica** e **12 — Quadro de alinhamento ao PPC** (as três pediam ensaio
   sobre o mesmo que as outras já dizem, e a 12 pedia competência a competência).

   SIMPLIFICADAS: a **3** era uma tabela de três objetivos com "alcançado /
   parcialmente / não" em cada linha — virou o objetivo (que o formulário já
   pedia) mais UMA escolha para o conjunto; a **4** era uma tabela de quatro
   etapas (diagnóstico, planejamento, execução, avaliação) mais um resumo —
   ficou só o texto das atividades, que é o resumo; a **6** tinha número,
   perfil, seis caixas de marcar e um texto — ficou público, quantos e o texto;
   a **8** era uma tabela de seis indicadores, e cinco deles já são campos
   desta ficha (estudantes, atendidos, parceiras) ou estão nas atividades; a
   **9** e a **10** ficaram como texto OPCIONAL, que é o que o próprio modelo
   diz ("quando aplicável"); e a **13** virou uma lista de marcar, porque ali
   ela é catálogo e não redação.

   Ficaram 12 campos, 4 deles opcionais — contra 14 seções e 5 tabelas. */

/** Seção 13 do modelo: o que a ação PRODUZIU. É catálogo, não redação. */
export const PRODUTOS_EXTENSAO = [
  "Lista de presença", "Registros fotográficos", "Relatório técnico", "Cartilha",
  "Folder", "Vídeo", "Podcast", "Oficina", "Palestra", "Artigo",
  "Produção tecnológica", "Outro",
];

/** Seção 3: o desfecho dos objetivos, para o conjunto da ação. */
export const SITUACOES_OBJETIVOS = [
  { codigo: "alcancados", nome: "Alcançados" },
  { codigo: "parcialmente", nome: "Parcialmente alcançados" },
  { codigo: "nao", nome: "Não alcançados" },
];

export const CAMPOS_EXTENSAO = [
  /* 1 — IDENTIFICAÇÃO (o que o sistema não sabe sozinho: curso, disciplina,
     docente e semestre já vêm do cadastro e da data) */
  { campo: "chDisciplina", rotulo: "Carga horária total da disciplina", tipo: "numero", obrigatorio: true, secao: "1 — Identificação",
    ajuda: "A CH da disciplina no PPC. É ela que dá sentido à hora extensionista: 20h de extensão numa disciplina de 40h é metade dela." },
  { campo: "cargaHoraria", rotulo: "Carga horária extensionista desenvolvida", tipo: "numero", obrigatorio: true, secao: "1 — Identificação",
    ajuda: "As horas desta atividade que contam como extensão na carga horária da disciplina." },
  { campo: "academicos", rotulo: "Estudantes participantes", tipo: "numero", obrigatorio: true, secao: "1 — Identificação",
    ajuda: "Quantos acadêmicos da disciplina cumpriram a carga horária nesta atividade." },
  { campo: "parceiras", rotulo: "Instituições parceiras", tipo: "texto", obrigatorio: false, max: 300, secao: "1 — Identificação",
    ajuda: "A escola, a unidade de saúde, a associação, a prefeitura — separadas por vírgula. Em branco se não houve." },
  { campo: "acaoExtensao", rotulo: "Nº da ação de extensão", tipo: "texto", obrigatorio: false, max: 40, secao: "1 — Identificação",
    ajuda: "Se a atividade faz parte de uma ação já aprovada no ARCHÉ EX, informe o número (EXT-AAAA-NNN)." },

  /* 2 — RESUMO EXECUTIVO */
  { campo: "resumo", rotulo: "Resumo executivo", tipo: "longo", obrigatorio: true, minimo: 200, secao: "2 — Resumo executivo",
    ajuda: "De 5 a 10 linhas: o problema enfrentado, o público atendido, a ação realizada e os principais resultados." },

  /* 3 — OBJETIVOS E RESULTADOS (o objetivo vem do catálogo comum) */
  { campo: "situacaoObjetivos", rotulo: "Situação dos objetivos", tipo: "escolha", obrigatorio: true,
    opcoes: SITUACOES_OBJETIVOS, secao: "3 — Objetivos e resultados",
    ajuda: "O desfecho do conjunto dos objetivos previstos. O que os explica é o próprio objetivo, acima." },

  /* 5 — PARTICIPAÇÃO DISCENTE */
  { campo: "participacaoDiscente", rotulo: "Participação discente", tipo: "longo", obrigatorio: true, minimo: 60, secao: "5 — Participação discente",
    ajuda: "O que os estudantes fizeram: elaboração de materiais, oficinas, palestras, aplicação de questionários, atendimentos, produção técnica." },

  /* 6 — IMPACTO SOCIAL E COMUNITÁRIO */
  { campo: "publico", rotulo: "Público atendido", tipo: "texto", obrigatorio: true, max: 300, secao: "6 — Impacto social",
    ajuda: "Quem foi atendido fora da sala de aula, e o perfil dele: alunos do 5º ano de uma escola municipal, idosos de um CRAS, produtores rurais." },
  { campo: "pessoasAtendidas", rotulo: "Pessoas atendidas", tipo: "numero", obrigatorio: true, secao: "6 — Impacto social",
    ajuda: "Quantas pessoas da comunidade a ação alcançou." },
  { campo: "impacto", rotulo: "Impacto observado na comunidade", tipo: "longo", obrigatorio: true, minimo: 60, secao: "6 — Impacto social",
    ajuda: "O que mudou para quem foi atendido: conhecimento ampliado, capacitação, promoção da saúde, fortalecimento comunitário." },

  /* 9 e 10 — OPCIONAIS, como o próprio modelo diz ("quando aplicável") */
  { campo: "avaliacaoComunidade", rotulo: "Avaliação da comunidade", tipo: "longo", obrigatorio: false, secao: "10 — Avaliação da comunidade",
    ajuda: "Síntese das avaliações recebidas, se houve. Ex.: “dos 87 participantes avaliados, 94% classificaram a atividade como excelente”." },
  { campo: "valorSocial", rotulo: "Valor social estimado", tipo: "texto", obrigatorio: false, max: 400, secao: "9 — Valor social estimado",
    ajuda: "Quando for possível estimar: o benefício social equivalente, com a referência usada. Em branco quando não se aplica." },

  /* 13 — PRODUTOS E EVIDÊNCIAS */
  { campo: "produtos", rotulo: "Produtos e evidências gerados", tipo: "marcar", obrigatorio: false,
    opcoes: PRODUTOS_EXTENSAO, secao: "13 — Produtos e evidências",
    ajuda: "Marque o que a ação produziu. Os arquivos entram nos anexos, abaixo." },
];

/* Os campos comuns mudam de NOME na extensão curricular: "Objetivo da aula
   prática" ali é "Objetivos previstos no projeto", e "Data da aula" é a data
   da atividade. É rótulo, não campo — o que se grava continua sendo o mesmo,
   e por isso o relatório antigo não precisa de migração nenhuma. */
const ROTULOS_EXTENSAO = {
  disciplina: ["Disciplina", "A disciplina de que esta atividade é componente curricular."],
  data: ["Data da atividade", "O dia em que a atividade aconteceu. É ela que decide o semestre do relatório."],
  local: ["Local", "Onde a atividade aconteceu: a escola, o bairro, a unidade de saúde, o campus."],
  objetivo: ["Objetivos previstos no projeto", "O que a atividade se propôs a alcançar na comunidade e na formação dos acadêmicos."],
  atividades: ["Atividades realizadas", "O que foi feito, na ordem em que aconteceu — do diagnóstico à avaliação."],
};

/** O catálogo que vale para um relatório — é UM só, e a tela e o servidor o
    leem do mesmo lugar (dois catálogos iguais acabam diferentes). */
export const camposDo = (tipo) => (txt(tipo, 20) !== "extensao" ? CAMPOS_RELATORIO : [
  ...CAMPOS_RELATORIO.map((c) => (ROTULOS_EXTENSAO[c.campo]
    ? { ...c, rotulo: ROTULOS_EXTENSAO[c.campo][0], ajuda: ROTULOS_EXTENSAO[c.campo][1],
      secao: c.campo === "objetivo" ? "3 — Objetivos e resultados"
        : c.campo === "atividades" ? "4 — Atividades realizadas" : "1 — Identificação" }
    : c)),
  ...CAMPOS_EXTENSAO,
]);

/** O registro fotográfico é o que comprova a realização — a mesma razão do
    mínimo da Extensão, em escala menor: uma aula, três fotos. */
export const MIN_FOTOS = 3;
export const MAX_FOTOS = 12;
/** Evidências: o que NÃO é foto — lista de presença, ofício, folder, plano de
    aula. Nunca obrigatórias (a foto é que comprova a realização), e por isso
    não entram na régua do envio. */
export const MAX_EVIDENCIAS = 12;

/* "reprovado" entrou em ago/2026 com a extensão curricular (pedido da PROAC:
   "o coordenador aprova, devolve ou reprova"). Ele é o fim de linha que
   faltava: devolvido volta editável para o professor corrigir; reprovado
   encerra o processo — a atividade não é aceita, e só a PROAC ou a PROPPEX
   reabrem. Vale para os DOIS tipos: são um fluxo só, numa tela só, e duas
   listas de decisão para o mesmo botão acabariam divergindo. */
export const STATUS = ["rascunho", "enviado", "validado", "devolvido", "reprovado"];
export const ROTULO_STATUS = {
  rascunho: "Rascunho", enviado: "Aguardando validação",
  validado: "Validado", devolvido: "Devolvido para ajustes", reprovado: "Reprovado",
};
export const DECISOES = ["validado", "devolvido", "reprovado"];
/** O processo acabou: só a PROAC ou a PROPPEX o reabrem. */
export const ENCERRADO = (r) => ["validado", "reprovado"].includes(r?.status);
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
  /* O TIPO se fixa na criação: é ele que escolhe os campos obrigatórios, o
     título do documento e a coluna em que a atividade conta no semestral —
     trocá-lo depois faria um relatório enviado como aula prática ser cobrado
     como extensão, com campos que ninguém preencheu. */
  const tipo = tipoDe(b.tipo || bruto.tipo).codigo;
  const inteiro = (v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  return {
    id: txt(bruto.id || b.id, 40),
    tipo,
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
    /* Relatório de semestre ANTERIOR, com disciplina digitada à mão (pedido
       do dono, ago/2026): a marca é do SERVIDOR, na criação — diz à
       coordenação que a disciplina não veio do cadastro do semestre. */
    foraDoCadastro: !!b.foraDoCadastro,
    data,
    local: txt(bruto.local ?? b.local, 200),
    objetivo: txt(bruto.objetivo ?? b.objetivo, 4000),
    atividades: txt(bruto.atividades ?? b.atividades, 8000),
    // só a extensão curricular os usa; no relatório de aula prática ficam
    // zerados, e é `camposDo` que decide o que se cobra
    chDisciplina: inteiro(bruto.chDisciplina ?? b.chDisciplina),
    cargaHoraria: inteiro(bruto.cargaHoraria ?? b.cargaHoraria),
    academicos: inteiro(bruto.academicos ?? b.academicos),
    parceiras: txt(bruto.parceiras ?? b.parceiras, 300),
    acaoExtensao: txt(bruto.acaoExtensao ?? b.acaoExtensao, 40),
    resumo: txt(bruto.resumo ?? b.resumo, 4000),
    situacaoObjetivos: SITUACOES_OBJETIVOS.some((x) => x.codigo === txt(bruto.situacaoObjetivos ?? b.situacaoObjetivos, 20))
      ? txt(bruto.situacaoObjetivos ?? b.situacaoObjetivos, 20) : "",
    participacaoDiscente: txt(bruto.participacaoDiscente ?? b.participacaoDiscente, 4000),
    publico: txt(bruto.publico ?? b.publico, 300),
    pessoasAtendidas: inteiro(bruto.pessoasAtendidas ?? b.pessoasAtendidas),
    impacto: txt(bruto.impacto ?? b.impacto, 4000),
    avaliacaoComunidade: txt(bruto.avaliacaoComunidade ?? b.avaliacaoComunidade, 4000),
    valorSocial: txt(bruto.valorSocial ?? b.valorSocial, 400),
    produtos: [...new Set((Array.isArray(bruto.produtos ?? b.produtos) ? (bruto.produtos ?? b.produtos) : [])
      .map((x) => txt(x, 60)).filter((x) => PRODUTOS_EXTENSAO.includes(x)))],
    // as fotos entram pela rota de anexo, nunca pelo corpo do formulário:
    // imagem não viaja em payload (mesma regra das artes do evento)
    fotos: (Array.isArray(b.fotos) ? b.fotos : []).map(normalizarFoto).slice(0, MAX_FOTOS),
    // as evidências entram pela mesma rota de anexo, e pela mesma razão
    evidencias: (Array.isArray(b.evidencias) ? b.evidencias : []).map(normalizarFoto).slice(0, MAX_EVIDENCIAS),
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
  for (const c of camposDo(r?.tipo)) {
    if (!c.obrigatorio) continue;
    if (c.tipo === "numero") {
      if (!(Number(r?.[c.campo]) > 0)) falta.push(`${c.rotulo} — informe um número maior que zero`);
      continue;
    }
    if (c.tipo === "marcar") {
      if (!(r?.[c.campo] || []).length) falta.push(`${c.rotulo} — marque ao menos um`);
      continue;
    }
    const v = txt(r?.[c.campo]);
    if (!v) { falta.push(`${c.rotulo} — não preenchido`); continue; }
    if (c.minimo && v.length < c.minimo) {
      falta.push(`${c.rotulo} — escreva ao menos ${c.minimo} caracteres (há ${v.length})`);
    }
  }
  if (r?.data && r.data > hoje) {
    falta.push(ehExtensao(r) ? "Data — a atividade ainda não aconteceu"
      : "Data da aula — a aula ainda não aconteceu");
  }
  if (!txt(r?.curso)) falta.push("Curso — não identificado");
  const fotos = (r?.fotos || []).length;
  if (fotos < MIN_FOTOS) {
    falta.push(ehExtensao(r)
      ? `Fotos da atividade — ${fotos} de ${MIN_FOTOS} (o registro fotográfico é o que comprova a realização)`
      : `Fotos da prática — ${fotos} de ${MIN_FOTOS} (o registro fotográfico é o que comprova a aula)`);
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
/** Os dois papéis que validam o relatório de um curso. */
export const PAPEIS_COORDENACAO = [
  { codigo: "coordenador", nome: "Coordenador(a) do curso" },
  { codigo: "pedagogico", nome: "Coordenador(a) pedagógico(a)" },
];

/**
 * Uma pessoa da coordenação. Aceita a forma ANTIGA (só o e-mail, em texto) e
 * a nova ({ email, nome, papel }) — o NOME entra porque é ele que sai
 * impresso no documento: sem ele, o relatório sairia assinado por um
 * endereço de e-mail.
 */
export function normalizarCoordenador(bruto) {
  if (typeof bruto === "string") return { email: email(bruto), nome: "", papel: "coordenador" };
  const e = email(bruto?.email);
  return {
    email: e, nome: txt(bruto?.nome, 160),
    papel: PAPEIS_COORDENACAO.some((p) => p.codigo === txt(bruto?.papel))
      ? txt(bruto.papel) : "coordenador",
  };
}

export function normalizarEquipe(bruto = {}) {
  const limpar = (lista) => {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : [])
      .map(normalizarCoordenador)
      .filter((p) => {
        if (!p.email || vistos.has(p.email)) return false;   // a mesma pessoa não entra duas vezes
        vistos.add(p.email);
        return true;
      })
      .slice(0, 20);
  };
  const cursos = {};
  for (const c of CURSOS) {
    const coord = limpar(bruto?.cursos?.[c.slug]?.coordenadores);
    if (coord.length) cursos[c.slug] = { coordenadores: coord };
  }
  return {
    // a coordenação pedagógica INSTITUCIONAL vê todos os cursos — diferente
    // do pedagógico DE CURSO, que valida só o dele
    pedagogico: limpar(bruto?.pedagogico),
    cursos,
  };
}

/** Os cursos que esta pessoa coordena no módulo. */
export function cursosQueCoordena(equipe, quemEmail) {
  const e = email(quemEmail);
  if (!e) return [];
  return Object.entries(normalizarEquipe(equipe).cursos)
    .filter(([, v]) => v.coordenadores.some((p) => p.email === e))
    .map(([slug]) => slug);
}

/** Quem coordena um curso, com nome e papel — é o que sai no documento. */
export const coordenacaoDoCurso = (equipe, curso) =>
  normalizarEquipe(equipe).cursos?.[txt(curso, 60)]?.coordenadores || [];

/**
 * O objeto que todo recorte usa. `gestao` já vem decidido pelo servidor
 * (gestor geral ou coordenador do módulo); aqui se acrescenta o que o
 * cadastro do módulo diz.
 */
export function quemNoModulo({ email: mail = "", gestao = false } = {}, equipe = {}) {
  const eq = normalizarEquipe(equipe);
  const e = email(mail);
  const pedagogico = eq.pedagogico.some((p) => p.email === e);
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
 * REABRIR um processo encerrado (pedido da PROAC, ago/2026: "a PROAC e a
 * PROPPEX podem reabrir processos caso notem irregularidades"). É das DUAS,
 * com os mesmos poderes — `quem.gestao` já reúne a coordenação do módulo
 * (a pedagógica, que é a PROAC) e o gestor geral (a PROPPEX).
 *
 * Reabrir NÃO decide: devolve o relatório ao ponto do fluxo em que a decisão
 * ainda pode ser tomada, e o processo continua terminando no COORDENADOR —
 * que é a regra do módulo e não muda por causa disto. Para onde ele volta é
 * escolha de quem reabre: `enviado` recoloca o relatório na fila da
 * coordenação (a irregularidade está na DECISÃO), `devolvido` o devolve ao
 * professor (a irregularidade está no RELATÓRIO).
 */
export function podeReabrir(r, quem) {
  if (!ENCERRADO(r)) return false;
  return papelNoRelatorio(r, quem) === "gestao";
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

/** A decisão foi tomada por quem NÃO coordena aquele curso? (a PROAC ou a
    PROPPEX decidindo no lugar da coordenação, pedido da PROAC ago/2026). O
    ato fica marcado no parecer e no histórico: quem lê o documento meses
    depois precisa saber que ali não foi a coordenação do curso que assinou. */
export const decisaoNoLugarDaCoordenacao = (r, quem) =>
  papelNoRelatorio(r, quem) === "gestao" && !(quem?.cursos || []).includes(txt(r?.curso, 60));

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

export function filtrar(relatorios, { semestre = "", curso = "", disciplina = "", professor = "", status = "", tipo = "" } = {}) {
  const d = txt(disciplina, 200).toLowerCase();
  return (relatorios || []).filter((r) =>
    (!semestre || r.semestre === semestre)
    && (!curso || r.curso === curso)
    // relatório antigo não tem `tipo`: é aula prática, que é o que o módulo
    // era inteiro até ago/2026 — por isso o padrão, e não uma migração
    && (!tipo || tipoDe(r.tipo).codigo === tipo)
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
/* O panorama é o das AULAS PRÁTICAS: são os números dele que respondem
   "quantas disciplinas ficaram sem registro", e a extensão curricular não tem
   denominador no cadastro (nem toda disciplina curriculariza extensão). Por
   isso ela sai num bloco à parte, com os números que são DELA — carga horária
   e acadêmicos —, em vez de somar-se a um total que passaria a significar
   outra coisa. */
export function panorama(relatorios, cadastro, { semestre = "", curso = "" } = {}) {
  const doSem = filtrar(relatorios, { semestre, curso, tipo: "pratica" });
  const entregues = doSem.filter(ENTREGUE);
  const daExtensao = filtrar(relatorios, { semestre, curso, tipo: "extensao" });
  const extEntregues = daExtensao.filter(ENTREGUE);
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
    extensaoCurricular: {
      total: daExtensao.length,
      entregues: extEntregues.length,
      enviados: daExtensao.filter((r) => r.status === "enviado").length,
      validados: daExtensao.filter((r) => r.status === "validado").length,
      reprovados: daExtensao.filter((r) => r.status === "reprovado").length,
      // os dois números do PPC: horas curricularizadas e quem as cumpriu.
      // Só do VALIDADO — atividade que a coordenação ainda não aceitou não
      // comprova carga horária nenhuma, que é a mesma régua da guia de
      // curricularização no Relatório Semestral.
      horas: daExtensao.filter((r) => r.status === "validado")
        .reduce((n, r) => n + (Number(r.cargaHoraria) || 0), 0),
      academicos: daExtensao.filter((r) => r.status === "validado")
        .reduce((n, r) => n + (Number(r.academicos) || 0), 0),
      disciplinas: new Set(extEntregues
        .map((r) => `${r.curso}::${String(r.disciplina || "").toLowerCase()}`)).size,
    },
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
