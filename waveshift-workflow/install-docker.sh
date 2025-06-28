#\!/bin/bash
# Ubuntu/Debian Docker 安装脚本
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

echo "Docker 安装完成，请重新登录或运行 newgrp docker"

