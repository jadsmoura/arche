/* ========================================================================
   Fusão de cadastros duplicados.

   A mesma pessoa entra duas vezes no ARCHÉ com facilidade: cria a conta com
   o e-mail pessoal, depois com o institucional; ou o pré-cadastro nasce do
   formulário do edital (com CPF) enquanto ela mesma se cadastra por outro
   endereço. O resultado é o professor aparecendo duas vezes na gestão de
   acessos — uma com CPF, outra só com o nome —, com os projetos, as atas e as
   ações repartidos entre as duas contas.

   O sistema APONTA a duplicidade pelo nome; quem funde é a gestão, dizendo
   qual conta fica. Fusão automática por nome seria perigosa: dois professores
   podem se chamar igual, e o que se apaga aqui não se desfaz sozinho — por
   isso o servidor guarda o registro do que foi movido (e o perfil removido
   inteiro) antes de mexer.

   Aqui ficam só as funções puras: quem lê e grava é o server.
   ======================================================================== */
import { soDigitos } from "./cpf.js";

const txt = (v) => String(v ?? "").trim();
const baixo = (v) => txt(v).toLowerCase();
/** Nome comparável: sem acento, sem caixa, sem espaço repetido. */
export const chaveNome = (v) => baixo(v).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/**
 * Os grupos de contas que compartilham o mesmo nome. Só nomes com pelo menos
 * duas palavras entram: "Maria" e "Maria" não são evidência de nada, enquanto
 * "Wagner Gonçalves Vieira Junior" repetido praticamente só acontece por
 * cadastro duplicado.
 */
