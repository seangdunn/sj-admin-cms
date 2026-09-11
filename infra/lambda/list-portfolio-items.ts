import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME as string;

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Full Scan + sort in code, no GSI — item counts here are small (dozens,
// not thousands), so this is simpler and cheaper than maintaining an index
// purely to support an ORDER BY. Public route, no auth: nothing in this
// schema is sensitive.
export async function handler(
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await client.send(new ScanCommand({ TableName: TABLE_NAME }));
    const items = (result.Items || []).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    return jsonResponse(200, { success: true, items });
  } catch (err) {
    console.error("list-portfolio-items failed", {
      errorName: err instanceof Error ? err.name : "Unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      success: false,
      error: "Failed to list portfolio items",
    });
  }
}
