# 🔥 优化的FFmpeg容器 - 修复启动崩溃问题
# 直接使用包含所有依赖的FFmpeg镜像作为基础
FROM jrottenberg/ffmpeg:7.1-ubuntu2404 AS runtime-base

# 安装Rust和构建工具
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    file \
    libc-bin \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . ~/.cargo/env \
    && rm -rf /var/lib/apt/lists/*

# 设置Rust环境
ENV PATH="/root/.cargo/bin:${PATH}"

# 复制源代码到容器
WORKDIR /app
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 构建Rust应用
RUN . ~/.cargo/env && cargo build --release

# 设置执行权限
RUN chmod +x /app/target/release/separate-container

# 创建软链接到 /app 目录
RUN ln -sf /app/target/release/separate-container /app/separate-container

# 验证FFmpeg可用性
RUN ffmpeg -version && ffprobe -version

# 验证Rust应用可执行
RUN file /app/separate-container || echo "file命令不可用，跳过文件类型检查" \
    && ldd /app/separate-container || echo "ldd命令不可用，跳过依赖检查"

# 设置工作目录
WORKDIR /app

# 暴露端口
EXPOSE 8080

# 添加启动脚本进行调试
RUN echo '#!/bin/bash\n\
echo "🚀 Container启动调试信息"\n\
echo "当前目录: $(pwd)"\n\
echo "文件列表: $(ls -la)"\n\
echo "FFmpeg版本: $(ffmpeg -version | head -1)"\n\
echo "端口检查: $(netstat -tlnp 2>/dev/null | grep :8080 || echo \"端口8080未占用\")"\n\
echo "启动Rust应用..."\n\
exec "./separate-container"\n' > /app/start.sh && chmod +x /app/start.sh

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 使用启动脚本
CMD ["/app/start.sh"]