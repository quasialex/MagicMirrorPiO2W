const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		if (notification === "KUMA_BARS_FETCH") {
			this.fetchKuma(payload);
		}
	},

	fetchKuma: async function (payload) {
		try {
			const baseUrl = String(payload.baseUrl || "").replace(/\/+$/, "");
			const statusPage = payload.statusPage || "services";

			if (!baseUrl) {
				throw new Error("MMM-KumaBars: baseUrl is not configured.");
			}

			if (typeof fetch !== "function") {
				throw new Error("Node fetch() is not available. This needs Node 18+.");
			}

			const statusUrl = `${baseUrl}/api/status-page/${statusPage}`;
			const heartbeatUrl = `${baseUrl}/api/status-page/heartbeat/${statusPage}`;

			const [statusResponse, heartbeatResponse] = await Promise.all([
				fetch(statusUrl, { headers: { "User-Agent": "MMM-KumaBars/1.1" } }),
				fetch(heartbeatUrl, { headers: { "User-Agent": "MMM-KumaBars/1.1" } })
			]);

			if (!statusResponse.ok) {
				throw new Error(`Status page API returned HTTP ${statusResponse.status}`);
			}

			if (!heartbeatResponse.ok) {
				throw new Error(`Heartbeat API returned HTTP ${heartbeatResponse.status}`);
			}

			const statusJson = await statusResponse.json();
			const heartbeatJson = await heartbeatResponse.json();

			const sampleCount = Math.max(
				8,
				Math.ceil(
					Number(payload.historyHours || 24) * 60 / Number(payload.bucketMinutes || 60)
				)
			);

			const groups = buildGroups({
				publicGroupList: statusJson.publicGroupList || [],
				heartbeatList: heartbeatJson.heartbeatList || {},
				sampleCount
			});

			this.sendSocketNotification("KUMA_BARS_DATA", {
				instanceId: payload.instanceId,
				groups
			});
		} catch (error) {
			this.sendSocketNotification("KUMA_BARS_ERROR", {
				instanceId: payload.instanceId,
				error: error.message
			});
		}
	}
});

function buildGroups({ publicGroupList, heartbeatList, sampleCount }) {
	return publicGroupList
		.slice()
		.sort((a, b) => Number(a.weight || 0) - Number(b.weight || 0))
		.map((group) => {
			const monitors = (group.monitorList || []).map((monitor) => {
				const heartbeats = heartbeatList[String(monitor.id)] || [];

				return {
					id: monitor.id,
					name: monitor.name,
					type: monitor.type,
					...summariseMonitor(heartbeats, sampleCount)
				};
			});

			return {
				id: group.id,
				name: group.name,
				weight: group.weight,
				monitors
			};
		});
}

function summariseMonitor(heartbeats, sampleCount) {
	const sorted = heartbeats
		.map((heartbeat) => ({
			...heartbeat,
			ts: parseKumaTime(heartbeat.time)
		}))
		.filter((heartbeat) => Number.isFinite(heartbeat.ts))
		.sort((a, b) => a.ts - b.ts);

	const latestSamples = sorted.slice(-sampleCount);
	const latest = latestSamples[latestSamples.length - 1] || null;

	const upCount = latestSamples.filter((heartbeat) => Number(heartbeat.status) === 1).length;
	const knownCount = latestSamples.length;
	const availability = knownCount > 0 ? Math.round((upCount / knownCount) * 100) : null;

	const bars = latestSamples.map((heartbeat) => heartbeatToBar(heartbeat));

	/* Left-pad only if Kuma gave us fewer samples than expected.
	   This should be rare, but it keeps the rows aligned. */
	while (bars.length < sampleCount) {
		bars.unshift({
			state: "empty",
			label: "No heartbeat sample"
		});
	}

	const current = statusFromHeartbeat(latest);

	return {
		statusText: current.text,
		statusClass: current.className,
		availability,
		availabilityText: availability === null ? "—" : `${availability}%`,
		bars
	};
}

function heartbeatToBar(heartbeat) {
	const status = Number(heartbeat.status);

	let state = "empty";

	if (status === 1) {
		state = "up";
	} else if (status === 0) {
		state = "down";
	} else if (status === 3) {
		state = "warn";
	} else {
		state = "warn";
	}

	return {
		state,
		label: `${formatTime(heartbeat.ts)}`
	};
}

function statusFromHeartbeat(latest) {
	if (!latest) {
		return { text: "Unknown", className: "unknown" };
	}

	if (Number(latest.status) === 1) {
		return { text: "Online", className: "up" };
	}

	if (Number(latest.status) === 0) {
		return { text: "Down", className: "down" };
	}

	if (Number(latest.status) === 3) {
		return { text: "Maintenance", className: "warn" };
	}

	return { text: "Pending", className: "warn" };
}

function parseKumaTime(value) {
	if (!value) {
		return NaN;
	}

	return new Date(String(value).replace(" ", "T")).getTime();
}

function formatTime(ms) {
	const d = new Date(ms);

	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	});
}
