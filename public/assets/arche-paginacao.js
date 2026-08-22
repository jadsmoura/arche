/* =======================================================================
   ARCHÉ — paginação compartilhada das listas (pedido do dono, ago/2026:
   "sempre que aparecem listas estão muito longas; gostaria daqueles
   filtros de mostrar 10, 20, 50, 100").

   O portal tem listas que crescem sem teto — os usuários cadastrados, os
   certificados do arquivo, o acervo de atas, os inscritos de um evento, os
   agendamentos. Duas saídas já existiam e nenhuma servia: rolar por
   trezentas linhas, ou o corte mudo ("mostrando os 60 primeiros"), que
   esconde o resto sem dar como chegar até ele.

   Isto é UM componente, e é de propósito: o `/usuarios/` já tinha DUAS
   paginações quase iguais dentro do mesmo arquivo, e duas cópias da mesma
   regra acabam diferentes — uma lembra o tamanho escolhido, a outra não;
   uma volta à página 1 ao filtrar, a outra deixa a pessoa numa página que
   não existe mais.

   COMO USAR, numa tela qualquer:

     const p = ArchePag.recorte("mon-arquivo", lista, desenharLista);
     alvo.innerHTML = p.barra + p.itens.map(linha).join("");

   e, no manipulador do filtro, `ArchePag.zerar("mon-arquivo")` — trocar o
   recorte é começar outra lista, e continuar na página 7 dela não faz
   sentido.

   Três decisões que o componente carrega para as telas não repetirem:
    - o tamanho escolhido **fica na conta de quem olha** (localStorage, por
      chave): quem gosta de ver 100 não quer reescolher a cada visita;
    - a barra **não se desenha** quando a lista cabe na menor opção — uma
      barra de paginação sobre sete linhas é ruído;
    - a página **se ajusta sozinha** ao tamanho da lista: filtrar de 300
      para 12 linhas não pode deixar ninguém olhando uma página vazia.
   ======================================================================= */
