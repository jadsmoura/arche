/* ========================================================================
   AVISOS AUTOMÁTICOS — o que o ARCHÉ manda sozinho, e o interruptor de cada
   um (pedido do dono, ago/2026).

   O problema concreto: em época de indicação de bolsista chega um e-mail a
   cada movimentação da IC, e o que era informação vira ruído; FORA do ciclo,
   o mesmo e-mail é justamente o que faz a pró-reitoria saber que um aluno
   foi indicado. Não é um aviso ruim — é um aviso fora de hora.

   Por isso o interruptor tem QUATRO estados, e não dois:

     ligado                 — manda na hora (o padrão de todos)
     no resumo das 13h      — não manda na hora: entra na fila e sai UMA vez
                               por dia, num e-mail só com tudo o que aconteceu
                               desde o resumo anterior
     silenciado até <data>   — pausa que se desfaz sozinha, para o pico do
                               ciclo não virar um desligamento esquecido
     desligado              — não manda até alguém religar

   O RESUMO DIÁRIO (pedido do dono, ago/2026: "estamos recebendo muitos
   e-mails; é possível um sistema de notificação diário, às 13h, com todas as
   atualizações das últimas 24 horas?") só vale para o AVISO À GESTÃO. Segurar
   por até um dia a mensagem que vai a UMA PESSOA quebraria o processo: o
   convite do aluno, a credencial do inscrito e a devolução com o que corrigir
   existem para chegar na hora — quem as espera está parado até elas. Por isso
   `aplicarMudanca` recusa "resumo" em aviso `destino: "pessoa"`.

   Duas naturezas convivem aqui, e a tela precisa distinguir:

     • AVISO À GESTÃO — vai para a caixa do setor (extensao@, pesquisa@,
       eventos@…). Silenciar não quebra processo nenhum: o fato continua
       registrado, e o sino do portal continua mostrando.
     • MENSAGEM A UMA PESSOA — convite, confirmação de inscrição, cobrança
       de relatório, certificado pronto. Silenciar TEM consequência: alguém
       deixa de ser convidado ou de saber que precisa entregar algo. O
       catálogo marca `critico: true` nesses, e a tela avisa.

   Este arquivo é só catálogo e regra — quem lê e grava é o servidor.
   ======================================================================== */

export const AVISOS_KEY = "sys-avisos-config-v1";
/** A fila do resumo: o que aconteceu e ainda não foi resumido. */
export const AVISOS_FILA_KEY = "sys-avisos-fila-v1";
/** A hora (de Brasília) em que o resumo do dia sai. */
export const HORA_RESUMO = 13;

const txt = (v) => String(v ?? "").trim();
const hojeISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

/* Os setores, na ordem em que aparecem na tela — a mesma dos cartões do
   portal, para quem procura não precisar aprender outra ordem. */
export const SETORES_AVISO = [
  { chave: "extensao", rotulo: "Extensão", caixa: "extensao@uniego.edu.br" },
  { chave: "eventos", rotulo: "Eventos", caixa: "eventos@uniego.edu.br" },
  { chave: "ic", rotulo: "Pesquisa · Iniciação Científica", caixa: "pesquisa@uniego.edu.br" },
  { chave: "em", rotulo: "ICEM · Ensino Médio", caixa: "pesquisa@uniego.edu.br" },
  { chave: "monitoria", rotulo: "Monitoria", caixa: "pesquisa@uniego.edu.br" },
  { chave: "espacos", rotulo: "Espaços", caixa: "raiane.naves@uniego.edu.br" },
  { chave: "praticas", rotulo: "Aulas Práticas", caixa: "coordenação do curso" },
  { chave: "acessos", rotulo: "Acessos e cadastros", caixa: "PROPPEX" },
];

/**
 * O catálogo. Cada aviso diz o que dispara, para quem vai e o que se perde
 * ao silenciá-lo — é essa última coluna que torna a decisão informada.
 */
