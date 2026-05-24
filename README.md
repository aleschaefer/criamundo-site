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
