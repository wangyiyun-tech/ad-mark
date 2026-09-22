/* ============================================================
 * 付费推广标记（辅助） · 内容脚本
 * ------------------------------------------------------------
 * 只做「本地视觉提醒」：
 *   · 在能识别出的付费推广 / 广告条目右下角，钉一个小红牌「广告」；
 *   · 鼠标悬浮在该标记上时，显示免责说明。
 *
 * 判定依据（重要）：**标记来源是网页自身已有的推广标识**——本扩展不自行判定
 *   何为广告，只识别网站自己已经展示出来的「广告 / 推广 / 赞助 / Sponsored」等
 *   标签（或站点自带的推广隐藏标记，如百度 .ec-tuiguang），把它显示得更明显。
 *
 * 明确不做（也是本扩展的免责边界）：
 *   · 不拦截、不屏蔽、不删除任何广告请求或广告元素；
 *   · 不修改网页广告内容、不拦截广告点击、不篡改广告数据；
 *   · 不发送任何数据（本脚本无网络请求）。
 *
 * 本脚本不含任何品牌标识；标记与提示文案只陈述「辅助区分付费推广」这一事实。
 * ============================================================ */
(function () {
  'use strict';
  if (window.__ppmLoaded) return;
  window.__ppmLoaded = true;

  /* 悬浮在标记上时显示的免责说明（不含任何品牌名） */
  var DISCLAIMER =
    '本标记仅辅助区分付费推广：该条目是网页自带的推广标识（网站自己标注的「广告 / 推广 / 赞助」等）。';
  var BADGE_TEXT = '广告';

  /* 常见的网页自带推广标签（小写比较；长度上限防误伤长句）。
   * 注意：不含 'ad' / 'ads' 这类过短的词——它们会误伤 ad-mark、advertising
   * 等正常词汇；官方广告标注基本都是「广告 / 赞助 / Sponsored」这类完整词。 */
  var WORDS = [
    '广告', '广告位', '广告推广', '推广', '推广位', '推广链接',
    '赞助', '赞助商', '商业广告', '商业推广',
    'sponsored', 'sponsoredcontent', 'promoted', 'promotion',
    'advertisement', 'anzeige', '広告'
  ];
  /* 强特征词：只允许出现在「很短的标注文本」里做包含匹配（如「百度广告」），
   * 长文本（如 ad-mark、advertising、付费推广标记（辅助））一律不算，防止误伤。 */
  var STRONG = ['广告', '推广', '赞助', 'sponsored', 'promoted', 'tuiguang', 'guanggao'];
  /* 站点专属的推广标记（语义属性与 class 由下方通用扫描统一处理，避免把整块侧栏当成一条广告） */
  var SPECIAL_SEL = [
    '.ec-tuiguang', '[data-tuiguang]', '.c-icon-bear-circle',
    '[data-is-ad="1"]', '[data-is-ad="true"]'
  ].join(',');
  var LABEL_ATTRS = ['aria-label', 'title', 'alt', 'data-label', 'data-ad-label', 'data-text-ad'];

  function isBadge(text) {
    var t = (text || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!t || t.length > 18) return false;
    return WORDS.indexOf(t) !== -1;
  }

  function hasSemanticMarker(el) {
    if (!el || !el.getAttribute) return false;
    for (var i = 0; i < LABEL_ATTRS.length; i++) {
      var value = (el.getAttribute(LABEL_ATTRS[i]) || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!value || value.length > 24) continue;
      for (var j = 0; j < WORDS.length; j++) {
        /* 精确匹配：aria-label / title 必须正好是「广告 / 赞助 / Sponsored」这类
         * 官方标签；包含式判断会误伤 ad-mark、advertising、付费推广标记（辅助）等 */
        if (value === WORDS[j]) return true;
      }
      /* 极短标注（≤6 字符）里出现强特征词才算（如「百度广告」）；
       * 长词组一律不算，避免把功能入口当成推广标注 */
      if (value.length <= 6) {
        for (var k = 0; k < STRONG.length; k++) {
          if (value.indexOf(STRONG[k]) !== -1) return true;
        }
      }
    }
    var cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    return /(^|[-_])(ad|ads|advert|advertisement|tuiguang|guanggao|sponsored)([-_]|$)/.test(cls);
  }

  function hasMarkedAncestor(el) {
    for (var p = el && el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (p.hasAttribute && p.hasAttribute('data-ppm-mark')) return true;
    }
    return false;
  }

  /* 站点自身的导航/菜单（如 GitHub 右上角头像菜单里的「赞助」入口）是功能按钮，
   * 不是推广标注，一律不标记，避免误伤。 */
  function inSiteChrome(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      'header,nav,[role="banner"],[role="navigation"],' +
      '[role="menu"],[role="menubar"],[role="menuitem"]'
    );
  }

  function isInline(el) {
    var tag = (el && el.tagName || '').toUpperCase();
    return tag === 'A' || tag === 'SPAN' || tag === 'EM' || tag === 'I' ||
      tag === 'B' || tag === 'LABEL' || tag === 'SMALL' || tag === 'STRONG';
  }

  function isRankRow(el) {
    var tag = (el && el.tagName || '').toUpperCase();
    var cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    return tag === 'LI' || /(^|[-_])(hot-rank|rank\d+|fz-mid)([-_]|$)/.test(cls);
  }

  /* 从徽标向上找「结果条目容器」：有链接、高度合理；找不到就返回 null 不标 */
  function container(badge) {
    var el = badge;
    var fallback = null;
    for (var i = 0; i < 9 && el && el !== document.documentElement; i++) {
      var link = el.querySelector ? el.querySelector('a[href]') : null;
      var h = el.offsetHeight || 0;
      var linkCount = el.querySelectorAll ? el.querySelectorAll('a[href]').length : 1;
      if (link && !isInline(el) && h >= 18 && h <= 900) {
        if (!fallback) fallback = el;
        /* 热搜/榜单行通常只有 1 个链接且高度很小，优先取这一行，
         * 不要一路爬到包含 20 条热搜的整块侧栏。 */
        if (isRankRow(el) || (h <= 260 && linkCount <= 8)) return el;
        if (h >= 32 && linkCount <= 12) return el;
      }
      el = el.parentElement;
    }
    return fallback;
  }

  function buildTip(badge) {
    var tip = document.createElement('div');
    tip.className = 'ppm-tip';
    tip.textContent = DISCLAIMER;
    tip.setAttribute('role', 'note');
    document.documentElement.appendChild(tip);
    var r = badge.getBoundingClientRect();
    var w = 340;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left - w + 44));
    var top = r.bottom + 6;
    if (top + 70 > window.innerHeight) top = Math.max(8, r.top - 76);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    return tip;
  }

  function mark(el) {
    if (!el || el.hasAttribute('data-ppm-mark') || hasMarkedAncestor(el)) return;
    el.setAttribute('data-ppm-mark', '1');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    var badge = document.createElement('div');
    badge.className = 'ppm-badge';
    badge.textContent = BADGE_TEXT;
    badge.setAttribute('role', 'note');
    badge.setAttribute('aria-label', DISCLAIMER);
    /* 不设 title 属性：会触发浏览器原生白色提示，和自绘说明框重复 */
    if (isRankRow(el)) badge.setAttribute('data-ppm-compact', '1');

    var tip = null;
    var show = function () { if (!tip) tip = buildTip(badge); };
    var hide = function () { if (tip) { tip.remove(); tip = null; } };
    badge.addEventListener('mouseenter', show);
    badge.addEventListener('mouseleave', hide);

    el.appendChild(badge);
  }

  function scan() {
    var i, c;
    var specials = document.querySelectorAll(SPECIAL_SEL);
    for (i = 0; i < specials.length; i++) {
      c = container(specials[i]);
      if (c) mark(c);
    }
    var all = document.querySelectorAll('span,a,div,label,em,i,b,small,strong,mark');
    for (var j = 0; j < all.length; j++) {
      var n = all[j];
      if (n.hasAttribute && n.hasAttribute('data-ppm-mark')) continue;
      if (hasMarkedAncestor(n)) continue;
      if (inSiteChrome(n)) continue;
      if (n.children && n.children.length > 1) continue;
      if (!isBadge(n.textContent) && !hasSemanticMarker(n)) continue;
      var r = n.getBoundingClientRect();
      if (r.width > 120 || r.height > 40) continue;
      c = container(n);
      if (c) mark(c);
    }
    window.__ppmMarks = document.querySelectorAll('[data-ppm-mark]').length;
    return window.__ppmMarks;
  }

  window.__ppmMark = { scan: scan };

  function start() {
    scan();
    var mo = new MutationObserver(function () {
      clearTimeout(window.__ppmT);
      window.__ppmT = setTimeout(scan, 600); // 动态加载 / 翻页，防抖
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
