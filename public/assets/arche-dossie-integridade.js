/* =======================================================================
   ARCHÉ Avaliação — A GRAVAÇÃO DO DOSSIÊ NUNCA REMOVE PRODUÇÃO QUE
   NINGUÉM EXCLUIU.

   Achado de ago/2026, a partir da queixa de vários professores: "arquivos
   anexados sumiram do sistema".

   Ninguém apagou nada. O dossiê se apaga sozinho, um pouco a cada vez que
   alguém abre a página e salva. O caminho é este, e está no app compilado:

   Ao CARREGAR (`deserializeAndMerge`), o documento que veio do servidor é
   podado ANTES de virar a tela — e a poda é feita no próprio objeto:

     const minYear4 = new Date().getFullYear() - 3;          //  2026-3 = 2023
     grp.items = grp.items.filter(it => !it.year || (+it.year) >= minYear4);
     p.data.groups = p.data.groups.filter(g => g.items.length > 0);
     ... e uma deduplicação por título cortado em 40 caracteres + ano

   Ao GRAVAR (`serializeState`), o que se escreve é EXATAMENTE esse objeto
   podado — `data.groups` e `itemStates` saem os dois de `p.data.groups`.

   Ou seja: **a poda é da EXIBIÇÃO, mas é gravada como se fosse o
   documento.** Toda abertura poda; toda gravação sedimenta a poda. O item
   sai, e com ele sai o `anexo.path` — a referência ao comprovante que o
   professor subiu. O arquivo continua no Drive; o que deixa de existir é a
   linha que apontava para ele. Do lado de quem anexou, isso é exatamente
   "meu arquivo sumiu".

   Três regras podam, e cada uma pega um caso diferente:

     1. o RECORTE DE ANOS (o item 2.16 olha 2023–2026): produção de 2022 ou
        anterior, com comprovante e tudo, é descartada na primeira gravação
        que acontecer depois de a página abrir. E isso tem relógio: em
        01/01/2027 o corte passa a 2024, e o que é de 2023 vai junto;
     2. o DESCARTE DO GRUPO VAZIO: esvaziado pela regra 1, o grupo inteiro
        sai do documento;
     3. a DEDUPLICAÇÃO por `titulo.slice(0,40) + "|" + ano`: dois trabalhos
        distintos que coincidam nos 40 primeiros caracteres e no ano viram
        um só — e o que fica é o PRIMEIRO, que pode ser justamente o que
        não tem comprovante.

   ESTA TRAVA NÃO MEXE NA TELA. O recorte de anos continua valendo para o
   que se mostra e para a conta do 2.16 — é o instrumento do INEP que o
   pede. O que muda é só o que vai para o servidor: antes de gravar, o
   documento que está de saída é comparado com o que está lá, e **tudo o
   que sumiria sem alguém ter mandado sumir volta para dentro** — o item, o
   status, o motivo e o anexo.

   O QUE ELA NÃO RESSUSCITA: a exclusão deliberada. Quando o docente exclui
   uma produção, o app tira o item de `data.groups` E registra o que tirou
   em `ajustesProducao.excluidas` (com a lista "Excluídas por você", que
   restaura). A trava lê essa lista e respeita: item excluído de propósito
   fica excluído. Sem isso, ela desfaria uma decisão da pessoa — que é o
   defeito que veio corrigir, ao contrário.

   Ela também não INVENTA: só devolve o que está gravado no servidor. Se
   uma produção nunca chegou lá, ela não aparece.

   Por append, como todo ajuste em /arche: o app é compilado.
   ======================================================================= */
