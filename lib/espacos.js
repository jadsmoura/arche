/**
 * ARCHÉ ES — Reserva de Espaços Acadêmicos.
 *
 * O problema é de agenda, não de cadastro: auditório, quadra, mini auditórios
 * e sala de transmissão são poucos e disputados, e a reserva vivia em conversa
 * de WhatsApp e caderno na recepção. Duas turmas chegando ao mesmo auditório no
 * mesmo horário é o desfecho previsível disso — e o custo cai sobre quem
 * organizou, não sobre quem anotou errado.
 *
 * Três decisões estruturam o módulo (dono, ago/2026):
 *
 * 1. **Espaço ocupado trava o pedido** — não é aviso, é recusa. Quem barra é o
 *    servidor, dentro da fila de escrita, porque duas pessoas pedindo ao mesmo
 *    tempo é justamente o caso em que a conferência da tela não vale nada. O
 *    calendário público existe para o engano não chegar até aqui.
 * 2. **Uma solicitação pede VÁRIOS espaços** — evento grande toma o campus
 *    inteiro por uma semana, e obrigar a abrir doze pedidos seria transformar
 *    um ato em doze. Por isso o pedido tem itens, e um PERÍODO de datas.
 * 3. **Nem todo espaço é único.** Auditório é um só: sobrepor é conflito. Sala
 *    de aula existe às dezenas — pedir cinco salas no bloco C não colide com
 *    quem pediu três. E a sala de reuniões da coordenação é uma POR CURSO: o
 *    conflito ali é pelo complemento, não pelo espaço. `conflito` no catálogo
 *    diz de qual dos três tipos cada espaço é.
 *
 * O catálogo é editável pela gestão: prédio novo, sala que muda de nome e
 * auditório em reforma são fato corriqueiro, e nenhum deles pode exigir um
 * deploy. Os `id` são a chave do que já está reservado — nunca renomeie um id,
 * crie outro espaço.
 */

import { hojeLocalISO } from "./datas.js";

/* --------------------------- catálogo semente ---------------------------
   Os espaços que a PROPPEX levantou no arranque (ago/2026). Vão ao estado na
   primeira subida; a partir dali quem manda é o registro gravado.

   `conflito`:
     unico       — há um só: sobreposição é choque (auditório, quadra…)
     por-detalhe — um por complemento: choca com quem pediu o MESMO complemento
                   (a sala de reuniões da coordenação de Enfermagem)
     multiplo    — existem várias unidades: sobreposição vira aviso, não trava
                   (salas de aula, laboratórios) */
export const ESPACOS_PADRAO = [
  { id: "auditorio-bloco-a", nome: "Auditório", local: "Bloco A", capacidade: 400, cor: "#2f6fb5",
    conflito: "unico", recursos: "Palco, som, projeção, ar-condicionado" },
  { id: "area-convivencia", nome: "Área de Convivência", local: "Campus", capacidade: 300, cor: "#3f8a5d",
    conflito: "unico", recursos: "Área aberta, ponto de energia" },
  { id: "quadra-esportes", nome: "Quadra de Esportes", local: "Área esportiva", capacidade: 300, cor: "#c0453c",
    conflito: "unico", recursos: "Arquibancada, vestiários" },
  { id: "mini-auditorio-bloco-a", nome: "Mini Auditório — Sala 100", local: "Bloco A", capacidade: 60, cor: "#7aa5d2",
    conflito: "unico", recursos: "Projeção, ar-condicionado" },
  { id: "mini-auditorio-1-bloco-e", nome: "Mini Auditório 1", local: "Bloco E", capacidade: 60, cor: "#5e5091",
    conflito: "unico", recursos: "Projeção, ar-condicionado" },
  { id: "mini-auditorio-2-bloco-e", nome: "Mini Auditório 2", local: "Bloco E", capacidade: 60, cor: "#8b7bc4",
    conflito: "unico", recursos: "Projeção, ar-condicionado" },
  { id: "mini-auditorio-3-bloco-e", nome: "Mini Auditório 3", local: "Bloco E", capacidade: 60, cor: "#b3a4e0",
    conflito: "unico", recursos: "Projeção, ar-condicionado" },
  { id: "sala-transmissao-odonto", nome: "Sala de Transmissão Simultânea (Odonto)", local: "Bloco E",
    capacidade: 20, cor: "#0f8f8f", conflito: "unico", recursos: "Câmeras, mesa de som, transmissão ao vivo" },
  { id: "sala-aula", nome: "Sala de Aula", local: "Blocos A a E", capacidade: 0, cor: "#c98a2b",
    conflito: "multiplo", quantidade: true,
    detalhe: { rotulo: "Bloco", tipo: "bloco", obrigatorio: true },
    recursos: "Carteiras, quadro, projeção conforme a sala" },
  { id: "laboratorio-centro-tecnologico", nome: "Laboratório — Centro Tecnológico",
    local: "Centro Tecnológico", capacidade: 0, cor: "#8a6d3b", conflito: "por-detalhe",
    detalhe: { rotulo: "Laboratório", tipo: "texto", obrigatorio: true },
    recursos: "Conforme o laboratório" },
  { id: "sala-reunioes-reitoria", nome: "Sala de Reuniões da Reitoria", local: "Reitoria",
    capacidade: 20, cor: "#1c3742", conflito: "unico", recursos: "Mesa de reunião, projeção" },
  { id: "sala-reunioes-coordenacao", nome: "Sala de Reuniões da Coordenação", local: "Conforme o curso",
    capacidade: 15, cor: "#7c8794", conflito: "por-detalhe",
    detalhe: { rotulo: "Curso", tipo: "curso", obrigatorio: true },
    recursos: "Mesa de reunião" },
];

