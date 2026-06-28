const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		if (notification === "FETCH_RSS") {
			this.fetchRss(payload);
		}

		if (notification === "FETCH_ARTICLE") {
			this.fetchArticle(payload);
		}
	},

	fetchRss: async function (payload) {
		try {
			const response = await fetch(payload.feedUrl, {
				headers: {
					"User-Agent": "MagicMirror-RSSPanel/1.0"
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const xml = await response.text();
			const items = parseRss(xml, payload.maxItems || 20);

			this.sendSocketNotification("RSS_ITEMS", { items });
		} catch (error) {
			this.sendSocketNotification("RSS_ERROR", {
				error: error.message
			});
		}
	},

	fetchArticle: async function (payload) {
		const link = payload.link || "";
		const maxChars = payload.maxChars || 2200;
		const timeoutMs = payload.timeoutMs || 10000;

		if (!link) {
			this.sendSocketNotification("ARTICLE_ERROR", {
				link,
				error: "No article link was provided."
			});
			return;
		}

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
				throw new Error(`HTTP ${response.status}`);
			}

			const html = await response.text();
			const articleText = extractArticleText(html, maxChars);

			if (!articleText) {
				throw new Error("Could not extract readable article text.");
			}

			this.sendSocketNotification("ARTICLE_TEXT", {
				link,
				text: articleText
			});
		} catch (error) {
			clearTimeout(timeout);

			this.sendSocketNotification("ARTICLE_ERROR", {
				link,
				error: error.name === "AbortError" ? "Article fetch timed out." : error.message
			});
		}
	}
});

function parseRss(xml, maxItems) {
	const itemRegex = /<item[\s\S]*?<\/item>/gi;
	const blocks = xml.match(itemRegex) || [];
	const seen = new Set();
	const results = [];

	for (const block of blocks) {
		const title = cleanText(extractTag(block, "title"));
		const description = cleanText(extractTag(block, "description"));
		const link = cleanText(extractTag(block, "link"));
		const pubDate = cleanText(extractTag(block, "pubDate"));

		if (!title) {
			continue;
		}

		const dedupeKey = title.toLowerCase().replace(/\s+/g, " ").trim();

		if (seen.has(dedupeKey)) {
			continue;
		}

		seen.add(dedupeKey);

		const timestamp = Date.parse(pubDate) || 0;

		results.push({
			title,
			description,
			link,
			pubDate,
			timestamp,
			relativeTime: relativeTime(pubDate)
		});
	}

	results.sort((a, b) => {
		return b.timestamp - a.timestamp;
	});

	return results.slice(0, maxItems).map((item) => {
		return {
			title: item.title,
			description: item.description,
			link: item.link,
			pubDate: item.pubDate,
			relativeTime: item.relativeTime
		};
	});
}

function extractArticleText(html, maxChars) {
	const cleanedHtml = String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
		.replace(/<svg[\s\S]*?<\/svg>/gi, "")
		.replace(/<picture[\s\S]*?<\/picture>/gi, "")
		.replace(/<figure[\s\S]*?<\/figure>/gi, "")
		.replace(/<form[\s\S]*?<\/form>/gi, "")
		.replace(/<nav[\s\S]*?<\/nav>/gi, "")
		.replace(/<header[\s\S]*?<\/header>/gi, "")
		.replace(/<footer[\s\S]*?<\/footer>/gi, "");

	const articleBlock =
		extractHtmlBlock(cleanedHtml, "article") ||
		extractHtmlBlock(cleanedHtml, "main") ||
		cleanedHtml;

	const paragraphs = extractParagraphs(articleBlock);

	if (paragraphs.length > 0) {
		return limitText(paragraphs.join("\n\n"), maxChars);
	}

	const metaDescription =
		extractMetaDescription(cleanedHtml, "description") ||
		extractMetaDescription(cleanedHtml, "og:description") ||
		extractMetaDescription(cleanedHtml, "twitter:description");

	return limitText(cleanText(metaDescription), maxChars);
}

function extractHtmlBlock(html, tag) {
	const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
	const match = html.match(regex);
	return match ? match[1] : "";
}

function extractParagraphs(html) {
	const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
	const paragraphs = [];
	const seen = new Set();
	let match;

	while ((match = pRegex.exec(html)) !== null) {
		const text = cleanText(match[1]);

		if (!isUsefulParagraph(text)) {
			continue;
		}

		const key = text.toLowerCase();

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		paragraphs.push(text);
	}

	return paragraphs;
}

function isUsefulParagraph(text) {
	if (!text || text.length < 35) {
		return false;
	}

	const junkPatterns = [
		/^image source/i,
		/^image caption/i,
		/^watch:/i,
		/^listen:/i,
		/^published/i,
		/^follow bbc/i,
		/^bbc is not responsible/i,
		/^external sites/i,
		/^related topics/i,
		/^more on this story/i,
		/^sign up/i,
		/^subscribe/i,
		/^cookies/i,
		/^privacy/i,
		/^terms/i,
		/^advertisement/i
	];

	return !junkPatterns.some((pattern) => pattern.test(text));
}

function extractMetaDescription(html, name) {
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const nameRegex = new RegExp(
		`<meta\\b[^>]*(?:name|property)=["']${escapedName}["'][^>]*content=["']([^"']+)["'][^>]*>`,
		"i"
	);

	const contentFirstRegex = new RegExp(
		`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escapedName}["'][^>]*>`,
		"i"
	);

	const match = html.match(nameRegex) || html.match(contentFirstRegex);
	return match ? match[1] : "";
}

function limitText(text, maxChars) {
	const clean = String(text || "").trim();

	if (!clean) {
		return "";
	}

	if (clean.length <= maxChars) {
		return clean;
	}

	const cut = clean.slice(0, maxChars);
	const lastSentence = Math.max(
		cut.lastIndexOf(". "),
		cut.lastIndexOf("! "),
		cut.lastIndexOf("? ")
	);

	if (lastSentence > Math.floor(maxChars * 0.55)) {
		return cut.slice(0, lastSentence + 1).trim();
	}

	return cut.trim() + "…";
}

function extractTag(text, tag) {
	const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
	const match = text.match(regex);
	return match ? match[1] : "";
}

function cleanText(text) {
	return String(text || "")
		.replace(/<!\[CDATA\[/g, "")
		.replace(/\]\]>/g, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
		.replace(/\s+/g, " ")
		.trim();
}

function relativeTime(pubDate) {
	const date = new Date(pubDate);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	const diffMs = Date.now() - date.getTime();
	const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

	if (diffMinutes < 1) {
		return "just now";
	}

	if (diffMinutes < 60) {
		return `${diffMinutes} minutes ago`;
	}

	const hours = Math.floor(diffMinutes / 60);

	if (hours === 1) {
		return "an hour ago";
	}

	if (hours < 24) {
		return `${hours} hours ago`;
	}

	const days = Math.floor(hours / 24);
	return days === 1 ? "yesterday" : `${days} days ago`;
}
