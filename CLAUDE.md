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
lib/pdf.js           Relatório final, proposta e ata em PDF (timbrado oficial UNIEGO).
                     Assinaturas institucionais no catálogo ASSINA (trocar nome/cargo é lá):
                     resultado da IC = coord. de pesquisa + pró-reitor + reitor; Extensão =
                     responsável + coordenação da ação (curso livre → Extensão; demais →
                     Ação Comunitária) + pró-reitor + reitor
lib/atas.js          ARCHÉ AT: órgãos, numeração das atas, normalização e validação
lib/ic.js            ARCHÉ IC: projetos de IC, cronograma, relatórios e permissões
lib/cpf.js           CPF: validação, normalização e a chave de vínculo dos importados
lib/edital.js        Edital 01/2026: modalidades, grupos DGP/CNPq e pontuação docente
lib/termos.js        Termos de Compromisso da IC: o texto institucional dos 4 modelos
dados/               Lotes de importação (ic-edital-01-2026.json: as 33 submissões)
lib/pautas.js        Catálogo da Pauta Regulatória (indicadores INEP) e conformidade
lib/redator.js       Redação da minuta da ata: modelo (padrão) | gemini | anthropic
lib/assistente.js    Assistente de escrita dos campos da ata (só ARCHÉ AT)
lib/marca.js         Identidade institucional por data (FACEG até set/2025; UNIEGO depois)
lib/portaria.js      Portaria do ARCHÉ AV: senha compartilhada e link de acesso (sem login)
lib/fusao.js         Fusão de cadastros duplicados (a mesma pessoa em duas contas)
lib/alertas.js       Alertas de regularização das atas para a PROPPEX
lib/mailer.js        E-mails via Gmail API (remetente "ARCHÉ · PROPPEX")
templates/           Template xlsx de certificados + logo UNIEGO (não alterar estrutura)
public/
  index.html         Portal (2 seções: Gestão PROPPEX | Avaliação Institucional)
  extensao/          Módulo Extensão (SPA vanilla JS) — propostas, relatórios, participantes
  eventos/           Páginas PÚBLICAS dos eventos (hotsite, inscrição, credenciar, assistir)
                     + gestao/ = ARCHÉ EV, o setor de OPERAÇÃO dos eventos (com login)
  pesquisa/ic/       ARCHÉ IC — Iniciação Científica (SPA vanilla, mesmo desenho do EX/AT)
  atas/              ARCHÉ AT — Atas e Colegiados (SPA vanilla, mesmo desenho do EX)
  arche/             Avaliação Institucional (app COMPILADO do Manus — NÃO refatorar;
                     alterações só por append de <script>/<style> no fim dos html)
  ic/                Vitrine PÚBLICA da IC (sem login, de propósito): editais, resultados
                     e a lista simplificada dos projetos — arquivo para o MEC. Os PDFs dos
                     editais e dos resultados publicados vivem em public/ic/docs/
  entrar/ perfil/ usuarios/   Login (código por e-mail + Google), perfil, gestão de acessos
```

- **Gestão de acessos** é da conta, não de um setor: o atalho mora no **perfil** do
  gestor (`/perfil/`), não na barra lateral da Extensão.
- **O portal mostra a cada um os seus setores** (`aplicarVisibilidade` em
  `assets/arche-nav.js` + `data-setor` nos cartões de `public/index.html`, decisão do
  dono ago/2026): **aluno** (função `aluno` no perfil) vê só Extensão e Pesquisa·IC;
  **professor e demais** veem tudo menos a Avaliação; **gestor geral e coordenadores**
  (qualquer módulo em `modulosDe`) veem tudo; **visitante sem login** (revisão do dono,
  ago/2026) NÃO vê mais o portal completo: a página inicial mostra só a visão pública —
  os cartões das vitrines (`/ic/`, editais e resultados; `/eventos/`, abertos e já
  realizados) e o bloco "Entrar no portal" (e-mail + senha direto no card, via
  `/auth/senha`; código por e-mail e Google pelo `/entrar`). O `#portal-publico` e as
  classes `so-logado` de `index.html` fazem a troca pelo `/api/me` (erro cai na visão
  logada — a página nunca fica vazia), e a barra do topo esconde do visitante os
  atalhos dos setores. É filtro de APRESENTAÇÃO — quem barra é o servidor (login nos
  setores, portaria na Avaliação); esconder cartão não é porta. Vale para os cartões
  da página inicial e para os atalhos da barra do topo em todos os setores.

## Regras de negócio essenciais

- **Setores protegidos** (exigem login): `/extensao`, `/pesquisa`, `/inovacao`, `/atas`,
  `/usuarios` e `/eventos/gestao` (o restante de `/eventos/*` é público de propósito).
  **Avaliação (`/arche/`) continua SEM login** — não criar conta, papel nem sessão nela.
- **Todo guarda compara `req.caminho`, nunca `req.path`**: o `req.path` chega CRU (sem
  decodificar `%2f`, sem colapsar `//`) e o `express.static` resolve o caminho já
  decodificado e normalizado — a diferença fazia `//usuarios/` e `/arche%2findex.html`
  passarem ao largo da guarda e caírem direto no disco, servindo a SPA da gestão **sem
  login** (achado da revisão adversarial de ago/2026). Um middleware normaliza uma vez, no
  topo, e recusa com 400 o que nem decodifica.
- **O `firebase-config.js` das páginas POR CURSO** (correção de ago/2026): o app compilado
  carrega `../firebase-config.js` em toda página — é ele que define `window.storage`, quem
  grava o dossiê. Nas páginas de curso (`/arche/avaliacao/<curso>/` e `/arche/dossie/<curso>/`)
  esse caminho relativo caía num diretório sem o arquivo: 404, página sem `window.storage`,
  e NADA era salvo (a tela montava e o comprovante ia ao Drive, mas ao recarregar o dossiê
  voltava vazio). Só Psicologia escapava, por morar um nível acima. O arquivo é UM só,
  servido também nesses dois caminhos por uma rota no server — copiá-lo seria manter três
  versões da mesma coisa.
- **O docente ajusta a produção importada** (append em `public/arche/dossie/*`, decisão do
  dono ago/2026): o XML do Lattes traz artigo que não é da pessoa ou que não deveria constar,
  e falta o que saiu depois da última atualização do currículo — reexportar o XML inteiro por
  um item só é caro. O docente **exclui** o item (com **Desfazer** no aviso e a lista
  "Excluídas por você", que restaura com um clique — engano não vira perda) e **inclui
  produção à mão** (tipo, título, ano, autores, veículo), que entra sem comprovante para ele
  anexar em seguida. Só o DOCENTE, no próprio dossiê; PROPPEX e avaliador seguem só olhando.
  O que ele excluiu e o que incluiu viaja no MESMO registro do dossiê, e é **reaplicado depois
  de cada reimportação** do XML (senão o excluído voltaria e o manual sumiria) — a chave é o
  que o item afirma (tipo + título + ano), não o id, que muda a cada exportação.
- **Portaria da Avaliação** (`lib/portaria.js`, decisão do dono em ago/2026): como o cartão do
  módulo fica na página inicial, à vista de qualquer visitante, a entrada pede uma **senha
  compartilhada** (`AV_SENHA`, "uniego" por padrão) — só para barrar quem chegou ali por acaso.
  Não é login e não pode virar um: o selo (cookie `arche_av`) não guarda e-mail nem papel, e não
  abre nenhum setor da gestão. Passam **sem digitar nada** quem já está logado no ARCHÉ
  (professores, coordenações, gestão) e quem chega pelo **link de acesso** (`/arche/?acesso=…`),
  que é o que a PROPPEX manda ao **avaliador do MEC** — ele não tem conta e não vai criar uma.
  O link aparece na página inicial só para gestor geral (`GET /api/av/link`) — e o botão
  "Gerar link" dos avaliadores ad hoc nas telas de dossiê embute o MESMO passe no endereço
  (correção de ago/2026, por append de `<script>` nas 12 páginas do app compilado: sem o
  passe, o avaliador caía na tela de senha). Há ainda o **atalho público
  `arche.app.br/avaliador`** (decisão do dono, ago/2026): entra SEM senha no bloco ARCHÉ
  Avaliador com um selo de **VISUALIZAÇÃO** (`via: "avaliador"` no cookie;
  `somenteLeituraNaAv` no server) — páginas e leituras abrem, mas NENHUMA escrita passa
  (PUT/beacon do `/api/estado` e os três uploads recusam 403); quem também tem sessão no
  ARCHÉ mantém os próprios direitos. O link de acesso completo se invalida em
  bloco trocando `AV_LINK_VERSAO`. A mesma portaria vale para as APIs que o módulo usa
  (`/api/estado*` nas chaves abertas e os três `/api/drive/upload*`), senão bastaria pular a
  tela e ler tudo pela API. Para trocar a senha, mude a env var — não o código.
- Gestores gerais fixos: `jadsonbelem@gmail.com` e `jadson.moura@uniego.edu.br` (lib/auth.js),
  com os **mesmos privilégios**. A identidade ACADÊMICA do pró-reitor (projetos que orienta,
  certificados) vive na conta **institucional** — a pessoal é só de gestão
  (`identidadeInstitucionalDoProReitor` gravou o e-mail do UNIEGO nos projetos dele, o que
  também encerra o casamento por nome na conta pessoal).
- **Coordenação por setor** (`/usuarios/`, ação `coordenar`): o gestor geral designa
  coordenadores para qualquer um dos cinco módulos — `extensao`, `pesquisa`, `inovacao`,
  `atas` e `eventos`. Dentro do setor marcado a pessoa tem o alcance da PROPPEX (no ARCHÉ
  AT, vê as atas de todos os órgãos, o Acompanhamento e os alertas); fora dele é
  submissora, e a gestão de acessos continua exclusiva dos gestores gerais. Cada setor
  decide isso lendo `modulos` da sessão (`gereAtas`, `gereIC`, `gereEv`) — nunca o papel
  sozinho. O módulo `eventos` (ARCHÉ EV, ago/2026) tem alcance PRÓPRIO: opera todos os
  EVENTOS (vê toda ação COM `evento`; `podeOperarEvento` nas rotas do evento) sem
  enxergar o restante da Extensão — a aprovação da ação e o relatório seguem sendo da
  gestão da Extensão.
- **Todo cadastro novo entra como submissor automaticamente** (decisão do dono, ago/2026):
  `aprovarCadastroNovo` no server aprova no primeiro login — contas `@uniego.edu.br` já
  entravam assim, e as pendentes antigas convergem ao entrar de novo. O registro fica em
  `auth-novos-cadastros-v1` (chave `auth-*`, fora do `/api/estado`) e alimenta o alerta
  "cadastros novos" + o e-mail à PROPPEX; rever um acesso é em `/usuarios/`.
- **Painel de usuários** (`/usuarios/`, aba "Usuários cadastrados"; `GET /api/usuarios/painel`
  e `POST /api/usuarios/perfil`, só gestor geral): quem está cadastrado, o que faz na
  instituição e **que setores usa de fato** — contado nos próprios registros (projetos de
  IC, ações de extensão pelo `respEmail`, atas pelo `criadoPor`), não numa marcação à
  parte. "Cadastrado" é a união de perfis, listas de papel, cadastros novos e quem aparece
  nos projetos. A gestão **edita o cadastro** de qualquer um (o mesmo perfil de `/perfil/`)
  e **inclui usuário à mão** — e-mail novo entra com o perfil preenchido e já aprovado como
  submissor; ele acessa pelo próprio e-mail, sem senha definida por ninguém. Papéis e senha
  ficam na outra aba, de propósito. O **curso é gravado pelo NOME** nos dois lugares: duas
  grafias fariam a pessoa não conseguir salvar o próprio perfil depois de editada.
