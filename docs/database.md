# Banco de dados e migrations

## Desenvolvimento local

O projeto usa **SQLite**: o banco é um único arquivo apontado por `DATABASE_URL` no `.env` (padrão `file:./dev.db`). Caminhos relativos são resolvidos a partir de `apps/api/prisma/`, então o arquivo fica em `apps/api/prisma/dev.db` (ignorado pelo Git). Não há servidor para instalar ou subir.

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

`npm run db:up` apenas garante que a pasta do arquivo existe; o arquivo em si é criado quando `npm run db:migrate` aplica as migrations. `npm run db:down` não faz nada (não há servidor). Para inspecionar dados localmente, use `npm run db:studio`.

`USE_DOCKER=true` agora só serve para subir o Keycloak (`AUTH_MODE=keycloak`), que usa o banco embutido dele (`KC_DB=dev-file`) e persiste no volume `keycloak_data`.

## Particularidades do SQLite

- Enums (`UserRole`, `TaskStatus`, `TaskPriority`) são gravados como `TEXT`; o Prisma Client (>= 6.2) valida os valores.
- UUIDs são gerados pelo Prisma Client (`@default(uuid())`), não pelo banco.
- Buscas com `contains` viram `LIKE`, que ignora maiúsculas/minúsculas apenas para caracteres ASCII (`a` = `A`, mas `ç` ≠ `Ç`).
- A checagem de nome duplicado (categorias e modelos de ficha) é feita em JavaScript com `toLocaleLowerCase('pt-BR')`, pois `=` no SQLite diferencia maiúsculas.
- SQLite aceita um escritor por vez; é adequado a desenvolvimento, demos e cargas pequenas. Para produção com várias instâncias da API, prefira um banco cliente-servidor.

## Alterações estruturais

Toda alteração em `apps/api/prisma/schema.prisma` deve possuir uma migration versionada em `apps/api/prisma/migrations/`. A CI executa `npm run db:check` e falha quando o schema e o histórico de migrations divergem. O histórico atual começa em um baseline único (`20261008000000_init_sqlite`), que substituiu as migrations PostgreSQL anteriores.

A validação usa um arquivo SQLite temporário como banco *shadow* (criado e removido automaticamente). Se quiser indicar outro, defina `SHADOW_DATABASE_URL=file:/caminho/shadow.db`; ele jamais deve ser o banco real.

## Deploy em produção

A release deve fornecer `DATABASE_URL` por secret do ambiente (apontando para um arquivo em volume persistente) e executar:

```bash
NODE_ENV=production DATABASE_URL="file:/dados/app.db" npm run db:deploy
```

`npm run db:deploy` usa exclusivamente `prisma migrate deploy`, que é não interativo e aplica somente migrations já versionadas. Não use `prisma migrate dev`, `prisma db push` nem comandos de reset em produção. Faça backup do arquivo `.db` (copie-o com a API parada ou use `sqlite3 app.db ".backup copia.db"`).

## Reset destrutivo de desenvolvimento

Apague o arquivo do banco e recrie:

```bash
rm apps/api/prisma/dev.db*   # no Windows: del apps\api\prisma\dev.db*
npm run setup
```

Com Keycloak em Docker, remova também o volume: `docker compose down -v`. Esse procedimento apaga dados e sessões locais e deve ser usado somente em desenvolvimento.