(function () {
  if (window.ArchePag) return;

  /* O PADRÃO É 20, e é uma decisão do dono (ago/2026): "acho que uma lista
     padrão inicial de 20 fica bom; se eu quiser expandir escolho outras
     opções". Vinte linhas cabem numa tela sem rolagem longa e bastam para
     reconhecer o que se procura; quem quer mais troca no seletor, e a
     escolha fica guardada. Vale para TODA lista nova do portal — este
     número não se redefine tela a tela. */
  var TAMANHOS = [10, 20, 50, 100];
  var PADRAO = 20;

  var CSS = `
  .ap-barra{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 12px;
    font-family:inherit}
  .ap-info{font-size:12px;color:var(--muted,#657179);margin-right:auto}
  .ap-info b{color:var(--ink,#182632);font-weight:600;font-variant-numeric:tabular-nums}
  /* as folhas dos setores põem TODO label em caixa-alta (arche-ui.css) e
     algumas o deixam em bloco: o componente precisa valer igual em todas */
  .ap-barra label.ap-tam{display:inline-flex;align-items:center;gap:6px;font-size:12px;
    color:var(--muted,#657179);margin:0 4px 0 0;font-weight:400;letter-spacing:0;
    text-transform:none}
  .ap-tam select{border:1px solid var(--line-strong,#cfd6de);border-radius:7px;padding:4px 7px;
    font-family:inherit;font-size:12.5px;background:#fff;color:var(--ink,#182632)}
  .ap-barra button{background:#fff;border:1px solid var(--line-strong,#cfd6de);border-radius:7px;
    padding:4px 10px;font-size:12.5px;font-family:inherit;color:var(--ink,#182632);cursor:pointer;
    font-variant-numeric:tabular-nums}
  .ap-barra button:hover:not(:disabled){border-color:var(--brand-3,#40717e);color:var(--brand,#1c3742)}
  .ap-barra button:disabled{opacity:.4;cursor:default}
  .ap-barra button.on{background:var(--brand,#1c3742);border-color:var(--brand,#1c3742);color:#fff}
  .ap-reticencia{font-size:12px;color:var(--muted-2,#a9b4c0);padding:0 2px}
  @media (max-width:640px){ .ap-info{width:100%;margin-bottom:2px} }
  `;

  var estado = {};        // chave -> { n, tam, aoTrocar }

  function instalarCss() {
    if (document.getElementById("apEstilo")) return;
    var st = document.createElement("style");
    st.id = "apEstilo"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function ler(chave) {
    if (!estado[chave]) {
      var salvo = 0;
      try { salvo = Number(localStorage.getItem("arche-pag-" + chave)) || 0; } catch (e) { /* modo restrito */ }
      estado[chave] = { n: 1, tam: salvo || PADRAO, aoTrocar: null };
    }
    return estado[chave];
  }

  function redesenhar(chave) {
    var st = ler(chave);
    if (typeof st.aoTrocar === "function") st.aoTrocar();
  }

  window.ArchePag = {
    TAMANHOS: TAMANHOS,

    /**
     * Recorta a lista e devolve a barra. `aoTrocar` é a função que redesenha
     * a tela — ela se re-registra a cada chamada, então a última render é
     * sempre a que os botões acionam.
     */
    recorte: function (chave, lista, aoTrocar) {
      instalarCss();
      var st = ler(chave);
      if (typeof aoTrocar === "function") st.aoTrocar = aoTrocar;
      var itens = lista || [];
      var total = itens.length;
      // tam 0 = "todos": quem escolheu ver tudo não quer barra de páginas
      var tam = st.tam > 0 ? st.tam : total || 1;
      var paginas = Math.max(1, Math.ceil(total / tam));
      // a página se ajusta ao tamanho da lista: filtrar não pode deixar
      // ninguém olhando uma página que deixou de existir
      st.n = Math.min(Math.max(1, st.n), paginas);
      var ini = (st.n - 1) * tam;
      return {
        itens: itens.slice(ini, ini + tam),
        total: total, paginas: paginas, pagina: st.n, ini: ini,
        barra: barra(chave, { total: total, paginas: paginas, ini: ini, tam: tam }),
      };
    },

    /** Trocar o filtro é começar outra lista: volta à primeira página. */
    zerar: function (chave) { ler(chave).n = 1; },

    ir: function (chave, n) { ler(chave).n = n; redesenhar(chave); },

    tamanho: function (chave, v) {
      var st = ler(chave);
      st.tam = Number(v) || 0;
      st.n = 1;
      try { localStorage.setItem("arche-pag-" + chave, String(st.tam)); } catch (e) { /* sem storage */ }
      redesenhar(chave);
    },
  };

  function barra(chave, p) {
    var st = ler(chave);
    // lista curta não pede barra: sobre sete linhas ela é só ruído
    if (p.total <= TAMANHOS[0] && st.tam >= TAMANHOS[0]) return "";
    var c = JSON.stringify(chave);
    var bt = function (rot, alvo, ativo, off) {
      return '<button ' + (off ? "disabled" : "") + (ativo ? ' class="on"' : "")
        + ' onclick="ArchePag.ir(' + c + ',' + alvo + ')">' + rot + "</button>";
    };
    var nums = [], janela = function (a, b) {
      for (var i = a; i <= b; i++) nums.push(bt(String(i), i, i === st.n, false));
    };
    if (p.paginas <= 7) janela(1, p.paginas);
    else {
      janela(1, 1);
      if (st.n > 3) nums.push('<span class="ap-reticencia">…</span>');
      janela(Math.max(2, st.n - 1), Math.min(p.paginas - 1, st.n + 1));
      if (st.n < p.paginas - 2) nums.push('<span class="ap-reticencia">…</span>');
      janela(p.paginas, p.paginas);
    }
    var ate = Math.min(p.ini + p.tam, p.total);
    var opcoes = TAMANHOS.map(function (n) {
      return '<option value="' + n + '"' + (st.tam === n ? " selected" : "") + ">" + n + "</option>";
    }).join("") + '<option value="0"' + (st.tam === 0 ? " selected" : "") + ">todos</option>";
    return '<div class="ap-barra">'
      + '<span class="ap-info">Mostrando <b>' + (p.total ? p.ini + 1 : 0) + "–" + ate
      + "</b> de <b>" + p.total + "</b></span>"
      + '<label class="ap-tam">Mostrar <select onchange="ArchePag.tamanho(' + c + ',this.value)">'
      + opcoes + "</select></label>"
      + (p.paginas > 1
        ? bt("‹", st.n - 1, false, st.n <= 1) + nums.join("") + bt("›", st.n + 1, false, st.n >= p.paginas)
        : "")
      + "</div>";
  }
})();
