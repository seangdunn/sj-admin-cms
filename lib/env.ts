function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check .env.local against .env.example.`
    );
  }
  return value;
}

// Next.js inlines NEXT_PUBLIC_* vars at build time only when the literal
// `process.env.NEXT_PUBLIC_X` expression appears in source — keep these as
// direct references, not a dynamic/computed lookup.
export const env = {
  apiUrl: requireEnv("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  userPoolId: requireEnv(
    "NEXT_PUBLIC_USER_POOL_ID",
    process.env.NEXT_PUBLIC_USER_POOL_ID
  ),
  userPoolClientId: requireEnv(
    "NEXT_PUBLIC_USER_POOL_CLIENT_ID",
    process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID
  ),
  awsRegion: requireEnv(
    "NEXT_PUBLIC_AWS_REGION",
    process.env.NEXT_PUBLIC_AWS_REGION
  ),
};
