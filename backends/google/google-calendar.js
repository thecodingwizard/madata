import Google from "./google.js";

export default class GoogleCalendar extends Google {
	update (url, o) {
		super.update(url, o);

		const params = this.file.url.searchParams;

		if (params.has("cid")) {
			this.calendar = decodeURIComponent(atob(params.get("cid")));
		}

		// Order matters: shareable link, public URL, or the user's primary calendar.
		this.calendar = this.calendar ?? params.get("src") ?? "primary";
		this.calendar = encodeURIComponent(this.calendar);

		this.apiKey = o.apiKey ?? this.constructor.apiKey;
	}

	async get (url) {
		let call = `${this.calendar}/events?key=${this.apiKey}`;

		let calendar;
		try {
			calendar = await this.request(call);
		}
		catch (e) {
			const error = (await e.json()).error.message;
			switch (e.status) {
				case 400:
					throw new Error(this.constructor.phrase("api_key_invalid", this.apiKey));
				case 401:
					await this.logout(); // Access token we have is invalid. Discard it.
					throw new Error(this.constructor.phrase("access_token_invalid"));
				case 403:
					throw new Error(this.constructor.phrase("no_read_permission", this.source));
				case 404:
					throw new Error(this.constructor.phrase("no_calendar", this.source));
				default:
					throw new Error(this.constructor.phrase("unknown_error", error));
			}
		}

		return calendar.items;
	}

	async login (...args) {
		const user = await super.login(...args);

		if (user) {
			this.updatePermissions({edit: true, save: true});
		}

		return user;
	}

	// FIXME: I have a HUGE doubt whether it's a hack or not!
	static getOAuthProvider () {
		return { name: "Google Calendar" };
	}

	static apiDomain = "https://www.googleapis.com/calendar/v3/calendars/";
	static scopes = ["https://www.googleapis.com/auth/calendar.events"];

	static test (url) {
		return url.startsWith("https://calendar.google.com/calendar/");
	}

	static phrases = {
		no_read_permission: calendar => `You don not have permission to read data from the calendar: ${calendar}.`,
		no_write_permission: calendar => `You don not have permission to write data to the calendar: ${calendar}.`,
		no_calendar: calendar => `We could not find the calendar: ${calendar}.`
	}
}