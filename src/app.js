// app.js
const express = require('express');
const userController = require('./controllers/userController');
const gardenController = require('./controllers/gardenController');
const automationController = require('./controllers/automationController');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes for user
app.post('/api/user', userController.createUser);

// Routes for garden
app.post('/api/gardens', gardenController.createGarden);
app.get('/api/gardens', gardenController.getGardens);
app.delete('/api/gardens/:deviceId', gardenController.deleteGarden);

// Routes for automation
app.post('/api/automation', automationController.createAutomation);
app.get('/api/automation', automationController.getAutomations);
app.put('/api/automation/:id/toggle', automationController.toggleAutomation);
app.patch('/api/automation/:id', automationController.updateAutomation);
app.delete('/api/automation/:id', automationController.deleteAutomation);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

