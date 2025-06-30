/**
 * 通用的 EventSource (SSE) Hook
 * 提供可复用的 Server-Sent Events 连接管理
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseEventSourceOptions {
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onOpen?: (event: Event) => void;
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface UseEventSourceReturn {
  isConnected: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  lastMessage: any;
}

export function useEventSource(
  url: string | null,
  options: UseEventSourceOptions = {}
): UseEventSourceReturn {
  const {
    onMessage,
    onError,
    onOpen,
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastMessage, setLastMessage] = useState<any>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理重连定时器
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setIsConnected(false);
    setError(null);
    reconnectCountRef.current = 0;
  }, [clearReconnectTimeout]);

  // 连接到 EventSource
  const connect = useCallback(() => {
    if (!url) return;
    
    // 如果已经连接，先断开
    if (eventSourceRef.current) {
      disconnect();
    }

    try {
      const es = new EventSource(url);

      es.onopen = (event) => {
        setIsConnected(true);
        setError(null);
        reconnectCountRef.current = 0;
        onOpen?.(event);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
          setError(new Error('Failed to parse server message'));
        }
      };

      es.onerror = (event) => {
        setIsConnected(false);
        setError(new Error('EventSource connection error'));
        onError?.(event);

        // 自动重连逻辑
        if (reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect (${reconnectCountRef.current}/${maxReconnectAttempts})...`);
            connect();
          }, reconnectDelay);
        } else {
          console.error('Max reconnection attempts reached');
          disconnect();
        }
      };

      eventSourceRef.current = es;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to create EventSource');
      setError(errorObj);
      console.error('EventSource creation failed:', errorObj);
    }
  }, [url, onMessage, onError, onOpen, disconnect, reconnectDelay, maxReconnectAttempts]);

  // 重连
  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    connect();
  }, [connect]);

  // 自动连接
  useEffect(() => {
    if (autoConnect && url) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [url, autoConnect, connect, disconnect]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    reconnect,
    lastMessage,
  };
}

/**
 * 专用于任务状态监听的 EventSource Hook
 */
export function useTaskStatusEventSource(
  taskId: string | null,
  onStatusUpdate?: (status: any) => void
) {
  const url = taskId ? `/api/workflow/${taskId}/status` : null;
  
  return useEventSource(url, {
    onMessage: onStatusUpdate,
    onError: (error) => {
      console.error('Task status SSE error:', error);
    },
    autoConnect: !!taskId,
    reconnectDelay: 2000,
    maxReconnectAttempts: 3,
  });
}