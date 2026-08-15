/* ========================================================================
   Edital nº 01/2026 — IC, Inovação Tecnológica e Iniciação à Extensão.

   Aqui ficam as regras do edital que o sistema precisa conhecer: as
   modalidades, os grupos de pesquisa certificados e a planilha de pontuação
   da produção acadêmica do coordenador. É catálogo, não fluxo — o fluxo do
   projeto vive em lib/ic.js.

   Ao trocar de edital, o que muda é este arquivo. Preserve os `codigo`:
   são a chave do que já está gravado nos projetos.
   ======================================================================== */

export const EDITAL = {
  numero: "01/2026",
  titulo: "Edital nº 01/2026 — Iniciação Científica, Inovação Tecnológica e Iniciação à Extensão",
  vigencia: { inicio: "2026-09-01", fim: "2027-08-31" },   // execução dos planos de trabalho
  meses: 12,
  // janela do currículo Lattes pontuada (item 7.3)
  producaoDe: 2022, producaoAte: 2026,
  relatorios: { parcial: 6, final: 12 },                   // meses de vigência (item 11.1.b)
};

/**
 * Documento oficial de cada edital, para download na guia Editais e
 * Resultados e na vitrine pública (/ic/). O arquivo vive em public/ic/docs —
 * caminho ABERTO de propósito: edital é documento público.
 * Edital antigo que entrar como histórico ganha aqui a sua linha.
 */
export const DOCUMENTOS_EDITAIS = {
  "01/2026": "/ic/docs/edital-01-2026.pdf",
  "01/2025": "/ic/docs/edital-01-2025.pdf",
  "01/2024": "/ic/docs/edital-01-2024.pdf",
  "01/2023": "/ic/docs/edital-01-2023.pdf",
  "01/2022": "/ic/docs/edital-01-2022.pdf",
};

/**
 * Resultado oficial JÁ PUBLICADO de editais encerrados: quando existe, é o
 * documento que vale — as rotas de resultado redirecionam para ele em vez de
 * gerar um PDF novo. O edital vigente não entra: o dele sai do gerador, com
 * os dados de agora.
 */
export const RESULTADOS_EDITAIS = {
  "01/2025": "/ic/docs/resultado-01-2025.pdf",
  "01/2024": "/ic/docs/resultado-01-2024.pdf",
  "01/2023": "/ic/docs/resultado-01-2023.pdf",
  "01/2022": "/ic/docs/resultado-01-2022.pdf",
};

/* ------------------------------- linhas ---------------------------------- */
// As três frentes do edital. A linha define o vocabulário da proposta e o
// conjunto de modalidades que se pode pedir.
export const LINHAS = [
  { codigo: "ic", nome: "Iniciação Científica", sigla: "IC" },
  { codigo: "it", nome: "Inovação Tecnológica", sigla: "IT" },
  { codigo: "ie", nome: "Iniciação à Extensão", sigla: "IE" },
];
export const linhaDe = (c) => LINHAS.find((l) => l.codigo === String(c || "").toLowerCase()) || null;

/* ----------------------------- modalidades ------------------------------- */
// Item 2 do edital. `bolsa` diz se a modalidade remunera; `fomento`, quem
// paga; `titulacaoMinima`, quem pode coordenar (item 4.4).
export const MODALIDADES = [
  { codigo: "pibic-cnpq", nome: "PIBIC/CNPq", linha: "ic", bolsa: true, fomento: "cnpq",
    valor: null, titulacaoMinima: "doutor", desc: "Bolsa de IC do CNPq, por quota institucional" },
  { codigo: "pibiti-cnpq", nome: "PIBITI/CNPq", linha: "it", bolsa: true, fomento: "cnpq",
    valor: null, titulacaoMinima: "doutor", desc: "Bolsa de Iniciação Tecnológica do CNPq" },
  { codigo: "pbic-uniego", nome: "PIBIC/UNIEGO", linha: "ic", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "mestre", desc: "Bolsa de IC do UNIEGO" },
  { codigo: "pbiti-uniego", nome: "PIBITI/UNIEGO", linha: "it", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "mestre", desc: "Bolsa de Iniciação Tecnológica do UNIEGO" },
  { codigo: "pbie-uniego", nome: "PROBEX/UNIEGO", linha: "ie", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "mestre", desc: "Bolsa de Iniciação à Extensão do UNIEGO" },
  // Voluntário é UM só, e serve às três linhas (decisão do dono, ago/2026):
  // sem bolsa não há por que separar IC, IT e IE em três nomes. `linha: null`
  // = vale para qualquer uma.
  { codigo: "voluntario", nome: "Voluntário", linha: null, bolsa: false, fomento: "",
    valor: 0, titulacaoMinima: "especialista", desc: "Participação voluntária, sem bolsa" },
];
export const modalidadeDe = (c) =>
  MODALIDADES.find((m) => m.codigo === String(c || "").toLowerCase()) || null;
