# ARCHÉ — Portal de gestão da PROPPEX / UNIEGO

Sistema institucional em produção: **https://arche.app.br**
Dono: Prof. Dr. Jadson Belém de Moura (Pró-Reitor — PROPPEX/UNIEGO).
Idioma de toda a interface e commits: **português (pt-BR)**.

## Deploy — IMPORTANTE

- `git push` na `main` → **Render deploya automaticamente** (~2 min) → https://arche.app.br
- NÃO é preciso configurar nada de deploy; apenas commitar e pushar.
- Segredos (Google Drive OAuth, sessão) vivem nas env vars do Render — **NUNCA commitar
  segredos, tokens ou `.env`** neste repositório.

## Arquitetura

```
server.js            Express: estático + APIs (/api/estado, uploads, auth, exports)
lib/storage.js       Estado key-value (Google Drive em prod: _estado.json; local em dev)
lib/files.js         Uploads → Google Drive (pasta ARCHÉ, por curso)
lib/auth.js          Sessão por cookie HMAC; papéis: gestor > coordenador > aprovado > pendente
lib/exports.js       Registro de Atividade (.docx) e Planilha de Certificados (.xlsx)
lib/pdf.js           Relatório final, proposta e ata em PDF (timbrado oficial UNIEGO)
lib/atas.js          ARCHÉ AT: órgãos, numeração das atas, normalização e validação
lib/pautas.js        Catálogo da Pauta Regulatória (indicadores INEP) e conformidade
lib/redator.js       Redação da minuta da ata: modelo (padrão) | gemini | anthropic
lib/mailer.js        E-mails via Gmail API (remetente "ARCHÉ · PROPPEX")
templates/           Template xlsx de certificados + logo UNIEGO (não alterar estrutura)
public/
  index.html         Portal (2 seções: Gestão PROPPEX | Avaliação Institucional)
  extensao/          Módulo Extensão (SPA vanilla JS) — propostas, relatórios, participantes
  pesquisa/ic/       Iniciação Científica (runtime DC — editar só o markup/bloco text/x-dc)
  atas/              ARCHÉ AT — Atas e Colegiados (SPA vanilla, mesmo desenho do EX)
  arche/             Avaliação Institucional (app COMPILADO do Manus — NÃO refatorar;
                     alterações só por append de <script>/<style> no fim dos html)
  entrar/ perfil/ usuarios/   Login (código por e-mail + Google), perfil, gestão de acessos
```

## Regras de negócio essenciais

- **Setores protegidos** (exigem login): `/extensao`, `/pesquisa`, `/inovacao`, `/atas`, `/usuarios`.
  **Avaliação (`/arche/`) é ABERTA** — não adicionar login nela.
- Gestores gerais fixos: `jadsonbelem@gmail.com` e `jadson.moura@uniego.edu.br` (lib/auth.js).
- Contas `@uniego.edu.br` entram como submissoras automaticamente; outras aguardam aprovação.
- Fluxo da Extensão: proposta → aprovação (nº `EXT-AAAA-NNN`) → relatório final →
  participantes (3/3 completa) → certificados → registrada. Não alterar o formato do nº.
- Uploads e estado são organizados **por curso** no Google Drive — preservar os prefixos
  usados em server.js (`extensao/<curso>/…`, `dossie/<curso>/…` etc.).
- Estado do app em chaves `/api/estado` (ex.: `extensao-acoes-v1`); chaves `auth-*`, `sys-*`
  e `atas-*` são internas e invisíveis pela API.
- Fluxo das Atas (ARCHÉ AT): rascunho → minuta → em revisão → aprovada → registrada.
  O número (`ATA-NDE-ENF-2026-003`) só é emitido ao sair do rascunho e nunca se repete.
  Ata registrada é documento fechado. Toda leitura/gravação passa por `/api/atas/*`.
- **Pauta Regulatória** (`lib/pautas.js`): temas que os instrumentos do INEP esperam ver
  debatidos em ata. Cada tema pertence a **um único órgão** (competência exclusiva: o
  currículo é do NDE, a gestão do curso é do Colegiado, a autoavaliação é da CPA).
  Ciclo: todo órgão registra ≥1 ata **ordinária** por semestre; NDE, Colegiado e CPA
  registram 2 (abertura e encerramento) — ver `RITUAL`. Sessões **extraordinárias**
  entram por demanda: contam como registro dos temas que tratam, mas não fecham o ciclo.
  Cadência por tema: `semestral` ou `anual` (com o semestre em que vence).
  Ao alterar o catálogo, preserve os `id` — são a chave do vínculo gravado nas atas.
- O ARCHÉ **não convoca reunião nem cobra ninguém por e-mail**: `lib/alertas.js` monta a
  lista de órgãos e cursos fora de dia e a mostra à gestão (painel do ARCHÉ AT e tela
  Acompanhamento). A cobrança da regularização é da PROPPEX. Órgão que nunca registrou
  ata entra sempre como urgente, faltem 5 ou 150 dias para o fim do semestre.
- Presenças são digitadas a cada sessão pelo responsável — **não há cadastro fixo de
  composição de órgão**, por decisão do dono (lista fixa emperra o processo).
- O arquivamento da via assinada é do próprio órgão; o ARCHÉ guarda a cópia gerada.
- Redação da ata por IA é **opcional**: sem `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` o gerador
  determinístico assume, e qualquer falha de IA cai nele em vez de derrubar o fluxo.

## Identidade visual

Paleta (mesma do sistema de Avaliação): fundo `#eef1f4`, marca `#1c3742`, hover `#2d535c`,
acento `#40717e`, acento claro `#71c8e2`, wash `#e6f5fa`, texto `#182632`, muted `#657179`,
linhas `#dde4e8`. Fonte: Figtree/system. Manter consistência em qualquer página nova.

## Limitações no ambiente cloud

- Sem os segredos locais: chamadas reais ao Google Drive/Gmail não funcionam em testes
  locais na nuvem — validar por leitura de código; o site em produção tem as chaves.
- O servidor pode ser testado com `npm install && node server.js` (modo local: estado em
  `data/estado.json`, uploads em `data/uploads/`), sem tocar em dados de produção.
