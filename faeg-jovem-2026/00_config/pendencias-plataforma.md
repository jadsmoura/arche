# Pendências da plataforma — 1ª Ação Social (etapa 77)

Falhas do sistema encontradas na conferência dos 1.899 documentos das 173
equipes. **Nenhuma é falha das equipes**, e por isso nenhuma delas pode virar
"Não" na avaliação: o grupo anexou o documento, e é o servidor que não o
entrega.

## Arquivos que o CDN não entrega (erro 500)

| Equipe | Item | Arquivo |
|---|---|---|
| **FAEG JOVEM GOIÁS** | Lista de presença | `Declaração Faeg Jovem - FRC Goias.pdf` |
| FAEG JOVEM ITAJA | Fotos (1 de várias) | `Fotos (11).jpeg` |
| FAEG JOVEM SANTO ANTONIO GOIAS | Fotos (1 de várias) | `PHOTO-2026-05-27-19-58-33.jpg` |

O endereço responde 500 com o token da sessão e 401 sem ele; os demais 1.896
documentos baixaram normalmente pelo mesmo caminho, então não é problema de
acesso, e sim do objeto armazenado.

**O caso de GOIÁS é o que importa.** É o único documento obrigatório
inteiramente indisponível, e ele é justamente a **declaração** que, pelo item
5.9.8.2 V, substitui a lista de presença nos eventos realizados pelo
Senar/AR-GO. A equipe não pode perder 2 pontos porque o arquivo dela não abre.

Encaminhamento: pedir ao Senar/AR-GO a recuperação do objeto ou o reenvio pela
equipe, e **só então** avaliar o item. Até lá o item fica pendente, não
reprovado.

Nas duas equipes de fotos, a perda é de uma imagem entre várias e não
compromete a conferência do item.

## Duas anotações menores

**Formulário de lista com ID Único de 2025.** Algumas equipes usaram o impresso
do ano anterior (ID `202501-…` no rodapé, enquanto o relatório traz
`202601-3376952`). O conteúdo corresponde ao evento avaliado; é uso de impresso
velho, não documentação de outro evento. Registrado nas observações da equipe,
sem efeito na nota.

**Só 17% das fotos têm data no EXIF e 14% têm GPS.** A esmagadora maioria chega
sem metadado — comportamento normal de imagem que passou por aplicativo de
mensagem. Quase todas, porém, trazem **carimbo visual** de data, hora e
coordenadas aplicado por aplicativo de câmera com geolocalização, que é o que
permite conferir o item 5.9.8.4. É mais uma razão para não decidir esse item
por metadado.
