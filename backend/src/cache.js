import Redis from 'ioredis';
let redis;
try {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect:true, maxRetriesPerRequest:1, retryStrategy:()=>null });
  redis.on('error',()=>{});
  await redis.connect().catch(()=>{});
} catch { redis = null; }
export async function getCache(key) {
  if (!redis || redis.status !== 'ready') return null;
  try { const value = await redis.get(key); return value ? JSON.parse(value) : null; } catch { return null; }
}
export async function setCache(key,value,ttl) {
  if (!redis || redis.status !== 'ready') return;
  try { await redis.set(key,JSON.stringify(value),'EX',ttl); } catch {}
}
export async function invalidate(prefix) {
  if (!redis || redis.status !== 'ready') return;
  try { const keys = await redis.keys(`${prefix}*`); if(keys.length) await redis.del(keys); } catch {}
}
