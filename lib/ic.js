/* ========================================================================
   ARCHÉ IC — Iniciação Científica: núcleo do setor.

   Fluxo do projeto:
     rascunho → submetido → aprovado (em execução) → concluído
                          ↘ devolvido (volta a ser editável)
                          ↘ reprovado

   Quatro acessos:
     - GESTÃO (pró-reitor e coordenação de pesquisa): vê tudo, designa os
       avaliadores ad hoc e decide o mérito;
     - ORIENTADOR: submete o projeto, indica os alunos, mantém o cronograma
       e valida os relatórios dos seus alunos;
     - ALUNO INDICADO: envia os relatórios parcial e final;
     - AVALIADOR AD HOC: dá parecer, na seleção, apenas nos projetos em que
       foi designado.

   Visibilidade: cada um enxerga os projetos em que está — o orientador os
   seus, o aluno aqueles em que foi indicado, o avaliador os que recebeu.
   Só a gestão vê todos. O parecer ad hoc é sigiloso nos dois sentidos: o
   avaliador não vê o parecer dos colegas, e a orientação nunca sabe quem
   avaliou (ver `visaoDoProjeto`).
   ======================================================================== */
import { CURSOS, cursoDe, siglaCurso } from "./atas.js";   // catálogo comum de cursos
import { hojeLocalISO } from "./datas.js";
import { normalizarCpf, soDigitos, mesmoCpf } from "./cpf.js";
import {
  EDITAL, LINHAS, MODALIDADES as MODALIDADES_EDITAL, modalidadeDe as modalidadeEdital,
  modalidadeVigente, GRUPOS_PESQUISA, FOMENTOS, normalizarProducao, pontuarProducao,
  linhaDe, titulacaoAtende, notaClassificacao, fomentoDe, normalizarTitulacao, modalidadePor,
  normalizarGrupo, gruposConhecidos, CRITERIOS_AVALIACAO, NOTA_MAXIMA_PROJETO,
} from "./edital.js";

export { CURSOS, cursoDe, siglaCurso };
export const IC_KEY = "ic-projetos-v1";

/* ------------------------------ catálogos -------------------------------- */
// As modalidades são as do edital vigente (lib/edital.js): PIBIC/CNPq,
// PBIC/UNIEGO, PVIC e as equivalentes de IT e IE.
export {
  EDITAL, LINHAS, GRUPOS_PESQUISA, FOMENTOS, linhaDe, pontuarProducao, fomentoDe,
  modalidadePor, gruposConhecidos, normalizarGrupo,
};
export const MODALIDADES = MODALIDADES_EDITAL;
export const modalidadeDe = (c) => modalidadeEdital(modalidadeVigente(c));

export const STATUS = ["rascunho", "submetido", "devolvido", "aprovado", "concluido", "reprovado"];
export const ROTULO_STATUS = {
  rascunho: "Rascunho", submetido: "Em avaliação", devolvido: "Devolvido",
  aprovado: "Em execução", concluido: "Concluído", reprovado: "Reprovado",
};
/** Situações em que o projeto está valendo (conta nos indicadores e no cronograma). */
export const EM_ANDAMENTO = new Set(["aprovado", "concluido"]);

export const SITUACOES_ETAPA = ["prevista", "andamento", "concluida"];
export const TIPOS_RELATORIO = ["parcial", "final"];
export const SITUACOES_RELATORIO = ["enviado", "validado", "devolvido"];

/* --------------------------- avaliação ad hoc ---------------------------- */
// Critérios da seleção: cada um com o seu teto de pontos, somando 100 — a
// nota do projeto é a soma. O catálogo vive em lib/edital.js (trocar de
// edital é mexer lá); aqui só o apelido que o resto do código já usa.
export const CRITERIOS = CRITERIOS_AVALIACAO;
export const RECOMENDACOES = [
  { codigo: "recomendado", nome: "Recomendado" },
  { codigo: "ressalvas", nome: "Recomendado com ressalvas" },
  { codigo: "nao_recomendado", nome: "Não recomendado" },
];
export const SITUACOES_PARECER = ["designado", "entregue", "recusado"];

/* -------------------------------- números -------------------------------- */
/** IC-2026-001 — protocolo emitido na submissão e nunca reaproveitado. */
export function numeroProjeto({ ano, sequencial }) {
  return `IC-${ano}-${String(sequencial).padStart(3, "0")}`;
}

export function proximoSequencial(projetos, ano) {
  const usados = (projetos || [])
    .filter((p) => p?.numero && p.ano === ano)
    .map((p) => Number(String(p.numero).split("-").pop()) || 0);
  return (usados.length ? Math.max(...usados) : 0) + 1;
}

/** Emite o número do projeto, se ele ainda não tiver um. */
export function numerar(projetos, projeto) {
  if (projeto.numero) return projeto;
  const ano = projeto.ano || Number(String(projeto.criadoEm || hojeLocalISO()).slice(0, 4));
  return { ...projeto, ano, numero: numeroProjeto({ ano, sequencial: proximoSequencial(projetos, ano) }) };
}

/* ------------------------------ normalização ----------------------------- */
const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const email = (v) => t(v, 160).toLowerCase();
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const umDe = (v, lista, padrao) => (lista.includes(String(v || "")) ? String(v) : padrao);
const id = (prefixo) => `${prefixo}-${Math.random().toString(36).slice(2, 10)}`;

function normalizarAluno(a) {
  return {
    nome: t(a?.nome, 120),
    email: email(a?.email),
    // CPF é opcional e serve de chave quando o registro veio de fora (ver
    // vincularPorCpf); dígito inválido não entra, para não criar vínculo falso
    cpf: normalizarCpf(a?.cpf),
    matricula: t(a?.matricula, 40),
    curso: t(a?.curso, 60),
    periodo: t(a?.periodo, 30),          // "5º Período" — vem do formulário do edital
    // a bolsa é do aluno, não do projeto: o mesmo projeto pode ter um
    // bolsista e um voluntário
    bolsista: !!a?.bolsista,
    // Cadastro do bolsista (contrato da bolsa): documentos, contato e conta.
    // Quem preenche é o PRÓPRIO aluno, na guia Bolsa, depois de indicado — é
    // o que a PROPPEX exporta para montar os contratos, e por isso NUNCA
    // aparece para o avaliador nem para os colegas (ver alunosVisiveis).
    telefone: t(a?.telefone, 30),          // o mesmo do WhatsApp
    rg: t(a?.rg, 30),
    nascimento: data(a?.nascimento),       // a idade se calcula daqui
    endereco: t(a?.endereco, 200),
    // vínculo empregatício: o edital não permite acumular bolsa com emprego,
    // então a resposta importa — "" é "ainda não respondeu", que é diferente
    // de "não tenho"
    vinculo: umDe(a?.vinculo, ["sim", "nao"], ""),
    vinculoOnde: t(a?.vinculoOnde, 120),
    banco: t(a?.banco, 60),
    agencia: t(a?.agencia, 20),
    conta: t(a?.conta, 30),
    pix: t(a?.pix, 120),
  };
}