export const BLOCOS = ["A", "B", "C", "D", "E"];

/** Quem está pedindo — o vínculo, não o papel no sistema. */
export const INTERESSADOS = [
  { codigo: "professor", rotulo: "Professor(a)" },
  { codigo: "coordenador", rotulo: "Coordenação de curso" },
  { codigo: "setor", rotulo: "Setor / pró-reitoria" },
  { codigo: "aluno", rotulo: "Acadêmico(a)" },
  { codigo: "comunidade", rotulo: "Comunidade externa" },
];

/* De QUEM parte o pedido, em lista fechada (pedido do dono, ago/2026): órgão
   escrito à mão não agrupa — "Enfermagem", "Enf." e "Curso de Enfermagem"
   viram três linhas do mesmo curso no relatório de ocupação. Os cursos vêm
   do catálogo institucional; os setores, desta lista; e "outro" continua
   existindo, com texto livre, porque a instituição tem mais recantos do que
   qualquer lista prevê. Preserve os `codigo`: são a chave do que já está
   reservado. */
export const ORGAOS_INSTITUCIONAIS = [
  { codigo: "reitoria", rotulo: "Reitoria" },
  { codigo: "proppex", rotulo: "PROPPEX — Pesquisa, Pós-Graduação, Extensão e Ação Comunitária" },
  { codigo: "proac", rotulo: "PROAC — Pró-Reitoria Acadêmica" },
  { codigo: "secretaria", rotulo: "Secretaria Acadêmica" },
  { codigo: "biblioteca", rotulo: "Biblioteca" },
  { codigo: "cpa", rotulo: "CPA — Comissão Própria de Avaliação" },
  { codigo: "nap", rotulo: "Núcleo de Apoio Psicopedagógico" },
  { codigo: "estagio", rotulo: "Coordenação de Estágio" },
  { codigo: "ti", rotulo: "Tecnologia da Informação" },
  { codigo: "marketing", rotulo: "Marketing e Comunicação" },
  { codigo: "administrativo", rotulo: "Setor Administrativo / Financeiro" },
  { codigo: "dce", rotulo: "Diretório Central dos Estudantes" },
  { codigo: "externo", rotulo: "Instituição ou empresa externa" },
  { codigo: "comunidade", rotulo: "Comunidade externa" },
  { codigo: "outro", rotulo: "Outro" },
];

/** Órgãos que NÃO são da casa: aí o pedido precisa vir por ofício. */
export const ORGAOS_EXTERNOS = ["externo", "comunidade"];

/**
 * O ofício é obrigatório quando o pedido vem de fora (decisão do dono,
 * ago/2026): reserva de espaço para quem não é da instituição é ato que a
 * gestão precisa poder justificar depois, e a palavra de quem digitou o
 * formulário não é documento. De dentro da casa, anexar é opcional.
 */
