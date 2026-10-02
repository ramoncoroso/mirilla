// ¿Hay algo peligroso en lo leído? Se usa para marcar el icono de la extensión, que la página no puede
// ocultar (a diferencia del panel dentro de ella). Mismo veredicto que muestra la interfaz (verdict.ts).

import type { Code } from './decode';
import { assess, DEFAULT_CONTEXT, type AssessContext } from './verdict';

export function isDangerous(code: Code, ctx: AssessContext = DEFAULT_CONTEXT): boolean {
  return assess(code, ctx).verdict === 'danger';
}
