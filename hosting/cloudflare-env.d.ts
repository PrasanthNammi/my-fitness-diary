declare namespace Cloudflare {
  interface Env {
    MFD_MCP_WRITES?: string;
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
