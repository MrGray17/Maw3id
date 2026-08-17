import { createApp } from './app.js';
import { assertProductionConfig, loadConfig } from './config.js';

const config = loadConfig();
assertProductionConfig(config);

const app = createApp(config);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Maw3id API listening',
      service: config.serviceName,
      environment: config.env,
      port: config.port,
    }),
  );
});
