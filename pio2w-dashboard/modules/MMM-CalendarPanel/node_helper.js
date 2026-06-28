const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		if (notification === "FETCH_CALENDAR_EVENTS") {
			this.fetchCalendarEvents(payload);
		}
	},

	fetchCalendarEvents: async function (payload) {
		try {
			const calendars = payload.calendars || [];
			const maxItems = payload.maxItems || 34;
			const maxDays = payload.maxDays || 120;

			if (!calendars.length) {
				throw new Error("No calendars configured.");
			}

			const rangeStart = startOfToday();
			const rangeEnd = new Date(rangeStart);
			rangeEnd.setDate(rangeEnd.getDate() + maxDays);

			const allEvents = [];

			for (const calendar of calendars) {
				try {
					const response = await fetch(calendar.url, {
						headers: {
							"User-Agent": "MagicMirror-CalendarPanel/1.0"
						}
					});

					if (!response.ok) {
						throw new Error(`${calendar.name || "Calendar"} HTTP ${response.status}`);
					}

					const ics = await response.text();
					const events = parseCalendar(ics, calendar, rangeStart, rangeEnd);
					allEvents.push(...events);
				} catch (error) {
					console.error(`[MMM-CalendarPanel] ${calendar.name || "Calendar"} failed:`, error.message);
				}
			}

			const sortedEvents = allEvents
				.filter((eventItem) => eventItem.startTimestamp >= rangeStart.getTime())
				.sort((a, b) => a.startTimestamp - b.startTimestamp)
				.slice(0, maxItems);

			this.sendSocketNotification("CALENDAR_EVENTS", {
				events: sortedEvents
			});
		} catch (error) {
			this.sendSocketNotification("CALENDAR_ERROR", {
				error: error.message
			});
		}
	}
});

function parseCalendar(ics, calendar, rangeStart, rangeEnd) {
	const cleanIcs = unfoldIcs(ics);
	const eventBlocks = cleanIcs.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
	const events = [];

	eventBlocks.forEach((block, index) => {
		const props = parseProperties(block);

		const summary = cleanText(getFirstValue(props, "SUMMARY")) || "Untitled event";
		const location = cleanText(getFirstValue(props, "LOCATION"));
		const description = cleanText(getFirstValue(props, "DESCRIPTION"));
		const uid = cleanText(getFirstValue(props, "UID")) || `${calendar.name || "calendar"}-${index}`;

		const startProp = getFirstProp(props, "DTSTART");
		const endProp = getFirstProp(props, "DTEND");

		if (!startProp) {
			return;
		}

		const parsedStart = parseIcsDate(startProp);
		if (!parsedStart || !parsedStart.date) {
			return;
		}

		let parsedEnd = endProp ? parseIcsDate(endProp) : null;

		if (!parsedEnd || !parsedEnd.date) {
			parsedEnd = {
				date: defaultEndDate(parsedStart.date, parsedStart.allDay),
				allDay: parsedStart.allDay
			};
		}

		const baseEvent = {
			id: uid,
			title: summary,
			location,
			description,
			calendarName: calendar.name || "Calendar",
			calendarSymbol: calendar.symbol || "calendar",
			allDay: parsedStart.allDay,
			startTimestamp: parsedStart.date.getTime(),
			endTimestamp: parsedEnd.date.getTime(),
			alerts: extractAlerts(block)
		};

		const rruleText = getFirstValue(props, "RRULE");
		const exDates = extractExDates(props);

		if (rruleText) {
			events.push(...expandRecurringEvent(baseEvent, rruleText, exDates, rangeStart, rangeEnd));
		} else if (eventOverlapsRange(baseEvent, rangeStart, rangeEnd)) {
			events.push(baseEvent);
		}
	});

	return deDuplicate(events);
}

function unfoldIcs(ics) {
	return String(ics || "")
		.replace(/\r\n[ \t]/g, "")
		.replace(/\n[ \t]/g, "")
		.replace(/\r/g, "\n");
}