- **Perfil incompleto barra a entrada nos setores** (`faltaNoPerfil` em lib/auth.js, decisão
  do dono em ago/2026): quem tem campo faltando é levado ao `/perfil/` com
  `?completar=1&next=…` antes de entrar em qualquer setor protegido, e a tela mostra a etapa
  com o que falta apontado nos próprios campos. **Só barra quem tem algo faltando** — perfil
  completo nunca vê a etapa. Obrigatórios: nome, função, curso, **CPF** e telefone; mais a
  **titulação** de quem é docente (o edital cobra titulação mínima por modalidade;
  secretaria e "outro" não). O CPF **não se cobra do gestor geral**: a conta pessoal da
  pró-reitoria é só de gestão e um CPF não pode estar em duas contas — cobrar ali seria
  exigência impossível de cumprir. `POST /api/perfil` aplica a MESMA régua: se o formulário
  aceitasse perfil incompleto, a pessoa salvaria, voltaria à etapa e não sairia do lugar.
- **Fusão de cadastros duplicados** (`lib/fusao.js` + `POST /api/usuarios/fundir`, só gestor
  geral): a mesma pessoa entra duas vezes com facilidade — conta pessoal e depois a
  institucional, ou o pré-cadastro do edital num endereço que ela não usa mais —, e o
  caminho natural está fechado de propósito (CPF é único por conta). O painel **aponta pelo
  nome** (só nomes com duas palavras ou mais; nome sozinho não é evidência) e **quem funde é
  a gestão**, escolhendo qual conta fica. `simular: true` mostra ANTES o que sai de uma para
  a outra — projetos, ações, atas, campos do cadastro e papel herdado. Regras: perfil
  completa o que falta e **nunca sobrescreve** o que a pessoa preencheu; a conta que fica
  **herda** o alcance da outra (nunca o contrário); parecer entregue sobrevive à junção de
  avaliadores; a **senha não viaja** (é da conta, não da pessoa); e o que foi movido, com o
  perfil removido inteiro, fica em `sys-fusoes-v1` — fusão não se desfaz sozinha. As **duas
  contas da pró-reitoria não aparecem como duplicidade**: são duas de propósito.
- **Função na instituição** (`FUNCOES`/`normalizarFuncao` em lib/auth.js): o que a pessoa
  FAZ — professor, professor pesquisador, coordenador de curso, coordenador pedagógico,
  secretaria, as coordenações da PROPPEX (Pesquisa e Inovação, Extensão, Ação Comunitária)
  e da PROAC (Ensino, Políticas Institucionais), mais `outro` com texto livre
  (`funcaoOutro`). É diferente do **papel** no sistema (gestor > coordenador > aprovado >
  pendente), que diz o que ela PODE. Lista fechada porque cargo escrito à mão não agrupa;
  `normalizarFuncao` reconhece o que já estava gravado em texto livre. Mesmo catálogo no
  `/perfil/` e no painel da gestão — preserve os `codigo`.
- **Avisos por e-mail das movimentações** (decisão do dono, ago/2026): a Extensão já
  avisava `extensao@uniego.edu.br` a cada proposta nova (`emailNovaProposta`, env
  `NOTIFY_EMAIL`); a IC passa a avisar **`pesquisa@uniego.edu.br`** (env
  `IC_NOTIFY_EMAIL`) — `avisarPesquisa` no server + `emailMovimentacaoIC` no mailer,
  fire-and-forget (e-mail que falha não trava gravação; ato da própria gestão não avisa).
  Movimentos cobertos: submissão/reenvio de projeto, relatório entregue pelo aluno,
  indicação de aluno, pedido de substituição, contestação e — no ICEM — escolha/troca de
  projeto e relatório final do bolsista. O aviso leva o essencial e o link do setor,
  nunca nota, parecer ou dado bancário.
- **Sino de alertas no topo** (`GET /api/alertas` + `arche-nav.js`): mostra à gestão o que
  espera decisão ou atenção — acessos pendentes e cadastros novos (só gestor geral),
  projetos de IC aguardando avaliação, substituições de bolsista, relatórios em atraso,
  propostas/relatórios da Extensão e órgãos fora de dia nas Atas. O recorte é por
  `modulosDe`: o gestor geral vê tudo; o coordenador, só os módulos que coordena; quem
  não gere nada não vê o sino. A rota só devolve contagens, nomes e links — nada sigiloso.
- **Senha provisória** (`POST /api/usuarios/senha`, só gestores gerais): para quem perdeu o
  acesso ao e-mail. Vale **7 dias** e obriga a troca no primeiro login (`/auth/senha`
  devolve `trocarSenha: true`; o `/entrar` esconde o "agora não"). Quando a pessoa define
  a própria senha a marca `provisoria` some sozinha. Conta de gestor não recebe senha
  provisória — um gestor não redefine a senha do outro. Rota separada da de papéis de
  propósito: a de papéis reconstrói as listas, e resetar senha não pode rebaixar ninguém.
- **Certificados da Extensão são de OUTRO sistema** (eventos da AEE,
  `https://eventoscae.aee.edu.br/portal/login`): a guia Certificados do ARCHÉ EX **não
  embute** a página — o login de lá pede a janela própria (cookies de terceiro), e uma
  moldura em branco só confundiria quem vem emitir certificado. A guia diz onde a emissão
  acontece, por que é fora do ARCHÉ, e leva até lá em **nova janela**. O endereço fica em
  `CERTIFICADOS_EXTERNO`, no topo da SPA.
- **ARCHÉ Eventos** (`lib/eventos.js` + `public/eventos/` + rotas em server.js; 2ª geração
  em ago/2026, no molde Even3/Sympla — pesquisa com 3 agentes sobre as duas plataformas):
  EVENTOS GRATUITOS de todos os formatos — a ação de extensão ganha `a.evento` e uma página
  pública em `arche.app.br/eventos/<slug>` no desenho de HOTSITE (hero com capa, abas da
  programação por dia, "Ver no mapa", CTA flutuante; evento encerrado vira aviso + link à
  vitrine, a página não morre). A **programação é por ATIVIDADES com id estável** (o campo
  gravado continua `evento.programacao`; itens com `tipo` do catálogo `TIPOS_ATIVIDADE`,
  dia, `horaInicio`/`horaFim` [compat: `hora` antigo migra], local, responsável, **vagas
  próprias**, `ch`, `modalidade` presencial/online e `inscricao: geral|propria`) —
  simultaneidade é mesmo horário em locais diferentes, SEM entidade "trilha" (é como o
  Even3 faz). O participante ESCOLHE as atividades `propria` na inscrição e TROCA depois
  pela credencial (`POST …/inscricao/:token/atividades`); **conflito de horário AVISA e
  não trava**; vaga por atividade é conferida DENTRO da fila. **Campos extras**
  configuráveis (`evento.formulario`, 5 tipos, obrigatório por campo; `validarRespostas`
  no servidor; rótulo público do curso é "Curso / instituição de origem" — participante
  externo). **LGPD**: consentimento obrigatório NA ROTA de inscrição, gravado com data +
  versão do texto (`LGPD_TEXTO_PADRAO`; `evento.lgpdTexto` substitui); caixa opcional
  separada para comunicações; inscrito da planilha sem o campo = nunca consentiu online.
  **Check-in por atividade**: o PWA `/eventos/credenciar` tem o seletor "Credenciar em",
  grava `presencas: [{atividade, em, por}]` e mantém `presente` como agregado; presença
  **desfeita pela gestão volta a valer** num novo credenciamento (achado da revisão); a
  presença manual da gestão aceita `atividade` e assina "gestão (email)", não "monitor".
  **Transmissão online** (`evento.transmissao`, publicação explícita): página
  `/eventos/<slug>/assistir/<token>` — YouTube embedado (nocookie) com **presença por
  heartbeat** (60s em PLAYING; acumulador em memória + flush de 120s pela fila; régua
  `presencaMinutos`, 0 = primeiro acesso) e chat da live opcional; **Zoom sem embed**: o
  link só sai no POST que registra a presença (decisão de pesquisa: nem Even3 nem Sympla
  embutem Zoom). **Mural de comentários** por token (cooldown 20s/token, teto 800,
  moderação em `/api/extensao/:id/mural/:mid`). **Capa** base64 no evento, servida por
  `GET /api/publico/eventos/:slug/capa` e STRIPADA de todo payload junto com a `chaveQr`
  (`eventoSemSegredos` — vale para GET e para as respostas dos POSTs); `temCapa` no lugar.
  **Relatório final vinculado**: na ENTREGA o servidor grava `relatorio.numerosEvento`
  (inscritos, presentes, online, por atividade — snapshot que o cliente não forja), e o
  quadro sai no PDF timbrado e no Registro docx; o card do evento aparece desde a
  proposta (fluxo único), mas ATIVAR a página segue exigindo aprovação (`numeroAcao`).
  **Exports**: AEE geral e POR ATIVIDADE (`?atividade=`, CH da atividade, presentes por
  `presencas[]`) com o template intocável (4 abas + CONFIG), e a lista completa do ARCHÉ
  (`inscritos-completo.xlsx`, campos extras em colunas, tudo por `seguro()`).
  **Freios em DOIS contadores** (revisão de ago/2026): `freioCheckin` é da porta física
  (portão por IP, 20 falhas/5min, sucesso não conta) e `freioOnline` é das rotas da
  transmissão/mural/atividades — nelas o token é validado PRIMEIRO e **o válido passa
  SEMPRE** (atrás do NAT o campus é um IP só; um portão antes da validação derrubava a
  presença de todos); só a falha conta e, estourado, o ruído vira 429. Config com tipo
  errado (programacao/formulario/transmissao) é **400, nunca 200-que-zera**. Rotas
  públicas nunca devolvem a lista de inscritos, CPF, e-mail ou respostas de terceiros;
  injeção de fórmula blindada em todo export; e-mail de confirmação lista as atividades
  marcadas. Páginas fixas novas em `/eventos/` entram em `SLUGS_RESERVADOS` ("assistir"
  incluído). Sem cobrança/pagamento nesta fase (decisão do dono; financeiro a definir).
  **ARCHÉ EV é o SETOR dos eventos** (decisão do dono, ago/2026): cartão próprio na página
  inicial e atalho "Eventos" na barra, apontando a `/eventos/gestao` (SPA com login; a
  guarda está em AREAS_PROTEGIDAS; "gestao" nos SLUGS_RESERVADOS) — a sala de operação de
  TODOS os eventos: lista com busca e contadores, e a operação completa de cada um
  (atividades, campos extras, LGPD, capa, transmissão, inscritos e presenças por
  atividade, mural, exports, código do monitor). Usa SÓ as rotas dedicadas do evento —
  nunca o POST em bloco de /api/extensao. Quem entra: o dono da ação (o professor que
  registra organiza o próprio evento), a gestão da Extensão e a coordenação do módulo
  `eventos`; aluno não vê o cartão (participa pela página pública). A ação de extensão
  continua sendo a mãe do evento — proposta, aprovação e relatório no ARCHÉ EX, com
  atalhos cruzados nas duas pontas. **"Cadastrar novo evento" é um ASSISTENTE em 4
  passos** no Painel geral (título/curso → público/tema → datas/horários/local →
  revisão): cria a AÇÃO (status `submetida`, no shape do EX) e semeia `a.evento`,
  caindo na guia **"Dados do evento"** (abaixo de Início) — o formulário do projeto
  (a proposta da ação) com a régua `CAMPOS_PROJETO_EVENTO`/`faltaNoProjetoDoEvento`
  (lib/eventos.js): **publicar a página exige o projeto completo** — a trava é do
  SERVIDOR, na ATIVAÇÃO (além do `numeroAcao`), e a tela espelha com o sumário
  "faltam para a publicação". Coordenador só do módulo `eventos` vê os Dados em
  somente-leitura (a proposta é do responsável e da gestão da Extensão — o POST em
  bloco o recusaria de todo modo). **E-mail do setor: eventos@uniego.edu.br**
  (env EVENTOS_NOTIFY_EMAIL) — contato do hotsite, do texto LGPD padrão e da confirmação
  de inscrição, e destinatário do aviso automático quando uma página de evento entra no
  ar (`emailEventoAtivado`, fire-and-forget).
