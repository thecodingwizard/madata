import Backend from "../../src/index.js";

const exportOnData = [
	"login", "logout",
	"load", "save", "upload",
	"backend",
	"inProgress",
	"unsavedChanges",
];

const authProperties = ["username", "avatar", "url", "name"];

const MaData = {
	props: {
		src: String,
		modelValue: Object,
		options: Object,
		autosave: {
			type: [Boolean, Number, String],
			default: false,
			validator (value) {
				try {
					parseTime(value);
					return true;
				}
				catch (e) {
					return false;
				}
			}
		},
		state: Object,
	},

	emits: [
		"update:modelValue",
		"login",
		"logout",
	],

	data() {
		return {
			inProgress: "",
			unsavedChanges: false,
			user: null
		}
	},

	mounted () {
		// TODO if we attach this when modelValue is set, we can handle cases where the data gets replaced
		if (!this.modelValue || !Array.isArray(this.modelValue) && typeof this.modelValue !== "object") {
			throw new TypeError("MaData: data must be an object or array");
		}

		if (this.state && typeof this.state !== "object") {
			throw new TypeError("State needs to be an object if present. Value passed was:", this.state);
		}

		let state = this.state ?? this.modelValue;

		for (let property of exportOnData) {
			if (MaData.methods[property]) {
				// Functions only need to be copied once
				Object.defineProperty(state, property, {
					value: this[property],
				});
			}
			else {
				// Properties need to be copied every time they change
				this.$watch(property, newValue => {
					this.stateObject[property] = newValue;
				});
			}
		}
	},

	watch: {
		src: {
			async handler (url, oldUrl) {
				this.pastBackends ??= new Set();

				if (this.backend) {
					this.pastBackends.add(this.backend);
				}

				let options = {};

				if (this.pastBackends.size > 0) {
					options.existing = [...this.pastBackends];
				}

				if (this.options) {
					Object.assign(options, this.options);
				}

				let previousBackend = this.backend;
				this.backend = Backend.from(url, options);

				if (this.backend !== previousBackend) {
					this.backend.addEventListener("mv-login", evt => {
						this.user = this.backend.user;
						this.$emit("login", this.user);
					});
					this.backend.addEventListener("mv-logout", evt => {
						this.user = this.backend.user;
						this.$emit("logout");
					});
				}

				return this.load();
			},
			immediate: true,
		},

		autosave: {
			handler (autosave) {
				if (autosave) {
					this.unwatchData = this.$watch("modelValue", (newData, oldData) => {
						if (autosave === true) {
							// If autosave is just used without a value, we save immediately
							this.save();
						}
						else {
							let ms = parseTime(autosave);

							// Throttle
							clearTimeout(this.saveTimeout);
							this.saveTimeout = setTimeout(() => {
								this.save();
							}, ms);
						}
					}, {deep: true});
				}
				else {
					this.unwatchData?.();
				}
			},
			immediate: true,
		},

		stateObject: {
			handler (state, oldState) {
				if (state === this.modelValue) {
					// If state properties are on data, they should be non-enumerable
					// to make sure they are not saved together with the data
					for (let property of [...exportOnData, ...authProperties, "user"]) {
						Object.defineProperty(state, property, {
							value: oldState?.[property],
							writable: true,
							configurable: true,
						});
					}
				}
			},
			immediate: true,
		},

		user: {
			handler() {
				let state = this.stateObject;
				let user = state.user = this.user;

				if (user) {
					for (let property of authProperties) {
						state[property] = user[property];
					}
				}
				else {
					for (let property of authProperties) {
						state[property] = "";
					}
				}
			},
			immediate: true,
		}
	},

	methods: {
		async login (o) {
			this.inProgress = "Logging in...";
			await this.backend.login(o);

			if (this.dataLoaded === false) {
				await this.load();
			}

			this.inProgress = "";
			return this.backend.user;
		},

		async logout () {
			await this.backend.logout();
		},

		async load () {
			try {
				this.inProgress = "Loading...";

				this.dataLoaded ??= false;
				let data = await this.backend.load();
				if (data) {
					this.dataLoaded = true;
				}

				// Replace data maintaining a reference to its object
				setPreservingReferences(this.modelValue, data);
			}
			catch (e) {
				if (e instanceof TypeError) {
					// This is a code smell. There are other possible type errors!
					console.warn(`MaData: Error when fetching data from ${this.src}: ${e.message}. Returned data was:`, data);
				}
			}

			this.inProgress = "";

			this.unsavedChanges = false;

			this.$emit("update:modelValue", this.modelValue);
		},

		async save () {
			this.inProgress = "Saving...";
			let ret = await this.backend.store(this.modelValue);
			this.inProgress = "";
			this.unsavedChanges = false;
			return ret;
		},

		async upload (file) {
			this.inProgress = "Uploading...";
			let ret = await this.backend.upload(file);
			this.inProgress = "";
			return ret;
		}
	},

	computed: {
		stateObject () {
			return this.state ?? this.modelValue;
		},

	},

	template: " "
}

function setPreservingReferences(object, data) {
	if (Array.isArray(object)) {
		if (data && !Array.isArray(data)) {
			throw new TypeError("Array expected, but provided data is not an array");
		}

		// Delete existing items
		object.splice(0, object.length);

		// Add new items
		if (data) {
			object.push(...data);
		}
	}
	else { // Object
		if (Array.isArray(data)) {
			throw new TypeError("Plain object expected, but provided data is an array");
		}

		// Delete old data
		for (let key in object) {
			if (!exportOnData.includes(key) && !authProperties.includes(key)) {
				delete object[key];
			}

		}

		// Add new data
		Object.assign(object, data);
	}
}

function parseTime (time) {
	if (typeof time === "number" || typeof time === "boolean") {
		return time;
	}
	else if (typeof time === "string") {
		let match = time.trim().match(/^(?<number>\d+(\.\d+)?)\s*(?<unit>ms|s)?$/);

		if (match) {
			return match.groups.number * (match.groups.unit === "s" ? 1000 : 1)
		}
	}

	throw new TypeError("Invalid time");
}

export default MaData;