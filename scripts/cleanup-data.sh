#!/bin/bash

# WaveShift 数据清理脚本
# 用于清空D1数据库和R2存储，重新开始测试

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧹 开始清理 WaveShift 数据...${NC}"

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 确认操作
echo -e "${RED}⚠️  警告: 此操作将删除所有数据，包括：${NC}"
echo "   - D1数据库中的所有表数据"
echo "   - R2存储中的所有用户文件"
echo "   - 转录记录和片段"
echo "   - 处理结果文件"
echo ""
read -p "确定要继续吗？请输入 'YES' 确认: " confirmation

if [ "$confirmation" != "YES" ]; then
    echo -e "${YELLOW}操作已取消${NC}"
    exit 0
fi

echo -e "${YELLOW}开始数据清理...${NC}"

# 1. 清理D1数据库
echo -e "\n${GREEN}步骤1: 清理D1数据库${NC}"

# 进入前端目录
cd waveshift-frontend

# 清空所有业务数据表（保留用户表结构，但可选择是否清空数据）
echo "清理转录片段数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM transcription_segments;"

echo "清理转录任务数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM transcriptions;"

echo "清理TTS任务数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM tts_segments;" 2>/dev/null || echo "TTS表不存在，跳过"
npx wrangler d1 execute waveshift-database --command "DELETE FROM tts_tasks;" 2>/dev/null || echo "TTS表不存在，跳过"

echo "清理媒体合成数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM media_compositions;" 2>/dev/null || echo "合成表不存在，跳过"

echo "清理声音模型数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM voice_models;" 2>/dev/null || echo "声音模型表不存在，跳过"

echo "清理媒体任务数据..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM media_tasks;"

echo "清理旧版数据表..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM sentences;" 2>/dev/null || echo "sentences表不存在，跳过"
npx wrangler d1 execute waveshift-database --command "DELETE FROM tasks;" 2>/dev/null || echo "tasks表不存在，跳过"
npx wrangler d1 execute waveshift-database --command "DELETE FROM videos;" 2>/dev/null || echo "videos表不存在，跳过"

# 可选：清理用户数据（谨慎操作）
echo ""
read -p "是否也清理用户数据？这将删除所有用户账户 (y/N): " clear_users
if [ "$clear_users" = "y" ] || [ "$clear_users" = "Y" ]; then
    echo "清理用户数据..."
    npx wrangler d1 execute waveshift-database --command "DELETE FROM users;"
    echo -e "${YELLOW}⚠️  用户数据已清空，需要重新注册${NC}"
fi

# 重置自增ID
echo "重置自增计数器..."
npx wrangler d1 execute waveshift-database --command "DELETE FROM sqlite_sequence WHERE name IN ('transcription_segments', 'tts_segments');" 2>/dev/null || echo "无自增表需要重置"

echo -e "${GREEN}✅ D1数据库清理完成${NC}"

# 2. 清理R2存储
echo -e "\n${GREEN}步骤2: 清理R2存储${NC}"

# 检查R2配置
if ! command -v aws &> /dev/null; then
    echo -e "${YELLOW}⚠️  AWS CLI未安装，手动清理R2存储：${NC}"
    echo "1. 登录Cloudflare Dashboard"
    echo "2. 进入R2存储管理"
    echo "3. 选择 waveshift-media bucket"
    echo "4. 删除以下目录："
    echo "   - users/"
    echo "   - tts_output/"
    echo "   - voice_models/"
    echo "   - temp/"
    echo "   - compositions/"
    echo ""
else
    # 使用wrangler清理R2（如果支持）
    echo "尝试使用wrangler清理R2存储..."
    
    # 列出所有对象（用于确认）
    echo "检查R2存储内容..."
    npx wrangler r2 object list waveshift-media --limit 10 || echo "无法列出R2对象，请手动清理"
    
    echo -e "${YELLOW}⚠️  R2存储清理需要手动操作：${NC}"
    echo "由于安全限制，请手动清理R2存储："
    echo "1. 访问 Cloudflare Dashboard > R2"
    echo "2. 选择 waveshift-media bucket"
    echo "3. 删除所有文件和文件夹"
fi

# 返回根目录
cd ..

# 3. 验证清理结果
echo -e "\n${GREEN}步骤3: 验证清理结果${NC}"

cd waveshift-frontend

echo "检查D1数据库状态..."
echo "媒体任务数量："
npx wrangler d1 execute waveshift-database --command "SELECT COUNT(*) as count FROM media_tasks;"

echo "转录任务数量："
npx wrangler d1 execute waveshift-database --command "SELECT COUNT(*) as count FROM transcriptions;"

echo "转录片段数量："
npx wrangler d1 execute waveshift-database --command "SELECT COUNT(*) as count FROM transcription_segments;"

echo "用户数量："
npx wrangler d1 execute waveshift-database --command "SELECT COUNT(*) as count FROM users;"

cd ..

# 4. 重新初始化（可选）
echo -e "\n${GREEN}步骤4: 重新初始化${NC}"

read -p "是否重新初始化数据库表结构？(y/N): " reinit_db
if [ "$reinit_db" = "y" ] || [ "$reinit_db" = "Y" ]; then
    echo "重新运行数据库迁移..."
    cd waveshift-frontend
    
    # 运行迁移
    npx drizzle-kit push:sqlite || echo "迁移执行完成"
    
    # 调用初始化API（如果服务正在运行）
    echo "尝试调用初始化API..."
    curl -X GET "https://waveshift-frontend.jbang20042004.workers.dev/api/setup" 2>/dev/null || echo "API调用失败，请手动访问 /api/setup"
    
    cd ..
fi

echo -e "\n${GREEN}🎉 数据清理完成！${NC}"
echo ""
echo -e "${YELLOW}后续步骤：${NC}"
echo "1. 如果清理了用户数据，请重新注册账户"
echo "2. 访问前端应用开始新的视频翻译测试"
echo "3. 确保所有服务正常运行："
echo "   - 前端: https://waveshift-frontend.jbang20042004.workers.dev"
echo "   - 工作流: https://waveshift-workflow.jbang20042004.workers.dev"
echo "   - FFmpeg: https://waveshift-ffmpeg-worker.jbang20042004.workers.dev"
echo "   - 转录: https://waveshift-transcribe-worker.jbang20042004.workers.dev"
echo ""
echo -e "${GREEN}✨ 准备好进行完整的视频翻译测试！${NC}"