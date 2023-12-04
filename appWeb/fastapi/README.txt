
python -m venv virtual
virtual\Scripts\activate


pip install fastapi uvicorn python-jose passlib[bcrypt] pydantic sqlalchemy pymysql python-multipart cryptography





uvicorn main:app --reload --port 8000

