import { apiClient } from "./api-client";

interface UploadUrlResponse {
  success: true;
  uploadUrl: string;
  fields: Record<string, string>;
  publicUrl: string;
}

// Uploads directly to S3 via a presigned POST (requested from our own
// authenticated Lambda) — the file bytes never pass through API Gateway/
// Lambda, avoiding their payload size limits entirely.
export async function uploadImage(blob: Blob, contentType: string): Promise<string> {
  const { uploadUrl, fields, publicUrl } = await apiClient.post<UploadUrlResponse>(
    "/api/v1/admin/portfolio/upload-url",
    { contentType }
  );

  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  // The file field must be appended last — S3 presigned POST reads
  // multipart fields in order and treats the file as the final field.
  formData.append("file", blob);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed with status ${uploadResponse.status}`);
  }

  return publicUrl;
}
