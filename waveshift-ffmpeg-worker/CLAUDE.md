# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FFmpeg Worker is a Cloudflare Worker service that provides audio-video separation capabilities using FFMPEG in a containerized environment. It's designed to be a reusable microservice that can be consumed by other Workers via Service Binding.

## Architecture

### Components
- **Worker (TypeScript)**: Handles Service Binding API and R2 operations
- **Container (Rust)**: Runs FFMPEG commands for media processing
- **R2 Storage**: Shared bucket for input/output files

### Service API

The worker exposes a `separate()` method via WorkerEntrypoint:

```typescript
async separate(params: {
  inputKey: string;        // R2 key for input file
  audioOutputKey: string;  // R2 key for audio output
  videoOutputKey: string;  // R2 key for video output
}): Promise<{
  audioKey: string;
  videoKey: string;
  audioSize: number;
  videoSize: number;
}>
```

## Development

### Local Development
```bash
# Build and run container
docker build -t ffmpeg-container .
docker run -p 8080:8080 ffmpeg-container

# Run worker (in another terminal)
npm run dev
```

### Deployment
```bash
./deploy.sh  # or npm run deploy
```

## Container Details

### FFMPEG Commands
- **Audio extraction**: `ffmpeg -i input -vn -c:a copy audio.aac`
- **Silent video**: `ffmpeg -i input -an -c:v copy video.mp4`

### Rust Server
- Listens on port 8080
- Handles multipart form data
- Returns multipart response with separated files

## Configuration

### wrangler.jsonc
- Container instances: 3 (load balanced)
- Sleep after: 5 minutes
- R2 bucket: `separate-audio-video`

### Environment Variables
- `CLOUDFLARE_ACCOUNT_ID`: Account ID
- `R2_BUCKET_NAME`: Bucket name

## Usage

This worker is designed to be used via Service Binding:

```typescript
// In consuming worker
const result = await env.FFMPEG_SERVICE.separate({
  inputKey: "uploads/video.mp4",
  audioOutputKey: "audio/output.aac",
  videoOutputKey: "videos/output.mp4"
});
```

## Performance
- Supports files up to 100MB
- Processing time: 30 seconds - 2 minutes
- Container startup: ~5 seconds

## Troubleshooting

### Container Issues
- Ensure Docker is installed and running
- Check FFMPEG is available in container
- Verify port 8080 is not in use

### R2 Issues
- Verify bucket exists and has correct permissions
- Check file keys are valid
- Ensure sufficient storage quota