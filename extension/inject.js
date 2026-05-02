// 该脚本注入到页面主世界，可直接访问 window.__INITIAL_STATE__
// 通过 postMessage 将数据传回 content script

(function() {
  'use strict';

  function readAndPost() {
    const state = window.__INITIAL_STATE__;
    if (!state) {
      window.postMessage({
        source: 'xhs-inject',
        type: 'initialState',
        data: null,
      }, '*');
      return;
    }

    // 深拷贝并序列化（移除 undefined）
    let serialized;
    try {
      serialized = JSON.parse(JSON.stringify(state, function(k, v) {
        return v === undefined ? null : v;
      }));
    } catch (e) {
      window.postMessage({
        source: 'xhs-inject',
        type: 'initialState',
        data: null,
        error: 'serialize failed: ' + e.message,
      }, '*');
      return;
    }

    window.postMessage({
      source: 'xhs-inject',
      type: 'initialState',
      data: serialized,
    }, '*');
  }

  // 立即读取一次
  readAndPost();

  // 监听来自 content script 的请求
  window.addEventListener('message', function(event) {
    if (event.data && event.data.source === 'xhs-content' && event.data.action === 'read') {
      readAndPost();
    }
  });
})();
