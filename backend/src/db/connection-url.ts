export function runtimeDatabaseUrl(connectionString: string, serverless: boolean): URL {
  const url = new URL(connectionString);
  // Supabase session pooling pins a database connection to every serverless client.
  if (serverless && url.hostname.endsWith('.pooler.supabase.com') && (!url.port || url.port === '5432')) url.port = '6543';
  return url;
}
