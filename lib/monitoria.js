/* ========================================================================
   ARCHÉ MO — Monitoria Acadêmica.

   O programa era da **Diretoria Acadêmica (DIAC)** da FACEG até 2025 e passa
   à **PROPPEX** do UNIEGO por decisão da reitoria (ago/2026). Os editais
   antigos ficam no arquivo COMO FORAM PUBLICADOS — com o órgão e a marca da
   época, a mesma regra das atas (lib/marca.js): documento não se reescreve.

   O fluxo é o que o dono descreveu, e é o mesmo desenho da IC:

     professor submete o projeto  →  indica o(s) monitor(es)
       →  o monitor recebe o convite por e-mail e preenche os PRÓPRIOS dados
       →  o projeto vai à PROPPEX  →  aprovado (em execução)
       →  no fim do semestre o monitor entrega o relatório
       →  o orientador valida e avalia a atuação dele
       →  a PROPPEX homologa  →  certificados emitidos

   Duas coisas que este arquivo carrega e que não são detalhe:

   1. **O projeto só vai à PROPPEX depois que o monitor se cadastra.** É o
      que o edital chama de ficha de inscrição (Anexo II): a PROPPEX analisa
      projeto E candidato no mesmo ato, como fazia com a papelada.
   2. **A avaliação da atuação do monitor é do ORIENTADOR**, nunca da
      PROPPEX — quem acompanhou o semestre foi ele. A PROPPEX homologa o
      conjunto, que é o que autoriza a certificação.

   Trocar de edital é mexer no catálogo daqui, PRESERVANDO os `codigo` e os
   `numero`: eles são a chave do que já está gravado.
   ======================================================================== */
import { CURSOS, cursoDe, siglaCurso } from "./atas.js";
import { cpfValido, soDigitos } from "./cpf.js";
import { diaSerial, hojeLocalISO, semestreDe, somaDias } from "./datas.js";

export { CURSOS, cursoDe, siglaCurso };

/** Chave interna do estado — fora do /api/estado, porque guarda CPF,
    telefone e matrícula de estudante. */
export const MON_KEY = "mon-projetos-v1";

const txt = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(v)) ? txt(v) : "");
const email = (v) => txt(v).toLowerCase();
const mesmoEmail = (a, b) => !!email(a) && email(a) === email(b);
const mesmoCpf = (a, b) => {
  const x = soDigitos(a), y = soDigitos(b);
  return !!x && x.length === 11 && x === y;
};

/* ======================================================================
   1. ARQUIVO DOS EDITAIS
   ====================================================================== */

/**
 * A série da monitoria na PROPPEX é **03/AAAA**, para conviver com o 01/AAAA
 * (Iniciação Científica) e o 02/AAAA (ICEM) no quadro por ano da vitrine.
 * Os editais da DIAC tinham numeração própria (01/2025 no 1º semestre,
 * 02/2025 no 2º) e ficam registrados com o número que foi publicado — a
 * `serie` é só como o ARCHÉ os ordena.
 *
 * A monitoria é SEMESTRAL: quando houver dois editais no mesmo ano, o do 2º
 * semestre toma o número seguinte livre da PROPPEX naquele ano.
 */
export const EDITAIS_MONITORIA = [
  {
    numero: "03/2026", serie: "03/2026", ano: 2026, ciclo: "2026/2",
    titulo: "Programa de Monitoria Acadêmica 2026/2",
    orgao: "Pró-Reitoria Acadêmica (PROAC) e Pró-Reitoria de Pós-Graduação, Pesquisa, "
      + "Extensão e Ação Comunitária (PROPPEX)",
    instituicao: "Centro Universitário de Goianésia (UNIEGO)",
    documento: null,                 // gerado pelo próprio ARCHÉ (ver TEXTO_EDITAL)
    publicadoEm: "2026-08-19",
    encerrado: false,
    observacao: "",
  },
  {
    numero: "02/2025", serie: "03/2025-2", ano: 2025, ciclo: "2025/2",
    titulo: "Programa de Monitoria Acadêmica 2025/2",
    orgao: "Diretoria Acadêmica (DIAC)",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-02-2025.pdf",
    publicadoEm: "2025-08-18",
    encerrado: true,
    observacao: "Publicado em 18/08/2025, antes da transformação em UNIEGO. "
      + "A partir de 2026 o programa passa à PROPPEX.",
  },
  {
    numero: "01/2025", serie: "03/2025", ano: 2025, ciclo: "2025/1",
    titulo: "Programa de Monitoria Acadêmica 2025/1",
    orgao: "Diretoria Acadêmica (DIAC)",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-01-2025.pdf",
    publicadoEm: "2025-02-10",
    encerrado: true,
    observacao: "Publicado em 10/02/2025, antes da transformação em UNIEGO. "
      + "A partir de 2026 o programa passa à PROPPEX.",
  },
  /* ------------------------------------------------------------------
     O ARQUIVO — os editais que o programa teve antes de chegar ao ARCHÉ.

     Entram como foram PUBLICADOS: com o número, o órgão e o nome da
     instituição da época (mesma regra das atas — documento não se
     reescreve). Foi por eles que se enxerga a história do programa: em
     2020 e 2021 ele correu em plena pandemia, com ensino remoto e depois
     híbrido, e o edital dizia isso na primeira página; a numeração é a
     da sequência geral de editais da instituição, não uma série própria
     da monitoria — daí 002/2020, 002/2021, 003/2021, 001/2022.
     ------------------------------------------------------------------ */
  {
    numero: "01/2026", serie: "01/2026", ano: 2026, ciclo: "2026/1",
    titulo: "Programa de Monitoria Acadêmica 2026/1",
    orgao: "Reitoria e Pró-Reitoria Acadêmica (ProAc)",
    instituicao: "Centro Universitário Evangélico de Goianésia (UNIEGO)",
    documento: "/ic/docs/edital-monitoria-01-2026.pdf",
    publicadoEm: "2026-02-18",
    encerrado: true,
    observacao: "Último ciclo conduzido pela Pró-Reitoria Acadêmica. O número 01/2026 é o "
      + "da sequência da PROAC e não se confunde com o Edital 01/2026 da Iniciação "
      + "Científica; no segundo semestre o programa passa à PROPPEX, na série 03/AAAA.",
  },
  {
    numero: "001/2022", serie: "001/2022", ano: 2022, ciclo: "2022/1",
    titulo: "Programa de Monitoria Acadêmica 2022/1",
    orgao: "Diretoria Geral",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-01-2022.pdf",
    publicadoEm: "2022-02-16",
    encerrado: true,
    observacao: "Primeiro edital de volta ao formato integralmente presencial, "
      + "depois dos ciclos remoto e híbrido da pandemia.",
  },
  {
    numero: "003/2021", serie: "003/2021", ano: 2021, ciclo: "2021/2",
    titulo: "Programa de Monitoria Acadêmica 2021/2",
    orgao: "Diretoria Geral",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-03-2021.pdf",
    publicadoEm: "",
    encerrado: true,
    observacao: "Ciclo em ensino híbrido — presencial e virtual —, com as aulas "
      + "presenciais em caráter facultativo. O documento não traz a data de publicação.",
  },
  {
    numero: "002/2021", serie: "002/2021", ano: 2021, ciclo: "2021/1",
    titulo: "Programa de Monitoria Acadêmica 2021/1",
    orgao: "Diretoria Geral",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-02-2021.pdf",
    publicadoEm: "",
    encerrado: true,
    observacao: "Ciclo do retorno gradual: a FACEG implantou o ensino híbrido neste "
      + "semestre. O documento não traz a data de publicação.",
  },
  {
    numero: "002/2020", serie: "002/2020", ano: 2020, ciclo: "2020/2",
    titulo: "Programa de Monitoria Acadêmica 2020/2",
    orgao: "Coordenação de Ensino Aprendizagem",
    instituicao: "Faculdade Evangélica de Goianésia (FACEG)",
    documento: "/ic/docs/edital-monitoria-02-2020.pdf",
    publicadoEm: "2020-08-17",
    encerrado: true,
    observacao: "Ciclo integralmente remoto: com as atividades presenciais suspensas pela "
      + "pandemia de COVID-19, a monitoria correu por recursos educacionais digitais e TICs, "
      + "nos termos das Portarias MEC nº 343, 345 e 544 de 2020.",
  },
];

