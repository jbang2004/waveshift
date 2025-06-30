import { NextRequest, NextResponse } from 'next/server';

// AWS v4 签名生成函数（纯 JavaScript 实现，Cloudflare Worker 兼容）
async function generatePresignedUrl(
  accessKeyId: string,
  secretAccessKey: string,
  endpoint: string,
  bucketName: string,
  objectName: string,
  method: string = 'PUT',
  expires: number = 3600,
  region: string = 'auto',
  queryParams: Record<string, string> = {}
): Promise<string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);
  
  const host = new URL(endpoint).host;
  const canonicalUri = `/${bucketName}/${objectName}`;
  
  const baseQueryParams = [
    'X-Amz-Algorithm=AWS4-HMAC-SHA256',
    `X-Amz-Credential=${encodeURIComponent(accessKeyId)}%2F${dateStamp}%2F${region}%2Fs3%2Faws4_request`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expires}`,
    'X-Amz-SignedHeaders=host'
  ];

  // 添加额外的查询参数（如uploadId、partNumber等）
  Object.entries(queryParams).forEach(([key, value]) => {
    baseQueryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });

  const canonicalQuerystring = baseQueryParams.sort().join('&');
  
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, 's3');
  const signature = await hmacSha256Hex(signingKey, stringToSign);
  
  return `${endpoint}/${bucketName}/${objectName}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const signature = await hmacSha256(key, message);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const keyBuffer = new ArrayBuffer(new TextEncoder().encode('AWS4' + key).length);
  new Uint8Array(keyBuffer).set(new TextEncoder().encode('AWS4' + key));
  const kDate = await hmacSha256(keyBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

// 发送S3 API请求的通用函数
async function sendS3Request(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {}
) {
  const requestHeaders = { ...headers };
  if (body) {
    requestHeaders['Content-Type'] = 'application/xml';
  }

  const response = await fetch(url, {
    method,
    body,
    headers: requestHeaders
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('S3 API Error:', responseText);
    throw new Error(`S3 API request failed: ${response.status} ${response.statusText}`);
  }

  return responseText;
}

export async function POST(request: NextRequest) {
  const body = await request.json() as any;
  const { action, objectName, uploadId, partNumber, parts } = body;

  if (!objectName) {
    return NextResponse.json({ error: 'objectName is required' }, { status: 400 });
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  const bucketName = (process.env.R2_BUCKET_NAME || 'videos') as string;
  const endpoint = process.env.R2_ENDPOINT as string;
  const region = process.env.R2_REGION || 'auto';

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return NextResponse.json({ error: 'R2 环境变量未配置完全' }, { status: 500 });
  }

  try {
    switch (action) {
      case 'initiate': {
        // 初始化分块上传
        const initiateUrl = await generatePresignedUrl(
          accessKeyId,
          secretAccessKey,
          endpoint,
          bucketName,
          objectName,
          'POST',
          3600,
          region,
          { uploads: '' }
        );

        const responseXml = await sendS3Request('POST', initiateUrl);
        
        // 解析uploadId
        const uploadIdMatch = responseXml.match(/<UploadId>([^<]+)<\/UploadId>/);
        if (!uploadIdMatch) {
          throw new Error('Failed to parse uploadId from response');
        }

        return NextResponse.json({ 
          uploadId: uploadIdMatch[1],
          success: true 
        });
      }

      case 'getPartUrl': {
        // 获取分块上传的预签名URL
        if (!uploadId || !partNumber) {
          return NextResponse.json({ error: 'uploadId and partNumber are required' }, { status: 400 });
        }

        const partUrl = await generatePresignedUrl(
          accessKeyId,
          secretAccessKey,
          endpoint,
          bucketName,
          objectName,
          'PUT',
          1800, // 30分钟过期时间
          region,
          { 
            uploadId,
            partNumber: partNumber.toString()
          }
        );

        return NextResponse.json({ partUrl });
      }

      case 'complete': {
        // 完成分块上传
        if (!uploadId || !parts) {
          return NextResponse.json({ error: 'uploadId and parts are required' }, { status: 400 });
        }

        const completeUrl = await generatePresignedUrl(
          accessKeyId,
          secretAccessKey,
          endpoint,
          bucketName,
          objectName,
          'POST',
          3600,
          region,
          { uploadId }
        );

        const partsXml = parts.map((part: any) => 
          `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${part.etag}"</ETag></Part>`
        ).join('');

        const completeBody = `<CompleteMultipartUpload>
${partsXml}
</CompleteMultipartUpload>`;

        await sendS3Request('POST', completeUrl, completeBody);

        return NextResponse.json({ success: true });
      }

      case 'abort': {
        // 中止分块上传
        if (!uploadId) {
          return NextResponse.json({ error: 'uploadId is required' }, { status: 400 });
        }

        const abortUrl = await generatePresignedUrl(
          accessKeyId,
          secretAccessKey,
          endpoint,
          bucketName,
          objectName,
          'DELETE',
          3600,
          region,
          { uploadId }
        );

        await sendS3Request('DELETE', abortUrl);

        return NextResponse.json({ success: true });
      }

      default: {
        return NextResponse.json({ 
          error: '不支持的操作类型。请使用分块上传。', 
          supportedActions: ['initiate', 'getPartUrl', 'complete', 'abort']
        }, { status: 400 });
      }
    }
  } catch (err: any) {
    console.error('[S3 API ERROR]', err);
    return NextResponse.json({ 
      error: '分块上传操作失败', 
      details: err.message 
    }, { status: 500 });
  }
} 