import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 写真のバケット（非公開。PHO-01、TST-12）。アップロードと表示は有効期限5分の署名付き URL で行う

const s3 = new S3Client({});
const BUCKET = () => process.env.PHOTO_BUCKET ?? "";
const EXPIRES = 300;
/** 長い辺 2576px の JPEG は 1〜2MB。余裕を見て 6MB まで */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/** JPEG だけを、決まった大きさまで、決まったキーにだけ置ける */
export function presignUpload(key: string) {
  return createPresignedPost(s3, {
    Bucket: BUCKET(),
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_PHOTO_BYTES],
      ["eq", "$Content-Type", "image/jpeg"],
    ],
    Fields: { "Content-Type": "image/jpeg" },
    Expires: EXPIRES,
  });
}

export function presignView(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET(), Key: key }), { expiresIn: EXPIRES });
}

export async function readPhotoBase64(key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
  if (!res.Body) throw new Error("写真を読めませんでした");
  return Buffer.from(await res.Body.transformToByteArray()).toString("base64");
}
