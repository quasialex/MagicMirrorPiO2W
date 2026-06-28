/* MagicMirror config for SpotPear 7-inch kitchen dashboard
 * Layout: home dashboard + touch drill-down pages.
 */
let config = {
	address: "localhost",
	port: 8080,
	basePath: "/",
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	language: "en",
	locale: "en-US",
	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	modules: [
		{
			module: "alert",
			classes: "page-home"
		},
		{
			module: "clock",
			position: "top_left",
			classes: "page-home",
			config: {
				displaySeconds: true,
				showPeriod: false,
				showPeriodUpper: false
			}
		},
		// Compact home calendar. Tap this block to open Calendar Details.
		{
			module: "calendar",
			header: "Calendar",
			position: "top_left",
			classes: "page-home touch-calendar compact-calendar",
			config: {
				maximumEntries: 7,
				maximumNumberOfDays: 45,
				displaySymbol: true,
				showLocation: false,
				maxTitleLength: 34,
				fade: false,
				calendars: [
					{
						name: "iCloud",
						fetchInterval: 15 * 60 * 1000,
						symbol: "calendar",
						url: "ICLOUD_CALENDAR_URL"
					},
					{
						name: "Google",
						fetchInterval: 6 * 60 * 60 * 1000,
						symbol: "calendar",
						url: "GOOGLE_CALENDAR_URL"
					},
					{
						name: "Holidays",
						fetchInterval: 12 * 60 * 60 * 1000,
						symbol: "calendar-check",
						url: "GOOGLE_HOLIDAY_CALENDAR_URL"
					}
				]
			}
		},
		// Full calendar page. This keeps location visible and uses larger styling via custom.css.
		{
			module: "MMM-CalendarPanel",
			header: "Calendar Details",
			position: "middle_center",
			classes: "page-calendar calendar-panel-detail",
			config: {
				pageIndex: 1,
				maxItems: 34,
				maxDays: 120,
				refreshInterval: 15 * 60 * 60 * 1000,
				calendars: [
					{
						name: "iCloud",
						fetchInterval: 15 * 60 * 1000,
						symbol: "calendar",
						url: "ICLOUD_CALENDAR_URL"
					},
					{
						name: "Google",
						fetchInterval: 6 * 60 * 60 * 1000,
						symbol: "calendar",
						url: "GOOGLE_CALENDAR_URL"
					},
					{
						name: "Romania Holidays",
						fetchInterval: 12 * 60 * 60 * 1000,
						symbol: "calendar-check",
						url: "GOOGLE_HOLIDAY_CALENDAR_URL"
					}
				]
			}
		},
		// Compact current weather on Home. Tap it to open the Weather page.
		{
			module: "weather",
			position: "top_right",
			classes: "page-home touch-weather weather-current-compact",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 36.1681,
				lon: -5.34777,
				location: "La Línea",
				units: "metric",
				roundTemp: true,
				onlyTemp: false,
				showFeelsLike: true,
				showSun: true,
				showWindDirection: false,
				showWindDirectionAsArrow: false,
				updateInterval: 30 * 60 * 1000,
				animationSpeed: 0
			}
		},
		// Small 3-day forecast on Home, stacked under current weather.
		{
			module: "weather",
			position: "top_right",
			header: "Forecast",
			classes: "page-home touch-weather home-forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 36.1681,
				lon: -5.34777,
				location: "La Línea",
				units: "metric",
				roundTemp: true,
				maxNumberOfDays: 3,
				fade: false,
				showPrecipitationProbability: true,
				updateInterval: 60 * 60 * 1000,
				animationSpeed: 0
			}
		},
		// Expanded 7-day forecast on the Weather page.
		{
			module: "weather",
			position: "fullscreen_above",
			classes: "page-weather weather-current-detail",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 36.1681,
				lon: -5.34777,
				location: "La Línea",
				units: "metric",
				roundTemp: false,
				onlyTemp: false,
				showFeelsLike: true,
				showSun: true,
				showWindDirection: true,
				showWindDirectionAsArrow: true,
				showHumidity: true,
				showUVIndex: true,
				updateInterval: 30 * 60 * 1000,
				animationSpeed: 0
			}
		},
		{
			module: "weather",
			position: "fullscreen_above",
			header: "7-Day Forecast",
			classes: "page-weather weather-detail",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 36.1681,
				lon: -5.34777,
				location: "La Línea",
				units: "metric",
				roundTemp: true,
				maxNumberOfDays: 7,
				fade: false,
				showPrecipitationProbability: true,
				appendLocationNameToHeader: false,
				updateInterval: 60 * 60 * 1000,
				animationSpeed: 0
			}
		},
		// One-line BBC ticker on Home. Tap it to open the News page.
		{
			module: "newsfeed",
			position: "bottom_bar",
			classes: "page-home touch-news news-ticker",
			config: {
				feeds: [
					{
						title: "BBC",
						url: "https://feeds.bbci.co.uk/news/world/rss.xml"
					}
				],
				showSourceTitle: true,
				showPublishDate: true,
				showDescription: false,
				wrapTitle: true,
				showAsList: false,
				maxNewsItems: 10,
				updateInterval: 20 * 1000,
				reloadInterval: 30 * 60 * 1000,
				broadcastNewsFeeds: false,
				broadcastNewsUpdates: true,
				animationSpeed: 0
			}
		},
		{
			module: "MMM-RSSPanel",
			position: "fullscreen_above",
			header: "BBC News",
			classes: "page-news news-detail",
			config: {
				feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
				maxItems: 20,
				refreshInterval: 30 * 60 * 1000,
				scrollStep: 180
			}
		},
		{
			module: "MMM-pages",
			config: {
				animationTime: 0,
				timings: {
					default: 0
				},
				homePage: 0,
				rotationHomePage: 0,
				modules: [
					["page-home"],
					["page-calendar"],
					["page-weather"],
					["page-news"],
					["page-status"]
				],
				fixed: [
					"touch-router"
				]
			}
		},
		{
			module: "MMM-TouchRouter",
			position: "bottom_left",
			classes: "touch-router",
			config: {
				homePage: 0,
				routes: [
					{ selector: ".touch-calendar", notification: "PAGE_SELECT", payload: 1 },
					{ selector: ".touch-weather", notification: "PAGE_SELECT", payload: 2 },
					{ selector: ".touch-news", notification: "PAGE_SELECT", payload: 3 },
					{ selector: ".touch-status", notification: "PAGE_SELECT", payload: 4 }
				]
			}
		},
		{
			module: "MMM-KumaSummary",
			position: "top_right",
			classes: "page-home touch-status service-mini",
			config: {
				baseUrl: "http://YOUR_UPTIME_KUMA_IP:3001",
				statusPage: "home",
				detailPage: 4,
				updateInterval: 5 * 60 * 1000,
				rows: ["Server", "NextCloud", "Network", "Website"]
			}
		},
		{
			module: "MMM-KumaBars",
			position: "middle_center",
			classes: "page-status kuma-bars-detail",
			config: {
				baseUrl: "http://YOUR_UPTIME_KUMA_IP:3001",
				statusPage: "services",
				historyHours: 24,
				bucketMinutes: 60,
				refreshInterval: 5 * 60 * 1000,
				showGroupHeaders: true,
				showAvailability: true,
				showCurrentStatus: true
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