- **A página do evento tem BLOCOS** (`TIPOS_BLOCO`/`normalizarBlocos` em lib/eventos.js +
  guia "Blocos da página" no ARCHÉ EV, decisão do dono ago/2026): além da espinha fixa (capa,
  sobre, programação, inscrição), cada evento monta as suas seções — **submissão de
  trabalhos**, **anais**, **apoio e patrocínio**, **vídeo do YouTube**, **mídias sociais** e
  **texto livre** —, na ordem da lista e com
  a barra de seções grudada no topo da página (a página cresceu e precisa ser navegável).
  A **submissão é por LINK**: o sistema oficial é o **OJS da revista**, e receber resumo aqui
  também criaria duas filas para o mesmo trabalho — o bloco leva o autor até lá com prazos e
  normas à vista. Os **anais** aceitam esta e as edições anteriores (título, ano, ISSN, link),
  que é como o CONINT e as semanas de curso publicam. **Apoio** sai sempre no rodapé, agrupado
  por realização/patrocínio/apoio. Link só `http(s)` (`urlSegura` — um `javascript:` no
  hotsite seria XSS), e bloco invisível não vai à rota pública.
- **Palestrantes em banner rotativo** (pedido do dono, ago/2026): a vitrine sai da PRÓPRIA
  programação — não há cadastro de palestrante à parte —, com **foto, instituição e mini-bio**
  por atividade. O banner gira de 6 em 6 segundos, para no toque/foco, tem setas e miniaturas
  e respeita `prefers-reduced-motion`; a foto reaparece pequena na linha da programação.
- **Imagens do evento nunca viajam nos payloads** (mesma regra da capa): foto de palestrante e
  logotipo de apoiador ficam na configuração e saem por rota própria
  (`/api/publico/eventos/:slug/atividade/:aid/foto` e `.../apoiador/:iid/logo`); nos payloads
  vai só `temFoto`/`temLogo`. Por isso **salvar preserva a imagem gravada**
  (`preservarImagens` no server): campo ausente é "não mexi", campo vazio é remoção — sem
  isso, salvar a programação apagaria todas as fotos. O navegador **recorta a foto no quadrado
  a 400 px** e **reduz o logotipo a 320 px** antes de subir (tetos de 90 KB e 70 KB no
  servidor); imagem fora do formato ou grande demais é descartada sem derrubar a gravação.
- **Controle de frequência é escolha do EVENTO e, depois, de cada atividade** (decisão do
  dono, ago/2026): o assistente pergunta se o evento terá credenciamento. **Sem controle**
  (`evento.controleFrequencia: false`), ninguém para na porta e **todo inscrito conta 100%** —
  o check-in é recusado, e números e exports contam a inscrição como presença. **Com
  controle**, cada atividade escolhe o modo em `frequencia`: `nenhum` (sem controle nela),
  `entrada` (frequência única, o padrão) ou `entrada_saida` (início e fim). Na de início e fim
  o monitor **diz o que está registrando**: a etapa do credenciamento lista a atividade duas
  vezes (ENTRADA e SAÍDA) e a faixa mostra a fase — deduzir "segunda leitura = saída"
  transformaria em saída um crachá relido por engano, e o plantão de saída costuma ser de
  outro monitor. A saída grava `saidaEm` e a permanência; sem entrada registrada, a leitura de
  saída **registra a entrada** e avisa na tela.
- **QR de inscrição para projetar** (`/api/publico/eventos/:slug/qr-inscricao.png`, botão na
  guia Credenciamento): nem toda reunião dá para inscrever antes — o QR da página do evento
  vai ao telão no encerramento e quem estava ali se inscreve na hora. Tem versão em tela
  cheia (nome do evento + QR + endereço escrito) e download do PNG para cartaz e slide.
- **O relatório final exige FOTOS** (`lib/portfolio.js`, decisão do dono ago/2026): a entrega
  pede **no mínimo 5 fotos** no portfólio da ação, sem teto — o registro fotográfico é o que
  comprova a realização, e proposta e relatório sozinhos não se conferem depois. A régua é
  uma só (`faltamFotos`): a tela conta e avisa antes, e o servidor recusa a entrega sem elas.
  Foto é o anexo com tipo de imagem (nos registros antigos, pela extensão) — documento
  anexado continua entrando no portfólio sem contar para o mínimo. **O relatório continua
  sendo do ARCHÉ EX**: é da ação de extensão, com o PDF timbrado; o ARCHÉ EV leva até lá.
- **A credencial do participante** (decisão do dono, ago/2026): a inscrição já nasce
  **pré-preenchida para quem está logado** no ARCHÉ (`/api/me` no hotsite — só os dados da
  PRÓPRIA conta, com o aviso RECOLHIDO numa linha só, que abre no clique e traz a conta usada
  e o "não sou eu, limpar"; visitante externo segue com o
  formulário em branco, que é o público da página). O **e-mail de confirmação leva o QR
  embutido** (PNG inline por `cid:`, `multipart/related` no mailer) — é na caixa de entrada
  que a pessoa procura a credencial no dia. Na página da inscrição e logo após inscrever-se
  há **⬇ Baixar o QR** (PNG, vale offline) e **📅 Adicionar ao calendário** (.ics com
  lembrete na véspera). **Carteiras digitais**: o passe do **Google Wallet** está
  implementado e fica atrás das env vars (`GOOGLE_WALLET_ISSUER_ID`,
  `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY`, `GOOGLE_WALLET_CLASS_ID`) — sem elas a
  rota responde 501 e o botão nem aparece; o **Apple Wallet** exige certificado do Apple
  Developer Program (.pkpass sem assinatura o iPhone recusa) e por isso não tem botão
  enquanto a instituição não tiver o certificado.
- **Credenciamento: o mesmo QR não se lê duas vezes** (achado no teste do dono, ago/2026):
  a câmera varre a cada 350 ms e um crachá parado à frente dela era relido, enchendo a fila
  do plantão de "já credenciado". Cada credencial lida fica registrada NO APARELHO durante o
  plantão (chave = token + atividade, porque credenciar a mesma pessoa noutra atividade é
  leitura nova); repetição avisa na tela e não vai ao servidor, e a chave sai do registro se
  a chamada falhar. **Quem chega sem ter marcado a atividade é inscrito nela na hora**
  (havendo vaga; lotada, a presença vale igual e a tela avisa) — sem isso a presença ficaria
  sem a inscrição e a atividade fora do certificado. Dois modos, e cada um serve a uma
  situação, e a escolha é uma **ETAPA antes de a câmera abrir** (decisão do dono, ago/2026 —
  seletor solto sobre a câmera convidava ao erro caro: começar a ler sem reparar nele e
  credenciar meia oficina na entrada geral). A tela pergunta **"Onde você vai credenciar?"**
  com as atividades de HOJE em cima, a entrada geral e a opção do monitor VOLANTE; escolhida
  uma, a câmera abre e a atividade fica numa **faixa à vista** (com "trocar") — dali em
  diante toda leitura vale para ela. No modo volante a pergunta vem DEPOIS de cada leitura
  (inclusive do código digitado à mão). Evento sem atividade de inscrição própria pula a
  etapa: não há o que escolher.
- **Capa do evento: arte em alta, guardada pequena** (pedido do dono, ago/2026): o arquivo
  entra com até **10 MB** e o navegador o **reduz para 1600 px** (JPEG, teto de 900 KB)
  antes de subir — exigir que alguém reduza a arte antes era passar ao usuário um trabalho
  que o navegador faz sozinho. O teto do servidor (1 MB decodificado) é a rede de segurança:
  a capa viaja dentro do registro da ação, que é regravado inteiro a cada gravação. Na
  vitrine, evento **sem arte** não perde a faixa: sai o gradiente institucional com a
  inicial do nome, para os cartões ficarem do mesmo tamanho.
- **A gestão do evento acontece NO CARTÃO** (decisão do dono, ago/2026): os dois atos
  mais frequentes da coordenação estavam espalhados — aprovar a ação ficava noutro setor
  (o ARCHÉ EX) e publicar, dentro de uma guia. Agora o cartão do Painel geral traz
  **"✓ Aprovar evento"** (só para a gestão da Extensão, quando ainda não há `numeroAcao`)
  e **"⏸ Despublicar evento"** quando a página está no ar; entre os dois, "Publicar
  evento" ou o que falta do projeto. **O Número da Ação não se digita**: sai da sequência
  oficial (`EXT-AAAA-NNN`, por ano, na ordem em que as ações são aprovadas).
- **Quem emite o Número da Ação é o SERVIDOR** (`POST /api/extensao/:id/aprovar`, só
  `gereEx`): até ago/2026 quem somava 1 na sequência era o formulário do ARCHÉ EX, pelo
  `/api/estado` — duas coordenações aprovando ao mesmo tempo liam o mesmo número e
  emitiam o MESMO. A emissão agora é feita dentro da fila de escrita das ações
  (`comAcoes`), num ato só, e a rota recusa aprovar o que já tem número. Foi o último
  uso do `/api/estado` na Extensão: `extensao-config-v1` é lida e gravada só no servidor.
- **Devolução da proposta é um CICLO** (`POST /api/extensao/devolver` e `/reenviar`,
  decisão do dono ago/2026): devolver era meio caminho — a PROPPEX escrevia o motivo e
  ele esperava o professor entrar no portal por acaso; e, quando entrava, não tinha como
  corrigir, só submeter outra do zero (duas ações na base, histórico perdido). Agora
  **devolver avisa por e-mail** com o motivo (`emailPropostaDevolvida`), a proposta volta
  ao formulário **com tudo preenchido** ("Corrigir e reenviar") e o reenvio devolve a
  MESMA ação à fila. Cada ponta é rota do servidor, com o dono certo: **devolver é da
  gestão**, **reenviar é de quem submeteu** — o formulário não muda situação (o POST de
  quem não gere já preserva `status`, `numeroAcao` e `apreciacao`). O vaivém fica em
  `devolucoes` e aparece recolhido na ação: é o que explica, meses depois, por que uma
  ação demorou. E-mail que falha não trava a devolução — o motivo já está gravado.
- Fluxo da Extensão: proposta → aprovação (nº `EXT-AAAA-NNN`) → relatório final →
  participantes (3/3 completa) → certificados → registrada. Não alterar o formato do nº.
- **Ações migradas do processo em papel** (`subirAcoesMigradasExtensao` + `LOTES_EXTENSAO`,
  um arquivo em `dados/` e uma marca `sys-ex-lote-*` por lote): entraram transcritas dos
  documentos das coordenações a Semana de Enfermagem 2026 (168 participantes) e, em
  ago/2026, o lote `ex-lote-eventos-2026.json` — **Abril Laranja** (Med. Veterinária, 73
  inscritos + 10 na organização), **Encontro Família UNIEGO** (Ação Comunitária, só a
  proposta: fica `aprovada`, aguardando relatório e listas) e **III Semana de Ciências
  Agrárias & 43ª Semana SENAR** (Agronomia, 307 inscritos). O número é emitido na migração
  pela MESMA sequência oficial da aprovação (`extensao-config-v1`) — número não se inventa
  — e a apreciação registra o nº do sistema anterior (206719, 206734, 206733, 206731).
  Nunca sobrescreve ação existente. **Ação de papel NÃO vira evento** (decisão do dono,
  ago/2026): elas nascem com `origemPapel: true` (`marcarAcoesDePapel` carimba as que já
  estavam gravadas) e o ARCHÉ EV as omite do seletor e do bloco "Ações sem evento" — o EV
  é dos eventos geridos DENTRO do sistema (página pública, inscrição online,
  credenciamento); o que correu por fora se presta contas pelo ARCHÉ EX, com proposta,
  relatório e listas.