export const AVISOS = [
  /* ------------------------------ EXTENSÃO ------------------------------ */
  { codigo: "ex-nova-proposta", setor: "extensao", destino: "gestao",
    rotulo: "Proposta de ação submetida",
    texto: "A cada proposta nova, um e-mail à caixa da Extensão com o resumo da ação.",
    seDesligar: "As propostas continuam chegando ao sistema e ao sino; só o e-mail para." },
  { codigo: "ex-confirmacao-proposta", setor: "extensao", destino: "pessoa", critico: true,
    rotulo: "Confirmação a quem submeteu",
    texto: "O professor recebe a confirmação de que a proposta entrou, com o que vem depois.",
    seDesligar: "Quem submete fica sem confirmação e tende a reenviar a mesma proposta." },
  { codigo: "ex-proposta-devolvida", setor: "extensao", destino: "pessoa", critico: true,
    rotulo: "Devolução da proposta, com o motivo",
    texto: "Devolver avisa o responsável e traz o que precisa ser corrigido.",
    seDesligar: "A devolução vira espera: o professor só descobre entrando no portal por acaso." },
  { codigo: "ex-proposta-reprovada", setor: "extensao", destino: "pessoa", critico: true,
    rotulo: "Reprovação da proposta, com o motivo",
    texto: "Reprovar avisa o responsável com o motivo da decisão — que é final, diferente da devolução.",
    seDesligar: "O professor descobre a reprovação entrando no portal por acaso, sem o porquê." },
  { codigo: "ex-cobranca-relatorio", setor: "extensao", destino: "pessoa", critico: true,
    rotulo: "Cobrança do relatório final",
    texto: "Lembrete semanal a quem tem relatório de ação vencido ou por vencer.",
    seDesligar: "Os relatórios atrasam sem que ninguém seja lembrado." },
  { codigo: "ex-resumo-cobranca", setor: "extensao", destino: "gestao",
    rotulo: "Resumo da cobrança à coordenação",
    texto: "Um resumo do que foi cobrado na varredura, para a gestão acompanhar.",
    seDesligar: "A guia Relatórios continua mostrando quem deve o quê." },

  /* ------------------------------- EVENTOS ------------------------------ */
  { codigo: "ev-inscricao", setor: "eventos", destino: "pessoa", critico: true,
    rotulo: "Confirmação de inscrição, com o QR",
    texto: "Quem se inscreve recebe a credencial com o QR embutido — é o que ele apresenta na entrada.",
    seDesligar: "O participante fica sem credencial no e-mail; sobra o link da tela, que se perde." },
  { codigo: "ev-pagina-ativada", setor: "eventos", destino: "gestao",
    rotulo: "Página de evento publicada",
    texto: "Quando um evento entra no ar, o setor é avisado com o endereço.",
    seDesligar: "A publicação continua acontecendo; o setor a vê no painel." },
  { codigo: "ev-encerramento", setor: "eventos", destino: "gestao",
    rotulo: "Encerramento de evento para validar",
    texto: "A coordenação encerrou o evento e o pedido espera a PROPPEX.",
    seDesligar: "O pedido continua no sino — mas ninguém é avisado, e os certificados esperam." },
  { codigo: "ev-decisao-encerramento", setor: "eventos", destino: "pessoa", critico: true,
    rotulo: "Decisão do encerramento à coordenação",
    texto: "Validado ou devolvido, quem organizou fica sabendo (e do que corrigir).",
    seDesligar: "A coordenação não descobre que o encerramento foi devolvido." },
  { codigo: "ev-certificado", setor: "eventos", destino: "pessoa", critico: true,
    rotulo: "Certificado disponível",
    texto: "Validado o encerramento, cada pessoa com direito recebe o link do seu certificado.",
    seDesligar: "O certificado existe, mas ninguém é avisado — e poucos voltam ao portal para conferir." },

  /* --------------------------- INICIAÇÃO CIENTÍFICA --------------------- */
  { codigo: "ic-movimentacao", setor: "ic", destino: "gestao",
    rotulo: "Movimentações do setor (submissão, indicação, relatório…)",
    texto: "Um e-mail a cada movimento: projeto submetido ou reenviado, aluno indicado, relatório "
      + "entregue, pedido de substituição, contestação.",
    seDesligar: "Nada se perde no sistema — é o aviso que para. É o que mais pesa no pico do ciclo." },
  { codigo: "ic-convite-aluno", setor: "ic", destino: "pessoa", critico: true,
    rotulo: "Convite ao aluno indicado",
    texto: "O aluno indicado recebe o link de entrada e a lista do que ter à mão.",
    seDesligar: "O aluno indicado não fica sabendo — e é o convite que abre o setor para ele." },
  { codigo: "ic-cobranca-relatorio", setor: "ic", destino: "pessoa", critico: true,
    rotulo: "Cobrança dos relatórios (semanal)",
    texto: "Aluno é lembrado de enviar; a orientação, de validar — a cada 7 dias, até sair.",
    seDesligar: "Os relatórios atrasam em silêncio." },
  { codigo: "ic-convite-professores", setor: "ic", destino: "pessoa",
    rotulo: "Convite de cadastro aos professores importados",
    texto: "Disparado pela gestão, na guia Gestão — um por professor ainda sem conta.",
    seDesligar: "O botão continua na tela, mas não envia." },
  { codigo: "ic-aviso-certificados", setor: "ic", destino: "pessoa",
    rotulo: "Aviso de certificados do ciclo",
    texto: "Disparado pela gestão quando os certificados de um ciclo ficam prontos.",
    seDesligar: "Os certificados continuam disponíveis na guia; só o aviso não sai." },

  /* --------------------------------- ICEM ------------------------------- */
  { codigo: "em-convite", setor: "em", destino: "pessoa", critico: true,
    rotulo: "Convite ao bolsista do Ensino Médio",
    texto: "O estudante recebe o acesso ao setor e o que precisa entregar.",
    seDesligar: "O bolsista de EM não recebe o acesso." },
  { codigo: "em-chamada-relatorio", setor: "em", destino: "pessoa", critico: true,
    rotulo: "Chamada do relatório do ICEM",
    texto: "Lembrete aos bolsistas com relatório por entregar.",
    seDesligar: "A turma não é lembrada do prazo." },
  { codigo: "em-resultado", setor: "em", destino: "pessoa", critico: true,
    rotulo: "Resultado final do ICEM (com a bolsa e a escolha do projeto)",
    texto: "Publicado o resultado FINAL, cada bolsista recebe qual bolsa foi concedida e o "
      + "botão para escolher o projeto de pesquisa que vai acompanhar. Sai uma vez por turma.",
    seDesligar: "O estudante não fica sabendo que foi selecionado — e é este e-mail que o leva "
      + "a escolher o projeto." },

  /* ------------------------------- MONITORIA ---------------------------- */
  { codigo: "mon-movimentacao", setor: "monitoria", destino: "gestao",
    rotulo: "Movimentações da monitoria",
    texto: "Projeto submetido, ficha preenchida, relatório entregue e validado.",
    seDesligar: "O sino e o painel continuam mostrando a fila." },
  { codigo: "mon-convite-monitor", setor: "monitoria", destino: "pessoa", critico: true,
    rotulo: "Convite ao monitor indicado",
    texto: "O aluno indicado recebe o link para preencher a própria ficha de inscrição.",
    seDesligar: "A ficha não é preenchida e o projeto trava na porta." },
  { codigo: "mon-cobranca", setor: "monitoria", destino: "pessoa", critico: true,
    rotulo: "Cobrança do relatório da monitoria",
    texto: "Começa 30 dias antes do prazo e repete a cada 7 dias até o envio.",
    seDesligar: "O monitor descobre o relatório na véspera — ou depois dela." },

  /* --------------------------- AULAS PRÁTICAS --------------------------- */
  { codigo: "ap-relatorio-enviado", setor: "praticas", destino: "gestao",
    rotulo: "Relatório de aula prática enviado",
    texto: "A coordenação do curso é avisada a cada relatório que chega para validar.",
    seDesligar: "O relatório continua na fila e no sino; a coordenação só o vê ao entrar no portal." },
  { codigo: "ap-relatorio-decidido", setor: "praticas", destino: "pessoa", critico: true,
    rotulo: "Validação ou devolução ao professor",
    texto: "O professor recebe o desfecho — e, na devolução, o que precisa corrigir.",
    seDesligar: "Devolver vira espera: o professor não fica sabendo que há correção a fazer." },
  { codigo: "ap-lembrete-semanal", setor: "praticas", destino: "pessoa", critico: true,
    rotulo: "Lembrete de segunda-feira",
    texto: "Toda segunda, um e-mail por professor pedindo os relatórios das aulas da semana anterior.",
    seDesligar: "É o que faz a aula ser registrada na semana em que aconteceu. Sem ele, o registro "
      + "vira uma corrida no fim do semestre — e o relatório semestral sai menor que a realidade." },

  /* ------------------------------- ACESSOS ------------------------------ */
  { codigo: "auth-cadastro-novo", setor: "acessos", destino: "gestao",
    rotulo: "Cadastro novo no portal",
    texto: "Toda conta nova entra como submissora e a PROPPEX é avisada de quem entrou.",
    seDesligar: "As contas continuam entrando; o sino segue mostrando os cadastros novos." },

  /* -------------------------------- ESPAÇOS ----------------------------- */
  { codigo: "esp-reserva", setor: "espacos", destino: "gestao",
    rotulo: "Pedidos e decisões de reserva",
    texto: "O pedido vai à responsável pela reserva (com cópia ao setor de eventos) e a decisão "
      + "volta a quem pediu.",
    seDesligar: "Os pedidos ficam só na tela — e quem pediu não sabe se foi confirmado." },
];

