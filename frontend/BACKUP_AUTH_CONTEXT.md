# 备选认证重定向方案

如果当前的`window.location.href`方案有任何问题，可以使用以下更优雅的Next.js方案：

## 方案1：强制路由刷新
```typescript
if (isOnAuthPage || callbackUrl) {
  const targetUrl = callbackUrl || '/';
  // 先push到目标页面
  router.push(targetUrl);
  // 然后强制刷新整个应用
  router.refresh();
  // 额外确保状态同步
  setTimeout(() => {
    router.refresh();
  }, 100);
}
```

## 方案2：使用window.location.replace
```typescript
if (isOnAuthPage || callbackUrl) {
  const targetUrl = callbackUrl || '/';
  setTimeout(() => {
    window.location.replace(targetUrl);
  }, 100);
}
```

## 方案3：手动触发重新渲染
```typescript
if (isOnAuthPage || callbackUrl) {
  const targetUrl = callbackUrl || '/';
  router.push(targetUrl);
  // 手动重新触发fetchUser来强制更新状态
  setTimeout(async () => {
    await fetchUser(0);
    router.refresh();
  }, 200);
}
```

当前使用的是最直接的`window.location.href`方案，确保完整的页面重新加载和服务端状态重新解析。