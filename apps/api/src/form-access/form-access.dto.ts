import { ApiProperty } from '@nestjs/swagger';
import { FormPermission, FormRole } from './form-access.types';

export class FormAccessProfileDto {
  @ApiProperty({ enum: Object.values(FormRole), isArray: true, enumName: 'FormRole' })
  roles!: FormRole[];

  @ApiProperty({ enum: Object.values(FormPermission), isArray: true, enumName: 'FormPermission' })
  permissions!: FormPermission[];

  @ApiProperty({ description: 'true enquanto os perfis vierem do mock de primeira fase', example: true })
  mock!: boolean;
}
