/**
 * Conversion du rendu édité en PNG.
 *
 * L'export SVG et PDF part du texte SVG, mais le PNG demande une
 * rastérisation. Elle a lieu ici, dans le renderer : Chromium sait dessiner un
 * SVG dans un canevas, sans aucune dépendance ni accès réseau.
 */
const PNG_SCALE = 2;

export async function svgToPngBase64(svg: string, scale = PNG_SCALE): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await chargerImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error("Le canevas de rastérisation n'a pas pu être créé.");

    // Le SVG est transparent : un fond blanc évite un PNG à fond noir dans les
    // visionneuses qui n'affichent pas la transparence.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Le diagramme n'a pas pu être converti en image."));
    image.src = url;
  });
}
