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
 * · O NÚMERO é EMITIDO PELO SERVIDOR, na ordem em que os editais são criados
 *   (decisão do dono, ago/2026: "numerados na ordem em que são criados").
 *   É `NN/AAAA`, e a sequência é **do ÓRGÃO**: "a numeração da PROPPEX e da
 *   PROAC devem ser independentes, cada uma com a sua" — são duas
 *   pró-reitorias que expedem e assinam os próprios atos, e uma sequência
 *   comum faria o número de uma pular por causa do ato da outra. Conta o
 *   acervo já publicado, e recomeça a cada ano. Não se digita, pela mesma
 *   razão do Número da Ação da Extensão: duas pessoas lançando ao mesmo
 *   tempo leriam o mesmo número e emitiriam o mesmo.
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
const PROPPEX = "Pró-Reitoria de Pós-Graduação, Pesquisa, Extensão e Ação Comunitária (PROPPEX)";
const PROAC = "Pró-Reitoria Acadêmica (PROAC)";

/* TODO SETOR LANÇA O SEU EDITAL (pedido do dono, ago/2026: "permita a todos
   os setores lançar editais; e estes devem aparecer na página de editais").
   Os três primeiros CONDUZEM um ciclo — o edital deles reescreve a régua do
   programa (`aplicarEditais` abaixo); os demais são editais como qualquer
   outro documento institucional: existem, aparecem no setor e na página
   pública, e o PDF é o que a comunidade baixa. */
