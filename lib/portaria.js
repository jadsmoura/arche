/* ========================================================================
   Portaria do ARCHÉ AV — Avaliação Institucional.

   Até set/2026 a porta abria com uma SENHA COMPARTILHADA ("uniego"), e o app
   compilado ainda tinha uma segunda ("docente") e um login simulado em que o
   professor escolhia o próprio nome numa lista. Ninguém sabia quem entrou.
   A pedido do dono, a Avaliação passou a exigir a CONTA DO PORTAL (a régua
   de quem vê e grava o quê está em lib/avaliacao.js). O que sobrou aqui é o
   que nunca foi login e continua não sendo:

     - o LINK DE ACESSO (`?acesso=…`), que se manda ao avaliador do MEC — ele
       não tem conta nem vai criar uma; e
     - o atalho `arche.app.br/avaliador`, que emite o mesmo selo.

   O selo é de VISUALIZAÇÃO: abre as páginas e as leituras, e nenhuma escrita
   passa (o servidor recusa). Não carrega e-mail nem papel, e não abre nenhum
   setor da gestão. A chave do link é derivada do segredo da sessão com um
   rótulo versionado: trocar `AV_LINK_VERSAO` invalida todos os links
   distribuídos de uma vez, sem mexer no código nem derrubar sessão alguma.
   ======================================================================== */
import { selar, conferirSelo, derivado, decodificarCookie } from "./auth.js";

const COOKIE = "arche_av";
const DIAS = 30;

/** A chave do link de acesso direto — estável enquanto a versão não mudar. */
export const chaveAcesso = () =>
  derivado(`av-link-v${process.env.AV_LINK_VERSAO || "1"}`);

export const linkAcesso = (base) =>
  `${String(base || "").replace(/\/$/, "")}/arche/?acesso=${chaveAcesso()}`;

/* A área que a portaria protege. O favicon fica FORA: ele é o ícone do portal
   inteiro (a página inicial, o /entrar e a própria portaria o carregam), não
   conteúdo do módulo — e um ícone não revela nada. */
export const AREA_AV = /^\/arche(?!\/favicon\.svg$)(\/|$)/;

export function lerSelo(req) {
  const raw = String(req.headers.cookie || "").split(/;\s*/)
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const selo = conferirSelo(decodificarCookie(raw.slice(COOKIE.length + 1)));
  return selo?.av ? selo : null;
}

export function emitirSelo(res, via = "link") {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const token = selar({ av: true, via }, DIAS);
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DIAS * 24 * 60 * 60}${seguro}`);
}

/**
 * Para onde voltar depois de entrar. Só endereços de dentro do próprio
 * módulo — um `next` livre viraria redirecionamento aberto.
 */
export function destinoSeguro(v) {
  const alvo = String(v || "");
  return /^\/arche(\/|$|\?)/.test(alvo) ? alvo : "/arche/";
}
