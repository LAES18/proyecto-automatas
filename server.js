const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_cambiar_en_produccion';

// Configuración de MySQL
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'smart_plant',
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware de autenticación
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Inicializar base de datos
async function initDB() {
  try {
    const conn = await pool.getConnection();
    
    // Tabla de usuarios
    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabla de tipos de plantas
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tipos_plantas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        min_soil INT NOT NULL,
        max_soil INT NOT NULL,
        min_humidity INT NOT NULL,
        max_humidity INT NOT NULL,
        min_temp DECIMAL(4,1) NOT NULL,
        max_temp DECIMAL(4,1) NOT NULL,
        watering_time INT NOT NULL,
        descripcion TEXT
      )
    `);
    
    // Tabla de parámetros del usuario
    await conn.query(`
      CREATE TABLE IF NOT EXISTS parametros_usuario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        device_id VARCHAR(50) NOT NULL,
        min_soil INT NOT NULL,
        watering_time INT NOT NULL,
        tipo_planta_id INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES usuarios(id),
        FOREIGN KEY (tipo_planta_id) REFERENCES tipos_plantas(id)
      )
    `);
    
    // Tabla de lecturas de sensores
    await conn.query(`
      CREATE TABLE IF NOT EXISTS lecturas_sensores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        timestamp DATETIME NOT NULL,
        soil_percent DECIMAL(5,2) NOT NULL,
        temperature_c DECIMAL(4,1) NOT NULL,
        humidity_percent DECIMAL(5,2) NOT NULL,
        pump_on BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_timestamp (device_id, timestamp)
      )
    `);
    
    // Insertar tipos de plantas predefinidos
    const [plantas] = await conn.query('SELECT COUNT(*) as count FROM tipos_plantas');
    if (plantas[0].count === 0) {
      await conn.query(`
        INSERT INTO tipos_plantas (nombre, min_soil, max_soil, min_humidity, max_humidity, min_temp, max_temp, watering_time, descripcion) VALUES
        ('Suculentas', 20, 40, 30, 50, 18.0, 30.0, 2, 'Requieren poco riego, suelo bien drenado'),
        ('Helechos', 60, 80, 60, 80, 15.0, 24.0, 5, 'Necesitan alta humedad y suelo húmedo'),
        ('Cactáceas', 15, 30, 20, 40, 20.0, 35.0, 2, 'Muy resistentes a la sequía'),
        ('Plantas Tropicales', 50, 70, 60, 80, 20.0, 28.0, 4, 'Requieren calor y humedad constante'),
        ('Aromáticas (Albahaca, Menta)', 40, 60, 50, 70, 18.0, 25.0, 3, 'Necesitan riego regular'),
        ('Tomates', 50, 70, 50, 70, 18.0, 27.0, 4, 'Riego frecuente durante crecimiento'),
        ('Pimientos', 45, 65, 50, 70, 20.0, 28.0, 3, 'Riego moderado constante'),
        ('Flores Ornamentales', 40, 60, 50, 70, 15.0, 25.0, 3, 'Riego moderado regular')
      `);
    }
    
    conn.release();
    console.log('Base de datos inicializada correctamente');
  } catch (error) {
    console.error('Error inicializando BD:', error);
  }
}

// Expresiones regulares para validación
const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/;

// Rutas de autenticación
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validar email con expresión regular
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Email inválido. Debe tener formato: usuario@dominio.com' 
      });
    }
    
    // Validar password con expresión regular
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        error: 'Contraseña inválida. Debe tener mínimo 6 caracteres, al menos una letra y un número' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO usuarios (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );
    
    res.json({ message: 'Usuario creado exitosamente', userId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'El email ya está registrado' });
    } else {
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validar email con expresión regular
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Email inválido' 
      });
    }
    
    // Validar que password no esté vacío
    if (!password || password.length < 1) {
      return res.status(400).json({ 
        error: 'Contraseña requerida' 
      });
    }
    
    const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /api/sensores - Recibir datos del ESP32
app.post('/api/sensores', async (req, res) => {
  try {
    const { device_id, timestamp, soil_percent, temperature_c, humidity_percent, pump_on } = req.body;
    
    await pool.query(
      `INSERT INTO lecturas_sensores (device_id, timestamp, soil_percent, temperature_c, humidity_percent, pump_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [device_id, timestamp, soil_percent, temperature_c, humidity_percent, pump_on]
    );
    
    res.json({ message: 'Datos recibidos correctamente' });
  } catch (error) {
    console.error('Error guardando lectura:', error);
    res.status(500).json({ error: 'Error al guardar datos' });
  }
});

