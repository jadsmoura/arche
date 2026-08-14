/* ========================================================================
   ARCHÉ AT — Pauta Regulatória.

   Catálogo dos temas que os instrumentos do INEP/MEC esperam ver debatidos
   e registrados em ata, atribuídos ao órgão de competência e distribuídos
   no ciclo semestral de cada colegiado.

   Fontes (Daes/Inep, outubro de 2017):
     - Instrumento de Avaliação de Cursos de Graduação — Reconhecimento e
       Renovação de Reconhecimento          → referências "curso 2.1", "curso 1.13"…
     - Instrumento de Avaliação Institucional Externa — Recredenciamento e
       Transformação de Organização Acadêmica → referências "ies 4.5"…

   COMPETÊNCIA EXCLUSIVA — cada pauta pertence a um único órgão.
   A divisão segue o próprio instrumento e a Resolução CONAES nº 1/2010:
     · NDE       — glossário do instrumento: "grupo de docentes, com atribuições
                   acadêmicas de acompanhamento, atuante no processo de concepção,
                   consolidação e contínua atualização do projeto pedagógico do
                   curso". Cabe-lhe o currículo, não a operação.
     · Colegiado — instância deliberativa de gestão do curso (Ind. 2.12): reúne-se
                   com periodicidade determinada, registra decisões e mantém fluxo
                   de encaminhamento. Cabe-lhe a operação e a apropriação dos
                   resultados de avaliação.
     · CPA       — o processo de autoavaliação institucional é seu, e só seu
                   (Eixo 1 do instrumento institucional).
     · CONSU / CONSEPE / PROPPEX / PROAC / Reitoria — os temas institucionais,
                   conforme a matéria de cada um.

   CICLO SEMESTRAL — todo órgão registra ao menos uma ata ordinária por
   semestre; NDE, Colegiado e CPA registram duas (abertura e encerramento).
   Sessões extraordinárias são livres: entram por demanda, contam como prova
   dos temas que tratarem, mas não substituem as ordinárias do ciclo.
   ======================================================================== */
import { diaSerial, hojeLocalISO, somaDias } from "./datas.js";
import { CURSOS, orgaoDe } from "./atas.js";

/* ------------------------------- momentos ------------------------------- */
export const MOMENTOS = {
  abertura: { rot: "Abertura do semestre", ordem: 1 },
  encerramento: { rot: "Encerramento do semestre", ordem: 2 },
  livre: { rot: "Sessão ordinária do semestre", ordem: 1 },
};

/* --------------------------------- ritual ------------------------------- */
// Quantas sessões ORDINÁRIAS cada órgão precisa registrar por semestre para
// fechar o ciclo. Regra institucional — é aqui que se ajusta o calendário.
export const RITUAL = {
  NDE: { ordinarias: 2, momentos: ["abertura", "encerramento"] },
  COLEGIADO: { ordinarias: 2, momentos: ["abertura", "encerramento"] },
  CPA: { ordinarias: 2, momentos: ["abertura", "encerramento"] },
  CONSU: { ordinarias: 1, momentos: ["livre"] },
  CONSEPE: { ordinarias: 1, momentos: ["livre"] },
  PROPPEX: { ordinarias: 1, momentos: ["livre"] },
  PROAC: { ordinarias: 1, momentos: ["livre"] },
  REITORIA: { ordinarias: 1, momentos: ["livre"] },
  COMISSAO: { ordinarias: 0, momentos: [] },   // pauta livre, sem checklist
};
export const ritualDe = (orgao) =>
  RITUAL[String(orgao || "").toUpperCase()] || { ordinarias: 1, momentos: ["livre"] };

/* ------------------------------ periodicidade --------------------------- */
// semestral → cobrada nos dois semestres · anual → só no semestre indicado.
export const CADENCIAS = {
  semestral: { rot: "Todo semestre" },
  anual: { rot: "Uma vez por ano" },
};

