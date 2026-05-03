# 🍠 爱红薯 (LoveSweetPotato)

> 小红书笔记一键捕获 + AI 摘要，灵感来了就跑不掉。

一个 Chrome/Edge 浏览器插件，在小红书页面上一键抓取笔记的完整内容（图文、视频、评论区），自动调用 AI 生成摘要，支持保存为本地 Markdown 文件或打包下载。

---

## ✨ 为什么需要它？

刷小红书的时候，总会遇到一些让你"啧，有点东西"的笔记——可能是某个洞察角度、一个表达方式、一段用户反馈。但小红书没有收藏夹分类、没有导出、更没有 AI 帮你消化。等你回头想找的时候，早就淹没在信息流里了。

爱红薯做的事情很简单：**觉得有用，点一下，它就帮你把整条笔记"搬"到你的知识库里去。**

---

## 🎯 功能概览

- **一键捕获** — 点击浏览器工具栏的插件图标，自动抓取当前页面的小红书笔记
- **全量内容** — 图文笔记（正文 + 所有图片）、视频笔记（文案 + 封面）、评论区的完整内容，不丢任何信息
- **AI 摘要** — 自动调用 AI 模型对笔记内容生成摘要和关键观点提炼（支持多模态图片理解）
- **双通道保存** — 复制为 Markdown 或打包下载为 ZIP（含图片）
- **视频下载** — 视频笔记可单独下载视频文件
- **隐私优先** — 所有数据只经过你的浏览器和你自己的 AI API，不经过任何第三方服务器

---

## 🏗️ 工作流程

```
小红书页面 → 点击插件 → 内容抓取 → AI 摘要生成 → 本地归档
                  │                  │
                  ▼                  ▼
            DOM 解析引擎        LLM API (可替换)
           （文字 / 图片 /     （默认 Kimi K2.6
            视频 / 评论）       多模态模型）
```

---

## 🔧 技术栈

| 层 | 技术 |
|---|---|
| 插件框架 | Chrome Extension Manifest V3 |
| 内容抓取 | DOM 解析 + `__INITIAL_STATE__` + TreeWalker |
| AI 调用 | OpenAI 兼容 API（默认 Kimi K2.6，可替换） |
| 打包下载 | JSZip |
| 视频下载 | Chrome Downloads API |

---

## 📦 安装

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-username/love-sweet-potato.git
cd love-sweet-potato/extension
```

然后在 Chrome 中：
1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension` 目录

### 从 Chrome 应用商店安装（即将上线）

> 正在走审核流程，敬请期待。

---

## ⚙️ 配置

安装插件后，点击插件右上角的「⚙️」进入设置页面，填写以下配置：

### AI 模型（必填）

| 字段 | 说明 | 默认值 |
|---|---|---|
| API Key | 你的 AI 模型密钥 | （必填，无默认值） |
| API 基础地址 | API 端点地址 | `https://api.moonshot.cn/v1` |
| 模型名称 | 使用的模型 | `kimi-k2.6` |

支持任何兼容 OpenAI 接口的服务，包括但不限于：
- **Moonshot / Kimi**（默认）— 免费额度可申请，多模态支持好
- **OpenAI** — 官方 GPT-4o，多模态能力强
- **DeepSeek** — 性价比高
- **通义千问**（DashScope）
- 本地部署的 **Ollama / vLLM**

只需替换 `apiBase` 和 `apiKey` 即可切换。

---

## 📖 使用方式

1. 浏览小红书网页版（`xiaohongshu.com`）
2. 看到想保存的笔记，点击浏览器右上角的插件图标
3. 插件弹出窗口展示：
   - 笔记标题、作者、标签、互动数据
   - 正文内容
   - 评论区内容
4. 点击「生成摘要」调用 AI 对内容进行学习总结
5. 确认无误后，选择「复制 Markdown」或「下载文件」
6. 如果是视频笔记，还可点击「下载视频」单独保存视频文件

---

## 🗂️ 项目结构

```
love-sweet-potato/
├── extension/              # 浏览器插件主目录
│   ├── manifest.json       # 插件清单
│   ├── popup.html          # 弹出窗口
│   ├── popup.js            # 弹出窗口逻辑（抓取 + AI 调用 + 下载）
│   ├── popup.css           # 弹出窗口样式
│   ├── content.js          # 页面内容抓取脚本
│   ├── inject.js           # MAIN world 注入脚本
│   ├── jszip.min.js        # ZIP 打包库
│   └── icons/              # 插件图标
├── docs/                   # 文档资源
│   ├── wechat-pay-1.jpg
│   └── wechat-pay-2.jpg
├── .env.example            # 环境变量模板（Python CLI 工具用）
├── main.py                 # Python CLI 工具入口（可选）
└── README.md
```

> 注：`main.py` 及相关 Python 脚本是本项目早期规划的命令行版本，功能与插件类似，可作为备选方案使用。

---

## 🧑‍💻 本地开发

插件为纯 JavaScript 编写，无需构建步骤，修改后直接在 `chrome://extensions` 点击刷新即可生效。

### 调试方式

1. 在插件弹出窗口上右键 →「检查」打开 DevTools
2. 在小红书页面按 `F12` → Console 面板查看 `[XHS]` 前缀的日志
3. 点击插件底部的「复制诊断日志」按钮获取完整调试信息

---

## 🗺️ 路线图

- [x] 图文笔记抓取
- [x] 评论区采集
- [x] AI 摘要生成（多模态图片理解）
- [x] 本地 Markdown 导出 / ZIP 打包
- [x] 视频文件下载
- [ ] 视频画面帧提取理解
- [ ] 批量收藏夹导入
- [ ] 笔记标签与分类管理
- [ ] 飞书文档推送
- [ ] 多模型切换支持
- [ ] Chrome 应用商店上架

---

## 🤝 贡献

欢迎提 Issue 和 PR。

如果你有小红书笔记抓取的好思路，或者发现了解析失效的页面结构，请附带对应的笔记链接提 Issue，这会帮助很大。

---

## 📄 许可证

[MIT](./LICENSE)

MIT 协议 —— 你可以自由使用、修改、分发，包括商业用途。只要保留原始版权声明即可。

---

## ☕ 赞助

如果这个工具对你有帮助，欢迎请作者喝杯咖啡 ☕

<table>
  <tr>
    <td align="center">
      <img src="./docs/alipay-qr.jpg" width="200" alt="支付宝收款码" /><br/>
      <strong>支付宝</strong>
    </td>
    <td align="center">
      <img src="./docs/wechat-qr.jpg" width="200" alt="微信收款码" /><br/>
      <strong>微信支付</strong>
    </td>
  </tr>
</table>

---

**爱红薯 —— 灵感一触即走，但没关系，你点了按钮。**
