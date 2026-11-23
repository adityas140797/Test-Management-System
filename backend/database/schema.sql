CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'tester'
 CHECK(role IN ('admin','test-lead','tester','read-only')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS projects (
 id SERIAL PRIMARY KEY, name VARCHAR(160) NOT NULL, description TEXT,
 version VARCHAR(40), status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS project_members (
 project_id INT REFERENCES projects(id) ON DELETE CASCADE,
 user_id INT REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(project_id,user_id)
);
CREATE TABLE IF NOT EXISTS test_cases (
 id SERIAL PRIMARY KEY, project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title VARCHAR(240) NOT NULL, description TEXT, priority VARCHAR(20) NOT NULL DEFAULT 'Medium'
 CHECK(priority IN ('Low','Medium','High','Critical')),
 type VARCHAR(30) NOT NULL DEFAULT 'Functional',
 preconditions TEXT, postconditions TEXT, steps JSONB NOT NULL DEFAULT '[]'::jsonb,
 tags TEXT[] DEFAULT '{}', created_by INT REFERENCES users(id),
 assigned_to INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_suites (
 id SERIAL PRIMARY KEY, project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name VARCHAR(180) NOT NULL, description TEXT, created_by INT REFERENCES users(id),
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_suite_cases (
 suite_id INT REFERENCES test_suites(id) ON DELETE CASCADE,
 test_case_id INT REFERENCES test_cases(id) ON DELETE CASCADE,
 PRIMARY KEY(suite_id,test_case_id)
);
CREATE TABLE IF NOT EXISTS test_executions (
 id SERIAL PRIMARY KEY, test_case_id INT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
 executed_by INT REFERENCES users(id), status VARCHAR(20) NOT NULL
 CHECK(status IN ('Pass','Fail','Blocked','Skipped')),
 comment TEXT, executed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_execution_steps (
 id SERIAL PRIMARY KEY, execution_id INT REFERENCES test_executions(id) ON DELETE CASCADE,
 step_number INT NOT NULL, actual_result TEXT, status VARCHAR(20)
);
CREATE TABLE IF NOT EXISTS defects (
 id SERIAL PRIMARY KEY, execution_id INT REFERENCES test_executions(id) ON DELETE CASCADE,
 title VARCHAR(240) NOT NULL, description TEXT, severity VARCHAR(20) DEFAULT 'Medium',
 status VARCHAR(20) DEFAULT 'Open', created_by INT REFERENCES users(id),
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGSERIAL PRIMARY KEY, user_id INT REFERENCES users(id), action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(60), entity_id INT, details JSONB DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_priority ON test_cases(priority);
CREATE INDEX IF NOT EXISTS idx_test_cases_type ON test_cases(type);
CREATE INDEX IF NOT EXISTS idx_executions_case_date ON test_executions(test_case_id,executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON test_executions(status);
CREATE INDEX IF NOT EXISTS idx_suites_project ON test_suites(project_id);
