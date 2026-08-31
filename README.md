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

- `finance_assets`: `id`, `name CHAR(30)`, `type SMALLINT`, `quantity INTEGER`,
  `average_price DECIMAL(8,2)`, `value DECIMAL(10,2)`,
  `current_price DECIMAL(8,2)` e `current_income DECIMAL(7,5)`.
  A coluna antiga `current_dy` é preservada apenas como legado, sem uso na aplicação.
- `finance_transactions`: `id`, `asset_id`, `name CHAR(30)`, `type SMALLINT`,
  `quantity INTEGER`, `value DECIMAL(10,2)` e `created_at` automático.
- Enum: **1 = Ação, 2 = FII, 3 = Renda Fixa, 4 = BDR, 5 = Outro**.
- Nome e tipo da transação são herdados do ativo. A chave estrangeira composta
  impede associar uma transação a um ativo com nome ou tipo diferente.
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
acompanhado de legenda com valores e percentuais. Usa o custo de aquisição (`value`),
não a cotação atual. O gráfico é atualizado ao salvar ativos e transações, e exibe
uma mensagem quando não há valores positivos. A legenda também oferece os dados em texto.

Tipo é o primeiro campo do formulário. Somente Ação e FII exibem os campos opcionais:

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

Esses campos continuam exclusivos para Ação e FII. Em outros tipos ficam ocultos e
desabilitados; a API ignora os valores enviados para eles. Na tabela, aparecem na
ordem valor atual, rendimento atual, DY atual e DY médio, com travessão para outros tipos.

### Editar e excluir

As listas de Ativos e Histórico de Transações têm botões **Editar** e **Excluir**.
Editar preenche o formulário existente; Cancelar edição volta à visão geral sem salvar.
Excluir pede confirmação. As tabelas, os DY, o total e a pizza são atualizados após salvar.

- Ativos sem transações permitem corrigir quantidade e preço médio diretamente.
- Ativos com transações permitem editar nome, tipo e campos de mercado. Quantidade e
  preço médio ficam somente leitura; suas correções devem ocorrer pelo histórico.
  Alterar nome/tipo também atualiza as transações vinculadas.
- Um ativo com transações não pode ser excluído até que elas sejam excluídas. Não há
  exclusão automática do histórico ao clicar em Excluir ativo.
- Editar uma transação remove seu efeito anterior e aplica os novos quantidade/valor.
  Também é possível selecionar outro ativo; ambos os saldos são recalculados.
- Excluir uma transação remove seu efeito e preserva o saldo de abertura do ativo.
- Cada registro tem uma revisão. Se os dados mudaram desde a abertura do formulário,
  a gravação é recusada para evitar sobrescrever alterações; atualize os dados e reabra a edição.
- Transações antigas cujo total não corresponde a um preço unitário com duas casas
  exibem um aviso de arredondamento ao editar. Confira o total antes de salvar.

### Aplicação no site existente

Se já aplicou as migrações **0001, 0002 e 0003**, aplique **apenas 0004**, uma única vez:

```sh
npx wrangler d1 execute criamundo-content --remote --file=migrations/0004_finance_edit_delete.sql
npx wrangler deploy
```

A migração preserva os registros, adiciona controle de revisão e substitui os triggers
que impediam edição/exclusão pelos recálculos automáticos. A tabela de transações é
recriada preservando IDs, valores e datas, com atualização de nome/tipo em cascata.

Se faltam migrações, aplique apenas as pendentes na ordem 0001 → 0002 → 0003 → 0004.
**Não reaplique as migrações antigas após atualizar**, pois elas podem recriar triggers
obsoletos. Para um banco totalmente novo, `schema.sql` já contém o modelo atual completo;
nesse caso não aplique as migrações depois.

Para testar localmente, use `--local` no lugar de `--remote`, configure `ADMIN_PASSWORD`
em `.dev.vars` e execute `npx wrangler dev`. Nunca publique credenciais como assets.

Testes (Node 24+, usando SQLite real em memória): `node --test tests/finance.test.mjs`.
