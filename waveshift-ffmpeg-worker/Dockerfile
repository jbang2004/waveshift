# 🚀 优化多阶段构建 - 基于 jrottenberg/ffmpeg:7.1-ubuntu2404
# 构建阶段 - 轻量级Ubuntu构建环境
FROM ubuntu:24.04 AS builder

# 设置非交互式安装
ENV DEBIAN_FRONTEND=noninteractive

# 安装构建依赖 - 最小化构建工具
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 安装 Rust - 网络优化版本
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# 设置工作目录
WORKDIR /app

# 复制 Rust 项目文件
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 构建 Rust 应用 - Release优化
RUN cargo build --release --locked

# 🎬 运行阶段 - jrottenberg FFmpeg 7.1 专用镜像
# 优势: 预编译FFmpeg 7.1, 性能优化, 启动更快
FROM jrottenberg/ffmpeg:7.1-ubuntu2404

# 创建工作目录
WORKDIR /app

# 从构建阶段复制编译好的二进制文件
COPY --from=builder /app/target/release/separate-container ./separate-container

# 确保二进制文件可执行
RUN chmod +x ./separate-container

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["./separate-container"]