/* =============================== CATÁLOGO =============================== */
export const PAUTAS = [
  /* ============================ NDE — currículo ========================= */
  {
    id: "nde-ppc", orgao: "NDE", escopo: "curso",
    momento: "abertura", cadencia: "semestral",
    titulo: "Acompanhamento, consolidação e atualização do PPC",
    porque: "O NDE deve atuar no acompanhamento, na consolidação e na atualização do PPC, realizando estudos e atualização periódica.",
    evidencia: "Registrar os estudos feitos, o que foi analisado do PPC e a decisão (manter, ajustar ou revisar), com encaminhamento e prazo.",
    refs: [{ inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 }],
  },
  {
    id: "nde-bibliografia", orgao: "NDE", escopo: "curso",
    momento: "abertura", cadencia: "semestral",
    titulo: "Validação das bibliografias básica e complementar por unidade curricular",
    porque: "A adequação do acervo às unidades curriculares é validada pelo NDE, e o acervo deve ser gerenciado de modo a atualizar exemplares e assinaturas.",
    evidencia: "Registrar a validação do NDE por unidade curricular e a lista de títulos a adquirir ou renovar, encaminhada à biblioteca.",
    refs: [
      { inst: "curso", num: "3.6", nome: "Bibliografia básica por Unidade Curricular", nivel: 4 },
      { inst: "curso", num: "3.7", nome: "Bibliografia complementar por Unidade Curricular", nivel: 4 },
    ],
  },
  {
    id: "nde-estrutura", orgao: "NDE", escopo: "curso",
    momento: "abertura", cadencia: "anual", semestre: 1,
    titulo: "Estrutura curricular: flexibilidade, interdisciplinaridade e articulação teoria-prática",
    porque: "A estrutura curricular deve considerar flexibilidade, interdisciplinaridade, acessibilidade metodológica e compatibilidade da carga horária, explicitando a articulação entre os componentes no percurso de formação.",
    evidencia: "Registrar a análise da matriz por período e as articulações identificadas ou a corrigir.",
    refs: [{ inst: "curso", num: "1.4", nome: "Estrutura curricular", nivel: 4 }],
  },
  {
    id: "nde-perfil-egresso", orgao: "NDE", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 2,
    titulo: "Adequação do perfil do egresso às DCN e às novas demandas do mundo do trabalho",
    porque: "O NDE deve analisar a adequação do perfil do egresso considerando as DCN e as novas demandas do mundo do trabalho; o perfil deve ser ampliado em função dessas demandas.",
    evidencia: "Registrar a análise do perfil frente às DCN e ao mercado local e regional, com a decisão sobre mantê-lo ou ampliá-lo.",
    refs: [
      { inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 },
      { inst: "curso", num: "1.3", nome: "Perfil profissional do egresso", nivel: 5 },
    ],
  },
  {
    id: "nde-avaliacao-aprendizagem", orgao: "NDE", escopo: "curso",
    momento: "encerramento", cadencia: "semestral",
    titulo: "Impacto do sistema de avaliação da aprendizagem na formação do estudante",
    porque: "O NDE deve verificar o impacto do sistema de avaliação de aprendizagem na formação do estudante.",
    evidencia: "Registrar a análise dos instrumentos avaliativos usados no semestre e o efeito observado na formação, com os ajustes decididos.",
    refs: [{ inst: "curso", num: "2.1", nome: "Núcleo Docente Estruturante — NDE", nivel: 4 }],
  },
  {
    id: "nde-conteudos-transversais", orgao: "NDE", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 1,
    titulo: "Conteúdos de educação ambiental, direitos humanos, relações étnico-raciais e história e cultura afro-brasileira, africana e indígena",
    porque: "Os conteúdos curriculares devem abordar as políticas de educação ambiental, de educação em direitos humanos e das relações étnico-raciais e o ensino de história e cultura afro-brasileira, africana e indígena.",
    evidencia: "Registrar em quais componentes cada temática é trabalhada, as lacunas identificadas e o encaminhamento aos docentes.",
    refs: [{ inst: "curso", num: "1.5", nome: "Conteúdos curriculares", nivel: 3 }],
  },
  {
    id: "nde-metodologia", orgao: "NDE", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 2,
    titulo: "Metodologia, acessibilidade metodológica e uso de TIC no ensino-aprendizagem",
    porque: "A metodologia deve atender à acessibilidade metodológica e à autonomia do discente, e as TIC adotadas devem permitir a execução do projeto pedagógico.",
    evidencia: "Registrar a avaliação das práticas e das tecnologias em uso e as mudanças aprovadas para o PPC.",
    refs: [
      { inst: "curso", num: "1.6", nome: "Metodologia", nivel: 4 },
      { inst: "curso", num: "1.16", nome: "TIC no processo ensino-aprendizagem", nivel: 4 },
    ],
  },
  {
    id: "nde-pesquisa-extensao", orgao: "NDE", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 1,
    titulo: "Linhas de pesquisa e extensão oriundas das necessidades da graduação",
    porque: "Cabe ao NDE indicar formas de incentivo ao desenvolvimento de linhas de pesquisa e extensão nascidas das necessidades da graduação e das exigências do mercado (Resolução CONAES nº 1/2010, art. 2º, III); as políticas do PDI devem estar implantadas no âmbito do curso.",
    evidencia: "Registrar as linhas propostas ou revistas e o encaminhamento à PROPPEX.",
    refs: [{ inst: "curso", num: "1.1", nome: "Políticas institucionais no âmbito do curso", nivel: 4 }],
  },

  /* ========================= COLEGIADO — gestão ========================= */
  {
    id: "col-planejamento", orgao: "COLEGIADO", escopo: "curso",
    momento: "abertura", cadencia: "semestral",
    titulo: "Planejamento do semestre: oferta, planos de ensino e calendário do curso",
    porque: "Os objetivos do curso devem estar implementados considerando o perfil do egresso, a estrutura curricular e o contexto educacional — o que se verifica na oferta concreta de cada semestre.",
    evidencia: "Registrar a oferta aprovada, a validação dos planos de ensino e o calendário de atividades do curso.",
    refs: [{ inst: "curso", num: "1.2", nome: "Objetivos do curso", nivel: 4 }],
  },
  {
    id: "col-autoavaliacao-curso", orgao: "COLEGIADO", escopo: "curso",
    momento: "abertura", cadencia: "semestral",
    titulo: "Apropriação dos resultados da autoavaliação e das avaliações externas no planejamento do curso",
    porque: "A gestão do curso deve considerar a autoavaliação institucional e as avaliações externas como insumo de aprimoramento contínuo, com evidência de apropriação dos resultados pela comunidade acadêmica e autoavaliação periódica do curso.",
    evidencia: "Registrar os resultados analisados (CPA, ENADE, CPC), o que a comunidade apontou e o plano de melhoria com responsáveis e prazos.",
    refs: [{ inst: "curso", num: "1.13", nome: "Gestão do curso e os processos de avaliação interna e externa", nivel: 5 }],
  },
  {
    id: "col-apoio-discente", orgao: "COLEGIADO", escopo: "curso",
    momento: "abertura", cadencia: "semestral",
    titulo: "Apoio ao discente: nivelamento, monitoria, apoio psicopedagógico e mobilidade",
    porque: "O apoio ao discente deve contemplar nivelamento, monitoria, acompanhamento de estágios não obrigatórios, apoio psicopedagógico, centros acadêmicos e intercâmbios.",
    evidencia: "Registrar a situação de cada frente de apoio, a demanda atendida e as ações do semestre.",
    refs: [{ inst: "curso", num: "1.12", nome: "Apoio ao discente", nivel: 5 }],
  },
  {
    id: "col-plano-coordenacao", orgao: "COLEGIADO", escopo: "curso",
    momento: "abertura", cadencia: "anual", semestre: 1,
    titulo: "Plano de ação da coordenação e indicadores de desempenho",
    porque: "A atuação do coordenador deve ser pautada em plano de ação documentado e compartilhado, com indicadores de desempenho disponíveis e públicos.",
    evidencia: "Registrar a prestação de contas do período anterior, a apresentação do novo plano e sua aprovação pelo colegiado.",
    refs: [{ inst: "curso", num: "2.3", nome: "Atuação do coordenador", nivel: 5 }],
  },
  {
    id: "col-desempenho-discente", orgao: "COLEGIADO", escopo: "curso",
    momento: "encerramento", cadencia: "semestral",
    titulo: "Resultados do semestre: aprovação, retenção e evasão",
    porque: "Os procedimentos de acompanhamento e avaliação dos processos de ensino-aprendizagem devem ser analisados quanto à sua eficácia, gerando ações de melhoria.",
    evidencia: "Registrar os índices por componente curricular, as causas discutidas e as medidas adotadas para o semestre seguinte.",
    refs: [{ inst: "curso", num: "1.19", nome: "Procedimentos de acompanhamento e de avaliação dos processos de ensino-aprendizagem", nivel: 4 }],
  },
  {
    id: "col-estagio-tcc", orgao: "COLEGIADO", escopo: "curso",
    momento: "encerramento", cadencia: "semestral",
    titulo: "Estágio, TCC e atividades complementares: convênios, orientação e retorno dos campos de prática",
    porque: "O estágio exige convênios, coordenação e supervisão, e o nível máximo pede interlocução institucionalizada com os ambientes de estágio, gerando insumos para atualização das práticas; TCC e atividades complementares exigem regulamento e acompanhamento.",
    evidencia: "Registrar o retorno dos campos de estágio, a situação dos convênios, as orientações concluídas e os ajustes nos regulamentos.",
    refs: [
      { inst: "curso", num: "1.7", nome: "Estágio curricular supervisionado", nivel: 5 },
      { inst: "curso", num: "1.11", nome: "Trabalhos de Conclusão de Curso (TCC)", nivel: 5 },
      { inst: "curso", num: "1.10", nome: "Atividades complementares", nivel: 4 },
    ],
  },
  {
    id: "col-laboratorios", orgao: "COLEGIADO", escopo: "curso",
    momento: "encerramento", cadencia: "semestral",
    titulo: "Avaliação dos laboratórios e demandas de infraestrutura do curso",
    porque: "O nível máximo exige avaliação periódica quanto às demandas, aos serviços prestados e à qualidade dos laboratórios, com os resultados usados pela gestão acadêmica no planejamento.",
    evidencia: "Registrar a avaliação por laboratório, os insumos em falta e o que foi encaminhado à mantenedora.",
    refs: [
      { inst: "curso", num: "3.8", nome: "Laboratórios didáticos de formação básica", nivel: 5 },
      { inst: "curso", num: "3.9", nome: "Laboratórios didáticos de formação específica", nivel: 5 },
    ],
  },
  {
    id: "col-egressos", orgao: "COLEGIADO", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 2,
    titulo: "Acompanhamento de egressos e retorno das informações para o curso",
    porque: "A política de acompanhamento dos egressos deve permitir conhecer a inserção profissional e realimentar os processos de ensino.",
    evidencia: "Registrar os dados de egressos analisados e o que foi incorporado ao curso a partir deles.",
    refs: [{ inst: "ies", num: "3.7", nome: "Política institucional de acompanhamento dos egressos", nivel: 4 }],
  },
  {
    id: "col-desempenho-colegiado", orgao: "COLEGIADO", escopo: "curso",
    momento: "encerramento", cadencia: "anual", semestre: 2,
    titulo: "Avaliação do desempenho do próprio colegiado e ajuste das práticas de gestão",
    porque: "O conceito 5 exige que o colegiado realize avaliação periódica sobre seu desempenho, para implementação ou ajuste de práticas de gestão.",
    evidencia: "Registrar a autoavaliação do colegiado — frequência das sessões, cumprimento dos encaminhamentos, representatividade dos segmentos — e os ajustes decididos.",
    refs: [{ inst: "curso", num: "2.12", nome: "Atuação do colegiado de curso ou equivalente", nivel: 5 }],
  },

  /* =========================== CPA — autoavaliação ====================== */
  {
    id: "cpa-planejamento", orgao: "CPA", escopo: "institucional",
    momento: "abertura", cadencia: "semestral",
    titulo: "Planejamento, metodologia e instrumentos da autoavaliação institucional",
    porque: "O processo de autoavaliação deve atender às necessidades institucionais, com metodologia e instrumentos definidos e infraestrutura própria destinada à CPA.",
    evidencia: "Registrar o cronograma do ciclo, os instrumentos aprovados e as condições de trabalho da comissão.",
    refs: [
      { inst: "ies", num: "1.2", nome: "Processo de autoavaliação institucional", nivel: 4 },
      { inst: "ies", num: "5.8", nome: "Infraestrutura física e tecnológica destinada à CPA", nivel: 4 },
    ],
  },
  {
    id: "cpa-participacao", orgao: "CPA", escopo: "institucional",
    momento: "abertura", cadencia: "semestral",
    titulo: "Sensibilização e participação da comunidade acadêmica na autoavaliação",
    porque: "A autoavaliação deve contar com a participação dos segmentos da comunidade acadêmica, com estratégias de sensibilização.",
    evidencia: "Registrar as ações de sensibilização, a adesão por segmento e as correções de rota decididas.",
    refs: [{ inst: "ies", num: "1.3", nome: "Autoavaliação institucional: participação da comunidade acadêmica", nivel: 4 }],
  },
  {
    id: "cpa-divulgacao", orgao: "CPA", escopo: "institucional",
    momento: "encerramento", cadencia: "semestral",
    titulo: "Análise e divulgação dos resultados da autoavaliação e das avaliações externas",
    porque: "Os resultados devem ser analisados e divulgados à comunidade acadêmica, com apropriação demonstrada.",
    evidencia: "Registrar os canais e as datas de divulgação, o retorno recebido e o encaminhamento aos colegiados de curso.",
    refs: [{ inst: "ies", num: "1.4", nome: "Autoavaliação institucional e avaliações externas: análise e divulgação dos resultados", nivel: 4 }],
  },
  {
    id: "cpa-relatorio", orgao: "CPA", escopo: "institucional",
    momento: "encerramento", cadencia: "anual", semestre: 2,
    titulo: "Relatório de autoavaliação institucional: aprovação e postagem no e-MEC",
    porque: "Os relatórios devem ser elaborados conforme o planejamento da CPA, ter clara relação entre si e impactar o processo de gestão da instituição.",
    evidencia: "Registrar a aprovação do relatório (parcial ou integral) e a data de postagem no e-MEC.",
    refs: [{ inst: "ies", num: "1.5", nome: "Relatórios de autoavaliação", nivel: 5 }],
  },

  /* ========================= CONSU — governança ========================= */
  {
    id: "consu-pdi", orgao: "CONSU", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Evolução institucional e cumprimento das metas do PDI",
    porque: "A evolução institucional deve ser demonstrada a partir dos processos de planejamento e avaliação institucional, com práticas de gestão consolidadas e articuladas à missão e às metas.",
    evidencia: "Registrar o balanço das metas do PDI no período, o que foi cumprido e as revisões aprovadas.",
    refs: [
      { inst: "ies", num: "1.1", nome: "Evolução institucional a partir dos processos de Planejamento e Avaliação", nivel: 4 },
      { inst: "ies", num: "2.1", nome: "Missão, objetivos, metas e valores institucionais", nivel: 4 },
    ],
  },
  {
    id: "consu-gestao-colegiada", orgao: "CONSU", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 1,
    titulo: "Mandatos dos órgãos colegiados e divulgação das decisões colegiadas",
    porque: "O conceito 5 exige que os processos de gestão regulamentem o mandato dos membros dos órgãos colegiados e sistematizem e divulguem as decisões colegiadas, com apropriação assegurada pela comunidade interna.",
    evidencia: "Registrar a recomposição dos colegiados, o meio de publicação das decisões e a conferência do fluxo de encaminhamento.",
    refs: [{ inst: "ies", num: "4.5", nome: "Processos de gestão institucional", nivel: 5 }],
  },
  {
    id: "consu-sustentabilidade", orgao: "CONSU", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 2,
    titulo: "Sustentabilidade financeira e participação da comunidade interna no orçamento",
    porque: "A sustentabilidade financeira deve relacionar-se ao desenvolvimento institucional, com participação da comunidade interna na definição e no acompanhamento do orçamento.",
    evidencia: "Registrar a apresentação do orçamento, a participação dos segmentos e os indicadores de acompanhamento.",
    refs: [
      { inst: "ies", num: "4.7", nome: "Sustentabilidade financeira: relação com o desenvolvimento institucional", nivel: 4 },
      { inst: "ies", num: "4.8", nome: "Sustentabilidade financeira: participação da comunidade interna", nivel: 4 },
    ],
  },

  /* ===================== CONSEPE — ensino e currículos ================== */
  {
    id: "consepe-politicas-ensino", orgao: "CONSEPE", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Políticas de ensino de graduação e pós-graduação e acompanhamento dos cursos",
    porque: "As políticas de ensino previstas no PDI devem estar implantadas, com aprovação pelos colegiados da IES e acompanhamento e avaliação dos cursos.",
    evidencia: "Registrar o acompanhamento das ações do período e as deliberações sobre a oferta e a avaliação dos cursos.",
    refs: [
      { inst: "ies", num: "3.1", nome: "Políticas de ensino e ações acadêmico-administrativas para os cursos de graduação", nivel: 4 },
      { inst: "ies", num: "3.2", nome: "Políticas de ensino e ações acadêmico-administrativas para a pós-graduação", nivel: 4 },
    ],
  },
  {
    id: "consepe-curriculos", orgao: "CONSEPE", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Homologação de alterações curriculares e do calendário acadêmico",
    porque: "As alterações de PPC propostas pelos NDE e aprovadas nos colegiados de curso precisam de homologação pelo colegiado superior competente, evidenciando a aprovação pelos colegiados da IES.",
    evidencia: "Registrar cada PPC ou alteração homologada, com a origem (NDE e colegiado) e a vigência.",
    refs: [{ inst: "ies", num: "3.1", nome: "Políticas de ensino e ações acadêmico-administrativas para os cursos de graduação", nivel: 3 }],
  },
  {
    id: "consepe-vagas", orgao: "CONSEPE", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 2,
    titulo: "Número de vagas por curso frente ao corpo docente e à infraestrutura",
    porque: "O número de vagas deve corresponder à dimensão do corpo docente e às condições de infraestrutura, fundamentado em estudos quantitativos e qualitativos.",
    evidencia: "Registrar o estudo que fundamenta as vagas de cada curso e a deliberação do conselho.",
    refs: [{ inst: "curso", num: "1.20", nome: "Número de vagas", nivel: 4 }],
  },

  /* ===================== PROPPEX — pesquisa e extensão ================== */
  {
    id: "proppex-pesquisa", orgao: "PROPPEX", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Pesquisa, iniciação científica e inovação tecnológica: ações do período",
    porque: "As políticas de pesquisa/IC e inovação previstas no PDI devem estar implantadas, com ações acompanhadas e revistas periodicamente.",
    evidencia: "Registrar o balanço dos projetos e bolsas do período, os resultados e as decisões sobre editais.",
    refs: [
      { inst: "ies", num: "2.3", nome: "PDI, política e práticas de pesquisa ou iniciação científica e de inovação tecnológica", nivel: 4 },
      { inst: "ies", num: "3.4", nome: "Políticas institucionais e ações acadêmico-administrativas para a pesquisa", nivel: 4 },
    ],
  },
  {
    id: "proppex-extensao", orgao: "PROPPEX", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Extensão: ações, curricularização e acompanhamento",
    porque: "As políticas de extensão devem estar implantadas, com ações acadêmico-administrativas acompanhadas e avaliadas.",
    evidencia: "Registrar as ações do período, a carga horária curricularizada e as decisões sobre novas ações.",
    refs: [{ inst: "ies", num: "3.5", nome: "Políticas institucionais e ações acadêmico-administrativas para a extensão", nivel: 4 }],
  },
  {
    id: "proppex-producao", orgao: "PROPPEX", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 2,
    titulo: "Estímulo e difusão da produção acadêmica docente e discente",
    porque: "Devem existir ações de estímulo e difusão da produção acadêmica, com apoio à participação em eventos e à publicação, docente e discente.",
    evidencia: "Registrar o levantamento da produção do ano e as ações de fomento aprovadas para o seguinte.",
    refs: [
      { inst: "ies", num: "3.6", nome: "Políticas institucionais e ações de estímulo e difusão para a produção acadêmica", nivel: 5 },
      { inst: "ies", num: "3.12", nome: "Políticas institucionais e ações de estímulo à produção discente", nivel: 5 },
    ],
  },

  /* ======================== PROAC — pessoas e ensino ==================== */
  {
    id: "proac-capacitacao-docente", orgao: "PROAC", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Capacitação docente e formação continuada",
    porque: "A política de capacitação e formação continuada do corpo docente deve estar implantada, acompanhada e avaliada.",
    evidencia: "Registrar as formações do período, a adesão e a avaliação dos resultados.",
    refs: [{ inst: "ies", num: "4.2", nome: "Política de capacitação docente e formação continuada", nivel: 4 }],
  },
  {
    id: "proac-capacitacao-tecnica", orgao: "PROAC", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 1,
    titulo: "Capacitação e formação continuada do corpo técnico-administrativo",
    porque: "A política de capacitação do corpo técnico-administrativo deve estar implantada, acompanhada e avaliada.",
    evidencia: "Registrar as formações realizadas e a avaliação de seus efeitos no atendimento.",
    refs: [{ inst: "ies", num: "4.3", nome: "Política de capacitação e formação continuada para o corpo técnico-administrativo", nivel: 4 }],
  },

  /* ====================== REITORIA — infraestrutura ===================== */
  {
    id: "reitoria-infraestrutura", orgao: "REITORIA", escopo: "institucional",
    momento: "livre", cadencia: "semestral",
    titulo: "Avaliação periódica dos espaços físicos e plano de expansão e atualização de equipamentos",
    porque: "Instalações, salas, laboratórios e sanitários devem passar por avaliação periódica dos espaços e gerenciamento da manutenção patrimonial; o plano de expansão e atualização de equipamentos deve ser acompanhado.",
    evidencia: "Registrar a avaliação por tipo de espaço, as demandas vindas dos colegiados e o plano de investimento aprovado.",
    refs: [
      { inst: "ies", num: "5.1", nome: "Instalações administrativas", nivel: 5 },
      { inst: "ies", num: "5.16", nome: "Plano de expansão e atualização de equipamentos", nivel: 4 },
    ],
  },
  {
    id: "reitoria-acervo", orgao: "REITORIA", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 1,
    titulo: "Plano de atualização do acervo da biblioteca",
    porque: "O plano de atualização do acervo deve prever a alocação de recursos e o acompanhamento e a avaliação do acervo pela comunidade acadêmica.",
    evidencia: "Registrar o plano aprovado, os recursos alocados e as listas validadas pelos NDE que o originaram.",
    refs: [{ inst: "ies", num: "5.10", nome: "Bibliotecas: plano de atualização do acervo", nivel: 5 }],
  },
  {
    id: "reitoria-comunicacao", orgao: "REITORIA", escopo: "institucional",
    momento: "livre", cadencia: "anual", semestre: 2,
    titulo: "Comunicação com as comunidades interna e externa e ouvidoria",
    porque: "Os canais de comunicação e a ouvidoria devem ser avaliados periodicamente quanto à eficácia, gerando ações de melhoria.",
    evidencia: "Registrar as demandas recebidas pela ouvidoria, o tempo de resposta e as melhorias decididas.",
    refs: [
      { inst: "ies", num: "3.9", nome: "Comunicação da IES com a comunidade externa", nivel: 4 },
      { inst: "ies", num: "3.10", nome: "Comunicação da IES com a comunidade interna", nivel: 4 },
    ],
  },
];

