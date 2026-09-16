/**
 * ISENÇÃO DA TAXA DE INSCRIÇÃO PELO CADÚNICO — a régua PURA.
 *
 * Pedido do dono (set/2026): "a ideia é o candidato anexar o PDF do cadunico e
 * se ele estiver dentro dos critérios conseguir a isenção".
 *
 * O QUE DÁ E O QUE NÃO DÁ PARA AUTOMATIZAR (levantado antes de escrever):
 * a API que responderia "este CPF está no CadÚnico e é de baixa renda?" é a
 * `CADÚNICO – Consulta Situação Cadastral` do Conecta gov.br, restrita a
 * "órgãos e entidades da administração direta, autárquica e fundacional" — o
 * UNIEGO é centro universitário PRIVADO e não se enquadra. A API pública do
 * Portal da Transparência responde outra pergunta ("recebeu parcela do Bolsa
 * Família"), e o programa ATUAL só se consulta por NIS. Então a instituição
 * NÃO consulta base federal nenhuma: **a pessoa apresenta a prova, o sistema
 * lê, registra e encaminha** — que é também o desenho defensável pela LGPD,
 * porque situação socioeconômica é dado sensível.
 *
 * O QUE O COMPROVANTE ENTREGA (medido num comprovante real, emitido pelo app
 * do CadÚnico): ele é um PDF com camada de texto e mapa ToUnicode, e traz
 * **Faixa de renda familiar por pessoa (per capita)** — que é exatamente o
 * critério —, mais "Cadastro atualizado", a última atualização, o limite para
 * atualizar de novo, o código familiar, o município e a **chave de segurança**
 * que valida o documento no site do Ministério.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: decidir sozinho. PDF se edita, e não há API
 * pública para conferir a chave por máquina — a conferência é um clique de
 * quem analisa, na página do Ministério. O sistema LÊ e PRÉ-DECIDE; quem
 * defere é gente, com o documento na tela. Isso não é fraqueza do desenho: é
 * o que torna a decisão defensável, e é o que toda IES faz.
 */

/* ------------------------------ as faixas -------------------------------
   O comprovante classifica a renda POR PESSOA em três faixas. O valor da
   linha de pobreza muda por decreto, então o reconhecimento é pela FORMA da
   frase, não pelo número: um catálogo com "218" cravado pararia de funcionar
   no dia em que o governo reajustar, e o pedido seria recusado em silêncio. */
export const FAIXAS = [
  { codigo: "ate-218", ordem: 1, rotulo: "Até a linha de pobreza (o valor impresso no comprovante)" },
  { codigo: "218-meio", ordem: 2, rotulo: "Entre a linha de pobreza e meio salário mínimo" },
  { codigo: "acima-meio", ordem: 3, rotulo: "Acima de meio salário mínimo" },
];
export const rotuloFaixa = (c) => FAIXAS.find((f) => f.codigo === c)?.rotulo || "";

/* A ORDEM IMPORTA: "acima de meio salário" contém "meio salário", e
   "de R$ 218,01 a meio salário" contém "R$". Testar do mais específico para
   o mais geral é o que impede a 3ª faixa de ser lida como a 2ª. */
const RECONHECE = [
  { codigo: "acima-meio", re: /acima\s+d[eo]\s*(meio|1\s*\/\s*2|½)\s*sal[áa]ri/i },
  // o `\b` NÃO serve de fronteira depois de "é": em JavaScript `\w` é ASCII, e
  // entre "é" e o espaço não há transição de palavra nenhuma — `\bat[ée]\b`
  // recusava "Até meio salário mínimo". Quem delimita à direita é o `\s+`.
  { codigo: "218-meio", re: /(?:\bat[ée]|\ba|\be|\bentre)\s+(meio|1\s*\/\s*2|½)\s*sal[áa]ri/i },
  { codigo: "ate-218", re: /(at[ée]\s*R\$|linha\s+de\s+pobreza|extrema\s+pobreza|\bpobreza\b)/i },
];

/** A faixa per capita que um texto declara — `""` quando não reconhece. */
export function faixaDoTexto(txt) {
  const s = String(txt || "");
  for (const f of RECONHECE) if (f.re.test(s)) return f.codigo;
  return "";
}

/* ------------------------------ o critério -------------------------------
   Decisão do dono (set/2026), entre as duas leituras possíveis: vale **até
   meio salário mínimo por pessoa** — as duas primeiras faixas, que é a
   definição de "baixa renda" do próprio CadÚnico. O recorte mais estreito
   (só a linha de pobreza, que é o critério de concessão do Bolsa Família)
   fica no catálogo porque é o que um edital seguinte pode querer. */
