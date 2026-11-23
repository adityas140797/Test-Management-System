import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const here = path.dirname(fileURLToPath(import.meta.url));

export async function initializeDatabase() {
  const schema = await fs.readFile(path.join(here, '../database/schema.sql'), 'utf8');
  await pool.query(schema);
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (count.rows[0].count === 0) {
    const hash = await bcrypt.hash('Demo@12345', 10);
    const users = [
      ['Admin User', 'admin@testmanager.com', 'admin'],
      ['Test Lead', 'lead@testmanager.com', 'test-lead'],
      ['Test User', 'tester@testmanager.com', 'tester'],
      ['Read Only', 'viewer@testmanager.com', 'read-only']
    ];
    for (const [name, email, role] of users) {
      await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)', [name,email,hash,role]);
    }
    const admin = await pool.query("SELECT id FROM users WHERE email='admin@testmanager.com'");
    const project = await pool.query(
      "INSERT INTO projects(name,description,version,status,created_by) VALUES('Sample Web Application','Sample project for demonstration','1.0.0','active',$1) RETURNING id",
      [admin.rows[0].id]
    );
    const p = project.rows[0].id;
    const tc = await pool.query(
      `INSERT INTO test_cases(project_id,title,description,priority,type,preconditions,postconditions,steps,tags,created_by)
       VALUES ($1,'Verify successful login','Valid users should be able to sign in','High','Functional','User account exists','Dashboard is displayed',
       '[{"step":"Open login page","expected":"Login form is visible"},{"step":"Enter valid credentials","expected":"User is authenticated"},{"step":"Submit form","expected":"Dashboard is displayed"}]'::jsonb,ARRAY['auth','smoke'],$2) RETURNING id`,
      [p, admin.rows[0].id]
    );
    const suite = await pool.query(
      "INSERT INTO test_suites(project_id,name,description,created_by) VALUES($1,'Smoke Tests','Core smoke test scenarios',$2) RETURNING id",
      [p, admin.rows[0].id]
    );
    await pool.query('INSERT INTO test_suite_cases(suite_id,test_case_id) VALUES($1,$2)', [suite.rows[0].id,tc.rows[0].id]);
  }
}
