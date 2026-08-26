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
    // Anexo com `cid` é imagem EMBUTIDA no corpo (o QR da inscrição), não
    // arquivo à parte: o corpo a referencia por `cid:` e a estrutura tem de
    // ser multipart/related — em multipart/mixed vários clientes mostram a
    // imagem como anexo solto e deixam um quadrado vazio no lugar dela.
    const embutida = anexos.some((ax) => ax.cid);
    linhas = [
      ...cabecalho,
      embutida
        ? `Content-Type: multipart/related; type="text/html"; boundary="${B}"`
        : `Content-Type: multipart/mixed; boundary="${B}"`,
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
        ax.cid
          ? `Content-Disposition: inline; filename="${ax.nome}"`
          : `Content-Disposition: attachment; filename="${ax.nome}"`,
        ...(ax.cid ? [`Content-ID: <${ax.cid}>`] : []),
        "Content-Transfer-Encoding: base64",
        "",
        ax.conteudo.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      );
    }
    linhas.push(`--${B}--`);
  } else {
    linhas = [...cabecalho, 'Content-Type: text/html; charset="UTF-8"', "", corpoHtml];
  }

  const bruto = linhas.join("\r\n");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: b64url(bruto) } });
  try {
    const { medir } = await import("./medidor.js");
    medir("email", Buffer.byteLength(bruto));
  } catch { /* medir nunca atrapalha o envio */ }
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

/* A reprovação é decisão final — diferente da devolução, ela não convida a
   corrigir. O e-mail diz isso com clareza e traz o motivo: recusar sem dizer
   por quê deixaria o professor sem saber se tenta de novo noutro semestre. */