// a modalidade sem linha (Voluntário) aparece em todas
export const modalidadesDaLinha = (linha) =>
  MODALIDADES.filter((m) => m.linha === linha || m.linha === null);

// Códigos que o ARCHÉ já usou: os curtos, de antes de o edital entrar no
// sistema, e as três voluntárias por linha, hoje reunidas numa só.
const HERANCA = {
  pibic: "pibic-cnpq", pibiti: "pibiti-cnpq", voluntaria: "voluntario",
  "pvic-uniego": "voluntario", "pviti-uniego": "voluntario", "pvie-uniego": "voluntario",
};
export const modalidadeVigente = (c) => HERANCA[String(c || "")] || String(c || "");

export const TITULACOES = [
  { codigo: "especialista", nome: "Especialista", nivel: 1 },
  { codigo: "mestre", nome: "Mestre", nivel: 2 },
  { codigo: "doutor", nome: "Doutor", nivel: 3 },
];
/**
 * Aceita o que a pessoa escreveu e devolve o código: "Doutora", "DOUTOR",
 * "Dra." e "doutorado" são a mesma titulação. O formulário do edital veio
 * como texto livre, e é isso que chega na importação.
 */
export function normalizarTitulacao(v) {
  const t = String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!t) return "";
  if (/^(dr|dra|doutor|doutora|doutorado|pos-?doutor)/.test(t)) return "doutor";
  if (/^(me|ms|mestr)/.test(t)) return "mestre";
  if (/^(esp|especialis|pos-?graduad)/.test(t)) return "especialista";
  return "";
}

const nivelDe = (t) => TITULACOES.find((x) => x.codigo === normalizarTitulacao(t))?.nivel || 0;

/** A titulação de quem coordena atende ao mínimo da modalidade? (item 4.4) */
export function titulacaoAtende(titulacao, modalidade) {
  const m = modalidadeDe(modalidade);
  if (!m) return true;
  return nivelDe(titulacao) >= nivelDe(m.titulacaoMinima);
}

/* --------------------- fomento definido na seleção ----------------------- */
// O que a coordenação marca ao aprovar: bolsa de quem, ou voluntário.
export const FOMENTOS = [
  { codigo: "cnpq", nome: "Bolsa CNPq" },
  { codigo: "uniego", nome: "Bolsa UNIEGO" },
  { codigo: "voluntario", nome: "Voluntário (sem bolsa)" },
];
export const fomentoDe = (c) => FOMENTOS.find((f) => f.codigo === String(c || "")) || null;

/**
 * As oito modalidades são, na verdade, o cruzamento de linha × fomento: IC
 * com bolsa do CNPq é PIBIC/CNPq; IC voluntária é PVIC/UNIEGO. O formulário
 * do edital pergunta só a linha — quem paga se decide na seleção. Daí que a
 * modalidade efetiva se calcula, em vez de ser perguntada duas vezes.
 */
export function modalidadePor(linha, fomento) {
  const f = String(fomento || "");
  // sem bolsa, a modalidade é a mesma para qualquer linha
  if (f === "voluntario") return MODALIDADES.find((m) => !m.bolsa) || null;
  return MODALIDADES.find((m) => m.linha === linha && m.bolsa && m.fomento === f) || null;
}

