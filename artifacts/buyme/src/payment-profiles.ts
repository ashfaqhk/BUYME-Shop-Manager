export type PaymentQR = {
  id: string;
  label: string;
  upiId: string;
  upiName: string;
  image?: string;
};

export function validUpiId(value: string): boolean {
  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(value.trim());
}

export function validatePaymentQR(profile: PaymentQR): string | null {
  if (!profile.label.trim()) return 'Name this QR, such as Shop or Personal.';
  if (profile.upiId.trim() && !validUpiId(profile.upiId)) return 'Enter a valid UPI ID or remove it and attach a QR image.';
  if (!profile.upiId.trim() && !profile.image) return 'Enter a UPI ID or attach a QR image.';
  return null;
}

export async function prepareQrImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a QR image smaller than 5 MB.');
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Could not prepare the QR image.');
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = canvas.toDataURL('image/png');
  if (image.length > 450_000) throw new Error('This QR image is too large to store locally. Try a smaller screenshot.');
  return image;
}