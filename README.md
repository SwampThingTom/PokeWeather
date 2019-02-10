# PokeWeather
Posts Pokémon Go weather forecasts to Discord.

## Configuring
Requires an AWS account. Currently creating and configuring the AWS resources has to be done manually. I plan to update this to create everything using [serverless](https://serverless.com/).

### DynamoDB table
```
Primary partition key: id (string)
Primary sort key: -
```

### AWS Lambdas
Requires two AWS lambdas. The first fetches 12-hour weather forecasts from AccuWeather and stores them in a DynamoDB table. The second posts 8-hour Pokémon Go weather forecasts to a Discord webhook.

#### fetch-weather
```
Source: fetchWeather.js
Runtime: Node.js 8.10
Handler: fetchWeather.handler
```

##### Environment Variables
```
DB_TABLE_NAME: The name of the DynamoDB table for storing weather data.
WS_API_KEY: Your AccuWeather API key.
```

##### Execution Role
Requires write access to the DynamoDB table.

##### Trigger
CloudWatch Event: `cron(5 * ? * * *)`

Pulls the forecast every hour at 5 minutes past the hour.

#### post-discord
```
Source: postDiscord.js
Runtime: Node.js 8.10
Handler: postDiscord.handler
```

##### Environment Variables
```
DB_TABLE_NAME: The name of the DynamoDB table for storing weather data.
WEBHOOK_ID: Your Discord webhook ID.
WEBHOOK_TOKEN: Your Discord webhook token.
```

##### Execution Role
Requires read access to the DynamoDB table.

##### Trigger
CloudWatch Event: `cron(15 6,14,22 * * ? *)`

Posts to Discord at 6:15, 14:15, and 22:15 UTC.

Note that "6,14,22" are the UTC hours that correspond to the desired AccuWeather forecast time to use.
