const uploads = new Map<string, string>();

export function putUpload(shotId: string, dataUrl: string) {
  uploads.set(shotId, dataUrl);
}

export function getUpload(shotId: string) {
  return uploads.get(shotId) ?? null;
}
