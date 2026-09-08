/* ========================================================================
   ARCHÉ AV — Avaliação Institucional: QUEM PODE O QUÊ, pela conta do portal.

   Até set/2026 o módulo tinha DUAS senhas compartilhadas ("uniego" para os
   indicadores, "docente" para a produção) e um login simulado dentro do app
   compilado — o docente escolhia o próprio nome numa lista. Ninguém sabia
   quem entrou, e qualquer pessoa com a senha editava a ficha de qualquer
   professor. A pedido do dono (set/2026), o acesso passa a ser o da CONTA:

     - GESTÃO (gestor geral, ou coordenação do módulo `avaliacao` designada
       em /usuarios/): todos os cursos, tudo;
     - COORDENAÇÃO DE CURSO (coordenador e pedagógico — a mesma composição
       que abre o Seu Curso e valida o ARCHÉ AC): só os cursos dela, tudo
       neles, inclusive indicar os docentes do dossiê;
     - DOCENTE (quem a coordenação incluiu no dossiê): entra na PRÓPRIA
       ficha — XML do Lattes e comprovantes — e em nada mais;
     - AVALIADOR (o selo do link de acesso / arche.app.br/avaliador): lê
       tudo, grava nada — como sempre foi.

   Este arquivo é PURO: recebe o que o servidor já leu (perfil, cursos
   coordenados, dossiês) e responde. Quem lê as bases é o server.js.
   ======================================================================== */

/** Os doze cursos do módulo, na ordem em que o app compilado os publicou.
    O slug é o DIRETÓRIO da página e a chave do estado (`dossie-<slug>-v1`);
    Psicologia mora na raiz das páginas, mas nas chaves é `psicologia`. */
export const CURSOS_AV = [
  { slug: "administracao", nome: "Administração" },
  { slug: "agronomia", nome: "Agronomia" },
  { slug: "contabeis", nome: "Ciências Contábeis" },
  { slug: "direito", nome: "Direito" },
  { slug: "educacao-fisica", nome: "Educação Física" },
  { slug: "enfermagem", nome: "Enfermagem" },
  { slug: "engenharia-civil", nome: "Engenharia Civil" },
  { slug: "engenharia-mecanica", nome: "Engenharia Mecânica" },
  { slug: "engenharia-software", nome: "Engenharia de Software" },
  { slug: "medicina-veterinaria", nome: "Medicina Veterinária" },
  { slug: "odontologia", nome: "Odontologia" },
  { slug: "psicologia", nome: "Psicologia" },
];
export const SLUGS_AV = CURSOS_AV.map((c) => c.slug);
export const nomeDoCursoAv = (slug) => CURSOS_AV.find((c) => c.slug === slug)?.nome || "";
export const chaveDoDossie = (slug) => `dossie-${slug}-v1`;

const txt = (v, n = 200) => String(v ?? "").trim().slice(0, n);
export const email = (v) => txt(v, 160).toLowerCase();

/** Nome completo como chave fraca: sem acento, minúsculo, espaços únicos —
    e só com DUAS palavras ou mais ("Ana" não identifica ninguém). */
export function chaveDeNome(v) {
  const s = txt(v, 160).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  return s.split(" ").filter(Boolean).length >= 2 ? s : "";
}

/** O id do Lattes (16 dígitos) de um URL ou de um número solto. */
export function lattesIdDe(v) {
  const m = String(v ?? "").match(/(\d{16})(?!\d)/);
  return m ? m[1] : "";
}

/** A chave com que os appends do dossiê identificam um registro
    (`ajustesProducao`, integridade): a mesma regra, para casar. */
export const chaveDoProf = (p) => (p && p.lattesId
  ? "lattes:" + p.lattesId
  : "nome:" + String((p && p.nome) || "").trim().toLowerCase());

/* ------------------------------------------------------------------------
   As chaves do estado que pertencem à Avaliação, e a que curso cada uma
   serve. O app compilado grava o curso INTEIRO numa chave; as da página
   raiz (Psicologia) não trazem o slug, e duas são compartilhadas por todas
   as páginas. Fora deste catálogo, a chave não é da Avaliação.
   ------------------------------------------------------------------------ */
const FAMILIAS = [
  [/^dossie-([a-z0-9-]+)-v\d+$/, "dossie"],
  [/^avaliacao-mec-([a-z0-9-]+)-uniego-v\d+$/, "indicadores"],
  [/^docs-institucionais-([a-z0-9-]+)-v\d+$/, "docs"],
  [/^indicador-modos-([a-z0-9-]+)-v\d+$/, "indicador"],
  [/^indicador-manual-checks-([a-z0-9-]+)-v\d+$/, "indicador"],
  [/^justificativas-conceito-([a-z0-9-]+)-v\d+$/, "justificativa"],
  [/^links-pastas-([a-z0-9-]+)-v\d+$/, "links"],
];
const RAIZ_PSICOLOGIA = new Set(["docs-institucionais-v1", "indicador-modos-v1",
  "indicador-manual-checks-v1", "links-pastas-v1", "links-pastas-v2"]);
