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
os saldos e o histórico. A transação informa o valor total, não o preço unitário.
Nesta versão as transações são entradas (compras); vendas não fazem parte deste modelo.

### Modelo relacional

- `finance_assets`: `id`, `name CHAR(30)`, `type SMALLINT`, `quantity INTEGER`,
  `average_price DECIMAL(8,2)` e `value DECIMAL(10,2)`.
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
mantido no formulário permite repetir um envio sem duplicá-lo. O histórico é imutável.

Todas as leituras e escritas em `GET/POST /api/admin/finance` exigem a senha do admin.
Os dados não entram no XML público, nas exportações ou nos backups do portfólio.

### Aplicação no site existente

Aplique o único script de Finanças, que cria as duas tabelas, o índice e os triggers:

```sh
npx wrangler d1 execute criamundo-content --remote --file=migrations/0001_finance.sql
npx wrangler deploy
```

O script não utiliza a antiga estrutura JSON. Pode ser reaplicado sem apagar os
ativos e transações existentes. Não é necessário executar outro script de Finanças.

Para banco novo, use `schema.sql`, que também inclui as tabelas de conteúdo.
Para testar localmente, use `--local` no lugar de `--remote`, configure `ADMIN_PASSWORD`
em `.dev.vars` e execute `npx wrangler dev`. Nunca publique credenciais como assets.

Testes (Node 24+, usando SQLite real em memória): `node --test tests/finance.test.mjs`.
