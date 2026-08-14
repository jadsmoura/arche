/* ========================================================================
   ARCHÉ AT — Pauta Regulatória.

   Catálogo dos temas que os instrumentos do INEP/MEC esperam ver debatidos
   e registrados em ata pelos órgãos colegiados, com a periodicidade em que
   cada um deve voltar à mesa.

   Fontes (ambos de outubro/2017, Daes/Inep):
     - Instrumento de Avaliação de Cursos de Graduação — Reconhecimento e
       Renovação de Reconhecimento  → referências "curso 1.13", "curso 2.1"…
     - Instrumento de Avaliação Institucional Externa — Recredenciamento e
       Transformação de Organização Acadêmica → referências "ies 4.5"…

   O que cada pauta guarda:
     porque    — o que o critério de análise exige, na redação do próprio
                 instrumento (é o texto que o avaliador vai procurar);
     evidencia — o que a ata precisa registrar para servir de prova;
     nivel     — o conceito que o item ajuda a alcançar naquele indicador.
   ======================================================================== */
import { diaSerial, hojeLocalISO, somaDias } from "./datas.js";
import { CURSOS, orgaoDe } from "./atas.js";

export const PERIODICIDADES = {
  semestral: { rot: "Semestral", meses: 6 },
  anual: { rot: "Anual", meses: 12 },
  bienal: { rot: "A cada dois anos", meses: 24 },
};

