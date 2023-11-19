const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000; // El puerto para el API Gateway

// Habilitar CORS para todas las rutas
app.use(cors());

// Configuración del proxy para el microservicio de FastAPI
const fastAPIProxyConfig = {
  target: 'http://localhost:8000', // La URL del microservicio de FastAPI
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': '/users', // Reescribe la ruta para usuarios
    '^/api/reviews': '/reviews', // Reescribe la ruta para reseñas
    '^/api/token': '/token', // Reescribe la ruta para token
  },
};

// Configuración del proxy para el microservicio de hoteles (Express)
const hotelsProxyConfig = {
  target: 'http://localhost:3000', // La URL del microservicio de Express
  changeOrigin: true,
  pathRewrite: {
    '^/api/hotels': '/hotels', // Reescribe la ruta para hoteles
  },
};

// Rutas del API Gateway para el microservicio de FastAPI
app.use('/api/users', createProxyMiddleware(fastAPIProxyConfig));
app.use('/api/reviews', createProxyMiddleware(fastAPIProxyConfig));
app.use('/api/token', createProxyMiddleware(fastAPIProxyConfig));

// Rutas del API Gateway para la documentación de Swagger UI de FastAPI
app.use('/api/docs', createProxyMiddleware({
  target: 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: { '^/api/docs': '/docs' }, // Reescribe /api/docs a /docs para que coincida con FastAPI
}));

// Ruta del API Gateway para la definición de la API de FastAPI (OpenAPI JSON)
app.use('/api/openapi.json', createProxyMiddleware({
  target: 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: { '^/api/openapi.json': '/openapi.json' }, // Reescribe /api/openapi.json a /openapi.json
}));

// Rutas del API Gateway para el microservicio de hoteles (Express)
app.use('/api/hotels', createProxyMiddleware(hotelsProxyConfig));

// Iniciar el API Gateway
app.listen(PORT, () => {
  console.log(`API Gateway corriendo en el puerto ${PORT}`);
});
