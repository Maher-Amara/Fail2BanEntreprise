import { z } from "zod";

// ── IP / CIDR ──

const ipv4 = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
  "Invalid IPv4 address"
);

const cidr = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/(?:3[0-2]|[12]?\d))?$/,
  "Invalid IP or CIDR"
);

// ── Agent API ──

export const banSchema = z.object({
  ip: ipv4,
  jail: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  // Optional for agents: server name is derived from API token on the backend.
  server: z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  bantime: z.number().int().min(1).max(31536000).optional(),
});

export const unbanSchema = z.object({
  ip: ipv4,
  jail: z.string().max(64).regex(/^[a-zA-Z0-9_-]*$/).optional(),
});

export const whitelistSchema = z.object({
  ip: cidr,
  action: z.enum(["add", "remove"]).optional(),
});

// ── Auth ──

export const loginSchema = z.object({
  username: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(1).max(128),
});

export const setupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ and - only"),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

// ── Servers ──

export const createServerSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, _, ., - only"),
});

// ── Invitations ──

export const acceptInviteSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ and - only"),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

// ── GeoIP ──

export const geoipQuerySchema = z.object({ ip: ipv4 });

// ── Helper ──

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: messages };
}