(function () {
  if (window.__archeIntegridade) return;
  window.__archeIntegridade = true;

  function chaveDoProf(p) {
    return p && p.lattesId
      ? "lattes:" + p.lattesId
      : "nome:" + String((p && p.nome) || "").trim().toLowerCase();
  }

  /* A trava vale para o dossiê do curso e para mais nada: o `storage` é o
     mesmo objeto que grava outras chaves da Avaliação. */
  function ehDossie(chave) {
    return typeof chave === "string" && /^dossie-.+-v\d+$/.test(chave);
  }

  function ids(lista) {
    var m = {};
    (lista || []).forEach(function (x) {
      var it = (x && x.item) || x;
      if (it && it.id != null) m[String(it.id)] = true;
    });
    return m;
  }

  /**
   * Devolve ao documento de SAÍDA tudo o que existe no do SERVIDOR e sumiu
   * sem exclusão deliberada. Nunca remove nada de nenhum dos dois.
   * Devolve o número de itens recuperados (0 = nada a fazer).
   */
  function naoDeixarSumir(saida, remoto) {
    if (!saida || !Array.isArray(saida.profs)) return 0;
    if (!remoto || !Array.isArray(remoto.profs)) return 0;

    var excluidasPorChave = {};
    ((saida.ajustesProducao && saida.ajustesProducao.profs) || []).forEach(function (x) {
      excluidasPorChave[x.chave] = ids(x.excluidas);
    });

    var recuperados = 0;

    var onde = {};
    saida.profs.forEach(function (p, n) { onde[chaveDoProf(p)] = n; });

    remoto.profs.forEach(function (rp) {
      var alvo = saida.profs[onde[chaveDoProf(rp)]];
      // docente que só existe no servidor: quem o acrescenta é a mescla do
      // app, não esta trava — aqui ela sairia do próprio escopo
      if (!alvo || !rp.data || !Array.isArray(rp.data.groups)) return;
      var excluidas = excluidasPorChave[chaveDoProf(rp)] || {};

      if (!alvo.data) return;              // a aba não carregou este docente
      if (!Array.isArray(alvo.data.groups)) alvo.data.groups = [];
      if (!Array.isArray(alvo.itemStates)) alvo.itemStates = [];

      var temItem = {};
      alvo.data.groups.forEach(function (g) {
        (g.items || []).forEach(function (it) { temItem[String(it.id)] = true; });
      });
      var temEstado = {};
      alvo.itemStates.forEach(function (s) { temEstado[String(s.id)] = true; });

      var estadoRemoto = {};
      (rp.itemStates || []).forEach(function (s) { estadoRemoto[String(s.id)] = s; });

      var grupoDe = {};
      alvo.data.groups.forEach(function (g, n) { if (g && g.key != null) grupoDe[g.key] = n; });

      rp.data.groups.forEach(function (rg) {
        (rg.items || []).forEach(function (it) {
          var id = String(it.id);
          if (temItem[id] || excluidas[id]) return;

          var n = grupoDe[rg.key];
          if (n == null) {
            // o grupo inteiro foi descartado por ter ficado vazio (regra 2)
            var novo = {};
            Object.keys(rg).forEach(function (k) { if (k !== "items") novo[k] = rg[k]; });
            novo.items = [];
            alvo.data.groups.push(novo);
            n = grupoDe[rg.key] = alvo.data.groups.length - 1;
          }
          alvo.data.groups[n].items.push(it);
          if (!temEstado[id]) {
            var s = estadoRemoto[id];
            alvo.itemStates.push(s
              ? { id: it.id, status: s.status, motivo: s.motivo || "", anexo: s.anexo || null }
              : { id: it.id, status: "pend", motivo: "", anexo: null });
            temEstado[id] = true;
          }
          temItem[id] = true;
          recuperados++;
        });
      });

      /* O comprovante de um item que SOBREVIVEU à poda também pode ter se
         perdido — a deduplicação (regra 3) mantém o primeiro dos dois, e o
         primeiro pode ser o que não tinha anexo. Só se acrescenta o que
         falta: anexo gravado na saída nunca é trocado pelo do servidor. */
      alvo.itemStates.forEach(function (s) {
        var r = estadoRemoto[String(s.id)];
        if (!s.anexo && r && r.anexo && r.anexo.path) {
          s.anexo = r.anexo;
          if (!s.status || s.status === "pend") s.status = r.status || s.status;
          recuperados++;
        }
      });

      /* Os documentos pessoais seguem a mesma regra: o app os reconstrói de
         um TEMPLATE a cada carga, e o que não estiver no template do dia sai
         do documento levando o anexo junto. */
      if (Array.isArray(rp.docsPessoais)) {
        if (!Array.isArray(alvo.docsPessoais)) alvo.docsPessoais = [];
        var temDoc = {};
        alvo.docsPessoais.forEach(function (d) { temDoc[String(d.id)] = d; });
        rp.docsPessoais.forEach(function (rd) {
          if (!rd || !rd.anexo || !rd.anexo.path) return;
          var d = temDoc[String(rd.id)];
          if (!d) { alvo.docsPessoais.push(rd); recuperados++; return; }
          if (!d.anexo) {
            d.anexo = rd.anexo;
            if (!d.status || d.status === "pend") d.status = rd.status || d.status;
            recuperados++;
          }
        });
      }
    });

    return recuperados;
  }
  window.__archeNaoDeixarSumir = naoDeixarSumir;

  /* Embrulhar o `set` do storage pega TODOS os caminhos de gravação — o do
     docente com mescla, o dos campos da pró-reitoria e o que roda depois de
     cada upload de comprovante. A releitura custa uma chamada a mais por
     gravação; o que ela evita custa o trabalho de um semestre.

     Se a releitura FALHAR, grava-se como vinha: segurar a gravação de quem
     está trabalhando seria pior que o risco que isto corrige — e é a mesma
     escolha que a mescla do docente já faz. */
  function travar() {
    var s = window.storage;
    if (!s || typeof s.set !== "function" || s.__integridade) return false;
    var _set = s.set.bind(s);
    var _get = typeof s.get === "function" ? s.get.bind(s) : null;
    s.set = function (chave, valor) {
      var args = arguments;
      if (!ehDossie(chave) || !_get || typeof valor !== "string") return _set.apply(null, args);
      return Promise.resolve(_get(chave)).then(function (r) {
        var saida = null, remoto = null;
        try { saida = JSON.parse(valor); } catch (e) { return _set.apply(null, args); }
        try { remoto = r && r.value ? JSON.parse(r.value) : null; } catch (e) { remoto = null; }
        var n = naoDeixarSumir(saida, remoto);
        if (!n) return _set.apply(null, args);
        console.warn("[Integridade] " + n + " item(ns) seriam removidos do dossiê sem exclusão — devolvidos.");
        return _set(chave, JSON.stringify(saida));
      }, function () {
        return _set.apply(null, args);      // releitura falhou: como antes
      });
    };
    s.__integridade = true;
    return true;
  }
  if (!travar()) {
    var tentativas = 0;
    var t = setInterval(function () {
      if (travar() || ++tentativas > 40) clearInterval(t);
    }, 250);
  }
})();