export const pautaDe = (id) => PAUTAS.find((p) => p.id === id) || null;

/** Todas as pautas de um órgão, na ordem do ciclo (abertura antes). */
export function pautasDoOrgao(orgao) {
  const cod = String(orgao || "").toUpperCase();
  return PAUTAS.filter((p) => p.orgao === cod)
    .sort((a, b) => (MOMENTOS[a.momento].ordem - MOMENTOS[b.momento].ordem) || a.titulo.localeCompare(b.titulo));
}

/* ============================== PERIODICIDADE =========================== */
/** Semestre civil de uma data: "2026-S1" (jan–jun) ou "2026-S2" (jul–dez). */
export function janelaDe(iso) {
  if (diaSerial(iso) === null) return null;
  return `${iso.slice(0, 4)}-S${Number(iso.slice(5, 7)) <= 6 ? 1 : 2}`;
}
export function numeroDoSemestre(iso) {
  const j = janelaDe(iso);
  return j ? Number(j.slice(-1)) : null;
}
/** Último dia do semestre em que a data cai. */
export function fimDaJanela(iso) {
  if (diaSerial(iso) === null) return null;
  const ano = iso.slice(0, 4);
  return Number(iso.slice(5, 7)) <= 6 ? `${ano}-06-30` : `${ano}-12-31`;
}
/** A pauta é cobrada neste semestre? (as anuais só valem no semestre delas) */
export function cobradaNoSemestre(pauta, iso) {
  if (pauta.cadencia === "semestral") return true;
  return numeroDoSemestre(iso) === pauta.semestre;
}

