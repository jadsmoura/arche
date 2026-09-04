/**
 * LANÇAR EDITAL PELO PORTAL — o catálogo de editais que a gestão mantém.
 *
 * Pedido do dono (ago/2026): "todos os editais lançamos por aqui. No sistema
 * não tem opção de incluir novos editais. Inclua essa opção nos setores."
 *
 * Até aqui cada edital era uma linha ESCRITA NO CÓDIGO — `EDITAL` em
 * lib/edital.js (graduação), `TURMAS_EM` em lib/em.js (ICEM) e
 * `EDITAIS_MONITORIA` em lib/monitoria.js —, e abrir o ciclo seguinte exigia
 * um deploy. Publicar edital é ato da PROPPEX, não tarefa de quem programa.
 *
 * A ARQUITETURA É A MESMA DO CATÁLOGO DE CURSOS (lib/instituicao.js): o
 * edital cadastrado **muta o array/objeto do código** no arranque e a cada
 * edição, em vez de criar uma segunda fonte. É o que faz os vinte lugares que
 * leem `EDITAL.numero`, `turmaVigente()` ou `editalMonitoriaDe()` enxergarem
 * o edital novo sem que nenhum deles precise ser tocado — e o que impede o
 * sistema de ter duas respostas para "qual é o edital vigente?".
 *
 * O que está no CÓDIGO continua sendo o acervo já publicado: nada é
 * reescrito, só acrescentado. Editar um edital antigo pelo portal é possível
 * (é como se corrige o link de um PDF), mas o padrão é acrescentar.
 *
 * Três regras que o módulo carrega:
 *
 * · O NÚMERO segue a série do setor — 01/AAAA na graduação, 02/AAAA no ICEM,
 *   03/AAAA na monitoria. É por essa série que a vitrine `/ic/` agrupa os
 *   três processos por ano, e é ela que o dono usa nos ofícios.
 *
 * · VIGENTE é UM só por setor. Publicar o edital do ciclo seguinte não pode
 *   deixar dois abertos ao mesmo tempo, e não pode fazer o sistema RECUAR
 *   para um ciclo anterior — daí a régua do ano em `vigenteDe`.
 *
 * · O documento é o PDF: um edital sem o documento existe (a monitoria gera
 *   o dela no próprio ARCHÉ), mas quem tem PDF o publica junto — é ele que a
 *   comunidade baixa.
 */

import { EDITAL, DOCUMENTOS_EDITAIS, RESULTADOS_EDITAIS } from "./edital.js";
import { TURMAS_EM } from "./em.js";
import { EDITAIS_MONITORIA, CRONOGRAMA, VIGENCIA, PRAZOS } from "./monitoria.js";
import { semestreCorrente } from "./datas.js";

const t = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(t(v, 10)) ? t(v, 10) : "");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/* ------------------------------ os setores ------------------------------ */

/**
 * Um edital por setor, com a SÉRIE que o numera e o que cada um precisa
 * declarar. `ciclo` é o vocabulário de cada programa: a graduação e o ICEM
 * correm de setembro a agosto ("2027/2028"); a monitoria é semestral
 * ("2027/1"), e é o semestre civil que a nomeia.
 */
export const SETORES_EDITAL = [
  {
    codigo: "ic", serie: "01", nome: "Iniciação Científica (graduação)",
    sigla: "IC · IT · IE", ciclo: "anual", setorLink: "/pesquisa/ic/",
    orgaoPadrao: "Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária (PROPPEX)",
    ajuda: "Abre o ciclo da graduação: é ele que passa a valer nas submissões, "
      + "na vigência dos planos de trabalho e nos prazos dos relatórios.",
  },
  {
    codigo: "em", serie: "02", nome: "Iniciação Científica no Ensino Médio (ICEM)",
    sigla: "ICEM", ciclo: "anual", setorLink: "/pesquisa/ic/",
    orgaoPadrao: "Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária (PROPPEX)",
    ajuda: "Abre a turma do ICEM: os bolsistas novos entram nela, e é a vigência "
      + "dela que decide o que cada um precisa entregar.",
  },
  {
    codigo: "monitoria", serie: "03", nome: "Monitoria Acadêmica",
    sigla: "MO", ciclo: "semestral", setorLink: "/monitoria/",
    orgaoPadrao: "Pró-Reitoria Acadêmica (PROAC) e Pró-Reitoria de Pós-Graduação, Pesquisa, "
      + "Extensão e Ação Comunitária (PROPPEX)",
    ajuda: "Abre o ciclo da monitoria. O TEXTO do edital continua sendo gerado pelo "
      + "próprio ARCHÉ — anexe o PDF só se ele tiver sido publicado por fora.",
  },
];
export const setorEditalDe = (c) =>
  SETORES_EDITAL.find((s) => s.codigo === String(c || "").toLowerCase()) || null;

