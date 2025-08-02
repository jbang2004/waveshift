#!/usr/bin/env python3
"""
FC降噪服务HTTP服务器
提供HTTP接口供FC调用
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
from .fc_denoise import handler

class DenoiseHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """处理GET请求 - 健康检查"""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'status': 'healthy',
                'service': 'fc-denoise',
                'model': 'ZipEnhancer'
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        """处理POST请求 - 音频降噪"""
        if self.path == '/':
            # 读取请求体
            content_length = int(self.headers.get('Content-Length', 0))
            audio_data = self.rfile.read(content_length)
            
            # 构造FC event
            event = {
                'body': audio_data,
                'isBase64Encoded': False
            }
            
            # 调用handler处理
            try:
                result = handler(event, {})
                
                # 返回响应
                self.send_response(result['statusCode'])
                for key, value in result['headers'].items():
                    self.send_header(key, value)
                self.end_headers()
                
                # 写入音频数据
                if result.get('isBase64Encoded'):
                    import base64
                    self.wfile.write(base64.b64decode(result['body']))
                else:
                    self.wfile.write(result['body'])
                    
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_response = {
                    'error': str(e),
                    'message': '降噪处理失败'
                }
                self.wfile.write(json.dumps(error_response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """启动HTTP服务器"""
    port = int(os.environ.get('FC_SERVER_PORT', '9000'))
    server_address = ('', port)
    
    print(f"🚀 FC降噪服务启动中...")
    print(f"📡 监听端口: {port}")
    
    httpd = HTTPServer(server_address, DenoiseHandler)
    print(f"✅ 服务已启动: http://0.0.0.0:{port}")
    print(f"📊 接口说明:")
    print(f"   GET  /health - 健康检查")
    print(f"   POST /       - 音频降噪")
    
    httpd.serve_forever()

if __name__ == '__main__':
    main()