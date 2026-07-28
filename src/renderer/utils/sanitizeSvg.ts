/**
 * Nettoie un SVG avant son injection dans le DOM.
 *
 * Le SVG provient de plantuml.jar exécuté localement, mais son contenu dérive
 * du texte saisi par l'utilisateur (libellés, liens `[[url]]`). On retire donc
 * tout ce qui pourrait s'exécuter ou déclencher une requête sortante.
 */
const FORBIDDEN_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'foreignObject', 'animate'];
const URL_ATTRIBUTES = ['href', 'xlink:href', 'src'];

export function sanitizeSvg(rawSvg: string): string {
  const parser = new DOMParser();
  const document_ = parser.parseFromString(rawSvg, 'image/svg+xml');

  if (document_.querySelector('parsererror')) return '';

  const root = document_.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return '';

  FORBIDDEN_ELEMENTS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((element) => element.remove());
  });

  const walker = document_.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [root];
  while (walker.nextNode()) elements.push(walker.currentNode as Element);

  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      // Gestionnaires d'évènements inline (onclick, onload…)
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }

      // Liens : seuls les ancres internes restent, tout le reste est neutralisé.
      if (URL_ATTRIBUTES.includes(name) && !value.startsWith('#')) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(root);
}

/** Dimensions intrinsèques du SVG, utilisées par l'ajustement à la fenêtre. */
export function readSvgSize(svg: string): { width: number; height: number } | null {
  const width = Number(svg.match(/\swidth="([\d.]+)(?:px)?"/i)?.[1]);
  const height = Number(svg.match(/\sheight="([\d.]+)(?:px)?"/i)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  const viewBox = svg.match(/viewBox="([\d.\s-]+)"/i)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return null;
}