/** Idade em anos completos na data de referência (hoje, por padrão). */
export function idadeEm(nascimento, hoje = hojeLocalISO()) {
  const n = String(nascimento || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null;
  const [an, mn, dn] = n.split("-").map(Number);
  const [ah, mh, dh] = String(hoje).slice(0, 10).split("-").map(Number);
  let idade = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

/**
 * O cadastro do bolsista está completo? Uma resposta só, usada na tela do
 * aluno, no acompanhamento da orientação, nas pendências e no aviso da
 * gestão — três contas diferentes divergiriam na primeira mudança.
 * O vínculo empregatício conta como respondido inclusive quando é "não":
 * o que não pode é ficar em branco.
 */
export function faltaNoCadastroDoBolsista(a = {}) {
  return [
    !a.nome && "nome completo", !a.cpf && "CPF", !a.rg && "RG",
    !a.nascimento && "data de nascimento", !a.telefone && "telefone (WhatsApp)",
    !a.endereco && "endereço", !a.vinculo && "resposta sobre vínculo empregatício",
    !a.banco && "banco", !a.agencia && "agência", !a.conta && "conta corrente", !a.pix && "Pix",
  ].filter(Boolean);
}
export const cadastroDoBolsistaCompleto = (a) => faltaNoCadastroDoBolsista(a).length === 0;

function normalizarEtapa(e) {
  return {
    id: t(e?.id, 40) || id("et"),
    atividade: t(e?.atividade, 220),
    inicio: data(e?.inicio),
    fim: data(e?.fim),
    // responsável: vazio = o professor orientador; "aluno" = o aluno que
    // ainda será indicado (na submissão ele não existe); ou o e-mail de um
    // aluno já indicado
    responsavel: email(e?.responsavel),
    situacao: umDe(e?.situacao, SITUACOES_ETAPA, "prevista"),
    observacao: t(e?.observacao, 400),
  };
}

/* ------------------- a estrutura institucional dos relatórios ------------
   Os modelos institucionais da PROPPEX viraram formulário (decisão do dono,
   ago/2026): o PARCIAL é o roteiro de 7 seções que o .docx trazia; o FINAL
   é um ARTIGO CIENTÍFICO nas normas da revista escolhida pelo aluno e pela
   orientação — anexado, com os dados da revista —, mais a apresentação no
   CONINT. Mudar o roteiro é mexer nestes catálogos, preservando os campo. */
export const CAMPOS_RELATORIO_PARCIAL = [
  { campo: "introducao", rot: "Introdução",
    ajuda: "Descreva resumidamente o problema estudado." },
  { campo: "metodos", rot: "Material e Métodos",
    ajuda: "Descreva resumidamente a metodologia empregada no estudo." },
  { campo: "atividades", rot: "Atividades realizadas no período",
    ajuda: "Relacione as atividades realizadas no período, de acordo com o cronograma do projeto." },
  { campo: "resultados", rot: "Resultados e Discussão",
    ajuda: "Descreva resumidamente os resultados obtidos, discutindo-os e comparando-os com os obtidos por outros autores, quando for o caso." },
  { campo: "conclusoes", rot: "Conclusões",
    ajuda: "Escreva resumidamente as conclusões obtidas." },
  { campo: "referencias", rot: "Referências bibliográficas",
    ajuda: "Liste as referências que dão apoio ao trabalho de pesquisa, utilizadas no relatório." },
  { campo: "eventos", rot: "Participação em eventos / cursos / congressos e publicações",
    ajuda: "Cite a participação do bolsista/aluno durante o período do projeto e liste as produções relacionadas — anexe os comprovantes." },
];
export const FORMATACAO_RELATORIO =
  "Na versão em arquivo: letra Arial 12, margens de 2,5 cm, espaçamento 1,5, justificado — máximo de 4 páginas.";
// as cinco primeiras seções são obrigatórias; referências e eventos podem
// não existir num parcial (nem toda pesquisa já produziu ou participou)
export const CAMPOS_PARCIAL_OBRIGATORIOS = ["introducao", "metodos", "atividades", "resultados", "conclusoes"];

/* A avaliação que acompanha o relatório (transcrita dos formulários da
   PROPPEX): o aluno avalia o PROJETO (sim/não) e a ATUAÇÃO DO ORIENTADOR
   (0–5); o orientador, ao validar o final, avalia o DESEMPENHO DO ALUNO
   (0–5) e dá o parecer conclusivo. Cada um não vê a avaliação sobre si —
   quem lê as três é a gestão (visaoDoProjeto). */
export const PERGUNTAS_AVALIACAO_PROJETO = [
  { codigo: "formacao", texto: "Você acredita que o projeto contribuiu para sua formação profissional?" },
  { codigo: "linha", texto: "Você acredita que o projeto contribuiu para o desenvolvimento da linha de pesquisa do(a) seu(sua) orientador(a)?" },
  { codigo: "dificuldades", texto: "Você possuiu dificuldades não superadas para realizar o projeto?" },
  { codigo: "exigencia", texto: "Você considera que o nível de exigência (tempo de dedicação e assuntos trabalhados no seu projeto) foi coerente com o seu nível de formação?" },
  { codigo: "infraestrutura", texto: "A infraestrutura oferecida para a realização de seu projeto foi suficiente?" },
];
export const RESPOSTAS_AVALIACAO_PROJETO = [
  { codigo: "sim", rot: "Sim" },
  { codigo: "nao", rot: "Não" },
  { codigo: "sem-clareza", rot: "Não tenho clareza" },
];
export const ESCALA_0_5 = [
  { valor: 0, rot: "0 — Não se aplica / não avaliado" },
  { valor: 1, rot: "1 — Insuficiente" },
  { valor: 2, rot: "2 — Regular" },
  { valor: 3, rot: "3 — Bom" },
  { valor: 4, rot: "4 — Muito bom" },
  { valor: 5, rot: "5 — Excelente" },
];
export const CRITERIOS_AVALIACAO_ORIENTADOR = [
  { codigo: "disponibilidade", rot: "Disponibilidade e acessibilidade",
    texto: "O orientador esteve acessível para sanar dúvidas, discutir o andamento do projeto e realizar reuniões de acompanhamento?" },
  { codigo: "planejamento", rot: "Planejamento e cronograma",
    texto: "Auxiliou na estruturação das etapas do plano de trabalho, no estabelecimento de metas e no cumprimento dos prazos institucionais?" },
  { codigo: "suporte", rot: "Suporte teórico e metodológico",
    texto: "Ofereceu referências bibliográficas pertinentes, direcionamento conceitual e rigor na condução dos métodos científicos da pesquisa?" },
  { codigo: "infraestrutura", rot: "Infraestrutura e condições de trabalho",
    texto: "Orientou quanto ao uso adequado de laboratórios, materiais, softwares, bibliotecas ou áreas experimentais necessárias?" },
  { codigo: "retorno", rot: "Retorno e correção de relatórios",
    texto: "Fez revisões críticas, pontuais e construtivas sobre a redação dos relatórios, resumos e apresentações?" },
  { codigo: "autonomia", rot: "Estímulo à autonomia científica",
    texto: "Incentivou a postura investigativa, o pensamento crítico, a ética acadêmica e a participação em eventos científicos?" },
  { codigo: "relacao", rot: "Relação interpessoal",
    texto: "Manteve uma postura ética, respeitosa, acolhedora e motivadora ao longo de todo o ciclo de orientação?" },
];
export const CRITERIOS_AVALIACAO_ALUNO = [
  { codigo: "assiduidade", rot: "Assiduidade e pontualidade",
    texto: "O aluno cumpriu a carga horária semanal prevista, compareceu pontualmente às reuniões e manteve frequência nas atividades práticas/laboratoriais?" },
  { codigo: "metas", rot: "Cumprimento de metas e prazos",
    texto: "Demonstrou disciplina na execução do cronograma aprovado, entregando etapas, dados e versões de relatórios dentro dos prazos acordados?" },
  { codigo: "dominio", rot: "Domínio teórico e metodológico",
    texto: "Demonstrou compreensão do referencial teórico, assimilação das técnicas científicas e aplicação correta da metodologia do projeto?" },
  { codigo: "autonomia", rot: "Autonomia e proatividade",
    texto: "Mostrou iniciativa na resolução de problemas práticos, busca de literatura complementar e condução independente das rotinas de pesquisa?" },
  { codigo: "etica", rot: "Rigor ético e cuidados com a infraestrutura",
    texto: "Seguiu as normas de biossegurança/ética em pesquisa e zelou pelos equipamentos, insumos, laboratórios ou dados coletados?" },
  { codigo: "redacao", rot: "Capacidade de redação e síntese científica",
    texto: "Demonstrou clareza, correção gramatical, precisão conceitual e capacidade crítica na elaboração do relatório técnico-científico?" },
  { codigo: "integracao", rot: "Integração e postura acadêmica",
    texto: "Manteve bom relacionamento interpessoal com o orientador e o grupo de pesquisa, com receptividade às críticas e sugestões?" },
];
export const PARECERES_CONCLUSIVOS = [
  { codigo: "sem-restricoes", rot: "Aprovado sem restrições" },
  { codigo: "com-ressalvas", rot: "Aprovado com ressalvas" },
  { codigo: "reprovado", rot: "Reprovado" },
];

const escala5 = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
};
const notas0a5 = (obj, criterios) => {
  const saida = {};
  for (const c of criterios) saida[c.codigo] = escala5(obj?.[c.codigo]);
  return saida;
};

function normalizarRelatorio(r) {
  const campos = {};
  for (const s of CAMPOS_RELATORIO_PARCIAL) campos[s.campo] = t(r?.campos?.[s.campo], 20000);
  const avaliacaoProjeto = {};
  for (const q of PERGUNTAS_AVALIACAO_PROJETO) {
    avaliacaoProjeto[q.codigo] = umDe(r?.avaliacaoProjeto?.[q.codigo],
      RESPOSTAS_AVALIACAO_PROJETO.map((x) => x.codigo), "");
  }
  return {
    id: t(r?.id, 40) || id("rel"),
    tipo: umDe(r?.tipo, TIPOS_RELATORIO, "parcial"),
    aluno: email(r?.aluno),
    periodo: t(r?.periodo, 60),
    resumo: t(r?.resumo, 20000),
    // o roteiro institucional do PARCIAL, seção a seção
    campos,
    // o FINAL é um artigo científico: o arquivo vai em `anexos`, e aqui
    // ficam os dados da revista escolhida (fator de impacto se houver)
    artigo: {
      revista: t(r?.artigo?.revista, 200),
      issn: t(r?.artigo?.issn, 40),
      qualis: t(r?.artigo?.qualis, 20),
      link: t(r?.artigo?.link, 400),
      fatorImpacto: t(r?.artigo?.fatorImpacto, 40),
    },
    // as avaliações do ALUNO (projeto + atuação da orientação)…
    avaliacaoProjeto,
    avaliacaoOrientador: notas0a5(r?.avaliacaoOrientador, CRITERIOS_AVALIACAO_ORIENTADOR),
    // …e as da ORIENTAÇÃO, preenchidas na validação
    avaliacaoAluno: notas0a5(r?.avaliacaoAluno, CRITERIOS_AVALIACAO_ALUNO),
    parecerConclusivo: umDe(r?.parecerConclusivo, PARECERES_CONCLUSIVOS.map((x) => x.codigo), ""),
    anexos: Array.isArray(r?.anexos) ? r.anexos.slice(0, 10) : [],
    enviadoEm: t(r?.enviadoEm, 40),
    situacao: umDe(r?.situacao, SITUACOES_RELATORIO, "enviado"),
    parecer: t(r?.parecer, 4000),
    avaliadoPor: email(r?.avaliadoPor),
    avaliadoEm: t(r?.avaliadoEm, 40),
  };
}

/**
 * A janela de entrega (itens do modelo institucional): o PARCIAL abre no
 * 4º mês da vigência e vence no 6º; o FINAL abre no 10º e vence no fim.
 * Antes de abrir, o envio é recusado; depois de vencer, continua aceito e
 * marcado como atrasado — fechar de vez impediria a regularização.
 */
export function janelaRelatorio(p, tipo, hoje = hojeLocalISO()) {
  const prazos = prazosRelatorios(p, hoje);
  const meu = prazos?.prazos?.find((x) => x.tipo === tipo);
  if (!meu) return null;
  return {
    ...meu,
    aberta: !!meu.abre && hoje >= meu.abre,
    vencida: !!meu.vence && hoje > meu.vence,
  };
}

// cada critério aceita de 0 até o próprio teto de pontos
const nota = (v, teto = 10) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(teto, Math.max(0, Math.round(n * 10) / 10)) : null;
};

