const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');
const mqtt = require('mqtt');

const app = express();
const secretKey = 'ntp';

let temperature = null;
let soilHumidity = null;

let pumpStatus = 'OFF';
let lightStatus = 'OFF';
let fanStatus = 'OFF';

let pumpManualOverride = false;
let lightManualOverride = false;
let fanManualOverride = false;

// Kết nối tới cơ sở dữ liệu MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'HDSD'
});

// Kết nối đến cơ sở dữ liệu
db.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        throw err;
    }
    console.log('Connected to database');
});

// Kết nối tới MQTT Broker
const mqttClient = mqtt.connect('ws://54.255.244.186:8000/mqtt');

mqttClient.on('connect', () => {
    console.log('Connected to MQTT Broker');
    
    // Truy vấn để lấy danh sách thiết bị và tạo topic
    const sql = 'SELECT DISTINCT device_id FROM automation';
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error querying devices from database:', err);
            return;
        }

        result.forEach(row => {
            const deviceId = row.device_id;
            const temperatureTopic = `${deviceId}/temp`;
            const humidityTopic = `${deviceId}/hum`;
            const soilTopic = `${deviceId}/dat`;
            const rainTopic = `${deviceId}/mua`;
            const pumpTopic = `${deviceId}/pump`;
            const fanTopic = `${deviceId}/fan`;
            const lightTopic = `${deviceId}/light`;

            mqttClient.subscribe(temperatureTopic);
            mqttClient.subscribe(humidityTopic);
            mqttClient.subscribe(soilTopic);
            mqttClient.subscribe(rainTopic);
            mqttClient.subscribe(pumpTopic);
            mqttClient.subscribe(fanTopic);
            mqttClient.subscribe(lightTopic);

            console.log(`Subscribed to topics for device ${deviceId}`);
        });
    });
});

mqttClient.on('message', (topic, message) => {
    let payload;
    try {
        payload = JSON.parse(message);
    } catch (err) {
        console.error(`Invalid JSON payload: ${message}`);
        return;
    }
    const isFromAutomation = payload.isFromAutomation;

    const topicParts = topic.split('/');
    const deviceId = topicParts[0];
    const deviceType = topicParts[1];

    switch (deviceType) {
        case 'temp':
            temperature = parseFloat(message.toString());
            console.log(`Temperature updated for ${deviceId}: ${temperature}`);
            break;
        case 'dat':
            soilHumidity = parseFloat(message.toString());
            console.log(`Soil humidity updated for ${deviceId}: ${soilHumidity}`);
            break;
        case 'pump':
            if (payload.message.toString() === 'on') {
                if (!isFromAutomation) {
                    console.log('ghi de che do thu cong');
                    pumpManualOverride = true;
                }
            } else if (payload.message.toString() === 'off') {
                if (!isFromAutomation) {
                    console.log('tro lai che do tu dong');
                    pumpManualOverride = false;
                }
            }
            console.log(payload);
            pumpStatus = payload.message.toString() === 'on' ? 'ON' : 'OFF';
            console.log(`Pump status updated for ${deviceId}: ${pumpStatus}`);
            break;
        case 'light':
            if (payload.message.toString() === 'on') {
                if (!isFromAutomation) {
                    console.log('ghi de che do thu cong');
                    lightManualOverride = true;
                }
            } else if (payload.message.toString() === 'off') {
                if (!isFromAutomation) {
                    console.log('tro lai che do tu dong');
                    lightManualOverride = false;
                }
            }
            lightStatus = payload.message.toString() === 'on' ? 'ON' : 'OFF';
            console.log(`Light status updated for ${deviceId}: ${lightStatus}`);
            break;
        case 'fan':
            if (payload.message.toString() === 'on') {
                if (!isFromAutomation) {
                    console.log('ghi de che do thu cong');
                    fanManualOverride = true;
                }
            } else if (payload.message.toString() === 'off') {
                if (!isFromAutomation) {
                    console.log('tro lai che do tu dong');
                    fanManualOverride = false;
                }
            }
            fanStatus = payload.message.toString() === 'on' ? 'ON' : 'OFF';
            console.log(`Fan status updated for ${deviceId}: ${fanStatus}`);
            break;
        default:
            console.log(`Unknown topic: ${topic}`);
    }
});

mqttClient.on('error', (err) => {
    console.error('MQTT connection error:', err);
});

mqttClient.on('offline', () => {
    console.error('MQTT client is offline');
});

mqttClient.on('reconnect', () => {
    console.log('Reconnecting to MQTT Broker');
});

