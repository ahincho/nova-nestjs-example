import { Module } from '@nestjs/common';
import { NovaModule } from '@ahincho/nova-nestjs';
import { CoursesModule } from './courses/courses.module';
import { academic } from './upstream/academic/academic.config';
import { AcademicModule } from './upstream/academic/academic.module';

@Module({
  imports: [
    NovaModule.forRoot({
      // Declara el upstream. Si ACADEMIC_URL no está inyectada, el servicio no
      // arranca y el error la nombra, en vez de responder 500 la primera vez
      // que alguien llame la ruta que la necesita.
      config: { load: [academic] },

      health: {
        // La ruta que el target group ya revisa. Un servicio que nace hoy sólo
        // necesita `/health/live` y `/health/ready`; uno que ya está desplegado
        // no puede mover la suya sin recrear el target group, así que la sirve
        // en paralelo hasta que la infraestructura apunte a la nueva.
        legacyPath: 'api/v1/health',

        // Tras SIGTERM el servicio sigue respondiendo, pero `ready` y la ruta
        // heredada pasan a 503 durante esta ventana. Le da al balanceador
        // tiempo de sacar la tarea de rotación antes de que el proceso cierre,
        // que es lo que evita los errores del final de cada despliegue.
        // Conviene mayor al intervalo de la sonda y menor al stopTimeout.
        gracefulShutdownTimeoutMs: 5000,

        readinessChecks: [
          {
            name: 'academic',
            // Un chequeo de disponibilidad mira lo que el servicio necesita
            // para atender. Acá alcanza con que la configuración resolviera.
            //
            // A propósito no llama al upstream: si `ready` cayera cuando
            // academic se cae, el orquestador mataría tareas sanas de este
            // servicio por un problema que no es suyo.
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