function normalizarParecer(a) {
  const notas = {};
  for (const c of CRITERIOS) notas[c.codigo] = nota(a?.notas?.[c.codigo], c.peso);
  return {
    email: email(a?.email),
    nome: t(a?.nome, 120),
    designadoEm: t(a?.designadoEm, 40),
    designadoPor: email(a?.designadoPor),
    situacao: umDe(a?.situacao, SITUACOES_PARECER, "designado"),
    notas,
    recomendacao: umDe(a?.recomendacao, RECOMENDACOES.map((r) => r.codigo), ""),
    parecer: t(a?.parecer, 20000),
    entregueEm: t(a?.entregueEm, 40),
  };
}

/** A nota do projeto num parecer: SOMA dos critérios, de 0 a 100. */
export function notaFinal(parecer) {
  const vals = CRITERIOS.map((c) => parecer?.notas?.[c.codigo]).filter((n) => typeof n === "number");
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, n) => s + n, 0) * 10) / 10;
}

/**
 * A nota do projeto vinda de uma avaliação feita FORA do sistema. A seleção
 * do edital 01/2026 correu em planilha: os avaliadores pontuaram os mesmos
 * sete critérios e escreveram o parecer, e o que chega aqui é a transcrição.
 *
 * Fica em `notaDireta`, que já é o lugar da nota atribuída pela coordenação —
 * o que muda é que agora ela vem com o detalhe (critérios, recomendação e o
 * texto do parecer), em vez de um número solto. Duas regras:
 *   - o VALOR não se aceita de fora: é sempre a soma dos critérios, como a
 *     nota do parecer se forma aqui dentro. Planilha com total digitado à mão
 *     não vira nota;
 *   - falta de qualquer critério devolve null — meia avaliação não é avaliação.
 */
export function notaTranscrita(bruto, { por = "", em = "" } = {}) {
  const notas = {};
  for (const c of CRITERIOS) {
    const n = nota(bruto?.notas?.[c.codigo], c.peso);
    if (n === null) return null;
    notas[c.codigo] = n;
  }
  return {
    valor: Math.round(Object.values(notas).reduce((s, n) => s + n, 0) * 10) / 10,
    notas,
    recomendacao: umDe(bruto?.recomendacao, RECOMENDACOES.map((r) => r.codigo), ""),
    parecer: t(bruto?.parecer, 20000),
    transcrita: true,
    por: t(por, 120),
    em: t(em, 40) || new Date().toISOString(),
  };
}

/**
 * Devolve o projeto no formato canônico. `base` é o projeto já gravado: os
 * campos de controle (número, situação, autoria, histórico) vêm dele e nunca
 * do que chega do navegador.
 */
