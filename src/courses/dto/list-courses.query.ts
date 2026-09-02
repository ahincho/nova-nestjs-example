import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCoursesQuery {
  @Type(() => Number)
  @IsInt({ message: 'periodId debe ser un numero entero' })
  @Min(2000, { message: 'periodId no puede ser anterior a 2000' })
  @Max(2999, { message: 'periodId no puede ser posterior a 2999' })
  periodId!: number;

  @IsOptional()
  @IsString()
  search?: string;
}