export const SETORES_EDITAL = [
  { codigo: "ic", nome: "Pesquisa · Iniciação Científica (graduação)", sigla: "IC · IT · IE",
    grupo: "Pesquisa", ciclo: "anual", exigeCiclo: true, setorLink: "/pesquisa/ic/",
    orgaoSeq: "proppex", orgaoPadrao: PROPPEX,
    ajuda: "Abre o ciclo da graduação: é ele que passa a valer nas submissões, "
      + "na vigência dos planos de trabalho e nos prazos dos relatórios." },
  { codigo: "em", nome: "Pesquisa · IC no Ensino Médio (ICEM)", sigla: "ICEM",
    grupo: "Pesquisa", ciclo: "anual", exigeCiclo: true, setorLink: "/pesquisa/ic/",
    orgaoSeq: "proppex", orgaoPadrao: PROPPEX,
    ajuda: "Abre a turma do ICEM: os bolsistas novos entram nela, e é a vigência "
      + "dela que decide o que cada um precisa entregar." },
  { codigo: "monitoria", nome: "Ensino · Monitoria Acadêmica", sigla: "MO",
    grupo: "Ensino", ciclo: "semestral", exigeCiclo: true, setorLink: "/monitoria/",
    orgaoSeq: "proac", orgaoPadrao: `${PROAC} e ${PROPPEX}`,
    ajuda: "Abre o ciclo da monitoria: o cronograma abaixo passa a ser o que o sistema cobra." },
  { codigo: "inovacao", nome: "Pesquisa · Inovação Tecnológica", sigla: "INOV",
    grupo: "Pesquisa", ciclo: "livre", setorLink: "/pesquisa/ic/", orgaoSeq: "proppex", orgaoPadrao: PROPPEX,
    ajuda: "Chamada da Inovação — o documento existe no setor e na página pública de editais." },
  { codigo: "extensao", nome: "Extensão", sigla: "EX",
    grupo: "Extensão", ciclo: "livre", setorLink: "/extensao/", orgaoSeq: "proppex", orgaoPadrao: PROPPEX,
    ajuda: "Edital da Extensão — chamadas de ações, cursos livres e programas." },
  { codigo: "eventos", nome: "Extensão · Eventos", sigla: "EV",
    grupo: "Extensão", ciclo: "livre", setorLink: "/eventos/gestao", orgaoSeq: "proppex", orgaoPadrao: PROPPEX,
    ajuda: "Chamada de eventos — submissão de trabalhos, seleção de propostas, apoio." },
  { codigo: "ensino", nome: "Ensino · PROAC", sigla: "PROAC",
    grupo: "Ensino", ciclo: "livre", setorLink: "/praticas/", orgaoSeq: "proac", orgaoPadrao: PROAC,
    ajuda: "Edital da Pró-Reitoria Acadêmica — ensino, atividades curriculares e programas." },
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

/** A ordem que o número declara — "03/2027" → 3; "002/2020" → 2. */
export const ordemDoNumero = (numero) => {
  const m = String(numero || "").match(/^\s*(\d{1,3})\s*\//);
  return m ? Number(m[1]) : 0;
};

/**
 * O PRÓXIMO NÚMERO do ano, na sequência geral da instituição — a ordem em que
 * os editais são criados (decisão do dono, ago/2026). Conta o acervo já
 * publicado junto com o cadastro: em 2026 o acervo tem 01, 02 e 03, então o
 * próximo lançado naquele ano é o 04.
 *
 * Quem emite é o SERVIDOR, dentro da mesma leitura que grava — é a régua do
 * Número da Ação da Extensão, pelo mesmo motivo: duas coordenações lançando
 * ao mesmo tempo leriam o mesmo número e emitiriam o mesmo.
 */
export function proximoNumero(ano, existentes = [], orgao = "proppex") {
  const usados = existentes
    .filter((e) => (e.ano || anoDoNumero(e.numero)) === ano && orgaoDoSetor(e.setor) === orgao)
    .map((e) => ordemDoNumero(e.numero));
  const n = Math.max(0, ...usados) + 1;
  return `${String(n).padStart(2, "0")}/${ano}`;
}

/**
 * A DESIGNAÇÃO completa do edital: com a numeração independente por
 * pró-reitoria, o número sozinho deixou de identificar o documento — o
 * "03/2027" da PROPPEX e o da PROAC são dois editais diferentes. É a sigla do
 * órgão que os separa, e é assim que o ofício os escreve.
 */
export const designacaoDoEdital = (e) =>
  `Edital ${orgaoDoSetor(e?.setor).toUpperCase()} nº ${e?.numero || ""}`.trim();

/** Os órgãos que numeram — cada um com a sua sequência. */
export const ORGAOS_EDITAL = [
  { codigo: "proppex", nome: "PROPPEX", extenso: PROPPEX },
  { codigo: "proac", nome: "PROAC", extenso: PROAC },
];
export const orgaoDoSetor = (setor) => setorEditalDe(setor)?.orgaoSeq || "proppex";

/** O ciclo que o ano implica, no vocabulário do setor. */
export function cicloSugerido(setor, ano, semestre = 1) {
  const s = setorEditalDe(setor);
  if (!s || !ano) return "";
  if (s.ciclo === "semestral") return `${ano}/${semestre === 2 ? 2 : 1}`;
  if (s.ciclo === "livre") return String(ano);   // edital avulso: o ciclo é o ano
  return `${ano}/${ano + 1}`;
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
  // edital avulso: o ano civil, que é o que a chamada costuma cobrir
  if (s.ciclo === "livre") return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  return { inicio: `${ano}-09-01`, fim: `${ano + 1}-08-31` };
}

/* O CAMINHO DO DOCUMENTO É UMA LISTA FECHADA (revisão adversarial, set/2026):
   `documento` e `resultado` entravam como texto livre, e saem como `href` na
   vitrine PÚBLICA e na guia da gestão — um `javascript:` gravado por um
   coordenador rodava na sessão de quem clicasse (do visitante anônimo ao
   gestor geral, que abre a mesma guia), e um `https://` externo em
   `resultado` fazia o endereço oficial do resultado da IC redirecionar para
   fora. `esc()` não neutraliza URL. Só passa o que o próprio portal serve:
   o arquivo enviado (/api/files/…) e o acervo publicado (/ic/docs/…). */
const CAMINHO_PUBLICO = /^\/(api\/files\/[A-Za-z0-9_\-./]{1,200}|(ic|pesquisa)\/docs\/[\w.-]{1,120}\.pdf)$/;
export const caminhoPublico = (v) => {
  const s = t(v, 400);
  // ".." e "//" não são caminho de arquivo do portal — são tentativa de sair dele
  if (!CAMINHO_PUBLICO.test(s) || /(^|\/)\.\.(\/|$)|\/\//.test(s)) return "";
  return s;
};

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
    documento: caminhoPublico(b.documento ?? base?.documento),
    documentoNome: t(b.documentoNome ?? base?.documentoNome, 200),
    // o resultado JÁ PUBLICADO por fora (editais antigos que entram como
    // histórico): quando existe, é ele que vale, e o gerador não é chamado
    resultado: caminhoPublico(b.resultado ?? base?.resultado),
    observacao: t(b.observacao ?? base?.observacao, 1000),
    /* O TEXTO do edital, escrito no portal: quando existe, o ARCHÉ gera o PDF
       no layout institucional em vez de esperar um arquivo anexado. */
    corpo: t(b.corpo ?? base?.corpo, 60000),
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
    setorEditalDe(e.setor)?.exigeCiclo && !e.ciclo && "o ciclo",
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
/* O RETRATO TAMBÉM DAS LISTAS (revisão adversarial, set/2026): só EDITAL e o
   cronograma tinham retrato — TURMAS_EM, EDITAIS_MONITORIA e os dois mapas de
   documentos só cresciam. Excluir a turma "2027/2028" recém-lançada a deixava
   no array, e `turmaVigente()` (a mais recente aberta) devolvia justamente ELA:
   o bolsista novo caía numa turma que o cadastro não tinha mais. Editar o
   ciclo ou o número deixava a entrada antiga como fantasma. Agora cada
   aplicação RECONSTRÓI as listas a partir do retrato + cadastro, mutando no
   lugar (splice/delete) para as referências importadas continuarem válidas. */
let BASE_LISTAS = null;

export function aplicarEditais(editais = []) {
  if (!BASE_IC) BASE_IC = { ...EDITAL, vigencia: { ...EDITAL.vigencia }, relatorios: { ...EDITAL.relatorios } };
  if (!BASE_MON) BASE_MON = { prazos: { ...PRAZOS }, vigencia: { ...VIGENCIA },
    cronograma: CRONOGRAMA.map((x) => ({ ...x })) };
  if (!BASE_LISTAS) BASE_LISTAS = {
    turmas: TURMAS_EM.map((x) => ({ ...x, vigencia: { ...(x.vigencia || {}) } })),
    monitoria: EDITAIS_MONITORIA.map((x) => ({ ...x })),
    documentos: { ...DOCUMENTOS_EDITAIS },
    resultados: { ...RESULTADOS_EDITAIS },
  };
  // volta ao retrato antes de aplicar: é o que faz remover e editar valerem
  TURMAS_EM.splice(0, TURMAS_EM.length, ...BASE_LISTAS.turmas.map((x) => ({ ...x, vigencia: { ...x.vigencia } })));
  EDITAIS_MONITORIA.splice(0, EDITAIS_MONITORIA.length, ...BASE_LISTAS.monitoria.map((x) => ({ ...x })));
  for (const k of Object.keys(DOCUMENTOS_EDITAIS)) delete DOCUMENTOS_EDITAIS[k];
  for (const k of Object.keys(RESULTADOS_EDITAIS)) delete RESULTADOS_EDITAIS[k];
  Object.assign(DOCUMENTOS_EDITAIS, BASE_LISTAS.documentos);
  Object.assign(RESULTADOS_EDITAIS, BASE_LISTAS.resultados);
  const aplicados = { ic: null, em: 0, monitoria: 0, documentos: 0 };

  /* 1. O PDF entra no catálogo de documentos da GRADUAÇÃO — e só dela. Esses
        dois mapas são chaveados pelo NÚMERO, e com a numeração independente
        por pró-reitoria (decisão do dono, ago/2026) o mesmo "03/2027" pode
        existir na PROPPEX e na PROAC: pôr todos ali faria um sobrescrever o
        outro. O ICEM guarda o documento na turma e a monitoria no catálogo
        dela — cada um no seu lugar, sem chave compartilhada. */
  for (const e of editais.filter((x) => x.setor === "ic")) {
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
  /* Edital ENCERRADO não manda no cronograma, e entre dois abertos do mesmo
     ciclo vale o mais recente (revisão adversarial, set/2026): o `find` pegava
     o primeiro da lista — que podia ser o que a própria gestão acabara de
     tirar de circulação —, e a submissão fechava na data errada. */
  const doCiclo = editais
    .filter((e) => e.setor === "monitoria" && !e.encerrado && e.ciclo === semestreCorrente()
      && Object.values(e.prazos || {}).some(Boolean))
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)))
    .at(-1);
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

/* ================== O TEXTO DO EDITAL, ESCRITO NO PORTAL ==================
   Pergunta do dono (ago/2026): "gosto muito do layout dos docs que você gera,
   como relatórios e resultados. Novos editais podem seguir aquele layout, ou
   você só consegue se eu enviar aqui no chat?"

   Podem — e sem passar por mim. O edital da monitoria já sai do próprio ARCHÉ
   (`TEXTO_EDITAL` + `gerarEditalMonitoriaPdf`), mas o texto dele mora no
   CÓDIGO. O que faltava era a gestão poder ESCREVER o texto do edital pelo
   portal e receber o mesmo documento: timbre da pró-reitoria, caixa do
   número, seções em faixa, cronograma em quadro e as assinaturas do banco.

   O texto se escreve como o edital é escrito — e é essa a razão de a régua
   ser esta, e não um formulário de campos: a coordenação COLA o que já
   redigiu no Word e o documento sai formatado.

     Parágrafo solto antes da primeira seção  → abertura (o preâmbulo)
     1. DAS DISPOSIÇÕES PRELIMINARES          → título de seção
     1.1. O presente edital estabelece…       → item numerado
     a) requisito                             → alínea do item anterior
     I. inciso                                → inciso do item anterior

   Nada aqui INVENTA numeração: o que sai impresso é o que a pessoa escreveu.
   Renumerar por conta própria faria o PDF divergir do texto que a
   pró-reitoria aprovou — e é o PDF que circula. */
const RE_SECAO = /^(\d{1,2})\.\s+(.+)$/;              // "1. DAS DISPOSIÇÕES"
const RE_ITEM = /^(\d{1,2}(?:\.\d{1,2})+\.?)\s+(.+)$/; // "1.1. texto" / "1.1.2 texto"
const RE_ALINEA = /^([a-z])\)\s+(.+)$/;                // "a) texto"
const RE_INCISO = /^([IVX]{1,5})[.)]\s+(.+)$/;         // "I. texto"

