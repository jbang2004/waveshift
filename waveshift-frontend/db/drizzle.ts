import { drizzle } from 'drizzle-orm/d1';
import * as schema from './index';

// 这个函数会在运行时访问 Cloudflare 的 env.DB
export function createDb(d1: any) {
  return drizzle(d1, { schema });
}

// 类型导出，供其他文件使用
export type Database = ReturnType<typeof createDb>;
export { schema }; 