/* ============================== CONFORMIDADE ============================ */
// Só ata aprovada ou registrada vale como prova: rascunho e minuta ainda
// podem mudar, e o avaliador vai pedir o documento fechado.
const VALE_COMO_PROVA = new Set(["aprovada", "registrada"]);
const ALERTA_DIAS = 45;   // "vencendo" quando falta menos que isto para o fim

/** Atas de um órgão (e curso) que servem de prova, mais recentes primeiro. */
function atasDoOrgao(atas, { orgao, curso, escopo }) {
  return (atas || [])
    .filter((a) => a.orgao === orgao
      && (escopo !== "curso" || !curso || a.curso === curso)
      && VALE_COMO_PROVA.has(a.status))
    .sort((x, y) => String(y.sessao?.data || "").localeCompare(String(x.sessao?.data || "")));
}

function registrosDaPauta(atas, pauta, { orgao, curso }) {
  const saida = [];
  for (const a of atasDoOrgao(atas, { orgao, curso, escopo: pauta.escopo })) {
    for (const p of a.pauta || []) {
      if (p.pautaMec !== pauta.id) continue;
      saida.push({
        ataId: a.id, numero: a.numero, data: a.sessao?.data || "",
        tipo: a.sessao?.tipo || "ordinária", ponto: p.titulo,
        deliberou: !!(p.deliberacao || p.encaminhamento?.acao),
      });
    }
  }
  return saida;
}

