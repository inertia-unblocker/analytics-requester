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

app.options('/getData', cors());
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

		console.log({ start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now) });
		let stats = await get(`${umamiUrl}/api/website/${website_id}/stats`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now) }, headers);
		let pageviews = await get(`${umamiUrl}/api/website/${website_id}/pageviews`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now), unit: 'hour', tz: 'America/New_York' }, headers);

		let data = { stats, pageviews };

		let finalData = {
			columns_daily: [
				{
					key: 'name',
					label: 'Today',
				},
				{
					key: 'value',
					label: '',
				}
			],
			rows_daily: [
				{
					key: '1',
					name: 'Bounces',
					value: data.stats.bounces,
				},
				{
					key: '2',
					name: 'Pageviews',
					value: data.stats.pageviews,
				},
				{
					key: '3',
					name: 'Total Time',
					value: data.stats.totaltime,
				},
				{
					key: '4',
					name: 'Visitors',
					value: data.stats.uniques,
				}
			],
			columns_hourly: [
				{
					key: 'time',
					label: 'Hourly',
				},
				{
					key: 'value',
					label: '',
				}
			],
			rows_hourly: data.pageviews.sessions.length > 0 ? data.pageviews.sessions.forEach((elem, index) => {
				let time = convertTimeToTimeZone(elem.t);
				let value = elem.y;
	
				return {
					key: index+1,
					time: time,
					value: value,
				};
			}) : [],
		};

		res.status(200).json(finalData);
	} catch (err) {
		console.log(err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/', (req, res) => {
	res.redirect('/getData');
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});