const INSTITUICAO_PADRAO = "Centro Universitário Evangélico de Goianésia (UNIEGO)";

/* As oito etapas do cronograma da monitoria, na ordem do edital. O código é
   a chave que `PRAZOS` já usa (mais `vigencia` e `homologacao`, que estão no
   CRONOGRAMA e não em PRAZOS), e o rótulo é o que o edital imprime. */
export const ETAPAS_MONITORIA = [
  ["submissao", "Submissão dos Projetos de Monitoria"],
  ["cadastroMonitor", "Cadastro do monitor indicado (ficha de inscrição)"],
  ["analise", "Análise dos projetos"],
  ["resultado", "Publicação dos resultados"],
  ["vigencia", "Vigência das atividades de monitoria"],
  ["relatorio", "Entrega do Relatório Final"],
  ["validacao", "Avaliação do monitor e validação do relatório"],
  ["homologacao", "Homologação e emissão dos certificados"],
];

/* ------------------------------ normalização ----------------------------- */

/** O ano que o número declara — "01/2027" → 2027. */
export const anoDoNumero = (numero) => {
  const m = String(numero || "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
};

/**
 * O número que vem a seguir na série do setor. Ele é SUGESTÃO, não imposição:
 * a monitoria já numerou 002/2020, 001/2022 e 01/2026 — a série dela é a
 * sequência geral da instituição, e quem sabe o número é quem assina o
 * ofício. O campo fica editável.
 */
export function numeroSugerido(setor, ano) {
  const s = setorEditalDe(setor);
  return s ? `${s.serie}/${ano}` : "";
}

/** O ciclo que o ano implica, no vocabulário do setor. */
export function cicloSugerido(setor, ano, semestre = 1) {
  const s = setorEditalDe(setor);
  if (!s || !ano) return "";
  return s.ciclo === "semestral" ? `${ano}/${semestre === 2 ? 2 : 1}` : `${ano}/${ano + 1}`;
}

/** A vigência que o ciclo implica — setembro a agosto na anual; o semestre civil na semestral. */
export function vigenciaSugerida(setor, ano, semestre = 1) {
  const s = setorEditalDe(setor);
  if (!s || !ano) return { inicio: "", fim: "" };
  if (s.ciclo === "semestral") {
    return semestre === 2
      ? { inicio: `${ano}-07-01`, fim: `${ano}-12-31` }
      : { inicio: `${ano}-01-01`, fim: `${ano}-06-30` };
  }
  return { inicio: `${ano}-09-01`, fim: `${ano + 1}-08-31` };
}

export function normalizarEdital(bruto = {}, { base = null, agora = new Date() } = {}) {
  const b = bruto || {};
  const setor = setorEditalDe(b.setor ?? base?.setor)?.codigo || "";
  const numero = t(b.numero ?? base?.numero, 40);
  const ano = num(b.ano) || anoDoNumero(numero) || null;
  return {
    id: t(b.id ?? base?.id, 40) || `ed-${Math.random().toString(36).slice(2, 10)}`,
    setor,
    numero,
    ano,
    titulo: t(b.titulo ?? base?.titulo, 300),
    orgao: t(b.orgao ?? base?.orgao, 300) || setorEditalDe(setor)?.orgaoPadrao || "",
    instituicao: t(b.instituicao ?? base?.instituicao, 200) || INSTITUICAO_PADRAO,
    ciclo: t(b.ciclo ?? base?.ciclo, 20),
    vigencia: {
      inicio: data(b.vigencia?.inicio ?? base?.vigencia?.inicio),
      fim: data(b.vigencia?.fim ?? base?.vigencia?.fim),
    },
    publicadoEm: data(b.publicadoEm ?? base?.publicadoEm),
    encerrado: (b.encerrado ?? base?.encerrado) === true,
    // o PDF: caminho público (/api/files/<id> ou /ic/docs/…). Vazio é
    // legítimo — a monitoria gera o texto do edital dela no próprio ARCHÉ
    documento: t(b.documento ?? base?.documento, 400),
    documentoNome: t(b.documentoNome ?? base?.documentoNome, 200),
    // o resultado JÁ PUBLICADO por fora (editais antigos que entram como
    // histórico): quando existe, é ele que vale, e o gerador não é chamado
    resultado: t(b.resultado ?? base?.resultado, 400),
    observacao: t(b.observacao ?? base?.observacao, 1000),
    /* SÓ A GRADUAÇÃO: a régua que o `EDITAL` carrega e que muda o comportamento
       do ciclo — a janela do currículo pontuado (item 7.3) e os meses de
       vigência em que cada relatório vence (item 11.1.b). Em branco, ficam os
       do edital anterior: é o caso comum, porque de um ano para o outro o
       edital repete a régua e muda as datas. */
    producaoDe: num(b.producaoDe ?? base?.producaoDe),
    producaoAte: num(b.producaoAte ?? base?.producaoAte),
    relatorios: {
      parcial: num(b.relatorios?.parcial ?? base?.relatorios?.parcial),
      final: num(b.relatorios?.final ?? base?.relatorios?.final),
    },
    /* SÓ A MONITORIA: o cronograma do ciclo. Sem ele, o edital lançado
       ficaria listado com os prazos do ciclo anterior — submissão fechada
       antes de abrir, relatório vencido no dia em que o edital sai. */
    prazos: Object.fromEntries(ETAPAS_MONITORIA.map(([c]) =>
      [c, data(b.prazos?.[c] ?? base?.prazos?.[c])])),
    criadoEm: base?.criadoEm || agora.toISOString(),
    criadoPor: t(base?.criadoPor ?? b.criadoPor, 160),
    atualizadoEm: agora.toISOString(),
  };
}

/** O que falta para o edital poder ser lançado. */
export function faltaNoEdital(e = {}) {
  const s = setorEditalDe(e.setor);
  return [
    !s && "o setor",
    !e.numero && "o número (ex.: 01/2027)",
    !e.ano && "o ano",
    !e.titulo && "o título",
    !e.ciclo && "o ciclo",
    !e.vigencia?.inicio && "o início da vigência",
    !e.vigencia?.fim && "o fim da vigência",
    e.vigencia?.inicio && e.vigencia?.fim && e.vigencia.fim <= e.vigencia.inicio
      && "uma vigência que termine depois de começar",
  ].filter(Boolean);
}

/* --------------------------- o que fica vigente -------------------------- */

/**
 * O edital VIGENTE de um setor entre os cadastrados: o mais recente que não
 * foi encerrado. Empate de ano resolve pelo cadastro mais novo — dois editais
 * abertos no mesmo ano é anomalia, e nesse caso vale o último lançado.
 */
export function vigenteDe(editais, setor) {
  return (editais || [])
    .filter((e) => e.setor === setor && !e.encerrado && e.ano)
    .sort((a, b) => (a.ano - b.ano) || String(a.criadoEm).localeCompare(String(b.criadoEm)))
    .at(-1) || null;
}

/* --------------------- aplicação nos catálogos do código -----------------
   Mutação, não cópia: é o que faz `EDITAL.numero`, `turmaVigente()` e
   `editalMonitoriaDe()` responderem certo em todo o sistema sem que nenhum
   dos seus leitores precise saber que existe um cadastro. Idempotente — a
   segunda passada não duplica nada.

   O RETRATO DO CÓDIGO é guardado na primeira chamada: sem ele, remover um
   edital cadastrado deixaria o `EDITAL` mutado para sempre, e só um deploy o
   devolveria ao que o arquivo diz. */
let BASE_IC = null;
let BASE_MON = null;

export function aplicarEditais(editais = []) {
  if (!BASE_IC) BASE_IC = { ...EDITAL, vigencia: { ...EDITAL.vigencia }, relatorios: { ...EDITAL.relatorios } };
  if (!BASE_MON) BASE_MON = { prazos: { ...PRAZOS }, vigencia: { ...VIGENCIA },
    cronograma: CRONOGRAMA.map((x) => ({ ...x })) };
  const aplicados = { ic: null, em: 0, monitoria: 0, documentos: 0 };

  // 1. o PDF de cada edital entra no catálogo de documentos (é o que a guia
  //    e a vitrine leem) — vale para os três setores
  for (const e of editais) {
    if (!e.numero) continue;
    if (e.documento) { DOCUMENTOS_EDITAIS[e.numero] = e.documento; aplicados.documentos++; }
    if (e.resultado) RESULTADOS_EDITAIS[e.numero] = e.resultado;
  }

  // 2. GRADUAÇÃO: o vigente cadastrado assume o `EDITAL`. Nunca RECUA — se o
  //    cadastro trouxer um ano anterior ao do código, o do código continua
  const ic = vigenteDe(editais, "ic");
  if (ic && (anoDoNumero(BASE_IC.numero) || 0) <= (ic.ano || 0)) {
    EDITAL.numero = ic.numero;
    EDITAL.titulo = ic.titulo || BASE_IC.titulo;
    EDITAL.vigencia = { inicio: ic.vigencia.inicio, fim: ic.vigencia.fim };
    EDITAL.meses = mesesEntre(ic.vigencia.inicio, ic.vigencia.fim) || BASE_IC.meses;
    // régua em branco repete a do edital anterior: de um ano para o outro o
    // edital costuma manter a régua e mudar as datas
    EDITAL.producaoDe = ic.producaoDe ?? BASE_IC.producaoDe;
    EDITAL.producaoAte = ic.producaoAte ?? BASE_IC.producaoAte;
    EDITAL.relatorios = {
      parcial: ic.relatorios?.parcial ?? BASE_IC.relatorios.parcial,
      final: ic.relatorios?.final ?? BASE_IC.relatorios.final,
    };
    aplicados.ic = ic.numero;
  } else {
    Object.assign(EDITAL, {
      numero: BASE_IC.numero, titulo: BASE_IC.titulo,
      vigencia: { ...BASE_IC.vigencia }, meses: BASE_IC.meses,
      producaoDe: BASE_IC.producaoDe, producaoAte: BASE_IC.producaoAte,
      relatorios: { ...BASE_IC.relatorios },
    });
  }

  // 3. ICEM: cada edital cadastrado é uma TURMA. Casa pelo ciclo (a chave de
  //    `turmaDe`) e, na falta, pelo número do edital
  for (const e of editais.filter((x) => x.setor === "em")) {
    const i = TURMAS_EM.findIndex((x) => x.ciclo === e.ciclo || x.edital === e.numero);
    const turma = {
      ciclo: e.ciclo, edital: e.numero,
      vigencia: { inicio: e.vigencia.inicio, fim: e.vigencia.fim },
      encerrada: !!e.encerrado,
      documento: e.documento || null,
      resultado: e.resultado || null,
    };
    if (i >= 0) TURMAS_EM[i] = { ...TURMAS_EM[i], ...turma };
    else TURMAS_EM.push(turma);
    aplicados.em++;
  }
  TURMAS_EM.sort((a, b) => String(a.ciclo).localeCompare(String(b.ciclo)));

  // 4. MONITORIA: entra no catálogo com o vocabulário dele (serie, orgao,
  //    instituicao) — é o que o PDF do edital e a vitrine imprimem
  for (const e of editais.filter((x) => x.setor === "monitoria")) {
    const i = EDITAIS_MONITORIA.findIndex((x) => x.numero === e.numero);
    const item = {
      numero: e.numero, serie: e.numero, ano: e.ano, ciclo: e.ciclo,
      titulo: e.titulo, orgao: e.orgao, instituicao: e.instituicao,
      documento: e.documento || null,
      publicadoEm: e.publicadoEm || "",
      encerrado: !!e.encerrado,
      observacao: e.observacao || "",
    };
    if (i >= 0) EDITAIS_MONITORIA[i] = { ...EDITAIS_MONITORIA[i], ...item };
    else EDITAIS_MONITORIA.unshift(item);   // o catálogo vai do mais novo ao mais antigo
    aplicados.monitoria++;
  }
  EDITAIS_MONITORIA.sort((a, b) => String(b.ciclo || b.ano).localeCompare(String(a.ciclo || a.ano)));

  /* 5. MONITORIA — o CRONOGRAMA do ciclo corrente. Só o edital do semestre
        de agora manda: um edital lançado com meses de antecedência não pode
        fechar a submissão do ciclo que está correndo. Sem edital do ciclo
        corrente no cadastro, valem os prazos do código. */
  const doCiclo = editais.find((e) => e.setor === "monitoria" && e.ciclo === semestreCorrente()
    && Object.values(e.prazos || {}).some(Boolean));
  if (doCiclo) {
    for (const [codigo] of ETAPAS_MONITORIA) {
      if (codigo === "vigencia" || codigo === "homologacao") continue;   // não vivem em PRAZOS
      if (doCiclo.prazos[codigo]) PRAZOS[codigo] = doCiclo.prazos[codigo];
    }
    if (doCiclo.vigencia.inicio) VIGENCIA.inicio = doCiclo.vigencia.inicio;
    if (doCiclo.vigencia.fim) VIGENCIA.fim = doCiclo.vigencia.fim;
    for (const [i, [codigo]] of ETAPAS_MONITORIA.entries()) {
      const quando = codigo === "vigencia" ? doCiclo.vigencia.fim : doCiclo.prazos[codigo];
      if (CRONOGRAMA[i] && quando) CRONOGRAMA[i].ate = quando;
    }
    aplicados.cronograma = doCiclo.numero;
  } else {
    Object.assign(PRAZOS, BASE_MON.prazos);
    Object.assign(VIGENCIA, BASE_MON.vigencia);
    BASE_MON.cronograma.forEach((x, i) => { if (CRONOGRAMA[i]) CRONOGRAMA[i].ate = x.ate; });
  }

  return aplicados;
}

/** Meses inteiros entre duas datas ISO — é o `meses` da vigência do plano. */
export function mesesEntre(inicio, fim) {
  if (!data(inicio) || !data(fim)) return 0;
  const a = new Date(inicio + "T12:00:00Z"), b = new Date(fim + "T12:00:00Z");
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return m > 0 ? m + (b.getUTCDate() >= a.getUTCDate() - 1 ? 1 : 0) : 0;
}

/**
 * O que já existe no CÓDIGO, para a tela mostrar o acervo inteiro num lugar
 * só — e para o cadastro não repetir o que já está publicado. Vem marcado
 * com `doCodigo`, que é o que impede a tela de oferecer "editar" num item
 * que não está no cadastro.
 */
/* O RETRATO é tirado no CARREGAMENTO do módulo, antes de qualquer mutação:
   `aplicarEditais` escreve nos mesmos catálogos, e ler depois faria o edital
   cadastrado aparecer como se estivesse no código — a tela ofereceria
   "editar" num item que o cadastro não tem. */
const ACERVO_DO_CODIGO = [
  ...Object.keys(DOCUMENTOS_EDITAIS).filter((n) => /^01\//.test(n)).map((numero) => ({
    setor: "ic", numero, ano: anoDoNumero(numero), documento: DOCUMENTOS_EDITAIS[numero],
    resultado: RESULTADOS_EDITAIS[numero] || "",
    titulo: `Edital ${numero} — Iniciação Científica, Inovação Tecnológica e Iniciação à Extensão`,
  })),
  ...TURMAS_EM.map((t) => ({
    setor: "em", numero: t.edital, ano: anoDoNumero(t.edital), ciclo: t.ciclo,
    documento: t.documento || "", resultado: t.resultado || "", encerrado: !!t.encerrada,
    vigencia: { ...t.vigencia }, titulo: `Edital ${t.edital} — ICEM, turma ${t.ciclo}`,
  })),
  ...EDITAIS_MONITORIA.map((e) => ({
    setor: "monitoria", numero: e.numero, ano: e.ano, ciclo: e.ciclo,
    documento: e.documento || "", encerrado: !!e.encerrado, titulo: e.titulo, orgao: e.orgao,
  })),
].map((e) => ({ ...e, doCodigo: true }));

export const editaisDoCodigo = () => ACERVO_DO_CODIGO.map((e) => ({ ...e }));
