/* ========================================================================
   Termos de Compromisso da Iniciação Científica — o texto institucional.

   O documento NÃO foi inventado aqui: são os quatro modelos que a PROPPEX
   já usava em .docx, com campos de mala direta, transcritos cláusula a
   cláusula. O que o Word preenchia à mão o ARCHÉ preenche do próprio
   registro — o aluno informa os dados dele na guia Bolsa, o professor vem
   do perfil, o projeto vem do projeto.

   São quatro, porque as obrigações são diferentes:
     bolsa CNPq   — PIBIC/PIBITI-CNPq: 20h semanais, conta no Banco do
                    Brasil (exigência do CNPq) e devolução ao CNPq;
     bolsa UNIEGO — PBIC: 12h semanais, conta livre, devolução à instituição;
     voluntário   — PVIC: 8h semanais, sem bolsa e sem conta;
     orientador   — um por professor, com os compromissos da orientação.

   Para mudar a redação de uma cláusula, é AQUI — os geradores só desenham.
   Cada bloco é `{p}` (parágrafo), `{sub}` (subtítulo do parágrafo legal) ou
   `{itens}` (a lista, com o algarismo já no texto, como no documento).
   ======================================================================== */

/* O valor da bolsa do CNPq não vem do catálogo do edital (lá ele é null: a
   quota é do órgão, e o ARCHÉ não a define). É o valor da tabela vigente na
   época do modelo — muda por portaria do CNPq, e é uma linha só. */
export const VALOR_CNPQ = Number(process.env.IC_VALOR_CNPQ || 700);

/** Carga horária semanal exigida de cada tipo (cláusula III dos modelos). */
export const HORAS_SEMANAIS = { cnpq: 20, uniego: 12, voluntario: 8 };

/** Qual dos três modelos o aluno daquele projeto assina. Sem bolsa concedida
    é o do PVIC — o voluntário é a situação PADRÃO do projeto aprovado. */
export const fomentoDoProjeto = (p) => (p?.fomento?.tipo === "cnpq" ? "cnpq"
  : p?.fomento?.tipo === "uniego" ? "uniego" : "voluntario");

/* Quem entra num lote de termos. São conjuntos DIFERENTES porque assinam
   documentos diferentes — o do voluntário não tem bolsa nem conta bancária —,
   e a coordenação leva cada pilha à cerimônia. "aluno" traz os dois juntos, que
   é o que a via individual precisa: cada um baixa a sua, seja qual for. */
export function alunosDoLote(projetos = [], tipo = "todos") {
  if (!["bolsista", "voluntario", "aluno", "todos"].includes(tipo)) return [];
  const saida = [];
  for (const p of projetos) {
    const fomento = fomentoDoProjeto(p);
    if (tipo === "voluntario" && fomento !== "voluntario") continue;
    if (tipo === "bolsista" && fomento === "voluntario") continue;
    for (const a of (p.alunos || []).filter((x) => x.nome || x.email)) saida.push({ p, a, fomento });
  }
  return saida;
}

const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "setembro/2026" — como os modelos escrevem os prazos. */
export function mesAno(iso) {
  const [a, m] = String(iso || "").split("-");
  return a && m ? `${MESES[Number(m) - 1]}/${a}` : "—";
}
const somaMeses = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(+d)) return "";
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
/** "2026/2027" — a edição, pelos anos da vigência. */
export const edicao = (vig = {}) =>
  `${String(vig.inicio || "").slice(0, 4)}/${String(vig.fim || "").slice(0, 4)}`;

/* ------------------------- cláusulas comuns ----------------------------- */

