/* Devolução da proposta de extensão: o que o professor recebe por e-mail.
   Nenhum envio real — o que se testa é o conteúdo da mensagem, que é o que
   faz a devolução virar um ciclo em vez de uma proposta parada. */
import test from "node:test";
import assert from "node:assert/strict";
import { emailPropostaDevolvida } from "../lib/mailer.js";

const acao = {
  id: "ext-1", curso: "Agronomia", criadoPor: "professora@uniego.edu.br",
  motivoDevolucao: "Faltou detalhar a metodologia das oficinas\ne a carga horária por dia.",
  proposta: {
    nomeAtividade: "IV Semana do Meio Ambiente",
    respNome: "Marlana Carla Peixoto Ribeiro", respEmail: "marlanacpr@gmail.com",
  },
};

test("o e-mail de devolução leva o motivo, o caminho de volta e o destinatário certo", () => {
  const m = emailPropostaDevolvida(acao, { baseUrl: "https://arche.app.br/" });
  assert.equal(m.para, "marlanacpr@gmail.com", "vai para o responsável pela ação");
  assert.match(m.assunto, /devolvida para ajustes/i);
  assert.match(m.assunto, /IV Semana do Meio Ambiente/);
  // o motivo é a razão de o e-mail existir, e as quebras de linha sobrevivem
  assert.match(m.corpoHtml, /Faltou detalhar a metodologia das oficinas<br>e a carga horária/);
  assert.match(m.corpoHtml, /Corrigir e reenviar/, "diz o que fazer, com o nome do botão da tela");
  assert.match(m.corpoHtml, /não foi recusada/i, "devolver não é reprovar");
  assert.match(m.corpoHtml, /https:\/\/arche\.app\.br\/extensao\//, "a barra final não duplica");
});

test("sem e-mail do responsável, cai em quem submeteu", () => {
  const semResp = { ...acao, proposta: { ...acao.proposta, respEmail: "" } };
  assert.equal(emailPropostaDevolvida(semResp).para, "professora@uniego.edu.br");
  // e sem nenhum dos dois, devolve vazio — quem decide não enviar é o server
  assert.equal(emailPropostaDevolvida({ ...semResp, criadoPor: "" }).para, "");
});
