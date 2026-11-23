import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { pool, initializeDatabase } from './db.js';
import { authenticate, allow, asyncRoute } from './middleware.js';
import { getCache,setCache,invalidate } from './cache.js';

const app = express();
app.use(helmet());
app.use(cors({origin:process.env.CLIENT_ORIGIN || 'http://localhost:5173'}));
app.use(express.json({limit:'1mb'}));
const limiter = (max,windowMs) => rateLimit({windowMs,max,standardHeaders:true,legacyHeaders:false});
app.use('/api/auth',limiter(5,15*60*1000));
app.use('/api/testcases',limiter(100,60*60*1000));
app.use('/api/executions',limiter(200,60*60*1000));
app.use('/api/analytics',limiter(50,60*60*1000));

const swagger = {openapi:'3.0.0',info:{title:'Test Management API',version:'1.0.0'},servers:[{url:'http://localhost:5000'}],paths:{
 '/api/auth/login':{post:{summary:'Login and receive JWT',responses:{'200':{description:'JWT token'}}}},
 '/api/projects':{get:{summary:'List projects'},post:{summary:'Create project (admin/test-lead)'}},
 '/api/testcases':{get:{summary:'List/search test cases'},post:{summary:'Create test case (admin/test-lead)'}},
 '/api/executions':{post:{summary:'Record test execution (admin/test-lead/tester)'}},
 '/api/analytics/summary':{get:{summary:'Dashboard analytics'}}
}};
app.use('/api-docs',swaggerUi.serve,swaggerUi.setup(swagger));
app.get('/api/health',(req,res)=>res.json({status:'ok'}));

app.post('/api/auth/register',asyncRoute(async(req,res)=>{
 const schema=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8)});
 const data=schema.parse(req.body);
 const hash=await bcrypt.hash(data.password,12);
 const result=await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'tester') RETURNING id,name,email,role",[data.name,data.email,hash]);
 const user=result.rows[0], token=jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'8h'});
 res.status(201).json({user,token});
}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{
 const {email,password}=req.body;
 const result=await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=$1',[email]);
 const user=result.rows[0];
 if(!user || !(await bcrypt.compare(password || '',user.password_hash))) return res.status(401).json({message:'Invalid email or password'});
 delete user.password_hash;
 const token=jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'8h'});
 res.json({user,token});
}));
app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));

app.get('/api/users',authenticate,allow('admin'),asyncRoute(async(req,res)=>{
 const result=await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY name');
 res.json(result.rows);
}));
app.get('/api/projects',authenticate,asyncRoute(async(req,res)=>{
 const cached=await getCache('projects:list'); if(cached) return res.json(cached);
 const result=await pool.query('SELECT p.*,u.name AS created_by_name FROM projects p LEFT JOIN users u ON u.id=p.created_by ORDER BY p.created_at DESC');
 await setCache('projects:list',result.rows,3600); res.json(result.rows);
}));
app.post('/api/projects',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const s=z.object({name:z.string().min(2),description:z.string().optional(),version:z.string().optional(),status:z.enum(['active','archived']).optional()});
 const d=s.parse(req.body);
 const r=await pool.query('INSERT INTO projects(name,description,version,status,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[d.name,d.description||'',d.version||'1.0',d.status||'active',req.user.id]);
 await invalidate('projects:'); res.status(201).json(r.rows[0]);
}));
app.put('/api/projects/:id',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const {name,description,version,status}=req.body;
 const r=await pool.query('UPDATE projects SET name=$1,description=$2,version=$3,status=$4 WHERE id=$5 RETURNING *',[name,description,version,status,req.params.id]);
 await invalidate('projects:'); res.json(r.rows[0]);
}));

