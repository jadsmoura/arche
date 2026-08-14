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
lib/ic.js            ARCHÉ IC: projetos de IC, cronograma, relatórios e permissões
lib/pautas.js        Catálogo da Pauta Regulatória (indicadores INEP) e conformidade
lib/redator.js       Redação da minuta da ata: modelo (padrão) | gemini | anthropic
lib/assistente.js    Assistente de escrita dos campos da ata (só ARCHÉ AT)
lib/marca.js         Identidade institucional por data (FACEG até set/2025; UNIEGO depois)
lib/alertas.js       Alertas de regularização das atas para a PROPPEX
lib/mailer.js        E-mails via Gmail API (remetente "ARCHÉ · PROPPEX")
templates/           Template xlsx de certificados + logo UNIEGO (não alterar estrutura)
public/
  index.html         Portal (2 seções: Gestão PROPPEX | Avaliação Institucional)
  extensao/          Módulo Extensão (SPA vanilla JS) — propostas, relatórios, participantes
  pesquisa/ic/       ARCHÉ IC — Iniciação Científica (SPA vanilla, mesmo desenho do EX/AT)
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
  usados em server.js (`extensao/<curso>/…`, `dossie/<curso>/…`,
  `atas/<curso>/<órgão>/<ano>/` e `atas/institucional/<órgão>/<ano>/`).
- Estado do app em chaves `/api/estado` (ex.: `extensao-acoes-v1`); chaves `auth-*`, `sys-*`,
  `atas-*` e `ic-*` são internas e invisíveis pela API — quem guarda dado com recorte
  por pessoa (atas, IC) precisa ficar fora do `/api/estado`, senão a lista inteira sai
  por ali. Toda leitura/gravação passa por `/api/atas/*` e `/api/ic/*`.
- No ARCHÉ AT o **curso é escolhido antes do órgão**: com curso entram NDE, Colegiado e
  "Outro órgão do curso"; sem curso, os conselhos superiores, pró-reitorias, CPA,
  comissões e "Outro órgão institucional". Os de nome livre (`nomeLivre`) exigem o nome
  e não têm pauta regulatória nem ciclo obrigatório — o ARCHÉ só registra e arquiva.
- **Identidade institucional por data** (`lib/marca.js`): a instituição era FACEG até
  04/09/2025 e é UNIEGO desde 05/09/2025 — data de publicação da **Portaria MEC nº 623,
  de 5 de setembro de 2025**, que a credenciou por transformação da FACEG
  (Parecer CNE/CES nº 95/2025, e-MEC nº 202404601, cód. 3789). O corte fica em
  `MARCA_UNIEGO_DESDE`. Ata com sessão
  anterior sai com o logotipo, o nome e o rodapé da FACEG, e o texto diz "na Faculdade
  Evangélica de Goianésia". Vale só para as atas — os documentos da Extensão seguem
  com o timbre atual. Para corrigir a data de corte, mude a env var, não o código.
- **Datas passadas são aceitas** de propósito, para os órgãos regularizarem o arquivo.
  Numa ata retroativa, o checklist cobrado e o ciclo de sessões são os do semestre
  DA SESSÃO, não os do semestre corrente (`/api/atas/pauta-regulatoria?data=…`).
- Fluxo da IC (ARCHÉ IC): **rascunho → submetido → aprovado (em execução) → concluído**,
  com desvios para `devolvido` (volta a ser editável) e `reprovado`. O protocolo
  `IC-AAAA-NNN` sai na submissão e nunca se repete. Submetida, a **proposta fecha**;
  alunos e cronograma seguem editáveis pela orientação. Papéis (`lib/ic.js`): o
  ORIENTADOR submete, indica alunos e mantém o cronograma; a GESTÃO (gestor ou
  coordenador do módulo "pesquisa") avalia o mérito; o ALUNO INDICADO envia os
  relatórios **parcial e final**, e quem valida ou devolve é a orientação — nunca o
  próprio aluno, nem a orientação no lugar dele. Validados todos os finais, o projeto
  passa a concluído. **O e-mail do aluno indicado é o que lhe dá acesso**: ele vê só
  as atividades sob a sua responsabilidade e os seus relatórios; nada dos colegas. O
  aluno precisa de conta aprovada em `/usuarios/` (fora do `@uniego.edu.br`, o acesso
  nasce pendente). A tela de Cronograma reúne **todos os projetos num só lugar**, com
  esse mesmo recorte. Não há guia de bolsas nem de comunicação — a bolsa é um campo do
  aluno indicado.
- **Acervo por autor** (`podeVerAta`/`podeEditarAta` em `lib/atas.js`): cada usuário só
  enxerga as atas que ele mesmo registrou. Constar como secretaria ou participante NÃO
  dá acesso — quem precisa de cópia recebe o PDF por e-mail no registro. Só a gestão
  (PROPPEX e coordenadores do setor "atas") vê todas. O checklist da Pauta Regulatória
  é calculado sobre todas as atas, mas para quem não é gestão devolve apenas data e
  número da última sessão, nunca o ponto de pauta nem o id da ata.
- Fluxo das Atas (ARCHÉ AT): **rascunho → minuta → registrada**. "Em revisão" e "aprovada"
  foram removidas (quem revisa e aprova é o mesmo órgão que lavra). O número
  (`ATA-NDE-ENF-2026-003`) só é emitido ao sair do rascunho e nunca se repete.
  **Ata registrada continua corrigível** por quem a lavrou e pela gestão: registrar de
  novo gera o PDF retificado (`…-retificada-N.pdf`) ao lado do anterior no Drive, e a
  alteração fica no histórico. O que não se pode é rebaixá-la — isso apagaria em silêncio
  a prova de conformidade do órgão. Só ata registrada conta no checklist da Pauta
  Regulatória. Toda leitura/gravação passa por `/api/atas/*`.
- **O ARCHÉ AT não envia e-mail.** A ata vive no sistema: PDF gerado sob demanda em
  `/api/atas/:id/pdf` e cópia arquivada no Drive ao registrar. Quem precisa do documento
  entra e baixa. (A Extensão continua enviando e-mails; a regra é só das atas.)
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
  O adaptador do Gemini tenta os modelos Flash em ordem (o Google aposenta versões:
  o `gemini-2.5-flash` sai em 16/10/2026), então basta a chave para funcionar.
- **Assistente de escrita** (`lib/assistente.js` + `public/assets/arche-ia.js`): botões de
  IA nos campos longos das atas. Vale **só no ARCHÉ AT** — proposta e relatório da Extensão
  ficam de fora por decisão do dono, para não induzir dependência num texto que é autoria
  do professor. O assistente **nunca cria conteúdo**: exige texto do autor (mín. 15
  caracteres) e só reescreve. Sem chave de IA, os botões não aparecem.

## Identidade visual

Paleta (mesma do sistema de Avaliação): fundo `#eef1f4`, marca `#1c3742`, hover `#2d535c`,
acento `#40717e`, acento claro `#71c8e2`, wash `#e6f5fa`, texto `#182632`, muted `#657179`,
linhas `#dde4e8`. Fonte: Figtree/system. Manter consistência em qualquer página nova.

## Limitações no ambiente cloud

- Sem os segredos locais: chamadas reais ao Google Drive/Gmail não funcionam em testes
  locais na nuvem — validar por leitura de código; o site em produção tem as chaves.
- O servidor pode ser testado com `npm install && node server.js` (modo local: estado em
  `data/estado.json`, uploads em `data/uploads/`), sem tocar em dados de produção.