/* =============================== CATÁLOGO =============================== */
export const PAUTAS = [
  /* ------------------------------ NDE (curso) --------------------------- */
  {
    id: "nde-ppc",
    titulo: "Acompanhamento, consolidação e atualização do PPC",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "semestral",
    porque: "O NDE deve atuar no acompanhamento, na consolidação e na atualização do PPC, realizando estudos e atualização periódica.",
    evidencia: "Registrar em ata os estudos realizados, o que foi analisado do PPC e a decisão (manter, ajustar ou revisar), com encaminhamento e prazo.",
    refs: [{ inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 }],
  },
  {
    id: "nde-avaliacao-aprendizagem",
    titulo: "Impacto do sistema de avaliação da aprendizagem na formação do estudante",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "anual",
    porque: "O NDE deve verificar o impacto do sistema de avaliação de aprendizagem na formação do estudante.",
    evidencia: "Registrar a análise dos resultados de aprendizagem do período e as medidas decorrentes.",
    refs: [{ inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 }],
  },
  {
    id: "nde-perfil-egresso",
    titulo: "Adequação do perfil do egresso às DCN e às novas demandas do mundo do trabalho",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "anual",
    porque: "O NDE deve analisar a adequação do perfil do egresso considerando as DCN e as novas demandas do mundo do trabalho; o perfil deve ser ampliado em função dessas demandas.",
    evidencia: "Registrar a análise do perfil frente às DCN e ao mercado local/regional, com a decisão sobre mantê-lo ou ampliá-lo.",
    refs: [
      { inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 },
      { inst: "curso", num: "1.3", nome: "Perfil profissional do egresso", nivel: 5 },
    ],
  },
  {
    id: "nde-bibliografia",
    titulo: "Adequação e atualização das bibliografias básica e complementar",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "semestral",
    porque: "A adequação do acervo às unidades curriculares é validada pelo NDE; o acervo deve ser gerenciado de modo a atualizar a quantidade de exemplares e assinaturas.",
    evidencia: "Registrar a validação do NDE por unidade curricular e a lista de títulos a adquirir ou renovar.",
    refs: [
      { inst: "curso", num: "3.6", nome: "Bibliografia básica por Unidade Curricular", nivel: 4 },
      { inst: "curso", num: "3.7", nome: "Bibliografia complementar por Unidade Curricular", nivel: 4 },
    ],
  },
  {
    id: "nde-conteudos-transversais",
    titulo: "Conteúdos de educação ambiental, direitos humanos, relações étnico-raciais e história e cultura afro-brasileira, africana e indígena",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "anual",
    porque: "Os conteúdos curriculares devem abordar as políticas de educação ambiental, de educação em direitos humanos e das relações étnico-raciais e o ensino de história e cultura afro-brasileira, africana e indígena.",
    evidencia: "Registrar em quais componentes cada temática é trabalhada e as lacunas identificadas.",
    refs: [{ inst: "curso", num: "1.5", nome: "Conteúdos curriculares", nivel: 3 }],
  },
  {
    id: "nde-metodologia-tic",
    titulo: "Metodologia, acessibilidade metodológica e uso de TIC no ensino-aprendizagem",
    orgaos: ["NDE"], escopo: "curso", periodicidade: "anual",
    porque: "A metodologia deve atender à acessibilidade metodológica e à autonomia do discente; as TIC adotadas devem permitir a execução do projeto pedagógico e passar por avaliação.",
    evidencia: "Registrar a avaliação das práticas e das tecnologias em uso e as mudanças aprovadas.",
    refs: [
      { inst: "curso", num: "1.6", nome: "Metodologia", nivel: 4 },
      { inst: "curso", num: "1.16", nome: "TIC no processo ensino-aprendizagem", nivel: 4 },
    ],
  },
  {
    id: "estagio",
    titulo: "Estágio supervisionado: convênios, supervisão e insumos dos campos de prática",
    orgaos: ["NDE", "COLEGIADO"], escopo: "curso", periodicidade: "semestral",
    porque: "O nível máximo exige interlocução institucionalizada da IES com os ambientes de estágio, gerando insumos para atualização das práticas do estágio.",
    evidencia: "Registrar o retorno dos campos de estágio, a situação dos convênios e o que foi ajustado nas práticas.",
    refs: [{ inst: "curso", num: "1.7", nome: "Estágio curricular supervisionado", nivel: 5 }],
  },
  {
    id: "tcc-atividades",
    titulo: "TCC e atividades complementares: regulamentos, orientação e acompanhamento",
    orgaos: ["NDE", "COLEGIADO"], escopo: "curso", periodicidade: "anual",
    porque: "TCC e atividades complementares devem estar institucionalizados, com carga horária, formas de apresentação, orientação e coordenação, e manuais atualizados de apoio.",
    evidencia: "Registrar a revisão dos regulamentos e a situação das orientações em curso.",
    refs: [
      { inst: "curso", num: "1.11", nome: "Trabalhos de Conclusão de Curso (TCC)", nivel: 5 },
      { inst: "curso", num: "1.10", nome: "Atividades complementares", nivel: 4 },
    ],
  },
  {
    id: "laboratorios",
    titulo: "Avaliação periódica dos laboratórios: demandas, serviços prestados e qualidade",
    orgaos: ["NDE", "COLEGIADO"], escopo: "curso", periodicidade: "semestral",
    porque: "O nível máximo exige avaliação periódica quanto às demandas, aos serviços prestados e à qualidade dos laboratórios, com os resultados usados pela gestão acadêmica no planejamento.",
    evidencia: "Registrar a avaliação por laboratório e o que foi encaminhado à gestão.",
    refs: [
      { inst: "curso", num: "3.8", nome: "Laboratórios didáticos de formação básica", nivel: 5 },
      { inst: "curso", num: "3.9", nome: "Laboratórios didáticos de formação específica", nivel: 5 },
    ],
  },

  /* --------------------------- Colegiado (curso) ------------------------ */
  {
    id: "col-autoavaliacao-curso",
    titulo: "Apropriação dos resultados da autoavaliação e das avaliações externas no planejamento do curso",
    orgaos: ["COLEGIADO"], escopo: "curso", periodicidade: "semestral",
    porque: "A gestão do curso deve considerar a autoavaliação institucional e as avaliações externas como insumo para aprimoramento contínuo, com evidência de apropriação dos resultados pela comunidade acadêmica e autoavaliação periódica do curso.",
    evidencia: "Registrar os resultados analisados (CPA, ENADE, CPC) e o plano de melhoria decorrente, com responsáveis e prazos.",
    refs: [{ inst: "curso", num: "1.13", nome: "Gestão do curso e os processos de avaliação interna e externa", nivel: 5 }],
  },
  {
    id: "col-desempenho",
    titulo: "Avaliação do desempenho do próprio colegiado e ajuste das práticas de gestão",
    orgaos: ["COLEGIADO", "NDE"], escopo: "curso", periodicidade: "anual",
    porque: "O conceito 5 exige que o colegiado realize avaliação periódica sobre seu desempenho, para implementação ou ajuste de práticas de gestão.",
    evidencia: "Registrar a autoavaliação do colegiado (frequência das reuniões, cumprimento dos encaminhamentos, representatividade) e os ajustes decididos.",
    refs: [{ inst: "curso", num: "2.12", nome: "Atuação do colegiado de curso ou equivalente", nivel: 5 }],
  },
  {
    id: "col-apoio-discente",
    titulo: "Apoio ao discente: nivelamento, monitoria, apoio psicopedagógico e mobilidade",
    orgaos: ["COLEGIADO"], escopo: "curso", periodicidade: "semestral",
    porque: "O apoio ao discente deve contemplar nivelamento, monitoria, acompanhamento de estágios não obrigatórios, apoio psicopedagógico, centros acadêmicos e intercâmbios.",
    evidencia: "Registrar a situação de cada frente de apoio e as ações do semestre.",
    refs: [{ inst: "curso", num: "1.12", nome: "Apoio ao discente", nivel: 5 }],
  },
  {
    id: "col-avaliacao-processos",
    titulo: "Procedimentos de acompanhamento e avaliação dos processos de ensino-aprendizagem",
    orgaos: ["COLEGIADO"], escopo: "curso", periodicidade: "semestral",
    porque: "Os procedimentos devem atender à concepção do curso e ser analisados quanto à sua eficácia, com ações de melhoria.",
    evidencia: "Registrar a análise dos índices de aprovação, retenção e evasão e as medidas adotadas.",
    refs: [{ inst: "curso", num: "1.19", nome: "Procedimentos de acompanhamento e de avaliação dos processos de ensino-aprendizagem", nivel: 4 }],
  },
  {
    id: "col-plano-coordenacao",
    titulo: "Plano de ação da coordenação e indicadores de desempenho",
    orgaos: ["COLEGIADO"], escopo: "curso", periodicidade: "anual",
    porque: "A atuação do coordenador deve ser pautada em plano de ação documentado e compartilhado, com indicadores de desempenho disponíveis e públicos.",
    evidencia: "Registrar a apresentação do plano, a prestação de contas do período anterior e a aprovação pelo colegiado.",
    refs: [{ inst: "curso", num: "2.3", nome: "Atuação do coordenador", nivel: 5 }],
  },
  {
    id: "col-vagas",
    titulo: "Adequação do número de vagas ao corpo docente e à infraestrutura",
    orgaos: ["COLEGIADO", "CONSEPE"], escopo: "curso", periodicidade: "anual",
    porque: "O número de vagas deve corresponder à dimensão do corpo docente e às condições de infraestrutura, fundamentado em estudos quantitativos e qualitativos.",
    evidencia: "Registrar o estudo que fundamenta as vagas ofertadas e o parecer do colegiado.",
    refs: [{ inst: "curso", num: "1.20", nome: "Número de vagas", nivel: 4 }],
  },
  {
    id: "col-egressos",
    titulo: "Acompanhamento de egressos e retorno das informações para o curso",
    orgaos: ["COLEGIADO"], escopo: "curso", periodicidade: "anual",
    porque: "A política de acompanhamento dos egressos deve permitir conhecer a inserção profissional e realimentar os processos de ensino.",
    evidencia: "Registrar os dados de egressos analisados e o que foi incorporado ao curso.",
    refs: [{ inst: "ies", num: "3.7", nome: "Política institucional de acompanhamento dos egressos", nivel: 4 }],
  },

  /* --------------------------------- CPA -------------------------------- */
  {
    id: "cpa-relatorio",
    titulo: "Relatório de autoavaliação institucional: elaboração e postagem no e-MEC",
    orgaos: ["CPA"], escopo: "institucional", periodicidade: "anual",
    porque: "Os relatórios de autoavaliação devem ser elaborados conforme o planejamento da CPA, ter clara relação entre si e impactar o processo de gestão da instituição.",
    evidencia: "Registrar a aprovação do relatório (parcial ou integral) e a data de postagem.",
    refs: [{ inst: "ies", num: "1.5", nome: "Relatórios de autoavaliação", nivel: 5 }],
  },
  {
    id: "cpa-divulgacao",
    titulo: "Análise e divulgação dos resultados da autoavaliação e das avaliações externas",
    orgaos: ["CPA"], escopo: "institucional", periodicidade: "semestral",
    porque: "Os resultados devem ser analisados e divulgados à comunidade acadêmica, com apropriação demonstrada.",
    evidencia: "Registrar os canais e as datas de divulgação e o retorno recebido da comunidade.",
    refs: [{ inst: "ies", num: "1.4", nome: "Autoavaliação institucional e avaliações externas: análise e divulgação dos resultados", nivel: 4 }],
  },
  {
    id: "cpa-participacao",
    titulo: "Sensibilização e participação da comunidade acadêmica na autoavaliação",
    orgaos: ["CPA"], escopo: "institucional", periodicidade: "semestral",
    porque: "A autoavaliação deve contar com a participação dos segmentos da comunidade acadêmica, com estratégias de sensibilização.",
    evidencia: "Registrar as ações de sensibilização, os índices de adesão por segmento e as correções de rota.",
    refs: [{ inst: "ies", num: "1.3", nome: "Autoavaliação institucional: participação da comunidade acadêmica", nivel: 4 }],
  },
  {
    id: "cpa-metodologia",
    titulo: "Metodologia, instrumentos e infraestrutura do processo de autoavaliação",
    orgaos: ["CPA"], escopo: "institucional", periodicidade: "anual",
    porque: "O processo de autoavaliação deve atender às necessidades institucionais, com metodologia e instrumentos definidos e infraestrutura própria para a CPA.",
    evidencia: "Registrar a revisão dos instrumentos e das condições de trabalho da comissão.",
    refs: [
      { inst: "ies", num: "1.2", nome: "Processo de autoavaliação institucional", nivel: 4 },
      { inst: "ies", num: "5.8", nome: "Infraestrutura física e tecnológica destinada à CPA", nivel: 4 },
    ],
  },

  /* --------------------------- CONSU / CONSEPE -------------------------- */
  {
    id: "consu-pdi",
    titulo: "Evolução institucional a partir do PDI e dos processos de planejamento e avaliação",
    orgaos: ["CONSU"], escopo: "institucional", periodicidade: "anual",
    porque: "A evolução institucional deve ser demonstrada a partir dos processos de planejamento e avaliação institucional, com práticas de gestão consolidadas.",
    evidencia: "Registrar o balanço das metas do PDI, o que foi cumprido e as revisões aprovadas.",
    refs: [
      { inst: "ies", num: "1.1", nome: "Evolução institucional a partir dos processos de Planejamento e Avaliação", nivel: 4 },
      { inst: "ies", num: "2.1", nome: "Missão, objetivos, metas e valores institucionais", nivel: 4 },
    ],
  },
  {
    id: "consu-gestao-colegiada",
    titulo: "Sistematização e divulgação das decisões colegiadas e mandatos dos membros dos órgãos",
    orgaos: ["CONSU"], escopo: "institucional", periodicidade: "anual",
    porque: "O conceito 5 exige que os processos de gestão regulamentem o mandato dos membros dos órgãos colegiados e sistematizem e divulguem as decisões colegiadas, com apropriação assegurada pela comunidade interna.",
    evidencia: "Registrar a recomposição dos colegiados, o meio de publicação das decisões e a conferência do fluxo.",
    refs: [{ inst: "ies", num: "4.5", nome: "Processos de gestão institucional", nivel: 5 }],
  },
  {
    id: "consu-sustentabilidade",
    titulo: "Sustentabilidade financeira e participação da comunidade interna no orçamento",
    orgaos: ["CONSU"], escopo: "institucional", periodicidade: "anual",
    porque: "A sustentabilidade financeira deve relacionar-se ao desenvolvimento institucional, com participação da comunidade interna na definição e no acompanhamento do orçamento.",
    evidencia: "Registrar a apresentação do orçamento, a participação dos segmentos e as metas de acompanhamento.",
    refs: [
      { inst: "ies", num: "4.7", nome: "Sustentabilidade financeira: relação com o desenvolvimento institucional", nivel: 4 },
      { inst: "ies", num: "4.8", nome: "Sustentabilidade financeira: participação da comunidade interna", nivel: 4 },
    ],
  },
  {
    id: "consepe-politicas-ensino",
    titulo: "Políticas de ensino de graduação e pós-graduação: ações acadêmico-administrativas",
    orgaos: ["CONSEPE"], escopo: "institucional", periodicidade: "semestral",
    porque: "As políticas de ensino previstas no PDI devem estar implantadas, com ações acadêmico-administrativas acompanhadas e revisadas.",
    evidencia: "Registrar o acompanhamento das ações do período e as deliberações sobre a oferta.",
    refs: [
      { inst: "ies", num: "3.1", nome: "Políticas de ensino e ações acadêmico-administrativas para os cursos de graduação", nivel: 4 },
      { inst: "ies", num: "3.2", nome: "Políticas de ensino e ações acadêmico-administrativas para a pós-graduação", nivel: 4 },
    ],
  },

  /* ------------------------------- PROPPEX ------------------------------ */
  {
    id: "proppex-pesquisa",
    titulo: "Política e práticas de pesquisa, iniciação científica e inovação tecnológica",
    orgaos: ["PROPPEX"], escopo: "institucional", periodicidade: "semestral",
    porque: "As políticas de pesquisa/IC e inovação previstas no PDI devem estar implantadas, com ações acompanhadas e revistas periodicamente.",
    evidencia: "Registrar o balanço dos projetos e bolsas do período e as decisões sobre editais.",
    refs: [
      { inst: "ies", num: "2.3", nome: "PDI, política e práticas de pesquisa ou iniciação científica e de inovação tecnológica", nivel: 4 },
      { inst: "ies", num: "3.4", nome: "Políticas institucionais e ações acadêmico-administrativas para a pesquisa", nivel: 4 },
    ],
  },
  {
    id: "proppex-extensao",
    titulo: "Política de extensão: ações, curricularização e acompanhamento",
    orgaos: ["PROPPEX"], escopo: "institucional", periodicidade: "semestral",
    porque: "As políticas de extensão devem estar implantadas, com ações acadêmico-administrativas acompanhadas e avaliadas.",
    evidencia: "Registrar as ações do período, a carga horária curricularizada e as decisões sobre novas ações.",
    refs: [{ inst: "ies", num: "3.5", nome: "Políticas institucionais e ações acadêmico-administrativas para a extensão", nivel: 4 }],
  },
  {
    id: "proppex-producao",
    titulo: "Estímulo e difusão da produção acadêmica docente e discente",
    orgaos: ["PROPPEX"], escopo: "institucional", periodicidade: "anual",
    porque: "Devem existir ações de estímulo e difusão da produção acadêmica, incluindo apoio à participação em eventos e à publicação.",
    evidencia: "Registrar o levantamento da produção do período e as ações de fomento aprovadas.",
    refs: [
      { inst: "ies", num: "3.6", nome: "Políticas institucionais e ações de estímulo e difusão para a produção acadêmica", nivel: 5 },
      { inst: "ies", num: "3.12", nome: "Políticas institucionais e ações de estímulo à produção discente", nivel: 5 },
    ],
  },

  /* ---------------------------- PROAC / Reitoria ------------------------ */
  {
    id: "proac-capacitacao",
    titulo: "Política de capacitação docente e formação continuada",
    orgaos: ["PROAC"], escopo: "institucional", periodicidade: "anual",
    porque: "A política de capacitação e formação continuada do corpo docente deve estar implantada e ser acompanhada e avaliada.",
    evidencia: "Registrar o plano de capacitação do período, a adesão e a avaliação dos resultados.",
    refs: [{ inst: "ies", num: "4.2", nome: "Política de capacitação docente e formação continuada", nivel: 4 }],
  },
  {
    id: "proac-tecnicos",
    titulo: "Capacitação e formação continuada do corpo técnico-administrativo",
    orgaos: ["PROAC"], escopo: "institucional", periodicidade: "anual",
    porque: "A política de capacitação do corpo técnico-administrativo deve estar implantada, acompanhada e avaliada.",
    evidencia: "Registrar as formações realizadas e a avaliação de seus efeitos.",
    refs: [{ inst: "ies", num: "4.3", nome: "Política de capacitação e formação continuada para o corpo técnico-administrativo", nivel: 4 }],
  },
  {
    id: "reitoria-acervo",
    titulo: "Plano de atualização do acervo da biblioteca",
    orgaos: ["REITORIA", "CONSU"], escopo: "institucional", periodicidade: "anual",
    porque: "O plano de atualização do acervo deve prever a alocação de recursos e o acompanhamento e a avaliação do acervo pela comunidade acadêmica.",
    evidencia: "Registrar o plano aprovado, os recursos alocados e a consulta feita à comunidade.",
    refs: [{ inst: "ies", num: "5.10", nome: "Bibliotecas: plano de atualização do acervo", nivel: 5 }],
  },
  {
    id: "reitoria-infraestrutura",
    titulo: "Avaliação periódica dos espaços físicos e plano de expansão e atualização de equipamentos",
    orgaos: ["REITORIA"], escopo: "institucional", periodicidade: "anual",
    porque: "Instalações, salas, laboratórios e sanitários devem passar por avaliação periódica dos espaços e gerenciamento da manutenção patrimonial; o plano de expansão e atualização de equipamentos deve ser acompanhado.",
    evidencia: "Registrar a avaliação por tipo de espaço e o plano de investimento aprovado.",
    refs: [
      { inst: "ies", num: "5.1", nome: "Instalações administrativas", nivel: 5 },
      { inst: "ies", num: "5.16", nome: "Plano de expansão e atualização de equipamentos", nivel: 4 },
    ],
  },
  {
    id: "reitoria-comunicacao",
    titulo: "Comunicação com as comunidades interna e externa e ouvidoria",
    orgaos: ["REITORIA"], escopo: "institucional", periodicidade: "anual",
    porque: "Os canais de comunicação e a ouvidoria devem ser avaliados periodicamente quanto à eficácia, gerando ações de melhoria.",
    evidencia: "Registrar as demandas recebidas pela ouvidoria, o tempo de resposta e as melhorias decididas.",
    refs: [
      { inst: "ies", num: "3.9", nome: "Comunicação da IES com a comunidade externa", nivel: 4 },
      { inst: "ies", num: "3.10", nome: "Comunicação da IES com a comunidade interna", nivel: 4 },
    ],
  },
];