// GET /api/parametros - Obtener parámetros para el ESP32
app.get('/api/parametros', async (req, res) => {
  try {
    const device_id = req.query.device_id;
    
    if (!device_id) {
      return res.status(400).json({ error: 'device_id requerido' });
    }
    
    const [params] = await pool.query(
      'SELECT min_soil, watering_time FROM parametros_usuario WHERE device_id = ? ORDER BY updated_at DESC LIMIT 1',
      [device_id]
    );
    
    if (params.length === 0) {
      // Valores por defecto
      return res.json({ min_soil: 40, watering_time: 3 });
    }
    
    res.json(params[0]);
  } catch (error) {
    console.error('Error obteniendo parámetros:', error);
    res.status(500).json({ error: 'Error al obtener parámetros' });
  }
});

// Rutas protegidas (requieren autenticación)

// Obtener tipos de plantas
app.get('/api/plantas', authMiddleware, async (req, res) => {
  try {
    const [plantas] = await pool.query('SELECT * FROM tipos_plantas');
    res.json(plantas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener plantas' });
  }
});

// Actualizar parámetros del usuario
app.put('/api/parametros', authMiddleware, async (req, res) => {
  try {
    const { device_id, min_soil, watering_time, tipo_planta_id } = req.body;
    
    // Verificar si ya existen parámetros
    const [existing] = await pool.query(
      'SELECT id FROM parametros_usuario WHERE user_id = ? AND device_id = ?',
      [req.userId, device_id]
    );
    
    if (existing.length > 0) {
      await pool.query(
        'UPDATE parametros_usuario SET min_soil = ?, watering_time = ?, tipo_planta_id = ? WHERE user_id = ? AND device_id = ?',
        [min_soil, watering_time, tipo_planta_id, req.userId, device_id]
      );
    } else {
      await pool.query(
        'INSERT INTO parametros_usuario (user_id, device_id, min_soil, watering_time, tipo_planta_id) VALUES (?, ?, ?, ?, ?)',
        [req.userId, device_id, min_soil, watering_time, tipo_planta_id]
      );
    }
    
    res.json({ message: 'Parámetros actualizados' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar parámetros' });
  }
});

// Obtener parámetros del usuario
app.get('/api/user-parametros', authMiddleware, async (req, res) => {
  try {
    const [params] = await pool.query(
      'SELECT * FROM parametros_usuario WHERE user_id = ?',
      [req.userId]
    );
    
    res.json(params.length > 0 ? params[0] : null);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener parámetros' });
  }
});

// Obtener lecturas recientes
app.get('/api/lecturas', authMiddleware, async (req, res) => {
  try {
    const device_id = req.query.device_id || 'esp32s3_01';
    const limit = parseInt(req.query.limit) || 50;
    
    const [lecturas] = await pool.query(
      'SELECT * FROM lecturas_sensores WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?',
      [device_id, limit]
    );
    
    res.json(lecturas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lecturas' });
  }
});

// Obtener última lectura
app.get('/api/lectura-actual', authMiddleware, async (req, res) => {
  try {
    const device_id = req.query.device_id || 'esp32s3_01';
    
    const [lecturas] = await pool.query(
      'SELECT * FROM lecturas_sensores WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1',
      [device_id]
    );
    
    res.json(lecturas.length > 0 ? lecturas[0] : null);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lectura' });
  }
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
});