export function normalizarProjeto(bruto, { base = null, autor = null, agora = new Date(), grupos = null } = {}) {
  const b = bruto || {};
  const agoraISO = agora.toISOString();
  const criadoEm = base?.criadoEm || agoraISO;
  return {
    id: base?.id || t(b.id, 40) || id("ic"),
    numero: base?.numero || "",
    ano: base?.ano || Number(criadoEm.slice(0, 4)),
    status: umDe(base?.status, STATUS, "rascunho"),
    criadoEm,
    criadoPor: base?.criadoPor || email(autor) || "",
    atualizadoEm: agoraISO,

    titulo: t(b.titulo, 300),
    resumo: t(b.resumo, 20000),
    palavrasChave: t(b.palavrasChave, 300),
    curso: t(b.curso, 60),
    linha: umDe(b.linha, LINHAS.map((l) => l.codigo), "ic"),
    // modalidade pretendida (opcional): o formulário do edital pergunta só a
    // linha, e quem paga se decide na seleção — ver `modalidadeEfetiva`
    modalidade: umDe(modalidadeVigente(b.modalidade), MODALIDADES.map((m) => m.codigo), ""),
    edital: t(b.edital, 80),
    linhaPesquisa: t(b.linhaPesquisa, 200),
    // vínculo com grupo do DGP/CNPq: só o nome do grupo, como pede o edital —
    // a proposta é que se liga ao grupo, não a pessoa que a submete. Grupo
    // fora da lista é aceito; se for o mesmo de um conhecido escrito de outro
    // jeito, volta à grafia oficial para não duplicar a lista
    grupoPesquisa: normalizarGrupo(b.grupoPesquisa, grupos || GRUPOS_PESQUISA),
    objetivos: t(b.objetivos, 20000),
    justificativa: t(b.justificativa, 20000),
    metodologia: t(b.metodologia, 20000),
    resultadosEsperados: t(b.resultadosEsperados, 20000),
    referencias: t(b.referencias, 20000),
    // projeto com seres humanos ou animais precisa de CEP/CEUA (item 7.7)
    etica: {
      exige: !!b.etica?.exige,
      comite: umDe(b.etica?.comite, ["cep", "ceua"], ""),
      protocolo: t(b.etica?.protocolo, 80),
      situacao: umDe(b.etica?.situacao, ["submetido", "aprovado"], ""),
    },
    // a vigência do plano é a do CICLO — igual para todos os projetos
    // (início em setembro, término em agosto do ano seguinte). O formulário
    // não pede as datas; sem data explícita (importação, histórico), vale a
    // vigência do edital vigente.
    inicio: data(b.inicio) || EDITAL.vigencia.inicio,
    fim: data(b.fim) || EDITAL.vigencia.fim,

    orientador: {
      nome: t(b.orientador?.nome, 120),
      email: email(b.orientador?.email) || base?.orientador?.email || email(autor),
      cpf: normalizarCpf(b.orientador?.cpf ?? base?.orientador?.cpf),
      titulacao: normalizarTitulacao(b.orientador?.titulacao),
      telefone: t(b.orientador?.telefone, 40),
      lattes: t(b.orientador?.lattes, 200),
    },
    // planilha de pontuação do coordenador (item 6.2): quantidades por item,
    // pontuada em lib/edital.js
    producao: normalizarProducao(b.producao ?? base?.producao),
    alunos: (Array.isArray(b.alunos) ? b.alunos : []).slice(0, 10)
      .map(normalizarAluno).filter((a) => a.nome || a.email),
    cronograma: (Array.isArray(b.cronograma) ? b.cronograma : []).slice(0, 60)
      .map(normalizarEtapa).filter((e) => e.atividade),

    // não vêm do formulário: só o servidor mexe
    relatorios: (base?.relatorios || []).map(normalizarRelatorio),
    avaliacoes: (base?.avaliacoes || []).map(normalizarParecer),
    avaliacao: base?.avaliacao || null,
    // bolsa CNPq, bolsa UNIEGO ou voluntário — definido na seleção
    fomento: base?.fomento || null,
    // procedência do lote importado: é a chave que evita duplicar na
    // reimportação, e precisa sobreviver a qualquer edição posterior
    ...(base?.origem ? { origem: base.origem } : {}),
    // projeto incluído pela PROPPEX fora do fluxo normal (pedido fora do
    // prazo deferido pelo pró-reitor): fica dito no projeto, não no boca a boca
    ...(base?.inclusaoManual ? { inclusaoManual: base.inclusaoManual } : {}),
    // nota do projeto atribuída pela coordenação (seleção que correu fora do
    // sistema): só a rota própria escreve — nunca o formulário
    ...(base?.notaDireta ? { notaDireta: base.notaDireta } : {}),
    // pedidos de substituição de bolsista: só as rotas próprias escrevem
    ...(base?.substituicoes ? { substituicoes: base.substituicoes } : {}),
    // contestação da nota: só a rota própria escreve, e o formulário do
    // projeto não pode apagá-la — é peça do processo seletivo
    ...(base?.contestacoes ? { contestacoes: (base.contestacoes || []).map(normalizarContestacao) } : {}),
    // rótulo histórico da modalidade (ex.: "PIBIC/FACEG" dos ciclos antigos):
    // vem do arquivo importado e não se recalcula com o catálogo atual
    ...(base?.modalidadeHistorica ? { modalidadeHistorica: base.modalidadeHistorica } : {}),
    ...(base?.submetidoEm ? { submetidoEm: base.submetidoEm } : {}),
    historico: base?.historico || [],
  };
}

/* -------------------------------- validação ------------------------------ */
/** Erros que impedem a SUBMISSÃO. Rascunho pode ficar incompleto à vontade. */
export function validarProjeto(p) {
  const erros = [];
  if (t(p?.titulo).length < 8) erros.push("Informe o título do projeto.");
  if (t(p?.resumo).length < 120) erros.push("O resumo precisa de ao menos 120 caracteres.");
  if (!cursoDe(p?.curso)) erros.push("Escolha o curso.");
  if (!t(p?.orientador?.nome)) erros.push("Informe o nome de quem orienta.");
  // e-mail OU CPF: o e-mail é o que dá acesso, mas o projeto importado da
  // submissão anterior chega só com o CPF e encontra o dono por ele
  if (!t(p?.orientador?.email) && !p?.orientador?.cpf)
    erros.push("Informe o e-mail (ou o CPF) de quem orienta.");
  if (!t(p?.objetivos)) erros.push("Descreva os objetivos.");
  if (!t(p?.justificativa)) erros.push("Escreva a justificativa e a relevância.");
  if (!t(p?.metodologia)) erros.push("Descreva a metodologia.");
  if (!t(p?.resultadosEsperados)) erros.push("Descreva os resultados esperados.");
  if (!t(p?.referencias)) erros.push("Informe as referências bibliográficas.");

  if (!linhaDe(p?.linha)) erros.push("Escolha a linha: IC, Inovação Tecnológica ou Iniciação à Extensão.");
  // item 4.4: a modalidade pedida exige titulação mínima de quem coordena
  const mod = modalidadeDe(p?.modalidade);
  if (mod && p?.orientador?.titulacao && !titulacaoAtende(p.orientador.titulacao, p.modalidade)) {
    erros.push(`${mod.nome} exige titulação mínima de ${mod.titulacaoMinima}; a orientação informou ${p.orientador.titulacao}.`);
  }
  // a voluntária não tem linha (vale para as três): só se cobra coerência
  // das modalidades com bolsa, que são específicas de cada frente
  if (mod && mod.linha && p?.linha && mod.linha !== p.linha) {
    erros.push(`${mod.nome} é modalidade de ${linhaDe(mod.linha)?.nome || mod.linha}.`);
  }
  // item 7.7: com seres humanos ou animais, o comitê é obrigatório
  if (p?.etica?.exige && !p?.etica?.comite) {
    erros.push("Projeto com seres humanos ou animais: informe se foi ao CEP ou à CEUA.");
  }

  const etapas = p?.cronograma || [];
  if (!etapas.length) erros.push("Monte o cronograma: ao menos uma atividade.");
  else if (etapas.some((e) => !e.inicio || !e.fim))
    erros.push("Cada atividade do cronograma precisa de início e fim.");
  else if (etapas.some((e) => e.fim < e.inicio))
    erros.push("Há atividade do cronograma terminando antes de começar.");

  for (const a of p?.alunos || []) {
    if (!a.nome) erros.push("Aluno indicado sem nome.");
    // e-mail/CPF do aluno não travam a submissão: o formulário do edital
    // pedia só nome e matrícula, e o acesso dele pode ser acertado depois
    // (vira pendência, ver `pendenciasDoProjeto`)
    if (!a.email && !a.cpf && !a.matricula)
      erros.push(`Identifique ${a.nome || "cada aluno indicado"}: e-mail, CPF ou matrícula.`);
  }
  return erros;
}

/* ------------------------------- permissões ------------------------------ */
const mesmo = (a, b) => !!a && String(a).toLowerCase() === String(b || "").toLowerCase();

/** Foi designado avaliador ad hoc deste projeto? (acumula com outros papéis) */
export const ehAvaliadorDe = ({ email: quem } = {}, p) =>
  (p?.avaliacoes || []).some((a) => mesmo(quem, a.email));

export const parecerDe = (p, quem) =>
  (p?.avaliacoes || []).find((a) => mesmo(quem, a.email)) || null;

/**
 * "gestao" | "orientador" | "aluno" | "avaliador" | null — o que a pessoa é
 * NESTE projeto. O CPF vale tanto quanto o e-mail: projeto importado da
 * submissão anterior chega sem e-mail nenhum, e é o CPF que o liga ao dono
 * assim que ele se cadastra.
 */
