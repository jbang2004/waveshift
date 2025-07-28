use chrono;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Method, Request, Response, Server, StatusCode};
use serde_json::json;
use std::io::Write;
use tempfile::NamedTempFile;
use tokio::fs;
use tokio::process::Command;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

async fn handle_request(req: Request<Body>) -> Result<Response<Body>> {
    match (req.method(), req.uri().path()) {
        (&Method::GET, "/") | (&Method::GET, "/health") => health_check().await,
        (&Method::POST, "/") => process_audio(req).await,
        _ => {
            let mut not_found = Response::default();
            *not_found.status_mut() = StatusCode::NOT_FOUND;
            Ok(not_found)
        }
    }
}

async fn health_check() -> Result<Response<Body>> {
    let response = json!({
        "status": "healthy",
        "service": "audio-segment-container-rust",
        "version": "1.0",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "note": "Rust + Alpine FFmpeg processing engine"
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(response.to_string()))?)
}

async fn process_audio(req: Request<Body>) -> Result<Response<Body>> {
    // 获取请求头参数 - 先提取所有需要的值
    let (time_ranges_str, segment_id, speaker, gap_duration_ms) = {
        let headers = req.headers();
        
        let time_ranges_str = headers
            .get("x-time-ranges")
            .and_then(|v| v.to_str().ok())
            .ok_or("Missing X-Time-Ranges header")?
            .to_string();
        
        let segment_id = headers
            .get("x-segment-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unknown")
            .to_string();
        
        let speaker = headers
            .get("x-speaker")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unknown")
            .to_string();
        
        let gap_duration_ms: i32 = headers
            .get("x-gap-duration")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .unwrap_or(500);
        
        (time_ranges_str, segment_id, speaker, gap_duration_ms)
    };

    println!("🎵 处理音频片段: {}, speaker={}, gap={}ms", segment_id, speaker, gap_duration_ms);

    // 解析时间范围
    let time_ranges: Vec<Vec<i32>> = serde_json::from_str(&time_ranges_str)
        .map_err(|e| format!("Invalid time ranges format: {}", e))?;

    println!("📊 时间范围: {}段", time_ranges.len());

    // 获取音频数据
    let body_bytes = hyper::body::to_bytes(req.into_body()).await?;
    if body_bytes.is_empty() {
        return Ok(Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("Content-Type", "application/json")
            .body(Body::from(json!({"success": false, "error": "No audio data received"}).to_string()))?);
    }

    println!("📥 接收音频数据: {} bytes", body_bytes.len());

    // 执行 FFmpeg 处理
    match execute_ffmpeg_for_ranges(&body_bytes, &time_ranges, gap_duration_ms).await {
        Ok(output_data) => {
            println!("✅ FFmpeg处理完成: 输出 {} bytes", output_data.len());
            
            Ok(Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "audio/wav")
                .header("X-Segment-Id", &segment_id)
                .header("X-Speaker", &speaker)
                .header("X-Processing-Success", "true")
                .body(Body::from(output_data))?)
        }
        Err(e) => {
            eprintln!("❌ FFmpeg处理失败: {}", e);
            Ok(Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "application/json")
                .body(Body::from(json!({"success": false, "error": format!("FFmpeg processing failed: {}", e)}).to_string()))?)
        }
    }
}