export const editalMonitoriaDe = (numero) => EDITAIS_MONITORIA.find(
  (e) => e.numero === txt(numero) || e.serie === txt(numero)) || null;

/* ------------------------- o ciclo corrente ---------------------------
   O CICLO VIRA COM O CALENDÁRIO (decisão do dono, ago/2026): em 01/01 passa
   a ser AAAA/1, em 01/07 a AAAA/2, sem ninguém pedir. A monitoria é
   semestral, e o ciclo dela é o semestre civil — a mesma régua do Relatório
   Semestral e das Atas, agora numa conta só (lib/datas.js).

   Antes, o "vigente" era o primeiro edital não encerrado do catálogo. Em
   01/01/2027, com o 03/2026 ainda aberto, todo projeto novo nasceria no
   ciclo 2026/2 — o semestre anterior — e ninguém perceberia, porque o
   sistema não tinha como saber que o ano tinha virado.

   O que o calendário NÃO pode decidir é o edital: ele é um ato
   institucional, com número, cronograma e prazos próprios. Semestre novo
   não publica edital. Por isso:
     · há edital para o ciclo corrente  → é ele, com as datas dele;
     · não há                            → o módulo segue funcionando com o
       último aberto, e a gestão é AVISADA de que o calendário passou o
       edital publicado (`cicloSemEdital`). Submeter, aí, é recusado: não se
       submete projeto a um edital que não existe.
   --------------------------------------------------------------------- */

/** O ciclo corrente — o semestre civil de hoje. */
export const cicloCorrente = (hoje = hojeLocalISO()) => semestreDe(hoje);

/** O edital do ciclo corrente, se já foi publicado. */
export const editalDoCiclo = (ciclo) =>
  EDITAIS_MONITORIA.find((e) => e.ciclo === txt(ciclo)) || null;

/**
 * O edital em vigor — o que o formulário usa como padrão. Preferência ao do
 * ciclo corrente; sem ele, o último aberto, para o módulo não parar.
 */
export function editalVigente(hoje = hojeLocalISO()) {
  return editalDoCiclo(cicloCorrente(hoje))
    || EDITAIS_MONITORIA.find((e) => !e.encerrado)
    || EDITAIS_MONITORIA[0];
}

/**
 * O calendário passou o edital publicado? Devolve o ciclo que ficou sem
 * edital (ou "" quando está tudo em dia) — é o que vira alerta da gestão.
 */
export function cicloSemEdital(hoje = hojeLocalISO()) {
  const ciclo = cicloCorrente(hoje);
  return editalDoCiclo(ciclo) ? "" : ciclo;
}

/** O que a vitrine pública mostra — documento e identificação, nada além. */
export const editaisMonitoriaParaLista = ({ publicados = {}, ciclosDoArquivo = [] } = {}) =>
  EDITAIS_MONITORIA
  .map((e) => ({
    numero: e.numero, serie: e.serie, ano: e.ano, ciclo: e.ciclo, titulo: e.titulo,
    orgao: e.orgao, instituicao: e.instituicao,
    documento: e.documento || (e.encerrado ? null : "/api/publico/monitoria/edital.pdf"),
    vigente: !e.encerrado, observacao: e.observacao || "",
    /* O resultado do ciclo (pedido do dono, ago/2026). Ciclo coberto pelo
       ARQUIVO é público na hora — é semestre encerrado, transcrito do que a
       coordenação do curso já certificou; os que correm no ARCHÉ esperam o
       ato da gestão, como na IC. */
    resultadoPublicado: ciclosDoArquivo.includes(e.ciclo) || !!publicados[e.numero],
  }))
  // do mais recente para o mais antigo pelo CICLO, não pelo número: a
  // numeração é a da sequência geral da instituição e mudou de série ao
  // longo dos anos (002/2020, 001/2022, 01/2026, 03/2026) — ordenar por ela
  // jogaria o 01/2026 para o fim do arquivo. O ciclo é o que tem ordem.
  .sort((a, b) => String(b.ciclo).localeCompare(String(a.ciclo), "pt-BR")
    || String(b.serie).localeCompare(String(a.serie), "pt-BR"));

/* ======================================================================
   2. O EDITAL VIGENTE — as datas e o texto

   O cronograma vive aqui porque o SISTEMA precisa dele: é ele que abre e
   fecha a submissão, que diz quando o relatório é esperado e que carimba o
   atraso. O texto vive aqui pelo mesmo motivo dos termos de compromisso
   (lib/termos.js): mudar a redação é mexer num arquivo, não redesenhar o
   gerador de PDF.
   ====================================================================== */

export const CRONOGRAMA = [
  { etapa: "Submissão dos Projetos de Monitoria", responsavel: "Professor Orientador", ate: "2026-09-04" },
  { etapa: "Cadastro do monitor indicado (ficha de inscrição)", responsavel: "Acadêmico(a) indicado(a)", ate: "2026-09-08" },
  { etapa: "Análise dos projetos", responsavel: "PROPPEX, ouvida a Coordenação do Curso", ate: "2026-09-09" },
  { etapa: "Publicação dos resultados", responsavel: "PROPPEX", ate: "2026-09-10" },
  { etapa: "Vigência das atividades de monitoria", responsavel: "Monitor e Professor Orientador", ate: "2026-12-12" },
  { etapa: "Entrega do Relatório Final", responsavel: "Monitor Acadêmico", ate: "2026-12-14" },
  { etapa: "Avaliação do monitor e validação do relatório", responsavel: "Professor Orientador", ate: "2026-12-18" },
  { etapa: "Homologação e emissão dos certificados", responsavel: "PROPPEX", ate: "2026-12-22" },
];

/** Vigência padrão do ciclo — entra como sugestão no formulário do projeto.
    Começa depois da publicação do resultado: monitoria antes da homologação
    é trabalho que ninguém autorizou. */
export const VIGENCIA = { inicio: "2026-09-14", fim: "2026-12-12" };

/** Prazos que o sistema cobra. Fora deles não se trava nada em silêncio: a
    submissão fecha (com aviso), e a entrega atrasada continua aceita e
    marcada — fechar de vez impediria a regularização, como na IC. */
export const PRAZOS = {
  submissao: "2026-09-04",
  cadastroMonitor: "2026-09-08",
  analise: "2026-09-09",
  resultado: "2026-09-10",
  relatorio: "2026-12-14",
  validacao: "2026-12-18",
};

