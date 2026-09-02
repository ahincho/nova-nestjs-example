import { defineUpstream } from '@ahincho/nova-nestjs';

/**
 * Todo el archivo de configuracion de un upstream.
 *
 * Lee `ACADEMIC_URL` y `ACADEMIC_TIMEOUT_MS`, valida que la URL sea http(s),
 * le quita la barra final y aplica 5000 ms cuando el timeout no esta puesto.
 */
export const academic = defineUpstream('academic', { defaultTimeoutMs: 3000 });
