/* Botão "Adicionar ao Google Wallet" da credencial do evento.
 *
 * É um LINK simples, de propósito: aponta para a rota do passe com `?ir=1`,
 * que monta o JWT na hora e redireciona ao pay.google.com. Sem JavaScript
 * no meio, o mesmo endereço serve à página da inscrição, ao hotsite e ao
 * e-mail de confirmação — e um passe nunca chega envelhecido.
 *
 * O botão segue a forma que o Google especifica (pílula preta, a marca à
 * esquerda, o texto no idioma da página). O desenho da marca é vetorial e
 * mora aqui; se um dia a instituição preferir o arquivo oficial do console
 * do Google, basta trocar o <svg> por um <img>.
 *
 * O botão só existe onde a conta de emissor estiver configurada — quem
 * decide é o servidor (`walletGoogle` no payload da página). Sem ela, a
 * pessoa continua com o QR em PNG, que vale igual na entrada.
 */
(function () {
  const MARCA = `<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true" focusable="false" style="flex:0 0 auto">
    <rect x="6" y="7" width="36" height="11" rx="5.5" fill="#4285F4"/>
    <rect x="9" y="14" width="30" height="11" rx="5.5" fill="#EA4335"/>
    <rect x="12" y="21" width="24" height="11" rx="5.5" fill="#FBBC04"/>
    <path d="M6 29h36v7a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5v-7z" fill="#34A853"/>
  </svg>`;

  window.botaoGoogleWallet = function (slug, token, estilo = "") {
    const href = `/api/publico/eventos/${encodeURIComponent(slug)}/inscricao/${encodeURIComponent(token)}/wallet?ir=1`;
    return `<a href="${href}" class="bt-wallet" style="${estilo}"
      aria-label="Adicionar a inscrição ao Google Wallet">${MARCA}<span>Adicionar ao Google&nbsp;Wallet</span></a>`;
  };

  const css = `.bt-wallet{display:inline-flex;align-items:center;justify-content:center;gap:10px;
    background:#000;color:#fff;border:0;border-radius:100px;padding:11px 20px;text-decoration:none;
    font-weight:600;font-size:14px;line-height:1;letter-spacing:.1px;cursor:pointer}
  .bt-wallet:hover{background:#1f1f1f}
  .bt-wallet:focus-visible{outline:2px solid #71c8e2;outline-offset:2px}
  .bt-wallet span{white-space:nowrap}`;
  const tag = document.createElement("style");
  tag.textContent = css;
  document.head.appendChild(tag);
})();
