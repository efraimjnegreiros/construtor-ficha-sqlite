import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessControlModule } from './access/access-control.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { ErrorMonitoringService } from './common/observability/error-monitoring.service';
import { HttpLoggingInterceptor } from './common/observability/logging.interceptor';
import { RequestIdMiddleware } from './common/observability/request-id.middleware';
import { FormAccessModule } from './form-access/form-access.module';
import { FormStructureModule } from './form-structure/form-structure.module';
import { FormTemplatesModule } from './form-templates/form-templates.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProntuarioModule } from './prontuario/prontuario.module';
import { TasksModule } from './tasks/tasks.module';
import { UserModule } from './users/user.module';

@Module({
  // [CATEGORIA] CategoriesModule adicionado ao final da lista
  imports: [PrismaModule, AuthModule, AccessControlModule, UserModule, TasksModule, CategoriesModule, FormAccessModule, ProntuarioModule, FormTemplatesModule, FormStructureModule],
  controllers: [HealthController],
  providers: [
    ErrorMonitoringService,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
