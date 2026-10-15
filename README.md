# Clinica

Aplicação derivada de clinica baseada no template AppStart.

Projeto gerado a partir do template AppStart.

## Requisitos

- Node.js >= 20.19 (com `npm`; **não** é necessário pnpm)
- Nada de servidor de banco: os dados ficam num arquivo **SQLite** (**não** é necessário Docker)

## Primeiro uso (sem Docker, sem pnpm)

```bash
cp .env.example .env      # no Windows (cmd): copy .env.example .env
npm install
npm run setup             # prepara o SQLite, aplica migrations e seed
npm run dev
```

O banco é definido por `DATABASE_URL=file:./dev.db`; caminhos relativos são resolvidos a
partir de `apps/api/prisma/` (arquivo final: `apps/api/prisma/dev.db`, ignorado pelo Git).

O `.env.example` já vem com `AUTH_MODE=dev` e `USE_DOCKER=false`:

- `AUTH_MODE=dev`: login local de desenvolvimento, sem Keycloak. Entre com e-mail e
  senha de `DEV_ADMIN_*` (administrador) ou `DEV_USER_*` (usuário comum). É recusado
  quando `NODE_ENV=production`. A tela "Continuar com Keycloak" e a administração de
  usuários (que usa o Keycloak) não funcionam nesse modo.
- `USE_DOCKER=true`: sobe o Keycloak via `docker compose` (o banco da aplicação continua
  sendo o arquivo SQLite; use junto com `AUTH_MODE=keycloak` para o Keycloak real).
- `AUTH_MODE=keycloak` com `USE_DOCKER=false`: usa um Keycloak já existente em `KEYCLOAK_BASE_URL`.

## Rodando no GitHub Codespaces

O Codespaces expõe cada serviço em uma URL pública diferente de `localhost`.
Após abrir o projeto no Codespaces, execute:

```bash
bash scripts/codespaces-setup.sh
```

O script detecta automaticamente o `CODESPACE_NAME` e atualiza as variáveis
`API_BASE_URL`, `WEB_BASE_URL` e `KEYCLOAK_BASE_URL` no `.env` com as URLs
públicas corretas. Em seguida, torne as portas públicas no painel de **Portas**
do Codespaces e reinicie com `npm run dev`.

## Scripts principais

- `npm run setup`: prepara o SQLite (e o Keycloak em Docker, se aplicável), aplica migrations e executa o seed
- `npm run dev`: inicia API e frontend em paralelo
- `npm run db:up`: garante a pasta do arquivo SQLite (o arquivo é criado pelas migrations)
- `npm run db:down`: sem efeito (SQLite não tem servidor); para zerar, apague o arquivo `.db` e rode `npm run db:migrate`
- `npm run auth:up`: sobe o Keycloak em Docker (só com `AUTH_MODE=keycloak` e `USE_DOCKER=true`)
- `npm run auth:down`: para o Keycloak sem remover dados
- `npm run db:migrate`: aplica migrations Prisma no ambiente local
- `npm run db:check`: valida schema e migrations com um SQLite temporário
- `npm run db:deploy`: aplica migrations em produção com prisma migrate deploy
- `npm run db:seed`: executa o seed de desenvolvimento
- `npm run db:studio`: abre o Prisma Studio

## Configuração inicial

Revise o arquivo `.env` gerado automaticamente antes de compartilhar o projeto.

## Usuários de desenvolvimento

As credenciais são definidas pelas variáveis `DEV_ADMIN_*` e `DEV_USER_*` no `.env`.
