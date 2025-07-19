import { Container } from '@cloudflare/containers';

export class AudioSegmentContainer extends Container {
  override defaultPort = 8080;
  override sleepAfter = '5m'; // 5分钟不活动后休眠
}