export function analisarTextoEdital(texto = "") {
  const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim());
  const abertura = [];
  const secoes = [];
  let secao = null, item = null;
  for (const l of linhas) {
    if (!l) continue;
    const mSec = l.match(RE_SECAO);
    const mIt = l.match(RE_ITEM);
    // "1.1." casa com as duas expressões: o ITEM vence, porque é mais específico
    if (mIt) {
      if (!secao) { secao = { titulo: "", itens: [] }; secoes.push(secao); }
      item = { n: mIt[1].replace(/\.?$/, "."), texto: mIt[2], alineas: [], romanos: [] };
      secao.itens.push(item);
      continue;
    }
    if (mSec) {
      secao = { titulo: `${mSec[1]}. ${mSec[2]}`, itens: [] };
      secoes.push(secao); item = null;
      continue;
    }
    /* O RÓTULO É O QUE A PESSOA ESCREVEU (revisão adversarial, set/2026): as
       alíneas guardavam só o texto, e o PDF renumerava "a) b) d)" — alínea
       revogada de propósito — como "a) b) c)", e o inciso XIII saía em
       arábico. Contradizia a regra deste módulo ("nada renumera"). Cada
       alínea e inciso guardam `{ r, t }`: o rótulo original e o texto. */
    const mAl = l.match(RE_ALINEA);
    if (mAl && item) { item.alineas.push({ r: `${mAl[1]})`, t: mAl[2] }); continue; }
    const mIn = l.match(RE_INCISO);
    if (mIn && item) { item.romanos.push({ r: `${mIn[1]}.`, t: mIn[2] }); continue; }
    // linha solta: antes da primeira seção é preâmbulo; depois, continuação
    // do que está aberto — a ÚLTIMA alínea/inciso quando há (uma alínea
    // quebrada em duas linhas na colagem voltava a ser impressa ANTES das
    // alíneas, mudando a ordem do documento), senão o item
    if (!secao) { abertura.push(l); continue; }
    if (item) {
      const ultimo = item.romanos.at(-1) || item.alineas.at(-1);
      if (ultimo) ultimo.t += ` ${l}`;
      else item.texto += `\n${l}`;
    } else { item = { n: "", texto: l, alineas: [], romanos: [] }; secao.itens.push(item); }
  }
  return { abertura: abertura.join("\n"), secoes };
}

/** O edital tem texto próprio para gerar? (vazio = só o PDF anexado vale) */
export const temTextoDeEdital = (e) => analisarTextoEdital(e?.corpo).secoes.length > 0;
