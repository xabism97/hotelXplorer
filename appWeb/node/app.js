const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');

const fs = require('fs');
const path = require('path');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs'); // Asegúrate de que este módulo esté instalado

const cors = require('cors');



const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());





// Conexión a la base de datos MongoDB
mongoose.connect('mongodb://localhost/tubasededatos', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Definición del esquema de datos de hotel
const hotelSchema = new mongoose.Schema({
  ID: Number,
  Nombre: String,
  Descripcion: String,
  Direccion: String,
  Estrellas: Number,
  CodigoPostal: String,
  Municipio: String,
  CodigoMunicipio: String,
  Territorio: String,
  CodigoTerritorio: String,
  Precio: Number,
  Habitaciones: Number,
});

const Hotel = mongoose.model('Hotel', hotelSchema);

let hotelCounter = 1;

function calculatePrice(stars) {
  return stars * 100;
}

function calculateRooms(stars) {
  return stars * 150;
}

// Función para notificar al servicio de reseñas
async function notifyReviewService(hotelId) {
  try {
    // Aquí iría la URL del microservicio de reseñas
    const reviewsServiceUrl = `http://url-del-servicio-de-reseñas/hotels/${hotelId}/notify-update`; 
    await axios.post(reviewsServiceUrl);
  } catch (error) {
    console.error('Error al notificar al servicio de reseñas:', error);
  }
}



// Cargar la especificación OpenAPI desde el archivo openapi.yaml
const openapiSpecification = YAML.load('openapi.yaml');

// Configurar Swagger UI para servir la especificación OpenAPI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));


app.get('/hotels/data-refresh', async (req, res) => {
  try {
    // Borra todos los documentos existentes en la colección 'Hotel'
    await Hotel.deleteMany({});
    hotelCounter = 1

    const response = await axios.get('https://opendata.euskadi.eus/contenidos/ds_recursos_turisticos/hoteles_de_euskadi/opendata/alojamientos.json');
    const hotelsData = response.data;

    const hotelsToInsert = hotelsData.map((hotelData) => ({
      ID: hotelCounter++,
      Nombre: hotelData.documentName,
      Descripcion: hotelData.documentDescription,
      Direccion: hotelData.address,
      Estrellas: parseInt(hotelData.category),
      CodigoPostal: hotelData.postalCode,
      Municipio: hotelData.municipality,
      CodigoMunicipio: hotelData.municipalitycode,
      Territorio: hotelData.territory,
      CodigoTerritorio: hotelData.territorycode,
      Precio: calculatePrice(parseInt(hotelData.category)),
      Habitaciones: calculateRooms(parseInt(hotelData.category)),
    }));

    await Hotel.insertMany(hotelsToInsert);

    res.json({ message: 'Datos de hoteles almacenados con éxito en MongoDB' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.get('/hotels', async (req, res) => {
  try {
    const hotelData = await Hotel.find({}, '-_id -__v');
    res.json(hotelData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/hotels/by-municipality/:municipioCodigo', async (req, res) => {
  const { municipioCodigo } = req.params;

  try {
    const hotelsData = await Hotel.find({ CodigoMunicipio: municipioCodigo }, '-_id -__v');
    if (hotelsData.length > 0) {
      res.json(hotelsData);
    } else {
      res.status(404).json({ error: 'No se encontraron hoteles para el código de municipio especificado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/hotels/:hotelId/details', async (req, res) => {
  const { hotelId } = req.params;

  try {
    const hotelData = await Hotel.findOne({ ID: hotelId }, '-_id -__v');
    if (hotelData) {
      res.json(hotelData);
    } else {
      res.status(404).json({ error: 'Hotel no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/hotels/by-territory/:territorioCodigo', async (req, res) => {
  const { territorioCodigo } = req.params;

  try {
    const hotelsData = await Hotel.find({ CodigoTerritorio: territorioCodigo }, '-_id -__v');
    if (hotelsData.length > 0) {
      res.json(hotelsData);
    } else {
      res.status(404).json({ error: 'No se encontraron hoteles para el código de territorio especificado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/hotels/add', async (req, res) => {
  try {
    // Obtén los datos del nuevo hotel desde el cuerpo de la solicitud (req.body)
    const {
      Nombre,
      Descripcion,
      Direccion,
      Estrellas,
      CodigoPostal,
      Municipio,
      CodigoMunicipio,
      Territorio,
      CodigoTerritorio,
    } = req.body;

    // Calcula el precio y el número de habitaciones
    const Precio = calculatePrice(Estrellas);
    const Habitaciones = calculateRooms(Estrellas);

    // Crea un nuevo hotel
    const nuevoHotel = new Hotel({
      ID: hotelCounter++,
      Nombre,
      Descripcion,
      Direccion,
      Estrellas,
      CodigoPostal,
      Municipio,
      CodigoMunicipio,
      Territorio,
      CodigoTerritorio,
      Precio,
      Habitaciones,
    });

    // Guarda el nuevo hotel en la base de datos
    await nuevoHotel.save();
    // Dentro del endpoint POST /hotels/add, después de guardar el nuevo hotel
    await notifyReviewService(nuevoHotel.ID);

    res.status(201).json({ message: 'Hotel añadido con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Ruta para obtener la lista de municipios únicos
app.get('/hotels/municipios', async (req, res) => {
  try {
    const municipios = await Hotel.distinct("Municipio");
    res.json(municipios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener la lista de territorios únicos
app.get('/hotels/territorios', async (req, res) => {
  try {
    const territorios = await Hotel.distinct("Territorio");
    res.json(territorios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




app.put('/hotels/:hotelId/update', async (req, res) => {
  const { hotelId } = req.params;

  try {
    const hotel = await Hotel.findOne({ ID: hotelId });
    if (!hotel) {
      return res.status(404).json({ error: 'Hotel no encontrado' });
    }

    // Actualiza los datos del hotel con los valores proporcionados en la solicitud (req.body)
    const {
      Nombre,
      Descripcion,
      Estrellas,
      CodigoPostal,
      Municipio,
      CodigoMunicipio,
      Territorio,
      CodigoTerritorio,
    } = req.body;

    if (Nombre) hotel.Nombre = Nombre;
    if (Descripcion) hotel.Descripcion = Descripcion;
    if (Estrellas) hotel.Estrellas = Estrellas;
    if (CodigoPostal) hotel.CodigoPostal = CodigoPostal;
    if (Municipio) hotel.Municipio = Municipio;
    if (CodigoMunicipio) hotel.CodigoMunicipio = CodigoMunicipio;
    if (Territorio) hotel.Territorio = Territorio;
    if (CodigoTerritorio) hotel.CodigoTerritorio = CodigoTerritorio;

    // Recalcula el precio y el número de habitaciones si se actualiza la categoría (Estrellas)
    if (Estrellas) {
      hotel.Precio = calculatePrice(Estrellas);
      hotel.Habitaciones = calculateRooms(Estrellas);
    }

    await hotel.save();
    // Dentro del endpoint PUT /hotels/:hotelId/update, después de guardar los cambios
    await notifyReviewService(hotelId);

    res.status(200).json({ message: 'Datos del hotel modificados con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener hoteles por nombre de municipio
app.get('/hotels/municipio/:municipioNombre', async (req, res) => {
  const municipioNombre = req.params.municipioNombre;
  try {
    const hotelsData = await Hotel.find({ Municipio: municipioNombre }, '-_id -__v');
    if (hotelsData.length > 0) {
      res.json(hotelsData);
    } else {
      res.status(404).json({ error: 'No se encontraron hoteles para el municipio especificado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener hoteles por nombre de territorio
app.get('/hotels/territorio/:territorioNombre', async (req, res) => {
  const territorioNombre = req.params.territorioNombre;
  try {
    const hotelsData = await Hotel.find({ Territorio: territorioNombre }, '-_id -__v');
    if (hotelsData.length > 0) {
      res.json(hotelsData);
    } else {
      res.status(404).json({ error: 'No se encontraron hoteles para el territorio especificado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});






// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`El microservicio se ejecuta en el puerto ${PORT}`);
});

