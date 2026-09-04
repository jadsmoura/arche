/* ========================================================================
   ARCHÉ IC — PIBIC-EM (Ensino Médio).

   OUTRO programa de bolsas, com outra lógica: o bolsista do Ensino Médio
   não pertence a um projeto — ele ACOMPANHA projetos de pesquisa do UNIEGO
   para conhecer os cursos, a ciência e a instituição, e pode trocar de
   projeto ao longo do ano. Por isso o registro é DA PESSOA, com uma
   TRAJETÓRIA de acompanhamentos, e não um vínculo fixo:

     turma       — o ciclo (2025/2026, 2026/2027…), um por edital próprio
     bolsa       — cnpq (R$ 300) ou uniego (R$ 150), 12 + 12 por turma
     trajetoria  — [{projetoId, numero, titulo, orientador, de, ate}]
                   o acompanhamento vigente é o que não tem `ate`
     relatorio   — SIMPLIFICADO, um por turma (não é o relatório da IC)
     conint      — participação no evento de IC de outubro

   Quem conduz é a COORDENAÇÃO DE PESQUISA (decisão do dono, ago/2026): ela
   apresenta o aluno ao orientador e faz a troca quando o aluno desejar. A
   indicação é da PROPPEX, não do professor. São menores de idade: o termo
   leva a autorização do responsável (anexo), e os dados do responsável
   moram aqui.
   ======================================================================== */
import { normalizarCpf } from "./cpf.js";
import { hojeLocalISO } from "./datas.js";

/* ------------------------------- catálogo ------------------------------- */
/** As turmas do programa — uma por edital próprio (série 02/AAAA). O nome
 *  mudou com a instituição: PBIC-EM na FACEG, ICEM no UNIEGO (edital
 *  02/2026). Os PDFs publicados de cada edição ficam no arquivo. */
export const TURMAS_EM = [
  // relatoriosFinalizados: os relatórios desta turma já foram entregues e
  // encerrados FORA do sistema (decisão do dono, ago/2026) — nada pendente
  { ciclo: "2024/2025", edital: "02/2024", vigencia: { inicio: "2024-09-01", fim: "2025-08-31" }, encerrada: true,
    documento: "/ic/docs/edital-02-2024.pdf", resultado: "/ic/docs/resultado-02-2024.pdf",
    relatoriosFinalizados: true },
  // prazoRelatorioFinal: a turma encerrou sem os relatórios, e a PROPPEX
  // reabriu a entrega até setembro/2026 (decisão do dono, ago/2026)
  { ciclo: "2025/2026", edital: "02/2025", vigencia: { inicio: "2025-09-01", fim: "2026-08-31" }, encerrada: true,
    documento: "/ic/docs/edital-02-2025.pdf", resultado: "/ic/docs/resultado-02-2025.pdf",
    prazoRelatorioFinal: "2026-09-30" },
  { ciclo: "2026/2027", edital: "02/2026", vigencia: { inicio: "2026-09-01", fim: "2027-08-31" }, encerrada: false,
    documento: "/ic/docs/edital-02-2026.pdf", resultado: null },
];
export const turmaDe = (ciclo) => TURMAS_EM.find((t) => t.ciclo === String(ciclo || "")) || null;
/* A vigente é a turma aberta MAIS RECENTE, não a primeira que a lista traz
   (achado ao lançar editais pelo portal, ago/2026): com a turma seguinte
   cadastrada e a anterior ainda sem a marca de encerrada — que é o estado
   normal em setembro, quando as duas convivem por alguns dias —, a busca
   pela primeira devolvia a turma VELHA, e o bolsista novo entraria nela.
   Enquanto há uma turma aberta só, o resultado é o mesmo de antes. */
export const turmaVigente = () => [...TURMAS_EM].reverse().find((t) => !t.encerrada)
  || TURMAS_EM[TURMAS_EM.length - 1];

