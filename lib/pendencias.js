/**
 * O QUE VOCÊ PRECISA FAZER — a fila de cada pessoa, na página inicial.
 *
 * Achado do dono (ago/2026): "alguns alunos de ensino médio estão entrando
 * pelo sistema e caindo em uma página vazia; coloca na página principal do
 * usuário os itens que ele precisa fazer, algum atalho? por exemplo,
 * relatórios, indicação".
 *
 * A página inicial já mostrava "O que espera você" — mas só à GESTÃO, montado
 * do sino (`/api/alertas`), recortado por `modulosDe`. Quem não gere setor
 * nenhum — o professor que orienta uma IC, a bolsista do ensino médio, o
 * monitor — abria o portal e via a mesma parede de cartões, sem nada dizendo
 * que havia um relatório vencendo ou um bolsista por indicar. A informação
 * existia; morava dentro de cada setor, atrás de dois cliques, e por isso só
 * chegava a quem já sabia procurá-la.
 *
 * Três regras que este módulo carrega:
 *
 * · É PENDÊNCIA, não notícia. Só entra o que espera um ATO DA PESSOA — o
 *   relatório que ela envia, a indicação que ela faz, o cadastro que só ela
 *   pode preencher. O que espera outro (o relatório entregue aguardando a
 *   PROPPEX, o projeto em análise) fica fora: seria uma fila que não anda.
 *
 * · Cada item leva ATÉ o lugar de resolver, e diz em UMA frase o que é. Uma
 *   lista de avisos sem link é a mesma parede, com mais texto.
 *
 * · Nada aqui concede nada. É apresentação: quem barra segue sendo o
 *   servidor de cada setor — mostrar a linha não abre porta nenhuma, e por
 *   isso as funções abaixo recebem o que a pessoa JÁ pode ver.
 *
 * Módulo puro: quem lê as bases é o servidor.
 */

const t = (s) => String(s ?? "").trim();
const mesmo = (a, b) => !!a && !!b && t(a).toLowerCase() === t(b).toLowerCase();
const digitos = (s) => t(s).replace(/\D/g, "");
const mesmoCpf = (a, b) => !!digitos(a) && digitos(a) === digitos(b);
/** A pessoa é ela mesma por e-mail OU CPF — as duas chaves do portal. */
const souEu = (quem, alvo) =>
  mesmo(quem?.email, alvo?.email) || mesmoCpf(quem?.cpf, alvo?.cpf);

const corte = (s, n = 70) => (t(s).length > n ? t(s).slice(0, n - 1) + "…" : t(s));

/* ---------------------------------------------------------------- perfil */

/**
 * Perfil incompleto é a PRIMEIRA pendência de todas: ela barra a entrada em
 * qualquer setor protegido (`faltaNoPerfil`), e quem esbarra nela no dia da
 * submissão não entende por que o portal o mandou para outra tela.
 */
export function pendenciasDoPerfil(falta = []) {
  if (!falta.length) return [];
  const nomes = falta.map((f) => f.rotulo || f.campo || "").filter(Boolean);
  return [{
    setor: "Seu cadastro", urgente: true, link: "/perfil/?completar=1",
    texto: "Complete o seu cadastro para entrar nos setores",
    detalhe: nomes.length ? `Falta: ${nomes.join(", ")}.` : "",
  }];
}

/* ------------------------------------------------------- iniciação científica */

/**
 * O que a IC espera DESTA pessoa — nos dois papéis que ela pode ter no mesmo
 * ciclo (orienta um projeto e é aluna de outro é caso raro, mas existe).
 *
 * `prazos` e `pendentes` chegam calculados pelo servidor (são de lib/ic.js):
 * este módulo não repete a régua dos prazos, que é de lá.
 */
