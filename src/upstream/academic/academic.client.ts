import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { HttpClientService, UpstreamHttpError } from '@ahincho/nova-nestjs';
import { academic } from './academic.config';

export type AcademicCourse = {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
};

@Injectable()
export class AcademicClient {
  constructor(
    private readonly http: HttpClientService,
    @Inject(academic.KEY)
    private readonly config: ConfigType<typeof academic>,
  ) {}

  /**
   * El `x-request-id` de la peticion entrante viaja solo: no se pasa por aca.
   */
  listCourses(periodId: number): Promise<AcademicCourse[]> {
    return this.http.get<AcademicCourse[]>(`${this.config.url}/courses`, {
      query: { periodId },
      timeoutMs: this.config.timeoutMs,
    });
  }

  /**
   * El unico caso donde vale pedir el error crudo: un 404 del upstream aca
   * significa "ese curso no existe", que si es del incumbencia del llamador.
   * Todo lo demas sigue saliendo como 502 sin que este metodo haga nada.
   */
  async findCourse(id: string): Promise<AcademicCourse> {
    try {
      return await this.http.get<AcademicCourse>(
        `${this.config.url}/courses/${id}`,
        { timeoutMs: this.config.timeoutMs, forwardError: true },
      );
    } catch (error) {
      if (error instanceof UpstreamHttpError && error.statusCode === 404) {
        // El `errorCode` es de NestJS 12 y es lo que deja que el sobre diga
        // COURSE_NOT_FOUND en vez del NOT_FOUND generico que sale del status,
        // sin escribir una excepcion propia. El filtro global de la plataforma
        // lo lee.
        throw new NotFoundException(`Curso ${id} no encontrado`, {
          errorCode: 'COURSE_NOT_FOUND',
        });
      }
      throw error;
    }
  }
}
