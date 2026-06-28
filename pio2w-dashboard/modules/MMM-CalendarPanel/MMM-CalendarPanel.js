Module.register("MMM-CalendarPanel", {
	defaults: {
		calendars: [],
		maxItems: 34,
		maxDays: 120,
		refreshInterval: 15 * 60 * 1000,
		pageIndex: 1
	},

	start: function () {
		this.events = [];
		this.loaded = false;
		this.error = null;
		this.selectedEvent = null;

		this.fetchEvents();

		setInterval(() => {
			this.fetchEvents();
		}, this.config.refreshInterval);
	},

	fetchEvents: function () {
		this.sendSocketNotification("FETCH_CALENDAR_EVENTS", {
			calendars: this.config.calendars,
			maxItems: this.config.maxItems,
			maxDays: this.config.maxDays
		});
	},

	notificationReceived: function (notification, payload) {
		if (notification === "CALENDAR_BACK" && this.selectedEvent) {
			this.selectedEvent = null;
			document.body.classList.remove("calendar-event-open");
			this.updateDom(0);
			return;
		}

		if (notification === "PAGE_SELECT" && payload !== this.config.pageIndex) {
			this.selectedEvent = null;
			document.body.classList.remove("calendar-event-open");
			this.updateDom(0);
		}
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "calendar-panel";

		if (this.selectedEvent) {
			document.body.classList.add("calendar-event-open");
		} else {
			document.body.classList.remove("calendar-event-open");
		}

		if (this.error) {
			wrapper.innerHTML = `<div class="calendar-panel-error">${this.error}</div>`;
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.innerHTML = `<div class="calendar-panel-loading">Loading calendar...</div>`;
			return wrapper;
		}

		if (this.selectedEvent) {
			return this.renderEventDetail(wrapper, this.selectedEvent);
		}

		return this.renderEventList(wrapper);
	},

	renderEventList: function (wrapper) {
		const scroller = document.createElement("div");
		scroller.className = "calendar-panel-scroll";

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

			if (Math.abs(deltaY) > 5) {
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
			}, 120);
		};

		scroller.addEventListener("touchstart", beginDrag, { passive: true });
		scroller.addEventListener("touchmove", moveDrag, { passive: false });
		scroller.addEventListener("touchend", endDrag);

		scroller.addEventListener("mousedown", beginDrag);
		scroller.addEventListener("mousemove", moveDrag);
		scroller.addEventListener("mouseup", endDrag);
		scroller.addEventListener("mouseleave", endDrag);

		if (!this.events.length) {
			const empty = document.createElement("div");
			empty.className = "calendar-panel-empty";
			empty.innerText = "No upcoming appointments.";
			scroller.appendChild(empty);
			wrapper.appendChild(scroller);
			return wrapper;
		}

		this.events.forEach((eventItem) => {
			const row = document.createElement("div");
			row.className = "calendar-panel-row";

			const date = document.createElement("div");
			date.className = "calendar-panel-date";
			date.innerHTML = `
				<div class="calendar-panel-weekday">${this.formatWeekday(eventItem.startTimestamp)}</div>
				<div class="calendar-panel-day">${this.formatDayMonth(eventItem.startTimestamp)}</div>
			`;

			const main = document.createElement("div");
			main.className = "calendar-panel-main";

			const title = document.createElement("div");
			title.className = "calendar-panel-title";
			title.innerText = eventItem.title || "Untitled event";

			const location = document.createElement("div");
			location.className = "calendar-panel-location";
			location.innerText = eventItem.location || "";

			main.appendChild(title);

			if (eventItem.location) {
				main.appendChild(location);
			}

			const time = document.createElement("div");
			time.className = "calendar-panel-time";
			time.innerText = this.formatTimeRange(eventItem);

			row.appendChild(date);
			row.appendChild(main);
			row.appendChild(time);

			row.addEventListener("click", (clickEvent) => {
				if (didDrag) {
					clickEvent.preventDefault();
					return;
				}

				this.selectedEvent = eventItem;
				this.updateDom(0);
			});

			scroller.appendChild(row);
		});

		wrapper.appendChild(scroller);
		return wrapper;
	},

	renderEventDetail: function (wrapper, eventItem) {
		wrapper.classList.add("calendar-panel-detail-wrapper");

		const detail = document.createElement("div");
		detail.className = "calendar-panel-detail";

		const scroller = document.createElement("div");
		scroller.className = "calendar-panel-detail-scroll";

		const title = document.createElement("div");
		title.className = "calendar-panel-detail-title";
		title.innerText = eventItem.title || "Untitled event";

		const when = this.createDetailField("When", this.formatFullWhen(eventItem));
		const duration = this.createDetailField("Duration", this.formatDuration(eventItem));
		const calendar = this.createDetailField("Calendar", eventItem.calendarName || "Unknown");
		const location = this.createDetailField("Location", eventItem.location || "Not included");
		const alert = this.createDetailField("Alert", eventItem.alerts && eventItem.alerts.length ? eventItem.alerts.join(", ") : "Not included");

		scroller.appendChild(title);
		scroller.appendChild(when);
		scroller.appendChild(duration);
		scroller.appendChild(calendar);
		scroller.appendChild(location);
		scroller.appendChild(alert);

		if (eventItem.description) {
			const notes = this.createDetailField("Notes", eventItem.description);
			notes.classList.add("calendar-panel-notes");
			scroller.appendChild(notes);
		} else {
			scroller.appendChild(this.createDetailField("Notes", "Not included"));
		}

		/* Appointment details use the global TouchRouter Back button.
		   Do not attach drag-scroll here; short detail pages should stay fixed. */
		detail.appendChild(scroller);

		wrapper.appendChild(detail);
		return wrapper;
	},

	createDetailField: function (labelText, valueText) {
		const field = document.createElement("div");
		field.className = "calendar-panel-field";

		const label = document.createElement("div");
		label.className = "calendar-panel-field-label";
		label.innerText = labelText;

		const value = document.createElement("div");
		value.className = "calendar-panel-field-value";
		const cleanValue = String(valueText || "").trim();

		if (!cleanValue || cleanValue === "Not included") {
			return document.createDocumentFragment();
		}

		value.innerText = cleanValue;

		field.appendChild(label);
		field.appendChild(value);

		return field;
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

	formatWeekday: function (timestamp) {
		return new Date(timestamp).toLocaleDateString("en-GB", {
			weekday: "short"
		});
	},

	formatDayMonth: function (timestamp) {
		return new Date(timestamp).toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short"
		});
	},

	formatClock: function (timestamp) {
		return new Date(timestamp).toLocaleTimeString("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false
		});
	},

	formatTimeRange: function (eventItem) {
		if (eventItem.allDay) {
			return "All day";
		}

		if (!eventItem.endTimestamp || eventItem.endTimestamp <= eventItem.startTimestamp) {
			return this.formatClock(eventItem.startTimestamp);
		}

		return `${this.formatClock(eventItem.startTimestamp)}–${this.formatClock(eventItem.endTimestamp)}`;
	},

	formatFullWhen: function (eventItem) {
		const date = new Date(eventItem.startTimestamp).toLocaleDateString("en-GB", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric"
		});

		if (eventItem.allDay) {
			return `${date}, all day`;
		}

		return `${date}, ${this.formatTimeRange(eventItem)}`;
	},

	formatDuration: function (eventItem) {
		if (!eventItem.endTimestamp || eventItem.endTimestamp <= eventItem.startTimestamp) {
			return eventItem.allDay ? "All day" : "Not included";
		}

		const diffMinutes = Math.round((eventItem.endTimestamp - eventItem.startTimestamp) / 60000);

		if (eventItem.allDay) {
			const days = Math.max(1, Math.round(diffMinutes / 1440));
			return days === 1 ? "1 day" : `${days} days`;
		}

		const hours = Math.floor(diffMinutes / 60);
		const minutes = diffMinutes % 60;

		if (hours && minutes) {
			return `${hours}h ${minutes}m`;
		}

		if (hours) {
			return `${hours}h`;
		}

		return `${minutes}m`;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "CALENDAR_EVENTS") {
			this.events = payload.events || [];
			this.loaded = true;
			this.error = null;
			this.updateDom(0);
		}

		if (notification === "CALENDAR_ERROR") {
			this.error = payload.error || "Could not load calendar.";
			this.loaded = true;
			this.updateDom(0);
		}
	}
});
