/* ========================================================================
   ARCHÉ MO — O ARQUIVO da monitoria: os ciclos que correram FORA do ARCHÉ.

   O programa chegou ao sistema em 2026/2. Antes disso ele era da Diretoria
   Acadêmica e depois da PROAC, e o que sobrou de cada semestre é a planilha
   que a coordenação do curso guardou: quem foi monitor, de que disciplina,
   sob qual orientação e por quantas horas. Nada mais — **sem CPF e sem
   e-mail**. É pouco para abrir um projeto no módulo, e é o bastante para
   emitir o certificado que a pessoa tem direito de ter.

   Por isso o arquivo NÃO vira projeto de monitoria. Projeto tem fluxo,
   prazo, relatório, cobrança — coisas que não existem para um semestre já
   encerrado, e que fariam o painel da PROPPEX contar como pendência o que
   já acabou. O arquivo é o que é: uma lista de certificados devidos.

   Ele também não entra no arquivo de ESTADO. As artes do evento acabaram de
   sair de lá justamente porque o estado é um arquivo único reescrito
   inteiro a cada gravação (lib/artes.js) — e um histórico que nunca muda
   seria peso morto em toda gravação do sistema. Ele vive em `dados/`, junto
   dos demais lotes, e sobe do disco na partida.

   A ÂNCORA é a MATRÍCULA (decisão do dono, ago/2026): é o dado único que a
   planilha do curso tem, e por isso o perfil do estudante passou a pedi-la.
   O nome completo é a segunda chave — sem ela, quem ainda não informou a
   matrícula não encontraria nada. E há uma regra que o nome sozinho não
   daria: matrícula que EXISTE dos dois lados e não bate DERRUBA o casamento
   por nome. É o que separa dois homônimos, que num curso de 400 alunos não
   é hipótese de laboratório.
   ======================================================================== */
import crypto from "node:crypto";
import { soDigitos } from "./cpf.js";
import { cursoDe } from "./atas.js";

const txt = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Sem acento, sem caixa, sem espaço repetido — a forma de comparar nomes. */
export const chaveNome = (v) => txt(v).toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/** A matrícula se escreve "G2410026", "g2410026" ou "G 2410026": é a mesma. */
export const normalizarMatricula = (v) =>
  txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Nome com uma palavra só não identifica ninguém — não serve de chave. */
const nomeUtil = (v) => chaveNome(v).split(" ").filter(Boolean).length >= 2;

const mesmaMatricula = (a, b) => {
  const x = normalizarMatricula(a), y = normalizarMatricula(b);
  return !!x && x === y;
};
/** As duas existem e são diferentes: são pessoas diferentes, ponto final. */
const matriculasBrigam = (a, b) => {
  const x = normalizarMatricula(a), y = normalizarMatricula(b);
  return !!x && !!y && x !== y;
};
/**
 * O id de um registro do arquivo. Sai do CONTEÚDO (lote, matrícula,
 * disciplina, orientação) e não da posição na lista: reordenar a planilha
 * não pode trocar o endereço de um certificado que já foi baixado.
 */
const idRegistro = (lote, r) => "mh-" + crypto.createHash("sha256")
  .update([lote, normalizarMatricula(r.matricula) || chaveNome(r.aluno),
    chaveNome(r.disciplina), chaveNome(r.orientador)].join("|"))
  .digest("hex").slice(0, 10);

/** O id do PROJETO do arquivo — a dupla orientação + disciplina. */
const idProjeto = (lote, r) => "mp-" + crypto.createHash("sha256")
  .update([lote, chaveNome(r.disciplina), chaveNome(r.orientador)].join("|"))
  .digest("hex").slice(0, 10);

/**
 * Lê o lote como ele veio do arquivo em `dados/` e devolve a forma que o
 * resto do sistema usa. Registro sem aluno ou sem disciplina é descartado
 * em silêncio: a planilha do curso tem linha de cabeçalho e linha em branco,
 * e nenhuma das duas é um certificado.
 */