export const avisoDe = (codigo) => AVISOS.find((a) => a.codigo === txt(codigo)) || null;
export const avisosDoSetor = (setor) => AVISOS.filter((a) => a.setor === txt(setor));

/* ======================================================================
   O ESTADO DE CADA UM

   A configuração guarda só o que FOGE do padrão: aviso ausente do registro
   é aviso ligado. Assim, um aviso novo no catálogo já nasce funcionando —
   e ninguém descobre meses depois que ele nunca saiu porque não estava
   numa lista.
   ====================================================================== */

export function normalizarConfig(bruto) {
  const saida = {};
  const o = bruto && typeof bruto === "object" ? bruto : {};
  for (const a of AVISOS) {
    const x = o[a.codigo];
    if (!x || typeof x !== "object") continue;
    const estado = ["ligado", "desligado", "silenciado", "resumo"].includes(x.estado) ? x.estado : "ligado";
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(txt(x.ate)) ? txt(x.ate) : "";
    // "silenciado" sem data seria um desligado disfarçado: o que o torna
    // diferente é justamente voltar sozinho
    if (estado === "ligado" || (estado === "silenciado" && !ate)) continue;
    saida[a.codigo] = { estado, ate: estado === "silenciado" ? ate : "",
      por: txt(x.por).slice(0, 160), em: txt(x.em).slice(0, 40) };
  }
  return saida;
}