/**
 * Ciclo obrigatório do órgão no semestre: quantas sessões ordinárias já foram
 * registradas e quantas ainda faltam. Sessões extraordinárias entram no
 * relatório mas não substituem as ordinárias.
 */
export function ritualDoOrgao(atas, { orgao, curso = "", hoje = hojeLocalISO() } = {}) {
  const r = ritualDe(orgao);
  const janela = janelaDe(hoje);
  const escopo = orgaoDe(orgao)?.porCurso ? "curso" : "institucional";
  const doSemestre = atasDoOrgao(atas, { orgao, curso, escopo })
    .filter((a) => janelaDe(a.sessao?.data) === janela);
  const ordinarias = doSemestre.filter((a) => (a.sessao?.tipo || "ordinária") !== "extraordinária");
  const extraordinarias = doSemestre.filter((a) => a.sessao?.tipo === "extraordinária");
  return {
    orgao, curso, janela, exigidas: r.ordinarias, momentos: r.momentos,
    ordinarias: ordinarias.length, extraordinarias: extraordinarias.length,
    faltam: Math.max(0, r.ordinarias - ordinarias.length),
    completo: ordinarias.length >= r.ordinarias,
    // qual sessão do ciclo vem a seguir — orienta a sugestão de pauta
    proximoMomento: r.momentos[Math.min(ordinarias.length, r.momentos.length - 1)] || "livre",
    sessoes: doSemestre.map((a) => ({
      id: a.id, numero: a.numero, data: a.sessao?.data, tipo: a.sessao?.tipo || "ordinária",
    })),
  };
}

