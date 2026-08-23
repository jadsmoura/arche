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
lib/espacos.js       ARCHÉ ES: espaços, conflito de horário, bloqueios e agenda
lib/curricularizacao.js  Vínculo da ação de extensão com o componente curricular (MEC)
lib/monitoria.js     ARCHÉ MO: editais, fluxo, réguas, carga horária e certificados
lib/monitoriaHistorico.js  O arquivo da monitoria: os ciclos que correram fora do ARCHÉ
lib/praticas.js      ARCHÉ AP: relatório de aula prática, cadastro por semestre e o painel
lib/relatorios.js    Relatório Semestral de Atividades: o panorama de cada setor
lib/banda.js         Diagnóstico de banda: classificação, contagem e projeção (puro)
lib/medidor.js       O medidor que roda: acumula em memória e grava no disco LOCAL
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
  ic/                Vitrine PÚBLICA (sem login, de propósito) de TODOS os processos
                     seletivos — também em `/editais`, o endereço que diz o que a página é
                     (o /ic/ fica: já circula em grupos e ofícios). Editais, resultados
                     e a lista simplificada dos projetos — arquivo para o MEC. Os PDFs dos
                     editais e dos resultados publicados vivem em public/ic/docs/
  espacos/           ARCHÉ ES — Reserva de Espaços (SPA vanilla, mesmo desenho do EX/AT)
  monitoria/         ARCHÉ MO — Monitoria Acadêmica (SPA vanilla; a mesma tela para os
                     três papéis — professor, monitor e PROPPEX)
  praticas/          ARCHÉ AP — Aulas Práticas (SPA vanilla; da PROAC: o professor registra,
                     a coordenação do curso valida, e o fluxo encerra nela)
  relatorios/        Relatório Semestral por SETOR (só gestão): números, gráficos e a
                     relação nominal — prestação de contas e comprovação ao MEC
  diagnostico/       Para onde vão os bytes (só gestor geral): banda de saída por origem
  entrar/ perfil/ usuarios/   Login (código por e-mail + Google), perfil, gestão de acessos