mqttClient.on('close', () => {
    console.log('MQTT connection closed');
});

app.use(express.json());

const publishWithRetain = (topic, message, isFromAutomation) => {
    mqttClient.publish(topic, JSON.stringify({ message, isFromAutomation }), { qos: 0, retain: true }, function (err) {
        if (!err) {
            console.log(`Published "${message}" to topic "${topic}" with isFromAutomation=${isFromAutomation}`);
        } else {
            console.error('Failed to publish message', err);
        }
    });
};

function processAutomation() {
    const currentTime = moment().tz('Asia/Ho_Chi_Minh').startOf('minute').format('HH:mm:ss');
    const currentDate = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
    const sql = 'SELECT * FROM automation';

    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error querying automation from database:', err);
            return;
        }

        result.forEach(automation => {
            if (automation.is_daily) {
                console.log("1. TRUONG HOP HANG NGAY");
                handleTime(automation, currentTime);
            } else {
                console.log("2. Truong hop SELECTED_DATE");
                if(currentDate == automation.selected_date){
                    handleTime(automation, currentTime);
                }
            }
        });
        console.log('Automation processed successfully');
    });
}

function handleTime(automation, currentTime){
    if (currentTime >= automation.start_time && currentTime < automation.end_time) {
        console.log("3. TRUONG HOP DUNG THOI GIAN");
        if (automation.is_enabled) {
          if (!automation.is_check_threshold) {
            console.log("5. TRUONG HOP KHONG CHECK NGUONG");
            handleNoCheckThreshold(automation);
          } else {
            console.log("6. TRUONG HOP CO CHECK NGUONG");
            handleCheckThreshold(automation);
          }
        } else {
          handleOutTime(automation);
        }
        
    } else {
        if(currentTime == automation.end_time){
            console.log("4. TRUONG HOP END THOI GIAN");
            handleOutTime(automation);
        }
    }
}

function handleOutTime(automation){
    console.log(pumpStatus);
    console.log("thiet bi tat la: " + automation.type_control_device);
    const topicPrefix = `${automation.device_id}`;
    switch (automation.type_control_device) {
        case 'Đèn':
            if(!lightManualOverride && lightStatus === 'ON'){
                publishWithRetain(`${topicPrefix}/light`, 'off', true);
                console.log('Turned off light');
                lightStatus = 'OFF';
            }
            break;
        case 'Bơm':
            console.log('thiet bi bom tat');
            console.log(pumpStatus);
            console.log(!pumpManualOverride);
            if(!pumpManualOverride && pumpStatus === 'ON'){
                publishWithRetain(`${topicPrefix}/pump`, 'off', true);
                console.log('Turned off pump');
                pumpStatus = 'OFF';
            }
            break;
        case 'Quạt':
            if (!fanManualOverride && fanStatus === 'ON') {
                publishWithRetain(`${topicPrefix}/fan`, 'off', true);
                console.log('Turned off fan');
                fanStatus = 'OFF';
            }
            break;
        default:
            console.log('Unknown device type');
    }
}

function handleCheckThreshold(automation){
    console.log("chan truoc co check nguong");
    const topicPrefix = `${automation.device_id}`;
    if (!pumpManualOverride && pumpStatus === 'OFF' && soilHumidity <= automation.lower_threshold_value && automation.type_measure_device === 'soil_humidity' && automation.lower_threshold_value !== '') {
        publishWithRetain(`${topicPrefix}/pump`, 'on', true);
        console.log('Turned on pump');
        pumpStatus = 'ON';
    } else if (!pumpManualOverride && pumpStatus === 'ON' && automation.upper_threshold_value <= soilHumidity && automation.type_measure_device === 'soil_humidity' && automation.upper_threshold_value !== '') {
        publishWithRetain(`${topicPrefix}/pump`, 'off', true);
        console.log('Turned off pump');
        pumpStatus = 'OFF';
    } else if (!fanManualOverride && fanStatus === 'OFF' && temperature >= automation.upper_threshold_value && automation.type_measure_device === 'temperature' && automation.upper_threshold_value !== '') {
        publishWithRetain(`${topicPrefix}/fan`, 'on', true);
        console.log('Turned on fan');
        fanStatus = 'ON';
    } else if (!lightManualOverride && lightStatus === 'OFF' && temperature <= automation.lower_threshold_value && automation.type_measure_device === 'temperature' && automation.lower_threshold_value !== '') {
        publishWithRetain(`${topicPrefix}/light`, 'on', true);
        console.log('Turned on light');
        lightStatus = 'ON';
    }
}

