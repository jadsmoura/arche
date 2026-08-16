/* ========================================================================
   Envio de e-mail via Gmail API (mesma autorização OAuth do Google Drive).
   Requer que o refresh token tenha o escopo gmail.send — reautorizar com
   scripts/gdrive-auth.mjs caso o envio falhe com "insufficient scopes".
   Destinatário definido por NOTIFY_EMAIL (padrão: extensao@uniego.edu.br).
   ======================================================================== */

function b64url(s) {
  return Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Endereços chegam de campos livres preenchidos no navegador: só entram no
// cabeçalho depois de validados (um "\n" aqui viraria injeção de cabeçalho).
export const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function listaPara(para) {
  return [...new Set(
    (Array.isArray(para) ? para : [para])
      .map((e) => String(e ?? "").trim())
      .filter((e) => RE_EMAIL.test(e))
      .map((e) => e.toLowerCase()),
  )];
}

// anexos: [{ nome, tipo, conteudo (Buffer) }] — enviados como multipart/mixed.
// para: string ou array de endereços.
export async function enviarEmail({ para, assunto, corpoHtml, anexos }) {
  const validos = listaPara(para);
  // Destinatário INFORMADO e inválido é FALHA (achado da revisão adversarial
  // de ago/2026): um e-mail pessoal digitado errado era desviado em silêncio
  // para a caixa institucional — conteúdo nominal no setor errado, com
  // registro de sucesso e o destinatário de verdade sem receber nada. O
  // fallback fica só para os avisos internos, que não informam `para` de
  // propósito (emailNovaProposta, resumos da cobrança).
  if (!validos.length && para !== undefined && para !== null)
    throw new Error(`destinatário inválido: ${JSON.stringify(para)}`);
  const { google } = await import("googleapis");
  const { driveAuth } = await import("./files.js");
  const gmail = google.gmail({ version: "v1", auth: driveAuth(google) });
  const destino = validos.length
    ? validos.join(", ")
    : (process.env.NOTIFY_EMAIL || "extensao@uniego.edu.br");
  // Nome de exibição do remetente (endereço é sempre o da conta autenticada)
  const fromName = process.env.MAIL_FROM_NAME || "ARCHÉ · PROPPEX";
  const fromAddr = process.env.MAIL_FROM_ADDR || "jadsonbelem@gmail.com";
  const enc = (s) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
  const cabecalho = [
    `From: ${enc(fromName)} <${fromAddr}>`,
    `To: ${destino}`,
    `Subject: ${enc(assunto)}`,
    "MIME-Version: 1.0",
  ];

  let linhas;
  if (anexos?.length) {
    const B = "arche-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    linhas = [
      ...cabecalho,
      `Content-Type: multipart/mixed; boundary="${B}"`,
      "",
      `--${B}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      corpoHtml,
    ];
    for (const ax of anexos) {
      linhas.push(
        `--${B}`,
        `Content-Type: ${ax.tipo || "application/octet-stream"}; name="${ax.nome}"`,
        `Content-Disposition: attachment; filename="${ax.nome}"`,
        "Content-Transfer-Encoding: base64",
        "",
        ax.conteudo.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      );
    }
    linhas.push(`--${B}--`);
  } else {
    linhas = [...cabecalho, 'Content-Type: text/html; charset="UTF-8"', "", corpoHtml];
  }

  await gmail.users.messages.send({ userId: "me", requestBody: { raw: b64url(linhas.join("\r\n")) } });
  return destino;
}

export function emailNovaProposta(acao, baseUrl) {
  const p = acao.proposta || {};
  const url = `${baseUrl}/extensao/?perfil=proppex`;
  return {
    assunto: `[ARCHÉ Extensão] Nova proposta: ${p.nomeAtividade || "(sem título)"} — ${acao.curso || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Nova proposta de extensão submetida</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${[
            ["Atividade", p.nomeAtividade],
            ["Classificação", p.classificacao + (p.classificacao === "Outro" && p.classificacaoOutro ? ` — ${p.classificacaoOutro}` : "")],
            ["Curso / Departamento", acao.curso],
            ["Período", `${(p.periodoInicio||"").split("-").reverse().join("/")} a ${(p.periodoFim||"").split("-").reverse().join("/")}`],
            ["Carga horária", p.cargaHoraria ? p.cargaHoraria + "h" : "—"],
            ["Local", `${p.local || "—"} (${p.municipio || "—"})`],
            ["Responsável", `${p.respNome || "—"} · ${p.respTelefone || ""} · ${p.respEmail || ""}`],
          ].map(([k, v]) => `<tr>
            <td style="padding:6px 10px;border:1px solid #e4e0d6;background:#f4f2ec;font-weight:700;white-space:nowrap">${k}</td>
            <td style="padding:6px 10px;border:1px solid #e4e0d6">${esc(v) || "—"}</td></tr>`).join("")}
        </table>
        <p style="margin-top:16px">
          <a href="${url}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">
            Abrir painel PROPPEX para análise</a>
        </p>
        <p style="color:#5b7280;font-size:12px;margin-top:14px">A cópia da proposta em PDF segue anexa a este e-mail.</p>
      </div>`,
  };
}

/* --------------------- cobrança do relatório final ---------------------- */
const PORTAL_EXT = "https://arche.app.br/extensao/";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// para os corpos de e-mail montados fora deste arquivo (convite dos
// professores, aviso de certificados): mesmo escape, mesmo contrato
export const escapeHtml = esc;
const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))
  ? iso.split("-").reverse().join("/") : "—");

/** A mensagem que a coordenação escreve na janela de envio (pedido do dono,
 *  ago/2026): entra destacada no topo do e-mail, antes do texto padrão.
 *  Vazia, não ocupa espaço nenhum. */
export function blocoMensagem(mensagem) {
  const t = String(mensagem || "").trim();
  if (!t) return "";
  return `<div style="background:#fff7e6;border-left:4px solid #d99a06;border-radius:8px;
    padding:10px 14px;margin:0 0 14px"><b>Mensagem da coordenação:</b><br>${esc(t).replace(/\n/g, "<br>")}</div>`;
}

/**
 * Lembrete ao responsável: uma mensagem por pessoa, listando todas as ações
 * dela com relatório pendente (três e-mails iguais parecem defeito do sistema).
 * itens: [{ acao, dias }]
 */
export function emailCobrancaRelatorio(itens, { nome } = {}) {
  const varias = itens.length > 1;
  const primeira = itens[0]?.acao || {};
  const titulo = primeira.proposta?.nomeAtividade || "(sem título)";
  const linhas = itens.map(({ acao, dias }) => {
    const p = acao.proposta || {};
    return `<tr>
      <td style="padding:8px 10px;border:1px solid #e4e0d6;white-space:nowrap"><b>${esc(acao.numeroAcao || "—")}</b></td>
      <td style="padding:8px 10px;border:1px solid #e4e0d6">${esc(p.nomeAtividade || "—")}<br>
        <span style="color:#657179;font-size:12px">${esc(acao.curso || "—")}</span></td>
      <td style="padding:8px 10px;border:1px solid #e4e0d6;white-space:nowrap">${dataBR(p.periodoInicio)} a ${dataBR(p.periodoFim)}</td>
      <td style="padding:8px 10px;border:1px solid #e4e0d6;white-space:nowrap;color:#b26a00">${dias} dia${dias === 1 ? "" : "s"}</td>
    </tr>`;
  }).join("");

  return {
    assunto: varias
      ? `[ARCHÉ Extensão] Relatório final pendente — ${itens.length} ações`
      : `[ARCHÉ Extensão] Relatório final pendente — ${primeira.numeroAcao || titulo}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px;color:#182632">
        <h2 style="color:#1c3742;margin-bottom:4px">Relatório final pendente</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá${nome ? `, <b>${esc(nome)}</b>` : ""}!</p>
        <p>${varias
          ? "As ações de extensão abaixo já se encerraram e ainda aguardam o <b>relatório final</b>:"
          : "A ação de extensão abaixo já se encerrou e ainda aguarda o <b>relatório final</b>:"}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr>
            ${["Nº da ação", "Atividade", "Período", "Encerrada há"].map((h) =>
              `<th style="padding:8px 10px;border:1px solid #e4e0d6;background:#f4f2ec;text-align:left;white-space:nowrap">${h}</th>`).join("")}
          </tr>
          ${linhas}
        </table>
        <p style="margin-top:18px">Para concluir, acesse o portal, abra a ação e preencha a seção
          <b>Relatório final</b> — incluindo a lista de participantes e, se desejar, o portfólio
          com fotos, materiais e links de divulgação.</p>
        <p style="margin-top:16px">
          <a href="${PORTAL_EXT}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">
            Enviar o relatório final</a>
        </p>
        <p style="color:#5b7280;font-size:12px;margin-top:18px">
          Se o relatório já foi entregue por outro meio, responda a este e-mail para que a
          PROPPEX faça a baixa no sistema.</p>
      </div>`,
  };
}

/** Resumo operacional da rodada, para a PROPPEX e coordenadores de extensão. */
export function emailResumoCobranca(r) {
  const bloco = (titulo, itens, cor) => (itens.length ? `
    <h3 style="color:${cor};font-size:14px;margin:18px 0 6px">${titulo} (${itens.length})</h3>
    <ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.6">${itens.join("")}</ul>` : "");

  const cobradas = (r.enviados || []).map((e) =>
    `<li><b>${esc(e.para)}</b> — ${e.acoes.map((a) => esc(a)).join(", ")}</li>`);
  const falhas = (r.erros || []).map((e) =>
    `<li><b>${esc(e.para)}</b> — ${esc(e.erro)}</li>`);
  const semEmail = (r.semEmail || []).map((a) =>
    `<li>${esc(a.numeroAcao || a.id)} · ${esc(a.nomeAtividade)} — sem e-mail válido do responsável</li>`);
  const incons = (r.inconsistentes || []).map((a) =>
    `<li>${esc(a.numeroAcao || a.id)} · ${esc(a.nomeAtividade)} — ${esc(a.motivo)}</li>`);
  const restantes = r.restantes
    ? `<p style="font-size:13px;color:#657179">${r.restantes} ação(ões) ficaram para a próxima rodada (teto de envios por execução).</p>`
    : "";

  const ehBackfill = r.modo === "backfill";
  return {
    assunto: ehBackfill
      ? "[ARCHÉ Extensão] Cobrança automática ativada — histórico preservado"
      : `[ARCHÉ Extensão] Cobrança de relatórios — ${(r.enviados || []).length} enviada(s)`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px;color:#182632">
        <h2 style="color:#1c3742;margin-bottom:4px">${ehBackfill
          ? "Cobrança automática de relatórios — ativada"
          : "Cobrança automática de relatórios"}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO · ${esc(r.hoje || "")}</p>
        ${ehBackfill ? `
          <p>A rotina de cobrança do relatório final entrou em operação. As ações que <b>já estavam
          vencidas</b> foram registradas como tratadas e <b>nenhum e-mail foi enviado a elas</b> —
          a lista está abaixo para acompanhamento manual, se desejar.</p>
          <p>A partir de agora, cada ação encerrada gera <b>um lembrete automático</b> ao responsável
          no dia seguinte ao término.</p>` : ""}
        ${ehBackfill
          ? bloco("Ações pendentes no histórico", (r.backlog || []).map((a) =>
              `<li>${esc(a.numeroAcao || a.id)} · ${esc(a.nomeAtividade)} — ${esc(a.curso)} (encerrada em ${dataBR(a.periodoFim)})</li>`), "#1c3742")
          : bloco("Cobranças enviadas", cobradas, "#2e7d32")}
        ${bloco("Falhas de envio", falhas, "#c62828")}
        ${bloco("Sem responsável com e-mail válido", semEmail, "#b26a00")}
        ${bloco("Ações com dados inconsistentes", incons, "#b26a00")}
        ${restantes}
        <p style="margin-top:16px">
          <a href="${PORTAL_EXT}?perfil=proppex" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">
            Abrir painel PROPPEX</a>
        </p>
      </div>`,
  };
}

// Confirmação enviada ao responsável pela proposta, com o PDF anexo.
/**
 * Devolução da proposta para ajustes. É o e-mail que faltava para a
 * devolução virar um ciclo: a PROPPEX escreve o motivo e o responsável fica
 * sabendo NA HORA, com o motivo por escrito e o caminho de volta — sem isso
 * a proposta ficava parada esperando o professor entrar no portal por acaso.
 */
export function emailPropostaDevolvida(acao, { baseUrl = "https://arche.app.br" } = {}) {
  const p = acao.proposta || {};
  const link = `${String(baseUrl).replace(/\/$/, "")}/extensao/`;
  return {
    para: String(p.respEmail || acao.criadoPor || "").trim(),
    assunto: `[ARCHÉ Extensão] Proposta devolvida para ajustes: ${p.nomeAtividade || "(sem título)"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Sua proposta voltou para ajustes</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(p.respNome || "")}</b>!</p>
        <p>A PROPPEX analisou a proposta <b>${esc(p.nomeAtividade || "(sem título)")}</b>
          (${esc(acao.curso || "—")}) e a devolveu para ajustes. <b>Ela não foi recusada</b>:
          é a mesma proposta, que volta a ficar editável para você corrigir e reenviar.</p>
        <div style="background:#fdf3e3;border-left:4px solid #b8863b;border-radius:8px;padding:12px 16px;margin:14px 0">
          <b>Motivo da devolução</b><br>${esc(String(acao.motivoDevolucao || "")).replace(/\n/g, "<br>")}
        </div>
        <p><b>O que fazer:</b> entre no portal, abra a ação e clique em
          <b>“Corrigir e reenviar”</b>. O formulário abre com tudo o que você já
          havia preenchido — ajuste o que foi apontado e envie de novo.</p>
        <p><a href="${link}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Abrir no ARCHÉ</a></p>
        <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${link}</p>
      </div>`,
  };
}

export function emailConfirmacaoProposta(acao) {
  const p = acao.proposta || {};
  return {
    para: String(p.respEmail || "").trim(),
    assunto: `[ARCHÉ Extensão] Proposta recebida: ${p.nomeAtividade || "(sem título)"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Sua proposta foi recebida pela PROPPEX</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(p.respNome || "")}</b>!</p>
        <p>A proposta de ação de extensão <b>${esc(p.nomeAtividade || "(sem título)")}</b>
          (${esc(acao.curso || "—")}) foi submetida com sucesso e aguarda análise da PROPPEX.
          Quando aprovada, ela receberá o Número da Ação.</p>
        <p>Segue anexa a <b>cópia da proposta em PDF</b> para o seu arquivo.</p>
        <p>Acompanhe a situação pelo portal:
          <a href="https://arche.app.br/extensao/" style="color:#40717e;font-weight:700">arche.app.br/extensao</a></p>
        <p style="color:#5b7280;font-size:12px">Em caso de dúvidas, responda a este e-mail ou contate extensao@uniego.edu.br.</p>
      </div>`,
  };
}

/* --------------------- avisos da IC à coordenação ------------------------ */
/**
 * As movimentações do ARCHÉ IC avisam a coordenação de pesquisa por e-mail
 * (decisão do dono, ago/2026): submissão, reenvio, relatório entregue,
 * indicação de aluno, substituição, contestação e os movimentos do ICEM.
 * Destinatário em IC_NOTIFY_EMAIL (padrão: pesquisa@uniego.edu.br) — para
 * trocar, mude a env var, não o código. O aviso é informativo: traz o
 * essencial e o link do setor, nunca dado sigiloso (nota, parecer, conta).
 */
export function emailMovimentacaoIC({ assunto, titulo, linhas = [], url = "https://arche.app.br/pesquisa/ic/" }) {
  return {
    para: process.env.IC_NOTIFY_EMAIL || "pesquisa@uniego.edu.br",
    assunto: `[ARCHÉ IC] ${assunto}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">${esc(titulo || assunto)}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · Iniciação Científica · PROPPEX / UNIEGO</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${linhas.map(([k, v]) => `<tr>
            <td style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;font-weight:700;white-space:nowrap">${esc(k)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(v) || "—"}</td></tr>`).join("")}
        </table>
        <p style="margin-top:16px"><a href="${url}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir o ARCHÉ IC</a></p>
      </div>`,
  };
}

/**
 * Convite ao bolsista do ICEM (Ensino Médio): criar o usuário com o e-mail
 * da indicação e — turma vigente — escolher o projeto que vai acompanhar;
 * turma encerrada — entregar o relatório final para formalizar a conclusão.
 */
export function emailConviteEM(b, turma, { baseUrl = "https://arche.app.br", mensagem = "" } = {}) {
  const entrada = `${baseUrl}/entrar/?next=${encodeURIComponent("/pesquisa/ic/")}`;
  const passos = turma?.encerrada
    ? `<li>Entre no portal e abra a guia <b>Ensino Médio</b>;</li>
       <li>Escreva e envie o seu <b>relatório final</b> — o que você acompanhou,
         o que aprendeu e como foi a experiência. É ele que formaliza a
         conclusão da sua participação na turma ${esc(turma?.ciclo || "")}.</li>`
    : `<li>Entre no portal e abra a guia <b>Ensino Médio</b>;</li>
       <li><b>Escolha o curso e o projeto de pesquisa</b> que você quer acompanhar —
         e troque quando quiser, ao longo do ano;</li>
       <li>Ao fim da turma, envie por ali o seu <b>relatório final</b>.</li>`;
  return {
    para: String(b.email || "").trim(),
    assunto: `[ARCHÉ IC] ${turma?.encerrada ? "Seu relatório final do ICEM" : "Bem-vindo(a) ao ICEM"} — turma ${turma?.ciclo || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Iniciação Científica no Ensino Médio — ICEM</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(b.nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p>A PROPPEX registrou você na turma <b>${esc(turma?.ciclo || "")}</b> do ICEM
          (Edital ${esc(turma?.edital || "")}). Agora o acompanhamento acontece pelo portal ARCHÉ:</p>
        <ol>
          <li>Crie o seu usuário em <a href="${entrada}" style="color:#40717e;font-weight:700">arche.app.br/entrar</a>
            usando <b>este mesmo e-mail</b> (${esc(b.email || "")}) — é ele que liga a conta ao seu registro;</li>
          <li>Complete o seu cadastro (nome, CPF e telefone);</li>
          ${passos}
        </ol>
        <p><a href="${entrada}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Entrar no ARCHÉ</a></p>
        <p style="color:#5b7280;font-size:12px">Em caso de dúvidas, responda a este e-mail ou procure a coordenação de pesquisa.</p>
      </div>`,
  };
}

/**
 * Cobrança SEMANAL dos relatórios de IC (decisão do dono, ago/2026): da
 * abertura da janela até o relatório ser enviado E validado, o aluno recebe
 * o lembrete de enviar (ou corrigir) e a orientação, o de validar. Uma
 * mensagem por pessoa, com todos os itens dela — espaçadas por 7 dias.
 */
export function emailCobrancaRelatorioIC({ para, nome, papel, itens = [], mensagem = "" }) {
  const acao = papel === "orientador"
    ? "validar (ou devolver para correção)" : "enviar pelo portal";
  return {
    para,
    assunto: `[ARCHÉ IC] Lembrete: relatório${itens.length > 1 ? "s" : ""} de Iniciação Científica a ${papel === "orientador" ? "validar" : "entregar"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Relatórios de Iniciação Científica</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p>${papel === "orientador"
          ? "Há relatório(s) dos seus alunos de IC aguardando a sua validação — ou ainda não entregues, dentro da janela de envio:"
          : "A janela de entrega do(s) seu(s) relatório(s) de IC está aberta:"}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr>
            <th style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;text-align:left">Projeto</th>
            <th style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;text-align:left">Relatório</th>
            <th style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;text-align:left">Situação</th>
            <th style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;text-align:left">Prazo</th>
          </tr>
          ${itens.map((x) => `<tr>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(x.numero || "")} ${esc(x.titulo || "")}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(x.tipo)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(x.situacao)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(dataBR(x.vence))}${x.atrasado ? ' — <b style="color:#b4232a">em atraso</b>' : ""}</td>
          </tr>`).join("")}
        </table>
        <p style="margin-top:14px">O que fazer: entre no portal, abra o projeto e ${acao}.
          O lembrete se repete toda semana até o relatório ser enviado e validado.</p>
        <p><a href="https://arche.app.br/pesquisa/ic/" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Abrir o ARCHÉ IC</a></p>
        <p style="color:#5b7280;font-size:12px">Em caso de dúvidas, responda a este e-mail ou procure a coordenação de pesquisa.</p>
      </div>`,
  };
}

/**
 * A CHAMADA de preenchimento do relatório do ICEM (botão da gestão): vai a
 * todo bolsista da turma com relatório exigido ainda não validado — mesmo
 * quem já foi convidado antes. Leva o prazo quando a turma o tem.
 */
export function emailChamadaRelatorioEM(b, turma, { baseUrl = "https://arche.app.br", tipos = ["final"], mensagem = "" } = {}) {
  const entrada = `${baseUrl}/entrar/?next=${encodeURIComponent("/pesquisa/ic/")}`;
  const prazo = turma?.prazoRelatorioFinal
    ? ` até <b>${turma.prazoRelatorioFinal.split("-").reverse().join("/")}</b>` : "";
  const oQue = tipos.length > 1 ? "os relatórios parcial e final" : `o relatório ${tipos[0]}`;
  return {
    para: String(b.email || "").trim(),
    assunto: `[ARCHÉ IC] Preencha ${tipos.length > 1 ? "os seus relatórios" : "o seu relatório " + tipos[0]} do ICEM — turma ${turma?.ciclo || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Relatório do ICEM — turma ${esc(turma?.ciclo || "")}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(b.nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p>A PROPPEX pede que você preencha ${oQue} da sua participação no
          Programa de Iniciação Científica no Ensino Médio${prazo} — três perguntas sobre a sua
          participação, mais o questionário de avaliação do programa:</p>
        <ol>
          <li>As <b>atividades</b> que você realizou na vigência da bolsa;</li>
          <li>Se a participação te <b>motivou</b> a seguir carreira acadêmica, cursar uma faculdade, ser um cientista;</li>
          <li>Em qual <b>curso do UNIEGO</b> você pretende ingressar.</li>
        </ol>
        <p>Entre no portal com este e-mail (${esc(b.email || "")}) e abra a guia <b>Ensino Médio</b>.
          Depois do envio, a PROPPEX valida — e é essa validação que formaliza a sua participação.</p>
        <p><a href="${entrada}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Preencher o relatório</a></p>
        <p style="color:#5b7280;font-size:12px">Em caso de dúvidas, responda a este e-mail ou procure a coordenação de pesquisa.</p>
      </div>`,
  };
}