/**
 * Situação de cada pauta do órgão no semestre corrente.
 * estado: "em-dia" · "vencendo" · "pendente" · "nunca" · "fora-da-janela"
 * (esta última para as anuais que não são cobradas neste semestre).
 */
export function situacaoPautas(atas, { orgao, curso = "", hoje = hojeLocalISO() } = {}) {
  const janela = janelaDe(hoje);
  const fim = fimDaJanela(hoje);
  const dias = diaSerial(fim) - diaSerial(hoje);

  return pautasDoOrgao(orgao).map((p) => {
    const regs = registrosDaPauta(atas, p, { orgao, curso });
    const naJanela = regs.filter((r) => janelaDe(r.data) === janela);
    const exigida = cobradaNoSemestre(p, hoje);

    let estado;
    if (naJanela.length) estado = "em-dia";
    else if (!exigida) estado = "fora-da-janela";
    else if (!regs.length) estado = "nunca";
    else if (dias <= ALERTA_DIAS) estado = "vencendo";
    else estado = "pendente";

    return {
      ...p, curso, janela, fimDaJanela: fim, diasRestantes: dias,
      exigidaAgora: exigida, estado, momentoRot: MOMENTOS[p.momento].rot,
      registrosNaJanela: naJanela.length, ultima: regs[0] || null, historico: regs.slice(0, 6),
    };
  });
}

