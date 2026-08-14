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

- **Gestão de acessos** é da conta, não de um setor: o atalho mora no **perfil** do
  gestor (`/perfil/`), não na barra lateral da Extensão.

## Regras de negócio essenciais

- **Setores protegidos** (exigem login): `/extensao`, `/pesquisa`, `/inovacao`, `/atas`, `/usuarios`.
  **Avaliação (`/arche/`) é ABERTA** — não adicionar login nela.
- Gestores gerais fixos: `jadsonbelem@gmail.com` e `jadson.moura@uniego.edu.br` (lib/auth.js).
- **Coordenação por setor** (`/usuarios/`, ação `coordenar`): o gestor geral designa
  coordenadores para qualquer um dos quatro módulos — `extensao`, `pesquisa`, `inovacao`
  e `atas`. Dentro do setor marcado a pessoa tem o alcance da PROPPEX (no ARCHÉ AT, vê
  as atas de todos os órgãos, o Acompanhamento e os alertas); fora dele é submissora, e
  a gestão de acessos continua exclusiva dos gestores gerais. Cada setor decide isso
  lendo `modulos` da sessão (`gereAtas`, `gereIC`) — nunca o papel sozinho.
- Contas `@uniego.edu.br` entram como submissoras automaticamente; outras aguardam aprovação.
- **Senha provisória** (`POST /api/usuarios/senha`, só gestores gerais): para quem perdeu o
  acesso ao e-mail. Vale **7 dias** e obriga a troca no primeiro login (`/auth/senha`
  devolve `trocarSenha: true`; o `/entrar` esconde o "agora não"). Quando a pessoa define
  a própria senha a marca `provisoria` some sozinha. Conta de gestor não recebe senha
  provisória — um gestor não redefine a senha do outro. Rota separada da de papéis de
  propósito: a de papéis reconstrói as listas, e resetar senha não pode rebaixar ninguém.
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
  cronograma segue editável pela orientação. **A proposta não pede aluno**: a indicação
  acontece DEPOIS da aprovação, dentro do projeto — nome, curso, período, e-mail e
  telefone. Ao salvar, **o aluno recebe o convite por e-mail** (`convidarAlunosIC`) com o
  link de entrada; ele cria o usuário e **ele mesmo** completa documentos, dados
  bancários e Pix (`POST /api/ic/:id/meus-dados` — só o próprio aluno grava).
  **Documentos e conta são do aluno** (`alunosVisiveis`): a orientação vê só o contato
  que indicou e o sinal `dadosCompletos`; a gestão vê tudo (contrato); o formulário da
  orientação nunca sobrescreve o que o aluno gravou. Os alunos que vinham nas propostas
  importadas foram apagados de vez (`sys-ic-alunos-zerados-v1`), e os cronogramas do
  edital 01/2026 foram enquadrados na vigência set/2026 → ago/2027
  (`sys-ic-cronograma-vigencia-v1`). Validados todos os relatórios
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
     durante a seleção (sete critérios com teto de pontos somando 100 + recomendação;
     a nota do parecer é a soma) ou recusa por impedimento. Não participa da execução:
     cronograma e relatórios não aparecem para ele.
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
  pode ser preenchida depois da submissão.
- **Classificação por SOMA** (`notaClassificacao`, decisão do dono em ago/2026): a nota
  final é **NP + CL**, teto 200 — NP é a nota do projeto (0–100: sete critérios com teto
  de pontos em `CRITERIOS_AVALIACAO`, a nota do parecer é a soma; entre pareceres vale a
  média) e CL é a pontuação da planilha **em valor absoluto** (0–100, sem conversão).
  Currículo sozinho não classifica: sem NP não há nota final (null, nunca zero). Há
  **dois quadros**: primeiro só os professores **doutores** (bolsa CNPq exige doutorado),
  depois o geral com todos — doutores inclusive (`classificarProjetos`; empate resolve
  por NP, depois protocolo). Os 4 códigos antigos de critério foram preservados.
- **Nota atribuída pela coordenação** (`notaDireta`, `POST /api/ic/:id/nota`, só gestão):
  a seleção de 2026 correu fora do sistema, então a gestão atribui a nota do projeto
  (0–100) sem formulário — ela tem **precedência** sobre a média dos pareceres, fica no
  histórico (sigilosa) e some da visão do avaliador e da orientação. `{ nota: null }`
  desfaz. Nos próximos editais o caminho é o parecer pelo sistema.
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
- **Prazos dos relatórios** (`prazosRelatorios` em lib/ic.js, item 11.1.b): o parcial
  vence aos 6 meses de execução e o final no fim da vigência; cada um pode ser entregue
  a partir de 2 meses antes. Projeto ATRASADO = prazo vencido com relatório faltando.
- **Decisão da seleção em 4 saídas** (renderSelecao): aprovado com bolsa CNPq, aprovado
  com bolsa UNIEGO, aprovado sem bolsa ou reprovado — o front encadeia as rotas
  `avaliar` + `fomento`. Bolsa concedida abre a **Indicação do bolsista** no projeto:
  a orientação preenche CPF, telefone, banco, agência, conta e Pix de cada aluno
  bolsista (campos do aluno em `normalizarAluno`; nunca aparecem para o avaliador nem
  para os colegas de projeto). Falta de dado vira pendência `bolsista-incompleto`. A ficha
  só abre com o projeto APROVADO (resultado dado). A PROPPEX exporta tudo em
  `GET /api/ic/bolsistas.xlsx` (só gestão; botão na guia Projetos, nunca na
  Editais e Resultados, que é de todos) — as mesmas colunas do formulário antigo.
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
- **Resultado do processo em PDF** (`gerarResultadoEditalPdf`, `GET /api/ic/resultado.pdf`,
  só gestão): documento timbrado com o resumo do processo e a lista dos projetos daquele
  edital, com os **dois quadros** (doutores; geral) em ordem de nota final. Filtra pelo
  campo `edital` do projeto — é o que faz o histórico dos editais antigos sair pelo mesmo
  lugar. **Proposta sem nota de projeto sai sem nota final**, nunca com zero: num documento
  oficial, zero seria nota, e o que existe é ausência de avaliação (por isso
  `notaClassificacao` trata `null` como faltante, não como 0).
- **Ver como** (`visaoComo` no server): a coordenação abre o ARCHÉ IC pelos olhos de
  qualquer pessoa do setor — professor, aluno ou avaliador — para conferir o que ela
  enxerga. Não é atalho de permissão: o alvo é tratado como quem é (`gestao: false`),
  e as mesmas funções de recorte e sigilo valem, então a simulação não mente. É
  **somente leitura** — um middleware recusa qualquer escrita com `?como=`, senão o
  histórico do projeto diria que foi a pessoa quem mexeu. Quem ainda não tem conta
  pode ser simulado pelo CPF (`como=cpf:000…`), que é como o projeto importado o
  identifica: mostra o que ele encontrará ao se cadastrar. Há também as **visões
  genéricas** (`como=perfil:orientador` / `perfil:aluno`): um professor ou aluno
  recém-chegado, sem projeto — a cara de cada acesso, sem os dados de ninguém.
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