export const exigeOficio = (r) =>
  r?.interessado === "comunidade" || ORGAOS_EXTERNOS.includes(String(r?.orgao || ""));

/* O fluxo, como o dono o descreveu: o pedido cai para a responsável pela
   reserva; ela confirma, ou encaminha à PROPPEX quando o caso foge do que
   está pré-autorizada a decidir. `encaminhada` existe para esse degrau —
   sem ele, "aguardando" diria a mesma coisa para dois lugares diferentes. */
export const STATUS = ["solicitada", "encaminhada", "confirmada", "recusada", "cancelada"];
export const ROTULO_STATUS = {
  solicitada: "Aguardando a reserva", encaminhada: "Na PROPPEX",
  confirmada: "Confirmada", recusada: "Recusada", cancelada: "Cancelada",
};

/** Só a reserva CONFIRMADA ocupa o espaço — é ela que trava o pedido seguinte. */
export const OCUPA = (r) => r?.status === "confirmada";
/** Reserva viva: vale, ou ainda espera decisão. */
export const VIVA = (r) => ["solicitada", "encaminhada", "confirmada"].includes(r?.status);

const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h) => {
  const [a, b] = String(h || "").split(":");
  return Number(a) * 60 + Number(b);
};
const inteiro = (v) => Math.max(0, Math.round(Number(v) || 0));

export const rotuloInteressado = (c) =>
  INTERESSADOS.find((t) => t.codigo === String(c || ""))?.rotulo || "";

/** A lista suspensa do órgão, em grupos — cursos primeiro, setores depois.
    Os cursos chegam do catálogo institucional; o código deles leva o prefixo
    `curso-` para nunca colidir com um setor de mesmo nome. */
export function gruposDeOrgao(cursos = []) {
  return [
    { grupo: "Cursos", opcoes: (cursos || []).map((c) => ({
      codigo: `curso-${idDeNome(c.slug || c.nome || c)}`, rotulo: c.nome || String(c) })) },
    { grupo: "Setores e órgãos", opcoes: ORGAOS_INSTITUCIONAIS },
  ];
}
export function rotuloOrgao(codigo, cursos = [], orgaoOutro = "") {
  const c = String(codigo || "");
  if (c === "outro") return orgaoOutro || "Outro";
  for (const g of gruposDeOrgao(cursos)) {
    const achou = g.opcoes.find((o) => o.codigo === c);
    if (achou) return achou.rotulo;
  }
  return orgaoOutro || c;      // registro antigo, gravado como texto livre
}
export const codigosDeOrgao = (cursos = []) =>
  gruposDeOrgao(cursos).flatMap((g) => g.opcoes.map((o) => o.codigo));
export const espacoDe = (espacos, id) =>
  (espacos || []).find((e) => e.id === String(id || "")) || null;

/** Como o item se escreve numa linha de agenda: o espaço e o seu complemento. */
export function rotuloItem(espacos, item) {
  const e = espacoDe(espacos, item?.espaco);
  const nome = e ? e.nome : String(item?.espaco || "");
  const partes = [nome];
  if (item?.detalhe) partes.push(item.detalhe);
  else if (e?.local && !e.detalhe) partes.push(e.local);
  const base = partes.join(" — ");
  return item?.quantidade > 1 ? `${base} (${item.quantidade} salas)` : base;
}

/* ------------------------------- espaços -------------------------------- */

