Module.register("MMM-TouchRouter", {
	defaults: {
		homePage: 0,
		routes: []
	},

	start: function () {
		this.currentPage = this.config.homePage;
		this.articleMode = false;

		this.boundDocumentClick = this.handleDocumentClick.bind(this);
		document.addEventListener("click", this.boundDocumentClick, true);

		this.stateTimer = setInterval(() => {
			const nextArticleMode = document.body.classList.contains("rss-article-open");

			if (nextArticleMode !== this.articleMode) {
				this.articleMode = nextArticleMode;
				this.updateDom(0);
			}
		}, 250);
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "touch-router-wrapper";

		const shouldHide =
			this.currentPage === this.config.homePage &&
			!document.body.classList.contains("rss-article-open");

		if (shouldHide) {
			wrapper.classList.add("touch-router-hidden");
		}

		const button = document.createElement("button");
		button.className = "touch-router-home";
		button.innerText = "Back";

		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.handleBack();
		});

		wrapper.appendChild(button);
		return wrapper;
	},

	handleBack: function () {
		if (document.body.classList.contains("rss-article-open")) {
			this.sendNotification("RSS_BACK");
			return;
		}

		if (document.body.classList.contains("calendar-event-open")) {
			this.sendNotification("CALENDAR_BACK");
			return;
		}

		if (this.currentPage !== this.config.homePage) {
			this.currentPage = this.config.homePage;
			this.sendNotification("PAGE_SELECT", this.config.homePage);
			this.updateDom(0);
		}
	},

	handleDocumentClick: function (event) {
		if (!event.target || !event.target.closest) {
			return;
		}

		if (event.target.closest(".touch-router-home")) {
			return;
		}

		if (document.body.classList.contains("rss-article-open")) {
			return;
		}

		for (const route of this.config.routes) {
			if (!route.selector) {
				continue;
			}

			if (event.target.closest(route.selector)) {
				event.preventDefault();
				event.stopPropagation();

				if (typeof route.payload === "number") {
					this.currentPage = route.payload;
				}

				this.sendNotification(route.notification || "PAGE_SELECT", route.payload);
				this.updateDom(0);
				return;
			}
		}
	}
});
