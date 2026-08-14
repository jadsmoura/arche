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
lib/cpf.js           CPF: validação, normalização e a chave de vínculo dos importados
lib/edital.js        Edital 01/2026: modalidades, grupos DGP/CNPq e pontuação docente
dados/               Lotes de importação (ic-edital-01-2026.json: as 33 submissões)
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
  alunos e cronograma seguem editáveis pela orientação. Validados todos os relatórios
  finais, o projeto passa a concluído. A tela de Cronograma reúne **todos os projetos
  num só lugar**. Não há guia de bolsas nem de comunicação — a bolsa é um campo do
  aluno indicado.
- **Quatro acessos na IC** (`papelNoProjeto` em `lib/ic.js`), e três deles nascem do
  próprio projeto — não há cadastro de papel à parte:
  1. **gestão** — pró-reitor e coordenação de pesquisa (gestor geral ou coordenador do
     módulo `pesquisa`): vê tudo, designa avaliadores e decide o mérito;
  2. **orientador** — submete, indica alunos, mantém o cronograma e valida os
     relatórios dos seus alunos;
  3. **aluno indicado** — envia os relatórios **parcial e final**; quem valida ou
     devolve é a orientação, nunca o próprio aluno nem a orientação no lugar dele;
  4. **avaliador ad hoc** — designado pela gestão **projeto a projeto**, dá parecer
     durante a seleção (4 critérios de 0 a 10 + recomendação; a nota é a média) ou
     recusa por impedimento. Não participa da execução: cronograma e relatórios não
     aparecem para ele.
- **Edital 01/2026** (`lib/edital.js`): as regras que o sistema precisa conhecer viram
  catálogo — trocar de edital é mexer nesse arquivo, preservando os `codigo`, que são
  a chave do que já está gravado. Três **linhas** (IC, IT, IE) e oito **modalidades**,
  que são o cruzamento linha × fomento: o professor escolhe a linha e, se quiser, a
  modalidade pretendida; a coordenação marca na seleção se houve **bolsa do CNPq, bolsa
  do UNIEGO (R$ 350) ou voluntário**, e a modalidade efetiva (`modalidadeEfetiva`) sai
  daí — marcar bolsa também marca os alunos como bolsistas. Cada modalidade cobra a
  **titulação mínima** do item 4.4 (PIBIC/CNPq exige doutor; as voluntárias, especialista),
  e a titulação chega como texto livre ("Doutora", "Dr.") — `normalizarTitulacao` resolve.
- **Pontuação da produção acadêmica** (`pontuarProducao`): réplica da planilha oficial do
  edital — 28 itens em 3 blocos, com pesos e tetos (30 + 60 + 10 = 100), no período de
  2022 a 2026. Fica no projeto, mas é do coordenador: o formulário do próximo projeto
  abre com o que ele informou da última vez (`producaoAnterior` em `/api/ic/meta`), e ela
  pode ser preenchida depois da submissão. Classificação (item 9.4):
  **NFC = NP×0,6 + CL×0,4**, com NP = média dos pareceres (0–10) e CL = pontuação/10.
- **Grupo de pesquisa** (DGP/CNPq): a proposta indica **apenas o nome do grupo**. Por
  decisão do dono, **não se pergunta o papel** de quem submete no grupo — professores
  submetem propostas ligadas a grupos que não lideram — e por isso **não há a pontuação
  do item 9.3** (5 membro / 10 líder): ela dependeria desse papel. A lista oferece os
  certificados no DGP e **cresce com o uso** (`gruposConhecidos`): quem não achar o seu
  digita o nome, e ele passa a aparecer para os demais assim que o projeto sai do
  rascunho. `normalizarGrupo` casa o que foi digitado com um nome já conhecido (ignora
  acento, caixa e espaço), para o mesmo grupo não virar duas linhas na lista. Grupo e
  planilha de produção **seguem editáveis depois da submissão** — são fato sobre o
  projeto, não argumento da proposta, e os 33 importados chegaram sem os dois.
- **Pendências** (`pendenciasDoProjeto`) não travam a submissão, mas aparecem em amarelo:
  aluno sem e-mail (não conseguirá enviar relatório), planilha de produção em branco,
  CEP/CEUA sem protocolo. O formulário do edital não coletou e-mail nem CPF dos alunos —
  por isso `validarProjeto` aceita aluno identificado só por nome e matrícula.
- **Ver como** (`visaoComo` no server): a coordenação abre o ARCHÉ IC pelos olhos de
  qualquer pessoa do setor — professor, aluno ou avaliador — para conferir o que ela
  enxerga. Não é atalho de permissão: o alvo é tratado como quem é (`gestao: false`),
  e as mesmas funções de recorte e sigilo valem, então a simulação não mente. É
  **somente leitura** — um middleware recusa qualquer escrita com `?como=`, senão o
  histórico do projeto diria que foi a pessoa quem mexeu. Quem ainda não tem conta
  pode ser simulado pelo CPF (`como=cpf:000…`), que é como o projeto importado o
  identifica: mostra o que ele encontrará ao se cadastrar.
- **CPF é a chave do que vem de fora** (`lib/cpf.js`): o perfil (`/perfil/`) pede o CPF,
  guardado só em dígitos e **único por conta** (dois cadastros com o mesmo CPF são
  recusados — o segundo herdaria os projetos do primeiro); alterar CPF já gravado só
  a PROPPEX. `POST /api/ic/importar` (gestor) carrega o banco de submissões anteriores
  identificando cada projeto pelo **CPF de quem orienta**, sem depender de e-mail, que
  a planilha não tem; `origem.lote`+`origem.id` tornam a reimportação idempotente
  (atualiza, não duplica) e sobrevivem a edições. Quando a pessoa grava o CPF no
  perfil, `vincularPorCpf` escreve o e-mail dela nos projetos que a esperavam e eles
  aparecem na conta já na situação importada. O vínculo **nunca sobrescreve** e-mail
  existente. Enviar `simular: true` faz a conferência sem gravar nada.
- **O e-mail é o convite** na IC: indicar um aluno ou designar um avaliador dá acesso
  ao setor mesmo com a conta ainda `pendente` (`participaDeAlgum`), e só aos projetos
  em que a pessoa está. O convidado não abre projeto novo — submeter exige conta
  aprovada. Vale só para `/pesquisa`; nos demais setores `pendente` continua barrado.
- **Sigilo do parecer ad hoc** (`visaoDoProjeto` em `lib/ic.js`, aplicado no servidor
  em toda resposta que devolve projeto): a orientação e o aluno **nunca sabem quem
  avaliou** — some a lista de avaliadores, os pareceres e as linhas de histórico
  marcadas com `sigilo: true`; ficam só as contagens e a decisão da coordenação. O
  avaliador **não vê o parecer dos colegas** (ancoraria o julgamento), nem relatórios,
  nem histórico, e recebe a proposta **sem os nomes** da orientação e dos alunos. Quem
  participa do projeto não pode avaliá-lo. Parecer entregue não se apaga: é prova da
  seleção.
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
