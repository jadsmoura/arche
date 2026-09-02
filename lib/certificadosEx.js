/* ========================================================================
   Certificados das AÇÕES DE EXTENSÃO, emitidos pelo próprio ARCHÉ.

   Até ago/2026 a certificação dos eventos de extensão corria no sistema da
   AEE: o ARCHÉ exportava a planilha e a emissão acontecia lá. Com o
   credenciamento, as presenças e a comissão organizadora já dentro do
   ARCHÉ, o caminho mais curto passou a ser emitir aqui (decisão do dono,
   ago/2026) — a planilha da AEE continua existindo para quem precisar dela.

   E o que vale para o evento vale para a AÇÃO (decisão do dono, ago/2026):
   o ARCHÉ EV é parte da atuação da Extensão, e nem todo evento é gerido
   aqui dentro. Quando ele corre por fora, a coordenação digita a lista de
   participantes no ARCHÉ EX — e o certificado sai pelo MESMO motor, com o
   mesmo desenho. Muda só o ato que o libera, porque muda quem confere:

     • ação COM evento no ARCHÉ  → o encerramento validado pela PROPPEX
       (as presenças estão no sistema; alguém precisa dizer "está tudo
       lançado" antes de o documento existir);
     • ação SEM evento no ARCHÉ  → a ação REGISTRADA, que é o ato em que a
       PROPPEX confere proposta, relatório final e listas de participantes.
       É a mesma conferência, no lugar onde ela já acontecia.

   Quem tem direito ao quê sai dos PRÓPRIOS REGISTROS do evento, sem
   cadastro à parte:

     • PARTICIPANTE   — quem se inscreveu e conta como presente. Com o
       controle de frequência ligado, presente é quem foi credenciado; com
       ele desligado, a inscrição já é a presença (a mesma régua do resto do
       módulo, `contaPresente`).
     • COMISSÃO       — quem organizou: coordenação, professores, monitores,
       alunos organizadores, colaboradores e apoio.
     • PALESTRANTE    — quem apresentou, com o título da palestra.

   A CARGA HORÁRIA do participante é a soma das atividades em que ele teve
   presença registrada; sem presença por atividade (evento de atividade
   única, ou sem controle), vale a carga horária da ação. Quem organiza tem
   a sua própria: dirigir um evento não é assisti-lo.

   O vínculo com a pessoa é o mesmo da IC — CPF, e-mail e, só onde não há
   chave forte, o nome —, e é ele que faz o histórico do usuário reunir
   certificados de eventos diferentes.

   Aqui vivem só funções PURAS: quem lê o estado e desenha o PDF é o
   servidor (rotas) e o lib/pdf.js.
   ======================================================================== */
import crypto from "node:crypto";
import { soDigitos } from "./cpf.js";
import { contaPresente, houveCredenciamento, normalizarProgramacao, temHotsiteEvento } from "./eventos.js";

const txt = (v) => String(v ?? "").trim();
/* A carga horária é TEXTO LIVRE no cadastro da atividade, e o coordenador
   escreve "4h", "4 h", "1,5h" ou "4" — o placeholder da tela ensinava "4h".
   Com `Number("4h")` dando NaN, a soma das atividades ia a zero e o
   certificado caía no fallback da CH DA AÇÃO INTEIRA: quem cumpriu 4 horas
   recebia um documento afirmando 40 (achado da varredura de ago/2026). Aqui
   se extrai o número de dentro do texto — afirmar hora que a pessoa não
   cumpriu é o erro que ninguém corrige depois. */
