import os
from dotenv import load_dotenv

load_dotenv()


KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
KIMI_MODEL = os.getenv("KIMI_MODEL", "kimi-latest")


def check_api_key():
    if not KIMI_API_KEY:
        raise ValueError(
            "未设置 KIMI_API_KEY 环境变量。"
            "请复制 .env.example 为 .env 并填入你的 API Key。"
        )
