# Plano de migração dos três módulos para Android

## Comando de ativação

Quando o usuário enviar exatamente ou de forma inequívoca o comando:

> **MIGRAR OS 3 MÓDULOS PARA ANDROID**

retomar este documento, revisar o estado atual do projeto e iniciar a implementação
da migração. Não executar a migração antes desse comando.

## Objetivo

Criar um aplicativo Android chamado **Financeiro Anale**, reunindo:

- Investimentos;
- Cartão de Crédito;
- Gastos Mensais.

O aplicativo deve usar banco de dados local no aparelho em vez do Cloudflare D1.
As consultas de preços e rendimentos ainda poderão utilizar internet quando
necessário.

## Estratégia recomendada

Usar **Capacitor** para empacotar a interface existente em HTML, CSS e JavaScript.
Essa abordagem permite preservar a maior parte das telas, cálculos, leitores de PDF
e regras de negócio atuais. Uma reescrita integral em Kotlin e Jetpack Compose deve
ser considerada apenas se houver uma decisão explícita por uma interface totalmente
nativa.

## Aplicativo e navegação

- Criar o projeto Android com o nome Financeiro Anale.
- Incorporar a aplicação web por meio do Capacitor.
- Usar Investimentos, Cartão de Crédito e Gastos Mensais como áreas principais.
- Adaptar tabelas, formulários, gráficos, collapses e botões para telas menores.
- Criar ícone, tela de abertura, configurações e identidade visual do aplicativo.
- Testar orientação, teclado virtual, áreas seguras e acessibilidade no Android.

## Banco de dados local

Substituir o Cloudflare D1 por SQLite local, preferencialmente criptografado. As
tabelas existentes devem ser reaproveitadas para ativos, transações, faturas,
grupos, gastos, rendas e associações por competência.

Trabalho necessário:

- adaptar `schema.sql` ao SQLite usado no Android;
- converter e consolidar as migrations existentes em migrations locais;
- criar uma camada de acesso por meio de um plugin SQLite compatível com Capacitor;
- preservar chaves estrangeiras, constraints, transações atômicas e revisões;
- substituir chamadas HTTP internas por repositórios locais;
- criar testes de instalação nova, atualização e restauração de backup.

## Substituição das APIs

As chamadas atuais para rotas como `/api/admin/finance`,
`/api/admin/credit-card` e `/api/admin/monthly-expenses` devem ser substituídas por
serviços locais, por exemplo:

```text
FinanceRepository
CreditCardRepository
MonthlyExpensesRepository
```

As regras presentes nos módulos `*-api.mjs` devem ser separadas do transporte HTTP
e reaproveitadas nesses repositórios. Validadores e cálculos JavaScript continuam
sendo compartilhados entre a interface e os serviços locais.

## Segurança

- Remover do aplicativo o login administrativo WebAuthn usado pelo navegador.
- Proteger o acesso com a API biométrica do Android.
- Aceitar impressão digital ou reconhecimento facial conforme os recursos seguros
  disponíveis no aparelho.
- Disponibilizar PIN ou senha como alternativa de recuperação.
- Armazenar a chave criptográfica no Android Keystore.
- Criptografar o SQLite, preferencialmente com SQLCipher.
- Bloquear novamente a aplicação depois de um período em segundo plano.
- Avaliar o bloqueio de capturas de tela nas áreas financeiras.

## Importação de PDFs

Usar o seletor de documentos do Android para o usuário escolher extratos da B3,
faturas e relatórios de preços médios. Validar no WebView o funcionamento de PDF.js,
OCR e Tesseract, especialmente consumo de memória e arquivos grandes. O aplicativo
deve solicitar somente acesso ao documento escolhido, sem acesso irrestrito ao
armazenamento.

## Preços e rendimentos

As operações de obter preços atuais e rendimentos continuarão dependendo de
internet. Implementar um cliente HTTP nativo ou plugin Capacitor com:

- timeout e cancelamento garantidos;
- tentativas limitadas;
- processamento em lote controlado;
- tratamento de bloqueios e mudanças no Status Invest;
- cache da última informação válida;
- data e hora visíveis da última atualização;
- mensagens individuais para ativos não encontrados.

As exceções de URLs e a replicação entre códigos semelhantes existentes no sistema
devem ser preservadas.

## Backup e restauração

Como o banco será somente local, backup é requisito essencial:

- exportar um arquivo de backup criptografado;
- importar e validar o backup;
- versionar o formato para permitir upgrades;
- permitir salvar ou compartilhar pelo Google Drive e outros destinos do Android;
- oferecer backup automático opcional;
- exibir a data do último backup;
- permitir exportação complementar em CSV ou JSON.

## PDF e compartilhamento

Adaptar as ações de impressão para gerar PDF no aparelho, visualizar o resultado e
salvar ou compartilhar pelo seletor do Android. Preservar gráficos, agrupamentos,
filtros e totalizadores nos relatórios.

## Distribuição

Preparar build assinado em AAB para Google Play ou APK assinado para instalação
manual. Definir versionamento, assinatura, procedimento de atualização e testes em
uma versão suportada do Android antes da primeira distribuição.

## Ordem de execução sugerida

1. Congelar e documentar o schema e as regras dos três módulos estáveis.
2. Criar o projeto Capacitor e a navegação Android.
3. Implementar SQLite local e suas migrations.
4. Extrair as APIs atuais para repositórios locais.
5. Migrar cada módulo e executar os testes de equivalência.
6. Implementar biometria, Keystore e criptografia.
7. Adaptar importação de PDFs e geração de relatórios.
8. Adaptar consultas externas de preços e rendimentos.
9. Implementar backup, restauração e recuperação.
10. Fazer testes em aparelho real e gerar o APK/AAB assinado.

## Critérios mínimos para iniciar

Antes do comando de ativação, é desejável que os três módulos estejam estáveis, que
as migrations remotas estejam consolidadas e que os fluxos principais possuam
testes. Ao iniciar, revisar este plano contra o código vigente, pois novas
funcionalidades adicionadas depois deste documento também deverão ser migradas.
