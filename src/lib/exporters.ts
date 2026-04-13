export type PngSizeMode = 'auto' | 'width' | 'height';

const toNumber = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value.replace('px', ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const getSvgSize = (svgMarkup: string): { width: number; height: number } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const svg = doc.documentElement;

  const width = toNumber(svg.getAttribute('width'));
  const height = toNumber(svg.getAttribute('height'));
  const viewBox = svg.getAttribute('viewBox');

  if (width && height) {
    return { width, height };
  }

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map((part) => Number.parseFloat(part));
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return { width: 1200, height: 800 };
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadSvg = (svgMarkup: string): void => {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  downloadBlob(blob, `mermaid-diagram-${stamp}.svg`);
};

export const svgToPngBlob = async (
  svgMarkup: string,
  sizeMode: PngSizeMode,
  sizeValue: number,
  backgroundColor = '#ffffff'
): Promise<Blob> => {
  const { width: sourceWidth, height: sourceHeight } = getSvgSize(svgMarkup);

  let width = sourceWidth;
  let height = sourceHeight;

  if (sizeMode === 'width') {
    width = sizeValue;
    height = Math.max(1, Math.round((sourceHeight / sourceWidth) * sizeValue));
  } else if (sizeMode === 'height') {
    height = sizeValue;
    width = Math.max(1, Math.round((sourceWidth / sourceHeight) * sizeValue));
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create canvas context');
  }

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const encodedSvg = encodeURIComponent(svgMarkup);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load SVG image into canvas'));
  });

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });
  if (!blob) {
    throw new Error('PNG export failed');
  }
  return blob;
};

export const downloadPng = async (
  svgMarkup: string,
  sizeMode: PngSizeMode,
  sizeValue: number,
  backgroundColor = '#ffffff'
): Promise<void> => {
  const blob = await svgToPngBlob(svgMarkup, sizeMode, sizeValue, backgroundColor);
  const stamp = new Date().toISOString().replaceAll(':', '-');
  downloadBlob(blob, `mermaid-diagram-${stamp}.png`);
};

export const copyPngToClipboard = async (
  svgMarkup: string,
  sizeMode: PngSizeMode,
  sizeValue: number,
  backgroundColor = '#ffffff'
): Promise<void> => {
  const blob = await svgToPngBlob(svgMarkup, sizeMode, sizeValue, backgroundColor);
  if (!('ClipboardItem' in window) || !navigator.clipboard) {
    throw new Error('Clipboard image API is not supported in this browser');
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob
    })
  ]);
};