export const pautaDe = (id) => PAUTAS.find((p) => p.id === id) || null;

/** Pautas que cabem a um órgão (e, nos temas de curso, a um curso). */
export function pautasDoOrgao(orgao, curso) {
  const cod = String(orgao || "").toUpperCase();
  return PAUTAS.filter((p) => p.orgaos.includes(cod) && (p.escopo !== "curso" || !!curso || !orgaoDe(cod)?.porCurso));
}

/* ============================== PERIODICIDADE =========================== */
/**
 * Janela em que uma data cai, conforme a periodicidade:
 *   semestral → "2026-S1" (jan–jun) e "2026-S2" (jul–dez)
 *   anual     → "2026"
 *   bienal    → "2025-26" (biênios ancorados em ano ímpar)
 */
export function janelaDe(iso, periodicidade) {
  if (diaSerial(iso) === null) return null;
  const ano = Number(iso.slice(0, 4)), mes = Number(iso.slice(5, 7));
  if (periodicidade === "semestral") return `${ano}-S${mes <= 6 ? 1 : 2}`;
  if (periodicidade === "bienal") {
    const ini = ano % 2 ? ano : ano - 1;
    return `${ini}-${String(ini + 1).slice(2)}`;
  }
  return String(ano);
}

/** Último dia da janela de uma data — usado para saber quanto falta. */
export function fimDaJanela(iso, periodicidade) {
  if (diaSerial(iso) === null) return null;
  const ano = Number(iso.slice(0, 4)), mes = Number(iso.slice(5, 7));
  if (periodicidade === "semestral") return mes <= 6 ? `${ano}-06-30` : `${ano}-12-31`;
  if (periodicidade === "bienal") return `${ano % 2 ? ano + 1 : ano}-12-31`;
  return `${ano}-12-31`;
}

