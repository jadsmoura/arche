/* ========================================================================
   LANÇAR EDITAL — o cartão compartilhado (pedido do dono, ago/2026: "todos
   os editais lançamos por aqui; no sistema não tem opção de incluir novos
   editais — inclua essa opção nos setores").

   É UM componente para os três setores (graduação, ICEM e monitoria) porque
   é UM formulário: número, título, ciclo, vigência e o PDF. Duas cópias da
   mesma tela — uma no ARCHÉ IC e outra no ARCHÉ MO — acabariam diferentes,
   que foi exatamente o que aconteceu com a paginação antes de o portal ter
   um componente só.

   Uso:  ArcheEditais.montar(elemento, { setores: ["ic", "em"], aoMudar });

   `setores` recorta o que aquela tela oferece; quem BARRA é o servidor — a
   rota devolve só os setores que a pessoa pode lançar, e recusa a gravação
   fora deles. Esconder campo não é porta.
   ======================================================================== */
(function () {
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dBR = (iso) => (String(iso || "").length >= 10
    ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

  const CSS = `
  .ed-lin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-top:1px solid var(--linha,#dde4e8)}
  .ed-lin:first-of-type{border-top:0}
  .ed-nm{font-weight:700;font-size:13.5px}
  .ed-sub{color:var(--muted,#657179);font-size:12.5px}
  .ed-tag{font-size:11px;font-weight:700;border-radius:20px;padding:2px 9px;
    background:var(--wash,#e6f5fa);color:var(--brand-3,#40717e);white-space:nowrap}
  .ed-form{border:1px solid var(--linha,#dde4e8);border-radius:12px;padding:14px;margin-top:12px;background:#fbfdfe}
  .ed-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ed-g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  @media (max-width:720px){.ed-g2,.ed-g3{grid-template-columns:1fr}}`;

  const INSTITUICAO = "Centro Universitário Evangélico de Goianésia (UNIEGO)";
  let DADOS = null;      // resposta do /api/editais
  let EDITANDO = null;   // o edital aberto no formulário (null = fechado)
  let ALVO = null;       // o elemento onde o cartão vive
  let OPCOES = {};

  async function api(url, opt) {
    const r = await fetch(url, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "não foi possível");
    return j;
  }

  function setoresVisiveis() {
    const permitidos = OPCOES.setores || null;
    return (DADOS?.setores || []).filter((s) => !permitidos || permitidos.includes(s.codigo));
  }
  const setorDe = (c) => (DADOS?.setores || []).find((s) => s.codigo === c) || null;
  const meus = (lista) => {
    const cod = setoresVisiveis().map((s) => s.codigo);
    return (lista || []).filter((e) => cod.includes(e.setor));
  };

  /* ------------------------------ desenho ------------------------------ */

  function desenhar() {
    if (!ALVO) return;
    const setores = setoresVisiveis();
    if (!setores.length) { ALVO.innerHTML = ""; return; }
    const cadastrados = meus(DADOS.editais)
      .sort((a, b) => (b.ano || 0) - (a.ano || 0) || String(a.numero).localeCompare(String(b.numero)));
    /* Encerrar um edital do acervo o CLONA para o cadastro (é assim que a
       marca passa a valer). Ele sai daqui, senão apareceria nas duas listas
       — e a de baixo ofereceria "encerrar" o que já está encerrado. */
    const jaNoCadastro = new Set(cadastrados.map((e) => e.numero));
    const acervo = meus(DADOS.doCodigo)
      .filter((e) => !jaNoCadastro.has(e.numero))
      .sort((a, b) => (b.ano || 0) - (a.ano || 0) || String(a.numero).localeCompare(String(b.numero)));

    ALVO.innerHTML = `<style>${CSS}</style>
      <div class="card">
        <div class="card-t">Lançar edital</div>
        <div class="card-s">Os editais ${setores.map((s) => `<b>${esc(s.sigla)}</b>`).join(" e ")}
          se publicam por aqui: o número, o ciclo, a vigência e o PDF. O edital lançado passa a valer
          no setor e aparece na página pública de <b>Editais e Resultados</b> — sem esperar deploy.</div>

        ${cadastrados.length ? cadastrados.map(linha).join("") : `
          <div class="ed-sub" style="padding:10px 0">Nenhum edital lançado pelo portal ainda —
            os que estão no ar vieram com o sistema (lista abaixo).</div>`}

        ${EDITANDO ? formulario() : `<div class="exp" style="margin-top:12px">
          <button class="bt bt-pri" onclick="ArcheEditais.novo()">＋ Lançar novo edital</button>
        </div>`}

        ${acervo.length ? `<details style="margin-top:14px">
          <summary style="cursor:pointer;font-size:12.5px;color:var(--muted,#657179)">
            Editais já publicados (${acervo.length}) — o acervo que veio com o sistema</summary>
          <div style="margin-top:6px">
            ${acervo.map((e) => `<div class="ed-lin" style="padding:6px 0">
              <span class="ed-sub">Edital <b>${esc(e.numero)}</b>${e.ciclo ? ` · ciclo ${esc(e.ciclo)}` : ""}</span>
              ${e.documento ? `<a class="ed-sub" href="${esc(e.documento)}" target="_blank" rel="noopener">PDF</a>` : ""}
              ${e.encerrado ? '<span class="ed-tag" style="background:#f2f4f6;color:#657179">encerrado</span>'
                : '<span class="ed-tag" style="background:#e8f6ee;color:#1e7a45">em curso</span>'}
              <span style="flex:1"></span>
              <button class="bt bt-ghost" style="padding:3px 9px;font-size:11.5px"
                onclick="ArcheEditais.encerrar('${esc(e.numero)}',${e.encerrado ? "false" : "true"})">
                ${e.encerrado ? "Reabrir" : "Encerrar o ciclo"}</button>
            </div>`).join("")}
          </div>
          <div class="ed-sub" style="margin-top:6px">O TEXTO destes não se edita por aqui: é o registro
            do que já foi publicado. O que se pode é <b>encerrar o ciclo</b> — é o que tira a turma (ou
            o edital) de circulação quando o seguinte entra no ar.</div>
        </details>` : ""}
      </div>`;
  }

  const linha = (e) => {
    const s = setorDe(e.setor);
    return `<div class="ed-lin">
      <span class="ed-tag">${esc(s?.sigla || e.setor)}</span>
      <span class="ed-nm">${esc(e.designacao || `Edital ${e.numero}`)}</span>
      <span class="ed-sub">${[
        e.ciclo ? `ciclo ${esc(e.ciclo)}` : "",
        e.vigencia?.inicio && e.vigencia?.fim ? `${dBR(e.vigencia.inicio)} a ${dBR(e.vigencia.fim)}` : "",
      ].filter(Boolean).join(" · ")}</span>
      ${e.encerrado ? '<span class="ed-tag" style="background:#f2f4f6;color:#657179">encerrado</span>'
        : '<span class="ed-tag" style="background:#e8f6ee;color:#1e7a45">vigente</span>'}
      ${e.documento ? `<a class="bt bt-ghost" style="padding:4px 10px;font-size:12px"
        href="${esc(e.documento)}" target="_blank" rel="noopener">📜 PDF anexado</a>` : ""}
      ${e.temTexto ? `<a class="bt bt-ghost" style="padding:4px 10px;font-size:12px"
        href="/api/publico/editais/${esc(e.id)}/edital.pdf" target="_blank" rel="noopener"
        title="Gerado pelo ARCHÉ, no layout institucional">📄 Edital (ARCHÉ)</a>` : ""}
      ${!e.documento && !e.temTexto ? '<span class="ed-sub">sem documento</span>' : ""}
      <span style="flex:1"></span>
      <button class="bt bt-sec" style="padding:4px 10px;font-size:12px"
        onclick="ArcheEditais.editar('${esc(e.id)}')">Editar</button>
      <button class="bt bt-ghost" style="padding:4px 10px;font-size:12px"
        onclick="ArcheEditais.excluir('${esc(e.id)}')">Excluir</button>
    </div>`;
  };

  /* O exemplo do título é o do SETOR: o da graduação nomeia as três linhas,
     o do ICEM a turma e o da monitoria o semestre — um placeholder genérico
     mandaria a pessoa escrever o título errado. */
  function tituloExemplo(e) {
    const n = e.numero || "";
    if (e.setor === "em") return `Ex.: Edital nº ${n} — Iniciação Científica no Ensino Médio (ICEM), turma ${e.ciclo || ""}`;
    if (e.setor === "monitoria") return `Ex.: Programa de Monitoria Acadêmica ${e.ciclo || ""}`;
    return `Ex.: Edital nº ${n} — Iniciação Científica, Inovação Tecnológica e Iniciação à Extensão`;
  }

  function formulario() {
    const e = EDITANDO;
    const s = setorDe(e.setor);
    const novo = !e.id;
    const setores = setoresVisiveis();
    return `<div class="ed-form">
      <div style="font-weight:700;margin-bottom:2px">${novo ? "Novo edital" : `Edital ${esc(e.numero)}`}</div>
      <div class="ed-sub" style="margin-bottom:10px">${esc(s?.ajuda || "")}</div>

      <div class="ed-g3">
        <div><label>Setor *</label>
          <select id="ed-setor" ${novo ? "" : "disabled"} onchange="ArcheEditais.trocouSetor(this.value)">
            ${setores.map((x) => `<option value="${x.codigo}" ${e.setor === x.codigo ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}
          </select></div>
        <div><label>Ano *</label>
          <input id="ed-ano" type="number" min="2020" max="2099" value="${esc(e.ano || "")}"
            onchange="ArcheEditais.trocouAno(this.value)"></div>
        <div><label>Número <span class="ed-sub">(emitido ao lançar)</span></label>
          <input id="ed-numero" value="${esc(e.numero || "")}" disabled
            title="O número sai da sequência da instituição, na ordem em que os editais são criados — como o Número da Ação da Extensão."></div>
      </div>

      <label>Título *</label>
      <input id="ed-titulo" value="${esc(e.titulo || "")}"
        placeholder="${esc(tituloExemplo(e))}">

      <div class="ed-g2">
        <div><label>Órgão expedidor</label>
          <input id="ed-orgao" value="${esc(e.orgao || s?.orgaoPadrao || "")}"></div>
        <div><label>Instituição</label>
          <input id="ed-instituicao" value="${esc(e.instituicao || "")}"></div>
      </div>

      <div class="ed-g3">
        <div><label>Ciclo * <span class="ed-sub">${s?.ciclo === "semestral" ? "(AAAA/1 ou AAAA/2)" : "(AAAA/AAAA)"}</span></label>
          <input id="ed-ciclo" value="${esc(e.ciclo || "")}"></div>
        <div><label>Vigência — início *</label>
          <input id="ed-ini" type="date" value="${esc(e.vigencia?.inicio || "")}"></div>
        <div><label>Vigência — fim *</label>
          <input id="ed-fim" type="date" value="${esc(e.vigencia?.fim || "")}"></div>
      </div>

      <div class="ed-g2">
        <div><label>Publicado em</label>
          <input id="ed-pub" type="date" value="${esc(e.publicadoEm || "")}"></div>
        <div><label>Situação</label>
          <select id="ed-encerrado">
            <option value="">Vigente — é este que vale no setor</option>
            <option value="1" ${e.encerrado ? "selected" : ""}>Encerrado — fica no arquivo</option>
          </select></div>
      </div>

      <label>Documento do edital (PDF)</label>
      <div class="exp" style="gap:8px;align-items:center">
        <input type="file" id="ed-pdf" accept="application/pdf" style="width:auto"
          onchange="ArcheEditais.subirPdf(this)">
        <span id="ed-pdf-st" class="ed-sub">${e.documento
          ? `✓ anexado${e.documentoNome ? `: ${esc(e.documentoNome)}` : ""} — <a href="${esc(e.documento)}" target="_blank" rel="noopener">abrir</a>`
          : (s?.codigo === "monitoria"
            ? "opcional: o texto do edital da monitoria é gerado pelo próprio ARCHÉ."
            : "o PDF é o que a comunidade baixa na página pública.")}</span>
      </div>

      <label style="margin-top:10px">Texto do edital
        <span class="ed-sub">(escrito aqui, o ARCHÉ gera o PDF no layout institucional)</span></label>
      <textarea id="ed-corpo" rows="12" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px"
        placeholder="A PROPPEX torna pública a abertura das inscrições…&#10;&#10;1. DAS DISPOSIÇÕES PRELIMINARES&#10;1.1. O presente Edital estabelece…&#10;1.2. Poderão participar:&#10;a) docentes efetivos;&#10;b) coordenações de curso.&#10;2. DOS OBJETIVOS&#10;2.1. …">${esc(e.corpo || "")}</textarea>
      <div class="ed-sub" style="margin-top:4px">Escreva (ou <b>cole</b>) o edital como ele é redigido —
        a numeração que você usar é a que sai impressa, o ARCHÉ não renumera nada:
        <b>1.</b> vira título de seção, <b>1.1.</b> vira item, <b>a)</b> vira alínea e <b>I.</b> vira inciso;
        o que vier antes da primeira seção é o preâmbulo. Timbre, caixa do número, cronograma e as
        assinaturas da pró-reitoria entram sozinhos.
        ${e.id ? `<a href="/api/publico/editais/${esc(e.id)}/edital.pdf" target="_blank" rel="noopener"><b>Ver a prévia em PDF</b></a> — salve antes, para a prévia sair com o que está na tela.`
          : "Salve o edital para ver a prévia em PDF."}</div>

      <label style="margin-top:10px">Observação <span class="ed-sub">(aparece no arquivo do setor)</span></label>
      <input id="ed-obs" value="${esc(e.observacao || "")}"
        placeholder="Ex.: publicado antes da transformação em UNIEGO.">

      ${e.setor === "monitoria" ? `<details style="margin-top:10px" open>
        <summary style="cursor:pointer;font-size:12.5px;color:var(--muted,#657179)">
          Cronograma do ciclo — as datas que o sistema cobra</summary>
        <div class="ed-g2" style="margin-top:8px">
          ${(DADOS.etapasMonitoria || []).filter(([c]) => c !== "vigencia").map(([c, rot]) => `
            <div><label>${esc(rot)}</label>
              <input id="ed-pz-${c}" type="date" value="${esc(e.prazos?.[c] || "")}"></div>`).join("")}
        </div>
        <div class="ed-sub" style="margin-top:6px">São os prazos do EDITAL: a submissão fecha na data
          da primeira linha, a cobrança do relatório começa 30 dias antes da dele, e é este quadro que
          sai impresso no PDF do edital. A <b>vigência</b> das atividades é a do bloco acima.
          Em branco, valem os prazos do ciclo anterior — o que num edital novo é quase sempre errado.</div>
      </details>` : ""}

      ${e.setor === "ic" ? `<details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:12.5px;color:var(--muted,#657179)">
          Régua do edital (em branco, repete a do edital anterior)</summary>
        <div class="ed-g2" style="margin-top:8px">
          <div><label>Produção pontuada — de (ano)</label>
            <input id="ed-prodde" type="number" min="2000" max="2099" value="${esc(e.producaoDe ?? "")}"></div>
          <div><label>Produção pontuada — até (ano)</label>
            <input id="ed-prodate" type="number" min="2000" max="2099" value="${esc(e.producaoAte ?? "")}"></div>
        </div>
        <div class="ed-g2">
          <div><label>Relatório parcial — mês da vigência</label>
            <input id="ed-relp" type="number" min="1" max="24" value="${esc(e.relatorios?.parcial ?? "")}"></div>
          <div><label>Relatório final — mês da vigência</label>
            <input id="ed-relf" type="number" min="1" max="24" value="${esc(e.relatorios?.final ?? "")}"></div>
        </div>
        <div class="ed-sub" style="margin-top:6px">A janela do currículo pontuado (item 7.3) e os meses
          em que cada relatório vence (item 11.1.b). São os campos que MUDAM o comportamento do ciclo —
          deixe em branco se o edital novo repete a régua do anterior.</div>
      </details>` : ""}

      ${e.setor === "ic" && !e.encerrado ? `<div class="banner ba-warn" style="margin-top:10px">
        <b>Este edital passa a ser o vigente da graduação.</b> As submissões novas nascem nele, e a
        vigência acima vira a dos planos de trabalho. O edital anterior continua no arquivo, com os
        projetos dele intactos — marque-o como <b>encerrado</b> quando o ciclo dele fechar.</div>` : ""}
      ${e.setor === "em" && !e.encerrado ? `<div class="banner ba-warn" style="margin-top:10px">
        <b>Este edital abre a turma ${esc(e.ciclo || "")} do ICEM.</b> Os bolsistas novos entram nela.
        Encerre a turma anterior para que ela pare de aparecer como em curso.</div>` : ""}

      <div class="exp" style="margin-top:12px">
        <button class="bt bt-pri" onclick="ArcheEditais.salvar()">${novo ? "Lançar o edital" : "Salvar"}</button>
        <button class="bt bt-ghost" onclick="ArcheEditais.fechar()">Cancelar</button>
      </div>
    </div>`;
  }

  /* ------------------------------- ações ------------------------------- */

  function guardarCampos() {
    if (!EDITANDO) return;
    const v = (id) => document.getElementById(id)?.value ?? "";
    const n = (id) => (v(id) === "" ? null : Number(v(id)));
    EDITANDO = {
      ...EDITANDO,
      setor: v("ed-setor") || EDITANDO.setor,
      ano: n("ed-ano"),
      numero: EDITANDO.numero,          // emitido pelo servidor, não digitado
      titulo: v("ed-titulo").trim(),
      orgao: v("ed-orgao").trim(),
      instituicao: v("ed-instituicao").trim(),
      ciclo: v("ed-ciclo").trim(),
      vigencia: { inicio: v("ed-ini"), fim: v("ed-fim") },
      publicadoEm: v("ed-pub"),
      encerrado: v("ed-encerrado") === "1",
      observacao: v("ed-obs").trim(),
      corpo: document.getElementById("ed-corpo") ? v("ed-corpo") : EDITANDO.corpo,
      producaoDe: document.getElementById("ed-prodde") ? n("ed-prodde") : EDITANDO.producaoDe,
      producaoAte: document.getElementById("ed-prodate") ? n("ed-prodate") : EDITANDO.producaoAte,
      relatorios: document.getElementById("ed-relp")
        ? { parcial: n("ed-relp"), final: n("ed-relf") } : EDITANDO.relatorios,
      prazos: document.getElementById("ed-pz-submissao")
        ? Object.fromEntries((DADOS.etapasMonitoria || [])
          .filter(([c]) => c !== "vigencia").map(([c]) => [c, v(`ed-pz-${c}`)]))
        : EDITANDO.prazos,
    };
  }

  const ArcheEditais = {
    async montar(el, opcoes = {}) {
      ALVO = el; OPCOES = opcoes;
      try { DADOS = await api("/api/editais"); }
      catch { ALVO.innerHTML = ""; return; }   // sem permissão: o cartão não existe
      desenhar();
    },
    novo() {
      const s = setoresVisiveis()[0];
      if (!s) return;
      const sug = DADOS.sugestao?.[s.codigo] || {};
      EDITANDO = {
        id: "", setor: s.codigo, ano: sug.ano, numero: sug.numero, titulo: "",
        orgao: s.orgaoPadrao, instituicao: INSTITUICAO, ciclo: sug.ciclo,
        vigencia: { ...(sug.vigencia || {}) }, publicadoEm: "", encerrado: false,
        documento: "", documentoNome: "", observacao: "", relatorios: {},
      };
      desenhar();
    },
    editar(id) {
      EDITANDO = { ...(DADOS.editais || []).find((e) => e.id === id) };
      desenhar();
    },
    fechar() { EDITANDO = null; desenhar(); },
    /* Trocar o setor ou o ano REFAZ as sugestões — número, ciclo e vigência
       saem do setor e do ano, e mantê-los do setor anterior daria um edital
       "03/2027" com o ciclo da graduação. O que a pessoa já digitou à mão
       fica: só os três campos derivados são reescritos. */
    trocouSetor(codigo) {
      guardarCampos();
      const sug = DADOS.sugestao?.[codigo] || {};
      const s = setorDe(codigo);
      EDITANDO = { ...EDITANDO, setor: codigo, ciclo: sug.ciclo,
        vigencia: { ...(sug.vigencia || {}) }, orgao: s?.orgaoPadrao || EDITANDO.orgao };
      desenhar();
    },
    trocouAno(ano) {
      guardarCampos();
      const n = Number(ano);
      if (!n) return;
      const s = setorDe(EDITANDO.setor);
      const semestral = s?.ciclo === "semestral";
      const livre = s?.ciclo === "livre";
      EDITANDO = {
        ...EDITANDO, ano: n,
        ciclo: semestral ? `${n}/1` : livre ? String(n) : `${n}/${n + 1}`,
        vigencia: semestral ? { inicio: `${n}-01-01`, fim: `${n}-06-30` }
          : livre ? { inicio: `${n}-01-01`, fim: `${n}-12-31` }
          : { inicio: `${n}-09-01`, fim: `${n + 1}-08-31` },
      };
      desenhar();
    },
    async subirPdf(input) {
      const f = input.files?.[0];
      if (!f) return;
      const st = document.getElementById("ed-pdf-st");
      st.textContent = "enviando…";
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await api("/api/editais/documento", { method: "POST", body: fd });
        guardarCampos();
        EDITANDO = { ...EDITANDO, documento: r.documento, documentoNome: r.nome };
        desenhar();
      } catch (e) {
        st.textContent = "não foi possível anexar: " + e.message;
        input.value = "";
      }
    },
    async salvar() {
      guardarCampos();
      try {
        const r = await api("/api/editais", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(EDITANDO),
        });
        EDITANDO = null;
        DADOS = await api("/api/editais");
        desenhar();
        alert(`Edital ${r.edital.numero} lançado.`
          + (r.vigente === r.edital.numero ? "\n\nEle é agora o edital vigente do setor." : ""));
        OPCOES.aoMudar?.();
      } catch (e) { alert("Não deu para lançar: " + e.message); }
    },
    /* O único ato sobre o acervo do CÓDIGO: encerrar (ou reabrir) o ciclo.
       Sem ele, lançar a turma seguinte deixaria as duas abertas — e o
       bolsista novo cairia na velha. */
    async encerrar(numero, encerrado) {
      if (!confirm(encerrado
        ? `Encerrar o ciclo do edital ${numero}?\n\nEle sai de circulação e passa a aparecer como encerrado. Os registros dele ficam intactos.`
        : `Reabrir o ciclo do edital ${numero}?`)) return;
      try {
        await api("/api/editais/encerrar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numero, encerrado }),
        });
        DADOS = await api("/api/editais");
        desenhar();
        OPCOES.aoMudar?.();
      } catch (e) { alert("Não deu para encerrar: " + e.message); }
    },
    async excluir(id) {
      const e = (DADOS.editais || []).find((x) => x.id === id);
      if (!e) return;
      if (!confirm(`Excluir o edital ${e.numero} do cadastro?\n\n`
        + "Ele some do setor e da página pública. Editais que já receberam submissões não se "
        + "excluem — para tirá-los de circulação, marque-os como encerrados.")) return;
      try {
        await api(`/api/editais/${encodeURIComponent(id)}/excluir`, { method: "POST" });
        DADOS = await api("/api/editais");
        desenhar();
        OPCOES.aoMudar?.();
      } catch (err) { alert("Não deu para excluir: " + err.message); }
    },
  };

  window.ArcheEditais = ArcheEditais;
})();