/** Checklist do semestre: ciclo de sessões + pautas cobradas agora. */
export function checklistSemestral(atas, { orgao, curso = "", hoje = hojeLocalISO() } = {}) {
  const pautas = situacaoPautas(atas, { orgao, curso, hoje });
  const exigidas = pautas.filter((p) => p.exigidaAgora);
  const emDia = exigidas.filter((p) => p.estado === "em-dia").length;
  return {
    ritual: ritualDoOrgao(atas, { orgao, curso, hoje }),
    pautas, exigidas: exigidas.length, emDia,
    percentual: exigidas.length ? Math.round((emDia / exigidas.length) * 100) : 100,
  };
}

/**
 * Pautas a sugerir numa reunião. Prioriza as do momento em que o órgão está
 * no ciclo (a segunda sessão do semestre puxa as de encerramento), mas nunca
 * esconde o que ficou para trás.
 */
export function pautasSugeridas(atas, { orgao, curso = "", hoje = hojeLocalISO(), momento = null } = {}) {
  const alvo = momento || ritualDoOrgao(atas, { orgao, curso, hoje }).proximoMomento;
  return situacaoPautas(atas, { orgao, curso, hoje })
    .filter((p) => p.exigidaAgora && p.estado !== "em-dia")
    .sort((a, b) => {
      const daVez = (x) => (x.momento === alvo ? 0 : 1);
      const risco = { nunca: 0, vencendo: 1, pendente: 2 };
      return daVez(a) - daVez(b) || risco[a.estado] - risco[b.estado] || a.titulo.localeCompare(b.titulo);
    });
}

