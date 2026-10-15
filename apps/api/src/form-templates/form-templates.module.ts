import { Module } from '@nestjs/common';
import { FormAccessModule } from '../form-access/form-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProntuarioModule } from '../prontuario/prontuario.module';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

@Module({
  imports: [PrismaModule, FormAccessModule, ProntuarioModule],
  controllers: [FormTemplatesController],
  providers: [FormTemplatesService],
  exports: [FormTemplatesService],
})
export class FormTemplatesModule {}
