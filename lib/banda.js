/* ========================================================================
   Diagnóstico de BANDA — para onde vão os bytes.

   O Render cobra por tráfego de SAÍDA, e a franquia acabou sem que ninguém
   soubesse o que a tinha consumido. "Banda" não é espaço em disco nem
   upload de documento: é tudo que sai do servidor — cada página, cada PDF,
   cada resposta de API — e também o que o servidor MANDA para fora, que é
   a parte invisível e a mais provável culpada aqui: em produção o estado
   vive num arquivo único no Google Drive, e **cada gravação reescreve o
   arquivo inteiro**.

   Este módulo conta os bytes e os agrupa por ORIGEM, para a conversa deixar
   de ser palpite. Duas decisões o governam:

   1. **O contador não pode ser parte do problema.** Ele mora na memória e
      se persiste no DISCO LOCAL (data/banda.json) — nunca no estado. Gravar
      a medição no Drive somaria uma reescrita do arquivo inteiro a cada
      flush, e o diagnóstico passaria a produzir aquilo que mede.
   2. **Agrupar é o que responde a pergunta.** Byte a byte não se decide
      nada; saber que 70% saiu do app compilado da Avaliação (que um CDN
      cachearia) ou do estado indo ao Drive (que um CDN não resolve) decide
      tudo — são remédios diferentes.

   O disco do Render é efêmero: o histórico se perde a cada deploy. Para um
   diagnóstico de uma semana é o bastante, e é o preço de não poluir a
   medição.
   ======================================================================== */

/** Os grupos, na ordem em que fazem sentido para quem lê o diagnóstico. */
export const GRUPOS = [
  { chave: "avaliacao", rotulo: "App da Avaliação (/arche)",
    dica: "Aplicação compilada, arquivos grandes e imutáveis — é o caso clássico de CDN." },
  { chave: "assets", rotulo: "Estáticos do portal (CSS, JS, logos)",
    dica: "Cacheável por CDN e por cabeçalho de cache." },
  { chave: "paginas", rotulo: "Páginas dos setores (HTML)",
    dica: "As SPAs. Mudam a cada deploy; cacheáveis com validação." },
  { chave: "pdf", rotulo: "PDFs gerados sob demanda",
    dica: "Certificados, atas, editais, relatórios. Não se cacheia — mas se pode gerar menos." },
  { chave: "imagem", rotulo: "Imagens servidas por rota (capas, fotos)",
    dica: "Capa de evento, foto de palestrante, logo de apoiador." },
  { chave: "api", rotulo: "Respostas de API (JSON)",
    dica: "O que a tela busca. Cresce com o tamanho das listas devolvidas." },
  { chave: "publico", rotulo: "Páginas públicas (vitrines, hotsites)",
    dica: "Visitante sem login: vitrine da IC, páginas de evento." },
  { chave: "outros", rotulo: "Demais respostas", dica: "O que não se encaixou acima." },
  { chave: "drive-estado", rotulo: "→ Estado gravado no Google Drive", externo: true,
    dica: "O ARQUIVO INTEIRO sobe a cada gravação. É o gasto que nenhum CDN resolve." },
  { chave: "drive-upload", rotulo: "→ Arquivos enviados ao Drive", externo: true,
    dica: "Anexos, portfólio, ofícios, históricos. Sai uma vez por arquivo." },
  { chave: "email", rotulo: "→ E-mails enviados", externo: true,
    dica: "Corpo e anexos das mensagens (Gmail API)." },
];

export const grupoDe = (chave) => GRUPOS.find((g) => g.chave === chave) || null;
const EXTERNOS = GRUPOS.filter((g) => g.externo).map((g) => g.chave);

/**
 * A que grupo pertence uma resposta. O TIPO tem precedência sobre o
 * caminho: um PDF é um PDF venha ele de onde vier, e é o que se quer
 * enxergar separado.
 */
