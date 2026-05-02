(() => {
  // ===== 通用 DOM 抓取策略 =====
  // 不依赖具体 class 名，通过 DOM 结构特征和文本特征提取数据

  function isXhsImageUrl(url) {
    return url && (url.includes('xhscdn') || url.includes('xiaohongshu') || url.includes('sns-webpic'));
  }

  function getImageUrl(img) {
    const src = img.src || img.dataset.src || '';
    if (isXhsImageUrl(src)) return src;
    const style = img.style.backgroundImage;
    if (style) {
      const match = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && isXhsImageUrl(match[1])) return match[1];
    }
    return '';
  }

  // ===== 定位当前笔记的主内容区域（避免提取到 feed 列表中其他笔记）=====
  function findNoteContainer() {
    // 只在笔记详情页定位（/explore/{noteId}）
    if (!/\/explore\/[a-zA-Z0-9]+/.test(location.pathname)) return null;

    // 策略1: 找包含 <video> 的容器（视频笔记）
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

    // 策略2: 找包含最大尺寸小红书图片的容器
    let bestImg = null;
    let bestArea = 0;
    for (const img of document.querySelectorAll('img')) {
      const url = getImageUrl(img);
      if (url) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        const area = w * h;
        if (area > bestArea) {
          bestArea = area;
          bestImg = img;
        }
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

  // 获取页面中所有小红书图片（不依赖 class，严格过滤）（可选限定容器）
  function extractImages(container) {
    const root = container || document;
    const images = [];
    for (const img of root.querySelectorAll('img')) {
      const url = getImageUrl(img);
      if (url) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        const ratio = w / (h || 1);
        // 排除小图标和头像（< 200px）及极端比例
        if (w < 200 && h < 200) continue;
        if (ratio > 5 || ratio < 0.2) continue;
        if (url.includes('avatar') || url.includes('/u/')) continue;
        images.push({ url, width: w, height: h });
      }
    }
    // 去重
    const seen = new Set();
    return images.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  // 获取标题（多种策略，优先从笔记容器中提取）
  function extractTitle(container) {
    const root = container || document;

    // 策略1: 从容器中找 h1
    if (container) {
      const h1 = container.querySelector('h1');
      if (h1) {
        const text = h1.textContent.trim();
        if (text.length > 3 && text.length < 200) return text;
      }
      // 从容器中找第一个较短的段落（可能是标题）
      for (const el of container.querySelectorAll('div, p, span')) {
        const text = el.textContent.trim();
        const directChildren = Array.from(el.children).filter(c => c.tagName !== 'BR');
        if (text.length > 5 && text.length < 200 && directChildren.length <= 1) {
          return text;
        }
      }
    }

    // 策略2: document.title 去掉 " | 小红书"
    const titleMatch = document.title.match(/^(.*?)(?:\s*[|\-\u2014]\s*小红书)?$/);
    const titleFromDoc = titleMatch ? titleMatch[1].trim() : '';
    if (titleFromDoc && titleFromDoc !== '小红书' && titleFromDoc !== '小红书 - 你的生活指南') {
      return titleFromDoc;
    }

    // 策略2: 第一个 h1
    const h1 = document.querySelector('h1');
    if (h1) {
      const text = h1.textContent.trim();
      if (text.length > 3 && text.length < 200) return text;
    }

    // 策略3: 第一个 h2
    const h2 = document.querySelector('h2');
    if (h2) {
      const text = h2.textContent.trim();
      if (text.length > 3 && text.length < 200) return text;
    }

    // 策略4: meta 中的 og:title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      const text = ogTitle.content?.trim() || '';
      if (text && text !== '小红书') return text.replace(/\s*[|\-\u2014]\s*小红书$/, '');
    }

    return '';
  }

  // 获取正文（最长文本块策略，优先从容器中提取）
  function extractDesc(container) {
    const root = container || document;

    // 策略1: 从容器中提取直接文本
    if (container) {
      const texts = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (text.length > 20 && text.length < 2000) {
          const parent = node.parentElement;
          if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
            if (parent.children.length <= 2) {
              texts.push(text);
            }
          }
        }
      }
      const unique = [...new Set(texts)];
      if (unique.length > 0 && unique[0].length > 30) {
        return unique.join('\n\n');
      }
    }

    // 策略2: 尝试基于 class 的选择器（兼容旧版）
    const classSelectors = [
      '.note-content .desc',
      '.note-scroller .desc',
      '.main-content .desc',
      '[class*="desc"]:not([class*="comment"])',
      '.note-text',
      '.content .text',
      '[class*="note"] [class*="text"]',
    ];
    for (const sel of classSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const text = Array.from(els).map((el) => el.textContent.trim()).filter(Boolean).join('\n\n');
        if (text.length > 10) return text;
      }
    }

    // 策略2: 找笔记图片的公共祖先，在其内部提取文本
    const noteImages = extractImages();
    if (noteImages.length > 0) {
      // 找到图片的公共祖先（向上追溯 4 层）
      let ancestor = null;
      for (const item of noteImages.slice(0, 3)) {
        const img = document.querySelector(`img[src="${item.url}"], img[data-src="${item.url}"]`);
        if (!img) continue;
        let el = img;
        for (let i = 0; i < 5; i++) {
          if (!el.parentElement) break;
          el = el.parentElement;
        }
        if (!ancestor) ancestor = el;
        else if (ancestor.contains(el)) ancestor = el;
      }

      if (ancestor) {
        // 在祖先元素中提取直接文本（不包含子元素中的）
        const texts = [];
        const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent.trim();
          if (text.length > 15 && text.length < 2000) {
            const parent = node.parentElement;
            if (parent) {
              const tag = parent.tagName;
              // 排除 script/style 及其后代
              if (tag === 'SCRIPT' || tag === 'STYLE') continue;
              // 排除包含图片或视频的容器
              if (parent.querySelector('img, video')) continue;
              // 检查父元素是否只是文本容器（不含太多子元素）
              const childElements = parent.querySelectorAll(':scope > *');
              if (childElements.length <= 2) {
                texts.push(text);
              }
            }
          }
        }
        // 去重并合并
        const unique = [...new Set(texts)];
        const joined = unique.join('\n\n');
        if (joined.length > 30) return joined;
      }
    }

    // 策略3: 全局最长文本块（兜底）
    const allTexts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.length > 30 && text.length < 2000) {
        const parent = node.parentElement;
        if (!parent) continue;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') continue;
        // 排除包含大量子元素的容器
        if (parent.children.length > 3) continue;
        allTexts.push(text);
      }
    }

    // 按长度排序，取最长的几个
    const uniqueTexts = [...new Set(allTexts)].sort((a, b) => b.length - a.length);
    // 过滤掉包含过多 UI 关键词的
    const uiKeywords = ['关注', '收藏', '分享', '评论', '转发', '举报', '回复', '展开', '收起', '查看更多', '登录', '注册'];
    const filtered = uniqueTexts.filter((t) => {
      const score = uiKeywords.filter((k) => t.includes(k)).length;
      return score <= 1 && t.length > 30;
    });

    return filtered.slice(0, 5).join('\n\n');
  }

  // 获取作者
  function extractAuthor() {
    // 策略1: 尝试常见选择器
    const selectors = [
      '.author-name',
      '.user-name',
      '.nickname',
      '[class*="author"] a',
      '[class*="user"] a',
      '[class*="nickname"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 0 && text.length < 50) return text;
      }
    }

    // 策略2: 从 meta 中找
    const authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) return authorMeta.content?.trim() || '';

    // 策略3: 找页面中最短的用户名样式文本（通常在笔记上方）
    const candidates = [];
    for (const span of document.querySelectorAll('span, a')) {
      const text = span.textContent.trim();
      if (text.length >= 1 && text.length <= 20 && !text.includes('\n')) {
        // 检查是否有头像图片在旁边
        const hasAvatarNearby = span.parentElement?.querySelector('img') ||
                                span.previousElementSibling?.tagName === 'IMG' ||
                                span.nextElementSibling?.tagName === 'IMG';
        if (hasAvatarNearby) candidates.push(text);
      }
    }
    return candidates[0] || '';
  }

  // 获取视频（排除 blob URL，尝试从网络请求中找真实地址）
  function extractVideo() {
    // 策略1: 直接找 video 标签（排除 blob）
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      const src = v.src || v.dataset.src || v.querySelector('source')?.src || '';
      if (src && !src.startsWith('blob:')) {
        return {
          url: src,
          duration: v.duration || 0,
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
        };
      }
    }

    // 策略2: 找包含 video 的容器
    const containers = document.querySelectorAll('div');
    for (const div of containers) {
      const v = div.querySelector('video');
      if (v) {
        const src = v.src || v.dataset.src || v.querySelector('source')?.src || '';
        if (src && !src.startsWith('blob:')) {
          return {
            url: src,
            duration: v.duration || 0,
            width: v.videoWidth || 0,
            height: v.videoHeight || 0,
          };
        }
      }
    }

    // 策略3: 从 performance 网络请求中找视频 URL
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
        return { url: best, duration: 0, width: 0, height: 0 };
      }
    } catch (e) {}

    return null;
  }

  // 获取评论（结构相似性检测）
  function extractComments() {
    // 策略1: 尝试常见选择器
    const selectors = [
      '.comment-item',
      '.comment-list > div',
      '.comments > div > div',
      '[class*="comment-list"] > div',
      '[class*="comment"] > div[class]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length >= 2) {
        const comments = [];
        for (const el of els.slice(0, 50)) {
          const texts = Array.from(el.querySelectorAll('*'))
            .map((e) => e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 ? e.textContent.trim() : '')
            .filter((t) => t.length > 0);
          const user = texts.find((t) => t.length < 30) || '';
          const content = texts.find((t) => t.length >= 5 && t !== user) || '';
          if (content) {
            comments.push({ user, userId: '', content, likes: 0, replies: [] });
          }
        }
        if (comments.length > 0) return comments;
      }
    }

    // 策略2: 结构相似性检测
    // 找页面上高度 40-250px 的 div，统计哪种子元素结构出现 3 次以上
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

    // 统计出现次数最多的模式
    const patternCounts = {};
    for (const c of candidates) {
      patternCounts[c.pattern] = (patternCounts[c.pattern] || 0) + 1;
    }

    let bestPattern = null;
    let bestCount = 0;
    for (const [pattern, count] of Object.entries(patternCounts)) {
      if (count > bestCount && count >= 3) {
        bestCount = count;
        bestPattern = pattern;
      }
    }

    if (!bestPattern) return [];

    const comments = [];
    for (const c of candidates) {
      if (c.pattern === bestPattern) {
        const user = c.texts.find((t) => t.length < 30) || '';
        const content = c.texts.find((t) => t.length >= 5 && t !== user) || '';
        if (content) {
          comments.push({ user, userId: '', content, likes: 0, replies: [] });
        }
      }
    }

    return comments.slice(0, 50);
  }

  // 获取标签
  function extractTags() {
    const tags = [];
    // 策略1: 找链接中包含 topic 的
    for (const a of document.querySelectorAll('a[href*="topic"], a[href*="search"]')) {
      const text = a.textContent.trim().replace(/^#/, '');
      if (text && text.length < 30 && !tags.includes(text)) tags.push(text);
    }
    // 策略2: 从正文中提取 #话题 格式
    const bodyText = document.body.innerText;
    const hashTags = bodyText.match(/#[\u4e00-\u9fa5\w]+/g) || [];
    for (const tag of hashTags) {
      const clean = tag.replace(/^#/, '');
      if (clean.length < 30 && !tags.includes(clean)) tags.push(clean);
    }
    return tags.slice(0, 15);
  }

  // 获取互动数据
  function extractStats() {
    const stats = { likes: 0, collects: 0, comments: 0, shares: 0 };
    const allText = document.body.innerText;

    const likeMatch = allText.match(/(\d+(?:\.\d+)?(?:万|w)?)\s*[\u8d5e\u70b9\u8d5e]/);
    const collectMatch = allText.match(/(\d+(?:\.\d+)?(?:万|w)?)\s*[\u6536\u85cf]/);
    const commentMatch = allText.match(/(\d+(?:\.\d+)?(?:万|w)?)\s*[\u8bc4\u8bba]/);

    if (likeMatch) stats.likes = parseCount(likeMatch[1]);
    if (collectMatch) stats.collects = parseCount(collectMatch[1]);
    if (commentMatch) stats.comments = parseCount(commentMatch[1]);

    return stats;
  }

  function parseCount(str) {
    if (!str) return 0;
    str = str.replace(/,/g, '');
    if (str.includes('万') || str.includes('w') || str.includes('W')) {
      const num = parseFloat(str);
      return Math.round(num * 10000);
    }
    return parseInt(str) || 0;
  }

  // ===== 主提取函数 =====
  function extractFromDOM() {
    const container = findNoteContainer();
    const images = extractImages(container);
    const video = extractVideo();

    const result = {
      noteId: '',
      title: extractTitle(container),
      desc: extractDesc(container),
      noteType: video ? 'video' : 'normal',
      url: location.href,
      author: { nickname: extractAuthor(), userId: '' },
      tags: extractTags(),
      stats: extractStats(),
      time: '',
      images: images.map((i) => i.url),
      coverImage: images[0]?.url || '',
      video,
      comments: extractComments(),
    };

    return result;
  }

  // ===== 备用：尝试解析 __INITIAL_STATE__ =====
  function extractFromState() {
    const state = window.__INITIAL_STATE__;
    if (!state) return null;

    try {
      const initialState = JSON.parse(JSON.stringify(state, (k, v) =>
        v === undefined ? null : v
      ));

      const noteDetailMap = initialState?.note?.noteDetailMap;
      if (!noteDetailMap) return null;

      let extracted = null;
      for (const detail of Object.values(noteDetailMap)) {
        const note = detail?.note;
        if (note && (note.title || note.desc || note.imageList?.length > 0 || note.video)) {
          extracted = { note, detail };
          break;
        }
      }

      if (!extracted) return null;

      const note = extracted.note;
      const detail = extracted.detail;

      const images = [];
      for (const img of note.imageList || []) {
        const urlList = img.urlList || [];
        if (urlList.length > 0) images.push(urlList[0]);
        else if (img.urlDefault) images.push(img.urlDefault);
      }

      const videoData = note.video || null;
      const video = videoData
        ? { url: videoData.url || videoData.consumer?.url || videoData.originUrl || '', duration: videoData.duration || 0, width: videoData.width || 0, height: videoData.height || 0 }
        : null;

      let coverImage = '';
      if (note.imageList?.[0]?.urlList?.[0]) coverImage = note.imageList[0].urlList[0];
      else if (note.imageList?.[0]?.urlDefault) coverImage = note.imageList[0].urlDefault;

      return {
        noteId: note.noteId || '',
        title: note.title || '',
        desc: note.desc || '',
        noteType: note.type || 'normal',
        url: location.href,
        author: {
          nickname: note.user?.nickname || '',
          userId: note.user?.userId || '',
        },
        tags: (note.tagList || []).map((t) => t.name || ''),
        stats: {
          likes: note.interactInfo?.likedCount || 0,
          collects: note.interactInfo?.collectedCount || 0,
          comments: note.interactInfo?.commentCount || 0,
          shares: note.interactInfo?.shareCount || 0,
        },
        time: note.time || '',
        images,
        coverImage,
        video,
        comments: (detail?.commentList || []).map((c) => ({
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
        })),
      };
    } catch {
      return null;
    }
  }

  // ===== 合并提取 =====
  function extract() {
    const stateData = extractFromState();
    const domData = extractFromDOM();

    // 日志：用于调试
    console.log('[XHS Content] stateData:', stateData ? { title: stateData.title, descLen: stateData.desc?.length, images: stateData.images?.length, comments: stateData.comments?.length } : null);
    console.log('[XHS Content] domData:', { title: domData.title, descLen: domData.desc?.length, images: domData.images?.length, comments: domData.comments?.length, video: !!domData.video });

    return {
      noteId: stateData?.noteId || domData.noteId,
      title: stateData?.title || domData.title,
      desc: stateData?.desc || domData.desc,
      noteType: stateData?.noteType || domData.noteType,
      url: domData.url,
      author: {
        nickname: stateData?.author?.nickname || domData.author.nickname,
        userId: stateData?.author?.userId || domData.author.userId,
      },
      tags: stateData?.tags?.length > 0 ? stateData.tags : domData.tags,
      stats: {
        likes: stateData?.stats?.likes || domData.stats.likes,
        collects: stateData?.stats?.collects || domData.stats.collects,
        comments: stateData?.stats?.comments || domData.stats.comments,
        shares: stateData?.stats?.shares || domData.stats.shares,
      },
      time: stateData?.time || domData.time,
      images: stateData?.images?.length > 0 ? stateData.images : domData.images,
      coverImage: stateData?.coverImage || domData.coverImage,
      video: stateData?.video || domData.video,
      comments: stateData?.comments?.length > 0 ? stateData.comments : domData.comments,
    };
  }

  // ===== 监听 popup 消息 =====
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ success: true });
      return true;
    }

    if (request.action !== 'extract') return;

    try {
      const data = extract();
      // 只要有标题、正文、图片、视频中任意一个，就算成功
      const hasContent = data.title || data.desc || data.images.length > 0 || data.video;
      if (!hasContent) {
        sendResponse({
          success: false,
          error: '未能从页面提取到有效数据。请确保页面已完全加载，或尝试刷新页面。',
          debug: { title: data.title, descLen: data.desc?.length, images: data.images.length, hasVideo: !!data.video },
        });
      } else {
        sendResponse({ success: true, data });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }

    return true;
  });
})();
