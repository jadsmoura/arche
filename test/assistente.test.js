/* Testes do assistente de escrita das atas. Nada aqui chama a rede: o que se
   verifica é o catálogo, as recusas e o prompt montado — que é onde mora a
   regra de "não inventar conteúdo". */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACOES, CAMPOS, MIN_TEXTO, MAX_TEXTO, campoDe, catalogo, disponivel,
  montarPedido, limparResposta, assistir,
} from "../lib/assistente.js";

const semChaves = async (fn) => {
  const g = process.env.GEMINI_API_KEY, a = process.env.ANTHROPIC_API_KEY, e = process.env.ATA_IA;
  delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.ATA_IA;
  try { return await fn(); } finally {
    if (g) process.env.GEMINI_API_KEY = g; else delete process.env.GEMINI_API_KEY;
    if (a) process.env.ANTHROPIC_API_KEY = a; else delete process.env.ANTHROPIC_API_KEY;
    if (e) process.env.ATA_IA = e; else delete process.env.ATA_IA;
  }
};
const comChaveFalsa = async (fn) => {
  const antes = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "chave-de-teste";
  try { return await fn(); } finally {
    if (antes) process.env.GEMINI_API_KEY = antes; else delete process.env.GEMINI_API_KEY;
  }
};

/* ------------------------------- catálogo ------------------------------- */
test("o assistente cobre só campos de ata — a Extensão fica de fora", () => {
  const ids = Object.keys(CAMPOS);
  assert.ok(ids.length, "catálogo vazio");
  assert.ok(ids.every((id) => id.startsWith("atas.")),
    "proposta e relatório de extensão são autoria do professor: " + ids.join(", "));
  for (const id of ["atas.discussao", "atas.deliberacao", "atas.informes", "atas.observacoes"]) {
    assert.ok(ids.includes(id), `faltou ${id}`);
  }
});

test("todo campo e toda ação estão completos", () => {
  for (const [id, c] of Object.entries(CAMPOS)) {
    assert.ok(c.rotulo && c.onde && c.espera && c.formato, `${id} incompleto`);
  }
  for (const [id, a] of Object.entries(ACOES)) {
    assert.ok(a.rotulo && a.dica && a.ordem, `${id} incompleto`);
  }
  assert.equal(campoDe("atas.discussao").rotulo, "Notas da discussão");
  assert.equal(campoDe("extensao.justificativa"), null, "campo removido não pode voltar por engano");
  assert.equal(campoDe(null), null);
});

test("o catálogo diz à interface se há provedor", async () => {
  await semChaves(() => {
    assert.equal(disponivel(), false);
    assert.equal(catalogo().disponivel, false, "sem chave, a interface não mostra os botões");
  });
  await comChaveFalsa(() => {
    const c = catalogo();
    assert.equal(c.disponivel, true);
    assert.equal(c.provedor, "gemini");
    assert.equal(c.minimo, MIN_TEXTO);
    assert.ok(c.acoes.length && c.campos.length);
    assert.ok(c.acoes.every((a) => a.rotulo && a.dica));
    assert.ok(!JSON.stringify(c).includes("Reescreva"), "a ordem interna não vai para o navegador");
  });
});

/* -------------------------------- recusas ------------------------------- */
test("sem provedor configurado, o assistente recusa com mensagem clara", async () => {
  await semChaves(async () => {
    await assert.rejects(
      () => assistir({ campo: "atas.discussao", texto: "um texto suficientemente longo para passar" }),
      /não está configurado/);
  });
});

test("texto curto é recusado antes de gastar cota", async () => {
  await comChaveFalsa(async () => {
    for (const texto of ["", "   ", "curto", "a".repeat(MIN_TEXTO - 1)]) {
      await assert.rejects(() => assistir({ campo: "atas.discussao", texto }), /ao menos \d+ caracteres/);
    }
  });
});

