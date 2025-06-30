import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // 基础配置，暂不启用R2缓存
  // 如需启用R2增量缓存，可取消注释下面的配置
  // incrementalCache: r2IncrementalCache,
}); 