const FASES_CNPQ = [
  "I - Publicação do Edital de Divulgação contendo os períodos de inscrição e seleção, datas de assinatura do termo de compromisso, início das atividades, entrega de relatórios parcial e final e execução do Seminário de Iniciação Científica;",
  "II - Elaboração de Projeto/Plano de Trabalho da pesquisa pelos candidatos e respectivos professores-orientadores;",
  "III - Inscrição do Projeto/Plano de Trabalho junto à Coordenação de Pesquisa e Inovação, acompanhada do Currículo Lattes (Plataforma Lattes CNPq) de todos os envolvidos no Projeto/Plano de Trabalho;",
  "IV - Seleção dos Projetos/Planos de Trabalho, de acordo com as cotas de bolsas oferecidas pelo CNPq, realizada por comissão composta por ad hoc externos e por Comitê Externo, preferencialmente composta por docentes produtividade em pesquisa do CNPq;",
  "V - Assinatura do termo de compromisso a ser enviado pela Coordenação de Pesquisa e Inovação e início das atividades para desenvolvimento dos Projetos/Planos de Trabalho;",
  "VI - Preenchimento do formulário a ser enviado por e-mail ao bolsista pelo CNPq.",
];

const FASES_INSTITUCIONAL = (inst) => [
  "I - Publicação do Edital de Divulgação contendo os períodos de inscrição e seleção, datas de assinatura do termo de compromisso, início das atividades, entrega de relatórios parcial e final e execução do Seminário de Iniciação Científica;",
  "II - Elaboração de Projeto/Plano de Trabalho da pesquisa pelos candidatos e respectivos professores-orientadores;",
  "III - Inscrição do Projeto/Plano de Trabalho junto à Coordenação de Pesquisa e Inovação;",
  `IV - Seleção dos Projetos/Planos de Trabalho, de acordo com a disponibilidade orçamentária ${inst.artigo === "na" ? "da" : "do"} ${inst.sigla}, realizada por comissão composta por professores pesquisadores da área (ad hoc externos) de outras IES e pelo CIPI (Comitê Institucional de Pesquisa e Inovação);`,
  "V - Assinatura do termo de compromisso a ser enviado pela Coordenação de Pesquisa e Inovação e início das atividades para desenvolvimento dos Projetos/Planos de Trabalho.",
];

const SANCOES_BOLSA = (aQuem) => [
  `I - caso o bolsista não entregue o relatório final até a data prevista, ou abandone o Projeto/Plano de Trabalho de pesquisa, deverá devolver ${aQuem} os valores recebidos a título de bolsa de iniciação científica;`,
  "II - os alunos inadimplentes terão suas bolsas suspensas até a resolução de sua situação financeira junto à Instituição;",
  "III - os alunos que não entregarem o relatório parcial no tempo proposto terão suas bolsas suspensas até a resolução da situação junto à Coordenação de Pesquisa e Inovação;",
  "IV - os alunos que não entregarem o relatório final e o resumo expandido no tempo previsto não terão seu trabalho publicado nos Anais do Seminário de Iniciação Científica, e os Professores Orientadores serão suspensos para a realização de orientações futuras.",
];

const OBRIGACOES_INSTITUICAO = [
  "I - Determinar a data de entrega dos relatórios parcial e final, avaliando-os e sugerindo ações de melhoria;",
  "II - Realizar Seminário de Iniciação Científica ao final dos 12 meses do Programa para divulgação dos resultados dos Projetos/Planos de Trabalho e socialização de experiências entre os pesquisadores;",
  "III - Publicar os resumos dos trabalhos nos Anais do Seminário de Iniciação Científica.",
];

const disposicoes = (inst) => ({
  rot: "CLÁUSULA VII", tit: "DAS DISPOSIÇÕES GERAIS",
  blocos: [
    { itens: [`I - os casos omissos serão decididos pela Coordenação de Pesquisa e Inovação juntamente com a Reitoria ${inst.artigo === "na" ? "da" : "do"} ${inst.sigla}.`] },
    { p: `Fica eleito o Foro da cidade de ${inst.cidade} / GO como competente para tratar das questões provenientes deste Termo de Compromisso, eventualmente não resolvidas no âmbito administrativo.` },
    { p: "Por estarem as partes justas e acertadas, firmam o presente." },
  ],
});

const prazo = { rot: "CLÁUSULA VI", tit: "DO PRAZO", blocos: [
  { p: "O prazo para a realização do Projeto/Plano de Trabalho de pesquisa será de 12 meses, não prorrogáveis." }] };