const num = (v) => {
  const m = String(v ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const chave = (v) => txt(v).toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const mesmoEmail = (a, b) => !!txt(a) && txt(a).toLowerCase() === txt(b).toLowerCase();
const mesmoCpf = (a, b) => {
  const x = soDigitos(a), y = soDigitos(b);
  return !!x && x.length === 11 && x === y;
};
const semChaveForte = (r) => !soDigitos(r?.cpf) && !txt(r?.email);

/**
 * Onde moram o encerramento e as assinaturas: no EVENTO, quando a ação tem
 * um — é onde sempre estiveram, e mexer nisso mudaria o que já está gravado
 * —; na própria AÇÃO, quando não tem. Uma ação gerida fora do ARCHÉ não
 * ganha um objeto `evento` vazio só para guardar duas chaves: ter `evento`
 * é o que faz a página pública, a inscrição e o credenciamento existirem.
 */
export const caixaCertificado = (acao) =>
  (acao?.evento && typeof acao.evento === "object") ? acao.evento : (acao || {});
// o registro do evento chama-se `nome`; o certificado já apurado, `pessoa` —
// a mesma função compara os dois, e foi um teste que apontou a diferença
const nomeDe = (r) => txt(r?.nome) || txt(r?.pessoa);
const ehEstaPessoa = (r, { cpf, email, nome }) =>
  mesmoCpf(r?.cpf, cpf) || mesmoEmail(r?.email, email)
  || (semChaveForte(r) && !!chave(nome) && chave(nomeDe(r)) === chave(nome));

const hojeISO = () => {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

/* ======================================================================
   1. QUEM ASSINA

   Quatro assinaturas possíveis, nesta ordem, e cada uma só aparece se
   houver imagem (decisão do dono, ago/2026): coordenador que não enviou a
   sua não entra no documento com uma linha em branco no lugar — some. As
   duas institucionais são as MESMAS do ARCHÉ IC (`sys-assinaturas-v1`):
   um só lugar para trocar quando trocar o pró-reitor ou o reitor.
   ====================================================================== */
export const ASSINANTES_EVENTO = [
  { chave: "organizador", rotulo: "Responsável pela ação", doEvento: true },
  { chave: "coordenacao", rotulo: "Coordenação do evento", doEvento: true },
  { chave: "proreitor", rotulo: "Pró-Reitor", doEvento: false },
  { chave: "reitor", rotulo: "Reitor", doEvento: false },
];
export const ASSINANTES_DO_EVENTO = ASSINANTES_EVENTO.filter((a) => a.doEvento);
const CHAVES_DO_EVENTO = new Set(ASSINANTES_DO_EVENTO.map((a) => a.chave));
export const assinanteDoEventoValido = (c) => CHAVES_DO_EVENTO.has(txt(c));

/**
 * As assinaturas que VÃO ao documento, na ordem, já sem as vazias.
 * `doEvento` são as que o coordenador enviou (ficam na ação);
 * `institucionais` vêm do catálogo do ARCHÉ.
 */
export function assinaturasDoCertificado(acao, institucionais = {}) {
  const dele = caixaCertificado(acao).assinaturas || {};
  const saida = [];
  for (const a of ASSINANTES_EVENTO) {
    if (a.doEvento) {
      const x = dele[a.chave];
      if (x?.base64 && txt(x.nome)) {
        saida.push({ chave: a.chave, nome: txt(x.nome), cargo: txt(x.cargo) || a.rotulo, base64: x.base64 });
      }
    } else if (institucionais[a.chave]) {
      saida.push({ chave: a.chave, ...institucionais[a.chave] });
    }
  }
  return saida;
}

/* ======================================================================
   2. QUANDO O CERTIFICADO EXISTE
   ====================================================================== */

/* ------------------------------ o encerramento ---------------------------
   O certificado não sai porque a data passou (decisão do dono, ago/2026):
   sai porque o evento FOI ENCERRADO e a PROPPEX validou o encerramento. É
   o mesmo cuidado do relatório da ação — quem organizou diz "terminou, está
   tudo lançado", e a pró-reitoria confere antes de o documento existir.
   Sem isso, presença lançada errada viraria certificado antes de alguém
   olhar, e certificado emitido não se recolhe.

     "" | "aberto"  → em andamento
     "solicitado"   → o coordenador encerrou; espera a PROPPEX
     "validado"     → certificados liberados
     "devolvido"    → a PROPPEX apontou o que corrigir; volta a ser editável
   -------------------------------------------------------------------------- */
export const ENCERRAMENTO = ["aberto", "solicitado", "validado", "devolvido"];
export const situacaoEncerramento = (acao) => {
  const s = txt(caixaCertificado(acao).encerramento?.status);
  return ENCERRAMENTO.includes(s) ? s : "aberto";
};
export const eventoEncerrado = (acao) => situacaoEncerramento(acao) === "validado";

/** O coordenador pode pedir o encerramento? */
export function podeEncerrar(acao, hoje = hojeISO()) {
  if (!acao?.evento) return { ok: false, motivo: "Esta ação não é um evento." };
  if (!txt(acao.numeroAcao))
    return { ok: false, motivo: "O evento ainda não foi aprovado pela PROPPEX." };
  const fim = txt(acao.proposta?.periodoFim);
  if (!fim) return { ok: false, motivo: "O evento não tem data de encerramento no projeto." };
  if (hoje < fim)
    return { ok: false, motivo: `O evento se encerra em ${fim.split("-").reverse().join("/")} — o pedido abre a partir dessa data.` };
  const s = situacaoEncerramento(acao);
  if (s === "solicitado") return { ok: false, motivo: "O encerramento já foi enviado e aguarda a PROPPEX." };
  if (s === "validado") return { ok: false, motivo: "Este evento já está encerrado." };
  return { ok: true, motivo: "" };
}

/**
 * A ação certifica? Aprovada, sempre — e depois do ato que confere o que
 * está lançado: o encerramento validado, no evento gerido aqui; a ação
 * registrada, na que correu por fora.
 */
export function acaoCertificavel(acao, hoje = hojeISO()) {
  /* A ação CURRICULARIZADA não certifica (pedido da PROAC, ago/2026): ela é
     componente curricular de uma disciplina — quem participa está cumprindo a
     carga horária do próprio curso, que já consta do histórico escolar, e um
     certificado por fora faria a mesma hora ser contada duas vezes. O registro
     do que foi feito existe, e é outro: o Relatório de Extensão Curricular, no
     ARCHÉ AP, validado pela coordenação do curso. */
  if (acao?.proposta?.curricularizacao?.vinculada === true) {
    return { ok: false, motivo: "Esta ação é curricularizada: ela é componente curricular da "
      + "disciplina e não emite certificado — a carga horária é do próprio curso, e consta do "
      + "histórico do acadêmico. O registro das atividades é o Relatório de Extensão Curricular, "
      + "no ARCHÉ AP (Aulas Práticas), validado pela coordenação do curso." };
  }
  if (!txt(acao?.numeroAcao))
    return { ok: false, motivo: "A ação ainda não foi aprovada pela PROPPEX." };
  if (!acao.evento) {
    return txt(acao.status) === "registrada" ? { ok: true, motivo: "" } : { ok: false, motivo:
      "Os certificados saem quando a PROPPEX registrar a ação — depois do relatório final e da lista de participantes." };
  }
  const s = situacaoEncerramento(acao);
  if (s === "validado") return { ok: true, motivo: "" };
  if (s === "solicitado")
    return { ok: false, motivo: "O encerramento foi enviado e aguarda a validação da PROPPEX — os certificados saem logo depois." };
  if (s === "devolvido")
    return { ok: false, motivo: "A PROPPEX devolveu o encerramento para ajustes. Corrija o que foi apontado e envie de novo." };
  const pode = podeEncerrar(acao, hoje);
  return { ok: false, motivo: pode.ok
    ? "O evento ainda não foi encerrado — a coordenação precisa clicar em “Encerrar evento”."
    : pode.motivo };
}

/**
 * Código de validação: 10 caracteres derivados do que o documento afirma.
 * Estável para o mesmo certificado, diferente para qualquer outro.
 */
export function codigoCertificadoEvento({ acaoId, tipo, pessoa }) {
  // o prefixo "ev|" ficou: mudá-lo mudaria o código de todo certificado já
  // emitido, e o código impresso é o que se confere depois
  const base = `ev|${txt(acaoId)}|${txt(tipo)}|${chave(pessoa)}`;
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 10).toUpperCase();
}

/* ======================================================================
   3. A CARGA HORÁRIA

   Do participante: a soma das atividades em que ele esteve. É o número que
   o certificado afirma, e afirmar hora que a pessoa não cumpriu é o erro
   que ninguém corrige depois. Sem presença por atividade — evento de
   atividade única, ou sem controle de frequência —, vale a carga horária
   da ação, que é o que o projeto aprovado declara.
   ====================================================================== */
export function chDoParticipante(acao, inscrito) {
  const prog = normalizarProgramacao(acao?.evento?.programacao);
  const presencas = Array.isArray(inscrito?.presencas) ? inscrito.presencas : [];
  const ids = new Set(presencas.map((p) => txt(p?.atividade)).filter(Boolean));
  if (ids.size) {
    const soma = prog.filter((a) => ids.has(a.id)).reduce((s, a) => s + num(a.ch), 0);
    if (soma > 0) return soma;
  }
  return num(acao?.proposta?.cargaHoraria);
}

const chDaEquipe = (acao, pessoa) => num(pessoa?.ch) || num(acao?.proposta?.cargaHoraria);

/* ======================================================================
   4. OS CERTIFICADOS DE UM EVENTO
   ====================================================================== */

const daAcao = (acao) => ({
  acaoId: acao.id,
  slug: acao.evento?.slug || "",
  numeroAcao: acao.numeroAcao || "",
  evento: acao.proposta?.nomeAtividade || "",
  curso: acao.curso || "",
  local: acao.proposta?.local || "",
  municipio: acao.proposta?.municipio || "",
  inicio: acao.proposta?.periodoInicio || "",
  fim: acao.proposta?.periodoFim || "",
  hotsite: temHotsiteEvento(acao.evento),
  // o documento fala de "evento" ou de "ação de extensão" conforme o que a
  // ação é: certificar participação num "evento" que nunca foi evento é o
  // tipo de imprecisão que o avaliador lê primeiro
  ehEvento: !!acao.evento,
});

/** Um certificado por pessoa com direito, na ordem em que se lê a lista. */
export function certificadosDaAcao(acao, { hoje = hojeISO() } = {}) {
  const pode = acaoCertificavel(acao, hoje);
  if (!pode.ok) return [];
  const base = daAcao(acao);
  const parts = acao.participantes || {};
  const out = [];

  /* Quando NENHUMA presença foi lançada no evento inteiro, a lista de
     inscritos vale como lista de presença (achado do dono, ago/2026): o
     credenciamento simplesmente não aconteceu, e recusar o certificado de
     todo mundo por causa disso seria ler ausência de registro como registro
     de ausência. Uma única leitura de crachá basta para a lista passar a
     valer — daí em diante só certifica quem foi credenciado. */
  const credenciou = houveCredenciamento(acao.evento, parts.inscritos);
  for (const i of parts.inscritos || []) {
    // sem evento no ARCHÉ, a lista digitada na Extensão É a lista de
    // presença: quem a coordenação lançou esteve lá, e não há credenciamento
    // que pudesse dizer o contrário
    if (!txt(i?.nome)) continue;
    if (acao.evento && credenciou && !contaPresente(acao.evento, i)) continue;
    out.push({
      ...base, tipo: "participante", papel: "", pessoa: txt(i.nome),
      cpf: soDigitos(i.cpf), email: txt(i.email).toLowerCase(),
      ch: chDoParticipante(acao, i), palestra: "",
      codigo: codigoCertificadoEvento({ acaoId: acao.id, tipo: "participante", pessoa: i.nome }),
    });
  }
  for (const p of parts.palestrantes || []) {
    if (!txt(p?.nome)) continue;
    out.push({
      ...base, tipo: "palestrante", papel: "Palestrante", pessoa: txt(p.nome),
      cpf: soDigitos(p.cpf), email: txt(p.email).toLowerCase(),
      ch: chDaEquipe(acao, p), palestra: txt(p.palestra),
      codigo: codigoCertificadoEvento({ acaoId: acao.id, tipo: "palestrante", pessoa: p.nome }),
    });
  }
  for (const c of parts.comissao || []) {
    if (!txt(c?.nome)) continue;
    out.push({
      ...base, tipo: "comissao", papel: txt(c.funcao) || rotuloPapel(c.papel), pessoa: txt(c.nome),
      cpf: soDigitos(c.cpf), email: txt(c.email).toLowerCase(),
      ch: chDaEquipe(acao, c), palestra: "",
      codigo: codigoCertificadoEvento({ acaoId: acao.id, tipo: "comissao", pessoa: c.nome }),
    });
  }
  return out;
}

const ROTULOS = {
  coordenacao: "Coordenação do evento", professor: "Professor(a)", monitor: "Monitor(a)",
  aluno: "Aluno(a) organizador(a)", colaborador: "Colaborador(a)", apoio: "Apoio técnico",
};
export const rotuloPapel = (c) => ROTULOS[txt(c)] || "Organização";

/**
 * O certificado de UMA pessoa neste evento — é o que a rota emite. Devolve
 * null quando ela não tem direito, e nunca "quase": ou o documento existe
 * inteiro, ou não sai.
 */
export function certificadoDe(acao, { cpf, email, nome, tipo = "" } = {}, { hoje = hojeISO() } = {}) {
  const todos = certificadosDaAcao(acao, { hoje });
  const meus = todos.filter((c) => ehEstaPessoa(c, { cpf, email, nome })
    && (!tipo || c.tipo === tipo));
  return meus[0] || null;
}

/* ======================================================================
   5. O HISTÓRICO DA PESSOA

   O que faz o histórico ser do USUÁRIO e não de um evento: a mesma pessoa
   aparece como participante de um, comissão de outro e palestrante de um
   terceiro, e é isso que ela quer ver junto.
   ====================================================================== */
export function certificadosDePessoa(acoes = [], pessoa = {}, { hoje = hojeISO() } = {}) {
  const out = [];
  for (const a of acoes) {
    if (!a) continue;
    for (const c of certificadosDaAcao(a, { hoje })) {
      if (ehEstaPessoa(c, pessoa)) out.push(c);
    }
  }
  return out.sort((x, y) => txt(y.fim).localeCompare(txt(x.fim)));
}

/* ======================================================================
   6. O VERSO — a programação

   O verso existe porque é ele que dá lastro ao número da frente: quem lê o
   certificado quer saber de que atividades aquelas horas vieram.
   ====================================================================== */
export function programacaoDoCertificado(acao) {
  return normalizarProgramacao(acao?.evento?.programacao).map((a) => ({
    dia: txt(a.dia), horaInicio: txt(a.horaInicio), horaFim: txt(a.horaFim),
    titulo: txt(a.titulo), tipo: txt(a.tipo), local: txt(a.local),
    responsavel: txt(a.responsavel), ch: num(a.ch),
    modalidade: txt(a.modalidade),
  })).sort((x, y) => (x.dia || "").localeCompare(y.dia || "")
    || (x.horaInicio || "").localeCompare(y.horaInicio || ""));
}
