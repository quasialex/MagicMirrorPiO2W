const NodeHelper = require("node_helper");

let Readability = null;
let JSDOM = null;
let VirtualConsole = null;

function loadReadabilityStack() {
  if (!Readability || !JSDOM || !VirtualConsole) {
    ({ Readability } = require("@mozilla/readability"));
    ({ JSDOM, VirtualConsole } = require("jsdom"));
  }

  return { Readability, JSDOM, VirtualConsole };
}

module.exports = NodeHelper.create({
  start: function () {
    this.articleCache = new Map();
    this.articleInFlight = new Map();

    this.defaultMaxChars = 12000;
    this.defaultTimeoutMs = 12000;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_RSS") {
      this.fetchRss(payload || {});
    }

    if (notification === "FETCH_ARTICLE") {
      this.fetchArticle(payload || {});
    }
  },

  fetchRss: async function (payload) {
    try {
      const feedUrl = payload.feedUrl || "";

      if (!feedUrl) {
        throw new Error("No RSS feed URL configured.");
      }

      this.cleanupCache();

      const response = await fetch(feedUrl, {
        headers: {
          "User-Agent": "MagicMirror-RSSPanel/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`RSS HTTP ${response.status}`);
      }

      const xml = await response.text();
      const items = parseRss(xml, payload.maxItems || 20);

      console.log(`[MMM-RSSPanel] RSS loaded: ${items.length} items`);

      this.sendSocketNotification("RSS_ITEMS", { items });
    } catch (error) {
      console.warn(`[MMM-RSSPanel] RSS error: ${error.message}`);
      this.sendSocketNotification("RSS_ERROR", {
        error: error.message
      });
    }
  },

  fetchArticle: async function (payload) {
    const link = payload.link || "";
    const maxChars = payload.maxChars || this.defaultMaxChars;
    const timeoutMs = payload.timeoutMs || this.defaultTimeoutMs;
    const cacheHours = payload.cacheHours || 24;
    const cacheTtlMs = Math.max(1, Number(cacheHours)) * 60 * 60 * 1000;

    if (!link) {
      this.sendSocketNotification("ARTICLE_ERROR", {
        link,
        error: "No article link was provided."
      });
      return;
    }

    try {
      const cached = this.getCachedArticle(link);

      if (cached) {
        console.log(`[MMM-RSSPanel] Article cache hit: ${link}`);
        this.sendSocketNotification("ARTICLE_TEXT", {
          link,
          text: cached.text,
          cached: true
        });
        return;
      }

      console.log(`[MMM-RSSPanel] Fetching article: ${link}`);

      const article = await this.fetchAndCacheArticle({
        link,
        maxChars,
        timeoutMs,
        cacheTtlMs
      });

      console.log(`[MMM-RSSPanel] Article loaded: ${article.text.length} chars`);

      this.sendSocketNotification("ARTICLE_TEXT", {
        link,
        text: article.text,
        cached: false
      });
    } catch (error) {
      console.warn(`[MMM-RSSPanel] Article error for ${link}: ${error.message}`);

      this.sendSocketNotification("ARTICLE_ERROR", {
        link,
        error: error.name === "AbortError" ? "Article fetch timed out." : error.message
      });
    }
  },

  fetchAndCacheArticle: async function ({ link, maxChars, timeoutMs, cacheTtlMs }) {
    const key = cacheKey(link);
    const cached = this.getCachedArticle(link);

    if (cached) {
      return cached;
    }

    if (this.articleInFlight.has(key)) {
      return this.articleInFlight.get(key);
    }

    const promise = this.extractArticleFromNetwork({
      link,
      maxChars,
      timeoutMs,
      cacheTtlMs
    });

    this.articleInFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      this.articleInFlight.delete(key);
    }
  },

  extractArticleFromNetwork: async function ({ link, maxChars, timeoutMs, cacheTtlMs }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(link, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux arm64) AppleWebKit/537.36 MagicMirror-RSSPanel/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9"
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Article HTTP ${response.status}`);
      }

      const html = await response.text();
      const text = extractArticleText(html, maxChars, link);

      if (!text || text.length < 80) {
        throw new Error("Could not extract readable article text.");
      }

      const article = {
        link,
        text,
        cachedAt: Date.now(),
        expiresAt: Date.now() + cacheTtlMs
      };

      this.articleCache.set(cacheKey(link), article);
      this.trimCache();

      return article;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  },

  getCachedArticle: function (link) {
    const cached = this.articleCache.get(cacheKey(link));

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.articleCache.delete(cacheKey(link));
      return null;
    }

    return cached;
  },

  cleanupCache: function () {
    const now = Date.now();

    for (const [key, value] of this.articleCache.entries()) {
      if (!value || value.expiresAt <= now) {
        this.articleCache.delete(key);
      }
    }
  },

  trimCache: function () {
    const maxEntries = 80;

    if (this.articleCache.size <= maxEntries) {
      return;
    }

    const entries = Array.from(this.articleCache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    while (entries.length > maxEntries) {
      const [key] = entries.shift();
      this.articleCache.delete(key);
    }
  }
});

function parseRss(xml, maxItems) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const seen = new Set();
  const results = [];

  for (const block of blocks) {
    const title = cleanText(extractTag(block, "title"));
    const description = cleanText(extractTag(block, "description"));
    const link = cleanText(extractTag(block, "link"));
    const pubDate = cleanText(extractTag(block, "pubDate"));

    if (!title || !link) {
      continue;
    }

    const dedupeKey = title.toLowerCase().replace(/\s+/g, " ").trim();

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    results.push({
      title,
      description,
      link,
      pubDate,
      timestamp: Date.parse(pubDate) || 0,
      relativeTime: relativeTime(pubDate)
    });
  }

  results.sort((a, b) => b.timestamp - a.timestamp);

  return results.slice(0, maxItems).map((item) => ({
    title: item.title,
    description: item.description,
    link: item.link,
    pubDate: item.pubDate,
    relativeTime: item.relativeTime
  }));
}

function extractArticleText(html, maxChars, url) {
  const readabilityText = extractWithReadability(html, maxChars, url);

  if (readabilityText) {
    return readabilityText;
  }

  const cleanedHtml = stripHeavyHtmlForReadability(html)
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  const articleBlock =
    extractHtmlBlock(cleanedHtml, "article") ||
    extractHtmlBlock(cleanedHtml, "main") ||
    cleanedHtml;

  const paragraphs = extractParagraphs(articleBlock);

  if (paragraphs.length > 0) {
    return limitText(paragraphs.join("\n\n"), maxChars);
  }

  const description =
    extractMetaDescription(html, "description") ||
    extractMetaDescription(html, "og:description") ||
    extractMetaDescription(html, "twitter:description");

  return description ? limitText(description, maxChars) : "";
}

function extractWithReadability(html, maxChars, url) {
  let dom = null;

  try {
    const { Readability, JSDOM, VirtualConsole } = loadReadabilityStack();

    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", () => {});

    dom = new JSDOM(stripHeavyHtmlForReadability(html), {
      url: url || "https://www.bbc.com/",
      contentType: "text/html",
      virtualConsole
    });

    const reader = new Readability(dom.window.document, {
      keepClasses: false
    });

    const article = reader.parse();

    if (!article) {
      return "";
    }

    if (article.content) {
      const paragraphs = extractParagraphs(article.content);
      const paragraphText = paragraphs.join("\n\n").trim();

      if (paragraphText.length >= 120) {
        return limitText(paragraphText, maxChars);
      }
    }

    if (article.textContent) {
      const text = cleanArticleText(article.textContent);

      if (text && text.length >= 120) {
        return limitText(text, maxChars);
      }
    }

    return "";
  } catch (error) {
    return "";
  } finally {
    if (dom && dom.window) {
      dom.window.close();
    }
  }
}

function stripHeavyHtmlForReadability(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<button[\s\S]*?<\/button>/gi, " ")
    .replace(/<link\b[^>]*>/gi, " ")
    .replace(/<meta\b[^>]*>/gi, " ");
}

function extractHtmlBlock(html, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1] : "";
}

function extractParagraphs(html) {
  const paragraphs = [];
  const paragraphRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  let match;

  while ((match = paragraphRegex.exec(html)) !== null) {
    const text = cleanText(
      match[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );

    if (!text) {
      continue;
    }

    if (isArticleStopText(text)) {
      break;
    }

    if (isNonArticleText(text)) {
      continue;
    }

    paragraphs.push(text);
  }

  return paragraphs;
}

function isArticleStopText(text) {
  const clean = text.trim();

  return (
    /^(more on this story|related topics|related links|read more|you may also like|watch more|listen now|around the bbc|elsewhere on the bbc)$/i.test(clean) ||
    /^(are you affected|have you been affected|do you have a similar story|share your experience)/i.test(clean) ||
    /^(go to bbc|follow us on|follow bbc|sign up|subscribe)/i.test(clean) ||
    /bbc is not responsible for the content of external sites/i.test(clean)
  );
}

function isNonArticleText(text) {
  const clean = text.trim();

  return (
    clean.length < 35 ||
    /^(share|save|listen|watch|follow|subscribe|sign up|read more|more on this story|related topics|related links)$/i.test(clean) ||
    /^image source,/i.test(clean) ||
    /^image caption,/i.test(clean) ||
    /^media caption,/i.test(clean)
  );
}

function extractTag(text, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = text.match(regex);

  if (!match) {
    return "";
  }

  return stripCdata(match[1]);
}

function stripCdata(text) {
  return String(text || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "");
}

function extractMetaDescription(html, name) {
  const regexes = [
    new RegExp(`<meta\\s+name=["']${escapeRegExp(name)}["']\\s+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${escapeRegExp(name)}["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+property=["']${escapeRegExp(name)}["']\\s+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${escapeRegExp(name)}["'][^>]*>`, "i")
  ];

  for (const regex of regexes) {
    const match = html.match(regex);

    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function cleanArticleText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function limitText(text, maxChars) {
  const clean = String(text || "").trim();

  if (!maxChars || clean.length <= maxChars) {
    return clean;
  }

  return clean.slice(0, maxChars).replace(/\s+\S*$/, "").trim() + "…";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativeTime(pubDate) {
  const timestamp = Date.parse(pubDate);

  if (!timestamp) {
    return "";
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function cacheKey(link) {
  return String(link || "").split("#")[0].trim();
}
