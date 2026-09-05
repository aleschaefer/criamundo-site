# Portfolio Rio2C

Mini-site one-page para apresentar o portfolio criativo de Alexandre Schaefer.

## Arquitetura atual

- O site publico passa a ler o conteudo principal em XML UTF-8.
- A persistencia principal deve ficar no Cloudflare D1, acessada por um Worker com assets estaticos.
- O `admin.html` publica esse XML pelo backend e o backend cria um backup automatico em tabela de historico antes de sobrescrever o conteudo principal.
- O navegador continua mantendo rascunho e backups locais apenas como camada extra de seguranca.

## Arquivos principais

- `index.html`: site publico
- `styles.css`: visual do site publico
- `script.js`: renderizacao do site publico
- `admin.html`: painel de manutencao
- `admin.css`: visual do painel
- `admin.js`: logica do painel
- `data-manager.js`: utilitarios compartilhados de XML, API e backups locais
- `content.js`: fallback legado usado apenas se nenhum XML publicado estiver disponivel
- `worker.js`: rotas da API e entrega dos assets estaticos
- `wrangler.jsonc`: configuracao do Worker e dos assets
- `.assetsignore`: arquivos que nao devem ser publicados como assets
- `schema.sql`: schema inicial do banco D1

## Fluxo de conteudo

1. Abra `admin.html`
2. Digite a senha do painel
3. Edite contatos, destaque, categorias e projetos
4. Clique em `Salvar alteracoes`
5. O painel envia o XML para o backend da Cloudflare
6. O backend cria backup do XML atual no D1 e grava a nova versao publicada

## Fluxo de seguranca extra

- `Salvar alteracoes`: publica no backend e tambem salva backup local no navegador
- `Exportar XML`: baixa uma copia manual do XML atual
- `Exportar JSON`: baixa um snapshot em JSON
- `Importar JSON`: restaura dados a partir de um arquivo JSON
- `Restaurar backup`: recupera o backup local mais recente do navegador

## Cloudflare Workers

Voce precisa configurar estes itens no projeto `criamundo-site` no Cloudflare Workers:

### 1. D1 Database

Crie um banco D1, por exemplo:

- `criamundo-content`

Depois execute o schema deste repositorio:

- arquivo: `schema.sql`

### 2. Binding no Pages

No projeto Worker, adicione um binding D1:

- Binding name: `CONTENT_DB`
- Database: o banco criado acima

### 3. Variavel de ambiente

Adicione uma variavel de ambiente no Worker:

- `ADMIN_PASSWORD`

Ela deve ser a senha em texto puro usada para publicar pelo `admin.html`.

## Endpoints

- `GET /api/content`: retorna o XML publicado
- `POST /api/admin/content`: valida senha, cria backup e publica novo XML

## XML

O XML publicado usa UTF-8:

```xml
<?xml version="1.0" encoding="UTF-8"?>
```

Isso garante compatibilidade com acentuacao em portugues BR.

## Observacoes

- Se o Worker/D1 ainda nao estiver configurado, o site pode cair no fallback legado de `content.js`.
- O `localStorage` nao e mais a fonte principal de publicacao.
- O modo `?preview=local` continua servindo para revisar rascunhos locais no mesmo navegador.

## Finanças no admin

Acesse **Finanças** para incluir ativos, registrar transações de compra e consultar
os saldos e o histórico. A transação informa quantidade e valor unitário; o total
é calculado automaticamente no formulário e novamente no servidor, em centavos.
O total é somente leitura e permanece gravado na coluna `value`. Esta mudança não
exige migração do banco. O valor unitário aceita até duas casas decimais, limitado
a R$ 999.999,99; o total continua limitado a R$ 99.999.999,99.
Nesta versão as transações são entradas (compras); vendas não fazem parte deste modelo.

### Modelo relacional

- `finance_assets`: `id`, `name CHAR(30)`, `type SMALLINT`, `subtype SMALLINT`, `quantity INTEGER`,
  `average_price DECIMAL(8,2)`, `value DECIMAL(10,2)`,
  `current_price DECIMAL(8,2)` e `current_income DECIMAL(7,5)`.
  A coluna antiga `current_dy` é preservada apenas como legado, sem uso na aplicação.
