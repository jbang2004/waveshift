# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WaveShift is a microservices-based media processing workflow platform that runs on Cloudflare's edge network. The project is split into three independent services:

### Architecture Components:
1. **waveshift-workflow**: Main workflow orchestration service
   - Business logic and API routing
   - Workflow management using Cloudflare Workflows
   - D1 database for transcription results
   - Frontend serving via static assets

2. **ffmpeg-worker**: Audio-video separation service
   - FFMPEG container for media processing
   - R2 storage operations
   - Service Binding API for other workers

3. **gemini-transcribe-worker**: AI transcription service (external)
   - Gemini API integration
   - Audio transcription and translation

## Development Commands

### WaveShift Workflow Development
```bash
cd waveshift-workflow
npm run dev           # Start development server (http://localhost:8787)
npm run deploy        # Deploy to Cloudflare
npm run cf-typegen    # Generate TypeScript types from wrangler.jsonc
```

### FFmpeg Worker Development
```bash
cd ffmpeg-worker

# Development with local container
docker build -t ffmpeg-container .
docker run -p 8080:8080 ffmpeg-container

# Deploy
npm run deploy        # Builds container and deploys worker
```

### Complete Deployment
```bash
# Deploy all services in correct order
./deploy-all.sh
```

## Microservices Architecture

### Service Communication Flow
```
User Upload → waveshift-workflow
                ├─→ ffmpeg-worker (via Service Binding)
                │     └─→ R2 Storage
                └─→ gemini-transcribe-worker (via Service Binding)
                      └─→ Transcription Results → D1 Database
```

### Service Responsibilities

**waveshift-workflow**:
- User interface and API endpoints
- Business logic and validation
- Workflow orchestration
- URL generation and lifecycle management
- D1 database operations

**ffmpeg-worker**:
- R2 file read/write operations
- FFMPEG processing (audio/video separation)
- Container management
- Performance optimization

**gemini-transcribe-worker**:
- AI transcription using Gemini API
- Language detection and translation
- Streaming response handling

### Key Components

**waveshift-workflow**:
- `src/index.ts`: Main API routes
- `src/workflows/sep-trans.ts`: Separation + transcription workflow
- `src/types/env.d.ts`: TypeScript type definitions
- `src/utils/database.ts`: D1 database operations
- `public/index.html`: Frontend UI

**ffmpeg-worker**:
- `src/index.ts`: WorkerEntrypoint with separate() method
- `src/container.ts`: FFmpegContainer class
- `src/types.ts`: Service interface definitions
- `separate-container/src/main.rs`: Rust FFMPEG server

## Service Binding Interfaces

### FFmpeg Service
```typescript
interface FFmpegService {
  separate(params: {
    inputKey: string;
    audioOutputKey: string;
    videoOutputKey: string;
  }): Promise<{
    audioKey: string;
    videoKey: string;
    audioSize: number;
    videoSize: number;
  }>;
}
```

### Transcribe Service
Standard Fetcher interface with endpoints:
- `POST /transcribe`: Transcribe audio file
- `GET /health`: Health check

## Configuration

### Environment Variables
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `R2_BUCKET_NAME`: R2 bucket for media storage
- `R2_PUBLIC_DOMAIN`: Public domain for R2 access

### Service Bindings
```jsonc
// waveshift-workflow/wrangler.jsonc
"services": [
  {
    "binding": "FFMPEG_SERVICE",
    "service": "ffmpeg-worker",
    "environment": "production"
  },
  {
    "binding": "TRANSCRIBE_SERVICE", 
    "service": "gemini-transcribe-worker",
    "environment": "production"
  }
]
```

### R2 Storage
Both `waveshift-workflow` and `ffmpeg-worker` share the same R2 bucket:
- Bucket name: `separate-audio-video`
- File structure:
  - Videos: `videos/{uuid}-silent.mp4`
  - Audio: `audio/{uuid}-audio.aac`

## Deployment Strategy

### Deployment Order (Important!)
1. **ffmpeg-worker** must be deployed first
2. **waveshift-workflow** depends on ffmpeg-worker
3. **gemini-transcribe-worker** can be deployed independently

### Deployment Commands
```bash
# Option 1: Deploy all services
./deploy-all.sh

# Option 2: Deploy individually
cd ffmpeg-worker && ./deploy.sh
cd waveshift-workflow && ./deploy.sh
```

## Performance Characteristics
- **File Size Limit**: 100MB (frontend enforced)
- **Processing Time**: 30 seconds - 2 minutes for separation
- **Transcription Time**: 2-10 minutes (depends on audio length)
- **Container Instances**: 3 (load balanced)
- **Container Sleep**: After 5 minutes of inactivity

## Security Considerations
- Service Bindings provide secure worker-to-worker communication
- No public exposure of internal services
- Filename sanitization in all services
- Temporary file cleanup in containers
- Input validation at API boundaries

## Troubleshooting

### Common Issues
1. **Service Binding failures**: Ensure ffmpeg-worker is deployed first
2. **R2 permission errors**: Check bucket configuration in both workers
3. **Container timeouts**: Verify Docker and FFMPEG installation
4. **D1 errors**: Ensure database is created and schema initialized

### Debug Commands
```bash
# Check workflow status
wrangler tail waveshift-workflow

# Check container logs
wrangler tail ffmpeg-worker

# Test Service Bindings
curl https://waveshift-workflow.YOUR_SUBDOMAIN.workers.dev/api
```

## Migration Notes

This project was refactored from a monolithic architecture to microservices:
- **Before**: Single worker with embedded container
- **After**: Three specialized services with clear boundaries
- **Benefits**: Better scalability, maintainability, and reusability