- **Atraso do relatório e ciclo na Extensão** (guia Relatórios): o **ciclo de uma ação é o
  ano em que ela ENCERRA** (`anoDaAcao`, por `periodoFim`) — é o que a PROPPEX usa para
  fechar o exercício —, e o filtro por ciclo se monta das próprias ações. Ação aprovada com
  o período encerrado e sem relatório é `pendente` (`statusReal`); `atrasoRelatorio` conta
  os dias corridos desde o encerramento. Na guia Relatórios a lista vem **do mais atrasado
  para o menos**, com os dias ao lado, e a gestão vê antes de tudo **quem deve o quê**
  (`quemDeveRelatorio`), agrupado por responsável: a cobrança automática já manda o e-mail
  (lib/cobranca.js), o que faltava era enxergar de quem se está esperando sem abrir ação
  por ação. O bloco é só da gestão — o professor vê as suas na própria lista.
- Uploads e estado são organizados **por curso** no Google Drive — preservar os prefixos
  usados em server.js (`extensao/<curso>/…`, `dossie/<curso>/…`,
  `atas/<curso>/<órgão>/<ano>/` e `atas/institucional/<órgão>/<ano>/`).
- Estado do app em chaves `/api/estado`; chaves `auth-*`, `sys-*`, `atas-*`, `ic-*` e
  `ex-*` são internas e invisíveis pela API — quem guarda dado com recorte por pessoa
  precisa ficar fora do `/api/estado`, senão a lista inteira sai por ali. Toda
  leitura/gravação passa por `/api/atas/*`, `/api/ic/*` e `/api/extensao`.
- **As ações de extensão saíram do `/api/estado`** (ago/2026): elas guardam CPF, telefone
  e e-mail de participantes, e na chave pública qualquer conta aprovada baixava a base
  inteira — exposição que cresceu quando o cadastro passou a ser aprovado sozinho. Agora
  vivem em `ex-acoes-v1` (interna), com `GET /api/extensao` devolvendo só o que a pessoa
  pode ver (professor: as suas, por `criadoPor` ou `proposta.respEmail`; gestão do módulo:
  todas) e `POST /api/extensao` gravando **uma a uma, só as permitidas e sem apagar as
  ausentes** — a lista do cliente é um recorte, e salvar não pode sumir com a ação alheia.
  Número da ação, situação e apreciação são da gestão: no POST de quem não gere, esses
  campos vêm do que está gravado. `migrarAcoesExtensao` move a base uma vez e esvazia a
  chave antiga (deixá-la cheia manteria o vazamento).
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
  DA SESSÃO, não os do semestre corrente (`/api/atas/pauta-regulatoria?data=…`). Duas
  regras existem para o checklist não travar quem regulariza: (1) o cumprimento é
  **relativo à data da sessão** — `registrosDaPauta` corta o que foi registrado depois
  dela, senão uma sessão de março apareceria com o tema "já cumprido" por causa de uma
  ata de junho, e sem caixa para marcar; (2) **nenhum tema fica fora do alcance** — os
  cobrados no semestre vêm em destaque e os demais (anuais do outro semestre) num bloco
  à parte, aberto por padrão nas retroativas. O checklist lembra o que o semestre cobra;
  quem diz o que a reunião tratou é a ata.
- Fluxo da IC (ARCHÉ IC): **rascunho → submetido → aprovado (em execução) → concluído**,
  com desvios para `devolvido` (volta a ser editável) e `reprovado`. O protocolo
  `IC-AAAA-NNN` sai na submissão e nunca se repete. Submetida, a **proposta fecha**;
  cronograma segue editável pela orientação. O **cronograma se preenche por MÊS** (lista
  de 1 a 12, rotulada com o mês da vigência): o que se grava continua sendo data — dia 1
  do mês inicial, último dia do mês final —, para atraso, tela de Cronograma e PDF
  seguirem iguais. **A proposta não pede aluno**: a indicação
  acontece DEPOIS da aprovação, dentro do projeto — nome, curso, período, e-mail e
  telefone. A proposta também **não pede datas nem os dados da orientação**: a vigência
  é a do CICLO, igual para todos (setembro → agosto; `EDITAL.vigencia` entra como padrão
  em `normalizarProjeto`), e nome, titulação, telefone, Lattes e CPF de quem submete
  saem do PERFIL (`/perfil/`) na criação. O card Orientação só aparece na inclusão
  manual (a coordenação identifica o professor) e no projeto já aberto. Ao salvar, **o aluno recebe o convite por e-mail** (`convidarAlunosIC`) com o
  link de entrada e a lista do que ter à mão; ele cria o usuário e **ele mesmo** faz o
  cadastro. **Documentos e conta são do aluno** (`alunosVisiveis`): a orientação vê só o contato
  que indicou e o sinal `dadosCompletos`; a gestão vê tudo (contrato); o formulário da
  orientação nunca sobrescreve o que o aluno gravou (`CAMPOS_DO_ALUNO_PROTEGIDOS`, no
  server). Os alunos que vinham nas propostas
  importadas foram apagados de vez (`sys-ic-alunos-zerados-v1`), e os cronogramas do
  edital 01/2026 foram enquadrados na vigência set/2026 → ago/2027
  (`sys-ic-cronograma-vigencia-v1`). Validados todos os relatórios
  finais, o projeto passa a concluído. A tela de Cronograma reúne **todos os projetos
  num só lugar**. Não há guia de bolsas nem de comunicação — a bolsa é um campo do
  aluno indicado.
- **O setor pelos olhos do ALUNO** (decisão do dono, ago/2026): indicado, ele recebe o
  convite por e-mail e encontra **duas guias suas** — **Projetos** (onde ele está:
  orientação, vigência, prazos dos relatórios) e **Bolsa** (o cadastro do contrato).
  O cadastro é **da pessoa, não do projeto**: `POST /api/ic/meus-dados` grava em TODOS
  os registros dele de uma vez (quem participa de dois projetos não digita o RG duas
  vezes; a rota antiga `/:id/meus-dados` faz o mesmo). Campos: nome, CPF, **RG**,
  **data de nascimento** (a idade se calcula, `idadeEm` — não se pergunta duas vezes),
  **endereço**, telefone (WhatsApp), **vínculo empregatício** (`sim`/`nao` + onde;
  branco é "não respondeu", que é pendência) e banco, agência, conta e Pix. O que
  fecha o cadastro é `faltaNoCadastroDoBolsista` — **uma conta só**, usada na tela do
  aluno, no `dadosCompletos` da orientação, na pendência `bolsista-incompleto` e no
  termo. O nome ele pode corrigir (a indicação é digitada pelo professor), mas nome em
  branco não apaga o que existe — é a chave dos certificados antigos.
- **`aluno` é função na instituição** (`FUNCOES` em lib/auth.js): sem ela o bolsista
  convidado ficava preso na etapa de completar o perfil, tendo de se declarar
  "professor" ou "outro". Não pede titulação (`SEM_TITULACAO`), e a barra do topo o
  chama de **Estudante**, não de "Docente".
- **Termos de Compromisso** (`lib/termos.js` + `gerarTermoCompromissoPdf`): o texto **não
  foi criado aqui** — são os quatro modelos institucionais que a PROPPEX já usava em .docx
  com mala direta, transcritos cláusula a cláusula. São quatro porque as obrigações
  diferem: **CNPq** (20h/semana, conta no Banco do Brasil, devolução ao CNPq, cláusulas de
  PIBIC e PIBITI), **bolsa UNIEGO** (12h, conta livre, devolução à instituição),
  **voluntário/PVIC** (8h, sem bolsa e **sem conta bancária no documento**) e o do
  **orientador** (um por professor, com os títulos que ele orienta). Mudar redação é
  mexer em `lib/termos.js`; os geradores só desenham. O que o Word preenchia à mão o
  ARCHÉ preenche do registro — o aluno informa na guia Bolsa, a orientação vem do perfil.
  Os prazos que o modelo trazia escritos ("Relatório Parcial em março/26") saem do
  EDITAL, e o timbre é o da época (`marcaEm` pela vigência). Campo em branco sai como
  linha pontilhada — o termo se imprime e completa-se à caneta.
- **Publicação dos termos** (`ic-termos-publicados-v1`, `POST /api/ic/termos/publicar`,
  decisão do dono ago/2026): a gestão emite o **lote** para imprimir quando quiser
  (`GET /api/ic/termos.pdf?tipo=bolsista|orientador|todos`), mas a **cópia digital de cada
  um** (`GET /api/ic/termo.pdf?projeto=`) só aparece para aluno e orientação **depois que
  a coordenação publicar** — a solenidade de assinaturas ainda vai ser marcada, e um termo
  circulando antes dela viraria documento assinado fora do ato. Publicar e recolher são um
  clique, na guia Bolsistas e Voluntários. Nas vias digitais entram as **assinaturas
  digitalizadas** do pró-reitor e do reitor (o mesmo `sys-assinaturas-v1` dos
  certificados); a do aluno é a que se colhe na cerimônia.
- **Quatro acessos na IC** (`papelNoProjeto` em `lib/ic.js`), e três deles nascem do
  próprio projeto — não há cadastro de papel à parte:
  1. **gestão** — pró-reitor e coordenação de pesquisa (gestor geral ou coordenador do
     módulo `pesquisa`): vê tudo, designa avaliadores e decide o mérito;
  2. **orientador** — submete, indica alunos, mantém o cronograma e valida os
     relatórios dos seus alunos;
  3. **aluno indicado** — envia os relatórios **parcial e final**; quem valida ou
     devolve é a orientação, nunca o próprio aluno nem a orientação no lugar dele;
  4. **avaliador ad hoc** — designado pela gestão **projeto a projeto**, dá parecer
     durante a seleção (sete critérios com teto de pontos somando 100 + recomendação;
     a nota do parecer é a soma) ou recusa por impedimento. Não participa da execução:
     cronograma e relatórios não aparecem para ele.
- **Edital 01/2026** (`lib/edital.js`): as regras que o sistema precisa conhecer viram
  catálogo — trocar de edital é mexer nesse arquivo, preservando os `codigo`, que são
  a chave do que já está gravado. Três **linhas** (IC, IT, IE) e seis **modalidades**:
  PIBIC/CNPq e PIBITI/CNPq (**só doutor**), PIBIC/UNIEGO e PIBITI/UNIEGO (R$ 350,
  **mestre para cima**), PROBEX/UNIEGO (R$ 350, **especialista** — a única bolsa do UNIEGO
  que não exige mestrado) e **Voluntário** (`especialista`), que é UM só e serve
  às três linhas (`linha: null`) — sem bolsa não há por que separar IC, IT e IE. As três
  voluntárias antigas (`pvic-`/`pviti-`/`pvie-uniego`) resolvem para ela por `HERANCA`.
  As modalidades são o cruzamento linha × fomento,
  que são o cruzamento linha × fomento: o professor escolhe a linha e, se quiser, a
  modalidade pretendida; a coordenação marca na seleção se houve **bolsa do CNPq, bolsa
  do UNIEGO (R$ 350) ou voluntário**, e a modalidade efetiva (`modalidadeEfetiva`) sai
  daí — marcar bolsa também marca os alunos como bolsistas. Cada modalidade cobra a
  **titulação mínima** do item 4.4 (PIBIC/CNPq exige doutor; as voluntárias, especialista),
  e a titulação chega como texto livre ("Doutora", "Dr.") — `normalizarTitulacao` resolve.
