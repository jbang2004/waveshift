# Separate Worker - Audio Video Separator & Transcription

🎵 **Separate audio and video tracks from your media files with automatic transcription.**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/separate-worker)

Separate Worker is a powerful, web-based tool for separating audio and video tracks from uploaded media files with integrated automatic transcription using Gemini AI. It combines a sleek, responsive frontend with a robust, containerized Rust backend, all running on Cloudflare's edge network with R2 storage and Workflows for high performance and scalability.

---

## Features

- **High-Quality Audio-Video Separation**: Uses FFMPEG to cleanly separate audio and video tracks while maintaining quality.
- **Automatic Transcription**: AI-powered transcription using Gemini API via Cloudflare Workflows
- **Multiple Output Formats**:
  - **Silent Video**: MP4 format with video track only (audio removed)
  - **Audio Track**: High-quality MP3 extraction with VBR encoding
  - **Transcription Text**: Complete transcription with timestamps
- **Video Trimming**: An intuitive slider UI to select the exact start and end times for processing.
- **Cloud Storage**: Processed files are automatically uploaded to Cloudflare R2 for fast, global access.
- **Real-time Progress**: Live status updates for both separation and transcription
- **Direct Playback**: Built-in video and audio players for immediate preview and playback.
- **Modern Frontend**: A responsive, mobile-friendly interface with cyberpunk-inspired design built with Tailwind CSS.
- **Edge-Powered**: Deployed on Cloudflare's network, using Workers, Containers, and Workflows for processing, ensuring low-latency access for users globally.

---

## Architecture

Separate Worker uses a modern serverless architecture with five main components:

1.  **Frontend Application**: A static single-page application built with HTML, Tailwind CSS, and JavaScript. This is the user interface where videos are uploaded and conversion options are configured.

2.  **Cloudflare Worker (`src/index.ts`)**: The main entry point that serves the frontend and orchestrates the entire pipeline. It uses Durable Objects to manage containers and Workflows for transcription.

3.  **Backend Container (`Dockerfile`, `separate-container/src/main.rs`)**: A multi-threaded Rust Actix Web server running inside a Docker container. Uses FFMPEG to separate audio and video tracks and uploads results to R2.

4.  **Transcription Workflow**: An automated Cloudflare Workflow that calls the Gemini transcription service and stores results in D1 database.

5.  **Service Integration**: Service Bindings provide zero-latency communication with the `gemini-transcribe-worker` for AI-powered transcription.

---

## Local Development

You can run the entire application stack locally for development and testing.

### Prerequisites

- [Node.js](https://nodejs.org/) and `npm`.
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/): Must be running on your machine.
- [Rust Toolchain](https://www.rust-lang.org/tools/install): Install via `rustup`.

### Running the Application

To run the full application, you need to run the backend container and the Cloudflare Worker simultaneously.

**Step 1: Run the Backend Container**

First, build and run the Docker container which houses the Rust API.

```bash
# 1. Build the Docker image
docker build -t separate-container .

# 2. Run the container and map port 8080
docker run -p 8080:8080 separate-container
```

The Rust server will now be running and accessible on `http://localhost:8080`.

**Step 2: Run the Cloudflare Worker**

The provided Worker script is configured to proxy requests to your local container when running in development mode.

In a **new terminal window**, start the Wrangler development server:

```bash
npx wrangler dev
```

You can now access the Separate Worker frontend application at `http://localhost:8787`. All API requests from the frontend will be automatically proxied by Wrangler to your running Docker container.

---

## Deployment to Cloudflare

Deploying Separate Worker to your Cloudflare account is straightforward with GitHub Actions or Wrangler.

1.  **Login to Wrangler:**

    ```bash
    npx wrangler login
    ```

2.  **Deploy the application:**
    ```bash
    npx wrangler deploy
    ```

When you run `wrangler deploy`, Wrangler will:

- Build your container image using Docker.
- Push the image to your private Cloudflare Container Registry.
- Deploy your Worker script.
- Create a Container binding, allowing the Worker to send requests to your container instances.

Your application will be live at the URL provided in the deployment output.

---
# Trigger deployment
# Re-trigger deployment with updated token permissions