/**
 * A cobrança do relatório começa **30 dias antes do prazo** e se repete a
 * cada 7 dias até o envio (decisão do dono, ago/2026). O motivo é prosaico:
 * o monitor descobre o relatório no dia 13 de dezembro, e um relatório
 * escrito de véspera não é registro de nada. Trinta dias antes ele ainda
 * lembra do que fez em setembro.
 *
 * A régua vale para o monitor; a orientação entra na cobrança quando o
 * relatório chega e fica esperando validação — aí a pendência é dela.
 */
export const COBRANCA = { diasAntes: 30, intervaloDias: 7 };

/** A cobrança do relatório já começou? (data de corte = prazo − 30 dias) */
export const cobrancaAberta = (hoje = hojeLocalISO(), prazo = PRAZOS.relatorio) =>
  diaSerial(hoje) >= diaSerial(somaDias(prazo, -COBRANCA.diasAntes));

/** Quantos dias faltam para o prazo do relatório (negativo = atrasado). */
export const diasParaRelatorio = (hoje = hojeLocalISO(), prazo = PRAZOS.relatorio) =>
  diaSerial(prazo) - diaSerial(hoje);

export const CH_SEMANAL = { min: 2, max: 20, padrao: 4 };

/**
 * Onde o processo acontece, com o endereço escrito. Um edital que manda
 * "submeter no sistema" sem dizer onde obriga quem lê a procurar — e quem
 * procura desiste ou liga para a coordenação.
 */
export const ACESSOS = [
  { quem: "Professores orientadores", url: "https://arche.app.br/monitoria",
    oque: "submissão do Projeto de Monitoria, indicação do monitor, avaliação e validação do relatório." },
  { quem: "Acadêmicos indicados", url: "https://arche.app.br/monitoria",
    oque: "ficha de inscrição, anexo dos documentos e entrega do relatório de atividades. "
      + "O acesso é liberado pelo convite que chega no e-mail informado pelo professor." },
  { quem: "Primeiro acesso ao portal", url: "https://arche.app.br/entrar",
    oque: "criação da conta com o e-mail institucional ou pessoal. Quem já tem conta no ARCHÉ usa a mesma." },
  { quem: "Editais e resultados (acesso público)", url: "https://arche.app.br/ic",
    oque: "este edital e os das edições anteriores, sem necessidade de login." },
];

/**
 * O texto do edital, seção a seção. É o edital 02/2025 da DIAC atualizado
 * para a PROPPEX: os objetivos, os requisitos do candidato e a certificação
 * são os mesmos (o programa não mudou); o que mudou foi o órgão que conduz,
 * a instituição e o fato de o processo inteiro correr pelo ARCHÉ.
 */
