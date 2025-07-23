import { Container } from '@cloudflare/containers';

export class AudioSegmentContainer extends Container {
  override defaultPort = 8080;
  override sleepAfter = '5m'; // 5分钟不活动后休眠

  /**
   * 处理HTTP请求并转发给内部FastAPI应用
   */
  override async fetch(request: Request): Promise<Response> {
    console.log(`[AudioSegmentContainer] 接收请求: ${request.method} ${request.url}`);
    
    try {
      // 确保容器已启动
      await this.start();
      
      // 获取内部FastAPI应用的URL
      const containerUrl = new URL(request.url);
      containerUrl.protocol = 'http:';
      containerUrl.hostname = 'localhost';
      containerUrl.port = this.defaultPort.toString();
      
      console.log(`[AudioSegmentContainer] 转发到FastAPI: ${containerUrl.toString()}`);
      
      // 创建转发请求
      const forwardRequest = new Request(containerUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: request.body ? 'half' : undefined
      } as RequestInit);
      
      // 转发给内部FastAPI应用
      const response = await fetch(forwardRequest);
      
      console.log(`[AudioSegmentContainer] FastAPI响应: ${response.status} ${response.statusText}`);
      
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