export function normalizarLote(bruto) {
  const lote = txt(bruto?.lote);
  if (!lote) return null;
  const curso = txt(bruto?.curso);
  const vig = bruto?.vigencia || {};
  const registros = [];
  const vistos = new Set();
  for (const r of bruto?.registros || []) {
    const aluno = txt(r?.aluno), disciplina = txt(r?.disciplina);
    if (!aluno || !disciplina) continue;
    const id = idRegistro(lote, r);
    if (vistos.has(id)) continue;          // a mesma linha duas vezes é uma linha
    vistos.add(id);
    registros.push({
      id, projetoId: idProjeto(lote, r), lote,
      aluno, matricula: normalizarMatricula(r?.matricula),
      orientador: txt(r?.orientador), disciplina,
      periodo: txt(r?.periodo), horas: num(r?.horas),
    });
  }
  return {
    lote, curso, fonte: txt(bruto?.fonte), observacao: txt(bruto?.observacao),
    ciclo: txt(bruto?.ciclo), edital: txt(bruto?.edital),
    cursoNome: cursoDe(curso)?.nome || curso,
    vigencia: { inicio: txt(vig.inicio), fim: txt(vig.fim) },
    registros,
  };
}

/** A pessoa é este monitor? matrícula > nome, com a matrícula podendo VETAR. */
export const ehEsteMonitor = (r, quem) => {
  if (mesmaMatricula(r.matricula, quem?.matricula)) return true;
  if (matriculasBrigam(r.matricula, quem?.matricula)) return false;
  return nomeUtil(r.aluno) && chaveNome(r.aluno) === chaveNome(quem?.nome);
};

/** A pessoa orientou este projeto? Só o nome — a planilha não traz mais nada. */
export const ehEsteOrientador = (nome, quem) =>
  nomeUtil(nome) && chaveNome(nome) === chaveNome(quem?.nome);

/**
 * Os certificados do arquivo a que uma pessoa tem direito, no MESMO formato
 * dos que saem dos projetos (lib/monitoria.js) — é o que permite às duas
 * origens caírem na mesma lista e no mesmo gerador de PDF.
 *
 * `origem: "historico"` é o que distingue os dois, e existe para a tela
 * poder dizer de onde veio o documento: um certificado de semestre que não
 * correu aqui merece ser explicado a quem o recebe.
 */
export function certificadosHistoricos(lotes, { cpf = "", email = "", nome = "", matricula = "" } = {}) {
  const quem = { cpf, email, nome, matricula };
  // sem nome nem matrícula não há como casar: o arquivo não tem CPF nem e-mail
  if (!normalizarMatricula(matricula) && !nomeUtil(nome)) return [];
  return montarCertificados(lotes, {
    monitor: (r) => ehEsteMonitor(r, quem),
    orientador: (nomeOrient) => ehEsteOrientador(nomeOrient, quem),
    cpf: soDigitos(cpf),
  });
}

/**
 * TODOS os certificados do arquivo — a visão da GESTÃO, não a de uma pessoa
 * (pedido do dono, ago/2026). A lista de cima responde "o que é meu?"; esta
 * responde "o que este arquivo emite?", que é a pergunta de quem certificou o
 * semestre e precisa CONFERIR o documento antes de dizer ao aluno que ele
 * existe — sobretudo enquanto as incoerências das planilhas estão em revisão.
 *
 * `cursos` recorta ao que a pessoa alcança: a coordenação de curso vê o
 * arquivo do curso dela, a PROPPEX vê todos. Passar `null` é ver tudo — quem
 * decide isso é a rota, nunca este módulo.
 */
export function certificadosDoArquivo(lotes = [], { cursos = null } = {}) {
  const alcance = cursos && cursos.map((c) => txt(c));
  const visiveis = (lotes || []).filter((lt) => !alcance || alcance.includes(txt(lt?.curso)));
  return montarCertificados(visiveis, {});
}

/**
 * O montador comum das duas listas acima. Sem predicado, entra tudo — é o que
 * torna a visão da gestão a MESMA lista da pessoa, sem uma segunda régua que
 * pudesse divergir dela (e emitir um documento que o titular não vê).
 */
