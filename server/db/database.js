/**
 * HavenDesk Multi-Tenant SQLite Database Manager
 * Uses Node's high-performance native DatabaseSync.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_FILE || path.join(__dirname, 'havendesk.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

class DatabaseManager {
  constructor(filePath = DB_PATH) {
    this.filePath = filePath;
    this.db = null;
    this.init();
  }

  init() {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.filePath);
    
    // Enable WAL mode & foreign keys for high performance
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);

    // Run schema
    this.runSchema();
  }

  runSchema() {
    if (fs.existsSync(SCHEMA_PATH)) {
      const sql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
      this.db.exec(sql);
    }
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const db = new DatabaseManager();
export default db;
