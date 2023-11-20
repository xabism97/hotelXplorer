const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

// Crear la aplicación Express
const app = express();

// Configurar el proxy para el microservicio de Node.js (app.js)
const nodeServiceProxy = createProxyMiddleware({
  target: 'http://localhost:3000', // Asume que este es el puerto donde se ejecuta tu microservicio Node.js
  changeOrigin: true,
  pathRewrite: { '^/node-service': '' }, // Reescribe las rutas si es necesario
});



// Configurar el proxy para el microservicio de Python (main.py)
const pythonServiceProxy = createProxyMiddleware({
  target: 'http://localhost:8000', // Asume que este es el puerto donde se ejecuta tu microservicio Python
  changeOrigin: true,
  pathRewrite: { '^/python-service': '' }, // Reescribe las rutas si es necesario
});

// Redirigir las solicitudes a los microservicios correspondientes
app.use('/node-service', nodeServiceProxy);
app.use('/python-service', pythonServiceProxy);

// Habilitar CORS para todas las rutas
app.use(cors());


// Iniciar el servidor en el puerto 8080
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`API Gateway corriendo en http://localhost:${PORT}`);
});