/* --------------------------- termo do bolsista --------------------------- */
/**
 * O termo de um aluno, montado do tipo de fomento.
 *   tipo — "cnpq" | "uniego" | "voluntario"
 *   inst — { nome, sigla, artigo, cidade } (vem de lib/marca.js)
 *   programa — o nome da modalidade no edital (PIBIC/CNPq, PROBEX/UNIEGO…)
 */
export function termoDoAluno({ tipo, inst, programa, sigla, valor, vigencia = {} } = {}) {
  // `programa` é o nome por extenso, que abre o documento; `sigla` é como o
  // aluno se identifica nas publicações ("bolsista do PIBIC/CNPq")
  sigla = sigla || programa;
  const cnpq = tipo === "cnpq";
  const voluntario = tipo === "voluntario";
  const horas = String(HORAS_SEMANAIS[tipo] ?? 12).padStart(2, "0");
  const de = inst.artigo === "na" ? "da" : "do";
  const quem = voluntario ? "VOLUNTÁRIO" : "BOLSISTA";
  const oQue = voluntario ? "voluntário" : "bolsista";

  const clausulas = [];

  /* I — do programa */
  const programaBlocos = cnpq ? [
    { p: "O Programa Institucional de Bolsas de Iniciação Científica (PIBIC) visa apoiar a política de Iniciação Científica desenvolvida nas Instituições de Ensino e/ou Pesquisa, por meio da concessão de bolsas de Iniciação Científica (IC) a estudantes de graduação integrados na pesquisa científica. A cota de bolsas de IC é concedida diretamente às instituições, que são responsáveis pela seleção dos projetos dos pesquisadores orientadores interessados em participar do Programa. Os estudantes tornam-se bolsistas a partir da indicação dos orientadores. São objetivos específicos do Programa:" },
    { itens: [
      "despertar vocação científica e incentivar novos talentos entre estudantes de graduação;",
      "contribuir para reduzir o tempo médio de titulação de mestres e doutores;",
      "contribuir para a formação científica de recursos humanos que se dedicarão a qualquer atividade profissional;",
      "estimular uma maior articulação entre a graduação e a pós-graduação;",
      "contribuir para a formação de recursos humanos para a pesquisa;",
      "contribuir para reduzir o tempo médio de permanência dos alunos na pós-graduação;",
      "estimular pesquisadores produtivos a envolverem alunos de graduação nas atividades científica, tecnológica e artístico-cultural;",
      "proporcionar ao bolsista, orientado por pesquisador qualificado, a aprendizagem de técnicas e métodos de pesquisa, bem como estimular o desenvolvimento do pensar cientificamente e da criatividade, decorrentes das condições criadas pelo confronto direto com os problemas de pesquisa; e",
      "ampliar o acesso e a integração do estudante à cultura científica.",
    ], marcador: true },
    { p: "O Programa Institucional de Bolsas de Iniciação em Desenvolvimento Tecnológico e Inovação (PIBITI) tem por objetivo estimular os jovens do ensino superior nas atividades, metodologias, conhecimentos e práticas próprias ao desenvolvimento tecnológico e aos processos de inovação. São objetivos específicos do Programa:" },
    { itens: [
      "contribuir para a formação e inserção de estudantes em atividades de pesquisa, desenvolvimento tecnológico e inovação;",
      "contribuir para a formação de recursos humanos que se dedicarão ao fortalecimento da capacidade inovadora das empresas no País; e",
      "contribuir para a formação do cidadão pleno, com condições de participar de forma criativa e empreendedora na sua comunidade.",
    ], marcador: true },
  ] : [
    { p: `O ${programa} — desenvolvido pela Coordenação de Pesquisa e Inovação ${de} ${inst.sigla} — tem como objetivos contribuir para a formação de recursos humanos para a pesquisa; estimular o desenvolvimento da pesquisa institucional; estimular pesquisadores produtivos a envolverem estudantes de graduação nas atividades científica, tecnológica e artístico-cultural; e proporcionar ao ${oQue}, orientado por pesquisador qualificado, a aprendizagem de técnicas e métodos de pesquisa, bem como estimular o desenvolvimento do pensar cientificamente e da criatividade, decorrentes das condições criadas pelo confronto direto com os problemas de pesquisa.` },
  ];
  clausulas.push({ rot: "CLÁUSULA I", tit: "DO PROGRAMA", blocos: programaBlocos });

  /* II — das fases */
  clausulas.push({ rot: "CLÁUSULA II", tit: "DAS FASES",
    blocos: [{ itens: cnpq ? FASES_CNPQ : FASES_INSTITUCIONAL(inst) }] });

  /* III — requisitos */
  const requisitos = [
    "I - Estar matriculado no mínimo no 2º e no máximo no antepenúltimo período de seu curso;",
    "II - Não ter reprovação constante em histórico escolar;",
    "III - Estar adimplente;",
    `IV - Dispor de pelo menos ${horas} horas semanais para desenvolvimento do Projeto/Plano de Trabalho${cnpq ? ";" : "."}`,
  ];
  if (cnpq) requisitos.push("V - Não possuir vínculo empregatício; e", "VI - Não possuir outro tipo de bolsa.");
  clausulas.push({ rot: "CLÁUSULA III", tit: "REQUISITOS PARA INGRESSO",
    blocos: [{ sub: "§ 1º. Do Candidato:" }, { itens: requisitos }] });

  /* IV — obrigações */
  const obrig = [{ sub: "§ 1º. Da Instituição de Ensino / Coordenações:" }];
  if (tipo === "uniego") {
    obrig.push({ itens: [
      `I - Fornecer bolsa no valor de ${brl(valor)} mensais ao orientando;`,
      ...OBRIGACOES_INSTITUICAO.map((x, i) => x.replace(/^[IV]+ - /, `${["II", "III", "IV"][i]} - `)),
    ] });
    obrig.push({ sub: "§ 2º. Do Bolsista:" });
  } else if (cnpq) {
    obrig.push({ itens: OBRIGACOES_INSTITUICAO });
    obrig.push({ sub: "§ 2º. Do CNPq:" });
    obrig.push({ itens: [
      `I - Fornecer bolsa no valor de ${brl(VALOR_CNPQ)} mensais ao orientando; e`,
      "II - Determinar as cotas de bolsas para a Instituição.",
    ] });
    obrig.push({ sub: "§ 3º. Do Bolsista:" });
  } else {
    obrig.push({ itens: OBRIGACOES_INSTITUICAO });
    obrig.push({ sub: "§ 2º. Do Voluntário:" });
  }

  const deveres = [
    "I - Desenvolver o Plano de Trabalho da pesquisa de acordo com o cronograma apresentado no Projeto;",
    `II - Elaborar relatórios parcial e final, dentro dos modelos adotados pela Coordenação de Pesquisa e Inovação, entregando-os no prazo previsto em cronograma divulgado no início do Programa, sob pena de ter ${voluntario ? "o projeto suspenso" : "o pagamento da bolsa suspenso"} até a regularização das atividades;`,
    `III - Participar do Seminário de Iniciação Científica ${de} ${inst.sigla}, apresentando os resultados obtidos no Projeto/Plano de Trabalho de pesquisa desenvolvido;`,
    "IV - Apresentar, como relatório final, artigo científico com qualidade para publicação em revista especializada na área de conhecimento segundo Qualis/CAPES (B2, B1, A4, A3, A2 e A1);",
    `V - Dedicar ${horas} horas semanais ao Projeto/Plano de Trabalho de pesquisa;`,
    `VI - Nas publicações e trabalhos apresentados, fazer referência à sua condição de ${oQue} do ${sigla}${voluntario ? "." : ";"}`,
  ];
  if (!voluntario) {
    deveres.push(`VII - Devolver ${cnpq ? "ao CNPq" : `${de === "da" ? "à" : "ao"} ${inst.sigla}`}, em valores atualizados, a(s) mensalidade(s) recebida(s) indevidamente, caso os requisitos e compromissos estabelecidos acima não sejam cumpridos.`);
  }
  obrig.push({ itens: deveres });
  clausulas.push({ rot: "CLÁUSULA IV", tit: "DAS OBRIGAÇÕES", blocos: obrig });

  /* V — sanções */
  const sancoes = voluntario ? [
    "I - caso o voluntário não entregue o relatório final até a data prevista, ou abandone o Projeto/Plano de Trabalho de pesquisa, será impedido de participar de próximas edições de iniciação científica, e os Professores Orientadores serão suspensos para a realização de orientações futuras;",
    "II - os alunos que não entregarem o relatório parcial no tempo proposto terão seus projetos suspensos até a resolução da situação junto à Coordenação de Pesquisa e Inovação;",
    "III - os alunos que não entregarem o relatório final e o resumo expandido no tempo previsto não terão seu trabalho publicado nos Anais do Seminário de Iniciação Científica, e os Professores Orientadores serão suspensos para a realização de orientações futuras.",
  ] : SANCOES_BOLSA(cnpq ? "ao CNPq" : `${de === "da" ? "à" : "ao"} ${inst.sigla}`);
  clausulas.push({ rot: "CLÁUSULA V", tit: "DAS SANÇÕES", blocos: [{ itens: sancoes }] });

  clausulas.push(prazo);
  clausulas.push(disposicoes(inst));

  return {
    titulo: `TERMO DE COMPROMISSO — ${quem}`,
    subtitulo: `${sigla} ${edicao(vigencia)}`,
    abertura: `${inst.artigo === "na" ? "A" : "O"} ${inst.sigla} e o ${quem} firmam o presente TERMO DE COMPROMISSO para o ${programa}, observando-se o teor das cláusulas infra:`,
    clausulas,
  };
}

