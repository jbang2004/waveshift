# 使用最新的FFmpeg镜像 - 更稳定高效的方案
FROM jrottenberg/ffmpeg:7.1-ubuntu2404 AS ffmpeg-base

# Rust构建阶段 - 使用最新稳定版本
FROM rust:1.83 AS rust-builder

WORKDIR /app
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 构建Rust应用
RUN cargo build --release

# 最终运行阶段 - 使用经过验证的Ubuntu基础镜像
FROM ubuntu:22.04

# 安装运行时依赖 - 包含FFmpeg所需的系统库
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    curl \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制FFmpeg二进制
COPY --from=ffmpeg-base /usr/local/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=ffmpeg-base /usr/local/bin/ffprobe /usr/bin/ffprobe

# 复制FFmpeg库
COPY --from=ffmpeg-base /usr/local/lib/ /usr/local/lib/

# 复制Rust应用并设置执行权限
COPY --from=rust-builder /app/target/release/separate-container /app/separate-container
RUN chmod +x /app/separate-container

# 设置环境变量 - 修复LD_LIBRARY_PATH
ENV LD_LIBRARY_PATH=/usr/local/lib:/usr/lib/x86_64-linux-gnu

# 设置工作目录
WORKDIR /app

# 暴露端口
EXPOSE 8080

# 添加健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 启动命令
CMD ["./separate-container"]