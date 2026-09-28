import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PreparedPhoto {
  uri: string;
  base64: string;
  mediaType: 'image/jpeg';
}

/** Downscale to ≤ 1280 px wide JPEG (q 0,8) before upload — keeps requests small. */
export async function preparePhoto(uri: string, width?: number): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (!width || width > 1280) ctx.resize({ width: 1280 });
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Image encoding failed');
  const base64 = saved.base64.replace(/^data:[^,]+,/, '');
  return { uri: saved.uri, base64, mediaType: 'image/jpeg' };
}