export function papelNoProjeto({ email: quem, cpf, gestao } = {}, p) {
  if (!p) return null;
  if (mesmo(quem, p.orientador?.email) || mesmo(quem, p.criadoPor)
    || mesmoCpf(cpf, p.orientador?.cpf)) return "orientador";
  if ((p.alunos || []).some((a) => mesmo(quem, a.email) || mesmoCpf(cpf, a.cpf))) return "aluno";
  // a gestão vem antes do parecer ad hoc: quem coordena e também avalia
  // continua coordenando (mas o parecer que der é dele, como qualquer outro)
  if (gestao) return "gestao";
  return ehAvaliadorDe({ email: quem }, p) ? "avaliador" : null;
}

export const podeVerProjeto = (u, p) => !!papelNoProjeto(u, p);

/**
 * O projeto mais recente em que a pessoa consta como ORIENTADORA com a
 * planilha de produção preenchida — casada por e-mail OU CPF, como todo
 * vínculo de orientação na IC. É o que faz a próxima submissão abrir com a
 * planilha da anterior (e a inclusão manual abrir com a do professor em
 * nome de quem se inclui, nunca com a de quem digita). A planilha é da
 * PESSOA, não do projeto: publicou algo novo, é só ajustar os números.
 */
export function producaoDoOrientador(projetos, quem) {
  const meus = (projetos || [])
    .filter((p) => papelNoProjeto({ ...quem, gestao: false }, p) === "orientador"
      && Object.keys(p.producao || {}).length)
    .sort((a, b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || "")));
  return meus.length ? meus[0] : null;
}

/**
 * A pessoa está em algum projeto de IC — como orientação, aluno indicado ou
 * avaliador designado? É o que permite entrar no setor com a conta ainda
 * pendente: quem convida é a coordenação (ou a orientação), sempre por um
 * e-mail exato, e o convidado só enxerga aquilo em que foi posto. Sem isto,
 * todo aluno e todo parecerista de fora dependeria de uma segunda aprovação
 * em /usuarios/ para fazer o que já lhe foi pedido.
 */
export const participaDeAlgum = (email, projetos, cpf = "") =>
  (projetos || []).some((p) => podeVerProjeto({ email, cpf, gestao: false }, p));

/**
 * Escreve o e-mail da conta nos projetos que a esperavam pelo CPF. Roda
 * quando o professor (ou o aluno) grava o CPF no perfil: o que veio da
 * planilha da submissão anterior passa a ter dono de verdade, e daí em
 * diante o acesso funciona pelo e-mail, como em qualquer projeto nascido
 * aqui. Muda apenas o campo vazio — nada de sobrescrever e-mail existente.
 * Devolve `{ vinculados }` e altera a lista no lugar.
 */
export function vincularPorCpf(projetos, { email: mail, cpf, agora = new Date() } = {}) {
  const digitos = soDigitos(cpf);
  if (!mail || digitos.length !== 11) return { vinculados: 0 };
  let vinculados = 0;
  for (let i = 0; i < (projetos || []).length; i++) {
    const p = projetos[i];
    let mudou = false;
    let novo = p;

    if (mesmoCpf(digitos, p.orientador?.cpf) && !p.orientador?.email) {
      novo = { ...novo, orientador: { ...novo.orientador, email: mail }, criadoPor: novo.criadoPor || mail };
      mudou = true;
    }
    const alunos = (novo.alunos || []).map((a) =>
      (mesmoCpf(digitos, a.cpf) && !a.email) ? (mudou = true, { ...a, email: mail }) : a);
    if (mudou) {
      projetos[i] = anotar({ ...novo, alunos, atualizadoEm: agora.toISOString() },
        { quem: mail, oQue: "vinculou-se ao projeto pelo CPF", agora });
      vinculados++;
    }
  }
  return { vinculados };
}

/** Editar a proposta: a gestão sempre; quem orienta, enquanto não estiver em avaliação. */
export function podeEditarProjeto(u, p) {
  const papel = papelNoProjeto(u, p);
  if (papel === "gestao") return true;
  if (papel !== "orientador") return false;
  return ["rascunho", "devolvido"].includes(p.status);
}

/** Designar e dispensar avaliador ad hoc é da gestão. */
/* Designar quem avalia é ato administrativo — e, sem ele, a proposta do
   próprio gestor geral não teria como ser avaliada por ninguém. Julgar
   continua vedado: ver podeDarParecer. */
export const podeDesignarAvaliador = (u, p) => atoDeGestao(u, p);

/**
 * Dar parecer: quem foi designado, enquanto o projeto está em avaliação.
 * A coordenação também avalia — o edital prevê uma etapa de análise pela
 * comissão da PROPPEX antes do comitê externo (item 8.1) —, e o parecer dela
 * entra no placar como o de qualquer parecerista, sem peso especial.
 * Ninguém dá parecer no próprio projeto nem no projeto em que é aluno.
 */
export function podeDarParecer(u, p) {
  if (!p || p.status !== "submetido") return false;
  const papel = papelNoProjeto(u, p);
  if (papel === "orientador" || papel === "aluno") return false;
  const meu = parecerDe(p, u?.email);
  if (meu) return meu.situacao !== "recusado";
  return papel === "gestao";        // coordenação avalia sem precisar se designar
}

/** Cronograma e indicação de alunos seguem com quem orienta durante a execução. */
export function podeGerirExecucao(u, p) {
  const papel = papelNoProjeto(u, p);
  return papel === "gestao" || papel === "orientador";
}

/** Só a gestão avalia a submissão. */
// A coordenação decide o mérito do submetido — e pode REVER a própria
// decisão nos dois sentidos (aprovado→reprovado, reprovado→aprovado)
// enquanto o ciclo não se conclui: decisão errada se corrige, não se
// carrega. Concluído é definitivo; devolvido volta pela mão do professor.
/**
 * ATO DE GESTÃO sobre um projeto — decidir a seleção, atribuir a nota apurada,
 * conceder ou remanejar bolsa, designar quem avalia. É burocracia do processo,
 * não juízo de mérito.
 *
 * O gestor geral pratica esses atos mesmo na PRÓPRIA proposta (decisão do
 * dono, ago/2026): no edital 01/2026 o mérito foi julgado por parecerista AD
 * HOC, fora do sistema — ele não se avalia, registra o que foi decidido. Sem
 * isso, as propostas dele ficavam sem ninguém que pudesse concluí-las: nota,
 * decisão e bolsa travavam, e o edital não fechava. Cada ato assim fica
 * marcado no histórico como "sobre proposta própria", que é o que o torna
 * defensável depois. Coordenador de módulo NÃO tem a prerrogativa — acima
 * dele há quem decida.
 *
 * O que continua vedado a quem é parte, sempre e para todos: DAR PARECER
 * sobre o próprio projeto (`podeDarParecer`). Esse é o juízo de mérito, e
 * ninguém o faz sobre si.
 */
export const atoDeGestao = (u, p) => {
  const papel = papelNoProjeto(u, p);
  if (papel === "gestao") return true;
  return !!u?.gestorGeral && !!u?.gestao && !!papel;   // a própria proposta
};

/** Quem DECIDE a seleção (aprovar, devolver, reprovar). */
export const podeAvaliar = (u, p) =>
  !!p && ["submetido", "aprovado", "reprovado"].includes(p.status) && atoDeGestao(u, p);

/** O ato está sendo praticado pelo gestor sobre proposta em que ele é parte? */
export const decidindoOProprio = (u, p) => atoDeGestao(u, p) && papelNoProjeto(u, p) !== "gestao";

/** Relatório é do aluno indicado — é ele quem envia. */
export function podeEnviarRelatorio(u, p) {
  return papelNoProjeto(u, p) === "aluno" && EM_ANDAMENTO.has(p.status);
}

/** Validar (ou devolver) o relatório é do orientador; a gestão também pode. */
export function podeValidarRelatorio(u, p) {
  const papel = papelNoProjeto(u, p);
  return papel === "orientador" || papel === "gestao";
}

/* ---------------------- sigilo do parecer ad hoc ------------------------- */
/**
 * O projeto como cada um pode vê-lo. O parecer ad hoc é sigiloso nos dois
 * sentidos, e é aqui que isso se cumpre — não na tela:
 *   - a ORIENTAÇÃO e o ALUNO não sabem quem avaliou nem o que se escreveu;
 *     recebem apenas a decisão da coordenação, que é o que lhes cabe responder;
 *   - o AVALIADOR vê a proposta e o seu próprio parecer, nunca o dos colegas
 *     (parecer alheio à vista ancora o julgamento), nem os relatórios, nem o
 *     histórico de quem mexeu no quê;
 *   - a GESTÃO vê tudo, porque é quem decide.
 */
