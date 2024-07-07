// controllers/gardenController.js
const db = require('../db');

exports.createGarden = (req, res) => {
  const { nameGarden, deviceId, datePlanting } = req.body;
  const sql = 'INSERT INTO gardens (nameGarden, deviceId, datePlanting) VALUES (?, ?, ?)';
  db.query(sql, [nameGarden, deviceId, datePlanting], (err, result) => {
    if (err) {
      console.error('Error inserting garden:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    console.log('Inserted data:', [nameGarden, deviceId, datePlanting]);
    res.status(201).json({ message: 'Garden added successfully' });
  });
};

exports.getGardens = (req, res) => {
  const sql = 'SELECT idGarden, nameGarden, deviceId, DATE_FORMAT(datePlanting, \'%Y-%m-%d\') AS datePlanting FROM gardens';
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error querying gardens from database:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.status(200).json(result);
  });
};

exports.deleteGarden = (req, res) => {
  const deviceId = req.params.deviceId;
  const sql = 'DELETE FROM gardens WHERE deviceId = ?';
  db.query(sql, [deviceId], (err, result) => {
    if (err) {
      console.error('Error deleting garden:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    console.log('Deleted garden with deviceId:', deviceId);
    res.status(200).json({ message: 'Garden deleted successfully' });
  });
};