function handleNoCheckThreshold(automation){
    console.log("thiet bi bat la: " + automation.type_control_device);
    const topicPrefix = `${automation.device_id}`;
    switch (automation.type_control_device) {
        case 'Đèn':
            if(!lightManualOverride && lightStatus === 'OFF'){
                publishWithRetain(`${topicPrefix}/light`, 'on', true);
                console.log('Turned on light');
                lightStatus = 'ON';
            }
            break;
        case 'Bơm':
            console.log('thiet bi bom bat');
            console.log(!pumpManualOverride);
            if(!pumpManualOverride && pumpStatus === 'OFF'){
                publishWithRetain(`${topicPrefix}/pump`, 'on', true);
                console.log('Turned on pump');
                pumpStatus = 'ON';
            }
            break;
        case 'Quạt':
            if (!fanManualOverride && fanStatus === 'OFF') {
                publishWithRetain(`${topicPrefix}/fan`, 'on', true);
                console.log('Turned on fan');
                fanStatus = 'ON';
            }
            break;
        default:
            console.log('Unknown device type');
    }
}

// Set interval timer to call processAutomation every 5 seconds
setInterval(processAutomation, 5000);


// Tạo một endpoint để tạo một người dùng mới
app.post('/api/user', (req, res) => {
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
});