async fn execute_ffmpeg_for_ranges(
    audio_data: &[u8],
    time_ranges: &[Vec<i32>],
    gap_duration_ms: i32,
) -> Result<Vec<u8>> {
    // 创建临时输入文件 (指定AAC扩展名帮助FFmpeg识别格式)
    let mut input_file = NamedTempFile::with_suffix(".aac")?;
    input_file.write_all(audio_data)?;
    let input_path = input_file.path();

    // 创建临时输出文件 (指定WAV扩展名以便FFmpeg推断输出格式)
    let output_file = NamedTempFile::with_suffix(".wav")?;
    let output_path = output_file.path();

    let result = if time_ranges.len() == 1 {
        // 🎯 单段处理 - 高性能流复制
        let start_ms = time_ranges[0][0];
        let end_ms = time_ranges[0][1];
        let start_sec = start_ms as f64 / 1000.0;
        let duration_sec = (end_ms - start_ms) as f64 / 1000.0;

        println!("📝 单段FFmpeg: {:.3}s-{:.3}s ({:.3}s)", 
                 start_sec, start_sec + duration_sec, duration_sec);

        Command::new("ffmpeg")
            .args(&[
                "-y",
                "-ss", &format!("{:.3}", start_sec),
                "-i", input_path.to_str().unwrap(),
                "-t", &format!("{:.3}", duration_sec),
                "-ar", "16000",       // 🆕 重采样到16kHz (降噪模型要求)
                "-ac", "1",           // 🆕 转换为单声道 (降噪模型要求)
                "-c:a", "pcm_s16le",  // 明确指定WAV编码格式
                "-f", "wav",          // 明确指定输出格式
                "-avoid_negative_ts", "make_zero",
                output_path.to_str().unwrap(),
            ])
            .output()
            .await?
    } else {
        // 🎵 多段处理 - Gap静音插入
        let mut ffmpeg_cmd = Command::new("ffmpeg");
        ffmpeg_cmd.arg("-y");

        // 为每个音频段添加输入
        for (i, range) in time_ranges.iter().enumerate() {
            let start_ms = range[0];
            let end_ms = range[1];
            let start_sec = start_ms as f64 / 1000.0;
            let duration_sec = (end_ms - start_ms) as f64 / 1000.0;

            ffmpeg_cmd.args(&[
                "-ss", &format!("{:.3}", start_sec),
                "-t", &format!("{:.3}", duration_sec),
                "-i", input_path.to_str().unwrap(),
            ]);

            println!("  段{}: {:.3}s-{:.3}s ({:.3}s)", 
                     i + 1, start_sec, start_sec + duration_sec, duration_sec);
        }

        // 构建filter_complex - Gap静音插入
        let gap_sec = gap_duration_ms as f64 / 1000.0;
        let gap_filter = format!("anullsrc=channel_layout=mono:sample_rate=44100:duration={:.3}", gap_sec);

        // 构建拼接序列：音频1 + gap + 音频2 + gap + 音频3...
        let mut concat_parts = Vec::new();
        for i in 0..time_ranges.len() {
            concat_parts.push(format!("[{}:a]", i));
            if i < time_ranges.len() - 1 {
                concat_parts.push("[gap]".to_string());
            }
        }

        let filter_complex = format!(
            "{}[gap];{}concat=n={}:v=0:a=1[out]",
            gap_filter,
            concat_parts.join(""),
            concat_parts.len()
        );

        println!("🎵 多段处理: {}段 + {}个Gap({:.3}s)", 
                 time_ranges.len(), time_ranges.len() - 1, gap_sec);

        ffmpeg_cmd
            .args(&["-filter_complex", &filter_complex])
            .args(&["-map", "[out]"])
            .args(&["-ar", "16000"])       // 🆕 重采样到16kHz (降噪模型要求)
            .args(&["-ac", "1"])           // 🆕 转换为单声道 (降噪模型要求)
            .args(&["-c:a", "pcm_s16le"])  // 明确指定WAV编码格式
            .args(&["-f", "wav"])          // 明确指定输出格式
            .arg(output_path.to_str().unwrap())
            .output()
            .await?
    };

    // 检查 FFmpeg 执行结果
    if !result.status.success() {
        let error_msg = String::from_utf8_lossy(&result.stderr);
        return Err(format!("FFmpeg failed: {}", error_msg).into());
    }

    // 验证输出文件
    let metadata = fs::metadata(output_path).await?;
    if metadata.len() == 0 {
        return Err("FFmpeg produced empty output file".into());
    }

    // 读取处理后的音频数据
    let output_data = fs::read(output_path).await?;
    println!("🎉 FFmpeg处理成功: 生成 {} bytes", output_data.len());

    Ok(output_data)
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 启动音频切分服务器 (Rust + Alpine)");
    println!("📋 系统信息:");
    println!("  - 监听端口: 8080");
    println!("  - 架构: Rust + Alpine Linux");
    println!("  - 支持端点: / (GET健康检查, POST音频处理)");

    // 检查 FFmpeg 是否可用
    match Command::new("ffmpeg").arg("-version").output().await {
        Ok(output) => {
            if output.status.success() {
                let version_info = String::from_utf8_lossy(&output.stdout);
                let first_line = version_info.lines().next().unwrap_or("未知版本");
                println!("✅ FFmpeg检查通过: {}", first_line);
            } else {
                eprintln!("❌ FFmpeg版本检查失败");
                return Err("FFmpeg不可用".into());
            }
        }
        Err(e) => {
            eprintln!("❌ 无法执行FFmpeg: {}", e);
            return Err("FFmpeg不可执行".into());
        }
    }

    // 创建服务
    let make_svc = make_service_fn(|_conn| async {
        Ok::<_, hyper::Error>(service_fn(handle_request))
    });

    // 绑定地址并启动服务器
    let addr = ([0, 0, 0, 0], 8080).into();

    println!("🔗 尝试绑定地址: {}", addr);

    let server = match Server::try_bind(&addr) {
        Ok(builder) => {
            println!("✅ 地址绑定成功: {}", addr);
            builder.serve(make_svc)
        }
        Err(e) => {
            eprintln!("❌ 地址绑定失败: {}", e);
            return Err(format!("无法绑定端口8080: {}", e).into());
        }
    };

    println!("🎉 音频切分服务器启动成功!");
    println!("📡 等待请求连接...");

    // 启动服务器
    if let Err(e) = server.await {
        eprintln!("❌ 服务器运行错误: {}", e);
        return Err(format!("服务器错误: {}", e).into());
    }

    Ok(())
}