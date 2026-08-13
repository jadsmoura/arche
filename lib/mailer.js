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

// anexos: [{ nome, tipo, conteudo (Buffer) }] — enviados como multipart/mixed.
export async function enviarEmail({ para, assunto, corpoHtml, anexos }) {
  const { google } = await import("googleapis");
  const { driveAuth } = await import("./files.js");
  const gmail = google.gmail({ version: "v1", auth: driveAuth(google) });

  const destino = para || process.env.NOTIFY_EMAIL || "extensao@uniego.edu.br";
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
