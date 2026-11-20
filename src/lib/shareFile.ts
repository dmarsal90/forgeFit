import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Escribe el texto en un archivo de caché y abre el menú de compartir; false si el dispositivo no puede compartir archivos. */
export async function shareTextFile(name: string, content: string, mimeType: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
  return true;
}