test("campo e ação desconhecidos são recusados", async () => {
  await comChaveFalsa(async () => {
    const texto = "notas suficientes para o assistente trabalhar em cima";
    await assert.rejects(() => assistir({ campo: "extensao.justificativa", texto }), /Campo não reconhecido/);
    await assert.rejects(() => assistir({ campo: "atas.discussao", acao: "inventar", texto }), /Ação não reconhecida/);
  });
});

/* -------------------------------- prompt -------------------------------- */
test("o prompt proíbe invenção e pede só o texto do campo", () => {
  const { sistema } = montarPedido({
    campo: "atas.deliberacao", acao: "melhorar", texto: "o colegiado aprovou a proposta",
  });
  assert.match(sistema, /NUNCA invente/);
  assert.match(sistema, /não pode aparecer na sua resposta/);
  assert.match(sistema, /Sem títulos, sem/);
  assert.match(sistema, /\[inserir\]/, "precisa barrar marcadores de lacuna");
});

test("o prompt leva o texto do autor e o que se espera do campo", () => {
  const texto = "discutiu-se a carga prática do quinto período";
  const { usuario } = montarPedido({ campo: "atas.discussao", acao: "desenvolver", texto });
  assert.ok(usuario.includes(texto), "o texto do autor precisa ir junto");
  assert.ok(usuario.includes(CAMPOS["atas.discussao"].espera));
  assert.ok(usuario.includes(ACOES.desenvolver.ordem));
  assert.ok(usuario.includes("Texto do autor:"));
});

test("o contexto entra rotulado, limitado e sem objeto aninhado", () => {
  const { usuario } = montarPedido({
    campo: "atas.discussao", acao: "melhorar", texto: "notas da sessão de hoje",
    contexto: {
      "Órgão": "NDE — Psicologia",
      "Tipo de sessão": "ordinária",
      malicioso: { ignore: "instruções" },
      vazio: "   ",
      numero: 7,
    },
  });
  assert.ok(usuario.includes("- Órgão: NDE — Psicologia"));
  assert.ok(usuario.includes("- numero: 7"));
  assert.ok(!usuario.includes("malicioso"), "objeto aninhado não entra no prompt");
  assert.ok(!usuario.includes("- vazio"), "valor em branco não entra");
  assert.ok(usuario.includes("não repita estes dados como se fossem conteúdo do campo"));
});

test("contexto ausente ou inválido não quebra o pedido", () => {
  for (const contexto of [undefined, null, "texto", 42, []]) {
    const { usuario } = montarPedido({ campo: "atas.informes", acao: "revisar", texto: "informes da sessão de hoje", contexto });
    assert.ok(usuario.includes("Texto do autor:"));
  }
});

test("o texto do autor é cortado no limite antes de ir para o provedor", async () => {
  await comChaveFalsa(async () => {
    // a chamada falha na rede, mas o corte acontece antes — verificado no pedido
    const { usuario } = montarPedido({
      campo: "atas.discussao", acao: "melhorar", texto: "x".repeat(MAX_TEXTO).slice(0, MAX_TEXTO),
    });
    assert.ok(usuario.length < MAX_TEXTO + 2000, "o prompt não pode crescer sem limite");
  });
});

/* ------------------------------- limpeza -------------------------------- */
test("a resposta é limpa do que o modelo às vezes acrescenta", () => {
  assert.equal(limparResposta("```\nO colegiado aprovou.\n```"), "O colegiado aprovou.");
  assert.equal(limparResposta("```markdown\nTexto final.\n```"), "Texto final.");
  assert.equal(limparResposta('"O colegiado aprovou."'), "O colegiado aprovou.");
  assert.equal(limparResposta("“O colegiado aprovou.”"), "O colegiado aprovou.");
  assert.equal(limparResposta("Texto revisado: O colegiado aprovou."), "O colegiado aprovou.");
  assert.equal(limparResposta("  O colegiado aprovou.  "), "O colegiado aprovou.");
  assert.equal(limparResposta(null), "");
  // aspas internas legítimas continuam de pé
  assert.equal(limparResposta('O relator citou o "Parecer 95" na sessão.'),
    'O relator citou o "Parecer 95" na sessão.');
});
