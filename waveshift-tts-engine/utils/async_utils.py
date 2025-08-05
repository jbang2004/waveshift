"""
异步任务工具集 - 提供统一的异步任务错误处理
"""
import asyncio
import logging
from typing import Set, Callable, Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class BackgroundTaskManager:
    """后台任务管理器 - 确保所有任务的异常都被正确处理"""
    
    def __init__(self):
        self.tasks: Set[asyncio.Task] = set()
        self._closed = False
    
    def create_task(
        self, 
        coro: Any,
        *,
        name: Optional[str] = None,
        error_handler: Optional[Callable[[Exception], Any]] = None
    ) -> asyncio.Task:
        """
        创建并管理后台任务
        
        Args:
            coro: 要执行的协程
            name: 任务名称（用于日志）
            error_handler: 自定义错误处理函数
            
        Returns:
            创建的任务对象
        """
        if self._closed:
            raise RuntimeError("TaskManager已关闭，无法创建新任务")
            
        task = asyncio.create_task(coro, name=name)
        self.tasks.add(task)
        
        # 添加完成回调
        def _task_done_callback(task: asyncio.Task):
            self.tasks.discard(task)
            try:
                # 获取任务结果，如果有异常会在这里抛出
                task.result()
            except asyncio.CancelledError:
                logger.debug(f"任务 {task.get_name()} 被取消")
            except Exception as e:
                logger.exception(f"任务 {task.get_name()} 执行失败: {e}")
                if error_handler:
                    try:
                        error_handler(e)
                    except Exception as handler_error:
                        logger.exception(f"错误处理器执行失败: {handler_error}")
        
        task.add_done_callback(_task_done_callback)
        return task
    
    async def wait_all(self, timeout: Optional[float] = None):
        """等待所有任务完成"""
        if not self.tasks:
            return
            
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.tasks, return_exceptions=True),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"等待任务超时，剩余 {len(self.tasks)} 个任务")
            raise
    
    async def cancel_all(self):
        """取消所有正在运行的任务"""
        if not self.tasks:
            return
            
        logger.info(f"正在取消 {len(self.tasks)} 个后台任务")
        
        # 取消所有任务
        for task in self.tasks:
            task.cancel()
        
        # 等待取消完成
        await asyncio.gather(*self.tasks, return_exceptions=True)
        
        self.tasks.clear()
    
    async def close(self):
        """关闭任务管理器"""
        self._closed = True
        await self.cancel_all()
    
    def __len__(self):
        """返回当前活跃任务数"""
        return len(self.tasks)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


def async_retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """
    异步重试装饰器
    
    Args:
        max_attempts: 最大重试次数
        delay: 初始延迟（秒）
        backoff: 延迟倍数
        exceptions: 需要重试的异常类型
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            current_delay = delay
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        logger.warning(
                            f"{func.__name__} 失败 (尝试 {attempt + 1}/{max_attempts}): {e}"
                        )
                        await asyncio.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        logger.error(
                            f"{func.__name__} 在 {max_attempts} 次尝试后失败"
                        )
            
            raise last_exception
        
        return wrapper
    return decorator


async def run_with_timeout(
    coro: Any,
    timeout: float,
    timeout_error_msg: Optional[str] = None
) -> Any:
    """
    运行协程并设置超时
    
    Args:
        coro: 要执行的协程
        timeout: 超时时间（秒）
        timeout_error_msg: 超时错误消息
        
    Returns:
        协程的返回值
        
    Raises:
        asyncio.TimeoutError: 超时时抛出
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        msg = timeout_error_msg or f"操作超时 ({timeout}秒)"
        logger.error(msg)
        raise asyncio.TimeoutError(msg)


