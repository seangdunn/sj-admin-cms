import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME as string;
const IMAGES_CDN_DOMAIN = process.env.IMAGES_CDN_DOMAIN as string;

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const MAX_IMAGES = 20;

interface PortfolioItemInput {
  title: string;
  description: string;
  images: string[];
  featured: boolean;
  order: number;
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Same validation shape as create-portfolio-item.ts, duplicated rather than
// shared — each Lambda stays a small, fully self-contained, independently
// readable file (see CLAUDE.md's AWS & Backend Conventions).
function validate(input: unknown): {
  errors: Record<string, string>;
  value: PortfolioItemInput | null;
} {
  const errors: Record<string, string> = {};

  if (typeof input !== "object" || input === null) {
    return { errors: { _body: "Request body must be a JSON object" }, value: null };
  }
  const body = input as Record<string, unknown>;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    errors.title = "Title is required";
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer`;
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`;
  }

  const images: string[] = [];
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      errors.images = "Images must be an array of URLs";
    } else if (body.images.length > MAX_IMAGES) {
      errors.images = `A maximum of ${MAX_IMAGES} images is allowed`;
    } else {
      for (const img of body.images) {
        if (typeof img !== "string" || !img.startsWith(`https://${IMAGES_CDN_DOMAIN}/`)) {
          errors.images =
            "Each image must be a URL uploaded through this app's own upload flow";
          break;
        }
        images.push(img);
      }
    }
  }

  const featured = body.featured === true;

  let order = 0;
  if (body.order !== undefined) {
    if (typeof body.order !== "number" || !Number.isFinite(body.order)) {
      errors.order = "Order must be a number";
    } else {
      order = body.order;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  return { errors: {}, value: { title, description, images, featured, order } };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const id = event.pathParameters?.id;
  if (!id) {
    return jsonResponse(400, { success: false, error: "Missing id path parameter" });
  }

  let parsedBody: unknown;
  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse(400, { success: false, errors: { _body: "Invalid JSON" } });
  }

  const { errors, value } = validate(parsedBody);
  if (!value) {
    return jsonResponse(400, { success: false, errors });
  }

  const item = { id, ...value };

  try {
    // Full-replace, not a partial UpdateItem — simpler expression-free
    // write since the form always submits the complete object. The
    // condition guards against silently upserting a deleted/nonexistent id.
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_exists(id)",
      })
    );
    return jsonResponse(200, { success: true, item });
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return jsonResponse(404, { success: false, error: "Portfolio item not found" });
    }
    console.error("update-portfolio-item failed", {
      id,
      errorName: err instanceof Error ? err.name : "Unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      success: false,
      error: "Failed to update portfolio item",
    });
  }
}