const COMPARTILHADAS = new Set(["indicador-modeA-docs-v1", "justificativas-conceito-v1"]);
export const EH_CHAVE_AV = /^(dossie-|avaliacao-mec-|docs-institucionais|links-pastas|indicador-|justificativas-conceito)/;

/**
 * `{ familia, curso }` para chave da Avaliação; `null` para as demais.
 * `curso` é o slug, `"*"` quando a chave é de todas as páginas, e `null`
 * quando a chave é da Avaliação mas não se sabe de que curso (só a gestão).
 */
export function cursoDaChave(chave) {
  const k = txt(chave, 120);
  if (!EH_CHAVE_AV.test(k)) return null;
  if (COMPARTILHADAS.has(k)) return { familia: "compartilhada", curso: "*" };
  if (RAIZ_PSICOLOGIA.has(k)) return { familia: "raiz", curso: "psicologia" };
  for (const [re, familia] of FAMILIAS) {
    const m = k.match(re);
    if (m) return { familia, curso: SLUGS_AV.includes(m[1]) ? m[1] : null };
  }
  return { familia: "outra", curso: null };
}

/* ------------------------------------------------------------------------
   O acesso de uma pessoa, montado do que o servidor leu.
   ------------------------------------------------------------------------ */
/**
 * @param {object} x
 * @param {boolean} x.gestao        gestor geral ou coordenação do módulo `avaliacao`
 * @param {string[]} x.cursosCoordenados  slugs (composição institucional + cadastro do AP)
 * @param {object} x.docenteEm      { slug: { idx, nome } } — onde a pessoa está no dossiê
 * @param {object|null} x.eu        { email, nome }
 * @param {boolean} x.avaliador     selo de visualização sem sessão
 */
export function montarAcesso({ gestao = false, cursosCoordenados = [], docenteEm = {}, eu = null,
  avaliador = false, logado = false } = {}) {
  const coord = gestao ? [...SLUGS_AV] : [...new Set((cursosCoordenados || []).filter((s) => SLUGS_AV.includes(s)))];
  const doc = Object.fromEntries(Object.entries(docenteEm || {}).filter(([s]) => SLUGS_AV.includes(s)));
  let papel = null;
  if (!logado) papel = avaliador ? "avaliador" : null;
  else if (gestao) papel = "gestao";
  else if (coord.length) papel = "coordenacao";
  else if (Object.keys(doc).length) papel = "docente";
  else papel = "nenhum";
  return {
    logado: !!logado, papel, gestao: !!gestao && !!logado, cursos: coord, docenteEm: doc,
    eu: eu ? { email: email(eu.email), nome: txt(eu.nome, 160) } : null,
    visualizacao: !logado && !!avaliador,
  };
}

/** Pode LER esta chave? `null` quando a chave não é da Avaliação. */
export function podeLer(acesso, chave) {
  const info = cursoDaChave(chave);
  if (!info) return null;
  if (!acesso) return false;
  if (acesso.papel === "avaliador" || acesso.gestao) return true;
  if (!acesso.logado || acesso.papel === "nenhum") return false;
  if (info.curso === "*") return true;
  if (!info.curso) return false;
  if (acesso.cursos.includes(info.curso)) return true;
  return info.familia === "dossie" && !!acesso.docenteEm[info.curso];
}

/**
 * Pode GRAVAR esta chave? `"total"` (o documento inteiro), `"ficha"` (só a
 * própria ficha do dossiê — o servidor funde), `""` (não). `null` quando a
 * chave não é da Avaliação.
 */
export function podeGravar(acesso, chave) {
  const info = cursoDaChave(chave);
  if (!info) return null;
  if (!acesso || !acesso.logado || acesso.papel === "avaliador" || acesso.papel === "nenhum") return "";
  if (acesso.gestao) return "total";
  if (info.curso === "*") return acesso.cursos.length ? "total" : "";
  if (!info.curso) return "";
  if (acesso.cursos.includes(info.curso)) return "total";
  if (info.familia === "dossie" && acesso.docenteEm[info.curso]) return "ficha";
  return "";
}

/* ------------------------------------------------------------------------
   A identidade do docente no dossiê. O registro do app não tinha e-mail:
   o vínculo forte (`email`) nasce quando a coordenação inclui o docente
   pela busca de usuários, ou na primeira gravação do próprio docente. Até
   lá, casa-se pelo id do Lattes e, por último, pelo NOME COMPLETO — só com
   UMA candidata. Registro que já tem e-mail de OUTRA pessoa nunca casa por
   Lattes nem por nome: ele já é de alguém.
   ------------------------------------------------------------------------ */
