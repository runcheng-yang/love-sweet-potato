"""
视频下载与语音转文字（可选扩展模块）。

依赖: openai-whisper, ffmpeg
用法: 后续可从 main.py 中集成调用
"""

import os
import tempfile

import requests
import whisper


# 懒加载模型，避免启动时占用内存
_model = None


def _get_model(model_size: str = "base"):
    """加载 Whisper 模型（首次调用时下载）。"""
    global _model
    if _model is None:
        print(f"正在加载 Whisper 模型 ({model_size})，首次使用需要下载...")
        _model = whisper.load_model(model_size)
    return _model


def download_video(url: str, output_path: str = None) -> str:
    """
    下载视频到临时文件或指定路径。

    Returns:
        str: 下载后的文件路径
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.xiaohongshu.com/",
    }

    resp = requests.get(url, headers=headers, stream=True, timeout=60)
    resp.raise_for_status()

    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    return output_path


def transcribe_video(video_url: str, model_size: str = "base") -> str:
    """
    下载视频并用 Whisper 转录为文字。

    Args:
        video_url: 视频下载地址
        model_size: Whisper 模型大小 (tiny/base/small/medium/large)

    Returns:
        str: 转录后的文字
    """
    video_path = None
    try:
        print("正在下载视频...")
        video_path = download_video(video_url)
        print(f"视频已下载: {video_path}")

        model = _get_model(model_size)
        print("正在进行语音转文字...")
        result = model.transcribe(video_path, language="zh", verbose=False)

        segments = result.get("segments", [])
        lines = []
        for seg in segments:
            start = seg.get("start", 0)
            text = seg.get("text", "").strip()
            if text:
                minutes = int(start) // 60
                seconds = int(start) % 60
                lines.append(f"[{minutes:02d}:{seconds:02d}] {text}")

        return "\n".join(lines)

    finally:
        if video_path and os.path.exists(video_path):
            os.remove(video_path)
