from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn

# Import our routes (we will create this next)
from app.api.routes import router as api_router

app = FastAPI(title="ModularReview API", version="1.0.0")

# Configure CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure our local uploads directory exists for the MVP
os.makedirs("uploads", exist_ok=True)

# Include our routes
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def health_check():
    return {"status": "ModularReview Engine is running"}


    