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
  const { google } = await import("googleapis");
  const { driveAuth } = await import("./files.js");
  const gmail = google.gmail({ version: "v1", auth: driveAuth(google) });

  const validos = listaPara(para);
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
            <td style="padding:6px 10px;border:1px solid #e4e0d6">${v || "—"}</td></tr>`).join("")}
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
const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))
  ? iso.split("-").reverse().join("/") : "—");

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
export function emailConfirmacaoProposta(acao) {
  const p = acao.proposta || {};
  return {
    para: String(p.respEmail || "").trim(),
    assunto: `[ARCHÉ Extensão] Proposta recebida: ${p.nomeAtividade || "(sem título)"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Sua proposta foi recebida pela PROPPEX</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${p.respNome || ""}</b>!</p>
        <p>A proposta de ação de extensão <b>${p.nomeAtividade || "(sem título)"}</b>
          (${acao.curso || "—"}) foi submetida com sucesso e aguarda análise da PROPPEX.
          Quando aprovada, ela receberá o Número da Ação.</p>
        <p>Segue anexa a <b>cópia da proposta em PDF</b> para o seu arquivo.</p>
        <p>Acompanhe a situação pelo portal:
          <a href="https://arche.app.br/extensao/" style="color:#40717e;font-weight:700">arche.app.br/extensao</a></p>
        <p style="color:#5b7280;font-size:12px">Em caso de dúvidas, responda a este e-mail ou contate extensao@uniego.edu.br.</p>
      </div>`,
  };
}

/* --------------------------------- ATAS --------------------------------- */
// Ata registrada: segue com o PDF anexo para quem secretariou, para quem
// presidiu e para o registro da PROPPEX.
export function emailAtaRegistrada(ata, { titulo, para }) {
  const s = ata.sessao || {};
  const dia = String(s.data || "").split("-").reverse().join("/");
  const encs = (ata.pauta || [])
    .map((p) => p.encaminhamento).filter((e) => e?.acao)
    .map((e) => `<li>${e.acao}${e.responsavel ? ` — <b>${e.responsavel}</b>` : ""}${e.prazo ? ` (prazo ${String(e.prazo).split("-").reverse().join("/")})` : ""}</li>`)
    .join("");
  const pontos = (ata.pauta || []).map((p, i) => `<li>${i + 1}. ${p.titulo}</li>`).join("");

  return {
    para,
    assunto: `[ARCHÉ Atas] ${ata.numero || "Ata"} — ${titulo} (${dia})`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Ata registrada</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p><b>${ata.numero || "—"}</b> · ${titulo}<br>
           Sessão ${s.tipo || "ordinária"} de <b>${dia}</b>, ${s.horaInicio || "—"}${s.horaFim ? ` às ${s.horaFim}` : ""}, ${s.local || "—"}.</p>
        <p>Presidência: <b>${ata.presidencia?.nome || "—"}</b> · Secretaria: <b>${ata.secretaria?.nome || "—"}</b></p>
        ${pontos ? `<p style="margin-bottom:4px"><b>Pauta</b></p><ul style="margin-top:0;color:#334">${pontos}</ul>` : ""}
        ${encs ? `<p style="margin-bottom:4px"><b>Encaminhamentos</b></p><ul style="margin-top:0;color:#334">${encs}</ul>` : ""}
        <p>Segue anexa a <b>ata em PDF</b>, com timbrado institucional e folha de assinaturas.</p>
        <p style="margin-top:16px">
          <a href="https://arche.app.br/atas/" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">
            Abrir o ARCHÉ AT</a>
        </p>
        <p style="color:#5b7280;font-size:12px">Este e-mail é o comprovante de registro da ata no sistema.</p>
      </div>`,
  };
}

// Convocação da sessão, com a ordem do dia e o PDF anexo.
export function emailConvocacao(ata, { titulo, para }) {
  const s = ata.sessao || {};
  const dia = String(s.data || "").split("-").reverse().join("/");
  const ordem = (ata.pauta || []).filter((p) => p.titulo)
    .map((p, i) => `<li>${i + 1}. ${p.titulo}</li>`).join("");
  return {
    para,
    assunto: `[ARCHÉ Atas] Convocação — ${titulo} · sessão ${s.tipo || "ordinária"} de ${dia}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Convocação de sessão</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Ficam convocados os membros do <b>${titulo}</b> para a sessão
           <b>${s.tipo || "ordinária"}</b> de <b>${dia}</b>${s.horaInicio ? `, às ${s.horaInicio}` : ""}${s.local ? `, ${s.local}` : ""}.</p>
        ${ordem ? `<p style="margin-bottom:4px"><b>Ordem do dia</b></p><ul style="margin-top:0;color:#334">${ordem}</ul>` : ""}
        <p>Segue anexa a <b>convocação em PDF</b>, com timbrado institucional.</p>
        <p style="color:#5b7280;font-size:12px">Presidência: ${ata.presidencia?.nome || "—"} · Secretaria: ${ata.secretaria?.nome || "—"}</p>
      </div>`,
  };
}
