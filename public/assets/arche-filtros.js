/* =======================================================================
   ARCHÉ — o filtro de CURSO das listas (pedido do dono, set/2026: "em todos
   os módulos, blocos, lista, que houverem cursos misturados, precisamos
   implementar filtros e categorias, para organizar melhor a visualização —
   exemplo, na lista de projetos de monitoria, cursos estão misturados").

   A PROPPEX e a PROAC enxergam os doze cursos ao mesmo tempo, e várias
   listas do portal já cresceram o bastante para que isso pese: os projetos
   de monitoria, os relatórios de aula prática, os agendamentos de espaço.
   Cada tela tinha os seus filtros (semestre, situação, disciplina) e
   nenhuma tinha o do CURSO, que é justamente como a gestão pensa o acervo.

   É UM componente, pela mesma razão da paginação: oito barras de filtro
   escritas à mão acabam diferentes — uma conta as opções, outra não; uma
   some quando há um curso só, outra fica ocupando a linha.

   COMO USAR, numa tela qualquer:

     ArcheFiltros.curso({
       lista: todos,                      // a lista ANTES deste filtro
       de: (p) => p.curso,                // onde mora o curso do item
       nome: (slug) => cursoNome(slug),   // como ele se escreve na tela
       valor: F.curso,
       onchange: "F.curso=this.value;ArchePag.zerar('mon-projetos');render()",
     })

   e, no recorte da lista, `ArcheFiltros.passa(p.curso, F.curso)`.

   Quatro decisões que o componente carrega para as telas não repetirem:

    - **as opções saem da própria lista**, não do catálogo dos doze cursos:
      um seletor com onze opções que devolvem zero resultados não organiza
      nada. Quem tem ação no acervo aparece; quem não tem, não;

    - **cada opção diz quantas**, como já fazem os filtros do ARCHÉ EV e a
      guia Bolsistas da IC — é o número que faz escolher sem tentativa;

    - **some com um curso só** (ou nenhum): ali não há mistura a desfazer, e
      um filtro de uma opção é ruído. É a mesma régua do "curso (quando há
      mais de um)" que o EV já aplicava;

    - **o item SEM curso não desaparece**: ele ganha a própria opção
      ("— sem curso"), porque esconder registro é o oposto de organizar.
      Um relatório retroativo ou uma reserva de órgão institucional não
      podem sumir da lista da coordenação por não terem curso.

   O `de:` pode devolver um valor ou uma LISTA (a ação de extensão tem curso
   principal e corealizadores, e ela pertence aos dois).
   ======================================================================= */
(function () {
  const SEM = "__sem__";                       // a opção de quem não tem curso
  const txt = (v) => String(v == null ? "" : v).trim();
  const esc = (s) => txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // o que o item devolve pode ser um valor ou vários: normaliza para lista
  const valoresDe = (item, de) => {
    const v = typeof de === "function" ? de(item) : item?.[de];
    return (Array.isArray(v) ? v : [v]).map(txt).filter(Boolean);
  };

  window.ArcheFiltros = {
    SEM,

    /** As opções presentes na lista, com a contagem de cada uma. */
    opcoes({ lista, de, nome } = {}) {
      const cont = new Map();
      let sem = 0;
      for (const item of (lista || [])) {
        const vs = valoresDe(item, de);
        if (!vs.length) { sem++; continue; }
        // a ação de dois cursos conta nos dois: é dos dois
        for (const v of new Set(vs)) cont.set(v, (cont.get(v) || 0) + 1);
      }
      const rot = typeof nome === "function" ? nome : (v) => v;
      const opts = [...cont.entries()]
        .map(([valor, n]) => ({ valor, nome: txt(rot(valor)) || valor, n }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      if (sem) opts.push({ valor: SEM, nome: "— sem curso", n: sem });
      return opts;
    },

    /**
     * O `<select>` pronto. Devolve "" quando não há mistura a desfazer
     * (um curso só, ou nenhum) — filtro de uma opção é ruído na linha.
     */
    curso({ lista, de = "curso", nome, valor = "", onchange, rotulo = "Curso", id = "", estilo = "" } = {}) {
      const opts = this.opcoes({ lista, de, nome });
      // com uma opção só não há o que separar; mas se a pessoa já escolheu
      // um curso, o seletor FICA — some-lo a deixaria presa no recorte
      if (opts.length < 2 && !valor) return "";
      const total = (lista || []).length;
      const linhas = [`<option value="">${esc(rotulo)}: todos${total ? ` (${total})` : ""}</option>`]
        .concat(opts.map((o) =>
          `<option value="${esc(o.valor)}"${o.valor === valor ? " selected" : ""}>${esc(o.nome)} (${o.n})</option>`));
      return `<select${id ? ` id="${esc(id)}"` : ""}${estilo ? ` style="${esc(estilo)}"` : ""} `
        + `onchange="${esc(onchange || "")}" `
        + `title="${esc(rotulo)}: separa o que está misturado nesta lista">${linhas.join("")}</select>`;
    },

    /** O item passa no filtro? `valorDoItem` aceita um valor ou uma lista. */
    passa(valorDoItem, escolhido) {
      const alvo = txt(escolhido);
      if (!alvo) return true;
      const vs = (Array.isArray(valorDoItem) ? valorDoItem : [valorDoItem]).map(txt).filter(Boolean);
      return alvo === SEM ? !vs.length : vs.includes(alvo);
    },
  };
})();