export function classificar(caminho = "", tipo = "") {
  const p = String(caminho || "");
  const t = String(tipo || "");
  if (/^application\/pdf/.test(t)) return "pdf";
  if (/^image\//.test(t)) return "imagem";
  if (p.startsWith("/arche")) return "avaliacao";
  if (p.startsWith("/assets/") || /\.(css|js|woff2?|svg|ico|png|jpe?g|webp)$/i.test(p)) return "assets";
  if (p.startsWith("/api/")) return "api";
  if (p === "/" || p.startsWith("/ic") || p.startsWith("/eventos")) return "publico";
  if (/^\/(extensao|pesquisa|atas|espacos|monitoria|relatorios|usuarios|perfil|entrar|prototipos)/.test(p))
    return "paginas";
  return "outros";
}

/* ======================================================================
   O ACUMULADOR

   Um objeto simples: por DIA, por GRUPO, bytes e número de respostas. Fica
   na memória do processo e se despeja no disco local de tempo em tempo.
   ====================================================================== */

export function novoRegistro(agora = new Date().toISOString()) {
  return { desde: agora, dias: {} };
}

const soData = (v) => String(v || "").slice(0, 10);

/** Soma bytes num grupo. Devolve o próprio registro, para encadear. */
export function somar(registro, grupo, bytes, { quando = new Date().toISOString(), n = 1 } = {}) {
  if (!registro || !grupo) return registro;
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return registro;
  const dia = soData(quando);
  const d = (registro.dias[dia] = registro.dias[dia] || {});
  const g = (d[grupo] = d[grupo] || { bytes: 0, n: 0 });
  g.bytes += b;
  g.n += n;
  return registro;
}

/** Descarta o que passou da janela — o diagnóstico é de semanas, não de anos. */
export function podar(registro, { dias = 45, hoje = new Date().toISOString() } = {}) {
  const corte = new Date(new Date(soData(hoje)).getTime() - dias * 86400000)
    .toISOString().slice(0, 10);
  for (const dia of Object.keys(registro?.dias || {})) {
    if (dia < corte) delete registro.dias[dia];
  }
  return registro;
}

const MB = 1024 * 1024;
export const emMB = (b) => Math.round((Number(b) || 0) / MB * 100) / 100;

/**
 * O que a tela mostra: total, por grupo (ordenado pelo que mais pesa),
 * por dia, e a PROJEÇÃO mensal — que é o número que decide se o plano
 * atual serve. A projeção usa a média dos dias COMPLETOS medidos; com
 * menos de um dia inteiro ela sai marcada como preliminar, porque um pico
 * de uma hora extrapolado para 30 dias é chute com cara de dado.
 */
export function resumir(registro, { hoje = new Date().toISOString() } = {}) {
  const dias = Object.keys(registro?.dias || {}).sort();
  const porGrupo = new Map();
  let total = 0;
  for (const dia of dias) {
    for (const [g, v] of Object.entries(registro.dias[dia])) {
      const at = porGrupo.get(g) || { grupo: g, bytes: 0, n: 0 };
      at.bytes += v.bytes; at.n += v.n;
      porGrupo.set(g, at);
      total += v.bytes;
    }
  }
  const lista = [...porGrupo.values()]
    .map((x) => {
      const meta = grupoDe(x.grupo) || { rotulo: x.grupo, dica: "" };
      return { ...x, rotulo: meta.rotulo, dica: meta.dica, externo: !!meta.externo,
        mb: emMB(x.bytes), fatia: total ? Math.round((x.bytes / total) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const completos = dias.filter((d) => d < soData(hoje));
  const mediaDia = completos.length
    ? completos.reduce((s, d) => s + Object.values(registro.dias[d]).reduce((t, v) => t + v.bytes, 0), 0) / completos.length
    : total;   // sem um dia inteiro medido, o próprio total é a melhor conta que há

  return {
    desde: registro?.desde || "",
    dias: dias.map((d) => ({
      dia: d,
      bytes: Object.values(registro.dias[d]).reduce((s, v) => s + v.bytes, 0),
      mb: emMB(Object.values(registro.dias[d]).reduce((s, v) => s + v.bytes, 0)),
    })),
    diasCompletos: completos.length,
    preliminar: completos.length < 1,
    total, totalMB: emMB(total),
    porGrupo: lista,
    externoMB: emMB(lista.filter((x) => x.externo).reduce((s, x) => s + x.bytes, 0)),
    servidoMB: emMB(lista.filter((x) => !x.externo).reduce((s, x) => s + x.bytes, 0)),
    projecaoMensalMB: emMB(mediaDia * 30),
  };
}

/**
 * O que fazer com o que foi medido. Não é conselho genérico: cada linha só
 * aparece quando o número a justifica, e diz quanto ela poderia poupar.
 */
export function recomendacoes(resumo, { franquiaGB = 5 } = {}) {
  const out = [];
  const g = (chave) => resumo.porGrupo.find((x) => x.grupo === chave) || { mb: 0, fatia: 0, n: 0 };
  const estado = g("drive-estado");
  const cacheavel = ["avaliacao", "assets", "paginas"].reduce((s, k) => s + g(k).mb, 0);
  const fatiaCacheavel = resumo.totalMB ? Math.round(cacheavel / resumo.totalMB * 1000) / 10 : 0;

  if (estado.mb > 0 && estado.fatia >= 15) {
    out.push({
      peso: "alto",
      titulo: `O estado no Drive responde por ${estado.fatia}% da saída (${estado.mb} MB em ${estado.n} gravações)`,
      texto: "Cada gravação reescreve o _estado.json INTEIRO. Nenhum CDN resolve isto — o "
        + "caminho é gravar só o que mudou (uma chave por arquivo, ou um banco), o que também "
        + "elimina o risco de duas instâncias sobrescreverem o estado uma da outra.",
    });
  }
  if (fatiaCacheavel >= 25) {
    out.push({
      peso: "alto",
      titulo: `${fatiaCacheavel}% da saída é conteúdo cacheável (${cacheavel} MB)`,
      texto: "App da Avaliação, estáticos e páginas. Um CDN na frente (Cloudflare, plano "
        + "gratuito) entrega isso sem acordar o servidor, e o tráfego deixa de contar na franquia.",
    });
  }
  if (g("pdf").mb > 0 && g("pdf").fatia >= 10) {
    out.push({
      peso: "médio",
      titulo: `PDFs somam ${g("pdf").mb} MB (${g("pdf").n} documentos)`,
      texto: "Documento gerado a cada abertura. Guardar o PDF do que não muda mais — certificado "
        + "emitido, ata registrada — evita regerar e reenviar o mesmo arquivo.",
    });
  }
  if (g("imagem").mb > 0 && g("imagem").fatia >= 10) {
    out.push({
      peso: "médio",
      titulo: `Imagens por rota somam ${g("imagem").mb} MB`,
      texto: "Capas de evento e fotos são servidas pelo servidor a cada visita. São o conteúdo "
        + "mais fácil de cachear, e o que mais pesa por requisição.",
    });
  }
  if (resumo.projecaoMensalMB > franquiaGB * 1024) {
    out.unshift({
      peso: "alto",
      titulo: `Projeção de ${Math.round(resumo.projecaoMensalMB / 1024 * 10) / 10} GB/mês, `
        + `acima da franquia de ${franquiaGB} GB`,
      texto: "Sem mudança, a franquia se esgota antes do fim do mês.",
    });
  }
  if (!out.length) {
    out.push({ peso: "baixo", titulo: "Nada fora do lugar até aqui",
      texto: "O consumo medido não concentra em nenhuma origem que peça mudança." });
  }
  return out;
}

export { EXTERNOS };