/* -------------------------- termo do orientador -------------------------- */
/**
 * Um por professor. Os prazos que o modelo trazia escritos à mão
 * ("Relatório Parcial em março/26") saem do EDITAL: parcial aos 6 meses de
 * execução e final no fim da vigência (item 11.1.b). Trocar o edital muda o
 * termo, que é o que se espera de um documento gerado.
 */
export function termoDoOrientador({ inst, vigencia = {}, relatorioParcialMeses = 6 } = {}) {
  const de = inst.artigo === "na" ? "da" : "do";
  const parcial = mesAno(somaMeses(vigencia.inicio, relatorioParcialMeses));
  const final = mesAno(vigencia.fim);
  const seminario = mesAno(somaMeses(vigencia.fim, 2));

  return {
    titulo: "TERMO DE COMPROMISSO — ORIENTADOR",
    subtitulo: `Iniciação Científica, Inovação Tecnológica e Iniciação à Extensão · Edição ${edicao(vigencia)}`,
    abertura: `Pelo presente termo, a Coordenação de Pesquisa e Inovação ${de} ${inst.nome} possibilita ao(à) orientador(a) acima referido(a) participar do Programa de Iniciação Científica ${de} ${inst.sigla} no período de ${mesAno(vigencia.inicio)} a ${final}, desde que concorde com a filosofia e os objetivos do Programa.`,
    secoes: [
      { tit: "FILOSOFIA", blocos: [
        { p: "O Programa Institucional de Iniciação Científica tem como princípio despertar vocações científicas e talentos potenciais entre alunos da graduação, possibilitando ao iniciante a aprendizagem de técnicas e métodos norteados para a produção crítica do conhecimento." },
      ] },
      { tit: "OBJETIVOS DO PROGRAMA", blocos: [{ marcador: true, itens: [
        "Estimular pesquisadores produtivos a engajarem estudantes de graduação no processo acadêmico, otimizando a capacidade de orientação à pesquisa da instituição.",
        "Despertar vocação científica e incentivar talentos potenciais entre estudantes de graduação, mediante suas participações em projetos de pesquisa, introduzindo o jovem universitário no domínio do método científico.",
        "Proporcionar ao aluno orientado por pesquisador qualificado a aprendizagem de técnicas e métodos científicos, bem como estimular o desenvolvimento do pensar cientificamente e da criatividade decorrentes das condições criadas pelo confronto direto com os problemas de pesquisa.",
        "Qualificar quadros para os programas de pós-graduação e aprimorar o processo formativo de profissionais para o setor produtivo.",
      ] }] },
      { tit: "COMPROMISSOS DO(A) ORIENTADOR(A)", blocos: [{ marcador: true, itens: [
        "Fazer executar o plano de pesquisa aprovado pelo Comitê Científico do Programa.",
        `Responder ao questionário de acompanhamento (Relatório Parcial) em ${parcial} e ao Relatório Final em ${final}.`,
        "Orientar e avaliar os alunos em todas as fases do seu programa de pesquisa, incluindo a elaboração dos relatórios técnico-científicos para divulgação dos resultados.",
        "Repassar aos alunos as informações recebidas referentes ao Programa.",
        "Encaminhar à Coordenação de Pesquisa eventuais alterações no Plano de Pesquisa, com antecedência mínima de 120 (cento e vinte) dias do término do Programa, com justificativa.",
        "Encaminhar à Coordenação de Pesquisa o parecer aprovado no Comitê de Ética em Pesquisa, caso o estudo envolva seres humanos — toda pesquisa que, individual ou coletivamente, tenha como participante o ser humano, em sua totalidade ou em partes dele, e o envolva de forma direta ou indireta, incluindo o manejo de seus dados, informações ou materiais biológicos.",
        "Assegurar condições e acesso às instalações laboratoriais imprescindíveis à realização da pesquisa do(a) aluno(a).",
        `Orientar a apresentação dos resultados alcançados sob a forma de exposições orais ou em painéis no Seminário de Iniciação Científica ${de} ${inst.sigla}, que ocorrerá em ${seminario}.`,
        "Acompanhar as exposições dos trabalhos realizados pelos alunos em congressos, seminários e por ocasião do Seminário de Iniciação Científica.",
        "Incluir o nome do(a) aluno(a) de Iniciação Científica nas publicações e nos trabalhos apresentados em congressos e seminários cujos resultados contarem com a participação dele(a).",
        "É vedado ao orientador repassar a outro a orientação de seu(sua) aluno(a), salvo em caso de impedimento eventual, comunicado à Coordenação de Pesquisa.",
        "Solicitar substituição ou desligamento de bolsista a qualquer tempo, desde que encaminhe requerimento, em formulário próprio, à Coordenação de Pesquisa, expondo os motivos da medida proposta.",
        "Comunicar à Coordenação de Pesquisa, imediatamente, o cancelamento da bolsa, caso seu aluno seja bolsista, com a devida justificativa, para que se evite pagamento indevido.",
        "Atender às solicitações da Coordenação de Pesquisa para participar de comissões de avaliação dos trabalhos nos eventos de Iniciação Científica.",
      ] }] },
      { tit: "DISPOSIÇÕES FINAIS", blocos: [{ marcador: true, itens: [
        "Os pesquisadores vinculados ao Programa de Iniciação Científica terão de comparecer à apresentação final do trabalho e poderão ser solicitados a prestar consultoria ad hoc, emitindo pareceres técnicos na análise de relatórios de bolsistas.",
        `A Coordenação de Pesquisa poderá suspender a concessão da bolsa dos alunos ou determinar a devolução das mensalidades caso não se cumpram todas as atividades previstas no Programa de Iniciação Científica. Os casos excepcionais de cumprimento dos itens dispostos no presente termo serão julgados pelo Comitê Institucional de Pesquisa e Inovação ${de} ${inst.sigla}.`,
        "Em caso de descumprimento de algum dos itens acordados acima pelo orientador, o certificado de orientação será retido e ele será impedido de participar das próximas edições do Programa enquanto a pendência não for resolvida.",
      ] }] },
    ],
    declaracao: `Assumo, perante a Coordenação de Pesquisa ${de} ${inst.sigla}, o compromisso de cumprir integralmente as atribuições de orientador de Iniciação Científica expressas neste documento, referentes à pesquisa nele mencionada e selecionada com base no Edital do Programa de Iniciação Científica ${edicao(vigencia)}.`,
  };
}