- **Pontuação da produção acadêmica** (`pontuarProducao`): réplica da planilha oficial do
  edital — 30 itens em 3 blocos, no período de 2022 a 2026 (item 7.3; o aviso na tela sai
  de `producaoDe`/`producaoAte`). A escala Qualis inclui **A3 e A4**, que faltavam na
  planilha publicada: entraram com peso ENTRE os vizinhos (3.6 e 3.5), sem alterar
  nenhum peso já existente — mudar um peso mudaria o CL já apurado. **Não há teto**
  (decisão do dono, ago/2026): limite empilhava professores no mesmo número e o empate
  saía no critério de desempate, não na produção — cada bloco soma o que somar e o
  currículo é a soma dos três. Fica no projeto, mas é do coordenador — **atrelada à pessoa por e-mail OU
  CPF** (`producaoDoOrientador` em lib/ic.js): o formulário do próximo projeto abre já
  preenchido com a planilha da última submissão (`producaoAnterior` em `/api/ic/meta`),
  editável para atualizar o que foi publicado no meio tempo. Na **inclusão manual**, a
  planilha que entra é a do professor em nome de quem se inclui — digitado o e-mail ou o
  CPF dele, a tela busca em `GET /api/ic/producao-anterior` (só gestão; a rota devolve
  planilha e origem, nada além) e nunca sobrescreve o que a gestão já tiver digitado.
  A planilha pode ser preenchida depois da submissão.
- **Classificação por SOMA** (`notaClassificacao`, decisão do dono em ago/2026): a nota
  final é **NP + CL** — NP é a nota do projeto (0–100: sete critérios com teto
  de pontos em `CRITERIOS_AVALIACAO`, a nota do parecer é a soma; entre pareceres vale a
  média) e CL é a pontuação da planilha **em valor absoluto e sem teto**.
  Currículo sozinho não classifica: sem NP não há nota final (null, nunca zero). Há
  **dois quadros**: primeiro só os professores **doutores** (bolsa CNPq exige doutorado),
  depois o geral com todos — doutores inclusive (`classificarProjetos`; empate resolve
  por NP, depois protocolo). Os 4 códigos antigos de critério foram preservados.
- **Nota atribuída pela coordenação** (`notaDireta`, `POST /api/ic/:id/nota`, só gestão):
  a seleção de 2026 correu fora do sistema, então a gestão atribui a nota do projeto
  (0–100) sem formulário — ela tem **precedência** sobre a média dos pareceres, fica no
  histórico (sigilosa) e some da visão do avaliador e da orientação. `{ nota: null }`
  desfaz. Nos próximos editais o caminho é o parecer pelo sistema.
- **Pareceres do edital 01/2026, transcritos** (`notaTranscrita` em lib/ic.js +
  `aplicarAvaliacoesTranscritas` no server, `dados/ic-avaliacoes-01-2026.json`, marca
  `sys-ic-avaliacoes-01-2026`): os avaliadores pontuaram os **mesmos sete critérios** numa
  planilha e escreveram o parecer de cada projeto. Isso entra em `notaDireta`, agora com o
  detalhe junto — critérios, recomendação e o texto do parecer —, casado pelo **protocolo**.
  A nota **não é lida** da planilha: é sempre a SOMA dos critérios (professor que digitou o
  total à mão não pauta a nota), e critério faltando descarta o registro inteiro. Não
  sobrescreve nota já atribuída no sistema nem projeto com parecer entregue por aqui, e o
  registro fica sigiloso como qualquer parecer. **Transcrever não decide**: aprovar ou
  reprovar continua sendo ato da gestão, projeto a projeto — é a decisão que marca o
  projeto como avaliado e libera a publicação do resultado.
- **Certificados da IC** (`lib/certificados.js` + `gerarCertificadoPdf`; guia Certificados,
  sempre COM LOGIN — decisão do dono, ago/2026): quem tem direito ao quê sai dos próprios
  projetos, sem cadastro à parte — o aluno de um projeto **concluído** ganha o certificado
  daquele ciclo, e quem orientou ganha **um por aluno orientado**. O vínculo é pelo **CPF**
  (é o que reúne numa conta só quem participou de mais de uma edição), com o e-mail como
  segunda chave e o **nome** como terceira — esta valendo só para registro sem CPF nem
  e-mail, que é o caso dos ciclos transcritos dos resultados publicados. O documento sai
  em paisagem com o **timbre da época** (`marcaEm` pela data de encerramento da vigência:
  FACEG até 04/09/2025, UNIEGO depois) e um código de validação derivado do que ele
  afirma. Assinam o **pró-reitor e o reitor** — só no certificado a assinatura entra
  **digitalizada**. As imagens são **enviadas pela própria tela** (guia Certificados, card
  "Assinaturas do certificado", só gestor geral) e ficam no estado interno
  (`sys-assinaturas-v1`, base64), NÃO no repositório: em produção o disco é efêmero e
  trocar de reitor não pode exigir um deploy. Sem imagem, sai a linha em branco e nada
  quebra; os demais documentos seguem para assinatura à mão. A gestão avisa por e-mail, ciclo a ciclo (`POST /api/ic/certificados/avisar`),
  cruzando o nome com os perfis para achar quem dá para avisar. Os bolsistas de **2023, 2024
  e 2025** entraram com CPF, e-mail, telefone e conta pelos **termos de compromisso
  assinados e pelos formulários de indicação** (`dados/ic-edital-01-*-alunos.json`, marcas
  `sys-ic-alunos-*` — um arquivo por RODADA, com o `lote` declarado dentro do JSON),
  casados ao projeto pelo orientador e pelo título do plano; a migração **completa** o
  registro que já existe (o nome veio do resultado publicado) sem sobrescrever campo
  preenchido. A r2 de 2025 completou telefone e dados bancários da graduação. **CPF que
  não valida não entra** (Edileusa/2024 e Anna Gabrielly/2025 vieram errados da fonte — o
  aluno corrige na guia Bolsa). 2022 não tem alunos registrados.
