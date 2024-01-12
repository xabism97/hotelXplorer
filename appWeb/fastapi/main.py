from fastapi import FastAPI, Depends, HTTPException, status, Security
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from fastapi.openapi.models import OAuthFlowAuthorizationCode
from fastapi.openapi.models import OAuthFlowPassword
import logging
from fastapi.middleware.cors import CORSMiddleware



logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configuraciones de la base de datos y seguridad
DATABASE_URL = 'mysql+pymysql://root:root@localhost/usersapi'
SECRET_KEY = "tu_clave_secreta"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



Base = declarative_base()

# Modelos de SQLAlchemy
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    hashed_password = Column(String(200))
    reviews = relationship("Review", back_populates="author")

class Review(Base):
    __tablename__ = 'reviews'
    id = Column(Integer, primary_key=True, index=True)
    content = Column(String(200), index=True)
    rating = Column(Integer)
    author_id = Column(Integer, ForeignKey('users.id'))
    hotel_id = Column(Integer)
    author = relationship("User", back_populates="reviews")

Base.metadata.create_all(bind=engine)

# Modelos de Pydantic
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    email: str
    password: str

class UserInDB(UserBase):
    id: int
    email: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class ReviewBase(BaseModel):
    content: str
    rating: int
    hotel_id: int

class ReviewCreate(ReviewBase):
    logger.debug("Función create_review llamada")
    pass

class ReviewOut(ReviewBase):
    id: int
    author_id: int | None

class UserNameOut(BaseModel):
    username: str





# Dependencias y seguridad
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todas las origenes
    allow_credentials=True,
    allow_methods=["*"],  # Permite todos los métodos
    allow_headers=["*"],  # Permite todos los headers
)


# Configura OAuth2 para habilitar la autenticación en Swagger
app.openapi_oauth2_password_request_flows = OAuthFlowsModel(password=OAuthFlowPassword(tokenUrl="token"))

# Utilidades para la seguridad
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user(db, username)
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    # Asegúrate de que el 'sub' es una cadena de texto
    to_encode["sub"] = str(to_encode.get("sub"))
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# Obtener sesión de la base de datos
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Rutas para el microservicio
@app.post("/token", response_model=Token, tags={'users'})
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.id}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/users/", response_model=UserInDB, tags={'users'})
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = get_user(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_user = User(username=user.username, email=user.email, hashed_password=get_password_hash(user.password))
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return db_user

@app.get("/users/{user_id}", response_model=UserInDB, tags={'users'})
async def read_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

# Define una nueva dependencia para obtener el usuario actual basado en el token JWT
def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid JWT token")
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid JWT token")


@app.post("/reviews/", response_model=ReviewOut, tags={'reviews'})
async def create_review(
    review: ReviewCreate, 
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme),  # Añade esta línea para obtener el token
    current_user: User = Security(get_current_user)
):
    logger.debug("Función create_review llamada")
    try:
        # Agregar registro de depuración para verificar que la función está siendo llamada
        logger.debug("Función create_review llamada")

        # Decodificar el token JWT para obtener la información del usuario autenticado
        logger.debug("Decodificando el token JWT")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        author_id = payload.get("sub")  # Obtiene el "sub" (subject) del token, que es el usuario autenticado

        # Agregar registros de depuración para mostrar información sobre el token y author_id
        logger.debug(f"Token: {token}")
        logger.debug(f"Author ID: {author_id}")

       

    except JWTError as e:
        # Agregar registro de depuración en caso de error de decodificación del token
        logger.error("Error al decodificar el token JWT: %s", str(e))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token validation error")
    
    # Crea la reseña y asigna el author_id automáticamente
    db_review = Review(**review.dict(), author_id=current_user.id)
    db.add(db_review)
    try:
        db.commit()
        db.refresh(db_review)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return db_review


    
'''
@app.post("/reviews/", response_model=ReviewOut)
async def create_review(review: ReviewCreate, db: Session = Depends(get_db)):
    logger.debug("Función create_review llamada")
    db_review = Review(**review.dict())
    db.add(db_review)
    try:
        db.commit()
        db.refresh(db_review)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return db_review  '''

@app.get("/reviews/", response_model=List[ReviewOut], tags={'reviews'})
async def read_reviews(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    reviews = db.query(Review).offset(skip).limit(limit).all()
    return reviews

# Ruta para obtener todas las reseñas asociadas a un hotel
@app.get("/reviews/hotel/{hotel_id}", response_model=List[ReviewOut], tags={'reviews'})
async def get_reviews_by_hotel(hotel_id: int, db: Session = Depends(get_db)):
    reviews = db.query(Review).filter(Review.hotel_id == hotel_id).all()
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found for the specified hotel")
    return reviews

# Ruta para obtener el perfil del usuario logueado
@app.get("/users/me/data", response_model=UserInDB, tags={'users'})
async def read_users_me(current_user: User = Security(get_current_user)):
    """
    Retorna los datos del usuario actualmente logueado.
    """
    return current_user

@app.get("/users/{user_id}/username", response_model=UserNameOut, tags={'users'})
async def get_username_by_user_id(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserNameOut(username=db_user.username)



@app.get("/users/{user_id}", response_model=UserInDB, tags={'users'})
async def read_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user





# Ejecutar con: uvicorn main:app --reload --port 8000
