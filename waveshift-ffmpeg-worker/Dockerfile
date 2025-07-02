# 使用最新的FFmpeg镜像 - 更稳定高效的方案
FROM jrottenberg/ffmpeg:7.1-ubuntu2404 AS ffmpeg-base

# Rust构建阶段
FROM rust:1.70 AS rust-builder

WORKDIR /app
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 构建Rust应用
RUN cargo build --release

# 最终运行阶段 - 使用经过验证的Ubuntu基础镜像
FROM ubuntu:22.04

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制FFmpeg二进制
COPY --from=ffmpeg-base /usr/local/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=ffmpeg-base /usr/local/bin/ffprobe /usr/bin/ffprobe

# 复制FFmpeg库
COPY --from=ffmpeg-base /usr/local/lib/ /usr/local/lib/

# 复制Rust应用
COPY --from=rust-builder /app/target/release/separate-container /app/separate-container

# 设置环境变量
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

WORKDIR /app
EXPOSE 8080

CMD ["./separate-container"]