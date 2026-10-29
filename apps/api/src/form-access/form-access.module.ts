import { Module } from '@nestjs/common';
import { FormAccessController } from './form-access.controller';
import { FormAccessService, MockFormAccessService } from './form-access.service';
import { FormPermissionsGuard } from './form-permissions.guard';

@Module({
  controllers: [FormAccessController],
  providers: [{ provide: FormAccessService, useClass: MockFormAccessService }, FormPermissionsGuard],
  exports: [FormAccessService, FormPermissionsGuard],
})
export class FormAccessModule {}
