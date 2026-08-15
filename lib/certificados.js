/* ========================================================================
   ARCHÉ IC — Certificados de participação e de orientação.

   Quem tem direito ao quê sai dos próprios projetos, sem cadastro à parte:
   o aluno que consta num projeto CONCLUÍDO ganha o certificado daquele
   ciclo; quem orientou ganha um certificado POR ALUNO orientado (decisão do
   dono, ago/2026).

   O vínculo é pelo CPF — é o que reúne, numa conta só, o aluno que
   participou de mais de uma edição — com o e-mail como segunda chave (o
   ciclo corrente indica aluno por e-mail, e nem todo importado tem CPF).

   codigo(...) devolve o código de validação impresso no documento: ele não
   guarda segredo nenhum, só permite conferir depois que aquele certificado
   saiu deste sistema.
   ======================================================================== */
import crypto from "node:crypto";
import { soDigitos } from "./cpf.js";

const txt = (v) => String(v ?? "").trim();
const mesmoEmail = (a, b) => !!txt(a) && txt(a).toLowerCase() === txt(b).toLowerCase();
const mesmoCpf = (a, b) => {
  const x = soDigitos(a), y = soDigitos(b);
  return !!x && x.length === 11 && x === y;
};
/* O NOME é a terceira chave, e existe por um motivo concreto: os ciclos
   anteriores foram transcritos dos resultados publicados, onde as pessoas
   aparecem só pelo nome — sem CPF nem e-mail, nada as encontraria. Vale
   SOMENTE quando o registro não tem chave forte: quem tem CPF ou e-mail é
   casado por eles, e o nome não afrouxa nada. */
const chave = (v) => txt(v).toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const mesmoNome = (a, b) => !!chave(a) && chave(a) === chave(b);
const semChaveForte = (r) => !soDigitos(r?.cpf) && !txt(r?.email);

/** Só o projeto CONCLUÍDO gera certificado — ciclo encerrado, entrega feita. */
export const certificavel = (p) => p?.status === "concluido";

/**
 * Código de validação: 10 caracteres derivados do que o documento afirma.
 * Muda se o certificado mudar (outro aluno, outro projeto, outro tipo), e
 * é estável para o mesmo documento — dá para conferir a qualquer momento.
 */
export function codigo({ tipo, projetoId, pessoa }) {
  const base = `${tipo}|${projetoId}|${txt(pessoa).toLowerCase()}`;
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 10).toUpperCase();
}

/** A pessoa é este aluno do projeto? CPF > e-mail > nome (só nos históricos). */
const ehEsteAluno = (a, { cpf, email, nome }) =>
  mesmoCpf(a?.cpf, cpf) || mesmoEmail(a?.email, email)
  || (semChaveForte(a) && mesmoNome(a?.nome, nome));
const ehEsteOrientador = (p, { cpf, email, nome }) =>
  mesmoCpf(p?.orientador?.cpf, cpf) || mesmoEmail(p?.orientador?.email, email)
  || mesmoEmail(p?.criadoPor, email)
  || (semChaveForte(p?.orientador) && !txt(p?.criadoPor) && mesmoNome(p?.orientador?.nome, nome));

/**
 * Os certificados a que uma pessoa tem direito, dos mais novos para os mais
 * antigos. Cada item traz o que vai impresso — nada além disso, para a
 * listagem não virar uma porta lateral para o projeto inteiro.
 */
export function certificadosDe(projetos, { cpf = "", email = "", nome = "" } = {}) {
  const quem = { cpf, email, nome };
  if (!soDigitos(cpf) && !txt(email) && !chave(nome)) return [];
  const saida = [];
  for (const p of projetos || []) {
    if (!certificavel(p)) continue;
    const comum = {
      projetoId: p.id, numero: p.numero || "", edital: String(p.edital || ""),
      titulo: p.titulo || "", curso: p.curso || "",
      vigencia: { inicio: p.inicio || "", fim: p.fim || "" },
      orientador: p.orientador?.nome || "",
    };
    // participação do aluno
    for (const a of p.alunos || []) {
      if (!ehEsteAluno(a, quem)) continue;
      saida.push({
        ...comum, tipo: "participacao", pessoa: a.nome || "", cpf: soDigitos(a.cpf),
        bolsista: !!a.bolsista,
        modalidade: p.modalidadeHistorica || (p.fomento?.tipo === "voluntario" ? "Voluntário" : ""),
        codigo: codigo({ tipo: "participacao", projetoId: p.id, pessoa: a.nome }),
      });
    }
    // orientação: um por aluno orientado
    if (ehEsteOrientador(p, quem)) {
      for (const a of p.alunos || []) {
        saida.push({
          ...comum, tipo: "orientacao", pessoa: p.orientador?.nome || "",
          cpf: soDigitos(p.orientador?.cpf), aluno: a.nome || "",
          bolsista: !!a.bolsista,
          modalidade: p.modalidadeHistorica || (p.fomento?.tipo === "voluntario" ? "Voluntário" : ""),
          codigo: codigo({ tipo: "orientacao", projetoId: p.id, pessoa: a.nome }),
        });
      }
    }
  }
  return saida.sort((a, b) =>
    String(b.edital).localeCompare(String(a.edital), "pt-BR")
    || String(a.numero).localeCompare(String(b.numero), "pt-BR")
    || String(a.aluno || "").localeCompare(String(b.aluno || ""), "pt-BR"));
}

/**
 * A quem avisar que os certificados de um ciclo saíram: uma linha por
 * pessoa com e-mail, dizendo quantos documentos a esperam. Sem e-mail não
 * há aviso possível — e é o que a tela mostra à gestão para ela saber o
 * tamanho do buraco.
 */
export function destinatariosDoCiclo(projetos, edital, emailPorNome = {}) {
  const porEmail = new Map();
  let semEmail = 0;
  // nos ciclos antigos ninguém tem e-mail no registro: o nome é cruzado com
  // os perfis cadastrados, que é como se descobre para quem dá para avisar
  const achar = (email, nome) => txt(email) || txt(emailPorNome[chave(nome)]);
  const somar = (emailBruto, nome, quantos) => {
    const e = achar(emailBruto, nome).toLowerCase();
    if (!e) { semEmail += quantos; return; }
    if (!porEmail.has(e)) porEmail.set(e, { email: e, nome: txt(nome), certificados: 0 });
    porEmail.get(e).certificados += quantos;
  };
  for (const p of projetos || []) {
    if (!certificavel(p) || String(p.edital || "") !== String(edital)) continue;
    const alunos = p.alunos || [];
    for (const a of alunos) somar(a.email, a.nome, 1);
    if (alunos.length) somar(p.orientador?.email || p.criadoPor, p.orientador?.nome, alunos.length);
  }
  return { destinatarios: [...porEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), semEmail };
}
