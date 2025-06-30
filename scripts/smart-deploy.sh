#!/bin/bash

# 智能部署脚本 - 只部署有更改的服务

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取上次部署的 commit (保存在文件中)
DEPLOY_STATE_FILE=".last-deploy-state"
CURRENT_COMMIT=$(git rev-parse HEAD)

# 如果是第一次部署或强制全部部署
if [ ! -f "$DEPLOY_STATE_FILE" ] || [ "$1" = "--all" ]; then
    echo -e "${YELLOW}First deployment or --all flag detected. Deploying all services...${NC}"
    LAST_COMMIT=""
else
    LAST_COMMIT=$(cat "$DEPLOY_STATE_FILE")
    echo -e "${GREEN}Detecting changes since last deployment: $LAST_COMMIT${NC}"
fi

# 检测哪些服务有更改
detect_changes() {
    local service=$1
    local path=$2
    
    if [ -z "$LAST_COMMIT" ]; then
        echo "true"
        return
    fi
    
    # 检查该目录下是否有文件变更
    changes=$(git diff --name-only "$LAST_COMMIT" "$CURRENT_COMMIT" -- "$path")
    if [ -n "$changes" ]; then
        echo "true"
    else
        echo "false"
    fi
}

# 部署函数
deploy_service() {
    local service=$1
    local path=$2
    
    echo -e "\n${GREEN}Deploying $service...${NC}"
    cd "$path"
    
    # 根据服务类型选择部署命令
    if [ "$service" = "waveshift-frontend" ]; then
        npm run deploy  # 这会运行 opennextjs-cloudflare build && deploy
    else
        npm run deploy  # 标准 wrangler deploy
    fi
    
    cd - > /dev/null
    echo -e "${GREEN}✓ $service deployed successfully${NC}"
}

# 服务列表和路径
declare -A services=(
    ["waveshift-ffmpeg-worker"]="waveshift-ffmpeg-worker"
    ["waveshift-transcribe-worker"]="waveshift-transcribe-worker"
    ["waveshift-workflow"]="waveshift-workflow"
    ["waveshift-frontend"]="waveshift-frontend"
)

# 部署顺序很重要！
# waveshift-ffmpeg-worker 和 waveshift-transcribe-worker 必须先部署
deployment_order=("waveshift-ffmpeg-worker" "waveshift-transcribe-worker" "waveshift-workflow" "waveshift-frontend")

# 检测并部署有更改的服务
deployed_count=0
declare -A to_deploy

echo -e "${YELLOW}Checking for changes...${NC}"

for service in "${deployment_order[@]}"; do
    path="${services[$service]}"
    has_changes=$(detect_changes "$service" "$path")
    
    if [ "$has_changes" = "true" ]; then
        echo -e "  ${YELLOW}✓${NC} $service has changes"
        to_deploy[$service]="true"
    else
        echo -e "  ${GREEN}○${NC} $service unchanged"
    fi
done

# 特殊情况：如果 Service Binding 接口变更，需要部署相关服务
# 检查 types 目录或接口定义文件
if [ -n "$LAST_COMMIT" ]; then
    interface_changes=$(git diff --name-only "$LAST_COMMIT" "$CURRENT_COMMIT" | grep -E "(types/|interface|binding)" || true)
    if [ -n "$interface_changes" ]; then
        echo -e "\n${YELLOW}Interface changes detected. Deploying all dependent services...${NC}"
        to_deploy["waveshift-workflow"]="true"
        to_deploy["frontend"]="true"
    fi
fi

# 执行部署
echo -e "\n${YELLOW}Starting deployments...${NC}"

for service in "${deployment_order[@]}"; do
    if [ "${to_deploy[$service]}" = "true" ]; then
        deploy_service "$service" "${services[$service]}"
        ((deployed_count++))
    fi
done

# 更新部署状态
echo "$CURRENT_COMMIT" > "$DEPLOY_STATE_FILE"

# 总结
echo -e "\n${GREEN}Deployment complete!${NC}"
echo -e "Deployed $deployed_count service(s)"

# 如果没有服务需要部署
if [ $deployed_count -eq 0 ]; then
    echo -e "${GREEN}No services need deployment. Everything is up to date!${NC}"
fi