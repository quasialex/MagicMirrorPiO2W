Module.register("MMM-KumaBars", {
	defaults: {
		baseUrl: "",
		statusPage: "services",
		historyHours: 24,
		bucketMinutes: 60,
		refreshInterval: 5 * 60 * 1000,
		showGroupHeaders: true,
		showAvailability: true,
		showCurrentStatus: true
	},

	start: function () {
		this.groups = [];
		this.loaded = false;
		this.error = null;

		this.fetchData();

		this.timer = setInterval(() => {
			this.fetchData();
		}, this.config.refreshInterval);
	},

	fetchData: function () {
		this.sendSocketNotification("KUMA_BARS_FETCH", {
			instanceId: this.identifier,
			baseUrl: this.config.baseUrl,
			statusPage: this.config.statusPage,
			historyHours: this.config.historyHours,
			bucketMinutes: this.config.bucketMinutes
		});
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "kuma-bars";

		if (this.error) {
			const error = document.createElement("div");
			error.className = "kuma-bars-error";
			error.textContent = this.error;
			wrapper.appendChild(error);
			return wrapper;
		}

		if (!this.loaded) {
			const loading = document.createElement("div");
			loading.className = "kuma-bars-loading";
			loading.textContent = "Loading service history...";
			wrapper.appendChild(loading);
			return wrapper;
		}

		const scroller = document.createElement("div");
		scroller.className = "kuma-bars-scroll";

		this.groups.forEach((group) => {
			const groupBlock = document.createElement("div");
			groupBlock.className = "kuma-group";

			if (this.config.showGroupHeaders) {
				const title = document.createElement("div");
				title.className = "kuma-group-title";
				title.textContent = group.name;
				groupBlock.appendChild(title);
			}

			group.monitors.forEach((monitor) => {
				const row = document.createElement("div");
				row.className = `kuma-row kuma-row-${monitor.statusClass || "unknown"}`;

				const name = document.createElement("div");
				name.className = "kuma-name";
				name.textContent = monitor.name;

				const status = document.createElement("div");
				status.className = `kuma-status ${monitor.statusClass || "unknown"}`;
				status.textContent = this.config.showCurrentStatus ? monitor.statusText : "";

				const availability = document.createElement("div");
				availability.className = "kuma-availability";
				availability.textContent = this.config.showAvailability ? monitor.availabilityText : "";

				const history = document.createElement("div");
				history.className = "kuma-history";

				(monitor.bars || []).forEach((bar) => {
					const b = document.createElement("div");
					b.className = `kuma-bar kuma-bar-${bar.state}`;
					b.title = bar.label || "";
					history.appendChild(b);
				});

				row.appendChild(name);
				row.appendChild(status);
				row.appendChild(availability);
				row.appendChild(history);

				groupBlock.appendChild(row);
			});

			scroller.appendChild(groupBlock);
		});

		wrapper.appendChild(scroller);
		return wrapper;
	},

	socketNotificationReceived: function (notification, payload) {
		if (!payload || payload.instanceId !== this.identifier) {
			return;
		}

		if (notification === "KUMA_BARS_DATA") {
			this.groups = payload.groups || [];
			this.loaded = true;
			this.error = null;
			this.updateDom(0);
		}

		if (notification === "KUMA_BARS_ERROR") {
			this.error = payload.error || "Could not load Uptime Kuma data.";
			this.loaded = true;
			this.updateDom(0);
		}
	}
});
