const express = require('express'),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	fetch = require('node-fetch'),
	app = express(),
	PORT = 5000,
	umamiUsername = process.env.UMAMI_USERNAME || 'TheAlphaReturns',
	umamiPassword = process.env.UMAMI_PASSWORD,
	umamiUrl = process.env.UMAMI_URL || 'https://inertia-analytics.vercel.app';

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function getUnixTime(dateObject) {
	return Math.floor(dateObject.getTime() / 1000);
}

app.get('/getData', async (req, res) => {
	try {
		const request = (url, params = {}, headers, method = 'GET') => {
			let options = {
				method,
				headers,
			};
			
			if (method == 'GET') {
				url += '?' + (new URLSearchParams(params)).toString();
			} else if (method == 'POST') {
				options.body = JSON.stringify(params);
			}
			
			return fetch(url, options).then(response => response.json());
		};
		
		const get = (url, params, headers) => request(url, params, headers, 'GET');
		const post = (url, params, headers) => request(url, params, headers, 'POST');

		const now = new Date();
		
		let jsonres_token = await post(`${umamiUrl}/api/auth/login`, { username: umamiUsername, password: umamiPassword });
		const token = jsonres_token.token;

		let headers = {
			'Authorization': `Bearer ${token}`
		};

		let jsonres_websites = await get(`${umamiUrl}/api/websites`, {}, headers);
		let website_id = jsonres_websites.filter(website => website.name.toLowerCase() === 'inertia')[0].website_id;

		let stats = await get(`${umamiUrl}/api/website/${website_id}/stats`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now) }, headers);
		let pageviews = await get(`${umamiUrl}/api/website/${website_id}/pageviews`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now), unit: 'hour', tz: 'America/New_York' }, headers);

		res.status(200).json({ stats, pageviews });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get('/', (req, res) => {
	res.redirect('/getData');
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});