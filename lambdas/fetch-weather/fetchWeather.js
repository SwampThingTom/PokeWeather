'use strict';

const AWS = require('aws-sdk');
const uuid = require('uuid');
const documentClient = new AWS.DynamoDB.DocumentClient();

const forecastService = new AWS.Service({

    endpoint: 'http://dataservice.accuweather.com',
    convertResponseTypes: false,

    apiConfig: {
        metadata: {
            protocol: 'rest-json'
        },
        operations: {
            GetForecast: {
                http: {
                    method: 'GET',
                    requestUri: '/forecasts/v1/hourly/12hour/{locationID}'
                },
                input: {
                    type: 'structure',
                    required: [ 'apiKey', 'locationID', 'details', 'metric' ],
                    members: {
                        'apiKey': {
                            location: 'querystring',
                            locationName: 'apikey',
                            sensitive: true
                        },
                        'locationID': {
                            location: 'uri',
                            locationName: 'locationID'
                        },
                        'details': {
                            location: 'querystring',
                            locationName: 'details'
                        },
                        'metric': {
                            location: 'querystring',
                            locationName: 'metric'
                        }
                    }
                },
            },
        },
    }
});

forecastService.isGlobalEndpoint = true;

// UTC pull times for actual forecast data.
const forecastTimes = [ '06', '14', '22' ];

const locations = [
    { locationID: '2110989', locationName: 'Herndon (Floris)', hourly: true },
    { locationID: '341249',  locationName: 'Reston (RTC)' },
];

function getForecastFromResponse(response) {
    const keys = Object.keys(response).filter(key => {
        if (key === null || key === undefined) return false;
        const value = response[key];
        return !(value === null || value === undefined);
    });

    return keys.map(key => {
        return response[key];
    });
}

function makeHourlyForecast(locationID, locationName, requestTime, forecast) {
    return forecast.map(hourly => {
        return {
            id: uuid.v1(),
            locationID: locationID,
            locationName: locationName,
            requestTime: requestTime,
            dateTime: hourly.DateTime,
            weatherIcon: hourly.WeatherIcon,
            isDaylight: hourly.IsDaylight,
            windSpeed: hourly.Wind.Speed.Value,
            windGust: hourly.WindGust.Speed.Value,
        }
    });
}

function saveHourlyForecast(table, hour, callback) {
	const params = {
		Item: hour,
		TableName: table
	};
	documentClient.put(params, function(err, data) {
        if (err) {
            console.error('Error saving forecast:', err);
        }
	});
}

function hour(time) {
    console.log('hour = ' + time.substring(11,13));
    return time.substring(11,13);
}

function getForecastForLocation(location, requestTime) {
    const { locationID, locationName, hourly } = location;

    const shouldFetchLocation = location.hourly || forecastTimes.includes(hour(requestTime));
    if (!shouldFetchLocation) {
        console.log('Not fetching location for ' + locationName + ' this hour.');
        return;
    }

    forecastService.getForecast({
        apiKey: process.env.WS_API_KEY,
        locationID: location.locationID,
        details: 'true',
        metric: 'true',
    }, (err, data) => {

        if (err) {
            console.error('>>> operation error:', err);
            return;
        }

        const dbTable = process.env.DB_TABLE_NAME;
        const forecast = getForecastFromResponse(data);
        const hourlyForecast = makeHourlyForecast(locationID, locationName, requestTime, forecast);
        hourlyForecast.forEach(hour => {
            //console.log(JSON.stringify(hour));
            saveHourlyForecast(dbTable, hour);
        });
    });
}

exports.handler = () => {
    const requestTime = new Date().toISOString();
    locations.forEach(location => getForecastForLocation(location, requestTime));
};