/* --------------------- grupos de pesquisa (DGP/CNPq) --------------------- */
// Grupos certificados pelo UNIEGO no Diretório de Grupos de Pesquisa do
// CNPq. Só o nome: o edital quer saber a que grupo a proposta se liga, e não
// se exige que quem submete seja líder nem membro dele — por isso também não
// há pontuação por grupo (o item 9.3 dependeria desse papel).
//
// Esta lista é o ponto de partida, não a cerca: quem submete pode informar um
// grupo que não esteja aqui, e ele passa a aparecer para os demais
// (`gruposConhecidos`). Grupo novo certificado pelo CNPq pode entrar direto
// nesta lista, se a PROPPEX preferir vê-lo como certificado.
export const GRUPOS_PESQUISA = [
  "Direito Civil - Capacidade civil, Responsabilidade, Família e Sucessões",
  "Direito Internacional, Conflitos e Proteção da Pessoa Humana e Patrimônio Cultural e Ambiental",
  "Grupo de Pesquisa em Criminologia e Processos de Vitimização (GECRIMINI)",
  "Grupo de pesquisa de projetos mecânicos, inovação e tecnologia - Promintec",
  "Grupo de pesquisa em diagnóstico bucal, Odontologia Hospitalar e PNE",
  "LIGA ACADÊMICA DE PSICOLOGIA INTEGRADA KUMA",
  "Medicina Veterinária Preventiva",
  "NEFFOR - Núcleo de Estudos em Fatos, Famílias, Obrigações e Responsabilidades",
  "NIPP - Núcleo Integrado de Pesquisa Processual",
  "Núcleo de Estudos e Pesquisas em Engenharia Civil (NEPEC)",
  "Núcleo de Estudos e Pesquisas em Engenharia Mecânica (NEPEM)",
  "Núcleo de Estudos e Pesquisas em Engenharia de Software (NEPES)",
  "Núcleo de Estudos em Educação Rural e Pedagogia da Alternância (NERPA)",
  "Núcleo de Estudos em Odontologia da FACEG (NEOF)",
  "Núcleo de Estudos em Peri-implantodontia",
  "Relativismo Cultural e Universalidade dos Direitos Humanos",
  "Saúde pública: Qualidade de vida",
  "Solos, Ecologia e Dinâmica da Matéria Orgânica",
];

