#!/usr/bin/env python3
"""
小红书学习提取工具

用法:
    python main.py <小红书链接>
    或
    python main.py
    （然后根据提示输入链接）

输出:
    在当前目录生成 Markdown 文件
"""

import argparse
import os
import re
import sys
from datetime import datetime

from extractor import extract_note
from formatter import format_note, format_for_summary
from summarize import generate_summary


def sanitize_filename(name: str) -> str:
    """将字符串清理为合法的文件名。"""
    # 移除不合法字符
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    # 移除首尾空白
    name = name.strip()
    # 限制长度
    if len(name) > 50:
        name = name[:50]
    return name or "untitled"


def main():
    parser = argparse.ArgumentParser(
        description="将小红书笔记转换为结构化的 Markdown 学习文档"
    )
    parser.add_argument(
        "url",
        nargs="?",
        help="小红书笔记链接（支持标准链接、短链等）",
    )
    parser.add_argument(
        "--no-summary",
        action="store_true",
        help="不生成 AI 摘要",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=True,
        help="无头模式运行浏览器（默认开启）",
    )
    parser.add_argument(
        "--no-headless",
        dest="headless",
        action="store_false",
        help="显示浏览器窗口（调试用）",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=".",
        help="输出目录（默认为当前目录）",
    )
    parser.add_argument(
        "--cookie",
        "-c",
        default="",
        help="web_session Cookie 值（部分笔记需要登录才能查看）",
    )
    args = parser.parse_args()

    # 获取链接
    url = args.url
    if not url:
        url = input("请输入小红书笔记链接：").strip()

    if not url:
        print("错误：未提供链接。")
        sys.exit(1)

    print(f"正在抓取笔记内容...")
    print(f"链接: {url}")

    try:
        data = extract_note(url, headless=args.headless, web_session=args.cookie)
    except Exception as e:
        print(f"抓取失败: {e}")
        sys.exit(1)

    title = data.get("title", "").strip()
    note_id = data.get("note_id", "")
    print(f"标题: {title or '(无标题)'}")
    print(f"作者: {data.get('author', {}).get('nickname', '')}")
    print(f"类型: {'视频' if data.get('note_type') == 'video' else '图文/文字'}")
    print(f"评论数: {len(data.get('comments', []))}")

    # 生成 AI 摘要
    ai_summary = ""
    if not args.no_summary:
        try:
            print("正在生成 AI 摘要...")
            summary_text = format_for_summary(data)
            image_urls = data.get("images", [])
            video_data = data.get("video") or {}
            video_url = video_data.get("url", "")
            is_video = data.get("note_type") == "video"
            ai_summary = generate_summary(
                summary_text,
                image_urls=image_urls,
                video_url=video_url,
                is_video=is_video,
            )
            print("摘要生成完成。")
        except Exception as e:
            print(f"摘要生成失败: {e}")
            ai_summary = ""

    # 格式化输出
    markdown = format_note(data, ai_summary=ai_summary)

    # 生成文件名
    safe_title = sanitize_filename(title) if title else note_id
    timestamp = datetime.now().strftime("%m%d")
    filename = f"{timestamp}_{safe_title}.md"

    output_dir = os.path.expanduser(args.output)
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, filename)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"\n已保存到: {output_path}")
    print(f"文件大小: {os.path.getsize(output_path)} 字节")


if __name__ == "__main__":
    main()
