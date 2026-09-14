require('dotenv').config();
const { validateProductionConfig } = require('./config/kra');
validateProductionConfig();
const app = require('./app');

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`KRA API gateway listening on port ${port}`);
});
