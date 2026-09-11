import { randomUUID } from "crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME as string;
const IMAGES_CDN_DOMAIN = process.env.IMAGES_CDN_DOMAIN as string;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Presigned POST, not presigned PUT: POST supports server-enforced
// conditions (content-length-range, a Content-Type prefix match) that S3
// itself rejects an upload against — a presigned PUT URL can't express
// those, which would leave file type/size as a client-side-only check.
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  let parsedBody: unknown;
  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse(400, { success: false, errors: { _body: "Invalid JSON" } });
  }

  const body = (
    typeof parsedBody === "object" && parsedBody !== null ? parsedBody : {}
  ) as Record<string, unknown>;
  const contentType = typeof body.contentType === "string" ? body.contentType : "";

  const extension = ALLOWED_CONTENT_TYPES[contentType];
  if (!extension) {
    return jsonResponse(400, {
      success: false,
      errors: {
        contentType: `Content type must be one of: ${Object.keys(ALLOWED_CONTENT_TYPES).join(", ")}`,
      },
    });
  }

  // Server-generated key — never a client-supplied filename/path, which
  // closes off path traversal and cross-upload key collisions.
  const key = `${randomUUID()}.${extension}`;

  try {
    const { url, fields } = await createPresignedPost(s3, {
      Bucket: BUCKET_NAME,
      Key: key,
      Conditions: [
        ["content-length-range", 1, MAX_FILE_SIZE_BYTES],
        ["starts-with", "$Content-Type", "image/"],
      ],
      Fields: {
        "Content-Type": contentType,
      },
      Expires: 300,
    });

    return jsonResponse(200, {
      success: true,
      uploadUrl: url,
      fields,
      publicUrl: `https://${IMAGES_CDN_DOMAIN}/${key}`,
    });
  } catch (err) {
    console.error("generate-upload-url failed", {
      errorName: err instanceof Error ? err.name : "Unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      success: false,
      error: "Failed to generate upload URL",
    });
  }
}
