import { z } from "zod";

const schema = z.object({
  ADMIN_NAME: z.string().trim().min(2),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  ADMIN_PASSWORD: z.string().min(12),
});

export function parseAdminConfig(environment: NodeJS.ProcessEnv) {
  return schema.parse(environment);
}
