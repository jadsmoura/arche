/**
 * Curricularização da Extensão — o vínculo entre a ação e os componentes
 * curriculares do curso.
 *
 * Por que existe: a Resolução CNE/CES nº 7/2018 obriga que ao menos 10% da
 * carga horária de cada curso de graduação seja de extensão, e o avaliador do
 * MEC não pergunta "vocês fazem extensão?" — ele pergunta QUAL disciplina do
 * PPC cada ação atende e QUANTAS horas dela foram curricularizadas. Sem esse
 * vínculo gravado na proposta, a comprovação vira garimpo em ata e memória.
 *
 * O que se pede é o mínimo que comprova: a disciplina (como está no PPC), o
 * período em que ela é ofertada, a carga horária curricularizada e quantos
 * acadêmicos a cumpriram. Nem toda ação é curricularizada — a maioria não é —,
 * então o vínculo é OPCIONAL e não trava a submissão; o que ele não pode é
 * ficar pela metade, porque meia comprovação não comprova.
 */

/* Períodos da matriz: rótulo por extenso porque é assim que o PPC escreve, e
   `codigo` estável porque é o que fica gravado na ação. */
export const PERIODOS = [
  { codigo: "1", rotulo: "1º período" }, { codigo: "2", rotulo: "2º período" },
  { codigo: "3", rotulo: "3º período" }, { codigo: "4", rotulo: "4º período" },
  { codigo: "5", rotulo: "5º período" }, { codigo: "6", rotulo: "6º período" },
  { codigo: "7", rotulo: "7º período" }, { codigo: "8", rotulo: "8º período" },
  { codigo: "9", rotulo: "9º período" }, { codigo: "10", rotulo: "10º período" },
  { codigo: "varios", rotulo: "Vários períodos" },
];

export const rotuloPeriodo = (c) =>
  PERIODOS.find((p) => p.codigo === String(c || ""))?.rotulo || "";

const texto = (v) => String(v ?? "").trim();
const inteiro = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Um componente curricular vinculado à ação. */
export function normalizarComponente(bruto = {}) {
  return {
    disciplina: texto(bruto.disciplina).slice(0, 160),
    curso: texto(bruto.curso).slice(0, 120),          // vazio = o curso da própria ação
    periodo: PERIODOS.some((p) => p.codigo === texto(bruto.periodo)) ? texto(bruto.periodo) : "",
    cargaHoraria: inteiro(bruto.cargaHoraria),
    academicos: inteiro(bruto.academicos),
    docente: texto(bruto.docente).slice(0, 160),
  };
}

/**
 * O bloco inteiro, como fica gravado em `proposta.curricularizacao`.
 * `vinculada: false` zera os componentes: manter lista de disciplina numa ação
 * que deixou de ser curricularizada faria o relatório do curso contar horas
 * que ninguém cumpriu.
 */
export function normalizarCurricularizacao(bruto = {}) {
  const vinculada = bruto?.vinculada === true;
  if (!vinculada) return { vinculada: false, componentes: [], integracao: "" };
  const componentes = (Array.isArray(bruto.componentes) ? bruto.componentes : [])
    .map(normalizarComponente)
    .filter((c) => c.disciplina)                      // linha sem disciplina não é vínculo
    .slice(0, 20);
  return { vinculada: true, componentes, integracao: texto(bruto.integracao).slice(0, 2000) };
}

/**
 * O que falta para o vínculo comprovar alguma coisa. Não trava a submissão
 * (a régua da proposta é outra) — é o aviso da tela e o que a gestão cobra
 * antes de levar o quadro ao avaliador.
 */
export function faltaNaCurricularizacao(cur) {
  const c = normalizarCurricularizacao(cur);
  if (!c.vinculada) return [];
  const falta = [];
  if (!c.componentes.length) falta.push("a disciplina a que a ação se vincula");
  c.componentes.forEach((x, i) => {
    const onde = c.componentes.length > 1 ? ` (${i + 1}ª disciplina)` : "";
    if (!x.periodo) falta.push(`o período da matriz${onde}`);
    if (!x.cargaHoraria) falta.push(`a carga horária curricularizada${onde}`);
  });
  return falta;
}

/** Horas curricularizadas somadas — é o número que o PPC cobra. */
export const chCurricularizada = (cur) =>
  normalizarCurricularizacao(cur).componentes.reduce((s, c) => s + c.cargaHoraria, 0);

/** Acadêmicos alcançados, somados (o mesmo aluno em duas disciplinas conta duas vezes). */
export const academicosCurricularizados = (cur) =>
  normalizarCurricularizacao(cur).componentes.reduce((s, c) => s + c.academicos, 0);

export const ehCurricularizada = (acao) =>
  acao?.proposta?.curricularizacao?.vinculada === true;

/**
 * Quadro por curso, para a comprovação: quantas ações curricularizadas, quantas
 * horas e quais disciplinas. Só entram ações APROVADAS ou já registradas — o
 * que ainda está em análise não comprova nada, e proposta recusada nem existiu.
 */
export function panoramaCurricularizacao(acoes = [], { ano = null } = {}) {
  const contam = new Set(["aprovada", "relatorio-entregue", "registrada"]);
  const porCurso = new Map();
  for (const a of acoes) {
    if (!ehCurricularizada(a) || !contam.has(String(a?.status || ""))) continue;
    const fim = String(a?.proposta?.periodoFim || a?.proposta?.periodoInicio || "");
    if (ano && fim.slice(0, 4) !== String(ano)) continue;
    const cur = normalizarCurricularizacao(a.proposta.curricularizacao);
    for (const c of cur.componentes) {
      const curso = c.curso || a.curso || "(sem curso)";
      if (!porCurso.has(curso)) porCurso.set(curso, { curso, acoes: new Set(), horas: 0, academicos: 0, disciplinas: new Map() });
      const q = porCurso.get(curso);
      q.acoes.add(a.id);
      q.horas += c.cargaHoraria;
      q.academicos += c.academicos;
      const chave = `${c.disciplina}|${c.periodo}`;
      if (!q.disciplinas.has(chave))
        q.disciplinas.set(chave, { disciplina: c.disciplina, periodo: c.periodo, horas: 0, acoes: 0 });
      const d = q.disciplinas.get(chave);
      d.horas += c.cargaHoraria;
      d.acoes++;
    }
  }
  return [...porCurso.values()]
    .map((q) => ({
      curso: q.curso, acoes: q.acoes.size, horas: q.horas, academicos: q.academicos,
      disciplinas: [...q.disciplinas.values()].sort((a, b) => b.horas - a.horas),
    }))
    .sort((a, b) => b.horas - a.horas || a.curso.localeCompare(b.curso, "pt-BR"));
}