function parseProperties(block) {
	const props = {};
	const lines = block.split(/\n/);

	lines.forEach((line) => {
		const colonIndex = line.indexOf(":");

		if (colonIndex === -1) {
			return;
		}

		const left = line.slice(0, colonIndex);
		const value = line.slice(colonIndex + 1);

		const parts = left.split(";");
		const name = parts[0].toUpperCase();
		const params = {};

		parts.slice(1).forEach((part) => {
			const equalsIndex = part.indexOf("=");

			if (equalsIndex === -1) {
				params[part.toUpperCase()] = true;
				return;
			}

			const key = part.slice(0, equalsIndex).toUpperCase();
			const val = part.slice(equalsIndex + 1);
			params[key] = val;
		});

		if (!props[name]) {
			props[name] = [];
		}

		props[name].push({ name, params, value });
	});

	return props;
}

function getFirstProp(props, name) {
	const values = props[name];

	if (!values || !values.length) {
		return null;
	}

	return values[0];
}

function getFirstValue(props, name) {
	const prop = getFirstProp(props, name);
	return prop ? prop.value : "";
}

function parseIcsDate(prop) {
	const value = String(prop.value || "").trim();

	if (!value) {
		return null;
	}

	const isDateOnly = prop.params.VALUE === "DATE" || /^\d{8}$/.test(value);

	if (isDateOnly) {
		const year = Number(value.slice(0, 4));
		const month = Number(value.slice(4, 6)) - 1;
		const day = Number(value.slice(6, 8));

		return {
			date: new Date(year, month, day, 0, 0, 0),
			allDay: true
		};
	}

	const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);

	if (!match) {
		const fallback = new Date(value);

		if (Number.isNaN(fallback.getTime())) {
			return null;
		}

		return {
			date: fallback,
			allDay: false
		};
	}

	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6] || "0");
	const isUtc = Boolean(match[7]);

	const date = isUtc
		? new Date(Date.UTC(year, month, day, hour, minute, second))
		: new Date(year, month, day, hour, minute, second);

	return {
		date,
		allDay: false
	};
}

function defaultEndDate(startDate, allDay) {
	const end = new Date(startDate);

	if (allDay) {
		end.setDate(end.getDate() + 1);
	} else {
		end.setHours(end.getHours() + 1);
	}

	return end;
}

function extractAlerts(block) {
	const alarmBlocks = block.match(/BEGIN:VALARM[\s\S]*?END:VALARM/g) || [];
	const alerts = [];

	alarmBlocks.forEach((alarmBlock) => {
		const props = parseProperties(alarmBlock);
		const trigger = getFirstValue(props, "TRIGGER");
		const formatted = formatTrigger(trigger);

		if (formatted) {
			alerts.push(formatted);
		}
	});

	return alerts;
}

