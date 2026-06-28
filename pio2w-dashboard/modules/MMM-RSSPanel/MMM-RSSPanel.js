Module.register("MMM-RSSPanel", {
	defaults: {
		feedUrl: "",
		maxItems: 20,
		refreshInterval: 30 * 60 * 1000,
		articleCacheHours: 24,
		articleMaxChars: 12000,
		articleTimeoutMs: 12000
	},

	start: function () {
		this.items = [];
		this.loaded = false;
		this.error = null;

		this.selectedItem = null;
		this.articleLoading = false;
		this.articleError = null;
		this.articleText = "";

		this.fetchItems();

		setInterval(() => {
			this.fetchItems();
		}, this.config.refreshInterval);
	},

	fetchItems: function () {
		this.sendSocketNotification("FETCH_RSS", {
			feedUrl: this.config.feedUrl,
			maxItems: this.config.maxItems
		});
	},

	fetchArticle: function (item) {
		if (!item || !item.link) {
			this.articleLoading = false;
			this.articleError = "No article link was found in the RSS item.";
			this.articleText = "";
			this.updateDom(0);
			return;
		}

		this.articleLoading = true;
		this.articleError = null;
		this.articleText = "";

		this.sendSocketNotification("FETCH_ARTICLE", {
			link: item.link,
			maxChars: this.config.articleMaxChars,
			timeoutMs: this.config.articleTimeoutMs,
			cacheHours: this.config.articleCacheHours
		});
	},

	closeArticle: function () {
		this.selectedItem = null;
		this.articleLoading = false;
		this.articleError = null;
		this.articleText = "";
		document.body.classList.remove("rss-article-open");
		this.updateDom(0);
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "rss-panel";

		if (this.selectedItem) {
			document.body.classList.add("rss-article-open");
		} else {
			document.body.classList.remove("rss-article-open");
		}

		if (this.error) {
			const error = document.createElement("div");
			error.className = "rss-error";
			error.innerText = this.error;
			wrapper.appendChild(error);
			return wrapper;
		}

		if (!this.loaded) {
			const loading = document.createElement("div");
			loading.className = "rss-loading";
			loading.innerText = "Loading news...";
			wrapper.appendChild(loading);
			return wrapper;
		}

		if (this.selectedItem) {
			return this.renderArticle(wrapper, this.selectedItem);
		}

		return this.renderList(wrapper);
	},

	renderList: function (wrapper) {
		const scroller = document.createElement("div");
		scroller.className = "rss-panel-scroll";

		if (!this.items.length) {
			const empty = document.createElement("div");
			empty.className = "rss-empty";
			empty.innerText = "No news items found.";
			scroller.appendChild(empty);
			wrapper.appendChild(scroller);
			return wrapper;
		}

		let isPointerDown = false;
		let didDrag = false;
		let startY = 0;
		let startScrollTop = 0;

		const getY = (event) => {
			if (event.touches && event.touches.length > 0) {
				return event.touches[0].clientY;
			}
			return event.clientY;
		};

		const beginDrag = (event) => {
			isPointerDown = true;
			didDrag = false;
			startY = getY(event);
			startScrollTop = scroller.scrollTop;
		};

		const moveDrag = (event) => {
			if (!isPointerDown) {
				return;
			}

			const currentY = getY(event);
			const deltaY = currentY - startY;

			if (Math.abs(deltaY) > 4) {
				didDrag = true;
			}

			scroller.scrollTop = startScrollTop - deltaY;

			if (event.cancelable) {
				event.preventDefault();
			}
		};

		const endDrag = () => {
			isPointerDown = false;

			setTimeout(() => {
				didDrag = false;
			}, 100);
		};

		scroller.addEventListener("touchstart", beginDrag, { passive: true });
		scroller.addEventListener("touchmove", moveDrag, { passive: false });
		scroller.addEventListener("touchend", endDrag);

		scroller.addEventListener("mousedown", beginDrag);
		scroller.addEventListener("mousemove", moveDrag);
		scroller.addEventListener("mouseup", endDrag);
		scroller.addEventListener("mouseleave", endDrag);

		this.items.forEach((item) => {
			const article = document.createElement("div");
			article.className = "rss-item rss-clickable";

			const meta = document.createElement("div");
			meta.className = "rss-meta";
			meta.innerText = item.relativeTime || "";

			const title = document.createElement("div");
			title.className = "rss-title";
			title.innerText = item.title || "Untitled article";

			const desc = document.createElement("div");
			desc.className = "rss-desc";
			desc.innerText = item.description || "";

			article.appendChild(meta);
			article.appendChild(title);

			if (item.description) {
				article.appendChild(desc);
			}

			article.addEventListener("click", (event) => {
				if (didDrag) {
					event.preventDefault();
					return;
				}

				this.selectedItem = item;
				this.fetchArticle(item);
				this.updateDom(0);
			});

			scroller.appendChild(article);
		});

		wrapper.appendChild(scroller);
		return wrapper;
	},

	renderArticle: function (wrapper, item) {
		wrapper.classList.add("rss-article-panel");

		const scroller = document.createElement("div");
		scroller.className = "rss-article-scroll";

		const meta = document.createElement("div");
		meta.className = "rss-article-meta";
		meta.innerText = item.relativeTime || "";

		const title = document.createElement("div");
		title.className = "rss-article-title";
		title.innerText = item.title || "Untitled article";

		const body = document.createElement("div");
		body.className = "rss-article-body";

		if (this.articleLoading) {
			body.innerText = "Loading article...";
		} else if (this.articleError) {
			body.innerText = "Could not load full article:\n" + this.articleError + "\n\nRSS summary:\n" + (item.description || "No RSS summary available.");
		} else if (this.articleText) {
			body.innerText = this.articleText;
		} else {
			body.innerText = item.description || "No article text available.";
		}

		scroller.appendChild(meta);
		scroller.appendChild(title);
		scroller.appendChild(body);

		this.attachDragScroll(scroller);

		wrapper.appendChild(scroller);
		return wrapper;
	},

	attachDragScroll: function (scroller) {
		let isPointerDown = false;
		let startY = 0;
		let startScrollTop = 0;

		const getY = (event) => {
			if (event.touches && event.touches.length > 0) {
				return event.touches[0].clientY;
			}
			return event.clientY;
		};

		const beginDrag = (event) => {
			isPointerDown = true;
			startY = getY(event);
			startScrollTop = scroller.scrollTop;
		};

		const moveDrag = (event) => {
			if (!isPointerDown) {
				return;
			}

			const currentY = getY(event);
			const deltaY = currentY - startY;
			scroller.scrollTop = startScrollTop - deltaY;

			if (event.cancelable) {
				event.preventDefault();
			}
		};

		const endDrag = () => {
			isPointerDown = false;
		};

		scroller.addEventListener("touchstart", beginDrag, { passive: true });
		scroller.addEventListener("touchmove", moveDrag, { passive: false });
		scroller.addEventListener("touchend", endDrag);

		scroller.addEventListener("mousedown", beginDrag);
		scroller.addEventListener("mousemove", moveDrag);
		scroller.addEventListener("mouseup", endDrag);
		scroller.addEventListener("mouseleave", endDrag);
	},

	notificationReceived: function (notification) {
		if (notification === "RSS_BACK" && this.selectedItem) {
			this.closeArticle();
		}
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "RSS_ITEMS") {
			this.items = payload.items || [];
			this.loaded = true;
			this.error = null;
			this.updateDom(0);
		}

		if (notification === "RSS_ERROR") {
			this.error = payload.error || "Could not load RSS feed.";
			this.loaded = true;
			this.updateDom(0);
		}

		if (notification === "ARTICLE_TEXT") {
			if (!this.selectedItem || payload.link !== this.selectedItem.link) {
				return;
			}

			this.articleLoading = false;
			this.articleError = null;
			this.articleText = payload.text || "";
			this.updateDom(0);
		}

		if (notification === "ARTICLE_ERROR") {
			if (!this.selectedItem || payload.link !== this.selectedItem.link) {
				return;
			}

			this.articleLoading = false;
			this.articleError = payload.error || "Could not load article text.";
			this.articleText = "";
			this.updateDom(0);
		}
	}
});