export function identificarDocente(profs, id = {}) {
  const lista = Array.isArray(profs) ? profs : [];
  const e = email(id.email);
  if (e) {
    const i = lista.findIndex((p) => email(p?.email) === e);
    if (i >= 0) return i;
  }
  const livre = (p) => !email(p?.email) || email(p?.email) === e;
  const lat = lattesIdDe(id.lattes);
  if (lat) {
    const i = lista.findIndex((p) => livre(p) && String(p?.lattesId || "") === lat);
    if (i >= 0) return i;
  }
  const k = chaveDeNome(id.nome);
  if (k) {
    const c = lista.map((p, i) => [p, i]).filter(([p]) => livre(p) && chaveDeNome(p?.nome) === k);
    if (c.length === 1) return c[0][1];
  }
  return -1;
}

/** Onde a pessoa está: `{ slug: { idx, nome } }`, dado `{ slug: docParseado }`. */
export function docenteNosDossies(dossies, id) {
  const onde = {};
  for (const [slug, doc] of Object.entries(dossies || {})) {
    const profs = doc && Array.isArray(doc.profs) ? doc.profs : null;
    if (!profs) continue;
    const i = identificarDocente(profs, id);
    if (i >= 0) onde[slug] = { idx: i, nome: txt(profs[i]?.nome, 160) };
  }
  return onde;
}

/** O registro novo, no formato que o app grava (`serializeState`). */
export function docenteNovo({ email: e, nome, titulo, lattesId, funcao } = {}) {
  const f = txt(funcao, 80) || "Docente do Curso";
  const t = txt(titulo, 6);
  return {
    idx: 0, titulo: ["Dr.", "Dra.", "Me.", "Ma.", "Esp.", "Grad."].includes(t) ? t : "Esp.",
    nome: txt(nome, 160), lattesId: lattesIdDe(lattesId),
    coord: /coordena/i.test(f), funcao: f, regime: null, photo: null,
    data: null, itemStates: [], email: email(e),
  };
}

/**
 * A gravação do DOCENTE: só a própria ficha entra. Parte do documento
 * GRAVADO e substitui nele o registro do docente pelo que veio da tela —
 * e os ajustes de produção dele (`ajustesProducao`), que o app guarda
 * fora da ficha. Tudo o mais fica exatamente como estava no servidor.
 * `null` quando não há documento gravado, ou quando o docente não está
 * nem no gravado nem no recebido — aí não há o que fundir.
 */
export function fundirFichaDoDocente(guardado, recebido, id) {
  const base = guardado && Array.isArray(guardado.profs) ? guardado : null;
  const novo = recebido && Array.isArray(recebido.profs) ? recebido : null;
  if (!base || !novo) return null;
  const iBase = identificarDocente(base.profs, id);
  const iNovo = identificarDocente(novo.profs, id);
  if (iBase < 0 || iNovo < 0) return null;

  const saida = JSON.parse(JSON.stringify(base));
  const ficha = JSON.parse(JSON.stringify(novo.profs[iNovo]));
  ficha.idx = base.profs[iBase].idx ?? iBase;
  // o vínculo forte fica gravado na primeira vez que a pessoa entra
  if (email(id.email)) ficha.email = email(id.email);
  const chaveAntiga = chaveDoProf(base.profs[iBase]);
  const chaveNova = chaveDoProf(ficha);
  saida.profs[iBase] = ficha;

  const minhas = new Set([chaveAntiga, chaveNova]);
  const aNovo = (novo.ajustesProducao?.profs || []).filter((x) => minhas.has(x?.chave));
  const outros = (base.ajustesProducao?.profs || []).filter((x) => !minhas.has(x?.chave));
  if (aNovo.length || outros.length || saida.ajustesProducao) {
    saida.ajustesProducao = { versao: 1, profs: [...outros, ...aNovo] };
  }
  return saida;
}

/** Filtra as contas do portal para a busca da coordenação. */
export function buscarUsuarios(contas, q, { limite = 15 } = {}) {
  const termo = chaveDeNome(q) || txt(q, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (termo.length < 2) return [];
  const norm = (v) => txt(v, 200).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const NAO_LECIONAM = new Set(["aluno", "em", "secretaria"]);
  return (contas || [])
    .filter((c) => c && c.email && c.nome && !c.removido && !NAO_LECIONAM.has(c.funcao))
    .filter((c) => norm(c.nome).includes(termo) || norm(c.email).includes(termo))
    .sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)))
    .slice(0, limite)
    .map((c) => ({
      email: email(c.email), nome: txt(c.nome, 160), titulacao: txt(c.titulacao, 6),
      funcao: txt(c.funcao, 40), curso: txt(c.curso, 80), lattesId: lattesIdDe(c.lattes),
    }));
}