export const CRITERIOS = [
  { codigo: "meio-salario", aceita: ["ate-218", "218-meio"],
    rotulo: "Renda por pessoa até meio salário mínimo (baixa renda no CadÚnico)" },
  { codigo: "ate-218", aceita: ["ate-218"],
    rotulo: "Renda por pessoa até a linha de pobreza (critério de concessão do Bolsa Família)" },
];
export const criterioDe = (c) => CRITERIOS.find((x) => x.codigo === c) || CRITERIOS[0];

/* ------------------------- configuração do evento ------------------------ */
const txt = (v, n) => String(v ?? "").trim().slice(0, n);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim()) ? String(v).trim() : "");

export const LIMITES = { cotaMax: 5000, validadeMaxDias: 365, orientacoesMax: 2000 };

/**
 * A configuração NASCE DESLIGADA (`ativa: false`), como a cobrança e a
 * submissão de trabalhos: o recurso existe no código e nenhum evento mostra
 * nada até a coordenação ligar — o edital vem antes do botão.
 */
export function normalizarIsencao(b) {
  const c = b && typeof b === "object" ? b : {};
  return {
    ativa: c.ativa === true,
    criterio: criterioDe(c.criterio).codigo,
    prazoAte: data(c.prazoAte),
    cota: Math.min(LIMITES.cotaMax, Math.max(0, Math.round(num(c.cota)))),
    validadeDias: Math.min(LIMITES.validadeMaxDias, Math.max(0, Math.round(num(c.validadeDias)))),
    orientacoes: txt(c.orientacoes, LIMITES.orientacoesMax),
  };
}

/** Há isenção aberta neste evento, nesta data? */
export function isencaoAberta(cfg, hoje) {
  const c = normalizarIsencao(cfg);
  if (!c.ativa) return { ok: false, motivo: "Este evento não oferece isenção da taxa de inscrição." };
  if (c.prazoAte && String(hoje) > c.prazoAte)
    return { ok: false, motivo: `O prazo para pedir isenção terminou em ${brData(c.prazoAte)}.` };
  return { ok: true };
}

const brData = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
};

/* ------------------------------- estados --------------------------------
   Três, e cada um diz DE QUEM é o próximo passo. Não há "cancelado": o
   pedido é a prova de que a pessoa pediu, e some só se a gestão o indeferir. */
export const ESTADOS = {
  analise: "aguardando análise da coordenação",
  deferido: "isenção concedida",
  indeferido: "pedido indeferido",
};

/* --------------------------- leitura do PDF ------------------------------
   O comprovante é um FORMULÁRIO: todos os rótulos primeiro, todos os valores
   depois — casar por proximidade no texto corrido pega a data errada (medido).
   Quem casa é a COORDENADA: o valor fica logo abaixo do rótulo, na mesma
   coluna. Medido num comprovante real: 8 de 8 campos, todos batendo. */
const ROTULOS = {
  cadastradoEm: "Data de cadastro",
  municipio: "Município de cadastramento",
  atualizado: "Cadastro atualizado",
  ultimaAtualizacao: "Última atualização",
  faixaTotal: "Faixa de renda familiar total",
  faixaPerCapita: "Faixa de renda familiar por pessoa",
  codigoFamiliar: "Código familiar",
  limiteAtualizacao: "Limite para atualização",
  chave: "Chave de segurança",
  emitidoEm: "Consulta realizada em",
};

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const chaveDeTexto = (s) => semAcento(s).toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Lê o PDF do Comprovante de Cadastro Único. Recebe os BYTES; devolve os
 * campos e o texto simples. Nunca lança: PDF ilegível devolve `{ ok: false }`
 * com o motivo, porque quem decide o que fazer com isso é o chamador — e a
 * resposta certa nunca é derrubar o envio de quem está pedindo isenção.
 */
