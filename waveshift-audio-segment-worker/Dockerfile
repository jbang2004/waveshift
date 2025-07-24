# 🚀 优化多阶段构建 - Alpine构建环境兼容性优化
# 构建阶段 - Alpine + musl 静态链接
FROM rust:alpine AS builder

# 安装Alpine构建依赖
RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    openssl-libs-static

# 设置工作目录
WORKDIR /app

# 复制 Rust 项目文件
COPY audio-segment-container/Cargo.toml ./
COPY audio-segment-container/src ./src

# 添加musl target并构建静态链接的二进制文件
RUN rustup target add x86_64-unknown-linux-musl
RUN cargo build --release --target x86_64-unknown-linux-musl

# 🎬 运行阶段 - Alpine FFmpeg 轻量级镜像
# 优势: Alpine Linux + FFmpeg，仅106MB，启动更快，更适合云环境
FROM alfg/ffmpeg

# 安装必要的依赖（在Alpine中）
RUN apk add --no-cache ca-certificates

# 创建工作目录
WORKDIR /app

# 从构建阶段复制编译好的二进制文件（musl静态链接）
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/audio-segment-container ./audio-segment-container

# 确保二进制文件可执行
RUN chmod +x ./audio-segment-container

# 验证FFmpeg是否可用并输出版本信息
RUN ffmpeg -buildconf

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# 启动前诊断
RUN echo "🔍 启动前诊断信息:" && \
    echo "📦 镜像架构: Alpine Linux + FFmpeg" && \
    ls -la /app/ && \
    echo "✅ 音频切分容器 (Rust版) 准备就绪"

# 运行应用
CMD ["./audio-segment-container"]