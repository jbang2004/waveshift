# 多阶段构建 - 构建阶段
FROM ubuntu:22.04 AS builder

# 设置非交互式安装
ENV DEBIAN_FRONTEND=noninteractive

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# 设置工作目录
WORKDIR /app

# 复制 Rust 项目文件
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 构建 Rust 应用
RUN cargo build --release

# 运行阶段 - Ubuntu原生glibc环境
FROM ubuntu:22.04

# 设置非交互式安装
ENV DEBIAN_FRONTEND=noninteractive

# 安装运行时依赖 - 原生glibc，无兼容层
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 创建工作目录
WORKDIR /app

# 从构建阶段复制编译好的二进制文件
COPY --from=builder /app/target/release/separate-container ./separate-container

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["./separate-container"]