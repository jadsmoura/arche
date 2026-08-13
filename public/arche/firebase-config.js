/* ========================================================================
   CONFIGURAÇÃO DE PERSISTÊNCIA — Backend Manus (Google Drive)
   ========================================================================
   Este arquivo substitui o Firebase original. O window.storage agora
   aponta para a API do backend Node.js que persiste dados no servidor
   e envia arquivos diretamente ao Google Drive.
   ======================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "DESATIVADO",
  authDomain: "DESATIVADO",
  projectId: "DESATIVADO",
  storageBucket: "DESATIVADO",
  messagingSenderId: "DESATIVADO",
  appId: "DESATIVADO"
};

// Implementação do window.storage via API backend
window.storage = {
  get: async function(chave) {
    const resp = await fetch("/api/estado?chave=" + encodeURIComponent(chave));
    if (!resp.ok) throw new Error("nf");
    const data = await resp.json();
    return { key: chave, value: data.value };
  },
  set: async function(chave, valor) {
    const resp = await fetch("/api/estado", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: chave, valor: valor })
    });
    if (!resp.ok) throw new Error("Erro ao salvar");
    return { key: chave, value: valor };
  },
  delete: async function(chave) {
    const resp = await fetch("/api/estado?chave=" + encodeURIComponent(chave), {
      method: "DELETE"
    });
    return { key: chave, deleted: true };
  },
  list: async function(prefixo) {
    const resp = await fetch("/api/estado/list?prefixo=" + encodeURIComponent(prefixo || ""));
    if (!resp.ok) return { keys: [] };
    const data = await resp.json();
    return { keys: data.keys || [] };
  }
};