- `finance_transactions`: `id`, `asset_id`, `name CHAR(30)`, `type SMALLINT`, `subtype SMALLINT`,
  `quantity INTEGER`, `value DECIMAL(10,2)`, `transaction_date` e `created_at` automático.
- Tipo: **1 = Renda Variável, 2 = Renda Fixa, 3 = Outro**.
- Subtipo: **1 = Ações, 2 = FII, 3 = BDR, 4 = CBD, 5 = LCA, 6 = LCI, 7 = Outro**.
- Renda Variável aceita subtipos 1/2/3; Renda Fixa aceita 4/5/6/7; Outro usa 7.
  A grafia CBD foi mantida conforme solicitada. O subtipo é selecionável no cadastro;
  para tipo Outro o campo fica oculto e seu valor é Outro automaticamente.
- Nome, tipo e subtipo da transação são herdados do ativo. A chave estrangeira
  composta impede associar uma transação a um ativo com classificação diferente.
- SQLite/D1 não aplica a precisão declarada em CHAR/DECIMAL. Por isso o script usa
  CHECKs para comprimento, enum, quantidades inteiras, limites e duas casas decimais.
- Quantidades: 0 a 2.147.483.647 no ativo e 1 a 2.147.483.647 na transação.
  Preço médio: até R$ 999.999,99. Valor: até R$ 99.999.999,99.

O cadastro inicial calcula `value = quantity × average_price`. Em uma compra,
o trigger soma quantidade e valor, e calcula `average_price = round(value / quantity, 2)`.
O valor acumulado mantém todos os centavos; multiplicar a média arredondada pela
quantidade pode diferir ligeiramente desse valor. Não há cotação de mercado.
Uma falha no recálculo reverte também a inclusão da transação. O identificador
mantido no formulário permite repetir um envio sem duplicá-lo. Edições e exclusões
recalculam os saldos por triggers no banco, na mesma operação.

Todas as leituras e escritas em `GET/POST /api/admin/finance` exigem a senha do admin.
Os dados não entram no XML público, nas exportações ou nos backups do portfólio.

### Distribuição e campos de mercado

A visão geral inclui um gráfico de pizza com o montante acumulado por tipo de ativo,
acompanhado de legenda com valores e percentuais para Renda Variável, Renda Fixa e Outro. Usa o custo de aquisição (`value`),
não a cotação atual. O gráfico é atualizado ao salvar ativos e transações, e exibe
uma mensagem quando não há valores positivos. A legenda também oferece os dados em texto.

Tipo é o primeiro campo do formulário, seguido por Subtipo. Ações e FII exibem todos os campos abaixo;
Renda Fixa exibe somente Valor atual, sem rendimento ou DY.

- **Valor atual:** preço por unidade em reais, com duas casas. Se não informado,
  `current_price` é NULL e a API retorna o preço médio usando COALESCE. Assim o padrão
  acompanha eventuais mudanças na média. Um zero explícito é mantido como zero.
- **Rendimento atual (R$):** rendimento por unidade, com até duas casas inteiras e
  cinco decimais (`DECIMAL(7,5)`, intervalo 0 a 99,99999). `DECIMAL(2,5)` foi
  interpretado como duas casas inteiras e cinco decimais, pois precisão total 2
  não comporta escala 5. Em branco, assume zero.
- **DY atual (%):** `rendimento atual / valor atual × 100`.
- **DY médio (%):** `rendimento atual / preço médio × 100`.

Os DY são somente leitura, calculados no formulário e pela API a cada consulta.
Valores de DY enviados pelo cliente não são utilizados. A exibição usa até cinco
casas decimais; não há anualização implícita ou consulta de dividendos. O rendimento
deve corresponder ao período desejado. Preço zero gera `null` na API e “—” na tela.