/* ----------------------- termo do bolsista ICEM --------------------------
   O quinto modelo: PIBIC-EM/ICEM — Iniciação Científica no Ensino Médio.
   Transcrito da minuta institucional (mala direta), com as diferenças que
   fazem dele outro documento: 2 horas semanais, bolsa de R$ 300 (CNPq) ou
   R$ 150 (institucional), e o ANEXO 01 — a autorização do responsável,
   porque o bolsista é menor de idade. Assinam o aluno, o responsável e a
   coordenação de pesquisa. */
export const BOLSA_EM_CNPQ = Number(process.env.ICEM_VALOR_CNPQ || 300);
export const BOLSA_EM_INSTITUICAO = Number(process.env.ICEM_VALOR_INSTITUICAO || 150);

export function termoDoAlunoEM({ inst, vigencia = {} } = {}) {
  const de = inst.artigo === "na" ? "da" : "do";
  return {
    titulo: "TERMO DE COMPROMISSO — BOLSISTA",
    subtitulo: `ICEM — Iniciação Científica no Ensino Médio ${edicao(vigencia)}`,
    abertura: `${inst.artigo === "na" ? "A" : "O"} ${inst.sigla} e o BOLSISTA firmam o presente TERMO DE COMPROMISSO para o Programa de Iniciação Científica no Ensino Médio (ICEM), observando-se o teor das cláusulas infra:`,
    clausulas: [
      { rot: "CLÁUSULA I", tit: "DO PROGRAMA", blocos: [
        { p: `O ICEM — Programa de Iniciação Científica no Ensino Médio ${de} ${inst.sigla}, desenvolvido pela Coordenação de Pesquisa e Inovação, tem como objetivos despertar cedo no aluno o gosto pela pesquisa e trazer para a graduação alunos com grande potencial de se envolverem nas ciências e nas atividades acadêmicas da instituição.` },
      ] },
      { rot: "CLÁUSULA II", tit: "DAS FASES", blocos: [{ itens: [
        "I - Publicação do Edital de Divulgação contendo os períodos de inscrição e seleção, datas de assinatura do termo de compromisso, início das atividades, entrega de relatórios e execução do Seminário de Iniciação Científica;",
        "II - Seleção dos candidatos conforme os critérios do edital;",
        "III - Assinatura do termo de compromisso, com a autorização dos pais ou responsáveis (anexo 01), e início das atividades de acompanhamento dos projetos de pesquisa.",
      ] }] },
      { rot: "CLÁUSULA III", tit: "REQUISITOS PARA INGRESSO", blocos: [
        { sub: "§ 1º. Do Candidato:" },
        { itens: [
          "I - Estar matriculado no Ensino Médio;",
          "II - Dispor de pelo menos 2 horas semanais para o acompanhamento do Projeto/Plano de Trabalho.",
        ] },
      ] },
      { rot: "CLÁUSULA IV", tit: "DAS OBRIGAÇÕES", blocos: [
        { sub: "§ 1º. Da Instituição de Ensino / Coordenações:" },
        { itens: [
          `I - Fornecer bolsa no valor de R$ ${BOLSA_EM_CNPQ.toFixed(2).replace(".", ",")} mensais, quando financiada pelo CNPq, ou de R$ ${BOLSA_EM_INSTITUICAO.toFixed(2).replace(".", ",")} mensais, quando financiada pela instituição;`,
          "II - Solicitar e manter em seu poder, pelo tempo que for necessário, as autorizações de pais ou responsáveis para que os bolsistas menores de 18 anos possam receber a bolsa e desenvolver as atividades relativas ao projeto (anexo 01);",
          "III - Apresentar o bolsista ao professor orientador do projeto acompanhado e viabilizar a troca de projeto quando o aluno o desejar, por intermédio da Coordenação de Pesquisa e Inovação;",
          "IV - Determinar a data de entrega do relatório simplificado, avaliando-o e sugerindo ações de melhoria;",
          "V - Realizar Seminário de Iniciação Científica ao final dos 12 meses do Programa para divulgação dos resultados e socialização de experiências.",
        ] },
        { sub: "§ 2º. Do Bolsista:" },
        { itens: [
          "I - Acompanhar as atividades do projeto de pesquisa escolhido, sob a orientação do professor responsável;",
          "II - Elaborar o relatório simplificado, dentro do modelo adotado pela Coordenação de Pesquisa e Inovação, entregando-o no prazo previsto, sob pena de ter o pagamento da bolsa suspenso até a regularização das atividades;",
          `III - Participar do Seminário de Iniciação Científica ${de} ${inst.sigla} (CONINT);`,
          "IV - Dedicar 2 horas semanais ao acompanhamento do Projeto/Plano de Trabalho;",
          `V - Nas publicações e trabalhos apresentados, fazer referência à sua condição de bolsista do ICEM;`,
          `VI - Devolver ${de === "da" ? "à" : "ao"} ${inst.sigla}, ou ao CNPq, em valores atualizados, a(s) mensalidade(s) recebida(s) indevidamente, caso os requisitos e compromissos estabelecidos acima não sejam cumpridos.`,
        ] },
      ] },
      { rot: "CLÁUSULA V", tit: "DAS SANÇÕES", blocos: [{ itens: [
        `I - caso o bolsista abandone o Programa, deverá devolver ${de === "da" ? "à" : "ao"} ${inst.sigla} os valores recebidos a título de bolsa;`,
        "II - os alunos que não entregarem o relatório simplificado no tempo proposto terão suas bolsas suspensas até a resolução da situação junto à Coordenação de Pesquisa e Inovação.",
      ] }] },
      { rot: "CLÁUSULA VI", tit: "DO PRAZO", blocos: [
        { p: "O prazo de participação no Programa será de 12 meses, não prorrogáveis." }] },
      { rot: "CLÁUSULA VII", tit: "DAS DISPOSIÇÕES GERAIS", blocos: [
        { itens: [`I - os casos omissos serão decididos pela Coordenação de Pesquisa e Inovação juntamente com a Reitoria ${de} ${inst.sigla}.`] },
        { p: `Fica eleito o Foro da cidade de ${inst.cidade} / GO como competente para tratar das questões provenientes deste Termo de Compromisso, eventualmente não resolvidas no âmbito administrativo.` },
        { p: "Por estarem as partes justas e acertadas, firmam o presente." },
      ] },
    ],
  };
}

/**
 * Anexo 01 — a autorização do responsável, transcrita da minuta. É parte do
 * termo, na página seguinte: sem ela o menor não recebe bolsa nem frequenta
 * as dependências da instituição.
 */
export function autorizacaoResponsavelEM({ inst, bolsista = {} } = {}) {
  const b = bolsista;
  const linha = (v) => v || "____________________________";
  return {
    titulo: "ANEXO 01 — Autorização de Pais ou Responsáveis",
    subtitulo: "(para menores de dezoito anos)",
    texto: `Eu, ${linha(b.responsavel?.nome)}, portador(a) do CPF ${linha(b.responsavel?.cpf)}, `
      + `responsável pelo(a) aluno(a) ${linha(b.nome)}, devidamente matriculado(a) `
      + `em ${linha(b.escola)}, autorizo o(a) referido(a) aluno(a) a acessar as dependências `
      + `${inst.artigo === "na" ? "da" : "do"} ${inst.nome} e a desenvolver as atividades como bolsista de `
      + `Iniciação Científica no Ensino Médio, acompanhando o projeto ${linha(b.projetoTitulo)}, `
      + `sob orientação de ${linha(b.orientador)}.`,
  };
}