/* ============================ VISÃO DA PROPPEX ========================== */
/** Matriz: uma linha por pauta e uma coluna por curso (ou coluna única). */
export function matrizConformidade(atas, { cursos = CURSOS.map((c) => c.slug), hoje = hojeLocalISO() } = {}) {
  const linhas = [];
  for (const p of PAUTAS) {
    const porCurso = p.escopo === "curso" && orgaoDe(p.orgao)?.porCurso;
    const alvos = porCurso ? cursos : [""];
    const celulas = alvos.map((curso) => {
      const s = situacaoPautas(atas, { orgao: p.orgao, curso, hoje }).find((x) => x.id === p.id);
      return { curso, estado: s?.estado || "nunca", ultima: s?.ultima || null };
    });
    const cobrada = cobradaNoSemestre(p, hoje);
    linhas.push({
      pauta: p.id, titulo: p.titulo, orgao: p.orgao, escopo: p.escopo, porCurso,
      momento: p.momento, momentoRot: MOMENTOS[p.momento].rot,
      cadencia: p.cadencia, semestre: p.semestre || null, refs: p.refs, exigidaAgora: cobrada,
      celulas,
      emDia: celulas.filter((c) => c.estado === "em-dia").length,
      total: cobrada ? celulas.length : 0,
    });
  }
  const total = linhas.reduce((n, l) => n + l.total, 0);
  const emDia = linhas.reduce((n, l) => n + (l.total ? l.emDia : 0), 0);
  return { linhas, janela: janelaDe(hoje), fimDaJanela: fimDaJanela(hoje), total, emDia,
    percentual: total ? Math.round((emDia / total) * 100) : 0 };
}

/** Placar por curso: pautas do NDE e do Colegiado mais o ciclo de sessões. */
export function placarPorCurso(atas, { cursos = CURSOS, hoje = hojeLocalISO() } = {}) {
  return cursos.map((c) => {
    let exigidas = 0, emDia = 0, sessoesFaltando = 0, extraordinarias = 0;
    for (const orgao of ["NDE", "COLEGIADO"]) {
      const ck = checklistSemestral(atas, { orgao, curso: c.slug, hoje });
      exigidas += ck.exigidas; emDia += ck.emDia;
      sessoesFaltando += ck.ritual.faltam; extraordinarias += ck.ritual.extraordinarias;
    }
    return {
      ...c, exigidas, emDia, sessoesFaltando, extraordinarias,
      percentual: exigidas ? Math.round((emDia / exigidas) * 100) : 0,
    };
  }).sort((a, b) => b.percentual - a.percentual || a.nome.localeCompare(b.nome));
}

/** Ciclo de sessões de todos os órgãos — quem ainda não se reuniu. */
export function ciclosDoSemestre(atas, { cursos = CURSOS, hoje = hojeLocalISO() } = {}) {
  const saida = [];
  for (const [cod, r] of Object.entries(RITUAL)) {
    if (!r.ordinarias) continue;
    const alvos = orgaoDe(cod)?.porCurso ? cursos.map((c) => c.slug) : [""];
    for (const curso of alvos) saida.push(ritualDoOrgao(atas, { orgao: cod, curso, hoje }));
  }
  return saida;
}

/** Datas-limite próximas, para o painel do professor. */
export function proximosPrazos(atas, { orgao, curso, hoje = hojeLocalISO(), dias = 60 } = {}) {
  const limite = somaDias(hoje, dias);
  return situacaoPautas(atas, { orgao, curso, hoje })
    .filter((p) => p.exigidaAgora && p.estado !== "em-dia" && p.fimDaJanela <= limite)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}
