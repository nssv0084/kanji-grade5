import type { PhotoUploads } from "../../../shared/types";

/** AI が読める最大の大きさ（長い辺）。これより大きいと縮められ、返る座標が写真とずれる（TST-07） */
export const MAX_EDGE = 2576;

/** 写真を長い辺 2576px までの JPEG にする。向き（EXIF）はブラウザが直した状態で描く */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("写真を変換できませんでした"))), "image/jpeg", 0.88));
}

/** 署名付きの POST で S3 に直接送る（PHO-01） */
export async function uploadPhotos(uploads: PhotoUploads["uploads"], photos: Blob[]): Promise<void> {
  await Promise.all(
    uploads.map(async (u, i) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(u.fields)) form.append(k, v);
      form.append("file", photos[i]);
      const res = await fetch(u.url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`写真${i + 1}を送れませんでした（${res.status}）`);
    }),
  );
}
