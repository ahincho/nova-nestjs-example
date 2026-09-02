import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequestContextService } from '@ahincho/nova-nestjs';
import { CoursesService } from './courses.service';
import type { CourseResponse } from './dto/course.response';
import { ListCoursesQuery } from './dto/list-courses.query';

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Devuelve el objeto de dominio pelado. El interceptor global lo envuelve en
   * `{ success, status, data, errors }`; el controlador no arma el sobre.
   */
  @Get()
  list(@Query() query: ListCoursesQuery): Promise<CourseResponse[]> {
    return this.courses.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<CourseResponse> {
    return this.courses.findOne(id);
  }

  /**
   * Solo para ver el contexto desde afuera: nada de produccion necesita leerlo
   * a mano, porque el cliente HTTP y el logger ya lo hacen.
   */
  @Get('debug/context')
  debugContext(): { requestId: string | undefined } {
    return { requestId: this.context.requestId() };
  }
}
