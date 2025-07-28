# 🔍 极简调试模式 - 定位容器启动失败根因
FROM python:3.11-slim

WORKDIR /app

# 只复制最基础的服务器
COPY minimal_server.py .

# 设置环境变量
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# 直接运行纯Python服务器
CMD ["python", "minimal_server.py"]