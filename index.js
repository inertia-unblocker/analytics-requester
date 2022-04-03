const express = require('express'),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	fetch = require('node-fetch'),
	timezones = require('./timezones.json'),
	app = express(),
	PORT = 5000,
	umamiUsername = process.env.UMAMI_USERNAME || 'TheAlphaReturns',
	umamiPassword = process.env.UMAMI_PASSWORD,
	umamiUrl = process.env.UMAMI_URL || 'https://inertia-analytics.vercel.app';

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function getUnixTime(dateObject) {
	return Math.floor(dateObject.getTime());
}

function convertTimeToTimeZone(time) {
	time = time.split(':');
	let hr = time[0];
	let mi = time[1];
	let sc = time[2];

	let tz = new Date().toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ')[2];
	let offset = 0;
	let offsetMin = 0;

	for (let i=0; i<timezones.length; i++) {
		if (timezones[i].abbr == tz) {
			offset = timezones[i].offset;
			break;
		}
	}

	if (offset.toString().endsWith('.5')) offsetMin = 30;
	if (offset.toString().endsWith('.75') /* *cough* NEPAL *cough* */) offsetMin = 45;
	Math.floor(offset);

	if (offset < 0) {
		hr = parseInt(hr);
		hr = hr + offset;

		mi = parseInt(mi);
		mi = mi - offsetMin;

		if (mi < 0) {
			mi = 60 + mi;
			hr = hr - 1;
		}
		
		if (hr < 0) {
			hr = hr + 24;
		}
	} else {
		hr = parseInt(hr);
		hr = hr + offset;

		mi = parseInt(mi);
		mi = mi + offsetMin;

		if (mi >= 60) {
			mi = mi - 60;
			hr = hr + 1;
		}

		if (hr >= 24) {
			hr = hr - 24;
		}
	}

	hr = hr.toString();
	mi = mi.toString();
	sc = sc.toString();

	if (hr.length == 1) hr = '0' + hr;
	if (mi.length == 1) mi = '0' + mi;
	if (sc.length == 1) sc = '0' + sc;

	let ap = '';
	if (hr > 12) {
		ap = ' PM';
		hr = hr - 12;
	} else if (hr < 12) {
		ap = ' AM';
	} else {
		ap = ' PM';
	}

	return `${hr}:${mi}${ap}`;
}

function convertSec(sec) {
	let wk = 0;
	let day = 0;
	let hr = 0;
	let min = 0;

	while (sec >= 60) {
		min += 1;
		sec -= 60;
	}

	while (min >= 60) {
		hr++;
		min -= 60;
	}

	while (hr >= 24) {
		day++;
		hr -= 24;
	}

	while (day >= 7) {
		wk++;
		day -= 7;
	}

	wkstr = wk ? `${wk}w, ` : '';
	daystr = day ? `${day}d, ` : '';
	hrstr = hr ? `${hr}` : '00';
	minstr = min ? `${min}` : '00';
	secstr = sec ? `${sec}` : '00';

	hrstr  = hrstr.length  == 1 ? '0' + hrstr : hrstr;
	minstr = minstr.length == 1 ? '0' + minstr : minstr;
	secstr = secstr.length == 1 ? '0' + secstr : secstr;

	return `${wkstr}${daystr}${hrstr}h ${minstr}m ${secstr}s`;
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

		let stats = await get(`${umamiUrl}/api/website/${website_id}/stats`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now) }, headers);
		let pageviews = await get(`${umamiUrl}/api/website/${website_id}/pageviews`, { start_at: getUnixTime(new Date(now.toISOString().substring(10, 0))), end_at: getUnixTime(now), unit: 'hour', tz: 'America/New_York' }, headers);









		// ======= FORMATTING ======= //
		let data = { stats, pageviews };
		let rows_hourly = [];
		for (let i=0; i<data.pageviews.sessions.length; i++) {
			let arrayDate = convertTimeToTimeZone(data.pageviews.sessions[i].t.split(' ')[1]);
			let arrayValue = data.pageviews.sessions[i].y;
	
			rows_hourly.push({
				key: `${i+1}`,
				time: `${arrayDate}`,
				value: arrayValue,
			});
		}

		let totaltime = convertSec(parseInt(data.stats.totaltime.value));

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
					value: totaltime,
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
			rows_hourly,
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