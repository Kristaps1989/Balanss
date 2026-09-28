import { Linking, Platform } from 'react-native';

/**
 * Open a file download. On web a temporary <a download> keeps the user on the
 * page; on Android/iOS the system browser handles the download.
 */
export async function openDownload(url: string, filename = 'balanss-dati.json') {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  await Linking.openURL(url);
}
