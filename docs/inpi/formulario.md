# Formulário do e-INPI — campos redigidos

Texto pronto para os campos do pedido de Registro de Programa de Computador.
Onde há `[…]`, é dado que só o titular preenche.

---

## Identificação do programa

**Título**
> ARCHÉ — Portal de Gestão Acadêmica da Pró-Reitoria

**Outras denominações / sigla**
> ARCHÉ; ARCHÉ EX; ARCHÉ EV; ARCHÉ IC; ARCHÉ AT; ARCHÉ ES

**Data de criação**
> 13 de agosto de 2026

**Data de publicação** *(primeira disponibilização ao público)*
> Agosto de 2026 — em produção em https://arche.app.br

**Grau de sigilo do código-fonte**
> Sigiloso. O pedido informa o resumo digital (hash); o código-fonte não é
> divulgado.

---

## Titularidade e autoria

**Titular**
> [ decidir antes do protocolo — ver `docs/inpi/README.md`, seção 0 ]
> Ex.: Associação Educativa Evangélica / Centro Universitário Evangélico de
> Goianésia (UNIEGO), CNPJ [ … ]

**Autor**
> Jadson Belém de Moura — CPF [ … ] — Pró-Reitor de Pós-Graduação, Pesquisa,
> Extensão e Ação Comunitária (PROPPEX/UNIEGO)

**Vínculo entre autor e titular**
> Servidor/empregado da instituição, nos termos do art. 4º da Lei nº 9.609/98.

---

## Dados técnicos

**Campo de aplicação** *(classificação do INPI)*
> Educação e Ensino · Administração e Gestão

**Tipo de programa**
> Aplicativo web (SaaS institucional), arquitetura cliente-servidor

**Linguagem de programação**
> JavaScript (ECMAScript 2022, módulos ESM), HTML5, CSS3

**Plataforma / ambiente de execução**
> Servidor: Node.js 20 ou superior, com o framework Express
> Cliente: navegador web, sem framework — JavaScript nativo
> Hospedagem: serviço em nuvem (PaaS), com armazenamento em Google Drive API
> Banco de dados: não utiliza SGBD; a persistência é em documento JSON versionado

**Bibliotecas de terceiros** *(dependências declaradas)*
> express (servidor HTTP), multer (upload), pdfkit (geração de PDF),
> docx (geração de .docx), exceljs (planilhas .xlsx), qrcode (códigos QR),
> nanoid (identificadores), dotenv (configuração).
> Cada uma sob a própria licença de código aberto, sem incorporação de código
> de terceiro ao programa registrado.

---

## Descrição funcional resumida

> O ARCHÉ é um sistema web de gestão dos processos acadêmicos de uma
> pró-reitoria de pesquisa, pós-graduação e extensão de instituição de ensino
> superior. Reúne, num portal único com autenticação e controle de acesso por
> papéis, seis conjuntos funcionais:
>
> **Extensão** — submissão de propostas de ação de extensão, tramitação com
> devolução e reenvio, emissão sequencial do número oficial da ação, relatório
> final com portfólio fotográfico obrigatório, registro de participantes,
> exportação para sistema de certificação e apuração da curricularização da
> extensão exigida pela Resolução CNE/CES nº 7/2018.
>
> **Eventos** — páginas públicas de evento com programação por atividades,
> inscrição on-line com consentimento de tratamento de dados (LGPD),
> credenciamento por leitura de código QR com controle de entrada e saída,
> transmissão on-line com apuração de presença por tempo de permanência,
> emissão de credencial digital e integração com carteira digital.
>
> **Iniciação Científica** — ciclo completo de edital: submissão, avaliação por
> pareceristas com sigilo cruzado, classificação por nota de projeto e
> pontuação de produção acadêmica, publicação de resultado em duas fases,
> contestação, concessão de bolsas, indicação de bolsistas, cronograma,
> relatórios parcial e final com avaliações recíprocas, termos de compromisso e
> emissão de certificados.
>
> **Atas e Colegiados** — lavratura de atas de órgãos colegiados com numeração
> automática, verificação de coerência, redação assistida da minuta, arquivo
> por autor, busca no conteúdo do acervo, e um catálogo de conformidade que
> relaciona cada tema debatido aos indicadores dos instrumentos de avaliação
> do INEP, gerando dossiê comprobatório.
>
> **Reserva de Espaços** — agenda dos espaços físicos com detecção de conflito
> de horário no momento da gravação, solicitação com múltiplos espaços e
> período, fluxo de confirmação em dois níveis, bloqueios e relatório de
> ocupação.
>
> **Portal e administração** — autenticação por código de acesso enviado por
> e-mail, por senha e por provedor externo; perfis, papéis e coordenação por
> módulo; fusão de cadastros duplicados; alertas de pendências; e geradores de
> documento oficial timbrado em PDF, .docx e .xlsx.
>
> O programa não emprega sistema gerenciador de banco de dados: o estado é
> mantido em documento estruturado, com fila de escrita serializada que
> garante consistência entre operações concorrentes.

---

## Documentação a anexar

1. Este documento, como descrição técnica.
2. `docs/inpi/resumo-digital.md` — o hash SHA-512 e o inventário dos arquivos.
3. Declaração de veracidade assinada pelo titular.
4. Documento que resolva a titularidade (ata, portaria, termo de cessão ou
   instrumento de cotitularidade), conforme a decisão da seção 0 do README.

---

## Guardar fora do processo

- `docs/inpi/arche-codigo-fonte-<commit>.txt` — o arquivo que originou o hash.
  Sem ele, o hash não prova nada. Guarde em dois lugares, junto do certificado.
- O repositório Git completo, com o histórico de commits datados.
