// =============================================================================
// CategoriesModule — "pacote" Nest que junta controller + service
// -----------------------------------------------------------------------------
// Mesmo formato do TasksModule. Depois de criado, precisa ser importado em
// apps/api/src/app.module.ts para as rotas /api/v1/categories existirem.
// =============================================================================
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [PrismaModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
