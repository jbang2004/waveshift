import { Container } from '@cloudflare/containers';

export class AudioSegmentContainer extends Container {
  override defaultPort = 8080;
  override sleepAfter = '5m'; // 5分钟不活动后休眠

  /**
   * 处理HTTP请求并转发给内部FastAPI应用
   * 🔧 优化：正确处理请求体流和headers过滤
   */
  override async fetch(request: Request): Promise<Response> {
    console.log(`[AudioSegmentContainer] 接收请求: ${request.method} ${request.url}`);
    
    try {
      // 确保容器已启动
      await this.start();
      
      // 构建内部FastAPI应用URL
      const url = new URL(request.url);
      const targetUrl = `http://localhost:${this.defaultPort}${url.pathname}${url.search}`;
      
      console.log(`[AudioSegmentContainer] 转发到FastAPI: ${targetUrl}`);
      
      // 🔧 正确处理请求体：先读取为ArrayBuffer，再创建新的body
      let body: ArrayBuffer | null = null;
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        body = await request.arrayBuffer();
        console.log(`[AudioSegmentContainer] 读取请求体: ${body.byteLength} bytes`);
      }
      
      // 🔧 过滤和清理headers，只保留必要的
      const cleanHeaders = new Headers();
      
      // 保留内容相关的headers
      const allowedHeaders = [
        'content-type', 'content-length', 'content-encoding',
        'x-time-ranges', 'x-segment-id', 'x-speaker', 'x-gap-duration'
      ];
      
      for (const [key, value] of request.headers.entries()) {
        if (allowedHeaders.includes(key.toLowerCase())) {
          cleanHeaders.set(key, value);
        }
      }
      
      // 如果有body，确保设置正确的content-length
      if (body) {
        cleanHeaders.set('content-length', body.byteLength.toString());
      }
      
      // 创建转发请求
      const forwardRequest = new Request(targetUrl, {
        method: request.method,
        headers: cleanHeaders,
        body: body,
      });
      
      console.log(`[AudioSegmentContainer] 转发Headers: ${JSON.stringify(Object.fromEntries(cleanHeaders.entries()))}`);
      
      // 转发给内部FastAPI应用
      const response = await fetch(forwardRequest);
      
      console.log(`[AudioSegmentContainer] FastAPI响应: ${response.status} ${response.statusText}`);
      
      // 如果响应失败，记录更多错误信息
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AudioSegmentContainer] FastAPI错误响应: ${errorText}`);
        
        return new Response(JSON.stringify({
          success: false,
          error: `FastAPI错误: ${response.status} ${response.statusText}`,
          details: errorText
        }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return response;
      
    } catch (error) {
      console.error(`[AudioSegmentContainer] 转发请求失败:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: `Container转发失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}