import { Pool } from "pg";
import type { Logger } from "./logger.js";
import type { HubRow } from "./types.js";

const HUB_SID_RE = /^[A-Za-z0-9]{7}$/;

export class ReticulumHubRepository {
  private readonly pool: Pool;

  constructor(
    connectionString: string,
    private readonly hubsQuery: string,
    private readonly logger: Logger,
  ) {
    this.pool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
    });
  }

  async listPublicHubSids(): Promise<string[]> {
    const result = await this.pool.query<HubRow>(this.hubsQuery);
    const hubIds = new Set<string>();

    for (const row of result.rows) {
      const candidate = row.hub_sid ?? row.hub_id ?? row.sid;
      if (!candidate || !HUB_SID_RE.test(candidate)) {
        this.logger.warn(
          { hub_id: candidate ?? null },
          "skipping invalid hub id from reticulum db",
        );
        continue;
      }
      hubIds.add(candidate);
    }

    return [...hubIds].sort();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
