#!/usr/bin/env python3
"""
超级简化HTTP服务器 - 纯Python标准库，零依赖
用于验证Python基础环境是否正常
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sys
import os

print(f"[STARTUP] Python {sys.version}")
print(f"[STARTUP] Working dir: {os.getcwd()}")
print(f"[STARTUP] Files: {os.listdir('.')}")

class MinimalHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """处理GET请求"""
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                "status": "healthy",
                "service": "minimal-denoise",
                "python": sys.version.split()[0]
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404)
    
    def do_POST(self):
        """处理POST请求"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"OK - Minimal server working")
    
    def log_message(self, format, *args):
        """自定义日志输出"""
        print(f"[HTTP] {format % args}")

if __name__ == "__main__":
    try:
        print("[STARTUP] Starting minimal HTTP server on port 8080...")
        server = HTTPServer(('0.0.0.0', 8080), MinimalHandler)
        print("[STARTUP] Server ready, listening on 0.0.0.0:8080")
        server.serve_forever()
    except Exception as e:
        print(f"[ERROR] Server failed to start: {e}")
        sys.exit(1)