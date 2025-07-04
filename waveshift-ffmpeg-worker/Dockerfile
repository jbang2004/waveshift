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
COPY separate-container/Cargo.toml separate-container/Cargo.lock ./
COPY separate-container/src ./src

# 添加musl target并构建静态链接的二进制文件
RUN rustup target add x86_64-unknown-linux-musl
RUN cargo build --release --target x86_64-unknown-linux-musl --locked

# 🎬 运行阶段 - Alpine FFmpeg 轻量级镜像
# 优势: Alpine Linux + FFmpeg，仅106MB，启动更快，更适合云环境
FROM alfg/ffmpeg

# 安装必要的依赖（在Alpine中）
RUN apk add --no-cache ca-certificates

# 创建工作目录
WORKDIR /app

# 从构建阶段复制编译好的二进制文件（musl静态链接）
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/separate-container ./separate-container

# 确保二进制文件可执行
RUN chmod +x ./separate-container

# 验证FFmpeg是否可用并输出版本信息
RUN ffmpeg -buildconf

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["./separate-container"]