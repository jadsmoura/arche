/* =======================================================================
   ARCHÉ — "Ver como…" compartilhado entre os setores.

   A coordenação abre o setor pelos olhos de outra pessoa, para conferir o
   que ela enxerga. É a pergunta que mais chega ao suporte — "o professor
   diz que não vê a ação dele" —, e respondê-la sem isto obriga a gestão a
   pedir a senha de alguém.

   **Não é atalho de permissão.** Quem faz o recorte é o SERVIDOR: a tela
   manda `?como=…` nas leituras e recebe o que aquela pessoa receberia. Se
   fosse o cliente escondendo menu, a simulação mentiria justamente onde
   importa (o sigilo do parecer, o CPF do colega de projeto).

   **É somente leitura.** Escrever com `?como=` gravaria em nome da GESTÃO
   (a sessão real é dela) enquanto a tela finge ser outra pessoa — e o
   histórico diria que foi a pessoa quem mexeu. O servidor recusa, e este
   componente nem deixa a chamada sair.

   O ARCHÉ IC tem a sua própria versão desta janela, escrita antes e
   entrelaçada com o META do setor (perfis genéricos de orientador, aluno e
   avaliador, contagem por papel). Este arquivo é o mesmo desenho, sem as
   partes específicas da IC, para os demais setores usarem — mexer num não
   mexe no outro, o que é bom enquanto a IC for o setor com mais regras.

   COMO USAR, num setor qualquer:

     ArcheVerComo.iniciar({
       chave: "ex",                       // guarda a escolha nesta aba
       alvo: document.getElementById("dir-info"),
       genericas: [{ id: "perfil:professor", rot: "Professor", ... }],
       papeis: { responsavel: { rot: "Responsável", cls: "o" } },
       aoTrocar: (como) => recarregarTudo(),
     });
     ArcheVerComo.pessoas(dados.pessoas);  // { grupo: [ {id, nome, email} ] }
     fetch(ArcheVerComo.url("/api/extensao"))
     document.getElementById("faixa").innerHTML = ArcheVerComo.faixa();
   ======================================================================= */
