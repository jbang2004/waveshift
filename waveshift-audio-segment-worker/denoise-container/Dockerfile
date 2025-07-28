# 🔧 修复版本 - 参考成功的AudioSegment容器配置
FROM python:3.11-alpine

WORKDIR /app

# 安装wget用于健康检查（参考成功的Rust容器）
RUN apk add --no-cache wget ca-certificates

# 只复制最基础的服务器
COPY minimal_server.py .

# 设置环境变量
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 8080

# 🎯 关键修复：使用wget健康检查，而非Python urllib（参考成功容器）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/ || exit 1

# 启动前诊断（参考成功容器）
RUN echo "🔍 Python容器诊断:" && \
    echo "📦 镜像: Python 3.11 Alpine" && \
    echo "🐍 Python版本: $(python --version)" && \
    echo "✅ 极简Python服务器准备就绪"

# 直接运行纯Python服务器
CMD ["python", "minimal_server.py"]