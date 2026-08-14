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
  { codigo: "pbic-uniego", nome: "PBIC/UNIEGO", linha: "ic", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "mestre", desc: "Bolsa de IC do UNIEGO" },
  { codigo: "pbiti-uniego", nome: "PBITI/UNIEGO", linha: "it", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "mestre", desc: "Bolsa de Iniciação Tecnológica do UNIEGO" },
  { codigo: "pbie-uniego", nome: "PBIE/UNIEGO", linha: "ie", bolsa: true, fomento: "uniego",
    valor: 350, titulacaoMinima: "especialista", desc: "Bolsa de Iniciação à Extensão do UNIEGO" },
  { codigo: "pvic-uniego", nome: "PVIC/UNIEGO", linha: "ic", bolsa: false, fomento: "",
    valor: 0, titulacaoMinima: "especialista", desc: "IC voluntária, sem bolsa" },
  { codigo: "pviti-uniego", nome: "PVITI/UNIEGO", linha: "it", bolsa: false, fomento: "",
    valor: 0, titulacaoMinima: "especialista", desc: "Iniciação Tecnológica voluntária, sem bolsa" },
  { codigo: "pvie-uniego", nome: "PVIE/UNIEGO", linha: "ie", bolsa: false, fomento: "",
    valor: 0, titulacaoMinima: "especialista", desc: "Iniciação à Extensão voluntária, sem bolsa" },
];
export const modalidadeDe = (c) =>
  MODALIDADES.find((m) => m.codigo === String(c || "").toLowerCase()) || null;
export const modalidadesDaLinha = (linha) => MODALIDADES.filter((m) => m.linha === linha);

// Os códigos curtos que o ARCHÉ usou antes do edital entrar no sistema.
const HERANCA = { pibic: "pibic-cnpq", pibiti: "pibiti-cnpq", voluntaria: "pvic-uniego" };
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
  return MODALIDADES.find((m) => m.linha === linha
    && (f === "voluntario" ? !m.bolsa : m.bolsa && m.fomento === f)) || null;
}

/* --------------------- grupos de pesquisa (DGP/CNPq) --------------------- */
// Grupos certificados pelo UNIEGO no Diretório de Grupos de Pesquisa do
// CNPq. Só o nome: a proposta se diz vinculada a um grupo, e não se exige
// que quem submete seja o líder dele.
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
    codigo: "orientacoes", nome: "Orientações", teto: 30,
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
    codigo: "bibliografica", nome: "Produção bibliográfica", teto: 60,
    itens: [
      { codigo: "art-a1", nome: "Artigo completo em periódico Qualis A1", peso: 4 },
      { codigo: "art-a2", nome: "Artigo completo em periódico Qualis A2", peso: 3.7 },
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
    codigo: "bancas", nome: "Participação em bancas e eventos", teto: 10,
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
export const PONTUACAO_MAXIMA = BLOCOS_PRODUCAO.reduce((s, b) => s + b.teto, 0);   // 100

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
    return { codigo: b.codigo, nome: b.nome, teto: b.teto, bruto: arred(bruto), pontos: arred(Math.min(bruto, b.teto)) };
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

/* -------------------- classificação das propostas ------------------------ */
/**
 * Item 9.4: NFC = (NP × 0,6) + (CL × 0,4), ambos de 0 a 10.
 * NP é a média dos pareceristas; CL vem da planilha de produção, que é de
 * 0 a 100 — daí a divisão por 10.
 */
export function notaClassificacao({ notaPareceres, pontuacaoProducao } = {}) {
  const np = Number(notaPareceres);
  const cl = Number(pontuacaoProducao);
  const temNp = Number.isFinite(np), temCl = Number.isFinite(cl);
  if (!temNp && !temCl) return null;
  const clDez = temCl ? Math.min(cl, PONTUACAO_MAXIMA) / 10 : 0;
  return {
    np: temNp ? arred(np) : null,
    cl: arred(clDez),
    nfc: arred((temNp ? np : 0) * 0.6 + clDez * 0.4),
  };
}