export function pendenciasIC(projetos = [], quem = {},
  { prazosDe, pendentesDe, faltaNoCadastroDe, hoje = "" } = {}) {
  const itens = [];
  // o cadastro do contrato é DA PESSOA, não do projeto: quem está em dois
  // projetos veria a mesma linha duas vezes, com listas de campos diferentes
  const faltaNoContrato = new Set();
  for (const p of projetos) {
    const orienta = souEu(quem, p.orientador) || mesmo(quem?.email, p.criadoPor);
    const meuAluno = (p.alunos || []).find((a) => souEu(quem, a));
    if (!orienta && !meuAluno) continue;
    const nome = `${p.numero || ""} ${corte(p.titulo)}`.trim();

    if (orienta) {
      // INDICAÇÃO: projeto aprovado sem ninguém indicado — é a pendência que
      // mais trava o ciclo, porque sem aluno não há relatório nem certificado
      if (p.status === "aprovado" && !(p.alunos || []).length) {
        itens.push({ setor: "Pesquisa · IC", link: "/pesquisa/ic/", urgente: true,
          texto: "Indique o bolsista ou voluntário do seu projeto aprovado", detalhe: nome });
      }
      // VALIDAÇÃO: o relatório que o aluno entregou espera a leitura da
      // orientação — enquanto ela não vem, o aluno fica sem saber se passou
      // o relatório com PEDIDO DE ENCERRAMENTO espera a PROPPEX, não a
      // orientação — a validação comum some da tela dela; cobrá-la aqui
      // seria uma pendência sem botão (revisão de set/2026)
      const aValidar = (p.relatorios || []).filter((r) => r.situacao === "enviado"
        && !r.encerramento?.pedido).length;
      if (aValidar) {
        itens.push({ setor: "Pesquisa · IC", link: "/pesquisa/ic/", n: aValidar,
          texto: `${aValidar} relatório(s) do seu aluno aguardando a sua validação`, detalhe: nome });
      }
    }

    if (meuAluno) {
      const janelas = (prazosDe ? prazosDe(p) : null)?.prazos || [];
      for (const f of (pendentesDe ? pendentesDe(p) : [])) {
        if (!mesmo(f.aluno, meuAluno.email) && !mesmo(f.nome, meuAluno.nome)) continue;
        const janela = janelas.find((x) => x.tipo === f.tipo);
        // só o que JÁ ABRIU: cobrar em setembro o relatório final cuja janela
        // abre em julho seria angústia sem nada a fazer — e o servidor recusa
        if (janela?.abre && hoje && hoje < janela.abre) continue;
        itens.push({
          setor: "Pesquisa · IC", link: "/pesquisa/ic/", urgente: !!janela?.atrasado,
          texto: f.devolvido
            ? `Corrija e reenvie o relatório ${f.tipo} da sua Iniciação Científica`
            : `Envie o relatório ${f.tipo} da sua Iniciação Científica`,
          detalhe: [nome, janela?.vence ? `prazo: ${dataBR(janela.vence)}` : ""].filter(Boolean).join(" · "),
        });
      }
      // o cadastro do contrato é do ALUNO: sem ele a bolsa não se paga — e só
      // em projeto EM EXECUÇÃO (a mesma régua da folha de pagamento): o
      // bolsista de 2024, transcrito dos termos sem RG e endereço, via a linha
      // urgente na página inicial para um contrato encerrado há anos
      if (meuAluno.bolsista && p.status === "aprovado" && faltaNoCadastroDe) {
        for (const f of faltaNoCadastroDe(meuAluno)) faltaNoContrato.add(f);
      }
    }
  }
  if (faltaNoContrato.size) {
    itens.push({ setor: "Pesquisa · IC", link: "/pesquisa/ic/", urgente: true,
      texto: "Complete o seu cadastro de bolsista (dados bancários e documentos)",
      detalhe: `Falta: ${[...faltaNoContrato].join(", ")}.` });
  }
  return itens;
}

/* --------------------------------------------------------------- ICEM */

/**
 * A fila do bolsista do ensino médio — que é justamente quem chegava à página
 * vazia. São três atos, e nenhum deles é óbvio para quem tem 16 anos e entrou
 * no portal pela primeira vez: escolher o projeto que vai acompanhar,
 * entregar o relatório e completar o cadastro do contrato.
 */
export function pendenciasICEM(registros = [], { exigidosDe, turmaDe } = {}) {
  const itens = [];
  for (const b of registros) {
    // desligado saiu do programa e não deve nada; CONCLUÍDO ainda pode dever —
    // a turma 2025/2026 encerrou com os relatórios reabertos até 30/09/2026, e
    // exigir "ativo" faria a fila calar justamente para quem está em atraso
    if (b.situacao === "desligado") continue;
    const turma = turmaDe ? turmaDe(b.turma) : null;
    // escolher projeto só faz sentido na turma em curso e com registro ativo
    const vigente = !turma?.encerrada && b.situacao === "ativo";
    const rot = `Turma ${b.turma || ""}`.trim();

    if (vigente && !(b.trajetoria || []).some((x) => !x.ate)) {
      itens.push({ setor: "Pesquisa · ICEM", link: "/pesquisa/ic/", urgente: true,
        texto: "Escolha o projeto de pesquisa que você vai acompanhar", detalhe: rot });
    }
    for (const tipo of (exigidosDe ? exigidosDe(turma || { ciclo: b.turma }) : ["final"])) {
      const r = b.relatorios?.[tipo] || {};
      if (["entregue", "validado"].includes(r.situacao)) continue;
      itens.push({
        setor: "Pesquisa · ICEM", link: "/pesquisa/ic/", urgente: r.situacao === "devolvido",
        texto: r.situacao === "devolvido"
          ? `Corrija e reenvie o seu relatório ${tipo} do ICEM`
          : `Envie o seu relatório ${tipo} do ICEM`,
        detalhe: [rot, turma?.prazoRelatorioFinal && tipo === "final"
          ? `prazo: ${dataBR(turma.prazoRelatorioFinal)}` : ""].filter(Boolean).join(" · "),
      });
    }
    // dados bancários: só quem TEM bolsa — o voluntário não recebe nada, e
    // pedir-lhe conta corrente seria cobrar o que não existe
    // e só na turma EM CURSO: a bolsa da turma encerrada já foi paga por fora
    if (b.bolsa && b.bolsa !== "voluntario" && !turma?.encerrada && (b.faltaNoCadastro || []).length) {
      itens.push({ setor: "Pesquisa · ICEM", link: "/pesquisa/ic/", urgente: true,
        texto: "Informe os seus dados bancários para o pagamento da bolsa",
        detalhe: `Falta: ${b.faltaNoCadastro.join(", ")}.` });
    }
  }
  return itens;
}