/* ============================== CONFORMIDADE ============================ */
// Só ata aprovada ou registrada vale como prova: rascunho e minuta ainda
// podem mudar, e o avaliador vai pedir o documento assinado.
const VALE_COMO_PROVA = new Set(["aprovada", "registrada"]);
const ALERTA_DIAS = 45;   // "vencendo" quando falta menos que isto

/** Todos os registros de uma pauta nas atas, do mais recente para o mais antigo. */
function registrosDaPauta(atas, pautaId, { orgao, curso, escopo }) {
  const saida = [];
  for (const a of atas || []) {
    if (orgao && a.orgao !== orgao) continue;
    if (escopo === "curso" && curso && a.curso !== curso) continue;
    if (!VALE_COMO_PROVA.has(a.status)) continue;
    for (const p of a.pauta || []) {
      if (p.pautaMec !== pautaId) continue;
      saida.push({
        ataId: a.id, numero: a.numero, data: a.sessao?.data || "", orgao: a.orgao,
        curso: a.curso || "", ponto: p.titulo,
        deliberou: !!(p.deliberacao || p.encaminhamento?.acao),
      });
    }
  }
  return saida.sort((x, y) => String(y.data).localeCompare(String(x.data)));
}

/**
 * Situação de cada pauta de um órgão (num curso, quando for o caso).
 * estado: "em-dia" (feita na janela corrente), "vencendo" (falta pouco para
 * o fim da janela), "pendente" (janela corrente ainda sem registro),
 * "nunca" (não há registro algum).
 */
