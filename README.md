# Portfólio Rio2C

Mini-site one-page estático para apresentar o portfólio criativo de Alexandre Schaefer.

## Arquivos principais

- `index.html`: site público
- `styles.css`: visual do site público
- `script.js`: renderização do site público
- `admin.html`: painel de manutenção do conteúdo
- `admin.css`: visual do painel
- `admin.js`: lógica do painel
- `content.js`: conteúdo padrão inicial
- `data-manager.js`: leitura e gravação dos dados no navegador

## Como editar sem mexer no HTML

1. Abra `admin.html`
2. Edite contatos, destaque, categorias e projetos
3. Clique em `Salvar alterações`
4. Abra ou recarregue `index.html`

## Como funciona

- O site lê os dados salvos no `localStorage` do navegador
- Se não houver nada salvo, ele usa o conteúdo padrão de `content.js`
- Isso significa que a edição fica vinculada a este navegador/dispositivo

## Ações disponíveis no painel

- adicionar categoria
- remover categoria
- adicionar projeto
- remover projeto
- editar todos os campos dos projetos
- exportar um JSON com os dados atuais
- restaurar o conteúdo padrão

## Formulário

Há dois modos de envio:

1. Fallback por e-mail
   Basta preencher `siteConfig.contact.email`.

2. Endpoint externo
   Preencha `siteConfig.challengeForm.endpoint` com um endpoint próprio, FormSubmit, Netlify Forms, serverless function ou backend.

## Publicação

Pode ser hospedado em:

- Vercel
- Netlify
- Cloudflare Pages
- WordPress como página estática
- servidor próprio
