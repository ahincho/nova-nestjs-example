import { bootstrap } from '@ahincho/nova-nestjs';
import { AppModule } from './app.module';

// El main.ts completo. El ValidationPipe con la fábrica del sobre, el bind a
// 0.0.0.0, el puerto leído de PORT, los hooks de apagado y la exclusión de las
// sondas del prefijo global los pone bootstrap(); nada de eso se copia por
// servicio.
void bootstrap(AppModule, {
  globalPrefix: 'api/v1',
  // Tiene que coincidir con el `legacyPath` del módulo de salud: es lo que
  // deja la ruta heredada fuera del prefijo, para que siga siendo
  // `/api/v1/health` y no `/api/v1/api/v1/health`.
  legacyHealthPath: 'api/v1/health',
  cors: { origins: process.env['CORS_ALLOWED_ORIGINS'] ?? '' },
});
