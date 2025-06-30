import { NextRequest, NextResponse } from 'next/server';
import { createDb } from '@/db/drizzle';
import { tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';

function getDb() {
  if (typeof globalThis.process === 'undefined') {
    // @ts-expect-error - Cloudflare Workers global variables
    return createDb(globalThis.DB || globalThis.env?.DB);
  }
  return createDb({} as any);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const payload = await verifyAuth(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;
    const db = getDb();
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.taskId, taskId),
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Get task status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 