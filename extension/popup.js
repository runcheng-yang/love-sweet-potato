(() => {
  // DOM 元素引用
  const els = {
    statusBadge: document.getElementById('status-badge'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    content: document.getElementById('content'),
    noteTitle: document.getElementById('note-title'),
    noteMeta: document.getElementById('note-meta'),
    noteBody: document.getElementById('note-body'),
    summarySection: document.getElementById('summary-section'),
    summaryBody: document.getElementById('summary-body'),
    commentsSection: document.getElementById('comments-section'),
    commentsBody: document.getElementById('comments-body'),
    btnCopy: document.getElementById('btn-copy'),
    btnDownload: document.getElementById('btn-download'),
    btnDownloadVideo: document.getElementById('btn-download-video'),
    btnGenerate: document.getElementById('btn-generate'),
    btnSettings: document.getElementById('btn-settings'),
    settingsPanel: document.getElementById('settings-panel'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    apiKeyInput: document.getElementById('api-key'),
    apiBaseInput: document.getElementById('api-base'),
    apiModelInput: document.getElementById('api-model'),
  };

  let noteData = null;
  let markdownOutput = '';
  let diagLogs = [];

  // 默认 API 配置（用户需在设置面板自行填入 API Key）
  const DEFAULT_API_KEY = '';
  const DEFAULT_API_BASE = 'https://api.moonshot.cn/v1';
  const DEFAULT_API_MODEL = 'kimi-k2.6';

  function logDiag(section, data) {
    const ts = new Date().toLocaleString('zh-CN');
    diagLogs.push(`[${ts}] ${section}`);
    try {
      if (typeof data === 'object') {
        diagLogs.push(JSON.stringify(data, null, 2));
      } else {
        diagLogs.push(String(data));
      }
    } catch (e) {
      diagLogs.push(`(serialize error: ${e.message})`);
    }
    diagLogs.push('---');
  }

  // 状态管理
  function setStatus(state) {
    const map = {
      loading: { text: '提取中', class: '' },
      success: { text: '已提取', class: 'success' },
      error: { text: '失败', class: 'error' },
    };
    const s = map[state] || map.loading;
    els.statusBadge.textContent = s.text;
    els.statusBadge.className = 'badge ' + s.class;
  }

  function showLoading() {
    els.loading.classList.remove('hidden');
    els.error.classList.add('hidden');
    els.content.classList.add('hidden');
    els.btnCopy.disabled = true;
    els.btnDownload.disabled = true;
    els.btnDownloadVideo.disabled = true;
    els.btnDownloadVideo.classList.add('hidden');
    setStatus('loading');
  }

  function showError(msg) {
    els.loading.classList.add('hidden');
    els.error.classList.remove('hidden');
    els.errorMessage.textContent = msg;
    els.content.classList.add('hidden');
    setStatus('error');
  }

  function showContent(data) {
    els.loading.classList.add('hidden');
    els.error.classList.add('hidden');
    els.content.classList.remove('hidden');
    els.btnCopy.disabled = false;
    els.btnDownload.disabled = false;
    els.btnDownloadVideo.disabled = false;
    setStatus('success');

    // 标题
    els.noteTitle.textContent = data.title || '(无标题)';

    // 元信息
    const metaParts = [];
    if (data.author?.nickname) metaParts.push(`作者：${data.author.nickname}`);
    if (data.tags?.length) metaParts.push(`标签：${data.tags.join('、')}`);
    if (data.stats?.likes) metaParts.push(`点赞：${data.stats.likes}`);
    if (data.stats?.collects) metaParts.push(`收藏：${data.stats.collects}`);
    els.noteMeta.textContent = metaParts.join(' ｜ ');

    // 正文
    let bodyHtml = '';
    if (data.desc) {
      bodyHtml += escapeHtml(data.desc);
    }
    if (data.images?.length) {
      bodyHtml += `\n\n> 该笔记包含 ${data.images.length} 张图片。`;
    }
    if (data.video) {
      const d = data.video.duration || 0;
      const min = Math.floor(d / 60);
      const sec = d % 60;
      const dur = min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
      bodyHtml += `\n\n> 该笔记为视频笔记（时长：${dur}）`;
    }
    els.noteBody.innerHTML = bodyHtml || '<p class="placeholder">无正文内容</p>';

    // 视频下载按钮
    if (data.video?.url && !data.video.url.startsWith('blob:')) {
      els.btnDownloadVideo.classList.remove('hidden');
    } else {
      els.btnDownloadVideo.classList.add('hidden');
    }

    // 评论区
    if (data.comments?.length > 0) {
      els.commentsSection.classList.remove('hidden');
      els.commentsBody.innerHTML = data.comments
        .map((c) => {
          let html = `<div class="comment-item">`;
          html += `<span class="comment-user">${escapeHtml(c.user)}</span>`;
          html += escapeHtml(c.content);
          if (c.likes) html += ` <span class="comment-likes">👍${c.likes}</span>`;
          if (c.replies?.length) {
            html += c.replies
              .map(
                (r) => `<div class="comment-reply"><span class="comment-user">${escapeHtml(r.user)}</span>${escapeHtml(r.content)}</div>`
              )
              .join('');
          }
          html += `</div>`;
          return html;
        })
        .join('');
    } else {
      els.commentsSection.classList.add('hidden');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function urlToBase64(url) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('[XHS] Failed to fetch image:', url, e);
      return null;
    }
  }

  // Markdown 生成
  function generateMarkdown(data, summary = '') {
    const lines = [];

    const title = data.title?.trim() || '小红书笔记';
    lines.push(`# ${title}\n`);

    const metaParts = [];
    if (data.author?.nickname) metaParts.push(`作者：${data.author.nickname}`);
    if (data.tags?.length) metaParts.push(`标签：${data.tags.join('、')}`);
    if (data.url) metaParts.push(`来源：${data.url}`);
    if (metaParts.length) lines.push(metaParts.join(' ｜ ') + '\n');

    lines.push('---\n');

    if (summary) {
      lines.push('## 内容摘要\n');
      lines.push(summary + '\n');
      lines.push('---\n');
    }

    lines.push('## 正文\n');
    if (data.desc) lines.push(data.desc + '\n');

    // 嵌入图片（Markdown 格式，可直接查看）
    if (data.images?.length > 0) {
      lines.push('\n### 笔记图片\n');
      for (let i = 0; i < data.images.length; i++) {
        lines.push(`![图片${i + 1}](${data.images[i]})`);
      }
      lines.push('');
    }

    if (data.video) {
      const d = data.video.duration || 0;
      const min = Math.floor(d / 60);
      const sec = d % 60;
      const dur = min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
      lines.push(`\n> 该笔记为视频笔记（时长：${dur}）`);
      if (data.video.url) {
        lines.push(`> 视频地址：[${data.video.url.slice(0, 80)}...](${data.video.url})`);
      }
      lines.push('');
    }

    lines.push('---\n');

    if (data.comments?.length > 0) {
      lines.push('## 评论区精选\n');
      for (const c of data.comments.slice(0, 50)) {
        const user = c.user || '';
        const content = c.content?.trim() || '';
        const likes = c.likes ? ` 👍${c.likes}` : '';
        if (user && content) {
          lines.push(`- **${user}**：${content}${likes}`);
        } else if (content) {
          lines.push(`- ${content}${likes}`);
        }
        for (const r of (c.replies || []).slice(0, 3)) {
          const ru = r.user || '';
          const rc = r.content?.trim() || '';
          const rl = r.likes ? ` 👍${r.likes}` : '';
          if (ru && rc) {
            lines.push(`  - ↳ **${ru}**：${rc}${rl}`);
          } else if (rc) {
            lines.push(`  - ↳ ${rc}${rl}`);
          }
        }
      }
      lines.push('\n---\n');
    }

    return lines.join('\n');
  }

  // 从页面主世界获取数据：优先 __INITIAL_STATE__，否则直接 DOM 抓取
  async function fetchStateFromMainWorld(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const isXhsImageUrl = (url) => url && (url.includes('xhscdn') || url.includes('xiaohongshu') || url.includes('sns-webpic'));

          // === Part 1: 读取 __INITIAL_STATE__ ===
          let stateResult = null;
          try {
            const state = window.__INITIAL_STATE__;
            if (state) {
              const ndm = state.note?.noteDetailMap;
              if (ndm) {
                for (const detail of Object.values(ndm)) {
                  const note = detail?.note;
                  if (note) {
                    stateResult = {
                      title: note.title,
                      desc: note.desc,
                      type: note.type,
                      noteId: note.noteId,
                      video: note.video
                        ? {
                            url: note.video.url || note.video.consumer?.url || note.video.originUrl || '',
                            duration: note.video.duration,
                            width: note.video.width,
                            height: note.video.height,
                          }
                        : null,
                      imageList: (note.imageList || []).map((img) => ({
                        urlList: img.urlList || [],
                        urlDefault: img.urlDefault,
                      })),
                      user: note.user
                        ? { nickname: note.user.nickname, userId: note.user.userId }
                        : null,
                      tagList: note.tagList,
                      interactInfo: note.interactInfo,
                      time: note.time,
                      commentList: (detail.commentList || []).map((c) => ({
                        content: c.content,
                        likedCount: c.likedCount,
                        userInfo: c.userInfo
                          ? { nickname: c.userInfo.nickname, userId: c.userInfo.userId }
                          : null,
                        subComments: (c.subComments || []).map((r) => ({
                          content: r.content,
                          likedCount: r.likedCount,
                          userInfo: r.userInfo
                            ? { nickname: r.userInfo.nickname, userId: r.userInfo.userId }
                            : null,
                        })),
                      })),
                    };
                    break;
                  }
                }
              }
            }
          } catch (e) {
            // state 读取失败，继续用 DOM 抓取
          }

          // 如果 state 有有效数据，直接返回
          const stateHasData = stateResult && (stateResult.title || stateResult.desc || (stateResult.imageList?.length > 0) || stateResult.video);
          if (stateHasData) {
            return { source: 'state', ...stateResult };
          }

          // === Part 2: __INITIAL_STATE__ 为空/骨架，直接 DOM 抓取 ===
          // 先定位当前笔记的主内容区域（避免提取到 feed 列表中的其他笔记）
          function findContainer() {
            if (!/\/explore\/[a-zA-Z0-9]+/.test(location.pathname)) return null;
            const video = document.querySelector('video');
            if (video) {
              let el = video;
              for (let i = 0; i < 6; i++) {
                const next = el.parentElement;
                if (!next || next === document.body) break;
                el = next;
              }
              return el;
            }
            let bestImg = null, bestArea = 0;
            for (const img of document.querySelectorAll('img')) {
              const src = img.src || img.dataset?.src || '';
              if (src && (src.includes('xhscdn') || src.includes('xiaohongshu') || src.includes('sns-webpic'))) {
                const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
                if (area > bestArea) { bestArea = area; bestImg = img; }
              }
            }
            if (bestImg) {
              let el = bestImg;
              for (let i = 0; i < 6; i++) {
                const next = el.parentElement;
                if (!next || next === document.body) break;
                el = next;
              }
              return el;
            }
            return null;
          }
          const container = findContainer();
          const root = container || document;

          // 2.1 标题（优先从容器中提取）
          let title = '';
          if (container) {
            const h1 = container.querySelector('h1');
            if (h1) { title = h1.textContent.trim(); }
            if (!title || title.length > 200) {
              for (const el of container.querySelectorAll('div, p, span')) {
                const text = el.textContent.trim();
                const directChildren = Array.from(el.children).filter(c => c.tagName !== 'BR');
                if (text.length > 5 && text.length < 200 && directChildren.length <= 1) {
                  title = text; break;
                }
              }
            }
          }
          if (!title) {
            const titleMatch = document.title.match(/^(.*?)(?:\s*[|\-\u2014]\s*小红书)?$/);
            title = titleMatch ? titleMatch[1].trim() : '';
          }
          if (!title || title === '小红书') {
            const h1 = document.querySelector('h1');
            if (h1) title = h1.textContent.trim();
          }
          if (!title || title === '小红书') {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content?.trim().replace(/\s*[|\-\u2014]\s*小红书$/, '') || '';
          }

          // 2.2 图片（限定在笔记容器内搜索，严格过滤）
          const images = [];
          for (const img of root.querySelectorAll('img')) {
            const src = img.src || img.dataset?.src || '';
            if (isXhsImageUrl(src)) {
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              const ratio = w / (h || 1);
              if (w < 200 && h < 200) continue;
              if (ratio > 5 || ratio < 0.2) continue;
              if (src.includes('avatar') || src.includes('/u/')) continue;
              if (!images.includes(src)) images.push(src);
            }
          }

          // 2.3 正文（从容器中提取，兜底全局）
          let desc = '';
          if (container) {
            const texts = [];
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent.trim();
              if (text.length > 20 && text.length < 2000) {
                const parent = node.parentElement;
                if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
                  if (parent.children.length <= 2) texts.push(text);
                }
              }
            }
            const unique = [...new Set(texts)];
            if (unique.length > 0 && unique[0].length > 30) desc = unique.join('\n\n');
          }
          if (!desc || desc.length < 30) {
            const allTexts = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent.trim();
              if (text.length > 30 && text.length < 2000) {
                const parent = node.parentElement;
                if (!parent) continue;
                if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NAV' || parent.tagName === 'HEADER' || parent.tagName === 'FOOTER') continue;
                if (parent.children.length > 3) continue;
                allTexts.push(text);
              }
            }
            const uiKeywords = ['关注', '收藏', '分享', '评论', '转发', '举报', '回复', '展开', '收起', '查看更多', '登录', '注册'];
            const filtered = [...new Set(allTexts)]
              .filter((t) => uiKeywords.filter((k) => t.includes(k)).length <= 1 && t.length > 30)
              .sort((a, b) => b.length - a.length);
            desc = filtered.slice(0, 5).join('\n\n');
          }

          // 2.4 视频（多策略获取真实 URL，排除 blob）
          let video = null;
          if (container) {
            for (const v of container.querySelectorAll('video')) {
              const src = v.src || v.dataset?.src || v.querySelector('source')?.src || '';
              if (src && !src.startsWith('blob:')) {
                video = { url: src, duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 };
                break;
              }
            }
          }
          if (!video) {
            for (const v of document.querySelectorAll('video')) {
              const src = v.src || v.dataset?.src || v.querySelector('source')?.src || '';
              if (src && !src.startsWith('blob:')) {
                video = { url: src, duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 };
                break;
              }
            }
          }
          if (!video) {
            try {
              const entries = performance.getEntriesByType('resource');
              const videoUrls = entries
                .map((e) => e.name)
                .filter((url) => {
                  if (url.startsWith('blob:')) return false;
                  return /\.(mp4|m3u8|flv|mov)(\?|$)/i.test(url) || url.includes('/video/') || url.includes('sns-video');
                });
              if (videoUrls.length > 0) {
                const unique = [...new Set(videoUrls)];
                const best = unique.sort((a, b) => b.length - a.length)[0];
                video = { url: best, duration: 0, width: 0, height: 0 };
              }
            } catch (e) {}
          }

          // 2.5 作者
          let author = '';
          for (const sel of ['.author-name', '.user-name', '.nickname', '[class*="author"] a', '[class*="user"] a']) {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent.trim();
              if (text.length > 0 && text.length < 50) { author = text; break; }
            }
          }
          if (!author) {
            for (const img of document.querySelectorAll('img')) {
              if (img.src && (img.src.includes('avatar') || img.naturalWidth <= 100)) {
                const sibling = img.nextElementSibling || img.parentElement?.nextElementSibling;
                if (sibling && sibling.textContent.trim().length < 30) {
                  author = sibling.textContent.trim();
                  break;
                }
              }
            }
          }

          // 2.6 评论
          const comments = [];
          const candidates = [];
          for (const div of document.querySelectorAll('div')) {
            if (div.offsetHeight < 40 || div.offsetHeight > 250) continue;
            const children = Array.from(div.children).filter((c) => c.tagName !== 'BR');
            if (children.length < 2 || children.length > 6) continue;
            const texts = Array.from(div.querySelectorAll('*'))
              .map((e) => e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 ? e.textContent.trim() : '')
              .filter((t) => t.length > 0 && t.length < 500);
            if (texts.length >= 2) {
              const pattern = children.map((c) => c.tagName).join(',');
              candidates.push({ div, pattern, texts });
            }
          }
          const patternCounts = {};
          for (const c of candidates) patternCounts[c.pattern] = (patternCounts[c.pattern] || 0) + 1;
          let bestPattern = null, bestCount = 0;
          for (const [p, count] of Object.entries(patternCounts)) {
            if (count > bestCount && count >= 3) { bestCount = count; bestPattern = p; }
          }
          if (bestPattern) {
            for (const c of candidates) {
              if (c.pattern === bestPattern) {
                const user = c.texts.find((t) => t.length < 30) || '';
                const content = c.texts.find((t) => t.length >= 5 && t !== user) || '';
                if (content) comments.push({ user, userId: '', content, likes: 0, replies: [] });
              }
            }
          }

          return {
            source: 'main-dom',
            title,
            desc,
            type: video ? 'video' : 'normal',
            noteId: '',
            imageList: images.map((url) => ({ urlList: [url], urlDefault: url })),
            user: author ? { nickname: author, userId: '' } : null,
            tagList: [],
            interactInfo: null,
            time: '',
            commentList: comments.slice(0, 50),
            video,
          };
        },
      });
      return results[0]?.result;
    } catch (e) {
      console.error('[XHS] MAIN world fetch failed:', e);
      return null;
    }
  }

  // 滚动页面触发懒加载（评论、图片等）
  async function scrollToLoadContent(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return new Promise((resolve) => {
            const html = document.documentElement.innerHTML;
            const hasComments = html.includes('comment') || html.includes('评论');
            if (!hasComments) {
              // 页面可能还没加载评论，尝试滚动到下方
              const commentSection = document.querySelector('.comments, .comment-list, [class*="comment-list"], [class*="comments-"]');
              if (commentSection) {
                commentSection.scrollIntoView({ behavior: 'instant', block: 'start' });
              }
            }
            // 多次滚动到底部，触发懒加载
            let count = 0;
            const timer = setInterval(() => {
              window.scrollTo(0, document.body.scrollHeight);
              count++;
              if (count >= 4) {
                clearInterval(timer);
                // 稍微回滚到顶部，让用户页面不受太大影响
                window.scrollTo(0, 0);
                resolve(true);
              }
            }, 400);
          });
        },
      });
      // 等待滚动和加载完成
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error('[XHS] Scroll to load failed:', e);
    }
  }

  // 数据提取：content script DOM 抓取 + MAIN world 状态补充
  async function extractData() {
    showLoading();
    diagLogs = [];
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('无法获取当前标签页');
      }

      const url = tab.url || '';
      if (!url.includes('xiaohongshu.com')) {
        throw new Error('请在小红书笔记页面使用此插件');
      }
      logDiag('页面URL', url);

      // 0. 先滚动页面，触发评论等懒加载内容
      await scrollToLoadContent(tab.id);

      // 1. content script DOM 抓取
      let domData = null;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
        if (response?.success) domData = response.data;
        logDiag('Content Script DOM 数据', {
          success: response?.success,
          title: domData?.title?.slice(0, 80),
          descLength: domData?.desc?.length,
          images: domData?.images?.length,
          comments: domData?.comments?.length,
          video: domData?.video,
          author: domData?.author,
        });
      } catch {
        // content script 未注入，手动执行后再试
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
          if (response?.success) domData = response.data;
          logDiag('Content Script DOM 数据（重新注入后）', {
            success: response?.success,
            title: domData?.title?.slice(0, 80),
            descLength: domData?.desc?.length,
            images: domData?.images?.length,
            comments: domData?.comments?.length,
            video: domData?.video,
            author: domData?.author,
          });
        } catch (e2) {
          console.error('Content script extraction failed:', e2);
          logDiag('Content Script 提取失败', e2.message);
        }
      }

      // 2. MAIN world 获取数据（优先 __INITIAL_STATE__，否则 DOM 抓取）
      const stateData = await fetchStateFromMainWorld(tab.id);
      logDiag('MAIN WORLD 数据', {
        hasData: !!stateData,
        source: stateData?.source,
        title: stateData?.title?.slice(0, 80),
        descLength: stateData?.desc?.length,
        imageList: stateData?.imageList?.length,
        commentList: stateData?.commentList?.length,
        videoUrl: stateData?.video?.url?.slice(0, 100),
        user: stateData?.user,
      });

      // 3. 合并数据
      if (stateData) {
        const isFromState = stateData.source === 'state';

        const images = stateData.imageList
          ? stateData.imageList.flatMap((img) =>
              img.urlList.length > 0
                ? [img.urlList[0]]
                : img.urlDefault
                  ? [img.urlDefault]
                  : []
            )
          : domData?.images || [];

        noteData = {
          title: stateData.title || domData?.title || '',
          desc: stateData.desc || domData?.desc || '',
          noteType: stateData.type || domData?.noteType || 'normal',
          noteId: stateData.noteId || domData?.noteId || '',
          url: domData?.url || location.href,
          author: stateData.user
            ? { nickname: stateData.user.nickname, userId: stateData.user.userId }
            : domData?.author || { nickname: '', userId: '' },
          tags: isFromState && stateData.tagList
            ? stateData.tagList.map((t) => t.name).filter(Boolean)
            : domData?.tags || [],
          stats: isFromState && stateData.interactInfo
            ? {
                likes: stateData.interactInfo.likedCount || 0,
                collects: stateData.interactInfo.collectedCount || 0,
                comments: stateData.interactInfo.commentCount || 0,
                shares: stateData.interactInfo.shareCount || 0,
              }
            : domData?.stats || { likes: 0, collects: 0, comments: 0, shares: 0 },
          time: stateData.time || domData?.time || '',
          images,
          coverImage: images[0] || domData?.coverImage || '',
          video: stateData.video || domData?.video || null,
          comments: stateData.commentList
            ? isFromState
              ? stateData.commentList.map((c) => ({
                  user: c.userInfo?.nickname || '',
                  userId: c.userInfo?.userId || '',
                  content: c.content || '',
                  likes: c.likedCount || 0,
                  replies: (c.subComments || []).map((r) => ({
                    user: r.userInfo?.nickname || '',
                    userId: r.userInfo?.userId || '',
                    content: r.content || '',
                    likes: r.likedCount || 0,
                  })),
                }))
              : stateData.commentList.map((c) => ({
                  user: c.user || '',
                  userId: c.userId || '',
                  content: c.content || '',
                  likes: c.likes || 0,
                  replies: c.replies || [],
                }))
            : domData?.comments || [],
        };
      } else if (domData) {
        noteData = domData;
      } else {
        throw new Error('未能从页面提取到任何数据');
      }

      logDiag('合并后最终数据', {
        title: noteData.title?.slice(0, 80),
        descLength: noteData.desc?.length,
        images: noteData.images?.length,
        comments: noteData.comments?.length,
        videoUrl: noteData.video?.url?.slice(0, 100),
        author: noteData.author,
        tags: noteData.tags,
        stats: noteData.stats,
      });

      markdownOutput = generateMarkdown(noteData);
      showContent(noteData);
    } catch (err) {
      logDiag('提取异常', { message: err.message, stack: err.stack });
      const msg = err.message || '';
      if (msg.includes('Receiving end does not exist')) {
        showError('无法与页面建立连接。\n请刷新小红书页面后，再点击插件图标。');
      } else if (msg.includes('Could not establish connection')) {
        showError('页面连接失败。\n请刷新小红书页面后重试。');
      } else {
        showError(msg);
      }
    }
  }

  // AI 摘要
  async function generateSummary() {
    if (!noteData) return;

    let { apiKey, apiBase, apiModel } = await chrome.storage.local.get(['apiKey', 'apiBase', 'apiModel']);
    // 使用用户设置的值，若未设置则用默认值兜底
    apiKey = apiKey || DEFAULT_API_KEY;
    apiBase = apiBase || DEFAULT_API_BASE;
    apiModel = apiModel || DEFAULT_API_MODEL;

    if (!apiKey) {
      els.summaryBody.innerHTML = '<p class="placeholder" style="color:#ff4d4f">请先在设置中配置 API Key</p>';
      els.btnGenerate.disabled = false;
      els.btnGenerate.textContent = '生成摘要';
      return;
    }

    els.btnGenerate.disabled = true;
    els.btnGenerate.textContent = '生成中...';

    const summaryText = generateMarkdown(noteData).slice(0, 8000);
    const baseUrl = apiBase || DEFAULT_API_BASE;
    const model = apiModel || DEFAULT_API_MODEL;

    // 下载图片为 base64（最多3张，平衡速度与理解效果）
    const imageBase64List = [];
    if (noteData.images?.length > 0) {
      els.summaryBody.innerHTML = '<p class="placeholder">正在加载图片...</p>';
      const validUrls = noteData.images
        .filter((url) => url && !url.startsWith('blob:'))
        .slice(0, 3);
      for (const url of validUrls) {
        const b64 = await urlToBase64(url);
        if (b64) imageBase64List.push(b64);
      }
    }

    const promptText = `请对以下小红书笔记做一份全面的学习笔记，全面提炼核心观点和关键信息。要求：
1. 结合图片中的文字和视觉信息以及笔记文字描述，全面提炼核心观点和关键信息
2. 如有教程/攻略类内容，保留关键步骤
3. 如有推荐/种草类内容，保留推荐理由和核心卖点
4. 语言简洁、内容完整，不要编造笔记中没有的信息

笔记内容：
${summaryText}`;

    const userContent = [{ type: 'text', text: promptText }];

    // 传入图片（base64，Kimi Vision 模型要求）
    for (const b64 of imageBase64List) {
      userContent.push({ type: 'image_url', image_url: { url: b64 } });
    }

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content:
                '你是一位擅长提炼核心信息的学习助手。请对用户提供的小红书笔记内容进行全面的学习总结，保留所有有价值的信息，输出内容要完整详实、不要截断。如果提供了图片或视频，请结合其中的视觉信息综合理解。不要编造笔记中没有的信息。',
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
          temperature: 1,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error?.message || '';
        // 用户友好的错误提示
        if (msg.includes('Invalid Authentication') || res.status === 401) {
          throw new Error('Kimi API Key 无效，请在设置中更新 Key。\n\n→ 前往 https://kimi.moonshot.cn 重新生成后粘贴到设置中');
        } else if (msg.includes('model') && msg.includes('not found')) {
          throw new Error(`模型 "${apiModel || DEFAULT_API_MODEL}" 不可用，请在设置中更改模型名称`);
        } else if (res.status === 429) {
          throw new Error('API 请求过于频繁，请稍后再试');
        } else {
          throw new Error(msg || `请求失败 (${res.status})`);
        }
      }

      const data = await res.json();
      const summary = data.choices?.[0]?.message?.content?.trim() || '';

      els.summaryBody.textContent = summary;
      els.summaryBody.classList.remove('placeholder');

      // 更新 markdown 输出
      markdownOutput = generateMarkdown(noteData, summary);
    } catch (err) {
      els.summaryBody.innerHTML = `<p class="placeholder" style="color:#ff4d4f">摘要生成失败：${escapeHtml(err.message)}</p>`;
    } finally {
      els.btnGenerate.disabled = false;
      els.btnGenerate.textContent = '生成摘要';
    }
  }

  // 复制到剪贴板
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(markdownOutput);
      const original = els.btnCopy.textContent;
      els.btnCopy.textContent = '已复制！';
      setTimeout(() => (els.btnCopy.textContent = original), 1500);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = markdownOutput;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      const original = els.btnCopy.textContent;
      els.btnCopy.textContent = '已复制！';
      setTimeout(() => (els.btnCopy.textContent = original), 1500);
    }
  }

  // 下载视频
  async function downloadVideo() {
    if (!noteData?.video?.url || noteData.video.url.startsWith('blob:')) return;

    const safeTitle = (noteData?.title || '小红书笔记')
      .replace(/[\\/*?:"<>|]/g, '')
      .slice(0, 50) || 'note';
    const ext = noteData.video.url.split('?')[0].split('.').pop() || 'mp4';
    const fileName = `${safeTitle}.${ext}`;

    const originalText = els.btnDownloadVideo.textContent;
    els.btnDownloadVideo.textContent = '下载中...';
    els.btnDownloadVideo.disabled = true;

    try {
      // 先尝试通过 chrome.downloads 下载
      await chrome.downloads.download({ url: noteData.video.url, filename: fileName });
      els.btnDownloadVideo.textContent = '已下载';
      setTimeout(() => {
        els.btnDownloadVideo.textContent = '下载视频';
        els.btnDownloadVideo.disabled = false;
      }, 2000);
    } catch {
      // 如果 downloads API 失败，在新标签页打开视频
      try {
        await chrome.tabs.create({ url: noteData.video.url, active: false });
      } catch {}
      els.btnDownloadVideo.textContent = '已打开';
      setTimeout(() => {
        els.btnDownloadVideo.textContent = '下载视频';
        els.btnDownloadVideo.disabled = false;
      }, 2000);
    }
  }

  // 下载文件（打包为 zip）
  async function downloadFile() {
    const safeTitle = (noteData?.title || '小红书笔记')
      .replace(/[\\/*?:"<>|]/g, '')
      .slice(0, 50)
      || 'note';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const folderName = `${mm}${dd}_${safeTitle}`;

    const zip = new JSZip();

    // 将 Markdown 中的图片 URL 替换为相对路径，便于离线查看
    let mdForDownload = markdownOutput;
    if (noteData?.images?.length > 0) {
      for (let i = 0; i < noteData.images.length; i++) {
        const imgUrl = noteData.images[i];
        const ext = imgUrl.split('?')[0].split('.').pop() || 'jpg';
        const imgName = `images/img${i + 1}.${ext}`;
        mdForDownload = mdForDownload.replace(imgUrl, imgName);
      }
    }
    zip.file(`${folderName}.md`, mdForDownload);

    // 下载图片并加入 zip（过滤 blob URL）
    if (noteData?.images?.length > 0) {
      const imgFolder = zip.folder('images');
      let imgIndex = 1;
      for (const imgUrl of noteData.images) {
        if (!imgUrl || imgUrl.startsWith('blob:')) continue;
        const ext = imgUrl.split('?')[0].split('.').pop() || 'jpg';
        const imgName = `img${imgIndex}.${ext}`;
        try {
          const res = await fetch(imgUrl, { credentials: 'omit' });
          const imgBlob = await res.blob();
          const arrayBuffer = await imgBlob.arrayBuffer();
          imgFolder.file(imgName, arrayBuffer);
          imgIndex++;
        } catch (e) {
          console.error('[XHS] Download image failed:', imgUrl, e);
        }
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 设置面板
  async function loadSettings() {
    const { apiKey, apiBase, apiModel } = await chrome.storage.local.get(['apiKey', 'apiBase', 'apiModel']);
    els.apiKeyInput.value = apiKey || DEFAULT_API_KEY;
    els.apiBaseInput.value = apiBase || DEFAULT_API_BASE;
    els.apiModelInput.value = apiModel || DEFAULT_API_MODEL;
  }

  async function saveSettings() {
    const apiKey = els.apiKeyInput.value.trim();
    const apiBase = els.apiBaseInput.value.trim();
    const apiModel = els.apiModelInput.value.trim();
    await chrome.storage.local.set({ apiKey, apiBase, apiModel });
    els.settingsPanel.classList.add('hidden');
  }

  // 复制诊断日志
  async function copyDiagLogs() {
    const header = `=== 小红书学习提取诊断日志 ===\n生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    const body = diagLogs.join('\n') || '暂无日志（请先尝试提取笔记）';
    const full = header + '\n' + body + '\n\n=== END ===';
    try {
      await navigator.clipboard.writeText(full);
      const btn = document.getElementById('btn-diag');
      const original = btn.textContent;
      btn.textContent = '已复制！';
      setTimeout(() => (btn.textContent = original), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = full;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      const btn = document.getElementById('btn-diag');
      const original = btn.textContent;
      btn.textContent = '已复制！';
      setTimeout(() => (btn.textContent = original), 1500);
    }
  }

  // 事件绑定
  els.btnCopy.addEventListener('click', copyToClipboard);
  els.btnDownload.addEventListener('click', downloadFile);
  els.btnDownloadVideo.addEventListener('click', downloadVideo);
  els.btnGenerate.addEventListener('click', generateSummary);
  els.btnSettings.addEventListener('click', () => {
    loadSettings();
    els.settingsPanel.classList.remove('hidden');
  });
  els.btnCloseSettings.addEventListener('click', () => {
    els.settingsPanel.classList.add('hidden');
  });
  els.btnSaveSettings.addEventListener('click', saveSettings);
  document.getElementById('btn-diag').addEventListener('click', copyDiagLogs);

  // 初始化
  extractData();
})();
