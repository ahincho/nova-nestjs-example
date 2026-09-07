import { ApiProperty } from '@nestjs/swagger';

/**
 * Lo que ve el frontend. Es un contrato: agregarle un campo a lo que devuelve
 * el upstream no debería cambiarlo sin que alguien lo decida.
 *
 * Es una clase y no un `type` porque OpenAPI se genera leyendo metadatos en
 * tiempo de ejecución, y un `type` de TypeScript no deja ninguno. Un DTO de
 * respuesta declarado como tipo no se puede documentar: `ApiEnvelope` recibe
 * una clase.
 */
export class CourseResponse {
  @ApiProperty({ example: 'MAT101' })
  id: string;

  @ApiProperty({ example: 'Cálculo I' })
  name: string;

  @ApiProperty({ example: 4 })
  credits: number;
}
