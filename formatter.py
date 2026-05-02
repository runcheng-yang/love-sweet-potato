"""
将提取的小红书笔记数据格式化为流畅排版的 Markdown 文档。
"""


def format_note(data: dict, ai_summary: str = "") -> str:
    """
    将笔记数据整合为一份流畅可读的学习文档。

    排版逻辑：
    - 标题和元信息放在开头
    - 正文内容（图文笔记的文字 + 图片 OCR / 视频转录文字）自然合并排版
    - 评论区保留但放在文档末尾
    - AI 摘要放在最前面或标题下方
    """
    lines = []

    # 标题
    title = data.get("title", "").strip()
    if title:
        lines.append(f"# {title}")
    else:
        lines.append("# 小红书笔记")
    lines.append("")

    # 元信息
    author = data.get("author", {}).get("nickname", "")
    url = data.get("url", "")
    tags = data.get("tags", [])
    stats = data.get("stats", {})

    meta_parts = []
    if author:
        meta_parts.append(f"作者：{author}")
    if tags:
        meta_parts.append(f"标签：{', '.join(tags)}")
    if stats.get("likes"):
        meta_parts.append(f"点赞：{stats['likes']}")
    if stats.get("collects"):
        meta_parts.append(f"收藏：{stats['collects']}")
    if url:
        meta_parts.append(f"来源：{url}")

    if meta_parts:
        lines.append(" | ".join(meta_parts))
        lines.append("")
    lines.append("---")
    lines.append("")

    # AI 摘要
    if ai_summary:
        lines.append("## 内容摘要")
        lines.append("")
        lines.append(ai_summary)
        lines.append("")
        lines.append("---")
        lines.append("")

    # 正文内容
    desc = data.get("desc", "").strip()
    note_type = data.get("note_type", "normal")

    lines.append("## 正文")
    lines.append("")

    if desc:
        # 小红书的 desc 中可能包含表情和换行，直接保留
        lines.append(desc)
        lines.append("")

    # 图片说明（如果有图片但没有 OCR 文字时，简单标注）
    images = data.get("images", [])
    if images and note_type == "normal":
        # 这里先简单列出图片数量，后续可接入 OCR 后替换为实际文字
        # 为了不机械分块，只在正文中自然提及
        if len(images) > 0:
            lines.append(f"\n> 该笔记包含 {len(images)} 张图片。")
            lines.append("")

    # 视频说明
    video = data.get("video")
    if video and note_type == "video":
        duration = video.get("duration", 0)
        duration_str = ""
        if duration:
            minutes = int(duration) // 60
            seconds = int(duration) % 60
            duration_str = f"（时长：{minutes}分{seconds}秒）" if minutes else f"（时长：{seconds}秒）"
        lines.append(f"\n> 该笔记为视频笔记 {duration_str}")
        lines.append("")

    lines.append("---")
    lines.append("")

    # 评论区
    comments = data.get("comments", [])
    if comments:
        lines.append("## 评论区精选")
        lines.append("")
        for c in comments[:50]:  # 最多显示50条，避免过长
            user = c.get("user", "")
            content = c.get("content", "").strip()
            likes = c.get("likes", 0)
            likes_str = f" 👍{likes}" if likes else ""
            if user and content:
                lines.append(f"- **{user}**：{content}{likes_str}")
            elif content:
                lines.append(f"- {content}{likes_str}")

            # 回复
            replies = c.get("replies", [])
            for r in replies[:3]:  # 每条评论最多显示3条回复
                r_user = r.get("user", "")
                r_content = r.get("content", "").strip()
                r_likes = r.get("likes", 0)
                r_likes_str = f" 👍{r_likes}" if r_likes else ""
                if r_user and r_content:
                    lines.append(f"  - ↳ **{r_user}**：{r_content}{r_likes_str}")
                elif r_content:
                    lines.append(f"  - ↳ {r_content}{r_likes_str}")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def format_for_summary(data: dict) -> str:
    """
    将笔记数据格式化为纯文本，供 AI 摘要使用。
    包含更完整的信息，但格式更紧凑。
    """
    parts = []

    title = data.get("title", "").strip()
    if title:
        parts.append(f"标题：{title}")

    desc = data.get("desc", "").strip()
    if desc:
        parts.append(f"正文：\n{desc}")

    tags = data.get("tags", [])
    if tags:
        parts.append(f"标签：{', '.join(tags)}")

    comments = data.get("comments", [])
    if comments:
        comment_texts = []
        for c in comments[:30]:
            user = c.get("user", "")
            content = c.get("content", "").strip()
            if content:
                comment_texts.append(f"{user}：{content}" if user else content)
        if comment_texts:
            parts.append("评论区：\n" + "\n".join(comment_texts))

    return "\n\n".join(parts)