export async function lerComprovante(bytes) {
  let itens = [], texto = "";
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      const c = await (await doc.getPage(p)).getTextContent();
      for (const it of c.items) {
        const t = String(it.str || "").trim();
        if (t) itens.push({ t, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), p });
        texto += it.str + (it.hasEOL ? "\n" : "");
      }
      texto += "\n";
    }
    await doc.destroy?.();
  } catch (e) {
    return { ok: false, motivo: "não foi possível ler este PDF", detalhe: String(e?.message || e).slice(0, 200) };
  }
  if (itens.length < 10)
    return { ok: false, motivo: "este arquivo não tem texto — parece uma foto ou um documento digitalizado", texto: "" };

  const compacto = texto.replace(/\s+/g, " ");
  if (!/comprovante\s+de\s+cadastro/i.test(compacto) || !/cadastro\s+[úu]nico/i.test(compacto))
    return { ok: false, motivo: "este arquivo não é um Comprovante de Cadastro Único", texto };

  const abaixo = (rotulo, maxDy = 44) => {
    const alvo = chaveDeTexto(rotulo);
    const r = itens.find((i) => chaveDeTexto(i.t).startsWith(alvo));
    if (!r) return "";
    const c = itens.filter((i) => i !== r && i.p === r.p && i.y < r.y && r.y - i.y <= maxDy && Math.abs(i.x - r.x) <= 34);
    c.sort((a, b) => b.y - a.y || Math.abs(a.x - r.x) - Math.abs(b.x - r.x));
    return c[0]?.t || "";
  };

  /* "Consulta realizada em" é rótulo de LINHA, não de coluna: o valor fica à
     direita, na mesma altura ("Consulta realizada em 31/07/2024 às 23:12:15").
     Procurar abaixo dele acha o nada que existe abaixo do rodapé. */
  const aoLado = (rotulo, re) => {
    const alvo = chaveDeTexto(rotulo);
    const r = itens.find((i) => chaveDeTexto(i.t).startsWith(alvo));
    if (!r) return "";
    const c = itens.filter((i) => i !== r && i.p === r.p && Math.abs(i.y - r.y) <= 4 && i.x > r.x && re.test(i.t));
    c.sort((a, b) => a.x - b.x);
    return c[0]?.t || "";
  };

  const campo = {};
  for (const [k, rotulo] of Object.entries(ROTULOS)) campo[k] = abaixo(rotulo);
  const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!DATA.test(campo.emitidoEm)) campo.emitidoEm = aoLado(ROTULOS.emitidoEm, DATA)
    || /Consulta realizada em[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})/i.exec(compacto)?.[1] || "";

  /* Os INTEGRANTES servem a UMA pergunta — "o requerente está nesta família?"
     — e não se guardam: são nome, nascimento e NIS de TERCEIROS, alguns
     menores de idade. Quem precisa vê-los abre o PDF, que fica no
     Repositório. O que o registro guarda é a resposta e a contagem. */
  const bloco = texto.split(/Integrantes da fam[íi]lia/i)[1] || "";
  const integrantes = [...bloco.matchAll(/([A-ZÁ-Ú][A-ZÁ-Ú\s]{5,70}?)\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{11})/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim());

  return {
    ok: true,
    faixaPerCapita: faixaDoTexto(campo.faixaPerCapita),
    faixaTexto: campo.faixaPerCapita,
    atualizado: /^s(im)?$/i.test(campo.atualizado) ? "SIM" : /^n/i.test(campo.atualizado) ? "NÃO" : "",
    codigoFamiliar: /^\d{6,14}$/.test(campo.codigoFamiliar) ? campo.codigoFamiliar : "",
    municipio: /\/[A-Z]{2}$/.test(campo.municipio) ? campo.municipio : "",
    ultimaAtualizacao: dataBR(campo.ultimaAtualizacao),
    limiteAtualizacao: dataBR(campo.limiteAtualizacao),
    emitidoEm: dataBR(campo.emitidoEm),
    chave: /^[A-Za-z0-9]{3,6}(\.[A-Za-z0-9]{3,6}){2,4}$/.test(campo.chave) ? campo.chave : "",
    integrantes,
    texto,
  };
}

const dataBR = (v) => (/^\d{2}\/\d{2}\/\d{4}$/.test(String(v || "").trim()) ? String(v).trim() : "");
const isoDeBR = (br) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const diasEntre = (isoA, isoB) => Math.round((Date.parse(isoB + "T12:00:00Z") - Date.parse(isoA + "T12:00:00Z")) / 86400000);

/* Dois nomes são da mesma pessoa? A régua de `lib/fusao.js`: o nome mais
   curto tem ao menos duas palavras e TODAS aparecem no mais longo, na mesma
   ordem. Acento e caixa não contam — o comprovante sai em caixa alta. */
export function nomesBatem(a, b) {
  const pa = chaveDeTexto(a).split(" ").filter(Boolean);
  const pb = chaveDeTexto(b).split(" ").filter(Boolean);
  if (pa.length < 2 || pb.length < 2) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  let i = 0;
  for (const p of longo) if (p === curto[i]) i++;
  return i === curto.length;
}