Rendimento e DY continuam exclusivos para Ação e FII. Valor atual também aparece
para Renda Fixa. Em BDR/Outro todos esses campos ficam ocultos e desabilitados;
a API ignora os valores enviados para campos não aplicáveis. Na tabela, aparecem na
ordem valor atual, rendimento atual, DY atual e DY médio, com travessão para outros tipos.

Para **Renda Fixa**, o rótulo do formulário muda de “Preço médio (R$)” para
**“Valor de Compra (R$)”**, sem alterar a coluna ou as regras de cálculo existentes.
O campo **Valor atual (R$ por unidade)** é opcional e, em branco, acompanha esse
valor de compra. Ao selecionar outro tipo, o rótulo volta a “Preço médio (R$)”.

### Editar e excluir

As listas de Ativos e Histórico de Transações têm botões **Editar** e **Excluir**.
Editar preenche o formulário existente; Cancelar edição volta à visão geral sem salvar.
Excluir pede confirmação. As tabelas, os DY, o total e a pizza são atualizados após salvar.

- Ativos sem transações permitem corrigir quantidade e preço médio diretamente.
- Ativos com transações permitem editar nome, tipo e campos de mercado. Quantidade e
  preço médio ficam somente leitura; suas correções devem ocorrer pelo histórico.
  Alterar nome/tipo/subtipo também atualiza as transações vinculadas.
- Um ativo com transações não pode ser excluído até que elas sejam excluídas. Não há
  exclusão automática do histórico ao clicar em Excluir ativo.
- Editar uma transação remove seu efeito anterior e aplica os novos quantidade/valor.
  Também é possível selecionar outro ativo; ambos os saldos são recalculados.
- Excluir uma transação remove seu efeito e preserva o saldo de abertura do ativo.
- Cada registro tem uma revisão. Se os dados mudaram desde a abertura do formulário,
  a gravação é recusada para evitar sobrescrever alterações; atualize os dados e reabra a edição.
- Transações antigas cujo total não corresponde a um preço unitário com duas casas
  exibem um aviso de arredondamento ao editar. Confira o total antes de salvar.

### Última atualização

Os rodapés dos formulários de ativos e transações exibem **Última atualização**, com
data e hora até os segundos no fuso `America/Sao_Paulo` (horário de Brasília).
Antes da inclusão, aparece “Ainda não salvo”; ao abrir a edição, aparece a data
persistida do registro. Não se utiliza a hora do navegador para gravar esses dados.

- `created_at` guarda a inclusão e não é alterado nas edições.
- `updated_at` guarda a inclusão ou a edição mais recente, gerada em UTC pelo banco.
- Inclusão, edição e exclusão de transações também atualizam a data dos ativos cujo
  saldo foi recalculado. Alterações de nome/tipo/subtipo propagadas atualizam a transação.
- Consultas, gravações rejeitadas e reenvios de criação não mudam essas datas.
- Registros antigos sem data conhecida não recebem uma data fictícia. A migração
  aproveita a inclusão das transações com revisão zero; nas demais situações, a
  última atualização fica indisponível até a próxima alteração.

### Filtro pela legenda

Clique no ícone ou em qualquer parte da legenda de um tipo de ativo para filtrar
simultaneamente as listas de Ativos e Histórico de Transações. Um segundo clique
no mesmo tipo ou o botão **Mostrar todos** remove o filtro. Selecionar outro tipo
troca o filtro; a legenda selecionada fica destacada e os botões funcionam por teclado.

O gráfico e os totais da carteira não mudam com o filtro, somente as duas listas.
O formulário de transações tem um seletor próprio de Tipo, independente do filtro da
legenda: ele oferece somente os ativos cadastrados do tipo escolhido. Trocar o tipo
limpa a seleção anterior de ativo; tipos sem ativos mostram um aviso e impedem salvar. O filtro
permanece ao atualizar/salvar registros durante a sessão e é limpo ao sair do admin.
Esta alteração não exige migração de banco.

### Data da transação

O formulário de transações tem **Data da transação**, obrigatória, com o calendário
nativo do navegador. Ao iniciar uma inclusão, assume a data atual no horário de
Brasília; o usuário pode escolher outra data. Na edição, é carregada a data persistida.

