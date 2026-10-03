// Veredicto de todo lo leído de una vez. Se usa para marcar el icono de la extensión, que la página no puede
// ocultar (a diferencia del panel dentro de ella). Mismo veredicto que muestra la interfaz (verdict.ts).

import type { Code } from './decode';
import { assess, DEFAULT_CONTEXT, worst, type AssessContext, type Verdict } from './verdict';

export function overallVerdict(codes: readonly Code[], ctx: AssessContext = DEFAULT_CONTEXT): Verdict {
  return worst(...codes.map((c) => assess(c, ctx).verdict));
}

export function isDangerous(code: Code, ctx: AssessContext = DEFAULT_CONTEXT): boolean {
  return assess(code, ctx).verdict === 'danger';
}
