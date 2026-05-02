"""
图片 OCR 文字识别（可选扩展模块）。

当前策略：
- 优先尝试使用在线 OCR API（如百度/阿里/腾讯，用户需自行申请）
- 若未配置 API，则尝试本地轻量 OCR（如 easyocr，需额外安装）

用法: 后续可从 formatter.py 中集成调用
"""

import os
import tempfile

import requests


def _download_image(url: str) -> str:
    """下载图片到临时文件，返回路径。"""
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.xiaohongshu.com/",
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    with open(path, "wb") as f:
        f.write(resp.content)
    return path


def ocr_image(url: str) -> str:
    """
    对图片进行 OCR 识别。

    当前为占位实现，建议接入在线 OCR API：
    - 百度智能云通用文字识别: https://cloud.baidu.com/product/ocr
    - 阿里云文字识别: https://www.aliyun.com/product/ai/ocr
    - 腾讯云文字识别: https://cloud.tencent.com/product/ocr

    Returns:
        str: 识别出的文字
    """
    # TODO: 接入用户偏好的在线 OCR 服务
    # 若用户希望本地运行，可安装 easyocr：
    #   pip install easyocr
    #   import easyocr
    #   reader = easyocr.Reader(['ch_sim','en'])
    #   result = reader.readtext(image_path)
    #   return "\n".join([r[1] for r in result])

    return ""


def ocr_images(urls: list[str]) -> list[str]:
    """对多张图片进行 OCR，返回每张图片识别出的文字列表。"""
    results = []
    for url in urls:
        try:
            text = ocr_image(url)
            results.append(text)
        except Exception:
            results.append("")
    return results
