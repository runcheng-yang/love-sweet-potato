"""
调用 Moonshot (Kimi) API 生成笔记摘要。
支持多模态：将笔记图片下载并转为 base64 后传给模型理解。

根据 Kimi 官方文档，多模态 Vision 模型只支持 base64 data URI 格式的图片。
"""

import base64
from typing import Optional

import requests
from openai import OpenAI

from config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL, check_api_key


def _download_image_as_base64(url: str) -> Optional[str]:
    """下载图片并转为 base64 data URI。"""
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Referer": "https://www.xiaohongshu.com/",
            },
            timeout=15,
        )
        if not resp.ok:
            return None
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        b64 = base64.b64encode(resp.content).decode("utf-8")
        return f"data:{content_type};base64,{b64}"
    except Exception:
        return None


def generate_summary(
    text: str,
    image_urls: list[str] = None,
    video_url: str = "",
    is_video: bool = False,
    max_length: int = 800,
) -> str:
    """
    调用 Kimi API 生成笔记摘要。

    Args:
        text: 笔记完整文本内容
        image_urls: 笔记图片 URL 列表（可选）
        video_url: 视频 URL（可选，Kimi K2.6 支持直接传入视频）
        is_video: 是否为视频笔记
        max_length: 摘要最大字数参考

    Returns:
        str: AI 生成的摘要
    """
    check_api_key()
    client = OpenAI(
        api_key=KIMI_API_KEY,
        base_url=KIMI_BASE_URL,
    )

    system_prompt = (
        "你是一位擅长提炼核心信息的阅读助手。"
        "请对用户提供的小红书笔记内容进行客观总结，要求：\n"
        "1. 提炼核心观点和关键信息\n"
        "2. 如有教程/攻略类内容，保留关键步骤或 actionable insights\n"
        "3. 如有推荐/种草类内容，保留推荐理由和核心卖点\n"
        "4. 如有情感/经验分享，保留核心感悟\n"
        "5. 语言简洁，不超过指定长度\n"
        "6. 不要编造笔记中没有的信息\n"
        "7. 如果提供了图片或视频，请结合其中的文字和视觉信息综合理解内容"
    )

    # 构建用户消息
    prompt = (
        f"请为以下{'小红书视频笔记' if is_video else '小红书笔记'}生成一段摘要"
        f"（约 {max_length} 字以内）。"
        f"{'同时传入了视频内容，请结合视频画面和文字描述综合理解。' if is_video else '如果提供了图片，请结合图片中的文字和视觉信息综合理解内容。'}"
        f"\n\n{text[:5000]}"
    )
    user_content: list[dict] = [{"type": "text", "text": prompt}]

    # 视频笔记：直接传入视频 URL（Kimi K2.6 支持 video_url 类型）
    if video_url:
        user_content.append({
            "type": "video_url",
            "video_url": {"url": video_url},
            "fps": 1,
        })
        print(f"  ✓ 视频已传入: {video_url[:60]}...")

    # 下载图片并转为 base64 传入（Kimi Vision 模型要求 base64 格式）
    if image_urls:
        print(f"正在下载 {len(image_urls)} 张图片用于多模态分析...")
        for url in image_urls[:10]:
            b64 = _download_image_as_base64(url)
            if b64:
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": b64},
                })
                print(f"  ✓ 图片已转换: {url[:60]}...")
            else:
                print(f"  ✗ 图片下载失败: {url[:60]}...")

    try:
        response = client.chat.completions.create(
            model=KIMI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=1024,
        )
        summary = response.choices[0].message.content.strip()
        return summary
    except Exception as e:
        return f"【摘要生成失败】{type(e).__name__}: {e}"