/**
 * O que cada um vê da lista de alunos. Os documentos e os dados bancários
 * são DO ALUNO — ele mesmo os informa depois de indicado — e só a gestão
 * (que monta o contrato) e o próprio aluno os enxergam. A orientação
 * acompanha pelo sinal `dadosCompletos`; o avaliador não vê nem os nomes.
 */
export function alunosVisiveis(p, u) {
  const papel = papelNoProjeto(u, p);
  const alunos = p?.alunos || [];
  if (papel === "gestao") return alunos;
  if (papel === "avaliador") {
    return alunos.map((a, i) => ({ nome: `Aluno ${i + 1}`, email: "", bolsista: a.bolsista }));
  }
  return alunos.map((a) => {
    if (mesmo(u?.email, a.email) || mesmoCpf(u?.cpf, a.cpf)) return a;   // os próprios dados
    if (papel === "aluno") {
      // colega de projeto: sabe que existe — sem contato, sem documento
      return { nome: a.nome, email: "", cpf: "", matricula: "", curso: a.curso,
        periodo: a.periodo, bolsista: a.bolsista };
    }
    // orientação: o contato que ela mesma indicou, nunca o documento e a conta
    return { ...a, cpf: "", rg: "", nascimento: "", endereco: "",
      vinculo: "", vinculoOnde: "", banco: "", agencia: "", conta: "", pix: "",
      dadosCompletos: cadastroDoBolsistaCompleto(a) };
  });
}

export function visaoDoProjeto(p, u) {
  const papel = papelNoProjeto(u, p);
  if (papel === "gestao") return p;
  if (papel === "avaliador") {
    // parecer ad hoc julga a proposta, não as pessoas: os nomes da orientação
    // e dos alunos ficam de fora, e o plano de trabalho continua inteiro
    const meu = parecerDe(p, u?.email);
    // Ficam de fora tudo o que identifica ou ancora: a nota da coordenação
    // (ancoraria o julgamento como o parecer de um colega), o criadoPor e a
    // origem (trazem o e-mail de quem orienta — desanonimizariam a proposta)
    // e a marca de inclusão manual (ele julga a proposta, não como entrou).
    const { relatorios, historico, avaliacao, orientador, alunos,
      notaDireta, criadoPor, origem, inclusaoManual, substituicoes, ...proposta } = p;
    return {
      ...proposta,
      orientador: null,
      alunos: alunosVisiveis(p, u),
      cronograma: (p.cronograma || []).map((e) => ({ ...e, responsavel: "" })),
      avaliacoes: meu ? [meu] : [],
      relatorios: [], historico: [],
    };
  }
  // orientação e aluno: some a lista de avaliadores por inteiro, e com ela as
  // linhas de histórico da seleção (que nomeariam quem avaliou).
  const { avaliacoes, notaDireta, substituicoes, contestacoes, ...resto } = p;
  return {
    ...resto,
    // a troca de bolsista é assunto da orientação e da gestão — o aluno
    // recebe a notícia pelo professor, não por um quadro do sistema
    ...(papel === "orientador" && substituicoes ? { substituicoes } : {}),
    // O QUE o parecer disse volta para quem submeteu (decisão do dono,
    // ago/2026): sem devolutiva o professor não tem como melhorar a próxima
    // proposta. QUEM avaliou continua em sigilo — é avaliação cega, e o
    // anonimato é o que protege o parecerista. Só para a ORIENTAÇÃO (a
    // proposta é autoria dela) e só DEPOIS DA PUBLICAÇÃO do resultado: a
    // devolutiva é parte dele, e resultado se divulga para todos de uma vez.
    ...(papel === "orientador" && resultadoPublicado(p, u)
      ? { avaliacaoRecebida: avaliacaoRecebida({ ...p, avaliacoes, notaDireta }) }
      : {}),
    // O gestor geral, na própria proposta, continua vendo a nota atribuída:
    // é ele quem a lança, e esconder dele o número que ele mesmo digitou só
    // faria o campo abrir em branco na próxima vez.
    ...(atoDeGestao(u, p) && notaDireta ? { notaDireta } : {}),
    // a contestação é do próprio professor: ele vê a que enviou e a resposta.
    // Para o ALUNO ela some junto com o resto da seleção (o destructuring
    // acima a tira de `resto`) — é assunto entre a orientação e a coordenação.
    ...(papel === "orientador" && (contestacoes || []).length
      ? { contestacoes: (contestacoes || []).filter((c) => mesmo(c.por, u?.email)) }
      : {}),
    alunos: alunosVisiveis(p, u),
    // as avaliações que acompanham o relatório são cegas no par: o
    // ORIENTADOR não vê como o aluno o avaliou, e o ALUNO não vê as notas
    // nem o parecer conclusivo que a orientação deu sobre ele. Quem lê os
    // dois lados é a gestão (que cai no `return p` lá em cima).
    relatorios: (p.relatorios || []).map((r) => {
      if (papel === "orientador") { const { avaliacaoOrientador, ...vis } = r; return vis; }
      const { avaliacaoAluno, parecerConclusivo, ...vis } = r;
      return mesmo(r.aluno, u?.email) ? vis : { ...vis, avaliacaoOrientador: undefined };
    }),
    historico: (p.historico || []).filter((h) => !h.sigilo),
    avaliadoresDesignados: (avaliacoes || []).length,
    pareceresEntregues: (avaliacoes || []).filter((a) => a.situacao === "entregue").length,
  };
}

/* ------------------------- resultado e contestação ----------------------- */
/** O edital de um projeto, com a regra do sistema: em branco = ciclo vigente. */
export const editalDe = (p) => String(p?.edital || EDITAL.numero);

/**
 * O resultado daquele edital já foi publicado? `publicados` é o registro do
 * servidor (`ic-resultado-publicado-v1`), que chega junto de quem está
 * olhando. Antes da publicação nada de nota ou parecer sai para o professor:
 * a devolutiva é parte do resultado, e resultado se divulga uma vez, para
 * todos ao mesmo tempo.
 */
export const resultadoPublicado = (p, u) => !!u?.publicados?.[editalDe(p)]?.fase;

/** Prazo para contestar a nota, contado da publicação do PRELIMINAR. */
export const PRAZO_CONTESTACAO_DIAS = 3;

/**
 * A janela de contestação: abre quando o PRELIMINAR é publicado e fecha três
 * dias depois — ou antes, se o resultado FINAL sair, porque a contestação
 * existe justamente para ser decidida entre um e outro.
 */
export function janelaContestacao(pub, agora = new Date()) {
  // O resultado final fecha a janela, com prazo correndo ou não: a
  // contestação existe para ser decidida ANTES dele.
  if (pub?.desde?.final || pub?.fase === "final") {
    return { aberta: false, motivo: "resultado-final", ate: "" };
  }
  // `desde` guarda a data de cada fase, mas o registro pode ser ANTERIOR a
  // ele (quem publicou antes desta funcionalidade tem só `fase` e `em`) — daí
  // a leitura de reserva: publicado como preliminar, a data é a da publicação.
  const desde = pub?.desde?.preliminar || (pub?.fase === "preliminar" ? pub?.em : "");
  if (!desde) return { aberta: false, motivo: "sem-preliminar", ate: "" };
  const ate = new Date(new Date(desde).getTime() + PRAZO_CONTESTACAO_DIAS * 86400000);
  const dentro = agora <= ate;
  return {
    aberta: dentro, ate: ate.toISOString(),
    motivo: dentro ? "" : "prazo-encerrado",
    // o que a tela mostra ao professor enquanto o prazo corre
    horasRestantes: dentro ? Math.max(0, Math.ceil((ate - agora) / 3600000)) : 0,
  };
}

