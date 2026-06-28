Module.register("MMM-KumaSummary", {
	defaults: {
		baseUrl: "",
		statusPage: "home",
		detailPage: 4,
		updateInterval: 5 * 60 * 1000,
		rows: ["Server", "NextCloud", "Network", "Website"]
	},

	start: function () {
		this.rows = this.config.rows.map((name) => ({
			name,
			status: "Checking",
			state: "checking"
		}));

		this.fetchStatus();

		setInterval(() => {
			this.fetchStatus();
		}, this.config.updateInterval);
	},

	getStyles: function () {
		return ["MMM-KumaSummary.css"];
	},

	fetchStatus: function () {
		this.sendSocketNotification("FETCH_KUMA_SUMMARY", {
			baseUrl: this.config.baseUrl,
			statusPage: this.config.statusPage,
			rows: this.config.rows
		});
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "kuma-summary";

		wrapper.addEventListener("click", () => {
			this.sendNotification("PAGE_SELECT", this.config.detailPage);
		});

		this.rows.forEach((row) => {
			const line = document.createElement("div");
			line.className = `kuma-summary-row kuma-${row.state}`;

			const name = document.createElement("span");
			name.className = "kuma-summary-name";
			name.innerText = row.name;

			const status = document.createElement("span");
			status.className = "kuma-summary-status";
			status.innerText = row.status;

			line.appendChild(name);
			line.appendChild(status);
			wrapper.appendChild(line);
		});

		return wrapper;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "KUMA_SUMMARY_RESULT") {
			this.rows = payload.rows;
			this.updateDom(0);
		}
	}
});