export function emailPropostaReprovada(acao, { baseUrl = "https://arche.app.br" } = {}) {
  const p = acao.proposta || {};
  const link = `${String(baseUrl).replace(/\/$/, "")}/extensao/`;
  return {
    para: String(p.respEmail || acao.criadoPor || "").trim(),
    assunto: `[ARCHÉ Extensão] Proposta não aprovada: ${p.nomeAtividade || "(sem título)"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Sua proposta não foi aprovada</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(p.respNome || "")}</b>!</p>
        <p>A PROPPEX analisou a proposta <b>${esc(p.nomeAtividade || "(sem título)")}</b>
          (${esc(acao.curso || "—")}) e decidiu <b>não aprová-la</b> neste ciclo.</p>
        <div style="background:#fdeeec;border-left:4px solid #a1524c;border-radius:8px;padding:12px 16px;margin:14px 0">
          <b>Motivo da decisão</b><br>${esc(String(acao.motivoReprovacao || "")).replace(/\n/g, "<br>")}
        </div>
        <p>O registro fica arquivado no portal, com a decisão e o motivo. Uma nova
          atividade pode ser proposta a qualquer momento, como <b>nova proposta</b> —
          esta não volta a ficar editável.</p>
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

/**
 * Confirmação da inscrição num evento gratuito (ARCHÉ Eventos): leva o link
 * da página "minha inscrição", com o QR e o código que se apresentam na
 * entrada. O e-mail é cortesia — a inscrição vale mesmo sem ele chegar
 * (quem envia captura a falha e segue).
 */
export function emailInscricaoEvento(acao, inscrito, { baseUrl = "https://arche.app.br", qrPng = null, wallet = false } = {}) {
  const p = acao.proposta || {};
  const ev = acao.evento || {};
  const link = `${String(baseUrl).replace(/\/$/, "")}/eventos/${encodeURIComponent(ev.slug || "")}/inscricao/${encodeURIComponent(inscrito.token || "")}`;
  const codigo = String(inscrito.token || "").slice(0, 6).toUpperCase();
  // as atividades que a pessoa marcou, com dia e hora — é a agenda dela, e o
  // e-mail é onde ela vai procurar na véspera
  const prog = ev.programacao || [];
  const marcadas = (inscrito.atividades || [])
    .map((id) => prog.find((x) => x?.id === id)).filter(Boolean);
  const horario = (x) => [
    x.dia ? dataBR(x.dia) : "",
    x.horaInicio ? `${x.horaInicio}${x.horaFim ? `–${x.horaFim}` : ""}` : "",
  ].filter(Boolean).join(", ");
  const blocoAtividades = marcadas.length ? `
        <p style="margin-bottom:4px"><b>Atividades que você marcou:</b></p>
        <ul style="margin-top:4px">${marcadas.map((x) =>
          `<li>${esc(x.titulo)}${horario(x) ? ` <span style="color:#657179">— ${esc(horario(x))}</span>` : ""}</li>`).join("")}
        </ul>` : "";
  /* MARCAÇÃO ESTRUTURADA para a CARTEIRA DIGITAL (pedido do dono, ago/2026).
     O passe que o Google Wallet mostra a partir de um e-mail de evento — o
     mesmo que o Sympla entrega — não vem de conta de emissor nenhuma: vem do
     Gmail LENDO o e-mail de confirmação, quando ele traz a reserva descrita
     em schema.org (EventReservation). É por isso que aquele cartão azul do
     Sympla tem "Ver e-mail" no rodapé.

     Então o nosso e-mail passa a trazer a mesma descrição: quem é, em que
     evento, quando, onde, e o `ticketToken` com o prefixo `qrCode:`, que é o
     que faz o passe nascer com o QR escaneável. O bloco é invisível para
     quem lê o e-mail (o cliente de e-mail não desenha <script>), e não
     substitui o botão "Adicionar ao Google Wallet" — este continua atrás da
     conta de emissor, para quando a instituição tiver uma. */
  const iso = (dia, hora) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia || ""))) return "";
    const h = /^\d{2}:\d{2}$/.test(String(hora || "")) ? hora : "08:00";
    return `${dia}T${h}:00-03:00`;                 // horário de Brasília
  };
  const primeira = prog.find((x) => x?.dia === p.periodoInicio) || prog[0] || {};
  const inicioISO = iso(p.periodoInicio, primeira.horaInicio);
  const fimISO = iso(p.periodoFim || p.periodoInicio,
    (prog.filter((x) => x?.dia === (p.periodoFim || p.periodoInicio)).slice(-1)[0] || {}).horaFim || "22:00");
  const reserva = inicioISO ? {
    "@context": "http://schema.org",
    "@type": "EventReservation",
    reservationNumber: codigo,
    reservationStatus: "http://schema.org/ReservationConfirmed",
    underName: { "@type": "Person", name: String(inscrito.nome || "") },
    reservationFor: {
      "@type": "Event",
      name: String(p.nomeAtividade || "Evento"),
      startDate: inicioISO,
      ...(fimISO ? { endDate: fimISO } : {}),
      location: {
        "@type": "Place",
        name: String(p.local || "UNIEGO"),
        address: {
          "@type": "PostalAddress",
          streetAddress: String(p.local || ""),
          addressLocality: String(p.municipio || "Goianésia"),
          addressRegion: "GO", addressCountry: "BR",
        },
      },
    },
    // é este campo que vira o QR do passe na carteira
    ticketToken: `qrCode:${String(inscrito.token || "")}`,
    url: link,
    modifiedTime: new Date().toISOString(),
  } : null;
  const blocoReserva = reserva
    ? `<script type="application/ld+json">${JSON.stringify(reserva).replace(/</g, "\\u003c")}</script>`
    : "";
  /* O botão da carteira digital, para quem prefere clicar: leva à rota do
     passe com `?ir=1`, que assina o JWT na hora e redireciona ao Google —
     por isso o link do e-mail nunca envelhece. Vai como pílula preta com
     texto (cliente de e-mail não desenha SVG, e imagem remota costuma
     chegar bloqueada). Só aparece onde a conta de emissor existe; sem ela,
     o passe ainda pode nascer da marcação acima, pelo próprio Gmail. */
  const blocoWallet = wallet ? `
        <p style="margin-top:6px"><a href="${esc(link)}/wallet?ir=1"
          style="display:inline-block;background:#000;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:100px;font-weight:600;font-size:14px">Adicionar ao Google Wallet</a></p>
        <p style="color:#5b7280;font-size:12px;margin-top:-6px">A credencial fica no celular, com o QR pronto.</p>` : "";

  /* O QR vai DENTRO do e-mail, como imagem embutida (decisão do dono,
     ago/2026): a credencial precisa estar onde a pessoa vai procurá-la no
     dia — a caixa de entrada —, e não só atrás de um link que exige rede na
     porta do evento. Sem a imagem (falha ao gerar), o e-mail sai igual, com
     o link e o código manual, que continuam valendo. */
  const blocoQr = qrPng ? `
        <div style="text-align:center;margin:18px 0">
          <img src="cid:qr-inscricao" alt="QR da sua inscrição" width="220" height="220"
            style="width:220px;height:220px;border:1px solid #dde4e8;border-radius:14px;padding:10px;background:#fff">
          <div style="font-family:monospace;font-size:13px;color:#657179;margin-top:6px">
            código manual: <b>${esc(codigo)}</b></div>
        </div>` : "";
  return {
    para: String(inscrito.email || "").trim(),
    assunto: `[UNIEGO] Inscrição confirmada: ${p.nomeAtividade || "evento"}`,
    ...(qrPng ? { anexos: [{ nome: "credencial-qr.png", tipo: "image/png", conteudo: qrPng, cid: "qr-inscricao" }] } : {}),
    corpoHtml: `${blocoReserva}
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Sua inscrição está confirmada</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(inscrito.nome || "")}</b>!</p>
        <p>Você está inscrito(a) em <b>${esc(p.nomeAtividade || "")}</b>
          (${esc(acao.curso || "—")}), de ${dataBR(p.periodoInicio)} a ${dataBR(p.periodoFim)},
          em ${esc(p.local || "—")}. O evento é gratuito.</p>
        ${blocoAtividades}
        ${blocoQr}
        <div style="background:#e6f5fa;border-left:4px solid #40717e;border-radius:8px;padding:12px 16px;margin:14px 0">
          <b>No dia, apresente na entrada o QR acima</b> — pode ser desta mensagem mesmo, da página da
          inscrição ou de uma foto da tela. Se preferir, informe ao monitor o código
          <b style="font-family:monospace;letter-spacing:.08em">${esc(codigo)}</b>.
        </div>
        <p><a href="${esc(link)}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Abrir minha inscrição</a></p>
        ${blocoWallet}
        <p style="color:#5b7280;font-size:12px">Se o botão não abrir, copie e cole: ${esc(link)}<br>
          Guarde este e-mail: o link é a sua credencial de acesso à inscrição.</p>
        <p style="color:#5b7280;font-size:11px;margin-top:14px">Seus dados pessoais são tratados pela
          UNIEGO/PROPPEX para a gestão, o credenciamento, a certificação e as comunicações deste
          evento, nos termos da Lei nº 13.709/2018 (LGPD). Dúvidas: eventos@uniego.edu.br.</p>
      </div>`,
  };
}

/**
 * Aviso ao setor de eventos (ARCHÉ EV) quando uma página de evento entra no
 * ar — o momento em que o evento passa a existir para o público. Vai para
 * eventos@uniego.edu.br (env EVENTOS_NOTIFY_EMAIL), fire-and-forget como os
 * demais avisos: e-mail que falha não desfaz a ativação.
 */
/* O CERTIFICADO ESTÁ PRONTO (pedido do dono, ago/2026). Quem participou de
   um evento não volta ao portal para conferir se saiu — ou o aviso chega,
   ou o documento fica lá esperando. Sai um por pessoa, assim que a PROPPEX
   valida o encerramento, com o link que serve a ELA: o participante sem
   conta baixa pela própria credencial (o mesmo link do QR, que ele já tem
   no e-mail da inscrição); quem tem conta no ARCHÉ vai à guia Certificados,
   onde estão também os da IC e da monitoria. */
export function emailCertificadoDisponivel({ acao, cert, base = "https://arche.app.br", link = "" }) {
  const p = acao.proposta || {};
  const guia = `${String(base).replace(/\/$/, "")}/certificados/`;
  const papel = cert.tipo === "palestrante" ? "como <b>palestrante</b>"
    : cert.tipo === "comissao" ? `na <b>comissão organizadora</b>${cert.papel ? ` (${esc(cert.papel)})` : ""}`
    : "como <b>participante</b>";
  return {
    para: cert.email,
    assunto: `Seu certificado está disponível — ${p.nomeAtividade || "evento do UNIEGO"}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:600px">
        <h2 style="color:#1c3742;margin-bottom:4px">Seu certificado está pronto 🎓</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá${cert.pessoa ? `, <b>${esc(cert.pessoa)}</b>` : ""}! O evento
          <b>${esc(p.nomeAtividade || "")}</b> foi encerrado e o seu certificado de participação
          ${papel} já pode ser baixado.</p>
        <p style="background:#eef3f5;border-radius:10px;padding:12px 16px;font-size:14px">
          <b>${esc(p.nomeAtividade || "")}</b><br>
          ${dataBR(p.periodoInicio)}${p.periodoFim && p.periodoFim !== p.periodoInicio ? ` a ${dataBR(p.periodoFim)}` : ""}
          ${cert.ch ? ` · ${esc(String(cert.ch))} horas` : ""}
          ${p.local ? `<br>${esc(p.local)}` : ""}</p>
        ${link ? `<p style="margin:22px 0">
          <a href="${esc(link)}" style="background:#1c3742;color:#fff;text-decoration:none;
            padding:12px 22px;border-radius:9px;font-weight:700;display:inline-block">
            Baixar o meu certificado</a></p>` : ""}
        <p style="font-size:13px;color:#5b7280">Você também encontra este e os seus demais
          certificados do UNIEGO — eventos, iniciação científica e monitoria — na guia
          <a href="${esc(guia)}" style="color:#40717e;font-weight:700">Meus certificados</a>
          do portal, entrando com este e-mail.</p>
        <p style="font-size:12.5px;color:#8a949c">O documento traz a programação do evento no
          verso e um código de validação. Guarde o arquivo: ele comprova as horas para
          atividades complementares.</p>
      </div>`,
  };
}

/* O EVENTO FOI ENCERRADO pela coordenação e espera a PROPPEX (decisão do
   dono, ago/2026). O aviso é o que faz o pedido não ficar esperando alguém
   entrar no portal por acaso — os certificados só existem depois da
   validação, e quem espera por eles é gente. */
export function emailEncerramentoEvento(acao) {
  const p = acao.proposta || {};
  const n = acao.evento?.encerramento?.numeros || {};
  return {
    para: process.env.EVENTOS_NOTIFY_EMAIL || "eventos@uniego.edu.br",
    assunto: `[ARCHÉ EV] Encerramento para validar: ${p.nomeAtividade || acao.numeroAcao || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Evento encerrado — aguardando validação</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ EV · PROPPEX / UNIEGO</p>
        <p>A coordenação encerrou <b>${esc(p.nomeAtividade || "(sem título)")}</b>
          (${esc(acao.curso || "—")}, ${esc(acao.numeroAcao || "sem número")}) e o encerramento
          espera a validação da PROPPEX. <b>Os certificados são emitidos assim que ela sair.</b></p>
        <p style="font-size:13px;color:#5b7280">Período: ${dataBR(p.periodoInicio)} a ${dataBR(p.periodoFim)}
          · Inscritos: ${Number(n.inscritos) || 0} · Presentes: ${Number(n.presentes) || 0}
          · Encerrado por: ${esc(acao.evento?.encerramento?.pedidoPor || "—")}</p>
        ${acao.evento?.encerramento?.observacao
          ? `<p style="font-size:13px;background:#f4f7f9;padding:10px 12px;border-radius:8px">
              <b>Observação da coordenação:</b><br>${esc(acao.evento.encerramento.observacao)}</p>` : ""}
        <p style="font-size:12.5px;color:#5b7280">Validar em
          <a href="https://arche.app.br/eventos/gestao/" style="color:#40717e">arche.app.br/eventos/gestao</a>.</p>
      </div>`,
  };
}

/** E a coordenação fica sabendo da decisão — validada ou devolvida. */
export function emailDecisaoEncerramento(acao, decisao, parecer = "") {
  const p = acao.proposta || {};
  const ok = decisao === "validado";
  const para = [p.respEmail, acao.criadoPor, acao.evento?.encerramento?.pedidoPor]
    .map((x) => String(x || "").trim()).filter(Boolean)[0]
    || process.env.EVENTOS_NOTIFY_EMAIL || "eventos@uniego.edu.br";
  return {
    para,
    assunto: ok
      ? `[ARCHÉ EV] Encerramento validado — certificados liberados: ${p.nomeAtividade || ""}`
      : `[ARCHÉ EV] Encerramento devolvido: ${p.nomeAtividade || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">${ok ? "Encerramento validado" : "Encerramento devolvido"}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ EV · PROPPEX / UNIEGO</p>
        <p>${ok
          ? `A PROPPEX validou o encerramento de <b>${esc(p.nomeAtividade || "")}</b>.
             <b>Os certificados já estão disponíveis</b> — participantes, palestrantes e comissão
             organizadora podem baixar o seu.`
          : `A PROPPEX devolveu o encerramento de <b>${esc(p.nomeAtividade || "")}</b> para ajustes.
             Corrija o que está apontado abaixo e encerre de novo.`}</p>
        ${parecer ? `<p style="font-size:13px;background:#f4f7f9;padding:10px 12px;border-radius:8px">
          ${esc(parecer)}</p>` : ""}
        <p style="font-size:12.5px;color:#5b7280">
          <a href="https://arche.app.br/eventos/gestao/" style="color:#40717e">arche.app.br/eventos/gestao</a></p>
      </div>`,
  };
}

export function emailEventoAtivado(acao) {
  const p = acao.proposta || {};
  const ev = acao.evento || {};
  const url = `https://arche.app.br/eventos/${encodeURIComponent(ev.slug || "")}`;
  return {
    para: process.env.EVENTOS_NOTIFY_EMAIL || "eventos@uniego.edu.br",
    assunto: `[ARCHÉ EV] Página de evento no ar: ${p.nomeAtividade || acao.numeroAcao || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Página de evento publicada</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ EV · PROPPEX / UNIEGO</p>
        <p><b>${esc(p.nomeAtividade || "(sem título)")}</b> (${esc(acao.curso || "—")},
          ${esc(acao.numeroAcao || "sem número")}) está com a página pública e as inscrições no ar:</p>
        <p><a href="${esc(url)}" style="color:#40717e;font-weight:700">${esc(url)}</a></p>
        <p style="font-size:13px;color:#5b7280">Responsável: ${esc(p.respNome || acao.criadoPorNome || "—")}
          · Período: ${dataBR(p.periodoInicio)} a ${dataBR(p.periodoFim)}</p>
        <p style="font-size:12.5px;color:#5b7280">A operação do evento (inscrições, credenciamento,
          transmissão e exportações) fica em
          <a href="https://arche.app.br/eventos/gestao/" style="color:#40717e">arche.app.br/eventos/gestao</a>.</p>
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
/* O relato do botão de feedback (a joaninha do canto da tela, ago/2026):
   problema ou sugestão, com quem mandou e de que página — vai à PROPPEX e
   fica guardado no sistema (sys-feedback-v1), então e-mail que falha não
   perde o relato. */
export function emailFeedback({ tipo, texto, pagina, nome, email: de }) {
  const rotulo = tipo === "sugestao" ? "💡 Sugestão de melhoria" : "🐞 Problema relatado";
  return {
    para: process.env.FEEDBACK_EMAIL || "jadsonbelem@gmail.com",
    assunto: `[ARCHÉ] ${rotulo}${nome ? ` — ${nome}` : ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">${rotulo}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · enviado pelo botão de feedback do portal</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${[["Quem", `${nome || "—"} <${de || "—"}>`], ["Página", pagina || "—"]].map(([k, v]) => `<tr>
            <td style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;font-weight:700;white-space:nowrap">${esc(k)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(v)}</td></tr>`).join("")}
        </table>
        <div style="margin-top:14px;padding:14px 16px;border:1px solid #dde4e8;border-radius:10px;background:#fbfcfd;white-space:pre-wrap;font-size:14px">${esc(texto)}</div>
      </div>`,
  };
}

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

/* ------------------------ ARCHÉ ES — reserva de espaços ------------------
   O fluxo do módulo é o que o dono descreveu: toda solicitação cai na caixa
   da RESPONSÁVEL pela reserva (ESPACOS_NOTIFY_EMAIL), com cópia ao setor de
   eventos; ela confirma ou encaminha à PROPPEX; e quem pediu é avisado da
   decisão. Uma função só, porque é um documento só visto de dois lados — e
   assim o texto do espaço, da data e do horário não se escreve em quatro
   lugares diferentes.

   Devolve uma LISTA de mensagens: o mesmo momento pode falar com duas
   caixas (a solicitação avisa a responsável e dá o recibo a quem pediu). */
export function emailReservaEspaco(reserva, espacos = [], momento = "nova") {
  const r = reserva || {};
  const RESPONSAVEL = process.env.ESPACOS_NOTIFY_EMAIL || "raiane.naves@uniego.edu.br";
  const EVENTOS = process.env.EVENTOS_NOTIFY_EMAIL || "eventos@uniego.edu.br";
  const PROPPEX = process.env.ESPACOS_PROPPEX_EMAIL || "jadson.moura@uniego.edu.br";
  const painel = "https://arche.app.br/espacos/";

  const nomeEspaco = (i) => {
    const e = espacos.find((x) => x.id === i.espaco);
    const base = e ? e.nome : i.espaco;
    return [base, i.detalhe, i.quantidade > 1 ? `${i.quantidade} salas` : ""]
      .filter(Boolean).join(" — ");
  };
  const locais = (r.itens || []).map(nomeEspaco);
  // reserva sem horário ocupa o dia inteiro — "00:00" faria pensar em madrugada
  const hora = r.horaInicio === "00:00" && r.horaFim === "23:59"
    ? "o dia todo" : `das ${esc(r.horaInicio)} às ${esc(r.horaFim)}`;
  const quando = r.dataInicio === r.dataFim
    ? `${dataBR(r.dataInicio)}, ${hora}`
    : `de ${dataBR(r.dataInicio)} a ${dataBR(r.dataFim)}, ${hora}`;
  const quadro = `
    <table style="border-collapse:collapse;margin:10px 0;font-size:14px">
      ${[["Protocolo", r.protocolo || "—"], ["Espaço(s)", locais.join(" · ") || "—"],
         ["Quando", quando], ["Atividade", r.atividade || "—"], ["Órgão", r.orgao || "—"],
         ["Solicitante", `${r.solicitante?.nome || ""} — ${r.solicitante?.email || ""}${r.solicitante?.telefone ? ` · ${r.solicitante.telefone}` : ""}`],
         ...(r.participantes ? [["Público previsto", `${r.participantes} pessoas`]] : []),
        ].map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b7280">${esc(k)}</td>
          <td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}
    </table>`;
  // o ofício que instrui o pedido: quem decide precisa abri-lo sem entrar no
  // sistema, e quem pediu precisa ver que ele chegou
  const blocoOficio = r.oficio?.link
    ? `<p style="margin:2px 0 10px"><b>Ofício anexado:</b>
        <a href="${esc(r.oficio.link)}" style="color:#40717e;font-weight:600">${esc(r.oficio.nome || "documento")}</a></p>`
    : "";
  const capa = (titulo) => `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
    <h2 style="color:#1c3742;margin-bottom:4px">${titulo}</h2>
    <p style="color:#5b7280;margin-top:0">ARCHÉ ES · Reserva de Espaços · PROPPEX / UNIEGO</p>`;
  const botao = (rot) => `<p><a href="${painel}" style="display:inline-block;background:#1c3742;
    color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${rot}</a></p>`;
  const motivo = r.decisao?.motivo
    ? `<div style="background:#fff7ed;border-left:4px solid #c98a2b;border-radius:8px;padding:10px 14px;margin:12px 0">
        <b>Observação da gestão:</b> ${esc(r.decisao.motivo)}</div>` : "";
  const paraQuemPediu = String(r.solicitante?.email || "").trim();

  if (momento === "nova") {
    return [
      { para: [RESPONSAVEL, EVENTOS],
        assunto: `[ARCHÉ ES] Nova solicitação de espaço: ${r.atividade || r.protocolo || ""}`,
        corpoHtml: `${capa("Nova solicitação de reserva")}
          <p>Uma nova solicitação de espaço entrou no ARCHÉ e aguarda a sua conferência.</p>
          ${quadro}${blocoOficio}
          ${r.justificativa ? `<p><b>Justificativa:</b> ${esc(r.justificativa)}</p>` : ""}
          ${r.recursos ? `<p><b>Recursos pedidos:</b> ${esc(r.recursos)}</p>` : ""}
          ${botao("Abrir a reserva de espaços")}
          <p style="color:#5b7280;font-size:12px">Você pode confirmar a reserva ou encaminhá-la à
            PROPPEX, quando o caso fugir do que está pré-autorizado.</p></div>` },
      paraQuemPediu ? { para: paraQuemPediu,
        assunto: `[ARCHÉ ES] Solicitação registrada: ${r.protocolo || ""}`,
        corpoHtml: `${capa("Sua solicitação foi registrada")}
          <p>Olá, <b>${esc(r.solicitante?.nome || "")}</b>! O pedido abaixo está com a
            responsável pela reserva. Você será avisado(a) quando houver decisão.</p>
          ${quadro}${botao("Acompanhar minha solicitação")}</div>` } : null,
    ].filter(Boolean);
  }

  if (momento === "encaminhar") {
    return [
      { para: PROPPEX,
        assunto: `[ARCHÉ ES] Reserva encaminhada à PROPPEX: ${r.protocolo || ""}`,
        corpoHtml: `${capa("Reserva encaminhada para decisão da PROPPEX")}
          <p>A responsável pela reserva encaminhou esta solicitação à pró-reitoria.</p>
          ${quadro}${blocoOficio}${motivo}
          ${r.justificativa ? `<p><b>Justificativa:</b> ${esc(r.justificativa)}</p>` : ""}
          ${botao("Decidir no ARCHÉ ES")}</div>` },
      paraQuemPediu ? { para: paraQuemPediu,
        assunto: `[ARCHÉ ES] Sua solicitação foi encaminhada à PROPPEX: ${r.protocolo || ""}`,
        corpoHtml: `${capa("Solicitação encaminhada à PROPPEX")}
          <p>Olá, <b>${esc(r.solicitante?.nome || "")}</b>! A responsável pela reserva encaminhou
            o seu pedido à pró-reitoria, que dará a palavra final.</p>
          ${quadro}${motivo}${botao("Acompanhar minha solicitação")}</div>` } : null,
    ].filter(Boolean);
  }

  if (!paraQuemPediu) return [];
  const titulos = {
    confirmar: ["Reserva confirmada", "A sua reserva está <b>confirmada</b>. O espaço fica bloqueado para você no horário abaixo."],
    recusar: ["Reserva recusada", "A sua solicitação <b>não pôde ser atendida</b>."],
    cancelar: ["Reserva cancelada", "Esta reserva foi <b>cancelada</b> e o espaço voltou a ficar livre na agenda."],
  };
  const [titulo, frase] = titulos[momento] || titulos.confirmar;
  return [{ para: paraQuemPediu,
    assunto: `[ARCHÉ ES] ${titulo}: ${r.protocolo || ""}`,
    corpoHtml: `${capa(titulo)}
      <p>Olá, <b>${esc(r.solicitante?.nome || "")}</b>! ${frase}</p>
      ${quadro}${motivo}${botao("Ver na agenda")}
      <p style="color:#5b7280;font-size:12px">Dúvidas sobre a reserva: ${esc(RESPONSAVEL)}.</p></div>` }];
}

/* ========================================================================
   ARCHÉ MO — Monitoria Acadêmica.

   Três avisos, e cada um existe porque o processo trava sem ele: o monitor
   indicado não sabe que foi indicado; a PROPPEX não sabe que há projeto na
   fila; e o orientador não sabe que o relatório do monitor chegou.
   ======================================================================== */
const PORTAL_MON = "https://arche.app.br/monitoria/";

/**
 * Convite ao acadêmico indicado como monitor. É o que abre o processo para
 * ele: entrar com ESTE e-mail (é o que liga a conta ao projeto), preencher
 * a ficha de inscrição e anexar os documentos do item 3.2 do edital.
 */
export function emailConviteMonitor(projeto, monitor, { baseUrl = "https://arche.app.br", mensagem = "" } = {}) {
  const entrada = `${baseUrl}/entrar/?next=${encodeURIComponent("/monitoria/")}`;
  return {
    para: String(monitor?.email || "").trim(),
    assunto: `[ARCHÉ MO] Você foi indicado(a) para a monitoria de ${projeto?.disciplina || ""}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Monitoria Acadêmica — indicação</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(monitor?.nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p><b>${esc(projeto?.orientador?.nome || "O(A) professor(a) orientador(a)")}</b> indicou você
          como monitor(a) da disciplina <b>${esc(projeto?.disciplina || "")}</b>, no Programa de
          Monitoria Acadêmica (Edital ${esc(projeto?.edital || "")}).</p>
        <p>Para a indicação valer, <b>você precisa preencher a sua ficha de inscrição</b> no portal:</p>
        <ol>
          <li>Entre em <a href="${entrada}" style="color:#40717e;font-weight:700">arche.app.br/monitoria</a>
            usando <b>este mesmo e-mail</b> (${esc(monitor?.email || "")}) — é ele que liga a conta ao projeto;</li>
          <li>Informe matrícula, CPF, curso, período e telefone;</li>
          <li>Anexe o <b>comprovante de matrícula</b> e o <b>histórico escolar</b>;</li>
          <li>Firme a <b>declaração de disponibilidade</b> da carga horária semanal
            (${esc(String(projeto?.chSemanal || ""))}h).</li>
        </ol>
        <p>Depois disso o projeto segue para análise da PROPPEX — e é a aprovação dela que
          dá início às atividades.</p>
        <p><a href="${entrada}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Preencher minha inscrição</a></p>
        <p style="color:#5b7280;font-size:12px">Dúvidas: responda a este e-mail ou procure a coordenação do seu curso.</p>
      </div>`,
  };
}

/** Aviso de movimentação para a caixa do programa (e para quem for o caso). */
export function emailMovimentacaoMonitoria({ para = "", assunto, titulo, linhas = [], url = PORTAL_MON }) {
  return {
    para: para || process.env.MONITORIA_NOTIFY_EMAIL || "monitoria@uniego.edu.br",
    assunto: `[ARCHÉ MO] ${assunto}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">${esc(titulo || assunto)}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · Monitoria Acadêmica · PROPPEX / UNIEGO</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${linhas.map(([k, v]) => `<tr>
            <td style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;font-weight:700;white-space:nowrap">${esc(k)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(v) || "—"}</td></tr>`).join("")}
        </table>
        <p style="margin-top:16px"><a href="${url}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir o ARCHÉ MO</a></p>
      </div>`,
  };
}

/** Lembrete de pendência da monitoria — um por pessoa, com todos os itens dela. */
export function emailCobrancaMonitoria({ para, nome, papel, itens = [], mensagem = "" }) {
  const acao = { monitor: "enviar o relatório", orientador: "validar o relatório do seu monitor",
    aluno: "preencher a ficha de inscrição" }[papel] || "resolver a pendência";
  return {
    para,
    assunto: `[ARCHÉ MO] Lembrete: ${acao}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Monitoria Acadêmica — pendência</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROPPEX / UNIEGO</p>
        <p>Olá, <b>${esc(nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p>Consta em seu nome, no portal, ${itens.length > 1 ? "as seguintes pendências" : "a seguinte pendência"}:</p>
        <ul>${itens.map((i) => `<li><b>${esc(i.disciplina || "")}</b>${i.protocolo ? ` (${esc(i.protocolo)})` : ""} —
          ${esc(i.texto || "")}${i.atraso > 0 ? ` <span style="color:#a1524c">· ${i.atraso} dia(s) de atraso</span>` : ""}</li>`).join("")}</ul>
        <p><a href="${PORTAL_MON}" style="display:inline-block;background:#1c3742;color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:10px;font-weight:600">Abrir o ARCHÉ MO</a></p>
      </div>`,
  };
}

/* ========================================================================
   ARCHÉ AP — Aulas Práticas (da PROAC).

   Dois avisos, e cada um vai a uma ponta: a MOVIMENTAÇÃO (o relatório
   chegou à coordenação, foi validado ou devolvido) e a COBRANÇA DE
   SEGUNDA-FEIRA, que é a razão de o módulo existir para quem coordena — o
   professor registra a aula na semana em que ela aconteceu, ou não registra
   mais.
   ======================================================================== */
const PORTAL_AP = "https://arche.app.br/praticas/";

export function emailMovimentacaoPratica({ para = "", assunto, titulo, linhas = [], url = PORTAL_AP }) {
  return {
    para,
    assunto: `[ARCHÉ AP] ${assunto}`,
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">${esc(titulo || assunto)}</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · Aulas Práticas · PROAC / UNIEGO</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${linhas.map(([k, v]) => `<tr>
            <td style="padding:6px 10px;border:1px solid #dde4e8;background:#e6f5fa;font-weight:700;white-space:nowrap">${esc(k)}</td>
            <td style="padding:6px 10px;border:1px solid #dde4e8">${esc(v) || "—"}</td></tr>`).join("")}
        </table>
        <p style="margin-top:16px"><a href="${url}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir o ARCHÉ AP</a></p>
      </div>`,
  };
}

/**
 * O lembrete de segunda-feira. O sistema NÃO conhece o horário das aulas —
 * conhece as disciplinas de cada professor —, então ele não afirma que houve
 * aula: pergunta pelos relatórios da semana que passou e diz quantos vieram
 * dela. Afirmar uma aula que não houve faria o lembrete perder a autoridade
 * na primeira semana de prova.
 */
export function emailLembretePratica({ para, nome, disciplinas = [], periodo = {}, enviados = 0,
  rascunhos = 0, mensagem = "" }) {
  const dia = (iso) => {
    const [a, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}` : "";
  };
  return {
    para,
    assunto: "[ARCHÉ AP] Relatórios das aulas práticas da semana passada",
    corpoHtml: `
      <div style="font-family:Segoe UI,Roboto,sans-serif;max-width:640px">
        <h2 style="color:#1c3742;margin-bottom:4px">Aulas práticas — registro semanal</h2>
        <p style="color:#5b7280;margin-top:0">ARCHÉ · PROAC / UNIEGO</p>
        <p>Olá, <b>${esc(nome || "")}</b>!</p>
        ${blocoMensagem(mensagem)}
        <p>Se você deu aula prática entre <b>${dia(periodo.de)}</b> e <b>${dia(periodo.ate)}</b>,
        registre-a no ARCHÉ. O relatório leva o objetivo, o local, as atividades e
        <b>três fotos</b> da prática.</p>
        ${enviados
          ? `<p style="color:#3d7a55">Você já enviou <b>${enviados}</b> relatório(s) dessa semana.</p>`
          : '<p style="color:#8a6d3b">Nenhum relatório dessa semana foi enviado ainda.</p>'}
        ${rascunhos
          ? `<p style="color:#8a6d3b">Há <b>${rascunhos}</b> relatório(s) <b>em rascunho</b> na sua
             conta — preenchidos e ainda não enviados à coordenação.</p>` : ""}
        ${disciplinas.length
          ? `<p style="font-size:13px;color:#5b7280">Suas disciplinas neste semestre:
             ${esc(disciplinas.join(" · "))}</p>` : ""}
        <p style="margin-top:16px"><a href="${PORTAL_AP}" style="background:#1c3742;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Registrar a aula prática</a></p>
        <p style="font-size:12px;color:#8b96a0">Se não houve aula prática na semana, ignore este lembrete.</p>
      </div>`,
  };
}