/* ----------------------------------------------------------- monitoria */

/** O que a monitoria espera desta pessoa — do monitor e da orientação. */
export function pendenciasMonitoria(projetos = [], quem = {}, { cadastrado } = {}) {
  const itens = [];
  for (const p of projetos) {
    const orienta = souEu(quem, p.orientador);
    const meu = (p.monitores || []).find((m) => souEu(quem, m));
    const nome = `${p.protocolo || ""} ${corte(p.disciplina)}`.trim();

    if (meu && p.status === "aguardando-aluno" && cadastrado && !cadastrado(meu)) {
      itens.push({ setor: "Monitoria", link: "/monitoria/", urgente: true,
        texto: "Preencha a sua ficha de inscrição de monitor", detalhe: nome });
    }
    if (meu && p.status === "aprovado"
      && ["", "rascunho", "devolvido"].includes(meu.relatorio?.status || "")) {
      itens.push({ setor: "Monitoria", link: "/monitoria/", urgente: meu.relatorio?.status === "devolvido",
        texto: meu.relatorio?.status === "devolvido"
          ? "Corrija e reenvie o seu relatório de monitoria"
          : "Envie o seu relatório de monitoria", detalhe: nome });
    }
    if (orienta) {
      const aValidar = (p.monitores || []).filter((m) => m.relatorio?.status === "enviado").length;
      if (aValidar) {
        itens.push({ setor: "Monitoria", link: "/monitoria/", n: aValidar,
          texto: `${aValidar} relatório(s) de monitoria aguardando a sua avaliação`, detalhe: nome });
      }
      if (p.status === "devolvido") {
        itens.push({ setor: "Monitoria", link: "/monitoria/", urgente: true,
          texto: "O seu projeto de monitoria foi devolvido para ajuste", detalhe: nome });
      }
    }
  }
  return itens;
}

/* ------------------------------------------------------------ extensão */

/**
 * A ação de extensão que já se encerrou e não tem relatório — é a cobrança
 * que hoje sai por e-mail (lib/cobranca.js) e não tinha lugar na tela.
 */
export function pendenciasExtensao(acoes = [], { devePendencia } = {}) {
  const itens = [];
  for (const a of acoes) {
    const nome = `${a.numeroAcao || ""} ${corte(a.proposta?.titulo || a.titulo)}`.trim();
    if (a.status === "devolvida") {
      itens.push({ setor: "Extensão", link: "/extensao/", urgente: true,
        texto: "A sua proposta de extensão foi devolvida para alterações", detalhe: nome });
      continue;
    }
    // quem diz se o relatório está pendente é o vocabulário único
    // (lib/situacao.js) — refazer a régua aqui faria duas telas discordarem
    if (!devePendencia || !devePendencia(a) || a.relatorio?.entregueEm) continue;
    const fim = t(a.proposta?.periodoFim);
    itens.push({ setor: "Extensão", link: "/extensao/", urgente: true,
      texto: "Entregue o relatório final da sua ação de extensão",
      detalhe: [nome, fim ? `encerrada em ${dataBR(fim)}` : ""].filter(Boolean).join(" · ") });
  }
  return itens;
}

/* --------------------------------------------- atividades curriculares */

/** Relatório de aula prática ou de extensão curricular devolvido ao professor. */
export function pendenciasAC(relatorios = [], quem = {}) {
  return relatorios
    .filter((r) => r.status === "devolvido" && mesmo(r.professor?.email || r.criadoPor, quem?.email))
    .map((r) => ({
      setor: "Atividades Curriculares", link: "/praticas/", urgente: true,
      texto: "O seu relatório foi devolvido pela coordenação do curso",
      detalhe: `${r.protocolo || ""} ${corte(r.disciplina)}`.trim(),
    }));
}

/* ---------------------------------------------------------------- fila */

const dataBR = (iso) => (t(iso).length >= 10 ? t(iso).slice(0, 10).split("-").reverse().join("/") : "");

/**
 * A fila como ela aparece: o urgente primeiro, e um teto — a página inicial é
 * a porta do portal, não a agenda inteira de quem tem quinze pendências.
 */
export function ordenar(itens = [], teto = 12) {
  const vistos = new Set();
  return itens
    .filter((i) => {
      const k = `${i.setor}|${i.texto}|${i.detalhe || ""}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0))
    .slice(0, teto);
}