export function duplicidadesPorNome(usuarios = []) {
  const grupos = new Map();
  for (const u of usuarios) {
    const k = chaveNome(u?.nome);
    if (!k || k.split(" ").length < 2) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(u);
  }
  return [...grupos.entries()]
    .filter(([, contas]) => contas.length > 1)
    .map(([, contas]) => ({
      nome: contas[0].nome,
      // a conta mais "cheia" primeiro: é a candidata natural a ficar
      contas: [...contas].sort((a, b) => peso(b) - peso(a)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O quanto uma conta carrega — serve só para sugerir qual manter. */
export function peso(u = {}) {
  const uso = (u.uso?.pesquisa || 0) + (u.uso?.extensao || 0) + (u.uso?.atas || 0);
  return (u.papel === "gestor" ? 1000 : u.papel === "coordenador" ? 500 : 0)
    + (u.temCpf ? 100 : 0) + (u.temPerfil ? 50 : 0) + (u.preCadastro ? -25 : 0) + uso;
}

/**
 * O perfil que resulta da fusão: o principal manda, e do secundário vem só o
 * que falta. Nada preenchido é sobrescrito — a conta que fica é a que a
 * pessoa usa, e o que ela digitou vale mais do que o que veio de um lote.
 */
export function fundirPerfil(principal = {}, secundario = {}) {
  const saida = { ...principal };
  for (const campo of ["nome", "cpf", "telefone", "lattes", "titulacao", "curso",
    "matricula", "funcao", "funcaoOutro", "foto"]) {
    if (!txt(saida[campo]) && txt(secundario[campo])) saida[campo] = secundario[campo];
  }
  // datas: fica a mais antiga de criação e a mais recente de atualização
  const cria = [principal.criadoEm, secundario.criadoEm].filter(Boolean).sort();
  const atu = [principal.atualizadoEm, secundario.atualizadoEm].filter(Boolean).sort();
  if (cria[0]) saida.criadoEm = cria[0];
  if (atu.length) saida.atualizadoEm = atu[atu.length - 1];
  // a marca de pré-cadastro não sobrevive: a conta que fica é de gente que entrou
  if (!principal.preCadastro) delete saida.preCadastro;
  return saida;
}

const troca = (valor, de, para) => (baixo(valor) === baixo(de) ? para : valor);

/**
 * Um projeto de IC com o e-mail antigo trocado pelo novo. Devolve o projeto e
 * o que mudou — a contagem é o que a gestão vê no fim da fusão.
 */
export function fundirProjeto(p, de, para) {
  if (!p) return { projeto: p, mudou: 0, avisos: [] };
  let mudou = 0;
  const avisos = [];
  const conta = (antes, depois) => { if (antes !== depois) mudou += 1; return depois; };

  const criadoPor = conta(p.criadoPor, troca(p.criadoPor, de, para));
  const orientador = p.orientador
    ? { ...p.orientador, email: conta(p.orientador.email, troca(p.orientador.email, de, para)) }
    : p.orientador;
  const alunos = (p.alunos || []).map((a) => ({ ...a, email: conta(a.email, troca(a.email, de, para)) }));

  // avaliadores: depois da troca, os dois cadastros podem virar o mesmo — fica
  // o parecer mais adiantado, porque parecer entregue é prova da seleção
  const trocadas = (p.avaliacoes || []).map((a) => ({ ...a, email: conta(a.email, troca(a.email, de, para)) }));
  const porEmail = new Map();
  for (const a of trocadas) {
    const k = baixo(a.email);
    const atual = porEmail.get(k);
    if (!atual) { porEmail.set(k, a); continue; }
    const vale = (x) => (x.situacao === "entregue" ? 2 : x.situacao === "designado" ? 1 : 0);
    porEmail.set(k, vale(a) >= vale(atual) ? a : atual);
    avisos.push(`no projeto ${p.numero || p.id} as duas contas constavam como avaliador — ficou o parecer mais adiantado`);
  }
  const avaliacoes = [...porEmail.values()];

  // a pessoa não pode avaliar o que ela mesma orienta: se a fusão criou isso,
  // o parecer NÃO se apaga (é prova do processo) — a gestão fica sabendo
  if (avaliacoes.some((a) => baixo(a.email) === baixo(para)) && baixo(orientador?.email) === baixo(para)) {
    avisos.push(`no projeto ${p.numero || p.id} a conta que ficou consta como orientação e como avaliador — confira o parecer`);
  }
  return { projeto: { ...p, criadoPor, orientador, alunos, avaliacoes }, mudou, avisos };
}

/** Uma ação de extensão com o e-mail trocado (autoria e responsável). */
export function fundirAcao(a, de, para) {
  if (!a) return { acao: a, mudou: 0 };
  let mudou = 0;
  const conta = (antes, depois) => { if (antes !== depois) mudou += 1; return depois; };
  const criadoPor = conta(a.criadoPor, troca(a.criadoPor, de, para));
  const proposta = a.proposta
    ? { ...a.proposta, respEmail: conta(a.proposta.respEmail, troca(a.proposta.respEmail, de, para)) }
    : a.proposta;
  return { acao: { ...a, criadoPor, proposta }, mudou };
}

/** Uma ata com o e-mail trocado (autoria, secretaria e participantes). */
export function fundirAta(a, de, para) {
  if (!a) return { ata: a, mudou: 0 };
  let mudou = 0;
  const conta = (antes, depois) => { if (antes !== depois) mudou += 1; return depois; };
  const criadoPor = conta(a.criadoPor, troca(a.criadoPor, de, para));
  const secretaria = a.secretaria
    ? { ...a.secretaria, email: conta(a.secretaria.email, troca(a.secretaria.email, de, para)) }
    : a.secretaria;
  const participantes = (a.participantes || [])
    .map((p) => ({ ...p, email: conta(p.email, troca(p.email, de, para)) }));
  return { ata: { ...a, criadoPor, secretaria, participantes }, mudou };
}

/**
 * Papéis: a conta que fica herda o alcance da outra — nunca o contrário. Quem
 * era coordenador de um módulo continua sendo, e a duplicada sai de todas as
 * listas. Rebaixar alguém por causa de uma fusão seria tirar acesso sem que
 * ninguém tenha decidido isso.
 */
export function fundirPapeis(usuarios, de, para) {
  const u = {
    ...usuarios,
    gestores: [...(usuarios.gestores || [])],
    aprovados: [...(usuarios.aprovados || [])],
    coordenadores: { ...(usuarios.coordenadores || {}) },
    pendentes: [...(usuarios.pendentes || [])],
  };
  const d = baixo(de), p = baixo(para);
  const eraGestor = u.gestores.some((x) => baixo(x) === d);
  const eraAprovado = u.aprovados.some((x) => baixo(x) === d);
  const modulos = u.coordenadores[d] || [];

  u.gestores = u.gestores.filter((x) => baixo(x) !== d);
  u.aprovados = u.aprovados.filter((x) => baixo(x) !== d);
  u.pendentes = u.pendentes.filter((x) => baixo(x.email) !== d);
  delete u.coordenadores[d];

  if (eraGestor && !u.gestores.some((x) => baixo(x) === p)) u.gestores.push(para);
  if ((eraAprovado || eraGestor) && !u.aprovados.some((x) => baixo(x) === p)
    && !u.gestores.some((x) => baixo(x) === p)) u.aprovados.push(para);
  if (modulos.length) {
    u.coordenadores[p] = [...new Set([...(u.coordenadores[p] || []), ...modulos])];
  }
  return u;
}

/** Duas contas só se fundem se forem, pelo nome, a mesma pessoa. */
/* Um nome CONTIDO no outro é a mesma pessoa escrita de dois jeitos — "Claudia
   Santos" numa conta e "Claudia Dias Teixeira dos Santos" na outra (o caso
   real que travou a primeira fusão pedida pelo dono, ago/2026). A régua: o
   nome mais curto tem ao menos duas palavras e TODAS elas aparecem no mais
   longo, na mesma ordem. Palavra fora de ordem não passa: "Santos Claudia"
   não é evidência de nada. */
export function nomesCompativeis(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  const pc = curto.split(" ").filter(Boolean);
  if (pc.length < 2) return false;
  const pl = longo.split(" ").filter(Boolean);
  let i = 0;
  for (const p of pc) {
    i = pl.indexOf(p, i);
    if (i < 0) return false;
    i += 1;
  }
  return true;
}

export function podeFundir(principal, secundario) {
  if (!principal?.email || !secundario?.email) return "Informe as duas contas.";
  if (baixo(principal.email) === baixo(secundario.email)) return "As duas contas são a mesma.";
  const a = chaveNome(principal.nome), b = chaveNome(secundario.nome);
  if (!a || !b) return "As duas contas precisam ter o nome preenchido para serem fundidas.";
  if (!nomesCompativeis(a, b)) return `Os nomes não conferem ("${principal.nome}" e "${secundario.nome}") — fusão só entre cadastros da mesma pessoa.`;
  const ca = soDigitos(principal.cpf), cb = soDigitos(secundario.cpf);
  if (ca && cb && ca !== cb) return "As duas contas têm CPFs diferentes — não são a mesma pessoa.";
  return "";
}