export function situacaoPautas(atas, { orgao, curso = "", hoje = hojeLocalISO() } = {}) {
  return pautasDoOrgao(orgao, curso).map((p) => {
    const janela = janelaDe(hoje, p.periodicidade);
    const fim = fimDaJanela(hoje, p.periodicidade);
    const regs = registrosDaPauta(atas, p.id, { orgao, curso, escopo: p.escopo });
    const naJanela = regs.filter((r) => janelaDe(r.data, p.periodicidade) === janela);
    const dias = diaSerial(fim) - diaSerial(hoje);

    let estado;
    if (naJanela.length) estado = "em-dia";
    else if (!regs.length) estado = "nunca";
    else if (dias <= ALERTA_DIAS) estado = "vencendo";
    else estado = "pendente";

    return {
      ...p, orgao, curso, janela, fimDaJanela: fim, diasRestantes: dias, estado,
      registrosNaJanela: naJanela.length, ultima: regs[0] || null, historico: regs.slice(0, 6),
    };
  });
}

/** Pautas a sugerir numa reunião: tudo que ainda não foi tratado na janela. */
export function pautasSugeridas(atas, { orgao, curso = "", hoje = hojeLocalISO() } = {}) {
  const ordem = { nunca: 0, vencendo: 1, pendente: 2, "em-dia": 3 };
  return situacaoPautas(atas, { orgao, curso, hoje })
    .filter((p) => p.estado !== "em-dia")
    .sort((a, b) => (ordem[a.estado] - ordem[b.estado]) || (a.diasRestantes - b.diasRestantes));
}

