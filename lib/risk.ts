// ¿Hay algo peligroso en lo leído? Se usa para marcar el icono de la extensión, que la página no puede
// ocultar (a diferencia del panel dentro de ella). Mismos criterios que los avisos rojos de render.ts.

import type { Code } from './decode';
import { parseCode } from './parse';
import { hiddenChars } from './unicode';
import { analyzeUrl } from './url-safety';

export function isDangerous(code: Code): boolean {
  if (hiddenChars(code.text).length > 0) return true;
  const p = parseCode(code);
  switch (p.kind) {
    case 'url':
      return analyzeUrl(p.url).findings.some((f) => f.level === 'danger') || !!p.gs1?.some((e) => e.checkDigitOk === false);
    case 'sepa':
      return !p.ibanValid;
    case 'gs1':
      return p.elements.some((e) => e.checkDigitOk === false);
    default:
      return false;
  }
}