/* ------------------------------ o veredito -------------------------------
   TRÊS saídas, e a diferença entre elas é o que torna a automação honesta:
   - `conforme`   o documento atende ao critério → a fila recebe o pedido já
                  verde, e a coordenação confere a chave e defere num clique;
   - `conferir`   não deu para ler (foto, formato novo, campo ausente) → vai
                  para a fila DIZENDO o que faltou. Recusar quem mandou um
                  arquivo que o leitor não entendeu seria punir a pessoa por
                  um limite nosso;
   - `naoAtende`  o PRÓPRIO documento nega o critério (a faixa é a de cima, o
                  cadastro está desatualizado, o prazo de atualização venceu).
                  Aqui a recusa é do documento, não da heurística.
*/
export function avaliarComprovante(leitura, { criterio, nome = "", hoje, validadeDias = 0 } = {}) {
  const aceita = criterioDe(criterio).aceita;
  const avisos = [], impedem = [];
  if (!leitura?.ok) return { veredito: "conferir", impedem: [], avisos: [leitura?.motivo || "não foi possível ler o arquivo"] };

  if (!leitura.faixaPerCapita) avisos.push("não foi possível ler a faixa de renda por pessoa");
  else if (!aceita.includes(leitura.faixaPerCapita))
    impedem.push(`a faixa de renda por pessoa é “${leitura.faixaTexto || rotuloFaixa(leitura.faixaPerCapita)}”, acima do que o edital aceita`);

  if (leitura.atualizado === "NÃO") impedem.push("o comprovante diz que o cadastro NÃO está atualizado");
  else if (!leitura.atualizado) avisos.push("não foi possível ler se o cadastro está atualizado");

  const limite = isoDeBR(leitura.limiteAtualizacao);
  if (limite && hoje && limite < hoje) impedem.push(`o prazo de atualização do cadastro venceu em ${leitura.limiteAtualizacao}`);

  const emitido = isoDeBR(leitura.emitidoEm);
  if (validadeDias > 0) {
    if (!emitido) avisos.push("não foi possível ler a data de emissão do comprovante");
    else if (hoje && diasEntre(emitido, hoje) > validadeDias)
      impedem.push(`o comprovante foi emitido em ${leitura.emitidoEm}, há mais de ${validadeDias} dia(s)`);
  }

  /* O NOME é a única chave: o comprovante traz NIS e nome dos integrantes, não
     CPF. Não bater não IMPEDE — nome de casada, abreviação e o filho que pede
     com o comprovante da família são casos legítimos —, mas a coordenação
     precisa ver isso antes de deferir. */
  const nomeConfere = !!nome && leitura.integrantes.some((i) => nomesBatem(i, nome));
  if (nome && !nomeConfere) avisos.push(`“${nome}” não foi encontrado entre os integrantes da família do comprovante`);
  if (!leitura.chave) avisos.push("sem chave de segurança legível — a conferência terá de ser pelo próprio PDF");

  const veredito = impedem.length ? "naoAtende" : avisos.length ? "conferir" : "conforme";
  return { veredito, impedem, avisos, nomeConfere };
}

/** O que se GRAVA da leitura — sem a lista de integrantes (dado de terceiro). */
export function resumoDaLeitura(leitura, nomeConfere) {
  if (!leitura?.ok) return { legivel: false, motivo: leitura?.motivo || "" };
  return {
    legivel: true,
    faixa: leitura.faixaPerCapita,
    faixaTexto: leitura.faixaTexto,
    atualizado: leitura.atualizado,
    ultimaAtualizacao: leitura.ultimaAtualizacao,
    limiteAtualizacao: leitura.limiteAtualizacao,
    emitidoEm: leitura.emitidoEm,
    codigoFamiliar: leitura.codigoFamiliar,
    municipio: leitura.municipio,
    chave: leitura.chave,
    integrantes: leitura.integrantes.length,
    nomeConfere: !!nomeConfere,
  };
}

/** O endereço onde a chave de segurança se confere, no site do Ministério. */
export const URL_VALIDACAO = "https://cadunico.dataprev.gov.br/#/validacao-comprovante";

/** Quantas isenções já foram DEFERIDAS neste evento (a cota conta só elas). */
export const deferidas = (inscritos) =>
  (inscritos || []).filter((i) => i?.isencao?.estado === "deferido").length;

/** A cota ainda comporta mais uma? `cota: 0` é sem cota. */
export function cotaComporta(cfg, inscritos) {
  const c = normalizarIsencao(cfg);
  if (!c.cota) return { ok: true, restam: null };
  const usadas = deferidas(inscritos);
  return { ok: usadas < c.cota, restam: Math.max(0, c.cota - usadas), usadas };
}