/**
 * Matriz de acompanhamento da PROPPEX: uma linha por pauta e uma coluna por
 * curso (nas pautas de curso) ou uma coluna única (nas institucionais).
 */
export function matrizConformidade(atas, { cursos = CURSOS.map((c) => c.slug), hoje = hojeLocalISO() } = {}) {
  const linhas = [];
  for (const p of PAUTAS) {
    for (const orgao of p.orgaos) {
      const alvos = p.escopo === "curso" && orgaoDe(orgao)?.porCurso ? cursos : [""];
      const celulas = alvos.map((curso) => {
        const s = situacaoPautas(atas, { orgao, curso, hoje }).find((x) => x.id === p.id);
        return { curso, estado: s?.estado || "nunca", ultima: s?.ultima || null };
      });
      linhas.push({
        pauta: p.id, titulo: p.titulo, orgao, escopo: p.escopo,
        periodicidade: p.periodicidade, refs: p.refs, celulas,
        emDia: celulas.filter((c) => c.estado === "em-dia").length, total: celulas.length,
      });
    }
  }
  const total = linhas.reduce((n, l) => n + l.total, 0);
  const emDia = linhas.reduce((n, l) => n + l.emDia, 0);
  return {
    linhas, janelaHoje: hoje, total, emDia,
    percentual: total ? Math.round((emDia / total) * 100) : 0,
  };
}

/** Resumo por curso — quem está em dia e quem não está. */
export function placarPorCurso(atas, { cursos = CURSOS, hoje = hojeLocalISO() } = {}) {
  return cursos.map((c) => {
    let total = 0, emDia = 0, atrasadas = 0;
    for (const orgao of ["NDE", "COLEGIADO"]) {
      for (const s of situacaoPautas(atas, { orgao, curso: c.slug, hoje })) {
        total++;
        if (s.estado === "em-dia") emDia++;
        else if (s.estado === "nunca" || s.estado === "vencendo") atrasadas++;
      }
    }
    return { ...c, total, emDia, atrasadas, percentual: total ? Math.round((emDia / total) * 100) : 0 };
  }).sort((a, b) => b.percentual - a.percentual);
}

/** Datas-limite próximas, para o painel do professor. */
export function proximosPrazos(atas, { orgao, curso, hoje = hojeLocalISO(), dias = 60 } = {}) {
  const limite = somaDias(hoje, dias);
  return situacaoPautas(atas, { orgao, curso, hoje })
    .filter((p) => p.estado !== "em-dia" && p.fimDaJanela <= limite)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}