/** As bolsas do programa e a cota por turma (12 + 12, decisão do dono). */
export const BOLSAS_EM = [
  { codigo: "cnpq", nome: "Bolsa CNPq (PIBIC-EM)", valor: 300, cota: 12 },
  { codigo: "uniego", nome: "Bolsa UNIEGO (PIBIC-EM)", valor: 150, cota: 12 },
  // o resultado de 02/2025 traz também VOLUNTÁRIOS: participam sem bolsa e
  // sem cota — a categoria existe para o registro dizer a verdade
  { codigo: "voluntario", nome: "Voluntário (ICEM)", valor: 0, cota: null },
];
export const bolsaEmDe = (c) => BOLSAS_EM.find((b) => b.codigo === String(c || "").toLowerCase()) || null;

export const SITUACOES_EM = ["ativo", "concluido", "desligado"];

/* Os relatórios do ICEM (decisão do dono, ago/2026): a turma VIGENTE entrega
   parcial e final; as ANTIGAS, só o final — e quem valida é a PROPPEX, não a
   orientação (o bolsista de EM acompanha projetos, não pertence a eles).
   O formulário é simples, três campos: */
export const RELATORIOS_EM = ["parcial", "final"];
export const SITUACOES_RELATORIO_EM = ["pendente", "entregue", "validado", "devolvido"];
export const CAMPOS_RELATORIO_EM = [
  { campo: "atividades", rot: "Descreva as atividades realizadas na vigência da sua bolsa" },
  { campo: "motivacao", rot: "A participação no projeto de Iniciação Científica EM te motivou a seguir carreira acadêmica, a cursar uma faculdade, a ser um cientista?" },
  { campo: "cursoPretendido", rot: "Em qual curso do UNIEGO você pretende ingressar?" },
];
export const relatoriosExigidos = (turma) =>
  turma?.relatoriosFinalizados ? [] : (turma?.encerrada ? ["final"] : ["parcial", "final"]);

/* Avaliação do Programa de Iniciação Científica Júnior, pelo estudante —
   transcrita do formulário institucional da PROPPEX (ago/2026): 7 critérios
   na escala 0–5 (o zero é "não se aplica", por isso TODA linha se responde)
   + as perguntas abertas e a recomendação. Vai junto do relatório. */
export const ESCALA_AVALIACAO_EM = [
  { valor: 0, rot: "Não se aplica / Não tenho opinião" },
  { valor: 1, rot: "Ruim (não atendeu às expectativas)" },
  { valor: 2, rot: "Regular (atendeu parcialmente, com muitas dificuldades)" },
  { valor: 3, rot: "Bom (experiência positiva e proveitosa)" },
  { valor: 4, rot: "Muito Bom (contribuiu significativamente para o meu aprendizado)" },
  { valor: 5, rot: "Excelente (superou expectativas e transformou minha visão acadêmica)" },
];
export const CRITERIOS_AVALIACAO_EM = [
  { codigo: "metodo", rot: "Compreensão do Método Científico",
    pergunta: "O programa ajudou você a entender como funciona uma pesquisa científica, testes práticos e a busca por respostas estruturadas?" },
  { codigo: "escola", rot: "Integração com a Escola",
    pergunta: "As atividades da pesquisa complementaram o que você estuda no Ensino Médio e despertaram maior interesse pelas matérias escolares?" },
  { codigo: "acolhimento", rot: "Acolhimento e Acompanhamento",
    pergunta: "Você se sentiu bem acolhido, respeitado e orientado pelo professor/pesquisador e pelos demais estudantes da equipe?" },
  { codigo: "estrutura", rot: "Estrutura e Espaços",
    pergunta: "Os locais utilizados (laboratórios, computadores, salas ou materiais de campo) foram suficientes e seguros para realizar o trabalho?" },
  { codigo: "tempo", rot: "Organização do Tempo e Carga Horária",
    pergunta: "Foi possível conciliar tranquilamente a rotina das aulas normais do colégio com as tarefas da bolsa de pesquisa?" },
  { codigo: "comunicacao", rot: "Comunicação e Expressão",
    pergunta: "O projeto ajudou a melhorar sua capacidade de ler textos técnicos, escrever relatórios ou falar em público/apresentar trabalhos?" },
  { codigo: "futuro", rot: "Escolha Profissional e Futuro",
    pergunta: "Essa experiência ajudou você a conhecer o ambiente universitário e a pensar sobre qual faculdade ou profissão deseja seguir?" },
];
export const RECOMENDACAO_EM = [
  { codigo: "sim", rot: "Sim" },
  { codigo: "nao", rot: "Não" },
  { codigo: "em-partes", rot: "Em partes" },
];

