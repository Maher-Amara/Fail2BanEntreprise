import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";

const DB_PATH = process.env.SQLITE_DB_PATH!;

let db: Database.Database | null = null;

function getDB(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

// ── Schema ──

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'admin',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      token_hash TEXT    NOT NULL UNIQUE,
      owner_id   INTEGER NOT NULL REFERENCES users(id),
      last_seen  TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token      TEXT    NOT NULL UNIQUE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT    NOT NULL,
      used_at    TEXT,
      used_by    INTEGER REFERENCES users(id)
    );
  `);
}

// ── Helpers ──

const SALT_ROUNDS = 12;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateServerToken(): string {
  return `f2b_${randomBytes(24).toString("hex")}`;
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Password Hashing ──

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ══════════════════════════════════════
// USERS
// ══════════════════════════════════════

export interface User {
  id: number;
  username: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface UserRow extends User { password: string; }

export async function createUser(username: string, password: string, role = "admin"): Promise<User> {
  const hash = await hashPassword(password);
  const stmt = getDB().prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
  const result = stmt.run(username, hash, role);
  return { id: result.lastInsertRowid as number, username, role, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export function getUserByUsername(username: string): UserRow | undefined {
  return getDB().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function getUserById(id: number): User | undefined {
  return getDB().prepare("SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getAllUsers(): User[] {
  return getDB().prepare("SELECT id, username, role, created_at, updated_at FROM users ORDER BY id").all() as User[];
}

export function getUserCount(): number {
  return (getDB().prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
}

export function deleteUser(id: number): boolean {
  return getDB().prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

export async function updatePassword(id: number, newPassword: string): Promise<boolean> {
  const hash = await hashPassword(newPassword);
  return getDB().prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hash, id).changes > 0;
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const row = getUserByUsername(username);
  if (!row) return null;
  const valid = await verifyPassword(password, row.password);
  if (!valid) return null;
  return { id: row.id, username: row.username, role: row.role, created_at: row.created_at, updated_at: row.updated_at };
}

export function needsSetup(): boolean {
  return getUserCount() === 0;
}

// ══════════════════════════════════════
// SERVERS
// ══════════════════════════════════════

export interface ServerRecord {
  id: number;
  name: string;
  owner_id: number;
  last_seen: string | null;
  created_at: string;
}

/** Creates a server and returns the plain-text token (only time it's visible). */
export function createServer(name: string, ownerId: number): { server: ServerRecord; token: string } {
  const token = generateServerToken();
  const token_hash = hashToken(token);
  const result = getDB().prepare(
    "INSERT INTO servers (name, token_hash, owner_id) VALUES (?, ?, ?)"
  ).run(name, token_hash, ownerId);
  const server: ServerRecord = {
    id: result.lastInsertRowid as number,
    name,
    owner_id: ownerId,
    last_seen: null,
    created_at: new Date().toISOString(),
  };
  return { server, token };
}

export function getServerByToken(token: string): ServerRecord | undefined {
  const h = hashToken(token);
  return getDB().prepare(
    "SELECT id, name, owner_id, last_seen, created_at FROM servers WHERE token_hash = ?"
  ).get(h) as ServerRecord | undefined;
}

export function getServerById(id: number): ServerRecord | undefined {
  return getDB().prepare(
    "SELECT id, name, owner_id, last_seen, created_at FROM servers WHERE id = ?"
  ).get(id) as ServerRecord | undefined;
}

export function getAllServers(): ServerRecord[] {
  return getDB().prepare(
    "SELECT id, name, owner_id, last_seen, created_at FROM servers ORDER BY id"
  ).all() as ServerRecord[];
}

export function deleteServer(id: number): boolean {
  return getDB().prepare("DELETE FROM servers WHERE id = ?").run(id).changes > 0;
}

/** Rotates the token for a server — returns the new plain-text token. */
export function rotateServerToken(id: number): string | null {
  const token = generateServerToken();
  const token_hash = hashToken(token);
  const result = getDB().prepare(
    "UPDATE servers SET token_hash = ? WHERE id = ?"
  ).run(token_hash, id);
  return result.changes > 0 ? token : null;
}

export function touchServer(id: number): void {
  getDB().prepare("UPDATE servers SET last_seen = datetime('now') WHERE id = ?").run(id);
}

// ══════════════════════════════════════
// INVITATIONS
// ══════════════════════════════════════

export interface Invitation {
  id: number;
  token: string;
  created_by: number;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
}

export function createInvitation(createdBy: number, ttlHours = 72): Invitation {
  const token = generateInviteToken();
  const expires_at = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
  const result = getDB().prepare(
    "INSERT INTO invitations (token, created_by, expires_at) VALUES (?, ?, ?)"
  ).run(token, createdBy, expires_at);
  return { id: result.lastInsertRowid as number, token, created_by: createdBy, expires_at, used_at: null, used_by: null };
}

export function getInvitationByToken(token: string): Invitation | undefined {
  return getDB().prepare("SELECT * FROM invitations WHERE token = ?").get(token) as Invitation | undefined;
}

export function getAllInvitations(): Invitation[] {
  return getDB().prepare("SELECT * FROM invitations ORDER BY id DESC").all() as Invitation[];
}

export function markInvitationUsed(id: number, userId: number): void {
  getDB().prepare(
    "UPDATE invitations SET used_at = datetime('now'), used_by = ? WHERE id = ?"
  ).run(userId, id);
}

export function revokeInvitation(id: number): boolean {
  return getDB().prepare("DELETE FROM invitations WHERE id = ? AND used_at IS NULL").run(id).changes > 0;
}

export function isInvitationValid(inv: Invitation): boolean {
  return inv.used_at === null && new Date(inv.expires_at) > new Date();
}
