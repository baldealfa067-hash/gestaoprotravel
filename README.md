# Remix of Travel Agency Hub

Crie uma aplicação web SaaS chamada "Gestão Pro Travel", um sistema de gestão para agências de viagens.

Objetivo:

Permitir que uma agência de viagens controle clientes, vendas de bilhetes, pagamentos, funcionários e relatórios financeiros sem precisar integrar inicialmente com companhias aéreas ou APIs externas.

Tecnologias:

- Frontend moderno e responsivo

- Supabase para autenticação e banco de dados

- Interface profissional

- Dashboard com gráficos

- Preparado para multiempresa no futuro

Tipos de Utilizador:

1. Administrador

2. Vendedor

Funcionalidades:

Autenticação

- Login

- Recuperação de senha

- Logout

Dashboard

Mostrar:

- Bilhetes vendidos hoje

- Bilhetes vendidos este mês

- Receita total do mês

- Lucro total do mês

- Reservas pendentes

- Reservas emitidas

- Melhor vendedor do mês

Gestão de Clientes

Campos:

- Nome completo

- Telefone

- E-mail

- Número do passaporte

- Nacionalidade

- Data de criação

Funções:

- Criar cliente

- Editar cliente

- Pesquisar cliente

- Ver histórico de compras

Gestão de Bilhetes

Criar uma nova venda de bilhete com:

Dados do Cliente:

- Cliente

Dados da Viagem:

- Origem

- Destino

- Companhia aérea

- Data da viagem

- Código da reserva (PNR)

Dados Financeiros:

- Custo do bilhete

- Valor cobrado ao cliente

Calcular automaticamente:

- Lucro = Valor Cobrado - Custo

Status:

- Pedido Criado

- Pendente

- Pago

- Emitido

- Cancelado

Gestão de Funcionários

Campos:

- Nome

- Telefone

- Cargo

Mostrar:

- Quantidade de bilhetes vendidos

- Receita gerada

- Lucro gerado

Relatórios

Relatório Diário:

- Número de bilhetes vendidos

- Receita

- Lucro

Relatório Mensal:

- Total de vendas

- Receita total

- Lucro total

Filtros:

- Por data

- Por funcionário

- Por destino

Exportar:

- PDF

- Excel

Interface

Menu lateral:

- Dashboard

- Clientes

- Bilhetes

- Funcionários

- Relatórios

- Configurações

Utilizar design moderno, profissional e intuitivo para uso diário por agências de viagens africanas.

Criar banco de dados completo no Supabase com relacionamentos entre clientes, funcionários e bilhetes.

O sistema deve ser totalmente funcional para que uma agência consiga registrar uma venda, acompanhar pagamentos, controlar lucros e visualizar relatórios em tempo real.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gestaoprotravel.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4c9f042e-4735-4c17-a494-cdbebe242c65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