export const TEXTO_EDITAL = {
  abertura:
    "A Pró-Reitoria Acadêmica (PROAC), a Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação "
    + "Comunitária (PROPPEX) e a Reitoria do Centro Universitário de Goianésia (UNIEGO), no "
    + "exercício de suas atribuições, tornam de conhecimento público o Edital nº 03/2026, datado "
    + "de 19 de agosto de 2026, o qual define as diretrizes gerais para a condução do Processo "
    + "Seletivo destinado aos acadêmicos interessados em participar do Programa de Monitoria "
    + "Acadêmica durante o segundo período letivo de 2026.\n\n"
    + "O Programa de Monitoria Acadêmica é uma ação de ENSINO, concebida e orientada pela "
    + "**Pró-Reitoria Acadêmica (PROAC)**, a quem cabem as diretrizes pedagógicas do Programa e a "
    + "sua articulação com os Projetos Pedagógicos dos Cursos. A **PROPPEX** responde pela "
    + "OPERAÇÃO do processo — inscrição, acompanhamento, homologação dos relatórios e emissão dos "
    + "certificados —, conduzida integralmente no portal ARCHÉ (arche.app.br).\n\n"
    + "O plano de Monitoria delineado por este edital seguirá os mesmos critérios preconizados "
    + "pelas regulamentações em vigor. Até 2025 o Programa era conduzido pela Diretoria Acadêmica; "
    + "a partir de 2026, por decisão da Reitoria, a sua operação passa à PROPPEX.",
  secoes: [
    {
      titulo: "1. DAS DISPOSIÇÕES PRELIMINARES",
      itens: [
        { n: "1.1.", texto: "O processo seletivo destinar-se-á:", alineas: [
          "Seleção de Projetos de Monitoria Acadêmica propostos por docentes dos cursos de Graduação do Centro Universitário de Goianésia;",
          "Seleção de discentes dos cursos de graduação para o desenvolvimento de atividades de monitoria acadêmica, descritas nos projetos de ensino para o período letivo de 2026/2;",
          "Os monitores serão selecionados de acordo com o plano de trabalho de cada projeto de ensino;",
          "As atividades de Monitoria Acadêmica serão realizadas em formato presencial.",
        ] },
        { n: "1.2.", texto: "Os objetivos do Programa de Monitoria Acadêmica, as atribuições e responsabilidades "
          + "das Coordenações dos Cursos, dos Professores-Orientadores, bem como dos Monitores Acadêmicos estão "
          + "estabelecidas no Regimento do Programa de Monitoria Acadêmica. As atividades de monitoria objetivam "
          + "um processo construtivo desenvolvido de forma conjunta por docentes e monitores, os quais têm como "
          + "finalidade:", romanos: [
          "Estender a participação dos acadêmicos de graduação nas atividades de ensino e aprendizagem;",
          "Proporcionar aos/às acadêmicos(as) da graduação a experiência relacionada à docência;",
          "Expandir os conhecimentos relacionados ao componente curricular;",
          "Possibilitar formas de acompanhamento aos/às discentes que apresentem dificuldades nos processos de aprendizagem;",
          "Proporcionar assistência e orientação suplementar a alunos inscritos em cursos ou disciplinas específicas, com foco em aprimorar a compreensão dos conteúdos abordados e fortalecer as habilidades acadêmicas dos estudantes;",
          "Colaborar com os colegas que buscam apoio adicional, através de esclarecimentos sobre conceitos e resolução de dúvidas;",
          "Compartilhamento de métodos de estudo eficazes;",
          "Incentivar a interação entre os estudantes e promover uma abordagem participativa no processo de aprendizado;",
          "Estabelecer um ambiente de apoio e incentivo que contribua para elevar o desempenho dos alunos e cultivar um ambiente de aprendizado colaborativo e enriquecedor.",
        ] },
        { n: "1.3.", texto: "Conforme o Regimento do Programa de Monitoria Acadêmica, a carga horária de atuação "
          + "como Monitor Acadêmico pode ser aproveitada como Atividade Complementar do curso de Graduação." },
        { n: "1.4.", texto: "A atuação do discente enquanto Monitor Acadêmico não incidirá em vínculo empregatício "
          + "ou encargos trabalhistas, e não implica pagamento de bolsa." },
      ],
    },
    {
      titulo: "2. DA ELABORAÇÃO E PROPOSTA DE PROJETOS DE MONITORIA ACADÊMICA",
      itens: [
        { n: "2.1.", texto: "Cabe aos professores a elaboração dos Projetos de Monitoria Acadêmica circunscritos "
          + "ao âmbito de disciplinas específicas que estejam sob sua responsabilidade." },
        { n: "2.2.", texto: "Os Projetos de Monitoria Acadêmica deverão ser submetidos pelos professores no ARCHÉ "
          + "(arche.app.br/monitoria), que os encaminha à PROPPEX para análise e homologação, ouvida a Coordenação "
          + "do Curso a que a disciplina pertence." },
        { n: "2.3.", texto: "Ao submeter o Projeto de Monitoria Acadêmica, o professor orientador deverá indicar "
          + "o(s) discente(s) candidato(s) à função de Monitor(es) Acadêmico(s), informando nome e e-mail. O sistema "
          + "envia ao indicado o convite para preencher a própria ficha de inscrição." },
        { n: "2.4.", texto: "O número de monitores é definido pelo próprio Professor Orientador, conforme as "
          + "necessidades da disciplina, e o Projeto poderá ter quantos monitores o professor indicar — desde que "
          + "seja apresentado o Plano de Trabalho ESPECÍFICO para cada um deles." },
        { n: "2.5.", texto: "O Plano de Trabalho descreve as atividades sob responsabilidade do monitor, os dias e "
          + "horários de atuação, o local, as competências que se espera desenvolver e a forma de acompanhamento "
          + "pelo professor. É contra ele que a atuação do monitor é avaliada ao fim do período letivo." },
      ],
    },
    {
      titulo: "3. DOS REQUISITOS PARA O CANDIDATO À MONITORIA ACADÊMICA",
      itens: [
        { n: "3.1.", texto: "Para atuar como Monitor Acadêmico, o(a) discente deverá atender aos seguintes pré-requisitos:", alineas: [
          "Ser aluno regularmente matriculado em curso de Graduação do Centro Universitário de Goianésia;",
          "Ter sido aprovado na disciplina da vaga pretendida ou comprovar conhecimento da disciplina, constatado por meio de avaliação escrita e/ou entrevista;",
          "Ter disponibilidade de agenda semanal compatível com a carga horária prevista no Projeto de Monitoria Acadêmica da disciplina a que se candidata;",
          "Não ter sido reprovado em atividades relacionadas à Monitoria Acadêmica.",
        ] },
        { n: "3.2.", texto: "A inscrição do candidato(a) é feita por ele mesmo no ARCHÉ, em formulário próprio, "
          + "e nele serão informados e anexados:", alineas: [
          "Nome completo, número de matrícula, CPF, curso, período e telefone de contato;",
          "Histórico Escolar da graduação em andamento, anexado em PDF ou imagem — documento que comprova, ao mesmo tempo, a regularidade da matrícula e o aproveitamento na disciplina pretendida;",
          "Declaração de disponibilidade para cumprir as horas semanais relativas às atividades de Monitoria Acadêmica da disciplina pretendida, firmada eletronicamente no próprio sistema, com data e hora de registro.",
        ] },
        { n: "3.3.", texto: "Não há entrega de documentos em papel: o histórico é anexado pelo próprio "
          + "candidato no ARCHÉ e fica vinculado ao projeto, à disposição da Coordenação do Curso e da "
          + "PROPPEX. O sistema emite, quando necessário, a Ficha de Inscrição em PDF com os dados "
          + "informados, o anexo relacionado e a declaração firmada." },
        { n: "3.4.", texto: "O(A) acadêmico(a) interessado(a) deverá procurar o professor da disciplina que possuir "
          + "interesse em atuar como Monitor(a), com vistas à elaboração do Projeto de Monitoria Acadêmica." },
      ],
    },
    {
      titulo: "4. DA SELEÇÃO DOS MONITORES",
      itens: [
        { n: "4.1.", texto: "A escolha dos monitores é do Professor Orientador, que avalia a disponibilidade de "
          + "tempo e a competência teórica e técnica dos interessados para a realização das atividades propostas — "
          + "por entrevista presencial, avaliação escrita ou ambas, conforme julgar adequado." },
        { n: "4.2.", texto: "Não há limite de vagas por projeto: o professor indica no ARCHÉ tantos monitores "
          + "quantos a disciplina comportar, e cada indicação leva o seu próprio Plano de Trabalho e gera, ao fim "
          + "do período, um Relatório de Atividades individual." },
      ],
    },
    {
      titulo: "5. DO ACOMPANHAMENTO E DO RELATÓRIO",
      itens: [
        { n: "5.1.", texto: "Ao final do período letivo, o Monitor Acadêmico preenche no ARCHÉ o Relatório de "
          + "Atividades de Monitoria, descrevendo as atividades desenvolvidas. O prazo de entrega é 14 de "
          + "dezembro de 2026." },
        { n: "5.1.1.", texto: "A partir de 30 (trinta) dias antes do prazo, o ARCHÉ envia ao Monitor lembrete "
          + "semanal de preenchimento, até que o relatório seja entregue." },
        { n: "5.2.", texto: "O Professor Orientador recebe o relatório, avalia a atuação do monitor quanto à "
          + "assiduidade, ao cumprimento da carga horária, ao envolvimento e à iniciativa, emite parecer final e "
          + "valida a entrega, que segue à PROPPEX." },
        { n: "5.3.", texto: "O relatório não validado pelo Professor Orientador retorna ao monitor para correção, "
          + "com o motivo registrado." },
      ],
    },
    {
      titulo: "6. DA CERTIFICAÇÃO",
      itens: [
        { n: "6.1.", texto: "A certificação do projeto de monitoria acadêmica será concedida ao docente após a "
          + "conclusão do Relatório Final." },
        { n: "6.2.", texto: "Após a homologação do Relatório Final pela PROPPEX, o(a) discente receberá o "
          + "certificado de conclusão de monitoria acadêmica, com a carga horária cumprida." },
        { n: "6.3.", texto: "Os certificados são emitidos automaticamente pelo ARCHÉ e ficam disponíveis para "
          + "download na conta de cada participante, com código de validação." },
      ],
    },
  ],
};

/* ======================================================================
   3. SITUAÇÕES DO PROJETO
   ====================================================================== */

export const STATUS = [
  "rascunho", "aguardando-aluno", "submetido", "devolvido",
  "aprovado", "reprovado", "concluido", "cancelado",
];