```

- **Gestão de acessos** é da conta, não de um setor: o atalho mora no **perfil** do
  gestor (`/perfil/`), não na barra lateral da Extensão.
- **Os cartões do portal vêm AGRUPADOS** (ideia do dono, ago/2026), na mesma divisão da barra do
  topo: **Ensino** (Aulas Práticas, Monitoria), **Pesquisa** (IC, Inovação), **Extensão** (Extensão,
  Eventos) e **Serviços** (Atas, Espaços, Relatórios, Certificados, Avaliação) — dez cartões numa
  lista só se leem inteiros toda vez. O grupo **some quando nenhum cartão dele é visível**
  (`aplicarVisibilidade`), senão o aluno veria um título "SERVIÇOS" sobre o vazio. Na BARRA o
  Certificados se repete nos três grupos (só um menu está aberto por vez, e é o que o dono pediu);
  no PORTAL ele aparece **uma vez**, em Serviços — a página inteira se vê de uma olhada, e três
  cartões idênticos leriam como defeito.
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
  `/espacos`, `/monitoria`, `/praticas`, `/usuarios`, `/relatorios`, `/diagnostico`, `/prototipos` e
  `/eventos/gestao` (`/usuarios` e `/diagnostico` só para gestor geral; o restante de `/eventos/*` é público
  de propósito). Duas exceções nominais para conta ainda `pendente`: o aluno/avaliador convidado
  na IC e o **monitor indicado** na monitoria — o convite chega por e-mail e não pode dar em
  parede.
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
- **Indicador 2.16 no dossiê** (append em `public/arche/dossie/*`, correção do dono ago/2026):
  o painel simulava o conceito variando o EIXO ERRADO — fixava 50% dos docentes e fazia variar
  o número de produções (1, 4, 7, 9), limiares que não existem no instrumento. É o contrário:
  o número de produções é FIXO (**9 nos últimos 3 anos**) e o que varia é a **proporção de
  docentes** que o alcança — 10% conceito 2, 20% o 3, 30% o 4, 50% o 5; abaixo de 10%, conceito
  1. Daí a leitura confusa: quatro linhas com percentuais diferentes e a legenda descrevendo
  outra regra. A **janela é 2023–2026** — o ano corrente e os três anteriores (decisão do dono:
  o instrumento fala em "últimos 3 anos", mas o ano em curso está pela metade, e o quarto ano
  civil é o que faz a conta corresponder a três anos de produção de verdade). Ela é declarada
  UMA vez e escrita por extenso em todo rótulo — o que não pode voltar a acontecer é o texto
  dizer um período e a conta fazer outro —, e é a MESMA que já filtra o que aparece na lista de
  cada docente. O **verde do contador segue o instrumento (9)**, não a meta interna de 10 que a
  PROPPEX acompanha à parte: com a régua antiga, quem tinha exatamente as 9 do Conceito 5
  aparecia como se não tivesse alcançado nada. O painel passa a dizer o DENOMINADOR — todos os
  docentes do curso, inclusive os que ainda não importaram o Lattes, que é o que o instrumento
  manda e o que faltava para o número ser interpretável.
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
- **O dossiê grava sem atropelar quem estava junto** (append em `public/arche/dossie/*`,
  achado de ago/2026): o dossiê é UM documento por curso — os 21 docentes juntos — e a
  gravação mandava a cópia que estava na memória DA ABA. Duas pessoas com a página aberta ao
  mesmo tempo, cada uma no próprio dossiê, e a última a gravar devolvia o curso ao estado em
  que ele estava quando a aba dela carregou: o trabalho da primeira sumia sem aviso e sem
  rastro. Foi assim que as três produções que a profa. Lessa incluiu à mão em 19/08 (18h04,
  18h07 e 18h08) desapareceram — os comprovantes ficaram no Drive, os itens não estavam mais
  em lugar nenhum, e o Indicador 2.16 do curso caiu de 5 para 4 sem que nada explicasse. A
  gravação passa a ser **LER → MESCLAR → GRAVAR**: relê o documento como está no servidor e
  devolve só o registro de quem está editando, preservando o dos demais; docente que a aba
  conhece e o servidor não é ACRESCENTADO (mesclar nunca descarta ninguém); as gravações
  entram numa fila, senão duas seguidas leriam o mesmo documento e a segunda desfaria a
  primeira; e se a releitura falhar, cai no comportamento antigo — perder a gravação de quem
  está trabalhando seria pior que o risco que isto corrige. Os três itens foram restaurados
  dos próprios comprovantes (título, ano, autoria e veículo lidos dos PDFs no Drive) e
  entraram como inclusão manual, para sobreviverem à próxima reimportação do Lattes.
- **A GRAVAÇÃO DO DOSSIÊ NÃO REMOVE PRODUÇÃO QUE NINGUÉM EXCLUIU**
  (`public/assets/arche-dossie-integridade.js`, append nas 12 páginas — achado de ago/2026,
  a partir da queixa de vários professores de que "arquivos anexados sumiram do sistema"):
  ninguém apagou nada; o dossiê se apagava sozinho, um pouco a cada abertura. Ao CARREGAR, o
  app compilado poda o documento que veio do servidor **no próprio objeto** — corta a produção
  anterior a `ano−3` (a janela do 2.16), descarta o grupo que ficou vazio e deduplica por
  `título.slice(0,40) + ano` — e ao GRAVAR escreve exatamente esse objeto podado, porque
  `data.groups` e `itemStates` saem os dois dele. A poda é da EXIBIÇÃO e estava sendo gravada
  como se fosse o documento: o item saía levando o `anexo.path`, a referência ao comprovante.
  O arquivo continuava no Drive; sumia a linha que apontava para ele — do lado de quem anexou,
  isso é indistinguível de perda. E tinha relógio: em 01/01/2027 o corte passaria a 2024,
  levando junto o que é de 2023. A trava é na SAÍDA: antes de gravar, o documento que sai é
  comparado com o que está no servidor e **tudo o que sumiria sem alguém ter mandado sumir
  volta para dentro** — item, status, motivo e anexo, mais o comprovante de item que
  sobreviveu à poda e perdeu o anexo na deduplicação, e os documentos pessoais, que o app
  reconstrói de um template a cada carga. A TELA não muda: o recorte de anos continua valendo
  para o que se mostra e para a conta do 2.16, que é o que o instrumento do INEP pede. Ela
  **não ressuscita exclusão deliberada** (o item excluído pelo docente fica registrado em
  `ajustesProducao.excluidas`, e a trava respeita a lista — desfazer a decisão da pessoa seria
  o mesmo defeito ao contrário) e **não inventa**: só devolve o que está gravado no servidor.
  Se a releitura falhar, grava como vinha — segurar a gravação de quem está trabalhando seria
  pior que o risco que isto corrige.
- **A PRÓ-REITORIA GRAVA A FUNÇÃO E O REGIME; o regime não gravava para NINGUÉM**
  (`arche-dossie-gravacao.js`, achado do dono ago/2026: "cliquei em alterar regime de trabalho
  de alguns professores e não salvou; quando atualizei a página voltou ao que estava errado").
  Eram dois defeitos no mesmo lugar. A ficha dá à PROPPEX dois campos editáveis — função e
  regime — e os dois chamavam `scheduleSave()`, que recusa em silêncio quem não é docente: a
  tela prometia uma edição que o sistema não guardava, e o regime de trabalho é dado de
  indicador. E o clique nos botões do regime não pedia gravação a papel NENHUM (escrevia
  `p.regime` e chamava `renderProf()`, só) — o regime do próprio docente também só ficava
  guardado se outra ação disparasse a gravação depois. A correção é a menor possível: relê o
  documento como está no SERVIDOR e altera **apenas esses dois campos, apenas do docente
  aberto**, numa fila. Nunca o registro inteiro — assim é impossível esta gravação apagar
  produção, comprovante ou foto de quem quer que seja.
- **Remover o XML de um docente** (botão "Remover XML" na ficha, só PROPPEX — pedido do dono
  ago/2026: "caso eu encontre um erro, prefiro que o professor atualize do zero, para evitar
  confusão"): é o caso do XML trocado — alguém sobe na própria ficha o arquivo de outra pessoa
  e a produção alheia passa a contar no dossiê do curso. Corrigir por cima é pior: reimportar
  mistura o que estava com o que chega, e depois ninguém diz qual item veio de onde. SAI o
  currículo importado, os comprovantes presos a ele e os ajustes (o excluído e o incluído à
  mão, que são ajustes SOBRE esse currículo); FICAM nome, titulação, função, regime, foto e os
  **documentos pessoais** (os diplomas do 2.5), que não vieram do Lattes. Os arquivos
  continuam no Drive — o que se remove é o dossiê que apontava para eles. A confirmação nomeia
  o docente e diz quantos itens saem, e a trava de integridade não desfaz a remoção, porque
  ficha sem `data` ela não repovoa.
- **O relatório de produção leva o LINK do comprovante, não o comprovante**
  (`public/assets/arche-dossie-exportlink.js`, pedido do dono ago/2026: "coloque só o link,
  para o avaliador por acaso clicar e acessar o que está salvo no sistema; senão fica um
  arquivo muito grande"): o "Exportar Relatório PDF" do dossiê baixava CADA comprovante,
  renderizava a primeira página com o PDF.js e a colava como imagem JPEG. Medido com 6
  comprovantes digitalizados de 2,6 MB: **2.600 KB embutindo, 9 KB só com o link** — 274×,
  e isso para UM docente; um curso tem vinte e a produção deles inteira. Era trabalho perdido
  de todo jeito, porque o comprovante já está no sistema com endereço próprio
  (`/api/files/<id>`): o relatório precisa dizer ONDE ele está, não carregá-lo junto. A linha
  "✓ nome-do-arquivo" vira LINK clicável, e a capa diz que é assim. O endereço de cada um sai
  de uma FILA montada na ordem exata em que o gerador percorre docentes e itens — não do nome
  do arquivo, que se repete entre docentes e faria o link apontar para o comprovante de outra
  pessoa; esgotada a fila, a linha sai sem link, porque link errado num documento que vai ao
  MEC é pior que link nenhum. Dois detalhes que o append carrega: `textWithLink` desenha
  chamando o próprio `text`, então há guarda de **reentrância** (sem ela a primeira linha
  consumia a fila inteira); e o jsPDF 2.x monta `text`/`save` como propriedades **da
  instância**, não do protótipo — quem se envolve é o CONSTRUTOR.
- **PDF e imagem ABREM na guia; o resto continua baixando** (`abreNoNavegador`/`disposicao`
  em lib/files.js, pergunta do dono ago/2026 conferindo os Documentos Institucionais: "cliquei
  pra ver um e ele me dá opção de baixar; é possível abrir em nova guia? Acho mais fluido").
  O `/api/files/*` mandava `Content-Disposition: attachment` em tudo, e para quem CONFERE
  documento — a pró-reitoria passando por trinta, o avaliador clicando no comprovante — baixar
  cada um para abrir na pasta de downloads é o caminho mais longo possível. A lista do que abre
  é FECHADA e curta **por segurança**: o arquivo é enviado por usuário e servido no MESMO
  endereço do portal, então tudo o que o navegador ABRE ali roda como se fosse página do ARCHÉ
  — um `.html` ou um `.svg` anexado como "comprovante" leria o cookie de sessão de quem
  clicasse. Só `application/pdf`, `image/png` e `image/jpeg`; `xml` está no catálogo de tipos e
  **não** entra aqui de propósito. A rota manda `attachment` ANTES de chamar o backend e o
  backend só AFROUXA: quem esquecer de chamar continua baixando, que é o padrão seguro.
- **A justificativa do conceito guarda o NEGRITO da colagem** (mesmo arquivo, pedido do dono
  ago/2026: "colo o texto com algumas marcações em negrito e gostaria que a formatação fosse e
  ficasse salva"): o campo era um `<textarea>`, e textarea não guarda formatação — o negrito
  morria na colagem, antes de chegar ao servidor. O campo rico se põe **por cima** do antigo em
  vez de substituí-lo: o textarea continua no DOM, escondido, porque é NELE que o append
  original escutou `input` e `blur`; o campo rico escreve o HTML nele e dispara os mesmos
  eventos, então a gravação segue pelo caminho já corrigido (chave do curso, mescla, fila,
  aviso na tela). **Sobrevivem negrito, itálico, sublinhado, quebras de linha e listas**; sai
  todo o resto — fonte, tamanho, cor, fundo, tabelas, imagens, links —, por duas razões: colar
  do Word traz HTML arbitrário, e guardá-lo para desenhar na tela do avaliador seria pôr código
  de fora dentro da página do ARCHÉ (a lista de permissão é fechada e **nenhum atributo passa**,
  nem `style`, nem `href`); e a justificativa vai ao MEC dentro do dossiê — a Calibri 11 azul
  colada do Word não decide a aparência do indicador. O que se preserva é a ÊNFASE que a pessoa
  escolheu, não o tema do editor dela. O `<span style="font-weight:700">` do Google Docs é lido
  e vira `<b>`, senão o negrito se perderia justamente no caso mais comum; e o texto de tabela
  colada fica, separado por quebra de linha, sem a tabela.
- **A JUSTIFICATIVA DO CONCEITO ERA UMA SÓ PARA OS DOZE CURSOS**
  (`public/assets/arche-justificativa.js`, achado do dono ago/2026: "atualizei o texto da
  justificativa do conceito e parece que não está salvando"). Não estava, e por dois motivos.
  A chave `justificativas-conceito-v1` está escrita IGUAL nas doze páginas de avaliação, e o
  que se guarda nela é um mapa por INDICADOR ("2.1", "3.4") — a justificativa do 2.1 de
  Psicologia e a do 2.1 de Enfermagem eram a MESMA gaveta: quem escrevia por último apagava a
  do outro curso, e o texto de um aparecia no outro como se fosse dele. Num documento que
  sustenta o conceito de cada curso perante o MEC, é o defeito mais caro possível. E a
  gravação mandava o mapa inteiro DAQUELA aba por cima de tudo, com a falha morrendo num
  `console.warn` — o caso comum sendo o 403 do **selo de visualização**, que fica guardado no
  navegador de quem abriu o `/avaliador` uma vez. A correção se põe entre o append antigo e o
  servidor, no `fetch`: **gravar** passa a escrever na chave DO CURSO
  (`justificativas-conceito-<curso>-v1`), relendo antes e mesclando indicador a indicador,
  numa fila; **ler** usa a chave do curso e, **só enquanto ela não existe**, cai na antiga —
  é o que faz a separação acontecer sem ninguém perder o texto que já está na tela; e a chave
  antiga **nunca mais é escrita**. A tela passa a dizer: selo com a hora do último salvamento
  e faixa quando a gravação é recusada, nomeando o selo de visualização quando é ele.
- **ANEXAR COMPROVANTE SÃO DUAS GRAVAÇÕES, e o aviso de "salvo" só falava de uma**
  (`arche-dossie-gravacao.js`, achado do dono ago/2026: "acessei pelo usuário dela e anexei, e
  o comprovante não subiu" — depois de ter esperado o aviso de salvar). O ARQUIVO sobe por
  `/api/drive/upload` e só então o DOSSIÊ é gravado com a referência a ele. Quando o upload
  falha, o app zera o anexo e grava assim mesmo — e essa gravação é VERDADEIRA, então o aviso
  de confirmação aparecia dizendo "salvo, pode fechar a página com segurança" logo depois de o
  arquivo ter sido recusado: certo sobre o dossiê, e completamente errado sobre o que a pessoa
  acabou de fazer. Agora o upload recusado tem voz própria (o `alert` do app diz só "não foi
  possível enviar o arquivo", sem o motivo) e **o aviso de sucesso se cala por 12 s depois de
  uma falha** — quem manda na tela, ali, é a falha. O motivo mais comum é o **selo de
  VISUALIZAÇÃO**, que recusa os três uploads com 403 e é nomeado na faixa, com o caminho de
  saída.
- **"Carregar exemplo" saiu da ficha, em todos os papéis** (achado do dono ago/2026: "na visão
  de avaliador não pode aparecer o botão carregar exemplo"). Ele é resto do protótipo, e o
  texto ao lado ainda dizia "nesta demonstração" numa página que se apresenta ao avaliador do
  MEC como prova de conformidade. Some para TODOS, e por uma razão mais forte que a estética:
  `loadExample()` faz `p.data = parseLattes(EXEMPLO_XML)` — **substitui o currículo real do
  docente por um de exemplo** na memória da página, e basta uma gravação depois disso para a
  produção fictícia entrar no dossiê do curso por cima da verdadeira.
- **O MODO AVALIADOR SOBREVIVE À NAVEGAÇÃO** (`arche-nav.js`, achado do dono ago/2026: "na
  página inicial está ok, mas quando entro para ver a Produção Docente e os Indicadores a barra
  superior volta a aparecer com os links"). Eram dois furos no mesmo lugar: o painel do
  avaliador liga para `?perfil=avaliador`, mas os links DENTRO do app compilado são relativos
  (`./dossie/`, `./avaliacao/`) e não levavam o parâmetro adiante — do segundo clique em diante
  a página não sabia mais quem estava olhando; e o modo só valia para quem NÃO tem sessão, então
  a pró-reitoria conferindo a visão do avaliador (ou uma conta esquecida aberta na máquina do
  laboratório) via a barra do portal inteira por cima do link de avaliador. O modo passa a ligar
  por TRÊS caminhos: o selo sem sessão (como antes), o `?perfil=avaliador` no endereço — que
  vale **mesmo com sessão aberta**, porque se o endereço diz que esta é a visão do avaliador é
  ela que se mostra — e a lembrança na ABA (`sessionStorage`), que atravessa os cliques
  internos. Cada clique em link para dentro de `/arche` recarimba o parâmetro (na captura, não
  reescrevendo o DOM: o app redesenha as listas o tempo todo e um link novo escaparia da
  varredura), para o endereço continuar dizendo a verdade sobre o que está na tela. Quem tem
  sessão ganha **"Sair do modo avaliador"**; o avaliador de verdade não — para ele não há modo
  de que sair, e o botão seria uma porta que não abre. Esse link é o ÚNICO isento das duas
  reescritas (`data-arche-saida`): sem a isenção, a regra que manda `/arche/` ao painel o
  devolveria justamente para onde ele está saindo, e o recarimbo o traria de volta ao modo.
  **A BARRA DO AVALIADOR TEM TRÊS BOTÕES, E SÓ** (decisão do dono, ago/2026): **Início**, que
  volta ao painel dele; **Indicadores**; e **Produção Docente**. Duas coisas que eu havia posto
  ali saíram: o **"Sair do modo avaliador"** — uma porta para o portal inteiro desenhada na tela
  de quem não deve chegar lá; ela existia para a pró-reitoria conferir sem trocar de janela,
  conveniência minha e risco dela, e quem tem conta sai pelo endereço, digitando — e o
  **seletor de curso**, que ficava perdido entre os atalhos. Os três botões são os do próprio
  app compilado; o que o append faz é apontá-los ao lugar certo: "Início" e a marca vão ao
  painel do avaliador, e **"Indicadores"/"Produção Docente" levam o CURSO em que ele está** —
  eles apontam para a raiz de cada módulo, que é Psicologia, e sem o acerto o avaliador que
  estivesse em Odontologia cairia noutro curso ao trocar de painel, que é o trânsito que ele
  mais faz durante a visita.
  **O avaliador não vê a tela de login piscar** (`public/assets/arche-av-abertura.js`, append
  nas 12 páginas do dossiê — achado do dono ago/2026: "quando clico em Produção Docente a página
  vai alguns segundos para essa tela e depois vai pra página correta"): com `?perfil=avaliador`,
  o app compilado faz `await loadSavedState()` — a leitura do dossiê INTEIRO no Drive — ANTES de
  chamar `loginAsAvaliador()`, e durante esses segundos ficava no ar a tela de entrada: dois
  botões de acesso que não são do avaliador (um deles "Entrar como Pró-Reitoria") e um parágrafo
  começando com "Demonstração", na tela de quem veio avaliar o curso. O append não acelera nada:
  cobre a espera com "Abrindo o painel do avaliador…" e sai quando o `#appView` deixa de estar
  escondido (observando o app, não um tempo fixo — o dossiê de um curso grande demora mais). Três
  cuidados: só age com o parâmetro no endereço (sem ele a tela de entrada é a tela certa); sai
  quando o app abre; e desiste em 20 s devolvendo a tela de entrada — uma cobertura que não sai
  é uma página morta, pior que ver a tela errada por três segundos.
  **O CURSO SE ESCOLHE NO INÍCIO** (`/avaliador`, bloco "Curso a avaliar" acima dos painéis):
  é a decisão que abre a visita, não um menu para mexer no meio dela — para trocar, o avaliador
  volta ao início pelo "Início" da barra. Escolhido o curso, os dois cartões passam a apontar
  para ele, e a escolha fica na ABA (`sessionStorage`, nunca no servidor: é preferência de quem
  está olhando, some quando a aba fecha, e faz o avaliador reencontrar o curso ao voltar). Um
  link por curso seriam doze endereços para a PROPPEX administrar e mandar certos; o link é UM
  só. Psicologia mora um nível acima e por isso o diretório dela é vazio no catálogo — `dossie`
  e `avaliacao` têm os mesmos diretórios.
- **O avaliador do MEC não vê diagnóstico interno de gravação** (mesma revisão): as faixas que
  explicam por que o dossiê não está salvando servem a quem trabalha nele; o acesso do
  avaliador é de leitura por desenho, ele não tem o que salvar, e um aviso técnico sobre o que
  o sistema deixa ou não de gravar não diz nada a quem está ali para avaliar o curso. Pela
  mesma razão saiu a **faixa de conferência do XML**: ela nasceu para responder a uma pergunta
  pontual (de quem era o XML de uma docente) e virou aviso permanente na ficha — uma faixa
  vermelha dizendo "este currículo parece ser de outra pessoa" sobre a ficha de uma professora
  não é diagnóstico, é acusação impressa na prova de conformidade do curso.
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
  ARCHÉ mantém os próprios direitos. **E a tela DIZ que o acesso é de visualização**
  (`public/assets/arche-av-somenteleitura.js`, append nas 26 páginas — achado do dono
  ago/2026): uma professora entrou pelo `/avaliador`, tentou enviar o PDI e recebeu
  "✗ Erro: Erro 403", sem mais nada. O 403 estava certo; errado era o silêncio — o app
  compilado mostra só o número, e a frase que o servidor escreve não chegava a lugar
  nenhum. Agora uma faixa no alto avisa quem está com o selo de visualização, o 403 das
  rotas de escrita aparece com a explicação do servidor, e os dois trazem o botão que leva
  ao login e volta para a mesma página, mais **"Sou da organização — usar a senha"**, que
  troca o selo ali mesmo (POST `/api/av/entrar`) sem perder o lugar. O detalhe que
  desorientava: **o selo GRUDA no navegador** — quem abriu o `/avaliador` uma vez entra nas
  visitas seguintes direto pelo `/arche`, sem passar pela portaria, e por isso jura ter
  entrado pelo endereço normal. Bloquear a leitura do `/arche/` para esse selo não serve: é
  por ali que a página do avaliador entra (`/arche/avaliacao/`, `/arche/dossie/`), e o
  avaliador do MEC pararia numa tela de senha. O link de acesso completo se invalida em
  bloco trocando `AV_LINK_VERSAO`. A mesma portaria vale para as APIs que o módulo usa
  (`/api/estado*` nas chaves abertas e os três `/api/drive/upload*`), senão bastaria pular a
  tela e ler tudo pela API. Para trocar a senha, mude a env var — não o código.
- Gestores gerais fixos: `jadsonbelem@gmail.com` e `jadson.moura@uniego.edu.br` (lib/auth.js),
  com os **mesmos privilégios**. A identidade ACADÊMICA do pró-reitor (projetos que orienta,
  certificados) vive na conta **institucional** — a pessoal é só de gestão
  (`identidadeInstitucionalDoProReitor` gravou o e-mail do UNIEGO nos projetos dele, o que
  também encerra o casamento por nome na conta pessoal).
- **Coordenação por setor** (`/usuarios/`, ação `coordenar`): o gestor geral designa
  coordenadores para qualquer um dos sete módulos — `extensao`, `pesquisa`, `inovacao`,
  `atas`, `eventos`, `espacos` e `monitoria`. Dentro do setor marcado a pessoa tem o alcance da PROPPEX (no ARCHÉ
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
- **Remover acesso é uma DECISÃO, e decisão dura** (`removidos` em `lib/auth.js`, achado de
  ago/2026): com o cadastro aberto a qualquer e-mail, a remoção pela gestão é o único freio que
  sobra — e ela não valia nada. Quem era removido voltava a `pendente`, e `aprovarCadastroNovo`
  o reaprovava no acesso seguinte: o botão prometia uma coisa e fazia outra, e a PROPPEX **não
  conseguia tirar ninguém do portal**. Agora a remoção entra numa lista que **vence tudo** — a
  lista de aprovados, o domínio `@uniego.edu.br` (que sozinho aprova) e até as **exceções
  nominais** do aluno de IC e do monitor convidado, senão remover quem é aluno de IC seria um ato
  sem efeito. Reaprovar, promover ou designar coordenação desfaz a remoção (são justamente os
  atos de quem quer a pessoa de volta), e as **duas contas da pró-reitoria não se removem**. A
  tela de entrada passa a dizer a verdade a quem foi removido ("acesso encerrado pela PROPPEX"):
  o aviso de "aguardando aprovação, em breve" mandaria a pessoa esperar por algo que não vem.
- **Conta EXTERNA que se declarou docência** (etiqueta e filtro em `/usuarios/`, decisão do dono
  ago/2026): professor sem `@uniego.edu.br` precisa dos painéis de professor, e já os tem — toda
  conta nova entra `aprovado` no primeiro login e a **função** se declara no próprio perfil.
  Declarar-se professor **não concede nada** que a conta já não tivesse (o papel vem das listas
  de `auth-usuarios-v1`, e coordenação de módulo só o gestor geral designa), e por isso não há
  validação PRÉVIA: ela bloquearia professores reais no dia da submissão para impedir algo que o
  **recorte por autor** já contém — quem se declara professor vê só o que ele mesmo cria. A
  conferência é DEPOIS, e é para torná-la possível que o painel marca quem entrou por e-mail de
  fora e se declarou docente ou coordenação, com filtro próprio (mais "acesso encerrado", para a
  gestão rever o que decidiu).
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
- **Demandas abertas na página inicial** (pedido do dono, ago/2026): antes dos cartões dos
  setores, a gestão vê **o que espera decisão**, agrupado por setor, com o atalho para o lugar
  onde a decisão acontece — a pró-reitoria abre o portal para saber ONDE entrar, não para
  procurar. A fonte é a MESMA do sino (`GET /api/alertas`), com o mesmo recorte por
  `modulosDe`: quem não gere setor nenhum recebe lista vazia e o bloco não se desenha (painel
  vazio na página inicial é ruído). O detalhe de cada linha é uma AMOSTRA cortada em ~96
  caracteres: sem isso um setor com 63 pendências empurra os outros para fora da tela.
- **Sino de alertas no topo** (`GET /api/alertas` + `arche-nav.js`): mostra à gestão o que
  espera decisão ou atenção — acessos pendentes e cadastros novos (só gestor geral),
  projetos de IC aguardando avaliação, substituições de bolsista, contestações, pedidos de
  encerramento, relatórios em atraso, propostas/relatórios da Extensão, órgãos fora de dia nas
  Atas, eventos sem aprovação/não publicados e encerramentos a validar, projetos de monitoria
  em análise/a homologar e reservas de espaço aguardando decisão. O recorte é por
  `modulosDe`: o gestor geral vê tudo; o coordenador, só os módulos que coordena; quem
  não gere nada não vê o sino. A rota só devolve contagens, nomes e links — nada sigiloso.
- **Envios automáticos de e-mail** (`lib/avisos.js` + guia "Envios automáticos" em `/usuarios/`,
  `GET/POST /api/avisos`, só gestor geral — pedido do dono ago/2026): o mesmo aviso é informação
  ou ruído conforme a época — no pico da indicação de bolsistas, um e-mail a cada movimento da IC
  cansa; fora do ciclo, é ele que faz a pró-reitoria saber que um aluno foi indicado. O
  interruptor tem **três** posições: **ligado**, **silenciado até uma data** (a pausa que se
  desfaz sozinha, para o pico não virar um desligamento esquecido) e **desligado**. O catálogo
  tem 22 avisos em 7 setores e cada linha diz **para quem vai** (aviso à gestão × mensagem a uma
  pessoa, com `critico: true` nesta) e **o que se perde ao calá-lo**. Regras: aviso ausente da
  configuração é aviso LIGADO — guarda-se só o que foge do padrão, e assim um aviso novo já nasce
  funcionando; "silenciado" sem data é recusado (seria um desligado disfarçado); e todo disparo
  automático passa por `enviarAviso(codigo, msg)`. **O código de acesso do login fica de fora de
  propósito**: desligá-lo trancaria todo mundo do lado de fora.
- **Senha provisória** (`POST /api/usuarios/senha`, só gestores gerais): para quem perdeu o
  acesso ao e-mail. Vale **7 dias** e obriga a troca no primeiro login (`/auth/senha`
  devolve `trocarSenha: true`; o `/entrar` esconde o "agora não"). Quando a pessoa define
  a própria senha a marca `provisoria` some sozinha. Conta de gestor não recebe senha
  provisória — um gestor não redefine a senha do outro. Rota separada da de papéis de
  propósito: a de papéis reconstrói as listas, e resetar senha não pode rebaixar ninguém.
- **Certificados dos EVENTOS são emitidos pelo ARCHÉ** (`lib/certificadosEx.js` +
  `gerarCertificadoEventoPdf` + guia Certificados do ARCHÉ EV, decisão do dono ago/2026):
  com credenciamento, presenças e comissão organizadora já dentro do sistema, quem tem
  direito ao quê já está aqui — exportar para emitir fora era o passo mais longo entre o
  dado e o documento (a planilha da AEE continua existindo para quem precisar dela). O
  certificado **não sai porque a data passou**: sai porque o coordenador **encerrou o
  evento** (botão no cartão e na guia, a partir do último dia) e a **PROPPEX validou o
  encerramento** (`evento.encerramento.status`: aberto → solicitado → validado|devolvido;
  o pedido entra no sino). Mesma razão do relatório da ação: presença lançada errada
  viraria certificado antes de alguém olhar, e certificado emitido não se recolhe. Três
  documentos: **participante** (CH das ATIVIDADES em que teve presença, não a do evento
  inteiro), **palestrante** (com o título da apresentação) e **comissão** (com a função).
  **Credenciamento que NÃO aconteceu não é lista de ausentes** (`houveCredenciamento` em
  lib/eventos.js, achado do dono ago/2026 na Acolhida dos Cursos de Engenharia): o evento
  pode estar configurado para controlar frequência e, no dia, ninguém ter parado na porta —
  o monitor não abriu o PWA, o QR não foi projetado. A guia mostrava só a comissão, como se
  os inscritos tivessem faltado. Sem NENHUMA presença lançada no evento inteiro, a **lista
  de inscritos vale como lista de presença** e a CH cai na do evento; basta **uma** leitura
  de crachá para a lista voltar a mandar. É a mesma leitura que a sugestão do relatório
  final já fazia com o número de discentes, e a guia DIZ que foi isso que aconteceu
  (`semCredenciamento` na rota) — número que ninguém sabe explicar é pior que número menor.
  Frente com o texto padrão na moldura do UNIEGO, **verso com a programação** — é ela que
  dá lastro às horas da frente. Assinam até quatro, e **quem não tem imagem não aparece**
  (nada de linha em branco com nome embaixo): responsável e coordenação enviam o PNG na
  guia (`evento.assinaturas`, imagem fora dos payloads como a capa), e pró-reitor e reitor
  vêm do MESMO `sys-assinaturas-v1` do ARCHÉ IC. **Quem cria o evento entra na comissão
  como coordenação**, com os dados do perfil — era a linha que todo mundo esquecia, e sem
  ela o coordenador ficava fora do certificado do evento que organizou.
- **O aviso de que o certificado saiu** (`emailCertificadoDisponivel` + `avisarCertificadosDisponiveis`,
  pedido do dono ago/2026): validado o encerramento, o documento existe — e quem participou não
  volta ao portal para conferir se saiu. Sai **um e-mail por pessoa** na hora da validação, com
  o link que serve a ELA: o inscrito baixa pela própria **credencial** (o mesmo endereço do QR,
  que já está na caixa de entrada dele e dispensa conta); palestrante e comissão vão à guia
  **Certificados**. O envio é sequencial e fire-and-forget — e-mail que falha não desfaz a
  validação —, a marca `sys-ev-avisos-certificado-v1` impede que revalidar reenvie tudo, e a
  tela devolve **quantos foram avisados e quantos ficaram sem e-mail no cadastro**, que é o
  tamanho do buraco que a coordenação precisa conhecer.
- **O histórico de certificados é do USUÁRIO** (`/certificados/` + `GET /api/meus-certificados`,
  pedido do dono ago/2026): quem participou de um evento, foi bolsista de IC e monitor de uma
  disciplina procurava o documento de cada um em três setores. A guia (cartão 08 e atalho na
  barra, todo usuário logado) reúne **Eventos, Iniciação Científica e Monitoria**, casando por
  **CPF e e-mail** — e avisa quem não tem CPF no perfil que o histórico pode estar vindo menor
  que a verdade. As guias de certificado DENTRO de cada setor continuam onde estão (decisão do
  dono): lá é a operação de quem emite; aqui, o histórico de quem recebe. O participante sem
  conta baixa o dele pela própria credencial, que é onde ele volta depois do evento.
- **A guia Certificados do EX é a MESMA do EV** (`lib/certificadosEx.js` — o antigo
  `certificadosEv.js` —, decisão do dono ago/2026): o ARCHÉ EV é parte da atuação da
  Extensão, e duas guias de certificado para a mesma coisa só fariam a coordenação procurar
  em dois lugares. O motor passou a ser da **AÇÃO**, não do evento: **evento gerido fora do
  ARCHÉ** tem a lista de participantes digitada na Extensão e certifica pelo mesmo caminho,
  com o mesmo documento. Muda só o **ato que libera**, porque muda quem confere — ação COM
  evento: o encerramento validado pela PROPPEX; ação SEM evento: a **ação REGISTRADA**, que
  é o ato em que a PROPPEX já confere relatório final e listas. Sem evento, **a lista
  digitada É a lista de presença** (não há credenciamento que a desminta), a CH cai na da
  ação e o certificado sai **sem verso** (não há programação). O texto do documento diz
  "ação de extensão" no lugar de "evento" (`ehEvento` no certificado; o particípio concorda
  — ação *promovida*, evento *promovido*). As rotas são da ação
  (`/api/extensao/:id/certificados`, `/certificado.pdf` e `/assinatura`), e as **assinaturas
  do coordenador** moram no evento quando há um e na própria ação quando não há
  (`caixaCertificado`) — a imagem nunca viaja em payload (`acaoSemSegredos`). Quem pode:
  no evento, quem opera o evento; na ação sem evento, o dono e a gestão da Extensão —
  coordenar `eventos` não dá alcance sobre o que não é evento. O aviso de "seu certificado
  saiu" vale nos dois casos e **não se repete**: a marca `sys-ev-avisos-certificado-v1`
  passou a guardar os e-mails já avisados, e participante incluído depois recebe só o dele.
  O sistema da AEE (`CERTIFICADOS_EXTERNO`) continua citado na guia, para os certificados
  emitidos lá antes de ago/2026.
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
  **"Já inscrito" é uma SAÍDA, não uma parede** (pergunta do dono, ago/2026): o e-mail de
  confirmação É a credencial, e quem não o recebe tenta se inscrever de novo. A duplicidade
  já era barrada (`jaInscrito`), mas o erro não dava caminho. Agora ele diz que a inscrição
  existe e a tela abre a recuperação **já preenchida** com o que a pessoa acabou de digitar.
  A **pista do e-mail** (`emailMascarado`, `j••••@gmail.com`) só sai quando o endereço
  informado é o MESMO da inscrição — ou seja, quando quem pergunta já provou conhecê-lo
  (decisão do dono, ago/2026, revendo a anterior): casando só pelo CPF, a pista faria da rota
  pública um oráculo — com uma lista de CPFs dá para descobrir quem participou de um evento e
  qual o provedor de e-mail da pessoa. Quem digitou o próprio endereço errado continua com
  saída: a recuperação pede CPF e e-mail juntos, e a coordenação vê a lista. A recuperação (CPF + e-mail, os dois) nunca dependeu de e-mail:
  leva direto à credencial. E ganhou **✉ Reenviar o e-mail** (`reenviar: true`), para o caso
  comum, que não é o endereço errado — é o spam. O reenvio vai SEMPRE ao endereço já
  gravado, nunca a um que venha no pedido: senão a recuperação viraria um jeito de mandar a
  credencial de alguém para outro lugar.
  **O e-mail de confirmação é o RECIBO, e sai depois da gravação** (raciocínio do dono,
  ago/2026): a inscrição também deixou de esperar o Drive dentro da fila (`flushJa: false`)
  — o QR projetado no telão faz cinquenta pessoas se inscreverem juntas —, mas a ORDEM
  passou a ser **responder → garantir a gravação (`storage.flush`, fora da fila) → só então
  avisar**. Falha no meio significa que ninguém recebeu nada e a pessoa se inscreve de novo:
  erro que se corrige sozinho. O que não pode acontecer é o contrário — e-mail entregue, com
  QR, de uma inscrição que se perdeu: aí ela chega na porta com um crachá que o sistema não
  reconhece. O `catch` da rota confere `res.headersSent`, porque a resposta já saiu.
  **A porta não espera o Drive** (incidente do credenciamento, ago/2026): `comAcoes` fazia
  `flush` DENTRO da fila, e em produção cada `flush` reescreve o `_estado.json` INTEIRO — dez
  crachás na porta viravam dez uploads em série, e a fila parecia um sistema travado. O
  check-in passou a gravar com `flushJa: false`: o dado entra na memória (de onde a leitura
  seguinte parte) e a subida ao Drive fica para a janela de 1,2 s do storage, que agrupa a
  rajada num upload só. O padrão continua `true` — para o que é raro e caro de perder
  (aprovar, registrar, encerrar), a certeza de que subiu vale a espera. O risco aceito é
  perder até 1,2 s de leituras se a instância morrer no meio; relê-se o crachá.
  **Leitura ruim de monitor autenticado não é ataque** (mesmo incidente): quem passou pelo
  código do monitor já provou quem é, e crachá de outro evento ou print do colega é ruído de
  porta — só o CÓDIGO ERRADO conta no `freioCheckin`. Sem isso, vinte leituras ruins de um
  plantão derrubavam o credenciamento do campus inteiro, que é UM IP atrás do NAT.
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
- **A ação pode ser de MAIS DE UM CURSO** (`cursosExtras` + `normalizarCursosExtras`/
  `cursosDaAcao`/`cursosEmTexto`/`acaoDoCurso` em lib/eventos.js, pedido de um professor
  ago/2026): a jornada é de Engenharia Mecânica E de Engenharia Civil, e o formulário só
  aceitava um. Abrir duas ações para o mesmo evento seria pior de todos os lados — duas
  propostas para a PROPPEX aprovar, dois números na sequência oficial, duas páginas públicas
  com o mesmo QR e a contagem de participantes partida ao meio. Por isso o curso PRINCIPAL
  continua sendo UM (`acao.curso`): é ele que nomeia a pasta no Drive (`extensao/<curso>/…`) e
  responde pela ação; os demais são CO-REALIZADORES, até quatro (acima disso a ação é
  institucional, e para isso a lista já tem "Institucional / PROPPEX"). A régua é do SERVIDOR
  (curso fora do catálogo, repetido ou igual ao principal não entra, e grava-se a grafia do
  catálogo — "engenharia civil" e "Engenharia Civil" não são dois cursos), e **trocar o
  principal tira-o dos corealizadores**, senão a ficha diria "Enfermagem e Enfermagem". O
  campo aparece no assistente (passo 1) e na guia Dados do evento; os DOIS cursos saem no
  cabeçalho, na lista, na página pública e no PDF da proposta e do relatório. E o **filtro por
  curso acha a ação pelos dois lados** (`acaoDoCurso`) — sem isso a coordenação do segundo
  curso não veria o próprio evento, que é o que o pedido queria resolver.
- **Programação única e a conferência da carga horária** (`programacaoUnica`/`somaChHtml` na
  guia Programação do ARCHÉ EV, pedido do dono ago/2026): a CH do CERTIFICADO sai das
  atividades em que a pessoa teve presença; sem atividade nenhuma ela cai na CH da ação
  inteira, e é daí que vinham as horas erradas. Nem todo evento tem grade — a reunião de
  práticas docentes, a palestra de uma tarde —, e por isso um clique cria a atividade que
  **espelha o próprio evento** (nome, datas, local e CH da proposta), nascendo `geral`: ninguém
  precisa marcá-la no formulário e a etapa de escolha do credenciamento segue pulada. Ao lado,
  a **soma das atividades** aparece junto da CH declarada, apontando o que está sem CH e a
  divergência entre as duas. A CH da AÇÃO continua mandando — é a que a PROPPEX aprovou; isto
  é conferência, não substituição, e por isso **não se exige programação** para cadastrar
  evento (seria justamente derrubar o caso do QR no fim da palestra).
- **Nem todo evento quer um site** (`temHotsiteEvento` em lib/eventos.js + a escolha no
  assistente e na guia Página do evento, pedido do dono ago/2026): o professor que dá uma
  palestra e quer só a lista de presença por QR não tem por que montar hotsite — capa,
  programação, palestrantes, blocos, mapa. Com `hotsite: false` o endereço do evento abre
  **só a folha de inscrição** (nome, quando, onde e o formulário com a LGPD), o evento fica
  **fora da vitrine** `/eventos/` — quem não montou página não está divulgando — e o QR
  projetado no fim da palestra leva direto a esse formulário. Credenciamento, presenças,
  exportações e certificados são idênticos nos dois casos: o que muda é só o que o público
  vê. O padrão continua sendo o hotsite, e evento antigo (sem o campo) segue com página.
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
- **Hora-limite da inscrição** (`inscricoesAteHora` + `horaLimiteInscricao`/`prazoInscricaoVencido`
  em lib/eventos.js, pedido dos coordenadores ago/2026): o QR projetado no telão é fotografado,
  e quem NÃO foi à palestra se inscreve à noite — a presença sai certa e a lista de inscritos,
  não. A guia Inscrições ganha a hora ao lado da data, e ela fecha a inscrição **no último
  dia**: o configurado ou, se a data estiver vazia, o fim do evento (é o caso da palestra de um
  dia, que não precisa repetir a data). Evento **sem hora continua valendo o dia inteiro** — o
  padrão não pode fechar mais cedo para quem não pediu. O relógio é o de Brasília
  (`horaLocalHHMM` em lib/datas.js), nunca o do navegador de quem se inscreve, e quem confere é
  o SERVIDOR, dentro da fila (a rota de trocar atividades também).
- **O relatório nasce PRÉ-PREENCHIDO com o que o sistema já sabe** (`sugestaoDoEvento`/
  `aplicarSugestao` em lib/relatorioEx.js + `GET /api/extensao/:id/relatorio-sugestao`, pedido
  do dono ago/2026): o evento correu DENTRO do ARCHÉ — programação lançada, palestrantes e
  comissão nomeados, inscritos contados — e o relatório abria em branco pedindo que alguém
  copiasse à mão o que já está gravado. Entram o **conteúdo programático** (a programação do
  evento; sem ela, a declarada na proposta), os **docentes envolvidos** (palestrantes +
  comissão docente; aluno e apoio ficam fora) e as **contagens**. Duas regras mantêm o
  rascunho honesto: **não sobrescreve** campo preenchido, e a **avaliação/resultados NUNCA vem
  pronta** — é o juízo de quem conduziu a ação e o único campo obrigatório. O aviso diz **de
  onde veio** cada coisa, porque número sugerido que ninguém sabe explicar é pior que campo
  vazio; e o de discentes usa os **presentes** quando houve credenciamento e os **inscritos**
  quando não houve (num evento com 57 inscritos e nenhum crachá lido, "0 discentes" seria
  trocar campo vazio por número errado). Quem monta é o SERVIDOR: a mesma sugestão vale no
  formulário do EX e no encerramento pelo EV.
- **A régua da entrega é UMA só, nos dois caminhos** (`faltaParaEntregar` no POST
  `/api/extensao` e no `/evento/encerrar`, achado da varredura ago/2026): o formulário do
  ARCHÉ EX conferia só as fotos e deixava passar a **avaliação/resultados** — o único campo
  obrigatório, e o que a PROPPEX lê. Uma aba velha ou uma gravação fora do formulário
  entregava o relatório sem ele, e a ação seguia para registro liberando certificados. Na
  entrega, os campos passam por `normalizarRelatorioFinal` e a **data é do servidor**.
- **As duas portas do mesmo relatório** (`atalhoEncerrarEv`, ago/2026): quem organiza um
  evento termina o trabalho no ARCHÉ EV, e lá "Encerrar evento" pede os mesmos campos, as
  fotos, entrega o relatório e manda o encerramento à PROPPEX num clique. Quem chega pelo
  ARCHÉ EX precisa saber que a outra porta existe — senão preenche duas vezes ou não acha
  nenhuma —, e por isso o card do relatório traz o atalho enquanto o evento não foi
  encerrado. A **lista de participantes** só é cobrada quando está mesmo vazia, e a frase
  muda conforme a origem: com evento, ela vem das inscrições e do credenciamento (e vazia
  significa que algo não foi lançado no EV); sem evento, cola-se no bloco da própria ação.
- **O que falta se diz DE UMA VEZ, e a tela leva até lá** (achado do dono, ago/2026): a
  entrega avisava um problema por vez — a pessoa clicava, corrigia, clicava de novo e
  descobria o seguinte —, e num relatório de três telas de altura um "preencha o campo X"
  sem levar ao campo X parece o sistema recusando por nada. Agora o alerta lista tudo o que
  falta e rola/foca/destaca o primeiro item. A **avaliação/resultados** ganhou o asterisco e
  a nota de que é o único campo que o sistema não preenche, mais o botão **"✍ Inserir um
  começo"**, que escreve o que é FATO (quando, onde, carga horária, quantos participantes) e
  para no ponto em que a pessoa continua — o juízo sobre o que a ação alcançou é dela, e é
  isso que a PROPPEX lê.
- **A PROPOSTA É O DOCUMENTO SIMPLES DO PROFESSOR, e a análise tem TRÊS SAÍDAS** (pedido do
  dono, ago/2026: "devem haver duas etapas — Propostas e Relatórios; a proposta é um documento
  mais simples, só com o que o professor preenche"). O formulário de Nova proposta perdeu os
  campos de texto "Certificação solicitada" e "Comissão organizadora" e ganhou **palestrantes e
  comissão ESTRUTURADOS** (linhas no molde da equipe do ARCHÉ EV — nome, CPF/matrícula, e-mail,
  telefone, papel/função ou palestra/instituição, CH), gravando nas MESMAS listas de onde os
  certificados saem (`participantes.palestrantes`/`.comissao`): "isso facilita a emissão de
  certificados depois", e um campo de escrita obrigava a redigitar tudo na emissão. A régua
  dura do certificado NÃO trava a submissão (palestrante ainda em confirmação é o caso normal)
  — o que falta aparece num aviso com confirm, e a cobrança de verdade continua na emissão. Os
  campos antigos gravados (`certificacaoSolicitada`/`comissaoTexto`) não se apagam e continuam
  saindo na ficha e no PDF; o PDF da proposta ganhou os quadros estruturados. A separação das
  guias voltou a ser ESTRITA na guia Propostas (`documentoDaVez`: `SECAO==="acoes"` abre SEMPRE
  o projeto — revendo a regra anterior; "dentro de proposta, campos como relatório final estão
  aparecendo, não faz sentido"); a abertura "no que está pendente" vale só para quem chega de
  fora das duas guias. **A decisão da PROPPEX são três botões, e só** — Aprovar (emite o
  número), **Devolver para alterações** e **Reprovar**, os dois últimos com campo de
  comentário na própria ficha (prompt() não dá espaço para um parecer). **REPROVADA é fim de
  linha** (`POST /api/extensao/reprovar`, etapa própria em lib/situacao.js): difere da
  devolvida no que importa — a devolvida volta editável e reentra pelo reenvio; a reprovada
  não (o reenvio recusa), o registro fica com o motivo como prova da decisão, ela não entra na
  guia Relatórios nem em fila nenhuma, e o professor recebe o e-mail com o motivo
  (`emailPropostaReprovada`, aviso `ex-proposta-reprovada`).
- **O correlato em Relatórios ABRE NA VALIDAÇÃO** (pedido do dono, ago/2026: "o módulo
  Relatórios deve ser aberto assim que o seu paralelo em Propostas for criado e validado" —
  revendo a regra que o segurava até o período começar): aprovada, a ação já aparece na guia
  Relatórios, mesmo com o período no futuro. `relatorioNoCiclo` em lib/situacao.js deixou de
  olhar `periodoInicio`.
- **PROJETO e RELATÓRIO FINAL são DOIS DOCUMENTOS, e quem escolhe é a SEÇÃO**
  (`documentoDaVez` na SPA da Extensão, pedido do dono ago/2026): a ação abria com os dois na
  mesma página — a ficha do projeto e, logo abaixo, o formulário inteiro do relatório, a lista
  de participantes e a fileira de botões dos dois ("fica confuso, muitos botões e opções").
  A primeira tentativa foi um par de guias DENTRO da ação, e o dono a recusou com razão: "não
  vejo sentido ter duas guias, se há dois setores — propostas ficam em Propostas, e relatórios
  ficam em Relatórios". Era uma segunda navegação por cima da que a barra já faz. Agora:
  aberta pela guia **Propostas**, a ação mostra o PROJETO e só ele; aberta pela guia
  **Relatórios**, mostra o relatório final e tudo o que o alimenta — portfólio, lista de
  participantes e a **operação do evento** (programação, inscritos, presenças, transmissão),
  que é de onde saem os números do documento. **A regra vale enquanto a PROPOSTA é o documento
  vivo** (achado do dono, ago/2026: "projeto finalizado não deveria abrir o relatório pra
  preenchimento?"): validado o projeto e começado o período, não há mais o que fazer nele, e
  abrir a ficha no projeto deixava quem chegou pela guia Propostas num beco — o cabeçalho dizia
  "aguardando relatório final" e o formulário estava noutra guia. A ficha passa a abrir no
  RELATÓRIO quando é ele que falta, venha de onde vier; a separação das GUIAS não muda, e o
  botão de voltar ao projeto segue a um clique. De outro lugar (o Painel, um atalho) vale o que
  está pendente. Quem guarda a origem é `SECAO`, porque `nav('detalhe')` não a sobrescreve —
  a mesma variável que recorta a lista. Um botão discreto leva ao outro documento da MESMA
  ação, senão sair do projeto para o relatório exigiria voltar à lista e procurá-la de novo.
- **O PDF timbrado só sai depois de VALIDADO** (pedido do dono, ago/2026, revendo a decisão
  anterior de deixar o relatório sair como rascunho): o documento no timbre do UNIEGO, com as
  assinaturas da pró-reitoria e da reitoria no pé, AFIRMA um ato institucional — enquanto o
  projeto não foi validado e o relatório não foi encerrado, esse ato não aconteceu, e um PDF
  assim circulando vira documento por engano. A régua é do SERVIDOR, na rota de export
  (`proposta` exige `numeroAcao`; `pdf` exige a etapa `encerrado`), e a tela só deixa de
  oferecer o que ele recusaria. Para conferir o texto antes, a ficha na tela tem os mesmos
  campos. Os documentos saem com **`Cache-Control: no-store`**: o navegador guardava o PDF
  baixado antes e devolvia o velho no clique seguinte — quem acabava de corrigir um texto
  reabria o documento e via o erro de novo.
- **A barra de ações fica no ALTO da ação** (`barraAcoes`, pedido do dono ago/2026): os dois
  PDFs — **Projeto** e **Relatório final** — e o ato do momento (encerrar e entregar, validar
  e registrar, ou reabrir). Eles existiam só no último card, depois do relatório, do portfólio
  e da lista de participantes: quem abre a ação para imprimir o projeto ou para encerrar o
  relatório procura no alto, não rola três telas. O ato é **um só** por vez, senão a barra
  vira outro menu para decifrar, e o botão de entrega **diz o que falta** quando falta. O PDF
  do relatório sai **antes da entrega também**, com o que já estiver preenchido — é assim que
  se confere o documento antes de assinar embaixo.
- **A guia Relatórios é onde a ação se conclui** (pedido do dono, ago/2026): ela mostra tudo
  o que ainda deve relatório — a **aprovada cujo período já começou** (antes, a ação só
  aparecia ali depois de o período vencer, e quem encerrava a atividade no mesmo dia não a
  encontrava em lugar nenhum), a pendente, a entregue e a **registrada SEM relatório**, que é
  a anomalia e precisa ser vista para ser corrigida. O que ainda não começou fica de fora:
  não há o que relatar, e listá-lo enterraria os atrasados. No cartão, a gestão **entrega
  dali mesmo** (`entregarDaLista`) quando os obrigatórios já estão gravados; faltando algo, a
  linha DIZ o que falta e leva à ação. `reabrirAcao` desfaz o registro **só** da que foi
  finalizada sem relatório — e o servidor preserva `registrada` em silêncio nas demais
  (recusar travaria a gravação inteira por causa de uma aba velha).
- **Entregar e registrar são dois atos, e os dois têm dono** (achado do dono, ago/2026): o
  botão de ENTREGAR o relatório só era desenhado para quem NÃO é gestão — o pró-reitor, que
  organiza as próprias ações e ainda cobre a ausência do responsável, preenchia o relatório,
  anexava as fotos e não tinha como entregá-lo; a ação ficava fora da guia Relatórios, que é
  onde ela se conclui. Agora a gestão entrega também, e o ato fica marcado
  (`relatorio.entreguePelaGestao`, "em nome do responsável"). Do outro lado, **registrar
  passou a exigir o relatório entregue**: dava para "Finalizar (Registrada)" uma ação que
  nunca teve relatório — ela sumia da guia Relatórios sem nunca ter aparecido lá, e o
  registro é justamente o que libera os certificados nas ações sem evento. A régua é do
  SERVIDOR e vale só na TRANSIÇÃO: ação já registrada (as migradas do papel) segue gravável.
- **Encerrar o evento É entregar o relatório final** (`lib/relatorioEx.js` + o formulário do
  botão "Encerrar evento" no ARCHÉ EV, achado do dono ago/2026): o primeiro evento gerido de
  ponta a ponta encerrou, os certificados saíram — e a ação continuou **sem relatório** no
  ARCHÉ EX, porque quem organiza termina o trabalho no EV e não volta ao outro setor. O
  encerramento passou a pedir os campos do relatório e as fotos do portfólio, e grava a
  entrega (`relatorio.entregueEm`, `status: relatorio-entregue`) com o snapshot dos números
  do evento — o mesmo que a entrega pelo formulário do EX grava. Os campos são **um catálogo
  só** (`CAMPOS_RELATORIO_FINAL`, servido em `camposRelatorio`) e a régua é **uma só**
  (`faltaParaEntregar`): dois catálogos iguais em dois lugares acabam diferentes, e aí um
  caminho aceita o que o outro recusa. Os anexos usam a MESMA rota do portfólio
  (`/api/extensao/anexo`) — é o mesmo portfólio da mesma ação.
- **A foto que subiu errada se apaga** (`DELETE /api/extensao/:id/anexo/:ref`, pedido do dono
  ago/2026): quem organiza o evento sobe a foto do outro dia, a repetida ou a que saiu tremida — e
  convivia com ela no documento que a PROPPEX apresenta ao MEC. No ARCHÉ EX o ✕ já existia, mas
  **reescrevia a AÇÃO INTEIRA**: numa aba aberta há algum tempo, isso desfazia o que outra pessoa
  tivesse anexado no meio-tempo. Agora a rota é própria e tira só aquele anexo, devolvendo a lista
  como ficou; o arquivo **continua no Drive** (o que sai é a referência no relatório). No ARCHÉ EV
  o encerramento passou a mostrar **miniaturas** com ✕ no lugar da lista de nomes — ver a foto é o
  que permite reconhecer a que subiu errada. O contador de fotos cai junto: removida a terceira, a
  entrega volta a ser recusada, e a tela diz isso antes do clique. E o **anexar ganhou a guarda que
  faltava**: ela só conferia login, e qualquer conta aprovada podia anexar arquivo ao portfólio de
  qualquer ação. Agora é `podeOperarEvento` — o dono, quem opera o evento e a gestão da Extensão.
- **As fotos entram NO PDF do relatório** (`paginasDeFotos` em lib/pdf.js + `fotosDoRelatorio`
  no server + `files.read` nos três backends, pedido do dono ago/2026): o relatório final é o
  documento que a PROPPEX apresenta ao avaliador do MEC, e uma lista de nomes de arquivo não
  comprova a realização — a foto, sim. O servidor LÊ os anexos de imagem do portfólio (Drive,
  S3 ou disco) e os entrega ao gerador já como bytes; o PDF ganha páginas de **Registro
  fotográfico** ao FINAL, depois das assinaturas (o corpo é o que se assina; a foto é o anexo
  que o comprova), **2 por linha, 6 por página**, com o nome do arquivo na legenda. Três
  freios, porque isto sai da franquia de banda: só imagem, **24 fotos** e **8 MB** por arquivo.
  Formato que o PDFKit não lê (HEIC, WEBP) sai como moldura com a legenda dizendo isso — um
  arquivo exótico não derruba o relatório inteiro.
- **O relatório final exige FOTOS** (`lib/portfolio.js`, decisão do dono ago/2026): a entrega
  pede **no mínimo 5 fotos** no portfólio da ação, sem teto — o registro fotográfico é o que
  comprova a realização, e proposta e relatório sozinhos não se conferem depois. A régua é
  uma só (`faltamFotos`): a tela conta e avisa antes, e o servidor recusa a entrega sem elas.
  Foto é o anexo com tipo de imagem (nos registros antigos, pela extensão) — documento
  anexado continua entrando no portfólio sem contar para o mínimo. **O relatório continua
  sendo do ARCHÉ EX**: é da ação de extensão, com o PDF timbrado; o ARCHÉ EV leva até lá.
- **Comissão organizadora e palestrantes** (guia própria no ARCHÉ EV +
  `POST /api/extensao/:id/equipe`, pedido do dono ago/2026): professores, monitores, alunos
  organizadores e colaboradores recebem **certificado à parte** do participante, e quem emite
  é o sistema da AEE pela planilha que o ARCHÉ exporta. As colunas de lá são fixas —
  **CPF ou matrícula, nome, e-mail, telefone** (e o **título da palestra**, no palestrante) —,
  e linha incompleta não emite certificado: por isso a régua (`faltaParaCertificado`) vale na
  **gravação**, não na véspera, e a mesma conta aparece ao vivo na tela e no quadro de
  pendências das Exportações. **O telefone passou a ser obrigatório também na inscrição
  pública** pelo mesmo motivo. CPF informado é conferido (`cpfValido`) — certificado emitido
  com CPF errado não se corrige depois. Papéis em `PAPEIS_COMISSAO`; rota DEDICADA porque o
  EV não usa o POST em bloco da Extensão.
- **A credencial do participante** (decisão do dono, ago/2026): a inscrição já nasce
  **pré-preenchida para quem está logado** no ARCHÉ (`/api/me` no hotsite — só os dados da
  PRÓPRIA conta, com o aviso RECOLHIDO numa linha só, que abre no clique e traz a conta usada
  e o "não sou eu, limpar"; visitante externo segue com o
  formulário em branco, que é o público da página). O **e-mail de confirmação leva o QR
  embutido** (PNG inline por `cid:`, `multipart/related` no mailer) — é na caixa de entrada
  que a pessoa procura a credencial no dia. Na página da inscrição e logo após inscrever-se
  há **⬇ Baixar o QR** (PNG, vale offline) e **📅 Adicionar ao calendário** (.ics com
  lembrete na véspera). **Carteiras digitais** — são TRÊS caminhos, e o primeiro é o que
  já funciona sozinho: (1) o **e-mail de confirmação descreve a reserva** em schema.org
  (`EventReservation` em JSON-LD, `emailInscricaoEvento`), com `underName`, `reservationFor`
  (datas em -03:00 tiradas da própria programação, local e endereço), `reservationNumber` (o
  código de 6) e o **`ticketToken: "qrCode:<token>"`, que é o campo que faz o passe nascer
  com o QR escaneável** — é assim que o passe do Sympla aparece no Google Wallet (aquele
  cartão traz "Ver e-mail" no rodapé: quem o monta é o Gmail lendo o e-mail, não uma conta de
  emissor). O bloco é invisível para quem lê e some quando a ação não tem data;
  (2) o botão **"Adicionar ao Google Wallet"** (`public/assets/arche-wallet.js`) aparece no
  **painel do inscrito**, no hotsite logo após inscrever-se e no e-mail de confirmação —
  é um LINK simples para a rota do passe com **`?ir=1`**, que assina o JWT na hora e
  redireciona ao `pay.google.com`: sem JavaScript no meio, o mesmo endereço serve às três
  pontas e nenhum passe chega envelhecido. O cartão leva o logotipo do UNIEGO e a capa do
  evento (quando houver), e a **classe vai definida no próprio JWT** — assim a configuração
  se resume ao emissor e à conta de serviço, sem criar classe à mão no console
  (`GOOGLE_WALLET_CLASS_ID` só se quiserem personalizar a arte lá). São **duas env vars**:
  `GOOGLE_WALLET_ISSUER_ID` e `GOOGLE_WALLET_SA_KEY`, que recebe o **arquivo JSON da conta
  de serviço INTEIRO**, como o Google o entrega — `credenciaisWallet` tira dele a chave e o
  `client_email` (que vira o `iss` do JWT). Foi assim que a configuração parou de quebrar
  (ago/2026): recortar a `private_key` e colá-la num campo de uma linha a truncava, e o
  passe morria num 500 mudo. `GOOGLE_WALLET_SA_EMAIL` sobrou como opcional, para quem colar
  a chave sozinha, e `GET /api/eventos/wallet/diagnostico` (só gestor geral) diz o que
  chegou — nunca a chave, só o formato dela. Sem as variáveis o servidor devolve
  `walletGoogle: false`, o botão não se desenha em lugar nenhum e a rota responde 501 —
  nada quebra, e o QR em PNG continua valendo na entrada; (3) o
  **Apple Wallet** exige certificado do Apple Developer Program (.pkpass sem assinatura o
  iPhone recusa) e por isso não tem botão enquanto a instituição não tiver o certificado.
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
- **Excluir evento** (`POST /api/extensao/:id/excluir`, botão 🗑 no cartão do ARCHÉ EV,
  pedido do dono ago/2026): cadastro errado precisava de desfazer — até então só havia
  "despublicar", que esconde a página e deixa o registro. O servidor escolhe O QUE some pelo
  que a ação já viveu: **sem Número da Ação e sem relatório**, é cadastro do assistente que
  não virou nada e some INTEIRA; **já aprovada**, some só o EVENTO (página, programação,
  inscritos) e a ação continua no ARCHÉ EX — o número vem da sequência oficial e apagá-lo
  abriria buraco na numeração. Ação **registrada** não se apaga. Quem pode: a gestão da
  Extensão sempre; o dono, enquanto não houver número. Com inscritos, a confirmação exige
  **digitar o nome do evento** — é o que separa o clique errado da decisão de apagar o
  cadastro de quem se inscreveu. O que sumiu fica resumido em `sys-ex-exclusoes-v1` (sem
  dado pessoal): sem isso ninguém explica depois por que a ação desapareceu.
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
- **Curricularização da Extensão** (`lib/curricularizacao.js` + bloco na proposta do ARCHÉ EX,
  pedido do dono ago/2026): a Resolução CNE/CES nº 7/2018 exige 10% da carga horária do curso
  em extensão, e o avaliador do MEC não pergunta "vocês fazem extensão?" — pergunta QUAL
  disciplina do PPC cada ação atende e QUANTAS horas foram curricularizadas. A proposta ganha
  a caixa "vinculada a disciplina(s) do curso", que abre uma lista de componentes (disciplina,
  período da matriz, CH curricularizada, acadêmicos alcançados, docente e — só se for de outro
  curso — o curso), mais o texto da integração. É **opcional e não trava a submissão** (a
  maioria das ações não é curricularizada), mas o que estiver pela metade não conta: o quadro
  soma só o componente com período e CH. Desmarcar **zera os componentes** — disciplina
  esquecida num vínculo desfeito somaria hora que ninguém cumpriu. O vínculo sai na ficha da
  ação, no **PDF da proposta e do relatório** e no Registro de Atividade (.docx), e a gestão vê
  o quadro por curso no Painel (`GET /api/extensao/curricularizacao`), contando **só o que
  comprova** — aprovada, com relatório entregue ou registrada; proposta em análise não é
  comprovação. Os `codigo` de `PERIODOS` são a chave do que já está gravado.
- **A COLAGEM DO WORD NÃO ESTRAGA MAIS O DOCUMENTO** (`lib/texto.js` +
  `public/assets/arche-colagem.js` + `blindarTexto` em lib/pdf.js, achado do dono ago/2026
  na proposta da Campanha Agosto Dourado): o texto aparecia CERTO na tela e saía
  EMBARALHADO no PDF timbrado. As duas coisas eram verdadeiras — o navegador desenha quase
  tudo (e põe "[]" no que não sabe), e as fontes padrão do PDF só desenham o repertório
  **WinAnsi**; o que estiver fora vira lixo na página. E uma colagem "com formatação" traz
  muita coisa de fora: as **letras que não são letras** (os alfanuméricos matemáticos de
  U+1D400 — copiar um trecho em NEGRITO devolve símbolos que *parecem* letras e não são),
  os **marcadores de lista do Word** (área de uso privado: U+F0A7, U+F0B7), espaços que não
  são espaços e marcas invisíveis. São **três camadas, e cada uma resolve um problema
  diferente**: a TELA limpa na colagem (para a pessoa VER o que vai ficar gravado — sem
  isso o defeito só aparece dias depois, no PDF que a PROPPEX abre); o SERVIDOR limpa na
  GRAVAÇÃO (`limparProfundo` no POST /api/extensao e no encerramento pelo EV: o defeito não
  é de uma tela, é de todo texto que entra, por qualquer porta); e o GERADOR DE PDF blinda
  uma última vez antes da tinta (`blindarTexto` embrulha `doc.text` em TODO PDF do ARCHÉ) —
  é o que conserta os registros gravados ANTES desta correção, sem ninguém redigitar nada.
  A limpeza **não reescreve texto**: não mexe em acento nem em ç, converte de volta o que
  já era letra, troca marcador exótico pelo "•" do repertório e só descarta o que não tem
  **A lista de blocos deixou de ser a régua** (segundo achado do dono, ago/2026: o mesmo PDF
  continuou saindo torto): o Unicode tem mais formas de escrever uma letra do que cabe num
  catálogo — matemáticos de outras faixas, monoespaçado, largura inteira, letras em círculo,
  ligaduras, dígitos decorados. Todas trazem a letra real declarada pelo PRÓPRIO padrão, na
  **decomposição de compatibilidade** (`"𝗖".normalize("NFKD")` devolve `"C"`), e é ela que
  fecha o buraco. Não é adivinhação nem reescrita: é ler o que o Unicode afirma. Roda **só em
  quem já não desenha no PDF**, então acento e ç nunca passam por ali — eles desenham, e o
  NFKD os partiria em letra + acento.
  como ser impresso. **Imagem não é texto** — `base64`, capa, foto, logo e assinatura ficam
  fora (a lista de chaves puladas está em lib/texto.js), senão a limpeza destruiria o
  arquivo.
- **UM VOCABULÁRIO SÓ PARA OS STATUS** (`lib/situacao.js`, decisão do dono ago/2026): o mesmo
  fato tinha nome diferente em cada tela — no ARCHÉ EX a ação era "submetida/aprovada/relatório
  entregue/registrada"; no ARCHÉ EV o evento era "rascunho/encerramento solicitado/validado" —,
  e quem encerrava o evento num setor ia procurar o relatório no outro sem saber qual rótulo era
  o dele ("uma confusão de status de evento finalizado, entregue…"). São **DOIS EIXOS**, e é por
  isso que a lista nunca fechava numa linha só: a **ETAPA** do processo (*em preenchimento ·
  aguardando validação · validado / evento em andamento · evento aguardando encerramento ·
  aguardando validação [do encerramento] · evento validado e certificados emitidos*) e a
  **PUBLICAÇÃO** da página, que é decisão INDEPENDENTE de quem organiza — daí as leituras
  compostas ("validado e não publicado"). A conta é do SERVIDOR e viaja pronta em
  `acao.situacao` (calculada em `acaoSemSegredos`, **nunca gravada**: depende da data de hoje,
  e o POST a descarta): as duas SPAs são HTML estático, e se cada uma refizesse a régua as duas
  voltariam a discordar sobre o mesmo evento. `relatorioNoCiclo`/`relatorioPendente` vêm junto,
  para a guia Relatórios não repetir o recorte.
- **Os TRÊS documentos do evento, e os atos que os produzem** (pedido do dono, ago/2026): todo
  evento gera **projeto, relatório final e certificados**, e nenhum deles se cria à mão —
  **cadastrar o evento CRIA o projeto** (é a própria ação de extensão); **validar o evento É
  validar o projeto** (mesmo registro: a aprovação emite o `EXT-AAAA-NNN` — e por isso passou a
  ser **recusada com o projeto incompleto**, senão a sequência oficial numeraria uma ação sem
  justificativa nem metodologia); **encerrar o evento ENTREGA o relatório final**; e **validar o
  encerramento valida e encerra o relatório final NO MESMO ATO**, junto com a liberação dos
  certificados (`status: "registrada"` + `relatorio.validadoPeloEncerramento`; devolver desfaz o
  registro, porque ação registrada com encerramento em aberto afirmaria um ciclo que não fechou).
  Antes eram dois atos, e o segundo ninguém sabia que faltava: o evento ficava concluído no EV e
  eternamente "relatório entregue" no EX. Por isso a ação COM evento tem **uma porta só** — o
  "Validar e registrar" do ARCHÉ EX a recusa e leva ao encerramento no EV. O evento que correu
  **fora** do sistema segue pelo ARCHÉ EX: projeto → relatório final com a lista → registro.
  A guia **Início do EV** abre com o trilho dos três documentos (o que existe, o que falta e o
  ato que produz cada um) — era isso que faltava para a integração ser legível de dentro do EV.
- **O encerrado NÃO some da guia Relatórios** (achado do dono, ago/2026: "um evento acabou de ser
  encerrado e ele não aparece na guia relatórios"): a ação saía da lista justamente quando o
  relatório passava a existir — quem encerrou o evento vinha procurar o documento e não achava.
  Agora ela fica, e o recorte é `relatorioNoCiclo`: entra tudo o que já foi validado e começou;
  fica de fora só o projeto ainda em análise e a ação que não começou, que enterrariam os
  atrasados. A **ordem é a da EXECUÇÃO, do mais recente para o mais antigo** (`dataExecucao`,
  por `periodoFim`; correção do dono ago/2026): quem abre a guia vem atrás do evento que
  acabou de acontecer, e ele caía no fim da página — antes porque a ordem era a da CRIAÇÃO da
  proposta (uma submetida em março vinha na frente de um evento realizado ontem), depois
  porque eu havia empurrado o encerrado para o fim. Quem está atrasado continua visível: o
  bloco "quem deve relatório" abre a guia e cada cartão traz os dias de atraso ao lado.
- Fluxo da Extensão: proposta → aprovação (nº `EXT-AAAA-NNN`) → relatório final →
  participantes (3/3 completa) → **registrada → certificados**. Não alterar o formato do nº.
  A ordem é essa desde ago/2026 e é o que `acaoCertificavel` cobra: nas ações SEM evento é o
  REGISTRO que libera o certificado, porque é nele que a PROPPEX confere relatório e listas.
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
- Estado do app em chaves `/api/estado`; chaves `auth-*`, `sys-*`, `atas-*`, `ic-*`,
  `ex-*`, `esp-*`, `mon-*` e `extensao-config-*` (a sequência oficial do nº da ação) são internas e invisíveis pela API — quem guarda dado com recorte por pessoa
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
- **O ano do NÚMERO é o ano da SESSÃO** (`normalizarAta` + o aviso `ano-do-numero`, achado
  do dono ago/2026): uma ata do NDE de Psicologia com sessão em 21/02/2025 saiu numerada
  `ATA-NDE-PSI-2026-017`. O campo `ano` congelava no primeiro valor gravado — o rascunho
  nasce com a data de hoje —, e trocar a data para a sessão retroativa não o desfazia; é
  justamente esse campo que a numeração usa. Agora ele **acompanha a data da sessão
  enquanto a ata não tem número**, e **se fixa depois de numerada**: o número já foi emitido
  e é a chave do que está arquivado. As que já saíram tortas continuam no arquivo, e um
  aviso (que não trava) as aponta. **Reemitir é ato da GESTÃO** (`POST /api/atas/:id/renumerar`
  + botão no aviso da ata): o número volta para a série do ano certo, o antigo fica em
  `numerosAnteriores` e no histórico — ele pode ter sido citado noutra ata ou num ofício já
  entregue —, e o lugar que ele deixou na série velha fica VAGO de propósito (número não se
  reaproveita; o buraco é o que explica depois por que a sequência de 2026 pula um degrau).
  O ACERVO INTEIRO foi reorganizado de uma vez (`renumerarAcervo` + `reorganizarNumeracaoDasAtas`,
  marca `sys-atas-renumeracao-v1`, autorização do dono ago/2026: "pode reenumerar todas —
  minha equipe está avisada para reimprimir"): não era só o ano errado, a própria ordem estava
  embaralhada (a sessão de 21/02 com o número 017 e a de 18/09 com o 010). Cada série
  (órgão + curso + ano da SESSÃO) passa a ser 001, 002, 003… **na ordem em que as reuniões
  aconteceram** — num arquivo que se apresenta ao MEC, o número precisa acompanhar o tempo.
  A passada roda UMA vez no arranque e **não** a cada partida: uma ata retroativa registrada
  depois deslocaria em silêncio o número de todas as seguintes daquele ano, inclusive as já
  impressas e assinadas. Para repetir depois de um lote de atas antigas, o botão
  **"Reorganizar a numeração"** na guia Acompanhamento (`POST /api/atas/renumerar-acervo`, só
  gestão) faz a mesma coisa — com a diferença que importa: alguém decidiu. Rascunho e ata sem
  data de sessão ficam de fora, e rodar de novo sobre um acervo em ordem não troca nada. O PDF já arquivado no Drive fica onde está, porque a cópia arquivada é prova do que
  existiu; quem quiser a cópia com o número novo gera pelo botão, que rearquiva na pasta do
  ano certo.
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
  "Assinaturas do certificado", só gestor geral — o MESMO card guarda a da **pró-reitora
  acadêmica**, que é quem assina os certificados de monitoria) e ficam no estado interno
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
- **A vitrine deixou de ser "da IC"** (achado do dono, ago/2026): uma coordenadora divulgou o
  endereço no WhatsApp para anunciar o **edital de monitoria**, e a prévia do link dizia
  "Iniciação Científica — UNIEGO". A página nasceu como a vitrine da IC e hoje reúne os TRÊS
  processos (graduação, ICEM e Monitoria), com a Monitoria vindo da PROAC. Título, cabeçalho,
  descrição e `og:*` passam a dizer **Editais e Resultados — UNIEGO** (as `og:*` são explícitas
  porque é o que o WhatsApp lê), e o chamado de entrada leva aos DOIS setores. O **endereço
  `/ic/` fica** — ele já circula em grupos e ofícios, e link divulgado não se troca —, e
  **`arche.app.br/editais` serve o MESMO arquivo** (não redireciona: os dois endereços são o
  documento), para quem divulgar de agora em diante. No mesmo passo, o texto do Edital 03/2026
  passou a escrever o nome legal da instituição — **Centro Universitário Evangélico de
  Goianésia** —, que é como o edital 01/2026 arquivado o escreve e como consta da Portaria MEC
  nº 623/2025; faltava o "Evangélico".
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
- **Folha de assinaturas da ata** (`assinantesDaAta` em lib/atas.js + as rotas
  `/api/atas/:id/assinatura*`, pedido dos órgãos ago/2026): a assinatura digitalizada de quem
  esteve presente sai **acima da linha** no PDF, e a linha continua ali — a via impressa é a que
  circula na mesa, e quem não enviou imagem assina à caneta no mesmo lugar. É o contrário do
  certificado, onde quem não tem imagem não aparece. Assinam a presidência, a secretaria e todo
  **presente**; ausente e falta justificada não assinam, e quem preside não assina duas vezes.
  A imagem é a MESMA do resto do portal (`sys-assinaturas-usuario-v1`): **envia-se uma vez** e
  vale em toda ata em que a pessoa constar. **São DUAS chaves, nesta ordem** (`refDoAssinante`;
  pedido do dono ago/2026: "rastreie pelo nome, para ganharmos tempo"): o **e-mail**, quando a
  lista de presença o traz — é a chave forte, e é o que separa dois homônimos —, e o **NOME
  COMPLETO** quando não traz. Sem a segunda, o recurso não serviria ao acervo: boa parte das
  listas antigas não tem e-mail nenhum, e a mesma professora aparece em dezenas de atas de NDE e
  de Colegiado — enviar a imagem uma vez por ata seria o trabalho que isto existe para evitar.
  Enviada em qualquer ata, ela passa a sair em **todas** as que trazem aquele nome, inclusive nas
  já registradas, e a tela **diz quando o casamento foi pelo nome** e **quantas outras atas do
  acervo** o envio acabou de cobrir. Nome de **uma palavra só não é chave** ("Ana" não identifica
  ninguém, e uma assinatura colada em toda "Ana" do acervo seria pior que nenhuma): essa linha
  fica com a linha em branco, para assinar à caneta. Entre dois registros do mesmo nome vence o do
  **titular** e, empatados, o mais recente. A presidência é declarada por NOME (o formulário não
  pede o e-mail dela) e `validarAta` já exige que ela conste entre os presentes: é de lá que sai o
  e-mail, senão quem presidiu apareceria sem assinatura mesmo tendo enviado a sua.
  **E o e-mail se COMPLETA pelo nome** (decisão do dono, ago/2026: "coloque como regra principal o
  nome, inclusive, atualizando os e-mails"): informado o e-mail de alguém numa ata — ao salvá-la ou
  ao subir a assinatura dela —, ele é gravado em **toda ata do acervo em que o mesmo nome aparece
  SEM e-mail** (`propagarEmailPorNome`/`paresDeIdentidade`). É o que faz o vínculo fraco por nome
  virar o vínculo forte por e-mail sem ninguém reabrir ata por ata, e vale nos dois sentidos: a
  assinatura, que já saía pelo nome, passa a sair pelo e-mail. Três freios: **nunca sobrescreve**
  endereço já preenchido (o mesmo nome com outro e-mail pode ser a segunda conta da pessoa ou um
  homônimo — a tela DIZ que há divergência, e quem decide é gente); **endereço pela metade não
  entra** (`EMAIL_PLAUSIVEL`, senão um "jadson@unieg" digitado no meio de uma frase se espalharia
  para sempre, já que ninguém o sobrescreve); e a **gravação automática não propaga** — ela roda a
  cada poucos segundos, com o campo ainda sendo digitado. A tela devolve em número quantas atas
  ganharam o e-mail.
  **A porta de TERCEIRO vale só para a folha da ATA** (achado da varredura, ago/2026): o registro
  de assinaturas é UM só, e `assinaturaDoUsuario` — que assina o relatório de aula prática, o
  semestral e os certificados de evento — passou a devolver **apenas a do titular**. Sem isso, a
  secretaria que digitalizasse a assinatura de um professor para a folha de uma ata estaria, sem
  querer, assinando em nome dele documentos que afirmam um ato dele. Quem lê a folha da ata é
  `imagensDaFolhaDaAta`, que aceita as duas origens de propósito.
  **Duas portas, com a ORIGEM marcada** (decisão do dono, ago/2026, revendo a regra anterior): a
  pessoa envia a sua no `/perfil/` (`titular`) e a **secretaria do órgão** pode digitalizar e
  subir por um membro (`terceiro`), de dentro de uma ata em que ele é participante. A regra
  absoluta de que ninguém envia a de outro protegia o que importa e não resolvia o colegiado —
  metade dos membros de um NDE não abre o portal, e a folha ficaria em branco esperando gente que
  não vem. As três regras que a marca sustenta: a de terceiro **nunca sobrescreve a do titular**
  (409); o titular **substitui ou apaga a qualquer momento**, seja qual for a origem; e quem
  subiu uma de terceiro desfaz o próprio engano, nunca mexe na do titular (403). A tela **diz de
  onde veio cada uma** — assinatura carregada por outra pessoa não pode parecer o mesmo que
  assinatura enviada pelo dono. O contexto é sempre UMA ATA (`podeEditarAta` + o e-mail tem de
  ser participante dela): sem esse laço, a rota viraria "suba a assinatura de qualquer e-mail do
  UNIEGO". Quem assina é calculado **uma vez** (`assinantesDaAta`), e é a mesma lista que a tela
  mostra e que o PDF imprime. **A resposta do envio fica NO CARD** (`ASS_MSG`, achado do dono
  ago/2026): subir a assinatura de um colegiado é tarefa em série — dez, quinze envios seguidos —,
  e o banner do topo faz `scrollIntoView`; a cada imagem a página saltava para o começo e a
  pessoa rolava de volta até a folha.
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
- **Busca no acervo** (`buscarAtas` em lib/atas.js + `GET /api/atas/busca`, guia "Buscar no
  acervo", pedido do dono ago/2026): "isso já foi discutido em alguma reunião?" não se
  responde abrindo ata por ata. A varredura cobre onde a discussão mora — pontos de pauta,
  discussões, deliberações, encaminhamentos, informes, observações, presenças e o texto da
  minuta — e devolve o **TRECHO** com a expressão destacada e o **lugar** ("Ponto 3 ·
  deliberação"): é o trecho que responde; o número e a data dizem onde provar. Acento e caixa
  não contam (`normalizarBusca`), dois termos exigem os dois **na mesma ata**, e o destaque
  vem do servidor em partes marcadas — a tela não repete a normalização. O **recorte por
  autor vale igual**: quem busca só encontra o que já podia ver (a rota filtra por
  `podeVerAta` antes de varrer). Filtros de órgão, curso, período e situação estreitam. A busca
  fica **em evidência no alto do Arquivo de atas** ("Busca por conteúdo de atas"), separada do
  **filtro da lista** (que só olha número, órgão e nomes) — confundir as duas custa tempo de
  quem procura. E o Arquivo desenha **chassi e lista separados**: redesenhar tudo a cada tecla
  tirava o cursor da caixa de texto (achado do dono, ago/2026).
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

- **ARCHÉ ES — Reserva de Espaços** (`lib/espacos.js` + `public/espacos/` + rotas
  `/api/espacos/*`, decisão do dono ago/2026): auditório, quadra, mini auditórios, sala de
  transmissão, salas de aula e laboratórios eram reservados por WhatsApp e caderno na
  recepção — duas turmas no mesmo auditório era o desfecho previsível. Três chaves internas
  (`esp-espacos-v1`, `esp-reservas-v1`, `esp-bloqueios-v1`, fora do `/api/estado`, porque
  guardam contato de quem pediu) e uma fila de escrita (`comReservas`), que é o que faz a
  trava valer: dois pedidos simultâneos só se enxergam dentro dela.
  **Espaço confirmado ou bloqueado RECUSA o pedido** — não é aviso, é 409; o calendário
  existe para o engano não chegar até lá. **Solicitação concorrente não trava** (é a fila, e
  quem decide é a gestão), mas aparece para quem decide.
  **Nem todo espaço é único**, e o catálogo diz de que tipo cada um é (`conflito`):
  `unico` (auditório, quadra, convivência, sala da reitoria, transmissão — sobrepor é
  choque), `por-detalhe` (sala de reuniões da coordenação, uma POR CURSO; laboratório, um
  por nome — choca com quem pediu o MESMO complemento) e `multiplo` (sala de aula, das quais
  há dezenas: pedir cinco no bloco C não colide com quem pediu três). Espaço com complemento
  o exige (bloco A–E, curso, nome do laboratório).
  **Um pedido leva VÁRIOS espaços e um PERÍODO de datas**: evento grande toma o campus
  inteiro por uma semana, e abrir doze pedidos seria transformar um ato em doze.
  **Um pedido de vários dias quer dizer DUAS coisas** (`atravessaMeiaNoite`/`janelasDaReserva`
  em lib/espacos.js, achado de uma professora ago/2026): a **janela que se repete a cada dia** —
  o congresso de 19 a 30/10, das 8h às 18h, com as noites livres para outro — e a **ocupação
  contínua que atravessa a noite**, das 18h de um dia às 9h do dia seguinte. Só a primeira
  existia, e a validação comparava as HORAS sem olhar o dia: quem precisava do espaço noite
  adentro era recusado com "o término tem de ser depois do início". O que separa uma da outra é o
  próprio pedido — com mais de um dia, término em hora que não vem depois do início **só pode**
  ser a travessia (como janela diária ela seria vazia) —, e por isso não há caixa a mais no
  formulário. Reconhecida, a ocupação é UM bloco contínuo, **inclusive os dias inteiros do meio**:
  bloquear demais devolve espaço que se libera, bloquear de menos põe duas atividades na mesma
  sala. O conflito deixou de comparar hora-do-dia e passa a comparar **minutos absolutos**
  (`janelasDaReserva`), que é o que torna os dois modelos comparáveis entre si; a ocupação em
  horas sai do mesmo lugar. Dentro do MESMO dia, terminar antes de começar continua sendo erro. A
  tela **diz qual leitura vai valer** antes de enviar (`lerQuando`) e escreve o período por
  extenso — "das 18:00 de 10/09 às 09:00 de 11/09", nunca "10/09 a 11/09, das 18:00 às 09:00",
  que pareceria um erro.
  **Dois degraus, e cada botão tem dono** (pedido do dono, ago/2026): confirmar e recusar são
  das DUAS gestões — a responsável resolve o que está na autonomia dela, e a PROPPEX também
  decide. O que os separa: **encaminhar** é dela PARA a PROPPEX e **não aparece para o gestor
  geral** (encaminhar para si mesmo não é passo nenhum), e o pedido **já encaminhado sai da mão
  dela** — senão ela confirmaria o que acabou de escalar, e a escalada, que existe para o caso
  que foge da autonomia dela, não valeria nada. As duas regras são do SERVIDOR (a guarda antiga
  do `encaminhar` só pegava o gestor que NÃO gerisse o módulo, e como gestor geral recebe todos
  os módulos em `modulosDe`, ela nunca chegava a valer). A tela espelha: no encaminhado, a
  responsável lê "aguardando a decisão dela" no lugar dos botões. E **quem decide o primeiro
  degrau precisa estar designado**: sem ninguém coordenando o módulo `espacos`, TODO pedido cai
  na PROPPEX e a recepção não confirma nada — por isso o painel avisa o gestor geral disso, com
  o caminho (`/usuarios/`, ação "coordenar"), e diz quem é a responsável quando há uma.
  **Fluxo** (como o dono o descreveu): solicitação → cai na caixa da **responsável pela
  reserva** (`ESPACOS_NOTIFY_EMAIL`, padrão `raiane.naves@uniego.edu.br`, com cópia a
  `eventos@uniego.edu.br`), que **confirma** o que está pré-autorizada a decidir ou
  **encaminha à PROPPEX** (`ESPACOS_PROPPEX_EMAIL`); recusa exige motivo, e quem pediu é
  avisado a cada passo. A responsável é a **coordenação do módulo `espacos`**; a PROPPEX é o
  gestor geral. Protocolo `RES-AAAA-NNN` emitido pelo SERVIDOR, na ordem dos pedidos.
  **Quem pede**: qualquer conta aprovada — professor, coordenação, setor, acadêmico; a
  comunidade externa entra pelo pedido que alguém da casa registra em nome dela
  (`INTERESSADOS`). O **órgão é lista suspensa** (`gruposDeOrgao`: os 12 cursos com o
  prefixo `curso-`, mais `ORGAOS_INSTITUCIONAIS` e "Outro" com texto livre) — órgão escrito
  à mão não agrupa, e "Enfermagem", "Enf." e "Curso de Enfermagem" virariam três linhas do
  mesmo curso na ocupação; o que já estava gravado como texto livre continua legível
  (`rotuloOrgao`). **Instituições de fora que usam os espaços com regularidade têm código
  próprio** (`PARCEIROS_EXTERNOS`, num grupo "Instituições parceiras" no seletor; o primeiro
  é o **Colégio Couto**, pedido do dono ago/2026): a linha genérica "Instituição ou empresa
  externa" resolve o pedido e apaga quem pediu — e a ocupação por órgão, que é o número
  levado ao conselho, não conseguia dizer quanto do auditório foi de uma escola parceira e
  quanto foi de um evento avulso. Elas **continuam externas** (entram em `ORGAOS_EXTERNOS`,
  ofício obrigatório): parceria não dispensa o documento. **Ofício** anexável em qualquer
  pedido e **obrigatório quando vem de fora** (`exigeOficio`: interessado `comunidade` ou
  órgão de `ORGAOS_EXTERNOS`, lista que a tela recebe do servidor em `orgaosExternos` — uma
  cópia no cliente envelheceria calada a cada parceira nova) — reserva
  para quem não é da instituição é ato que a gestão precisa poder justificar depois, e a
  palavra de quem digitou o formulário não é documento. Sobe por `POST /api/espacos/oficio`
  (PDF, Word ou imagem, até 10 MB) ANTES de a reserva existir, como o portfólio da
  Extensão, e o link acompanha os e-mails da responsável e da PROPPEX. **Bloqueios** (reforma, recesso) são da gestão, valem o DIA inteiro e
  travam como reserva confirmada. **A agenda é de todos**: `GET /api/espacos/agenda` (exige
  login) devolve `reservaPublica` — onde, quando, para quê e de que órgão, **nunca** o
  telefone, o e-mail ou a justificativa de ninguém. A agenda vive **dentro do módulo**
  (decisão do dono, ago/2026: a página inicial do portal é dos setores, e um calendário ali
  competia com os cartões).
  Pedidos aguardando entram no **sino** da gestão. `GET /api/espacos/ocupacao` conta horas
  por espaço (só confirmadas) — o número que se leva ao conselho.
  Ao mexer no catálogo, **preserve os `id`**: são a chave do que já está reservado.
  **A agenda é MENSAL, com filtro de mês e etiqueta de cor por espaço** (pedido do dono,
  ago/2026): com o registro do auditório migrado há ocupação em todos os meses do semestre, e
  a janela corrida de quatro semanas escondia o resto. O seletor traz os meses que TÊM
  reserva (`mesesComReserva`) mais os doze à frente; cada espaço tem uma `cor` no catálogo, a
  legenda também FILTRA (clicar na cor mostra só aquele espaço) e a mesma cor aparece na
  legenda também FILTRA (clicar na cor mostra só aquele espaço). A guia **Agendamentos**
  (só gestão) é a outra pergunta: a agenda diz se o dia 20 está livre, e ela diz o que já foi
  agendado, por quem e em que situação — lista com filtro de espaço, situação e período
  (de hoje em diante · já realizados · todo o histórico), busca por atividade, órgão,
  protocolo ou solicitante, e as mesmas etiquetas de cor do calendário.
  **Reservas migradas da planilha** (`subirReservasMigradas` + `dados/esp-auditorio-2026.json`,
  marca `sys-esp-lote-auditorio-2026`): as 75 linhas que a recepção anotava à mão no registro
  do auditório de 2026 entraram como **confirmadas do DIA INTEIRO** — a planilha não tinha
  horário, e o que se sabe é que o auditório estava tomado naquele dia, que é justamente o
  que precisa travar o pedido novo (a tela escreve "dia todo", nunca "00:00"). Dias
  consecutivos com a mesma atividade viraram uma reserva só (o CONINT, 19 a 30/10). A
  migração **não passa pela trava de conflito**, de propósito: há dias com duas atividades em
  turnos diferentes (Jornada Odontológica de manhã, de Psicologia à noite) e recusar a
  segunda apagaria um registro que existiu — elas convivem, e a trava segue valendo para todo
  pedido novo. Quatro datas vieram com ano 2025 na fonte e foram corrigidas para 2026
  (`corrigido` no lote); o órgão foi inferido da atividade, e o que não deu ficou em
  "Não informado na planilha".

- **ARCHÉ MO — Monitoria Acadêmica** (`lib/monitoria.js` + `public/monitoria/` + rotas
  `/api/monitoria/*`, ago/2026): **a reitoria trouxe o programa para a PROPPEX**. Até 2025 ele
  era da **Diretoria Acadêmica (DIAC)**, quando a instituição ainda era a FACEG — os Editais
  01/2025 e 02/2025 trazem esse órgão e esse nome, e ficam no arquivo **como foram publicados**
  (mesma regra das atas: documento não se reescreve). O **arquivo histórico** vai de 2020 a
  2026 (`EDITAIS_MONITORIA`, PDFs em `public/ic/docs/edital-monitoria-*.pdf`): 002/2020 pela
  **Coordenação de Ensino Aprendizagem**, 002/2021 e 003/2021 pela **Diretoria Geral**,
  001/2022, os dois de 2025 pela DIAC e o **01/2026 da Reitoria com a PROAC** — cada um com o
  órgão e o nome da instituição da época. É por eles que se lê a história do programa: 2020/2
  correu **integralmente remoto** e 2021 em **ensino híbrido**, e o edital dizia isso na
  primeira página. A numeração é a da sequência GERAL da instituição, não uma série própria da
  monitoria (daí 002/2020, 001/2022, 01/2026) — por isso a vitrine ordena por **ciclo**, não
  por número: ordenar pelo número jogaria o 01/2026 para o fim do arquivo. O 01/2026 da
  monitoria **não é** o 01/2026 da IC; a observação do catálogo diz isso, porque os dois
  aparecem no mesmo quadro de 2026. A série da PROPPEX é **03/AAAA**, para
  conviver com o 01/AAAA (IC) e o 02/AAAA (ICEM) no quadro por ano da vitrine `/ic/`; a
  monitoria é semestral, e um segundo edital no mesmo ano toma o número seguinte livre.
  O **Edital 03/2026 é gerado pelo próprio ARCHÉ** (`TEXTO_EDITAL` + `gerarEditalMonitoriaPdf`,
  público em `/api/publico/monitoria/edital.pdf`): é o 02/2025 atualizado — os objetivos, os
  requisitos do candidato e a certificação não mudaram; mudou o órgão e o fato de o processo
  inteiro correr no portal. **Quem CONCEBE e EXPEDE é a PROAC** (as diretrizes pedagógicas são
  dela); **a PROPPEX OPERA** o processo. Por isso o edital sai com o timbre da PROAC
  (`TIMBRE_PROAC` em lib/pdf.js) e três assinaturas — pró-reitora acadêmica, pró-reitor e
  reitor —, enquanto os anexos do processo seguem no timbre da PROPPEX.
  **O fluxo é o da IC, e cada passo é rota com dono definido**: o professor submete o projeto
  da SUA disciplina e **indica o monitor por nome, e-mail e CPF** — informado o CPF, `GET /api/monitoria/pessoa`
   diz se ele já tem conta, e `casarMonitoresPorCpf` faz o convite ir para ELA, descartando o
   endereço digitado: a conta existente manda, senão o mesmo aluno viraria dois cadastros → o indicado recebe o convite e
  preenche a **própria ficha de inscrição** (Anexo II: matrícula, CPF, telefone, curso,
  período, declaração de disponibilidade firmada no sistema e o **histórico escolar** anexado
  — um documento só, decisão do dono: o histórico já comprova a matrícula e ainda mostra o
  aproveitamento na disciplina) → completa a ficha de
  todos os indicados, o projeto **vai sozinho** à fila da PROPPEX → aprovado, entra em
  execução → o monitor entrega o **relatório** → o orientador **avalia a atuação** dele (as 4
  perguntas do Anexo III + parecer) e valida → a PROPPEX **homologa** e os certificados
  existem. Ninguém preenche a ficha pelo aluno (é declaração, e declaração tem dono), a
  avaliação **nunca é da PROPPEX** (quem acompanhou o semestre foi a orientação) e o
  protocolo `MON-AAAA-NNN` é emitido pelo SERVIDOR, na submissão.
  **O relatório do monitor exige 3 fotos** (`MIN_FOTOS_MONITORIA`/`faltaNoRelatorio` em
  lib/monitoria.js): é a mesma razão do mínimo da Extensão — o registro fotográfico é o que
  comprova a atividade —, em escala menor, porque a monitoria é semanal e não um evento. A
  régua TRAVA o envio, como na Extensão.
  **O certificado de monitoria sai no timbre da PROAC** (pedido do dono, ago/2026): o timbre é
  o do órgão que CONCEBE o programa — a monitoria é ação de ENSINO, e o edital dela é expedido
  pela Pró-Reitoria Acadêmica; a PROPPEX opera o processo, e operar não põe ninguém no
  documento. Assinam a **pró-reitora acadêmica e o reitor** (é a dupla que assina os editais
  do programa em todos os ciclos, inclusive nos que correram fora do ARCHÉ). Os da IC seguem
  com o timbre e o pró-reitor da PROPPEX. As TRÊS assinaturas digitalizadas vivem no mesmo
  `sys-assinaturas-v1` e no mesmo card ("Assinaturas do certificado", guia Certificados do
  ARCHÉ IC, só gestor geral): um lugar só para trocar quando a reitoria trocar, e cada linha
  diz em que certificado ela entra. Sem imagem, sai a linha em branco e nada quebra.
  **Certificados** (`certificadosDe` em lib/monitoria.js, mesmo gerador da IC): o monitor só
  certifica com parecer **aprovado** (item 6.2) e leva a **carga horária cumprida**
  (semanas × CH semanal, semana iniciada conta); o docente recebe **um por PROJETO**, não um
  por monitor — o item 6.1 certifica o projeto. Saem sozinhos: não há emissão a pedir.
  **Cobrança do relatório** (`COBRANCA` + `varrerCobrancaMon`, decisão do dono ago/2026):
  começa **30 dias antes do prazo** e repete a cada 7 dias até o envio — o monitor descobre o
  relatório no dia 13 de dezembro, e relatório de véspera não registra nada. A mesma varredura
  cobra a orientação quando o relatório fica esperando validação, e a ficha de inscrição que
  trava o projeto na porta. A gestão tem a chamada manual (`POST /api/monitoria/chamada-relatorio`).
  **Prazos do 03/2026** (definidos pelo dono): submissão 04/09, cadastro do monitor 08/09,
  análise 09/09, resultado 10/09, vigência 14/09 a 12/12, relatório **14/12**, validação
  18/12, homologação 22/12. Trocar de edital é mexer em `CRONOGRAMA`/`PRAZOS`/`VIGENCIA`.
  Os três anexos saem **preenchidos** em PDF timbrado (projeto, ficha e relatório) — o
  processo corre no ARCHÉ e o PDF é o que se arquiva e se assina.
  **O monitor entra com conta PENDENTE** (exceção na guarda e em `sessaoMon`, como na IC): o
  convite é nominal, e sem isso ele bateria numa parede vinda do próprio e-mail. Ele vê o
  projeto e o **próprio** cadastro — nunca o CPF, o telefone ou o relatório do colega —, e
  **não lê a avaliação que levou** (nem na tela, nem no PDF do seu relatório).
- **O ARQUIVO da monitoria — os semestres que correram FORA do ARCHÉ**
  (`lib/monitoriaHistorico.js` + `dados/mon-historico-*.json`, pedido do dono ago/2026): o
  módulo começou em 2026/2, e dos ciclos anteriores o que existe é a planilha que a
  coordenação do curso guardou — monitor, disciplina, orientação e horas, **sem CPF e sem
  e-mail**. É pouco para abrir projeto no módulo (projeto tem prazo, relatório e cobrança,
  que não existem para semestre encerrado — e apareceria como pendência no painel da
  PROPPEX) e é o bastante para emitir o certificado devido. Por isso o arquivo **não vira
  projeto** e **não entra no estado**: sobe do disco na partida (`subirHistoricoMonitoria`,
  `LOTES_HISTORICO_MON`) e fica em memória — o estado é um arquivo reescrito inteiro a cada
  gravação, e um histórico que nunca muda seria peso morto em todas elas. A **âncora é a
  MATRÍCULA**, com o **nome completo** como segunda chave (nome de uma palavra só não é
  chave), e há uma regra que o nome sozinho não daria: **matrícula que existe dos dois lados
  e não bate DERRUBA o casamento por nome** — é o que separa dois homônimos. O id sai do
  CONTEÚDO (lote + matrícula + disciplina + orientação), para reordenar a planilha não trocar
  o endereço de um certificado já baixado; a orientação recebe **um por projeto** (a dupla
  orientação + disciplina, item 6.1) com os monitores nomeados. Os certificados aparecem em
  `/certificados/` e na guia Certificados do módulo, pelo mesmo gerador e no mesmo desenho —
  o que muda é a rota (`GET /api/meus-certificados/monitoria-historico.pdf?id=`, só login,
  porque quem foi monitor em 2026/1 não tem projeto no ARCHÉ e a sessão do setor exigiria
  um). **O id sozinho não abre nada**: a lista se recalcula contra quem pede. A vigência do
  lote sai do CRONOGRAMA do próprio edital (no 01/2026: resultado em 18/03, relatório final
  em 12/06) — é ela que escolhe o timbre da época. Os lotes chegam CURSO A CURSO, como as coordenações os encontram: **Enfermagem 2026/1** (31 certificados) e **Odontologia de 2023/2 a 2026/1** — seis semestres, 207 registros. Três cuidados na transcrição dessas planilhas, porque o nome sai IMPRESSO no certificado e o id do projeto é o par disciplina + orientação: a mesma disciplina escrita de dois jeitos partiria em dois um projeto que é um só (tabela explícita de grafias); a orientação abreviada em 2025/1 ("Professor Luciano Barbosa") é expandida pelo nome completo que as outras planilhas do MESMO curso e da MESMA disciplina trazem, senão o certificado da orientação não casaria com o perfil dela; e a mesma pessoa escrita de dois jeitos se unifica pela MATRÍCULA — mas **só quando os nomes são variantes um do outro** (acento, abreviação, um caractere de diferença). Matrícula repetida com nomes que não têm nada a ver vira ALERTA, não unificação: em 2023/2 a G2110030 aparece como "Bruno Alves Peixoto" e nos demais como "Lucas Peixoto de Oliveira", e a regra ingênua de "fica o mais completo" imprimiria no certificado de um o nome do outro. A **vigência** sai do cronograma do edital quando ele existe no catálogo; em 2024/1 e 2024/2, anteriores ao que o ARCHÉ conhece, é a do semestre letivo — o certificado escreve o período em mês/ano, e o timbre segue a data de ENCERRAMENTO (2025/2 encerra depois de 05/09/2025 e sai UNIEGO, embora o edital 02/2025 tenha sido publicado como FACEG). O arquivo tem **guia própria no ARCHÉ MO** ("Arquivo", achado do dono ago/2026: "os projetos antigos de monitoria sumiram do sistema"). Eles nunca sumiram — estavam num bloco no PÉ da guia Certificados, embaixo de uma lista pessoal vazia, e quem procurava em **Projetos** não achava nada, porque o arquivo não vira projeto de propósito. Duzentos registros atrás de uma lista vazia é o mesmo que não existir. A guia abre com o total (ciclos, certificados, acadêmicos e quantos ainda NÃO foram casados com conta — é essa a pergunta que a gestão faz) e a lista embaixo é **de PESSOA, não de lote**: a mesma acadêmica aparece em cinco semestres, e em sete cards separados ela vira sete linhas soltas. Filtros de **curso, ciclo, conta no portal e busca por nome ou matrícula**; com o recorte ligado, a contagem é a DAQUELE recorte (somar o total da pessoa faria "2023/2" exibir os certificados dos outros semestres dela). Matrícula que carrega nomes incompatíveis aparece marcada na própria linha — é onde a coordenação vê o que precisa decidir e vale também para a **coordenação de curso**, que tinha a rota e nunca via o bloco. E os certificados do arquivo aparecem também na **guia Certificados** (`GET /api/monitoria/historico/certificados` + `/certificado.pdf?id=`, pedido do dono ago/2026): a guia Arquivo responde quem ainda não foi encontrado no portal; a Certificados responde a pergunta de quem CERTIFICOU o semestre — *como ficou o documento?* Quem homologou a planilha precisa poder ABRIR o PDF antes de avisar o aluno de que ele existe, ainda mais enquanto as incoerências das planilhas estão em conferência. A lista é a MESMA do titular (o mesmo montador: uma segunda régua emitiria documento que o dono não encontra), recortada pelo alcance — a PROPPEX vê tudo, a coordenação de curso vê o do curso dela —, e o **id sozinho não abre nada**: ele se confere contra essa lista, recalculada a cada pedido. São ~320 linhas, então o bloco nasce com filtro de ciclo, tipo de documento e busca, mostrando 60 por vez. A gestão vê ali não quem TEM certificado, mas **quem ainda não foi encontrado no portal**: sem matrícula no perfil o
  documento existe e o aluno não sabe — e ninguém sabe que ele não sabe.
  **E o arquivo ENTRA no Relatório Semestral** (`projetosDoArquivo` + `arquivo` em
  `panoramaMonitoria`, pedido do dono ago/2026): era essa a razão de migrar o histórico —
  certificado é o que a pessoa leva, o RELATÓRIO é o que a instituição apresenta, e um
  semestre inteiro de monitoria que não aparece nele some da prestação de contas ao MEC. As
  duas origens contam JUNTAS (projeto, monitor e hora são o mesmo fato), com três cuidados:
  a hora do arquivo é a **declarada na planilha** (é o que a coordenação certificou), não
  recalculada de uma CH semanal que ninguém registrou; **"Relatórios homologados" conta só o
  que correu aqui**, porque o arquivo não tem relatório nem homologação no sistema; e cada
  linha dele sai com **"arquivo" no lugar do protocolo**, mais uma NOTA no alto do documento
  dizendo de onde vieram — número que ninguém sabe explicar é pior que número menor.
- **ARCHÉ AP — Aulas Práticas** (`lib/praticas.js` + `public/praticas/` + rotas
  `/api/praticas/*`, pedido de coordenadores de curso ago/2026): o professor dá a aula prática e,
  depois dela, registra o que aconteceu — **disciplina, objetivo, local, data, atividades e as
  fotos** (mínimo de **3**, `MIN_FOTOS`: é o registro fotográfico que comprova a aula, a mesma razão
  do mínimo da Extensão, em escala menor). A coordenação valida, e **o fluxo ENCERRA NELA**: a
  PROPPEX é suporte, com alcance total para destravar, mas não é um degrau do processo. Em todos os
  outros setores a pró-reitoria homologa; aqui não, e é de propósito — o módulo é da **PROAC**, e
  quem acompanha a aula prática é a coordenação do curso.
  **A coordenação se cadastra na guia Coordenação**, no mesmo molde da de professores: uma LINHA
  por pessoa, com **nome, e-mail e papel** (`PAPEIS_COORDENACAO`: coordenador do curso ou
  coordenador pedagógico), incluir e apagar. Caixa de texto com e-mails soltos não é cadastro — não
  guarda o NOME, que é o que sai impresso no documento, e transforma "tirar uma pessoa" em edição
  de texto (achado do dono, ago/2026). A forma antiga (lista de strings) continua sendo lida.
  Os 11 cursos vieram da planilha do dono e sobem no arranque (`subirEquipeAP`,
  `dados/ap-coordenadores.json`, marca `sys-ap-equipe-lote-v1`): **as DUAS pessoas de cada curso
  validam** — foi assim que o fluxo foi descrito ("coordenador do curso e/ou pedagógico") —, e por
  isso a lista `pedagogico` institucional nasce VAZIA: aqui o pedagógico é por curso. A marca faz a
  semeadura acontecer uma vez só; sem ela, todo deploy desfaria o que a gestão mudasse na tela.
  **As listas de professores chegam AOS POUCOS** (`subirProfessoresAP`, `dados/ap-professores.json`):
  a marca é **por CURSO** (`sys-ap-prof-<semestre>-<curso>`), não por lote — acrescentar um curso ao
  arquivo o semeia no próximo deploy sem tocar nos que já entraram, que é como as coordenações
  mandam. A semeadura **nunca sobrescreve** o que a coordenação já cadastrou pela tela: o arquivo é
  o ponto de partida, e quem manda depois é a guia. **Titulação, telefone e matrícula vão ao
  PERFIL** de quem ainda não tem — a planilha os traz, e sem eles a pessoa bate na etapa de
  completar cadastro justamente no dia da primeira aula; o **CPF não vem na planilha** e segue
  sendo pedido a cada um (é único por conta, e ninguém o informa por outro). **O que faltar é
  cobrado no PRÓXIMO ACESSO** (decisão do dono, ago/2026), pela etapa que já existe
  (`faltaNoPerfil` + `?completar=1&next=`): o professor é levado ao perfil, vê o que falta apontado
  nos próprios campos e volta ao setor de onde veio. E a etapa passa a dizer **de onde vieram** os
  dados já preenchidos ("a coordenação do seu curso os enviou") quando o registro é `preCadastro`:
  sem isso a pessoa acha que o portal os inventou — ou não confere o que está errado. Disciplina que
  dois professores lecionam conta **uma vez** no painel, com os dois nomes: é uma disciplina, não duas.
  **A coordenação é POR CURSO, e isso não existia no ARCHÉ**: `modulosDe` dá coordenação por
  MÓDULO, e o coordenador de Enfermagem não pode ver as aulas de Direito. Por isso são DUAS
  figuras e dois registros: coordenar o módulo `praticas` (em `/usuarios/`) é ser a **coordenação
  pedagógica**, que vê todos os cursos; o **coordenador de curso** vive no cadastro do próprio
  módulo (`ap-equipe-v1`), designado na guia Coordenação. `papelNoRelatorio` testa **professor
  ANTES de gestão**, e é só isso que impede alguém de validar o próprio relatório — nem o gestor
  geral valida o que é dele.
  **Professores e disciplinas mudam a cada semestre; a coordenação, não.** O cadastro
  (`ap-cadastro-v1`) é **por semestre**, refeito à mão pela coordenação, com **"copiar do semestre
  anterior"** (sem sobrescrever quem já foi incluído); quem coordena é o quadro de AGORA
  (`ap-equipe-v1`), senão o coordenador recém-empossado não validaria o relatório atrasado do
  semestre passado. O cadastro **não é burocracia: é o DENOMINADOR** — sem a lista, "disciplina sem
  relatório" não existe e "12 relatórios" não diz se são muitos ou poucos.
  **O semestre sai da DATA DA AULA**, não do dia em que se registra: quem lança em 02/07 a aula de
  28/06 está relatando o semestre que acabou, e é nele que ela conta. O ciclo vira sozinho
  (`semestreCorrente` de lib/datas.js) — e por isso, em 01/01 e 01/07, o cadastro do semestre novo
  nasce vazio: o **alerta no sino** e o botão de copiar são o que impede o módulo de parar na virada.
  **A cobrança é de SEGUNDA-FEIRA** (`varrerCobrancaAP` + `ap-lembrete-semanal`): a varredura é
  horária como as outras, mas o lembrete só sai na segunda e uma vez por pessoa. O sistema **não
  conhece o horário das aulas** — conhece as disciplinas de cada um —, então o e-mail não afirma que
  houve aula: pergunta pelos relatórios da semana e diz quantos vieram. Cobra quem não enviou nada
  da semana **ou deixou rascunho aberto**, que é o esquecimento mais comum.
  **Dois documentos, no timbre da PROAC**: o relatório de UMA aula (com as fotos ao final, depois
  das assinaturas — o corpo é o que se assina, a foto é o anexo que comprova), assinado pelo
  **professor** e pelo **coordenador que validou** (a assinatura dele só entra se ele VALIDOU:
  assinar o que não se validou seria o documento afirmar um ato que não houve); e o **relatório
  semestral** do curso — números, quem não registrou, que disciplina ficou sem registro e a relação
  nominal —, assinado por **coordenador + pró-reitora acadêmica + reitor**. O setor entra no
  **ARCHÉ RE** (`panoramaPraticas`) pela mesma razão da monitoria: aula prática é ensino, e um
  semestre inteiro delas fora do documento some da prestação de contas ao MEC.
  O **curso do relatório não se muda pelo formulário** (é ele que decide a qual coordenação o
  relatório vai; trocá-lo seria mudar de fila), e o **coordenador de curso não tem módulo em
  `modulosDe`** — por isso a saída rápida do `/api/alertas` consulta também o cadastro do AP, senão
  ele ficaria sem sino.
- **A coordenação de curso alcança a MONITORIA do curso dela** (`coordenaOCurso` em
  lib/monitoria.js + `quemMonAsync` no server, decisão do dono ago/2026): coordenador de curso é a
  mesma pessoa nos dois módulos, e por isso a lista vem do MESMO cadastro do ARCHÉ AP
  (`ap-equipe-v1`) — duas listas fariam uma delas envelhecer. Dentro do curso dela o alcance é o da
  **gestão** (vê, analisa, decide e **homologa**); fora, ela não é nada ali — `papelNoProjeto`
  devolve `null`, e o projeto de outro curso responde 404. Os atos INSTITUCIONAIS continuam sendo
  da PROPPEX: publicar o resultado do ciclo e a prévia dele olham `gestaoPlena`, não `gestao` —
  mostrar botão que a rota recusaria é porta que não abre. O arquivo histórico e a chamada de
  relatório abrem para ela, **recortados ao curso**. **Divergência a registrar**: o Edital 03/2026
  atribui a homologação à PROPPEX, e aqui a coordenação de curso também homologa — foi decisão do
  dono, e o texto do edital é gerado pelo próprio ARCHÉ (`TEXTO_EDITAL`), então pode acompanhar
  quando ele quiser. **Curso vazio não casa com curso vazio**: seria dar alcance sobre o que não se
  sabe de quem é.
- **Assinatura digitalizada VINCULADA AO USUÁRIO** (`sys-assinaturas-usuario-v1` +
  `/api/perfil/assinatura`, pedido do dono ago/2026): havia assinatura em dois lugares e nenhum
  deles era da PESSOA — as três institucionais (`sys-assinaturas-v1`, só o gestor geral troca) e a
  de cada evento. A mesma pessoa reenviava o mesmo PNG a cada evento novo. Agora envia-se **uma
  vez** (no `/perfil/` ou na guia Relatórios do AP) e ela serve onde a pessoa assinar: no relatório
  de aula prática, no semestral e nos certificados dos eventos, pelo botão **"✍ Usar a minha"**
  (`POST /api/extensao/:id/assinatura/minha`). **Ninguém envia nem apaga a de outro** — nem o
  gestor geral: assinatura que um terceiro troca não vale como assinatura. A redução no navegador é
  em **PNG sem fundo** (a das fotos pinta branco e sai em JPEG, o que destruiria a transparência —
  e é ela que faz a assinatura ficar bem sobre a linha).
- **Resultado do ciclo de monitoria** (`gerarResultadoMonitoriaPdf` + `mon-resultado-publicado-v1`
  + `POST /api/monitoria/resultado/publicar`, pedido do dono ago/2026): o certificado é o que a
  PESSOA leva; o resultado é o que a INSTITUIÇÃO publica. Sem ele, um semestre inteiro de
  monitoria fica provado só nos certificados de quem os baixou, e quem pergunta "quais foram os
  monitores de 2026/1?" — a coordenação, o avaliador do MEC — não tem onde ler. O documento sai
  no **timbre da PROAC**, assinado pela pró-reitora acadêmica e pelo reitor (a mesma dupla do
  edital e do certificado), com um **quadro por curso**: disciplina, monitor, orientação e a CH
  cumprida. **Sem CPF, matrícula ou contato** — é documento público. A fonte são as DUAS
  origens juntas: os projetos concluídos no ARCHÉ e os do ARQUIVO, e o que veio do arquivo sai
  DITO no resumo. **Quando é público**: ciclo coberto pelo arquivo é público na hora (é semestre
  encerrado, transcrito do que a coordenação já certificou, e pedir um ato de publicação a cada
  planilha nova só atrasaria fato consumado); ciclo que corre AQUI espera o ato da gestão, como
  na IC — enquanto a homologação não terminou, publicar seria divulgar meio processo. Publicar
  ciclo sem projeto concluído é recusado. Na vitrine `/ic/` e na guia do setor, os editais e os
  resultados aparecem em **um quadro por ANO**, como os da IC: a numeração da monitoria é a da
  sequência geral da instituição e mudou de série (002/2020, 001/2022, 01/2026, 03/2026) —
  ordenar por número jogaria o ciclo mais novo para o fim do arquivo.
- **A barra do EV conta o CICLO do evento** (pedido do dono, ago/2026): **pré-evento**
  (inscrições, página, programação, blocos), **evento** (credenciamento, transmissão) e
  **pós-evento** (exportações, encerrar evento) — o grupo antes se chamava "GERAL", que não era
  uma fase: era o nome do que não coubera nas outras duas. E a **"Ação de extensão" deixou de ser
  guia**: era uma tela inteira para dizer uma frase e oferecer um link, e ficava numa fase do
  evento, quando a ação-mãe não é fase nenhuma — nasce antes da proposta e sobrevive ao
  encerramento. O link continua, porque o encerramento não cobre tudo o que mora lá (PDF do
  projeto e do relatório, Número da Ação, curricularização, cursos corealizadores, portfólio e o
  registro pela PROPPEX), mas agora é o que sempre foi: uma **saída** no pé da barra, separada das
  guias, que some quando não há evento escolhido e abre **a ação DESTE evento** —
  `/extensao/#acao/<id>`, o deep-link que o ARCHÉ EX passou a entender. Antes largava a pessoa na
  lista inteira para procurar a ação de que tinha acabado de sair, e o EV já sabia qual era.
- **A guia do EV se chama pelo ATO que a abre** (decisão do dono, ago/2026): "Certificados"
  virou **"Encerrar evento"** — é ali que o coordenador encerra, e o certificado não sai antes
  disso nem antes de a PROPPEX validar o encerramento; o nome antigo convidava a entrar
  procurando um documento que ainda não existia. A chave da guia (`certificados`) não muda: é
  ela que os atalhos usam. No cartão do evento já encerrado e validado, o botão continua
  "🎓 Certificados" — ali eles existem.
- **A MATRÍCULA é obrigatória para o ESTUDANTE** (`faltaNoPerfil` em lib/auth.js, decisão do
  dono ago/2026): não é burocracia nova — é a única chave que os históricos de monitoria têm,
  e sem ela o certificado do aluno existe e ele não o encontra. Vale para quem tem função
  `aluno`, na mesma régua que barra a entrada nos setores e no `POST /api/perfil`. A exceção
  é o **bolsista do ICEM**: ele é do ensino médio e não tem matrícula no UNIEGO — cobrá-la
  seria exigência impossível de cumprir, como o CPF do gestor geral. Quem decide é
  `faltaNoPerfilDe` no server, e a consulta ao ICEM é **preguiçosa** (só quando a matrícula é
  o que falta): ela lê o estado e a régua roda em toda página de setor.
- **O SEMESTRE VIRA COM O CALENDÁRIO** (`semestreDe`/`semestreCorrente`/`periodoDoSemestre` em
  `lib/datas.js`, decisão do dono ago/2026): em **01/01** o ciclo corrente passa a ser AAAA/1 e
  em **01/07** a AAAA/2, sem ninguém pedir — formulários, pedidos e documentos seguem a virada.
  É o **semestre civil**, porque o calendário letivo muda de curso para curso e o civil não muda.
  A conta é **UMA só**: havia três cópias dela (`semestreDe` nos Relatórios, `janelaDe` nas
  Pautas — que veste o formato `2026-S2` — e NADA na Monitoria), e três contas iguais acabam
  diferentes. Chave no formato `AAAA/N`, que é o que já está gravado no `ciclo` dos projetos.
  **O que o calendário NÃO decide é o EDITAL** (`editalVigente`/`cicloSemEdital` em
  lib/monitoria.js): edital é ato institucional, com número, cronograma e prazos — semestre novo
  não publica edital. Antes, "vigente" era o primeiro edital não encerrado do catálogo, e em
  01/01/2027 todo projeto novo nasceria no ciclo **2026/2**, o semestre passado, sem ninguém
  perceber. Agora: havendo edital do ciclo corrente, é ele; **não havendo**, o módulo segue de pé
  com o último aberto (parar seria pior), a gestão recebe o alerta no sino e a **submissão é
  recusada** dizendo o que falta — não se submete projeto a um edital que não existe, e os
  prazos sairiam do semestre anterior, já vencidos. Rascunho aberto nesse intervalo fica **sem
  número de edital** (carimbar o antigo o faria afirmar um edital que não é o dele) e o recebe na
  submissão.
- **Relatório Semestral de Atividades** (`lib/relatorios.js` + `public/relatorios/` +
  `GET /api/relatorios/semestral.pdf`, ago/2026): a pergunta que o avaliador do MEC faz é
  sempre a mesma — *o que a instituição fez neste semestre, e onde está a prova?* —, e
  respondê-la significava abrir seis telas e montar o documento à mão. Agora é **um relatório
  POR SETOR, por semestre** (decisão do dono: "quero um relatório só das submissões e projetos
  de monitoria de 2026/2", não um que mistura tudo), em três partes que são o argumento na
  ordem: os **números** grandes, os **gráficos** de distribuição (por curso, por situação, por
  órgão) e a **relação nominal** de tudo que foi contado — é ela que transforma o número em
  comprovação, porque cada linha existe no sistema e pode ser conferida.
  O **semestre é civil** (jan–jun, jul–dez): calendário letivo muda por curso e por ano, o
  civil não muda e é o que se explica ao avaliador numa linha. Entra o que **ACONTECEU** no
  período, não o que foi cadastrado nele — a ação que atravessa o semestre conta nos dois,
  porque nos dois ela existiu (`dentroDoSemestre`, por sobreposição). A monitoria é a exceção
  útil: o ciclo do edital tem a mesma forma do semestre ("2026/2") e, quando gravado, é ele
  que manda. Quem emite é quem **gere** o setor (gestor geral, todos; coordenador, o seu), e a
  tela mostra o panorama ANTES de emitir — documento que se assina não pode ser surpresa.
- **"Ver como…" em todos os setores** (`public/assets/arche-vercomo.js` + `verComoUsuario` no
  server, ago/2026): o recurso nasceu na IC e passou a valer para Extensão, Eventos, Atas,
  Espaços e Monitoria. A sessão troca o usuário por um **sósia sem gestão** e as MESMAS
  funções de permissão rodam — o recorte é do servidor, e por isso a simulação não mente. É
  **somente leitura** (escrever gravaria em nome da gestão enquanto a tela finge ser outra
  pessoa), e o componente instala o `?como=` dentro do próprio `fetch`: ligar o recurso num
  setor não obriga a revisar as dezenas de chamadas dele, e uma chamada nova não escapa da
  regra sem ninguém notar. Cada setor traz o seu vocabulário e a sua lista de pessoas, tirada
  dos próprios registros. A IC mantém a versão dela, entrelaçada com o META daquele setor.
  **E as CONTAS DO PORTAL entram na lista de todo setor** (`gruposDoPortal`/`pessoasParaVerComo`
  no server, pedido do dono ago/2026): a lista tirada dos próprios registros responde bem a "o
  professor diz que não vê a ação dele", e é curta demais para a pergunta mais comum — *como um
  professor vê este setor?* Quem ainda não submeteu ação, não lavrou ata nem pediu espaço não
  aparecia em lugar nenhum, e é justamente ele que se quer orientar; a visão genérica mostra a
  CARA do acesso, não o que uma pessoa de verdade encontra lá dentro. Vêm agrupadas pela FUNÇÃO
  do perfil (**docentes · estudantes · outras contas**), porque é assim que a pergunta se faz, e
  **só para o gestor geral**: a lista é o catálogo de contas, e a gestão de acessos sempre foi
  exclusiva dele — coordenador de módulo segue com as pessoas do setor dele, e a aba vazia nem
  se desenha. O vocabulário dos três grupos é do COMPONENTE, não de cada tela: um setor novo já
  nasce com eles. O nome que falta no registro do setor (a ata guarda o e-mail de quem lavrou, a
  reserva o de quem pediu) passa a vir do perfil — uma lista de e-mails soltos não se escolhe.
- **Economia de banda sem trocar de arquitetura** (varredura de ago/2026): o Render tem
  franquia e o estado é UM arquivo reescrito inteiro a cada flush, então o gasto tem DOIS
  lados — o que sai para o navegador e o que sai para o Drive. Quatro cortes, nenhum deles
  mudando fluxo ou tela: **compressão HTTP** (`compression`, antes de tudo no server: as
  páginas dos setores saem 3,3× a 3,7× menores e a resposta do `GET /api/extensao` ~11×; o
  filtro padrão pula PDF, xlsx e imagem, que já vêm comprimidos); **presença manual da gestão**
  com `flushJa: false` e a tela atualizando A LINHA pela resposta em vez de recarregar a base
  (é tarefa em série — 300 cliques numa lista de papel); **o poll de 30 s** só nas guias que
  têm algo ao vivo (`GUIAS_AO_VIVO`) e só com a **aba à vista**, voltando a atualizar em
  `visibilitychange` (aba esquecida à noite somava GB para pintar contador que ninguém via);
  e o `GET /api/extensao` lendo o estado **uma vez** por chamada e mandando o inscrito
  **leve** (`inscritoLeve`: respostas dos campos extras, consentimento e comunicações saem —
  nenhuma tela os lê, os exports os leem no servidor; vai `temRespostas` no lugar). Gravar de
  volta não perde nada: `mesclarEventoEInscritos` traz da BASE todo inscrito online.
- **As ARTES saem do arquivo de estado** (`lib/artes.js` + `guardarArte`/`lerArte` e
  `migrarArtesParaODrive` no server, decisão do dono ago/2026): capa, foto de palestrante e
  logotipo de apoiador nasceram como base64 DENTRO do registro da ação. Elas já não viajavam
  nos payloads, mas o estado é UM arquivo reescrito INTEIRO a cada gravação — e a varredura
  mediu que eram **~92% dele** (8,7 MB → 0,7 MB sem elas). Cada presença marcada subia
  megabytes de imagem que não mudaram. Agora a arte é **arquivo no Drive**, como o portfólio,
  e no registro fica só a referência (`{ fileId, tipo, bytes, em }`). O campo mantém o NOME
  (`capa`, `foto`, `logo`): muda o que ele guarda, e **todo leitor aceita as duas formas** —
  migração que não terminou, arte que falhou e registro que ninguém regravou continuam sendo
  servidos (`lerArte`; `temArte` alimenta `temCapa`/`temFoto`/`temLogo`). A subida acontece
  **fora da fila** (é lenta, e dentro dela seguraria inscrição e check-in), e
  `imagemPequena` deixa a referência passar — sem isso a normalização apagaria a arte migrada
  na primeira gravação. A migração de arranque (`sys-ex-artes-drive-v1`) grava a marca mesmo
  com pendências: o que falhar converte quando alguém salvar o evento.
- **A foto do portfólio é reduzida ANTES de subir** (`reduzirFotoPortfolio` nas duas telas,
  decisão do dono ago/2026): ela entra no PDF do relatório, e o PDFKit embute o arquivo COMO
  ELE É — a moldura tem ~8 cm, mas a foto de celular ia inteira, a ~1200 DPI (24 fotos =
  61 MB, medido). O navegador reduz a 1600 px (JPEG 0,85), que é bem mais do que a moldura
  pede; documento não-imagem sobe intacto, e se o navegador não souber ler a imagem o
  ORIGINAL vai do mesmo jeito — perder o anexo seria pior que subi-lo grande. E o PDF do
  relatório **não se arquiva no Drive enquanto é rascunho**: o fluxo prevê conferi-lo antes
  de entregar, e cada conferência arquivava outra versão.
- **Diagnóstico de banda** (`lib/banda.js` + `lib/medidor.js` + `/diagnostico/`, só gestor
  geral, ago/2026): a franquia de 5 GB do Render acabou sem que ninguém soubesse o que a
  consumira. "Banda" é tudo que SAI do servidor — cada página, cada PDF, cada resposta de API
  — e também o que o servidor MANDA para fora, que é a parte invisível: em produção o estado
  vive num arquivo único no Drive e **cada gravação reescreve o arquivo inteiro**
  (`initDriveStore`), então o gasto cresce com o TAMANHO DO ESTADO, não com o da alteração.
  O medidor conta os bytes de cada resposta (embrulhando `res.write`/`res.end`) e os do que
  sai na origem (estado, anexos, e-mails), agrupa por ORIGEM e projeta o mês. Duas regras que
  o tornam confiável: ele **nunca grava no estado** — mora em `data/banda.json`, no disco
  local, porque medir no Drive somaria uma reescrita do arquivo inteiro a cada despejo e o
  diagnóstico passaria a produzir o que mede — e **nunca falha para quem chamou** (contar
  bytes não derruba pedido). O disco do Render é efêmero: a contagem recomeça a cada deploy,
  o que basta para um diagnóstico de dias e é o preço de não poluir a conta. As recomendações
  só aparecem quando o número as justifica, com o quanto cada uma pouparia.
- **Protótipos** (`/prototipos/`, atrás de login): telas navegáveis com dados fictícios, para
  decidir o desenho ANTES de escrever o módulo. Nada ali grava nada, e cada tela termina com
  as perguntas que levanta. O de **Monitoria cumpriu o papel** — o módulo existe desde
  ago/2026 e é ele que vale; a tela fica como registro do desenho. Segue aberto o de Ligas e
  Grupos de Pesquisa (LG). O protótipo do
  LG carrega a resposta a "como isso não vira um cadastro morto": **o registro agrega em vez
  de perguntar** (a atividade da liga chega da reserva de espaço, da ação de extensão e do
  evento; os projetos do grupo já estão na IC), **a presença por QR vira horas e as horas
  viram certificado** de atividade complementar (é o que traz o aluno toda semana), **o
  registro destrava direitos** e a vitrine pública dá público — e, nos grupos, o relatório
  anual é GERADO da planilha de produção do edital de IC e do Lattes que a Avaliação já lê.

- **TODA LISTA NOVA NASCE PAGINADA, com 20 por página** (decisão do dono, ago/2026: "acho que
  uma lista padrão inicial de 20 fica bom; se eu quiser expandir escolho outras opções.
  Implemente esse padrão para próximas alterações e criações"). É regra do portal, não escolha de
  cada tela: ao criar ou mexer numa lista de REGISTROS (não de opções de `<select>`), use
  `ArchePag.recorte(chave, lista, redesenhar)` e `ArchePag.zerar(chave)` nos filtros. O número 20
  mora em UM lugar (`PADRAO` no componente) — não se redefine tela a tela, senão o portal volta a
  ter uma régua por página. **Nunca resolva lista longa com corte mudo** (`slice(0, N)`,
  "mostrando os primeiros N"): esconder registros sem dar como chegar até eles é pior que a lista
  longa que se queria evitar.
- **Paginação das listas** (`public/assets/arche-paginacao.js`, pedido do dono ago/2026:
  "sempre que aparecem listas estão muito longas; gostaria daqueles filtros de mostrar 10, 20, 50,
  100"): uma barra só, compartilhada — **Mostrando 1–20 de 137 · Mostrar [20] · ‹ 1 2 3 ›** — em
  cima da lista, para quem troca de página cair no começo da nova. É UM componente de propósito: o
  `/usuarios/` já tinha DUAS cópias quase iguais da mesma regra dentro do mesmo arquivo, e duas
  cópias acabam diferentes (uma lembrava o tamanho escolhido, a outra não). Três decisões que ele
  carrega para as telas não repetirem: o tamanho **fica na conta de quem olha** (localStorage por
  chave — quem gosta de ver 100 não reescolhe a cada visita); a barra **não se desenha** quando a
  lista cabe na menor opção (paginação sobre sete linhas é ruído); e a página **se ajusta sozinha**
  ao tamanho da lista, senão filtrar de 300 para 12 linhas deixaria a pessoa numa página vazia. Cada
  tela chama `ArchePag.zerar(chave)` no filtro: outro recorte é outra lista. **Lista AGRUPADA não
  se pagina por cima** (achado da varredura, ago/2026): o arquivo de atas mostra blocos por curso e
  por órgão, e o cabeçalho de cada um diz quantas atas ele tem — cortar a lista antes de agrupar
  fazia esse número contar só o que caiu na página ("Enfermagem · 3 ata(s)" num curso com trinta).
  Um contador que mente é pior que a lista longa, e ali o agrupamento com blocos recolhidos já é a
  resposta ao tamanho. Onde está: usuários
  (painel e aprovados), ações da Extensão, projetos da IC, inscritos do evento,
  agendamentos de espaços, relatórios de aulas práticas e as duas listas do arquivo da monitoria —
  estas duas substituindo o **corte mudo** dos "60 primeiros", que escondia o resto sem dar como
  chegar até ele. Fica de fora o `/certificados/`, que é o histórico de UMA pessoa (uma dúzia de
  linhas), e as listas de IMPRESSÃO, que existem para sair inteiras no papel.

## Identidade visual

Paleta (mesma do sistema de Avaliação): fundo `#eef1f4`, marca `#1c3742`, hover `#2d535c`,
acento `#40717e`, acento claro `#71c8e2`, wash `#e6f5fa`, texto `#182632`, muted `#657179`,
linhas `#dde4e8`. Fonte: **Figtree** no texto e **Sora** nos títulos. Manter consistência em
qualquer página nova.

**Os valores acima são os que valem, e a varredura de ago/2026 achou seis setores fora deles**
— com `--bg:#ebeef3`, `--line:#e3e7ee`, `--ink:#1c3742` (a cor de MARCA no lugar da de texto) e
`--muted:#7c8794`. O `muted` divergente dava **3,65:1** sobre o branco do card, abaixo do
mínimo AA de 4,5:1, e ele pinta o `label` de TODO campo de formulário, a 11,5 px: o nome do
campo era o que sumia no celular, sob sol. O oficial dá 5,01:1 (medido). Alinhados os seis.
A **tipografia** também estava dividida: `public/assets/arche-ui.css` (página inicial, perfil,
entrar, páginas públicas de evento) carregava Archivo + IBM Plex Sans, e os setores,
Sora + Figtree — a própria barra do topo trocava de fonte ao navegar entre os dois grupos,
porque ela pede Figtree e só os setores a carregavam. Unificado no arquivo compartilhado.
Outros três acertos da mesma varredura: os modais dos setores estavam com `z-index:40` contra
os `9999` da barra institucional (a barra pintava POR CIMA do modal, e no celular o botão de
fechar ficava enterrado); três classes eram usadas sem existir (`.ba-info` na Extensão,
`.bt-err` no EV — o único botão destrutivo do módulo saía no cinza do navegador —, `.rolo` nos
Relatórios); e a barra do topo, com 11 atalhos e `flex-wrap:wrap`, virava ~4 linhas fixas no
celular: passou a rolar na horizontal em UMA linha, com a conta presa à direita (sair não pode
depender de rolar a barra até o fim) e o painel do sino ancorado à altura REAL da barra
(`--nav-alt`), não aos 52 px que estavam cravados.

## Limitações no ambiente cloud

- Sem os segredos locais: chamadas reais ao Google Drive/Gmail não funcionam em testes
  locais na nuvem — validar por leitura de código; o site em produção tem as chaves.
- O servidor pode ser testado com `npm install && node server.js` (modo local: estado em
  `data/estado.json`, uploads em `data/uploads/`), sem tocar em dados de produção.