export function idDeNome(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function normalizarEspaco(bruto = {}) {
  const nome = texto(bruto.nome, 120);
  const det = bruto.detalhe && texto(bruto.detalhe.rotulo, 60)
    ? { rotulo: texto(bruto.detalhe.rotulo, 60),
        tipo: ["bloco", "curso", "texto"].includes(bruto.detalhe.tipo) ? bruto.detalhe.tipo : "texto",
        obrigatorio: bruto.detalhe.obrigatorio !== false }
    : null;
  return {
    id: texto(bruto.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, "-") || idDeNome(nome),
    nome,
    local: texto(bruto.local, 120),
    capacidade: inteiro(bruto.capacidade),
    conflito: ["unico", "por-detalhe", "multiplo"].includes(bruto.conflito) ? bruto.conflito : "unico",
    // ETIQUETA DE COR (pedido do dono, ago/2026): no calendário cheio, a cor
    // é o que faz "o auditório está livre nesse dia" ser uma olhada e não uma
    // leitura. Cor inválida cai no cinza da marca — nunca quebra o desenho.
    cor: /^#[0-9a-fA-F]{6}$/.test(String(bruto.cor || "")) ? String(bruto.cor) : "#40717e",
    quantidade: bruto.quantidade === true,
    ...(det ? { detalhe: det } : {}),
    recursos: texto(bruto.recursos, 400),
    // espaço em reforma sai da escolha SEM sumir da agenda: as reservas
    // antigas continuam sendo o histórico dele
    ativo: bruto.ativo !== false,
    observacao: texto(bruto.observacao, 400),
  };
}

/** O catálogo, sem id repetido — dois espaços com o mesmo id fariam a agenda
    de um aparecer no outro. */
export function normalizarEspacos(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map(normalizarEspaco)
    .filter((e) => e.id && e.nome && !vistos.has(e.id) && vistos.add(e.id));
}

/* ------------------------------- reservas ------------------------------- */

/** O ofício anexado ao pedido. Só vale com link — anexo sem endereço é
    promessa de documento, e a gestão precisa poder abri-lo. */
export function normalizarOficio(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const link = texto(bruto.link, 500);
  if (!link) return null;
  return {
    nome: texto(bruto.nome || bruto.name, 200) || "oficio",
    link,
    fileId: texto(bruto.fileId, 120),
    tipo: texto(bruto.tipo, 120),
    tamanho: inteiro(bruto.tamanho || bruto.size),
    enviadoEm: texto(bruto.enviadoEm, 40) || new Date().toISOString(),
    enviadoPor: texto(bruto.enviadoPor, 160).toLowerCase(),
  };
}

export function normalizarItem(bruto = {}, espacos = []) {
  const e = espacoDe(espacos, bruto.espaco);
  return {
    espaco: texto(bruto.espaco, 60),
    detalhe: e?.detalhe ? texto(bruto.detalhe, 120) : "",
    quantidade: e?.quantidade ? Math.max(1, inteiro(bruto.quantidade) || 1) : 1,
  };
}

export function normalizarReserva(bruto = {}, { base = null, espacos = [] } = {}) {
  const b = base || {};
  const itens = (Array.isArray(bruto.itens) ? bruto.itens : b.itens || [])
    .map((i) => normalizarItem(i, espacos))
    .filter((i) => i.espaco)
    .slice(0, 30);
  const dataInicio = RE_DATA.test(String(bruto.dataInicio ?? "")) ? String(bruto.dataInicio) : (b.dataInicio || "");
  const dataFimBruta = RE_DATA.test(String(bruto.dataFim ?? "")) ? String(bruto.dataFim) : (b.dataFim || "");
  return {
    id: texto(bruto.id || b.id, 40),
    protocolo: texto(b.protocolo, 30),          // emitido pelo servidor, nunca pelo formulário
    itens,
    dataInicio,
    // sem término, a reserva é de um dia só — e o de um dia é o caso comum
    dataFim: dataFimBruta && dataFimBruta >= dataInicio ? dataFimBruta : dataInicio,
    horaInicio: RE_HORA.test(String(bruto.horaInicio ?? "")) ? String(bruto.horaInicio) : (b.horaInicio || ""),
    horaFim: RE_HORA.test(String(bruto.horaFim ?? "")) ? String(bruto.horaFim) : (b.horaFim || ""),
    atividade: texto(bruto.atividade ?? b.atividade, 200),
    // `orgao` é CÓDIGO da lista (curso-… ou o setor); `orgaoOutro` só existe
    // quando se escolhe "Outro". Registro antigo, gravado como texto livre,
    // continua sendo lido por rotuloOrgao — não se reescreve o passado.
    orgao: texto(bruto.orgao ?? b.orgao, 160),
    orgaoOutro: texto(bruto.orgaoOutro ?? b.orgaoOutro, 160),
    // ofício: o documento que instrui o pedido. Sobe pela rota própria (o
    // link é do Drive, gerado no servidor) e vem junto no corpo.
    oficio: bruto.oficio === null ? null : (normalizarOficio(bruto.oficio) || b.oficio || null),
    justificativa: texto(bruto.justificativa ?? b.justificativa, 2000),
    interessado: INTERESSADOS.some((t) => t.codigo === texto(bruto.interessado))
      ? texto(bruto.interessado) : (b.interessado || "professor"),
    participantes: inteiro(bruto.participantes ?? b.participantes),
    recursos: texto(bruto.recursos ?? b.recursos, 400),
    observacoes: texto(bruto.observacoes ?? b.observacoes, 1000),
    // situação é da gestão: o formulário nunca a escolhe
    status: STATUS.includes(b.status) ? b.status : "solicitada",
    solicitante: {
      email: texto(b.solicitante?.email ?? bruto.solicitante?.email, 160).toLowerCase(),
      nome: texto(b.solicitante?.nome ?? bruto.solicitante?.nome, 160),
      telefone: texto(bruto.solicitante?.telefone ?? b.solicitante?.telefone, 40),
    },
    acaoExtensao: texto(bruto.acaoExtensao ?? b.acaoExtensao, 40),   // vínculo com o ARCHÉ EX
    historico: Array.isArray(b.historico) ? b.historico : [],
    criadoEm: b.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

/** O que impede a reserva de existir — diferente do conflito, que é ocupação. */
export function validarReserva(r, { espacos = [], hoje = hojeLocalISO(), cursos = null } = {}) {
  const erros = [];
  if (!r.itens?.length) erros.push("Escolha ao menos um espaço.");
  for (const i of r.itens || []) {
    const e = espacoDe(espacos, i.espaco);
    if (!e) { erros.push(`Espaço não encontrado: ${i.espaco}.`); continue; }
    if (e.ativo === false) erros.push(`${e.nome} está indisponível para reserva.`);
    if (e.detalhe?.obrigatorio && !i.detalhe) erros.push(`Informe ${e.detalhe.rotulo.toLowerCase()} em ${e.nome}.`);
    if (e.detalhe?.tipo === "bloco" && i.detalhe && !BLOCOS.includes(i.detalhe.toUpperCase()))
      erros.push(`Bloco inválido em ${e.nome} — use ${BLOCOS.join(", ")}.`);
  }
  if (!RE_DATA.test(r.dataInicio)) erros.push("Informe a data.");
  if (r.dataFim && r.dataFim < r.dataInicio) erros.push("O último dia não pode ser antes do primeiro.");
  if (!RE_HORA.test(r.horaInicio) || !RE_HORA.test(r.horaFim)) erros.push("Informe o horário de início e de término.");
  else if (minutos(r.horaFim) <= minutos(r.horaInicio)) erros.push("O término tem de ser depois do início.");
  if (!r.atividade) erros.push("Informe a atividade.");
  if (!r.orgao) erros.push("Escolha o órgão (curso, setor ou comunidade).");
  else if (r.orgao === "outro" && !r.orgaoOutro) erros.push("Diga qual é o órgão.");
  else if (cursos && !codigosDeOrgao(cursos).includes(r.orgao))
    erros.push("Órgão não reconhecido — escolha um da lista.");
  if (!r.justificativa) erros.push("Escreva a justificativa — para que o espaço será usado.");
  // pedido que vem de fora se instrui com documento: a palavra de quem
  // digitou o formulário não é o que a gestão poderá mostrar depois
  if (exigeOficio(r) && !r.oficio?.link)
    erros.push("Anexe o ofício — pedido de instituição ou de comunidade externa exige o documento.");
  // reservar para ontem não é reserva, é registro; e o passado não se disputa
  if (RE_DATA.test(r.dataInicio) && r.dataInicio < hoje) erros.push("A data já passou.");
  // capacidade: só faz sentido quando UM espaço foi pedido — num pedido com
  // vários, o público se distribui, e somar teto de auditório com teto de
  // quadra não diz nada
  if ((r.itens || []).length === 1) {
    const e = espacoDe(espacos, r.itens[0].espaco);
    if (e?.capacidade && r.participantes > e.capacidade)
      erros.push(`${e.nome} comporta ${e.capacidade} pessoas — o pedido prevê ${r.participantes}.`);
  }
  return erros;
}

/* ------------------------------- conflitos ------------------------------ */

/** Os períodos de datas se cruzam? */
const cruzaDatas = (a, b) =>
  (a.dataInicio || "") <= (b.dataFim || b.dataInicio || "") &&
  (b.dataInicio || "") <= (a.dataFim || a.dataInicio || "");

/** As faixas de hora se cruzam? Encostar não é sobrepor: quem termina às 10h
    e quem começa às 10h cabem no mesmo espaço. */
const cruzaHoras = (a, b) =>
  minutos(a.horaInicio) < minutos(b.horaFim) && minutos(b.horaInicio) < minutos(a.horaFim);

/**
 * Os itens de duas reservas que disputam o MESMO espaço físico. Espaço
 * `multiplo` (sala de aula, do qual há dezenas) nunca disputa — pedir cinco
 * salas no bloco C não colide com quem pediu três.
 */
export function itensEmDisputa(espacos, a, b) {
  const disputa = [];
  for (const i of a.itens || []) {
    const e = espacoDe(espacos, i.espaco);
    const modo = e?.conflito || "unico";
    if (modo === "multiplo") continue;
    for (const j of b.itens || []) {
      if (j.espaco !== i.espaco) continue;
      if (modo === "por-detalhe"
        && String(i.detalhe || "").toLowerCase() !== String(j.detalhe || "").toLowerCase()) continue;
      disputa.push(i);
      break;
    }
  }
  return disputa;
}

/** Duas reservas ocupam o mesmo espaço ao mesmo tempo? */
export function sobrepoe(espacos, a, b) {
  if (!a || !b) return false;
  return cruzaDatas(a, b) && cruzaHoras(a, b) && itensEmDisputa(espacos, a, b).length > 0;
}

/**
 * Com o que esta reserva se choca.
 * `apenasConfirmadas` (o padrão) responde à pergunta que TRAVA o pedido; sem
 * ele, mostra também as solicitações concorrentes — que não travam, mas a
 * gestão precisa vê-las antes de decidir qual das duas fica.
 */
export function conflitos(reservas, r, { espacos = [], apenasConfirmadas = true } = {}) {
  return (reservas || []).filter((x) =>
    x && x.id !== r.id && VIVA(x) && (apenasConfirmadas ? OCUPA(x) : true) && sobrepoe(espacos, x, r));
}

/* ------------------------------- bloqueios ------------------------------
   Reforma, dedetização, recesso: o espaço existe e não pode ser usado. É da
   gestão, e trava o pedido como uma reserva confirmada — a diferença é que
   não tem solicitante nem finalidade a decidir. */
export function normalizarBloqueio(bruto = {}, { base = null } = {}) {
  const b = base || {};
  const dataInicio = RE_DATA.test(String(bruto.dataInicio ?? "")) ? String(bruto.dataInicio) : (b.dataInicio || "");
  const dataFim = RE_DATA.test(String(bruto.dataFim ?? "")) ? String(bruto.dataFim) : (b.dataFim || "");
  return {
    id: texto(bruto.id || b.id, 40),
    espacos: [...new Set((Array.isArray(bruto.espacos) ? bruto.espacos : b.espacos || [])
      .map((e) => texto(e, 60)).filter(Boolean))].slice(0, 40),
    dataInicio,
    dataFim: dataFim && dataFim >= dataInicio ? dataFim : dataInicio,
    motivo: texto(bruto.motivo ?? b.motivo, 200),
    criadoPor: texto(b.criadoPor, 160),
    criadoEm: b.criadoEm || new Date().toISOString(),
  };
}

/** Os bloqueios que atingem esta reserva. Bloqueio é do DIA inteiro: manutenção
    não se agenda por faixa de hora, e meio-termo aqui convida ao acidente. */
export function bloqueiosDe(bloqueios, r) {
  return (bloqueios || []).filter((b) =>
    b && cruzaDatas(b, r) && (r.itens || []).some((i) => b.espacos.includes(i.espaco)));
}

/**
 * A resposta única à pergunta "posso reservar isto?" — é o que o servidor
 * consulta antes de gravar e o que a tela mostra antes de enviar.
 */
export function impedimentos(r, { reservas = [], bloqueios = [], espacos = [] } = {}) {
  const choques = conflitos(reservas, r, { espacos });
  const barrado = bloqueiosDe(bloqueios, r);
  const motivos = [];
  for (const c of choques) {
    const quais = itensEmDisputa(espacos, r, c).map((i) => rotuloItem(espacos, i)).join(", ");
    motivos.push(`${quais} já está reservado de ${c.dataInicio} a ${c.dataFim}, das ${c.horaInicio} às ${c.horaFim}${c.atividade ? ` (${c.atividade})` : ""}.`);
  }
  for (const b of barrado) {
    const quais = (r.itens || []).filter((i) => b.espacos.includes(i.espaco))
      .map((i) => rotuloItem(espacos, i)).join(", ");
    motivos.push(`${quais} está bloqueado de ${b.dataInicio} a ${b.dataFim}${b.motivo ? ` — ${b.motivo}` : ""}.`);
  }
  return { livre: motivos.length === 0, motivos, conflitos: choques, bloqueios: barrado };
}

/* -------------------------------- agenda -------------------------------- */

/** As reservas vivas de um período, na ordem em que os dias acontecem. */
export function agenda(reservas, { de = "", ate = "", espaco = "", somenteConfirmadas = false } = {}) {
  return (reservas || [])
    .filter((r) => VIVA(r)
      && (!de || (r.dataFim || r.dataInicio) >= de)
      && (!ate || r.dataInicio <= ate)
      && (!espaco || (r.itens || []).some((i) => i.espaco === espaco))
      && (!somenteConfirmadas || OCUPA(r)))
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio)
      || a.horaInicio.localeCompare(b.horaInicio));
}

/** Quem pode mexer na reserva: quem a pediu (e a gestão, que o servidor trata à parte). */
export const minhaReserva = (email, r) =>
  !!email && String(r?.solicitante?.email || "").toLowerCase() === String(email || "").toLowerCase();

/**
 * O que a agenda PÚBLICA mostra: onde, quando, para quê e de quem é o órgão —
 * nunca o telefone, o e-mail ou a justificativa de ninguém. O calendário
 * existe para evitar o pedido em cima do que já está ocupado, e para isso
 * basta saber que está ocupado.
 */
export function reservaPublica(espacos, r) {
  return {
    id: r.id, protocolo: r.protocolo || "",
    itens: (r.itens || []).map((i) => ({ ...i, rotulo: rotuloItem(espacos, i),
      cor: espacoDe(espacos, i.espaco)?.cor || "#40717e" })),
    dataInicio: r.dataInicio, dataFim: r.dataFim,
    horaInicio: r.horaInicio, horaFim: r.horaFim,
    atividade: r.atividade, orgao: r.orgao, orgaoOutro: r.orgaoOutro || "", status: r.status,
  };
}

/**
 * Ocupação por espaço num período — o número que a gestão leva ao conselho
 * quando se discute construir mais uma sala. Conta só o confirmado: hora
 * pedida e não concedida não foi uso.
 */
export function ocupacaoPorEspaco(reservas, espacos, { de = "", ate = "" } = {}) {
  const mapa = new Map(normalizarEspacos(espacos).map((e) => [e.id, { id: e.id, nome: e.nome, reservas: 0, horas: 0 }]));
  for (const r of reservas || []) {
    if (!OCUPA(r) || (de && (r.dataFim || r.dataInicio) < de) || (ate && r.dataInicio > ate)) continue;
    const dias = diasDaReserva(r).length || 1;
    const horas = Math.max(0, (minutos(r.horaFim) - minutos(r.horaInicio)) / 60) * dias;
    for (const i of r.itens || []) {
      if (!mapa.has(i.espaco)) mapa.set(i.espaco, { id: i.espaco, nome: i.espaco, reservas: 0, horas: 0 });
      const q = mapa.get(i.espaco);
      q.reservas++;
      q.horas += horas;
    }
  }
  return [...mapa.values()]
    .map((q) => ({ ...q, horas: Math.round(q.horas * 10) / 10 }))
    .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Os dias que a reserva ocupa, um a um — é como o calendário a desenha. */
export function diasDaReserva(r, { limite = 400 } = {}) {
  if (!RE_DATA.test(String(r?.dataInicio))) return [];
  const dias = [];
  let d = r.dataInicio;
  const fim = r.dataFim && r.dataFim >= r.dataInicio ? r.dataFim : r.dataInicio;
  while (d <= fim && dias.length < limite) {
    dias.push(d);
    const dt = new Date(`${d}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = dt.toISOString().slice(0, 10);
  }
  return dias;
}