(function () {
  if (window.ArcheVerComo) return;

  var CSS = `
  .vc-bt{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #cfd6de;
    border-radius:8px;padding:6px 11px;font-size:12.5px;color:var(--muted,#7c8794);cursor:pointer;
    font-family:inherit}
  .vc-bt:hover{border-color:var(--brand-3,#40717e);color:var(--ink,#1c3742)}
  .vc-bt b{color:var(--ink,#1c3742);font-weight:600}
  .vc-bt.on{background:var(--warn-soft,#fbf3e4);border-color:#e8d3a8;color:#8a6420}
  .vc-bt.on b{color:#6d4e19}
  .vc-ov{position:fixed;inset:0;background:rgba(28,55,66,.42);z-index:60;display:flex;
    align-items:flex-start;justify-content:center;padding:60px 18px 24px;overflow-y:auto}
  .vc-ov.hide{display:none}
  .vc-cx{background:#fff;border-radius:14px;width:100%;max-width:520px;padding:22px 22px 18px;
    box-shadow:0 24px 60px rgba(18,38,50,.28);font-family:inherit}
  .vc-cab{display:flex;align-items:flex-start;gap:12px;margin-bottom:4px}
  .vc-cab .t{font-family:Sora,sans-serif;font-weight:700;font-size:16px;flex:1;color:var(--ink,#1c3742)}
  .vc-cab .s{font-size:12px;color:var(--muted,#7c8794);margin-top:3px}
  .vc-x{background:none;border:0;font-size:20px;line-height:1;color:var(--muted-2,#a9b4c0);cursor:pointer;padding:0 2px}
  .vc-x:hover{color:var(--ink,#1c3742)}
  .vc-lab{font-size:10.5px;letter-spacing:.14em;font-weight:700;color:var(--muted-2,#a9b4c0);margin:18px 0 8px}
  .vc-gen{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .vc-op{display:flex;flex-direction:column;gap:2px;text-align:left;background:#fff;
    border:1px solid var(--line,#e3e7ee);border-radius:9px;padding:9px 12px;cursor:pointer;
    font-size:13px;font-weight:600;color:var(--ink,#1c3742);font-family:inherit}
  .vc-op small{font-weight:400;font-size:11.5px;color:var(--muted,#7c8794)}
  .vc-op:hover{border-color:var(--brand-3,#40717e)}
  .vc-op.on{background:var(--info-soft,#e8f4fa);border-color:#a8d5e8;color:var(--brand,#1c3742)}
  .vc-busca{width:100%;border:1px solid #cfd6de;border-radius:8px;padding:10px 12px;
    font-family:inherit;font-size:14px;background:#fff;color:var(--ink,#1c3742)}
  .vc-busca:focus{outline:none;border-color:var(--brand-3,#40717e);box-shadow:0 0 0 3px rgba(64,113,126,.12)}
  .vc-abas{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 8px}
  .vc-aba{background:#fff;border:1px solid var(--line,#e3e7ee);border-radius:20px;padding:4px 11px;
    font-size:11.5px;color:var(--muted,#7c8794);cursor:pointer;font-family:inherit}
  .vc-aba:hover{border-color:var(--brand-3,#40717e);color:var(--ink,#1c3742)}
  .vc-aba.on{background:var(--brand,#1c3742);border-color:var(--brand,#1c3742);color:#fff}
  .vc-lista{max-height:290px;overflow-y:auto;border:1px solid var(--line,#e3e7ee);border-radius:10px}
  .vc-p{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:0;
    border-bottom:1px solid var(--line-2,#f0f2f6);padding:9px 12px;cursor:pointer;font-family:inherit}
  .vc-p:last-child{border-bottom:0}
  .vc-p:hover{background:var(--info-soft,#e8f4fa)}
  .vc-p.on{background:var(--info-soft,#e8f4fa);box-shadow:inset 3px 0 0 var(--brand-3,#40717e)}
  .vc-ini{width:30px;height:30px;border-radius:50%;background:var(--trilho,#eef1f5);color:var(--brand-3,#40717e);
    flex:none;display:grid;place-items:center;font-size:11.5px;font-weight:700}
  .vc-p .nm{display:block;font-size:13px;font-weight:600;line-height:1.3;color:var(--ink,#1c3742);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .vc-p .dt{display:block;font-size:11px;color:var(--muted,#7c8794);line-height:1.3;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .vc-p .tags{margin-left:auto;display:flex;gap:4px;flex:none}
  .vc-tag{font-size:10px;font-weight:700;border-radius:20px;padding:2px 7px;
    background:var(--trilho,#eef1f5);color:var(--muted,#7c8794)}
  .vc-tag.o{background:var(--info-soft,#e8f4fa);color:var(--info,#40717e)}
  .vc-tag.a{background:var(--ok-soft,#e5f3ea);color:var(--ok,#3f8a5d)}
  .vc-tag.v{background:var(--roxo-soft,#ecebf6);color:var(--roxo,#5e5091)}
  .vc-vazio{padding:22px 14px;text-align:center;color:var(--muted,#7c8794);font-size:12.5px}
  .vc-faixa{border-radius:10px;padding:13px 15px;margin-bottom:14px;font-size:13.5px;font-weight:500;
    background:var(--warn-soft,#fbf3e4);color:var(--warn,#c98a2b);border:1px solid #f0e0bd;
    display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .vc-faixa button{margin-left:auto;background:#fff;border:1px solid #cfd6de;border-radius:8px;
    padding:7px 13px;font-size:12.5px;font-weight:600;color:var(--muted,#7c8794);cursor:pointer;font-family:inherit}
  .vc-faixa button:hover{color:var(--ink,#1c3742);border-color:var(--brand-3,#40717e)}`;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var semAcento = function (s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  };

  var CFG = null;          // { chave, alvo, genericas, papeis, aoTrocar, rotuloGestao }
  var COMO = "";
  var GRUPOS = null;       // { grupo: [pessoa] } — null enquanto o servidor não manda
  var UI = { busca: "", aba: "todos" };
  var ov = null;

  /* Os grupos do servidor viram UMA lista: quem acumula papéis (o professor
     que também é responsável por evento) aparecia repetido, um por grupo. */
  function pessoas() {
    var m = new Map();
    Object.keys(GRUPOS || {}).forEach(function (papel) {
      (GRUPOS[papel] || []).forEach(function (p) {
        var a = m.get(p.id) || { id: p.id, email: p.email || "", nome: "", semConta: false, papeis: [], contagem: {} };
        a.nome = a.nome || p.nome || "";
        a.email = a.email || p.email || "";
        a.semConta = a.semConta || !!p.semConta;
        if (a.papeis.indexOf(papel) < 0) a.papeis.push(papel);
        a.contagem[papel] = p.quantos || 0;
        m.set(p.id, a);
      });
    });
    return Array.from(m.values()).sort(function (a, b) {
      return (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR");
    });
  }

  function rotuloCurto(id) {
    var g = (CFG.genericas || []).filter(function (x) { return x.id === id; })[0];
    if (g) return g.curto || g.rot;
    if (!id) return CFG.rotuloGestao || "gestor";
    var p = pessoas().filter(function (x) { return x.id === id; })[0];
    return String((p && (p.nome || p.email)) || id).split(" ").slice(0, 2).join(" ");
  }

  function montarBotao() {
    if (!CFG || !CFG.alvo) return;
    if (!GRUPOS) { CFG.alvo.innerHTML = ""; return; }   // sem gestão, sem botão
    CFG.alvo.innerHTML = '<button class="vc-bt' + (COMO ? " on" : "") + '" '
      + 'onclick="ArcheVerComo.abrir()" title="Ver o setor por outros olhos">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>'
      + '<circle cx="12" cy="12" r="3"/></svg> Ver como <b>' + esc(rotuloCurto(COMO)) + "</b></button>";
    atualizarFaixa();
  }

  /* A faixa de aviso é do componente, não de cada setor: ela precisa estar
     à vista SEMPRE que a simulação está ligada, e deixar isso para a tela
     significa lembrar de redesenhá-la em cada render. */
  function atualizarFaixa() {
    if (!CFG || !CFG.faixaAlvo) return;
    CFG.faixaAlvo.innerHTML = window.ArcheVerComo.faixa();
  }

  function abrir() {
    UI = { busca: "", aba: "todos" };
    ov.innerHTML = '<div class="vc-cx">'
      + '<div class="vc-cab"><div style="flex:1"><div class="t">Ver o setor por outros olhos</div>'
      + '<div class="s">Somente leitura — nada aqui grava em nome de ninguém.</div></div>'
      + '<button class="vc-x" data-fechar="1" title="Fechar">×</button></div>'
      + '<div class="vc-lab">VISÕES GENÉRICAS — A CARA DE CADA ACESSO</div>'
      + '<div class="vc-gen">' + (CFG.genericas || []).map(function (g) {
        return '<button class="vc-op' + (COMO === g.id ? " on" : "") + '" data-vc="' + esc(g.id) + '">'
          + esc(g.rot) + "<small>" + esc(g.det || "") + "</small></button>";
      }).join("") + "</div>"
      + '<div class="vc-lab">PESSOA DO SETOR</div>'
      + '<input class="vc-busca" id="vcBusca" placeholder="Procurar por nome ou e-mail…" autocomplete="off">'
      + '<div class="vc-abas" id="vcAbas"></div><div class="vc-lista" id="vcLista"></div></div>';
    ov.classList.remove("hide");
    // um ouvinte só para a janela: o fundo fecha, a opção escolhe, a aba filtra
    ov.onclick = function (ev) {
      if (ev.target === ov || ev.target.closest("[data-fechar]")) return fechar();
      var op = ev.target.closest("[data-vc]");
      if (op) { fechar(); trocar(op.getAttribute("data-vc")); return; }
      var aba = ev.target.closest("[data-aba]");
      if (aba) { UI.aba = aba.getAttribute("data-aba"); renderAbas(); renderLista(); }
    };
    var busca = document.getElementById("vcBusca");
    busca.oninput = function () { UI.busca = this.value; renderLista(); };
    // Enter leva ao primeiro da lista: achou digitando, não tira a mão do teclado
    busca.onkeydown = function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var p = document.getElementById("vcLista").querySelector("[data-vc]");
      if (p) { fechar(); trocar(p.getAttribute("data-vc")); }
    };
    document.addEventListener("keydown", escapa);
    renderAbas(); renderLista();
    busca.focus();
  }
  function fechar() { ov.classList.add("hide"); document.removeEventListener("keydown", escapa); }
  function escapa(ev) { if (ev.key === "Escape") fechar(); }

  function renderAbas() {
    var gente = pessoas();
    var papeis = Object.keys(CFG.papeis || {});
    var conta = function (k) {
      return k === "todos" ? gente.length
        : gente.filter(function (p) { return p.papeis.indexOf(k) >= 0; }).length;
    };
    var abas = [["todos", "Todos"]].concat(papeis.map(function (k) {
      return [k, (CFG.papeis[k].plural || CFG.papeis[k].rot)];
    }));
    document.getElementById("vcAbas").innerHTML = abas.map(function (a) {
      return '<button class="vc-aba' + (UI.aba === a[0] ? " on" : "") + '" data-aba="' + a[0] + '">'
        + a[1] + " " + conta(a[0]) + "</button>";
    }).join("");
  }

  function renderLista() {
    var busca = semAcento(UI.busca).trim();
    var gente = pessoas()
      .filter(function (p) { return UI.aba === "todos" || p.papeis.indexOf(UI.aba) >= 0; })
      .filter(function (p) { return !busca || semAcento((p.nome || "") + " " + (p.email || "")).indexOf(busca) >= 0; });
    document.getElementById("vcLista").innerHTML = gente.length ? gente.map(function (p) {
      var nome = p.nome || p.email || p.id;
      var ini = nome.trim().split(/\s+/).slice(0, 2).map(function (x) { return x[0] || ""; }).join("").toUpperCase() || "?";
      var det = p.semConta ? "ainda sem conta — o vínculo é pelo CPF" : (p.email || "—");
      var tags = p.papeis.map(function (k) {
        var d = (CFG.papeis || {})[k] || { rot: k, cls: "" };
        return '<span class="vc-tag ' + (d.cls || "") + '">' + esc(d.rot)
          + (p.contagem[k] > 1 ? " " + p.contagem[k] : "") + "</span>";
      }).join("");
      return '<button class="vc-p' + (COMO === p.id ? " on" : "") + '" data-vc="' + esc(p.id) + '">'
        + '<span class="vc-ini">' + esc(ini) + "</span>"
        + '<span style="min-width:0;flex:1"><span class="nm">' + esc(nome) + "</span>"
        + '<span class="dt">' + esc(det) + "</span></span>"
        + '<span class="tags">' + tags + "</span></button>";
    }).join("") : '<div class="vc-vazio">Ninguém encontrado'
      + (UI.busca ? " com “" + esc(UI.busca) + "”" : " neste grupo") + ".</div>";
  }

  /* A troca RECARREGA a página. Poderia ser mais elegante remontar só o que
     mudou, mas cada setor tem o seu jeito de carregar, e meia tela remontada
     com os dados da outra pessoa é pior do que uma espera de um segundo. A
     escolha vai para a aba (sessionStorage) e sobrevive ao recarregamento. */
  function trocar(id) {
    if (id) sessionStorage.setItem("arche-vc-" + CFG.chave, id);
    else sessionStorage.removeItem("arche-vc-" + CFG.chave);
    location.reload();
  }

  /* O ?como= entra em TODA leitura do setor, e nenhuma escrita passa. Fazer
     isso aqui, e não em cada chamada, é o que permite ligar o recurso num
     setor sem revisar as suas dezenas de fetch — e o que impede que uma
     chamada nova, escrita amanhã, escape da regra sem ninguém notar. */
  function instalarFetch() {
    var nativo = window.fetch.bind(window);
    window.fetch = function (entrada, opcoes) {
      var url = typeof entrada === "string" ? entrada : null;
      var metodo = String((opcoes && opcoes.method) || "GET").toUpperCase();
      var doSetor = url && CFG.prefixos.some(function (p) { return url.indexOf(p) === 0; });
      if (doSetor && COMO) {
        if (metodo !== "GET") {
          return Promise.reject(new Error('Você está vendo o setor como outra pessoa — '
            + 'saia do modo "ver como" para editar.'));
        }
        entrada = window.ArcheVerComo.url(url);
      }
      var r = nativo(entrada, opcoes);
      // a lista de pessoas vem junto com os dados do setor: quem a manda é o
      // servidor, e só para quem é gestão de verdade
      if (doSetor && metodo === "GET") {
        r.then(function (res) {
          if (!res.ok) return;
          res.clone().json().then(function (j) {
            if (j && typeof j === "object" && "pessoas" in j) window.ArcheVerComo.pessoas(j.pessoas);
          }).catch(function () {});
        }).catch(function () {});
      }
      return r;
    };
  }

  window.ArcheVerComo = {
    /**
     * Liga o recurso num setor. `prefixos` são os caminhos de API do setor
     * (é o que o wrapper de fetch reconhece); `genericas` e `papeis` são o
     * vocabulário daquele setor — quem é "professor" na Extensão é
     * "orientador" na monitoria, e chamar tudo do mesmo nome confundiria.
     */
    instalar: function (cfg) {
      CFG = cfg || {};
      CFG.prefixos = CFG.prefixos || [];
      COMO = sessionStorage.getItem("arche-vc-" + CFG.chave) || "";
      if (!document.getElementById("vcEstilo")) {
        var st = document.createElement("style");
        st.id = "vcEstilo"; st.textContent = CSS;
        document.head.appendChild(st);
      }
      if (!ov) {
        ov = document.createElement("div");
        ov.className = "vc-ov hide";
        document.body.appendChild(ov);
      }
      CFG.alvo = CFG.alvo || document.getElementById("vcAlvo");
      CFG.faixaAlvo = CFG.faixaAlvo || document.getElementById("vcFaixa");
      instalarFetch();
      montarBotao();
    },
    /* O servidor manda os grupos; sem eles (quem não é gestão) o botão não
       se desenha e o `?como=` guardado na aba é descartado — senão a tela
       ficaria pedindo uma visão que o servidor recusaria. */
    pessoas: function (grupos) {
      GRUPOS = grupos || null;
      if (!GRUPOS && COMO) { COMO = ""; sessionStorage.removeItem("arche-vc-" + CFG.chave); }
      montarBotao();
    },
    como: function () { return COMO; },
    /* Acrescenta o ?como= às LEITURAS. Escrita nunca passa por aqui. */
    url: function (u) {
      if (!COMO) return u;
      return u + (u.indexOf("?") >= 0 ? "&" : "?") + "como=" + encodeURIComponent(COMO);
    },
    /* Trava do cliente: o servidor já recusa escrita com ?como=, e a tela
       não deve contornar isso mandando a escrita sem o parâmetro. */
    checarEscrita: function (metodo) {
      if (COMO && String(metodo || "GET").toUpperCase() !== "GET") {
        throw new Error('Você está vendo o setor como outra pessoa — saia do modo "ver como" para editar.');
      }
    },
    faixa: function () {
      if (!COMO) return "";
      var g = (CFG.genericas || []).filter(function (x) { return x.id === COMO; })[0];
      var voltar = '<button onclick="ArcheVerComo.sair()">Voltar a ver como '
        + esc(CFG.rotuloGestao || "gestão") + "</button>";
      if (g) {
        return '<div class="vc-faixa"><span>Você está vendo o setor como <b>'
          + esc(g.faixa || g.rot) + "</b> — é a cara do acesso, não os dados de alguém. "
          + "Somente leitura.</span>" + voltar + "</div>";
      }
      var p = pessoas().filter(function (x) { return x.id === COMO; })[0];
      return '<div class="vc-faixa"><span>Você está vendo o setor como <b>'
        + esc((p && (p.nome || p.email)) || COMO) + "</b>"
        + (p && p.semConta ? " — pessoa ainda sem conta: é o que ela encontrará ao se cadastrar com o CPF" : "")
        + " — somente leitura, nada aqui grava em nome dela.</span>" + voltar + "</div>";
    },
    abrir: abrir,
    sair: function () { trocar(""); },
  };
})();