export const ROTULO_STATUS = {
  rascunho: "Rascunho",
  "aguardando-aluno": "Aguardando o monitor",
  submetido: "Em análise na PROPPEX",
  devolvido: "Devolvido para ajuste",
  aprovado: "Aprovado — em execução",
  reprovado: "Não aprovado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Editável pelo orientador — depois de submetido, a proposta fecha (como na IC). */
export const editavelPeloOrientador = (p) =>
  p?.status === "rascunho" || p?.status === "devolvido";

/* ======================================================================
   3.1. PLANO DE TRABALHO — um por monitor

   O item 2.4 do edital exige plano de trabalho ESPECÍFICO para cada
   monitor, e há um bom motivo para ele ser detalhado: é o plano que diz ao
   aluno o que se espera dele, e é contra ele que a atuação é avaliada no
   fim do semestre (Anexo III). "Auxiliar o professor" não se avalia.

   Por isso são campos, e não um texto solto: cada um responde a uma
   pergunta que o monitor faz na primeira semana — o que eu faço, quando,
   onde, o que vou aprender e com que frequência falo com o professor.
   Preservar os `codigo`: são a chave do que já está gravado.
   ====================================================================== */
export const CAMPOS_PLANO = [
  { codigo: "atividades", rotulo: "Atividades sob responsabilidade do monitor",
    dica: "O que ele fará, concretamente: apoio às aulas práticas, plantão de dúvidas, "
      + "preparo de material, acompanhamento de estudo dirigido…",
    min: 80, obrigatorio: true, linhas: 5 },
  { codigo: "horarios", rotulo: "Dias e horários de atuação",
    dica: "Ex.: terças e quintas, 14h às 16h. É o que permite ao aluno conciliar com as aulas dele.",
    min: 8, obrigatorio: true, linhas: 2 },
  { codigo: "local", rotulo: "Local de atuação",
    dica: "Laboratório, clínica-escola, sala de aula, biblioteca…",
    min: 0, obrigatorio: false, linhas: 1 },
  { codigo: "competencias", rotulo: "Competências que se espera desenvolver",
    dica: "O que o monitor leva desta experiência — é o que liga a monitoria à formação docente.",
    min: 40, obrigatorio: true, linhas: 3 },
  { codigo: "acompanhamento", rotulo: "Como o professor acompanhará o monitor",
    dica: "Ex.: reunião semanal de 30 minutos, registro das atividades em planilha compartilhada.",
    min: 30, obrigatorio: true, linhas: 3 },
  { codigo: "avaliacao", rotulo: "Como o desempenho será avaliado",
    dica: "Opcional — os quatro critérios do edital valem de todo modo. Serve para o que for específico deste plano.",
    min: 0, obrigatorio: false, linhas: 2 },
];

/* ======================================================================
   4. AVALIAÇÃO DA ATUAÇÃO DO MONITOR (Anexo III, transcrito)

   As quatro perguntas são as do formulário que a instituição já usava, com
   as mesmas três respostas. Preservar os `codigo`: é o que está gravado.
   ====================================================================== */

export const CRITERIOS_MONITOR = [
  { codigo: "assiduidade", pergunta: "O Monitor foi assíduo em suas atividades previstas no plano de trabalho?" },
  { codigo: "cumprimento", pergunta: "O Monitor cumpriu suas tarefas e a carga horária estipulada no Projeto?" },
  { codigo: "envolvimento", pergunta: "O Monitor demonstrou envolvimento com o projeto durante o seu desenvolvimento?" },
  { codigo: "iniciativa", pergunta: "O Monitor foi criativo e teve iniciativa própria no desenvolvimento de suas atividades?" },
];

export const RESPOSTAS_CRITERIO = [
  { codigo: "sim", rotulo: "Sim" },
  { codigo: "parcialmente", rotulo: "Parcialmente" },
  { codigo: "nao", rotulo: "Não" },
];

export const PARECERES = [
  { codigo: "aprovado", rotulo: "Aprovado" },
  { codigo: "reprovado", rotulo: "Reprovado" },
];

/* ======================================================================
   5. NORMALIZAÇÃO

   Tudo que chega do cliente passa por aqui. O que não está no molde não
   entra: campo desconhecido some, e o que é da gestão (protocolo, status,
   homologação) nunca vem do formulário.
   ====================================================================== */

function normalizarDocumento(d) {
  if (!d || typeof d !== "object") return null;
  const url = txt(d.url || d.link);
  if (!url) return null;
  return {
    url, id: txt(d.id), nome: txt(d.nome).slice(0, 200),
    tipo: txt(d.tipo).slice(0, 120), tamanho: num(d.tamanho),
    enviadoEm: txt(d.enviadoEm) || new Date().toISOString(),
  };
}

function normalizarAvaliacao(a) {
  if (!a || typeof a !== "object") return null;
  const criterios = {};
  for (const c of CRITERIOS_MONITOR) {
    const v = txt(a.criterios?.[c.codigo]);
    if (RESPOSTAS_CRITERIO.some((r) => r.codigo === v)) criterios[c.codigo] = v;
  }
  const parecer = PARECERES.some((p) => p.codigo === txt(a.parecer)) ? txt(a.parecer) : "";
  return {
    criterios, parecer,
    observacao: txt(a.observacao).slice(0, 4000),
    em: txt(a.em), por: email(a.por),
  };
}

export function normalizarRelatorio(r) {
  if (!r || typeof r !== "object") return null;
  const status = ["rascunho", "enviado", "devolvido", "validado", "homologado"]
    .includes(txt(r.status)) ? txt(r.status) : "rascunho";
  return {
    atividades: txt(r.atividades).slice(0, 20000),
    dificuldades: txt(r.dificuldades).slice(0, 8000),
    aprendizado: txt(r.aprendizado).slice(0, 8000),
    horas: num(r.horas),
    anexos: (Array.isArray(r.anexos) ? r.anexos : []).map(normalizarDocumento).filter(Boolean).slice(0, 10),
    status,
    enviadoEm: txt(r.enviadoEm),
    avaliacao: normalizarAvaliacao(r.avaliacao),
    validadoEm: txt(r.validadoEm), validadoPor: email(r.validadoPor),
    devolvidoEm: txt(r.devolvidoEm), comentario: txt(r.comentario).slice(0, 4000),
    homologadoEm: txt(r.homologadoEm), homologadoPor: email(r.homologadoPor),
  };
}

/** O plano em campos. Texto solto de antes vira a primeira seção — nada do
    que alguém escreveu se perde numa mudança de formato. */
export function normalizarPlano(p, textoAntigo = "") {
  const o = p && typeof p === "object" ? p : {};
  const saida = {};
  for (const c of CAMPOS_PLANO) saida[c.codigo] = txt(o[c.codigo]).slice(0, 6000);
  if (!saida.atividades && txt(textoAntigo)) saida.atividades = txt(textoAntigo).slice(0, 6000);
  return saida;
}

/** Falta no plano de trabalho de UM monitor. */
export function faltaNoPlano(m) {
  const p = m?.plano || {};
  return CAMPOS_PLANO
    .filter((c) => c.obrigatorio && txt(p[c.codigo]).length < c.min)
    .map((c) => c.rotulo.toLowerCase());
}

export function normalizarMonitor(m, anterior = null) {
  const base = anterior || {};
  const o = m && typeof m === "object" ? m : {};
  return {
    id: txt(o.id || base.id) || `m${Math.random().toString(36).slice(2, 9)}`,
    nome: txt(o.nome).slice(0, 160) || txt(base.nome),
    email: email(o.email) || email(base.email),
    matricula: txt(o.matricula ?? base.matricula).slice(0, 40),
    cpf: soDigitos(o.cpf ?? base.cpf).slice(0, 11),
    telefone: txt(o.telefone ?? base.telefone).slice(0, 40),
    curso: txt(o.curso ?? base.curso),
    periodo: txt(o.periodo ?? base.periodo).slice(0, 20),
    chSemanal: num(o.chSemanal ?? base.chSemanal),
    plano: normalizarPlano(o.plano ?? base.plano, o.planoTrabalho ?? base.planoTrabalho),
    declaracao: o.declaracao || base.declaracao
      ? {
        aceita: !!(o.declaracao?.aceita ?? base.declaracao?.aceita),
        em: txt(o.declaracao?.em ?? base.declaracao?.em),
      }
      : null,
    // Um anexo só: o HISTÓRICO ESCOLAR (decisão do dono, ago/2026). Ele já
    // comprova a matrícula — pedir os dois seria pedir duas vezes a mesma
    // coisa, e o histórico ainda mostra o aproveitamento na disciplina, que
    // é o que o item 3.1 b) do edital manda o professor conferir.
    documentos: {
      historico: normalizarDocumento(o.documentos?.historico ?? base.documentos?.historico),
    },
    convidadoEm: txt(o.convidadoEm ?? base.convidadoEm),
    cadastradoEm: txt(o.cadastradoEm ?? base.cadastradoEm),
    relatorio: normalizarRelatorio(o.relatorio ?? base.relatorio),
  };
}

export function normalizarProjeto(p = {}, { anterior = null } = {}) {
  const base = anterior || {};
  const antesPorId = new Map((base.monitores || []).map((m) => [m.id, m]));
  // sem limite de vagas (decisão do dono, ago/2026): quem define quantos
  // monitores a disciplina comporta é o professor. O teto de 30 é freio de
  // dedo torto — não é regra do edital.
  const monitores = (Array.isArray(p.monitores) ? p.monitores : base.monitores || [])
    .slice(0, 30)
    .map((m) => normalizarMonitor(m, antesPorId.get(txt(m?.id)) || null));

  return {
    id: txt(p.id || base.id),
    protocolo: txt(base.protocolo),          // quem emite é o servidor
    // projeto novo nasce no ciclo CORRENTE (o semestre civil de hoje), não
    // no do último edital publicado — é o que faz a virada de 01/01 e 01/07
    // acontecer sozinha nos formulários e nos pedidos
    // O edital é o do CICLO CORRENTE — e fica em branco se o ciclo virou e
    // o edital novo ainda não saiu. Carimbar o do semestre passado deixaria
    // o rascunho afirmando um edital que não é o dele; a submissão (que está
    // travada até o edital sair) preenche o campo com o número certo.
    edital: txt(p.edital || base.edital) || (editalDoCiclo(cicloCorrente())?.numero || ""),
    ciclo: txt(p.ciclo || base.ciclo) || cicloCorrente(),
    status: STATUS.includes(txt(base.status)) ? txt(base.status) : "rascunho",

    curso: txt(p.curso ?? base.curso),
    disciplina: txt(p.disciplina ?? base.disciplina).slice(0, 200),
    ementa: txt(p.ementa ?? base.ementa).slice(0, 4000),
    periodoMatriz: txt(p.periodoMatriz ?? base.periodoMatriz).slice(0, 20),

    orientador: {
      nome: txt(p.orientador?.nome ?? base.orientador?.nome).slice(0, 160),
      email: email(p.orientador?.email ?? base.orientador?.email),
      cpf: soDigitos(p.orientador?.cpf ?? base.orientador?.cpf).slice(0, 11),
      titulacao: txt(p.orientador?.titulacao ?? base.orientador?.titulacao).slice(0, 60),
      telefone: txt(p.orientador?.telefone ?? base.orientador?.telefone).slice(0, 40),
    },

    chSemanal: num(p.chSemanal ?? base.chSemanal) || CH_SEMANAL.padrao,
    inicio: dataISO(p.inicio ?? base.inicio) || VIGENCIA.inicio,
    fim: dataISO(p.fim ?? base.fim) || VIGENCIA.fim,
    atividades: txt(p.atividades ?? base.atividades).slice(0, 20000),

    monitores,

    // campos de gestão — nunca vêm do formulário
    apreciacao: base.apreciacao || null,
    historico: Array.isArray(base.historico) ? base.historico : [],
    criadoPor: email(base.criadoPor),
    criadoEm: txt(base.criadoEm),
    atualizadoEm: new Date().toISOString(),
    concluidoEm: txt(base.concluidoEm),
  };
};

/* ======================================================================
   6. RÉGUAS — o que falta para dar o passo seguinte

   Uma régua por passo, e a MESMA usada na tela e no servidor: duas contas
   diferentes de "está completo" fazem o usuário salvar, voltar à etapa e
   não sair do lugar.
   ====================================================================== */

/** Falta no PROJETO para o professor submeter. */
export function faltaNoProjeto(p) {
  const f = [];
  if (!txt(p?.curso)) f.push("curso");
  if (!txt(p?.disciplina)) f.push("disciplina");
  if (!txt(p?.orientador?.nome)) f.push("nome do professor orientador");
  if (!email(p?.orientador?.email)) f.push("e-mail do professor orientador");
  const ch = num(p?.chSemanal);
  if (ch < CH_SEMANAL.min || ch > CH_SEMANAL.max)
    f.push(`carga horária semanal entre ${CH_SEMANAL.min}h e ${CH_SEMANAL.max}h`);
  if (!dataISO(p?.inicio)) f.push("data de início");
  if (!dataISO(p?.fim)) f.push("data de conclusão");
  if (dataISO(p?.inicio) && dataISO(p?.fim) && diaSerial(p.fim) <= diaSerial(p.inicio))
    f.push("data de conclusão posterior à de início");
  if (txt(p?.atividades).length < 60) f.push("atividades a serem desenvolvidas pelo monitor");
  const mons = p?.monitores || [];
  if (!mons.length) f.push("pelo menos um monitor indicado");
  mons.forEach((m, i) => {
    const quem = txt(m.nome) || `monitor ${i + 1}`;
    if (!txt(m.nome)) f.push(`nome do monitor ${i + 1}`);
    // o e-mail é o convite: sem ele o indicado não sabe que foi indicado.
    // O CPF não o substitui — mas, quando informado, é ele que encontra a
    // conta que a pessoa já tem no portal (ver casarMonitorPorCpf no server).
    if (!email(m.email)) f.push(`e-mail de ${quem}`);
    if (txt(m.cpf) && !cpfValido(m.cpf)) f.push(`CPF de ${quem} (dígitos não conferem)`);
    // item 2.4 do edital: plano de trabalho ESPECÍFICO para cada monitor —
    // vale mesmo com um monitor só, porque é contra o plano que a atuação
    // dele é avaliada no fim do semestre
    const noPlano = faltaNoPlano(m);
    if (noPlano.length) f.push(`no plano de trabalho de ${quem}: ${noPlano.join(", ")}`);
  });
  return f;
}

/** Falta na FICHA do monitor (Anexo II) para o projeto ir à PROPPEX. */
export function faltaNoCadastroDoMonitor(m) {
  const f = [];
  if (!txt(m?.nome)) f.push("nome completo");
  if (!txt(m?.matricula)) f.push("número de matrícula");
  if (!cpfValido(m?.cpf)) f.push("CPF");
  if (!txt(m?.telefone)) f.push("telefone");
  if (!txt(m?.curso)) f.push("curso");
  if (!txt(m?.periodo)) f.push("período");
  if (!m?.declaracao?.aceita) f.push("declaração de disponibilidade de carga horária");
  if (!m?.documentos?.historico) f.push("histórico escolar");
  return f;
}

/** O que está estranho e não trava — amarelo na tela da PROPPEX, que decide
    caso a caso. */
export function pendenciasDoProjeto(p) {
  const av = [];
  for (const m of p?.monitores || []) {
    if (num(m.chSemanal) && num(p.chSemanal) && num(m.chSemanal) !== num(p.chSemanal))
      av.push(`${m.nome || "Monitor"}: carga horária declarada (${num(m.chSemanal)}h) diferente da do projeto (${num(p.chSemanal)}h)`);
  }
  return av;
}

/**
 * FOTOS como evidência (pedido do dono, ago/2026): o relatório diz o que o
 * monitor fez, e a foto mostra que aconteceu — é ela que a coordenação
 * arquiva e que o avaliador pede para ver. A mesma regra da Extensão
 * (lib/portfolio.js), com um número menor: a monitoria é rotina de
 * semestre, não evento, e três registros bastam para comprovar a atuação.
 *
 * Foto é o anexo com tipo de imagem; documento anexado continua valendo
 * como anexo e não conta para o mínimo.
 */
export const MIN_FOTOS_MONITORIA = 3;
const EXT_FOTO_MON = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

export function ehFotoMon(anexo) {
  if (!anexo) return false;
  const tipo = txt(anexo.tipo || anexo.mimetype);
  if (tipo) return tipo.startsWith("image/");
  return EXT_FOTO_MON.test(txt(anexo.nome || anexo.name));
}
export const fotosDoRelatorio = (r) => (r?.anexos || []).filter(ehFotoMon);
export const faltamFotosMon = (r, minimo = MIN_FOTOS_MONITORIA) =>
  Math.max(0, minimo - fotosDoRelatorio(r).length);

/** Falta no RELATÓRIO do monitor para ele enviar. */
export function faltaNoRelatorio(r, { minimoFotos = MIN_FOTOS_MONITORIA } = {}) {
  const f = [];
  if (txt(r?.atividades).length < 200)
    f.push("descrição das atividades desenvolvidas (ao menos 200 caracteres)");
  if (txt(r?.aprendizado).length < 60)
    f.push("o que a monitoria acrescentou à sua formação");
  const faltam = faltamFotosMon(r, minimoFotos);
  if (faltam) {
    const tem = fotosDoRelatorio(r).length;
    f.push(`${faltam === 1 ? "1 foto" : `${faltam} fotos`} de evidência das atividades `
      + `(há ${tem}; o mínimo é ${minimoFotos})`);
  }
  return f;
}

/** Falta na AVALIAÇÃO do orientador para ele validar o relatório. */
export function faltaNaAvaliacao(a) {
  const f = [];
  for (const c of CRITERIOS_MONITOR) {
    if (!RESPOSTAS_CRITERIO.some((r) => r.codigo === txt(a?.criterios?.[c.codigo])))
      f.push(c.pergunta);
  }
  if (!PARECERES.some((p) => p.codigo === txt(a?.parecer))) f.push("parecer final");
  return f;
}

/** O monitor está cadastrado (ficha completa)? */
export const monitorCadastrado = (m) => faltaNoCadastroDoMonitor(m).length === 0;

/** Todos os indicados já se cadastraram — é o que leva o projeto à PROPPEX. */
export const todosCadastrados = (p) =>
  !!(p?.monitores || []).length && (p.monitores || []).every(monitorCadastrado);

/* ======================================================================
   7. CARGA HORÁRIA

   O certificado precisa de um número, e o número não se digita: sai do que
   o projeto afirma — semanas de vigência × carga horária semanal. Semana
   iniciada conta, que é como a coordenação sempre fez a conta à mão.
   ====================================================================== */
export function semanasDe(inicio, fim) {
  const a = diaSerial(dataISO(inicio)), b = diaSerial(dataISO(fim));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.ceil((b - a + 1) / 7);
}

export function cargaHorariaTotal(p, m = null) {
  const ch = num(m?.chSemanal) || num(p?.chSemanal);
  return semanasDe(p?.inicio, p?.fim) * ch;
}

/* ======================================================================
   8. QUEM É QUEM

   Três acessos, e dois deles nascem do próprio projeto — não há cadastro de
   papel à parte:
     · gestao      — PROPPEX (gestor geral ou coordenação do módulo)
     · orientador  — quem submeteu o projeto
     · monitor     — o acadêmico indicado nele
   ====================================================================== */
export function papelNoProjeto(p, quem = {}) {
  if (!p) return null;
  if (quem.gestao) return "gestao";
  if (mesmoEmail(p.criadoPor, quem.email)
    || mesmoEmail(p.orientador?.email, quem.email)
    || mesmoCpf(p.orientador?.cpf, quem.cpf)) return "orientador";
  if ((p.monitores || []).some((m) => mesmoEmail(m.email, quem.email) || mesmoCpf(m.cpf, quem.cpf)))
    return "monitor";
  return null;
}

export const monitorDe = (p, quem = {}) => (p?.monitores || []).find(
  (m) => mesmoEmail(m.email, quem.email) || mesmoCpf(m.cpf, quem.cpf)) || null;

export const podeVer = (p, quem) => !!papelNoProjeto(p, quem);
export const podeEditar = (p, quem) => {
  const papel = papelNoProjeto(p, quem);
  if (papel === "gestao") return true;
  return papel === "orientador" && editavelPeloOrientador(p);
};
export const podeSubmeter = (p, quem) =>
  papelNoProjeto(p, quem) === "orientador" && editavelPeloOrientador(p);
export const podeDecidir = (p, quem) =>
  papelNoProjeto(p, quem) === "gestao" && ["submetido", "devolvido"].includes(p?.status);
export const podeValidarRelatorio = (p, quem) =>
  ["orientador", "gestao"].includes(papelNoProjeto(p, quem));
export const podeHomologar = (p, quem) => papelNoProjeto(p, quem) === "gestao";

/**
 * O que cada um enxerga. O monitor vê o projeto e o PRÓPRIO cadastro —
 * nunca o CPF, o telefone ou o relatório de um colega de projeto; o
 * orientador vê os seus monitores (ele os indicou e os avalia). A gestão vê
 * tudo, que é o contrato dela com o processo.
 */
export function visaoDoProjeto(p, quem = {}) {
  const papel = papelNoProjeto(p, quem);
  if (!papel) return null;
  const v = JSON.parse(JSON.stringify(p));
  v.papel = papel;
  if (papel === "monitor") {
    const eu = monitorDe(p, quem);
    // a tela precisa saber QUAL dos monitores é quem está olhando, e essa
    // resposta é do servidor: deduzi-la no cliente por "tem matrícula?" erra
    // no dia em que o colega também tiver
    v.monitores = (v.monitores || [])
      .map((m) => (m.id === eu?.id ? {
        // o próprio cadastro continua inteiro, MENOS a avaliação que ele
        // levou: quem julga a atuação é a orientação, e o julgado não a lê
        ...m, eu: true,
        relatorio: m.relatorio ? { ...m.relatorio, avaliacao: null } : null,
      } : {
        // o colega existe (o plano de trabalho é do projeto), mas sem dado pessoal
        id: m.id, nome: m.nome, planoTrabalho: m.planoTrabalho,
        relatorio: m.relatorio ? { status: m.relatorio.status } : null,
      }));
    // a avaliação que o orientador fez do colega não é assunto de ninguém mais
    v.historico = (v.historico || []).filter((h) => !h.sigilo);
  }
  return v;
}

/* ======================================================================
   9. PRAZOS E ATRASO
   ====================================================================== */

export const submissaoAberta = (hoje = hojeLocalISO()) =>
  diaSerial(hoje) <= diaSerial(PRAZOS.submissao);

/** Dias de atraso do relatório de um monitor (0 = em dia). */
export function atrasoRelatorio(p, m, hoje = hojeLocalISO()) {
  if (p?.status !== "aprovado") return 0;
  if (["validado", "homologado"].includes(m?.relatorio?.status)) return 0;
  const d = diaSerial(hoje) - diaSerial(PRAZOS.relatorio);
  return d > 0 ? d : 0;
}

/** O que está pendente no projeto, do ponto de vista de quem cobra. */
export function pendenciasDoCiclo(projetos = [], hoje = hojeLocalISO()) {
  const itens = [];
  for (const p of projetos) {
    if (p.status === "aguardando-aluno") {
      for (const m of p.monitores || []) {
        if (!monitorCadastrado(m)) {
          itens.push({ tipo: "cadastro-monitor", projeto: p.id, protocolo: p.protocolo,
            disciplina: p.disciplina, quem: m.nome, email: m.email,
            atraso: Math.max(0, diaSerial(hoje) - diaSerial(PRAZOS.cadastroMonitor)) });
        }
      }
    }
    if (p.status === "submetido") {
      itens.push({ tipo: "analise", projeto: p.id, protocolo: p.protocolo,
        disciplina: p.disciplina, quem: p.orientador?.nome, email: p.orientador?.email, atraso: 0 });
    }
    if (p.status === "aprovado") {
      for (const m of p.monitores || []) {
        const st = m.relatorio?.status || "rascunho";
        if (["rascunho", "devolvido"].includes(st)) {
          itens.push({ tipo: "relatorio", projeto: p.id, protocolo: p.protocolo,
            disciplina: p.disciplina, quem: m.nome, email: m.email, atraso: atrasoRelatorio(p, m, hoje) });
        } else if (st === "enviado") {
          itens.push({ tipo: "validacao", projeto: p.id, protocolo: p.protocolo,
            disciplina: p.disciplina, quem: p.orientador?.nome, email: p.orientador?.email,
            monitor: m.nome, atraso: Math.max(0, diaSerial(hoje) - diaSerial(PRAZOS.validacao)) });
        } else if (st === "validado") {
          itens.push({ tipo: "homologacao", projeto: p.id, protocolo: p.protocolo,
            disciplina: p.disciplina, quem: "PROPPEX", monitor: m.nome, atraso: 0 });
        }
      }
    }
  }
  return itens.sort((a, b) => b.atraso - a.atraso);
}

/* ======================================================================
   10. RESUMO PARA A LISTA

   A lista não carrega o projeto inteiro: ela carrega o que se lê de relance.
   ====================================================================== */
export function resumir(p, quem = {}) {
  const mons = p.monitores || [];
  return {
    id: p.id, protocolo: p.protocolo || "", status: p.status,
    rotulo: ROTULO_STATUS[p.status] || p.status,
    edital: p.edital, ciclo: p.ciclo,
    curso: p.curso, disciplina: p.disciplina,
    orientador: p.orientador?.nome || "", orientadorEmail: p.orientador?.email || "",
    chSemanal: p.chSemanal, inicio: p.inicio, fim: p.fim,
    cargaTotal: cargaHorariaTotal(p),
    monitores: mons.map((m) => ({
      id: m.id, nome: m.nome, cadastrado: monitorCadastrado(m),
      relatorio: m.relatorio?.status || "",
    })),
    relatoriosPendentes: mons.filter((m) => !["validado", "homologado"].includes(m.relatorio?.status)).length,
    papel: papelNoProjeto(p, quem),
    atualizadoEm: p.atualizadoEm || "",
  };
}

/** Painel da gestão: os números do ciclo, contados dos próprios projetos. */
export function panorama(projetos = [], edital = editalVigente().numero) {
  const doCiclo = projetos.filter((p) => txt(p.edital) === txt(edital));
  const conta = (f) => doCiclo.filter(f).length;
  const monitores = doCiclo.flatMap((p) => p.monitores || []);
  return {
    edital, total: doCiclo.length,
    porStatus: Object.fromEntries(STATUS.map((s) => [s, conta((p) => p.status === s)])),
    monitores: monitores.length,
    monitoresCadastrados: monitores.filter(monitorCadastrado).length,
    relatoriosEnviados: monitores.filter((m) => ["enviado", "validado", "homologado"].includes(m.relatorio?.status)).length,
    relatoriosHomologados: monitores.filter((m) => m.relatorio?.status === "homologado").length,
    horas: doCiclo.filter((p) => ["aprovado", "concluido"].includes(p.status))
      .reduce((s, p) => s + (p.monitores || []).length * cargaHorariaTotal(p), 0),
    porCurso: CURSOS.map((c) => ({
      curso: c.nome, slug: c.slug, projetos: conta((p) => p.curso === c.slug),
    })).filter((x) => x.projetos),
  };
}

/* ======================================================================
   11. CERTIFICADOS

   Quem tem direito ao quê sai dos projetos, sem cadastro à parte — a mesma
   regra da IC (lib/certificados.js). Duas diferenças, e as duas vêm do
   edital: o monitor só certifica com parecer **aprovado** (item 6.2: o
   certificado sai APÓS a avaliação), e o docente recebe **um por projeto**,
   não um por monitor — o item 6.1 certifica o PROJETO de monitoria.
   ====================================================================== */
export const certificavel = (p) => p?.status === "concluido";

export function certificadosDe(projetos, { cpf = "", email: mail = "", nome = "" } = {}) {
  const quem = { cpf, email: mail, nome };
  if (!soDigitos(cpf) && !txt(mail)) return [];
  const saida = [];
  for (const p of projetos || []) {
    if (!certificavel(p)) continue;
    const comum = {
      programa: "monitoria", projetoId: p.id, numero: p.protocolo || "",
      edital: txt(p.edital), ciclo: txt(p.ciclo),
      disciplina: p.disciplina || "", curso: cursoDe(p.curso)?.nome || p.curso || "",
      vigencia: { inicio: p.inicio || "", fim: p.fim || "" },
      orientador: p.orientador?.nome || "",
    };
    for (const m of p.monitores || []) {
      const aprovado = m.relatorio?.avaliacao?.parecer === "aprovado"
        && m.relatorio?.status === "homologado";
      if (!aprovado) continue;
      if (mesmoEmail(m.email, quem.email) || mesmoCpf(m.cpf, quem.cpf)) {
        saida.push({
          ...comum, tipo: "monitoria", pessoa: m.nome || "", cpf: soDigitos(m.cpf),
          horas: cargaHorariaTotal(p, m),
        });
      }
    }
    if (mesmoEmail(p.criadoPor, quem.email) || mesmoEmail(p.orientador?.email, quem.email)
      || mesmoCpf(p.orientador?.cpf, quem.cpf)) {
      const aprovados = (p.monitores || []).filter(
        (m) => m.relatorio?.avaliacao?.parecer === "aprovado" && m.relatorio?.status === "homologado");
      if (aprovados.length) {
        saida.push({
          ...comum, tipo: "orientacao-monitoria", pessoa: p.orientador?.nome || "",
          cpf: soDigitos(p.orientador?.cpf),
          monitores: aprovados.map((m) => m.nome).filter(Boolean),
          horas: cargaHorariaTotal(p),
        });
      }
    }
  }
  return saida.sort((a, b) => String(b.edital).localeCompare(String(a.edital), "pt-BR")
    || String(a.numero).localeCompare(String(b.numero), "pt-BR"));
}

/* ======================================================================
   12. HISTÓRICO
   ====================================================================== */
export function anotar(p, { acao, por, detalhe = "", sigilo = false }) {
  if (!Array.isArray(p.historico)) p.historico = [];
  p.historico.push({ em: new Date().toISOString(), por: email(por), acao, detalhe, sigilo });
  if (p.historico.length > 400) p.historico = p.historico.slice(-400);
  return p;
}

/** O ciclo seguinte, quando a PROPPEX for abrir o próximo edital. */
export const proximoCiclo = (ciclo) => {
  const [ano, sem] = txt(ciclo).split("/").map(Number);
  if (!ano || !sem) return "";
  return sem === 1 ? `${ano}/2` : `${ano + 1}/1`;
};

export const _paraTeste = { somaDias, txt, num };
