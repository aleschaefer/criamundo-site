# Importação Google Agenda em Lembretes

1. No Google Cloud, habilite Google Calendar API e Google Tasks API.
2. Configure a tela de consentimento OAuth. Em modo de teste, adicione a conta que utilizará a importação como usuário de teste.
3. Crie um cliente OAuth do tipo Aplicativo da Web. Autorize a origem exata do site: https://criamundo.art.br (e outras origens apenas se forem utilizadas).
4. Configure a variável GOOGLE_CLIENT_ID no Worker com o Client ID público. Não é necessário Client Secret neste fluxo.
5. Aplique a migração 0035_reminder_title_responsible.sql antes de publicar, caso ainda não aplicada.
6. Publique e abra Lembretes → Importar agenda. Escolha a data e autorize a leitura de Agenda e Tarefas.

A autorização usa Google Identity Services (token model). O token é usado somente durante a requisição e não é salvo. São lidas a agenda principal, as agendas selecionadas e todas as listas de tarefas. Eventos recorrentes são expandidos; cancelados são ignorados. Tarefas são importadas pela data de vencimento, incluindo concluídas; tarefas sem vencimento ou atrasadas de outro dia não são atribuídas artificialmente ao dia selecionado. O intervalo de eventos utiliza Brasília (UTC−03).

Cada evento/tarefa gera um lembrete, na categoria Google Agenda, responsável Ale/Ana. Títulos e descrições respeitam os limites de 30 e 200 caracteres. Reimportar a mesma origem/data não sobrescreve lembretes existentes nem os duplica. A lista de resultados mostra apenas os criados na execução atual.

Documentação: https://developers.google.com/identity/oauth2/web/guides/use-token-model