- **ICEM — Iniciação Científica no Ensino Médio** (`lib/em.js` + guia "Ensino Médio" da
  gestão): **outro programa**, com outra lógica — o bolsista de EM **ACOMPANHA** projetos
  de pesquisa para conhecer os cursos, a ciência e o UNIEGO, e **troca de projeto quando
  quiser**. Por isso o registro é DA PESSOA (`ic-em-v1`, chave interna), com **trajetória**
  de acompanhamentos que nunca se apaga — o vigente é o trecho sem `ate`. Turmas por edital
  próprio (série 02/AAAA: 02/2024, 02/2025, 02/2026-ICEM; PDFs em `public/ic/docs/`, e os
  editais aparecem POR ANO na guia Editais e na vitrine `/ic/`, ao lado dos 01/AAAA),
  bolsas **12 CNPq (R$ 300) + 12 UNIEGO (R$ 150)** com cota travada na rota, mais
  **voluntário sem cota**. Relatório é **simplificado** (um por turma) + **CONINT** em
  outubro. **O bolsista de EM TEM conta no portal** (decisão do dono, ago/2026, revendo a
  anterior): a chave é o E-MAIL do registro (`souBolsistaEM` abre o setor até para conta
  pendente; perfil `em` na SPA → guia "Meu ICEM"). Ele **escolhe o curso e o projeto** que
  acompanha (`POST /api/ic/em/meu/projeto`, só turma vigente e ativo; troca quando quiser)
  e **entrega os relatórios** (`/api/ic/em/meu/relatorio`): a turma VIGENTE entrega
  **parcial e final**; as ANTIGAS, **só o final** — e a entrega formaliza a conclusão
  (`relatoriosExigidos` em lib/em.js). O formulário tem **3 campos** (decisão do dono,
  ago/2026): atividades da vigência, motivação para a carreira acadêmica e **curso do
  UNIEGO pretendido** (lista de CURSOS + "outro que o UNIEGO ainda não tem" →
  `cursoOutro`) — **mais o questionário de avaliação do programa** (ago/2026, transcrito
  do formulário da PROPPEX: `CRITERIOS_AVALIACAO_EM`/`ESCALA_AVALIACAO_EM`/
  `RECOMENDACAO_EM` em lib/em.js): 7 perguntas na escala 0–5 (**o 0 é "não se aplica" —
  toda linha se responde**), a recomendação da IC Júnior (sim/não/em partes) e as
  abertas (aprendizado e sugestões, opcionais). `avaliacaoEMCompleta` é a régua: o
  envio do aluno é recusado sem as 7 respostas + a recomendação; o registro de entrega
  em papel pela gestão não as cobra. **Quem valida é a PROPPEX**, não a orientação
  (`POST /api/ic/em/:id/relatorio/validar`, validado|devolvido com comentário; validado
  não se reenvia). Registro legado com `relatorio.texto` migra para o FINAL
  (`normalizarRelatoriosEM`). A gestão exporta a turma ou UM bolsista em
  `GET /api/ic/em/bolsistas.xlsx?turma=&bolsista=` (botões na guia, com o quadro "Dados
  do aluno" no cartão). A turma 2025/2026 foi **alinhada pelos 24 termos assinados**
  (`completarTurmaEM2025`, dados/ic-em-2025-termos.json): completou registros, incluiu
  Ellisa Vitórya e Letícia Lopes (termos manuscritos; CPFs inválidos na fonte ficaram de
  fora, como o da Anna Gabrielly) e corrigiu a bolsa de Rebeca (UNIEGO) e Anna Júlia
  (CNPq), fechando 12+12. `criarPreCadastrosEM` deixa o perfil pronto e aprovado;
  `convidarTurmaEM2025` envia o convite do relatório final UMA vez no arranque (marca só
  grava com envio bem-sucedido — sem credencial de e-mail, tenta no próximo deploy).
  O convite manual segue na gestão (`POST /api/ic/em/convidar`, por turma,
  registro em `sys-ic-em-convites-v1`; `emailConviteEM`). Os DADOS continuam digitados
  pela gestão (bolsa, situacao, cadastro), e o termo (5º modelo em lib/termos.js,
  `termoDoAlunoEM`) sai com o **Anexo 01 — autorização do responsável** na página
  seguinte, assinado por aluno, responsável e coordenação de pesquisa (`gerarTermosEMPdf`). As turmas sobem no arranque (`subirTurmasEM`,
  `dados/ic-em-{2025,2026}-turma.json`): a trajetória aponta `origem.lote/id` do projeto
  (o id real é de cada ambiente e resolve-se na importação). A remoção dos 22 dos projetos
  de 01/2025 (`removerAlunosEnsinoMedio`, `sys-ic-em-removidos-v1`) usa
  `dados/ic-em-2025-alunos.json` como lista — não apagar.
- **Exportar a lista de projetos** (`GET /api/ic/projetos.xlsx` e `.pdf`, só gestão;
  botões na guia Gestão): a planilha traz uma linha por projeto (protocolo, situação,
  título, curso, linha, modalidade, orientação com titulação e e-mail, grupo, alunos,
  bolsa, NP/CL/nota final e vigência) e o PDF traz a **ficha completa de cada projeto**,
  uma por página, com sumário. Os dois respeitam **os mesmos filtros da tela** — exporta-se
  o que se está vendo, não a base inteira.
- **Vitrine pública** (`/ic/` + `GET /api/publico/ic`): acesso livre com os editais, os
  documentos e a lista simplificada (título, curso, orientador, bolsista, modalidade) —
  nunca e-mail, CPF, nota ou dado bancário. Campos em branco enquanto o processo corre;
  a página se atualiza sozinha — mas o DESFECHO segue o embargo da publicação (achado
  de ago/2026): sem resultado publicado, nada de "Não aprovado" nem de bolsa na lista;
  com o preliminar, sai só aprovado/não aprovado; nomes de bolsistas e contagem de
  bolsas, só com o final. Resultado de edital ENCERRADO redireciona para o PDF
  original publicado (`RESULTADOS_EDITAIS`); o vigente sai do gerador.
- **Arquivo histórico** (`LOTES_HISTORICOS`, dados/ic-edital-01-2022…2025.json): os
  ciclos anteriores transcritos dos resultados publicados, importados no arranque como
  projetos CONCLUÍDOS — com `modalidadeHistorica` (PIBIC/FACEG etc., que não se
  recalcula pelo catálogo atual) e os bolsistas nomeados quando a fonte os traz.
  Concluído não tem prazo correndo (`prazosRelatorios` só vale para `aprovado`).
- **Depois da aprovação, o quadro de alunos só CRESCE pela tela da orientação**
  (decisão do dono, ago/2026, no ramo de execução do POST /api/ic): indicar aluno novo
  segue livre, mas **remover** aluno — ou trocar o e-mail de quem já foi indicado, que
  equivale a remover — é ato da **Substituição de bolsista**; e-mail digitado errado se
  corrige com a PROPPEX. A **marca de bolsista acompanha a concessão do fomento**: nos
  já indicados ela é preservada da base, e no aluno novo sai da concessão do projeto —
  a caixa do formulário não manda. A GESTÃO segue com a mão livre (edita pelo ramo
  geral). A tela espelha a regra: sem ×, e-mail e caixa travados nos já indicados
  ("via substituição" no lugar).
- **Substituição de bolsista** (`POST /api/ic/:id/substituicao` + decisão da gestão em
  `/:sid`): a orientação SOLICITA a troca — quem sai, o novo aluno (nome, curso,
  período, e-mail, telefone) e o motivo — e a coordenação aprova ou recusa. Aprovada,
  o sistema troca os vínculos e convida o novo bolsista por e-mail. O pedido inteiro
  fica registrado no projeto; o aluno não vê o quadro (assunto da orientação).
- **Guias da seleção** (SPA): **Projetos** (só gestão) traz as duas classificações de cada
  edital em tabela (posição, protocolo, título, professor, titulação, categoria de
  submissão — a LINHA: IC, IT ou IE —, NP, CL, total); **Editais e Resultados** é de
  TODOS os usuários do setor e traz os documentos para download — o edital como publicado
  (`DOCUMENTOS_EDITAIS` em lib/edital.js → `public/pesquisa/docs/`) e o resultado em PDF
  (o `resultado.pdf` sai por um leitor neutro de gestão: todo mundo baixa o mesmo
  documento). A guia **Cronograma** é só do professor e do aluno; para a gestão, o
  Painel mostra o dashboard de relatórios em atraso e a guia **Relatórios** vira o radar:
  a lista dos projetos em execução com EM DIA/ATRASADO — o detalhe se lê no projeto.
  A guia **Bolsistas e Voluntários** (professor e gestão) acompanha por PESSOA e por
  CICLO (edital): cada aluno com as metas do cronograma sob sua responsabilidade, a
  situação dos relatórios frente aos prazos e o andamento do contrato; para a gestão,
  agrupada por orientador.
- **Editais e Resultados por ANO** (pedido do dono, ago/2026, no setor E na vitrine
  `/ic/`): **um quadro por ano** (2026, 2025…) com os dois processos dentro — o edital
  01/AAAA (graduação) e o 02/AAAA (ICEM), cada um com o edital, o resultado preliminar e
  o final. O rótulo dos seletores de ciclo diz os dois nomes ("Edital 01/2025 · ciclo
  2025/2026", `rotuloCiclo`), porque o número do edital e o ano da vigência não coincidem.
- **Resultado do ICEM em duas fases** (`gerarResultadoEMPdf` em lib/pdf.js, chave
  `ic-em-resultado-publicado-v1`, `POST /api/ic/em/resultado/publicar`): o mesmo desenho
  da graduação — preliminar = a lista dos selecionados SEM bolsa; final = quadros por
  bolsa (CNPq, UNIEGO, voluntário). **Sem valor de bolsa, CPF ou contato** (são menores e
  o documento é público). A publicação é **na própria guia Editais e Resultados** (o
  quadro do Painel é só da graduação); prévia com `?fase=` é só da gestão
  (`GET /api/ic/em/resultado.pdf`), e o público baixa a fase publicada em
  `GET /api/publico/ic/em/resultado.pdf`. Turma antiga com PDF arquivado (`resultado` em
  TURMAS_EM) redireciona para o documento da época e **não se republica**.
- **Chamada manual dos relatórios** (`POST /api/ic/chamada-relatorio`, botão 📣 na guia
  Relatórios, aba IC): dispara AGORA o mesmo e-mail da cobrança semanal
  (`pendenciasCobrancaIC`, extraída de `varrerCobrancaIC`), para o ciclo selecionado —
  aluno recebe o de enviar, orientação o de validar. Simula antes (a lista de quem será
  chamado) e o envio carimba `sys-ic-cobranca-relatorios-v1`, para a varredura da hora
  seguinte não repetir. A aba EM já tinha a sua (`/api/ic/em/chamada-relatorio`).
- **Janela de revisão dos chamamentos por e-mail** (`janelaEnvio` na SPA, decisão do dono
  ago/2026): NENHUM envio em bloco sai num clique só. Os cinco fluxos — chamada IC,
  chamada EM, convite EM, convite aos professores e aviso de certificados — abrem uma
  janela com os destinatários, a **prévia do e-mail como ele sai** (a do primeiro da
  fila, num iframe sandbox) e o campo **"Mensagem da coordenação"**, que entra destacada
  no topo do e-mail de todos (`blocoMensagem` em lib/mailer.js; as rotas aceitam
  `mensagem` e a simulação devolve `previewHtml`). "Atualizar prévia" re-simula com a
  mensagem digitada. O texto padrão continua nos templates — a mensagem acrescenta, não
  substitui (o corpo é por pessoa: pendências, títulos e links são interpolados).
- **Visualizar relatório** (`verModeloRelatorio` na SPA, botões 👁 na guia Relatórios e
  na guia Ensino Médio, só gestão): pré-visualização dos formulários **como quem
  preenche os vê** — parcial e final do aluno da IC, painel de validação do professor e
  relatório do estudante do ICEM — montada dos MESMOS catálogos que alimentam os
  formulários de verdade (META.relatorioModelo e o modelo do EM), num modal com os
  campos travados. Nada se grava.
- **Prazos dos relatórios** (`prazosRelatorios`/`janelaRelatorio` em lib/ic.js, decisão do
  dono ago/2026): o PARCIAL **abre no 4º mês** da vigência (início + 3) e vence no 6º; o
  FINAL **abre no 10º** e vence no fim. Antes de abrir, o envio é **recusado**; depois de
  vencer, segue aceito e marcado atrasado (fechar de vez impediria a regularização).
  Projeto ATRASADO = prazo vencido com relatório faltando. A visão do projeto leva
  `prazoRelatorios` junto (verProjeto/rota :id) — é o que diz à tela quando o form abre.
  **Regularização de ciclo encerrado** (`REGULARIZACAO_RELATORIOS` em lib/ic.js, decisão
  do dono ago/2026): o ciclo 2025/2026 encerrou sem os relatórios no sistema, e a entrega
  REABRIU — no 01/2025 (graduação) o **PARCIAL e o FINAL**, os dois até **31/10/2026**
  (decisão do dono: o processo inteiro se regulariza pelo sistema — envio, validação e
  arquivo); o relatório da turma EM 2025/2026 até **30/09/2026** (`prazoRelatorioFinal`
  em TURMAS_EM). O projeto segue `concluido`; só as janelas listadas voltam a aceitar
  envio (e entram na cobrança semanal). **O Painel do ALUNO conta os projetos DELE, não
  os do ciclo vigente** (`meusDeAluno` em renderPainel): contar só o vigente dizia
  "nenhum projeto" a quem tem relatório do 01/2025 a entregar — e um banner aponta a
  guia Meus projetos quando há relatório a enviar. O vínculo do cadastro novo já é
  automático: aluno e orientador casam com o projeto por **e-mail OU CPF**
  (`papelNoProjeto`), conta `pendente` entra pelo convite (`participaDeAlgum`) e
  `vincularPorCpf` grava o e-mail da conta no projeto que o esperava. A guia
  Relatórios da gestão tem **duas abas — IC e EM** — e o selo por projeto diz a verdade:
  "sem aluno indicado" e "abre em …" vêm antes de qualquer "entregue" (um projeto sem
  aluno aparecia como entregue sem ninguém ter enviado nada). O Painel da gestão tem o
  quadro **"ICEM — evolução dos relatórios"** com seletor de turma, e a guia EM tem a
  **chamada de preenchimento** (`POST /api/ic/em/chamada-relatorio`) — vai a todo
  bolsista com relatório não validado, sem o filtro de "já convidado" do convite. As
  trajetórias da turma 2025/2026 vêm dos termos (a da Ellisa ficou ilegível no manuscrito
  e ela está sem projeto vinculado — decisão pendente da gestão).
- **Relatórios estruturados** (decisão do dono, ago/2026 — catálogos em lib/ic.js): o
  PARCIAL segue o roteiro institucional de 7 seções (`CAMPOS_RELATORIO_PARCIAL`; as 5
  primeiras obrigatórias, mín. 30 caracteres) com comprovantes anexáveis; o FINAL é um
  **artigo científico** em formato livre, nas normas da revista escolhida pelo aluno e
  pela orientação — anexado, com revista/ISSN/link obrigatórios (Qualis e fator de
  impacto se houver) — **mais a apresentação no CONINT** (pôster ou oral; o formulário
  avisa) e a mesma pergunta de **eventos/publicações** do parcial (`campos.eventos`,
  opcional — pedido do dono, ago/2026). Os relatórios carregam **três avaliações** (transcritas dos formulários da
  PROPPEX): o aluno responde a do PROJETO (5 perguntas sim/não/sem clareza) e a da
  ATUAÇÃO DO ORIENTADOR (7 critérios 0–5) — **obrigatórias nos DOIS relatórios**
  (decisão do dono, ago/2026) —; a orientação, ao
  validar o final, preenche a do DESEMPENHO DO ALUNO (7 critérios 0–5) + **parecer
  conclusivo** (sem restrições/com ressalvas/reprovado). **Sigilo cruzado**
  (visaoDoProjeto): o orientador não vê a avaliação que levou, o aluno não vê as notas
  nem o parecer sobre ele; a gestão lê os dois lados. Validar = "encaminhar à PROPPEX"
  (avisa pesquisa@); devolver exige comentário e reabre o envio para o aluno.
- **Projeto INTERROMPIDO no meio** (`encerramento` no relatório + `status: "encerrado"`,
  decisão do dono ago/2026): professor desligado no meio da gestão, aluno sem orientação,
  campo que se inviabiliza — o projeto não conclui nem se reprova, e ficava preso. Agora o
  **ALUNO relata a interrupção no relatório que estiver entregando** (parcial OU final: a
  interrupção pode acontecer entre um e outro), com **justificativa** (mín. 30 caracteres).
  Marcado o pedido, o relatório muda de natureza — **não se cobram** as seções do roteiro, o
  artigo da revista nem as avaliações: não há como exigir artigo de projeto que não correu.
  **Quem decide é a PROPPEX** (`POST /api/ic/:id/relatorio/:rid/encerramento`), nunca a
  orientação — no caso típico ela é justamente a parte ausente; e a validação comum do
  relatório some da tela enquanto o pedido espera. Aceito, o projeto passa a **encerrado** e
  o relatório fica validado como o registro da interrupção; recusado, o parecer fica no
  histórico e o relatório volta ao caminho normal. O pedido aparece no **sino** da gestão, e
  projeto encerrado não tem prazo correndo (sai da cobrança e do "atrasado").
- **A PROPPEX valida relatório EM NOME da orientação** (decisão do dono, ago/2026):
  orientadores desligados da instituição não voltam para validar, e o relatório do
  aluno não pode ficar refém disso. `podeValidarRelatorio` já aceitava a gestão; o que
  muda é que, validando quem NÃO é o orientador do projeto (papel `gestao` em
  `papelNoProjeto`), a avaliação do desempenho e o parecer conclusivo do FINAL viram
  **opcionais** — juízo de quem acompanhou o aluno não se exige de quem não acompanhou.
  O ato fica marcado: `validadoPelaGestao: true` no relatório (sobrevive à
  normalização) e "— pela PROPPEX, em nome da orientação" no histórico; o painel de
  validação avisa quando é esse o caso. Para o orientador de verdade, nada muda: as
  exigências continuam as mesmas.
- **Cobrança semanal dos relatórios de IC** (`varrerCobrancaIC` no server +
  `emailCobrancaRelatorioIC` no mailer): da abertura da janela até enviar E validar, o
  aluno recebe o lembrete de enviar/corrigir e a orientação, o de validar — um e-mail
  por pessoa com todos os itens dela, espaçados 7 dias
  (`sys-ic-cobranca-relatorios-v1`), varridos de hora em hora junto com a Extensão.
- **Exportação individual do bolsista** (`GET /api/ic/bolsistas.xlsx?aluno=<e-mail|CPF>`):
  a mesma planilha, recortada a uma pessoa — botão "Exportar dados do aluno" no cartão da
  guia Bolsistas (gestão), ao lado do quadro "Dados do aluno" com o cadastro do contrato.
- **Guia Bolsas** (só gestão): a distribuição das bolsas, feita **à mão** conforme a cota
  que a presidência liberar. Lista os projetos **aprovados** do ciclo em ordem de pontuação
  (NP + CL), em blocos por **dois critérios que decidem coisas diferentes**: a **titulação**
  (doutores, todos, especialistas) diz QUEM pode receber cada bolsa (item 4.4); a **linha**
  (Iniciação Científica, Inovação Tecnológica, Iniciação à Extensão) diz O QUE cada bolsa
  atende — PIBITI só existe para IT, PROBEX só para IE, e distribuir olhando só a titulação
  daria bolsa de linha errada. Cada bloco de linha diz quais bolsas são próprias dela; a
  coluna Linha aparece em todos. O mesmo projeto
  aparece em mais de um bloco de propósito (é assim que se compara dentro e fora do
  recorte), e a concessão é do **projeto**: marcar num bloco marca em todos, que é o que
  impede conceder duas bolsas ao mesmo. `POST /api/ic/:id/fomento` com `tipo` vazio
  **desfaz** a concessão — remanejar exige poder tirar de um para dar a outro. Bolsa CNPq
  em quem não é doutor pede confirmação (item 4.4).
- **Decisão da seleção em 4 saídas** (renderSelecao): aprovado com bolsa CNPq, aprovado
  com bolsa UNIEGO, aprovado sem bolsa ou reprovado — o front encadeia as rotas
  `avaliar` + `fomento`. Bolsa concedida abre a **Indicação do bolsista** no projeto:
  a orientação preenche CPF, telefone, banco, agência, conta e Pix de cada aluno
  bolsista (campos do aluno em `normalizarAluno`; nunca aparecem para o avaliador nem
  para os colegas de projeto). Falta de dado vira pendência `bolsista-incompleto`. A ficha
  só abre com o projeto APROVADO (resultado dado). A PROPPEX exporta tudo em
  `GET /api/ic/bolsistas.xlsx` (só gestão; botão na guia Bolsistas e Voluntários, por ciclo, nunca na
  Editais e Resultados, que é de todos) — as mesmas colunas do formulário antigo.
- **Decisão em lote** (`POST /api/ic/decidir-lote`, só gestão; fila no topo da guia Projetos):
  com 40 propostas com parecer, decidir uma a uma é abrir quarenta telas para repetir o
  mesmo clique. A fila lista as que **aguardam decisão**, na ordem da classificação, e
  aprova ou reprova as marcadas de uma vez — cada projeto passa pelo mesmo `podeAvaliar` e
  ganha a sua linha de histórico, e o que não puder ser decidido volta dito na resposta,
  com o motivo, em vez de falhar em silêncio. Em lote só cabem **aprovar e reprovar**:
  devolver é conversa com um professor, não ato de massa; e reprovar exige o motivo, que é
  o mesmo texto para todas — motivos diferentes pedem decisão caso a caso. **A bolsa fica
  de fora**: aprovar é o mérito, a cota vem depois, na guia Bolsas.
- **Ato de gestão × juízo de mérito** (`atoDeGestao` em lib/ic.js, decisão do dono em
  ago/2026): decidir a seleção, atribuir a nota apurada, conceder ou remanejar bolsa e
  designar quem avalia são **burocracia do processo** — o **gestor geral pratica todos,
  inclusive na própria proposta**. No edital 01/2026 o mérito foi julgado por parecerista
  **ad hoc**, fora do sistema: ele não se avalia, registra o que foi decidido. Sem isso as
  propostas dele travavam em nota, decisão e bolsa, e o edital não fechava. Cada ato assim
  fica marcado no histórico como **"sobre proposta própria"**, que é o que o torna
  defensável depois, e a tela diz o mesmo (`proprioProjeto` na rota do projeto; "sua
  proposta" na fila de decisão). **Coordenador de módulo NÃO tem a prerrogativa** — acima
  dele há quem decida —, e `podeDecidir`/`souParte` em `resumir` fazem a fila separar as
  propostas dele num aviso à parte, em vez de oferecer um botão que o servidor recusaria.
  O que continua vedado a quem é parte, **sempre e para todos**: **dar parecer** sobre o
  próprio projeto (`podeDarParecer`) — esse é o juízo, e ninguém o faz sobre si. O vínculo
  casa por e-mail **ou CPF**: a conta pessoal do pró-reitor cai na mesma regra.
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
- **Usuários do portal no Painel** (`GET /api/usuarios/resumo` + `quadroUsuarios`, só gestor
  geral): quantas contas o ARCHÉ conhece, quantas já **podem entrar**, quantas têm o
  **perfil completo** (a mesma régua de `faltaNoPerfil`, a que barra a entrada nos setores)
  e quantas estão **prontas** — com acesso e cadastro completo. É número do PORTAL inteiro,
  não da IC, e a rota devolve **só contagens**: nenhum nome, nenhum e-mail. A união de
  contas é a mesma do painel de usuários (`contasDoPortal`) — duas contagens diferentes de
  "quantos usuários temos" seria pior que nenhuma.
- **Panorama do ciclo no Painel** (`panoramaDoCiclo`, só gestão): o acompanhamento que
  antes exigia abrir projeto por projeto — **professores que já indicaram aluno** (sobre o
  total de aprovados), **alunos indicados**, **cadastros enviados** (quantos completaram os
  próprios dados) e quantos ficaram **sem e-mail** na indicação; mais a distribuição do
  edital por curso, por titulação de quem orienta (contando PESSOAS, não projetos), por
  linha, por situação e por bolsa concedida. As barras são de **uma cor só**: o que se
  compara é tamanho, e quem diz "quem é" é o rótulo da linha — cor por categoria obrigaria
  a consultar legenda para ler o gráfico. Tudo se calcula do que a tela já carregou.
- **Pendências** (`pendenciasDoProjeto`) não travam a submissão, mas aparecem em amarelo:
  aluno sem e-mail (não conseguirá enviar relatório), planilha de produção em branco,
  CEP/CEUA sem protocolo. O formulário do edital não coletou e-mail nem CPF dos alunos —
  por isso `validarProjeto` aceita aluno identificado só por nome e matrícula.
- **Inclusão manual pela coordenação** (`inclusaoManual`): quando a pró-reitoria defere um
  pedido de inclusão fora do prazo, a gestão abre o projeto **em nome de quem orienta** —
  o dono é o professor (é na conta dele que aparece e é ele quem toca), a coordenação só
  digitou. Exige e-mail **ou** CPF do orientador e um motivo, que fica no histórico e no
  resultado do edital ("inclusão deferida fora do prazo"). O avaliador ad hoc não vê a
  marca: ele julga a proposta, não como ela entrou.
- **A coordenação também dá parecer** (`podeDarParecer`): o edital prevê a análise da
  PROPPEX, e ela usa os mesmos sete critérios do ad hoc — sem precisar se designar. O
  parecer entra na média que forma a NP como qualquer outro e fica no mesmo sigilo: a
  orientação segue vendo só as contagens e a decisão.
- **Resultado do processo em PDF** (`gerarResultadoEditalPdf`, `GET /api/ic/resultado.pdf`):
  documento timbrado com o resumo do processo e a lista dos projetos daquele edital,
  apresentada **em quadros por categoria** (pedido do dono, ago/2026), com a ordem de mérito
  dentro de cada um. São **duas categorias diferentes, porque são dois momentos do
  processo**: no PRELIMINAR a categoria é a **LINHA** (Iniciação Científica, Inovação
  Tecnológica, Iniciação à Extensão) — a bolsa ainda não existe, e é com este documento que
  a PROPPEX vai à presidência definir a cota; no FINAL é a **bolsa concedida** (PIBIC/CNPq,
  PIBIC/UNIEGO, voluntário…). **Nenhum dos dois cita valor de bolsa** (pedido do dono,
  ago/2026): o valor é do edital e do termo de compromisso — num resultado, vira promessa
  que a cota pode desmentir. O **curso é coluna**, no
  lugar da coluna "Resultado", que virou redundante — o resultado é o título do quadro.
  **Os quadros de mérito (doutores e geral) saíram do documento**, nas duas fases: as
  mesmas propostas já aparecem nos quadros por categoria, com nota e em ordem de mérito.
  A classificação completa continua na tela, que é ferramenta de gestão. Filtra pelo
  campo `edital` do projeto — é o que faz o histórico dos editais antigos sair pelo mesmo
  lugar. **Proposta sem nota de projeto sai sem nota final**, nunca com zero: num documento
  oficial, zero seria nota, e o que existe é ausência de avaliação (por isso
  `notaClassificacao` trata `null` como faltante, não como 0).
- **O resultado do ciclo vigente só se divulga quando a gestão PUBLICAR**, em **duas
  fases** (decisão do dono, ago/2026 — `POST /api/ic/resultado/publicar`, chave
  `ic-resultado-publicado-v1`): o **preliminar** sai **só com os projetos aprovados**,
  sem bolsas — é a lista que a PROPPEX leva à presidência para definir as cotas; o
  **final** sai com a bolsa concedida a cada projeto (`fase` em
  `gerarResultadoEditalPdf`). Até publicar, professores e a página pública veem
  "Resultado em breve" (o gerador responde 403/404; `?fase=` não fura — só a gestão
  baixa as prévias). Os botões de publicação ficam no **Painel da gestão**, no quadro
  "Avaliação do ciclo" (avaliados/total), e só aparecem com **todos os projetos
  avaliados** — ou com uma fase já publicada, para dar o passo seguinte ou recolher.
  Os PDFs catalogados em `RESULTADOS_EDITAIS` são finais da época e ficam sempre abertos.
- **Ver como** (`visaoComo` no server): a coordenação abre o ARCHÉ IC pelos olhos de
  qualquer pessoa do setor — professor, aluno ou avaliador — para conferir o que ela
  enxerga. Não é atalho de permissão: o alvo é tratado como quem é (`gestao: false`),
  e as mesmas funções de recorte e sigilo valem, então a simulação não mente. É
  **somente leitura** — um middleware recusa qualquer escrita com `?como=`, senão o
  histórico do projeto diria que foi a pessoa quem mexeu. Quem ainda não tem conta
  pode ser simulado pelo CPF (`como=cpf:000…`), que é como o projeto importado o
  identifica: mostra o que ele encontrará ao se cadastrar. Há também as **visões
  genéricas** (`como=perfil:` + `orientador`, `aluno` ou `avaliador`, em
  `PERFIS_GENERICOS`): um professor, aluno ou avaliador ad hoc recém-chegado, sem
  projeto nenhum — a cara de cada um dos três acessos, sem os dados de ninguém.
  A escolha **não é mais uma caixa de seleção**: são quase 60 pessoas por edital, e a
  lista única virava rolagem. Um botão no topo abre uma janela com as visões genéricas
  em destaque e a **busca por nome ou e-mail** (abas por papel, Enter escolhe o
  primeiro, Esc fecha). As três listas do servidor (`pessoasDoSetor`) são fundidas numa
  só no cliente (`vcPessoas`): quem acumula papéis aparece **uma vez**, com as etiquetas
  de todos — antes saía repetido em cada grupo.
- **Pré-cadastro** (`criarPreCadastros` + `propagarCpfOrientadores`, marcas `sys-*`): a
  PROPPEX já sabe quem são as pessoas dos editais — nome, CPF e e-mail vieram do
  formulário e dos termos de compromisso. Em vez de esperar cada um digitar tudo, o perfil
  **nasce pronto** e marcado com `preCadastro: true`, com a conta já aprovada. Entrando
  com aquele e-mail, está tudo lá; entrando com OUTRO e informando o CPF, o pré-cadastro é
  **transferido** para a conta nova em vez de barrar por "CPF já cadastrado" — recusar
  deixaria a pessoa fora dos próprios projetos. Registro já reivindicado (alguém entrou e
  salvou) continua recusando, e a marca some na primeira gravação da própria pessoa.
  `propagarCpfOrientadores` espalha o CPF conhecido do professor pelos ciclos antigos
  (transcritos só com o nome), trocando o vínculo fraco por nome pela chave forte.
  O painel de usuários marca quem ainda não reivindicou.
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
- **Convite de cadastro aos professores importados** (`POST /api/ic/convidar-professores`,
  só gestão; botão na guia Gestão): um e-mail por pessoa (CPF), no endereço que ela
  digitou no formulário do edital (`origem.emailFormulario`), com os títulos dos seus
  projetos e o passo a passo — criar o usuário e **informar o CPF no perfil**, que é o
  que vincula os projetos à conta. `simular: true` devolve a lista sem enviar (é o que
  alimenta a confirmação da tela); quem já foi convidado só recebe de novo com
  `reenviar: true`; professor já vinculado (projeto com e-mail) nunca entra. O registro
  dos envios fica em `sys-ic-convites-professores-v1`, fora do `/api/estado`.
- **Anexos do formulário viram dado do projeto** (`aplicarAnexosIniciais`,
  `dados/ic-<lote>-anexos.json`): os cronogramas e planilhas de produção que os
  professores anexaram ao formulário foram lidos arquivo a arquivo e entram numa
  segunda migração de arranque (marca `sys-ic-anexos-<lote>`), chaveados pelo id do
  Drive gravado em `origem`. Nunca sobrescreve edição: o cronograma só troca se ainda
  for o genérico do lote, e a planilha só entra vazia. Atenção ao ler as planilhas do
  edital: **muitos professores digitaram a quantidade na coluna do total**, apagando a
  fórmula — nesses arquivos o total impresso soma quantidades, e a leitura detecta o
  modo pela coerência entre quantidade × peso e total (ver test/anexos.test.js).
- **Lotes sobem sozinhos no arranque** (`subirLotesIniciais`, `LOTES_INICIAIS`): cada
  arquivo de `dados/` é importado **uma única vez**, marcado por `sys-ic-lote-<nome>`.
  A marca é o que impede um deploy de ressuscitar projeto que a PROPPEX apagou de
  propósito — para reimportar de verdade, apague a marca ou use o botão da tela. Logo
  após a importação, `vincularPerfisIC` passa todos os perfis com CPF pelos projetos,
  para quem já está cadastrado não precisar fazer nada. Quem tem conta `pendente` (fora
  do `@uniego.edu.br`) é orientado, na tela de entrada, a informar o CPF no perfil —
  é o que abre o setor para ele.
- **O e-mail é o convite** na IC: indicar um aluno ou designar um avaliador dá acesso
  ao setor mesmo com a conta ainda `pendente` (`participaDeAlgum`), e só aos projetos
  em que a pessoa está. O convidado não abre projeto novo — submeter exige conta
  aprovada. Vale só para `/pesquisa`; nos demais setores `pendente` continua barrado.
- **Sigilo do parecer ad hoc** (`visaoDoProjeto` em `lib/ic.js`, aplicado no servidor
  em toda resposta que devolve projeto): a orientação e o aluno **nunca sabem quem
  avaliou** — some a lista de avaliadores e as linhas de histórico marcadas com
  `sigilo: true`. O que é sigiloso é **QUEM avaliou, não o que o parecer disse**. O
  avaliador **não vê o parecer dos colegas** (ancoraria o julgamento), nem relatórios,
  nem histórico, e recebe a proposta **sem os nomes** da orientação e dos alunos. Quem
  participa do projeto não pode avaliá-lo. Parecer entregue não se apaga: é prova da
  seleção.
- **Devolutiva da seleção** (`avaliacaoRecebida` em lib/ic.js; quadro recolhido sob cada
  projeto na guia Gestão — decisão do dono, ago/2026): a **orientação** recebe as notas por
  critério, a recomendação e o **texto do parecer** — sem devolutiva o professor não tem
  como melhorar a próxima proposta. Vem anônima (avaliação cega: é o anonimato que protege
  o parecerista) e reúne as duas origens sem distinguir por qual caminho a avaliação correu
  — a nota transcrita de fora do sistema (`notaDireta`) e os pareceres entregues por aqui,
  um item por parecerista. **Só a orientação**: o aluno entrou depois da seleção, e a
  proposta é autoria de quem a submeteu. Parecer ainda não entregue não vaza, e sem nada
  avaliado não há quadro. E **só DEPOIS da publicação do resultado** daquele edital
  (`resultadoPublicado`, com o registro `ic-resultado-publicado-v1` chegando em
  `u.publicados` por `quemOlha` no server): a devolutiva é parte do resultado, e resultado
  se divulga uma vez, para todos ao mesmo tempo. A gestão vê sempre — é ela quem publica.
- **Contestação da nota** (`janelaContestacao`/`podeContestar`, `POST /api/ic/:id/contestacao`
  e `/contestacao/responder`): quem submeteu pode pedir **revisão formal** da nota. A janela
  abre com o **preliminar** publicado e fecha em **3 dias** (`PRAZO_CONTESTACAO_DIAS`) — ou
  antes, se o **final** sair: a contestação existe para ser decidida ENTRE um resultado e o
  outro, que é para isso que os dois existem. **Uma por projeto** (contestação é peça, não
  conversa) e só da orientação — nem o aluno nem a coordenação, que é quem decide. A data de
  cada fase fica em `desde` no registro de publicação, para republicar não reiniciar o
  relógio. A coordenação responde no mesmo registro, o pedido aparece no **sino de alertas**
  (prazo curto: contestação que ninguém vê é pior que nenhuma), e **responder não muda
  nota** — se a revisão proceder, alterar a nota segue sendo ato à parte, no histórico.
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
- **A ata digitada não se perde** (`AUTO`/`sujou`/`autoSalvar` na SPA das atas): registrar
  uma reunião é meia hora de digitação, e antes ela só existia no navegador até alguém
  clicar em "Salvar". Agora o **rascunho se grava sozinho** 4s depois da última tecla, um
  selo ao lado do título diz o estado (*alterações não salvas · salvando… · tudo salvo*),
  e sair da aba ou mudar de guia com texto por gravar avisa. A gravação automática **não
  entra no histórico** (`auto: true` no POST): uma linha a cada poucos segundos apagaria
  quem redigiu, quem aprovou e quem registrou. Só grava o que o servidor aceita como
  rascunho — sem órgão (e sem curso, nos órgãos por curso) não há onde arquivar, e aí a
  defesa é o aviso. Ata **registrada** nunca se grava sozinha: mexer em documento vigente
  é ato deliberado, e passa pelo botão.
- **Avisos antes de registrar** (`avisosDaAta` em lib/atas.js): `validarAta` diz o que
  FALTA e trava; isto diz o que está ESTRANHO e não trava — votos acima do número de
  presentes, votação marcada e zerada, quem presidiu ou secretariou fora da lista de
  presença, ponto discutido sem deliberação, encaminhamento sem responsável ou sem prazo,
  sessão sem horário de término. Cada aviso aponta a incoerência entre dois campos
  preenchidos em momentos diferentes, que é onde o erro mora. Registrar continua sendo
  ato do órgão: o sistema mostra e pergunta, não decide.
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
- **Dossiê de conformidade** (`dossieConformidade` + `gerarDossieConformidadePdf`,
  `GET /api/atas/dossie.pdf`, só gestão; botões na tela Acompanhamento): a matriz da tela
  responde "quanto falta"; o dossiê responde o que o avaliador do INEP pergunta —
  **onde está a ata que comprova este indicador**. Cada tema sai com a referência do
  instrumento ("Curso 2.1", "IES 3.7"), a situação e o **número e a data da ata** que o
  registrou; o ciclo de sessões do semestre vem junto, porque o instrumento cobra a
  periodicidade e não só o tema. Um PDF por curso (NDE e Colegiado) e um dos órgãos
  institucionais. Só ata **registrada** entra — minuta ainda pode mudar. Tema anual do
  outro semestre aparece como "não cobrado neste semestre", mas **com a ata da última vez
  em que foi tratado**: sem ela o avaliador conclui que nunca houve.
- O ARCHÉ **não convoca reunião nem cobra ninguém por e-mail**: `lib/alertas.js` monta a
  lista de órgãos e cursos fora de dia e a mostra à gestão (painel do ARCHÉ AT e tela
  Acompanhamento). A cobrança da regularização é da PROPPEX. Órgão que nunca registrou
  ata entra sempre como urgente, faltem 5 ou 150 dias para o fim do semestre.
- Presenças são digitadas a cada sessão pelo responsável — **não há cadastro fixo de
  composição de órgão**, por decisão do dono (lista fixa emperra o processo).
- **Retomar encaminhamentos** (`GET /api/atas/encaminhamentos-anteriores` + botão na pauta):
  encaminhamento sem retomada é a queixa mais comum de quem lê uma série de atas — a
  reunião decide "fulano providencia até tal dia" e ninguém volta ao assunto. A tela traz o
  que ficou combinado nas sessões **registradas** do mesmo órgão (mais recentes primeiro,
  marcando o prazo vencido) e o que for marcado vira ponto de pauta com a **origem anotada
  na discussão** (número da ata, data, ação, responsável e prazo). O ARCHÉ **não julga se o
  encaminhamento foi cumprido** — quem diz isso é a reunião; ele só devolve o assunto à
  mesa. O recorte do acervo vale igual: só aparecem os encaminhamentos das atas que a
  pessoa já podia ver.
- O arquivamento da via assinada é do próprio órgão; o ARCHÉ guarda a cópia gerada.
- Redação da ata por IA é **opcional**: sem `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` o gerador
  determinístico assume, e qualquer falha de IA cai nele em vez de derrubar o fluxo.
  O adaptador do Gemini tenta os modelos Flash em ordem (o Google aposenta versões:
  o `gemini-2.5-flash` sai em 16/10/2026), então basta a chave para funcionar.
- **Extensão da redação** (`ESTILOS`/`instrucaoDe` em lib/redator.js, decisão do dono
  ago/2026): **concisa · padrão · detalhada**, escolhida na tela ao lado do botão que gera
  a minuta — é decisão de quem redige, sessão a sessão (uma ata de NDE que vai ao INEP pede
  desenvolvimento; a de uma comissão interna, não). O padrão institucional é **detalhada**
  (`ATA_ESTILO`). Vale nos dois caminhos: muda o prompt da IA (e sobe o teto para 8192
  tokens na detalhada, senão a ata sai truncada) e muda o gerador determinístico, que é o
  que roda sem chave. O que se alonga são as **fórmulas de procedimento** ("submetido à
  apreciação", "aberta a discussão", "após o debate"), e elas só aparecem quando o campo
  correspondente foi preenchido — afirmar debate sobre ponto sem nota seria inventar. O
  texto que a pessoa digitou entra **inteiro, letra por letra**, depois de dois-pontos:
  mexer na frase dela para encaixar numa fórmula é reescrever o que a reunião disse.
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