/** Nome de grupo em forma comparável — para não duplicar por acento ou caixa. */
const chaveGrupo = (g) => String(g || "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/**
 * A lista que a tela oferece: os certificados mais os que já foram informados
 * à mão em projetos. Assim um grupo digitado uma vez fica disponível para
 * todo mundo, e a lista se mantém sozinha entre um edital e outro — sem
 * ninguém precisar editar código para cadastrar grupo novo.
 *
 * Devolve `{ certificados, informados }` para a tela poder separar os dois.
 */
export function gruposConhecidos(projetos = []) {
  const vistos = new Map(GRUPOS_PESQUISA.map((g) => [chaveGrupo(g), g]));
  const informados = [];
  for (const p of projetos) {
    const g = String(p?.grupoPesquisa || "").trim();
    // rascunho ainda é do autor: só entra na lista comum o que foi submetido
    if (!g || p?.status === "rascunho") continue;
    const k = chaveGrupo(g);
    if (vistos.has(k)) continue;
    vistos.set(k, g);
    informados.push(g);
  }
  const ordem = (a, b) => a.localeCompare(b, "pt-BR");
  return { certificados: [...GRUPOS_PESQUISA].sort(ordem), informados: informados.sort(ordem) };
}

/**
 * Casa o que a pessoa digitou com um grupo já conhecido: "solos, ecologia e
 * dinamica da materia organica" vira o nome certificado, com acento e caixa
 * certos. Sem correspondência, devolve o texto limpo — grupo novo é legítimo.
 */
export function normalizarGrupo(g, conhecidos = GRUPOS_PESQUISA) {
  const texto = String(g || "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!texto) return "";
  const k = chaveGrupo(texto);
  return conhecidos.find((x) => chaveGrupo(x) === k) || texto;
}

/* ------------------ pontuação da produção acadêmica ---------------------- */
/**
 * Réplica da planilha oficial (item 6.2 do edital): a pessoa informa a
 * quantidade de cada item no período, cada um vale um peso, e cada bloco
 * tem teto. O total máximo é 100.
 *
 * `codigo` é a chave gravada no projeto — não renomeie ao trocar de edital.
 */
export const BLOCOS_PRODUCAO = [
  {
    codigo: "orientacoes", nome: "Orientações",
    itens: [
      { codigo: "or-dout-conc", nome: "Orientação/coorientação de tese de doutorado", peso: 2.5, grupo: "Concluídas" },
      { codigo: "or-mest-conc", nome: "Orientação/coorientação de dissertação de mestrado", peso: 2, grupo: "Concluídas" },
      { codigo: "or-ic-conc", nome: "Orientação de iniciação científica", peso: 1.5, grupo: "Concluídas" },
      { codigo: "or-lato-conc", nome: "Orientação de trabalho final de pós-graduação lato sensu", peso: 1.8, grupo: "Concluídas" },
      { codigo: "or-grad-conc", nome: "Orientação de trabalho final de graduação", peso: 1, grupo: "Concluídas" },
      { codigo: "or-dout-and", nome: "Orientação de tese de doutorado", peso: 2, grupo: "Em andamento" },
      { codigo: "or-mest-and", nome: "Orientação de dissertação de mestrado", peso: 1.5, grupo: "Em andamento" },
      { codigo: "or-ic-and", nome: "Orientação de iniciação científica", peso: 1, grupo: "Em andamento" },
      { codigo: "or-lato-and", nome: "Orientação de trabalho final de pós-graduação lato sensu", peso: 0.8, grupo: "Em andamento" },
      { codigo: "or-grad-and", nome: "Orientação de trabalho final de graduação", peso: 0.5, grupo: "Em andamento" },
    ],
  },
  {
    codigo: "bibliografica", nome: "Produção bibliográfica",
    itens: [
      { codigo: "art-a1", nome: "Artigo completo em periódico Qualis A1", peso: 4 },
      { codigo: "art-a2", nome: "Artigo completo em periódico Qualis A2", peso: 3.7 },
      // A3 e A4 faltavam na planilha do edital, embora ele use a escala
      // completa do Qualis/CAPES (B2, B1, A4, A3, A2, A1 — item 8.3). Os
      // pesos entram ENTRE os vizinhos já publicados, sem alterar nenhum
      // deles: mexer num peso existente mudaria o CL já apurado.
      { codigo: "art-a3", nome: "Artigo completo em periódico Qualis A3", peso: 3.6 },
      { codigo: "art-a4", nome: "Artigo completo em periódico Qualis A4", peso: 3.5 },
      { codigo: "art-b1", nome: "Artigo completo em periódico Qualis B1", peso: 3.4 },
      { codigo: "art-b2", nome: "Artigo completo em periódico Qualis B2", peso: 3 },
      { codigo: "art-b3", nome: "Artigo completo em periódico Qualis B3", peso: 2.7 },
      { codigo: "art-b4", nome: "Artigo completo em periódico Qualis B4", peso: 2.4 },
      { codigo: "art-b5", nome: "Artigo completo em periódico Qualis B5", peso: 2 },
      { codigo: "art-c", nome: "Artigo completo em periódico Qualis C", peso: 1.7 },
      { codigo: "art-aceito", nome: "Artigo completo aceito para publicação", peso: 1 },
      { codigo: "art-sem-qualis", nome: "Artigo completo em periódico sem Qualis", peso: 1.4 },
      { codigo: "livro", nome: "Livro", peso: 2.5 },
      { codigo: "capitulo", nome: "Capítulo de livro", peso: 2 },
      { codigo: "anais", nome: "Trabalho completo em anais de congresso / artigo em jornal ou revista", peso: 1 },
    ],
  },
  {
    codigo: "bancas", nome: "Participação em bancas e eventos",
    itens: [
      { codigo: "banca-dout", nome: "Membro de banca de doutorado", peso: 0.5 },
      { codigo: "banca-mest", nome: "Membro de banca de mestrado", peso: 0.4 },
      { codigo: "banca-lato", nome: "Membro de banca de pós-graduação lato sensu", peso: 0.3 },
      { codigo: "banca-grad", nome: "Membro de banca de graduação", peso: 0.2 },
      { codigo: "evento", nome: "Participação em evento científico", peso: 1 },
    ],
  },
];

export const ITENS_PRODUCAO = BLOCOS_PRODUCAO.flatMap((b) => b.itens.map((i) => ({ ...i, bloco: b.codigo })));
/* A planilha NÃO tem teto (decisão do dono, ago/2026): limite de pontos
   empilhava professores no mesmo número e o empate acabava decidido por
   critério de desempate, não por produção. Cada bloco soma o que somar e
   a pontuação do currículo é a soma dos três. */

const arred = (n) => Math.round(n * 100) / 100;
const qtd = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
};

/**
 * Pontua as quantidades informadas. Devolve o total por bloco (bruto e já
 * limitado ao teto) e a pontuação final, de 0 a 100.
 *   pontuarProducao({ "art-a1": 2, "or-ic-conc": 3 })
 */
export function pontuarProducao(quantidades = {}) {
  const blocos = BLOCOS_PRODUCAO.map((b) => {
    const bruto = b.itens.reduce((s, i) => s + qtd(quantidades[i.codigo]) * i.peso, 0);
    // `bruto` e `pontos` são o mesmo número desde que o teto caiu; o campo
    // continua para não quebrar quem já lia `pontos`.
    return { codigo: b.codigo, nome: b.nome, bruto: arred(bruto), pontos: arred(bruto) };
  });
  return { blocos, total: arred(blocos.reduce((s, b) => s + b.pontos, 0)) };
}

/** Só os campos preenchidos, já limpos — é o que se guarda no projeto. */
export function normalizarProducao(quantidades = {}) {
  const out = {};
  for (const i of ITENS_PRODUCAO) {
    const n = qtd(quantidades?.[i.codigo]);
    if (n) out[i.codigo] = n;
  }
  return out;
}

/* ---------------------- avaliação das propostas -------------------------- */
/**
 * Formulário do avaliador: o projeto vale de 0 a 100, repartidos em sete
 * critérios — cada um com o seu teto de pontos, e a nota do projeto é a SOMA.
 * Os quatro primeiros códigos vêm do formulário anterior (média de 0 a 10) e
 * foram preservados de propósito: código é chave do que já está gravado.
 */
export const CRITERIOS_AVALIACAO = [
  { codigo: "merito", nome: "Mérito científico, originalidade e relevância do tema", peso: 20 },
  { codigo: "objetivos", nome: "Clareza e consistência dos objetivos", peso: 10 },
  { codigo: "fundamentacao", nome: "Fundamentação teórica e diálogo com a literatura", peso: 10 },
  { codigo: "metodologia", nome: "Adequação da metodologia aos objetivos", peso: 20 },
  { codigo: "viabilidade", nome: "Viabilidade técnica e exequibilidade do cronograma na vigência", peso: 15 },
  { codigo: "formacao", nome: "Contribuição para a formação científica do aluno", peso: 15 },
  { codigo: "redacao", nome: "Qualidade da redação: clareza, estrutura e normas", peso: 10 },
];
export const NOTA_MAXIMA_PROJETO = CRITERIOS_AVALIACAO.reduce((s, c) => s + c.peso, 0);   // 100

/* -------------------- classificação das propostas ------------------------ */
/**
 * Nota final = nota do projeto (0 a 100) + pontuação da produção acadêmica
 * (0 a 100, ABSOLUTA — a mesma da planilha, sem conversão de escala). A
 * classificação ordena pela soma; o currículo sozinho não classifica: sem
 * nota de projeto não há nota final.
 */
export function notaClassificacao({ notaProjeto, pontuacaoProducao } = {}) {
  // null e "" viram 0 no Number(): sem este filtro, "ainda não avaliada"
  // sairia como nota zero — e num resultado impresso isso é outra coisa.
  const nu = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
  const np = nu(notaProjeto);
  const cl = nu(pontuacaoProducao);
  const temNp = Number.isFinite(np);
  // o currículo não tem teto: só não pode ser negativo
  const clOk = Number.isFinite(cl) ? Math.max(cl, 0) : 0;
  if (!temNp && !clOk) return null;
  const npOk = temNp ? Math.min(Math.max(np, 0), NOTA_MAXIMA_PROJETO) : null;
  return {
    np: temNp ? arred(npOk) : null,
    cl: arred(clOk),
    total: temNp ? arred(npOk + clOk) : null,
  };
}

/**
 * Os dois quadros do resultado: primeiro só os professores doutores (as
 * bolsas PIBIC/CNPq exigem doutorado), depois o geral com todo mundo —
 * doutores inclusive. Ordena pela nota final; empate resolve pela nota do
 * projeto e, persistindo, pelo protocolo. Quem não tem nota final vai para
 * o fim, na ordem do protocolo.
 */
export function classificarProjetos(projetos = []) {
  const nota = (p) => p?.classificacao?.total;
  const ordem = (a, b) => {
    const na = nota(a), nb = nota(b);
    if (typeof na === "number" && typeof nb === "number") {
      if (na !== nb) return nb - na;
      const pa = a.classificacao?.np ?? -1, pb = b.classificacao?.np ?? -1;
      if (pa !== pb) return pb - pa;
    } else if (typeof na === "number" || typeof nb === "number") {
      return typeof na === "number" ? -1 : 1;
    }
    return String(a.numero || "").localeCompare(String(b.numero || ""));
  };
  const todos = [...projetos].sort(ordem);
  return {
    doutores: todos.filter((p) => normalizarTitulacao(p.orientador?.titulacao) === "doutor"),
    geral: todos,
  };
}
