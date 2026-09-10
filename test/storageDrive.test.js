/* A corrida do deploy no backend do Drive (lib/storage.js): duas instâncias
   sobem sobre o MESMO arquivo, cada uma grava, e nada do que uma gravou pode
   sumir na escrita da outra. O Drive é falso e conta versões como o real. */
import test from "node:test";
import assert from "node:assert/strict";
import { initDriveStore } from "../lib/storage.js";

/** Um Drive com UM arquivo versionado. `falhas` faz o próximo upload falhar. */
function driveFalso(conteudoInicial) {
  const f = { id: "f1", version: 1, body: JSON.stringify(conteudoInicial), uploads: 0, falhas: 0 };
  const ler = async (media) => { let s = ""; for await (const c of media.body) s += c; return s; };
  const drive = { files: {
    list: async () => ({ data: { files: [{ id: f.id }] } }),
    get: async ({ fileId, alt, fields }) => {
      assert.equal(fileId, f.id);
      if (alt === "media") return { data: f.body };
      if (fields === "version") return { data: { version: String(f.version) } };
      return { data: {} };
    },
    update: async ({ fileId, media }) => {
      assert.equal(fileId, f.id);
      const s = await ler(media);
      if (f.falhas > 0) { f.falhas--; throw new Error("rede caiu"); }
      f.body = s; f.version++; f.uploads++;
      return { data: { version: String(f.version) } };
    },
    create: async () => { throw new Error("não deveria criar: o arquivo existe"); },
  } };
  return { drive, rootId: "root", f, estado: () => JSON.parse(f.body) };
}

const acoes = (lista) => JSON.stringify(lista);
const acaoCom = (tokens) => ({ id: "ev1", participantes: { inscritos: tokens.map((t) => ({ token: t, nome: t })) } });

test("duas instâncias: a inscrição gravada na antiga sobrevive à primeira escrita da nova", async () => {
  const d = driveFalso({ "ex-acoes-v1": acoes([acaoCom(["t1"])]) });
  const antiga = await initDriveStore(d);
  const nova = await initDriveStore(d);            // boot: leu a mesma versão 1

  // a antiga ainda recebe tráfego enquanto a nova arranca: uma inscrição
  await antiga.set("ex-acoes-v1", acoes([acaoCom(["t1", "t2"])]));
  await antiga.flush({ agora: true });
  assert.deepEqual(d.estado()["ex-acoes-v1"] && JSON.parse(d.estado()["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token), ["t1", "t2"]);

  // a nova grava OUTRA coisa a partir da foto do boot — antes, cobria o arquivo
  await nova.set("sys-qualquer-v1", "1");
  await nova.flush({ agora: true });
  const ins = JSON.parse(d.estado()["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token);
  assert.deepEqual(ins, ["t1", "t2"], "a inscrição t2 sumiu na escrita da instância nova");
  assert.equal(d.estado()["sys-qualquer-v1"], "1");
  // e a nova passou a enxergar o que mesclou
  assert.deepEqual(JSON.parse(await nova.get("ex-acoes-v1"))[0].participantes.inscritos.map((x) => x.token), ["t1", "t2"]);
});

test("duas instâncias inscrevendo no MESMO evento: ficam as duas inscrições", async () => {
  const d = driveFalso({ "ex-acoes-v1": acoes([acaoCom(["t1"])]) });
  const a = await initDriveStore(d);
  const b = await initDriveStore(d);
  await a.set("ex-acoes-v1", acoes([acaoCom(["t1", "tA"])])); await a.flush({ agora: true });
  await b.set("ex-acoes-v1", acoes([acaoCom(["t1", "tB"])])); await b.flush({ agora: true });
  const ins = JSON.parse(d.estado()["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token).sort();
  assert.deepEqual(ins, ["t1", "tA", "tB"]);
  // e a instância A, ao gravar de novo, não desfaz o que B pôs
  await a.set("ex-acoes-v1", acoes([acaoCom(["t1", "tA", "tA2"])])); await a.flush({ agora: true });
  const ins2 = JSON.parse(d.estado()["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token).sort();
  assert.deepEqual(ins2, ["t1", "tA", "tA2", "tB"]);
  assert.equal(d.f.uploads, 3);
});

test("sem conflito não há releitura: um upload por flush, e a versão acompanha", async () => {
  const d = driveFalso({ k: "0" });
  const s = await initDriveStore(d);
  await s.set("k", "1"); await s.flush({ agora: true });
  await s.set("k", "2"); await s.flush({ agora: true });
  assert.equal(d.estado().k, "2");
  assert.equal(d.f.uploads, 2);
});

test("upload que falha não apaga a marca: a gravação sobe na tentativa seguinte", async () => {
  const d = driveFalso({ k: "0" });
  const s = await initDriveStore(d);
  d.f.falhas = 1;
  await s.set("k", "1");
  await assert.rejects(() => s.flush({ agora: true }), /rede caiu/);
  assert.equal(d.estado().k, "0");            // ainda não subiu
  await s.flush({ agora: true });             // sem nenhum set novo no meio
  assert.equal(d.estado().k, "1", "a gravação ficou só na memória depois do erro");
});

test("o que muda ENQUANTO a instância relê o Drive não se perde na troca do cache", async () => {
  const d = driveFalso({ "ex-acoes-v1": acoes([acaoCom(["t1"])]), outra: "0" });
  const a = await initDriveStore(d);
  const b = await initDriveStore(d);
  await a.set("outra", "A"); await a.flush({ agora: true });   // força conflito de versão em B
  // B grava e, no meio da releitura (o get de mídia), chega outra escrita em B
  const getOriginal = d.drive.files.get;
  let chegou = false;
  d.drive.files.get = async (args) => {
    const r = await getOriginal(args);
    if (args.alt === "media" && !chegou) { chegou = true; await b.set("ex-acoes-v1", acoes([acaoCom(["t1", "tB"])])); }
    return r;
  };
  await b.set("sys-x", "1");
  await b.flush({ agora: true });
  await b.flush({ agora: true });   // a escrita que chegou no meio fica suja e sobe agora
  const e = d.estado();
  assert.equal(e.outra, "A");
  assert.equal(e["sys-x"], "1");
  assert.deepEqual(JSON.parse(e["ex-acoes-v1"])[0].participantes.inscritos.map((x) => x.token), ["t1", "tB"]);
});
