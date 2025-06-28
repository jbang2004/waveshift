# WaveShift - Microservices Media Processing Platform

WaveShift is a modern, microservices-based media processing platform built on Cloudflare's edge network. It provides audio-video separation and AI-powered transcription services through a clean, modular architecture.

## 🏗️ Architecture

The platform consists of three independent services:

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│ waveshift-workflow  │────▶│  ffmpeg-worker   │     │ gemini-transcribe-worker│
│                     │     │                  │     │                         │
│ • Business Logic    │     │ • FFMPEG Process │     │ • AI Transcription      │
│ • API Routes        │     │ • R2 Storage     │     │ • Gemini API            │
│ • Workflow Mgmt     │     │ • Container Mgmt │     │ • Translation           │
│ • Frontend UI       │     │                  │     │                         │
└─────────────────────┘     └──────────────────┘     └─────────────────────────┘
         │                           │                            │
         └───────────────────────────┴────────────────────────────┘
                              Service Bindings
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Cloudflare account with Workers enabled
- Docker (for ffmpeg-worker development)
- Wrangler CLI (`npm install -g wrangler`)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd waveshift
```

2. Install dependencies for all services:
```bash
cd waveshift-workflow && npm install
cd ../ffmpeg-worker && npm install
cd ../gemini-transcribe-worker && npm install
```

3. Configure environment variables:
```bash
export CLOUDFLARE_API_TOKEN=your-api-token
export CLOUDFLARE_ACCOUNT_ID=your-account-id
```

### Deployment

Deploy all services with one command:
```bash
./deploy-all.sh
```

Or deploy individually:
```bash
cd ffmpeg-worker && npm run deploy
cd waveshift-workflow && npm run deploy
```

## 📦 Services

### waveshift-workflow
Main orchestration service that handles:
- User interface and API endpoints
- Business logic and validation
- Workflow coordination
- Database operations

### ffmpeg-worker
Media processing service that provides:
- Audio-video separation using FFMPEG
- R2 storage operations
- Container-based processing
- Service Binding API

### gemini-transcribe-worker
AI transcription service offering:
- Audio transcription
- Multi-language support
- Translation capabilities
- Streaming responses

## 🛠️ Development

### Local Development

1. **FFmpeg Worker** (requires Docker):
```bash
cd ffmpeg-worker
docker build -t ffmpeg-container .
docker run -p 8080:8080 ffmpeg-container
npm run dev  # In another terminal
```

2. **WaveShift Workflow**:
```bash
cd waveshift-workflow
npm run dev
# Visit http://localhost:8787
```

### API Endpoints

**WaveShift Workflow**:
- `POST /process` - Upload and process media file
- `GET /status/:id` - Check processing status
- `GET /result/:id` - Get processing results
- `GET /api` - API documentation

## 🔧 Configuration

### Service Bindings
Configure in `waveshift-workflow/wrangler.jsonc`:
```jsonc
"services": [
  {
    "binding": "FFMPEG_SERVICE",
    "service": "ffmpeg-worker"
  },
  {
    "binding": "TRANSCRIBE_SERVICE",
    "service": "gemini-transcribe-worker"
  }
]
```

### R2 Storage
Both services share the same R2 bucket for seamless file access.

### D1 Database
Transcription results are stored in Cloudflare D1 for fast retrieval.

## 📊 Performance

- **File Size Limit**: 100MB
- **Processing Time**: 30s - 2min (separation), 2-10min (transcription)
- **Concurrency**: 3 container instances (load balanced)
- **Auto-sleep**: Containers sleep after 5 minutes of inactivity

## 🔒 Security

- Service Bindings ensure secure inter-service communication
- No public exposure of internal services
- Input validation at all boundaries
- Automatic cleanup of temporary files

## 🐛 Troubleshooting

### Common Issues

1. **Service Binding Errors**
   - Ensure ffmpeg-worker is deployed before waveshift-workflow
   - Verify service names match in configuration

2. **Container Startup Issues**
   - Check Docker is running
   - Verify FFMPEG is installed in container
   - Ensure port 8080 is available

3. **R2 Permission Errors**
   - Verify bucket exists
   - Check API credentials
   - Ensure both services use the same bucket

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 🙏 Acknowledgments

- Built on [Cloudflare Workers](https://workers.cloudflare.com/)
- Uses [FFMPEG](https://ffmpeg.org/) for media processing
- Powered by [Google Gemini](https://ai.google.dev/) for transcription