/** Contestar é ato de quem submeteu, uma vez por projeto, dentro da janela. */
export function podeContestar(u, p, publicados, agora = new Date()) {
  if (papelNoProjeto(u, p) !== "orientador") return false;
  if ((p?.contestacoes || []).some((c) => mesmo(c.por, u?.email))) return false;
  return janelaContestacao(publicados?.[editalDe(p)], agora).aberta;
}

function normalizarContestacao(c) {
  return {
    id: t(c?.id, 40) || id("cont"),
    por: email(c?.por), em: t(c?.em, 40),
    texto: t(c?.texto, 4000),
    resposta: t(c?.resposta, 4000),
    respondidoPor: email(c?.respondidoPor), respondidoEm: t(c?.respondidoEm, 40),
  };
}

/**
 * A devolutiva da seleção, anônima: as notas por critério, a recomendação e o
 * texto do parecer — sem e-mail, sem nome, sem data que permita deduzir quem
 * escreveu. Reúne as duas origens possíveis, porque o professor não tem por
 * que saber por qual caminho a avaliação correu:
 *   - a nota transcrita da seleção conduzida FORA do sistema (`notaDireta`),
 *     que é como o edital 01/2026 foi avaliado;
 *   - os pareceres entregues por aqui, um item por parecerista.
 * Devolve null quando não há nada avaliado — a tela não abre quadro vazio.
 */
export function avaliacaoRecebida(p) {
  const itens = [];
  if (p?.notaDireta?.notas) {
    itens.push({
      notas: p.notaDireta.notas,
      nota: p.notaDireta.valor ?? notaFinal(p.notaDireta),
      recomendacao: p.notaDireta.recomendacao || "",
      parecer: p.notaDireta.parecer || "",
    });
  }
  for (const a of p?.avaliacoes || []) {
    if (a.situacao !== "entregue") continue;
    itens.push({
      notas: a.notas || {},
      nota: notaFinal(a),
      recomendacao: a.recomendacao || "",
      parecer: a.parecer || "",
    });
  }
  if (!itens.length) return null;
  const notas = itens.map((x) => x.nota).filter((n) => typeof n === "number");
  return {
    // a NP que valeu: a nota transcrita tem precedência, como na classificação
    nota: p?.notaDireta?.valor ?? (notas.length
      ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
      : null),
    pareceres: itens,
  };
}

/** Placar dos pareceres — para a gestão decidir com o conjunto à vista. */
export function placarPareceres(p) {
  const entregues = (p?.avaliacoes || []).filter((a) => a.situacao === "entregue");
  const notas = entregues.map(notaFinal).filter((n) => typeof n === "number");
  return {
    designados: (p?.avaliacoes || []).length,
    entregues: entregues.length,
    recusados: (p?.avaliacoes || []).filter((a) => a.situacao === "recusado").length,
    media: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null,
    recomendam: entregues.filter((a) => a.recomendacao === "recomendado").length,
    ressalvas: entregues.filter((a) => a.recomendacao === "ressalvas").length,
    contra: entregues.filter((a) => a.recomendacao === "nao_recomendado").length,
  };
}