app.get('/api/testcases',authenticate,asyncRoute(async(req,res)=>{
 const {projectId,search,priority,type,page=1,limit=20}=req.query;
 const values=[],where=[];
 if(projectId){values.push(projectId);where.push(`tc.project_id=$${values.length}`)}
 if(search){values.push(`%${search}%`);where.push(`(tc.title ILIKE $${values.length} OR tc.description ILIKE $${values.length})`)}
 if(priority){values.push(priority);where.push(`tc.priority=$${values.length}`)}
 if(type){values.push(type);where.push(`tc.type=$${values.length}`)}
 const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
 const count=await pool.query(`SELECT COUNT(*)::int AS total FROM test_cases tc ${clause}`,values);
 values.push(limit,(Number(page)-1)*Number(limit));
 const r=await pool.query(`SELECT tc.*,p.name AS project_name,u.name AS assignee_name FROM test_cases tc JOIN projects p ON p.id=tc.project_id LEFT JOIN users u ON u.id=tc.assigned_to ${clause} ORDER BY tc.updated_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
 res.json({items:r.rows,total:count.rows[0].total,page:Number(page),limit:Number(limit)});
}));
app.post('/api/testcases',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const s=z.object({project_id:z.coerce.number(),title:z.string().min(2),description:z.string().optional(),priority:z.enum(['Low','Medium','High','Critical']),type:z.string(),preconditions:z.string().optional(),postconditions:z.string().optional(),steps:z.array(z.object({step:z.string(),expected:z.string()})).optional(),tags:z.array(z.string()).optional(),assigned_to:z.coerce.number().optional().nullable()});
 const d=s.parse(req.body);
 const r=await pool.query(`INSERT INTO test_cases(project_id,title,description,priority,type,preconditions,postconditions,steps,tags,created_by,assigned_to)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
 [d.project_id,d.title,d.description||'',d.priority,d.type,d.preconditions||'',d.postconditions||'',JSON.stringify(d.steps||[]),d.tags||[],req.user.id,d.assigned_to||null]);
 await invalidate('analytics:'); res.status(201).json(r.rows[0]);
}));
app.put('/api/testcases/:id',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const {title,description,priority,type,preconditions,postconditions,steps,tags,assigned_to}=req.body;
 const r=await pool.query(`UPDATE test_cases SET title=$1,description=$2,priority=$3,type=$4,preconditions=$5,postconditions=$6,steps=$7,tags=$8,assigned_to=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
 [title,description,priority,type,preconditions,postconditions,JSON.stringify(steps||[]),tags||[],assigned_to||null,req.params.id]);
 await invalidate('analytics:'); res.json(r.rows[0]);
}));
app.delete('/api/testcases/:id',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 await pool.query('DELETE FROM test_cases WHERE id=$1',[req.params.id]); await invalidate('analytics:'); res.status(204).end();
}));

app.get('/api/suites',authenticate,asyncRoute(async(req,res)=>{
 const cached=await getCache('suites:list'); if(cached) return res.json(cached);
 const r=await pool.query(`SELECT s.*,COUNT(sc.test_case_id)::int AS case_count FROM test_suites s LEFT JOIN test_suite_cases sc ON sc.suite_id=s.id GROUP BY s.id ORDER BY s.created_at DESC`);
 await setCache('suites:list',r.rows,1800); res.json(r.rows);
}));
app.post('/api/suites',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const {project_id,name,description}=req.body;
 const r=await pool.query('INSERT INTO test_suites(project_id,name,description,created_by) VALUES($1,$2,$3,$4) RETURNING *',[project_id,name,description||'',req.user.id]);
 await invalidate('suites:'); res.status(201).json(r.rows[0]);
}));
app.post('/api/suites/:id/cases',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 await pool.query('INSERT INTO test_suite_cases(suite_id,test_case_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id,req.body.test_case_id]);
 await invalidate('suites:'); res.status(201).json({message:'Test case added to suite'});
}));
app.delete('/api/suites/:id/cases/:caseId',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 await pool.query('DELETE FROM test_suite_cases WHERE suite_id=$1 AND test_case_id=$2',[req.params.id,req.params.caseId]);
 await invalidate('suites:'); res.status(204).end();
}));

app.post('/api/executions',authenticate,allow('admin','test-lead','tester'),asyncRoute(async(req,res)=>{
 const s=z.object({test_case_id:z.coerce.number(),status:z.enum(['Pass','Fail','Blocked','Skipped']),comment:z.string().optional()});
 const d=s.parse(req.body);
 const r=await pool.query('INSERT INTO test_executions(test_case_id,executed_by,status,comment) VALUES($1,$2,$3,$4) RETURNING *',[d.test_case_id,req.user.id,d.status,d.comment||'']);
 await pool.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,'execution.created','test_execution',r.rows[0].id,JSON.stringify({status:d.status})]);
 await invalidate('analytics:'); res.status(201).json(r.rows[0]);
}));
app.get('/api/executions',authenticate,asyncRoute(async(req,res)=>{
 const r=await pool.query(`SELECT e.*,tc.title AS test_case_title,u.name AS tester_name FROM test_executions e JOIN test_cases tc ON tc.id=e.test_case_id LEFT JOIN users u ON u.id=e.executed_by ORDER BY e.executed_at DESC LIMIT 200`);
 res.json(r.rows);
}));
app.post('/api/defects',authenticate,allow('admin','test-lead','tester'),asyncRoute(async(req,res)=>{
 const {execution_id,title,description,severity='Medium'}=req.body;
 const r=await pool.query('INSERT INTO defects(execution_id,title,description,severity,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[execution_id,title,description||'',severity,req.user.id]);
 res.status(201).json(r.rows[0]);
}));
app.get('/api/analytics/summary',authenticate,asyncRoute(async(req,res)=>{
 const cached=await getCache('analytics:summary'); if(cached) return res.json(cached);
 const [cases,execs,priority,trends,testers,defects]=await Promise.all([
  pool.query('SELECT COUNT(*)::int total FROM test_cases'),
  pool.query("SELECT status,COUNT(*)::int count FROM test_executions GROUP BY status"),
  pool.query('SELECT priority,COUNT(*)::int count FROM test_cases GROUP BY priority'),
  pool.query(`SELECT TO_CHAR(date_trunc('day',executed_at),'Mon DD') day,COUNT(*) FILTER(WHERE status='Pass')::int passed,COUNT(*) FILTER(WHERE status='Fail')::int failed FROM test_executions WHERE executed_at>NOW()-INTERVAL '14 days' GROUP BY date_trunc('day',executed_at) ORDER BY date_trunc('day',executed_at)`),
  pool.query(`SELECT u.name,COUNT(e.id)::int executions,COUNT(e.id) FILTER(WHERE e.status='Pass')::int passed FROM users u LEFT JOIN test_executions e ON e.executed_by=u.id GROUP BY u.id ORDER BY executions DESC LIMIT 8`),
  pool.query("SELECT COUNT(*)::int total FROM defects WHERE status='Open'")
 ]);
 const counts=Object.fromEntries(execs.rows.map(x=>[x.status,x.count]));
 const total=cases.rows[0].total;
 const result={totalCases:total,passed:counts.Pass||0,failed:counts.Fail||0,blocked:counts.Blocked||0,skipped:counts.Skipped||0,pending:Math.max(0,total-Object.values(counts).reduce((a,b)=>a+b,0)),openDefects:defects.rows[0].total,priority:priority.rows,trends:trends.rows,testers:testers.rows};
 await setCache('analytics:summary',result,900); res.json(result);
}));
app.get('/api/audit',authenticate,allow('admin','test-lead'),asyncRoute(async(req,res)=>{
 const r=await pool.query('SELECT a.*,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100'); res.json(r.rows);
}));

app.use((err,req,res,next)=>{
 console.error(err);
 if(err instanceof z.ZodError) return res.status(400).json({message:'Validation failed',errors:err.errors});
 if(err.code==='23505') return res.status(409).json({message:'A record with this value already exists'});
 res.status(500).json({message:'Internal server error'});
});

const port=process.env.PORT||5000;
await initializeDatabase();
app.listen(port,()=>console.log(`API listening on ${port}`));
