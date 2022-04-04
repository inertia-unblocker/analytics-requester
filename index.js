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

TimeDate = class timeDateUtils {
	convertSec(sec) {
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
	
		let wkstr = wk ? `${wk}w, ` : '';
		let daystr = day ? `${day}d, ` : '';
		let hrstr = hr ? `${hr}` : '00';
		let minstr = min ? `${min}` : '00';
		let secstr = sec ? `${sec}` : '00';
	
		hrstr  = hrstr.length  == 1 ? '0' + hrstr : hrstr;
		minstr = minstr.length == 1 ? '0' + minstr : minstr;
		secstr = secstr.length == 1 ? '0' + secstr : secstr;
	
		return `${wkstr}${daystr}${hrstr}h ${minstr}m ${secstr}s`;
	}

	from24to12(hmsString) {
		let hms = hmsString.split(':');
		
		let h = parseInt(hms[0]);
		let m = parseInt(hms[1]);
		let s = parseInt(hms[2]);
		let ap = '';
	
		if (h > 12) {
			h -= 12;
			ap = 'PM';
		} else if (h < 12) {
			ap = 'AM';
		} else {
			ap = 'PM';
		}
		
		h = h.toString();
		m = m.toString();
		s = s.toString();
	
		m = m.length == 1 ? '0' + m : m;
		s = s.length == 1 ? '0' + s : s;
	
		return `${h}:${m} ${ap}`;
	}

	getTZData(tz) {
		let tzData = '';
		
		try { tzData = timezones.filter(timezone => timezone.abbr == tz)[0]; }
		catch (e) { 
			tz = tz.replace('GMT', 'UTC');
			tz = tz.replace('UTC', '');
			
			tzData = timezones.filter(timezone => timezone.offset == parseInt(tz))[0]; 
		}
	
		return tzData;
	}

	getStartEndTime(tzData) {
		const dateObj = new Date();

		let date = dateObj.getDate();
		let month = dateObj.getMonth() + 1;
		let year = dateObj.getFullYear();

		let thisMorning = new Date(`${year}-${month}-${date} 00:00:00 ${tzData.abbr}`);
		let thisEvening = new Date(`${year}-${month}-${date} 23:59:59 ${tzData.abbr}`);

		let thisMorningMS = thisMorning.getTime();
		let thisEveningMS = thisEvening.getTime();

		return {thisMorningMS, thisEveningMS};
	}
};

Net = class networkUtils {
	request(url, params = {}, headers, method = 'GET') {
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
	}

	get(url, params, headers) {
		return this.request(url, params, headers, 'GET');
	}

	post(url, params, headers) {
		return this.request(url, params, headers, 'POST');
	}
};

const timeDate = new TimeDate();
const net = new Net();

app.options('/getData', cors());
app.get('/getData', async (req, res) => {
	try {
		// ======== BOILERPLATE ======== //
		const tzData = timeDate.getTZData(req.query.tz);
		const {thisMorningMS, thisEveningMS} = timeDate.getStartEndTime(tzData);
		

		// ======== DATA ======== //
		const token = (await net.post(`${umamiUrl}/api/auth/login`, { username: umamiUsername, password: umamiPassword })).token;
		const headers = { 'Authorization': `Bearer ${token}`};

		const websites = await net.get(`${umamiUrl}/api/websites`, {}, headers);
		const website_id = websites.filter(website => website.name.toLowerCase() === 'inertia')[0].website_id;

		let stats = await net.get(`${umamiUrl}/api/website/${website_id}/stats`, {start_at: thisMorningMS, end_at: thisEveningMS }, headers);
		let pageviews = await net.get(`${umamiUrl}/api/website/${website_id}/pageviews`, { start_at: thisMorningMS, end_at: thisEveningMS, unit: 'hour', tz: 'America/New_York' }, headers);


		// ======= FORMATTING ======= //
		let data = { stats, pageviews };
		let rows_hourly = [];
		for (let i=0; i<data.pageviews.pageviews.length; i++) {
			let arrayDate = timeDate.from24to12(data.pageviews.pageviews[i].t.split(' ')[1]);
			let arrayValue = data.pageviews.pageviews[i].y;
	
			rows_hourly.push({
				key: `${i+1}`,
				time: `${arrayDate}`,
				value: arrayValue,
			});
		}

		let totaltime = timeDate.convertSec(parseInt(data.stats.totaltime.value));

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
					value: data.stats.bounces.value,
				},
				{
					key: '2',
					name: 'Pageviews',
					value: data.stats.pageviews.value,
				},
				{
					key: '3',
					name: 'Total Time',
					value: totaltime,
				},
				{
					key: '4',
					name: 'Visitors',
					value: data.stats.uniques.value,
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
	res.redirect(`/getData?tz=${req.query.tz}`);
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});