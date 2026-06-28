const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		if (notification === "FETCH_KUMA_SUMMARY") {
			this.fetchSummary(payload);
		}
	},

	fetchSummary: async function (payload) {
		try {
			const baseUrl = String(payload.baseUrl || "").replace(/\/$/, "");
			const slug = payload.statusPage || "home";

			const pageUrl = `${baseUrl}/api/status-page/${slug}`;
			const heartbeatUrl = `${baseUrl}/api/status-page/heartbeat/${slug}`;

			const [pageResponse, heartbeatResponse] = await Promise.all([
				fetch(pageUrl),
				fetch(heartbeatUrl)
			]);

			if (!pageResponse.ok) {
				throw new Error(`Status page HTTP ${pageResponse.status}`);
			}

			if (!heartbeatResponse.ok) {
				throw new Error(`Heartbeat HTTP ${heartbeatResponse.status}`);
			}

			const pageData = await pageResponse.json();
			const heartbeatData = await heartbeatResponse.json();

			const rows = buildRows(pageData, heartbeatData, payload.rows || []);

			this.sendSocketNotification("KUMA_SUMMARY_RESULT", { rows });
		} catch (error) {
			const rows = (payload.rows || ["Server", "NextCloud", "Network", "Website"]).map((name) => ({
				name,
				status: "Unknown",
				state: "unknown"
			}));

			this.sendSocketNotification("KUMA_SUMMARY_RESULT", { rows });
		}
	}
});

function buildRows(pageData, heartbeatData, wantedRows) {
	const groups = pageData.publicGroupList || [];
	const heartbeatList = heartbeatData.heartbeatList || {};

	return wantedRows.map((wantedName) => {
		const group = findGroupOrMonitorGroup(groups, wantedName);

		if (!group) {
			return {
				name: wantedName,
				status: "Missing",
				state: "unknown"
			};
		}

		const monitorStatuses = (group.monitorList || []).map((monitor) => {
			const latest = latestHeartbeat(heartbeatList[String(monitor.id)]);
			return latest ? latest.status : null;
		});

		const state = summarizeStatuses(monitorStatuses);

		return {
			name: wantedName,
			status: labelForState(state),
			state
		};
	});
}

function findGroupOrMonitorGroup(groups, wantedName) {
	const wanted = normalize(wantedName);

	let group = groups.find((g) => normalize(g.name) === wanted);

	if (group) {
		return group;
	}

	for (const g of groups) {
		const matchingMonitors = (g.monitorList || []).filter((m) => normalize(m.name).includes(wanted));

		if (matchingMonitors.length > 0) {
			return {
				name: wantedName,
				monitorList: matchingMonitors
			};
		}
	}

	return null;
}

function latestHeartbeat(list) {
	if (!Array.isArray(list) || list.length === 0) {
		return null;
	}

	return list.reduce((latest, current) => {
		if (!latest) {
			return current;
		}

		const latestTime = new Date(latest.time).getTime();
		const currentTime = new Date(current.time).getTime();

		return currentTime > latestTime ? current : latest;
	}, null);
}

function summarizeStatuses(statuses) {
	if (!statuses.length || statuses.some((s) => s === null || s === undefined)) {
		return "unknown";
	}

	if (statuses.some((s) => s === 0)) {
		return "down";
	}

	if (statuses.some((s) => s === 2)) {
		return "pending";
	}

	if (statuses.some((s) => s === 3)) {
		return "maintenance";
	}

	return "online";
}

function labelForState(state) {
	switch (state) {
		case "online":
			return "Online";
		case "down":
			return "Down";
		case "pending":
			return "Pending";
		case "maintenance":
			return "Maint";
		default:
			return "Unknown";
	}
}

function normalize(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/\s+/g, "")
		.replace(/[^a-z0-9]/g, "");
}
