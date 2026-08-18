# Registro de Programa de Computador — ARCHÉ

Material para o pedido de registro no INPI, nos termos da **Lei nº 9.609/98**
(Lei do Software) e do **Decreto nº 2.556/98**.

> Isto é material de apoio, não parecer jurídico. Antes de protocolar, submeta
> a decisão de titularidade à assessoria jurídica e à reitoria — é a única
> etapa que não se resolve com documento pronto.

---

## 0. Antes de tudo: de quem é o programa

O **art. 4º da Lei nº 9.609/98** determina que, salvo estipulação em
contrário, pertencem ao empregador os direitos sobre programa desenvolvido
durante vínculo cuja natureza corresponda aos encargos do cargo. O ARCHÉ foi
concebido e desenvolvido pelo Pró-Reitor da PROPPEX, gere processos da própria
Pró-Reitoria, roda em domínio institucional e trata dados da UNIEGO.

A leitura provável, portanto, é de **titularidade patrimonial da mantenedora**,
com **autoria** do Prof. Dr. Jadson Belém de Moura — e os direitos morais de
autor são inalienáveis (art. 2º, § 1º).

Três desfechos são legítimos, e um deles precisa ser escolhido **por escrito
antes do protocolo**:

1. **Titularidade da instituição**, com o autor nomeado no pedido;
2. **Cotitularidade** entre a instituição e o autor, com percentuais definidos;
3. **Titularidade do autor**, mediante cessão ou anuência expressa da
   mantenedora.

Como o autor ocupa o cargo que assinaria pela instituição, a decisão deve
subir ao Reitor ou ao conselho — assinar dos dois lados enfraqueceria o
registro justamente no ponto que ele existe para provar.

---

## 1. O que já está pronto neste repositório

| Arquivo | Para que serve no pedido |
|---|---|
| `LICENSE` | Declaração de direitos, componentes de terceiros e reserva de titularidade |
| `AUTHORS` | Declaração de autoria e do uso de ferramenta de apoio |
| `scripts/pacote-inpi.mjs` | Monta o pacote do código-fonte e calcula o hash, de forma reproduzível |
| `docs/inpi/resumo-digital.md` | O **hash SHA-512** que se informa ao INPI, com o inventário dos arquivos |
| `docs/inpi/formulario.md` | Os campos do formulário eletrônico, já redigidos |

Para gerar (ou regerar) o pacote:

```bash
git status --porcelain        # precisa estar limpo, senão o hash não se reproduz
node scripts/pacote-inpi.mjs
```

O script grava `docs/inpi/arche-codigo-fonte-<commit>.txt`. **Esse arquivo é a
prova**: guarde-o junto do certificado, em mais de um lugar. Ele não é
versionado de propósito — pesa alguns megabytes e se reconstrói igual a
qualquer momento a partir do commit.

---

## 2. Passo a passo no e-INPI

1. **Cadastro** no e-INPI (`gru.inpi.gov.br`) do **titular** — se for a
   instituição, o cadastro é o dela, com o CNPJ da mantenedora.
2. **Emitir a GRU** do serviço de *Registro de Programa de Computador*.
   Há retribuição reduzida para pessoa física, ME/EPP, cooperativas e
   **instituições de ensino e pesquisa** — confira a tabela vigente, ela muda.
3. **Pagar a GRU** e aguardar a compensação (costuma ser 1 dia útil).
4. **Preencher o formulário eletrônico** com os dados de `formulario.md`.
5. **Informar o resumo digital (hash)** de `resumo-digital.md`. O INPI **não
   recebe o código-fonte** — recebe o hash, o que preserva o sigilo do programa.
6. **Anexar a documentação técnica** (o próprio `formulario.md` serve de base)
   e a **declaração de veracidade**, assinada pelo titular.
7. **Protocolar** e guardar o número do pedido.

O exame é formal — o INPI não julga mérito nem originalidade —, e o certificado
costuma sair em poucos meses. A proteção, lembre-se, já existe desde a criação:
o registro documenta, não constitui.

---

## 3. Além do registro do software

- **Marca ARCHÉ** — registro no INPI, classe NCL 42 (desenvolvimento e
  hospedagem de software) e, se a instituição quiser cobrir o uso educacional,
  a classe 41. Aqui **há urgência**: o sistema brasileiro é atributivo, e a
  prioridade é de quem deposita primeiro. Vale 10 anos, renováveis.
- **Segredo de negócio** — o repositório é privado e sem licença aberta.
  Mantenha assim: é o que impede o código de circular.
- **Contratos** — se o sistema for cedido, licenciado ou usado por outra
  instituição, isso se faz por contrato de licença, com escopo, prazo e
  responsabilidade sobre dados pessoais (a instituição é a controladora, nos
  termos da LGPD).

---

## 4. O que **não** é caminho

**Patente não se aplica.** A Lei nº 9.279/96 exclui de invenção o programa de
computador *em si* (art. 10, V) e os métodos comerciais e administrativos
(art. 10, III). O INPI só admite invenção implementada por computador quando
há efeito técnico além do processamento comum — não é o caso de um sistema de
gestão administrativa, por mais elaboradas que sejam as suas regras.

Um pedido de patente aqui custaria caro, demoraria anos e seria indeferido. O
registro de programa de computador é o instrumento correto, e protege
exatamente o que existe: a expressão do código.