function montarCertificados(lotes, { monitor = () => true, orientador = () => true, cpf = "" }) {
  const saida = [];
  for (const lt of lotes || []) {
    if (!lt?.registros?.length) continue;
    const comum = {
      programa: "monitoria", origem: "historico", lote: lt.lote,
      edital: lt.edital, ciclo: lt.ciclo, curso: lt.cursoNome,
      vigencia: { ...lt.vigencia }, numero: "",
    };
    for (const r of lt.registros) {
      if (!monitor(r)) continue;
      saida.push({
        ...comum, id: r.id, projetoId: r.projetoId, tipo: "monitoria",
        pessoa: r.aluno, cpf, matricula: r.matricula,
        disciplina: r.disciplina, orientador: r.orientador, horas: r.horas,
      });
    }
    // a orientação recebe UM por projeto (item 6.1 do edital), com os
    // monitores nomeados — é o projeto que se certifica, não cada monitor
    const projetos = new Map();
    for (const r of lt.registros) {
      if (!orientador(r.orientador)) continue;
      const p = projetos.get(r.projetoId)
        || { ...comum, id: r.projetoId, projetoId: r.projetoId, tipo: "orientacao-monitoria",
             pessoa: r.orientador, cpf, disciplina: r.disciplina,
             orientador: r.orientador, horas: r.horas, monitores: [] };
      if (!p.monitores.includes(r.aluno)) p.monitores.push(r.aluno);
      projetos.set(r.projetoId, p);
    }
    saida.push(...projetos.values());
  }
  return saida.sort((a, b) => String(b.edital).localeCompare(String(a.edital), "pt-BR")
    || String(a.disciplina).localeCompare(String(b.disciplina), "pt-BR"));
}

/**
 * Os PROJETOS do arquivo, no formato que o resto do sistema lê — é assim que
 * um semestre conduzido fora do ARCHÉ entra no **Relatório Semestral** (o
 * ARCHÉ RE) sem que o relatório precise saber o que é "arquivo": ele conta
 * projeto, monitor e hora do mesmo jeito nas duas origens.
 *
 * Era essa a razão de migrar o histórico. Certificado é o que a pessoa leva;
 * o relatório é o que a instituição apresenta — e um semestre inteiro de
 * monitoria que não aparece nele some da prestação de contas ao MEC.
 *
 * `arquivo: true` é o que permite ao documento DIZER de onde veio cada linha.
 * O que não se inventa: o arquivo não tem relatório nem homologação no
 * sistema — o que ele afirma é que o ciclo aconteceu e foi certificado.
 */
export function projetosDoArquivo(lotes = []) {
  const saida = [];
  for (const lt of lotes || []) {
    const porProjeto = new Map();
    for (const r of lt?.registros || []) {
      const p = porProjeto.get(r.projetoId) || {
        id: r.projetoId, arquivo: true, lote: lt.lote,
        status: "concluido", edital: lt.edital, ciclo: lt.ciclo,
        curso: lt.curso, cursoNome: lt.cursoNome, disciplina: r.disciplina,
        orientador: { nome: r.orientador }, monitores: [], horas: 0,
        inicio: lt.vigencia?.inicio || "", fim: lt.vigencia?.fim || "",
      };
      p.monitores.push({ nome: r.aluno, matricula: r.matricula, horas: r.horas });
      p.horas += num(r.horas);
      porProjeto.set(r.projetoId, p);
    }
    saida.push(...porProjeto.values());
  }
  return saida;
}

/** Um certificado do arquivo pelo id, já conferido contra quem pede. */
export const certificadoHistorico = (lotes, quem, id) =>
  certificadosHistoricos(lotes, quem).find((c) => c.id === txt(id)) || null;

/** O mesmo, pelos olhos da gestão: o id é conferido contra o ALCANCE dela. */
export const certificadoDoArquivo = (lotes, id, opcoes = {}) =>
  certificadosDoArquivo(lotes, opcoes).find((c) => c.id === txt(id)) || null;

/**
 * O panorama de um lote para a gestão: quantos certificados ele guarda e
 * quem ainda não foi encontrado no portal. É o que diz à coordenação de
 * quem cobrar a matrícula — sem isso o aluno nunca sabe que o certificado
 * dele existe, e ninguém sabe que ele não sabe.
 */
export function panoramaDoLote(lote, perfis = {}) {
  const contas = Object.entries(perfis).map(([email, p]) => ({
    email, nome: p?.nome || "", matricula: p?.matricula || "",
  }));
  const achar = (r) => contas.find((c) => ehEsteMonitor(r, c)) || null;
  const alunos = new Map();
  for (const r of lote?.registros || []) {
    const chave = r.matricula || chaveNome(r.aluno);
    const item = alunos.get(chave) || { nome: r.aluno, matricula: r.matricula, certificados: 0, conta: "" };
    item.certificados += 1;
    if (!item.conta) item.conta = achar(r)?.email || "";
    alunos.set(chave, item);
  }
  const lista = [...alunos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    lote: lote?.lote || "", curso: lote?.cursoNome || "", ciclo: lote?.ciclo || "",
    edital: lote?.edital || "", fonte: lote?.fonte || "",
    registros: lote?.registros?.length || 0,
    alunos: lista, comConta: lista.filter((a) => a.conta).length,
  };
}
