# Smart Plant - Sistema de Riego Inteligente

Sistema de riego inteligente basado en ESP32 con interfaz web para monitoreo y control.

## Características

- Monitoreo en tiempo real de humedad del suelo, temperatura y humedad ambiental
- Control automático de riego basado en parámetros configurables
- Interfaz web responsive
- API REST
- Autenticación de usuarios con JWT
- Base de datos MySQL para almacenamiento de datos

## Requisitos

- Node.js >= 18.x
- MySQL >= 5.7

## Configuración

1. Clona el repositorio
2. Copia `.env.example` a `.env` y configura tus variables de entorno
3. Instala las dependencias:
```bash
npm install
```
4. Inicia el servidor:
```bash
npm run dev
```

## Despliegue en Railway

1. Crea una cuenta en Railway.app
2. Conecta tu repositorio de GitHub
3. Configura las variables de entorno en Railway:
   - MYSQLHOST
   - MYSQLUSER
   - MYSQLPASSWORD
   - MYSQLDATABASE
   - MYSQLPORT
   - JWT_SECRET
   - PORT
4. Railway detectará automáticamente el Procfile y desplegará la aplicación

## API Endpoints

- POST /api/register - Registro de usuarios
- POST /api/login - Inicio de sesión
- POST /api/sensores - Recibir datos del ESP32
- GET /api/parametros - Obtener parámetros para el ESP32
- GET /api/plantas - Obtener tipos de plantas
- PUT /api/parametros - Actualizar parámetros del usuario
- GET /api/user-parametros - Obtener parámetros del usuario
- GET /api/lecturas - Obtener lecturas recientes
- GET /api/lectura-actual - Obtener última lectura
