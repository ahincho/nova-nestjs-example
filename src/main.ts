import { bootstrap } from '@ahincho/nova-nestjs';
import { AppModule } from './app.module';

// El main.ts completo. El ValidationPipe con la fabrica del sobre, el bind a
// 0.0.0.0, el puerto leido de PORT y la exclusion de las sondas del prefijo
// global los pone bootstrap(); nada de eso se copia por servicio.
void bootstrap(AppModule, {
  globalPrefix: 'api/v1',
  cors: { origins: process.env['CORS_ALLOWED_ORIGINS'] ?? '' },
});
