# ARCHÉ — Portal de gestão da PROPPEX / UNIEGO

Portal único (um só app, um só endereço) para os setores da Pró-Reitoria:
**Pesquisa**, **Avaliação Institucional**, **Inovação** e **Extensão**.

> Do grego *arché* — origem, fundamento, princípio.

## Arquitetura

Um app **Node/Express** serve o super-portal e todos os setores. Cada setor é
navegável dentro do mesmo site.

```
Arche/
├── server.js            App unificado: API + serve tudo em public/
├── lib/
│   ├── storage.js       Estado (key-value): MySQL em prod | arquivo local em dev
│   └── files.js         Uploads: Google Drive | S3 | disco local
├── public/
│   ├── index.html       SUPER-PORTAL (4 setores)              →  /
│   ├── pesquisa/ic/     Setor Pesquisa — Iniciação Científica →  /pesquisa/ic/
│   └── arche/           Setor Avaliação Institucional (SINAES) →  /arche/
├── schema.sql           Tabela `estado` (MySQL/MariaDB, produção)
├── .env.example         Variáveis de ambiente (todas opcionais em dev)
└── package.json
```

Setores **Inovação** e **Extensão** aparecem como "Em breve" no portal.

## Modos de operação (escolhidos por variável de ambiente)

| Recurso | Sem config (dev) | Produção |
|---|---|---|
| Persistência de estado | `data/estado.json` | MySQL/MariaDB (`DATABASE_URL`) |
| Armazenamento de arquivos | `data/uploads/` | **Google Drive** ou S3 |

Sem nenhuma variável definida, o sistema roda 100% local — ideal para
desenvolvimento e testes.

## ⚠️ Importante: não roda dentro do Google Drive

O `D:` é o drive virtual do Google Drive (File Stream). O `npm install` e a
execução **não funcionam** dentro dele (o sync trava os arquivos do
`node_modules`). Por isso:

- **Código-fonte**: fica aqui no Drive (fonte da verdade, backup).
- **Execução**: numa cópia em disco local — hoje em `C:\Users\jadsm\arche-run`.

Fluxo para rodar/testar (a partir do disco local):

```bash
# 1. Sincronizar a fonte (Drive) -> cópia local.
#    EXCLUI: node_modules, data, a pasta de documentos ARCHÉ (vive no Drive!),
#    os pacotes de origem e artefatos de migração.
robocopy "D:\Google Drive local\Meu Drive\Claude Code\Arche" "C:\Users\jadsm\arche-run" /MIR /XD node_modules data ARCHÉ ARCHE arche-ic arche-servidor-faculdade design_handoff_arche_ic .claude .git /XF .env *.zip

# 2. Instalar (só uma vez, ou quando mudar package.json):
cd C:\Users\jadsm\arche-run && npm install --omit=optional

# 3. Rodar:
node server.js
# abre em http://localhost:3000/
```

> A pasta **ARCHÉ** (documentos e `_estado.json` do sistema) fica no Google Drive e é
> referenciada pelo ID fixo `GDRIVE_FOLDER_ID` — pode ser movida para qualquer lugar
> do Drive (ex.: `Meu Drive/Claude Code/Arche/ARCHÉ`) sem quebrar nada.

> Recomendação futura: migrar o projeto para disco local + Git (backup e
> versionamento) em vez do Google Drive.

## Arquivar documentos no Google Drive (produção)

Para os uploads irem direto para uma pasta do seu Google Drive:

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto
   e ative a **Google Drive API**.
2. Crie uma **conta de serviço** e gere uma **chave JSON**.
3. No seu Drive, crie uma pasta (ex.: "ARCHÉ") e **compartilhe-a como Editor**
   com o e-mail da conta de serviço (`...@...iam.gserviceaccount.com`).
4. Pegue o **ID da pasta** (final da URL dela no Drive).
5. No `.env`:
   ```
   GDRIVE_FOLDER_ID=ID_DA_PASTA
   GDRIVE_KEY_FILE=./credenciais/conta-servico.json
   ```
6. `npm install` (para instalar `googleapis`) e reinicie. Os documentos passam a
   ser arquivados na pasta do Drive, organizados por setor/indicador/professor.

## API (usada pelas páginas dos setores)

| Rota | Função |
|---|---|
| `GET/PUT/DELETE /api/estado` | Ler/gravar/apagar estado por chave |
| `GET /api/estado/list?prefixo=` | Listar chaves |
| `POST /api/drive/upload` | Upload de dossiê (por professor/categoria) |
| `POST /api/drive/upload-avaliacao` | Upload de comprovante de indicador |
| `POST /api/drive/upload-doc-institucional` | Upload de documento institucional |
| `GET /api/files/*` | Recuperar arquivo (stream/redirect) |
