import process from 'node:process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$queryRaw`SELECT 1`;

  console.log('Seed da aplicação concluído.');
  console.log(`Usuário administrador provisionado no Keycloak: ${process.env.DEV_ADMIN_EMAIL}`);
  console.log(`Usuário comum provisionado no Keycloak: ${process.env.DEV_USER_EMAIL}`);
  console.log('Perfis locais são sincronizados no primeiro login pelo BFF.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
