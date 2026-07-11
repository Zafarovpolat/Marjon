const el = require("electron"); console.log(typeof el, typeof el === "object" ? Object.keys(el).slice(0,5) : el); process.exit(0)
