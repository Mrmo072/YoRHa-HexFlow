from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from urllib.parse import quote_plus

# Connection Config
# USER provided: localhost:3306 root 123456 tc
# NOTE: In production, use environment variables!
password = quote_plus("123456")
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://root:{password}@localhost:3306/tc"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # pool_recycle=3600,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
