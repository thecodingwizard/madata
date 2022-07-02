import Github from "./github.js";
import hooks from "../hooks.js";

export default class GithubAPI extends Github {
	update (url, o) {
		super.update(url, o);

		Object.assign(this, GithubAPI.parseURL(this.source));
	}

	async get (url) {
		let info = url? Github.parseURL(url) : this.info;

		if (info.query) {
			// GraphQL
			let response = await this.request(this.url, { query: info.query }, "POST");
			if (response.errors?.length) {
				throw new Error(response.errors.map(x => x.message).join("\n"));
			}

			return response.data;
		}

		let req = {
			responseType: "response",
			headers: {
				"Accept": "application/vnd.github.squirrel-girl-preview"
			}
		};
		let response = await this.request(info.apiCall, {ref:this.branch}, "GET", req);

		// Raw API call
		let json = await response.json();

		let params = new URL(info.apiCall, this.constructor.apiDomain).searchParams;
		let maxPages = params.get("max_pages") - 1; /* subtract 1 because we already fetched a page */

		if (maxPages > 0 && params.get("page") === null && Array.isArray(json)) {
			// Fetch more pages
			let next;

			do {
				next = response.headers.get("Link")?.match(/<(.+?)>; rel="next"/)?.[1];

				if (next) {
					response = await this.request(next, {ref:this.branch}, "GET", req);

					if (response.ok) {
						let pageJSON = await response.json();

						if (Array.isArray(pageJSON)) {
							json.push(...pageJSON);
						}
						else {
							break;
						}
					}
					else {
						break;
					}
				}
				else {
					break;
				}

			} while (--maxPages > 0);

		}

		return json;
	}

	static test (url) {
		url = new URL(url, location);
		return /^api\.github\.com/.test(url.host);
	}

	static parseURL (source) {
		let ret = {
			url: new URL(source, location)
		};

		if (url.hash && url.pathname == "/graphql") {
			// https://api.github.com/graphql#query{...}
			ret.query = source.match(/#([\S\s]+)/)?.[1]; // url.hash drops line breaks
			url.hash = "";
		}

		return ret;
	}
}