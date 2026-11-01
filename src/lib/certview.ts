import 'server-only';
import QRCode from 'qrcode';
import { appUrl } from './auth';

export const verifyUrl = (number: string) => appUrl(`/verify/${encodeURIComponent(number)}`);
export function verifyQr(number: string) {
  return QRCode.toString(verifyUrl(number), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1e2843', light: '#ffffff' } });
}