O campo `transaction_date` guarda apenas `AAAA-MM-DD`, separado da data/hora de criação
(`created_at`) e de última atualização (`updated_at`). O histórico exibe `DD/MM/AAAA`,
sem conversão de fuso, e ordena primeiro pela data da transação, da mais recente para a
mais antiga, usando data de cadastro como desempate. Datas passadas e futuras são aceitas.

A API e o banco rejeitam datas inexistentes. Registros anteriores à migração ficam
com data da transação não informada, sem inventar uma data a partir do cadastro. Ao
editar um desses registros, é necessário selecionar sua data antes de salvar.

### Aplicação no site existente

Se já aplicou **0001 a 0007**, aplique **apenas 0008**, uma única vez:

```sh
npx wrangler d1 execute criamundo-content --remote --file=migrations/0008_asset_subtypes.sql
npx wrangler deploy
```

A migração converte as classificações antigas: Ação/FII/BDR viram Renda Variável com
seus respectivos subtipos; Renda Fixa vira Renda Fixa/Outro, pois sua modalidade não
era informada; Outro continua Outro. IDs, saldos, valores de mercado, datas, revisões
e histórico são preservados. As tabelas financeiras são reconstruídas com as novas
validações, incluindo a chave estrangeira composta por ativo, nome, tipo e subtipo.

Se faltam migrações, aplique apenas as pendentes na ordem 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008.
**Não reaplique as migrações antigas após atualizar**, pois elas podem recriar triggers
obsoletos. Para um banco totalmente novo, `schema.sql` já contém o modelo atual completo;
nesse caso não aplique as migrações depois.

Para testar localmente, use `--local` no lugar de `--remote`, configure `ADMIN_PASSWORD`
em `.dev.vars` e execute `npx wrangler dev`. Nunca publique credenciais como assets.

Testes (Node 24+, usando SQLite real em memória): `node --test tests/finance.test.mjs`.

## Cartão de Crédito

A área **Cartão de Crédito** usa a mesma autenticação do admin e mantém os dados no D1,
separados do XML público e das tabelas de investimentos.

- **Incluir grupo:** nome obrigatório de até 30 caracteres. A comparação ignora
  maiúsculas/minúsculas, inclusive em nomes acentuados, para impedir duplicatas.
- **Incluir período:** mês, ano, data inicial e data final. Existe apenas uma fatura por
  mês/ano e períodos não podem se sobrepor. As datas usam calendário e são exibidas em
  DD/MM/AAAA.
- **Incluir transação:** data, nome (até 120 caracteres), valor de cada parcela, grupo e
  pagamento. À vista grava 1/1. À prazo exige parcela atual e quantidade total.
- **Exibir gastos:** seleciona a fatura por mês/ano, apresenta pizza com o total por grupo
  e lista as transações, forma de pagamento e posição da parcela.

O valor de uma compra parcelada é interpretado como **valor de cada parcela**. Uma compra
na parcela atual 5 de 10 cria as parcelas 5, 6, 7, 8, 9 e 10; as cinco posteriores recebem
uma data nos meses seguintes. Para datas no fim do mês, usa-se o último dia válido do mês
seguinte (31/01 → 28/02 ou 29/02). O mesmo envio pode ser repetido sem duplicar parcelas.

O encaixe em fatura compara `transaction_date` com `start_date`/`end_date`, incluindo as
duas extremidades. Se o período ainda não existe, a parcela fica sem fatura; ao criar o
período compatível, ela é associada automaticamente. Períodos não podem se sobrepor para
que cada transação pertença a no máximo uma fatura.

### Banco do Cartão de Crédito

Após aplicar as migrações de Finanças até 0008, execute uma vez:

```sh
npx wrangler d1 execute criamundo-content --remote --file=migrations/0009_credit_card.sql
npx wrangler deploy
```

A migração cria `credit_card_groups`, `credit_card_periods` e
`credit_card_transactions`, com chaves estrangeiras, índices, validações e triggers de
encaixe. Para banco totalmente novo, `schema.sql` já contém tudo e não exige migrações.