/**
 * Como este aviso sai HOJE:
 *   "agora"   — e-mail na hora (o padrão)
 *   "resumo"  — entra na fila e sai no resumo das 13h
 *   "silencio" — não sai (desligado, ou silenciado com a data ainda de pé)
 * Silêncio vencido volta a valer sozinho.
 */
export function modoDoAviso(config, codigo, hoje = hojeISO()) {
  const x = (config || {})[txt(codigo)];
  if (!x) return "agora";                    // ausente = ligado (o padrão)
  if (x.estado === "desligado") return "silencio";
  if (x.estado === "silenciado") return (x.ate && hoje <= x.ate) ? "silencio" : "agora";
  if (x.estado === "resumo") return "resumo";
  return "agora";
}

/** O aviso sai de algum jeito — na hora ou no resumo? */
export const avisoLigado = (config, codigo, hoje = hojeISO()) =>
  modoDoAviso(config, codigo, hoje) !== "silencio";

/** A situação de cada aviso, pronta para a tela — com o silêncio já vencido resolvido. */
export function situacaoDosAvisos(config, hoje = hojeISO()) {
  const cfg = normalizarConfig(config);
  return AVISOS.map((a) => {
    const x = cfg[a.codigo] || null;
    const modo = modoDoAviso(cfg, a.codigo, hoje);
    return {
      ...a,
      estado: !x ? "ligado" : x.estado,
      ate: x?.ate || "",
      ligado: modo !== "silencio",
      modo,
      // só o aviso à GESTÃO pode ir para o resumo — ver o cabeçalho
      podeResumir: a.destino === "gestao",
      // silêncio que já venceu: a tela mostra como ligado, e é o que ele é
      vencido: !!(x && x.estado === "silenciado" && x.ate && hoje > x.ate),
      por: x?.por || "", em: x?.em || "",
    };
  });
}

/** Quantos estão fora do padrão — é o número que vai no rótulo da guia. */
export const quantosSilenciados = (config, hoje = hojeISO()) =>
  situacaoDosAvisos(config, hoje).filter((a) => !a.ligado).length;

/** Os avisos à gestão — os que o resumo diário pode recolher. */
export const AVISOS_DA_GESTAO = AVISOS.filter((a) => a.destino === "gestao").map((a) => a.codigo);

/** Aplica uma mudança, validando o que vem da tela. */
export function aplicarMudanca(config, { codigo, estado, ate = "", por = "" }, hoje = hojeISO()) {
  const aviso = avisoDe(codigo);
  if (!aviso) return { erro: "Aviso desconhecido." };
  if (!["ligado", "desligado", "silenciado", "resumo"].includes(estado)) return { erro: "Estado inválido." };
  if (estado === "resumo" && aviso.destino !== "gestao") {
    return { erro: "Este aviso é uma mensagem a uma pessoa — ela precisa chegar na hora, "
      + "não no resumo do dia. Só os avisos à gestão entram no resumo." };
  }
  if (estado === "silenciado") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(ate))) return { erro: "Informe até que dia silenciar." };
    if (txt(ate) < hoje) return { erro: "A data de retorno já passou — escolha um dia à frente." };
  }
  const novo = { ...normalizarConfig(config) };
  if (estado === "ligado") delete novo[codigo];
  else novo[codigo] = { estado, ate: estado === "silenciado" ? txt(ate) : "",
    por: txt(por).slice(0, 160), em: new Date().toISOString() };
  return { config: novo };
}