function formatTrigger(trigger) {
	const value = String(trigger || "").trim();

	if (!value) {
		return "";
	}

	const match = value.match(/^-(?:P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/);

	if (!match) {
		return value;
	}

	const days = Number(match[1] || "0");
	const hours = Number(match[2] || "0");
	const minutes = Number(match[3] || "0");

	const parts = [];

	if (days) {
		parts.push(days === 1 ? "1 day" : `${days} days`);
	}

	if (hours) {
		parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
	}

	if (minutes) {
		parts.push(minutes === 1 ? "1 minute" : `${minutes} minutes`);
	}

	return parts.length ? `${parts.join(" ")} before` : "Before event";
}

function extractExDates(props) {
	const exDateProps = props.EXDATE || [];
	const exDates = new Set();

	exDateProps.forEach((prop) => {
		String(prop.value || "")
			.split(",")
			.forEach((value) => {
				const parsed = parseIcsDate({
					params: prop.params || {},
					value
				});

				if (parsed && parsed.date) {
					exDates.add(dateKey(parsed.date));
				}
			});
	});

	return exDates;
}

function parseRRule(rruleText) {
	const rule = {};

	String(rruleText || "")
		.split(";")
		.forEach((part) => {
			const [key, value] = part.split("=");

			if (key && value) {
				rule[key.toUpperCase()] = value;
			}
		});

	return rule;
}

function expandRecurringEvent(baseEvent, rruleText, exDates, rangeStart, rangeEnd) {
	const rule = parseRRule(rruleText);
	const freq = rule.FREQ;
	const interval = Number(rule.INTERVAL || "1");
	const countLimit = rule.COUNT ? Number(rule.COUNT) : null;
	const untilDate = rule.UNTIL ? parseUntil(rule.UNTIL) : null;
	const byDays = rule.BYDAY ? rule.BYDAY.split(",") : null;

	if (!freq) {
		return eventOverlapsRange(baseEvent, rangeStart, rangeEnd) ? [baseEvent] : [];
	}

	const results = [];
	const baseStart = new Date(baseEvent.startTimestamp);
	const baseEnd = new Date(baseEvent.endTimestamp);
	const durationMs = baseEnd.getTime() - baseStart.getTime();

	let cursor = startOfDay(baseStart);
	let occurrenceCount = 0;
	let guard = 0;

	while (cursor <= rangeEnd && guard < 1000) {
		guard += 1;

		const candidateStart = combineDateAndTime(cursor, baseStart);

		if (candidateStart >= baseStart && matchesRule(candidateStart, baseStart, freq, interval, byDays)) {
			if (!untilDate || candidateStart <= untilDate) {
				occurrenceCount += 1;

				if (!countLimit || occurrenceCount <= countLimit) {
					if (!exDates.has(dateKey(candidateStart))) {
						const candidateEnd = new Date(candidateStart.getTime() + durationMs);

						const eventItem = {
							...baseEvent,
							id: `${baseEvent.id}-${candidateStart.getTime()}`,
							startTimestamp: candidateStart.getTime(),
							endTimestamp: candidateEnd.getTime()
						};

						if (eventOverlapsRange(eventItem, rangeStart, rangeEnd)) {
							results.push(eventItem);
						}
					}
				}
			}
		}

		if (countLimit && occurrenceCount >= countLimit) {
			break;
		}

		cursor.setDate(cursor.getDate() + 1);
	}

	return results;
}

function matchesRule(candidate, baseStart, freq, interval, byDays) {
	if (freq === "DAILY") {
		const diff = dayDiff(startOfDay(baseStart), startOfDay(candidate));

		if (diff % interval !== 0) {
			return false;
		}

		if (byDays && !byDays.includes(dayName(candidate))) {
			return false;
		}

		return true;
	}

	if (freq === "WEEKLY") {
		const diff = weekDiff(startOfWeek(baseStart), startOfWeek(candidate));

		if (diff % interval !== 0) {
			return false;
		}

		if (byDays) {
			return byDays.includes(dayName(candidate));
		}

		return candidate.getDay() === baseStart.getDay();
	}

	if (freq === "MONTHLY") {
		const diff = monthDiff(baseStart, candidate);

		if (diff % interval !== 0) {
			return false;
		}

		return candidate.getDate() === baseStart.getDate();
	}

	if (freq === "YEARLY") {
		const diff = candidate.getFullYear() - baseStart.getFullYear();

		if (diff % interval !== 0) {
			return false;
		}

		return candidate.getMonth() === baseStart.getMonth() && candidate.getDate() === baseStart.getDate();
	}

	return false;
}

function parseUntil(value) {
	const parsed = parseIcsDate({
		params: {},
		value
	});

	return parsed ? parsed.date : null;
}

function eventOverlapsRange(eventItem, rangeStart, rangeEnd) {
	return eventItem.endTimestamp >= rangeStart.getTime() && eventItem.startTimestamp <= rangeEnd.getTime();
}

function deDuplicate(events) {
	const seen = new Set();
	const results = [];

	events.forEach((eventItem) => {
		const key = `${eventItem.calendarName}|${eventItem.title}|${eventItem.startTimestamp}|${eventItem.endTimestamp}`;

		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		results.push(eventItem);
	});

	return results;
}

function cleanText(text) {
	return String(text || "")
		.replace(/\\n/g, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\r/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function startOfToday() {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
}

function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

function startOfWeek(date) {
	const result = startOfDay(date);
	result.setDate(result.getDate() - result.getDay());
	return result;
}

function combineDateAndTime(dateOnly, timeSource) {
	return new Date(
		dateOnly.getFullYear(),
		dateOnly.getMonth(),
		dateOnly.getDate(),
		timeSource.getHours(),
		timeSource.getMinutes(),
		timeSource.getSeconds()
	);
}

function dayDiff(a, b) {
	return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function weekDiff(a, b) {
	return Math.floor((b.getTime() - a.getTime()) / (7 * 86400000));
}

function monthDiff(a, b) {
	return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function dayName(date) {
	return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getDay()];
}

function dateKey(date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
		String(date.getHours()).padStart(2, "0"),
		String(date.getMinutes()).padStart(2, "0")
	].join("");
}
