#!/bin/bash

# GitHub Actions Docker 部署触发脚本
# 专门用于部署需要 Docker 的服务（如 waveshift-ffmpeg-worker）

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐋 WaveShift Docker 部署助手${NC}"
echo -e "${BLUE}================================${NC}"

# 检查是否在 git 仓库中
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo -e "${RED}❌ 错误：当前不在 git 仓库中${NC}"
    exit 1
fi

# 检查是否有 gh CLI
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ 错误：GitHub CLI (gh) 未安装${NC}"
    echo -e "${YELLOW}安装方法：${NC}"
    echo -e "  macOS: brew install gh"
    echo -e "  Ubuntu: apt install gh"
    echo -e "  Windows: winget install GitHub.cli"
    exit 1
fi

# 检查是否已登录 GitHub
if ! gh auth status >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  需要登录 GitHub CLI${NC}"
    echo -e "运行：${BLUE}gh auth login${NC}"
    exit 1
fi

# 显示可用的部署选项
echo -e "\n${YELLOW}📋 部署选项：${NC}"
echo -e "1. ${GREEN}FFmpeg Worker${NC} - 完整 Docker 构建和部署"
echo -e "2. ${GREEN}所有服务${NC} - 触发完整部署流程"
echo -e "3. ${GREEN}强制重建${NC} - 忽略缓存，重新构建所有内容"

echo -e "\n${YELLOW}请选择部署选项 [1-3]:${NC} "
read -r choice

case $choice in
    1)
        echo -e "\n${GREEN}🚀 触发 FFmpeg Worker Docker 部署...${NC}"
        gh workflow run "Deploy FFmpeg Worker (Docker Required)" --ref main
        ;;
    2)
        echo -e "\n${GREEN}🚀 触发所有服务部署...${NC}"
        gh workflow run "Deploy Changed Services" --ref main -f deploy_all=true
        ;;
    3)
        echo -e "\n${GREEN}🚀 触发强制重建部署...${NC}"
        gh workflow run "Deploy FFmpeg Worker (Docker Required)" --ref main -f force_rebuild=true
        ;;
    *)
        echo -e "${RED}❌ 无效选择${NC}"
        exit 1
        ;;
esac

# 等待一下让 workflow 开始
echo -e "\n${YELLOW}⏳ 等待工作流启动...${NC}"
sleep 3

# 显示工作流状态
echo -e "\n${BLUE}📊 最近的工作流运行：${NC}"
gh run list --limit 5

echo -e "\n${GREEN}✅ 部署请求已提交！${NC}"
echo -e "\n${YELLOW}📝 后续步骤：${NC}"
echo -e "1. 查看部署进度：${BLUE}gh run list${NC}"
echo -e "2. 查看特定运行：${BLUE}gh run view <run-id>${NC}"
echo -e "3. 查看日志：${BLUE}gh run view <run-id> --log${NC}"
echo -e "4. 网页查看：${BLUE}gh run view <run-id> --web${NC}"

echo -e "\n${BLUE}🔗 有用的链接：${NC}"
echo -e "- GitHub Actions: https://github.com/$(gh repo view --json owner,name -q '.owner.login + \"/\" + .name')/actions"
echo -e "- 容器注册表: https://github.com/$(gh repo view --json owner,name -q '.owner.login + \"/\" + .name')/pkgs/container/waveshift-ffmpeg-container"