/* ----------------------------- normalização ----------------------------- */
const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const umDe = (v, lista, padrao) => (lista.includes(String(v || "")) ? String(v) : padrao);
/* id curto para o pedido de troca de projeto — o registro do ICEM não tinha
   um gerador próprio porque nada dentro dele precisava de identidade */
const idEM = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

export function normalizarBolsistaEM(b = {}, { base = null } = {}) {
  const cpf = normalizarCpf(b.cpf) || base?.cpf || "";
  return {
    id: b.id || base?.id || "",
    turma: turmaDe(b.turma)?.ciclo || base?.turma || turmaVigente().ciclo,
    nome: t(b.nome, 120) || base?.nome || "",
    cpf,
    rg: t(b.rg, 40),
    escola: t(b.escola, 120),
    serie: t(b.serie, 20),                 // "2º ano", "3º ano"
    email: t(b.email, 120).toLowerCase(),
    telefone: t(b.telefone, 30),
    cursoInteresse: t(b.cursoInteresse, 80),
    responsavel: {
      nome: t(b.responsavel?.nome, 120),
      cpf: normalizarCpf(b.responsavel?.cpf),
    },
    banco: t(b.banco, 60), agencia: t(b.agencia, 20), conta: t(b.conta, 30), pix: t(b.pix, 120),
    bolsa: umDe(b.bolsa, BOLSAS_EM.map((x) => x.codigo), ""),
    situacao: umDe(b.situacao, SITUACOES_EM, "ativo"),
    // seleção do edital próprio (Notas Finais)
    colocacao: Number.isFinite(Number(b.colocacao)) && Number(b.colocacao) > 0 ? Number(b.colocacao) : null,
    notaSelecao: Number.isFinite(Number(b.notaSelecao)) ? Math.round(Number(b.notaSelecao) * 100) / 100 : null,
    // quem faltou à entrevista da seleção (achado de ago/2026: o campo vinha
    // nos lotes e morria aqui — o selo "NC na seleção" nunca aparecia e o
    // não-compareceu saía como selecionado no resultado público)
    ...(b.compareceu === false || base?.compareceu === false ? { compareceu: false } : {}),
    trajetoria: (Array.isArray(b.trajetoria) ? b.trajetoria : []).map((e) => ({
      projetoId: t(e.projetoId, 60), numero: t(e.numero, 30), titulo: t(e.titulo, 300),
      orientador: t(e.orientador, 120), de: data(e.de), ate: data(e.ate),
    })).filter((e) => e.projetoId),
    relatorios: normalizarRelatoriosEM(b),
    conint: { participou: b.conint?.participou === true, ano: t(b.conint?.ano, 10) },
    /* TROCAR DE PROJETO PASSA A SER UM PEDIDO (decisão do dono, ago/2026,
       revendo o "troca quando quiser" da primeira versão): o estudante
       escolhe o primeiro projeto sozinho, mas a MUDANÇA vai à PROPPEX, que
       aprova ou recusa. A razão é de processo: quem apresenta o estudante ao
       orientador é a coordenação, e uma troca silenciosa deixaria o professor
       antigo esperando alguém que não vem e o novo sem saber que vai receber
       alguém. O histórico dos pedidos fica — inclusive os recusados, que são
       o que explica depois por que a trajetória não mudou. */
    pedidosProjeto: (Array.isArray(b.pedidosProjeto) ? b.pedidosProjeto : []).map((x) => ({
      id: t(x.id, 40) || idEM("ped"),
      projetoId: t(x.projetoId, 60), numero: t(x.numero, 30), titulo: t(x.titulo, 300),
      orientador: t(x.orientador, 120), curso: t(x.curso, 80), linha: t(x.linha, 10),
      motivo: t(x.motivo, 2000),
      em: t(x.em, 40), por: t(x.por, 120),
      situacao: umDe(x.situacao, ["pendente", "aprovado", "recusado"], "pendente"),
      decisao: x.decisao ? {
        em: t(x.decisao.em, 40), por: t(x.decisao.por, 120),
        parecer: t(x.decisao.parecer, 2000),
      } : null,
    })).filter((x) => x.projetoId).slice(-20),
    historico: Array.isArray(b.historico) ? b.historico.slice(-40) : [],
    origem: b.origem || base?.origem || null,
    criadoEm: base?.criadoEm || b.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Os dois relatórios (parcial e final), com os três campos do formulário.
 * Registro antigo com `relatorio` único (o "simplificado" da primeira
 * versão) migra para o FINAL — texto vira `atividades` — sem perder nada.
 */
function normalizarAvaliacaoEM(a) {
  if (!a) a = {};
  const criterios = {};
  for (const c of CRITERIOS_AVALIACAO_EM) {
    const v = Number(a.criterios?.[c.codigo]);
    if (Number.isInteger(v) && v >= 0 && v <= 5) criterios[c.codigo] = v;
  }
  return {
    criterios,
    aprendizado: t(a.aprendizado, 2000),
    recomendaria: umDe(a.recomendaria, RECOMENDACAO_EM.map((x) => x.codigo), ""),
    sugestoes: t(a.sugestoes, 2000),
  };
}
/** Todas as 7 perguntas respondidas (0 conta — é "não se aplica") e a
 *  recomendação marcada: é o que fecha o questionário do estudante. */
export const avaliacaoEMCompleta = (a) =>
  !!a && CRITERIOS_AVALIACAO_EM.every((c) => Number.isInteger(a.criterios?.[c.codigo]))
  && RECOMENDACAO_EM.some((x) => x.codigo === a.recomendaria);

function normalizarRelatorioEM(r) {
  if (!r) r = {};
  return {
    situacao: umDe(r.situacao, SITUACOES_RELATORIO_EM, "pendente"),
    em: t(r.em, 30),
    atividades: t(r.atividades, 8000),
    motivacao: t(r.motivacao, 4000),
    cursoPretendido: t(r.cursoPretendido, 80),
    cursoOutro: t(r.cursoOutro, 120),
    obs: t(r.obs, 500),
    porAluno: r.porAluno === true,
    // a avaliação do programa pelo estudante (7 critérios 0–5 + abertas)
    avaliacao: normalizarAvaliacaoEM(r.avaliacao),
    // a validação é da PROPPEX: comentário e carimbo de quem validou/devolveu
    comentario: t(r.comentario, 1000),
    validadoPor: t(r.validadoPor, 160),
    validadoEm: t(r.validadoEm, 30),
  };
}
function normalizarRelatoriosEM(b) {
  const legado = b.relatorio && !b.relatorios
    ? { final: { ...b.relatorio, atividades: b.relatorio.texto || b.relatorio.atividades } }
    : (b.relatorios || {});
  return {
    parcial: normalizarRelatorioEM(legado.parcial),
    final: normalizarRelatorioEM(legado.final),
  };
}

/** O acompanhamento vigente — o último trecho da trajetória ainda aberto. */
export const projetoAtual = (b) =>
  (b?.trajetoria || []).find((e) => !e.ate) || null;

/**
 * Troca (ou define) o projeto acompanhado: fecha o trecho aberto com a data
 * de hoje e abre o novo. A trajetória NUNCA se apaga — é ela que conta, no
 * fim do ano, por onde o aluno passou (e é o que o certificado vai dizer).
 */
export function trocarProjeto(b, novo, { hoje = hojeLocalISO() } = {}) {
  const trajetoria = (b.trajetoria || []).map((e) => (e.ate ? e : { ...e, ate: hoje }));
  if (novo?.projetoId) {
    trajetoria.push({
      projetoId: t(novo.projetoId, 60), numero: t(novo.numero, 30), titulo: t(novo.titulo, 300),
      orientador: t(novo.orientador, 120), de: hoje, ate: "",
    });
  }
  return { ...b, trajetoria };
}

/** Registro de quem mexeu — mesma convenção dos projetos. */
export function anotarEM(b, { quem, oQue, agora = new Date() }) {
  const historico = [...(b.historico || []), { quando: agora.toISOString(), quem: quem || "", oQue }];
  return { ...b, historico: historico.slice(-40) };
}

/** As cotas da turma: quantas bolsas de cada fonte já foram atribuídas. */
export function cotasDaTurma(bolsistas, ciclo) {
  const daTurma = (bolsistas || []).filter((b) => b.turma === ciclo && b.situacao !== "desligado");
  // só as bolsas PAGAS têm cota; o voluntário entra sem limite
  return BOLSAS_EM.filter((t) => t.cota != null).map((tipo) => ({
    ...tipo,
    usadas: daTurma.filter((b) => b.bolsa === tipo.codigo).length,
  }));
}

/* ------------------- OS DADOS BANCÁRIOS DO BOLSISTA ---------------------
   Pedido do dono (ago/2026): "quando o Wagner marca qual bolsa o aluno de EM
   vai ser contemplado, ele recebe automaticamente um e-mail solicitando os
   dados bancários? Lembrando que o aluno bolsista do CNPq deve
   obrigatoriamente apresentar dados do Banco do Brasil, e os demais podem ser
   qualquer banco."

   Duas decisões vivem aqui:

   · Quem preenche é o ESTUDANTE. Até aqui o cadastro do ICEM era todo digitado
     pela coordenação, e conta corrente é o campo que mais custa caro errado —
     um dígito trocado é um pagamento que não cai e ninguém sabe por quê. Quem
     tem o cartão na mão é ele.

   · A exigência do BANCO DO BRASIL é do CNPq, não nossa: a agência paga a
     bolsa em conta do BB, e uma conta de outro banco simplesmente não recebe.
     Por isso ela é régua do sistema, e não recado no e-mail — o estudante
     digitaria a conta que tem, e o erro só apareceria na folha de pagamento.
     Para a bolsa do UNIEGO vale qualquer banco: quem paga somos nós. */
export const exigeBancoDoBrasil = (bolsa) => String(bolsa || "") === "cnpq";
/* O nome do banco é campo livre, e "Banco do Brasil" se escreve de muitos
   jeitos — inclusive pelo número dele (001), que é como o extrato o mostra. */
export function ehBancoDoBrasil(nome) {
  const s = String(nome || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return false;
  return s === "bb" || s === "001" || s === "1" || s === "banco001"
    || s.includes("bancodobrasil") || s === "brasil";
}
/** O que falta nos dados bancários — vazio quando não há bolsa a pagar. */
export function faltaDadosBancariosEM(b = {}) {
  // voluntário não recebe: pedir-lhe conta corrente seria cobrar o que não existe
  if (!b.bolsa || b.bolsa === "voluntario") return [];
  const falta = [
    !t(b.banco, 60) && "banco", !t(b.agencia, 20) && "agência",
    !t(b.conta, 30) && "conta", !t(b.pix, 120) && "Pix",
  ].filter(Boolean);
  if (exigeBancoDoBrasil(b.bolsa) && t(b.banco, 60) && !ehBancoDoBrasil(b.banco))
    falta.push("conta no Banco do Brasil (exigência do CNPq)");
  return falta;
}
export const dadosBancariosCompletosEM = (b) => faltaDadosBancariosEM(b).length === 0;

/** O que falta no cadastro de um bolsista EM — régua própria do programa. */
export function faltaNoBolsistaEM(b = {}) {
  return [
    !b.nome && "nome", !b.cpf && "CPF", !b.escola && "escola",
    !b.telefone && "telefone", !b.email && "e-mail",
    !b.responsavel?.nome && "nome do responsável",
    !b.bolsa && "tipo de bolsa",
    !projetoAtual(b) && b.situacao === "ativo" && "projeto acompanhado",
  ].filter(Boolean);
}
