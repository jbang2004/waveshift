use tokio::process::Command;
use std::io::Write;
use tempfile::NamedTempFile;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Method, Request, Response, Server, StatusCode};
use tokio::fs;
use uuid::Uuid;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

async fn handle_request(req: Request<Body>) -> Result<Response<Body>> {
    match (req.method(), req.uri().path()) {
        (&Method::POST, "/") => separate_media(req).await,
        (&Method::GET, "/health") => Ok(Response::new(Body::from("OK"))),
        _ => {
            let mut not_found = Response::default();
            *not_found.status_mut() = StatusCode::NOT_FOUND;
            Ok(not_found)
        }
    }
}

async fn separate_media(req: Request<Body>) -> Result<Response<Body>> {
    println!("开始处理音视频分离请求");
    
    // 获取请求体
    let body_bytes = hyper::body::to_bytes(req.into_body()).await?;
    println!("接收文件大小: {} bytes", body_bytes.len());
    
    // 创建临时文件来保存上传的视频
    let mut input_file = NamedTempFile::new()?;
    input_file.write_all(&body_bytes)?;
    let input_path = input_file.path();
    
    // 生成唯一的文件名 - 使用相对路径更安全
    let uuid = Uuid::new_v4();
    let audio_filename = format!("{}_audio.aac", uuid);
    let video_filename = format!("{}_video.mp4", uuid);
    
    println!("输入文件: {:?}", input_path);
    println!("音频输出: {}", audio_filename);
    println!("视频输出: {}", video_filename);
    
    println!("开始并行音视频分离...");
    
    // 🔥 关键优化：并行执行音频和视频分离
    let audio_future = Command::new("ffmpeg")
        .args(&[
            "-i", input_path.to_str().unwrap(),
            "-vn",      // 不包含视频
            "-c:a", "copy",  // 复制音频流
            "-y",       // 覆盖输出文件
            &audio_filename
        ])
        .output();

    let video_future = Command::new("ffmpeg")
        .args(&[
            "-i", input_path.to_str().unwrap(),
            "-an",      // 不包含音频
            "-c:v", "copy",  // 复制视频流
            "-y",       // 覆盖输出文件
            &video_filename
        ])
        .output();

    // 等待两个任务同时完成 - 这是关键性能提升点
    let (audio_result, video_result) = tokio::try_join!(audio_future, video_future)?;
    
    // 检查音频分离结果
    if !audio_result.status.success() {
        let error_msg = String::from_utf8_lossy(&audio_result.stderr);
        eprintln!("音频分离失败: {}", error_msg);
        return Err(format!("音频分离失败: {}", error_msg).into());
    }
    
    // 检查视频分离结果
    if !video_result.status.success() {
        let error_msg = String::from_utf8_lossy(&video_result.stderr);
        eprintln!("视频分离失败: {}", error_msg);
        return Err(format!("视频分离失败: {}", error_msg).into());
    }
    
    println!("并行处理完成！");
    
    println!("FFMPEG 处理完成");
    
    // 检查输出文件是否存在
    if !std::path::Path::new(&audio_filename).exists() {
        return Err(format!("音频输出文件不存在: {}", audio_filename).into());
    }
    if !std::path::Path::new(&video_filename).exists() {
        return Err(format!("视频输出文件不存在: {}", video_filename).into());
    }
    
    // 读取输出文件
    let audio_data = fs::read(&audio_filename).await?;
    let video_data = fs::read(&video_filename).await?;
    
    println!("音频大小: {} bytes", audio_data.len());
    println!("视频大小: {} bytes", video_data.len());
    
    // 清理临时文件
    let _ = fs::remove_file(&audio_filename).await;
    let _ = fs::remove_file(&video_filename).await;
    
    // 构建 multipart 响应
    let boundary = "----formdata-boundary-1234567890";
    let mut response_body = Vec::new();
    
    // 添加音频文件
    response_body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    response_body.extend_from_slice(b"Content-Disposition: form-data; name=\"audio\"; filename=\"audio.aac\"\r\n");
    response_body.extend_from_slice(b"Content-Type: audio/aac\r\n\r\n");
    response_body.extend_from_slice(&audio_data);
    response_body.extend_from_slice(b"\r\n");
    
    // 添加视频文件
    response_body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    response_body.extend_from_slice(b"Content-Disposition: form-data; name=\"video\"; filename=\"video.mp4\"\r\n");
    response_body.extend_from_slice(b"Content-Type: video/mp4\r\n\r\n");
    response_body.extend_from_slice(&video_data);
    response_body.extend_from_slice(b"\r\n");
    
    // 结束边界
    response_body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
    
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(response_body))?;
    
    println!("并行处理响应发送完成");
    Ok(response)
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("启动 FFMPEG 分离服务器，监听端口 8080");
    
    let make_svc = make_service_fn(|_conn| async {
        Ok::<_, hyper::Error>(service_fn(handle_request))
    });
    
    let addr = ([0, 0, 0, 0], 8080).into();
    let server = Server::bind(&addr).serve(make_svc);
    
    println!("服务器已启动: http://{}", addr);
    
    if let Err(e) = server.await {
        eprintln!("服务器错误: {}", e);
    }
    
    Ok(())
}