/* --------------------------- leituras derivadas -------------------------- */
export function tituloCurto(p, max = 90) {
  const s = t(p?.titulo) || "(sem título)";
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export const alunoDe = (p, mail) =>
  (p?.alunos || []).find((a) => mesmo(mail, a.email)) || null;

/**
 * Cronograma de todos os projetos num só lugar, do jeito que cada um precisa
 * ver: quem orienta enxerga as atividades dos seus projetos; o aluno, apenas
 * o próprio plano de trabalho (o que está sob a responsabilidade dele).
 */
export function cronogramaDe(projetos, u) {
  const linhas = [];
  for (const p of projetos || []) {
    const papel = papelNoProjeto(u, p);
    // o parecerista da seleção não acompanha a execução de projeto alheio
    if (!papel || papel === "avaliador") continue;
    for (const e of p.cronograma || []) {
      // o aluno só vê o que é dele; etapa sem responsável é do orientador
      // "aluno" genérico (antes da indicação) vale para qualquer aluno do projeto
      if (papel === "aluno" && !mesmo(u?.email, e.responsavel) && e.responsavel !== "aluno") continue;
      linhas.push({
        projetoId: p.id, numero: p.numero, titulo: p.titulo, status: p.status,
        curso: p.curso, modalidade: p.modalidade,
        orientador: p.orientador?.nome || p.orientador?.email || "",
        responsavelNome: e.responsavel === "aluno" ? "Aluno (a indicar)"
          : e.responsavel ? (alunoDe(p, e.responsavel)?.nome || e.responsavel)
          : (p.orientador?.nome || "Professor orientador"),
        meu: papel === "aluno" || mesmo(u?.email, e.responsavel),
        ...e,
      });
    }
  }
  return linhas.sort((a, b) => (a.inicio || "9999").localeCompare(b.inicio || "9999"));
}

/** Situação da etapa levando a data em conta — "atrasada" não é campo, é fato. */
export function etapaAtrasada(etapa, hoje = hojeLocalISO()) {
  if (!etapa || etapa.situacao === "concluida") return false;
  return !!etapa.fim && etapa.fim < hoje;
}

/** Relatórios visíveis, achatados para a tela de acompanhamento. */
export function relatoriosDe(projetos, u) {
  const linhas = [];
  for (const p of projetos || []) {
    const papel = papelNoProjeto(u, p);
    if (!papel || papel === "avaliador") continue;
    for (const r of p.relatorios || []) {
      if (papel === "aluno" && !mesmo(u?.email, r.aluno)) continue;
      linhas.push({
        projetoId: p.id, numero: p.numero, titulo: p.titulo, curso: p.curso,
        orientador: p.orientador?.nome || p.orientador?.email || "",
        alunoNome: alunoDe(p, r.aluno)?.nome || r.aluno,
        podeValidar: podeValidarRelatorio(u, p) && r.situacao === "enviado",
        ...r,
      });
    }
  }
  return linhas.sort((a, b) => String(b.enviadoEm || "").localeCompare(String(a.enviadoEm || "")));
}

/**
 * O que ainda falta de relatório em cada projeto em execução: um parcial e um
 * final por aluno indicado. É o que alimenta a lista de pendências.
 */
/**
 * Os prazos dos dois relatórios do edital (item 11.1.b): o PARCIAL vence aos
 * 6 meses de execução e o FINAL no fim da vigência — e cada um pode começar
 * a ser entregue 2 meses antes de vencer. O projeto está ATRASADO quando um
 * prazo venceu e ainda falta relatório daquele tipo (de qualquer aluno).
 * Projeto que não está em execução não tem prazo — devolve null.
 */
export function prazosRelatorios(p, hoje = hojeLocalISO()) {
  // só o projeto EM EXECUÇÃO tem prazo correndo: o concluído fechou o ciclo
  // (o arquivo histórico entra concluído — não pode aparecer "atrasado")
  if (p?.status !== "aprovado") return null;
  const somaMeses = (iso, m) => {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
    if (Number.isNaN(+d)) return "";
    d.setUTCMonth(d.getUTCMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  const inicio = p.inicio || EDITAL.vigencia.inicio;
  const fim = p.fim || EDITAL.vigencia.fim;
  const pend = relatoriosPendentes(p);
  // a janela de entrega (decisão do dono, ago/2026): o PARCIAL abre no 4º
  // mês da vigência (início + 3) e vence no 6º; o FINAL abre no 10º
  // (início + 9) e vence no fim da vigência
  const prazos = [
    { tipo: "parcial", vence: somaMeses(inicio, EDITAL.relatorios.parcial), abre: somaMeses(inicio, 3) },
    { tipo: "final", vence: String(fim).slice(0, 10), abre: somaMeses(inicio, 9) },
  ].map((x) => {
    const falta = pend.some((r) => r.tipo === x.tipo);
    return {
      ...x,
      falta,
      atrasado: falta && !!x.vence && hoje > x.vence,
    };
  });
  return { prazos, atrasado: prazos.some((x) => x.atrasado) };
}

export function relatoriosPendentes(p) {
  if (!EM_ANDAMENTO.has(p?.status)) return [];
  const faltando = [];
  for (const a of p.alunos || []) {
    for (const tipo of TIPOS_RELATORIO) {
      const r = (p.relatorios || []).find((x) => x.tipo === tipo && mesmo(x.aluno, a.email));
      if (!r || r.situacao === "devolvido") faltando.push({ tipo, aluno: a.email, nome: a.nome, devolvido: !!r });
    }
  }
  return faltando;
}

/**
 * A modalidade que vale: enquanto a seleção não define quem paga, é a
 * pretendida; decidido o fomento, é o cruzamento linha × fomento.
 */
export function modalidadeEfetiva(p) {
  const porFomento = p?.fomento?.tipo ? modalidadePor(p.linha, p.fomento.tipo) : null;
  return porFomento || modalidadeDe(p?.modalidade);
}

/**
 * Registro de quem mexeu no quê — mesma convenção das atas. `sigilo: true`
 * marca o que pertence à seleção (designação e parecer ad hoc): essas linhas
 * ficam só para a gestão, senão o histórico entregaria à orientação o nome de
 * quem avaliou — justamente o que o sigilo do parecer existe para evitar.
 */
export function anotar(p, { quem, oQue, sigilo = false, agora = new Date() }) {
  const linha = { quando: agora.toISOString(), quem: quem || "", oQue };
  if (sigilo) linha.sigilo = true;
  const historico = [...(p.historico || []), linha];
  return { ...p, historico: historico.slice(-60) };
}

/**
 * O que falta para o projeto andar — não impede a submissão, mas alguém
 * precisa resolver. É o que a tela mostra em amarelo, e o que a PROPPEX
 * cobra de quem orienta.
 */
export function pendenciasDoProjeto(p) {
  const f = [];
  const semAcesso = (p?.alunos || []).filter((a) => !a.email);
  if (semAcesso.length) {
    f.push({ tipo: "aluno-sem-email", grave: EM_ANDAMENTO.has(p?.status),
      texto: `${semAcesso.map((a) => a.nome).join(", ")} ${semAcesso.length > 1 ? "não têm" : "não tem"} e-mail informado — sem ele o aluno não entra no sistema para enviar relatório.` });
  }
  if (!(p?.alunos || []).length) f.push({ tipo: "sem-aluno", grave: false, texto: "Nenhum aluno indicado." });
  // projeto importado que ainda não encontrou o dono: quem orienta só o verá
  // quando informar o CPF no perfil (ver vincularPorCpf)
  if (!p?.orientador?.email && p?.orientador?.cpf) {
    f.push({ tipo: "orientacao-sem-conta", grave: false,
      texto: `${p.orientador.nome || "A orientação"} ainda não se vinculou — o projeto aparece na conta dela assim que informar o CPF no perfil.` });
  }
  if (!Object.keys(p?.producao || {}).length) {
    f.push({ tipo: "sem-producao", grave: false,
      texto: "Planilha de pontuação da produção acadêmica não preenchida — ela entra na nota de classificação." });
  }
  // bolsa concedida pede os dados completos do bolsista: quem os informa é
  // o PRÓPRIO aluno, depois de indicado — sem eles o contrato não sai
  if (p?.fomento && p.fomento.tipo !== "voluntario") {
    for (const a of (p.alunos || []).filter((x) => x.bolsista)) {
      const falta = faltaNoCadastroDoBolsista(a);
      if (falta.length) f.push({ tipo: "bolsista-incompleto", grave: false,
        texto: `${a.nome || "Bolsista"}: aguardando o próprio aluno informar ${falta.join(", ")} — sem isso o contrato da bolsa não sai.` });
    }
  }
  if (p?.etica?.exige && !p?.etica?.protocolo) {
    f.push({ tipo: "sem-etica", grave: EM_ANDAMENTO.has(p?.status),
      texto: "Projeto com seres humanos ou animais sem o protocolo do CEP/CEUA." });
  }
  return f;
}

/** Resumo para as listas e o painel — sem os campos longos. */
export function resumir(p, u) {
  const pend = relatoriosPendentes(p);
  const papel = papelNoProjeto(u, p);
  const placar = placarPareceres(p);
  const meuParecer = parecerDe(p, u?.email);
  return {
    id: p.id, numero: p.numero, titulo: p.titulo, status: p.status, curso: p.curso,
    modalidade: p.modalidade, linha: p.linha, edital: p.edital,
    grupoPesquisa: p.grupoPesquisa, fomento: p.fomento,
    producao: pontuarProducao(p.producao || {}).total,
    // A nota do projeto: a atribuída pela coordenação (processo que correu
    // fora do sistema) tem precedência; sem ela, a média dos pareceres. O
    // currículo entra ABSOLUTO, igual à planilha — e a nota final é a soma.
    // O recorte é pela BANDEIRA de gestão, não pelo papel: no projeto que o
    // próprio pró-reitor orienta o papel dele é "orientador", mas a nota
    // agregada precisa sair no resultado do edital mesmo assim — o que segue
    // em sigilo para ele ali é quem avaliou, nunca a soma publicada.
    classificacao: papel === "gestao" || u?.gestao === true
      ? notaClassificacao({
        notaProjeto: p.notaDireta?.valor ?? placar.media,
        pontuacaoProducao: pontuarProducao(p.producao || {}).total,
      })
      : undefined,
    ...(papel === "gestao" && p.notaDireta ? { notaDireta: p.notaDireta } : {}),
    // A gestão precisa saber QUAIS propostas são dela para decidir: quem
    // participa do projeto não o julga, e o pró-reitor que submete cai
    // exatamente nesse caso. Sem esta bandeira a tela oferecia o botão e o
    // servidor recusava depois, sem dizer por quê.
    ...(u?.gestao === true
      ? { podeDecidir: podeAvaliar(u, p), souParte: papel !== "gestao" ? papel : null }
      : {}),
    // a devolutiva da seleção vai junto na lista: são poucos projetos por
    // professor, e assim o quadro abre na hora, sem ida ao servidor. Só
    // depois de publicado o resultado — ver visaoDoProjeto.
    ...(papel === "orientador" && resultadoPublicado(p, u)
      ? {
        avaliacaoRecebida: avaliacaoRecebida(p),
        // a janela de contestação, para a tela saber se oferece o botão e
        // até quando; a decisão real é do servidor, em podeContestar
        contestacao: {
          ...janelaContestacao(u?.publicados?.[editalDe(p)]),
          minha: (p.contestacoes || []).find((c) => mesmo(c.por, u?.email)) || null,
        },
      }
      : {}),
    // o avaliador não precisa saber de quem é o projeto que julga, e a
    // orientação não fica sabendo quem julgou
    orientador: papel === "avaliador" ? null : p.orientador,
    alunos: papel === "avaliador" ? [] : alunosVisiveis(p, u),
    // inclusão deferida fora do prazo: o avaliador não precisa saber
    ...(papel !== "avaliador" && p.inclusaoManual ? { inclusaoManual: p.inclusaoManual } : {}),
    inicio: p.inicio, fim: p.fim,
    ...(papel === "gestao" ? { placar } : {}),
    ...(papel === "orientador" || papel === "aluno"
      ? { avaliadoresDesignados: placar.designados, pareceresEntregues: placar.entregues } : {}),
    meuParecer: meuParecer ? { situacao: meuParecer.situacao, entregueEm: meuParecer.entregueEm } : null,
    aDarParecer: podeDarParecer(u, p) && meuParecer?.situacao === "designado",
    etapas: (p.cronograma || []).length,
    etapasConcluidas: (p.cronograma || []).filter((e) => e.situacao === "concluida").length,
    atrasadas: (p.cronograma || []).filter((e) => etapaAtrasada(e)).length,
    relatorios: (p.relatorios || []).length,
    relatoriosPendentes: pend.length,
    // em dia ou atrasado frente aos prazos do edital (parcial/final);
    // não é assunto do avaliador, que só vê a seleção
    ...(papel !== "avaliador" ? { prazoRelatorios: prazosRelatorios(p) } : {}),
    aValidar: (p.relatorios || []).filter((r) => r.situacao === "enviado").length,
    pendencias: papel === "avaliador" ? [] : pendenciasDoProjeto(p),
    papel: papelNoProjeto(u, p),
    criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm,
  };
}