// Tạo endpoint đăng nhập để xác thực người dùng
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM user WHERE email = ?';
    db.query(sql, [email], async (err, result) => {
        if (err) {
            console.error('Error querying database:', err);
            res.status(500).json({ error: 'Internal server error' });
            throw err;
        }
        if (result.length === 0) {
            console.log('User not found:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = result[0];
        try {
            if (password !== user.password) {
                console.log('Password does not match');
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            console.log('Password matches');
            const token = jwt.sign({ id: user.id, email: user.email }, secretKey, { expiresIn: '1h' });
            res.status(200).json({ token });
        } catch (compareError) {
            console.error('Error comparing passwords with bcrypt:', compareError);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// Tạo một endpoint để tạo một farm mới
app.post('/api/farms', (req, res) => {
    const { nameFarm, addressFarm } = req.body;
    const sql = 'INSERT INTO farm (nameFarm, addressFarm) VALUES (?, ?)';
    db.query(sql, [nameFarm, addressFarm], (err, result) => {
        if (err) {
            console.error('Error inserting farm:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(201).json({ message: 'Farm created successfully' });
    });
});

// Tạo một endpoint để lấy danh sách các farm
app.get('/api/farms', (req, res) => {
    const sql = 'SELECT idFarm, nameFarm, addressFarm FROM farm';
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error querying farms from database:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json(result);
    });
});

app.put('/api/farms/:idFarm', (req, res) => {
    const { idFarm } = req.params;
    const { nameFarm, addressFarm } = req.body;
    console.log(idFarm);
    console.log(nameFarm);
    console.log(addressFarm);
    const sql = 'UPDATE farm SET nameFarm = ?, addressFarm = ? WHERE idFarm = ?';
    db.query(sql, [nameFarm, addressFarm, idFarm], (err, result) => {
        if (err) {
            console.error('Error updating farm:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Farm updated successfully' });
    });
});



// Tạo một endpoint để xóa một farm
app.delete('/api/farms/:idFarm', (req, res) => {
    const { idFarm } = req.params;
    const sql = 'DELETE FROM farm WHERE idFarm = ?';
    db.query(sql, [idFarm], (err, result) => {
        if (err) {
            console.error('Error deleting farm:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Farm deleted successfully' });
    });
});

// Tạo một endpoint để lấy danh sách các khu trong một trang trại dựa vào idFarm
app.get('/api/farms/:idFarm/gardens', (req, res) => {
    const idFarm = req.params.idFarm;
    const sql = 'SELECT idGarden, nameGarden, deviceId, DATE_FORMAT(datePlanting, \'%Y-%m-%d\') AS datePlanting FROM gardens WHERE idFarm = ?';
    db.query(sql, [idFarm], (err, result) => {
        if (err) {
            console.error('Error querying gardens from database:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json(result);
    });
});


// Tạo một endpoint để thêm một vườn mới
app.post('/api/gardens', (req, res) => {
    const { nameGarden, deviceId, datePlanting, idFarm } = req.body;
    console.log('Received data:', req.body); // Log dữ liệu nhận được từ client

    const sql = 'INSERT INTO gardens (nameGarden, deviceId, datePlanting, idFarm) VALUES (?, ?, ?, ?)';
    console.log('SQL INSERT:', sql);

    db.query(sql, [nameGarden, deviceId, datePlanting, idFarm], (err, result) => {
        if (err) {
            console.error('Error inserting garden:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        console.log('Inserted data:', [nameGarden, deviceId, datePlanting, idFarm]);
        res.status(201).json({ message: 'Garden added successfully', idGarden: result.insertId });
    });
});

// Tạo một endpoint để lấy danh sách các khu trong một trang trại dựa vào idFarm
app.get('/api/farms/:idFarm/gardens', (req, res) => {
    const idFarm = req.params.idFarm;
    const sql = 'SELECT idGarden, nameGarden, deviceId, DATE_FORMAT(datePlanting, \'%Y-%m-%d\') AS datePlanting FROM gardens WHERE idFarm = ?';
    db.query(sql, [idFarm], (err, result) => {
        if (err) {
            console.error('Error querying gardens from database:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json(result);
    });
});

// Tạo một endpoint để cập nhật thông tin của một garden
app.put('/api/gardens/:idGarden', (req, res) => {
    const { idGarden } = req.params;
    const { nameGarden, deviceId, datePlanting } = req.body;
    const sql = 'UPDATE gardens SET nameGarden = ?, deviceId = ?, datePlanting = ? WHERE idGarden = ?';
    db.query(sql, [nameGarden, deviceId, datePlanting, idGarden], (err, result) => {
        if (err) {
            console.error('Error updating garden:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Garden updated successfully' });
    });
});

// Tạo một endpoint để xóa vườn dựa vào idGarden
app.delete('/api/gardens/:idGarden', (req, res) => {
    const idGarden = req.params.idGarden;

    const sql = 'DELETE FROM gardens WHERE idGarden = ?';
    console.log('SQL DELETE:', sql);

    db.query(sql, [idGarden], (err, result) => {
        if (err) {
            console.error('Error deleting garden:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        console.log('Deleted garden with idGarden:', idGarden);
        res.status(200).json({ message: 'Garden deleted successfully' });
    });
});

app.post('/api/automation', (req, res) => {
    const {
        type, start_time, end_time, deviceId, is_check_threshold, typeMeasureDevice,
        lower_threshold_value, upper_threshold_value, is_enabled, selected_date, is_daily
    } = req.body;

    let change_var_hasThreshold = req.body['is_check_threshold'];
    let change_var_typeMeasureDevice = req.body['type_measure_device'];
    let change_var_lower_ThresholdValue = req.body['lower_threshold_value'];
    let change_var_upper_ThresholdValue = req.body['upper_threshold_value'];
    let change_var_deviceId = req.body['device_id'];
    let change_var_type = req.body['type_control_device'];
    let change_var_is_daily = req.body['is_daily'];
    let change_var_selected_date = req.body['selected_date'];
    let change_var_is_enabled = req.body['is_enabled'];

    console.log(req.body);

    const sql = 'INSERT INTO automation (type_control_device, start_time, end_time, device_id, is_check_threshold, type_measure_device, lower_threshold_value, upper_threshold_value, is_enabled, is_daily, selected_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    db.query(sql, [
        change_var_type, start_time, end_time, change_var_deviceId, change_var_hasThreshold,
        change_var_typeMeasureDevice, change_var_lower_ThresholdValue, change_var_upper_ThresholdValue,
        change_var_is_enabled, change_var_is_daily, change_var_selected_date
    ], (err, result) => {
        if (err) {
            console.error('Error inserting automation:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        // Fetch the inserted automation to return it
        const insertedId = result.insertId;
        const fetchSql = 'SELECT * FROM automation WHERE id = ?';

        db.query(fetchSql, [insertedId], (fetchErr, fetchResult) => {
            if (fetchErr) {
                console.error('Error fetching new automation:', fetchErr);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }
            res.status(201).json(fetchResult[0]);
        });
    });
});


app.get('/api/automation', (req, res) => {
    const deviceId = req.query.device_id;
    console.log(deviceId);
    const sql = 'SELECT * FROM automation WHERE device_id = ?';

    db.query(sql, [deviceId], (err, result) => {
        if (err) {
            console.error('Error querying automation:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json(result);
    });
});


app.patch('/api/automation/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'UPDATE Automation SET is_enabled = !is_enabled WHERE id = ?';

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error updating automation:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Automation status toggled successfully' });
    });
});

app.put('/api/automation/:id', (req, res) => {
    const id = req.params.id;
    const { device_id,
      start_time,
      end_time,
      type_control_device,
      is_daily,
      selected_date,
      is_check_threshold,
      type_measure_device,
      lower_threshold_value,
      upper_threshold_value, 
      is_enabled,
    } = req.body;

    const sql = `
    UPDATE automation
    SET
      device_id = ?,
      start_time = ?,
      end_time = ?,
      type_control_device = ?,
      is_daily = ?,
      selected_date = ?,
      is_check_threshold = ?,
      type_measure_device = ?,
      lower_threshold_value = ?,
      upper_threshold_value = ?,
      is_enabled = ?
    WHERE id = ?
  `;
    db.query(sql, 
      [
        device_id,
        start_time,
        end_time,
        type_control_device,
        is_daily,
        selected_date,
        is_check_threshold,
        type_measure_device,
        lower_threshold_value,
        upper_threshold_value,
        is_enabled,
        id,
      ], (err, result) => {
        if (err) {
            console.error('Error updating automation:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Automation status updated successfully' });
    });
});

app.delete('/api/automation/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM Automation WHERE id = ?';

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error deleting automation:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(200).json({ message: 'Automation deleted successfully' });
    });
});


// Tạo một endpoint để lấy danh sách các tỉnh thành
app.get('/api/provinces', (req, res) => {
    const provinces = [
        { id: 1, name: 'Hà Nội' },
        { id: 2, name: 'TP. Hồ Chí Minh' },
        { id: 3, name: 'Hải Phòng' },
        { id: 4, name: 'Đà Nẵng' },
        { id: 5, name: 'Hà Giang' },
        { id: 6, name: 'Cao Bằng' },
        { id: 7, name: 'Bắc Kạn' },
        { id: 8, name: 'Tuyên Quang' },
        { id: 9, name: 'Lào Cai' },
        { id: 10, name: 'Điện Biên' },
        { id: 11, name: 'Lai Châu' },
        { id: 12, name: 'Sơn La' },
        { id: 13, name: 'Yên Bái' },
        { id: 14, name: 'Hoà Bình' },
        { id: 15, name: 'Thái Nguyên' },
        { id: 16, name: 'Lạng Sơn' },
        { id: 17, name: 'Quảng Ninh' },
        { id: 18, name: 'Bắc Giang' },
        { id: 19, name: 'Phú Thọ' },
        { id: 20, name: 'Vĩnh Phúc' },
        { id: 21, name: 'Bắc Ninh' },
        { id: 22, name: 'Hải Dương' },
        { id: 23, name: 'Hưng Yên' },
        { id: 24, name: 'Thái Bình' },
        { id: 25, name: 'Hà Nam' },
        { id: 26, name: 'Nam Định' },
        { id: 27, name: 'Ninh Bình' },
        { id: 28, name: 'Thanh Hóa' },
        { id: 29, name: 'Nghệ An' },
        { id: 30, name: 'Hà Tĩnh' },
        { id: 31, name: 'Quảng Bình' },
        { id: 32, name: 'Quảng Trị' },
        { id: 33, name: 'Thừa Thiên Huế' },
        { id: 34, name: 'Quảng Nam' },
        { id: 35, name: 'Quảng Ngãi' },
        { id: 36, name: 'Bình Định' },
        { id: 37, name: 'Phú Yên' },
        { id: 38, name: 'Khánh Hòa' },
        { id: 39, name: 'Ninh Thuận' },
        { id: 40, name: 'Bình Thuận' },
        { id: 41, name: 'Kon Tum' },
        { id: 42, name: 'Gia Lai' },
        { id: 43, name: 'Đắk Lắk' },
        { id: 44, name: 'Đắk Nông' },
        { id: 45, name: 'Lâm Đồng' },
        { id: 46, name: 'Bình Phước' },
        { id: 47, name: 'Tây Ninh' },
        { id: 48, name: 'Bình Dương' },
        { id: 49, name: 'Đồng Nai' },
        { id: 50, name: 'Bà Rịa - Vũng Tàu' },
        { id: 51, name: 'Long An' },
        { id: 52, name: 'Tiền Giang' },
        { id: 53, name: 'Bến Tre' },
        { id: 54, name: 'Trà Vinh' },
        { id: 55, name: 'Vĩnh Long' },
        { id: 56, name: 'Đồng Tháp' },
        { id: 57, name: 'An Giang' },
        { id: 58, name: 'Kiên Giang' },
        { id: 59, name: 'Cần Thơ' },
        { id: 60, name: 'Hậu Giang' },
        { id: 61, name: 'Sóc Trăng' },
        { id: 62, name: 'Bạc Liêu' },
        { id: 63, name: 'Cà Mau' }
    ];
    res.status(200).json(provinces);
});



// Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
