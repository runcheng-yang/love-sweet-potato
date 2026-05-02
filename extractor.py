import json
import re
import time

from playwright.sync_api import sync_playwright


def _parse_initial_state(page_source: str) -> dict:
    """从页面 HTML 中解析 window.__INITIAL_STATE__。"""
    match = re.search(
        r"window\.__INITIAL_STATE__\s*=\s*(\{.*?)\s*<\/script>",
        page_source,
        re.DOTALL,
    )
    if not match:
        match = re.search(
            r"window\.__INITIAL_STATE__\s*=\s*(\{.*)",
            page_source,
            re.DOTALL,
        )
    if not match:
        return {}

    raw = match.group(1)
    raw = re.sub(r":\s*undefined\b", ":null", raw)
    raw = re.sub(r"\bundefined\b", "null", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        last_brace = raw.rfind("}")
        if last_brace > 0:
            try:
                return json.loads(raw[: last_brace + 1])
            except json.JSONDecodeError:
                pass
        return {}


def _extract_note_data(initial_state: dict) -> dict:
    """从 __INITIAL_STATE__ 中提取笔记核心数据。"""
    note_detail_map = initial_state.get("note", {}).get("noteDetailMap", {})
    if not note_detail_map:
        return {}

    for detail in note_detail_map.values():
        note = detail.get("note", {})
        if note and note.get("noteId"):
            return note
    return {}


def _extract_comments(initial_state: dict) -> list[dict]:
    """从 __INITIAL_STATE__ 中提取评论数据。"""
    comments = []
    note_detail_map = initial_state.get("note", {}).get("noteDetailMap", {})
    for detail in note_detail_map.values():
        comment_list = detail.get("commentList", [])
        for c in comment_list:
            comments.append({
                "user": c.get("userInfo", {}).get("nickname", ""),
                "user_id": c.get("userInfo", {}).get("userId", ""),
                "content": c.get("content", ""),
                "likes": c.get("likedCount", 0),
                "replies": [
                    {
                        "user": r.get("userInfo", {}).get("nickname", ""),
                        "user_id": r.get("userInfo", {}).get("userId", ""),
                        "content": r.get("content", ""),
                        "likes": r.get("likedCount", 0),
                    }
                    for r in c.get("subComments", [])
                ],
            })
    return comments


def _detect_login_page(page) -> bool:
    """检测页面是否被重定向到了登录页。"""
    try:
        body_text = page.locator("body").inner_text(timeout=5000)
        login_indicators = [
            "登录后推荐",
            "马上登录即可",
            "扫码登录",
            "获取验证码",
            "手机号登录",
        ]
        return any(ind in body_text for ind in login_indicators)
    except Exception:
        return False


def extract_note(url: str, headless: bool = True, web_session: str = "") -> dict:
    """
    使用 Playwright 抓取小红书笔记内容。

    Args:
        url: 小红书笔记链接（支持标准链接、短链等）
        headless: 是否无头模式运行浏览器
        web_session: 登录后的 web_session Cookie 值（可选，部分笔记需要登录）

    Returns:
        dict: 包含笔记完整数据的字典

    Raises:
        RuntimeError: 抓取失败或需要登录
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
        )

        # 反检测：隐藏 webdriver
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
        """)

        # 若提供了 web_session，注入 Cookie
        if web_session:
            context.add_cookies([
                {
                    "name": "web_session",
                    "value": web_session,
                    "domain": ".xiaohongshu.com",
                    "path": "/",
                },
            ])

        page = context.new_page()

        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            time.sleep(3)

            current_url = page.url
            if "xhslink.com" in current_url or "xhs.cn" in current_url:
                time.sleep(3)
                current_url = page.url

            page_source = page.content()
            initial_state = _parse_initial_state(page_source)
            note_data = _extract_note_data(initial_state)
            comments = _extract_comments(initial_state)

            # 空数据检测
            if not note_data or not note_data.get("noteId"):
                if _detect_login_page(page):
                    raise RuntimeError(
                        "该笔记需要登录才能查看。\n"
                        "请在小红书网页版登录后，从浏览器开发者工具 (F12 → Application → Cookies) "
                        "复制 web_session 的值，然后通过 --cookie 参数传入。\n"
                        "示例: python main.py <链接> --cookie 'your_web_session_value'"
                    )
                raise RuntimeError(
                    "无法提取笔记数据。可能原因：\n"
                    "1. 笔记已被删除或设为私密\n"
                    "2. 需要登录才能查看\n"
                    "3. 页面结构已变更"
                )

            result = {
                "note_id": note_data.get("noteId", ""),
                "title": note_data.get("title", ""),
                "desc": note_data.get("desc", ""),
                "note_type": note_data.get("type", "normal"),
                "url": current_url,
                "author": {
                    "nickname": note_data.get("user", {}).get("nickname", ""),
                    "user_id": note_data.get("user", {}).get("userId", ""),
                },
                "tags": [t.get("name", "") for t in note_data.get("tagList", [])],
                "stats": {
                    "likes": note_data.get("interactInfo", {}).get("likedCount", 0),
                    "collects": note_data.get("interactInfo", {}).get("collectedCount", 0),
                    "comments": note_data.get("interactInfo", {}).get("commentCount", 0),
                    "shares": note_data.get("interactInfo", {}).get("shareCount", 0),
                },
                "time": note_data.get("time", ""),
                "images": [],
                "video": None,
                "comments": comments,
            }

            image_list = note_data.get("imageList", [])
            for img in image_list:
                url_list = img.get("urlList", [])
                if url_list:
                    result["images"].append(url_list[0])
                elif img.get("urlDefault"):
                    result["images"].append(img["urlDefault"])

            video_data = note_data.get("video", {})
            if video_data:
                result["video"] = {
                    "url": video_data.get("url", ""),
                    "duration": video_data.get("duration", 0),
                    "width": video_data.get("width", 0),
                    "height": video_data.get("height", 0),
                }

            return result

        finally:
            browser.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法: python extractor.py <小红书链接> [web_session_cookie]")
        sys.exit(1)
    cookie = sys.argv[2] if len(sys.argv) > 2 else ""
    data = extract_note(sys.argv[1], headless=False, web_session=cookie)
    print(json.dumps(data, ensure_ascii=False, indent=2))
