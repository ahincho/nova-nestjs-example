import { Module } from '@nestjs/common';
import { NovaModule } from '@ahincho/nova-nestjs';
import { CoursesModule } from './courses/courses.module';
import { academic } from './upstream/academic/academic.config';
import { AcademicModule } from './upstream/academic/academic.module';

@Module({
  imports: [
    NovaModule.forRoot({
      // Declara el upstream. Si ACADEMIC_URL no esta inyectada, el servicio no
      // arranca y el error la nombra - en vez de responder 500 la primera vez
      // que alguien llame la ruta que la necesita.
      config: { load: [academic] },

      health: {
        readinessChecks: [
          {
            name: 'academic',
            // Un chequeo de disponibilidad mira lo que el servicio necesita
            // para atender. Aca alcanza con que la configuracion resolviera.
            check: () => Boolean(process.env['ACADEMIC_URL']),
          },
        ],
      },
    }),
    AcademicModule,
    CoursesModule,
  ],
})
export class AppModule {}
