const MAX_WIDTH = 300;
const JPEG_QUALITY = 0.7;

export async function resizeImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
}

export async function fetchCoverFromOpenLibrary(isbn: string): Promise<string | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  try {
    const res = await fetch(url);
    if (res.ok) return url;
    return null;
  } catch {
    return null;
  }
}
