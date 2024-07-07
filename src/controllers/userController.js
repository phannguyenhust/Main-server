// controllers/userController.js
const db = require('../db');

exports.createUser = (req, res) => {
  const { email, password } = req.body;
  const sql = 'INSERT INTO user (email, password) VALUES (?, ?)';
  db.query(sql, [email, password], (err, result) => {
    if (err) {
      console.error('Error inserting user:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.status(201).json({ message: 'User created successfully' });
  });
};

